"""
Migration: Add last_deadline_notified_at to project table

This column prevents duplicate daily deadline notifications.
It stores the date the last deadline warning was sent.
When a project gets a deadline extension (approved), reset this to NULL.
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


def upgrade():
    """Add last_deadline_notified_at column to project table."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            ALTER TABLE project
            ADD COLUMN IF NOT EXISTS last_deadline_notified_at DATE NULL;
        """)
        conn.commit()
        print("Added last_deadline_notified_at column to project table")
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def downgrade():
    """Remove last_deadline_notified_at column from project table."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            ALTER TABLE project
            DROP COLUMN IF EXISTS last_deadline_notified_at;
        """)
        conn.commit()
        print("Removed last_deadline_notified_at column from project table")
    except Exception as e:
        conn.rollback()
        print(f"Rollback failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    if '--down' in sys.argv:
        downgrade()
    else:
        upgrade()
