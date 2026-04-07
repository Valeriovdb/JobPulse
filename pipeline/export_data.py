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
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from pipeline.config import CLASSIFIER_VERSION
from pipeline.db import get_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
# Force INFO level even if basicConfig was a no-op (happens when hashlib fires first)
logging.getLogger().setLevel(logging.INFO)
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
            "industry_normalized, b2b_saas, ai_focus, ai_skills, first_seen_date, "
            "source_provider, visa_sponsorship_status, relocation_support_status, "
            "candidate_domain_requirement_normalized, candidate_domain_requirement_strength, years_experience_min"
        )
        .eq("is_active", True)
        .execute()
    )
    df = pd.DataFrame(resp.data)
    if not df.empty:
        df["first_seen_date"] = pd.to_datetime(df["first_seen_date"])
    return df


def _fetch_jobs_for_frontend() -> pd.DataFrame:
    """Fetch all jobs from the last 180 days for per-job frontend JSON export."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=180)).date().isoformat()
    resp = (
        get_client()
        .table("jobs")
        .select(
            "job_id, company_name, job_title_raw, canonical_url, "
            "is_berlin, is_remote_germany, "
            "work_mode, posting_language, german_requirement, "
            "seniority, pm_type, industry_normalized, "
            "ai_focus, ai_skills, first_seen_date, "
            "years_experience_min"
        )
        .gte("first_seen_date", cutoff)
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
        .table("job_experience_requirements")
        .select(
            "job_id, experience_tag, experience_family, required_level, "
            "evidence_text, confidence"
        )
        .in_("job_id", active_job_ids)
        .eq("classifier_version", CLASSIFIER_VERSION)
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

    # Industry (legacy — preserved for backward compatibility)
    ind_jobs = jobs[jobs["industry"].notna()]
    ind_counts = ind_jobs["industry"].value_counts()
    industry = [{"label": k, "count": int(v)} for k, v in ind_counts.items()]

    # Industry normalized (v3)
    ind_norm_jobs = jobs[jobs["industry_normalized"].notna()] if "industry_normalized" in jobs.columns else pd.DataFrame()
    ind_norm_counts = ind_norm_jobs["industry_normalized"].value_counts() if not ind_norm_jobs.empty else pd.Series(dtype=int)
    industry_normalized = [{"label": k, "count": int(v)} for k, v in ind_norm_counts.items()]

    # Visa sponsorship status
    visa_counts = jobs["visa_sponsorship_status"].fillna("unclear").value_counts() if "visa_sponsorship_status" in jobs.columns else pd.Series(dtype=int)
    visa_sponsorship = [{"label": k, "count": int(v)} for k, v in visa_counts.items()]

    # Relocation support status
    reloc_counts = jobs["relocation_support_status"].fillna("unclear").value_counts() if "relocation_support_status" in jobs.columns else pd.Series(dtype=int)
    relocation_support = [{"label": k, "count": int(v)} for k, v in reloc_counts.items()]

    # Candidate domain requirement strength
    domain_strength_col = "candidate_domain_requirement_strength"
    domain_strength_counts = (
        jobs[domain_strength_col].fillna("unclear").value_counts()
        if domain_strength_col in jobs.columns else pd.Series(dtype=int)
    )
    domain_req_strength = [{"label": k, "count": int(v)} for k, v in domain_strength_counts.items()]

    # Years experience summary
    years_experience: dict = {}
    if "years_experience_min" in jobs.columns:
        exp_jobs = jobs[jobs["years_experience_min"].notna()]
        if not exp_jobs.empty:
            yrs = exp_jobs["years_experience_min"].astype(float)
            years_experience = {
                "median": round(float(yrs.median()), 1),
                "buckets": [
                    {"label": "0-2", "count": int((yrs <= 2).sum())},
                    {"label": "3-5", "count": int(yrs.between(3, 5).sum())},
                    {"label": "6-8", "count": int(yrs.between(6, 8).sum())},
                    {"label": "9+",  "count": int((yrs >= 9).sum())},
                ],
                "n_extractable": int(len(exp_jobs)),
            }

    # Seniority × Years Experience bubble data
    seniority_experience_bubble: list = []
    if "years_experience_min" in jobs.columns:
        exp_sen = jobs[jobs["years_experience_min"].notna() & jobs["seniority"].notna()].copy()
        if not exp_sen.empty:
            grouped = (
                exp_sen
                .groupby(["seniority", "years_experience_min"])
                .size()
                .reset_index(name="count")
            )
            seniority_experience_bubble = [
                {
                    "seniority": str(row["seniority"]),
                    "years_min": float(row["years_experience_min"]),
                    "count": int(row["count"]),
                }
                for _, row in grouped.iterrows()
            ]

    # Industry × Years Experience bubble data
    industry_experience_bubble: list = []
    ind_norm_col = "industry_normalized"
    if "years_experience_min" in jobs.columns and ind_norm_col in jobs.columns:
        exp_ind = jobs[jobs["years_experience_min"].notna() & jobs[ind_norm_col].notna()].copy()
        if not exp_ind.empty:
            grouped_ind = (
                exp_ind
                .groupby([ind_norm_col, "years_experience_min"])
                .size()
                .reset_index(name="count")
            )
            industry_experience_bubble = [
                {
                    "industry": str(row[ind_norm_col]),
                    "years_min": float(row["years_experience_min"]),
                    "count": int(row["count"]),
                }
                for _, row in grouped_ind.iterrows()
            ]

    # Candidate domain requirement breakdown (domain × hard/soft)
    domain_req_breakdown: list = []
    dom_norm_col = "candidate_domain_requirement_normalized"
    dom_str_col = "candidate_domain_requirement_strength"
    if dom_norm_col in jobs.columns and dom_str_col in jobs.columns:
        dom_df = jobs[
            jobs[dom_norm_col].notna() &
            jobs[dom_str_col].isin(["hard", "soft"]) &
            (jobs[dom_norm_col] != "none")
        ].copy()
        if not dom_df.empty:
            pivot = (
                dom_df
                .groupby([dom_norm_col, dom_str_col])
                .size()
                .unstack(fill_value=0)
            )
            for col in ["hard", "soft"]:
                if col not in pivot.columns:
                    pivot[col] = 0
            pivot["total"] = pivot["hard"] + pivot["soft"]
            pivot = pivot.sort_values("total", ascending=False)
            domain_req_breakdown = [
                {
                    "domain": str(idx),
                    "hard": int(row.get("hard", 0)),
                    "soft": int(row.get("soft", 0)),
                    "total": int(row.get("total", 0)),
                }
                for idx, row in pivot.iterrows()
            ]

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
        "industry_normalized": industry_normalized,
        "visa_sponsorship": visa_sponsorship,
        "relocation_support": relocation_support,
        "domain_req_strength": domain_req_strength,
        "domain_req_breakdown": domain_req_breakdown,
        "seniority_experience_bubble": seniority_experience_bubble,
        "industry_experience_bubble": industry_experience_bubble,
        "years_experience": years_experience,
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

    # 1. Market Activity (Added, Removed, Active with churn)
    # Grouped by dimensions to support filtering
    if not snapshots.empty:
        # Prepare snapshots df
        df = snapshots.copy()
        df["date"] = df["snapshot_date"].dt.date
        run_dates = sorted(df["date"].unique())
        date_to_idx = {d: i for i, d in enumerate(run_dates)}

        # Active jobs per dimension per day
        # location normalization to match FilterBar (berlin | remote_germany | unclear)
        def get_loc(row):
            if row["is_berlin"]: return "berlin"
            if row["is_remote_germany"]: return "remote_germany"
            return "unclear"
        df["location"] = df.apply(get_loc, axis=1)
        
        active_grouped = df.groupby([
            "date", "seniority", "location", "posting_language", "german_requirement"
        ]).size().reset_index(name="active_jobs")

        # Prepare job metadata for attributes on added/removed dates
        job_meta = all_jobs.set_index("job_id")
        
        # Track job lifecycle for Added/Removed
        events = []
        job_groups = df.sort_values("date").groupby("job_id")
        for job_id, group in job_groups:
            dates = group["date"].tolist()
            sens = group["seniority"].tolist()
            locs = group["location"].tolist()
            langs = group["posting_language"].tolist()
            greqs = group["german_requirement"].tolist()
            
            # 1. Added: only if first_seen_date is within our range and matches the first day we saw it in snapshots
            if job_id in job_meta.index:
                actual_first_seen = job_meta.loc[job_id, "first_seen_date"].date()
                if actual_first_seen == dates[0]:
                    events.append({
                        "date": dates[0],
                        "seniority": sens[0],
                        "location": locs[0],
                        "language": langs[0],
                        "german_req": greqs[0],
                        "event": "added"
                    })
            
            # 2. Gaps between snapshots (historical removals)
            for i in range(len(dates) - 1):
                curr_date, next_date = dates[i], dates[i+1]
                curr_idx, next_idx = date_to_idx[curr_date], date_to_idx[next_date]
                if next_idx > curr_idx + 1:
                    # Removed on first run it was missing
                    events.append({
                        "date": run_dates[curr_idx + 1],
                        "seniority": sens[i],
                        "location": locs[i],
                        "language": langs[i],
                        "german_req": greqs[i],
                        "event": "removed"
                    })
            
            # 3. Final removal if not in latest run
            last_date, last_idx = dates[-1], date_to_idx[dates[-1]]
            if last_idx < len(run_dates) - 1:
                events.append({
                    "date": run_dates[last_idx + 1],
                    "seniority": sens[-1],
                    "location": locs[-1],
                    "language": langs[-1],
                    "german_req": greqs[-1],
                    "event": "removed"
                })

        events_df = pd.DataFrame(events)
        if not events_df.empty:
            added_grouped = events_df[events_df["event"] == "added"].groupby([
                "date", "seniority", "location", "language", "german_req"
            ]).size().reset_index(name="jobs_added")
            removed_grouped = events_df[events_df["event"] == "removed"].groupby([
                "date", "seniority", "location", "language", "german_req"
            ]).size().reset_index(name="jobs_removed")
        else:
            added_grouped = pd.DataFrame(columns=["date", "seniority", "location", "language", "german_req", "jobs_added"])
            removed_grouped = pd.DataFrame(columns=["date", "seniority", "location", "language", "german_req", "jobs_removed"])

        active_grouped = active_grouped.rename(columns={"posting_language": "language", "german_requirement": "german_req"})
        merged = pd.merge(active_grouped, added_grouped, on=["date", "seniority", "location", "language", "german_req"], how="outer")
        merged = pd.merge(merged, removed_grouped, on=["date", "seniority", "location", "language", "german_req"], how="outer")
        merged = merged.fillna(0)
        
        result["market_activity"] = [
            {
                "date": str(row["date"]),
                "seniority": str(row["seniority"]),
                "location": str(row["location"]),
                "language": str(row["language"]),
                "german_req": str(row["german_req"]),
                "active_jobs": int(row["active_jobs"]),
                "jobs_added": int(row["jobs_added"]),
                "jobs_removed": int(row["jobs_removed"])
            }
            for _, row in merged.iterrows()
        ]

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


def export_jobs(df: pd.DataFrame) -> None:
    """Export per-job records for the Breakdown tab frontend filter."""
    if df.empty:
        _write("jobs.json", [])
        return

    records = []
    for _, row in df.iterrows():
        records.append({
            "id": row["job_id"],
            "title": row.get("job_title_raw"),
            "company": row.get("company_name"),
            "url": row.get("canonical_url"),
            "location": (
                "berlin" if row.get("is_berlin")
                else "remote_germany" if row.get("is_remote_germany")
                else "unclear"
            ),
            "work_mode": row.get("work_mode") or "unknown",
            "seniority": row.get("seniority") or "unknown",
            "language": row.get("posting_language") or "unknown",
            "german_req": row.get("german_requirement") or "unclassified",
            "pm_type": row.get("pm_type"),
            "ai_focus": bool(row.get("ai_focus", False)),
            "ai_skills": bool(row.get("ai_skills", False)),
            "first_seen_date": (
                row["first_seen_date"].date().isoformat()
                if pd.notna(row.get("first_seen_date")) else None
            ),
            "industry": row.get("industry_normalized"),
            "years_experience_min": (
                int(row["years_experience_min"])
                if pd.notna(row.get("years_experience_min")) else None
            ),
        })
    _write("jobs.json", records)


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

    logger.info("Fetching jobs for frontend (last 180 days)…")
    frontend_jobs = _fetch_jobs_for_frontend()
    logger.info(f"Frontend jobs: {len(frontend_jobs)}")

    logger.info("Fetching snapshots…")
    snapshots = _fetch_snapshots()
    logger.info(f"Snapshot rows: {len(snapshots)}")

    export_metadata(last_run_date)
    export_overview(active_jobs, last_run_date)
    export_distributions(active_jobs)
    export_experience(active_jobs)
    export_jobs(frontend_jobs)
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
