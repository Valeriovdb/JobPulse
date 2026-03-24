"""
JobPulse ingestion orchestrator.

Run order:
  1. Open ingestion run
  2. Fetch from all sources
  3. Normalize each record
  4. LLM-enrich new/unenriched jobs
  5. Upsert to jobs + raw_job_records + job_source_appearances
  6. Write daily snapshots
  7. Mark stale jobs inactive
  8. Close ingestion run

Usage:
  python -m pipeline.ingest [--dry-run]
"""
import argparse
import json
import logging
import sys
from datetime import date, datetime, timezone
from typing import Optional

from pipeline import config
from pipeline.db import get_client
from pipeline.fetchers import jsearch, arbeitnow
from pipeline.normalize import normalize, NormalizedJob
from pipeline.classifiers import llm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ingest")


# ---------------------------------------------------------------------------
# Run management
# ---------------------------------------------------------------------------

def open_run(run_date: date, sources: list[str], dry_run: bool) -> str:
    db = get_client()
    result = (
        db.table("ingestion_runs")
        .insert({
            "run_date": run_date.isoformat(),
            "sources": sources,
            "dry_run": dry_run,
            "status": "started",
            "started_at": datetime.now(timezone.utc).isoformat(),
        })
        .execute()
    )
    run_id = result.data[0]["run_id"]
    logger.info(f"Opened run {run_id} (dry_run={dry_run})")
    return run_id


