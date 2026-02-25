"""
Migration: Add requester_role field to labour_requisitions table
This field tracks whether the requisition was created by PM or SE
"""
import os
import sys
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

def migrate():
    """Add requester_role column to labour_requisitions table"""
    app = create_app()

    with app.app_context():
        try:
            print("Adding requester_role column to labour_requisitions table...")

            # Add requester_role column
            # Values: 'SE' (Site Engineer), 'PM' (Project Manager)
            db.session.execute("""
                ALTER TABLE labour_requisitions
                ADD COLUMN IF NOT EXISTS requester_role VARCHAR(10) DEFAULT 'SE';
            """)

            # Create index for better query performance
            db.session.execute("""
                CREATE INDEX IF NOT EXISTS idx_labour_requisitions_requester_role
                ON labour_requisitions(requester_role);
            """)

            # Update existing records to 'SE' (default for backwards compatibility)
            db.session.execute("""
                UPDATE labour_requisitions
                SET requester_role = 'SE'
                WHERE requester_role IS NULL;
            """)

            db.session.commit()
            print("✓ Successfully added requester_role column")
            print("✓ Created index on requester_role")
            print("✓ Updated existing records to 'SE'")

            return True

        except Exception as e:
            db.session.rollback()
            print(f"✗ Error during migration: {str(e)}")
            return False

def rollback():
    """Rollback migration - remove requester_role column"""
    app = create_app()

    with app.app_context():
        try:
            print("Rolling back: Removing requester_role column...")

            # Drop index
            db.session.execute("""
                DROP INDEX IF EXISTS idx_labour_requisitions_requester_role;
            """)

            # Drop column
            db.session.execute("""
                ALTER TABLE labour_requisitions
                DROP COLUMN IF EXISTS requester_role;
            """)

            db.session.commit()
            print("✓ Successfully rolled back migration")

            return True

        except Exception as e:
            db.session.rollback()
            print(f"✗ Error during rollback: {str(e)}")
            return False

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        success = rollback()
    else:
        success = migrate()

    sys.exit(0 if success else 1)
