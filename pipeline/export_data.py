"""
JobPulse — frontend data export.

Queries Supabase after ingestion and writes precomputed JSON artifacts
to data/frontend/. The Streamlit app (and any future frontend) reads
these files instead of querying the database at render time.

Usage:
  python -m pipeline.export_data
"""
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

    senior_levels = {"senior", "lead", "staff", "principal", "head"}
    n_senior_plus = int(jobs["seniority"].isin(senior_levels).sum())
    senior_pct = round(n_senior_plus / n_active * 100) if n_active else 0

    n_berlin = int(jobs["is_berlin"].fillna(False).sum())
    n_remote = int(jobs["is_remote_germany"].fillna(False).sum())
    n_unclear = max(n_active - n_berlin - n_remote, 0)

    entry_pct = round(
        (jobs["seniority"].eq("junior").sum() + jobs["seniority"].eq("mid").sum())
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
    seniority_order = ["junior", "mid", "senior", "lead", "staff", "principal", "head", "unknown"]
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
    pm_order = ["core_pm", "technical", "growth", "data", "other"]
    pm_counts = enriched["pm_type"].value_counts()
    pm_type = [
        {"label": k, "count": int(pm_counts.get(k, 0))}
        for k in pm_order
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
# Main
# ---------------------------------------------------------------------------

def run() -> None:
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
    export_timeseries(all_jobs, snapshots)

    logger.info("=== Export complete ===")


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        sys.exit(1)
