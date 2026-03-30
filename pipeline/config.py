"""
JobPulse pipeline configuration.
All values read from environment variables with sensible defaults.
"""
import os

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
CLASSIFIER_VERSION = os.getenv("CLASSIFIER_VERSION", "v1")

# --- JSearch query config ---
# These queries are sent to JSearch. Two queries cover both seniority tiers.
JSEARCH_QUERIES = [
    "Product Manager Berlin Germany",
    "Senior Product Manager Berlin Germany",
    "Product Manager remote Germany",
    "Senior Product Manager remote Germany",
]
JSEARCH_MAX_PAGES = int(os.getenv("JSEARCH_MAX_PAGES", "3"))  # pages per query
JSEARCH_DATE_POSTED = os.getenv("JSEARCH_DATE_POSTED", "3days")

# --- Arbeitnow config ---
ARBEITNOW_TAGS = ["product-management"]  # tag filter on Arbeitnow API
ARBEITNOW_MAX_PAGES = int(os.getenv("ARBEITNOW_MAX_PAGES", "3"))
