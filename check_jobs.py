
import os
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Query last 10 jobs
result = (
    db.table("jobs")
    .select("job_id, external_job_key, company_name, job_title_raw, first_seen_date, created_at, is_active")
    .order("created_at", desc=True)
    .limit(10)
    .execute()
)

print("Recent Jobs:")
for job in result.data:
    print(f"ID: {job['job_id']}, Key: {job['external_job_key']}, Company: {job['company_name']}, Title: {job['job_title_raw']}, First Seen: {job['first_seen_date']}, Created At: {job['created_at']}, Active: {job['is_active']}")
