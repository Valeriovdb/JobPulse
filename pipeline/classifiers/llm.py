"""
LLM enrichment using OpenAI.

Called only for jobs that have a description_text and have not been enriched
by the current classifier version yet.

Returns a structured dict of enriched fields. Failures are logged and
the job is persisted without enrichment rather than dropped.

Fields classified by LLM:
  german_requirement                     : must | plus | not_mentioned
  work_mode                              : remote | hybrid_Nd | onsite | unknown
  pm_type                                : core_pm | technical | customer_facing | platform | data_ai | growth | internal_ops | unclassified
  b2b_saas                               : true | false
  ai_focus                               : true | false  (role has AI product focus)
  ai_skills                              : true | false  (role requires AI/ML skills)
  tools_skills                           : list of tool names mentioned (e.g. ["Jira", "SQL", "Figma"])
  industry_normalized                    : employer industry vertical (see taxonomy.py)
  candidate_domain_requirement_strength  : hard | soft | none | unclear
  candidate_domain_requirement_normalized: domain background requested of candidate
  candidate_domain_requirement_raw       : verbatim snippet evidencing domain requirement
  years_experience_min                   : minimum years explicitly required (integer or null)
  years_experience_raw                   : verbatim snippet for years requirement
  visa_sponsorship_status                : yes | no | unclear
  visa_sponsorship_raw                   : verbatim snippet for visa sponsorship
  relocation_support_status              : yes | no | unclear
  relocation_support_raw                 : verbatim snippet for relocation support
"""
import json
import logging
import re
from typing import Optional

from openai import OpenAI
from pipeline.config import OPENAI_API_KEY, OPENAI_MODEL, CLASSIFIER_VERSION
from pipeline.classifiers.taxonomy import (
    INDUSTRY_NORMALIZED_VALUES,
    DOMAIN_REQ_STRENGTH_VALUES,
    CANDIDATE_DOMAIN_VALUES,
    TRISTATE_VALUES,
)

logger = logging.getLogger(__name__)

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


SYSTEM_PROMPT = """You are a job-posting classifier for a product management job market intelligence tool.
You extract structured signals from PM job postings. Be concise and precise.
Always respond with valid JSON matching the schema exactly — no extra text."""

