-- Add mep_supervisor_id column to project table for MEP Supervisor assignments
-- Run this in Supabase SQL Editor or via psql

ALTER TABLE project
ADD COLUMN IF NOT EXISTS mep_supervisor_id JSONB DEFAULT NULL;

COMMENT ON COLUMN project.mep_supervisor_id IS
'Stores MEP Supervisor IDs as JSONB array, e.g., [1, 2]. Allows multiple MEP Supervisors per project.';

-- Verify column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'project' AND column_name = 'mep_supervisor_id';
