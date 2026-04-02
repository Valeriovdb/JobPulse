"""
JobPulse pipeline configuration.
All values read from environment variables with sensible defaults.
Loads .env from the project root automatically when present.
"""
import os
from datetime import date

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not installed — rely on environment variables being set externally

# --- Supabase ---
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# --- OpenAI ---
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# --- JSearch (via RapidAPI) ---
RAPIDAPI_KEY = os.environ["RAPIDAPI_KEY"]
JSEARCH_HOST = os.getenv("JSEARCH_HOST", "jsearch.p.rapidapi.com")

# --- Pipeline behaviour ---
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"
ACTIVE_GRACE_DAYS = int(os.getenv("ACTIVE_GRACE_DAYS", "1"))
CLASSIFIER_VERSION = os.getenv("CLASSIFIER_VERSION", "v3")

# --- JSearch budget ---
# Free tier: 200 requests/month. Reserve 40 for debugging/manual use.
# Scheduled budget: 160 / 22 working days ≈ 7 requests per run.
JSEARCH_REQUESTS_PER_RUN = int(os.getenv("JSEARCH_REQUESTS_PER_RUN", "7"))
JSEARCH_MONTHLY_LIMIT = int(os.getenv("JSEARCH_MONTHLY_LIMIT", "200"))
JSEARCH_MONTHLY_RESERVE = int(os.getenv("JSEARCH_MONTHLY_RESERVE", "40"))
JSEARCH_MONTHLY_SCHEDULED_BUDGET = JSEARCH_MONTHLY_LIMIT - JSEARCH_MONTHLY_RESERVE  # 160

# --- JSearch query config ---
# 5 fixed core queries + 1 best-query page 2 + 1 rotating exploratory query = 7 max.
JSEARCH_CORE_QUERIES = [
    "product manager Berlin",
    "senior product manager Berlin",
    "product manager remote Germany",
    "senior product manager remote Germany",
    "technical product manager Germany",
]

# The query for which we fetch page 2 (index into JSEARCH_CORE_QUERIES).
JSEARCH_PAGE2_QUERY_INDEX = int(os.getenv("JSEARCH_PAGE2_QUERY_INDEX", "0"))

# Rotating exploratory queries, one per weekday (Mon=0 … Fri=4).
JSEARCH_ROTATING_QUERIES = {
    0: "AI product manager Germany",          # Monday
    1: "growth product manager Germany",       # Tuesday
    2: "platform product manager Germany",     # Wednesday
    3: "data product manager Germany",         # Thursday
    4: "fintech product manager Germany",      # Friday
}

JSEARCH_DATE_POSTED = os.getenv("JSEARCH_DATE_POSTED", "3days")

# --- Arbeitnow config ---
ARBEITNOW_TAGS = ["product-management"]  # tag filter on Arbeitnow API
ARBEITNOW_MAX_PAGES = int(os.getenv("ARBEITNOW_MAX_PAGES", "3"))

# --- Source priority ---
# Higher number = higher priority. Used in cross-source deduplication.
SOURCE_PRIORITY: dict[str, int] = {
    "ats": 3,
    "arbeitnow": 2,
    "jsearch": 1,
}

# --- ATS company list ---
# Each entry: {"ats": "<platform>", "slug": "<board-slug>", "company": "<display name>"}
# Platforms: "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "gem" | "personio"
# All Greenhouse boards use boards-api.greenhouse.io regardless of where the web UI is hosted.
# Entries with "enabled": False are kept for reference but skipped at fetch time.
ATS_COMPANIES: list[dict] = [
    # Greenhouse (US) — verified
    {"ats": "greenhouse",      "slug": "hellofresh",          "company": "HelloFresh"},
    {"ats": "greenhouse",      "slug": "getyourguide",        "company": "GetYourGuide"},
    {"ats": "greenhouse",      "slug": "contentful",          "company": "Contentful"},
    {"ats": "greenhouse",      "slug": "sumup",               "company": "SumUp"},
    {"ats": "greenhouse",      "slug": "solarisbank",         "company": "Solaris"},
    {"ats": "greenhouse",      "slug": "commercetools",       "company": "commercetools"},
    {"ats": "greenhouse",      "slug": "wefoxgroup",          "company": "wefox"},
    {"ats": "greenhouse",      "slug": "n26",                 "company": "N26"},          # token unconfirmed; try n26bank if this 404s
    {"ats": "greenhouse",      "slug": "raisin",              "company": "Raisin"},
    # Greenhouse — unverified (disabled)
    {"ats": "greenhouse",      "slug": "adjust",              "company": "Adjust",        "enabled": False},  # ATS family unconfirmed
    {"ats": "greenhouse",      "slug": "forto",               "company": "Forto",         "enabled": False},  # ATS family unconfirmed
    # Ashby — verified (clientname = the slug used in jobs.ashbyhq.com/{clientname})
    {"ats": "ashby",           "slug": "taxfix.com",          "company": "Taxfix"},
    {"ats": "ashby",           "slug": "billie",              "company": "Billie"},
    {"ats": "ashby",           "slug": "ecosia.org",          "company": "Ecosia"},
    # Ashby — unverified (disabled)
    {"ats": "ashby",           "slug": "personio",            "company": "Personio",      "enabled": False},
    {"ats": "ashby",           "slug": "mambu",               "company": "Mambu",         "enabled": False},
    # SmartRecruiters — verified
    {"ats": "smartrecruiters", "slug": "DeliveryHero",        "company": "Delivery Hero"},
    {"ats": "smartrecruiters", "slug": "AUTO1Group",          "company": "Auto1 Group"},
    {"ats": "smartrecruiters", "slug": "ScalableGmbH",        "company": "Scalable Capital"},
    {"ats": "smartrecruiters", "slug": "Omio1",               "company": "Omio"},
    # Gem — verified
    {"ats": "gem",             "slug": "senndertechnologies-gmbh", "company": "sennder"},
    # Personio (XML feed) — verified
    {"ats": "personio",        "slug": "clark",               "company": "Clark"},
]
