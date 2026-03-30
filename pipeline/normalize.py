"""
Field normalization for raw job records.

Takes a raw job dict (from any fetcher) and returns a NormalizedJob dataclass
with clean, typed fields ready for persistence.

Philosophy: deterministic rules first. LLM enrichment handles what rules cannot.
"""
import re
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Output dataclass
# ---------------------------------------------------------------------------

@dataclass
class NormalizedJob:
    # Identity
    external_job_key: str
    source_provider: str
    source_job_id: str

    # URLs & company
    canonical_url: Optional[str]
    company_name: Optional[str]

    # Title
    job_title_raw: Optional[str]
    job_title_normalized: Optional[str]
    seniority: Optional[str]

    # Location
    location_raw: Optional[str]
    location_normalized: Optional[str]
    is_berlin: bool
    is_remote_germany: bool

    # Work mode
    work_mode: Optional[str]

    # Language (rule-based; LLM can override)
    posting_language: Optional[str]

    # Source attribution
    publisher_type: Optional[str]
    has_linkedin_apply_option: bool
    has_company_site_apply_option: bool

    # Timestamps
    raw_posted_at: Optional[datetime]

    # Description (for LLM enrichment)
    description_text: Optional[str]

    # Raw payload (stored as-is for traceability)
    raw_payload: dict = field(default_factory=dict)

    # LLM-enriched fields (populated later by enrich.py)
    german_requirement: Optional[str] = None
    pm_type: Optional[str] = None
    b2b_saas: Optional[bool] = None
    ai_focus: Optional[bool] = None
    ai_skills: Optional[bool] = None
    tools_skills: Optional[list] = None


# ---------------------------------------------------------------------------
# Seniority normalization
# ---------------------------------------------------------------------------

# Order matters: more specific patterns first
_SENIORITY_PATTERNS: list[tuple[str, str]] = [
    # Multi-level / range patterns — must precede individual keywords
    (r"\(senior\)\s+product|product\s+manager\s*/\s*senior\s+product", "mid_senior"),
    # Standard levels
    (r"\bprincipal\b", "principal"),
    (r"\bstaff\b", "staff"),
    (r"\bhead\b", "head"),
    (r"\blead\b", "lead"),
    (r"\bsenior\b|\bsr\.?\b", "senior"),
    (r"\bjunior\b|\bjr\.?\b", "junior"),
    (r"\bmid[\s\-]?level\b|\bmid\b", "mid"),
    # Plain PM title with no seniority prefix defaults to mid
    (r"\bproduct\s+manager\b|\bproduct\s+owner\b", "mid"),
]


def _normalize_seniority(title: str) -> str:
    if not title:
        return "unknown"
    t = title.lower()
    for pattern, bucket in _SENIORITY_PATTERNS:
        if re.search(pattern, t):
            return bucket
    return "unknown"


# ---------------------------------------------------------------------------
# Job title normalization
# ---------------------------------------------------------------------------

def _normalize_title(title: str) -> Optional[str]:
    """Map raw title to a coarse normalized bucket."""
    if not title:
        return None
    t = title.lower()
    if re.search(r"product manager|product mgr|pm\b", t):
        return "product_manager"
    if re.search(r"product owner", t):
        return "product_owner"
    if re.search(r"product lead|head of product|vp product|director of product", t):
        return "product_lead"
    return "product_manager"  # default — we only ingest PM roles


# ---------------------------------------------------------------------------
# Location normalization
# ---------------------------------------------------------------------------

def _normalize_location(raw: str) -> tuple[str, bool, bool]:
    """
    Returns (location_normalized, is_berlin, is_remote_germany).

    Heuristics:
    - is_berlin: location text contains 'berlin'
    - is_remote_germany: location contains 'remote' and ('germany' or 'deutschland' or 'de')
    """
    if not raw:
        return ("unknown", False, False)
    r = raw.lower()
    is_berlin = "berlin" in r
    is_remote_germany = bool(
        re.search(r"remote", r)
        and re.search(r"germany|deutschland|\bde\b|german", r)
    )
    if is_berlin:
        loc = "berlin"
    elif is_remote_germany:
        loc = "remote_germany"
    else:
        loc = re.sub(r"\s+", "_", raw.strip().lower())[:64]
    return (loc, is_berlin, is_remote_germany)


