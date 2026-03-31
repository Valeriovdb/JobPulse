
import os
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Query English jobs stats
result = (
    db.table("jobs")
    .select("company_name, job_title_raw, german_requirement")
    .eq("posting_language", "en")
    .execute()
)

stats = {}
for r in result.data:
    req = r['german_requirement']
    stats[req] = stats.get(req, 0) + 1

print("English Jobs German Requirement Stats (AFTER RE-ENRICHMENT):")
for req, count in stats.items():
    print(f"{req}: {count}")

# Check for a specific example of "must" or "plus"
result_must = (
    db.table("jobs")
    .select("company_name, job_title_raw, german_requirement")
    .eq("posting_language", "en")
    .neq("german_requirement", "not_mentioned")
    .limit(10)
    .execute()
)
print("\nEnglish jobs with German must/plus:")
for j in result_must.data:
    print(f"Company: {j['company_name']}, Title: {j['job_title_raw']}, Req: {j['german_requirement']}")
