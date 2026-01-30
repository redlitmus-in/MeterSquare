"""
Migration script to create login_history table
Tracks all user login sessions for audit purposes
"""

import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_login_history_table():
    """Create login_history table with all required fields"""

    # Get DATABASE_URL from environment (Supabase connection)
    database_url = os.getenv('DATABASE_URL')

    if not database_url:
        # Fallback to individual parameters
        conn_params = {
            'dbname': os.getenv('DB_NAME', 'metersquare_erp'),
            'user': os.getenv('DB_USER', 'postgres'),
            'password': os.getenv('DB_PASSWORD', 'postgres'),
            'host': os.getenv('DB_HOST', 'localhost'),
            'port': os.getenv('DB_PORT', '5432')
        }
        conn = psycopg2.connect(**conn_params)
    else:
        conn = psycopg2.connect(database_url)

    try:
        cursor = conn.cursor()

        print("Connected to database successfully")

        # Create login_history table
        create_table_query = """
        CREATE TABLE IF NOT EXISTS login_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Login details
            login_at TIMESTAMP NOT NULL DEFAULT NOW(),
            logout_at TIMESTAMP,

            -- Client information
            ip_address VARCHAR(45),
            user_agent VARCHAR(500),
            device_type VARCHAR(50),
            browser VARCHAR(100),
            os VARCHAR(100),

            -- Login method
            login_method VARCHAR(20) NOT NULL DEFAULT 'email_otp',

            -- Session status
            status VARCHAR(20) NOT NULL DEFAULT 'active',

            -- Metadata
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        -- Create indexes for faster queries
        CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
        CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON login_history(login_at DESC);
        CREATE INDEX IF NOT EXISTS idx_login_history_status ON login_history(status);
        CREATE INDEX IF NOT EXISTS idx_login_history_user_login ON login_history(user_id, login_at DESC);
        """

        cursor.execute(create_table_query)
        conn.commit()

        print("login_history table created successfully!")

        # Add comments to table and columns
        comments_query = """
        COMMENT ON TABLE login_history IS 'Tracks all user login sessions for audit purposes';
        COMMENT ON COLUMN login_history.user_id IS 'Reference to users table';
        COMMENT ON COLUMN login_history.login_at IS 'Timestamp when user logged in';
        COMMENT ON COLUMN login_history.logout_at IS 'Timestamp when user logged out';
        COMMENT ON COLUMN login_history.ip_address IS 'Client IP address (supports IPv6)';
        COMMENT ON COLUMN login_history.user_agent IS 'Full user agent string from browser';
        COMMENT ON COLUMN login_history.device_type IS 'Type of device: desktop, mobile, tablet';
        COMMENT ON COLUMN login_history.browser IS 'Browser name and version';
        COMMENT ON COLUMN login_history.os IS 'Operating system name and version';
        COMMENT ON COLUMN login_history.login_method IS 'Authentication method: email_otp, sms_otp';
        COMMENT ON COLUMN login_history.status IS 'Session status: active, logged_out, expired';
        """

        cursor.execute(comments_query)
        conn.commit()

        print("Table comments added successfully!")

        # Verify table creation
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'login_history'
            ORDER BY ordinal_position
        """)

        columns = cursor.fetchall()
        print("\nTable structure:")
        print("-" * 60)
        for col in columns:
            print(f"  {col[0]}: {col[1]} (nullable: {col[2]})")

        cursor.close()
        conn.close()
        print("\nMigration completed successfully!")

    except psycopg2.Error as e:
        print(f"Database error: {e}")
        raise
    except Exception as e:
        print(f"Error: {e}")
        raise


def drop_login_history_table():
    """Drop login_history table (for rollback)"""

    # Get DATABASE_URL from environment (Supabase connection)
    database_url = os.getenv('DATABASE_URL')

    try:
        if database_url:
            conn = psycopg2.connect(database_url)
        else:
            conn_params = {
                'dbname': os.getenv('DB_NAME', 'metersquare_erp'),
                'user': os.getenv('DB_USER', 'postgres'),
                'password': os.getenv('DB_PASSWORD', 'postgres'),
                'host': os.getenv('DB_HOST', 'localhost'),
                'port': os.getenv('DB_PORT', '5432')
            }
            conn = psycopg2.connect(**conn_params)
        cursor = conn.cursor()

        cursor.execute("DROP TABLE IF EXISTS login_history CASCADE")
        conn.commit()

        print("login_history table dropped successfully!")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == '--rollback':
        drop_login_history_table()
    else:
        create_login_history_table()
