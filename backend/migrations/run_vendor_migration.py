"""
Run the vendor selection migration for change_requests table
"""
import os
import sys
from pathlib import Path

# Add parent directory to path to import backend modules
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
import psycopg2

# Load environment variables
load_dotenv()

def run_migration():
    """Execute the vendor selection migration SQL"""
    database_url = os.getenv('DATABASE_URL')

    if not database_url:
        return False

    try:
        # Read the SQL migration file
        migration_file = Path(__file__).parent / 'add_vendor_to_change_requests.sql'
        with open(migration_file, 'r') as f:
            migration_sql = f.read()

        conn = psycopg2.connect(database_url)
        conn.autocommit = True  # Run in autocommit mode for ALTER TABLE
        cursor = conn.cursor()

        cursor.execute(migration_sql)


        # Verify the columns were added
        cursor.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'change_requests'
            AND column_name IN (
                'selected_vendor_id',
                'selected_vendor_name',
                'vendor_selected_by_buyer_id',
                'vendor_selected_by_buyer_name',
                'vendor_selection_date',
                'vendor_selection_status',
                'vendor_approved_by_td_id',
                'vendor_approved_by_td_name',
                'vendor_approval_date',
                'vendor_rejection_reason'
            )
            ORDER BY column_name;
        """)

        columns = cursor.fetchall()
        if columns:
            for col_name, col_type in columns:
                pass
        else:
            pass

        cursor.close()
        conn.close()


        return True

    except Exception as e:
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':

    success = run_migration()

    if success:
        sys.exit(0)
    else:
        sys.exit(1)
