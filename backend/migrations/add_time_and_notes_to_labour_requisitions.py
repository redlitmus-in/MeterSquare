"""
Migration: Add required_time and preferred_workers_notes to labour_requisitions
Date: 2026-01-20
Purpose: Add time field and preferred workers notes field to labour requisitions
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
    """Add required_time and preferred_workers_notes columns to labour_requisitions table"""
    try:
        log.info("Starting migration: add_time_and_notes_to_labour_requisitions")

        # Add columns to labour_requisitions table
        migration_sql = text("""
            -- Add required_time column
            ALTER TABLE labour_requisitions
            ADD COLUMN IF NOT EXISTS required_time TIME;

            -- Add preferred_workers_notes column
            ALTER TABLE labour_requisitions
            ADD COLUMN IF NOT EXISTS preferred_workers_notes TEXT;

            -- Add comments for documentation
            COMMENT ON COLUMN labour_requisitions.required_time IS 'Required time for workers to arrive';
            COMMENT ON COLUMN labour_requisitions.preferred_workers_notes IS 'Preferred worker names with employee numbers or other notes';
        """)

        db.session.execute(migration_sql)
        db.session.commit()

        log.info("✓ Successfully added required_time and preferred_workers_notes columns to labour_requisitions table")
        log.info("Migration completed successfully!")

        return True

    except Exception as e:
        log.error(f"Migration failed: {str(e)}")
        db.session.rollback()
        return False


def rollback_migration():
    """Rollback the migration (remove the added columns)"""
    try:
        log.info("Starting rollback: remove_time_and_notes_from_labour_requisitions")

        rollback_sql = text("""
            -- Remove the added columns
            ALTER TABLE labour_requisitions
            DROP COLUMN IF EXISTS required_time,
            DROP COLUMN IF EXISTS preferred_workers_notes;
        """)

        db.session.execute(rollback_sql)
        db.session.commit()

        log.info("✓ Successfully removed required_time and preferred_workers_notes columns")
        log.info("Rollback completed successfully!")

        return True

    except Exception as e:
        log.error(f"Rollback failed: {str(e)}")
        db.session.rollback()
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Add time and notes fields to labour requisitions')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration')
    args = parser.parse_args()

    if args.rollback:
        success = rollback_migration()
    else:
        success = run_migration()

    sys.exit(0 if success else 1)