USER_PROMPT_TEMPLATE = """Classify this PM job posting. Return JSON with exactly these keys:

{{
  "german_requirement": "must" | "plus" | "not_mentioned",
  "work_mode": "remote" | "hybrid_1d" | "hybrid_2d" | "hybrid_3d" | "hybrid_4d" | "hybrid" | "onsite" | "unknown",
  "pm_type": "core_pm" | "technical" | "customer_facing" | "platform" | "data_ai" | "growth" | "internal_ops" | "unclassified",
  "b2b_saas": true | false,
  "ai_focus": true | false,
  "ai_skills": true | false,
  "tools_skills": ["Tool1", "Tool2"],
  "experience_requirements": [
    {{
      "tag": "payments",
      "family": "domain",
      "required_level": "required",
      "evidence": "3+ years in payments",
      "confidence": 0.9
    }}
  ],
  "industry_normalized": "fintech_payments" | "ecommerce_marketplace" | "saas_b2b_software" | "healthtech_biotech" | "mobility_automotive" | "logistics_supply_chain" | "media_entertainment" | "cybersecurity" | "hrtech_future_of_work" | "proptech_construction" | "consumer_apps" | "other",
  "candidate_domain_requirement_strength": "hard" | "soft" | "none" | "unclear",
  "candidate_domain_requirement_normalized": "<domain tag from taxonomy or 'none'>",
  "candidate_domain_requirement_raw": "<verbatim snippet or null>",
  "years_experience_min": "<integer or null>",
  "years_experience_raw": "<verbatim snippet or null>",
  "visa_sponsorship_status": "yes" | "no" | "unclear",
  "visa_sponsorship_raw": "<verbatim snippet or null>",
  "relocation_support_status": "yes" | "no" | "unclear",
  "relocation_support_raw": "<verbatim snippet or null>",
  "confidence": 0.0–1.0,
  "rationale_short": "one sentence"
}}

Definitions:
- german_requirement:
  - "must": German fluency (C1/C2/Native) or a specific level (e.g., B2+) is explicitly listed as a requirement or "must-have".
  - "plus": German is mentioned as "a plus", "nice to have", "an advantage", "beneficial", or "bonus". Also use this if they mention "basic German" or lower levels (A1-B1) without making it a hard requirement.
  - "not_mentioned": There is no mention of the German language at all in the posting.
  Note: If the posting is in English, look carefully at the requirements/profile section. Even a single bullet point like "German skills are a plus" counts as "plus".
- work_mode (translate German terms to English before classifying):
  - "remote": fully remote, 100% remote, remote-first, remote-only, "vollständig remote", "komplett remote", "100% Homeoffice"
  - "hybrid_1d": hybrid with 1 day/week in office — "1 Tag im Büro", "once a week in office", "1 day per week on-site"
  - "hybrid_2d": hybrid with 2 days/week in office — "2 Tage im Büro", "twice a week in office", "2 days per week on-site"
  - "hybrid_3d": hybrid with 3 days/week in office — "3 Tage im Büro", "3 days per week on-site"
  - "hybrid_4d": hybrid with 4 days/week in office — "4 Tage im Büro", "4 days per week on-site"
  - "hybrid": hybrid but days per week not specified — "hybrid", "flexibles Arbeiten", "Homeoffice möglich", "teilweise remote"
  - "onsite": fully in-office, on-site required, "vor Ort", "im Büro", "Präsenz erforderlich", "office-based", no remote option mentioned
  - "unknown": use ONLY if there are truly no contextual signals whatsoever (e.g., very short posting with no company context or location info). If work mode is not explicitly stated, infer from available context clues:
    - Berlin-based tech company with no remote mention → lean "onsite" or "hybrid"
    - Benefits mention commuter allowance, office perks, or team events → "onsite" or "hybrid"
    - "Flexible working", "work-life balance", or "trust-based hours" language → "hybrid"
    - Fully international or distributed team with no office mentioned → lean "remote"
    When inferring (not explicitly stated), lower your confidence score accordingly (0.4–0.6).
- pm_type:
  - "core_pm": general product management, no strong specialization
  - "technical": strong technical/engineering focus, deep API or systems work
  - "customer_facing": customer app, consumer product, self-service, client portal
  - "platform": internal platform, developer tools, infrastructure, API enablement
  - "data_ai": data product, analytics, ML, AI products
  - "growth": growth, acquisition, activation, retention, conversion, funnel
  - "internal_ops": internal tools, operations, admin systems, merchant or backoffice tooling
  - "unclassified": role does not fit clearly into any of the above categories
- b2b_saas: is this a B2B SaaS company / role?
- ai_focus: does this role involve building AI/ML products?
- ai_skills: does this role require AI/ML knowledge or experience?
- tools_skills: software tools explicitly named in the posting (max 10)
- industry_normalized: the EMPLOYER'S primary industry vertical. Pick the single best-fit value from
  the list above. Prefer specific over "other". This is about what the company does, not the
  candidate's background.
  fintech_payments: neobanking, payments, lending, crypto, insurtech
  ecommerce_marketplace: online retail, marketplaces, delivery, recommerce, food delivery
  saas_b2b_software: horizontal B2B SaaS (project mgmt, CRM, analytics tools, etc.)
  healthtech_biotech: digital health, medical devices, pharma, biotech, wellness apps
  mobility_automotive: automotive tech, ride-hailing, EV, fleet management
  logistics_supply_chain: freight, last-mile delivery, supply chain software
  media_entertainment: streaming, gaming, content platforms, social media
  cybersecurity: security products, identity management, compliance tech
  hrtech_future_of_work: HR software, recruiting tech, people analytics, workforce management
  proptech_construction: real estate tech, construction software, smart buildings
  consumer_apps: consumer digital products not covered by other verticals (lifestyle, fitness, etc.)
  other: does not fit any of the above
- candidate_domain_requirement_strength: how strongly the posting requires specific industry/domain
  background FROM THE CANDIDATE (not about the employer's industry):
  "hard": explicitly required/must-have ("must have X experience", "background in X required")
  "soft": preferred/nice-to-have/beneficial ("experience in X preferred", "knowledge of X is a plus")
  "none": no domain background requested — a generalist PM with no specific domain is acceptable
  "unclear": hints at a domain preference but not enough clarity to classify confidently
- candidate_domain_requirement_normalized: the domain background requested from the candidate.
  Use one of: payments | banking_financial_services | fintech | ecommerce_marketplace |
  saas_b2b_software | mobility_automotive | logistics_supply_chain | ai_ml_data_products |
  consumer_digital_products | enterprise_internal_tools | cybersecurity | healthtech | none.
  Use "none" ONLY when candidate_domain_requirement_strength is "none".
  IMPORTANT: this is what background the CANDIDATE needs, not the employer's industry.
- candidate_domain_requirement_raw: verbatim snippet from the JD that evidences the domain
  requirement. Use null if strength is "none".
- years_experience_min: the MINIMUM years of PM (or relevant) experience explicitly mentioned.
  Return as an integer. Do NOT infer — only extract when a number is clearly stated.
  Examples: "3+ years" → 3, "5-8 years" → 5, "minimum 4 years" → 4.
  Return null if vague ("several years", "extensive experience") or not mentioned at all.
- years_experience_raw: verbatim snippet supporting years_experience_min. Null if not extractable.
- visa_sponsorship_status:
  "yes": ONLY if the posting EXPLICITLY states the company sponsors work visas / permits
         (e.g. "we sponsor work permits", "visa sponsorship available")
  "no": ONLY if the posting EXPLICITLY rules it out
        (e.g. "no visa sponsorship", "candidates must already have right to work")
  "unclear": in ALL other cases, including when the topic is not mentioned at all
- visa_sponsorship_raw: verbatim snippet. Null if unclear.
- relocation_support_status: same conservative rules as visa_sponsorship_status but for
  relocation assistance/packages.
  "yes": ONLY if explicitly offered ("relocation package", "we support relocation")
  "no": ONLY if explicitly ruled out ("no relocation assistance")
  "unclear": in all other cases
- relocation_support_raw: verbatim snippet. Null if unclear.
- experience_requirements: multi-label tags for specific experience.
  Families and allowed tags:
  - Domain (family: domain): payments, banking_financial_services, fintech, ecommerce_marketplace, saas_b2b_software, mobility_automotive, logistics_supply_chain, ai_ml_data_products, consumer_digital_products, enterprise_internal_tools, cybersecurity, healthtech
  - Functional (family: functional): growth_acquisition, activation_onboarding, retention_engagement, monetization_pricing, platform_internal_tooling, analytics_experimentation, search_discovery, crm_lifecycle, checkout_payments, risk_fraud, identity_kyc, integrations_apis, marketplace_dynamics
  - Operating context (family: operating_context): startup_scaleup, enterprise, regulated_environment, international_multi_market, b2b, b2c, b2b2c, two_sided_marketplace, subscription_business, hardware_software
  - AI Rule: Use "ai_ml_data_products" ONLY for real AI/ML product experience (not generic AI mentions).
  For each tag, provide:
  - tag: exact string from the lists above
  - family: domain | functional | operating_context
  - required_level: required | plus
  - evidence: short snippet from the JD
  - confidence: 0.0–1.0

Job title: {title}
Company: {company}
Location: {location}

Posting:
{description}"""


