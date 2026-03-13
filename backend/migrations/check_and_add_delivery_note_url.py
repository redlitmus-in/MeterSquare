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

        # Connect using appropriate DATABASE_URL
        if environment == "production":
            database_url = os.getenv('DATABASE_URL')
        else:
            database_url = os.getenv('DEV_DATABASE_URL')

        if not database_url:
            raise Exception(f"Database URL not found for environment: {environment}")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()


        # Check if delivery_note_url column exists
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'inventory_transactions'
            AND column_name = 'delivery_note_url'
        """)

        result = cursor.fetchone()

        if result:
            pass
        else:
            # Add delivery_note_url column
            cursor.execute("""
                ALTER TABLE inventory_transactions
                ADD COLUMN delivery_note_url TEXT NULL
            """)

        # Verify the column was added
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'inventory_transactions'
            AND column_name = 'delivery_note_url'
        """)

        verification = cursor.fetchone()
        if verification:
            pass
        else:
            pass


    except Exception as e:
        raise

    finally:
        if conn:
            cursor.close()
            conn.close()

if __name__ == '__main__':
    run_migration()
