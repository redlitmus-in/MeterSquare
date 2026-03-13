"""
Migration script to create notifications table
Run this file to create the notifications table in the database
"""

import psycopg2
from psycopg2 import sql
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_notifications_table():
    """Create notifications table with all required fields"""

    # Database connection parameters
    conn_params = {
        'dbname': os.getenv('DB_NAME', 'metersquare_erp'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', 'postgres'),
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': os.getenv('DB_PORT', '5432')
    }

    try:
        # Connect to database
        conn = psycopg2.connect(**conn_params)
        cursor = conn.cursor()


        # Create notifications table
        create_table_query = """
        CREATE TABLE IF NOT EXISTS notifications (
            id VARCHAR(100) PRIMARY KEY,
            user_id INTEGER NOT NULL,
            target_role VARCHAR(50),
            type VARCHAR(50) NOT NULL,
            title VARCHAR(200) NOT NULL,
            message TEXT NOT NULL,
            priority VARCHAR(20) DEFAULT 'medium',
            category VARCHAR(50) DEFAULT 'system',
            read BOOLEAN DEFAULT FALSE,
            action_required BOOLEAN DEFAULT FALSE,
            action_url TEXT,
            action_label VARCHAR(50),
            metadata JSONB,
            sender_id INTEGER,
            sender_name VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            read_at TIMESTAMP,
            deleted_at TIMESTAMP,
            CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        );
        """

        cursor.execute(create_table_query)

        # Create indexes for better performance
        indexes = [
            """
            CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
            ON notifications(user_id, read)
            WHERE deleted_at IS NULL;
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_notifications_role_unread
            ON notifications(target_role, read)
            WHERE deleted_at IS NULL;
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_notifications_created
            ON notifications(created_at DESC);
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_notifications_user_created
            ON notifications(user_id, created_at DESC);
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_notifications_priority
            ON notifications(priority)
            WHERE read = FALSE AND deleted_at IS NULL;
            """
        ]

        for index_query in indexes:
            cursor.execute(index_query)


        # Commit changes
        conn.commit()

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
    except Exception as e:
        pass
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    create_notifications_table()
