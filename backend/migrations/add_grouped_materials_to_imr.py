"""
Migration: Add grouped materials columns to internal_inventory_material_requests table
Purpose: Support grouped material requests (one request per PO, not per material)
Date: 2025-12-31
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor


def run_migration():
    """Add po_child_id, materials_data, and materials_count columns"""

    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        return False

    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)


        # Check if columns already exist
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'internal_inventory_material_requests'
            AND column_name IN ('po_child_id', 'materials_data', 'materials_count')
        """)
        existing_columns = [row['column_name'] for row in cursor.fetchall()]

        # Add po_child_id column
        if 'po_child_id' not in existing_columns:
            cursor.execute("""
                ALTER TABLE internal_inventory_material_requests
                ADD COLUMN po_child_id INTEGER
            """)
        else:
            pass

        # Add materials_data column (JSONB for storing all materials)
        if 'materials_data' not in existing_columns:
            cursor.execute("""
                ALTER TABLE internal_inventory_material_requests
                ADD COLUMN materials_data JSONB
            """)
        else:
            pass

        # Add materials_count column
        if 'materials_count' not in existing_columns:
            cursor.execute("""
                ALTER TABLE internal_inventory_material_requests
                ADD COLUMN materials_count INTEGER DEFAULT 1
            """)
        else:
            pass

        conn.commit()


        cursor.close()
        conn.close()
        return True

    except Exception as e:
        import traceback
        traceback.print_exc()
        return False


def rollback_migration():
    """Remove the added columns (rollback)"""

    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        return False

    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()


        cursor.execute("""
            ALTER TABLE internal_inventory_material_requests
            DROP COLUMN IF EXISTS po_child_id,
            DROP COLUMN IF EXISTS materials_data,
            DROP COLUMN IF EXISTS materials_count
        """)

        conn.commit()

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        return False


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--rollback':
        rollback_migration()
    else:
        run_migration()
