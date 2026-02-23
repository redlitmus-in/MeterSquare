"""
Migration: Create email_cc_defaults and buyer_cc_recipients tables
for dynamic CC email management in vendor purchase order emails.

Run: python migrations/create_email_cc_tables.py
"""
import os
import sys
import psycopg2

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))


def get_db_url():
    env = os.environ.get('ENVIRONMENT', 'production')
    if env == 'development':
        return os.environ.get('DEV_DATABASE_URL') or os.environ.get('DATABASE_URL')
    return os.environ.get('DATABASE_URL')


def run_migration():
    db_url = get_db_url()
    if not db_url:
        print("ERROR: No DATABASE_URL found")
        return

    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()

    try:
        # 1. Admin-managed default CC recipients
        print("Creating email_cc_defaults table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS email_cc_defaults (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                name VARCHAR(255),
                is_active BOOLEAN DEFAULT TRUE NOT NULL,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)

        # 2. Per-buyer custom CC recipients
        print("Creating buyer_cc_recipients table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS buyer_cc_recipients (
                id SERIAL PRIMARY KEY,
                buyer_user_id INTEGER NOT NULL,
                email VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                is_active BOOLEAN DEFAULT TRUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(buyer_user_id, email)
            );
        """)

        # 3. Indexes
        print("Creating indexes...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_buyer_cc_buyer_id
            ON buyer_cc_recipients(buyer_user_id);
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_buyer_cc_active
            ON buyer_cc_recipients(buyer_user_id, is_active);
        """)

        # 4. Seed default CC emails (the 7 existing hardcoded ones)
        print("Seeding default CC emails...")
        cursor.execute("""
            INSERT INTO email_cc_defaults (email, name, is_active) VALUES
                ('sajisamuel@metersquare.com', 'Saji Samuel', TRUE),
                ('info@metersquare.com', 'Fasil', TRUE),
                ('admin@metersquare.com', 'Admin', TRUE),
                ('amjath@metersquare.com', 'Amjath', TRUE),
                ('sujith@metersquare.com', 'Sujith', TRUE),
                ('accounts@metersquare.com', 'Accounts', TRUE),
                ('mail@metersquare.com', 'Mail', TRUE)
            ON CONFLICT (email) DO NOTHING;
        """)

        conn.commit()
        print("Migration completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"ERROR: {str(e)}")
        raise
    finally:
        cursor.close()
        conn.close()


def rollback():
    db_url = get_db_url()
    if not db_url:
        print("ERROR: No DATABASE_URL found")
        return

    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()

    try:
        cursor.execute("DROP TABLE IF EXISTS buyer_cc_recipients CASCADE;")
        cursor.execute("DROP TABLE IF EXISTS email_cc_defaults CASCADE;")
        conn.commit()
        print("Rollback completed successfully!")
    except Exception as e:
        conn.rollback()
        print(f"ERROR: {str(e)}")
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == 'rollback':
        rollback()
    else:
        run_migration()
