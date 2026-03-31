# JobPulse — Claude Ingestion Brief

## Context

You are rebuilding an existing project called **JobPulse**.

This is a **portfolio project for Senior Product Manager applications**.  
The goal is to turn daily Product Manager job data into a polished **job-market intelligence product** for Germany, especially:
- Berlin
- remote Germany
- English-speaking PM roles
- roles where German may or may not be required

## Critical instruction

- **Reuse the existing Supabase project**
- **Reuse the already configured APIs and credentials**
- **Do not preserve the current n8n implementation as the technical foundation**
- Treat the current n8n workflow only as a clue for the existing business logic and field transformations
- **Start from scratch on architecture, pipeline implementation, and frontend**
- Preserve useful concepts, not the old orchestration structure

The current n8n flow became too messy to maintain, reason about, or present as a strong portfolio project.

---

## Why this rebuild is happening

The current system was built in n8n and evolved into a brittle flow with too many opaque transformation steps.

The workflow currently includes logic such as:
- scheduled trigger
- config
- JSearch PM query
- JSearch Senior PM query
- flattening result sets
- merging results
- local cleanup
- field normalization
- duplicate removal
- conditional LLM enrichment
- parsing LLM enrichment
- merging original plus LLM output
- safety checks
- creating ingestion run
- attaching run IDs and dates
- creating daily snapshots
- guarding before upsert
- building `jobs_master` rows
- upserting to Supabase

That logic is useful as **business context**, but not as a target technical pattern.

The rebuild should produce a **clean, maintainable, explainable codebase**.

---

## Product goal

Build JobPulse as a lightweight analytics product that answers four core user questions:

### 1. Where should I look for PM jobs?
The product should show:
- source mix
- active jobs by source
- exclusive company-site jobs
- overlap across sources
- top hiring companies
- which sources produce unique opportunities

### 2. When should I apply?
The product should show:
- new jobs today
- new jobs in last 7 days
- job age distribution
- how long jobs stay active
- disappearing-fast patterns
- reposting patterns, if feasible

### 3. What does the market actually require?
The product should show:
- postings in German
- English postings where German is required
- English postings where German is nice-to-have
- English postings with no German requirement mentioned
- seniority split
- Berlin / remote Germany split

### 4. How is the market evolving?
The product should show:
- active jobs over time
- daily or weekly new jobs
- trends by source
- trends by seniority
- trends by language / German requirement
- employer activity patterns

---

## Product positioning

This is **not** a generic dashboard project.

It should feel like a small, thoughtful **analytics product**, not a BI prototype filled with charts.

It should demonstrate:
- strong problem framing
- disciplined scope
- data product thinking
- clear metric definitions
- honest methodology
- AI-assisted execution with judgment

A recruiter or hiring manager should understand the value in under two minutes.

---

## What to optimize for

Optimize for:
- portfolio quality
- product clarity
- trustworthiness
- explainability
- maintainability
- strong data model
- clean modern UI

Do **not** optimize for:
- maximum number of features
- preserving the old n8n logic structure
- flashy but low-value ML
- generic admin-dashboard design
- enterprise-level complexity

---

## Mandatory first step: audit before coding

Before implementing anything, do this in order:

1. Audit the current repository
2. Audit the current Supabase schema, migrations, SQL functions, views, and any RPCs
3. Identify what should be:
   - preserved
   - refactored
   - removed
4. Write a short implementation plan
5. Only then start rebuilding

Do **not** blindly preserve weak legacy decisions.

---

## Existing database context

### Current public tables
- `classification_audit`
- `ingestion_runs`
- `job_daily_snapshots`
- `jobs_master`

### Current public functions
- `mark_stale_jobs_inactive`
- `set_updated_at`
- `upsert_job_master`

### Current schema dump for context

