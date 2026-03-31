"""
Backfill work_mode for jobs currently classified as 'unknown'.

Re-runs the full LLM enricher (which now has improved work_mode inference)
and updates work_mode for any job where the LLM returns a non-unknown value.

Also updates other enrichment fields (pm_type, german_requirement, etc.)
since the LLM call returns all fields.

Usage:
  python -m pipeline.backfill_work_mode
  python -m pipeline.backfill_work_mode --dry-run
  python -m pipeline.backfill_work_mode --limit 5
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
logger = logging.getLogger("backfill_work_mode")


def fetch_unknown_work_mode_jobs(limit: int = 0) -> list[dict]:
    """Return active jobs with work_mode = 'unknown' and a usable description."""
    db = get_client()
    q = (
        db.table("jobs")
        .select("job_id, job_title_raw, company_name, location_normalized, description_text, work_mode")
        .eq("is_active", True)
        .eq("work_mode", "unknown")
        .not_.is_("description_text", "null")
    )
    if limit:
        q = q.limit(limit)
    resp = q.execute()

    # Filter out jobs with very short descriptions (LLM can't help)
    jobs = [j for j in resp.data if j.get("description_text") and len(j["description_text"].strip()) >= 80]

    logger.info(f"Found {len(resp.data)} active jobs with work_mode=unknown, {len(jobs)} have usable descriptions")
    return jobs


def backfill(jobs: list[dict], dry_run: bool = False) -> tuple[int, int, int]:
    """
    Re-enrich jobs and update work_mode.
    Returns (reclassified, still_unknown, failed).
    """
    db = get_client()
    reclassified = 0
    still_unknown = 0
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
            logger.warning(f"  → LLM returned nothing for {job_id}")
            failed += 1
            continue

        new_work_mode = result.get("work_mode", "unknown")

        if dry_run:
            status = "RECLASSIFIED" if new_work_mode != "unknown" else "still unknown"
            logger.info(f"  [DRY RUN] work_mode: unknown → {new_work_mode} ({status})")
            if new_work_mode != "unknown":
                reclassified += 1
            else:
                still_unknown += 1
            continue

        # Update all enrichment fields
        update_payload = {
            "work_mode": new_work_mode,
            "german_requirement": result.get("german_requirement"),
            "pm_type": result.get("pm_type"),
            "b2b_saas": result.get("b2b_saas"),
            "ai_focus": result.get("ai_focus"),
            "ai_skills": result.get("ai_skills"),
            "tools_skills": json.dumps(result.get("tools_skills", [])),
            "llm_version": result.get("llm_version"),
            "llm_confidence": result.get("llm_confidence"),
            "llm_raw_json": json.dumps(result.get("llm_raw_json", {})),
            "llm_extracted_at": datetime.now(timezone.utc).isoformat(),
        }
        update_payload = {k: v for k, v in update_payload.items() if v is not None}
        db.table("jobs").update(update_payload).eq("job_id", job_id).execute()

        # Also write experience tags if present
        exp_tags = result.get("experience_tags", [])
        if exp_tags:
            rows = []
            for t in exp_tags:
                rows.append({
                    "job_id": job_id,
                    "experience_tag": t["tag"],
                    "experience_family": t["family"],
                    "required_level": t["level"],
                    "evidence_text": t.get("evidence", ""),
                    "confidence": t.get("confidence"),
                    "classifier_version": CLASSIFIER_VERSION,
                })
            db.table("job_experience_tags").upsert(
                rows,
                on_conflict="job_id,experience_tag,classifier_version",
            ).execute()

        if new_work_mode != "unknown":
            logger.info(f"  → work_mode: unknown → {new_work_mode}")
            reclassified += 1
        else:
            logger.info(f"  → still unknown (LLM found no work arrangement clues)")
            still_unknown += 1

    return reclassified, still_unknown, failed


def main(dry_run: bool = False, limit: int = 0) -> None:
    logger.info(f"=== Work mode backfill (dry_run={dry_run}, limit={limit or 'all'}) ===")
    jobs = fetch_unknown_work_mode_jobs(limit=limit)

    if not jobs:
        logger.info("No jobs to backfill — all active jobs with descriptions have a classified work_mode.")
        return

    reclassified, still_unknown, failed = backfill(jobs, dry_run=dry_run)
    logger.info(
        f"\n=== Done ===\n"
        f"  Reclassified: {reclassified}\n"
        f"  Still unknown: {still_unknown}\n"
        f"  Failed: {failed}\n"
        f"  Total processed: {len(jobs)}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill work_mode for unknown jobs")
    parser.add_argument("--dry-run", action="store_true", help="Classify but do not write to DB")
    parser.add_argument("--limit", type=int, default=0, help="Cap number of jobs (0 = all)")
    args = parser.parse_args()
    try:
        main(dry_run=args.dry_run, limit=args.limit)
    except Exception as e:
        logger.exception(f"Fatal: {e}")
        sys.exit(1)
