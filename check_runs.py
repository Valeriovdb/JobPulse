
import os
from datetime import date, datetime, timezone
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Query last 5 runs
result = (
    db.table("ingestion_runs")
    .select("*")
    .order("started_at", desc=True)
    .limit(5)
    .execute()
)

print("Recent Ingestion Runs:")
for run in result.data:
    print(f"ID: {run['run_id']}, Date: {run['run_date']}, Status: {run['status']}, Dry Run: {run['dry_run']}, Started: {run['started_at']}, Completed: {run['completed_at']}, Fetched: {run['rows_fetched']}, New: {run['rows_new']}")

# Check for jobs added today (March 30, 2026)
today = "2026-03-30"
jobs_result = (
    db.table("jobs")
    .select("count", count="exact")
    .eq("first_seen_date", today)
    .execute()
)

print(f"\nJobs first seen on {today}: {jobs_result.count}")

# Check for jobs updated today
# Assuming there is a field that tracks when a job was last seen or updated.
# Let me check the schema of 'jobs' table.
# For now, let's just count total active jobs.
active_jobs = (
    db.table("jobs")
    .select("count", count="exact")
    .eq("is_active", True)
    .execute()
)
print(f"Total Active Jobs: {active_jobs.count}")
