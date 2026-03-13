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


        # 1. Add stock_in_completed column
        cursor.execute("""
            ALTER TABLE vendor_delivery_inspections
            ADD COLUMN IF NOT EXISTS stock_in_completed BOOLEAN DEFAULT FALSE;
        """)

        # 2. Add stock_in_completed_at column
        cursor.execute("""
            ALTER TABLE vendor_delivery_inspections
            ADD COLUMN IF NOT EXISTS stock_in_completed_at TIMESTAMP;
        """)

        # 3. Add stock_in_completed_by column
        cursor.execute("""
            ALTER TABLE vendor_delivery_inspections
            ADD COLUMN IF NOT EXISTS stock_in_completed_by INTEGER;
        """)

        # 4. Create partial index for pending stock-in queries
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_vdi_pending_stockin
            ON vendor_delivery_inspections(is_deleted, inspection_status, stock_in_completed)
            WHERE is_deleted = FALSE AND stock_in_completed = FALSE;
        """)

        # 5. Backfill: Mark existing approved inspections as stock_in_completed
        cursor.execute("""
            UPDATE vendor_delivery_inspections
            SET stock_in_completed = TRUE,
                stock_in_completed_at = inspected_at
            WHERE inspection_status IN ('fully_approved', 'partially_approved')
              AND is_deleted = FALSE
              AND (stock_in_completed IS NULL OR stock_in_completed = FALSE);
        """)
        backfilled = cursor.rowcount


    except Exception as e:
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


        cursor.execute("DROP INDEX IF EXISTS idx_vdi_pending_stockin;")
        cursor.execute("ALTER TABLE vendor_delivery_inspections DROP COLUMN IF EXISTS stock_in_completed_by;")
        cursor.execute("ALTER TABLE vendor_delivery_inspections DROP COLUMN IF EXISTS stock_in_completed_at;")
        cursor.execute("ALTER TABLE vendor_delivery_inspections DROP COLUMN IF EXISTS stock_in_completed;")


    except Exception as e:
        raise
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    run_migration()
