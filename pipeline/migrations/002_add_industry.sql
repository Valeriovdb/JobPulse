-- Migration 002: add industry classification column
-- Run in Supabase SQL editor before executing the backfill script.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS industry text;

ALTER TABLE public.job_daily_snapshots
  ADD COLUMN IF NOT EXISTS industry text;
