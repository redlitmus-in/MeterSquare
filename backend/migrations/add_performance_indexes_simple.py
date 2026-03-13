"""
Performance Optimization Migration - Add Critical Database Indexes
Run this migration: python backend/migrations/add_performance_indexes_simple.py
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
load_dotenv()

def get_db_connection():
    """Get database connection from environment variables"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL not found in environment variables")
    return psycopg2.connect(database_url)

def run_migration():
    """Add performance indexes to the database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:

        # CRITICAL INDEXES

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_cr_boq_status
            ON change_requests(boq_id, status, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_details_boq_id
            ON boq_details(boq_id, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_project_buyer_se
            ON project(buyer_id, site_supervisor_id, is_deleted)
        """)

        # HIGH PRIORITY INDEXES

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_project_estimator
            ON project(estimator_id, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_project_site_supervisor
            ON project(site_supervisor_id, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_assignment_project_status
            ON boq_material_assignments(project_id, status, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_assignment_buyer
            ON boq_material_assignments(assigned_to_buyer_user_id, is_deleted)
        """)

        # MEDIUM PRIORITY INDEXES

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_cr_project_status
            ON change_requests(project_id, status, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_cr_buyer
            ON change_requests(assigned_to_buyer_user_id, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_role_active
            ON users(role_id, is_active, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_email
            ON users(email, is_deleted)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_project
            ON boq(project_id, is_deleted)
        """)

        # JSONB INDEXES

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_boq_details_items
            ON boq_details USING GIN (boq_details)
        """)

        conn.commit()

        cursor.execute("ANALYZE change_requests")
        cursor.execute("ANALYZE boq_details")
        cursor.execute("ANALYZE project")
        cursor.execute("ANALYZE boq_material_assignments")
        cursor.execute("ANALYZE users")
        cursor.execute("ANALYZE boq")



    except Exception as e:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_migration()
