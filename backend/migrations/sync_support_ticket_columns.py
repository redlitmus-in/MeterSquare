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
                print(f"  [OK] Added column: {column_name} ({column_type})")
            except Exception as e:
                print(f"  [ERROR] Error adding {column_name}: {str(e)}")
        else:
            print(f"  [-] Column {column_name} already exists")

    return columns_added

def check_and_sync_database(db_name, database_url):
    """Check and sync a single database"""
    print(f"\n{'='*60}")
    print(f"Checking {db_name} Database")
    print(f"{'='*60}")

    try:
        # Connect to database
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        print(f"[OK] Connected to {db_name}")

        # Check if support_tickets table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'support_tickets'
            )
        """)
        table_exists = cursor.fetchone()[0]

        if not table_exists:
            print(f"[ERROR] Table support_tickets does not exist in {db_name}")
            cursor.close()
            conn.close()
            return False

        print(f"[OK] Table support_tickets exists")

        # Get existing columns
        existing_columns = get_existing_columns(cursor)
        print(f"\nExisting columns in {db_name}: {len(existing_columns)}")

        # Add missing columns
        print(f"\nChecking required columns:")
        columns_added = add_missing_columns(cursor, existing_columns, db_name)

        if columns_added:
            print(f"\n[OK] Added {len(columns_added)} column(s) to {db_name}: {', '.join(columns_added)}")
        else:
            print(f"\n[OK] All required columns already exist in {db_name}")

        # Verify final state
        print(f"\nVerification - Final column state:")
        final_columns = get_existing_columns(cursor)
        for col_name in REQUIRED_COLUMNS.keys():
            if col_name in final_columns:
                print(f"  [OK] {col_name}: {final_columns[col_name]}")
            else:
                print(f"  [MISSING] {col_name}: MISSING")

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        print(f"[ERROR] Error connecting to {db_name}: {str(e)}")
        return False

def main():
    print("="*60)
    print("Support Tickets Table Column Sync")
    print("="*60)

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
        print(f"\nERROR: {env_var} environment variable not set")
        print(f"\nUsage:")
        print(f"  {env_var}='postgresql://...' python migrations/sync_support_ticket_columns.py {'--prod' if is_prod else ''}")
        sys.exit(1)

    print(f"\nRunning migration on {db_name} database")

    success = check_and_sync_database(db_name, database_url)

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    status = "[SUCCESS]" if success else "[FAILED]"
    print(f"{db_name}: {status}")

    print("\nMigration completed!")
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
