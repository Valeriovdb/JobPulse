-- =============================================================================
-- JobPulse — Migration 002: New enrichment fields
-- 002_new_enrichment_fields.sql
--
-- Additive only — safe to re-run (ADD COLUMN IF NOT EXISTS).
-- Adds 10 new LLM-extracted fields to jobs and 4 dimension columns
-- to job_daily_snapshots for analytics filtering.
--
-- New fields on jobs:
--   industry_normalized                    — employer's industry vertical
--   candidate_domain_requirement_strength  — hard | soft | none | unclear
--   candidate_domain_requirement_normalized — domain background requested of candidate
--   candidate_domain_requirement_raw        — verbatim JD snippet (evidence)
--   years_experience_min                    — minimum years required (integer)
--   years_experience_raw                    — verbatim JD snippet (evidence)
--   visa_sponsorship_status                — yes | no | unclear
--   visa_sponsorship_raw                   — verbatim JD snippet (evidence)
--   relocation_support_status              — yes | no | unclear
--   relocation_support_raw                 — verbatim JD snippet (evidence)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- jobs table — 10 new enrichment columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS industry_normalized                     text,
  ADD COLUMN IF NOT EXISTS candidate_domain_requirement_strength  text
    CHECK (candidate_domain_requirement_strength IN ('hard', 'soft', 'none', 'unclear')),
  ADD COLUMN IF NOT EXISTS candidate_domain_requirement_normalized text,
  ADD COLUMN IF NOT EXISTS candidate_domain_requirement_raw        text,
  ADD COLUMN IF NOT EXISTS years_experience_min                    integer,
  ADD COLUMN IF NOT EXISTS years_experience_raw                    text,
  ADD COLUMN IF NOT EXISTS visa_sponsorship_status                text
    CHECK (visa_sponsorship_status IN ('yes', 'no', 'unclear')),
  ADD COLUMN IF NOT EXISTS visa_sponsorship_raw                   text,
  ADD COLUMN IF NOT EXISTS relocation_support_status              text
    CHECK (relocation_support_status IN ('yes', 'no', 'unclear')),
  ADD COLUMN IF NOT EXISTS relocation_support_raw                 text;

-- Indexes on the four status/classification columns (used in distributions + filtering)
CREATE INDEX IF NOT EXISTS idx_jobs_industry_normalized
  ON public.jobs (industry_normalized);
CREATE INDEX IF NOT EXISTS idx_jobs_visa_sponsorship_status
  ON public.jobs (visa_sponsorship_status);
CREATE INDEX IF NOT EXISTS idx_jobs_relocation_support_status
  ON public.jobs (relocation_support_status);
CREATE INDEX IF NOT EXISTS idx_jobs_domain_req_strength
  ON public.jobs (candidate_domain_requirement_strength);

-- -----------------------------------------------------------------------------
-- job_daily_snapshots — 4 analytically useful dimension columns
-- (_raw snippets and years_experience_min omitted — not useful for aggregates)
-- -----------------------------------------------------------------------------
ALTER TABLE public.job_daily_snapshots
  ADD COLUMN IF NOT EXISTS industry_normalized                    text,
  ADD COLUMN IF NOT EXISTS visa_sponsorship_status               text,
  ADD COLUMN IF NOT EXISTS relocation_support_status             text,
  ADD COLUMN IF NOT EXISTS candidate_domain_requirement_strength text;
