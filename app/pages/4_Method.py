"""
JobPulse — Methodology
Sources, classification logic, active/inactive rules, limitations.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import streamlit as st
from styles import inject_css, section_label, INK

st.set_page_config(
    page_title="Methodology — JobPulse",
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

st.markdown(
    f'<h1 style="font-size:2rem;font-weight:700;color:{INK};letter-spacing:-0.02em;'
    f'margin-bottom:0.25rem;">Methodology</h1>',
    unsafe_allow_html=True,
)
st.markdown(
    '<p style="font-size:0.9rem;color:#6B7280;margin-top:0;margin-bottom:1.75rem;">'
    'How JobPulse tracks the Berlin and remote Germany PM market — '
    'sources, classification logic, active/inactive rules, and limitations.'
    '</p>',
    unsafe_allow_html=True,
)

section_label("Scope")

st.markdown(
    """
    JobPulse tracks **product management roles in Berlin and remote Germany** only.
    This scope reflects how PM job seekers in Berlin actually search — Berlin-based roles
    plus positions open to remote workers in Germany.

    Roles outside this geography are excluded at the query level.
    """
)

st.header("Sources")

col1, col2 = st.columns(2)

with col1:
    st.markdown("### JSearch (via RapidAPI)")
    st.markdown(
        """
        Aggregates listings from LinkedIn, Indeed, Glassdoor, and company career sites.
        Queried daily with four targeted searches scoped to Berlin and remote Germany.
        Daily runs fetch jobs posted that day; the initial load captured all currently live postings.
        """
    )

with col2:
    st.markdown("### Arbeitnow")
    st.markdown(
        """
        Free job board focused on Germany, English-friendly roles, and
        visa-sponsorship positions. Queried using the `product-management` tag.

        A title filter keeps only genuine PM roles — this guards against noise from
        the broad tag (e.g. marketing managers). Accepted titles include:
        *Product Manager, Product Owner, Head of Product, VP Product,
        Director of Product, Chief Product Officer*.

        Returns up to 3 pages per run.
        """
    )

st.markdown(
    """
    **Coverage note:** Both sources are aggregators, not exhaustive registries.
    Jobs posted exclusively on small company career pages or niche boards may not
    appear. JobPulse captures a representative, consistently tracked sample of the
    Berlin and remote Germany PM market — not every role that exists.
    """
)

st.divider()

# ---------------------------------------------------------------------------
# Update cadence
# ---------------------------------------------------------------------------
st.header("Update Cadence")
st.markdown(
    """
    Data is refreshed **once daily**. Each update fetches new postings from both sources,
    classifies them, and updates the active/inactive status of all tracked roles.
    Historical snapshots are preserved — nothing is deleted when a job disappears.
    """
)

st.divider()

# ---------------------------------------------------------------------------
# Active / Inactive logic
# ---------------------------------------------------------------------------
st.header("Active vs. Inactive Jobs")
st.markdown(
    """
    A job is considered **active** if it appeared in the most recent daily ingestion run.

    - `first_seen_date` — the date the job first appeared in any run
    - `last_seen_date` — the most recent date the job appeared in any run
    - A job is marked **inactive** if `last_seen_date < today − 1 day`

    This means a job that disappears from the source API will be marked inactive
    after it misses one daily run. A 1-day grace period is used to account for
    temporary API gaps.

    **What "inactive" means in practice:** the job is no longer actively surfaced
    by the source API. This usually means it has been filled, closed, or expired.
    It does not guarantee the position no longer exists.
    """
)

st.divider()

# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------
st.header("Deduplication")
st.markdown(
    """
    Each job is identified by an `external_job_key` in the format `{source}::{source_job_id}`.

    - For JSearch: the `job_id` field from the API response
    - For Arbeitnow: the `slug` field

    This means the same real-world job appearing on both JSearch and Arbeitnow
    will be counted as two separate records. **Cross-source deduplication** (matching
    the same underlying role across sources) is on the roadmap but not yet implemented.

    As a result, job counts may slightly overcount unique open roles when a posting
    appears on multiple platforms.
    """
)

st.divider()

# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------
st.header("Classification")
st.markdown(
    """
    Each job is enriched with the following fields, classified by an LLM
    (GPT-4o-mini) reading the job title, company, location, and full description:
    """
)

col1, col2 = st.columns(2)

with col1:
    st.markdown(
        """
        **Posting language** (`posting_language`)
        ISO 639-1 code of the language the job ad is written in. `en` or `de` for
        the vast majority of German PM roles.

        **German language requirement** (`german_requirement`)
        - `must` — German explicitly required ("Business fluency in German required")
        - `plus` — German mentioned as a nice-to-have or advantage
        - `not_mentioned` — German not referenced in the posting
        """
    )

with col2:
    st.markdown(
        """
        **Seniority** (`seniority`)
        Normalized from job title and description:
        `junior` · `mid` · `senior` · `lead` · `staff` · `principal` · `head` · `unknown`

        **PM type** (`pm_type`)
        `core_pm` · `growth` · `technical` · `data` · `other`

        **Other signals:** B2B/SaaS context (`b2b_saas`), AI product focus (`ai_focus`),
        AI skills required (`ai_skills`), tooling extracted as a list (`tools_skills`).
        """
    )

st.caption(
    "LLM classifier version is tracked per job. Classifications may be re-run "
    "when the classifier is updated, using stored description text — no re-fetch needed."
)

st.divider()

# ---------------------------------------------------------------------------
# Limitations
# ---------------------------------------------------------------------------
st.header("Limitations")
st.markdown(
    """
    - **Sample, not census.** JobPulse captures jobs surfaced by two aggregator APIs.
      Company-direct posts on careers pages not indexed by these APIs are not included.

    - **No cross-source deduplication.** The same role appearing on multiple platforms
      is counted separately. Overall counts may be slightly inflated.

    - **LLM classification errors.** The language, seniority, and German requirement
      fields are AI-classified and will occasionally be wrong. Confidence scores are
      stored but not yet surfaced in the UI.

    - **Trend data requires time.** "When to Apply" and trend analyses are only
      meaningful after weeks of daily data. Charts show honest "not enough data yet"
      states when history is insufficient.

    - **Berlin + remote Germany scope.** Queries target Berlin-based and remote Germany roles specifically.
      Results outside this geography may occasionally appear if the source API's geo-filter is imprecise.

    - **Daily granularity.** JobPulse does not capture intra-day posting patterns.
      All timing data is at day-level precision.
    """
)

st.divider()
st.caption("JobPulse is an independent market intelligence project. Not affiliated with any job board or employer.")
