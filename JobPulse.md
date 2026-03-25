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
| JSearch (via RapidAPI) | Live | Aggregates broadly across job boards |
| Arbeitnow | Live | Free API, Germany/English-focused, no key needed |

### Why Arbeitnow
Arbeitnow is specifically focused on Germany and English-speaking roles. It is a strong complement to JSearch. Added after the n8n rebuild.

### Source strategy
- Design supports multiple source types (aggregators, job boards, company pages, ATS)
- Source priority for attribution: company site first → LinkedIn → others
- This matters for apply links, overlap logic, and source quality interpretation

### Potential future sources (not implemented)
- Adzuna (free tier, good German coverage, requires registration)
- Remotive (free, remote-only globally)
- RSS feeds from StepStone / Xing (fragile, not recommended)

---

## Architecture

### Stack
- **Pipeline**: Python scripts
- **Scheduler**: GitHub Actions (daily at 07:00 UTC, manual trigger also supported)
- **Database**: Supabase (existing project reused)
- **LLM enrichment**: OpenAI (gpt-4o-mini)
- **Frontend**: Streamlit — local first, then Streamlit Cloud for public deployment

### Repository
- GitHub: `https://github.com/Valeriovdb/jobpulse`
- Local path: `~/Documents/Notes/03 - Projects/JobPulse/`

### File structure
```
jobpulse/
├── migrations/
│   └── 001_initial_schema.sql       # Full schema, run once against Supabase
├── pipeline/
│   ├── config.py                    # All env var config
│   ├── db.py                        # Supabase client singleton
│   ├── ingest.py                    # Main orchestrator
│   ├── normalize.py                 # Deterministic field normalization
│   ├── fetchers/
│   │   ├── jsearch.py               # JSearch adapter
│   │   └── arbeitnow.py             # Arbeitnow adapter (title-filtered)
│   └── classifiers/
│       └── llm.py                   # OpenAI enrichment
├── .github/workflows/
│   └── ingest.yml                   # Daily schedule + manual trigger
├── requirements.txt
├── .env.example
└── .env                             # Real credentials (gitignored)
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

1. Open `ingestion_runs` record
2. Fetch from JSearch (4 queries × up to 3 pages)
3. Fetch from Arbeitnow (tag: product-management, title-filtered)
4. Normalize all records (seniority, location, work mode, language, publisher)
5. LLM-enrich jobs that have description text
6. Upsert to `jobs` (new → insert, seen before → update last_seen_date + enriched fields)
7. Insert raw payloads to `raw_job_records`
8. Upsert to `job_source_appearances`
9. Write `job_daily_snapshots`
10. Call `mark_stale_jobs_inactive`
11. Close `ingestion_runs` record with final status and counts

---

## Current state (as of 2026-03-25)

- Pipeline is live and tested
- First real run completed: 9 jobs ingested (5 JSearch, 4 Arbeitnow), 4 LLM-enriched
- GitHub Actions workflow is in place (triggers daily at 07:00 UTC)
- Supabase schema is live with new 7-table structure
- Frontend: not yet started

---

## Frontend plan

**Framework**: Streamlit
**Deployment**: Local first → Streamlit Cloud (public)

**Important**: Before any frontend implementation, have a strategy and UX discussion. Do not rush into building.

### Planned information architecture (5 pages)

#### Page 1 — Overview
KPIs: active jobs, new today, new last 7 days, median posting age
Charts: active jobs over time, daily new jobs, language/German split, seniority split, source split

#### Page 2 — Where to Look
Active jobs by source, exclusive jobs by source, source overlap, top companies by source mix, company-site-only opportunities

#### Page 3 — When to Apply
Age distribution, time-online distribution, disappearing-fast indicators, repost analysis, newly seen jobs by filter

#### Page 4 — Market Requirements
German requirement split, posting language trends, seniority trends, Berlin / remote Germany trends

#### Page 5 — Methodology
Source list, update cadence, active-status logic, deduplication logic, classification rules, limitations

The methodology page is critical for trust and portfolio quality.

### UX direction
- Modern, minimal, clean, analytical, intentional
- Prefer KPI cards, clean line charts, simple distributions, clear text takeaways
- Avoid: clutter, chart-first design, dashboard-template aesthetics, too many charts

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
