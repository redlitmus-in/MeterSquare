"""
Migration: Add delivery_note_url column to inventory_transactions table
Date: 2025-12-23
Description: Adds delivery_note_url column for storing file URLs of delivery notes/invoices
"""

import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_migration():
    """Add delivery_note_url column to inventory_transactions table"""

    conn = None
    try:
        # Connect using DATABASE_URL environment variable
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        print("Connected to database successfully")

        # Check if delivery_note_url column exists
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'inventory_transactions'
            AND column_name = 'delivery_note_url'
        """)

        if cursor.fetchone():
            print("✓ Column 'delivery_note_url' already exists in inventory_transactions table")
        else:
            # Add delivery_note_url column
            print("Adding delivery_note_url column to inventory_transactions table...")
            cursor.execute("""
                ALTER TABLE inventory_transactions
                ADD COLUMN delivery_note_url TEXT NULL
            """)
            print("✓ Successfully added delivery_note_url column")

        print("\n✅ Migration completed successfully!")

    except Exception as e:
        print(f"\n❌ Error during migration: {e}")
        raise

    finally:
        if conn:
            cursor.close()
            conn.close()
            print("Database connection closed")

if __name__ == '__main__':
    print("=" * 70)
    print("Migration: Add delivery_note_url to inventory_transactions")
    print("=" * 70)
    run_migration()
    print("=" * 70)
