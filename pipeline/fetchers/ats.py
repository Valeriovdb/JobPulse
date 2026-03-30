"""
ATS fetcher — direct job board scraping for known Berlin tech companies.

Supports: Greenhouse (US + EU), Ashby, SmartRecruiters, Gem, Personio (XML).
All endpoints are public and require no authentication.

Source priority: "ats" (highest) > "arbeitnow" > "jsearch"

Each returned job dict has the standard tracer keys injected:
  _source_provider  : "ats"
  _source_job_id    : "<platform>::<slug>::<job_id>"
  _external_job_key : "ats::<platform>::<slug>::<job_id>"

Filtering: only roles with PM-relevant titles are kept.
"""
import re
import logging
import xml.etree.ElementTree as ET
import requests
from pipeline.config import ATS_COMPANIES

logger = logging.getLogger(__name__)

# Request timeout per call
_TIMEOUT = 20

# Titles that must match to be considered a PM role
_PM_TITLE_PATTERN = re.compile(
    r"product manager|product owner|head of product|principal pm|group pm|"
    r"technical product manager|growth product manager|"
    r"produktmanager|produktowner",
    re.IGNORECASE,
)

# Titles that match the PM pattern but are executive scope — excluded from MVP.
# Decision: CPTO / CPO / VP / Chief Product = C-suite, out of scope.
# Director of Product = VP-equivalent at most Berlin scale-ups, out of scope for MVP.
# Head of Product is kept — commonly a senior IC title at small/mid-size companies here.
_EXEC_TITLE_PATTERN = re.compile(
    r"\bcpto\b|chief product officer|\bchief product\b|"
    r"\bvp\s+of\s+product\b|\bvp\s+product\b|vice\s+president.*product|"
    r"director\s+of\s+product|\bproduct\s+director\b",
    re.IGNORECASE,
)


def _is_pm_role(title: str) -> bool:
    t = title or ""
    return bool(_PM_TITLE_PATTERN.search(t)) and not bool(_EXEC_TITLE_PATTERN.search(t))


def _log_fetch_error(platform: str, slug: str, company: str, e: Exception) -> None:
    """Log ATS fetch errors at the appropriate level."""
    if isinstance(e, requests.exceptions.HTTPError):
        status = e.response.status_code if e.response is not None else "?"
        if status == 404:
            logger.warning(f"  {platform} {slug} ({company}): board not found (404), skipping")
        else:
            logger.error(f"  {platform} {slug} ({company}): HTTP {status}, skipping")
    elif isinstance(e, requests.exceptions.Timeout):
        logger.warning(f"  {platform} {slug} ({company}): request timed out, skipping")
    elif isinstance(e, (ValueError, KeyError)):
        logger.warning(f"  {platform} {slug} ({company}): unexpected response format, skipping")
    else:
        logger.error(f"  {platform} {slug} ({company}): fetch failed — {e}")


# ---------------------------------------------------------------------------
# Platform-specific fetchers
# ---------------------------------------------------------------------------

_GREENHOUSE_API = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"


def _fetch_greenhouse(slug: str, company: str) -> list[dict]:
    """
    Greenhouse public board API.
    Endpoint: GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
    All companies (including EU-hosted boards like Raisin) use this single host.
    """
    url = _GREENHOUSE_API.format(slug=slug)
    try:
        resp = requests.get(url, params={"content": "true"}, timeout=_TIMEOUT)
        resp.raise_for_status()
        jobs = resp.json().get("jobs", [])
    except Exception as e:
        _log_fetch_error("greenhouse", slug, company, e)
        return []

    results = []
    for job in jobs:
        title = job.get("title", "")
        if not _is_pm_role(title):
            continue
        job_id = str(job.get("id", ""))
        if not job_id:
            continue
        source_job_id = f"greenhouse::{slug}::{job_id}"
        results.append({
            **job,
            "_ats_platform": "greenhouse",
            "_ats_slug": slug,
            "_company_name": company,
            "_source_provider": "ats",
            "_source_job_id": source_job_id,
            "_external_job_key": f"ats::{source_job_id}",
        })

    logger.info(f"  Greenhouse {slug}: {len(results)} PM jobs")
    return results


