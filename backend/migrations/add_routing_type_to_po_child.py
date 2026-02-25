"""
Migration: Add routing_type field to po_child table

This enables POChild to handle both store and vendor routing uniformly.

Purpose:
- Add routing_type field ('store' or 'vendor')
- Set default 'vendor' for existing POChildren
- Enable clean split PO architecture

Author: System
Date: 2026-02-11

Run: python backend/migrations/add_routing_type_to_po_child.py
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()


def get_db_connection():
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL not found in environment")
    return psycopg2.connect(database_url)


def run_migration():
    """Add routing_type field to po_child table"""

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        print("=" * 80)
        print("MIGRATION: Add routing_type to po_child table")
        print("=" * 80)

        # Step 1: Add routing_type column
        print("\n[1/4] Adding routing_type column to po_child table...")
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS routing_type VARCHAR(20) DEFAULT 'vendor';
        """)
        conn.commit()
        print("✅ routing_type column added successfully")

        # Step 2: Set default value for existing records
        print("\n[2/4] Setting routing_type='vendor' for all existing POChildren...")
        cursor.execute("""
            UPDATE po_child
            SET routing_type = 'vendor'
            WHERE routing_type IS NULL;
        """)
        conn.commit()
        print(f"✅ Updated {cursor.rowcount} existing POChild records")

        # Step 3: Add NOT NULL constraint
        print("\n[3/4] Adding NOT NULL constraint to routing_type...")
        cursor.execute("""
            ALTER TABLE po_child
            ALTER COLUMN routing_type SET NOT NULL;
        """)
        conn.commit()
        print("✅ NOT NULL constraint added")

        # Step 4: Add index for routing_type queries
        print("\n[4/4] Adding index on routing_type for performance...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_po_child_routing_type
            ON po_child(routing_type, is_deleted);
        """)
        conn.commit()
        print("✅ Index created successfully")

        # Verify migration
        print("\n[VERIFICATION] Checking routing_type column...")
        cursor.execute("""
            SELECT routing_type, COUNT(*) as count
            FROM po_child
            WHERE is_deleted = FALSE
            GROUP BY routing_type;
        """)

        print("\nCurrent routing_type distribution:")
        rows = cursor.fetchall()
        if rows:
            for row in rows:
                print(f"  - {row[0]}: {row[1]} records")
        else:
            print("  - No POChild records found (this is normal for new systems)")

        print("\n" + "=" * 80)
        print("✅ MIGRATION COMPLETED SUCCESSFULLY")
        print("=" * 80)
        print("\nNext Steps:")
        print("1. Update POChild model to include routing_type field")
        print("2. Update create_po_children() to accept routing_type parameter")
        print("3. Update frontend to send routing_type when creating POChildren")

        cursor.close()
        conn.close()

    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR: Migration failed: {e}")
        import traceback
        print(traceback.format_exc())
        cursor.close()
        conn.close()
        sys.exit(1)


if __name__ == "__main__":
    run_migration()
