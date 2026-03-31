"""
Backfill LLM enrichment for jobs that are missing pm_type or industry.

Covers two cases:
  1. Jobs that were never enriched (pm_type IS NULL)
  2. Jobs enriched before industry was added (pm_type IS NOT NULL but industry IS NULL)

Usage:
  python -m pipeline.backfill_enrichment
  python -m pipeline.backfill_enrichment --dry-run    # print counts, no writes
  python -m pipeline.backfill_enrichment --limit 20   # cap to N jobs (useful for testing)
"""
import argparse
import logging
import sys
from datetime import datetime, timezone

from pipeline.config import CLASSIFIER_VERSION
from pipeline.db import get_client
from pipeline.classifiers import llm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("backfill")


def fetch_jobs_needing_enrichment(limit: int = 0, force: bool = False) -> list[dict]:
    """
    Return jobs that have a description but are missing pm_type OR industry.
    If force=True, returns all active jobs with descriptions.
    """
    db = get_client()

    if force:
        logger.info("Force mode: Fetching all active jobs with descriptions")
        q = (
            db.table("jobs")
            .select("job_id, job_title_raw, company_name, location_normalized, description_text")
            .eq("is_active", True)
            .not_.is_("description_text", "null")
        )
        if limit:
            q = q.limit(limit)
        r = q.execute()
        return r.data

    # First pass: missing pm_type entirely (never enriched)
    q1 = (
        db.table("jobs")
        .select("job_id, job_title_raw, company_name, location_normalized, description_text")
        .is_("pm_type", "null")
        .not_.is_("description_text", "null")
    )
    if limit:
        q1 = q1.limit(limit)
    r1 = q1.execute()
    missing_all = r1.data

    # Second pass: enriched but work_mode is still unknown (work_mode was added to LLM later)
    remaining = limit - len(missing_all) if limit else 0
    q2 = (
        db.table("jobs")
        .select("job_id, job_title_raw, company_name, location_normalized, description_text")
        .not_.is_("pm_type", "null")
        .eq("work_mode", "unknown")
        .not_.is_("description_text", "null")
    )
    if limit and remaining <= 0:
        missing_work_mode = []
    else:
        if limit and remaining > 0:
            q2 = q2.limit(remaining)
        r2 = q2.execute()
        missing_work_mode = r2.data

    combined = missing_all + missing_work_mode
    logger.info(
        f"Found {len(missing_all)} jobs with no enrichment, "
        f"{len(missing_work_mode)} jobs missing work_mode classification. "
        f"Total to process: {len(combined)}"
    )
    return combined


def enrich_and_update(jobs: list[dict], dry_run: bool = False) -> tuple[int, int]:
    """Run LLM enrichment on each job and write results back. Returns (enriched, failed)."""
    db = get_client()
    enriched = 0
    failed = 0

    for i, job in enumerate(jobs, 1):
        job_id = job["job_id"]
        title = job.get("job_title_raw") or ""
        company = job.get("company_name") or ""
        location = job.get("location_normalized") or ""
        description = job.get("description_text") or ""

        logger.info(f"[{i}/{len(jobs)}] Enriching: {company} — {title}")

        result = llm.enrich(
            title=title,
            company=company,
            location=location,
            description=description,
        )

        if not result:
            logger.warning(f"  → LLM returned nothing for job_id={job_id}")
            failed += 1
            continue

        if dry_run:
            logger.info(
                f"  [DRY RUN] pm_type={result.get('pm_type')}, "
                f"work_mode={result.get('work_mode')}, "
                f"ai_focus={result.get('ai_focus')}, "
                f"ai_skills={result.get('ai_skills')}"
            )
            enriched += 1
            continue

        update_payload = {
            "german_requirement": result.get("german_requirement"),
            "work_mode": result.get("work_mode"),
            "pm_type": result.get("pm_type"),
            "b2b_saas": result.get("b2b_saas"),
            "ai_focus": result.get("ai_focus"),
            "ai_skills": result.get("ai_skills"),
            "tools_skills": result.get("tools_skills"),
            "llm_version": result.get("llm_version"),
            "llm_confidence": result.get("llm_confidence"),
            "llm_extracted_at": datetime.now(timezone.utc).isoformat(),
        }
        # Strip None values to avoid overwriting previously set fields unintentionally
        update_payload = {k: v for k, v in update_payload.items() if v is not None}

        db.table("jobs").update(update_payload).eq("job_id", job_id).execute()
        logger.info(
            f"  → pm_type={result.get('pm_type')}, work_mode={result.get('work_mode')}, "
            f"ai_focus={result.get('ai_focus')}"
        )
        enriched += 1

    return enriched, failed


def main(dry_run: bool = False, limit: int = 0, force: bool = False) -> None:
    logger.info(f"=== LLM enrichment backfill (dry_run={dry_run}, limit={limit or 'all'}, force={force}) ===")
    jobs = fetch_jobs_needing_enrichment(limit=limit, force=force)

    if not jobs:
        logger.info("Nothing to enrich. All active jobs are up to date.")
        return

    enriched, failed = enrich_and_update(jobs, dry_run=dry_run)
    logger.info(
        f"=== Done. Enriched: {enriched}, Failed: {failed}, "
        f"Total processed: {len(jobs)} ==="
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill LLM enrichment for unenriched jobs")
    parser.add_argument("--dry-run", action="store_true", help="Classify but do not write to DB")
    parser.add_argument("--limit", type=int, default=0, help="Cap number of jobs processed (0 = all)")
    parser.add_argument("--force", action="store_true", help="Re-enrich all active jobs")
    args = parser.parse_args()
    try:
        main(dry_run=args.dry_run, limit=args.limit, force=args.force)
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        sys.exit(1)
