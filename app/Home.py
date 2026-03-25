"""
JobPulse — Overview
Current market snapshot for Berlin and remote Germany PM roles.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
import plotly.express as px
import streamlit as st
from datetime import date, timedelta

from data import get_active_jobs, get_ingestion_runs
from styles import (
    inject_css, insight, section_label,
    stat_grid, comparison_bars, chart_cfg, AXIS_STYLE,
    INK, INK2, MUTED, SUB, BORDER,
)

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="JobPulse — Berlin PM Intelligence",
    page_icon="◾",
    layout="wide",
    initial_sidebar_state="expanded",
)
inject_css()

# ---------------------------------------------------------------------------
# Sidebar brand
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown(
        '<div style="padding:0 0 1.5rem 0;border-bottom:1px solid #EFEFEF;margin-bottom:0.5rem;">'
        '<div style="font-size:1rem;font-weight:700;color:#0A0A0A;letter-spacing:-0.02em;line-height:1.2;">JobPulse</div>'
        '<div style="font-size:0.7rem;color:#9CA3AF;margin-top:0.2rem;line-height:1.4;">Berlin PM market intelligence</div>'
        '</div>',
        unsafe_allow_html=True,
    )

# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------
jobs = get_active_jobs()
runs = get_ingestion_runs()

if jobs.empty:
    st.info("No active jobs in the database yet. Run the ingestion pipeline to populate data.")
    st.stop()

today    = date.today()
week_ago = today - timedelta(days=7)
n_active = len(jobs)

# Derived metrics
n_new_week     = int(jobs[jobs["first_seen_date"].dt.date >= week_ago].shape[0])
en_jobs        = jobs[jobs["posting_language"].str.lower().eq("en")]
en_none        = en_jobs[en_jobs["german_requirement"] == "not_mentioned"]
en_plus        = en_jobs[en_jobs["german_requirement"] == "plus"]
en_must        = en_jobs[en_jobs["german_requirement"] == "must"]
de_jobs        = jobs[jobs["posting_language"].str.lower().eq("de")]
accessible_pct = round(len(en_none) / n_active * 100) if n_active else 0
median_age     = int((pd.Timestamp(today) - jobs["first_seen_date"]).dt.days.median()) if n_active else 0

senior_levels  = {"senior", "lead", "staff", "principal", "head"}
n_senior_plus  = jobs["seniority"].isin(senior_levels).sum()
senior_pct     = round(n_senior_plus / n_active * 100) if n_active else 0
last_run       = runs.iloc[0]["run_date"].strftime("%-d %b %Y") if not runs.empty else "—"

en_none_pct = round(len(en_none) / n_active * 100) if n_active else 0
en_plus_pct = round(len(en_plus) / n_active * 100) if n_active else 0
en_must_pct = round(len(en_must) / n_active * 100) if n_active else 0
de_pct      = round(len(de_jobs) / n_active * 100) if n_active else 0

# ---------------------------------------------------------------------------
# Hero — editorial headline + metadata row
# ---------------------------------------------------------------------------
st.markdown(
    f'<div style="padding:2.5rem 0 1.5rem 0;">'
    f'<div style="font-size:0.58rem;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#9CA3AF;margin-bottom:1.25rem;">BERLIN · PM MARKET</div>'
    f'<div style="font-size:2.75rem;font-weight:800;color:#0A0A0A;line-height:1.15;letter-spacing:-0.04em;max-width:560px;">{n_active} PM roles active in Berlin and remote Germany.</div>'
    f'<div style="font-size:0.9rem;color:#6B7280;margin-top:1rem;line-height:1.7;max-width:520px;">The market skews heavily senior. Only {accessible_pct}% of roles are in English with no German requirement — that\'s your real competition pool.</div>'
    f'<div style="display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap;margin-top:1.25rem;">'
    f'<span style="font-size:0.72rem;color:#9CA3AF;"><span style="color:#374151;font-weight:500;">Scope</span>&nbsp; Berlin + remote Germany</span>'
    f'<span style="color:#D1D5DB;font-size:0.72rem;">·</span>'
    f'<span style="font-size:0.72rem;color:#9CA3AF;"><span style="color:#374151;font-weight:500;">Roles</span>&nbsp; Product Management</span>'
    f'<span style="color:#D1D5DB;font-size:0.72rem;">·</span>'
    f'<span style="font-size:0.72rem;color:#9CA3AF;"><span style="color:#374151;font-weight:500;">Updated</span>&nbsp; {last_run}</span>'
    f'<span style="color:#D1D5DB;font-size:0.72rem;">·</span>'
    f'<span style="font-size:0.72rem;color:#9CA3AF;"><span style="color:#374151;font-weight:500;">Refresh</span>&nbsp; daily</span>'
    f'</div>'
    f'</div>',
    unsafe_allow_html=True,
)

st.divider()

# ---------------------------------------------------------------------------
# KPI strip — renamed for accuracy
# ---------------------------------------------------------------------------
section_label("At a glance")
stat_grid([
    {"value": n_active,         "label": "Active roles",           "sub": "Berlin + remote DE"},
    {"value": n_new_week,       "label": "First seen this week",   "sub": "entered tracker ≤7 days ago"},
    {"value": f"{senior_pct}%", "label": "Senior or above",       "sub": "of classified roles"},
    {"value": f"{median_age}d", "label": "Median age in tracker",  "sub": "days since first observed"},
])
st.markdown(
    '<p style="font-size:0.72rem;color:#9CA3AF;margin:-0.5rem 0 1.5rem;line-height:1.5;">'
    'Age and freshness metrics reflect first observation in our tracker, not original employer publication date.</p>',
    unsafe_allow_html=True,
)

st.divider()

# ---------------------------------------------------------------------------
# Featured insight: Accessible market
# ---------------------------------------------------------------------------
def _lang_col(dot_color: str, label: str, count: int, pct: int, right_border: bool = True) -> str:
    b = "border-right:1px solid #EBEBEB;" if right_border else ""
    return (
        f'<div style="flex:1;padding:0 1.5rem;{b}">'
        f'<div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem;">'
        f'<div style="width:7px;height:7px;border-radius:50%;background:{dot_color};flex-shrink:0;"></div>'
        f'<span style="font-size:0.72rem;color:#6B7280;font-weight:500;">{label}</span>'
        f'</div>'
        f'<div>'
        f'<span style="font-size:1.75rem;font-weight:700;color:#0A0A0A;letter-spacing:-0.02em;">{count}</span>'
        f'<span style="font-size:0.78rem;color:#9CA3AF;margin-left:0.35rem;">{pct}%</span>'
        f'</div>'
        f'</div>'
    )

breakdown = (
    f'<div style="display:flex;margin:0 -1.5rem;border-top:1px solid #EBEBEB;padding-top:1.25rem;">'
    + _lang_col("#059669", "EN · No German required",  len(en_none), en_none_pct)
    + _lang_col("#D97706", "EN · German a plus",        len(en_plus), en_plus_pct)
    + _lang_col("#DC2626", "EN · German required",      len(en_must), en_must_pct)
    + _lang_col("#9CA3AF", "German-language post",       len(de_jobs), de_pct, right_border=False)
    + '</div>'
)

st.markdown(
    f'<div style="background:#FAFAFA;border:1px solid #E5E7EB;border-radius:12px;'
    f'padding:2rem 2rem 1.75rem;margin:0.5rem 0 2.5rem;">'
    f'<div style="font-size:0.58rem;font-weight:600;letter-spacing:0.15em;'
    f'text-transform:uppercase;color:#9CA3AF;margin-bottom:1rem;">ACCESSIBLE MARKET</div>'
    f'<div style="display:flex;align-items:baseline;gap:0.75rem;margin-bottom:0.5rem;">'
    f'<span style="font-size:3.25rem;font-weight:800;color:#059669;letter-spacing:-0.04em;line-height:1;">{accessible_pct}%</span>'
    f'<span style="font-size:1rem;color:#374151;font-weight:500;line-height:1.3;">of roles are English-friendly —<br>no German required</span>'
    f'</div>'
    f'<div style="font-size:0.875rem;color:#6B7280;margin-bottom:0.75rem;">That is the share with no German requirement.</div>'
    f'<div style="font-size:0.875rem;color:#374151;font-weight:500;line-height:1.6;'
    f'padding:0.75rem 0;border-top:1px solid #F0F0F0;border-bottom:1px solid #F0F0F0;'
    f'margin-bottom:1.5rem;">'
    f'Your reachable competition pool is much smaller than the full market size suggests.'
    f'</div>'
    f'{breakdown}'
    f'</div>',
    unsafe_allow_html=True,
)

# ---------------------------------------------------------------------------
# Market shape — 2-column: seniority + location
# ---------------------------------------------------------------------------
LEADERSHIP_LEVELS = {"lead", "staff", "principal", "head"}

sen_raw    = jobs["seniority"].fillna("unknown")
sen_mapped = sen_raw.apply(lambda x: "leadership" if x in LEADERSHIP_LEVELS else x)

n_junior     = int((sen_mapped == "junior").sum())
n_mid        = int((sen_mapped == "mid").sum())
n_leadership = int((sen_mapped == "leadership").sum())
n_unknown    = int((sen_mapped == "unknown").sum())
entry_pct    = round((n_junior + n_mid) / n_active * 100) if n_active else 0

SIMPLIFIED_ORDER = ["junior", "mid", "senior", "leadership"]
SIMPLIFIED_COLORS = {
    "junior":     "#DBEAFE",
    "mid":        "#93C5FD",
    "senior":     "#3B82F6",
    "leadership": "#1D4ED8",
}

sen_counts = sen_mapped.value_counts()
sen_df = pd.DataFrame({
    "seniority": SIMPLIFIED_ORDER,
    "count":     [int(sen_counts.get(k, 0)) for k in SIMPLIFIED_ORDER],
})
sen_df = sen_df[sen_df["count"] > 0]

n_berlin  = int(jobs["is_berlin"].fillna(False).sum())
n_remote  = int(jobs["is_remote_germany"].fillna(False).sum())
n_unclear = max(n_active - n_berlin - n_remote, 0)

col_sen, col_loc = st.columns(2)

with col_sen:
    section_label("Seniority mix")
    insight(
        f"Skews senior. {senior_pct}% of roles are senior level or above. "
        f"Junior and mid together represent just {entry_pct}%."
    )
    fig = px.bar(
        sen_df, y="seniority", x="count", orientation="h",
        color="seniority", color_discrete_map=SIMPLIFIED_COLORS,
        text="count",
    )
    fig.update_traces(textposition="outside", textfont_size=11)
    fig.update_layout(
        **chart_cfg(height=200),
        showlegend=False,
        yaxis_title="", xaxis_title="",
        margin=dict(t=4, b=4, l=0, r=50),
    )
    fig.update_yaxes(
        **AXIS_STYLE,
        categoryorder="array",
        categoryarray=list(reversed(sen_df["seniority"].tolist())),
        tickfont=dict(color="#374151", size=11),
    )
    fig.update_xaxes(**AXIS_STYLE, showgrid=False, showticklabels=False)
    st.plotly_chart(fig, use_container_width=True)
    if n_unknown > 0:
        st.markdown(
            f'<p style="font-size:0.72rem;color:#9CA3AF;margin-top:-0.5rem;line-height:1.5;">'
            f'{n_unknown} role{"s" if n_unknown != 1 else ""} could not be confidently classified.</p>',
            unsafe_allow_html=True,
        )

with col_loc:
    section_label("Location clarity")
    insight(
        "Most roles are explicitly Berlin-based. "
        "Fully remote Germany is rare, while nearly half of postings remain location-ambiguous."
    )
    comparison_bars([
        {"label": "Explicit Berlin",         "count": n_berlin,  "color": INK},
        {"label": "Explicit remote Germany", "count": n_remote,  "color": "#2563EB"},
        {"label": "Unclear / unspecified",   "count": n_unclear, "color": "#D1D5DB"},
    ], total=n_active)
    st.markdown(
        '<p style="font-size:0.72rem;color:#9CA3AF;margin-top:-0.5rem;line-height:1.5;">'
        'Unspecified includes postings with ambiguous or mixed location signals. '
        'Broad search behaviour may surface these roles.</p>',
        unsafe_allow_html=True,
    )

st.divider()

# ---------------------------------------------------------------------------
# What this means for your search
# ---------------------------------------------------------------------------
section_label("What this means for your search")
recommendations = [
    f"Prioritise senior roles if you qualify — junior and mid openings represent just {entry_pct}% of the market.",
    f"Treat English-only roles as a constrained niche ({accessible_pct}% of the market), not the default pool.",
    "Do not over-index on remote Germany as a standalone search category — it is rare and unlikely to expand your options significantly.",
    "Review postings beyond strict location filters; nearly half carry ambiguous location signals that broad searches can surface.",
]
st.markdown(
    '<div style="margin:0.75rem 0 2rem;">'
    + "".join(
        f'<div style="display:flex;gap:0.875rem;align-items:flex-start;'
        f'padding:0.75rem 0;border-bottom:1px solid #F3F4F6;">'
        f'<div style="width:5px;height:5px;border-radius:50%;background:#0A0A0A;'
        f'flex-shrink:0;margin-top:0.5rem;"></div>'
        f'<div style="font-size:0.875rem;color:#374151;line-height:1.6;">{rec}</div>'
        f'</div>'
        for rec in recommendations
    )
    + '</div>',
    unsafe_allow_html=True,
)
