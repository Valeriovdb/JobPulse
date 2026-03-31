
import os
import re
from pipeline.db import get_client
from pipeline.normalize import _normalize_seniority

def run():
    db = get_client()
    res = db.table("jobs").select("job_id, job_title_raw, seniority").eq("is_active", True).execute()
    
    updated = 0
    for job in res.data:
        new_seniority = _normalize_seniority(job["job_title_raw"])
        if new_seniority != job["seniority"]:
            db.table("jobs").update({"seniority": new_seniority}).eq("job_id", job["job_id"]).execute()
            updated += 1
            print(f"Updated: '{job['job_title_raw']}' -> {new_seniority} (was {job['seniority']})")
            
    print(f"Total updated: {updated}/{len(res.data)}")

if __name__ == "__main__":
    run()