def close_run(
    run_id: str,
    status: str,
    rows_fetched: int,
    rows_new: int,
    rows_updated: int,
    error_message: Optional[str] = None,
) -> None:
    db = get_client()
    db.table("ingestion_runs").update({
        "status": status,
        "rows_fetched": rows_fetched,
        "rows_new": rows_new,
        "rows_updated": rows_updated,
        "error_message": error_message,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("run_id", run_id).execute()
    logger.info(f"Closed run {run_id}: status={status}, fetched={rows_fetched}, new={rows_new}, updated={rows_updated}")


# ---------------------------------------------------------------------------
# Fetch phase
# ---------------------------------------------------------------------------

def fetch_all() -> tuple[list[dict], list[str]]:
    """Fetch from all sources. Returns (raw_records, active_sources)."""
    raw: list[dict] = []
    active_sources: list[str] = []

    for source_name, fetch_fn in [("jsearch", jsearch.fetch), ("arbeitnow", arbeitnow.fetch)]:
        try:
            records = fetch_fn()
            raw.extend(records)
            active_sources.append(source_name)
            logger.info(f"{source_name}: fetched {len(records)} records")
        except Exception as e:
            logger.error(f"{source_name}: fetch failed — {e}")
            # continue with other sources; run will be marked 'partial'

    return raw, active_sources


# ---------------------------------------------------------------------------
# Persist phase
# ---------------------------------------------------------------------------

def _job_to_db_row(job: NormalizedJob, run_date: date) -> dict:
    """Convert NormalizedJob to a jobs table row dict."""
    return {
        "external_job_key": job.external_job_key,
        "source_provider": job.source_provider,
        "canonical_url": job.canonical_url,
        "company_name": job.company_name,
        "job_title_raw": job.job_title_raw,
        "job_title_normalized": job.job_title_normalized,
        "seniority": job.seniority,
        "location_raw": job.location_raw,
        "location_normalized": job.location_normalized,
        "is_berlin": job.is_berlin,
        "is_remote_germany": job.is_remote_germany,
        "work_mode": job.work_mode,
        "posting_language": job.posting_language,
        "german_requirement": job.german_requirement,
        "pm_type": job.pm_type,
        "b2b_saas": job.b2b_saas,
        "ai_focus": job.ai_focus,
        "ai_skills": job.ai_skills,
        "tools_skills": json.dumps(job.tools_skills) if job.tools_skills else None,
        "publisher_type": job.publisher_type,
        "has_linkedin_apply_option": job.has_linkedin_apply_option,
        "has_company_site_apply_option": job.has_company_site_apply_option,
        "raw_posted_at": job.raw_posted_at.isoformat() if job.raw_posted_at else None,
        "description_text": job.description_text,
        "llm_version": job.llm_version if hasattr(job, "llm_version") else None,
        "llm_extracted_at": datetime.now(timezone.utc).isoformat() if job.german_requirement else None,
        "llm_confidence": job.llm_confidence if hasattr(job, "llm_confidence") else None,
        "llm_raw_json": json.dumps(job.llm_raw_json) if hasattr(job, "llm_raw_json") and job.llm_raw_json else None,
        "first_seen_date": run_date.isoformat(),
        "last_seen_date": run_date.isoformat(),
        "is_active": True,
    }


def upsert_jobs(
    jobs: list[NormalizedJob],
    run_id: str,
    run_date: date,
    dry_run: bool,
) -> tuple[int, int]:
    """
    Upsert jobs into the jobs table.
    Returns (rows_new, rows_updated).
    """
    if not jobs:
        return 0, 0

    db = get_client()
    rows_new = 0
    rows_updated = 0

    # Fetch existing keys in one query to classify new vs seen
    keys = [j.external_job_key for j in jobs]
    existing_resp = (
        db.table("jobs")
        .select("job_id, external_job_key, first_seen_date")
        .in_("external_job_key", keys)
        .execute()
    )
    existing = {r["external_job_key"]: r for r in existing_resp.data}

    for job in jobs:
        is_new = job.external_job_key not in existing
        row = _job_to_db_row(job, run_date)

        if dry_run:
            status = "NEW" if is_new else "UPDATE"
            logger.info(f"[DRY RUN] {status}: {job.external_job_key} — {job.company_name} / {job.job_title_raw}")
            if is_new:
                rows_new += 1
            else:
                rows_updated += 1
            continue

        if is_new:
            db.table("jobs").insert(row).execute()
            rows_new += 1
        else:
            # Preserve first_seen_date; update last_seen_date and mutable fields
            existing_record = existing[job.external_job_key]
            update_row = {k: v for k, v in row.items() if k != "first_seen_date"}
            update_row["is_active"] = True
            db.table("jobs").update(update_row).eq(
                "external_job_key", job.external_job_key
            ).execute()
            rows_updated += 1

    return rows_new, rows_updated


def upsert_raw_records(
    raw_jobs: list[dict],
    run_id: str,
    dry_run: bool,
) -> None:
    """Store raw API payloads in raw_job_records."""
    if dry_run or not raw_jobs:
        return
    db = get_client()
    rows = [
        {
            "run_id": run_id,
            "source_provider": r["_source_provider"],
            "source_job_id": r["_source_job_id"],
            "external_job_key": r["_external_job_key"],
            "raw_payload": json.dumps(r),
        }
        for r in raw_jobs
    ]
    # Insert in batches of 100
    for i in range(0, len(rows), 100):
        db.table("raw_job_records").insert(rows[i:i+100]).execute()


def upsert_source_appearances(
    jobs: list[NormalizedJob],
    job_id_map: dict[str, str],
    run_id: str,
    run_date: date,
    dry_run: bool,
) -> None:
    """Record a source appearance for each job in this run."""
    if dry_run or not jobs:
        return
    db = get_client()
    rows = []
    for job in jobs:
        job_id = job_id_map.get(job.external_job_key)
        if not job_id:
            continue
        rows.append({
            "job_id": job_id,
            "run_id": run_id,
            "source_provider": job.source_provider,
            "appearance_date": run_date.isoformat(),
            "canonical_url": job.canonical_url,
            "publisher_type": job.publisher_type,
            "has_linkedin_apply_option": job.has_linkedin_apply_option,
            "has_company_site_apply_option": job.has_company_site_apply_option,
        })
    if rows:
        db.table("job_source_appearances").upsert(
            rows, on_conflict="job_id,run_id,source_provider"
        ).execute()


def write_snapshots(
    jobs: list[NormalizedJob],
    job_id_map: dict[str, str],
    run_id: str,
    run_date: date,
    dry_run: bool,
) -> None:
    """Write one daily snapshot row per job."""
    if dry_run or not jobs:
        return
    db = get_client()

    # Fetch first_seen_dates for days_since calculation
    job_ids = list(job_id_map.values())
    first_seen_resp = (
        db.table("jobs")
        .select("job_id, first_seen_date")
        .in_("job_id", job_ids)
        .execute()
    )
    first_seen_map = {r["job_id"]: r["first_seen_date"] for r in first_seen_resp.data}

    rows = []
    for job in jobs:
        job_id = job_id_map.get(job.external_job_key)
        if not job_id:
            continue
        first_seen_str = first_seen_map.get(job_id)
        days_since = None
        if first_seen_str:
            first_seen = date.fromisoformat(first_seen_str)
            days_since = (run_date - first_seen).days

        rows.append({
            "snapshot_date": run_date.isoformat(),
            "job_id": job_id,
            "run_id": run_id,
            "is_active": True,
            "days_since_first_seen": days_since,
            "external_job_key": job.external_job_key,
            "company_name": job.company_name,
            "source_provider": job.source_provider,
            "publisher_type": job.publisher_type,
            "canonical_url": job.canonical_url,
            "seniority": job.seniority,
            "location_normalized": job.location_normalized,
            "is_berlin": job.is_berlin,
            "is_remote_germany": job.is_remote_germany,
            "work_mode": job.work_mode,
            "posting_language": job.posting_language,
            "german_requirement": job.german_requirement,
            "pm_type": job.pm_type,
            "b2b_saas": job.b2b_saas,
            "ai_focus": job.ai_focus,
            "ai_skills": job.ai_skills,
            "raw_posted_at": job.raw_posted_at.isoformat() if job.raw_posted_at else None,
            "has_linkedin_apply_option": job.has_linkedin_apply_option,
            "has_company_site_apply_option": job.has_company_site_apply_option,
        })

    for i in range(0, len(rows), 100):
        db.table("job_daily_snapshots").upsert(
            rows[i:i+100], on_conflict="job_id,snapshot_date"
        ).execute()

    logger.info(f"Wrote {len(rows)} snapshots for {run_date}")


def get_job_id_map(keys: list[str]) -> dict[str, str]:
    """Fetch job_id for each external_job_key."""
    db = get_client()
    resp = (
        db.table("jobs")
        .select("job_id, external_job_key")
        .in_("external_job_key", keys)
        .execute()
    )
    return {r["external_job_key"]: r["job_id"] for r in resp.data}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(dry_run: bool = False) -> None:
    today = date.today()
    logger.info(f"=== JobPulse ingestion — {today} (dry_run={dry_run}) ===")

    # 1. Open run
    run_id = open_run(today, ["jsearch", "arbeitnow"], dry_run)

    # 2. Fetch
    raw_records, active_sources = fetch_all()
    status = "partial" if len(active_sources) < 2 else "started"

    if not raw_records:
        logger.warning("No records fetched from any source")
        close_run(run_id, "failed", 0, 0, 0, "No records fetched")
        return

    # 3. Normalize
    normalized: list[NormalizedJob] = []
    for raw in raw_records:
        job = normalize(raw)
        if job:
            normalized.append(job)
    logger.info(f"Normalized {len(normalized)}/{len(raw_records)} records")

    # 4. LLM enrichment (only jobs with description text)
    enriched_count = 0
    for job in normalized:
        if not job.description_text:
            continue
        result = llm.enrich(
            title=job.job_title_raw or "",
            company=job.company_name or "",
            location=job.location_normalized or "",
            description=job.description_text,
        )
        if result:
            job.german_requirement = result.get("german_requirement")
            job.pm_type = result.get("pm_type")
            job.b2b_saas = result.get("b2b_saas")
            job.ai_focus = result.get("ai_focus")
            job.ai_skills = result.get("ai_skills")
            job.tools_skills = result.get("tools_skills")
            # Attach LLM metadata directly to the job object for persistence
            job.llm_version = result.get("llm_version")
            job.llm_confidence = result.get("llm_confidence")
            job.llm_raw_json = result.get("llm_raw_json")
            enriched_count += 1
    logger.info(f"LLM enrichment complete: {enriched_count}/{len(normalized)} jobs enriched")

    # 5. Upsert jobs
    rows_new, rows_updated = upsert_jobs(normalized, run_id, today, dry_run)

    if not dry_run:
        # 5b. Raw records
        upsert_raw_records(raw_records, run_id, dry_run)

        # 5c. Source appearances
        job_id_map = get_job_id_map([j.external_job_key for j in normalized])
        upsert_source_appearances(normalized, job_id_map, run_id, today, dry_run)

        # 6. Daily snapshots
        write_snapshots(normalized, job_id_map, run_id, today, dry_run)

        # 7. Mark stale jobs inactive
        db = get_client()
        db.rpc("mark_stale_jobs_inactive", {
            "p_run_date": today.isoformat(),
            "p_grace_days": config.ACTIVE_GRACE_DAYS,
        }).execute()
        logger.info("Marked stale jobs inactive")

    # 8. Close run
    final_status = "completed" if active_sources == ["jsearch", "arbeitnow"] else "partial"
    close_run(run_id, final_status, len(raw_records), rows_new, rows_updated)
    logger.info("=== Ingestion complete ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="JobPulse ingestion pipeline")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and normalize but do not write to DB")
    args = parser.parse_args()

    is_dry_run = args.dry_run or config.DRY_RUN
    try:
        run(dry_run=is_dry_run)
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        sys.exit(1)
