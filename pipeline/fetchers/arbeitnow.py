"""
Arbeitnow fetcher.

Free, no API key required. Focused on Germany, English-speaking roles,
and visa-sponsorship jobs. Good complement to JSearch.

API docs: https://www.arbeitnow.com/api
Returns a list of raw job dicts with _source_provider, _source_job_id,
and _external_job_key injected.
"""
import re
import logging
import requests
from pipeline.config import ARBEITNOW_TAGS, ARBEITNOW_MAX_PAGES

logger = logging.getLogger(__name__)

BASE_URL = "https://www.arbeitnow.com/api/job-board-api"

# Titles that must match to pass the PM filter.
_PM_TITLE_PATTERN = re.compile(
    r"product manager|product owner|head of product|principal pm|group pm|"
    r"technical product manager|growth product manager|"
    r"produktmanager|produktowner",
    re.IGNORECASE,
)

# Executive-scope titles excluded from MVP ingestion.
# Mirrors the same rule in fetchers/ats.py — keep both in sync.
_EXEC_TITLE_PATTERN = re.compile(
    r"\bcpto\b|chief product officer|\bchief product\b|"
    r"\bvp\s+of\s+product\b|\bvp\s+product\b|vice\s+president.*product|"
    r"director\s+of\s+product|\bproduct\s+director\b",
    re.IGNORECASE,
)


def _is_pm_role(job: dict) -> bool:
    title = job.get("title", "")
    return bool(_PM_TITLE_PATTERN.search(title)) and not bool(_EXEC_TITLE_PATTERN.search(title))


def fetch() -> list[dict]:
    """Fetch PM jobs from Arbeitnow across configured tags."""
    seen_keys: set[str] = set()
    results: list[dict] = []

    for tag in ARBEITNOW_TAGS:
        logger.info(f"Arbeitnow fetching tag: {tag!r}")
        for page in range(1, ARBEITNOW_MAX_PAGES + 1):
            try:
                response = requests.get(
                    BASE_URL,
                    params={"tag": tag, "page": page},
                    timeout=30,
                )
                response.raise_for_status()
                data = response.json()
            except Exception as e:
                logger.error(f"Arbeitnow request failed (tag={tag!r}, page={page}): {e}")
                break

            jobs = data.get("data", [])
            if not jobs:
                logger.debug(f"  page {page}: no results, stopping")
                break

            for job in jobs:
                if not _is_pm_role(job):
                    continue
                # Arbeitnow uses 'slug' as unique identifier
                source_job_id = str(job.get("slug", ""))
                if not source_job_id:
                    continue
                key = f"arbeitnow::{source_job_id}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                job["_source_provider"] = "arbeitnow"
                job["_source_job_id"] = source_job_id
                job["_external_job_key"] = key
                results.append(job)

            logger.info(f"  page {page}: {len(jobs)} jobs (running total: {len(results)})")

    logger.info(f"Arbeitnow fetch complete: {len(results)} unique jobs")
    return results
