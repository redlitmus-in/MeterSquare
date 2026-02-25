"""
Migration: Add current_concern and proposed_changes fields to support_tickets table
"""

import os
import sys

# Add the parent directory to path to import config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

def run_migration():
    """Add current_concern and proposed_changes columns to support_tickets table"""
    app = create_app()

    with app.app_context():
        try:
            # Check if columns already exist
            result = db.session.execute(db.text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'support_tickets'
                AND column_name IN ('current_concern', 'proposed_changes')
            """))
            existing_columns = [row[0] for row in result.fetchall()]

            # Add current_concern if not exists
            if 'current_concern' not in existing_columns:
                db.session.execute(db.text("""
                    ALTER TABLE support_tickets
                    ADD COLUMN current_concern TEXT
                """))
                print("Added column: current_concern")
            else:
                print("Column current_concern already exists")

            # Add proposed_changes if not exists
            if 'proposed_changes' not in existing_columns:
                db.session.execute(db.text("""
                    ALTER TABLE support_tickets
                    ADD COLUMN proposed_changes TEXT
                """))
                print("Added column: proposed_changes")
            else:
                print("Column proposed_changes already exists")

            db.session.commit()
            print("Migration completed successfully!")

        except Exception as e:
            db.session.rollback()
            print(f"Migration failed: {str(e)}")
            raise

if __name__ == "__main__":
    run_migration()