# ---------------------------------------------------------------------------
# Work mode normalization
# ---------------------------------------------------------------------------

def _extract_hybrid_days(description: str) -> Optional[str]:
    """Try to extract hybrid office-days-per-week from description text."""
    if not description:
        return None
    d = description.lower()
    if re.search(r"\b(2|two)\s+days?\s+(per|a|in the)\s+week|twice\s+a\s+week\s+in\s+(the\s+)?office", d):
        return "hybrid_2d"
    if re.search(r"\b(3|three)\s+days?\s+(per|a|in the)\s+week|three\s+times\s+a\s+week\s+in\s+(the\s+)?office", d):
        return "hybrid_3d"
    if re.search(r"\b(4|four)\s+days?\s+(per|a|in the)\s+week", d):
        return "hybrid_4d"
    if re.search(r"\b(1|one)\s+days?\s+(per|a|in the)\s+week|once\s+a\s+week\s+in\s+(the\s+)?office", d):
        return "hybrid_1d"
    return None


def _normalize_work_mode(raw: str, description: str = "") -> str:
    if not raw:
        raw = ""
    r = raw.lower()
    d = description.lower() if description else ""

    if "remote" in r:
        return "remote"

    if "hybrid" in r or "hybrid" in d:
        freq = _extract_hybrid_days(d)
        return freq if freq else "hybrid"

    if any(w in r for w in ("onsite", "on-site", "on site", "office", "presence")):
        return "onsite"

    # Check description for work mode clues when raw is uninformative
    if re.search(r"\bhybrid\b", d):
        freq = _extract_hybrid_days(d)
        return freq if freq else "hybrid"
    if re.search(r"\bfully\s+remote\b|\b100%\s+remote\b|\bremote\s+first\b|\bremote[\s\-]only\b", d):
        return "remote"
    if re.search(r"\bin[\s\-]office\b|\bon[\s\-]site\b|\bonsite\b", d):
        return "onsite"

    return "unknown"


# ---------------------------------------------------------------------------
# PM type deterministic pre-classification
# ---------------------------------------------------------------------------

# Rules evaluated in order; first match wins.
# LLM enrichment will override these for jobs that have a description.
_PM_TYPE_RULES: list[tuple[str, str]] = [
    # Title-level signals (high confidence)
    (r"technical\s+product\s+manager|technical\s+pm\b", "technical"),
    (r"growth\s+product\s+manager|growth\s+pm\b|head\s+of\s+growth", "growth"),
    (r"data\s+product\s+manager|analytics\s+pm\b|ai\s+product\s+manager|ml\s+product\s+manager", "data_ai"),
    (r"platform\s+product\s+manager|platform\s+pm\b", "platform"),
    (r"internal\s+tools\s+product|ops\s+product\s+manager", "internal_ops"),
    # Keyword signals (lower confidence, from title + first part of description)
    (r"\bplatform\b.*\b(api|infrastructure|developer|enablement)\b|\b(api|infrastructure|developer\s+tools)\b", "platform"),
    (r"\bgrowth\b|\bacquisition\b|\bretention\b|\bactivation\b|\bconversion\b|\bfunnel\b", "growth"),
    (r"\bdata\s+product\b|\bai\s+product\b|\bml\b|\bmachine\s+learning\b|\banalytics\s+product\b", "data_ai"),
    (r"\bcustomer\s+(app|portal|experience|journey)\b|\bself[\s\-]service\b|\buser[\s\-]facing\b|\bconsumer\s+product\b", "customer_facing"),
    (r"\binternal\s+tools\b|\bback[\s\-]?office\b|\bmerchant\s+(tools|portal)\b|\bops\s+product\b", "internal_ops"),
]


