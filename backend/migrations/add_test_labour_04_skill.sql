-- Add "test labour 04" skill to 20 workers
-- This updates the JSONB skills array for workers

UPDATE workers
SET
    skills = CASE
        WHEN skills IS NULL THEN '["test labour 04"]'::jsonb
        WHEN NOT skills ? 'test labour 04' THEN skills || '["test labour 04"]'::jsonb
        ELSE skills
    END,
    last_modified_at = NOW(),
    last_modified_by = 'System - Skill Update'
WHERE worker_id IN (
    SELECT worker_id
    FROM workers
    WHERE is_deleted = false
    ORDER BY worker_id
    LIMIT 20
)
AND is_deleted = false;

-- Verify the update
SELECT
    worker_id,
    full_name,
    skills
FROM workers
WHERE is_deleted = false
AND skills ? 'test labour 04'
ORDER BY worker_id
LIMIT 20;
