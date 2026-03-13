"""
Migration: Consolidate boq_preliminaries from junction table to JSONB column
Date: 2026-03-02
Description:
    Transforms the boq_preliminaries table from a many-to-many junction pattern
    (one row per boq_id + prelim_id pair) into a single-row-per-BOQ pattern
    with a JSONB column holding all selected preliminaries.

    Steps:
    1. Add selected_preliminaries JSONB column
    2. Migrate existing data: for each boq_id, collect is_checked=true rows,
       join with preliminaries_master for full details, build JSON array
    3. Keep one row per boq_id (minimum id), update it with JSON, delete duplicates
    4. Drop old columns (prelim_id, is_checked) and old constraints/indexes
    5. Add new UNIQUE constraint on boq_id alone
    6. Set selected_preliminaries to NOT NULL with default '[]'

Usage:
    DATABASE_URL='postgresql://...' python migrations/consolidate_boq_preliminaries_to_jsonb.py
    DATABASE_URL='postgresql://...' python migrations/consolidate_boq_preliminaries_to_jsonb.py --rollback
"""

import os
import sys
import json
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()


def run_migration():
    """Consolidate boq_preliminaries rows into JSONB selected_preliminaries column."""

    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        return False

    conn = None
    try:
        conn = psycopg2.connect(database_url)
        # Use manual transaction control (autocommit off by default)
        cursor = conn.cursor(cursor_factory=RealDictCursor)


        # ------------------------------------------------------------------
        # Step 1: Check if migration has already been applied
        # ------------------------------------------------------------------

        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'boq_preliminaries'
            AND column_name = 'selected_preliminaries'
        """)
        if cursor.fetchone():
            # Check if old columns still exist (partial migration scenario)
            cursor.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'boq_preliminaries'
                AND column_name IN ('prelim_id', 'is_checked')
            """)
            old_columns = [row['column_name'] for row in cursor.fetchall()]
            if not old_columns:
                cursor.close()
                conn.close()
                return True
            else:
                pass
        else:
            pass

        # ------------------------------------------------------------------
        # Step 2: Add selected_preliminaries JSONB column (if not exists)
        # ------------------------------------------------------------------

        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'boq_preliminaries'
            AND column_name = 'selected_preliminaries'
        """)
        if not cursor.fetchone():
            cursor.execute("""
                ALTER TABLE boq_preliminaries
                ADD COLUMN selected_preliminaries JSONB DEFAULT '[]'::jsonb
            """)
        else:
            pass

        conn.commit()

        # ------------------------------------------------------------------
        # Step 3: Migrate existing data
        # For each distinct boq_id, collect all is_checked=true rows,
        # join with preliminaries_master for full details, build JSON array
        # ------------------------------------------------------------------

        # Get all distinct boq_ids
        cursor.execute("""
            SELECT DISTINCT boq_id
            FROM boq_preliminaries
            ORDER BY boq_id
        """)
        boq_ids = [row['boq_id'] for row in cursor.fetchall()]

        migrated_count = 0
        for boq_id in boq_ids:
            # Collect checked preliminaries with master details
            cursor.execute("""
                SELECT
                    pm.prelim_id,
                    pm.name,
                    pm.description,
                    pm.unit,
                    pm.rate,
                    pm.display_order
                FROM boq_preliminaries bp
                JOIN preliminaries_master pm ON bp.prelim_id = pm.prelim_id
                WHERE bp.boq_id = %s
                AND bp.is_checked = TRUE
                ORDER BY pm.display_order, pm.prelim_id
            """, (boq_id,))

            checked_rows = cursor.fetchall()

            # Build the JSON array
            json_array = []
            for row in checked_rows:
                json_array.append({
                    "prelim_id": row['prelim_id'],
                    "name": row['name'],
                    "description": row['description'],
                    "unit": row['unit'],
                    "rate": float(row['rate']) if row['rate'] is not None else 0.0,
                    "display_order": row['display_order'] if row['display_order'] is not None else 0
                })

            # Find the minimum id row to keep for this boq_id
            cursor.execute("""
                SELECT MIN(id) AS keep_id
                FROM boq_preliminaries
                WHERE boq_id = %s
            """, (boq_id,))
            keep_id = cursor.fetchone()['keep_id']

            # Update the keeper row with the consolidated JSON data
            cursor.execute("""
                UPDATE boq_preliminaries
                SET selected_preliminaries = %s::jsonb,
                    updated_at = NOW()
                WHERE id = %s
            """, (json.dumps(json_array), keep_id))

            # Delete all other rows for this boq_id (keep only the minimum id)
            cursor.execute("""
                DELETE FROM boq_preliminaries
                WHERE boq_id = %s AND id != %s
            """, (boq_id, keep_id))

            migrated_count += 1

        conn.commit()

        # ------------------------------------------------------------------
        # Step 4: Drop old foreign key constraint on prelim_id
        # ------------------------------------------------------------------

        # Find the FK constraint name dynamically
        cursor.execute("""
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            WHERE rel.relname = 'boq_preliminaries'
            AND con.contype = 'f'
            AND EXISTS (
                SELECT 1
                FROM pg_attribute att
                WHERE att.attrelid = con.conrelid
                AND att.attnum = ANY(con.conkey)
                AND att.attname = 'prelim_id'
            )
        """)
        fk_rows = cursor.fetchall()
        for fk_row in fk_rows:
            fk_name = fk_row['conname']
            cursor.execute(f'ALTER TABLE boq_preliminaries DROP CONSTRAINT IF EXISTS "{fk_name}"')

        if not fk_rows:
            pass

        conn.commit()

        # ------------------------------------------------------------------
        # Step 5: Drop old unique constraint UNIQUE(boq_id, prelim_id)
        # ------------------------------------------------------------------

        # Find unique constraint dynamically
        cursor.execute("""
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            WHERE rel.relname = 'boq_preliminaries'
            AND con.contype = 'u'
        """)
        uq_rows = cursor.fetchall()
        for uq_row in uq_rows:
            uq_name = uq_row['conname']
            cursor.execute(f'ALTER TABLE boq_preliminaries DROP CONSTRAINT IF EXISTS "{uq_name}"')

        if not uq_rows:
            pass

        conn.commit()

        # ------------------------------------------------------------------
        # Step 6: Drop old indexes on prelim_id and is_checked
        # ------------------------------------------------------------------

        old_indexes = [
            'idx_boq_preliminaries_prelim_id',
            'idx_boq_preliminaries_is_checked',
        ]
        for idx_name in old_indexes:
            cursor.execute(f'DROP INDEX IF EXISTS {idx_name}')

        conn.commit()

        # ------------------------------------------------------------------
        # Step 7: Drop old columns (prelim_id, is_checked)
        # ------------------------------------------------------------------

        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'boq_preliminaries'
            AND column_name IN ('prelim_id', 'is_checked')
        """)
        columns_to_drop = [row['column_name'] for row in cursor.fetchall()]

        if columns_to_drop:
            drop_clauses = ", ".join(f"DROP COLUMN {col}" for col in columns_to_drop)
            cursor.execute(f"ALTER TABLE boq_preliminaries {drop_clauses}")
        else:
            pass

        conn.commit()

        # ------------------------------------------------------------------
        # Step 8: Add new UNIQUE constraint on boq_id alone
        # ------------------------------------------------------------------

        # Check if constraint already exists
        cursor.execute("""
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            WHERE rel.relname = 'boq_preliminaries'
            AND con.contype = 'u'
        """)
        existing_uq = cursor.fetchall()
        if not existing_uq:
            cursor.execute("""
                ALTER TABLE boq_preliminaries
                ADD CONSTRAINT uq_boq_preliminaries_boq_id UNIQUE (boq_id)
            """)
        else:
            pass

        conn.commit()

        # ------------------------------------------------------------------
        # Step 9: Set selected_preliminaries to NOT NULL with default '[]'
        # ------------------------------------------------------------------

        # First ensure no NULLs exist
        cursor.execute("""
            UPDATE boq_preliminaries
            SET selected_preliminaries = '[]'::jsonb
            WHERE selected_preliminaries IS NULL
        """)
        null_fixed = cursor.rowcount
        if null_fixed > 0:
            pass

        cursor.execute("""
            ALTER TABLE boq_preliminaries
            ALTER COLUMN selected_preliminaries SET NOT NULL
        """)
        cursor.execute("""
            ALTER TABLE boq_preliminaries
            ALTER COLUMN selected_preliminaries SET DEFAULT '[]'::jsonb
        """)

        conn.commit()

        # ------------------------------------------------------------------
        # Step 10: Verify final state
        # ------------------------------------------------------------------

        cursor.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'boq_preliminaries'
            ORDER BY ordinal_position
        """)
        columns = cursor.fetchall()
        for col in columns:
            pass

        cursor.execute("SELECT COUNT(*) AS total FROM boq_preliminaries")
        total = cursor.fetchone()['total']

        cursor.execute("""
            SELECT COUNT(DISTINCT boq_id) AS unique_boqs FROM boq_preliminaries
        """)
        unique_boqs = cursor.fetchone()['unique_boqs']

        # Verify 1:1 relationship (rows == unique boq_ids)
        if total == unique_boqs:
            pass
        else:
            pass

        cursor.close()
        conn.close()


        return True

    except Exception as e:
        traceback.print_exc()
        if conn:
            conn.rollback()
            conn.close()
        return False


def rollback_migration():
    """
    Reverse the consolidation migration:
    1. Re-add prelim_id and is_checked columns
    2. Expand JSONB data back into individual rows
    3. Restore FK constraint, unique constraint, and indexes
    4. Drop selected_preliminaries column
    5. Restore UNIQUE(boq_id, prelim_id) constraint
    """

    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        return False

    conn = None
    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)


        # ------------------------------------------------------------------
        # Step 1: Check if rollback is needed
        # ------------------------------------------------------------------

        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'boq_preliminaries'
            AND column_name = 'selected_preliminaries'
        """)
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return True

        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'boq_preliminaries'
            AND column_name = 'prelim_id'
        """)
        if cursor.fetchone():
            pass

        # ------------------------------------------------------------------
        # Step 2: Drop the new UNIQUE constraint on boq_id
        # ------------------------------------------------------------------

        cursor.execute("""
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            WHERE rel.relname = 'boq_preliminaries'
            AND con.contype = 'u'
        """)
        for uq_row in cursor.fetchall():
            uq_name = uq_row['conname']
            cursor.execute(f'ALTER TABLE boq_preliminaries DROP CONSTRAINT IF EXISTS "{uq_name}"')

        conn.commit()

        # ------------------------------------------------------------------
        # Step 3: Re-add prelim_id and is_checked columns
        # ------------------------------------------------------------------

        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'boq_preliminaries'
            AND column_name IN ('prelim_id', 'is_checked')
        """)
        existing_cols = [row['column_name'] for row in cursor.fetchall()]

        if 'prelim_id' not in existing_cols:
            cursor.execute("""
                ALTER TABLE boq_preliminaries
                ADD COLUMN prelim_id INTEGER
            """)

        if 'is_checked' not in existing_cols:
            cursor.execute("""
                ALTER TABLE boq_preliminaries
                ADD COLUMN is_checked BOOLEAN DEFAULT FALSE NOT NULL
            """)

        conn.commit()

        # ------------------------------------------------------------------
        # Step 4: Expand JSONB data back into individual rows
        # ------------------------------------------------------------------

        # Get all consolidated rows
        cursor.execute("""
            SELECT id, boq_id, selected_preliminaries, created_at, updated_at
            FROM boq_preliminaries
            WHERE selected_preliminaries IS NOT NULL
            AND selected_preliminaries != '[]'::jsonb
            ORDER BY boq_id
        """)
        consolidated_rows = cursor.fetchall()

        expanded_count = 0
        for row in consolidated_rows:
            boq_id = row['boq_id']
            keeper_id = row['id']
            created_at = row['created_at']
            updated_at = row['updated_at']
            prelim_items = row['selected_preliminaries']

            if not prelim_items or len(prelim_items) == 0:
                continue

            # Update the keeper row with the first preliminary item
            first_item = prelim_items[0]
            cursor.execute("""
                UPDATE boq_preliminaries
                SET prelim_id = %s, is_checked = TRUE
                WHERE id = %s
            """, (first_item['prelim_id'], keeper_id))

            # Insert additional rows for remaining items
            for item in prelim_items[1:]:
                cursor.execute("""
                    INSERT INTO boq_preliminaries (boq_id, prelim_id, is_checked, created_at, updated_at)
                    VALUES (%s, %s, TRUE, %s, %s)
                """, (boq_id, item['prelim_id'], created_at, updated_at))
                expanded_count += 1

        # Handle rows with empty JSON arrays (no checked items)
        cursor.execute("""
            SELECT id, boq_id
            FROM boq_preliminaries
            WHERE selected_preliminaries IS NULL
            OR selected_preliminaries = '[]'::jsonb
        """)
        empty_rows = cursor.fetchall()
        for row in empty_rows:
            # These rows had no checked items; set prelim_id to NULL for now
            # They will need manual cleanup or can be deleted
            # For safety, we set a placeholder (first available prelim_id from master)
            cursor.execute("""
                SELECT prelim_id FROM preliminaries_master
                WHERE is_deleted = FALSE AND is_active = TRUE
                ORDER BY display_order LIMIT 1
            """)
            fallback = cursor.fetchone()
            if fallback:
                cursor.execute("""
                    UPDATE boq_preliminaries
                    SET prelim_id = %s, is_checked = FALSE
                    WHERE id = %s AND prelim_id IS NULL
                """, (fallback['prelim_id'], row['id']))

        conn.commit()

        # ------------------------------------------------------------------
        # Step 5: Set prelim_id to NOT NULL and add FK constraint
        # ------------------------------------------------------------------

        # Make sure no NULLs remain
        cursor.execute("""
            SELECT COUNT(*) AS null_count
            FROM boq_preliminaries
            WHERE prelim_id IS NULL
        """)
        null_count = cursor.fetchone()['null_count']
        if null_count > 0:
            cursor.execute("DELETE FROM boq_preliminaries WHERE prelim_id IS NULL")

        cursor.execute("""
            ALTER TABLE boq_preliminaries
            ALTER COLUMN prelim_id SET NOT NULL
        """)

        cursor.execute("""
            ALTER TABLE boq_preliminaries
            ADD CONSTRAINT boq_preliminaries_prelim_id_fkey
            FOREIGN KEY (prelim_id) REFERENCES preliminaries_master(prelim_id)
        """)

        conn.commit()

        # ------------------------------------------------------------------
        # Step 6: Restore UNIQUE(boq_id, prelim_id) constraint
        # ------------------------------------------------------------------

        cursor.execute("""
            ALTER TABLE boq_preliminaries
            ADD CONSTRAINT boq_preliminaries_boq_id_prelim_id_key
            UNIQUE (boq_id, prelim_id)
        """)

        conn.commit()

        # ------------------------------------------------------------------
        # Step 7: Restore old indexes
        # ------------------------------------------------------------------

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_preliminaries_prelim_id
            ON boq_preliminaries(prelim_id)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_preliminaries_is_checked
            ON boq_preliminaries(is_checked)
        """)

        conn.commit()

        # ------------------------------------------------------------------
        # Step 8: Drop selected_preliminaries column
        # ------------------------------------------------------------------

        cursor.execute("""
            ALTER TABLE boq_preliminaries
            DROP COLUMN IF EXISTS selected_preliminaries
        """)

        conn.commit()

        # ------------------------------------------------------------------
        # Step 9: Verify final state
        # ------------------------------------------------------------------

        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'boq_preliminaries'
            ORDER BY ordinal_position
        """)
        columns = cursor.fetchall()
        for col in columns:
            pass

        cursor.execute("SELECT COUNT(*) AS total FROM boq_preliminaries")
        total = cursor.fetchone()['total']

        cursor.close()
        conn.close()


        return True

    except Exception as e:
        traceback.print_exc()
        if conn:
            conn.rollback()
            conn.close()
        return False


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--rollback':
        success = rollback_migration()
    else:
        success = run_migration()

    sys.exit(0 if success else 1)