def _classify_pm_type(title: str, description: str = "") -> Optional[str]:
    """
    Rule-based pm_type classification. Returns None if no confident signal.
    LLM enrichment will override this for jobs with a description.
    """
    # Use title + first 1500 chars of description for signal
    text = (title or "").lower() + " " + (description or "")[:1500].lower()
    for pattern, pm_type in _PM_TYPE_RULES:
        if re.search(pattern, text):
            return pm_type
    return None


# ---------------------------------------------------------------------------
# Publisher type normalization
# ---------------------------------------------------------------------------

def _normalize_publisher_type(url: str, raw_publisher: str = "") -> str:
    """Infer publisher from the canonical URL or a raw publisher string."""
    text = (url or "") + " " + (raw_publisher or "")
    t = text.lower()
    if "linkedin.com" in t:
        return "linkedin"
    if "stepstone" in t:
        return "stepstone"
    if "indeed.com" in t:
        return "indeed"
    if "xing.com" in t:
        return "xing"
    if "monster" in t:
        return "monster"
    # Arbeitnow is a curated board — jobs generally link to company sites
    if "arbeitnow.com" not in t and ("jobs." in t or "careers." in t or "/jobs/" in t or "/careers/" in t):
        return "company_site"
    return "other"


def _has_linkedin_apply(apply_options: Optional[list]) -> bool:
    if not apply_options:
        return False
    return any("linkedin" in (o.get("publisher", "") or "").lower() for o in apply_options)


def _has_company_site_apply(apply_options: Optional[list], canonical_url: str = "") -> bool:
    if not apply_options:
        return bool(
            canonical_url
            and not any(
                x in canonical_url.lower()
                for x in ("linkedin", "indeed", "stepstone", "xing", "monster", "arbeitnow")
            )
        )
    return any(
        not any(
            x in (o.get("apply_link", "") or "").lower()
            for x in ("linkedin", "indeed", "stepstone", "xing", "monster")
        )
        for o in apply_options
    )


# ---------------------------------------------------------------------------
# Language detection (rule-based, cheap)
# ---------------------------------------------------------------------------

# Common German function words. If enough appear in the description, it's German.
_DE_TOKENS = [
    "und", "oder", "mit", "für", "bei", "als", "auf", "von", "zu", "der",
    "die", "das", "eine", "einen", "wir", "sie", "ich", "du", "ihr",
    "dein", "unser", "unsere", "sind", "haben", "werden", "können",
    "stelle", "stellenangebot", "anforderungen", "aufgaben", "bewerbung",
]
_DE_THRESHOLD = 6  # how many de tokens must appear


def _detect_language(text: str) -> Optional[str]:
    """
    Lightweight language detection without an external library.
    Returns 'de', 'en', or None if inconclusive.
    """
    if not text or len(text) < 50:
        return None
    t = text.lower()
    words = re.findall(r"\b\w+\b", t)
    word_set = set(words)
    de_hits = sum(1 for token in _DE_TOKENS if token in word_set)
    if de_hits >= _DE_THRESHOLD:
        return "de"
    return "en"


# ---------------------------------------------------------------------------
# Datetime parsing
# ---------------------------------------------------------------------------

def _parse_datetime(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc)
        except Exception:
            return None
    if isinstance(value, str):
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S+00:00",
            "%Y-%m-%d",
        ):
            try:
                return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return None


# ---------------------------------------------------------------------------
# Source-specific extractors
# ---------------------------------------------------------------------------

