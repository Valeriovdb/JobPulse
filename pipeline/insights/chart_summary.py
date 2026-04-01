"""
Deterministic chart summary builders.

Each function receives pre-computed distribution or timeseries data (plain Python
dicts/lists, already in memory from export_data.py) and returns a structured
summary object containing only the key signals needed for copy generation.

All interpretation (pattern_type, interpretation_tag) is computed here.
The LLM receives only pre-computed conclusions — never raw arrays.

No LLM, no DB, no file I/O.
"""
from __future__ import annotations

_GERMAN_REQ_LABELS = {
    "not_mentioned": "No German required",
    "plus":          "German a plus",
    "must":          "German required",
    "unclassified":  "Unclassified",
}

_PM_TYPE_LABELS = {
    "core_pm":        "Core PM",
    "technical":      "Technical PM",
    "customer_facing": "Customer-facing PM",
    "data_ai":        "Data / AI PM",
    "platform":       "Platform PM",
    "growth":         "Growth PM",
    "internal_ops":   "Internal ops PM",
    "unclassified":   "Unclassified",
}

_SENIORITY_LABELS = {
    "junior":     "Junior",
    "mid":        "Mid-level",
    "mid_senior": "Mid-senior",
    "senior":     "Senior",
    "lead":       "Lead",
    "staff":      "Staff",
    "group":      "Group / VP",
    "principal":  "Principal",
    "head":       "Head",
    "unknown":    "Unknown",
}

_SENIOR_PLUS_KEYS = {"senior", "mid_senior", "lead", "staff", "group", "principal", "head"}
_JUNIOR_MID_KEYS  = {"junior", "mid"}

# Narrow grouped buckets used for primary_signal (spec-defined)
_SENIOR_PLUS_NARROW = {"senior", "mid_senior", "lead", "principal", "head"}
_MID_KEYS           = {"mid"}
_JUNIOR_KEYS        = {"junior"}

_SIGNAL_IMPLIED_KEYS: dict[str, set | None] = {
    "senior_heavy":      _SENIOR_PLUS_NARROW,
    "mid_heavy":         _MID_KEYS,
    "junior_accessible": _JUNIOR_KEYS,
    "mixed":             None,
}


def _pattern_type(dominant_share: float, share_gap: float) -> str:
    """Classify the concentration pattern of a distribution."""
    if dominant_share >= 0.60:
        return "highly_concentrated"
    if dominant_share >= 0.45:
        return "moderately_concentrated"
    if share_gap < 0.10:
        return "balanced"
    return "fragmented"


def build_german_requirement_summary(dist_items: list[dict], n_active: int) -> dict:
    """
    Summarise the german_requirement distribution.

    dist_items: list of {"label": str, "count": int} from distributions.json
    n_active:   total active job count (from overview.json)
    """
    total = n_active or sum(d["count"] for d in dist_items)
    unclassified_count = next((d["count"] for d in dist_items if d["label"] == "unclassified"), 0)
    classified_items = [d for d in dist_items if d["label"] != "unclassified"]

    categories = sorted(
        [
            {
                "key":   d["label"],
                "label": _GERMAN_REQ_LABELS.get(d["label"], d["label"]),
                "count": d["count"],
                "share": round(d["count"] / total, 3) if total else 0.0,
            }
            for d in classified_items
        ],
        key=lambda x: x["count"],
        reverse=True,
    )

    dominant = categories[0] if categories else {"key": "unclassified", "label": "Unclassified", "count": 0, "share": 0.0}
    second   = categories[1] if len(categories) > 1 else {"key": "", "label": "", "count": 0, "share": 0.0}

    dominant_share = dominant["share"]
    second_share   = second["share"]
    share_gap      = round(dominant_share - second_share, 3)
    unclassified_share = round(unclassified_count / total, 3) if total else 0.0

    # Interpretation: accessible / restrictive / mixed
    dom_key = dominant["key"]
    if dom_key == "not_mentioned" and dominant_share > 0.50:
        interpretation_tag = "accessible"
    elif dom_key == "must" and dominant_share > 0.40:
        interpretation_tag = "restrictive"
    else:
        interpretation_tag = "mixed"

    return {
        "chart_id":               "german_requirement",
        "total_count":            total,
        "categories":             categories,
        "dominant_category_key":  dominant["key"],
        "dominant_category_label": dominant["label"],
        "dominant_share":         dominant_share,
        "second_category_key":    second["key"],
        "second_category_label":  second["label"],
        "second_share":           second_share,
        "share_gap":              share_gap,
        "pattern_type":           _pattern_type(dominant_share, share_gap),
        "interpretation_tag":     interpretation_tag,
        "unclassified_share":     unclassified_share,
        "coverage_warning":       unclassified_share > 0.15,
    }


