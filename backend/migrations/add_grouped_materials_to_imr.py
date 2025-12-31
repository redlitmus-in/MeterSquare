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
        print("ERROR: DATABASE_URL environment variable not set")
        return False

    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        print("=" * 60)
        print("Migration: Add Grouped Materials Support to IMR")
        print("=" * 60)

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
            print("Adding po_child_id column...")
            cursor.execute("""
                ALTER TABLE internal_inventory_material_requests
                ADD COLUMN po_child_id INTEGER
            """)
            print("  ✓ po_child_id column added")
        else:
            print("  - po_child_id column already exists")

        # Add materials_data column (JSONB for storing all materials)
        if 'materials_data' not in existing_columns:
            print("Adding materials_data column...")
            cursor.execute("""
                ALTER TABLE internal_inventory_material_requests
                ADD COLUMN materials_data JSONB
            """)
            print("  ✓ materials_data column added")
        else:
            print("  - materials_data column already exists")

        # Add materials_count column
        if 'materials_count' not in existing_columns:
            print("Adding materials_count column...")
            cursor.execute("""
                ALTER TABLE internal_inventory_material_requests
                ADD COLUMN materials_count INTEGER DEFAULT 1
            """)
            print("  ✓ materials_count column added")
        else:
            print("  - materials_count column already exists")

        conn.commit()

        print()
        print("=" * 60)
        print("Migration completed successfully!")
        print("=" * 60)
        print()
        print("New columns added to internal_inventory_material_requests:")
        print("  - po_child_id: Links to source POChild")
        print("  - materials_data: JSONB array of all materials in grouped request")
        print("  - materials_count: Number of materials in grouped request")
        print()

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        print(f"ERROR: Migration failed - {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def rollback_migration():
    """Remove the added columns (rollback)"""

    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        return False

    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()

        print("Rolling back migration...")

        cursor.execute("""
            ALTER TABLE internal_inventory_material_requests
            DROP COLUMN IF EXISTS po_child_id,
            DROP COLUMN IF EXISTS materials_data,
            DROP COLUMN IF EXISTS materials_count
        """)

        conn.commit()
        print("Rollback completed successfully!")

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        print(f"ERROR: Rollback failed - {str(e)}")
        return False


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--rollback':
        rollback_migration()
    else:
        run_migration()