def _from_jsearch(raw: dict) -> NormalizedJob:
    title_raw = raw.get("job_title") or ""
    description = raw.get("job_description") or ""
    location_raw = (
        raw.get("job_city")
        or raw.get("job_state")
        or raw.get("job_location")
        or ""
    )
    # JSearch sometimes provides city separately
    city = raw.get("job_city") or ""
    country = raw.get("job_country") or ""
    location_full = f"{city}, {country}".strip(", ")

    location_norm, is_berlin, is_remote_germany = _normalize_location(location_full or location_raw)

    apply_options = raw.get("apply_options") or []
    canonical_url = (
        raw.get("job_apply_link")
        or (apply_options[0].get("apply_link") if apply_options else None)
    )

    publisher_raw = raw.get("job_publisher") or ""
    publisher_type = _normalize_publisher_type(canonical_url or "", publisher_raw)

    work_mode_raw = raw.get("job_employment_type") or ""
    # JSearch has is_remote field
    if raw.get("job_is_remote"):
        work_mode = "remote"
    else:
        work_mode = _normalize_work_mode(work_mode_raw, description)

    posted_raw = raw.get("job_posted_at_timestamp") or raw.get("job_posted_at_datetime_utc")

    return NormalizedJob(
        external_job_key=raw["_external_job_key"],
        source_provider="jsearch",
        source_job_id=raw["_source_job_id"],
        canonical_url=canonical_url,
        company_name=raw.get("employer_name"),
        job_title_raw=title_raw,
        job_title_normalized=_normalize_title(title_raw),
        seniority=_normalize_seniority(title_raw),
        location_raw=location_raw or location_full,
        location_normalized=location_norm,
        is_berlin=is_berlin,
        is_remote_germany=is_remote_germany,
        work_mode=work_mode,
        posting_language=_detect_language(description),
        publisher_type=publisher_type,
        has_linkedin_apply_option=_has_linkedin_apply(apply_options),
        has_company_site_apply_option=_has_company_site_apply(apply_options, canonical_url or ""),
        raw_posted_at=_parse_datetime(posted_raw),
        description_text=description or None,
        raw_payload=raw,
        pm_type=_classify_pm_type(title_raw, description),
    )


def _from_ats(raw: dict) -> NormalizedJob:
    """
    Normalize a job from the ATS fetcher.
    Handles Greenhouse, Lever, Ashby, SmartRecruiters (distinguished via _ats_platform).
    """
    platform = raw.get("_ats_platform", "")
    slug = raw.get("_ats_slug", "")
    company = raw.get("_company_name", "")

    if platform == "greenhouse":
        title_raw = raw.get("title", "")
        description = raw.get("content", "") or ""
        offices = raw.get("offices") or raw.get("location") or []
        if isinstance(offices, list) and offices:
            location_raw = offices[0].get("name", "") if isinstance(offices[0], dict) else str(offices[0])
        elif isinstance(offices, dict):
            location_raw = offices.get("name", "")
        else:
            location_raw = ""
        canonical_url = raw.get("absolute_url") or f"https://boards.greenhouse.io/{slug}/jobs/{raw.get('id', '')}"
        posted_raw = raw.get("updated_at") or raw.get("created_at")

    elif platform == "lever":
        title_raw = raw.get("text", "")
        categories = raw.get("categories") or {}
        location_raw = categories.get("location", "") or raw.get("workplaceType", "")
        description = raw.get("descriptionPlain") or raw.get("description") or ""
        canonical_url = raw.get("applyUrl") or raw.get("hostedUrl") or ""
        posted_raw = raw.get("createdAt")
        # Lever timestamps are milliseconds
        if isinstance(posted_raw, (int, float)):
            posted_raw = posted_raw / 1000

    elif platform == "ashby":
        title_raw = raw.get("title", "")
        location_raw = raw.get("locationName") or (raw.get("primaryLocation") or {}).get("locationName", "")
        description = raw.get("descriptionPlain") or raw.get("description") or ""
        canonical_url = raw.get("jobUrl") or f"https://jobs.ashbyhq.com/{slug}/{raw.get('id', '')}"
        posted_raw = raw.get("publishedDate")

    elif platform == "smartrecruiters":
        title_raw = raw.get("name", "")
        loc = raw.get("location") or {}
        location_raw = ", ".join(filter(None, [loc.get("city"), loc.get("country")]))
        description = ""  # SR public listing API doesn't include description
        canonical_url = raw.get("ref") or f"https://www.smartrecruiters.com/jobs/{raw.get('id', '')}"
        posted_raw = raw.get("releasedDate") or raw.get("updatedOn")

    else:
        title_raw = raw.get("title") or raw.get("name") or ""
        location_raw = ""
        description = ""
        canonical_url = ""
        posted_raw = None

    location_norm, is_berlin, is_remote_germany = _normalize_location(location_raw)
    work_mode = _normalize_work_mode(location_raw, description)

    return NormalizedJob(
        external_job_key=raw["_external_job_key"],
        source_provider="ats",
        source_job_id=raw["_source_job_id"],
        canonical_url=canonical_url or None,
        company_name=company or None,
        job_title_raw=title_raw,
        job_title_normalized=_normalize_title(title_raw),
        seniority=_normalize_seniority(title_raw),
        location_raw=location_raw,
        location_normalized=location_norm,
        is_berlin=is_berlin,
        is_remote_germany=is_remote_germany,
        work_mode=work_mode,
        posting_language=_detect_language(description),
        publisher_type="company_site",
        has_linkedin_apply_option=False,
        has_company_site_apply_option=bool(canonical_url),
        raw_posted_at=_parse_datetime(posted_raw),
        description_text=description or None,
        raw_payload=raw,
        pm_type=_classify_pm_type(title_raw, description),
    )


