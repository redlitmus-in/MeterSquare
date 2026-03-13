"""
Add 2 missing indexes identified by verification audit (March 2026)

1. idx_internal_revision_changes_jsonb - GIN index on boq_internal_revisions.changes_summary
2. idx_preliminary_selection - Composite index on boq_preliminaries for selection filtering

Run: python backend/migrations/add_missing_indexes_2026_03.py
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()


def create_indexes():
    """Create the 2 missing indexes identified by audit"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL not found in environment variables")

    conn = psycopg2.connect(database_url)
    conn.autocommit = True  # Required for CREATE INDEX CONCURRENTLY
    cursor = conn.cursor()

    indexes = [
        {
            'name': 'idx_internal_revision_changes_jsonb',
            'table': 'boq_internal_revisions',
            'column': 'changes_summary',
            'sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_internal_revision_changes_jsonb ON boq_internal_revisions USING gin (changes_summary)',
            'type': 'GIN (JSONB)'
        },
        {
            'name': 'idx_preliminary_selection',
            'table': 'boq_preliminaries',
            'column': 'boq_id, is_checked, prelim_id',
            'sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_preliminary_selection ON boq_preliminaries (boq_id, is_checked, prelim_id)',
            'type': 'BTREE (composite)'
        }
    ]

    print("\n" + "=" * 70)
    print("ADDING 2 MISSING INDEXES (March 2026 Audit)")
    print("=" * 70)

    for idx in indexes:
        # Check if table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = %s
            )
        """, (idx['table'],))
        table_exists = cursor.fetchone()[0]

        if not table_exists:
            print(f"\n  SKIP  {idx['name']} - table '{idx['table']}' does not exist")
            continue

        # Check if index already exists
        cursor.execute("SELECT 1 FROM pg_indexes WHERE indexname = %s", (idx['name'],))
        if cursor.fetchone():
            print(f"\n  EXISTS  {idx['name']} - already created")
            continue

        # Create the index
        try:
            print(f"\n  CREATING  {idx['name']}")
            print(f"    Table: {idx['table']}")
            print(f"    Column(s): {idx['column']}")
            print(f"    Type: {idx['type']}")
            cursor.execute(idx['sql'])
            print(f"    Result: CREATED")
        except Exception as e:
            print(f"    ERROR: {str(e)}")

    print("\n" + "=" * 70)
    print("DONE")
    print("=" * 70 + "\n")

    cursor.close()
    conn.close()


def rollback():
    """Remove the indexes if needed"""
    database_url = os.getenv('DATABASE_URL')
    conn = psycopg2.connect(database_url)
    cursor = conn.cursor()

    cursor.execute("DROP INDEX IF EXISTS idx_internal_revision_changes_jsonb")
    cursor.execute("DROP INDEX IF EXISTS idx_preliminary_selection")
    conn.commit()

    print("Rolled back 2 indexes")
    cursor.close()
    conn.close()


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--rollback':
        rollback()
    else:
        create_indexes()
