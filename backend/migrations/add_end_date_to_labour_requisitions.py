"""
Migration: Add end_date column to labour_requisitions table
Date: 2026-04-04
Purpose: Store calculated end date for night shift support.
         Night shifts (end_time < start_time) have end_date = required_date + 1 day.
"""
import os
import sys
import psycopg2
from datetime import timedelta

# Load .env from backend root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is not set")
    return psycopg2.connect(database_url)


def create():
    """Add end_date column and backfill existing rows"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Add end_date column if not exists
        cursor.execute("""
            ALTER TABLE labour_requisitions
            ADD COLUMN IF NOT EXISTS end_date DATE;
        """)

        # Create index for filtering by end_date
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_labour_requisitions_end_date
            ON labour_requisitions(end_date);
        """)

        # Backfill end_date for existing rows:
        # Night shift (end_time < start_time) = required_date + 1 day
        # Day shift or no times = required_date
        cursor.execute("""
            UPDATE labour_requisitions
            SET end_date = CASE
                WHEN start_time IS NOT NULL AND end_time IS NOT NULL
                     AND end_time <= start_time
                THEN required_date + INTERVAL '1 day'
                ELSE required_date
            END
            WHERE end_date IS NULL AND required_date IS NOT NULL;
        """)

        conn.commit()
        updated = cursor.rowcount
        print(f"Migration successful: end_date column added and {updated} rows backfilled")

    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        cursor.close()
        conn.close()


def rollback():
    """Remove end_date column"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DROP INDEX IF EXISTS idx_labour_requisitions_end_date;")
        cursor.execute("ALTER TABLE labour_requisitions DROP COLUMN IF EXISTS end_date;")
        conn.commit()
        print("Rollback successful: end_date column removed")
    except Exception as e:
        conn.rollback()
        print(f"Rollback failed: {e}")
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback()
    else:
        create()
