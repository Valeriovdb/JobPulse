-- =============================================================================
-- JobPulse — Initial Schema Migration
-- 001_initial_schema.sql
--
-- Drops and recreates all tables from scratch.
-- Run once against the existing Supabase project.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CLEANUP (drop in reverse dependency order)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.classification_audit     CASCADE;
DROP TABLE IF EXISTS public.job_daily_snapshots      CASCADE;
DROP TABLE IF EXISTS public.job_source_appearances   CASCADE;
DROP TABLE IF EXISTS public.raw_job_records          CASCADE;
DROP TABLE IF EXISTS public.jobs                     CASCADE;
DROP TABLE IF EXISTS public.companies                CASCADE;
DROP TABLE IF EXISTS public.ingestion_runs           CASCADE;

-- Legacy tables from n8n era
DROP TABLE IF EXISTS public.jobs_master              CASCADE;

DROP FUNCTION IF EXISTS public.mark_stale_jobs_inactive CASCADE;
DROP FUNCTION IF EXISTS public.upsert_job_master         CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at            CASCADE;

-- -----------------------------------------------------------------------------
-- EXTENSIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- HELPER: auto-update updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- TABLE: ingestion_runs
-- One row per pipeline execution. Created at the start of each run,
-- updated at the end with final status and counts.
-- =============================================================================
CREATE TABLE public.ingestion_runs (
  run_id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date        date        NOT NULL,                  -- the calendar date this run covers
  sources         text[]      NOT NULL DEFAULT '{}',     -- e.g. ['jsearch','arbeitnow']
  dry_run         boolean     NOT NULL DEFAULT false,
  status          text        NOT NULL DEFAULT 'started' -- started | completed | failed | partial
                  CHECK (status IN ('started','completed','failed','partial')),
  rows_fetched    integer     NOT NULL DEFAULT 0,
  rows_new        integer     NOT NULL DEFAULT 0,        -- net new canonical jobs
  rows_updated    integer     NOT NULL DEFAULT 0,        -- existing jobs seen again
  error_message   text,
  notes           text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

-- =============================================================================
-- TABLE: companies
-- Lightweight registry. Populated opportunistically during ingestion.
-- Not a hard dependency — company_name in jobs is the fallback.
-- =============================================================================
CREATE TABLE public.companies (
  company_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_raw        text        NOT NULL UNIQUE,
  name_normalized text,
  domain          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- TABLE: jobs
-- Canonical job identity. One row per unique job, regardless of how many
-- sources carry it or how many times it has been seen.
--
-- Metric definitions:
--   first_seen_date  — the date the job first appeared in any ingestion run
--   last_seen_date   — the most recent date it appeared in any ingestion run
--   is_active        — true if last_seen_date >= (today - active_grace_days)
--   days_online      — last_seen_date - first_seen_date + 1
-- =============================================================================
CREATE TABLE public.jobs (
  job_id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  external_job_key        text        NOT NULL UNIQUE,   -- '{source}::{source_job_id}'
  source_provider         text        NOT NULL,          -- jsearch | arbeitnow | ...

  -- URLs
  canonical_url           text,

  -- Company
  company_name            text,
  company_id              uuid        REFERENCES public.companies(company_id),

  -- Title
  job_title_raw           text,
  job_title_normalized    text,                          -- product_manager | senior_pm | ...
  seniority               text                           -- junior|mid|senior|lead|staff|principal|head|unknown
                          CHECK (seniority IN ('junior','mid','senior','lead','staff','principal','head','unknown')),

  -- Location
  location_raw            text,
  location_normalized     text,
  is_berlin               boolean     NOT NULL DEFAULT false,
  is_remote_germany       boolean     NOT NULL DEFAULT false,

  -- Work mode (single canonical field — replaces work_mode + remote_type duplication)
  work_mode               text                           -- onsite | hybrid | remote | unknown
                          CHECK (work_mode IN ('onsite','hybrid','remote','unknown')),

  -- Language & German requirement
  -- posting_language: ISO 639-1 code of the job posting text (en | de | ...)
  -- german_requirement:
  --   must         — German explicitly required
  --   plus         — German mentioned as nice-to-have / advantage
  --   not_mentioned — German not referenced in the posting
  posting_language        text,
  german_requirement      text
                          CHECK (german_requirement IN ('must','plus','not_mentioned')),

  -- Seniority / role type
  pm_type                 text,                          -- core_pm | growth | technical | data | other
  b2b_saas                boolean,

  -- AI signals
  ai_focus                boolean,                       -- role has AI product focus
  ai_skills               boolean,                       -- role requires AI/ML skills

  -- Tooling (LLM-extracted list, e.g. ["Jira","SQL","Figma"])
  tools_skills            jsonb,

  -- Source attribution
  publisher_type          text,                          -- linkedin | stepstone | indeed | company_site | other
  has_linkedin_apply_option      boolean NOT NULL DEFAULT false,
  has_company_site_apply_option  boolean NOT NULL DEFAULT false,

  -- Temporal tracking
  raw_posted_at           timestamptz,                   -- as reported by the source
  first_seen_date         date,
  last_seen_date          date,
  is_active               boolean     NOT NULL DEFAULT true,

  -- LLM enrichment metadata
  llm_version             text,
  llm_extracted_at        timestamptz,
  llm_confidence          numeric,
  llm_raw_json            jsonb,

  -- Description (stored for re-enrichment without re-fetching)
  description_text        text,

  -- Audit
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_jobs_is_active         ON public.jobs (is_active);
CREATE INDEX idx_jobs_first_seen_date   ON public.jobs (first_seen_date);
CREATE INDEX idx_jobs_last_seen_date    ON public.jobs (last_seen_date);
CREATE INDEX idx_jobs_source_provider   ON public.jobs (source_provider);
CREATE INDEX idx_jobs_is_berlin         ON public.jobs (is_berlin);
CREATE INDEX idx_jobs_is_remote_germany ON public.jobs (is_remote_germany);
CREATE INDEX idx_jobs_seniority         ON public.jobs (seniority);
CREATE INDEX idx_jobs_german_requirement ON public.jobs (german_requirement);

-- =============================================================================
-- TABLE: raw_job_records
-- Full API response payload for every job returned by every source.
-- Used for debugging, re-enrichment, and audit.
-- Never mutated after insert.
-- =============================================================================
CREATE TABLE public.raw_job_records (
  raw_id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid        NOT NULL REFERENCES public.ingestion_runs(run_id),
  source_provider text        NOT NULL,
  source_job_id   text        NOT NULL,
  external_job_key text       NOT NULL,                  -- computed before insert
  raw_payload     jsonb       NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_provider, source_job_id, run_id)
);

CREATE INDEX idx_raw_job_records_run_id          ON public.raw_job_records (run_id);
CREATE INDEX idx_raw_job_records_external_job_key ON public.raw_job_records (external_job_key);

-- =============================================================================
-- TABLE: job_source_appearances
-- Tracks every time a canonical job is seen in a run.
-- Enables: source overlap, source exclusivity, repost detection.
--
-- Metric definitions:
--   source overlap    — same job_id appearing under multiple source_provider values
--   exclusive job     — job_id appearing under exactly one source_provider
-- =============================================================================
CREATE TABLE public.job_source_appearances (
  appearance_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid        NOT NULL REFERENCES public.jobs(job_id),
  run_id          uuid        NOT NULL REFERENCES public.ingestion_runs(run_id),
  source_provider text        NOT NULL,
  appearance_date date        NOT NULL,
  canonical_url   text,
  publisher_type  text,
  has_linkedin_apply_option      boolean NOT NULL DEFAULT false,
  has_company_site_apply_option  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, run_id, source_provider)
);

CREATE INDEX idx_job_source_appearances_job_id          ON public.job_source_appearances (job_id);
CREATE INDEX idx_job_source_appearances_run_id          ON public.job_source_appearances (run_id);
CREATE INDEX idx_job_source_appearances_appearance_date ON public.job_source_appearances (appearance_date);
CREATE INDEX idx_job_source_appearances_source_provider ON public.job_source_appearances (source_provider);

-- =============================================================================
-- TABLE: job_daily_snapshots
-- One row per (job, date). Written at the end of each successful run.
-- The analytics layer reads primarily from this table.
-- Columns denormalized from jobs for query performance.
--
-- Metric definitions:
--   days_since_first_seen — snapshot_date - first_seen_date
--   is_active             — whether the job was seen in the run that produced this snapshot
-- =============================================================================
CREATE TABLE public.job_daily_snapshots (
  snapshot_id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date           date        NOT NULL,
  job_id                  uuid        NOT NULL REFERENCES public.jobs(job_id),
  run_id                  uuid        NOT NULL REFERENCES public.ingestion_runs(run_id),
  is_active               boolean     NOT NULL,
  days_since_first_seen   integer,

  -- Denormalized dimensions for analytics (avoid joins at query time)
  external_job_key        text,
  company_name            text,
  source_provider         text,
  publisher_type          text,
  canonical_url           text,
  seniority               text,
  location_normalized     text,
  is_berlin               boolean,
  is_remote_germany       boolean,
  work_mode               text,
  posting_language        text,
  german_requirement      text,
  pm_type                 text,
  b2b_saas                boolean,
  ai_focus                boolean,
  ai_skills               boolean,
  raw_posted_at           timestamptz,
  has_linkedin_apply_option      boolean,
  has_company_site_apply_option  boolean,

  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, snapshot_date)
);

