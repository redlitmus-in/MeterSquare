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

        try:
            # 1. Backfill change_requests table
            result = conn.execute(text("""
                UPDATE change_requests
                SET updated_at = created_at
                WHERE updated_at IS NULL
                  AND created_at IS NOT NULL;
            """))
            cr_updated = result.rowcount

            # 2. Backfill po_child table
            result = conn.execute(text("""
                UPDATE po_child
                SET updated_at = created_at
                WHERE updated_at IS NULL
                  AND created_at IS NOT NULL;
            """))
            pc_updated = result.rowcount

            conn.commit()

        except Exception as e:
            log.error(f" Error during backfill: {str(e)}")
            conn.rollback()
            raise

def verify():
    """Verify that there are no NULL updated_at values remaining"""
    if not DATABASE_URL:
        log.error("DATABASE_URL not found in environment variables")
        return

    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:

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


        if cr_null_count == 0 and pc_null_count == 0:
            pass
        else:
            log.warning(f" Found {cr_null_count + pc_null_count} records with NULL updated_at")

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        verify()
    else:
        upgrade()
        verify()
