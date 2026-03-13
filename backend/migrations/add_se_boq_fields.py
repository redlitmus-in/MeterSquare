"""
Migration to add missing fields to boq_material_assignments table
"""

import psycopg2
from psycopg2 import sql
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database configuration
DB_CONFIG = {
    'dbname': os.getenv('DB_NAME', 'metersquare'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', 'postgres'),
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432')
}

def run_migration():
    """Add missing fields to boq_material_assignments table"""
    conn = None
    try:
        # Connect to database
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()


        # Add assignment_date column
        try:
            cur.execute("""
                ALTER TABLE boq_material_assignments
                ADD COLUMN IF NOT EXISTS assignment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            """)
        except Exception as e:
            pass

        # Add material_ids column (JSON type for PostgreSQL)
        try:
            cur.execute("""
                ALTER TABLE boq_material_assignments
                ADD COLUMN IF NOT EXISTS material_ids JSONB;
            """)
        except Exception as e:
            pass

        # Add base_total_for_overhead column
        try:
            cur.execute("""
                ALTER TABLE boq_material_assignments
                ADD COLUMN IF NOT EXISTS base_total_for_overhead NUMERIC(15, 2) DEFAULT 0.0;
            """)
        except Exception as e:
            pass

        # Add overhead_percentage column
        try:
            cur.execute("""
                ALTER TABLE boq_material_assignments
                ADD COLUMN IF NOT EXISTS overhead_percentage NUMERIC(5, 2) DEFAULT 0.0;
            """)
        except Exception as e:
            pass

        # Commit the transaction
        conn.commit()

        # Show the updated table structure
        cur.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'boq_material_assignments'
            ORDER BY ordinal_position;
        """)

        for row in cur.fetchall():
            pass

        cur.close()

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
    except Exception as e:
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()
