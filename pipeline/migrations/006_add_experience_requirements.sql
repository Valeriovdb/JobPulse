-- Migration: 006_add_experience_requirements.sql
-- Description: Adds table to store multi-label experience tags extracted from JDs

CREATE TABLE IF NOT EXISTS job_experience_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
    experience_tag TEXT NOT NULL,
    experience_family TEXT NOT NULL, -- 'domain', 'functional', 'operating_context'
    required_level TEXT DEFAULT 'required', -- 'required', 'plus'
    evidence_text TEXT,
    confidence FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(job_id, experience_tag)
);

-- Index for filtering and joining
CREATE INDEX IF NOT EXISTS idx_jer_job_id ON job_experience_requirements(job_id);
CREATE INDEX IF NOT EXISTS idx_jer_tag ON job_experience_requirements(experience_tag);
CREATE INDEX IF NOT EXISTS idx_jer_family ON job_experience_requirements(experience_family);
