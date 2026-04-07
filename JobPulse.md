# JobPulse — Product & Project Context

> This file is the single source of truth for the JobPulse project.
> It covers the concept, product decisions, architecture, current state, and open questions.
> Use this to restore context at the start of any new session.

---

## What is JobPulse

JobPulse is a **portfolio project** built for Senior Product Manager job applications.

It is a lightweight **job-market intelligence product** that turns daily PM job data into actionable analytics for job seekers targeting Germany — specifically Berlin, remote Germany, English-speaking PM roles, and roles where German may or may not be required.

The intended audience for the live product is any PM job seeker looking at the German market. The intended audience for the portfolio is recruiters and hiring managers evaluating PM candidates.

A recruiter should understand the value in under two minutes.

---

## Why this project exists

The original version was built in n8n and evolved into an unmaintainable flow. It was rebuilt from scratch to produce a clean, explainable, portfolio-grade codebase that demonstrates:

- Strong problem framing
- Disciplined scope
- Data product thinking
- Clear metric definitions
- Honest methodology
- AI-assisted execution with judgment

---

## The four product questions

Everything in the product maps back to one of these:

### 1. Where should I look?
- Active jobs by source
- Exclusive jobs by source (only available there)
- Source overlap
- Top hiring companies
- Company-site-only opportunities

### 2. When should I apply?
- New jobs today / last 7 days
- Job age distribution
- How long jobs stay active
- Disappearing-fast patterns
- Reposting patterns (if feasible)

### 3. What does the market actually require?
- Postings in German
- English postings where German is required
- English postings where German is nice-to-have
- English postings with no German requirement
- Seniority split
- Berlin vs remote Germany split

### 4. How is the market evolving?
- Active jobs over time
- Daily/weekly new jobs
- Trends by source, seniority, language/German requirement
- Employer activity patterns

---

## Target scope (MVP)

- Germany only (Berlin + remote Germany focus)
- English-speaking PM roles (German optional)
- Senior and mid-level PM roles (all seniority tracked)
- Daily data refresh
- No login required (public product)

---

## Data sources

| Source | Status | Notes |
|---|---|---|
| Direct ATS | Live | Primary source. Queries Greenhouse, Ashby, SmartRecruiters, Gem, Personio APIs directly for ~20 known Berlin companies |
| JSearch (via RapidAPI) | Live | Aggregates LinkedIn, Indeed, Glassdoor, and others |
| Arbeitnow | Live | Free API, Germany/English-focused, no key needed |

**Source priority**: ATS > Arbeitnow > JSearch. When the same role appears across sources, the ATS record wins.

### ATS coverage
Direct ATS fetcher covers: HelloFresh, GetYourGuide, Contentful, SumUp, Solaris, commercetools, wefox, N26, Raisin, Taxfix, Billie, Ecosia, Delivery Hero, Auto1 Group, Scalable Capital, Omio, sennder, Clark. Additional companies can be added to `pipeline/config.py`.

### Potential future sources (not implemented)
- Adzuna (free tier, good German coverage, requires registration)
- Remotive (free, remote-only globally)
- RSS feeds from StepStone / Xing (fragile, not recommended)

---

## Architecture

### Stack
- **Pipeline**: Python scripts
- **Scheduler**: GitHub Actions (daily at 07:00 UTC, manual trigger also supported)
- **Database**: Supabase
- **LLM enrichment**: OpenAI (gpt-4o-mini)
- **Frontend**: Next.js 16 (App Router) — deployed on Vercel at jobpulse1.vercel.app

### Repository
- GitHub: `https://github.com/Valeriovdb/jobpulse`
- Local path: `~/Documents/Notes/03 - Projects/JobPulse/`

### File structure
```
jobpulse/
├── migrations/                      # Supabase schema migrations
├── pipeline/
│   ├── config.py                    # All env var config (incl. ATS_COMPANIES list)
│   ├── db.py                        # Supabase client singleton
│   ├── ingest.py                    # Main ingestion orchestrator
│   ├── export_data.py               # Exports JSON artifacts to data/frontend/
│   ├── normalize.py                 # Deterministic field normalization
│   ├── fetchers/
│   │   ├── ats.py                   # Direct ATS fetcher (Greenhouse, Ashby, SmartRecruiters, Gem, Personio)
│   │   ├── jsearch.py               # JSearch adapter
│   │   └── arbeitnow.py             # Arbeitnow adapter (title-filtered)
│   ├── classifiers/
│   │   └── llm.py                   # OpenAI enrichment
│   └── insights/
│       └── copy_service.py          # LLM-generated chart titles/subtitles
├── data/frontend/                   # Pre-computed JSON read by the frontend
│   ├── jobs.json                    # Per-job records (last 180 days, incl. years_experience_min)
│   ├── distributions.json           # Active-job distributions (seniority, work mode, etc.)
│   ├── overview.json                # Top-level KPIs
│   ├── timeseries.json              # Daily snapshot series
│   ├── experience.json              # Experience tag data
│   ├── metadata.json                # Last refresh date, scope
│   └── chart_insights.json          # LLM-generated chart copy
├── web/                             # Next.js frontend (deployed on Vercel)
│   └── src/app/                     # App Router pages: /, /market, /trends, /about
├── .github/workflows/
│   └── ingest.yml                   # Daily schedule + manual trigger
├── requirements.txt
└── .env.example
```

