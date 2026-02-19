"""
Migration: Add replacement_imr_id column to vendor_return_requests table
Purpose: Link replacement VRRs to the new IMR created for PM re-inspection
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
    """Add replacement_imr_id column to vendor_return_requests table"""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            ALTER TABLE vendor_return_requests
            ADD COLUMN IF NOT EXISTS replacement_imr_id INTEGER
            REFERENCES internal_inventory_material_requests(request_id);
        """)

        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_vrr_replacement_imr
            ON vendor_return_requests(replacement_imr_id)
            WHERE replacement_imr_id IS NOT NULL;
        """)

        conn.commit()
        print("Migration successful: added replacement_imr_id column to vendor_return_requests")
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def rollback():
    """Remove replacement_imr_id column"""
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute("DROP INDEX IF EXISTS idx_vrr_replacement_imr;")
        cur.execute("ALTER TABLE vendor_return_requests DROP COLUMN IF EXISTS replacement_imr_id;")
        conn.commit()
        print("Rollback successful: removed replacement_imr_id column")
    except Exception as e:
        conn.rollback()
        print(f"Rollback failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--rollback', action='store_true')
    args = parser.parse_args()

    if args.rollback:
        rollback()
    else:
        create()
