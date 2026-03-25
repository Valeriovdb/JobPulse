"""
JobPulse — Trends
How the Berlin + remote Germany PM market moves over time.
The senior layer. Gains precision as daily data accumulates.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from datetime import date

from data import get_daily_snapshots, get_all_jobs_lifetime
from styles import (
    inject_css, hero_band, insight, section_label,
    data_gap_notice, chart_cfg,
    INK, MID, MUTED, BORDER,
    SENIORITY_ORDER, SENIORITY_COLORS, GERMAN_COLORS, GERMAN_LABELS,
)

st.set_page_config(
    page_title="Trends — JobPulse",
    page_icon="◾",
    layout="wide",
    initial_sidebar_state="expanded",
)
inject_css()

with st.sidebar:
    st.markdown(
        '<div style="font-size:0.875rem;font-weight:700;color:#0A0A0A;">JobPulse</div>'
        '<div style="font-size:0.72rem;color:#9CA3AF;line-height:1.4;margin-top:0.25rem;">'
        'Berlin PM<br>market intelligence</div>',
        unsafe_allow_html=True,
    )

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------
snapshots = get_daily_snapshots()
all_jobs  = get_all_jobs_lifetime()

n_days   = snapshots["snapshot_date"].nunique() if not snapshots.empty else 0
n_total  = all_jobs["job_id"].nunique() if not all_jobs.empty else 0
inactive = all_jobs[~all_jobs["is_active"]] if not all_jobs.empty else pd.DataFrame()

NEED_LIFESPAN = 14
NEED_TRENDS   = 21

# ---------------------------------------------------------------------------
# Hero
# ---------------------------------------------------------------------------
hero_band(
    headline="Trend intelligence. This is the senior layer.",
    subline=(
        f"Tracking {n_days} day{'s' if n_days != 1 else ''} of data across {n_total} distinct roles. "
        f"Lifespan analysis unlocks at {NEED_LIFESPAN} days. "
        f"Mix trends unlock at {NEED_TRENDS} days. "
        "Each daily run makes every signal sharper."
    ),
)

# ---------------------------------------------------------------------------
# Section 1: Volume over time
# ---------------------------------------------------------------------------
section_label("Market volume")

if all_jobs.empty or all_jobs["first_seen_date"].isna().all():
    data_gap_notice("No data available yet.")
else:
    new_per_day = (
        all_jobs
        .groupby(all_jobs["first_seen_date"].dt.normalize())["job_id"]
        .count()
        .reset_index()
        .rename(columns={"first_seen_date": "dt", "job_id": "new_roles"})
        .sort_values("dt")
    )

    if len(new_per_day) < 2:
        data_gap_notice(
            f"New roles per day chart needs at least 2 days of observations. "
            f"Currently at {n_days}."
        )
    else:
        insight(
            f"{n_total} distinct roles tracked across {n_days} day{'s' if n_days != 1 else ''}. "
            "Watch for daily rhythm and weekly patterns as the series grows."
        )

        fig = go.Figure()
        fig.add_bar(
            x=new_per_day["dt"], y=new_per_day["new_roles"],
            marker_color="#E2E8F0", name="New roles",
        )

        if len(new_per_day) >= 7:
            new_per_day["roll7"] = new_per_day["new_roles"].rolling(7, min_periods=3).mean()
            fig.add_scatter(
                x=new_per_day["dt"], y=new_per_day["roll7"],
                mode="lines", line=dict(color=INK, width=2),
                name="7-day avg",
            )

        fig.update_layout(
            **chart_cfg(height=260),
            bargap=0.3,
            legend=dict(orientation="h", y=1.08, x=0, font=dict(size=10)),
            xaxis_title="", yaxis_title="New roles per day",
        )
        st.plotly_chart(fig, use_container_width=True)

    # Active roles over time
    if n_days >= 2:
        section_label("Active roles over time")
        daily_active = (
            snapshots[snapshots["is_active"]]
            .groupby("snapshot_date")["job_id"]
            .nunique()
            .reset_index()
            .rename(columns={"job_id": "active"})
        )
        fig = go.Figure()
        fig.add_scatter(
            x=daily_active["snapshot_date"], y=daily_active["active"],
            mode="lines+markers",
            line=dict(color=INK, width=2),
            marker=dict(color=INK, size=4),
            name="Active roles",
        )
        fig.update_layout(
            **chart_cfg(height=220),
            xaxis_title="", yaxis_title="Active roles",
        )
        st.plotly_chart(fig, use_container_width=True)

st.divider()

# ---------------------------------------------------------------------------
# Section 2: Freshness / job lifespan
# ---------------------------------------------------------------------------
section_label("Role freshness")

if len(inactive) < 10:
    data_gap_notice(
        f"Job lifespan analysis requires at least 10 inactive roles. "
        f"Currently tracking {len(inactive)}. "
        f"This section populates as roles cycle off the market over time."
    )
else:
    median_d = inactive["days_online"].median()
    mean_d   = inactive["days_online"].mean()
    pct_week = (inactive["days_online"] <= 7).mean() * 100

    insight(
        f"Median role lifespan is {median_d:.0f} days. "
        f"{pct_week:.0f}% of postings disappear within a week of appearing."
    )

    col1, col2, col3 = st.columns(3)
    for col, val, lbl in [
        (col1, f"{median_d:.0f}d", "Median lifespan"),
        (col2, f"{mean_d:.1f}d",   "Mean lifespan"),
        (col3, f"{pct_week:.0f}%", "Gone ≤7 days"),
    ]:
        col.markdown(
            f'<div style="font-size:1.75rem;font-weight:700;color:#0A0A0A;'
            f'letter-spacing:-0.02em;">{val}</div>'
            f'<div style="font-size:0.6rem;font-weight:600;letter-spacing:0.12em;'
            f'text-transform:uppercase;color:#9CA3AF;margin-top:0.35rem;">{lbl}</div>',
            unsafe_allow_html=True,
        )

    st.markdown("<div style='margin-top:1.25rem;'></div>", unsafe_allow_html=True)

    fig = px.histogram(
        inactive, x="days_online", nbins=25,
        color_discrete_sequence=["#E2E8F0"],
    )
    fig.update_layout(
        **chart_cfg(height=220),
        bargap=0.1, xaxis_title="Days online", yaxis_title="",
    )
    fig.update_yaxes(showgrid=False, showticklabels=False)
    st.plotly_chart(fig, use_container_width=True)

st.divider()

# ---------------------------------------------------------------------------
# Section 3: Seniority mix trend
# ---------------------------------------------------------------------------
section_label("Seniority mix over time")

if n_days < NEED_TRENDS:
    data_gap_notice(
        f"Seniority mix trend unlocks at {NEED_TRENDS} days of observations. "
        f"Currently at {n_days}. "
        "Check back as the series grows."
    )
else:
    insight(
        "A shift in seniority share is a leading signal of market expansion or contraction. "
        "Watch for junior share rising (growth mode) or lead+ share rising (specialisation)."
    )

    trend = (
        snapshots[snapshots["is_active"]]
        .groupby(["snapshot_date", "seniority"])["job_id"]
        .nunique().reset_index()
        .rename(columns={"job_id": "count"})
    )
    trend["seniority"] = trend["seniority"].fillna("unknown")

    fig = px.area(
        trend, x="snapshot_date", y="count", color="seniority",
        color_discrete_map=SENIORITY_COLORS,
        groupnorm="percent",
        category_orders={"seniority": SENIORITY_ORDER},
    )
    fig.update_layout(
        **chart_cfg(height=300),
        xaxis_title="", yaxis_title="Share of active roles (%)",
        legend=dict(orientation="h", y=-0.2, font=dict(size=10)),
    )
    st.plotly_chart(fig, use_container_width=True)

st.divider()

# ---------------------------------------------------------------------------
# Section 4: German requirement trend
# ---------------------------------------------------------------------------
section_label("German requirement over time")

if n_days < NEED_TRENDS:
    data_gap_notice(
        f"Language requirement trend unlocks at {NEED_TRENDS} days. "
        f"Currently at {n_days}."
    )
else:
    insight(
        "Is the market opening up or tightening? "
        "A rising 'not mentioned' share signals more accessible roles. "
        "A rising 'required' share signals a tightening market."
    )

    german_trend = (
        snapshots[snapshots["is_active"] & snapshots["german_requirement"].notna()]
        .groupby(["snapshot_date", "german_requirement"])["job_id"]
        .nunique().reset_index()
        .rename(columns={"job_id": "count"})
    )
    german_trend["label"] = german_trend["german_requirement"].map(GERMAN_LABELS).fillna("Unknown")

    fig = px.area(
        german_trend, x="snapshot_date", y="count", color="label",
        color_discrete_map={v: GERMAN_COLORS.get(k, "#9CA3AF") for k, v in GERMAN_LABELS.items()},
        groupnorm="percent",
    )
    fig.update_layout(
        **chart_cfg(height=300),
        xaxis_title="", yaxis_title="Share of classified roles (%)",
        legend=dict(orientation="h", y=-0.2, font=dict(size=10)),
    )
    st.plotly_chart(fig, use_container_width=True)

st.divider()
st.caption(
    f"Tracking {n_days} day{'s' if n_days != 1 else ''} of data. "
    "All signals: Berlin + remote Germany PM roles only."
)
