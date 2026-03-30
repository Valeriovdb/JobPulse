"""
Quick script to verify all ATS slugs in config.ATS_COMPANIES
by hitting each company's job board URL and checking for a 200 response.

Usage:
  python -m pipeline.scripts.verify_ats_slugs
"""
import os
import sys
import time

os.environ.setdefault("SUPABASE_URL", "x")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "x")
os.environ.setdefault("OPENAI_API_KEY", "x")
os.environ.setdefault("RAPIDAPI_KEY", "x")

import requests
from pipeline.config import ATS_COMPANIES

BOARD_URLS = {
    "greenhouse":      "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
    "lever":           "https://api.lever.co/v0/postings/{slug}?mode=json",
    "ashby":           None,  # POST endpoint, tested separately
    "smartrecruiters": "https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=1",
}

print(f"{'Company':<25} {'ATS':<16} {'Slug':<28} {'Status'}")
print("-" * 80)

ok = 0
fail = 0

for entry in ATS_COMPANIES:
    platform = entry["ats"]
    slug = entry["slug"]
    company = entry["company"]

    if platform == "ashby":
        try:
            resp = requests.post(
                "https://api.ashbyhq.com/posting-public.listActive",
                json={"organizationHostedJobsPageName": slug},
                timeout=10,
            )
            status = resp.status_code
            note = f"OK ({len(resp.json().get('results', []))} jobs)" if status == 200 else resp.text[:60]
        except Exception as e:
            status = 0
            note = str(e)[:60]
    elif platform in BOARD_URLS:
        url = BOARD_URLS[platform].format(slug=slug)
        try:
            resp = requests.get(url, timeout=10)
            status = resp.status_code
            if status == 200:
                if platform == "greenhouse":
                    count = len(resp.json().get("jobs", []))
                elif platform == "lever":
                    count = len(resp.json()) if isinstance(resp.json(), list) else "?"
                elif platform == "smartrecruiters":
                    count = resp.json().get("totalFound", "?")
                else:
                    count = "?"
                note = f"OK ({count} total jobs)"
            else:
                note = resp.text[:60]
        except Exception as e:
            status = 0
            note = str(e)[:60]
    else:
        status = 0
        note = "unknown platform"

    icon = "✓" if status == 200 else "✗"
    print(f"{icon} {company:<24} {platform:<16} {slug:<28} {status}  {note}")
    if status == 200:
        ok += 1
    else:
        fail += 1

    time.sleep(0.3)  # be polite

print()
print(f"Results: {ok} OK, {fail} failed")
if fail:
    print("Fix the failed slugs in pipeline/config.py ATS_COMPANIES list")
