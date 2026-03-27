"""
Data access layer for the JobPulse Streamlit app.
Reads from precomputed JSON files in data/frontend/.
All results cached for 1 hour.
"""
import json
from pathlib import Path

import pandas as pd
import streamlit as st

DATA_DIR = Path(__file__).parent.parent / "data" / "frontend"


def _read(name: str) -> dict | list:
    path = DATA_DIR / name
    if not path.exists():
        return {}
    return json.loads(path.read_text())


@st.cache_data(ttl=3600)
def get_active_jobs() -> pd.DataFrame:
    """
    Reconstruct a jobs-shaped DataFrame from precomputed overview +
    distributions JSON. Covers all fields used by the Streamlit pages.
    """
    overview = _read("overview.json")
    dist = _read("distributions.json")

    if not overview or not dist:
        return pd.DataFrame()

    rows = []
    today = pd.Timestamp("today").normalize()
    lang_map = {item["label"]: item["count"] for item in dist.get("language", [])}
    german_map = {item["label"]: item["count"] for item in dist.get("german_requirement", [])}
    seniority_map = {item["label"]: item["count"] for item in dist.get("seniority", [])}
    work_mode_map = {item["label"]: item["count"] for item in dist.get("work_mode", [])}
    source_map = {item["label"]: item["count"] for item in dist.get("source", [])}
    pm_type_map = {item["label"]: item["count"] for item in dist.get("pm_type", [])}
    industry_map = {item["label"]: item["count"] for item in dist.get("industry", [])}
    ai = dist.get("ai", {})

    loc = overview.get("location", {})
    lang_vals = overview.get("language", {})
    n_active = overview.get("n_active", 0)
    n_new_week = overview.get("n_new_week", 0)

    # Build synthetic rows so page-level aggregations produce the right totals.
    # Each "row" represents a block of identical jobs — value_counts() on any
    # column will reproduce the precomputed distribution.
    def _rows_for(field: str, value, count: int, **extra) -> list[dict]:
        return [dict({field: value, **extra}) for _ in range(count)]

    # Posting language + german_requirement combined
    for _ in range(lang_vals.get("en_none", 0)):
        rows.append({"posting_language": "en", "german_requirement": "not_mentioned",
                     "first_seen_date": today, "is_active": True})
    for _ in range(lang_vals.get("en_plus", 0)):
        rows.append({"posting_language": "en", "german_requirement": "plus",
                     "first_seen_date": today, "is_active": True})
    for _ in range(lang_vals.get("en_must", 0)):
        rows.append({"posting_language": "en", "german_requirement": "must",
                     "first_seen_date": today, "is_active": True})
    for _ in range(lang_vals.get("de", 0)):
        rows.append({"posting_language": "de", "german_requirement": "must",
                     "first_seen_date": today, "is_active": True})

    # Pad to n_active if language data doesn't cover everything
    while len(rows) < n_active:
        rows.append({"posting_language": "en", "german_requirement": "not_mentioned",
                     "first_seen_date": today, "is_active": True})

    df = pd.DataFrame(rows[:n_active])

    # Attach seniority column
    sen_values: list[str] = []
    for item in dist.get("seniority", []):
        sen_values.extend([item["label"]] * item["count"])
    sen_values.extend(["unknown"] * max(0, n_active - len(sen_values)))
    df["seniority"] = sen_values[:n_active]

    # Attach work_mode column
    wm_values: list[str] = []
    for item in dist.get("work_mode", []):
        wm_values.extend([item["label"]] * item["count"])
    wm_values.extend([None] * max(0, n_active - len(wm_values)))
    df["work_mode"] = wm_values[:n_active]

    # Attach source_provider column
    sp_values: list[str] = []
    for item in dist.get("source", []):
        sp_values.extend([item["label"]] * item["count"])
    sp_values.extend([None] * max(0, n_active - len(sp_values)))
    df["source_provider"] = sp_values[:n_active]

    # Attach pm_type column (only enriched rows get a value)
    n_enriched = ai.get("n_enriched", 0)
    pt_values: list = []
    for item in dist.get("pm_type", []):
        pt_values.extend([item["label"]] * item["count"])
    pt_values.extend([None] * max(0, n_active - len(pt_values)))
    df["pm_type"] = pt_values[:n_active]

    # Attach industry column
    ind_values: list = []
    for item in dist.get("industry", []):
        ind_values.extend([item["label"]] * item["count"])
    ind_values.extend([None] * max(0, n_active - len(ind_values)))
    df["industry"] = ind_values[:n_active]

    # Attach ai_focus / ai_skills
    n_ai_focus = ai.get("n_ai_focus", 0)
    n_ai_skills = ai.get("n_ai_skills", 0)
    ai_focus_vals = [True] * n_ai_focus + [False] * max(0, n_active - n_ai_focus)
    ai_skills_vals = [True] * n_ai_skills + [False] * max(0, n_active - n_ai_skills)
    df["ai_focus"] = ai_focus_vals[:n_active]
    df["ai_skills"] = ai_skills_vals[:n_active]

    # Attach location columns
    n_berlin = loc.get("berlin", 0)
    n_remote = loc.get("remote_germany", 0)
    is_berlin_vals = [True] * n_berlin + [False] * max(0, n_active - n_berlin)
    is_remote_vals = ([False] * n_berlin
                      + [True] * n_remote
                      + [False] * max(0, n_active - n_berlin - n_remote))
    df["is_berlin"] = is_berlin_vals[:n_active]
    df["is_remote_germany"] = is_remote_vals[:n_active]

    # Mark n_new_week rows as seen this week
    week_ago = today - pd.Timedelta(days=6)
    df.loc[df.index[:n_new_week], "first_seen_date"] = week_ago

    # Stub columns that pages reference but aren't needed for aggregation
    df["job_id"] = [f"synthetic_{i}" for i in range(n_active)]
    df["company_name"] = None
    df["job_title_raw"] = None
    df["last_seen_date"] = today
    df["canonical_url"] = None
    df["location_normalized"] = None

    # Attach company_name from distributions top-20 (expands to actual count)
    companies_data = dist.get("companies", {})
    top20 = companies_data.get("top20", [])
    company_names: list = []
    for item in top20:
        company_names.extend([item["label"]] * item["count"])
    company_names.extend(["Other"] * max(0, n_active - len(company_names)))
    df["company_name"] = company_names[:n_active]

    return df


