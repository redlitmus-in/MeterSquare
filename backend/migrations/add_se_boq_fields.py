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

        print("Adding fields to boq_material_assignments table...")

        # Add assignment_date column
        try:
            cur.execute("""
                ALTER TABLE boq_material_assignments
                ADD COLUMN IF NOT EXISTS assignment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            """)
            print("+ Added assignment_date column")
        except Exception as e:
            print(f"  Note: assignment_date column might already exist: {e}")

        # Add material_ids column (JSON type for PostgreSQL)
        try:
            cur.execute("""
                ALTER TABLE boq_material_assignments
                ADD COLUMN IF NOT EXISTS material_ids JSONB;
            """)
            print("✓ Added material_ids column")
        except Exception as e:
            print(f"  Note: material_ids column might already exist: {e}")

        # Add base_total_for_overhead column
        try:
            cur.execute("""
                ALTER TABLE boq_material_assignments
                ADD COLUMN IF NOT EXISTS base_total_for_overhead NUMERIC(15, 2) DEFAULT 0.0;
            """)
            print("✓ Added base_total_for_overhead column")
        except Exception as e:
            print(f"  Note: base_total_for_overhead column might already exist: {e}")

        # Add overhead_percentage column
        try:
            cur.execute("""
                ALTER TABLE boq_material_assignments
                ADD COLUMN IF NOT EXISTS overhead_percentage NUMERIC(5, 2) DEFAULT 0.0;
            """)
            print("✓ Added overhead_percentage column")
        except Exception as e:
            print(f"  Note: overhead_percentage column might already exist: {e}")

        # Commit the transaction
        conn.commit()
        print("\n✅ Migration completed successfully!")

        # Show the updated table structure
        cur.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'boq_material_assignments'
            ORDER BY ordinal_position;
        """)

        print("\nUpdated table structure:")
        print("-" * 80)
        for row in cur.fetchall():
            print(f"  {row[0]:30} | {row[1]:15} | Nullable: {row[2]:3} | Default: {row[3]}")
        print("-" * 80)

        cur.close()

    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        if conn:
            conn.rollback()
    except Exception as e:
        print(f"❌ Error: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()
            print("\nDatabase connection closed.")

if __name__ == "__main__":
    print("=" * 80)
    print(" SE BOQ Material Assignment Fields Migration")
    print("=" * 80)
    run_migration()
