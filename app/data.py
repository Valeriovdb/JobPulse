"""
Data access layer for the JobPulse Streamlit app.
Queries Supabase and returns DataFrames. All results cached for 1 hour.
"""
import os
import pandas as pd
import streamlit as st
from supabase import create_client, Client


@st.cache_resource
def _get_client() -> Client:
    """Singleton Supabase client. Reads from st.secrets then env."""
    try:
        url = st.secrets["SUPABASE_URL"]
        key = st.secrets["SUPABASE_KEY"]
    except (KeyError, FileNotFoundError):
        url = os.environ["SUPABASE_URL"]
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_KEY"]
    return create_client(url, key)


@st.cache_data(ttl=3600)
def get_active_jobs() -> pd.DataFrame:
    """All currently active jobs with key classification columns."""
    resp = (
        _get_client()
        .table("jobs")
        .select(
            "job_id, company_name, job_title_raw, seniority, location_normalized,"
            "is_berlin, is_remote_germany, work_mode, posting_language,"
            "german_requirement, pm_type, industry, b2b_saas, ai_focus, ai_skills,"
            "first_seen_date, last_seen_date, source_provider, canonical_url"
        )
        .eq("is_active", True)
        .execute()
    )
    df = pd.DataFrame(resp.data)
    if not df.empty:
        df["first_seen_date"] = pd.to_datetime(df["first_seen_date"])
        df["last_seen_date"] = pd.to_datetime(df["last_seen_date"])
    return df


@st.cache_data(ttl=3600)
def get_daily_snapshots() -> pd.DataFrame:
    """
    All daily snapshot rows for trend analysis.
    Each row = one job on one date.
    """
    resp = (
        _get_client()
        .table("job_daily_snapshots")
        .select(
            "snapshot_date, job_id, is_active, seniority, posting_language,"
            "german_requirement, is_berlin, is_remote_germany, work_mode, company_name"
        )
        .order("snapshot_date")
        .execute()
    )
    df = pd.DataFrame(resp.data)
    if not df.empty:
        df["snapshot_date"] = pd.to_datetime(df["snapshot_date"])
    return df


@st.cache_data(ttl=3600)
def get_all_jobs_lifetime() -> pd.DataFrame:
    """
    All jobs ever seen (active + inactive) with temporal fields.
    Used for lifespan and churn analysis.
    """
    resp = (
        _get_client()
        .table("jobs")
        .select(
            "job_id, company_name, job_title_raw, seniority, is_active,"
            "first_seen_date, last_seen_date, posting_language, german_requirement,"
            "is_berlin, is_remote_germany"
        )
        .execute()
    )
    df = pd.DataFrame(resp.data)
    if not df.empty:
        df["first_seen_date"] = pd.to_datetime(df["first_seen_date"])
        df["last_seen_date"] = pd.to_datetime(df["last_seen_date"])
        df["days_online"] = (df["last_seen_date"] - df["first_seen_date"]).dt.days + 1
    return df


@st.cache_data(ttl=3600)
def get_ingestion_runs() -> pd.DataFrame:
    """Recent ingestion runs for pipeline health display."""
    resp = (
        _get_client()
        .table("ingestion_runs")
        .select(
            "run_id, run_date, status, rows_fetched, rows_new, rows_updated,"
            "started_at, error_message"
        )
        .order("started_at", desc=True)
        .limit(60)
        .execute()
    )
    df = pd.DataFrame(resp.data)
    if not df.empty:
        df["run_date"] = pd.to_datetime(df["run_date"])
        df["started_at"] = pd.to_datetime(df["started_at"])
    return df
