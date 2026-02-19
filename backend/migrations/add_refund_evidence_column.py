"""
Migration: Add refund_evidence JSONB column to vendor_return_requests table.
Stores uploaded proof documents (credit notes, receipts) for refund confirmation.
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
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            ALTER TABLE vendor_return_requests
            ADD COLUMN IF NOT EXISTS refund_evidence JSONB DEFAULT NULL;
        """)
        conn.commit()
        print("Migration successful: added refund_evidence column to vendor_return_requests")
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def rollback():
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            ALTER TABLE vendor_return_requests
            DROP COLUMN IF EXISTS refund_evidence;
        """)
        conn.commit()
        print("Rollback successful: removed refund_evidence column")
    except Exception as e:
        conn.rollback()
        print(f"Rollback failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    create()
