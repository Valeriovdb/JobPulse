"""
JSearch fetcher (via RapidAPI).

Returns a list of raw job dicts. Each dict is the raw API record with two
extra keys injected for traceability:
  _source_provider  : "jsearch"
  _source_job_id    : the JSearch job_id string
  _external_job_key : "jsearch::{source_job_id}"
"""
import logging
import requests
from pipeline.config import RAPIDAPI_KEY, JSEARCH_HOST, JSEARCH_QUERIES, JSEARCH_MAX_PAGES

logger = logging.getLogger(__name__)

BASE_URL = f"https://{JSEARCH_HOST}/search"


def fetch() -> list[dict]:
    """Fetch all PM jobs from JSearch across configured queries."""
    seen_keys: set[str] = set()
    results: list[dict] = []

    for query in JSEARCH_QUERIES:
        logger.info(f"JSearch fetching: {query!r}")
        for page in range(1, JSEARCH_MAX_PAGES + 1):
            try:
                response = requests.get(
                    BASE_URL,
                    headers={
                        "X-RapidAPI-Key": RAPIDAPI_KEY,
                        "X-RapidAPI-Host": JSEARCH_HOST,
                    },
                    params={
                        "query": query,
                        "page": page,
                        "num_pages": 1,
                        "country": "de",
                        "date_posted": "3days",
                    },
                    timeout=30,
                )
                response.raise_for_status()
                data = response.json()
            except Exception as e:
                logger.error(f"JSearch request failed (query={query!r}, page={page}): {e}")
                break

            jobs = data.get("data", [])
            if not jobs:
                logger.debug(f"  page {page}: no results, stopping")
                break

            for job in jobs:
                source_job_id = job.get("job_id", "")
                if not source_job_id:
                    continue
                key = f"jsearch::{source_job_id}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                job["_source_provider"] = "jsearch"
                job["_source_job_id"] = source_job_id
                job["_external_job_key"] = key
                results.append(job)

            logger.info(f"  page {page}: {len(jobs)} jobs (running total: {len(results)})")

    logger.info(f"JSearch fetch complete: {len(results)} unique jobs")
    return results
