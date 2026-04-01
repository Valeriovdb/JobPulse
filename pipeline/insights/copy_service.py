"""
Chart insight copy generation service.

Pipeline:
  1. Receive a structured summary with pre-computed interpretation signals.
  2. Call the LLM — only to phrase the conclusion, never to infer it.
  3. Validate output against strict rules.
  4. On any failure or rejection: use a deterministic insight-driven fallback.
     No LLM retry.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from openai import OpenAI

from pipeline.config import OPENAI_API_KEY, OPENAI_MODEL

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OpenAI client (reuse pattern from classifiers/llm.py)
# ---------------------------------------------------------------------------

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


# ---------------------------------------------------------------------------
# LLM prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a product analyst writing chart headlines for a data dashboard.

You do NOT describe charts.
You do NOT explain data.
You state the single most important takeaway.

You must follow all rules strictly."""


def _format_summary(summary: dict) -> str:
    """
    Render only pre-computed interpretation signals for the LLM.
    No raw arrays. No counts. No chart-framing labels.
    Seniority uses a dedicated format that leads with grouped signals.
    """
    cid = summary["chart_id"]

    # Seniority gets its own format: grouped shares + primary_signal first
    if cid == "seniority":
        lines = [
            "chart: seniority",
            f"primary_signal: {summary.get('primary_signal', '')}",
            f"senior_plus_share: {round(summary.get('senior_plus_share', 0) * 100)}%",
            f"mid_share: {round(summary.get('mid_share', 0) * 100)}%",
            f"junior_share: {round(summary.get('junior_share', 0) * 100)}%",
        ]
        if summary.get("dominant_conflicts_with_primary_signal"):
            lines.append(
                f"note: dominant individual bucket is "
                f"{summary.get('dominant_category_label', '')} "
                f"({round(summary.get('dominant_share', 0) * 100)}%) — "
                "IGNORE this as headline; grouped signal takes priority."
            )
        else:
            lines.append(
                f"dominant: {summary.get('dominant_category_label', '')} "
                f"({round(summary.get('dominant_share', 0) * 100)}%)"
            )
        cw = summary.get("coverage_warning", False)
        lines.append(f"coverage_warning: {'yes' if cw else 'no'}")
        lines += [
            "",
            "Generate: title (max 10 words), subtitle (max 22 words).",
            "Title must be a conclusion, not a label.",
            "Title must NOT contain: distribution, overview, breakdown, data, chart.",
            "Subtitle must explain the conclusion, not repeat it.",
            'Never say: "data shows", "this chart shows", "X jobs", "classified jobs".',
            "HARD RULE: base title and subtitle on primary_signal and grouped shares only.",
            "If primary_signal is senior_heavy, the title must reflect that — "
            "even if a single mid-level bucket is numerically largest.",
            "Never describe this market as mid-dominated when senior_plus_share >= 50%.",
            "",
            'Respond with JSON only: {"title": "...", "subtitle": "..."}',
        ]
        return "\n".join(lines)

    # work_mode: pass collapsed grouped shares
    if cid == "work_mode":
        cw = summary.get("coverage_warning", False)
        lines = [
            "chart: work_mode",
            f"pattern: {summary.get('pattern_type', '')}",
            f"interpretation: {summary.get('interpretation_tag', '')}",
            f"remote_share: {round(summary.get('remote_share', 0) * 100)}%",
            f"hybrid_share: {round(summary.get('hybrid_share', 0) * 100)}%",
            f"onsite_share: {round(summary.get('onsite_share', 0) * 100)}%",
            f"dominant: {summary.get('dominant_category_label', '')} ({round(summary.get('dominant_share', 0) * 100)}%)",
            f"coverage_warning: {'yes' if cw else 'no'}",
            "",
            "Generate: title (max 10 words), subtitle (max 22 words).",
            "Title must be a conclusion, not a label.",
            "Title must NOT contain: distribution, overview, breakdown, data, chart.",
            "Subtitle must explain the conclusion, not repeat it.",
            'Never say: "data shows", "this chart shows", "X jobs", "classified jobs".',
            "Focus on: flexibility, on-site expectation, remote availability.",
            "Use relative language. Only mention percentages if they reinforce a comparison.",
            "",
            'Respond with JSON only: {"title": "...", "subtitle": "..."}',
        ]
        return "\n".join(lines)

    # location: pass grouped geographic shares
    if cid == "location":
        cw = summary.get("coverage_warning", False)
        lines = [
            "chart: location",
            f"pattern: {summary.get('pattern_type', '')}",
            f"interpretation: {summary.get('interpretation_tag', '')}",
            f"berlin_share: {round(summary.get('berlin_share', 0) * 100)}%",
            f"remote_share: {round(summary.get('remote_share', 0) * 100)}%",
            f"unclear_share: {round(summary.get('unclear_share', 0) * 100)}%",
            f"coverage_warning: {'yes' if cw else 'no'}",
            "",
            "Generate: title (max 10 words), subtitle (max 22 words).",
            "Title must be a conclusion, not a label.",
            "Title must NOT contain: distribution, overview, breakdown, data, chart.",
            "Subtitle must explain the conclusion, not repeat it.",
            'Never say: "data shows", "this chart shows", "X jobs", "classified jobs".',
            "Focus on: geographic concentration, remote access, market reach.",
            "Use relative language. Only mention percentages if they reinforce a comparison.",
            "",
            'Respond with JSON only: {"title": "...", "subtitle": "..."}',
        ]
        return "\n".join(lines)

    # ai: non-distribution, two metrics
    if cid == "ai":
        cw = summary.get("coverage_warning", False)
        lines = [
            "chart: ai_requirement",
            f"interpretation: {summary.get('interpretation_tag', '')}",
            f"ai_focus_pct: {summary.get('ai_focus_pct', 0)}%",
            f"ai_skills_pct: {summary.get('ai_skills_pct', 0)}%",
            f"coverage_warning: {'yes' if cw else 'no'}",
            "",
            "Generate: title (max 10 words), subtitle (max 22 words).",
            "Title must be a conclusion, not a label.",
            "Title must NOT contain: distribution, overview, breakdown, data, chart.",
            "Subtitle must explain the conclusion, not repeat it.",
            'Never say: "data shows", "this chart shows", "X jobs", "classified jobs".',
            "ai_focus_pct = share of roles where AI is the core responsibility.",
            "ai_skills_pct = share of roles requiring AI tools or ML skills.",
            "Focus on: whether AI expertise is mainstream or still emerging.",
            "",
            'Respond with JSON only: {"title": "...", "subtitle": "..."}',
        ]
        return "\n".join(lines)

    # All other charts (german_requirement, pm_type, industry, ...): shared format
    lines = [
        f"chart: {cid}",
        f"pattern: {summary.get('pattern_type', '')}",
        f"interpretation: {summary.get('interpretation_tag', '')}",
        f"dominant: {summary.get('dominant_category_label', '')} ({round(summary.get('dominant_share', 0) * 100)}%)",
        f"second: {summary.get('second_category_label', '')} ({round(summary.get('second_share', 0) * 100)}%)",
        f"share_gap: {round(summary.get('share_gap', 0) * 100)} percentage points",
    ]

    cw = summary.get("coverage_warning", False)
    uc = round(summary.get("unclassified_share", 0) * 100)
    if cw:
        lines.append(f"coverage_warning: yes — {uc}% of roles unclassified")
    else:
        lines.append("coverage_warning: no")

    lines += [
        "",
        "Generate: title (max 10 words), subtitle (max 22 words).",
        "Title must be a conclusion, not a label.",
        "Title must NOT contain: distribution, overview, breakdown, data, chart.",
        "Subtitle must explain the conclusion, not repeat it.",
        'Never say: "data shows", "this chart shows", "X jobs", "classified jobs".',
        "Focus on: dominance, imbalance, concentration, accessibility, constraint.",
        "Use relative language. Only mention percentages if they reinforce a comparison.",
        "",
        'Respond with JSON only: {"title": "...", "subtitle": "..."}',
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

_TITLE_BANNED_WORDS   = {"distribution", "overview", "breakdown", "data", "chart"}
_SUBTITLE_BANNED_PHRASES = [
    "data shows", "this shows", "this chart", "distribution",
    # Seniority self-contradiction guards
    "balanced seniority mix", "indicating a balanced", "balanced mix",
]


def _validate_copy(
    title: str,
    subtitle: str,
    summary: dict,
    chart_id: str,
    fallback_title: str,
) -> tuple[bool, str]:
    if not title.strip() or not subtitle.strip():
        return False, "empty output"

    title_words    = len(title.split())
    subtitle_words = len(subtitle.split())

    if title_words > 10:
        return False, f"title too long ({title_words} words)"
    if subtitle_words > 22:
        return False, f"subtitle too long ({subtitle_words} words)"

    # Banned words in title (exact word match, case-insensitive)
    title_word_set = set(title.lower().split())
    for word in _TITLE_BANNED_WORDS:
        if word in title_word_set:
            return False, f"banned word in title: '{word}'"

    # Banned phrases in subtitle
    subtitle_lower = subtitle.lower()
    for phrase in _SUBTITLE_BANNED_PHRASES:
        if phrase in subtitle_lower:
            return False, f"banned phrase in subtitle: '{phrase}'"

    # Title must not be the same as the static fallback label
    if fallback_title and title.strip().lower() == fallback_title.strip().lower():
        return False, "title identical to fallback label"

    return True, "ok"


# ---------------------------------------------------------------------------
# Insight-driven fallback (deterministic, never generic)
# ---------------------------------------------------------------------------

def _build_fallback(chart_id: str, summary: dict) -> tuple[str, str]:
    """
    Produce a takeaway-first title and subtitle using pre-computed summary signals.
    Never returns a label or a description.
    """
    tag     = summary.get("interpretation_tag", "mixed")
    pattern = summary.get("pattern_type", "fragmented")
    dom_label  = summary.get("dominant_category_label", "")
    dom_pct    = round(summary.get("dominant_share", 0) * 100)
    second_label = summary.get("second_category_label", "")

    if chart_id == "german_requirement":
        if tag == "accessible":
            title    = "German is not required for most roles"
            subtitle = (
                f"{dom_pct}% of roles have no explicit German requirement, "
                "keeping the market broadly accessible."
            )
        elif tag == "restrictive":
            title    = "German fluency is frequently required"
            subtitle = (
                f"{dom_pct}% of roles require German explicitly, "
                "narrowing the accessible pool."
            )
        else:
            title    = "German requirements vary across roles"
            subtitle = (
                "The market is split — both language-open and "
                "German-required roles are common."
            )

    elif chart_id == "pm_type":
        if tag == "generalist":
            title    = "Core PM roles dominate demand"
            subtitle = "Core product roles represent the largest share of current openings."
        elif tag == "specialized":
            title    = f"{dom_label} roles lead the market"
            subtitle = f"{dom_label} profiles are the most in-demand PM type right now."
        else:
            title    = "PM demand is spread across role types"
            subtitle = (
                "Openings are distributed across several PM types, "
                "with no single category strongly dominant."
            )

    elif chart_id == "seniority":
        primary = summary.get("primary_signal", "mixed")
        if primary == "senior_heavy":
            title    = "Hiring skews toward experienced roles"
            subtitle = "Most active roles target senior profiles, with limited entry-level demand."
        elif primary == "mid_heavy":
            title    = "Hiring is concentrated in mid-level roles"
            subtitle = "Mid-level openings make up the largest share of the current market."
        elif primary == "junior_accessible":
            title    = "Entry-level access is relatively visible"
            subtitle = "Junior roles represent a meaningful share of active openings."
        else:
            title    = "Hiring is spread across multiple levels"
            subtitle = "No single seniority group clearly dominates the current market."

    elif chart_id == "work_mode":
        remote_pct = round(summary.get("remote_share", 0) * 100)
        hybrid_pct = round(summary.get("hybrid_share", 0) * 100)
        onsite_pct = round(summary.get("onsite_share", 0) * 100)
        if tag == "remote_friendly":
            title    = "Remote work is widely available"
            subtitle = (
                f"Around {remote_pct}% of roles offer full remote flexibility — "
                "high for a Berlin-focused search."
            )
        elif tag == "hybrid_dominant":
            title    = "Hybrid is the dominant work arrangement"
            subtitle = (
                f"Most roles offer a mix of remote and on-site work, "
                f"with hybrid at {hybrid_pct}% of openings."
            )
        elif tag == "onsite_heavy":
            title    = "Most roles require on-site presence"
            subtitle = (
                f"On-site expectations account for {onsite_pct}% of roles, "
                "limiting flexibility for remote candidates."
            )
        else:
            title    = "Work style is evenly split"
            subtitle = "Remote, hybrid, and on-site roles are all represented in the current market."

    elif chart_id == "location":
        berlin_pct = round(summary.get("berlin_share", 0) * 100)
        remote_pct = round(summary.get("remote_share", 0) * 100)
        if tag == "berlin_concentrated":
            title    = "Roles are heavily concentrated in Berlin"
            subtitle = (
                f"{berlin_pct}% of positions are Berlin-based, "
                "with limited availability elsewhere."
            )
        elif tag == "remote_accessible":
            title    = "Remote roles are a meaningful share"
            subtitle = (
                f"{remote_pct}% of openings are available outside Berlin, "
                "broadening access for remote candidates."
            )
        else:
            title    = "Roles split between Berlin and remote"
            subtitle = (
                "Both Berlin-based and remote Germany roles "
                "make up the active market."
            )

    elif chart_id == "ai":
        focus_pct  = summary.get("ai_focus_pct", 0)
        skills_pct = summary.get("ai_skills_pct", 0)
        if tag == "high_demand":
            title    = "AI is now mainstream in PM hiring"
            subtitle = (
                f"{focus_pct}% of roles list AI as a core focus, "
                f"and {skills_pct}% require AI skills."
            )
        elif tag == "emerging":
            title    = "AI demand is growing across PM roles"
            subtitle = (
                f"Around {focus_pct}% of roles involve AI as a core focus — "
                "a rising but not yet dominant signal."
            )
        else:
            title    = "AI focus remains a niche requirement"
            subtitle = (
                f"AI-specific roles are present but represent a small share "
                f"of the market at {focus_pct}%."
            )

    elif chart_id == "industry":
        if tag == "concentrated":
            title    = f"{dom_label} leads the market"
            subtitle = (
                f"The {dom_label} sector holds the largest share of PM openings "
                f"at {dom_pct}%."
            )
        elif tag == "diverse":
            title    = "PM demand spans multiple industries"
            subtitle = (
                "Hiring is spread across industries with no single sector "
                "strongly dominant."
            )
        else:
            title    = f"{dom_label} leads PM demand"
            subtitle = (
                f"{dom_label} has the highest share of openings, "
                "with hiring spread across several sectors."
            )

    else:
        # Should not happen for supported charts
        title    = f"{chart_id.replace('_', ' ').title()} — market snapshot"
        subtitle = f"{dom_label} leads with {dom_pct}% of active roles."

    return title, subtitle


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class ChartInsightCopyService:
    """
    Generates chart title + subtitle from a structured summary.
    The LLM phrases a conclusion; it never infers one.
    Falls back to deterministic insight-driven copy on any failure.
    """

    def __init__(self) -> None:
        self._model = OPENAI_MODEL

    def generate(self, summary: dict) -> dict:
        """
        Returns:
            {
                "title":        str,
                "subtitle":     str,
                "source":       "llm" | "fallback",
                "generated_at": ISO 8601 str,
                "model":        str | None,
            }
        """
        chart_id = summary.get("chart_id", "unknown")
        now_iso  = datetime.now(timezone.utc).isoformat()

        # Pre-compute fallback so validator can compare against it
        fallback_title, fallback_subtitle = _build_fallback(chart_id, summary)

        try:
            result   = self._call_llm(summary)
            title    = (result.get("title")    or "").strip()
            subtitle = (result.get("subtitle") or "").strip()

            valid, reason = _validate_copy(title, subtitle, summary, chart_id, fallback_title)
            if not valid:
                logger.warning(f"[{chart_id}] LLM copy rejected ({reason}); using fallback")
                return self._make_fallback(fallback_title, fallback_subtitle, now_iso)

            logger.info(f"[{chart_id}] LLM copy accepted — {title!r}")
            return {
                "title":        title,
                "subtitle":     subtitle,
                "source":       "llm",
                "generated_at": now_iso,
                "model":        self._model,
            }

        except Exception as e:
            logger.error(f"[{chart_id}] LLM call failed: {e}")
            return self._make_fallback(fallback_title, fallback_subtitle, now_iso)

    def _call_llm(self, summary: dict) -> dict:
        user_msg = _format_summary(summary)
        response = _get_client().chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0,
            max_tokens=128,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        return json.loads(raw)

    def _make_fallback(self, title: str, subtitle: str, now_iso: str) -> dict:
        return {
            "title":        title,
            "subtitle":     subtitle,
            "source":       "fallback",
            "generated_at": now_iso,
            "model":        None,
        }