---

## Database schema (7 tables)

| Table | Purpose |
|---|---|
| `ingestion_runs` | Log each pipeline execution (start, status, counts, errors) |
| `raw_job_records` | Full API payload per job per run, never mutated |
| `jobs` | Canonical job identity (deduped across sources and runs) |
| `job_source_appearances` | Every time a job is seen, per source per run |
| `job_daily_snapshots` | Denormalized daily analytics snapshot per job |
| `classification_audit` | LLM decision log per field per job |
| `companies` | Lightweight company registry (opportunistic) |

### Key design decisions
- `external_job_key` is the single deduplication key, format: `{source_provider}::{source_job_id}`
- `jobs` table is source-agnostic canonical identity
- `job_source_appearances` enables cross-source overlap and exclusivity analysis
- `job_daily_snapshots` is denormalized for query performance — analytics reads from here
- `work_mode` is the single canonical field (removed the old `work_mode` + `remote_type` duplication)
- `classification_audit` exists for LLM transparency (currently not populated — see open questions)

---

## Field definitions (metric clarity)

| Field | Definition |
|---|---|
| `first_seen_date` | Date job first appeared in any ingestion run |
| `last_seen_date` | Most recent date job appeared in any run |
| `is_active` | `true` if `last_seen_date >= (today - ACTIVE_GRACE_DAYS)` |
| `days_online` | `last_seen_date - first_seen_date + 1` |
| `posting_language` | ISO 639-1 code of the job posting text (`en` or `de`) |
| `german_requirement: must` | German explicitly required in the posting |
| `german_requirement: plus` | German mentioned as nice-to-have / advantage |
| `german_requirement: not_mentioned` | German not referenced at all |
| `seniority` | Normalized bucket: `junior / mid / senior / lead / staff / principal / head / unknown` |
| `work_mode` | `onsite / hybrid / remote / unknown` |
| `source overlap` | Same `job_id` appearing under multiple `source_provider` values |
| `exclusive job` | `job_id` appearing under exactly one `source_provider` |
| `active grace days` | Config param (default: 1). Increase if sources are unreliable. |

---

## LLM enrichment

**Provider**: OpenAI gpt-4o-mini
**Classifier version**: `v1` (stored on each job for future re-enrichment)

**Fields classified by LLM**:
- `german_requirement` (must / plus / not_mentioned)
- `pm_type` (core_pm / growth / technical / data / other)
- `b2b_saas` (boolean)
- `ai_focus` (role involves building AI/ML products)
- `ai_skills` (role requires AI/ML knowledge)
- `tools_skills` (list of tools named in posting, max 10)

**Logic**: deterministic rules first, LLM handles what rules cannot. Language detection is rule-based (German token frequency), not LLM.

**Enrichment only runs on jobs with a description_text** of at least 80 characters. Jobs without descriptions are persisted without enrichment.

---

## Active/inactive logic

A job is active if its `last_seen_date >= (run_date - ACTIVE_GRACE_DAYS)`.

`ACTIVE_GRACE_DAYS` defaults to 1 (a job must appear in each daily run).
Can be increased to 2–3 if a source proves unreliable on some days.

The `mark_stale_jobs_inactive` SQL function is called at the end of each run.

---

## Pipeline run flow

**Ingestion** (`pipeline/ingest.py`):
1. Open `ingestion_runs` record
2. Fetch from Direct ATS (Greenhouse, Ashby, SmartRecruiters, Gem, Personio — ~20 companies)
3. Fetch from Arbeitnow (tag: product-management, title-filtered)
4. Fetch from JSearch if monthly budget allows (4 queries × up to 3 pages)
5. Cross-source deduplication: ATS > Arbeitnow > JSearch
6. Normalize all records (seniority, location, work mode, language)
7. LLM-enrich jobs that have description text (≥80 chars)
8. Upsert to `jobs`, `raw_job_records`, `job_source_appearances`
9. Write `job_daily_snapshots`
10. Call `mark_stale_jobs_inactive`
11. Close `ingestion_runs` record

