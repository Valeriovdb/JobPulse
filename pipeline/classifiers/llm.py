"""
LLM enrichment using OpenAI.

Called only for jobs that have a description_text and have not been enriched
by the current classifier version yet.

Returns a structured dict of enriched fields. Failures are logged and
the job is persisted without enrichment rather than dropped.

Fields classified by LLM:
  german_requirement : must | plus | not_mentioned
  pm_type            : core_pm | technical | customer_facing | platform | data_ai | growth | internal_ops | unclassified
  b2b_saas           : true | false
  ai_focus           : true | false  (role has AI product focus)
  ai_skills          : true | false  (role requires AI/ML skills)
  tools_skills       : list of tool names mentioned (e.g. ["Jira", "SQL", "Figma"])
"""
import json
import logging
import re
from typing import Optional

from openai import OpenAI
from pipeline.config import OPENAI_API_KEY, OPENAI_MODEL, CLASSIFIER_VERSION

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
  - "unknown": work arrangement is not mentioned or cannot be determined from the posting
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
            max_tokens=512,
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

    return {
        "german_requirement": german_req,
        "work_mode": work_mode,
        "pm_type": pm_type,
        "b2b_saas": bool(result.get("b2b_saas")),
        "ai_focus": bool(result.get("ai_focus")),
        "ai_skills": bool(result.get("ai_skills")),
        "tools_skills": tools,
        "llm_confidence": float(result.get("confidence", 0.0)),
        "llm_version": CLASSIFIER_VERSION,
        "llm_raw_json": result,
    }
