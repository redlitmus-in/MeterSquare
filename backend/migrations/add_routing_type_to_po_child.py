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

        # Step 1: Add routing_type column
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS routing_type VARCHAR(20) DEFAULT 'vendor';
        """)
        conn.commit()

        # Step 2: Set default value for existing records
        cursor.execute("""
            UPDATE po_child
            SET routing_type = 'vendor'
            WHERE routing_type IS NULL;
        """)
        conn.commit()

        # Step 3: Add NOT NULL constraint
        cursor.execute("""
            ALTER TABLE po_child
            ALTER COLUMN routing_type SET NOT NULL;
        """)
        conn.commit()

        # Step 4: Add index for routing_type queries
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_po_child_routing_type
            ON po_child(routing_type, is_deleted);
        """)
        conn.commit()

        # Verify migration
        cursor.execute("""
            SELECT routing_type, COUNT(*) as count
            FROM po_child
            WHERE is_deleted = FALSE
            GROUP BY routing_type;
        """)

        rows = cursor.fetchall()
        if rows:
            for row in rows:
                pass
        else:
            pass


        cursor.close()
        conn.close()

    except Exception as e:
        conn.rollback()
        import traceback
        cursor.close()
        conn.close()
        sys.exit(1)


if __name__ == "__main__":
    run_migration()
