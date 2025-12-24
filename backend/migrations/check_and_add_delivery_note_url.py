"""
Migration: Check and add delivery_note_url column to inventory_transactions table
Date: 2025-12-23
Description: Verifies and adds delivery_note_url column if it doesn't exist
"""

import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_migration():
    """Check and add delivery_note_url column to inventory_transactions table"""

    conn = None
    try:
        # Get environment
        environment = os.getenv('ENVIRONMENT', 'development')
        print(f"Environment: {environment}")

        # Connect using appropriate DATABASE_URL
        if environment == "production":
            database_url = os.getenv('DATABASE_URL')
        else:
            database_url = os.getenv('DEV_DATABASE_URL')

        if not database_url:
            raise Exception(f"Database URL not found for environment: {environment}")

        print(f"Connecting to database...")
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        print("Connected to database successfully")

        # Check if delivery_note_url column exists
        print("\nChecking if delivery_note_url column exists...")
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'inventory_transactions'
            AND column_name = 'delivery_note_url'
        """)

        result = cursor.fetchone()

        if result:
            print(f"✓ Column 'delivery_note_url' already exists")
            print(f"  - Data Type: {result[1]}")
            print(f"  - Nullable: {result[2]}")
        else:
            # Add delivery_note_url column
            print("❌ Column 'delivery_note_url' does NOT exist")
            print("Adding delivery_note_url column to inventory_transactions table...")
            cursor.execute("""
                ALTER TABLE inventory_transactions
                ADD COLUMN delivery_note_url TEXT NULL
            """)
            print("✓ Successfully added delivery_note_url column")

        # Verify the column was added
        print("\nVerifying column was added...")
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'inventory_transactions'
            AND column_name = 'delivery_note_url'
        """)

        verification = cursor.fetchone()
        if verification:
            print(f"✓ Verification successful!")
            print(f"  - Column: {verification[0]}")
            print(f"  - Data Type: {verification[1]}")
            print(f"  - Nullable: {verification[2]}")
        else:
            print("❌ Verification FAILED - column not found after ALTER TABLE")

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
    print("Migration: Check and Add delivery_note_url to inventory_transactions")
    print("=" * 70)
    run_migration()
    print("=" * 70)
