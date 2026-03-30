-- Migration 003: track JSearch API requests per run for monthly budget management
--
-- Adds jsearch_requests_used to ingestion_runs so we can query
-- SUM(jsearch_requests_used) for the current month without a separate table.

ALTER TABLE ingestion_runs
  ADD COLUMN IF NOT EXISTS jsearch_requests_used INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN ingestion_runs.jsearch_requests_used IS
  'Number of JSearch API requests made during this run. '
  'Use SUM over current month to track against the monthly budget.';
