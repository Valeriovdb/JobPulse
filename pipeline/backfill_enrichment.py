"""
Backfill LLM enrichment for jobs that are missing key enrichment fields.

Covers three cases:
  1. Jobs that were never enriched (pm_type IS NULL)
  2. Jobs enriched before v3 fields were added (pm_type IS NOT NULL but industry_normalized IS NULL)
  3. Jobs with work_mode still unknown after initial enrichment

Usage:
  python -m pipeline.backfill_enrichment
  python -m pipeline.backfill_enrichment --dry-run    # classify but do not write to DB
  python -m pipeline.backfill_enrichment --limit 20   # cap to N jobs (useful for testing)
  python -m pipeline.backfill_enrichment --force      # re-enrich all active jobs
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
# Force INFO level even if basicConfig was a no-op (happens when hashlib fires first and
# pre-installs a root handler at WARNING level before our script starts).
logging.getLogger().setLevel(logging.INFO)
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

    # Pass 1: missing pm_type entirely (never enriched)
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

    # Pass 2: enriched before v3 fields were added (industry_normalized still NULL)
    remaining_2 = (limit - len(missing_all)) if limit else 0
    missing_v3: list[dict] = []
    if not limit or remaining_2 > 0:
        q2 = (
            db.table("jobs")
            .select("job_id, job_title_raw, company_name, location_normalized, description_text")
            .not_.is_("pm_type", "null")
            .is_("industry_normalized", "null")
            .not_.is_("description_text", "null")
        )
        if limit and remaining_2 > 0:
            q2 = q2.limit(remaining_2)
        r2 = q2.execute()
        missing_v3 = r2.data

    # Pass 3: enriched but work_mode is still unknown
    remaining_3 = (limit - len(missing_all) - len(missing_v3)) if limit else 0
    missing_work_mode: list[dict] = []
    if not limit or remaining_3 > 0:
        q3 = (
            db.table("jobs")
            .select("job_id, job_title_raw, company_name, location_normalized, description_text")
            .not_.is_("pm_type", "null")
            .not_.is_("industry_normalized", "null")
            .eq("work_mode", "unknown")
            .not_.is_("description_text", "null")
        )
        if limit and remaining_3 > 0:
            q3 = q3.limit(remaining_3)
        r3 = q3.execute()
        missing_work_mode = r3.data

    combined = missing_all + missing_v3 + missing_work_mode
    logger.info(
        f"Found {len(missing_all)} jobs with no enrichment, "
        f"{len(missing_v3)} jobs missing v3 fields (industry_normalized), "
        f"{len(missing_work_mode)} jobs with unknown work_mode. "
        f"Total to process: {len(combined)}"
    )
    return combined


def enrich_and_update(jobs: list[dict], dry_run: bool = False) -> tuple[int, int]:
    """Run LLM enrichment on each job and write results back. Returns (enriched, failed)."""
    db = get_client()
    enriched = 0
    failed = 0

    # Per-field extraction counters for new v3 fields
    field_counts: dict[str, int] = {
        "industry_normalized": 0,
        "visa_sponsorship_status": 0,
        "relocation_support_status": 0,
        "years_experience_min": 0,
        "candidate_domain_requirement_strength": 0,
    }

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

        # Track per-field extraction counts (applies to both dry-run and live)
        for field in field_counts:
            if result.get(field) is not None:
                field_counts[field] += 1

        if dry_run:
            logger.info(
                f"  [DRY RUN] pm_type={result.get('pm_type')}, "
                f"work_mode={result.get('work_mode')}, "
                f"industry={result.get('industry_normalized')}, "
                f"visa={result.get('visa_sponsorship_status')}, "
                f"reloc={result.get('relocation_support_status')}, "
                f"yrs={result.get('years_experience_min')}"
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
            # New v3 fields
            "industry_normalized": result.get("industry_normalized"),
            "candidate_domain_requirement_strength": result.get("candidate_domain_requirement_strength"),
            "candidate_domain_requirement_normalized": result.get("candidate_domain_requirement_normalized"),
            "candidate_domain_requirement_raw": result.get("candidate_domain_requirement_raw"),
            "years_experience_min": result.get("years_experience_min"),
            "years_experience_raw": result.get("years_experience_raw"),
            "visa_sponsorship_status": result.get("visa_sponsorship_status"),
            "visa_sponsorship_raw": result.get("visa_sponsorship_raw"),
            "relocation_support_status": result.get("relocation_support_status"),
            "relocation_support_raw": result.get("relocation_support_raw"),
        }
        # Strip None values to avoid overwriting previously set fields unintentionally
        update_payload = {k: v for k, v in update_payload.items() if v is not None}

        db.table("jobs").update(update_payload).eq("job_id", job_id).execute()
        logger.info(
            f"  → pm_type={result.get('pm_type')}, work_mode={result.get('work_mode')}, "
            f"industry={result.get('industry_normalized')}, "
            f"visa={result.get('visa_sponsorship_status')}, yrs={result.get('years_experience_min')}"
        )
        enriched += 1

    # Log per-field extraction summary
    if enriched > 0:
        logger.info("Field extraction counts for this backfill run:")
        for field, count in field_counts.items():
            pct = round(count / enriched * 100)
            logger.info(f"  {field}: {count}/{enriched} ({pct}%)")

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
