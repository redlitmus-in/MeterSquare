"""
Migration script to update the disposal_status CHECK constraint
to include new statuses: pending_approval, approved, rejected

Run this script to fix the constraint error:
python migrations/fix_disposal_status_constraint.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db
from sqlalchemy import text

app = create_app()

def run_migration():
    with app.app_context():
        try:
            # Drop the old constraint
            print("Dropping old constraint...")
            db.session.execute(text("""
                ALTER TABLE material_returns
                DROP CONSTRAINT IF EXISTS material_returns_disposal_status_check;
            """))

            # Add the new constraint with all valid statuses
            print("Adding new constraint with updated statuses...")
            db.session.execute(text("""
                ALTER TABLE material_returns
                ADD CONSTRAINT material_returns_disposal_status_check
                CHECK (disposal_status IN (
                    'pending_approval',
                    'approved',
                    'pending_review',
                    'approved_disposal',
                    'disposed',
                    'repaired',
                    'rejected'
                ) OR disposal_status IS NULL);
            """))

            db.session.commit()
            print("Migration completed successfully!")
            print("\nNew valid disposal_status values:")
            print("  - pending_approval (Good condition returns awaiting PM approval)")
            print("  - approved (Good returns approved and added to stock)")
            print("  - pending_review (Damaged/Defective awaiting PM review)")
            print("  - approved_disposal (PM approved for disposal)")
            print("  - disposed (Physically disposed)")
            print("  - repaired (Marked for repair)")
            print("  - rejected (PM rejected the return)")

        except Exception as e:
            db.session.rollback()
            print(f"Error during migration: {str(e)}")
            raise

if __name__ == '__main__':
    run_migration()
