-- Migration: 007_add_classifier_version_to_requirements.sql
-- Description: Adds classifier_version column and updates uniqueness constraint

-- Add classifier_version column if it doesn't exist
ALTER TABLE job_experience_requirements ADD COLUMN IF NOT EXISTS classifier_version TEXT NOT NULL DEFAULT 'v1';

-- Drop the existing unique constraint to include version in the key
-- Finding the constraint name dynamically since it was anonymous in migration 006
DO $$
DECLARE
    const_name TEXT;
BEGIN
    SELECT conname INTO const_name
    FROM pg_constraint
    WHERE conrelid = 'job_experience_requirements'::regclass
    AND contype = 'u';
    
    IF const_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE job_experience_requirements DROP CONSTRAINT ' || const_name;
    END IF;
END $$;

-- Add new named unique constraint including classifier_version
ALTER TABLE job_experience_requirements 
ADD CONSTRAINT job_experience_requirements_job_id_experience_tag_version_key 
UNIQUE (job_id, experience_tag, classifier_version);

-- Add index for version filtering
CREATE INDEX IF NOT EXISTS idx_jer_classifier_version ON job_experience_requirements(classifier_version);
