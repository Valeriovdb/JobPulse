"""
JobPulse — frontend data export.

Queries Supabase after ingestion and writes precomputed JSON artifacts
to data/frontend/. The Streamlit app (and any future frontend) reads
these files instead of querying the database at render time.

Usage:
  python -m pipeline.export_data
  python -m pipeline.export_data --force-insights   # bypass insight cache
"""
import argparse
import hashlib
import json
import logging
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd

from pipeline.db import get_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("export_data")

OUT_DIR = Path(__file__).parent.parent / "data" / "frontend"


def _write(name: str, data: dict | list) -> None:
    path = OUT_DIR / name
    path.write_text(json.dumps(data, indent=2, default=str))
    logger.info(f"Wrote {path.name}")


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

def _fetch_active_jobs() -> pd.DataFrame:
    resp = (
        get_client()
        .table("jobs")
        .select(
            "job_id, company_name, seniority, is_berlin, is_remote_germany, "
            "work_mode, posting_language, german_requirement, pm_type, industry, "
            "b2b_saas, ai_focus, ai_skills, first_seen_date, source_provider"
        )
        .eq("is_active", True)
        .execute()
    )
    df = pd.DataFrame(resp.data)
    if not df.empty:
        df["first_seen_date"] = pd.to_datetime(df["first_seen_date"])
    return df


def _fetch_all_jobs() -> pd.DataFrame:
    resp = (
        get_client()
        .table("jobs")
        .select(
            "job_id, is_active, seniority, posting_language, german_requirement, "
            "first_seen_date, last_seen_date"
        )
        .execute()
    )
    df = pd.DataFrame(resp.data)
    if not df.empty:
        df["first_seen_date"] = pd.to_datetime(df["first_seen_date"])
        df["last_seen_date"] = pd.to_datetime(df["last_seen_date"])
        df["days_online"] = (df["last_seen_date"] - df["first_seen_date"]).dt.days + 1
    return df


def _fetch_snapshots() -> pd.DataFrame:
    resp = (
        get_client()
        .table("job_daily_snapshots")
        .select(
            "snapshot_date, job_id, is_active, seniority, posting_language, "
            "german_requirement, is_berlin, is_remote_germany, work_mode"
        )
        .order("snapshot_date")
        .execute()
    )
    df = pd.DataFrame(resp.data)
    if not df.empty:
        df["snapshot_date"] = pd.to_datetime(df["snapshot_date"])
    return df


def _fetch_experience_tags(active_job_ids: list[str]) -> pd.DataFrame:
    """Fetch experience tags for active jobs."""
    if not active_job_ids:
        return pd.DataFrame()
    resp = (
        get_client()
        .table("job_experience_tags")
        .select(
            "job_id, experience_tag, experience_family, required_level, "
            "evidence_text, confidence"
        )
        .in_("job_id", active_job_ids)
        .execute()
    )
    return pd.DataFrame(resp.data)


def _fetch_active_jobs_for_experience() -> pd.DataFrame:
    """Fetch active jobs with fields needed for experience side panel."""
    resp = (
        get_client()
        .table("jobs")
        .select(
            "job_id, company_name, job_title_raw, seniority, "
            "posting_language, german_requirement, canonical_url"
        )
        .eq("is_active", True)
        .execute()
    )
    return pd.DataFrame(resp.data)


