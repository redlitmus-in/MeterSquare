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

        # Step 1: Create boq_internal_revisions table
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

        # Step 2: Create indexes
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

        # Step 3: Add columns to boq table

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
        else:
            pass

        if 'has_internal_revisions' not in existing_columns:
            db.session.execute(text("""
                ALTER TABLE boq
                ADD COLUMN has_internal_revisions BOOLEAN DEFAULT FALSE
            """))
        else:
            pass

        # Commit transaction
        db.session.commit()


        return True

    except Exception as e:
        log.error(f"Error running migration: {str(e)}")
        db.session.rollback()
        return False

def rollback_migration():
    """Rollback: Drop table and remove columns"""
    try:

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
            pass
        else:
            pass