```sql
CREATE TABLE public.classification_audit (
  audit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid,
  classifier_version text,
  field_name text NOT NULL,
  predicted_value text,
  confidence numeric,
  rationale_short text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT classification_audit_pkey PRIMARY KEY (audit_id),
  CONSTRAINT classification_audit_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs_master(job_id),
  CONSTRAINT fk_classification_audit_job_id FOREIGN KEY (job_id) REFERENCES public.jobs_master(job_id)
);

CREATE TABLE public.ingestion_runs (
  run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  date_from date,
  date_to date,
  dry_run boolean DEFAULT true,
  max_requests integer,
  max_results integer,
  status text,
  rows_fetched integer DEFAULT 0,
  rows_written integer DEFAULT 0,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ingestion_runs_pkey PRIMARY KEY (run_id)
);

CREATE TABLE public.job_daily_snapshots (
  snapshot_id uuid NOT NULL DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  job_id uuid,
  is_active boolean NOT NULL,
  days_since_first_seen integer,
  created_at timestamp with time zone DEFAULT now(),
  external_job_key text,
  ingestion_run_id uuid,
  canonical_url text,
  company_name text,
  job_title_cleaned text,
  job_title_normalized text,
  location_normalized text,
  work_mode text,
  posting_language text,
  german_requirement text,
  publisher_type text,
  has_linkedin_apply_option boolean,
  has_company_site_apply_option boolean,
  raw_posted_at timestamp with time zone,
  remote_type text,
  pm_type text,
  ai_focus boolean,
  ai_skills boolean,
  tools_skills jsonb,
  b2b_saas boolean,
  CONSTRAINT job_daily_snapshots_pkey PRIMARY KEY (snapshot_id),
  CONSTRAINT job_daily_snapshots_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs_master(job_id),
  CONSTRAINT fk_job_daily_snapshots_job_id FOREIGN KEY (job_id) REFERENCES public.jobs_master(job_id)
);

CREATE TABLE public.jobs_master (
  job_id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_job_key text UNIQUE,
  source_provider text NOT NULL,
  source_job_id text,
  canonical_url text,
  company_name text,
  company_domain text,
  job_title_raw text,
  job_title_normalized text,
  job_family text,
  seniority text,
  location_raw text,
  location_normalized text,
  is_berlin boolean DEFAULT false,
  is_remote_germany boolean DEFAULT false,
  description_text text,
  posting_language text,
  german_requirement text,
  first_seen_date date,
  last_seen_date date,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  job_title_cleaned text,
  focus_area_raw text,
  work_mode text,
  work_mode_raw text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  salary_period text,
  salary_raw text,
  pm_type text,
  ai_product_focus boolean DEFAULT false,
  ai_tools_required boolean DEFAULT false,
  ai_tools_mentioned_raw text,
  publisher_raw text,
  publisher_type text,
  has_linkedin_apply_option boolean DEFAULT false,
  has_company_site_apply_option boolean DEFAULT false,
  raw_posted_at timestamp with time zone,
  raw_query_source text,
  raw_apply_options jsonb,
  raw_payload jsonb,
  english_requirement text,
  pm_type_llm text,
  ai_focus boolean,
  ai_skills_required boolean,
  tools_skills jsonb,
  llm_confidence numeric,
  llm_version text,
  llm_extracted_at timestamp with time zone,
  llm_raw_json jsonb,
  remote_type text,
  ai_skills boolean,
  b2b_saas boolean,
  CONSTRAINT jobs_master_pkey PRIMARY KEY (job_id)
);
```

---

## Initial reaction to the current schema

The current DB is actually a decent start:
- there is a canonical-ish `jobs_master`
- there is run logging
- there are daily snapshots
- there is classification audit history

However, the likely weakness is that `jobs_master` mixes too many concerns:
- source data
- canonical job identity
- enrichment
- analytics dimensions
- raw payload storage
- some LLM-specific metadata

This should be reassessed.

### Strong recommendation
Evaluate whether to introduce a cleaner structure such as:
- raw records
- canonical jobs
- job source appearances
- daily snapshots
- classification audit
- ingestion runs

In particular, assess whether a dedicated **source appearance / multi-source layer** is needed to properly answer:
- source overlap
- source exclusivity
- company site vs LinkedIn comparisons
- reposting logic

---

## Existing business logic to preserve conceptually

Even if the implementation is rebuilt, preserve the useful business logic and field semantics where sensible.

### Existing dimensions already present
From the schema and prior project context, these dimensions matter:
- posting language
- German requirement
- seniority
- Berlin flag
- remote Germany flag
- work mode
- publisher type
- apply option availability
- PM type
- AI-related focus / skill flags
- B2B SaaS flag