def build_pm_type_summary(dist_items: list[dict]) -> dict:
    """
    Summarise the pm_type distribution.

    dist_items: list of {"label": str, "count": int} from distributions.json.
    """
    total_enriched = sum(d["count"] for d in dist_items)
    unclassified_count = next((d["count"] for d in dist_items if d["label"] == "unclassified"), 0)
    non_unclassified   = [d for d in dist_items if d["label"] != "unclassified"]

    categories = sorted(
        [
            {
                "key":   d["label"],
                "label": _PM_TYPE_LABELS.get(d["label"], d["label"]),
                "count": d["count"],
                "share": round(d["count"] / total_enriched, 3) if total_enriched else 0.0,
            }
            for d in non_unclassified
        ],
        key=lambda x: x["count"],
        reverse=True,
    )[:5]

    dominant = categories[0] if categories else {"key": "unclassified", "label": "Unclassified", "count": 0, "share": 0.0}
    second   = categories[1] if len(categories) > 1 else {"key": "", "label": "", "count": 0, "share": 0.0}

    dominant_share     = dominant["share"]
    second_share       = second["share"]
    share_gap          = round(dominant_share - second_share, 3)
    unclassified_share = round(unclassified_count / total_enriched, 3) if total_enriched else 0.0

    # Interpretation: generalist / specialized / mixed
    dom_key = dominant["key"]
    if dom_key == "core_pm" and dominant_share >= 0.30:
        interpretation_tag = "generalist"
    elif share_gap >= 0.15:
        interpretation_tag = "specialized"
    else:
        interpretation_tag = "mixed"

    return {
        "chart_id":               "pm_type",
        "total_count":            total_enriched,
        "categories":             categories,
        "dominant_category_key":  dominant["key"],
        "dominant_category_label": dominant["label"],
        "dominant_share":         dominant_share,
        "second_category_key":    second["key"],
        "second_category_label":  second["label"],
        "second_share":           second_share,
        "share_gap":              share_gap,
        "pattern_type":           _pattern_type(dominant_share, share_gap),
        "interpretation_tag":     interpretation_tag,
        "unclassified_share":     unclassified_share,
        "coverage_warning":       unclassified_share > 0.20,
    }


