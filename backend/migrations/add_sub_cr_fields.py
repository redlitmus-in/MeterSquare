"""
Migration script to add sub-CR support fields to change_requests table
This enables parent-child CR relationships for separate vendor submissions

Fields added:
- parent_cr_id: Foreign key to change_requests.cr_id
- cr_number_suffix: String to store ".1", ".2", ".3", etc.
- is_sub_cr: Boolean flag indicating if this is a sub-CR
- submission_group_id: UUID to group related sub-CRs together

Usage:
    python backend/migrations/add_sub_cr_fields.py
"""
import sys
import os

# Add the backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db
from sqlalchemy import text

def add_sub_cr_fields():
    """Add parent-child CR relationship fields to change_requests table"""
    app = create_app()
    with app.app_context():
        try:

            # Add parent_cr_id column with foreign key
            db.session.execute(text("""
                ALTER TABLE change_requests
                ADD COLUMN IF NOT EXISTS parent_cr_id INTEGER REFERENCES change_requests(cr_id);
            """))

            # Add cr_number_suffix column
            db.session.execute(text("""
                ALTER TABLE change_requests
                ADD COLUMN IF NOT EXISTS cr_number_suffix VARCHAR(10);
            """))

            # Add is_sub_cr column
            db.session.execute(text("""
                ALTER TABLE change_requests
                ADD COLUMN IF NOT EXISTS is_sub_cr BOOLEAN DEFAULT FALSE;
            """))

            # Add submission_group_id column
            db.session.execute(text("""
                ALTER TABLE change_requests
                ADD COLUMN IF NOT EXISTS submission_group_id VARCHAR(50);
            """))

            # Create index on parent_cr_id for faster queries
            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_change_requests_parent_cr_id
                ON change_requests(parent_cr_id);
            """))

            # Create index on submission_group_id
            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_change_requests_submission_group_id
                ON change_requests(submission_group_id);
            """))

            # Create index on is_sub_cr
            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_change_requests_is_sub_cr
                ON change_requests(is_sub_cr);
            """))

            db.session.commit()

        except Exception as e:
            db.session.rollback()
            import traceback
            sys.exit(1)

if __name__ == "__main__":
    add_sub_cr_fields()
