-- ===================================================
-- Migration: Consolidate boq_preliminaries to JSONB
-- Date: 2026-03-02
-- Description: Transforms boq_preliminaries from junction table
--   (one row per BOQ per preliminary) to single-row-per-BOQ
--   with selected_preliminaries JSONB column
-- ===================================================

-- Step 1: Add the new JSONB column
ALTER TABLE boq_preliminaries
ADD COLUMN IF NOT EXISTS selected_preliminaries JSONB DEFAULT '[]'::jsonb;

-- Step 2: Migrate existing data
-- For each boq_id, collect checked items with master details into JSON array,
-- keep the minimum-id row, update it with JSON, delete the rest
DO $$
DECLARE
    rec RECORD;
    json_data JSONB;
    keep_id INTEGER;
    migrated INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting data migration...';

    FOR rec IN SELECT DISTINCT boq_id FROM boq_preliminaries ORDER BY boq_id
    LOOP
        -- Build JSON array from checked rows joined with master
        SELECT COALESCE(
            json_agg(
                json_build_object(
                    'prelim_id', pm.prelim_id,
                    'name', pm.name,
                    'description', pm.description,
                    'unit', COALESCE(pm.unit, 'nos'),
                    'rate', COALESCE(pm.rate, 0),
                    'display_order', COALESCE(pm.display_order, 0)
                ) ORDER BY pm.display_order, pm.prelim_id
            )::jsonb,
            '[]'::jsonb
        ) INTO json_data
        FROM boq_preliminaries bp
        JOIN preliminaries_master pm ON bp.prelim_id = pm.prelim_id
        WHERE bp.boq_id = rec.boq_id
        AND bp.is_checked = TRUE;

        -- Find the minimum id row to keep
        SELECT MIN(id) INTO keep_id
        FROM boq_preliminaries
        WHERE boq_id = rec.boq_id;

        -- Update the keeper row with consolidated JSON
        UPDATE boq_preliminaries
        SET selected_preliminaries = json_data,
            updated_at = NOW()
        WHERE id = keep_id;

        -- Delete all other rows for this boq_id
        DELETE FROM boq_preliminaries
        WHERE boq_id = rec.boq_id AND id != keep_id;

        migrated := migrated + 1;
    END LOOP;

    RAISE NOTICE 'Migrated % BOQs to JSONB format', migrated;
END $$;

-- Step 3: Drop old FK constraint on prelim_id (dynamic lookup)
DO $$
DECLARE
    fk_name TEXT;
BEGIN
    SELECT con.conname INTO fk_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'boq_preliminaries'
    AND con.contype = 'f'
    AND EXISTS (
        SELECT 1 FROM pg_attribute att
        WHERE att.attrelid = con.conrelid
        AND att.attnum = ANY(con.conkey)
        AND att.attname = 'prelim_id'
    );

    IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE boq_preliminaries DROP CONSTRAINT IF EXISTS %I', fk_name);
        RAISE NOTICE 'Dropped FK constraint: %', fk_name;
    ELSE
        RAISE NOTICE 'No FK constraint found on prelim_id';
    END IF;
END $$;

-- Step 4: Drop old UNIQUE constraint on (boq_id, prelim_id)
DO $$
DECLARE
    uq_name TEXT;
BEGIN
    FOR uq_name IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'boq_preliminaries'
        AND con.contype = 'u'
    LOOP
        EXECUTE format('ALTER TABLE boq_preliminaries DROP CONSTRAINT IF EXISTS %I', uq_name);
        RAISE NOTICE 'Dropped unique constraint: %', uq_name;
    END LOOP;
END $$;

-- Step 5: Drop old indexes
DROP INDEX IF EXISTS idx_boq_preliminaries_prelim_id;
DROP INDEX IF EXISTS idx_boq_preliminaries_is_checked;

-- Step 6: Drop old columns
ALTER TABLE boq_preliminaries DROP COLUMN IF EXISTS prelim_id;
ALTER TABLE boq_preliminaries DROP COLUMN IF EXISTS is_checked;

-- Step 7: Add UNIQUE constraint on boq_id (one row per BOQ)
ALTER TABLE boq_preliminaries
ADD CONSTRAINT uq_boq_preliminaries_boq_id UNIQUE (boq_id);

-- Step 8: Set NOT NULL and DEFAULT on selected_preliminaries
UPDATE boq_preliminaries
SET selected_preliminaries = '[]'::jsonb
WHERE selected_preliminaries IS NULL;

ALTER TABLE boq_preliminaries
ALTER COLUMN selected_preliminaries SET NOT NULL;

ALTER TABLE boq_preliminaries
ALTER COLUMN selected_preliminaries SET DEFAULT '[]'::jsonb;

-- Step 9: Verify final state
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'boq_preliminaries'
ORDER BY ordinal_position;

SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT boq_id) AS unique_boqs
FROM boq_preliminaries;

-- Verify one-row-per-BOQ
SELECT
    CASE WHEN COUNT(*) = COUNT(DISTINCT boq_id)
         THEN 'VERIFIED: One row per BOQ'
         ELSE 'WARNING: Row count != unique BOQ count'
    END AS verification
FROM boq_preliminaries;


-- ===================================================
-- ROLLBACK (run only if you need to undo the migration)
-- ===================================================
-- To rollback, run the following in a separate transaction:
--
-- ALTER TABLE boq_preliminaries DROP CONSTRAINT IF EXISTS uq_boq_preliminaries_boq_id;
-- ALTER TABLE boq_preliminaries ADD COLUMN prelim_id INTEGER;
-- ALTER TABLE boq_preliminaries ADD COLUMN is_checked BOOLEAN DEFAULT FALSE NOT NULL;
-- -- NOTE: JSONB data expansion back to rows requires the Python rollback script
-- ALTER TABLE boq_preliminaries DROP COLUMN IF EXISTS selected_preliminaries;
-- ALTER TABLE boq_preliminaries ALTER COLUMN prelim_id SET NOT NULL;
-- ALTER TABLE boq_preliminaries ADD CONSTRAINT boq_preliminaries_prelim_id_fkey
--     FOREIGN KEY (prelim_id) REFERENCES preliminaries_master(prelim_id);
-- ALTER TABLE boq_preliminaries ADD CONSTRAINT boq_preliminaries_boq_id_prelim_id_key
--     UNIQUE (boq_id, prelim_id);
-- CREATE INDEX IF NOT EXISTS idx_boq_preliminaries_prelim_id ON boq_preliminaries(prelim_id);
-- CREATE INDEX IF NOT EXISTS idx_boq_preliminaries_is_checked ON boq_preliminaries(is_checked);
