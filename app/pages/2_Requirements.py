"""
JobPulse — Market Requirements
What the Berlin + remote Germany PM market actually asks for.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import plotly.express as px
import streamlit as st

from data import get_active_jobs
from styles import (
    inject_css, hero_band, insight, section_label,
    stat_grid, comparison_bars, chart_cfg, AXIS_STYLE,
    INK, INK2, MID, MUTED, BORDER,
    SENIORITY_ORDER, SENIORITY_COLORS,
)

st.set_page_config(
    page_title="Market Requirements — JobPulse",
    page_icon="◾",
    layout="wide",
    initial_sidebar_state="expanded",
)
inject_css()

with st.sidebar:
    st.markdown(
        '<div style="padding:0 0 1.5rem 0;border-bottom:1px solid #EFEFEF;margin-bottom:0.5rem;">'
        '<div style="font-size:1rem;font-weight:700;color:#0A0A0A;letter-spacing:-0.02em;line-height:1.2;">JobPulse</div>'
        '<div style="font-size:0.7rem;color:#9CA3AF;margin-top:0.2rem;line-height:1.4;">Berlin PM market intelligence</div>'
        '</div>',
        unsafe_allow_html=True,
    )

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------
jobs = get_active_jobs()

if jobs.empty:
    st.info("No data available yet.")
    st.stop()

n_active = len(jobs)
en_jobs  = jobs[jobs["posting_language"].str.lower().eq("en")]
de_jobs  = jobs[jobs["posting_language"].str.lower().eq("de")]
en_must  = en_jobs[en_jobs["german_requirement"] == "must"]
en_plus  = en_jobs[en_jobs["german_requirement"] == "plus"]
en_none  = en_jobs[en_jobs["german_requirement"] == "not_mentioned"]

pct_en_total  = round(len(en_jobs) / n_active * 100) if n_active else 0
pct_must_all  = round(jobs["german_requirement"].eq("must").sum() / n_active * 100) if n_active else 0
senior_plus   = jobs["seniority"].isin(["senior", "lead", "staff", "principal", "head"]).sum()
senior_pct    = round(senior_plus / n_active * 100) if n_active else 0

# Enrichment coverage
n_enriched      = int(jobs["pm_type"].notna().sum())
enriched_pct    = round(n_enriched / n_active * 100) if n_active else 0
enriched_jobs   = jobs[jobs["pm_type"].notna()]
n_enriched_ind  = int(jobs["industry"].notna().sum()) if "industry" in jobs.columns else 0

# ---------------------------------------------------------------------------
# Hero
# ---------------------------------------------------------------------------
hero_band(
    headline=f"{pct_en_total}% of postings are in English. German fluency is still required in {pct_must_all}%.",
    subline=(
        "Language and seniority are the two sharpest filters in the Berlin PM market. "
        f"Senior-level roles account for {senior_pct}% of all classified postings."
    ),
)

# ---------------------------------------------------------------------------
# Section 1: Language
# ---------------------------------------------------------------------------
section_label("Posting language")

insight(
    f"{len(en_jobs)} postings are in English, {len(de_jobs)} in German. "
    "Language of the posting is a proxy for the working language of the role."
)

other_lang = n_active - len(en_jobs) - len(de_jobs)
comparison_bars([
    {"label": "English",  "count": len(en_jobs),       "color": INK},
    {"label": "German",   "count": len(de_jobs),        "color": "#6B7280"},
    {"label": "Other",    "count": max(other_lang, 0),  "color": "#E5E7EB"},
], total=n_active)

st.divider()

# ---------------------------------------------------------------------------
# Section 2: German requirement
# ---------------------------------------------------------------------------
section_label("German language requirement")

must_all = int(jobs["german_requirement"].eq("must").sum())
plus_all = int(jobs["german_requirement"].eq("plus").sum())
none_all = int(jobs["german_requirement"].eq("not_mentioned").sum())
unclass  = n_active - must_all - plus_all - none_all

insight(
    f"German fluency — required or preferred — affects {must_all + plus_all} of {n_active} roles. "
    f"Only {none_all} make no mention of German at all."
)

comparison_bars([
    {"label": "Required",       "count": must_all,           "color": "#DC2626"},
    {"label": "Nice to have",   "count": plus_all,           "color": "#D97706"},
    {"label": "Not mentioned",  "count": none_all,           "color": "#059669"},
    {"label": "Unclassified",   "count": max(unclass, 0),    "color": "#E5E7EB"},
], total=n_active)

if len(en_jobs) > 3:
    st.markdown(
        f'<p style="font-size:0.825rem;color:{MUTED};margin-top:-0.5rem;line-height:1.6;">'
        f'Among {len(en_jobs)} English postings — '
        f'German required: <strong style="color:#0A0A0A;">{len(en_must)}</strong> &nbsp;·&nbsp; '
        f'Nice to have: <strong style="color:#0A0A0A;">{len(en_plus)}</strong> &nbsp;·&nbsp; '
        f'Not mentioned: <strong style="color:#0A0A0A;">{len(en_none)}</strong>'
        f'</p>',
        unsafe_allow_html=True,
    )

st.divider()

# ---------------------------------------------------------------------------
# Section 3: Seniority
# ---------------------------------------------------------------------------
section_label("Seniority demand")

n_junior  = int(jobs["seniority"].eq("junior").sum())
n_mid     = int(jobs["seniority"].eq("mid").sum())
n_unknown = int(jobs["seniority"].isna().sum() + (jobs["seniority"] == "unknown").sum())
entry_pct = round((n_junior + n_mid) / n_active * 100) if n_active else 0

insight(
    f"Senior and above account for {senior_pct}% of classified roles. "
    f"Junior and mid together: {entry_pct}%. "
    "This is not a junior-friendly market."
)

present = [s for s in SENIORITY_ORDER if s in jobs["seniority"].fillna("unknown").values]
sen = (
    jobs["seniority"].fillna("unknown")
    .value_counts().reindex(present).reset_index()
)
sen.columns = ["seniority", "count"]
sen["pct"] = (sen["count"] / n_active * 100).round(0).astype(int)

fig = px.bar(
    sen, y="seniority", x="count", orientation="h",
    color="seniority", color_discrete_map=SENIORITY_COLORS,
    text=sen["pct"].apply(lambda x: f"{x}%"),
)
fig.update_traces(textposition="outside", textfont_size=10)
fig.update_layout(
    **chart_cfg(height=260),
    showlegend=False,
    yaxis_title="", xaxis_title="",
    margin=dict(t=8, b=8, l=0, r=45),
)
fig.update_yaxes(
    **AXIS_STYLE,
    categoryorder="array",
    categoryarray=list(reversed(present)),
    gridcolor="rgba(0,0,0,0)",
    tickfont=dict(color="#374151", size=10),
)
fig.update_xaxes(**AXIS_STYLE, showgrid=False, showticklabels=False)
st.plotly_chart(fig, use_container_width=True)

st.divider()

# ---------------------------------------------------------------------------
# Section 4: Work mode
# ---------------------------------------------------------------------------
section_label("Work mode")

n_remote   = int(jobs["work_mode"].eq("remote").sum())
n_hybrid   = int(jobs["work_mode"].eq("hybrid").sum())
n_onsite   = int(jobs["work_mode"].eq("onsite").sum())
n_wm_unk   = n_active - n_remote - n_hybrid - n_onsite
remote_pct = round(n_remote / n_active * 100) if n_active else 0
hybrid_pct = round(n_hybrid / n_active * 100) if n_active else 0

insight(
    f"Hybrid is the dominant mode at {hybrid_pct}%. "
    f"Fully remote accounts for {remote_pct}% — meaningful, but Berlin presence still anchors most roles."
)

comparison_bars([
    {"label": "Hybrid",        "count": n_hybrid,             "color": INK},
    {"label": "Remote",        "count": n_remote,             "color": "#2563EB"},
    {"label": "On-site",       "count": n_onsite,             "color": "#6B7280"},
    {"label": "Not specified", "count": max(n_wm_unk, 0),     "color": "#E5E7EB"},
], total=n_active)

st.divider()

# ---------------------------------------------------------------------------
# Coverage note — shown once above enrichment-dependent sections
# ---------------------------------------------------------------------------
def _coverage_note(n_enriched: int, n_total: int) -> None:
    pct = round(n_enriched / n_total * 100) if n_total else 0
    st.markdown(
        f'<p style="font-size:0.72rem;color:{MUTED};margin:0 0 1.25rem;line-height:1.5;">'
        f'Based on {n_enriched} of {n_total} active roles ({pct}%) where descriptions were '
        f'available for classification. Remaining roles lacked sufficient description text.</p>',
        unsafe_allow_html=True,
    )

# ---------------------------------------------------------------------------
# Section 5: PM type
# ---------------------------------------------------------------------------
section_label("Role type")

PM_TYPE_LABELS = {
    "core_pm":   "Core PM",
    "technical": "Technical PM",
    "growth":    "Growth PM",
    "data":      "Data PM",
    "other":     "Other / specialist",
}
PM_TYPE_COLORS = {
    "core_pm":   INK,
    "technical": "#2563EB",
    "growth":    "#059669",
    "data":      "#D97706",
    "other":     "#D1D5DB",
}

if n_enriched < 10:
    st.markdown(
        f'<p style="font-size:0.875rem;color:{MUTED};">Not enough classified roles yet to show role type breakdown.</p>',
        unsafe_allow_html=True,
    )
else:
    pm_counts = enriched_jobs["pm_type"].value_counts()
    top_type  = PM_TYPE_LABELS.get(pm_counts.index[0], pm_counts.index[0])
    top_pct   = round(pm_counts.iloc[0] / n_enriched * 100)

    insight(
        f"{top_type} is the dominant role type at {top_pct}% of classified postings. "
        "Technical PM roles are the second-largest segment, reflecting Berlin's engineering-led startup culture."
    )

    _coverage_note(n_enriched, n_active)

    pm_order = ["core_pm", "technical", "growth", "data", "other"]
    comparison_bars(
        [
            {
                "label": PM_TYPE_LABELS.get(k, k),
                "count": int(pm_counts.get(k, 0)),
                "color": PM_TYPE_COLORS.get(k, "#E5E7EB"),
            }
            for k in pm_order
            if pm_counts.get(k, 0) > 0
        ],
        total=n_enriched,
    )

st.divider()

# ---------------------------------------------------------------------------
# Section 6: AI involvement
# ---------------------------------------------------------------------------
section_label("AI involvement")

if n_enriched < 10 or "ai_focus" not in jobs.columns:
    st.markdown(
        f'<p style="font-size:0.875rem;color:{MUTED};">Not enough classified roles yet.</p>',
        unsafe_allow_html=True,
    )
else:
    n_ai_focus  = int(enriched_jobs["ai_focus"].eq(True).sum())
    n_ai_skills = int(enriched_jobs["ai_skills"].eq(True).sum()) if "ai_skills" in enriched_jobs.columns else 0
    ai_focus_pct  = round(n_ai_focus  / n_enriched * 100)
    ai_skills_pct = round(n_ai_skills / n_enriched * 100)

    insight(
        f"{ai_focus_pct}% of classified roles involve building AI products. "
        f"{ai_skills_pct}% explicitly require AI or ML skills from candidates."
    )

    _coverage_note(n_enriched, n_active)

    col1, col2 = st.columns(2)
    with col1:
        st.markdown(
            f'<div style="background:#F8F9FA;border:1px solid #E5E7EB;border-radius:8px;padding:1.25rem 1.5rem;">'
            f'<div style="font-size:0.6rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:{MUTED};margin-bottom:0.75rem;">AI product focus</div>'
            f'<div style="font-size:2rem;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1;">{n_ai_focus}</div>'
            f'<div style="font-size:0.825rem;color:{MUTED};margin-top:0.25rem;">{ai_focus_pct}% of classified roles</div>'
            f'<div style="font-size:0.8rem;color:#374151;margin-top:0.75rem;line-height:1.5;">Role involves building or managing AI/ML-powered products</div>'
            f'</div>',
            unsafe_allow_html=True,
        )
    with col2:
        st.markdown(
            f'<div style="background:#F8F9FA;border:1px solid #E5E7EB;border-radius:8px;padding:1.25rem 1.5rem;">'
            f'<div style="font-size:0.6rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:{MUTED};margin-bottom:0.75rem;">AI skills required</div>'
            f'<div style="font-size:2rem;font-weight:700;color:#0A0A0A;letter-spacing:-0.03em;line-height:1;">{n_ai_skills}</div>'
            f'<div style="font-size:0.825rem;color:{MUTED};margin-top:0.25rem;">{ai_skills_pct}% of classified roles</div>'
            f'<div style="font-size:0.8rem;color:#374151;margin-top:0.75rem;line-height:1.5;">Candidate must have AI/ML knowledge or hands-on experience</div>'
            f'</div>',
            unsafe_allow_html=True,
        )

st.divider()

# ---------------------------------------------------------------------------
# Section 7: Industry
# ---------------------------------------------------------------------------
section_label("Industry")

INDUSTRY_LABELS = {
    "b2b_saas":    "B2B SaaS",
    "fintech":     "Fintech",
    "consumer":    "Consumer / B2C",
    "enterprise":  "Enterprise software",
    "ecommerce":   "E-commerce",
    "healthtech":  "Healthtech",
    "edtech":      "Edtech",
    "media":       "Media & entertainment",
    "mobility":    "Mobility & logistics",
    "climatetech": "Climatetech",
    "other":       "Other",
}
INDUSTRY_COLORS = {
    "b2b_saas":    INK,
    "fintech":     "#2563EB",
    "consumer":    "#7C3AED",
    "enterprise":  "#374151",
    "ecommerce":   "#D97706",
    "healthtech":  "#059669",
    "edtech":      "#0891B2",
    "media":       "#DB2777",
    "mobility":    "#EA580C",
    "climatetech": "#16A34A",
    "other":       "#D1D5DB",
}

has_industry = "industry" in jobs.columns and n_enriched_ind > 0

if not has_industry or n_enriched_ind < 10:
    st.markdown(
        f'<p style="font-size:0.875rem;color:{MUTED};">Industry classification data is not yet available. '
        f'Run the backfill script to populate this field.</p>',
        unsafe_allow_html=True,
    )
else:
    industry_jobs = jobs[jobs["industry"].notna()]
    ind_counts    = industry_jobs["industry"].value_counts()
    top_ind       = INDUSTRY_LABELS.get(ind_counts.index[0], ind_counts.index[0])
    top_ind_pct   = round(ind_counts.iloc[0] / n_enriched_ind * 100)

    insight(
        f"{top_ind} is the largest industry segment at {top_ind_pct}% of classified roles. "
        "Berlin's startup ecosystem skews heavily towards B2B SaaS and fintech."
    )

    _coverage_note(n_enriched_ind, n_active)

    ind_order = ["b2b_saas", "fintech", "consumer", "enterprise", "ecommerce",
                 "healthtech", "edtech", "media", "mobility", "climatetech", "other"]
    comparison_bars(
        [
            {
                "label": INDUSTRY_LABELS.get(k, k),
                "count": int(ind_counts.get(k, 0)),
                "color": INDUSTRY_COLORS.get(k, "#E5E7EB"),
            }
            for k in ind_order
            if ind_counts.get(k, 0) > 0
        ],
        total=n_enriched_ind,
    )