def build_seniority_summary(dist_items: list[dict]) -> dict:
    """
    Summarise the seniority distribution.

    dist_items: list of {"label": str, "count": int} from distributions.json.
    """
    n_total       = sum(d["count"] for d in dist_items)
    unknown_count = next((d["count"] for d in dist_items if d["label"] == "unknown"), 0)

    categories = sorted(
        [
            {
                "key":   d["label"],
                "label": _SENIORITY_LABELS.get(d["label"], d["label"]),
                "count": d["count"],
                "share": round(d["count"] / n_total, 3) if n_total else 0.0,
            }
            for d in dist_items
            if d["label"] != "unknown"
        ],
        key=lambda x: x["count"],
        reverse=True,
    )

    dominant = categories[0] if categories else {"key": "unknown", "label": "Unknown", "count": 0, "share": 0.0}
    second   = categories[1] if len(categories) > 1 else {"key": "", "label": "", "count": 0, "share": 0.0}

    dominant_share = dominant["share"]
    second_share   = second["share"]
    share_gap      = round(dominant_share - second_share, 3)
    unknown_share  = round(unknown_count / n_total, 3) if n_total else 0.0

    # Narrow grouped shares (spec-defined buckets for primary_signal)
    junior_count        = sum(d["count"] for d in dist_items if d["label"] in _JUNIOR_KEYS)
    mid_count           = sum(d["count"] for d in dist_items if d["label"] in _MID_KEYS)
    senior_plus_count   = sum(d["count"] for d in dist_items if d["label"] in _SENIOR_PLUS_NARROW)
    junior_share        = round(junior_count / n_total, 3) if n_total else 0.0
    mid_share           = round(mid_count / n_total, 3) if n_total else 0.0
    senior_plus_share   = round(senior_plus_count / n_total, 3) if n_total else 0.0

    # Broad grouped shares (kept for context / backward compat)
    junior_mid_count  = sum(d["count"] for d in dist_items if d["label"] in _JUNIOR_MID_KEYS)
    junior_mid_share  = round(junior_mid_count / n_total, 3) if n_total else 0.0

    # Primary signal — derived from grouped shares, not from dominant individual bucket
    if senior_plus_share >= 0.50:
        primary_signal = "senior_heavy"
    elif mid_share >= 0.50:
        primary_signal = "mid_heavy"
    elif junior_share >= 0.30:
        primary_signal = "junior_accessible"
    else:
        primary_signal = "mixed"

    # Conflict detection: does the largest individual bucket point in a different direction?
    dom_key  = dominant["key"]
    implied  = _SIGNAL_IMPLIED_KEYS[primary_signal]
    dominant_conflicts = (implied is not None) and (dom_key not in implied)

    # Keep interpretation_tag aligned with primary_signal for pipeline consistency
    interpretation_tag = primary_signal

    return {
        "chart_id":               "seniority",
        "total_count":            n_total,
        "categories":             categories,
        "dominant_category_key":  dom_key,
        "dominant_category_label": dominant["label"],
        "dominant_share":         dominant_share,
        "second_category_key":    second["key"],
        "second_category_label":  second["label"],
        "second_share":           second_share,
        "share_gap":              share_gap,
        "pattern_type":           _pattern_type(dominant_share, share_gap),
        "interpretation_tag":     interpretation_tag,
        # Grouped shares
        "junior_share":           junior_share,
        "mid_share":              mid_share,
        "senior_plus_share":      senior_plus_share,
        "junior_mid_share":       junior_mid_share,
        # Primary signal fields
        "primary_signal":                        primary_signal,
        "dominant_conflicts_with_primary_signal": dominant_conflicts,
        "unknown_share":          unknown_share,
        "coverage_warning":       unknown_share > 0.15,
    }


_HYBRID_KEYS = {"hybrid", "hybrid_1d", "hybrid_2d", "hybrid_3d", "hybrid_4d"}

_WM_LABELS = {"remote": "Remote", "hybrid": "Hybrid", "onsite": "On-site", "unknown": "Unclassified"}


