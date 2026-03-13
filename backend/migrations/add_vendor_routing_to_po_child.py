"""
Migration: Add vendor delivery routing fields to po_child table
Purpose: Support "Complete & Send to Production Manager" workflow for PO Children
Date: 2025-12-19
"""

import psycopg2
from psycopg2 import sql
import os

def run_migration():
    """Add vendor delivery routing fields to po_child table"""

    conn = None
    try:
        # Connect using DATABASE_URL environment variable
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()


        # 1. sub_items_data (materials field alias)
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS sub_items_data JSONB
        """)

        # 2. delivery_routing
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS delivery_routing VARCHAR(50) DEFAULT 'direct_to_site'
        """)

        # 3. vendor_delivered_to_store
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS vendor_delivered_to_store BOOLEAN DEFAULT FALSE
        """)

        # 4. vendor_delivery_date
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS vendor_delivery_date TIMESTAMP
        """)

        # 5. buyer_completion_notes
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS buyer_completion_notes TEXT
        """)

        # 6. store_request_status
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS store_request_status VARCHAR(50)
        """)

        # Copy materials_data to sub_items_data for existing records
        cursor.execute("""
            UPDATE po_child
            SET sub_items_data = materials_data
            WHERE sub_items_data IS NULL AND materials_data IS NOT NULL
        """)



        cursor.close()

    except Exception as e:
        raise

    finally:
        if conn:
            conn.close()


def rollback_migration():
    """Remove vendor delivery routing fields (rollback)"""

    conn = None
    try:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()


        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS sub_items_data")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS delivery_routing")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS vendor_delivered_to_store")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS vendor_delivery_date")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS buyer_completion_notes")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS store_request_status")


        cursor.close()

    except Exception as e:
        raise

    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    """Run migration directly"""
    run_migration()
