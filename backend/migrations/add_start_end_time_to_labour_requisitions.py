"""
Migration: Add start_time and end_time to labour_requisitions
Date: 2026-01-20
Purpose: Add work shift start/end time fields to labour requisitions
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
    """Add start_time and end_time columns to labour_requisitions table"""
    try:
        log.info("Starting migration: add_start_end_time_to_labour_requisitions")

        # Add columns to labour_requisitions table
        migration_sql = text("""
            -- Add start_time column
            ALTER TABLE labour_requisitions
            ADD COLUMN IF NOT EXISTS start_time TIME;

            -- Add end_time column
            ALTER TABLE labour_requisitions
            ADD COLUMN IF NOT EXISTS end_time TIME;

            -- Add comments for documentation
            COMMENT ON COLUMN labour_requisitions.start_time IS 'Work shift start time';
            COMMENT ON COLUMN labour_requisitions.end_time IS 'Work shift end time';
            COMMENT ON COLUMN labour_requisitions.required_time IS 'DEPRECATED: Use start_time instead';
        """)

        db.session.execute(migration_sql)
        db.session.commit()

        log.info("✓ Successfully added start_time and end_time columns to labour_requisitions table")
        log.info("Migration completed successfully!")

        return True

    except Exception as e:
        log.error(f"Migration failed: {str(e)}")
        db.session.rollback()
        return False


def rollback_migration():
    """Rollback the migration (remove the added columns)"""
    try:
        log.info("Starting rollback: remove_start_end_time_from_labour_requisitions")

        rollback_sql = text("""
            -- Remove the added columns
            ALTER TABLE labour_requisitions
            DROP COLUMN IF EXISTS start_time,
            DROP COLUMN IF EXISTS end_time;
        """)

        db.session.execute(rollback_sql)
        db.session.commit()

        log.info("✓ Successfully removed start_time and end_time columns")
        log.info("Rollback completed successfully!")

        return True

    except Exception as e:
        log.error(f"Rollback failed: {str(e)}")
        db.session.rollback()
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Add start/end time fields to labour requisitions')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration')
    args = parser.parse_args()

    if args.rollback:
        success = rollback_migration()
    else:
        success = run_migration()

    sys.exit(0 if success else 1)
