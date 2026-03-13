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
            db.session.execute(text("""
                ALTER TABLE material_returns
                DROP CONSTRAINT IF EXISTS material_returns_disposal_status_check;
            """))

            # Fix any existing invalid status values before adding constraint
            result = db.session.execute(text("""
                UPDATE material_returns
                SET disposal_status = 'sent_for_repair'
                WHERE disposal_status = 'backup_added'
            """))

            # Add the new constraint with all valid statuses
            db.session.execute(text("""
                ALTER TABLE material_returns
                ADD CONSTRAINT material_returns_disposal_status_check
                CHECK (disposal_status IN (
                    'pending_approval',
                    'approved',
                    'pending_review',
                    'approved_disposal',
                    'disposed',
                    'sent_for_repair',
                    'repaired',
                    'rejected'
                ) OR disposal_status IS NULL);
            """))

            db.session.commit()

        except Exception as e:
            db.session.rollback()
            raise

if __name__ == '__main__':
    run_migration()