@st.cache_data(ttl=3600)
def get_daily_snapshots() -> pd.DataFrame:
    ts = _read("timeseries.json")
    if not ts:
        return pd.DataFrame()

    rows = []

    seniority_mix = ts.get("seniority_mix", {})
    if seniority_mix:
        dates = seniority_mix["dates"]
        for col, values in seniority_mix["series"].items():
            for d, count in zip(dates, values):
                for _ in range(count):
                    rows.append({
                        "snapshot_date": pd.Timestamp(d),
                        "job_id": None,
                        "is_active": True,
                        "seniority": col,
                        "posting_language": None,
                        "german_requirement": None,
                        "is_berlin": None,
                        "is_remote_germany": None,
                        "work_mode": None,
                    })

    german_mix = ts.get("german_req_mix", {})
    if german_mix and not rows:
        dates = german_mix["dates"]
        for col, values in german_mix["series"].items():
            for d, count in zip(dates, values):
                for _ in range(count):
                    rows.append({
                        "snapshot_date": pd.Timestamp(d),
                        "job_id": None,
                        "is_active": True,
                        "german_requirement": col,
                        "seniority": None,
                        "posting_language": None,
                        "is_berlin": None,
                        "is_remote_germany": None,
                        "work_mode": None,
                    })

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)

    # Overlay german_requirement from german_req_mix onto existing rows
    if seniority_mix and german_mix:
        dates = german_mix["dates"]
        german_rows = []
        for col, values in german_mix["series"].items():
            for d, count in zip(dates, values):
                for _ in range(count):
                    german_rows.append({
                        "snapshot_date": pd.Timestamp(d),
                        "job_id": None,
                        "is_active": True,
                        "german_requirement": col,
                        "seniority": None,
                        "posting_language": None,
                        "is_berlin": None,
                        "is_remote_germany": None,
                        "work_mode": None,
                    })
        df = pd.concat([df, pd.DataFrame(german_rows)], ignore_index=True)

    return df


@st.cache_data(ttl=3600)
def get_all_jobs_lifetime() -> pd.DataFrame:
    ts = _read("timeseries.json")
    if not ts:
        return pd.DataFrame()

    rows = []
    today = pd.Timestamp("today").normalize()

    new_per_day = ts.get("new_per_day", [])
    for entry in new_per_day:
        d = pd.Timestamp(entry["date"])
        for i in range(entry["count"]):
            rows.append({
                "job_id": f"{entry['date']}_{i}",
                "is_active": True,
                "first_seen_date": d,
                "last_seen_date": today,
                "days_online": (today - d).days + 1,
                "seniority": None,
                "posting_language": None,
                "german_requirement": None,
                "is_berlin": None,
                "is_remote_germany": None,
            })

    # Add inactive jobs using lifespan data if available
    lifespan = ts.get("lifespan", {})
    n_inactive = lifespan.get("n_inactive", 0)
    median_d = lifespan.get("median_days", 14)
    if n_inactive > 0:
        for i in range(n_inactive):
            last_seen = today - pd.Timedelta(days=median_d + (i % 7))
            first_seen = last_seen - pd.Timedelta(days=median_d)
            rows.append({
                "job_id": f"inactive_{i}",
                "is_active": False,
                "first_seen_date": first_seen,
                "last_seen_date": last_seen,
                "days_online": median_d,
                "seniority": None,
                "posting_language": None,
                "german_requirement": None,
                "is_berlin": None,
                "is_remote_germany": None,
            })

    if not rows:
        return pd.DataFrame()

    return pd.DataFrame(rows)


@st.cache_data(ttl=3600)
def get_ingestion_runs() -> pd.DataFrame:
    meta = _read("metadata.json")
    if not meta:
        return pd.DataFrame()
    return pd.DataFrame([{
        "run_date": pd.Timestamp(meta["last_updated"]),
        "status": "completed",
    }])
