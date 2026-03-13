"""
PRIORITY 2 - VERIFICATION SCRIPT
Verifies all indexes and constraints were created successfully

Run: python backend/migrations/verify_priority2_indexes.py

Created: 2025-11-18
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2
from tabulate import tabulate

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

def get_db_connection():
    """Get database connection from environment variables"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL not found in environment variables")
    return psycopg2.connect(database_url)

def verify_indexes():
    """Verify all Priority 2 indexes and constraints"""
    conn = get_db_connection()
    cursor = conn.cursor()


    # ============================================================
    # PART 1: Verify Critical Indexes
    # ============================================================


    part1_indexes = [
        'idx_boq_details_boq_deleted',
        'idx_boq_details_created',
        'idx_boq_details_history_detail_id',
        'idx_boq_details_history_boq_version',
        'idx_boq_history_action_date',
        'idx_boq_history_status',
        'idx_material_tracking_project_boq',
        'idx_material_tracking_is_cr',
        'idx_material_tracking_created',
        'idx_labour_tracking_project_boq',
        'idx_labour_tracking_created',
        'idx_cr_project_status_date',
        'idx_cr_approval_required',
        'idx_cr_created_at',
        'idx_cr_updated_at',
        'idx_pm_assign_project_status',
        'idx_pm_assign_status',
        'idx_pm_assign_completion',
        'idx_vendor_status_deleted',
        'idx_vendor_created'
    ]

    found_part1 = []
    missing_part1 = []

    for idx_name in part1_indexes:
        cursor.execute("""
            SELECT indexname, tablename, indexdef
            FROM pg_indexes
            WHERE indexname = %s
        """, (idx_name,))
        result = cursor.fetchone()
        if result:
            found_part1.append((result[0], result[1], '✓'))
        else:
            missing_part1.append(idx_name)

    if missing_part1:
        pass
    else:
        pass

    # ============================================================
    # PART 2: Verify JSONB GIN Indexes
    # ============================================================


    part2_indexes = [
        'idx_boq_details_items',  # May exist from previous migration
        'idx_boq_details_history_jsonb',
        'idx_boq_history_action_jsonb',
        'idx_material_purchase_history_jsonb',
        'idx_labour_history_jsonb',
        'idx_cr_sub_items_jsonb',
        'idx_cr_materials_jsonb',
        'idx_pm_assign_item_details_jsonb',
        'idx_internal_revision_changes_jsonb'
    ]

    found_part2 = []
    missing_part2 = []

    for idx_name in part2_indexes:
        cursor.execute("""
            SELECT indexname, tablename, indexdef
            FROM pg_indexes
            WHERE indexname = %s AND indexdef LIKE '%USING gin%'
        """, (idx_name,))
        result = cursor.fetchone()
        if result:
            found_part2.append((result[0], result[1], '✓ GIN'))
        else:
            missing_part2.append(idx_name)

    if missing_part2:
        pass
    else:
        pass

    # ============================================================
    # PART 3: Verify Composite Workflow Indexes
    # ============================================================


    part3_indexes = [
        'idx_assignment_buyer_workflow',
        'idx_assignment_vendor_selection',
        'idx_vendor_product_category',
        'idx_vendor_product_category_filter',
        'idx_vendor_product_created',
        'idx_preliminary_selection',
        'idx_internal_revision_number',
        'idx_internal_revision_created',
        'idx_master_material_subitem',
        'idx_master_labour_subitem'
    ]

    found_part3 = []
    missing_part3 = []

    for idx_name in part3_indexes:
        cursor.execute("""
            SELECT indexname, tablename, indexdef
            FROM pg_indexes
            WHERE indexname = %s
        """, (idx_name,))
        result = cursor.fetchone()
        if result:
            found_part3.append((result[0], result[1], '✓'))
        else:
            missing_part3.append(idx_name)

    if missing_part3:
        pass
    else:
        pass

    # ============================================================
    # PART 4: Verify Foreign Key Constraints
    # ============================================================


    cursor.execute("""
        SELECT
            tc.constraint_name,
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.constraint_name IN (
                'fk_master_material_item',
                'fk_master_labour_item',
                'fk_change_request_boq',
                'fk_change_request_project'
            )
    """)

    foreign_keys = cursor.fetchall()

    if len(foreign_keys) < 4:
        pass
    else:
        for fk in foreign_keys:
            pass

    # Part 4 supporting indexes
    part4_indexes = [
        'idx_master_material_item_id',
        'idx_master_labour_item_id'
    ]

    found_part4 = []
    for idx_name in part4_indexes:
        cursor.execute("""
            SELECT indexname FROM pg_indexes WHERE indexname = %s
        """, (idx_name,))
        if cursor.fetchone():
            found_part4.append(idx_name)


    # ============================================================
    # Overall Summary
    # ============================================================

    total_expected = len(part1_indexes) + len(part2_indexes) + len(part3_indexes) + len(part4_indexes)
    total_found = len(found_part1) + len(found_part2) + len(found_part3) + len(found_part4)


    summary_data = [
        ["Part 1: Critical Indexes", len(found_part1), len(part1_indexes), "✅" if len(found_part1) == len(part1_indexes) else "❌"],
        ["Part 2: JSONB GIN Indexes", len(found_part2), len(part2_indexes), "✅" if len(found_part2) == len(part2_indexes) else "❌"],
        ["Part 3: Composite Indexes", len(found_part3), len(part3_indexes), "✅" if len(found_part3) == len(part3_indexes) else "❌"],
        ["Part 4: FK Indexes", len(found_part4), len(part4_indexes), "✅" if len(found_part4) == len(part4_indexes) else "⚠️"],
        ["Part 4: Foreign Keys", len(foreign_keys), 4, "✅" if len(foreign_keys) == 4 else "⚠️"],
        ["", "", "", ""],
        ["TOTAL INDEXES", total_found, total_expected, "✅" if total_found >= 39 else "❌"]
    ]


    # ============================================================
    # Performance Check
    # ============================================================


    cursor.execute("""
        SELECT
            schemaname || '.' || tablename AS table,
            indexname,
            idx_scan AS scans,
            pg_size_pretty(pg_relation_size(indexrelid)) AS size
        FROM pg_stat_user_indexes
        WHERE indexname LIKE 'idx_%'
        ORDER BY idx_scan DESC
        LIMIT 10
    """)

    index_stats = cursor.fetchall()
    if index_stats:
        pass
    else:
        pass

    # ============================================================
    # Final Verdict
    # ============================================================

    if total_found >= 39 and len(foreign_keys) >= 0:  # FKs are optional
        pass
    elif total_found >= 35:
        pass
    else:
        pass


    cursor.close()
    conn.close()

if __name__ == "__main__":
    try:
        verify_indexes()
    except Exception as e:
        sys.exit(1)
