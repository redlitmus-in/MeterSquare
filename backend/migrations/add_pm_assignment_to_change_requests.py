"""
Migration script to add PM assignment fields to change_requests table
These fields track which specific PM should handle a change request sent by SE
This enables proper routing so only the assigned PM sees the request
"""

from config.db import db
from sqlalchemy import text
from app import create_app

def add_pm_assignment_fields():
    """Add PM assignment fields to change_requests table"""
    try:
        app = create_app()

        with app.app_context():
            # Add new columns for PM assignment tracking
            alter_statements = [
                # PM Assignment - which specific PM should handle this request
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS assigned_to_pm_user_id INTEGER;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS assigned_to_pm_name VARCHAR(255);",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS assigned_to_pm_date TIMESTAMP;",

                # Add index for efficient querying
                "CREATE INDEX IF NOT EXISTS idx_cr_assigned_pm ON change_requests(assigned_to_pm_user_id);"
            ]

            for statement in alter_statements:
                try:
                    db.session.execute(text(statement))
                except Exception as e:
                    # Column might already exist
                    if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                        pass
                    else:
                        raise e

            db.session.commit()


    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == "__main__":

    success = add_pm_assignment_fields()

    if success:
        pass
    else:
        pass
