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
  - "must": German is explicitly required
  - "plus": German mentioned as nice-to-have, advantage, or bonus
  - "not_mentioned": German not mentioned at all
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
        "pm_type": pm_type,
        "b2b_saas": bool(result.get("b2b_saas")),
        "ai_focus": bool(result.get("ai_focus")),
        "ai_skills": bool(result.get("ai_skills")),
        "tools_skills": tools,
        "llm_confidence": float(result.get("confidence", 0.0)),
        "llm_version": CLASSIFIER_VERSION,
        "llm_raw_json": result,
    }
