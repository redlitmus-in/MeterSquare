"""
Migration: Add revision_number column to boq table

This migration adds a revision_number column to track which revision cycle a BOQ is in.
- revision_number = 0: Original BOQ (not a revision)
- revision_number >= 1: Revision 1, 2, 3, etc.

Run this script to add the column to the database.
"""

import sys
import os

# Add parent directory to path so we can import backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from config.db import db
from config.logging import get_logger

log = get_logger()

def run_migration():
    """Add revision_number column to boq table"""
    try:
        # Check if column already exists
        check_column_query = text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'boq'
            AND column_name = 'revision_number'
        """)

        result = db.session.execute(check_column_query).fetchone()

        if result:
            log.info("Column 'revision_number' already exists in 'boq' table. Skipping migration.")
            return True

        # Add revision_number column
        log.info("Adding 'revision_number' column to 'boq' table...")

        add_column_query = text("""
            ALTER TABLE boq
            ADD COLUMN revision_number INTEGER DEFAULT 0 NOT NULL
        """)

        db.session.execute(add_column_query)
        db.session.commit()

        log.info("Successfully added 'revision_number' column to 'boq' table.")

        # Update existing BOQs: Set revision_number based on status
        log.info("Updating existing BOQs with revision_number...")

        update_query = text("""
            UPDATE boq
            SET revision_number = 0
            WHERE revision_number IS NULL
            OR revision_number = 0
        """)

        db.session.execute(update_query)
        db.session.commit()

        log.info("Migration completed successfully!")
        return True

    except Exception as e:
        log.error(f"Error running migration: {str(e)}")
        db.session.rollback()
        return False

if __name__ == "__main__":
    from app import create_app

    app = create_app()

    with app.app_context():
        success = run_migration()
        if success:
            print("[SUCCESS] Migration completed successfully!")
        else:
            print("[ERROR] Migration failed. Check logs for details.")
