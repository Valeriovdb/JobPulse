"""
JobPulse design system.
Import in every page: from styles import inject_css, hero_band, insight, ...
"""
import streamlit as st
from datetime import date

# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------
INK    = "#0A0A0A"
INK2   = "#374151"
SUB    = "#6B7280"
MUTED  = "#9CA3AF"
BLUE   = "#1E3A8A"
MID    = "#2563EB"
BORDER = "#E5E7EB"
SURF   = "#F8F9FA"

SENIORITY_ORDER = ["junior", "mid", "senior", "lead", "staff", "principal", "head", "unknown"]
SENIORITY_COLORS = {
    "junior":    "#DBEAFE",
    "mid":       "#BFDBFE",
    "senior":    "#60A5FA",
    "lead":      "#2563EB",
    "staff":     "#1D4ED8",
    "principal": "#1E3A8A",
    "head":      "#0A0A0A",
    "unknown":   "#E5E7EB",
}

GERMAN_COLORS = {
    "must":          "#DC2626",
    "plus":          "#D97706",
    "not_mentioned": "#059669",
}
GERMAN_LABELS = {
    "must":          "German required",
    "plus":          "German a plus",
    "not_mentioned": "German not mentioned",
}


# ---------------------------------------------------------------------------
# CSS injection
# ---------------------------------------------------------------------------
def inject_css() -> None:
    st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

    /* Base font */
    html, body, .stApp,
    [class*="css"],
    .stMarkdown,
    [data-testid="stMarkdownContainer"] p,
    [data-testid="stMarkdownContainer"] {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
    }

    /* Sidebar — polished app rail */
    section[data-testid="stSidebar"] {
        min-width: 220px !important;
        max-width: 220px !important;
        background: #FAFAFA !important;
        border-right: 1px solid #F0F0F0 !important;
    }
    section[data-testid="stSidebar"] > div:first-child {
        padding: 1.75rem 1rem !important;
    }

    /* Nav links — base */
    [data-testid="stSidebarNavLink"] {
        border-radius: 6px !important;
        padding: 0.4rem 0.625rem !important;
        margin-bottom: 0.1rem !important;
        transition: background 0.1s ease !important;
    }
    [data-testid="stSidebarNavLink"] p,
    [data-testid="stSidebarNavLink"] span {
        font-size: 0.825rem !important;
        color: #4B5563 !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
    }
    [data-testid="stSidebarNavLink"]:hover {
        background: #EFEFEF !important;
    }
    [data-testid="stSidebarNavLink"]:hover p,
    [data-testid="stSidebarNavLink"]:hover span {
        color: #0A0A0A !important;
    }

    /* Active nav item — strong, obvious */
    [data-testid="stSidebarNavLink"][aria-current="page"] {
        background: #EFEFEF !important;
        border-radius: 6px !important;
    }
    [data-testid="stSidebarNavLink"][aria-current="page"] p,
    [data-testid="stSidebarNavLink"][aria-current="page"] span {
        color: #0A0A0A !important;
        font-weight: 600 !important;
    }

    /* Hide chrome */
    #MainMenu { visibility: hidden; }
    footer    { visibility: hidden; }
    header    { visibility: hidden; }

    /* Content area */
    .block-container {
        padding-top: 1.5rem !important;
        padding-bottom: 3rem !important;
        max-width: 900px !important;
    }

    /* Streamlit default metric — reset so custom HTML takes over */
    [data-testid="metric-container"] {
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
        box-shadow: none !important;
    }

    /* Dividers */
    hr {
        border: none !important;
        border-top: 1px solid #F3F4F6 !important;
        margin: 2.25rem 0 !important;
    }

    /* Tame Streamlit info/alert boxes */
    [data-testid="stAlert"] {
        background: #F8F9FA !important;
        border: 1px solid #E5E7EB !important;
        border-radius: 4px !important;
        color: #374151 !important;
        font-size: 0.875rem !important;
    }
    [data-testid="stAlert"] svg { display: none; }

    /* Caption text */
    .stCaption, [data-testid="stCaptionContainer"] {
        font-size: 0.78rem !important;
        color: #9CA3AF !important;
    }

    </style>
    """, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Hero band — the dominant product moment
# ---------------------------------------------------------------------------
def hero_band(headline: str, subline: str) -> None:
    today = date.today().strftime("%-d %b %Y").upper()
    st.markdown(f"""
    <div style="background:{INK};color:#FFFFFF;padding:2.5rem 2.5rem 2rem 2.5rem;
                border-radius:10px;margin-bottom:2rem;">
      <div style="font-size:0.6rem;letter-spacing:0.18em;text-transform:uppercase;
                  color:#4B5563;margin-bottom:1rem;font-weight:500;">
        BERLIN · PM MARKET · {today}
      </div>
      <div style="font-size:1.6rem;font-weight:700;line-height:1.4;
                  max-width:560px;letter-spacing:-0.02em;color:#F9FAFB;">
        {headline}
      </div>
      <div style="font-size:0.875rem;color:#6B7280;margin-top:0.875rem;
                  max-width:500px;line-height:1.65;font-weight:400;">
        {subline}
      </div>
    </div>
    """, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Section label — small uppercase category marker
# ---------------------------------------------------------------------------
def section_label(text: str) -> None:
    st.markdown(
        f'<div style="font-size:0.6rem;font-weight:600;letter-spacing:0.15em;'
        f'text-transform:uppercase;color:{MUTED};margin:2rem 0 0.5rem 0;">'
        f'{text}</div>',
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Insight — editorial callout, leads each data section
# ---------------------------------------------------------------------------
def insight(text: str) -> None:
    st.markdown(
        f'<p style="font-size:1rem;font-weight:600;color:{INK};'
        f'border-left:2px solid {INK};padding-left:0.875rem;'
        f'margin:0.5rem 0 1rem 0;line-height:1.5;">'
        f'{text}</p>',
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Stat grid — large bold numbers, used instead of st.metric
# ---------------------------------------------------------------------------
def stat_grid(items: list) -> None:
    """
    items = [{"value": str|int, "label": str, "sub": str (optional)}, ...]
    Renders as a flex row of large-number stats.
    HTML must be blank-line-free — CommonMark exits an HTML block at the first blank line.
    """
    html = '<div style="display:flex;gap:0;margin:1.5rem 0 2rem 0;">'
    for i, item in enumerate(items):
        pad_l  = "1.5rem" if i > 0 else "0"
        border = f"border-left:1px solid {BORDER};" if i > 0 else ""
        sub    = (
            f'<div style="font-size:0.78rem;color:{MUTED};margin-top:0.2rem;">{item["sub"]}</div>'
            if item.get("sub") else ""
        )
        html += (
            f'<div style="flex:1;padding:0 1.5rem 0 {pad_l};{border}">'
            f'<div style="font-size:2.4rem;font-weight:700;color:{INK};letter-spacing:-0.03em;line-height:1;">{item["value"]}</div>'
            f'<div style="font-size:0.6rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:{SUB};margin-top:0.5rem;">{item["label"]}</div>'
            f'{sub}'
            f'</div>'
        )
    html += "</div>"
    st.markdown(html, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Comparison bars — replaces donut charts
# ---------------------------------------------------------------------------
def comparison_bars(items: list, total: int = None) -> None:
    """
    items = [{"label": str, "count": int, "color": str}, ...]
    Renders horizontal proportion bars. More informative than donuts.
    """
    if total is None:
        total = sum(i["count"] for i in items if i["count"] > 0)

    html = '<div style="margin:0.75rem 0 1.5rem;">'
    for item in items:
        if item["count"] == 0:
            continue
        pct    = (item["count"] / total * 100) if total > 0 else 0
        fill_w = max(pct, 0.5)
        html += (
            f'<div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.9rem;">'
            f'<div style="width:160px;font-size:0.825rem;color:{INK2};flex-shrink:0;font-weight:500;line-height:1.3;">{item["label"]}</div>'
            f'<div style="flex:1;background:#F3F4F6;border-radius:3px;height:7px;min-width:80px;">'
            f'<div style="width:{fill_w:.1f}%;background:{item["color"]};height:100%;border-radius:3px;"></div>'
            f'</div>'
            f'<div style="width:80px;font-size:0.825rem;text-align:right;flex-shrink:0;">'
            f'<span style="font-weight:600;color:{INK};">{item["count"]}</span>'
            f'<span style="color:{MUTED};"> · {pct:.0f}%</span>'
            f'</div>'
            f'</div>'
        )
    html += "</div>"
    st.markdown(html, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Data gap notice — calm, not an error
# ---------------------------------------------------------------------------
def data_gap_notice(message: str) -> None:
    st.markdown(
        f'<div style="background:#F8F9FA;border:1px solid #F3F4F6;border-radius:6px;'
        f'padding:1rem 1.25rem;margin:0.5rem 0 1.5rem;">'
        f'<p style="margin:0;color:{SUB};font-size:0.875rem;line-height:1.6;">'
        f'{message}</p></div>',
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Plotly chart config — minimal, premium
# ---------------------------------------------------------------------------

# Apply to fig.update_xaxes() / fig.update_yaxes() calls.
# Intentionally minimal — tickfont and gridcolor are chart-specific, set them per call.
AXIS_STYLE = dict(
    gridwidth=1,
    zeroline=False,
    showline=False,
)


def chart_cfg(height: int = 300) -> dict:
    """
    Base Plotly layout dict. Does NOT include xaxis, yaxis, or margin —
    those vary per chart. Pass them explicitly to update_layout() alongside
    **chart_cfg() to avoid duplicate-keyword TypeErrors.
    """
    return dict(
        font=dict(family="Inter, -apple-system, sans-serif", color=INK2, size=11),
        plot_bgcolor="rgba(0,0,0,0)",
        paper_bgcolor="rgba(0,0,0,0)",
        height=height,
        hoverlabel=dict(
            bgcolor="white", bordercolor=BORDER,
            font=dict(size=12, family="Inter, sans-serif"),
        ),
    )
