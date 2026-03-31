"""
Backfill work_mode for jobs that have description_text but work_mode = 'unknown'.

Re-runs LLM enrichment on those jobs and updates only the work_mode field
(plus llm_version and llm_extracted_at). All other LLM fields are preserved.

Usage:
  python -m pipeline.backfill_work_mode [--dry-run]
"""
import argparse
import logging
import sys
from datetime import datetime, timezone

from pipeline.db import get_client
from pipeline.classifiers import llm
from pipeline.config import CLASSIFIER_VERSION

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("backfill_work_mode")


def run(dry_run: bool = False) -> None:
    db = get_client()

    resp = (
        db.table("jobs")
        .select("job_id, job_title_raw, company_name, location_normalized, description_text")
        .eq("work_mode", "unknown")
        .eq("is_active", True)
        .not_.is_("description_text", "null")
        .execute()
    )
    jobs = resp.data
    logger.info(f"Found {len(jobs)} jobs with work_mode=unknown and description_text")

    if not jobs:
        logger.info("Nothing to backfill.")
        return

    updated = 0
    skipped = 0

    for job in jobs:
        result = llm.enrich(
            title=job.get("job_title_raw") or "",
            company=job.get("company_name") or "",
            location=job.get("location_normalized") or "",
            description=job.get("description_text") or "",
        )
        if not result:
            logger.warning(f"LLM enrichment failed for job_id={job['job_id']}")
            skipped += 1
            continue

        new_mode = result.get("work_mode") or "unknown"
        logger.info(
            f"  job_id={job['job_id']} | {job.get('company_name')} / {job.get('job_title_raw', '')[:50]!r}"
            f" → {new_mode} (confidence={result.get('llm_confidence', 0):.2f})"
        )

        if dry_run:
            updated += 1
            continue

        db.table("jobs").update({
            "work_mode": new_mode,
            "llm_version": CLASSIFIER_VERSION,
            "llm_extracted_at": datetime.now(timezone.utc).isoformat(),
        }).eq("job_id", job["job_id"]).execute()
        updated += 1

    logger.info(
        f"Backfill complete: {updated} updated, {skipped} skipped"
        + (" (dry run — no writes)" if dry_run else "")
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill work_mode for unknown-classified jobs")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    args = parser.parse_args()

    try:
        run(dry_run=args.dry_run)
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        sys.exit(1)
