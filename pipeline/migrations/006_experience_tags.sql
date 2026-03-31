-- =============================================================================
-- JobPulse — Migration 006: Experience Tags
--
-- Stores multi-label experience requirements extracted from job descriptions.
-- Each job can have zero or many experience tags across three families:
--   domain, functional, operating_context
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.job_experience_tags (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid        NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
  experience_tag    text        NOT NULL,
  experience_family text        NOT NULL
                    CHECK (experience_family IN ('domain', 'functional', 'operating_context')),
  required_level    text        NOT NULL DEFAULT 'not_clear'
                    CHECK (required_level IN ('required', 'preferred', 'not_clear')),
  evidence_text     text,                    -- short snippet from JD supporting this tag
  confidence        numeric,                 -- LLM confidence for this specific tag
  classifier_version text       NOT NULL DEFAULT 'v1',
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- One tag per job per classifier version
  UNIQUE (job_id, experience_tag, classifier_version)
);

CREATE INDEX idx_experience_tags_job_id          ON public.job_experience_tags (job_id);
CREATE INDEX idx_experience_tags_tag             ON public.job_experience_tags (experience_tag);
CREATE INDEX idx_experience_tags_family          ON public.job_experience_tags (experience_family);
CREATE INDEX idx_experience_tags_classifier      ON public.job_experience_tags (classifier_version);

-- Composite index for the main aggregation query (active jobs join)
CREATE INDEX idx_experience_tags_tag_family      ON public.job_experience_tags (experience_tag, experience_family);
