"""
Migration: Create BOQ Internal Revisions Table
Description: Tracks internal approval cycles (PM edits, TD rejections) before sending to client
Created: 2025-10-15
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from config.db import db
from config.logging import get_logger

log = get_logger()

def run_migration():
    """Create boq_internal_revisions table and add columns to boq table"""
    try:
        log.info("Starting migration: Create Internal Revisions Table")

        # Step 1: Create boq_internal_revisions table
        log.info("Creating boq_internal_revisions table...")
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS boq_internal_revisions (
                id SERIAL PRIMARY KEY,
                boq_id INTEGER NOT NULL REFERENCES boq(boq_id) ON DELETE CASCADE,
                internal_revision_number INTEGER NOT NULL,
                action_type VARCHAR(50) NOT NULL,
                actor_role VARCHAR(50) NOT NULL,
                actor_name VARCHAR(100),
                actor_user_id INTEGER,
                status_before VARCHAR(50),
                status_after VARCHAR(50),
                changes_summary JSONB,
                rejection_reason TEXT,
                approval_comments TEXT,
                boq_snapshot JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_deleted BOOLEAN DEFAULT FALSE
            )
        """))
        log.info("✓ Table boq_internal_revisions created")

        # Step 2: Create indexes
        log.info("Creating indexes...")
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_internal_rev_boq
            ON boq_internal_revisions(boq_id)
        """))
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_internal_rev_number
            ON boq_internal_revisions(boq_id, internal_revision_number)
        """))
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_internal_rev_action
            ON boq_internal_revisions(action_type)
        """))
        log.info("✓ Indexes created")

        # Step 3: Add columns to boq table
        log.info("Adding columns to boq table...")

        # Check if columns already exist
        result = db.session.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'boq'
            AND column_name IN ('internal_revision_number', 'has_internal_revisions')
        """))
        existing_columns = [row[0] for row in result.fetchall()]

        if 'internal_revision_number' not in existing_columns:
            db.session.execute(text("""
                ALTER TABLE boq
                ADD COLUMN internal_revision_number INTEGER DEFAULT 0
            """))
            log.info("✓ Added internal_revision_number column")
        else:
            log.info("→ Column internal_revision_number already exists")

        if 'has_internal_revisions' not in existing_columns:
            db.session.execute(text("""
                ALTER TABLE boq
                ADD COLUMN has_internal_revisions BOOLEAN DEFAULT FALSE
            """))
            log.info("✓ Added has_internal_revisions column")
        else:
            log.info("→ Column has_internal_revisions already exists")

        # Commit transaction
        db.session.commit()

        log.info("\n✅ Migration completed successfully!")
        log.info("Summary:")
        log.info("  - Created boq_internal_revisions table")
        log.info("  - Created 3 indexes for performance")
        log.info("  - Added internal_revision_number to boq table")
        log.info("  - Added has_internal_revisions to boq table")

        return True

    except Exception as e:
        log.error(f"Error running migration: {str(e)}")
        db.session.rollback()
        return False

def rollback_migration():
    """Rollback: Drop table and remove columns"""
    try:
        log.info("Rolling back migration...")

        # Drop indexes first
        db.session.execute(text("DROP INDEX IF EXISTS idx_internal_rev_boq"))
        db.session.execute(text("DROP INDEX IF EXISTS idx_internal_rev_number"))
        db.session.execute(text("DROP INDEX IF EXISTS idx_internal_rev_action"))

        # Drop table
        db.session.execute(text("DROP TABLE IF EXISTS boq_internal_revisions"))

        # Remove columns from boq table
        db.session.execute(text("ALTER TABLE boq DROP COLUMN IF EXISTS internal_revision_number"))
        db.session.execute(text("ALTER TABLE boq DROP COLUMN IF EXISTS has_internal_revisions"))

        db.session.commit()
        log.info("✅ Rollback completed")
        return True

    except Exception as e:
        log.error(f"Error rolling back migration: {str(e)}")
        db.session.rollback()
        return False

if __name__ == "__main__":
    from app import create_app

    app = create_app()

    with app.app_context():
        if len(sys.argv) > 1 and sys.argv[1] == "rollback":
            success = rollback_migration()
        else:
            success = run_migration()

        if success:
            print("[SUCCESS] Migration completed successfully!")
        else:
            print("[ERROR] Migration failed. Check logs for details.")
