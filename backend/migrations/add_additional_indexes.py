"""
Additional Performance Indexes - From Comprehensive Audit
Run: python backend/migrations/add_additional_indexes.py

Adds 12 critical missing indexes found in comprehensive codebase analysis
These indexes target the most frequently queried columns
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

def get_db_connection():
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL not found")
    return psycopg2.connect(database_url)

def run_migration():
    conn = get_db_connection()
    conn.set_isolation_level(0)  # Set autocommit mode for CONCURRENTLY
    cursor = conn.cursor()

    try:

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_role_deleted
            ON users(role_id, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_active_deleted
            ON users(is_deleted, is_active)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_email_deleted
            ON users(email, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_status_deleted
            ON project(status, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_user_id_gin
            ON project USING GIN (user_id)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_mep_gin
            ON project USING GIN (mep_supervisor_id)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boq_history_boq_date
            ON boq_history(boq_id, action_date DESC)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_boq_email_status
            ON boq(email_sent, status, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_role_name
            ON role(role) WHERE is_deleted = false
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_material_tracking_boq
            ON material_purchase_tracking(boq_id, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_labour_tracking_boq
            ON labour_tracking(boq_id, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_internal_revision_boq
            ON boq_internal_revision(boq_id, is_deleted)
        """)

        conn.commit()

        cursor.execute("ANALYZE users")
        cursor.execute("ANALYZE project")
        cursor.execute("ANALYZE boq")
        cursor.execute("ANALYZE boq_history")
        cursor.execute("ANALYZE role")


    except Exception as e:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_migration()
