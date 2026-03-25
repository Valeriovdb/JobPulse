"""
JobPulse — Opportunity Signals
Where the accessible market is. What you're actually competing for.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import plotly.express as px
import streamlit as st

from data import get_active_jobs
from styles import (
    inject_css, hero_band, insight, section_label,
    stat_grid, comparison_bars, data_gap_notice, chart_cfg, AXIS_STYLE,
    INK, MID, MUTED, BORDER, GERMAN_COLORS, GERMAN_LABELS,
    SENIORITY_ORDER,
)

st.set_page_config(
    page_title="Opportunity Signals — JobPulse",
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
jobs = get_active_jobs()

if jobs.empty:
    st.info("No data available yet.")
    st.stop()

n_active      = len(jobs)
en_jobs       = jobs[jobs["posting_language"].str.lower().eq("en")]
en_none       = en_jobs[en_jobs["german_requirement"] == "not_mentioned"]
en_plus       = en_jobs[en_jobs["german_requirement"] == "plus"]
en_must       = en_jobs[en_jobs["german_requirement"] == "must"]
de_jobs       = jobs[jobs["posting_language"].str.lower().eq("de")]

accessible_pct = round(len(en_none) / n_active * 100) if n_active else 0
en_pct         = round(len(en_jobs) / n_active * 100) if n_active else 0

# ---------------------------------------------------------------------------
# Hero
# ---------------------------------------------------------------------------
hero_band(
    headline=f"The fully accessible market is {accessible_pct}% of active roles.",
    subline=(
        f"Only {len(en_none)} of {n_active} active roles are in English with no German requirement. "
        f"That is your real competition pool — not all {n_active} postings."
    ),
)

# ---------------------------------------------------------------------------
# Section 1: English-only market
# ---------------------------------------------------------------------------
section_label("The accessible market")

insight(
    f"{len(en_none)} roles require no German. "
    f"Another {len(en_plus)} list it as a plus. "
    f"{len(en_must)} English-language postings still require German fluency."
)

stat_grid([
    {"value": len(en_none), "label": "EN · no German req.",   "sub": f"{accessible_pct}% of market"},
    {"value": len(en_plus), "label": "EN · German a plus",    "sub": "broadens reach"},
    {"value": len(en_must), "label": "EN · German required",  "sub": "closed to non-speakers"},
    {"value": len(de_jobs), "label": "German-language posts", "sub": "DE posting required"},
])

comparison_bars([
    {"label": "EN · no German req.",  "count": len(en_none), "color": "#059669"},
    {"label": "EN · German a plus",   "count": len(en_plus), "color": "#D97706"},
    {"label": "EN · German required", "count": len(en_must), "color": "#DC2626"},
    {"label": "German-language post", "count": len(de_jobs), "color": "#6B7280"},
], total=n_active)

st.divider()

# ---------------------------------------------------------------------------
# Section 2: Company concentration
# ---------------------------------------------------------------------------
section_label("Who's hiring")

company_counts = (
    jobs["company_name"].dropna()
    .value_counts().reset_index()
)
company_counts.columns = ["company", "openings"]

n_companies    = len(company_counts)
top10_share    = company_counts.head(10)["openings"].sum()
top10_pct      = round(top10_share / n_active * 100)
multi_hiring   = (company_counts["openings"] >= 2).sum()

insight(
    f"{n_companies} companies hold {n_active} active roles. "
    f"The top 10 account for {top10_pct}% of all postings. "
    f"{multi_hiring} companies are running multiple searches simultaneously."
)

top20 = company_counts.head(20).sort_values("openings")
fig = px.bar(
    top20, y="company", x="openings", orientation="h",
    text="openings",
    color_discrete_sequence=[INK],
)
fig.update_traces(textposition="outside", textfont_size=10)
fig.update_layout(
    **chart_cfg(height=max(280, len(top20) * 26)),
    showlegend=False,
    yaxis_title="", xaxis_title="",
    margin=dict(t=8, b=8, l=0, r=40),
)
fig.update_yaxes(**AXIS_STYLE, gridcolor="rgba(0,0,0,0)", tickfont=dict(color="#374151", size=10))
fig.update_xaxes(**AXIS_STYLE, showgrid=False, showticklabels=False)
st.plotly_chart(fig, use_container_width=True)

st.divider()

# ---------------------------------------------------------------------------
# Section 3: Seniority gap — where is the opening?
# ---------------------------------------------------------------------------
section_label("Seniority gap")

n_junior   = jobs["seniority"].eq("junior").sum()
n_mid      = jobs["seniority"].eq("mid").sum()
n_senior   = jobs["seniority"].eq("senior").sum()
n_lead_up  = jobs["seniority"].isin(["lead", "staff", "principal", "head"]).sum()
n_unknown  = jobs["seniority"].isna().sum() + (jobs["seniority"] == "unknown").sum()
entry_pct  = round((n_junior + n_mid) / n_active * 100) if n_active else 0

insight(
    f"Junior and mid together represent only {entry_pct}% of the market. "
    "The volume is at senior. Lead and above is where supply thins out."
)

comparison_bars([
    {"label": "Junior",               "count": int(n_junior),  "color": "#BFDBFE"},
    {"label": "Mid",                  "count": int(n_mid),     "color": "#60A5FA"},
    {"label": "Senior",               "count": int(n_senior),  "color": "#2563EB"},
    {"label": "Lead / Staff / above", "count": int(n_lead_up), "color": INK},
    {"label": "Unclassified",         "count": int(n_unknown), "color": "#E5E7EB"},
], total=n_active)

st.divider()

# ---------------------------------------------------------------------------
# Section 4: Source coverage
# ---------------------------------------------------------------------------
section_label("Source coverage")

n_jsearch   = jobs[jobs["source_provider"] == "jsearch"].shape[0]
n_arbeit    = jobs[jobs["source_provider"] == "arbeitnow"].shape[0]

insight(
    "JSearch and Arbeitnow surface different slices of the market. "
    "Each catches roles the other misses — both matter."
)

comparison_bars([
    {"label": "JSearch",    "count": n_jsearch, "color": INK},
    {"label": "Arbeitnow",  "count": n_arbeit,  "color": "#2563EB"},
], total=n_active)

st.caption(
    "Cross-source deduplication is on the roadmap. "
    "The same underlying role may appear under both sources."
)
