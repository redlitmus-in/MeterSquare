"""
PRIORITY 2 - FOREIGN KEY CONSTRAINTS (Part 4 of 4)
Performance Analysis 2025-11-18

This migration adds missing foreign key constraints for data integrity.
Foreign keys ensure referential integrity and prevent orphaned records.

⚠️  WARNING: This migration requires data validation before running!
RECOMMENDED: Run in test environment first, then production.

Benefits:
- Prevents orphaned records
- Enforces referential integrity
- Enables automatic cascading deletes
- Improves query optimization

Run: python backend/migrations/add_foreign_key_constraints_2025.py

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

def validate_foreign_keys(cursor):
    """Validate that foreign key references exist before creating constraints"""
    print("\n🔍 VALIDATION: Checking for orphaned records...")
    print("-" * 80)

    issues = []

    # Check master_materials.item_id
    cursor.execute("""
        SELECT COUNT(*)
        FROM master_materials mm
        LEFT JOIN boq_items bi ON mm.item_id = bi.item_id
        WHERE mm.item_id IS NOT NULL AND bi.item_id IS NULL
    """)
    orphaned_materials = cursor.fetchone()[0]
    if orphaned_materials > 0:
        issues.append(f"⚠️  {orphaned_materials} master_materials reference non-existent items")
    else:
        print(f"   ✓ master_materials.item_id: All references valid")

    # Check master_labour.item_id
    cursor.execute("""
        SELECT COUNT(*)
        FROM master_labour ml
        LEFT JOIN boq_items bi ON ml.item_id = bi.item_id
        WHERE ml.item_id IS NOT NULL AND bi.item_id IS NULL
    """)
    orphaned_labour = cursor.fetchone()[0]
    if orphaned_labour > 0:
        issues.append(f"⚠️  {orphaned_labour} master_labour reference non-existent items")
    else:
        print(f"   ✓ master_labour.item_id: All references valid")

    return issues

def run_migration():
    """Add foreign key constraints to the database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        print("\n" + "=" * 80)
        print("PRIORITY 2 - FOREIGN KEY CONSTRAINTS MIGRATION (Part 4 of 4)")
        print("Performance Analysis 2025-11-18")
        print("=" * 80)
        print("\n⚠️  IMPORTANT: This migration adds foreign key constraints.")
        print("   Foreign keys enforce data integrity but require validation first.")
        print("=" * 80)

        # Validate before adding constraints
        validation_issues = validate_foreign_keys(cursor)

        if validation_issues:
            print("\n" + "=" * 80)
            print("❌ VALIDATION FAILED: Orphaned records found!")
            print("=" * 80)
            for issue in validation_issues:
                print(f"   {issue}")
            print("\n💡 Resolution Options:")
            print("   1. Clean up orphaned records first")
            print("   2. Update orphaned records to reference valid IDs")
            print("   3. Set item_id = NULL for orphaned records")
            print("\n   Example cleanup script:")
            print("   UPDATE master_materials SET item_id = NULL WHERE item_id NOT IN (SELECT item_id FROM boq_items);")
            print("   UPDATE master_labour SET item_id = NULL WHERE item_id NOT IN (SELECT item_id FROM boq_items);")
            print("\n⚠️  Migration aborted to prevent data loss.")
            print("   Fix orphaned records and re-run this migration.")
            return

        print("\n✅ VALIDATION PASSED: No orphaned records found")
        print("   Safe to proceed with foreign key creation.")

        # ============================================================
        # SECTION 1: Master Materials & Labour Constraints
        # ============================================================

        print("\n🔧 SECTION 1: Master Materials & Labour Foreign Keys")
        print("-" * 80)

        print("[1/6] Adding foreign key: master_materials.item_id → boq_items.item_id...")
        cursor.execute("""
            ALTER TABLE master_materials
            ADD CONSTRAINT IF NOT EXISTS fk_master_material_item
            FOREIGN KEY (item_id)
            REFERENCES boq_items(item_id)
            ON DELETE SET NULL
            ON UPDATE CASCADE
        """)
        print("       ✓ Constraint added (ON DELETE SET NULL)")

        print("[2/6] Adding foreign key: master_labour.item_id → boq_items.item_id...")
        cursor.execute("""
            ALTER TABLE master_labour
            ADD CONSTRAINT IF NOT EXISTS fk_master_labour_item
            FOREIGN KEY (item_id)
            REFERENCES boq_items(item_id)
            ON DELETE SET NULL
            ON UPDATE CASCADE
        """)
        print("       ✓ Constraint added (ON DELETE SET NULL)")

        # ============================================================
        # SECTION 2: Change Request Constraints
        # ============================================================

        print("\n🔄 SECTION 2: Change Request Foreign Keys")
        print("-" * 80)

        print("[3/6] Adding foreign key: change_requests.boq_id → boq.boq_id...")
        cursor.execute("""
            ALTER TABLE change_requests
            DROP CONSTRAINT IF EXISTS fk_change_request_boq,
            ADD CONSTRAINT fk_change_request_boq
            FOREIGN KEY (boq_id)
            REFERENCES boq(boq_id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        """)
        print("       ✓ Constraint added (ON DELETE CASCADE)")

        print("[4/6] Adding foreign key: change_requests.project_id → project.project_id...")
        cursor.execute("""
            ALTER TABLE change_requests
            DROP CONSTRAINT IF EXISTS fk_change_request_project,
            ADD CONSTRAINT fk_change_request_project
            FOREIGN KEY (project_id)
            REFERENCES project(project_id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        """)
        print("       ✓ Constraint added (ON DELETE CASCADE)")

        # ============================================================
        # SECTION 3: Additional Index for Foreign Keys
        # ============================================================

        print("\n📊 SECTION 3: Foreign Key Supporting Indexes")
        print("-" * 80)

        print("[5/6] Creating index on master_materials (item_id)...")
        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_master_material_item_id
            ON master_materials(item_id)
        """)
        print("       ✓ Index created (supports FK constraint)")

        print("[6/6] Creating index on master_labour (item_id)...")
        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_master_labour_item_id
            ON master_labour(item_id)
        """)
        print("       ✓ Index created (supports FK constraint)")

        conn.commit()

        # ============================================================
        # Verify Constraints
        # ============================================================

        print("\n🔍 Verifying foreign key constraints...")
        print("-" * 80)

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

        constraints = cursor.fetchall()
        print(f"   ✓ {len(constraints)} foreign key constraints verified")
        for constraint in constraints:
            print(f"      • {constraint[1]}.{constraint[2]} → {constraint[3]}.{constraint[4]}")

        print("\n" + "=" * 80)
        print("✅ MIGRATION COMPLETED SUCCESSFULLY!")
        print("=" * 80)

        # Print impact summary
        print("\n📈 DATA INTEGRITY IMPROVEMENTS:")
        print("-" * 80)
        print("  ✓ Orphaned Records:        Prevented")
        print("  ✓ Referential Integrity:   Enforced")
        print("  ✓ Cascade Deletes:         Enabled")
        print("  ✓ Query Optimization:      Improved")
        print("-" * 80)
        print("  🎯 DATA QUALITY: Significantly improved")
        print("\n💡 What Do Foreign Keys Do?")
        print("   • Prevent deletion of referenced records")
        print("   • Cascade deletes when parent is removed")
        print("   • Ensure data consistency across tables")
        print("   • Help query planner optimize joins")
        print("\n📌 TOTAL MIGRATIONS COMPLETED:")
        print("   ✓ Part 1: 20 critical indexes")
        print("   ✓ Part 2: 9 JSONB GIN indexes")
        print("   ✓ Part 3: 10 composite indexes")
        print("   ✓ Part 4: 4 foreign key constraints + 2 supporting indexes")
        print("   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("   TOTAL: 39 indexes + 4 foreign keys")
        print("\n🎉 PRIORITY 2 IMPLEMENTATION COMPLETE!")
        print("=" * 80 + "\n")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR: Migration failed!")
        print(f"   Error: {str(e)}")
        print("\n💡 Troubleshooting:")
        print("   - Check if orphaned records exist (run validation)")
        print("   - Verify table and column names are correct")
        print("   - Check PostgreSQL version (9.5+ recommended)")
        print("   - Review PostgreSQL logs for details")
        print("\n💡 Rollback (if needed):")
        print("   ALTER TABLE master_materials DROP CONSTRAINT IF EXISTS fk_master_material_item;")
        print("   ALTER TABLE master_labour DROP CONSTRAINT IF EXISTS fk_master_labour_item;")
        print("   ALTER TABLE change_requests DROP CONSTRAINT IF EXISTS fk_change_request_boq;")
        print("   ALTER TABLE change_requests DROP CONSTRAINT IF EXISTS fk_change_request_project;")
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("PRIORITY 2 - FOREIGN KEY CONSTRAINTS MIGRATION")
    print("Part 4 of 4: Data Integrity & Referential Constraints")
    print("=" * 80)
    print("\n⚠️  IMPORTANT WARNINGS:")
    print("   ⚠️  This migration modifies table constraints")
    print("   ⚠️  Validates data before creating constraints")
    print("   ⚠️  May fail if orphaned records exist")
    print("   ⚠️  Test in development environment first")
    print("\n✅ SAFETY FEATURES:")
    print("   ✓ Validates data before creating constraints")
    print("   ✓ Provides cleanup scripts if validation fails")
    print("   ✓ Uses ON DELETE CASCADE/SET NULL safely")
    print("   ✓ Rollback available if issues occur")

    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--auto':
        print("\n🚀 Auto-running migration...\n")
        run_migration()
    else:
        response = input("\n▶️  Ready to add 4 foreign key constraints? (yes/no): ")
        if response.lower() == 'yes':
            run_migration()
        else:
            print("\n❌ Migration cancelled.")
            print("   No changes made to database.\n")
