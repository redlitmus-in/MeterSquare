"""
Comprehensive migration script to sync support_tickets table columns across all databases
Checks both DEV and PROD databases and adds any missing columns
"""

import psycopg2
from psycopg2 import sql

# Database configurations
DATABASES = {
    'DEV': {
        'url': 'postgresql://postgres.cbzdvghmrpsolryzdpxi:Meterkol$2025@aws-1-ap-south-1.pooler.supabase.com:6543/postgres',
        'host': 'aws-1-ap-south-1.pooler.supabase.com',
        'port': 6543,
        'database': 'postgres',
        'user': 'postgres.cbzdvghmrpsolryzdpxi',
        'password': 'Meterkol$2025'
    },
    'PROD': {
        'url': 'postgresql://postgres.wgddnoiakkoskbbkbygw:Rameshdev$08@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
        'host': 'aws-0-ap-south-1.pooler.supabase.com',
        'port': 6543,
        'database': 'postgres',
        'user': 'postgres.wgddnoiakkoskbbkbygw',
        'password': 'Rameshdev$08'
    }
}

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

def check_and_sync_database(db_name, db_config):
    """Check and sync a single database"""
    print(f"\n{'='*60}")
    print(f"Checking {db_name} Database")
    print(f"{'='*60}")

    try:
        # Connect to database
        conn = psycopg2.connect(
            host=db_config['host'],
            port=db_config['port'],
            database=db_config['database'],
            user=db_config['user'],
            password=db_config['password']
        )
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
    print("\nThis script will check both DEV and PROD databases")
    print("and add any missing columns to the support_tickets table.")

    results = {}

    for db_name, db_config in DATABASES.items():
        results[db_name] = check_and_sync_database(db_name, db_config)

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    for db_name, success in results.items():
        status = "[SUCCESS]" if success else "[FAILED]"
        print(f"{db_name}: {status}")

    print("\nMigration completed!")

if __name__ == '__main__':
    main()
