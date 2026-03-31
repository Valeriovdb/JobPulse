-- =============================================================================
-- Migration 005: Expand work_mode CHECK constraint to include hybrid sub-types
--
-- Adds hybrid_1d, hybrid_2d, hybrid_3d, hybrid_4d as valid work_mode values.
-- These are now produced by the LLM classifier and the regex fallback.
-- =============================================================================

-- jobs table
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_work_mode_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_work_mode_check
  CHECK (work_mode IN ('onsite', 'hybrid', 'hybrid_1d', 'hybrid_2d', 'hybrid_3d', 'hybrid_4d', 'remote', 'unknown'));

-- job_daily_snapshots table (no CHECK constraint was defined, but add for consistency)
ALTER TABLE public.job_daily_snapshots
  DROP CONSTRAINT IF EXISTS job_daily_snapshots_work_mode_check;

ALTER TABLE public.job_daily_snapshots
  ADD CONSTRAINT job_daily_snapshots_work_mode_check
  CHECK (work_mode IN ('onsite', 'hybrid', 'hybrid_1d', 'hybrid_2d', 'hybrid_3d', 'hybrid_4d', 'remote', 'unknown'));