def build_work_mode_summary(dist_items: list[dict]) -> dict:
    """
    Summarise the work_mode distribution.

    dist_items: list of {"label": str, "count": int} from distributions.json.
    Collapses hybrid_Nd variants into a single 'hybrid' bucket.
    """
    collapsed: dict[str, int] = {"remote": 0, "hybrid": 0, "onsite": 0, "unknown": 0}
    for d in dist_items:
        key = d["label"]
        if key == "remote":
            collapsed["remote"] += d["count"]
        elif key in _HYBRID_KEYS:
            collapsed["hybrid"] += d["count"]
        elif key == "onsite":
            collapsed["onsite"] += d["count"]
        else:
            collapsed["unknown"] += d["count"]

    total = sum(collapsed.values())

    categories = sorted(
        [
            {
                "key":   k,
                "label": _WM_LABELS[k],
                "count": v,
                "share": round(v / total, 3) if total else 0.0,
            }
            for k, v in collapsed.items()
            if v > 0
        ],
        key=lambda x: x["count"],
        reverse=True,
    )

    dominant = categories[0] if categories else {"key": "unknown", "label": "Unclassified", "count": 0, "share": 0.0}
    second   = categories[1] if len(categories) > 1 else {"key": "", "label": "", "count": 0, "share": 0.0}

    dominant_share     = dominant["share"]
    second_share       = second["share"]
    share_gap          = round(dominant_share - second_share, 3)
    remote_share       = round(collapsed["remote"]  / total, 3) if total else 0.0
    hybrid_share       = round(collapsed["hybrid"]  / total, 3) if total else 0.0
    onsite_share       = round(collapsed["onsite"]  / total, 3) if total else 0.0
    unclassified_share = round(collapsed["unknown"] / total, 3) if total else 0.0

    if remote_share >= 0.30:
        interpretation_tag = "remote_friendly"
    elif hybrid_share >= 0.40:
        interpretation_tag = "hybrid_dominant"
    elif onsite_share >= 0.50:
        interpretation_tag = "onsite_heavy"
    else:
        interpretation_tag = "mixed"

    return {
        "chart_id":               "work_mode",
        "total_count":            total,
        "categories":             categories,
        "dominant_category_key":  dominant["key"],
        "dominant_category_label": dominant["label"],
        "dominant_share":         dominant_share,
        "second_category_key":    second["key"],
        "second_category_label":  second["label"],
        "second_share":           second_share,
        "share_gap":              share_gap,
        "pattern_type":           _pattern_type(dominant_share, share_gap),
        "interpretation_tag":     interpretation_tag,
        "remote_share":           remote_share,
        "hybrid_share":           hybrid_share,
        "onsite_share":           onsite_share,
        "unclassified_share":     unclassified_share,
        "coverage_warning":       unclassified_share > 0.20,
    }


def build_location_summary(location: dict, n_active: int) -> dict:
    """
    Summarise the location distribution from overview.location.

    location: {"berlin": int, "remote_germany": int, "unclear": int}
    n_active:  total active job count from overview.json
    """
    berlin  = location.get("berlin", 0)
    remote  = location.get("remote_germany", 0)
    unclear = location.get("unclear", 0)
    total   = n_active or (berlin + remote + unclear)

    raw = [
        {"key": "berlin",          "label": "Berlin",          "count": berlin},
        {"key": "remote_germany",  "label": "Remote Germany",  "count": remote},
        {"key": "unclear",         "label": "Location unclear", "count": unclear},
    ]
    categories = sorted(
        [
            {**d, "share": round(d["count"] / total, 3) if total else 0.0}
            for d in raw
            if d["count"] > 0
        ],
        key=lambda x: x["count"],
        reverse=True,
    )

    dominant = categories[0] if categories else {"key": "unclear", "label": "Location unclear", "count": 0, "share": 0.0}
    second   = categories[1] if len(categories) > 1 else {"key": "", "label": "", "count": 0, "share": 0.0}

    dominant_share = dominant["share"]
    second_share   = second["share"]
    share_gap      = round(dominant_share - second_share, 3)
    berlin_share   = round(berlin  / total, 3) if total else 0.0
    remote_share   = round(remote  / total, 3) if total else 0.0
    unclear_share  = round(unclear / total, 3) if total else 0.0

    if berlin_share >= 0.70:
        interpretation_tag = "berlin_concentrated"
    elif remote_share >= 0.30:
        interpretation_tag = "remote_accessible"
    else:
        interpretation_tag = "mixed"

    return {
        "chart_id":               "location",
        "total_count":            total,
        "categories":             categories,
        "dominant_category_key":  dominant["key"],
        "dominant_category_label": dominant["label"],
        "dominant_share":         dominant_share,
        "second_category_key":    second["key"],
        "second_category_label":  second["label"],
        "second_share":           second_share,
        "share_gap":              share_gap,
        "pattern_type":           _pattern_type(dominant_share, share_gap),
        "interpretation_tag":     interpretation_tag,
        "berlin_share":           berlin_share,
        "remote_share":           remote_share,
        "unclear_share":          unclear_share,
        "coverage_warning":       unclear_share > 0.30,
    }