**Export** (`pipeline/export_data.py`):
Runs after ingestion. Writes all `data/frontend/*.json` files read by the Next.js frontend:
- `jobs.json` — per-job records for last 180 days (used by Breakdown tab filters)
- `distributions.json` — active-job aggregations
- `overview.json`, `timeseries.json`, `experience.json`, `metadata.json`
- `chart_insights.json` — LLM-generated chart titles (cached by data hash)

---

## Current state (as of 2026-04-07)

- Pipeline is live with three sources: Direct ATS (primary), Arbeitnow, JSearch
- ATS fetcher covers ~20 Berlin tech companies via Greenhouse, Ashby, SmartRecruiters, Gem, Personio
- GitHub Actions runs daily at 07:00 UTC; export_data.py runs after ingestion
- Frontend is live at jobpulse1.vercel.app
- Deployed on Vercel (Next.js 16 App Router, static pages + one API route for drill-down)

### Frontend information architecture (4 tabs)

#### Overview
LLM-generated hero title + body from market snapshot. Shows language access, work mode, seniority distribution, AI signal. Data: currently active jobs only.

#### Breakdown
Structural market patterns with filters (time window 30/60/90/180d, seniority, role family, language, German req, work mode). Charts: seniority × experience bubble, domain backgrounds, company concentration, work setup, industry. Data: jobs posted in selected rolling window, computed from `jobs.json`.

#### Trends
Time-series charts: market activity, new roles/day, seniority mix over time, German req over time. Filter: time range, location, seniority, language. Data: historical daily snapshots.

#### About
Product description, scope, sources, classification logic, methodology notes.

---

## Open questions and unimplemented items

### Not yet implemented
- `classification_audit` table is defined but the pipeline does not yet write to it (LLM decisions are not logged per-field). To implement: write one row per enriched field per job to `classification_audit` inside `classifiers/llm.py`.
- `companies` table is defined but not populated. Could be filled opportunistically from `company_name` during ingestion.
- Repost detection logic (`job_repost_events` table was considered but not created)
- Re-enrichment flow: when `CLASSIFIER_VERSION` bumps, re-run LLM on all jobs with an older version
- Salary data: fields exist in the schema but JSearch rarely provides structured salary data for Germany. Arbeitnow sometimes includes it. Not populated yet.

### Hanging decisions
- **Arbeitnow title filter**: currently regex-based on `product manager|product owner|head of product` etc. May need tuning as more data accumulates.
- **`active_grace_days`**: set to 1, but if either source is unreliable on weekends this may create false inactivity. Monitor over first 2 weeks.
- **Cross-source canonical identity**: currently `external_job_key` is source-scoped (one job appearing on both JSearch and Arbeitnow gets two records). True cross-source deduplication (company + normalized title matching) is not implemented. Acceptable for MVP.
- **JSearch query coverage**: 4 queries (PM Berlin, Senior PM Berlin, PM remote Germany, Senior PM remote Germany). May miss niche titles (CPO, Group PM, Staff PM). Can extend queries later.
- **LLM enrichment speed**: sequential calls (~3s each). At 100 jobs/day this is ~5 minutes max. Acceptable for a daily batch job. If it becomes a problem, switch to async with `asyncio` + `openai` async client.
- **GitHub Secrets**: need to be added manually in repo settings before GitHub Actions can run. Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `RAPIDAPI_KEY`.

---

## Environment variables

See `.env.example` for the full list. Required:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (full DB access) |
| `OPENAI_API_KEY` | OpenAI API key |
| `RAPIDAPI_KEY` | RapidAPI key for JSearch |

Optional with defaults:

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model |
| `DRY_RUN` | `false` | Fetch+normalize without writing to DB |
| `ACTIVE_GRACE_DAYS` | `1` | Days before a job is marked inactive |
| `CLASSIFIER_VERSION` | `v1` | LLM classifier version tag |
| `JSEARCH_MAX_PAGES` | `3` | Pages per JSearch query |
| `ARBEITNOW_MAX_PAGES` | `3` | Pages per Arbeitnow tag |

---

## To run locally

```bash
cd ~/Documents/Notes/03\ -\ Projects/JobPulse
source .venv/bin/activate
# copy .env.example to .env and fill in credentials

# dry run (no DB writes)
python -m pipeline.ingest --dry-run

# live run
python -m pipeline.ingest
```