def _from_arbeitnow(raw: dict) -> NormalizedJob:
    title_raw = raw.get("title") or ""
    description = raw.get("description") or ""
    location_raw = raw.get("location") or ""
    canonical_url = raw.get("url") or ""

    location_norm, is_berlin, is_remote_germany = _normalize_location(location_raw)

    # Arbeitnow has a 'remote' boolean field
    if raw.get("remote"):
        is_remote_germany = True
        work_mode = "remote"
        if not is_berlin:
            location_norm = "remote_germany"
    else:
        work_mode = _normalize_work_mode(location_raw, description)

    publisher_type = _normalize_publisher_type(canonical_url)

    posted_raw = raw.get("created_at")

    return NormalizedJob(
        external_job_key=raw["_external_job_key"],
        source_provider="arbeitnow",
        source_job_id=raw["_source_job_id"],
        canonical_url=canonical_url,
        company_name=raw.get("company_name"),
        job_title_raw=title_raw,
        job_title_normalized=_normalize_title(title_raw),
        seniority=_normalize_seniority(title_raw),
        location_raw=location_raw,
        location_normalized=location_norm,
        is_berlin=is_berlin,
        is_remote_germany=is_remote_germany,
        work_mode=work_mode,
        posting_language=_detect_language(description),
        publisher_type=publisher_type,
        has_linkedin_apply_option=False,
        has_company_site_apply_option=bool(
            canonical_url and "arbeitnow.com" not in canonical_url
        ),
        raw_posted_at=_parse_datetime(posted_raw),
        description_text=description or None,
        raw_payload=raw,
        pm_type=_classify_pm_type(title_raw, description),
    )


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

_EXTRACTORS = {
    "jsearch": _from_jsearch,
    "arbeitnow": _from_arbeitnow,
    "ats": _from_ats,
}


def normalize(raw: dict) -> Optional[NormalizedJob]:
    """
    Normalize a raw job dict from any fetcher.
    Returns None if the record should be skipped (missing key identity fields).
    """
    provider = raw.get("_source_provider", "")
    extractor = _EXTRACTORS.get(provider)
    if not extractor:
        logger.warning(f"No extractor for provider {provider!r}, skipping")
        return None
    try:
        return extractor(raw)
    except Exception as e:
        logger.error(f"Normalization failed for {raw.get('_external_job_key')}: {e}")
        return None
