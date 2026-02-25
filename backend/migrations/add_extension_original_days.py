"""
Migration: Add extension_original_days column to project table
Purpose: Track PM's original requested days separately from TD's edited days
"""

import os
import sys
import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

def get_connection():
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

    environment = os.environ.get('ENVIRONMENT', 'development')
    if environment == 'production':
        database_url = os.environ.get('DATABASE_URL')
    else:
        database_url = os.environ.get('DEV_DATABASE_URL')

    if not database_url:
        raise Exception(f"Database URL not found for environment: {environment}")
    return psycopg2.connect(database_url)


def create():
    """Add extension_original_days column to project table"""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            ALTER TABLE project
            ADD COLUMN IF NOT EXISTS extension_original_days INTEGER;
        """)

        # Backfill: for any project with extension_status = 'day_edit_td',
        # the current extension_days is the edited value.
        # We can't recover the original, but for future requests this will be tracked.
        # For existing rows where status is 'day_request_send_td', original = extension_days
        cur.execute("""
            UPDATE project
            SET extension_original_days = extension_days
            WHERE extension_days IS NOT NULL
              AND extension_original_days IS NULL;
        """)

        conn.commit()
        print("Migration successful: added extension_original_days column to project table")
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def rollback():
    """Remove extension_original_days column from project table"""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            ALTER TABLE project
            DROP COLUMN IF EXISTS extension_original_days;
        """)
        conn.commit()
        print("Rollback successful: removed extension_original_days column")
    except Exception as e:
        conn.rollback()
        print(f"Rollback failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'create'
    if action == 'rollback':
        rollback()
    else:
        create()
