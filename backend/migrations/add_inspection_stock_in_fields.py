"""
Migration: Add stock-in tracking fields to vendor_delivery_inspections
Purpose: Track whether PM has completed manual stock-in after inspection approval.
         Enables two-phase flow: Inspection → Awaiting Stock In → Stock In Complete.

Columns Added:
  - vendor_delivery_inspections.stock_in_completed (BOOLEAN DEFAULT FALSE)
  - vendor_delivery_inspections.stock_in_completed_at (TIMESTAMP)
  - vendor_delivery_inspections.stock_in_completed_by (INTEGER)

Backfill:
  - Existing approved inspections marked as stock_in_completed=TRUE

Author: Claude Code
Date: 2026-02-19
"""

import psycopg2
import os


def run_migration():
    """Add stock-in tracking fields to vendor_delivery_inspections"""

    conn = None
    try:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        print("\n" + "=" * 60)
        print("ADD INSPECTION STOCK-IN FIELDS MIGRATION")
        print("=" * 60)
        print("\nConnected to database successfully")

        # 1. Add stock_in_completed column
        print("\n1/4 Adding stock_in_completed column...")
        cursor.execute("""
            ALTER TABLE vendor_delivery_inspections
            ADD COLUMN IF NOT EXISTS stock_in_completed BOOLEAN DEFAULT FALSE;
        """)
        print("    Done.")

        # 2. Add stock_in_completed_at column
        print("2/4 Adding stock_in_completed_at column...")
        cursor.execute("""
            ALTER TABLE vendor_delivery_inspections
            ADD COLUMN IF NOT EXISTS stock_in_completed_at TIMESTAMP;
        """)
        print("    Done.")

        # 3. Add stock_in_completed_by column
        print("3/4 Adding stock_in_completed_by column...")
        cursor.execute("""
            ALTER TABLE vendor_delivery_inspections
            ADD COLUMN IF NOT EXISTS stock_in_completed_by INTEGER;
        """)
        print("    Done.")

        # 4. Create partial index for pending stock-in queries
        print("4/4 Creating partial index for pending stock-in queries...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_vdi_pending_stockin
            ON vendor_delivery_inspections(is_deleted, inspection_status, stock_in_completed)
            WHERE is_deleted = FALSE AND stock_in_completed = FALSE;
        """)
        print("    Done.")

        # 5. Backfill: Mark existing approved inspections as stock_in_completed
        print("\nBackfilling existing approved inspections as stock_in_completed=TRUE...")
        cursor.execute("""
            UPDATE vendor_delivery_inspections
            SET stock_in_completed = TRUE,
                stock_in_completed_at = inspected_at
            WHERE inspection_status IN ('fully_approved', 'partially_approved')
              AND is_deleted = FALSE
              AND (stock_in_completed IS NULL OR stock_in_completed = FALSE);
        """)
        backfilled = cursor.rowcount
        print(f"    Backfilled {backfilled} existing inspection(s).")

        print("\n" + "=" * 60)
        print("MIGRATION COMPLETED SUCCESSFULLY")
        print("=" * 60)

    except Exception as e:
        print(f"\nMIGRATION FAILED: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()


def rollback_migration():
    """Remove stock-in tracking fields from vendor_delivery_inspections"""

    conn = None
    try:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        print("\nRolling back stock-in fields migration...")

        cursor.execute("DROP INDEX IF EXISTS idx_vdi_pending_stockin;")
        cursor.execute("ALTER TABLE vendor_delivery_inspections DROP COLUMN IF EXISTS stock_in_completed_by;")
        cursor.execute("ALTER TABLE vendor_delivery_inspections DROP COLUMN IF EXISTS stock_in_completed_at;")
        cursor.execute("ALTER TABLE vendor_delivery_inspections DROP COLUMN IF EXISTS stock_in_completed;")

        print("Rollback completed.")

    except Exception as e:
        print(f"ROLLBACK FAILED: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    run_migration()