CREATE INDEX idx_snapshots_snapshot_date    ON public.job_daily_snapshots (snapshot_date);
CREATE INDEX idx_snapshots_job_id           ON public.job_daily_snapshots (job_id);
CREATE INDEX idx_snapshots_is_active        ON public.job_daily_snapshots (is_active);
CREATE INDEX idx_snapshots_source_provider  ON public.job_daily_snapshots (source_provider);
CREATE INDEX idx_snapshots_seniority        ON public.job_daily_snapshots (seniority);
CREATE INDEX idx_snapshots_german_requirement ON public.job_daily_snapshots (german_requirement);
CREATE INDEX idx_snapshots_is_berlin        ON public.job_daily_snapshots (is_berlin);

-- =============================================================================
-- TABLE: classification_audit
-- Logs each LLM classification decision for transparency.
-- One row per field per job per classifier version.
-- =============================================================================
CREATE TABLE public.classification_audit (
  audit_id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid        NOT NULL REFERENCES public.jobs(job_id),
  classifier_version  text        NOT NULL,
  field_name          text        NOT NULL,
  predicted_value     text,
  confidence          numeric,
  rationale_short     text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_classification_audit_job_id ON public.classification_audit (job_id);

-- =============================================================================
-- FUNCTION: mark_stale_jobs_inactive
-- Called at the end of each ingestion run.
-- Marks jobs as inactive if last_seen_date < (run_date - grace_days).
-- grace_days default: 1 (a job must appear in each daily run to stay active).
-- Increase if source APIs are unreliable (e.g. 3 for a grace window).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mark_stale_jobs_inactive(
  p_run_date    date,
  p_grace_days  integer DEFAULT 1
)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.jobs
  SET    is_active = false,
         updated_at = now()
  WHERE  is_active = true
    AND  last_seen_date < (p_run_date - p_grace_days);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;
