"""
Migration: Add indexes to asset_return_requests table
Purpose: Improve query performance for project completion validation
Date: 2025-12-19
"""

import os
import sys
from sqlalchemy import create_engine, text

# Get database URL from environment
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("❌ DATABASE_URL environment variable not set")
    print("Usage: DATABASE_URL='postgresql://...' python migrations/add_asset_return_indexes.py")
    sys.exit(1)

def run_migration():
    """Add indexes to asset_return_requests table for performance optimization"""

    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        print("=" * 80)
        print("MIGRATION: Add Indexes to asset_return_requests Table")
        print("=" * 80)

        try:
            # Check if table exists
            check_table = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'asset_return_requests'
                );
            """)

            result = conn.execute(check_table)
            table_exists = result.scalar()

            if not table_exists:
                print("⚠️  Table 'asset_return_requests' does not exist. Skipping migration.")
                return

            print("✓ Table 'asset_return_requests' exists")
            print()

            # Add index on project_id (for project completion validation)
            print("Adding index on project_id...")
            try:
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_asset_return_requests_project_id
                    ON asset_return_requests(project_id);
                """))
                print("✓ Index on project_id created successfully")
            except Exception as e:
                print(f"⚠️  Index on project_id: {e}")

            # Add index on status (for filtering incomplete returns)
            print("\nAdding index on status...")
            try:
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_asset_return_requests_status
                    ON asset_return_requests(status);
                """))
                print("✓ Index on status created successfully")
            except Exception as e:
                print(f"⚠️  Index on status: {e}")

            # Add index on requested_by_id (for SE-specific queries)
            print("\nAdding index on requested_by_id...")
            try:
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_asset_return_requests_requested_by_id
                    ON asset_return_requests(requested_by_id);
                """))
                print("✓ Index on requested_by_id created successfully")
            except Exception as e:
                print(f"⚠️  Index on requested_by_id: {e}")

            # Commit transaction
            conn.commit()

            # Verify indexes were created
            print("\n" + "=" * 80)
            print("VERIFICATION: Checking Created Indexes")
            print("=" * 80)

            verify_query = text("""
                SELECT
                    indexname,
                    indexdef
                FROM pg_indexes
                WHERE tablename = 'asset_return_requests'
                ORDER BY indexname;
            """)

            result = conn.execute(verify_query)
            indexes = result.fetchall()

            print(f"\nTotal indexes on asset_return_requests: {len(indexes)}")
            for idx in indexes:
                print(f"  - {idx[0]}")

            print("\n" + "=" * 80)
            print("✅ MIGRATION COMPLETED SUCCESSFULLY")
            print("=" * 80)
            print("\nPerformance Impact:")
            print("  • Faster project completion validation queries")
            print("  • Improved filtering by status (pending, approved)")
            print("  • Optimized SE-specific return request lookups")
            print()

        except Exception as e:
            print(f"\n❌ Migration failed: {e}")
            conn.rollback()
            raise

if __name__ == "__main__":
    run_migration()
