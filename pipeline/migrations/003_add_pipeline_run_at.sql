-- Add pipeline_run_at to jobs table.
-- Records the timestamp of the pipeline run that last observed each job.
-- Useful for auditing coverage gaps and cross-referencing with ingestion_runs.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS pipeline_run_at timestamptz;