def build_ai_summary(ai: dict) -> dict:
    """
    Summarise the AI requirement signals from distributions.ai.

    ai: {"n_enriched": int, "n_ai_focus": int, "n_ai_skills": int,
         "ai_focus_pct": int, "ai_skills_pct": int}
    """
    n_enriched    = ai.get("n_enriched", 0)
    ai_focus_pct  = ai.get("ai_focus_pct", 0)
    ai_skills_pct = ai.get("ai_skills_pct", 0)

    if ai_focus_pct >= 30:
        interpretation_tag = "high_demand"
    elif ai_focus_pct >= 10:
        interpretation_tag = "emerging"
    else:
        interpretation_tag = "low"

    return {
        "chart_id":           "ai",
        "n_enriched":         n_enriched,
        "ai_focus_pct":       ai_focus_pct,
        "ai_skills_pct":      ai_skills_pct,
        "interpretation_tag": interpretation_tag,
        "coverage_warning":   n_enriched < 50,
    }


def build_industry_summary(dist_items: list[dict]) -> dict:
    """
    Summarise the industry distribution (top industries).

    dist_items: list of {"label": str, "count": int} from distributions.json.
    """
    total = sum(d["count"] for d in dist_items)

    categories = sorted(
        [
            {
                "key":   d["label"],
                "label": d["label"],
                "count": d["count"],
                "share": round(d["count"] / total, 3) if total else 0.0,
            }
            for d in dist_items
        ],
        key=lambda x: x["count"],
        reverse=True,
    )[:8]

    dominant = categories[0] if categories else {"key": "", "label": "", "count": 0, "share": 0.0}
    second   = categories[1] if len(categories) > 1 else {"key": "", "label": "", "count": 0, "share": 0.0}

    dominant_share = dominant["share"]
    second_share   = second["share"]
    share_gap      = round(dominant_share - second_share, 3)

    if dominant_share >= 0.40:
        interpretation_tag = "concentrated"
    elif share_gap < 0.10:
        interpretation_tag = "diverse"
    else:
        interpretation_tag = "mixed"

    return {
        "chart_id":               "industry",
        "total_count":            total,
        "categories":             categories,
        "dominant_category_key":  dominant["key"],
        "dominant_category_label": dominant["label"],
        "dominant_share":         dominant_share,
        "second_category_key":    second["key"],
        "second_category_label":  second["label"],
        "second_share":           second_share,
        "share_gap":              share_gap,
        "pattern_type":           _pattern_type(dominant_share, share_gap),
        "interpretation_tag":     interpretation_tag,
        "coverage_warning":       total < 20,
    }


def build_german_req_trend_summary(german_req_mix: dict) -> dict:
    """
    Summarise the german_requirement stacked-area trend.

    german_req_mix: {"dates": [...], "series": {"must": [...], ...}}
    from timeseries.json["german_req_mix"].
    """
    dates  = german_req_mix.get("dates", [])
    series = german_req_mix.get("series", {})
    n_days = len(dates)

    def _latest_share(key: str) -> float:
        vals = series.get(key, [])
        if not vals:
            return 0.0
        total = sum(s[-1] for s in series.values() if s) or 1
        return round(vals[-1] / total, 3)

    latest_shares = {
        "must":          _latest_share("must"),
        "plus":          _latest_share("plus"),
        "not_mentioned": _latest_share("not_mentioned"),
    }

    def _trend_direction(key: str) -> str:
        vals = series.get(key, [])
        if n_days < 7:
            return "stable"
        window = min(7, n_days // 2)
        totals = [sum(s[i] for s in series.values() if s) for i in range(n_days)]
        shares = [vals[i] / totals[i] if totals[i] else 0.0 for i in range(n_days)]
        recent_avg = sum(shares[-window:]) / window
        prior_avg  = sum(shares[-2*window:-window]) / window
        delta = recent_avg - prior_avg
        if delta > 0.03:
            return "rising"
        if delta < -0.03:
            return "falling"
        return "stable"

    trend_direction = {
        "must":          _trend_direction("must"),
        "not_mentioned": _trend_direction("not_mentioned"),
    }

    return {
        "chart_id":       "german_req_trend",
        "metric_scope":   "active jobs over time",
        "n_days":         n_days,
        "date_range":     {"from": dates[0] if dates else "", "to": dates[-1] if dates else ""},
        "latest_shares":  latest_shares,
        "trend_direction": trend_direction,
        "coverage_warning": n_days < 14,
    }
