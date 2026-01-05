"""
Migration: Backfill NULL updated_at values with created_at

This migration ensures all records have an updated_at value by setting
it equal to created_at for records where updated_at is NULL.

This prevents newly created records from appearing below older updated
records when sorting by "updated_at DESC NULLS LAST".

Author: Claude Code
Date: 2025-12-20
"""

import os
from sqlalchemy import create_engine, text
from config.logging import get_logger

log = get_logger()

# Get database URL from environment
DATABASE_URL = os.environ.get('DATABASE_URL')

def upgrade():
    """Set updated_at = created_at where updated_at is NULL"""
    if not DATABASE_URL:
        log.error("DATABASE_URL not found in environment variables")
        return

    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        log.info("Starting updated_at backfill migration...")

        try:
            # 1. Backfill change_requests table
            log.info("Backfilling change_requests.updated_at...")
            result = conn.execute(text("""
                UPDATE change_requests
                SET updated_at = created_at
                WHERE updated_at IS NULL
                  AND created_at IS NOT NULL;
            """))
            cr_updated = result.rowcount
            log.info(f"✅ Updated {cr_updated} change_request records")

            # 2. Backfill po_child table
            log.info("Backfilling po_child.updated_at...")
            result = conn.execute(text("""
                UPDATE po_child
                SET updated_at = created_at
                WHERE updated_at IS NULL
                  AND created_at IS NOT NULL;
            """))
            pc_updated = result.rowcount
            log.info(f"✅ Updated {pc_updated} po_child records")

            conn.commit()
            log.info("🎉 Backfill completed successfully!")

            # Print summary
            log.info("")
            log.info("=" * 60)
            log.info("BACKFILL SUMMARY:")
            log.info(f"  - ChangeRequests updated: {cr_updated}")
            log.info(f"  - POChildren updated: {pc_updated}")
            log.info(f"  - Total records updated: {cr_updated + pc_updated}")
            log.info("")
            log.info("IMPACT:")
            log.info("  - New records will now appear first in buyer view")
            log.info("  - Sorting by updated_at will work correctly")
            log.info("=" * 60)

        except Exception as e:
            log.error(f"❌ Error during backfill: {str(e)}")
            conn.rollback()
            raise

def verify():
    """Verify that there are no NULL updated_at values remaining"""
    if not DATABASE_URL:
        log.error("DATABASE_URL not found in environment variables")
        return

    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        log.info("Verifying updated_at backfill...")

        # Check change_requests
        result = conn.execute(text("""
            SELECT COUNT(*)
            FROM change_requests
            WHERE updated_at IS NULL
              AND created_at IS NOT NULL;
        """))
        cr_null_count = result.scalar()

        # Check po_child
        result = conn.execute(text("""
            SELECT COUNT(*)
            FROM po_child
            WHERE updated_at IS NULL
              AND created_at IS NOT NULL;
        """))
        pc_null_count = result.scalar()

        log.info(f"ChangeRequests with NULL updated_at: {cr_null_count}")
        log.info(f"POChildren with NULL updated_at: {pc_null_count}")

        if cr_null_count == 0 and pc_null_count == 0:
            log.info("✅ Verification passed: No NULL updated_at values found")
        else:
            log.warning(f"⚠️ Found {cr_null_count + pc_null_count} records with NULL updated_at")

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        log.info("Running verification...")
        verify()
    else:
        log.info("Running upgrade (backfilling NULL values)...")
        upgrade()
        log.info("")
        verify()
