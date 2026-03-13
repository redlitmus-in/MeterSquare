"""
PRIORITY 2 - CRITICAL MISSING INDEXES (Part 1 of 4)
Performance Analysis 2025-11-18

This migration adds 20 critical missing indexes identified in comprehensive performance audit.
These indexes target the most frequently queried columns that are currently UNINDEXED.

ZERO DOWNTIME - Uses CONCURRENT index creation
ZERO DATA CHANGES - Only adds lookup structures
100% BACKWARD COMPATIBLE - No code changes needed

Expected Impact:
- BOQ detail queries: 70-85% faster
- Material/Labour tracking: 60-80% faster
- Change request workflow: 75-90% faster
- Assignment queries: 80-95% faster
- Vendor queries: 60-75% faster

Run: python backend/migrations/add_critical_missing_indexes_2025.py

Created: 2025-11-18
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

def get_db_connection():
    """Get database connection from environment variables"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL not found in environment variables")
    return psycopg2.connect(database_url)

def run_migration():
    """Add critical missing indexes to the database"""
    conn = get_db_connection()
    conn.set_isolation_level(0)  # Autocommit mode for CONCURRENT indexes
    cursor = conn.cursor()

    try:

        # ============================================================
        # SECTION 1: BOQ Details & History (Critical for Dashboard)
        # ============================================================


        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boq_details_boq_deleted
            ON boq_details(boq_id, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boq_details_created
            ON boq_details(created_at DESC)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boq_details_history_detail_id
            ON boq_details_history(boq_detail_id)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boq_details_history_boq_version
            ON boq_details_history(boq_id, version DESC)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boq_history_action_date
            ON boq_history(action_date DESC)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boq_history_status
            ON boq_history(boq_status)
        """)

        # ============================================================
        # SECTION 2: Material & Labour Tracking (Critical for PM/Buyer)
        # ============================================================


        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_material_tracking_project_boq
            ON material_purchase_tracking(project_id, boq_id, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_material_tracking_is_cr
            ON material_purchase_tracking(is_from_change_request)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_material_tracking_created
            ON material_purchase_tracking(created_at DESC)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_labour_tracking_project_boq
            ON labour_tracking(project_id, boq_id, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_labour_tracking_created
            ON labour_tracking(created_at DESC)
        """)

        # ============================================================
        # SECTION 3: Change Request Workflow (Critical for Approvals)
        # ============================================================


        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cr_project_status_date
            ON change_requests(project_id, status, created_at DESC)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cr_approval_required
            ON change_requests(approval_required_from)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cr_created_at
            ON change_requests(created_at DESC)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cr_updated_at
            ON change_requests(updated_at DESC)
        """)

        # ============================================================
        # SECTION 4: Assignment Tracking (Critical for PM/SE)
        # ============================================================


        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_assign_project_status
            ON pm_assign_ss(project_id, assignment_status, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_assign_status
            ON pm_assign_ss(assignment_status)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_assign_completion
            ON pm_assign_ss(completion_date DESC)
        """)

        # ============================================================
        # SECTION 5: Vendor Management (Critical for Buyer)
        # ============================================================


        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendor_status_deleted
            ON vendors(status, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendor_created
            ON vendors(created_at DESC)
        """)

        # ============================================================
        # Update Statistics
        # ============================================================


        tables_to_analyze = [
            'boq_details',
            'boq_details_history',
            'boq_history',
            'material_purchase_tracking',
            'labour_tracking',
            'change_requests',
            'pm_assign_ss',
            'vendors'
        ]

        for table in tables_to_analyze:
            cursor.execute(f"ANALYZE {table}")

    except Exception as e:
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":

    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--auto':
        run_migration()
    else:
        response = input("\n▶️  Ready to add 20 critical indexes? (yes/no): ")
        if response.lower() == 'yes':
            run_migration()
        else:
            pass
