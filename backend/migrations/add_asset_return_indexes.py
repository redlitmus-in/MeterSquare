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
    sys.exit(1)

def run_migration():
    """Add indexes to asset_return_requests table for performance optimization"""

    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:

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
                return


            # Add index on project_id (for project completion validation)
            try:
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_asset_return_requests_project_id
                    ON asset_return_requests(project_id);
                """))
            except Exception as e:
                pass

            # Add index on status (for filtering incomplete returns)
            try:
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_asset_return_requests_status
                    ON asset_return_requests(status);
                """))
            except Exception as e:
                pass

            # Add index on requested_by_id (for SE-specific queries)
            try:
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_asset_return_requests_requested_by_id
                    ON asset_return_requests(requested_by_id);
                """))
            except Exception as e:
                pass

            # Commit transaction
            conn.commit()

            # Verify indexes were created

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

            for idx in indexes:
                pass


        except Exception as e:
            conn.rollback()
            raise

if __name__ == "__main__":
    run_migration()