### Existing known field conventions
- `posting_language`: usually `de` or `en`
- `german_requirement`: typically `must`, `plus`, `not_mentioned`
- seniority values may include:
  - `junior`
  - `mid`
  - `senior`
  - `lead`
  - `staff`
  - `principal`
  - `principle` typo may exist
  - `head`
  - unknown / other

These should be normalized carefully.

---

## Core product logic that must survive the rebuild

### Language and German requirement split
This is one of the strongest differentiators of JobPulse.

The product must support these categories clearly:
1. postings in German
2. postings in English where German is required
3. postings in English where German is nice-to-have
4. postings in English where German is not mentioned

Use deterministic, explainable logic wherever possible.

### Seniority classification
Normalize into buckets:
- junior
- mid
- senior
- lead
- staff
- principal
- head
- unknown

Document inference logic and edge cases.

### Active / inactive logic
Active-status logic must be explicit.

Likely approach:
- active if seen in the latest run
- or active if seen within a grace window, depending on source reliability
- inactive if not seen beyond that window, or source explicitly marks closed

This logic must be documented and defensible.

### Historical tracking
A current-state table alone is not enough.

The rebuilt product must support:
- first seen
- last seen
- active status over time
- daily snapshots
- job age
- time online
- disappearing-fast analysis
- repost detection where possible

---

## Source strategy

### Current situation
The project already uses configured APIs and source credentials.

These should be reused.

### Architectural instruction
Design the system so it can support multiple source types such as:
- aggregator APIs
- job boards
- company career pages
- ATS platforms

Even if the first working version only uses a subset, the model should not lock the project into a brittle single-source worldview.

### Important attribution rule
Preserve the concept of **source priority** where relevant:
- company site first
- LinkedIn second
- others after

This matters for:
- primary apply link
- attribution
- overlap logic
- source quality interpretation

---

## Current implementation context from n8n

The old n8n flow currently includes components like:
- `Schedule Trigger`
- `Config`
- `JSearch PM`
- `JSearch sPM`
- `Flatten PM results`
- `Flatten sPM results`
- `Merge results`
- `Local PM cleanup`
- `Normalize fields`
- `Remove duplicates`
- `If`
- `Prepare LLM prompt`
- `Basic LLM Chain`
- `OpenAI Chat Model`
- `Parse LLM enrichment`
- `Merge original + LLM enrichment`
- `Safety check`
- `Build run record`
- `RunInsert`
- `Attach Run ID + Dates`
- `Create a row into job_daily_snapshots`
- `Guard before Upsert`
- `Build jobs_master row`
- `Upsert jobs_master`

This confirms the kinds of transformations the pipeline already performs, but **do not reproduce this as a flow-based architecture**.

---

## Desired target architecture

### High-level structure
Recommended direction:

1. **Daily scheduled pipeline**
   - run via GitHub Actions
   - manual trigger also supported
   - fetch jobs from existing APIs
   - normalize
   - deduplicate / canonicalize
   - persist raw + canonical + snapshot data
   - log run metadata
   - fail gracefully by source

2. **Supabase as source of truth**
   - migrations
   - tables / views
   - functions only where useful
   - clean and documented

3. **Custom frontend app**
   - likely Next.js
   - modern, lightweight UI
   - productized analytics experience
   - methodology page included

4. **Deployment**
   - GitHub repo
   - GitHub Actions for schedule
   - frontend hosting, likely Vercel
   - Supabase remains backend / DB

---

## Strongly recommended data model direction

You do not have to use this exact schema, but aim for clear separation of concerns.

### Suggested logical layers

#### 1. `ingestion_runs`
Track each pipeline execution.

#### 2. `raw_job_records`
Store raw API payloads for traceability and debugging.

#### 3. `jobs`
Canonical logical jobs.

#### 4. `job_source_appearances`
Track how a canonical job appears across sources and over time.

#### 5. `job_daily_snapshots`
Keep a daily picture for analytics.

#### 6. `classification_audit`
Retain classification transparency.

Optional:
- `job_repost_events`
- `companies`

### Why this matters
This will make it much easier to answer:
- where to look
- overlap across sources
- exclusivity
- reposting
- aging / time-online metrics
- company-level patterns

---

## Required questions the final product must answer

