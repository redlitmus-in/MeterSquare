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
        print("❌ ERROR: DATABASE_URL not found in environment variables")
        return False

    try:
        # Read the SQL migration file
        migration_file = Path(__file__).parent / 'add_vendor_to_change_requests.sql'
        with open(migration_file, 'r') as f:
            migration_sql = f.read()

        print("📦 Connecting to database...")
        conn = psycopg2.connect(database_url)
        conn.autocommit = True  # Run in autocommit mode for ALTER TABLE
        cursor = conn.cursor()

        print("🔄 Running migration...")
        cursor.execute(migration_sql)

        print("✅ Migration completed successfully!")
        print("\n📊 Verifying new columns...")

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
            print(f"\n✅ Successfully added {len(columns)} columns:")
            for col_name, col_type in columns:
                print(f"   - {col_name} ({col_type})")
        else:
            print("⚠️  Warning: Could not verify columns")

        cursor.close()
        conn.close()

        print("\n🎉 Migration complete! You can now:")
        print("   1. Restart your backend server")
        print("   2. Test the vendor approval workflow")

        return True

    except Exception as e:
        print(f"❌ ERROR running migration: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("Vendor Selection Migration for Change Requests")
    print("=" * 60)
    print()

    success = run_migration()

    if success:
        sys.exit(0)
    else:
        sys.exit(1)
