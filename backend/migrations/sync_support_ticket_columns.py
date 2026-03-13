"""
Comprehensive migration script to sync support_tickets table columns across all databases
Checks both DEV and PROD databases and adds any missing columns

Usage:
  # For DEV database:
  DATABASE_URL='your_dev_url' python migrations/sync_support_ticket_columns.py

  # For PROD database:
  DATABASE_URL_PROD='your_prod_url' python migrations/sync_support_ticket_columns.py --prod
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# All columns that should exist in support_tickets table
REQUIRED_COLUMNS = {
    'closed_by': 'VARCHAR(50)',
    'closed_by_name': 'VARCHAR(255)',
    'closed_date': 'TIMESTAMP',
    'comments': 'JSONB DEFAULT \'[]\'::jsonb',
    'response_history': 'JSONB DEFAULT \'[]\'::jsonb',
    'current_concern': 'TEXT',
    'proposed_changes': 'TEXT',
    'reporter_user_id': 'INTEGER',  # Links to users table for notifications
}

# Required indexes for performance
REQUIRED_INDEXES = {
    'idx_support_reporter_user_id': 'CREATE INDEX IF NOT EXISTS idx_support_reporter_user_id ON support_tickets(reporter_user_id)',
    'idx_support_status_type': 'CREATE INDEX IF NOT EXISTS idx_support_status_type ON support_tickets(status, ticket_type)',
    'idx_support_reporter_status': 'CREATE INDEX IF NOT EXISTS idx_support_reporter_status ON support_tickets(reporter_user_id, status)',
    'idx_support_deleted_status': 'CREATE INDEX IF NOT EXISTS idx_support_deleted_status ON support_tickets(is_deleted, status)',
}

def get_existing_columns(cursor):
    """Get list of existing columns in support_tickets table"""
    cursor.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'support_tickets'
        ORDER BY column_name
    """)
    return {row[0]: row[1] for row in cursor.fetchall()}

def add_missing_columns(cursor, existing_columns, db_name):
    """Add any missing columns to the table"""
    columns_added = []

    for column_name, column_type in REQUIRED_COLUMNS.items():
        if column_name not in existing_columns:
            try:
                alter_query = f"ALTER TABLE support_tickets ADD COLUMN {column_name} {column_type}"
                cursor.execute(alter_query)
                columns_added.append(column_name)
            except Exception as e:
                pass
        else:
            pass

    return columns_added


def add_missing_indexes(cursor, db_name):
    """Add any missing indexes to the table"""
    indexes_added = []

    for index_name, create_sql in REQUIRED_INDEXES.items():
        try:
            cursor.execute(create_sql)
            indexes_added.append(index_name)
        except Exception as e:
            pass

    return indexes_added


def backfill_reporter_user_ids(cursor, db_name):
    """Backfill reporter_user_id for tickets where it's NULL by looking up user by email"""

    # Find tickets with NULL reporter_user_id
    cursor.execute("""
        SELECT ticket_id, reporter_email
        FROM support_tickets
        WHERE reporter_user_id IS NULL
        AND reporter_email IS NOT NULL
    """)
    tickets_to_update = cursor.fetchall()

    if not tickets_to_update:
        return 0


    updated_count = 0
    for ticket_id, reporter_email in tickets_to_update:
        # Look up user by email
        cursor.execute("""
            SELECT user_id FROM users
            WHERE email = %s
            AND is_active = TRUE
            AND is_deleted = FALSE
            LIMIT 1
        """, (reporter_email,))
        result = cursor.fetchone()

        if result:
            user_id = result[0]
            cursor.execute("""
                UPDATE support_tickets
                SET reporter_user_id = %s
                WHERE ticket_id = %s
            """, (user_id, ticket_id))
            updated_count += 1
        else:
            pass

    return updated_count

def check_and_sync_database(db_name, database_url):
    """Check and sync a single database"""

    try:
        # Connect to database
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()


        # Check if support_tickets table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'support_tickets'
            )
        """)
        table_exists = cursor.fetchone()[0]

        if not table_exists:
            cursor.close()
            conn.close()
            return False


        # Get existing columns
        existing_columns = get_existing_columns(cursor)

        # Add missing columns
        columns_added = add_missing_columns(cursor, existing_columns, db_name)

        if columns_added:
            pass
        else:
            pass

        # Add missing indexes
        indexes_added = add_missing_indexes(cursor, db_name)

        if indexes_added:
            pass

        # Backfill reporter_user_id for existing tickets
        backfill_count = backfill_reporter_user_ids(cursor, db_name)
        if backfill_count > 0:
            pass

        # Verify final state
        final_columns = get_existing_columns(cursor)
        for col_name in REQUIRED_COLUMNS.keys():
            if col_name in final_columns:
                pass
            else:
                pass

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        return False

def main():

    # Check for --prod flag
    is_prod = '--prod' in sys.argv

    if is_prod:
        database_url = os.getenv('DATABASE_URL_PROD')
        db_name = 'PROD'
    else:
        database_url = os.getenv('DATABASE_URL')
        db_name = 'DEV'

    if not database_url:
        env_var = 'DATABASE_URL_PROD' if is_prod else 'DATABASE_URL'
        sys.exit(1)


    success = check_and_sync_database(db_name, database_url)

    # Summary
    status = "[SUCCESS]" if success else "[FAILED]"

    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
