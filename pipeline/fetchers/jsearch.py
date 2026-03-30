"""
JSearch fetcher (via RapidAPI).

Budget-aware: hard cap of JSEARCH_REQUESTS_PER_RUN API calls per run.
Query structure:
  - 5 fixed core queries (page 1 each)
  - 1 extra page-2 fetch for the best-performing query
  - 1 rotating exploratory query based on the current weekday
  Total: 7 requests max.

Circuit breaker: stops the batch after 2 consecutive 429 responses.
Throttle: 1-second pause between requests.

Returns (jobs, stats):
  jobs  : list of raw job dicts with _source_provider, _source_job_id,
          and _external_job_key injected.
  stats : dict with keys —
            attempted    - total API calls attempted this run
            successful   - calls that returned data
            rate_limited - calls rejected with 429 (NOT counted in budget_used)
            budget_used  - calls counted against the monthly budget
"""
import logging
import time
from datetime import date

import requests

from pipeline.config import (
    RAPIDAPI_KEY,
    JSEARCH_HOST,
    JSEARCH_CORE_QUERIES,
    JSEARCH_PAGE2_QUERY_INDEX,
    JSEARCH_ROTATING_QUERIES,
    JSEARCH_REQUESTS_PER_RUN,
    JSEARCH_DATE_POSTED,
)

logger = logging.getLogger(__name__)

BASE_URL = f"https://{JSEARCH_HOST}/search"

_HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": JSEARCH_HOST,
}

# Stop the batch after this many consecutive 429 responses.
_CIRCUIT_BREAKER_THRESHOLD = 2

# Pause between requests to reduce rate-limit pressure.
_INTER_REQUEST_DELAY = 1.0  # seconds


def _build_request_list() -> list[tuple[str, int]]:
    """
    Return an ordered list of (query, page) tuples for this run.
    Order: core queries p1, page-2 for core[0], rotating query p1.
    Total length == JSEARCH_REQUESTS_PER_RUN (7 by default).
    """
    requests_plan: list[tuple[str, int]] = []

    for q in JSEARCH_CORE_QUERIES:
        requests_plan.append((q, 1))

    if JSEARCH_PAGE2_QUERY_INDEX < len(JSEARCH_CORE_QUERIES):
        requests_plan.append((JSEARCH_CORE_QUERIES[JSEARCH_PAGE2_QUERY_INDEX], 2))

    weekday = date.today().weekday()  # 0=Mon … 4=Fri; 5/6=weekend (no entry)
    if weekday in JSEARCH_ROTATING_QUERIES:
        requests_plan.append((JSEARCH_ROTATING_QUERIES[weekday], 1))

    return requests_plan[:JSEARCH_REQUESTS_PER_RUN]


def _fetch_one(query: str, page: int) -> list[dict]:
    """Make a single JSearch API call and return raw job list. Raises on HTTP errors."""
    response = requests.get(
        BASE_URL,
        headers=_HEADERS,
        params={
            "query": query,
            "page": page,
            "num_pages": 1,
            "country": "de",
            "date_posted": JSEARCH_DATE_POSTED,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json().get("data", [])


def fetch() -> tuple[list[dict], dict]:
    """
    Fetch PM jobs from JSearch within the per-run request budget.

    Returns:
        (jobs, stats)
    """
    plan = _build_request_list()
    seen_keys: set[str] = set()
    results: list[dict] = []
    stats = {"attempted": 0, "successful": 0, "rate_limited": 0, "budget_used": 0}
    consecutive_429s = 0

    logger.info(
        f"JSearch plan: {len(plan)} requests "
        f"(cap={JSEARCH_REQUESTS_PER_RUN}): {plan}"
    )

    for query, page in plan:
        if consecutive_429s >= _CIRCUIT_BREAKER_THRESHOLD:
            remaining = len(plan) - stats["attempted"]
            logger.warning(
                f"JSearch circuit breaker triggered: {consecutive_429s} consecutive 429s, "
                f"skipping {remaining} remaining request(s)"
            )
            break

        if stats["attempted"] > 0:
            time.sleep(_INTER_REQUEST_DELAY)

        stats["attempted"] += 1
        try:
            jobs = _fetch_one(query, page)
            stats["successful"] += 1
            stats["budget_used"] += 1
            consecutive_429s = 0
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else None
            if status == 429:
                stats["rate_limited"] += 1
                consecutive_429s += 1
                logger.warning(
                    f"JSearch 429 rate limited — query={query!r} page={page} "
                    f"(consecutive: {consecutive_429s}/{_CIRCUIT_BREAKER_THRESHOLD})"
                )
                # 429 = request was rejected before being processed; not counted as budget_used
            else:
                stats["budget_used"] += 1
                consecutive_429s = 0
                logger.error(f"JSearch HTTP {status} — query={query!r} page={page}: {e}")
            continue
        except Exception as e:
            stats["budget_used"] += 1
            consecutive_429s = 0
            logger.error(f"JSearch request failed — query={query!r} page={page}: {e}")
            continue

        new_count = 0
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
            new_count += 1

        logger.info(
            f"  query={query!r} page={page}: "
            f"{len(jobs)} returned, {new_count} new (total: {len(results)})"
        )

    logger.info(
        f"JSearch fetch complete: {len(results)} jobs | "
        f"attempted={stats['attempted']} successful={stats['successful']} "
        f"rate_limited={stats['rate_limited']} budget_used={stats['budget_used']}"
    )
    return results, stats
