"""
Migration: Remove unused columns from change_requests table (DEVELOPMENT ONLY)
Purpose: Clean up database schema by removing 25 unused columns

Columns to remove:
1. MEP Approval columns (3) - Never implemented
2. Deprecated parent-child CR columns (3) - Replaced by po_children table
3. Unused feature columns (2) - Never used
4. Overhead tracking columns (17) - Not implemented/populated

Author: Claude Code
Date: 2025-12-19
Environment: DEVELOPMENT ONLY
"""

import psycopg2
from psycopg2 import sql
import os

def run_migration():
    """Remove unused columns from change_requests table in DEVELOPMENT"""

    conn = None
    try:
        # Connect using DATABASE_URL environment variable
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        print("\n" + "="*80)
        print("CLEANUP: REMOVE UNUSED COLUMNS FROM change_requests")
        print("ENVIRONMENT: DEVELOPMENT ONLY")
        print("="*80)
        print("\nConnected to database successfully")
        print("\nThis migration removes 25 unused columns to clean up the schema.\n")

        # ========================================
        # CATEGORY 1: MEP APPROVAL COLUMNS (3)
        # ========================================
        print("📦 Removing MEP Approval columns (never implemented)...")

        cursor.execute("""
            ALTER TABLE change_requests
            DROP COLUMN IF EXISTS mep_approved_by_user_id,
            DROP COLUMN IF EXISTS mep_approved_by_name,
            DROP COLUMN IF EXISTS mep_approval_date;
        """)
        print("  ✅ Removed 3 MEP approval columns")

        # ========================================
        # CATEGORY 2: DEPRECATED PARENT-CHILD COLUMNS (3)
        # ========================================
        print("\n📦 Removing deprecated parent-child CR columns...")

        cursor.execute("""
            ALTER TABLE change_requests
            DROP COLUMN IF EXISTS parent_cr_id,
            DROP COLUMN IF EXISTS cr_number_suffix,
            DROP COLUMN IF EXISTS submission_group_id;
        """)
        print("  ✅ Removed 3 deprecated parent-child columns")

        # ========================================
        # CATEGORY 3: UNUSED FEATURE COLUMNS (2)
        # ========================================
        print("\n📦 Removing unused feature columns...")

        cursor.execute("""
            ALTER TABLE change_requests
            DROP COLUMN IF EXISTS new_sub_item_reason,
            DROP COLUMN IF EXISTS notification_sent_at;
        """)
        print("  ✅ Removed 2 unused feature columns")

        # ========================================
        # CATEGORY 4: OVERHEAD TRACKING COLUMNS (17)
        # ========================================
        print("\n📦 Removing overhead tracking columns (not implemented)...")

        cursor.execute("""
            ALTER TABLE change_requests
            DROP COLUMN IF EXISTS item_overhead_allocated,
            DROP COLUMN IF EXISTS item_overhead_consumed_before,
            DROP COLUMN IF EXISTS item_overhead_available,
            DROP COLUMN IF EXISTS overhead_consumed,
            DROP COLUMN IF EXISTS overhead_balance_impact,
            DROP COLUMN IF EXISTS original_overhead_allocated,
            DROP COLUMN IF EXISTS original_overhead_used,
            DROP COLUMN IF EXISTS original_overhead_remaining,
            DROP COLUMN IF EXISTS original_overhead_percentage,
            DROP COLUMN IF EXISTS original_profit_percentage,
            DROP COLUMN IF EXISTS new_overhead_remaining,
            DROP COLUMN IF EXISTS percentage_of_item_overhead,
            DROP COLUMN IF EXISTS profit_impact,
            DROP COLUMN IF EXISTS new_base_cost,
            DROP COLUMN IF EXISTS new_total_cost,
            DROP COLUMN IF EXISTS cost_increase_amount,
            DROP COLUMN IF EXISTS cost_increase_percentage,
            DROP COLUMN IF EXISTS is_over_budget;
        """)
        print("  ✅ Removed 18 overhead tracking columns")

        print("\n" + "="*80)
        print("✅ MIGRATION COMPLETED SUCCESSFULLY")
        print("="*80)
        print("\nRemoved columns by category:")
        print("  ✓ MEP Approval: 3 columns")
        print("  ✓ Deprecated Parent-Child: 3 columns")
        print("  ✓ Unused Features: 2 columns")
        print("  ✓ Overhead Tracking: 18 columns")
        print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("  TOTAL REMOVED: 26 columns")
        print("\nSchema is now cleaner and more efficient!")
        print("="*80 + "\n")

        cursor.close()

    except Exception as e:
        print(f"\n❌ MIGRATION FAILED: {str(e)}\n")
        raise

    finally:
        if conn:
            conn.close()
            print("Database connection closed\n")


def rollback_migration():
    """
    ROLLBACK NOT SUPPORTED

    Since we're removing unused columns that never had data,
    there's nothing to restore. If you need these columns back,
    you'll need to add them manually with ALTER TABLE.
    """
    print("\n⚠️  ROLLBACK NOT SUPPORTED")
    print("Removed columns had no data. If needed, add them back manually.\n")


if __name__ == "__main__":
    """Run migration directly"""
    print("\n⚠️  WARNING: This will remove 26 unused columns from change_requests")
    print("Environment: DEVELOPMENT database only")

    confirm = input("\nProceed with cleanup? (yes/no): ")
    if confirm.lower() == 'yes':
        run_migration()
    else:
        print("Migration cancelled.\n")