def _fetch_lever(slug: str, company: str) -> list[dict]:
    """
    Lever public postings API.
    Endpoint: https://api.lever.co/v0/postings/{slug}?mode=json
    """
    url = f"https://api.lever.co/v0/postings/{slug}"
    try:
        resp = requests.get(url, params={"mode": "json"}, timeout=_TIMEOUT)
        resp.raise_for_status()
        jobs = resp.json()
        if not isinstance(jobs, list):
            jobs = []
    except Exception as e:
        _log_fetch_error("lever", slug, company, e)
        return []

    results = []
    for job in jobs:
        title = job.get("text", "")
        if not _is_pm_role(title):
            continue
        job_id = job.get("id", "")
        if not job_id:
            continue
        source_job_id = f"lever::{slug}::{job_id}"
        results.append({
            **job,
            "_ats_platform": "lever",
            "_ats_slug": slug,
            "_company_name": company,
            "_source_provider": "ats",
            "_source_job_id": source_job_id,
            "_external_job_key": f"ats::{source_job_id}",
        })

    logger.info(f"  Lever {slug}: {len(results)} PM jobs")
    return results


def _fetch_ashby(slug: str, company: str) -> list[dict]:
    """
    Ashby public job board API.
    Endpoint: GET https://api.ashbyhq.com/posting-api/job-board/{clientname}
    No authentication required. slug = clientname (e.g. "taxfix.com", "billie").
    """
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    try:
        resp = requests.get(url, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        jobs = data.get("jobPostings") or data.get("results") or []
    except Exception as e:
        _log_fetch_error("ashby", slug, company, e)
        return []

    results = []
    for job in jobs:
        title = job.get("title", "")
        if not _is_pm_role(title):
            continue
        job_id = job.get("id", "")
        if not job_id:
            continue
        source_job_id = f"ashby::{slug}::{job_id}"
        results.append({
            **job,
            "_ats_platform": "ashby",
            "_ats_slug": slug,
            "_company_name": company,
            "_source_provider": "ats",
            "_source_job_id": source_job_id,
            "_external_job_key": f"ats::{source_job_id}",
        })

    logger.info(f"  Ashby {slug}: {len(results)} PM jobs")
    return results


def _fetch_smartrecruiters(slug: str, company: str) -> list[dict]:
    """
    SmartRecruiters public postings API.
    Endpoint: https://api.smartrecruiters.com/v1/companies/{slug}/postings
    """
    url = f"https://api.smartrecruiters.com/v1/companies/{slug}/postings"
    offset = 0
    limit = 100
    results = []

    while True:
        try:
            resp = requests.get(
                url,
                params={"limit": limit, "offset": offset},
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            _log_fetch_error("smartrecruiters", slug, company, e)
            break

        jobs = data.get("content", [])
        if not jobs:
            break

        for job in jobs:
            title = job.get("name", "")
            if not _is_pm_role(title):
                continue
            job_id = job.get("id", "")
            if not job_id:
                continue
            source_job_id = f"smartrecruiters::{slug}::{job_id}"
            results.append({
                **job,
                "_ats_platform": "smartrecruiters",
                "_ats_slug": slug,
                "_company_name": company,
                "_source_provider": "ats",
                "_source_job_id": source_job_id,
                "_external_job_key": f"ats::{source_job_id}",
            })

        total = data.get("totalFound", 0)
        offset += limit
        if offset >= total:
            break

    logger.info(f"  SmartRecruiters {slug}: {len(results)} PM jobs")
    return results


def _fetch_personio(slug: str, company: str) -> list[dict]:
    """
    Personio public XML feed.
    Endpoint: GET https://{slug}.jobs.personio.de/xml?language=en
    Returns XML, no authentication required.

    XML structure: <workzag-jobs><position><id>, <name>, <office><name>,
    <createdAt>, <department><name>, <schedule>, <seniority>, ...
    """
    url = f"https://{slug}.jobs.personio.de/xml"
    try:
        resp = requests.get(url, params={"language": "en"}, timeout=_TIMEOUT)
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
    except Exception as e:
        _log_fetch_error("personio", slug, company, e)
        return []

    results = []
    for position in root.findall("position"):
        title = (position.findtext("name") or "").strip()
        if not _is_pm_role(title):
            continue
        job_id = (position.findtext("id") or "").strip()
        if not job_id:
            continue

        office_el = position.find("office")
        location_raw = (office_el.findtext("name") or "").strip() if office_el is not None else ""

        dept_el = position.find("department")
        department = (dept_el.findtext("name") or "").strip() if dept_el is not None else ""

        canonical_url = f"https://{slug}.jobs.personio.de/job/{job_id}"
        source_job_id = f"personio::{slug}::{job_id}"
        results.append({
            "id": job_id,
            "name": title,
            "location": location_raw,
            "department": department,
            "schedule": position.findtext("schedule") or "",
            "seniority": position.findtext("seniority") or "",
            "createdAt": position.findtext("createdAt") or "",
            "_ats_platform": "personio",
            "_ats_slug": slug,
            "_company_name": company,
            "_canonical_url_override": canonical_url,
            "_source_provider": "ats",
            "_source_job_id": source_job_id,
            "_external_job_key": f"ats::{source_job_id}",
        })

    logger.info(f"  Personio {slug}: {len(results)} PM jobs")
    return results


def _fetch_gem(slug: str, company: str) -> list[dict]:
    """
    Gem public job board API.
    Endpoint: GET https://api.gem.com/job_board/v0/{slug}/job_posts/
    No authentication required.
    """
    url = f"https://api.gem.com/job_board/v0/{slug}/job_posts/"
    try:
        resp = requests.get(url, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        jobs = data if isinstance(data, list) else data.get("job_posts", [])
    except Exception as e:
        _log_fetch_error("gem", slug, company, e)
        return []

    results = []
    for job in jobs:
        title = job.get("title") or job.get("name") or ""
        if not _is_pm_role(title):
            continue
        job_id = str(job.get("id") or "")
        if not job_id:
            continue
        canonical_url = job.get("url") or job.get("job_url") or f"https://jobs.gem.com/{slug}/{job_id}"
        source_job_id = f"gem::{slug}::{job_id}"
        results.append({
            **job,
            "_ats_platform": "gem",
            "_ats_slug": slug,
            "_company_name": company,
            "_canonical_url_override": canonical_url,
            "_source_provider": "ats",
            "_source_job_id": source_job_id,
            "_external_job_key": f"ats::{source_job_id}",
        })

    logger.info(f"  Gem {slug}: {len(results)} PM jobs")
    return results


_PLATFORM_FETCHERS = {
    "greenhouse":      _fetch_greenhouse,
    "lever":           _fetch_lever,
    "ashby":           _fetch_ashby,
    "smartrecruiters": _fetch_smartrecruiters,
    "personio":        _fetch_personio,
    "gem":             _fetch_gem,
}

# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def fetch() -> list[dict]:
    """
    Fetch PM jobs from all configured ATS companies.
    Returns a flat list of raw job dicts with tracer keys injected.
    """
    all_results: list[dict] = []
    seen_keys: set[str] = set()

    for entry in ATS_COMPANIES:
        if not entry.get("enabled", True):
            logger.debug(f"ATS skipping disabled entry: {entry['company']} ({entry['ats']}/{entry['slug']})")
            continue
        platform = entry["ats"]
        slug = entry["slug"]
        company = entry["company"]
        fetcher = _PLATFORM_FETCHERS.get(platform)

        if fetcher is None:
            logger.warning(f"No fetcher for ATS platform {platform!r} ({company}), skipping")
            continue

        logger.info(f"ATS fetching: {company} ({platform})")
        try:
            jobs = fetcher(slug, company)
        except Exception as e:
            logger.error(f"Unexpected error fetching {company} ({platform}/{slug}): {e}")
            continue

        for job in jobs:
            key = job["_external_job_key"]
            if key in seen_keys:
                continue
            seen_keys.add(key)
            all_results.append(job)

    logger.info(f"ATS fetch complete: {len(all_results)} unique PM jobs across {len(ATS_COMPANIES)} companies")
    return all_results
