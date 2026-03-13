"""
Migration: Remove required_time from labour_requisitions
Date: 2026-01-20
Purpose: Remove deprecated required_time column, keeping only start_time and end_time
"""
import os
import sys
from sqlalchemy import text

# Add parent directory to path to import db config
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from config.logging import get_logger

log = get_logger()


def run_migration():
    """Remove required_time column from labour_requisitions table"""
    try:

        # Remove deprecated column
        migration_sql = text("""
            -- Drop the deprecated required_time column
            ALTER TABLE labour_requisitions
            DROP COLUMN IF EXISTS required_time;
        """)

        db.session.execute(migration_sql)
        db.session.commit()


        return True

    except Exception as e:
        log.error(f"Migration failed: {str(e)}")
        db.session.rollback()
        return False


def rollback_migration():
    """Rollback the migration (re-add the required_time column)"""
    try:

        rollback_sql = text("""
            -- Re-add the required_time column
            ALTER TABLE labour_requisitions
            ADD COLUMN IF NOT EXISTS required_time TIME;

            COMMENT ON COLUMN labour_requisitions.required_time IS 'DEPRECATED: Use start_time instead';
        """)

        db.session.execute(rollback_sql)
        db.session.commit()


        return True

    except Exception as e:
        log.error(f"Rollback failed: {str(e)}")
        db.session.rollback()
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Remove deprecated required_time field from labour requisitions')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration')
    args = parser.parse_args()

    if args.rollback:
        success = rollback_migration()
    else:
        success = run_migration()

    sys.exit(0 if success else 1)
