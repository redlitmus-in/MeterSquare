"""
Migration: Make notifications.user_id nullable
This allows broadcast notifications for the support-management page (no auth required)
Run this once to update the database schema.
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

def run_migration():
    """Make user_id column nullable in notifications table"""
    app = create_app()

    with app.app_context():
        try:
            # Check current constraint
            result = db.session.execute(db.text("""
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'notifications' AND column_name = 'user_id'
            """))
            row = result.fetchone()

            if row and row[0] == 'YES':
                print("✓ user_id column is already nullable. No migration needed.")
                return True

            # Make user_id nullable
            print("Making user_id column nullable...")
            db.session.execute(db.text("""
                ALTER TABLE notifications
                ALTER COLUMN user_id DROP NOT NULL
            """))
            db.session.commit()

            print("✓ Migration completed successfully!")
            print("  - notifications.user_id is now nullable")
            print("  - Broadcast notifications can now be created for support-management page")
            return True

        except Exception as e:
            db.session.rollback()
            print(f"✗ Migration failed: {e}")
            return False

if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
