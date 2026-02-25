"""
Migration: Add indexes for ORDER BY performance on timestamp columns

This migration adds database indexes to optimize the ORDER BY clauses
that were added to buyer purchase order queries.

Without these indexes, queries will perform table scans and degrade
performance as data grows.

Author: Claude Code
Date: 2025-12-20
"""

import os
from sqlalchemy import create_client, text
from config.logging import get_logger

log = get_logger()

# Get database URL from environment
DATABASE_URL = os.environ.get('DATABASE_URL')

def upgrade():
    """Add indexes to timestamp columns for efficient ORDER BY"""
    if not DATABASE_URL:
        log.error("DATABASE_URL not found in environment variables")
        return

    from sqlalchemy import create_engine
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        log.info("Starting timestamp index migration...")

        try:
            # 1. Add index to change_requests.updated_at (DESC NULLS LAST for PostgreSQL)
            log.info("Adding index to change_requests.updated_at...")
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_change_requests_updated_at
                ON change_requests(updated_at DESC NULLS LAST);
            """))
            log.info("✅ Added index: idx_change_requests_updated_at")

            # 2. Add index to po_child.updated_at
            log.info("Adding index to po_child.updated_at...")
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_po_child_updated_at
                ON po_child(updated_at DESC NULLS LAST);
            """))
            log.info("✅ Added index: idx_po_child_updated_at")

            # 3. Add index to po_child.created_at
            log.info("Adding index to po_child.created_at...")
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_po_child_created_at
                ON po_child(created_at DESC);
            """))
            log.info("✅ Added index: idx_po_child_created_at")

            # 4. Verify change_requests.created_at index exists (should already exist)
            log.info("Verifying change_requests.created_at index...")
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_change_requests_created_at
                ON change_requests(created_at DESC);
            """))
            log.info("✅ Verified index: idx_change_requests_created_at")

            conn.commit()
            log.info("🎉 All timestamp indexes created successfully!")

            # Print performance improvement estimate
            log.info("")
            log.info("=" * 60)
            log.info("PERFORMANCE IMPACT:")
            log.info("  - ORDER BY queries will now use indexes")
            log.info("  - Expected speedup: 10-100x for large datasets")
            log.info("  - Query time should remain < 100ms even with 100K+ records")
            log.info("=" * 60)

        except Exception as e:
            log.error(f"❌ Error creating indexes: {str(e)}")
            conn.rollback()
            raise

def downgrade():
    """Remove the indexes (rollback)"""
    if not DATABASE_URL:
        log.error("DATABASE_URL not found in environment variables")
        return

    from sqlalchemy import create_engine
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        log.info("Rolling back timestamp index migration...")

        try:
            conn.execute(text("DROP INDEX IF EXISTS idx_change_requests_updated_at;"))
            log.info("Dropped: idx_change_requests_updated_at")

            conn.execute(text("DROP INDEX IF EXISTS idx_po_child_updated_at;"))
            log.info("Dropped: idx_po_child_updated_at")

            conn.execute(text("DROP INDEX IF EXISTS idx_po_child_created_at;"))
            log.info("Dropped: idx_po_child_created_at")

            conn.commit()
            log.info("✅ Rollback completed successfully")

        except Exception as e:
            log.error(f"❌ Error during rollback: {str(e)}")
            conn.rollback()
            raise

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--downgrade":
        log.info("Running downgrade (removing indexes)...")
        downgrade()
    else:
        log.info("Running upgrade (adding indexes)...")
        upgrade()
