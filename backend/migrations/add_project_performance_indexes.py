"""
PROJECT TABLE PERFORMANCE INDEXES
Adds missing indexes on the project table to fix slow API responses.

Affected endpoints (measured times before fix):
  /api/approved_boq         → 4.5s  (JSONB contains on user_id)
  /api/rejected_boq         → 3.0s  (JSONB contains on user_id)
  /api/all_send_boq         → 2.4s  (JSONB contains on user_id)
  /api/pending_boq          → 2.7s  (filter on estimator_id)
  /api/estimator_dashboard  → 3.6s  (filter on estimator_id)
  /api/change-requests      → 4-7s  (filter on site_supervisor_id, buyer_id, mep_supervisor_id)

Run: python backend/migrations/add_project_performance_indexes.py

Created: 2026-03-09
"""

import os
import sys
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

try:
    import psycopg2
except ImportError:
    sys.exit(1)


def get_db_connection():
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL not found in .env")
    return psycopg2.connect(database_url)


def index_exists(cursor, index_name):
    cursor.execute("SELECT 1 FROM pg_indexes WHERE indexname = %s", (index_name,))
    return cursor.fetchone() is not None


def create_indexes():
    conn = get_db_connection()
    cursor = conn.cursor()


    indexes = [
        # Regular B-tree indexes for equality/range filters
        {
            'name': 'idx_project_estimator_id',
            'sql': "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_estimator_id ON project(estimator_id) WHERE is_deleted = false",
            'description': 'estimator_id filter (pending_boq, estimator_dashboard)'
        },
        {
            'name': 'idx_project_is_deleted',
            'sql': "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_is_deleted ON project(is_deleted)",
            'description': 'is_deleted filter (all queries)'
        },
        {
            'name': 'idx_project_site_supervisor_id',
            'sql': "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_site_supervisor_id ON project(site_supervisor_id) WHERE is_deleted = false",
            'description': 'site_supervisor_id filter (change-requests)'
        },
        {
            'name': 'idx_project_buyer_id',
            'sql': "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_buyer_id ON project(buyer_id) WHERE is_deleted = false",
            'description': 'buyer_id filter (change-requests)'
        },
        # GIN indexes for JSONB array contains operations
        {
            'name': 'idx_project_user_id_gin',
            'sql': "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_user_id_gin ON project USING gin(user_id)",
            'description': 'user_id JSONB contains (approved_boq, rejected_boq, all_send_boq)'
        },
        {
            'name': 'idx_project_mep_supervisor_id_gin',
            'sql': "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_mep_supervisor_id_gin ON project USING gin(mep_supervisor_id)",
            'description': 'mep_supervisor_id JSONB contains (change-requests)'
        },
    ]

    created = []
    skipped = []
    failed = []

    for idx in indexes:
        if index_exists(cursor, idx['name']):
            skipped.append(idx['name'])
            continue

        try:
            # CONCURRENTLY requires autocommit
            conn.set_isolation_level(0)
            cursor.execute(idx['sql'])
            conn.set_isolation_level(1)
            created.append(idx['name'])
        except Exception as e:
            failed.append(idx['name'])
            conn.rollback()


    if failed:
        pass
    else:
        pass

    cursor.close()
    conn.close()


def rollback_indexes():
    """Remove indexes added by this migration (for rollback)"""
    conn = get_db_connection()
    cursor = conn.cursor()

    index_names = [
        'idx_project_estimator_id',
        'idx_project_is_deleted',
        'idx_project_site_supervisor_id',
        'idx_project_buyer_id',
        'idx_project_user_id_gin',
        'idx_project_mep_supervisor_id_gin',
    ]

    for name in index_names:
        try:
            cursor.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
            conn.commit()
        except Exception as e:
            conn.rollback()

    cursor.close()
    conn.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--rollback':
        rollback_indexes()
    else:
        create_indexes()
