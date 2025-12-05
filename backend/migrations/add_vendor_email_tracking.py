"""
Migration: Add vendor email tracking fields to change_requests table
Date: 2025-01-27
"""

import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "metersquare")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")

def run_migration():
    """Add vendor email tracking columns to change_requests table"""
    try:
        # Connect to database
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        cursor = conn.cursor()

        print("Adding vendor email tracking columns to change_requests table...")

        # Add vendor_email_sent column
        cursor.execute("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS vendor_email_sent BOOLEAN DEFAULT FALSE;
        """)

        # Add vendor_email_sent_date column
        cursor.execute("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS vendor_email_sent_date TIMESTAMP;
        """)

        # Add vendor_email_sent_by_user_id column
        cursor.execute("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS vendor_email_sent_by_user_id INTEGER;
        """)

        # Commit changes
        conn.commit()
        print("[SUCCESS] Successfully added vendor email tracking columns")

        cursor.close()
        conn.close()

        print("\nMigration completed successfully!")

    except Exception as e:
        print(f"[ERROR] Migration failed: {str(e)}")
        if conn:
            conn.rollback()
            conn.close()
        raise

if __name__ == "__main__":
    run_migration()