### A. Where should I look?
Need views or metrics for:
- active jobs by source
- new jobs by source over time
- exclusive jobs by source
- overlap across sources
- companies posting only on their own sites
- top companies by source mix

### B. When should I apply?
Need views or metrics for:
- new jobs today
- new jobs in last 7 days
- median posting age
- age buckets
- time-online distribution
- share disappearing within 3 / 7 / 14 / 30 days
- repost frequency if feasible

### C. What does the market ask for?
Need views or metrics for:
- active jobs by seniority
- new jobs by seniority over time
- active jobs by posting language
- active jobs by German requirement
- Berlin vs remote Germany split

### D. How is the market evolving?
Need views or metrics for:
- active jobs over time
- new jobs per day or week
- growth or decline vs previous period
- trends by source
- trends by seniority
- trends by language requirement
- employer activity concentration

---

## UX direction

The final product should **not** look like Metabase.

### It should feel:
- modern
- minimal
- clean
- analytical
- productized
- intentional

### Avoid:
- clutter
- dashboard-template aesthetics
- too many charts
- unreadable legends
- chart-first design

### Prefer:
- KPI cards
- clean line charts
- well-used stacked bars
- simple distributions
- clear text takeaways
- concise methodology and limitations

### Suggested information architecture

#### Page 1 — Overview
Show:
- active jobs
- new jobs today
- new jobs last 7 days
- median posting age
- active jobs over time
- daily new jobs
- market split by language / German requirement
- seniority split
- source split

#### Page 2 — Where to Look
Show:
- active jobs by source
- exclusive jobs by source
- source overlap
- top companies by source mix
- company-site-only opportunities

#### Page 3 — When to Apply
Show:
- age distribution
- time-online distribution
- disappearing-fast indicators
- repost analysis
- newly seen jobs by filter

#### Page 4 — Market Requirements
Show:
- German requirement split
- posting language trends
- seniority trends
- Berlin / remote Germany trends

#### Page 5 — Methodology
Show:
- source list
- update cadence
- active-status logic
- deduplication logic
- classification rules
- limitations

The methodology page is very important for trust and portfolio quality.

---

## Metrics that must be defined clearly

Document metric definitions in code comments and in repo docs.

Examples:
- active jobs
- new jobs today
- job age
- time online
- source overlap
- exclusive jobs
- repost event
- German required
- German nice-to-have
- German not mentioned
- posting in German

Do not leave these implicit.

---

## Repo and documentation quality expectations

The repository should be clean and explainable.

At minimum, deliver:
- clean README
- migrations
- scheduled GitHub Actions workflow
- source adapters
- normalization logic
- analytics queries or views
- polished frontend app
- methodology page
- `.env.example`
- notes on assumptions and limitations

### README should explain:
- the problem
- the target user
- the MVP scope
- architecture choices
- data model choices
- metric definitions
- limitations
- what was intentionally not built yet

---

## Implementation principles

- Challenge weak legacy choices
- Prefer smaller but stronger scope
- Use deterministic rules first
- Keep names clean and business-readable
- Separate ingestion, analytics, and presentation concerns
- Do not over-engineer
- Keep the project coherent

---

## Environment variables

The actual secrets already exist and should be reused.  
Do not invent a new credential setup if the current one works.

A clean `.env.example` should likely include categories like:

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` or `DATABASE_URL`
- `SUPABASE_PROJECT_REF`

### API / source credentials
- `RAPIDAPI_KEY`
- `RAPIDAPI_HOST`
- `JSEARCH_API_KEY`

### App config
- `NEXT_PUBLIC_APP_URL`
- `NODE_ENV`

### Pipeline config
- active grace days
- max requests
- dry run flag
- classifier version

These should reflect actual usage, not imagined complexity.

---

## Explicit instruction on the old system

Use the old system only for:
- understanding which fields already exist
- understanding which transformations are already happening
- understanding what the project tried to solve

Do **not**:
- keep n8n as the main implementation pattern
- mirror the old step-by-step flow structure
- preserve complexity that exists only because of n8n limitations

---

## Final one-line mission

Build JobPulse as a polished, explainable, portfolio-grade **job-market intelligence app** for PM roles in Germany, powered by daily automated ingestion, historical job tracking, and a modern frontend that clearly answers where to look, when to apply, and what the market actually requires.
