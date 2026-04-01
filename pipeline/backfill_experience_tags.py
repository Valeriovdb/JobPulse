"""
Backfill experience tags for existing jobs.

Fetches all active jobs that have a description_text, runs the LLM enricher
(which now includes experience_requirements extraction), and writes the tags to
the job_experience_requirements table.

Only writes experience tags — does not re-update other enrichment fields
unless --full-update is passed.

Usage:
  python -m pipeline.backfill_experience_tags
  python -m pipeline.backfill_experience_tags --dry-run
  python -m pipeline.backfill_experience_tags --limit 10
  python -m pipeline.backfill_experience_tags --full-update   # also update jobs table fields
"""
import argparse
import json
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
logger = logging.getLogger("backfill_experience")


def fetch_jobs(limit: int = 0) -> list[dict]:
    """Return all active jobs with description_text that don't yet have experience tags."""
    db = get_client()

    # Get job_ids that already have experience tags
    existing_resp = (
        db.table("job_experience_requirements")
        .select("job_id")
        .eq("classifier_version", CLASSIFIER_VERSION)
        .execute()
    )
    existing_job_ids = set(r["job_id"] for r in existing_resp.data)

    # Fetch active jobs with descriptions
    q = (
        db.table("jobs")
        .select("job_id, job_title_raw, company_name, location_normalized, description_text")
        .eq("is_active", True)
        .not_.is_("description_text", "null")
    )
    if limit:
        q = q.limit(limit + len(existing_job_ids))  # over-fetch to account for filtering
    resp = q.execute()

    # Filter out jobs that already have tags
    jobs = [j for j in resp.data if j["job_id"] not in existing_job_ids]
    if limit:
        jobs = jobs[:limit]

    logger.info(
        f"Found {len(resp.data)} active jobs with descriptions, "
        f"{len(existing_job_ids)} already have tags, "
        f"{len(jobs)} to process"
    )
    return jobs


def backfill(jobs: list[dict], dry_run: bool = False, full_update: bool = False) -> tuple[int, int, int]:
    """
    Run LLM enrichment and write experience tags.
    Returns (enriched, tags_written, failed).
    """
    db = get_client()
    enriched = 0
    tags_written = 0
    failed = 0

    for i, job in enumerate(jobs, 1):
        job_id = job["job_id"]
        title = job.get("job_title_raw") or ""
        company = job.get("company_name") or ""
        location = job.get("location_normalized") or ""
        description = job.get("description_text") or ""

        logger.info(f"[{i}/{len(jobs)}] {company} — {title}")

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

        exp_tags = result.get("experience_requirements", [])

        if dry_run:
            tag_names = [t["tag"] for t in exp_tags]
            logger.info(f"  [DRY RUN] {len(exp_tags)} tags: {tag_names}")
            enriched += 1
            tags_written += len(exp_tags)
            continue

        # Write experience tags
        if exp_tags:
            rows = []
            for t in exp_tags:
                rows.append({
                    "job_id": job_id,
                    "experience_tag": t["tag"],
                    "experience_family": t["family"],
                    "required_level": t["required_level"],
                    "evidence_text": t.get("evidence", ""),
                    "confidence": t.get("confidence"),
                    "classifier_version": CLASSIFIER_VERSION,
                })
            db.table("job_experience_requirements").upsert(
                rows,
                on_conflict="job_id,experience_tag,classifier_version",
            ).execute()
            tags_written += len(rows)

        # Optionally update the jobs table too
        if full_update:
            update_payload = {
                "german_requirement": result.get("german_requirement"),
                "work_mode": result.get("work_mode"),
                "pm_type": result.get("pm_type"),
                "b2b_saas": result.get("b2b_saas"),
                "ai_focus": result.get("ai_focus"),
                "ai_skills": result.get("ai_skills"),
                "tools_skills": json.dumps(result.get("tools_skills", [])),
                "llm_version": result.get("llm_version"),
                "llm_confidence": result.get("llm_confidence"),
                "llm_extracted_at": datetime.now(timezone.utc).isoformat(),
            }
            update_payload = {k: v for k, v in update_payload.items() if v is not None}
            db.table("jobs").update(update_payload).eq("job_id", job_id).execute()

        tag_names = [t["tag"] for t in exp_tags]
        logger.info(f"  → {len(exp_tags)} tags: {tag_names}")
        enriched += 1

    return enriched, tags_written, failed


def main(dry_run: bool = False, limit: int = 0, full_update: bool = False) -> None:
    logger.info(
        f"=== Experience tags backfill "
        f"(dry_run={dry_run}, limit={limit or 'all'}, full_update={full_update}) ==="
    )
    jobs = fetch_jobs(limit=limit)

    if not jobs:
        logger.info("Nothing to backfill. All active jobs already have experience tags.")
        return

    enriched, tags_written, failed = backfill(jobs, dry_run=dry_run, full_update=full_update)
    logger.info(
        f"=== Done. Enriched: {enriched}, Tags written: {tags_written}, "
        f"Failed: {failed}, Total processed: {len(jobs)} ==="
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill experience tags for existing jobs")
    parser.add_argument("--dry-run", action="store_true", help="Classify but do not write to DB")
    parser.add_argument("--limit", type=int, default=0, help="Cap number of jobs processed (0 = all)")
    parser.add_argument("--full-update", action="store_true", help="Also update jobs table enrichment fields")
    args = parser.parse_args()
    try:
        main(dry_run=args.dry_run, limit=args.limit, full_update=args.full_update)
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        sys.exit(1)