def enrich(
    title: str,
    company: str,
    location: str,
    description: str,
) -> Optional[dict]:
    """
    Call the LLM to enrich a job posting.
    Returns a dict of enriched fields, or None on failure.
    """
    if not description or len(description.strip()) < 80:
        logger.debug(f"Skipping LLM enrichment — description too short: {title!r}")
        return None

    prompt = USER_PROMPT_TEMPLATE.format(
        title=title or "",
        company=company or "",
        location=location or "",
        description=description[:4000],  # keep well within token budget
    )

    try:
        response = _get_client().chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=900,
            response_format={"type": "json_object"},
        )
        raw_json = response.choices[0].message.content
        result = json.loads(raw_json)
    except Exception as e:
        logger.error(f"LLM enrichment failed for {title!r}: {e}")
        return None

    # Validate and sanitise output
    german_req = result.get("german_requirement")
    if german_req not in ("must", "plus", "not_mentioned"):
        german_req = None

    # --- REGEX FALLBACK ---
    # If LLM said not_mentioned but we see obvious clues, override it.
    if german_req == "not_mentioned" and description:
        desc_lower = description.lower()
        # Clues for MUST (high threshold to avoid false positives)
        must_patterns = [
            r"german.*?required",
            r"fluent.*?german",
            r"german.*?fluency",
            r"german.*?\(c1",
            r"german.*?\(c2",
            r"native.*?german",
            r"german.*?native",
            r"deutsch.*?muttersprach",
            r"flie&szlig;end.*?deutsch",
            r"fließend.*?deutsch",
        ]
        # Clues for PLUS
        plus_patterns = [
            r"german.*?plus",
            r"german.*?advantage",
            r"german.*?beneficial",
            r"german.*?bonus",
            r"german.*?nice.*?have",
            r"basic.*?german",
            r"german.*?skills",
            r"german.*?\(b1",
            r"german.*?\(b2",
            r"knowledge.*?german",
            r"deutschkenntnisse",
            r"deutsch.*?plus",
        ]

        
        if any(re.search(p, desc_lower) for p in must_patterns):
            german_req = "must"
            logger.info(f"Regex override: must (title={title!r})")
        elif any(re.search(p, desc_lower) for p in plus_patterns):
            german_req = "plus"
            logger.info(f"Regex override: plus (title={title!r})")
    # ----------------------

    _VALID_WORK_MODES = {"remote", "hybrid", "hybrid_1d", "hybrid_2d", "hybrid_3d", "hybrid_4d", "onsite", "unknown"}
    work_mode = result.get("work_mode")
    if work_mode not in _VALID_WORK_MODES:
        work_mode = "unknown"

    _VALID_PM_TYPES = {
        "core_pm", "technical", "customer_facing", "platform",
        "data_ai", "growth", "internal_ops", "unclassified",
    }
    _PM_TYPE_REMAP = {"data": "data_ai", "other": "unclassified"}
    pm_type = result.get("pm_type")
    pm_type = _PM_TYPE_REMAP.get(pm_type, pm_type)
    if pm_type not in _VALID_PM_TYPES:
        pm_type = "unclassified"

    tools = result.get("tools_skills")
    if not isinstance(tools, list):
        tools = []
    tools = [str(t) for t in tools if t][:10]

    # --- New fields (v3) ---

    industry_norm = result.get("industry_normalized")
    if industry_norm not in INDUSTRY_NORMALIZED_VALUES:
        industry_norm = "other"

    domain_strength = result.get("candidate_domain_requirement_strength")
    if domain_strength not in DOMAIN_REQ_STRENGTH_VALUES:
        domain_strength = "unclear"

    domain_norm = result.get("candidate_domain_requirement_normalized")
    if domain_norm not in CANDIDATE_DOMAIN_VALUES:
        domain_norm = None

    years_min_raw = result.get("years_experience_min")
    try:
        years_min = int(years_min_raw) if years_min_raw is not None else None
        if years_min is not None and (years_min < 0 or years_min > 30):
            years_min = None
    except (TypeError, ValueError):
        years_min = None

    visa_status = result.get("visa_sponsorship_status")
    if visa_status not in TRISTATE_VALUES:
        visa_status = "unclear"

    reloc_status = result.get("relocation_support_status")
    if reloc_status not in TRISTATE_VALUES:
        reloc_status = "unclear"

    def _raw(key: str) -> Optional[str]:
        v = result.get(key)
        if not v or not str(v).strip() or str(v).strip().lower() == "null":
            return None
        return str(v).strip()[:500]

    return {
        "german_requirement": german_req,
        "work_mode": work_mode,
        "pm_type": pm_type,
        "b2b_saas": bool(result.get("b2b_saas")),
        "ai_focus": bool(result.get("ai_focus")),
        "ai_skills": bool(result.get("ai_skills")),
        "tools_skills": tools,
        "experience_requirements": result.get("experience_requirements", []),
        "industry_normalized": industry_norm,
        "candidate_domain_requirement_strength": domain_strength,
        "candidate_domain_requirement_normalized": domain_norm,
        "candidate_domain_requirement_raw": _raw("candidate_domain_requirement_raw"),
        "years_experience_min": years_min,
        "years_experience_raw": _raw("years_experience_raw"),
        "visa_sponsorship_status": visa_status,
        "visa_sponsorship_raw": _raw("visa_sponsorship_raw"),
        "relocation_support_status": reloc_status,
        "relocation_support_raw": _raw("relocation_support_raw"),
        "llm_confidence": float(result.get("confidence", 0.0)),
        "llm_version": CLASSIFIER_VERSION,
        "llm_raw_json": result,
    }
