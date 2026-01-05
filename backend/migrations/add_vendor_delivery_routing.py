"""
Migration: Add vendor delivery routing fields to change_requests and internal_material_requests
Purpose: Support "Complete & Send to Production Manager" workflow

When buyer completes a purchase, they can choose to:
1. Complete directly (existing flow)
2. Complete & send to Production Manager (new flow - materials go through M2 Store)

Author: Claude Code
Date: 2025-12-19
"""

import psycopg2
from psycopg2 import sql
import os

def run_migration():
    """Add vendor delivery routing fields"""

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
        print("VENDOR DELIVERY ROUTING MIGRATION")
        print("="*60)
        print("\nConnected to database successfully")
        print("\nThis migration adds support for routing vendor deliveries")
        print("through the Production Manager (M2 Store) workflow.\n")

        # ========================================
        # CHANGE_REQUESTS TABLE UPDATES
        # ========================================

        print("📦 Adding fields to change_requests table...")

        # 1. delivery_routing
        print("  - Adding delivery_routing column...")
        cursor.execute("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS delivery_routing VARCHAR(50) DEFAULT 'direct_to_site'
        """)

        # 2. vendor_delivered_to_store
        print("  - Adding vendor_delivered_to_store column...")
        cursor.execute("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS vendor_delivered_to_store BOOLEAN DEFAULT FALSE
        """)

        # 3. vendor_delivery_date
        print("  - Adding vendor_delivery_date column...")
        cursor.execute("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS vendor_delivery_date TIMESTAMP
        """)

        # 4. buyer_completion_notes
        print("  - Adding buyer_completion_notes column...")
        cursor.execute("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS buyer_completion_notes TEXT
        """)

        # 5. store_request_status
        print("  - Adding store_request_status column...")
        cursor.execute("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS store_request_status VARCHAR(50)
        """)

        print("✅ change_requests table updated\n")

        # ========================================
        # INTERNAL_MATERIAL_REQUESTS TABLE UPDATES
        # ========================================

        print("📦 Adding fields to internal_inventory_material_requests table...")

        # 6. source_type
        print("  - Adding source_type column...")
        cursor.execute("""
            ALTER TABLE internal_inventory_material_requests
            ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'manual'
        """)

        # 7. vendor_delivery_confirmed
        print("  - Adding vendor_delivery_confirmed column...")
        cursor.execute("""
            ALTER TABLE internal_inventory_material_requests
            ADD COLUMN IF NOT EXISTS vendor_delivery_confirmed BOOLEAN DEFAULT FALSE
        """)

        # 8. expected_delivery_date
        print("  - Adding expected_delivery_date column...")
        cursor.execute("""
            ALTER TABLE internal_inventory_material_requests
            ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMP
        """)

        # 9. final_destination_site
        print("  - Adding final_destination_site column...")
        cursor.execute("""
            ALTER TABLE internal_inventory_material_requests
            ADD COLUMN IF NOT EXISTS final_destination_site VARCHAR(255)
        """)

        # 10. routed_by_buyer_id
        print("  - Adding routed_by_buyer_id column...")
        cursor.execute("""
            ALTER TABLE internal_inventory_material_requests
            ADD COLUMN IF NOT EXISTS routed_by_buyer_id INTEGER
        """)

        # 11. routed_to_store_at
        print("  - Adding routed_to_store_at column...")
        cursor.execute("""
            ALTER TABLE internal_inventory_material_requests
            ADD COLUMN IF NOT EXISTS routed_to_store_at TIMESTAMP
        """)

        print("✅ internal_inventory_material_requests table updated\n")

        print("="*60)
        print("✅ MIGRATION COMPLETED SUCCESSFULLY")
        print("="*60)
        print("\nAdded to change_requests:")
        print("  ✓ delivery_routing (direct_to_site | via_production_manager)")
        print("  ✓ vendor_delivered_to_store (boolean)")
        print("  ✓ vendor_delivery_date (timestamp)")
        print("  ✓ buyer_completion_notes (text)")
        print("  ✓ store_request_status (workflow tracking)")
        print("\nAdded to internal_inventory_material_requests:")
        print("  ✓ source_type (manual | from_vendor_delivery)")
        print("  ✓ vendor_delivery_confirmed (boolean)")
        print("  ✓ expected_delivery_date (timestamp)")
        print("  ✓ final_destination_site (varchar)")
        print("  ✓ routed_by_buyer_id (integer)")
        print("  ✓ routed_to_store_at (timestamp)")
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
        print("ROLLING BACK VENDOR DELIVERY ROUTING MIGRATION")
        print("="*60 + "\n")

        print("Removing columns from change_requests...")
        cursor.execute("ALTER TABLE change_requests DROP COLUMN IF EXISTS delivery_routing")
        cursor.execute("ALTER TABLE change_requests DROP COLUMN IF EXISTS vendor_delivered_to_store")
        cursor.execute("ALTER TABLE change_requests DROP COLUMN IF EXISTS vendor_delivery_date")
        cursor.execute("ALTER TABLE change_requests DROP COLUMN IF EXISTS buyer_completion_notes")
        cursor.execute("ALTER TABLE change_requests DROP COLUMN IF EXISTS store_request_status")

        print("Removing columns from internal_inventory_material_requests...")
        cursor.execute("ALTER TABLE internal_inventory_material_requests DROP COLUMN IF EXISTS source_type")
        cursor.execute("ALTER TABLE internal_inventory_material_requests DROP COLUMN IF EXISTS vendor_delivery_confirmed")
        cursor.execute("ALTER TABLE internal_inventory_material_requests DROP COLUMN IF EXISTS expected_delivery_date")
        cursor.execute("ALTER TABLE internal_inventory_material_requests DROP COLUMN IF EXISTS final_destination_site")
        cursor.execute("ALTER TABLE internal_inventory_material_requests DROP COLUMN IF EXISTS routed_by_buyer_id")
        cursor.execute("ALTER TABLE internal_inventory_material_requests DROP COLUMN IF EXISTS routed_to_store_at")

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
