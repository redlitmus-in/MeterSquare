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

        print("\n" + "="*60)
        print("PO CHILD VENDOR DELIVERY ROUTING MIGRATION")
        print("="*60)
        print("\nConnected to database successfully")
        print("\nAdding vendor delivery routing fields to po_child table...\n")

        # 1. sub_items_data (materials field alias)
        print("  - Adding sub_items_data column...")
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS sub_items_data JSONB
        """)

        # 2. delivery_routing
        print("  - Adding delivery_routing column...")
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS delivery_routing VARCHAR(50) DEFAULT 'direct_to_site'
        """)

        # 3. vendor_delivered_to_store
        print("  - Adding vendor_delivered_to_store column...")
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS vendor_delivered_to_store BOOLEAN DEFAULT FALSE
        """)

        # 4. vendor_delivery_date
        print("  - Adding vendor_delivery_date column...")
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS vendor_delivery_date TIMESTAMP
        """)

        # 5. buyer_completion_notes
        print("  - Adding buyer_completion_notes column...")
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS buyer_completion_notes TEXT
        """)

        # 6. store_request_status
        print("  - Adding store_request_status column...")
        cursor.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS store_request_status VARCHAR(50)
        """)

        # Copy materials_data to sub_items_data for existing records
        print("  - Copying materials_data to sub_items_data...")
        cursor.execute("""
            UPDATE po_child
            SET sub_items_data = materials_data
            WHERE sub_items_data IS NULL AND materials_data IS NOT NULL
        """)

        print("\n✅ po_child table updated")

        print("\n" + "="*60)
        print("✅ MIGRATION COMPLETED SUCCESSFULLY")
        print("="*60)
        print("\nAdded to po_child:")
        print("  ✓ sub_items_data (JSONB - alias for materials)")
        print("  ✓ delivery_routing (direct_to_site | via_production_manager)")
        print("  ✓ vendor_delivered_to_store (boolean)")
        print("  ✓ vendor_delivery_date (timestamp)")
        print("  ✓ buyer_completion_notes (text)")
        print("  ✓ store_request_status (workflow tracking)")
        print("="*60 + "\n")

        cursor.close()

    except Exception as e:
        print(f"\n❌ MIGRATION FAILED: {str(e)}\n")
        raise

    finally:
        if conn:
            conn.close()
            print("Database connection closed\n")


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

        print("\n" + "="*60)
        print("ROLLING BACK PO CHILD VENDOR DELIVERY ROUTING MIGRATION")
        print("="*60 + "\n")

        print("Removing columns from po_child...")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS sub_items_data")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS delivery_routing")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS vendor_delivered_to_store")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS vendor_delivery_date")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS buyer_completion_notes")
        cursor.execute("ALTER TABLE po_child DROP COLUMN IF EXISTS store_request_status")

        print("\n✅ ROLLBACK COMPLETED SUCCESSFULLY\n")

        cursor.close()

    except Exception as e:
        print(f"\n❌ ROLLBACK FAILED: {str(e)}\n")
        raise

    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    """Run migration directly"""
    run_migration()
