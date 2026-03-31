
import os
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Query schema information using RPC or just try a simple select
try:
    result = db.table("jobs").select("pipeline_run_at").limit(1).execute()
    print("Column 'pipeline_run_at' EXISTS.")
except Exception as e:
    print(f"Column 'pipeline_run_at' does NOT exist or error: {e}")

# List all columns we can see
try:
    # This is a bit of a hack to see columns via a failing query or something
    # but let's just try to select * and see what we get
    result = db.table("jobs").select("*").limit(1).execute()
    if result.data:
        print(f"Columns in 'jobs' table: {list(result.data[0].keys())}")
except Exception as e:
    print(f"Error listing columns: {e}")
