"""
Standalone tests for seniority summary and copy generation.

Run: python -m pipeline.insights.test_seniority

Verifies:
  - primary_signal is derived from grouped shares, not dominant individual bucket
  - dominant_conflicts_with_primary_signal is set correctly
  - fallback copy follows primary_signal, not dominant_category
  - contradictory summaries (dominant=mid, senior_plus>=50%) produce senior-heavy copy
"""
from __future__ import annotations

from pipeline.insights.chart_summary import build_seniority_summary
from pipeline.insights.copy_service import _build_fallback


def _items(counts: dict) -> list[dict]:
    return [{"label": k, "count": v} for k, v in counts.items()]


def _assert(condition: bool, msg: str) -> None:
    if not condition:
        raise AssertionError(msg)


# ---------------------------------------------------------------------------
# Case 1: dominant=mid, but senior_plus (narrow) >= 50%
# Expect: primary_signal=senior_heavy, conflicts=True, fallback reflects senior
# ---------------------------------------------------------------------------
def test_senior_heavy_with_mid_dominant() -> None:
    items = _items({
        "mid":    30,  # largest individual bucket
        "senior": 25,
        "lead":   15,
        "junior":  5,
        "unknown": 5,
    })
    s = build_seniority_summary(items)

    _assert(s["dominant_category_key"] == "mid",
            f"Expected dominant=mid, got {s['dominant_category_key']}")
    _assert(s["primary_signal"] == "senior_heavy",
            f"Expected primary_signal=senior_heavy (senior+lead=40/80=50%), got {s['primary_signal']}")
    _assert(s["dominant_conflicts_with_primary_signal"] is True,
            "Expected conflict=True when dominant=mid but primary=senior_heavy")

    title, subtitle = _build_fallback("seniority", s)
    _assert("experienced" in title.lower() or "senior" in title.lower(),
            f"Fallback title should reflect senior signal, got: {title!r}")
    _assert("mid" not in title.lower(),
            f"Fallback title must not describe market as mid-dominated, got: {title!r}")

    print(f"  PASS  title: {title!r}")
    print(f"        subtitle: {subtitle!r}")


# ---------------------------------------------------------------------------
# Case 2: dominant=senior, senior_plus clearly >= 50%, no conflict
# Expect: primary_signal=senior_heavy, conflicts=False
# ---------------------------------------------------------------------------
def test_senior_heavy_no_conflict() -> None:
    items = _items({
        "senior": 40,
        "lead":   15,
        "mid":    20,
        "junior":  5,
    })
    s = build_seniority_summary(items)

    _assert(s["dominant_category_key"] == "senior",
            f"Expected dominant=senior, got {s['dominant_category_key']}")
    _assert(s["primary_signal"] == "senior_heavy",
            f"Expected primary_signal=senior_heavy, got {s['primary_signal']}")
    _assert(s["dominant_conflicts_with_primary_signal"] is False,
            "Expected no conflict when dominant=senior and primary=senior_heavy")

    title, subtitle = _build_fallback("seniority", s)
    _assert("experienced" in title.lower() or "senior" in title.lower(),
            f"Fallback title should reflect senior signal, got: {title!r}")

    print(f"  PASS  title: {title!r}")
    print(f"        subtitle: {subtitle!r}")


# ---------------------------------------------------------------------------
# Case 3: truly mixed — no group >= threshold
# Expect: primary_signal=mixed
# ---------------------------------------------------------------------------
def test_mixed_distribution() -> None:
    items = _items({
        "mid":    25,
        "senior": 20,
        "junior": 20,
        "lead":   15,
        "staff":  10,
    })
    s = build_seniority_summary(items)

    _assert(s["primary_signal"] == "mixed",
            f"Expected primary_signal=mixed, got {s['primary_signal']}")

    title, subtitle = _build_fallback("seniority", s)
    _assert("spread" in title.lower() or "multiple" in title.lower(),
            f"Fallback title should reflect mixed signal, got: {title!r}")

    print(f"  PASS  title: {title!r}")
    print(f"        subtitle: {subtitle!r}")


# ---------------------------------------------------------------------------
# Case 4: junior concentration >= 30%
# Expect: primary_signal=junior_accessible
# ---------------------------------------------------------------------------
def test_junior_accessible() -> None:
    items = _items({
        "junior": 35,
        "mid":    30,
        "senior": 20,
        "lead":    5,
    })
    s = build_seniority_summary(items)

    _assert(s["primary_signal"] == "junior_accessible",
            f"Expected primary_signal=junior_accessible (junior=35/90≈39%), got {s['primary_signal']}")

    title, subtitle = _build_fallback("seniority", s)
    _assert("entry" in title.lower() or "junior" in title.lower(),
            f"Fallback title should reflect junior signal, got: {title!r}")

    print(f"  PASS  title: {title!r}")
    print(f"        subtitle: {subtitle!r}")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run_all() -> None:
    tests = [
        ("dominant=mid but senior_plus>=50%", test_senior_heavy_with_mid_dominant),
        ("dominant=senior, no conflict",       test_senior_heavy_no_conflict),
        ("truly mixed distribution",           test_mixed_distribution),
        ("junior concentration >= 30%",        test_junior_accessible),
    ]
    passed = 0
    failed = 0
    for name, fn in tests:
        print(f"\n[{name}]")
        try:
            fn()
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {e}")
            failed += 1
    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    run_all()
