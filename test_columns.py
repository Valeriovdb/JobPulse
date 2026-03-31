
import os
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

print("Checking 'ingestion_runs' table...")
try:
    res = db.table("ingestion_runs").select("jsearch_requests_used").limit(1).execute()
    print("SUCCESS: Found 'jsearch_requests_used'")
except Exception as e:
    print(f"FAILURE: {e}")

print("\nChecking 'jobs' table...")
try:
    res = db.table("jobs").select("pipeline_run_at").limit(1).execute()
    print("SUCCESS: Found 'pipeline_run_at'")
except Exception as e:
    print(f"FAILURE: {e}")
