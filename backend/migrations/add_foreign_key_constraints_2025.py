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
        pass

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
        pass

    return issues

def run_migration():
    """Add foreign key constraints to the database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:

        # Validate before adding constraints
        validation_issues = validate_foreign_keys(cursor)

        if validation_issues:
            for issue in validation_issues:
                pass
            return


        # ============================================================
        # SECTION 1: Master Materials & Labour Constraints
        # ============================================================


        cursor.execute("""
            ALTER TABLE master_materials
            ADD CONSTRAINT IF NOT EXISTS fk_master_material_item
            FOREIGN KEY (item_id)
            REFERENCES boq_items(item_id)
            ON DELETE SET NULL
            ON UPDATE CASCADE
        """)

        cursor.execute("""
            ALTER TABLE master_labour
            ADD CONSTRAINT IF NOT EXISTS fk_master_labour_item
            FOREIGN KEY (item_id)
            REFERENCES boq_items(item_id)
            ON DELETE SET NULL
            ON UPDATE CASCADE
        """)

        # ============================================================
        # SECTION 2: Change Request Constraints
        # ============================================================


        cursor.execute("""
            ALTER TABLE change_requests
            DROP CONSTRAINT IF EXISTS fk_change_request_boq,
            ADD CONSTRAINT fk_change_request_boq
            FOREIGN KEY (boq_id)
            REFERENCES boq(boq_id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        """)

        cursor.execute("""
            ALTER TABLE change_requests
            DROP CONSTRAINT IF EXISTS fk_change_request_project,
            ADD CONSTRAINT fk_change_request_project
            FOREIGN KEY (project_id)
            REFERENCES project(project_id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        """)

        # ============================================================
        # SECTION 3: Additional Index for Foreign Keys
        # ============================================================


        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_master_material_item_id
            ON master_materials(item_id)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_master_labour_item_id
            ON master_labour(item_id)
        """)

        conn.commit()

        # ============================================================
        # Verify Constraints
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

        constraints = cursor.fetchall()
        for constraint in constraints:
            pass

    except Exception as e:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":

    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--auto':
        run_migration()
    else:
        response = input("\n▶️  Ready to add 4 foreign key constraints? (yes/no): ")
        if response.lower() == 'yes':
            run_migration()
        else:
            pass