def _fetch_last_run_date() -> str:
    resp = (
        get_client()
        .table("ingestion_runs")
        .select("run_date")
        .eq("status", "completed")
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    if resp.data:
        return resp.data[0]["run_date"]
    return date.today().isoformat()


# ---------------------------------------------------------------------------
# Exporters
# ---------------------------------------------------------------------------

def export_metadata(last_run_date: str) -> None:
    _write("metadata.json", {
        "last_updated": last_run_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "Berlin + remote Germany",
        "role_type": "Product Management",
    })


def export_overview(jobs: pd.DataFrame, last_run_date: str) -> None:
    today = pd.Timestamp(date.today())
    week_ago = today - pd.Timedelta(days=7)
    n_active = len(jobs)

    en_jobs = jobs[jobs["posting_language"].str.lower().eq("en")]
    en_none = en_jobs[en_jobs["german_requirement"] == "not_mentioned"]
    en_plus = en_jobs[en_jobs["german_requirement"] == "plus"]
    en_must = en_jobs[en_jobs["german_requirement"] == "must"]
    de_jobs = jobs[jobs["posting_language"].str.lower().eq("de")]

    n_new_week = int(jobs[jobs["first_seen_date"] >= week_ago].shape[0])
    accessible_pct = round(len(en_none) / n_active * 100) if n_active else 0
    median_age = int((today - jobs["first_seen_date"]).dt.days.median()) if n_active else 0

    senior_levels = {"senior", "mid_senior", "lead", "staff", "principal", "head", "group"}
    n_senior_plus = int(jobs["seniority"].isin(senior_levels).sum())
    senior_pct = round(n_senior_plus / n_active * 100) if n_active else 0

    n_berlin = int(jobs["is_berlin"].fillna(False).sum())
    n_remote = int(jobs["is_remote_germany"].fillna(False).sum())
    n_unclear = max(n_active - n_berlin - n_remote, 0)

    entry_pct = round(
        (jobs["seniority"].eq("junior").sum() + jobs["seniority"].isin(["mid", "middle"]).sum())
        / n_active * 100
    ) if n_active else 0

    _write("overview.json", {
        "last_updated": last_run_date,
        "n_active": n_active,
        "n_new_week": n_new_week,
        "senior_pct": senior_pct,
        "median_age_days": median_age,
        "accessible_pct": accessible_pct,
        "entry_pct": entry_pct,
        "language": {
            "en_none": int(len(en_none)),
            "en_plus": int(len(en_plus)),
            "en_must": int(len(en_must)),
            "de": int(len(de_jobs)),
        },
        "location": {
            "berlin": n_berlin,
            "remote_germany": n_remote,
            "unclear": n_unclear,
        },
    })


def export_distributions(jobs: pd.DataFrame) -> None:
    n_active = len(jobs)

    # Seniority
    seniority_order = ["junior", "mid", "mid_senior", "senior", "lead", "staff", "group", "principal", "unknown"]
    sen = jobs["seniority"].fillna("unknown").value_counts()
    seniority = [
        {"label": k, "count": int(sen.get(k, 0))}
        for k in seniority_order
        if sen.get(k, 0) > 0
    ]

    # Work mode
    work_mode_counts = jobs["work_mode"].fillna("unknown").value_counts()
    work_mode = [
        {"label": k, "count": int(v)}
        for k, v in work_mode_counts.items()
    ]

    # Language
    lang_counts = jobs["posting_language"].str.lower().fillna("unknown").value_counts()
    language = [{"label": k, "count": int(v)} for k, v in lang_counts.items()]

    # German requirement
    german_req_counts = jobs["german_requirement"].fillna("unclassified").value_counts()
    german_req = [{"label": k, "count": int(v)} for k, v in german_req_counts.items()]

    # PM type
    enriched = jobs[jobs["pm_type"].notna()]
    # Preferred display order; any extra values observed in data are appended at end
    pm_order = [
        "core_pm", "technical", "customer_facing", "platform",
        "data_ai", "growth", "internal_ops", "unclassified",
        # legacy values kept for backward compatibility
        "data", "other",
    ]
    pm_counts = enriched["pm_type"].value_counts()
    all_pm_labels = list(pm_counts.index)
    ordered = [k for k in pm_order if k in pm_counts] + [
        k for k in all_pm_labels if k not in pm_order
    ]
    pm_type = [
        {"label": k, "count": int(pm_counts[k])}
        for k in ordered
        if pm_counts.get(k, 0) > 0
    ]

    # Industry
    ind_jobs = jobs[jobs["industry"].notna()]
    ind_counts = ind_jobs["industry"].value_counts()
    industry = [{"label": k, "count": int(v)} for k, v in ind_counts.items()]

    # AI signals
    n_enriched = int(jobs["pm_type"].notna().sum())
    n_ai_focus = int(enriched["ai_focus"].eq(True).sum()) if not enriched.empty else 0
    n_ai_skills = int(enriched["ai_skills"].eq(True).sum()) if "ai_skills" in enriched.columns and not enriched.empty else 0
    ai = {
        "n_enriched": n_enriched,
        "n_ai_focus": n_ai_focus,
        "n_ai_skills": n_ai_skills,
        "ai_focus_pct": round(n_ai_focus / n_enriched * 100) if n_enriched else 0,
        "ai_skills_pct": round(n_ai_skills / n_enriched * 100) if n_enriched else 0,
    }

    # Source
    source_counts = jobs["source_provider"].value_counts()
    source = [{"label": k, "count": int(v)} for k, v in source_counts.items()]

    # Company top-20
    company_counts = (
        jobs["company_name"].dropna()
        .value_counts()
        .head(20)
        .reset_index()
    )
    company_counts.columns = ["company", "openings"]
    top10_share = int(company_counts.head(10)["openings"].sum())
    companies = {
        "top20": [
            {"label": row["company"], "count": int(row["openings"])}
            for _, row in company_counts.iterrows()
        ],
        "n_companies": int(jobs["company_name"].dropna().nunique()),
        "top10_share": top10_share,
        "top10_pct": round(top10_share / n_active * 100) if n_active else 0,
        "multi_hiring": int((jobs["company_name"].dropna().value_counts() >= 2).sum()),
    }

    _write("distributions.json", {
        "seniority": seniority,
        "work_mode": work_mode,
        "language": language,
        "german_requirement": german_req,
        "pm_type": pm_type,
        "industry": industry,
        "ai": ai,
        "source": source,
        "companies": companies,
    })


def export_experience(active_jobs: pd.DataFrame) -> None:
    """Export experience tag data for the Required Experience section."""
    if active_jobs.empty:
        _write("experience.json", {
            "tags": [],
            "jobs_by_tag": {},
            "n_jobs_with_tags": 0,
            "n_active": 0,
        })
        return

    active_job_ids = active_jobs["job_id"].tolist()
    n_active = len(active_jobs)

    # Fetch experience tags
    tags_df = _fetch_experience_tags(active_job_ids)
    if tags_df.empty:
        _write("experience.json", {
            "tags": [],
            "jobs_by_tag": {},
            "n_jobs_with_tags": 0,
            "n_active": n_active,
        })
        return

    # Fetch job details for side panel
    jobs_detail = _fetch_active_jobs_for_experience()
    job_lookup = {}
    if not jobs_detail.empty:
        job_lookup = jobs_detail.set_index("job_id").to_dict("index")

    # Aggregate: count active jobs per tag
    tag_counts = (
        tags_df
        .groupby(["experience_tag", "experience_family"])
        .agg(job_count=("job_id", "nunique"))
        .reset_index()
        .sort_values("job_count", ascending=False)
    )

    tags_list = [
        {
            "tag": row["experience_tag"],
            "family": row["experience_family"],
            "count": int(row["job_count"]),
        }
        for _, row in tag_counts.iterrows()
    ]

    # Build per-tag job lists with evidence (for side panel)
    jobs_by_tag = {}
    for tag in tag_counts["experience_tag"].unique():
        tag_rows = tags_df[tags_df["experience_tag"] == tag]
        job_entries = []
        for _, row in tag_rows.iterrows():
            jid = row["job_id"]
            detail = job_lookup.get(jid, {})
            job_entries.append({
                "job_id": jid,
                "company": detail.get("company_name", ""),
                "title": detail.get("job_title_raw", ""),
                "seniority": detail.get("seniority", ""),
                "url": detail.get("canonical_url", ""),
                "level": row.get("required_level", "not_clear"),
                "evidence": row.get("evidence_text", ""),
            })
        # Sort by company name for readability
        job_entries.sort(key=lambda x: x.get("company", "").lower())
        jobs_by_tag[tag] = job_entries

    n_jobs_with_tags = int(tags_df["job_id"].nunique())

    _write("experience.json", {
        "tags": tags_list,
        "jobs_by_tag": jobs_by_tag,
        "n_jobs_with_tags": n_jobs_with_tags,
        "n_active": n_active,
    })


def export_timeseries(all_jobs: pd.DataFrame, snapshots: pd.DataFrame) -> None:
    result: dict = {}

    if all_jobs.empty:
        _write("timeseries.json", result)
        return

    # New roles per day
    new_per_day = (
        all_jobs
        .groupby(all_jobs["first_seen_date"].dt.normalize())["job_id"]
        .count()
        .reset_index()
        .rename(columns={"first_seen_date": "date", "job_id": "count"})
        .sort_values("date")
    )
    # Drop the first date if it looks like a bulk import (count > 2× median of subsequent days)
    if len(new_per_day) > 2:
        rest_median = new_per_day.iloc[1:]["count"].median()
        if rest_median > 0 and new_per_day.iloc[0]["count"] > 2 * rest_median:
            new_per_day = new_per_day.iloc[1:]
    result["new_per_day"] = [
        {"date": row["date"].date().isoformat(), "count": int(row["count"])}
        for _, row in new_per_day.iterrows()
    ]

    # Active roles per day (from snapshots)
    if not snapshots.empty:
        active_per_day = (
            snapshots[snapshots["is_active"]]
            .groupby("snapshot_date")["job_id"]
            .nunique()
            .reset_index()
            .rename(columns={"job_id": "count"})
            .sort_values("snapshot_date")
        )
        # Drop the first snapshot date if it aligns with a bulk import spike
        if len(active_per_day) > 2:
            rest_median = active_per_day.iloc[1:]["count"].median()
            if rest_median > 0 and active_per_day.iloc[0]["count"] > 2 * rest_median:
                active_per_day = active_per_day.iloc[1:]
        result["active_per_day"] = [
            {"date": row["snapshot_date"].date().isoformat(), "count": int(row["count"])}
            for _, row in active_per_day.iterrows()
        ]

    # Lifespan summary (inactive jobs only)
    inactive = all_jobs[~all_jobs["is_active"]].copy()
    if len(inactive) >= 10:
        median_d = float(inactive["days_online"].median())
        mean_d = float(inactive["days_online"].mean())
        pct_week = float((inactive["days_online"] <= 7).mean() * 100)
        result["lifespan"] = {
            "median_days": round(median_d),
            "mean_days": round(mean_d, 1),
            "pct_gone_week": round(pct_week),
            "n_inactive": len(inactive),
        }

    # Seniority mix over time
    if not snapshots.empty:
        seniority_trend = (
            snapshots[snapshots["is_active"]]
            .assign(seniority=lambda df: df["seniority"].fillna("unknown"))
            .groupby(["snapshot_date", "seniority"])["job_id"]
            .nunique()
            .reset_index()
            .rename(columns={"job_id": "count"})
        )
        pivot = seniority_trend.pivot(index="snapshot_date", columns="seniority", values="count").fillna(0)
        result["seniority_mix"] = {
            "dates": [d.date().isoformat() for d in pivot.index],
            "series": {
                col: [int(v) for v in pivot[col].tolist()]
                for col in pivot.columns
            },
        }

        # German requirement over time
        german_trend = (
            snapshots[snapshots["is_active"] & snapshots["german_requirement"].notna()]
            .groupby(["snapshot_date", "german_requirement"])["job_id"]
            .nunique()
            .reset_index()
            .rename(columns={"job_id": "count"})
        )
        pivot_g = german_trend.pivot(index="snapshot_date", columns="german_requirement", values="count").fillna(0)
        result["german_req_mix"] = {
            "dates": [d.date().isoformat() for d in pivot_g.index],
            "series": {
                col: [int(v) for v in pivot_g[col].tolist()]
                for col in pivot_g.columns
            },
        }

    _write("timeseries.json", result)


# ---------------------------------------------------------------------------
# Chart insights export
# ---------------------------------------------------------------------------

def _data_version(paths: list[Path]) -> str:
    """SHA-256 of the concatenated content of the given JSON files."""
    h = hashlib.sha256()
    for p in paths:
        if p.exists():
            h.update(p.read_bytes())
    return f"sha256:{h.hexdigest()[:16]}"


def export_insights(force: bool = False) -> None:
    """
    Generate LLM-powered chart titles and subtitles for the four supported
    charts and write chart_insights.json to OUT_DIR.

    Uses a content hash of distributions.json + timeseries.json as a cache
    key. The LLM is only called when the data has changed since the last run
    (or when force=True).
    """
    from pipeline.insights.chart_summary import (
        build_german_requirement_summary,
        build_pm_type_summary,
        build_seniority_summary,
        build_work_mode_summary,
        build_location_summary,
        build_ai_summary,
        build_industry_summary,
    )
    from pipeline.insights.copy_service import ChartInsightCopyService

    insights_path = OUT_DIR / "chart_insights.json"
    dist_path     = OUT_DIR / "distributions.json"
    ts_path       = OUT_DIR / "timeseries.json"
    overview_path = OUT_DIR / "overview.json"

    current_version = _data_version([dist_path, ts_path])

    # Check cache
    if not force and insights_path.exists():
        try:
            cached = json.loads(insights_path.read_text())
            if cached.get("data_version") == current_version:
                logger.info("chart_insights.json is up to date (data unchanged) — skipping LLM calls")
                return
        except Exception:
            pass  # corrupt cache — regenerate

    # Load source data
    try:
        dist   = json.loads(dist_path.read_text())
        ov     = json.loads(overview_path.read_text())
    except Exception as e:
        logger.error(f"export_insights: failed to read source JSON — {e}")
        return

    n_active = ov.get("n_active", 0)

    # Build summaries for all Overview tab charts
    summaries = {
        "german_requirement": build_german_requirement_summary(
            dist.get("german_requirement", []), n_active
        ),
        "pm_type": build_pm_type_summary(
            dist.get("pm_type", [])
        ),
        "seniority": build_seniority_summary(
            dist.get("seniority", [])
        ),
        "work_mode": build_work_mode_summary(
            dist.get("work_mode", [])
        ),
        "location": build_location_summary(
            ov.get("location", {}), n_active
        ),
        "ai": build_ai_summary(
            dist.get("ai", {})
        ),
        "industry": build_industry_summary(
            dist.get("industry", [])
        ),
    }

    # Generate copy
    service = ChartInsightCopyService()
    charts: dict[str, dict] = {}
    for chart_id, summary in summaries.items():
        logger.info(f"Generating copy for chart: {chart_id}")
        charts[chart_id] = service.generate(summary)

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_version": current_version,
        "charts": charts,
    }
    _write("chart_insights.json", result)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(force_insights: bool = False) -> None:
    logger.info("=== JobPulse frontend data export ===")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    last_run_date = _fetch_last_run_date()
    logger.info(f"Last completed run: {last_run_date}")

    logger.info("Fetching active jobs…")
    active_jobs = _fetch_active_jobs()
    logger.info(f"Active jobs: {len(active_jobs)}")

    logger.info("Fetching all jobs (lifetime)…")
    all_jobs = _fetch_all_jobs()
    logger.info(f"All jobs: {len(all_jobs)}")

    logger.info("Fetching snapshots…")
    snapshots = _fetch_snapshots()
    logger.info(f"Snapshot rows: {len(snapshots)}")

    export_metadata(last_run_date)
    export_overview(active_jobs, last_run_date)
    export_distributions(active_jobs)
    export_experience(active_jobs)
    export_timeseries(all_jobs, snapshots)
    export_insights(force=force_insights)

    logger.info("=== Export complete ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="JobPulse frontend data export")
    parser.add_argument(
        "--force-insights",
        action="store_true",
        default=False,
        help="Bypass the insight cache and regenerate chart copy even if data hasn't changed",
    )
    args = parser.parse_args()
    try:
        run(force_insights=args.force_insights)
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        sys.exit(1)
