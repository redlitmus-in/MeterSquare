"""
Notification Performance Indexes Migration
Adds indexes to the notifications table for faster queries

Run this migration: python backend/migrations/add_notification_indexes.py
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
load_dotenv()

def get_db_connection():
    """Get database connection from environment variables"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL not found in environment variables")
    return psycopg2.connect(database_url)

def run_migration():
    """Add performance indexes to the notifications table"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:

        # Check if notifications table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'notifications'
            )
        """)
        table_exists = cursor.fetchone()[0]

        if not table_exists:
            return

        # Get current row count for info
        cursor.execute("SELECT COUNT(*) FROM notifications")
        row_count = cursor.fetchone()[0]

        # SINGLE COLUMN INDEXES

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_notification_user_id
            ON notifications(user_id)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_notification_read
            ON notifications(read)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_notification_deleted_at
            ON notifications(deleted_at)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_notification_created_at
            ON notifications(created_at DESC)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_notification_target_role
            ON notifications(target_role)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_notification_category
            ON notifications(category)
        """)

        # COMPOSITE INDEXES (Most important for performance)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_notification_user_read
            ON notifications(user_id, read)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_notification_user_deleted
            ON notifications(user_id, deleted_at)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_notification_user_created
            ON notifications(user_id, created_at DESC)
        """)

        conn.commit()

        cursor.execute("ANALYZE notifications")




    except Exception as e:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    run_migration()
