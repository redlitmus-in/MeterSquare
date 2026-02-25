"""
Migration: Add lpo_pdf_url TEXT column to change_requests and po_child tables.
Stores the Supabase public URL of the pre-generated LPO PDF (created at TD approval time).
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
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS lpo_pdf_url TEXT DEFAULT NULL;
        """)
        cur.execute("""
            ALTER TABLE po_child
            ADD COLUMN IF NOT EXISTS lpo_pdf_url TEXT DEFAULT NULL;
        """)
        conn.commit()
        print("Migration successful: added lpo_pdf_url column to change_requests and po_child")
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
            ALTER TABLE change_requests
            DROP COLUMN IF EXISTS lpo_pdf_url;
        """)
        cur.execute("""
            ALTER TABLE po_child
            DROP COLUMN IF EXISTS lpo_pdf_url;
        """)
        conn.commit()
        print("Rollback successful: removed lpo_pdf_url columns")
    except Exception as e:
        conn.rollback()
        print(f"Rollback failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    create()
