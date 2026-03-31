
import os
from datetime import date
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

today = date.today()
month_start = today.replace(day=1).isoformat()

resp = (
    db.table("ingestion_runs")
    .select("jsearch_requests_used")
    .gte("run_date", month_start)
    .execute()
)

total_used = sum(r["jsearch_requests_used"] for r in resp.data)
print(f"JSearch requests used this month ({month_start}): {total_used}")
print(f"Monthly Limit: 200")
