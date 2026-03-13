"""
Migration script to add multi-stage approval fields to change_requests table
Run this ONLY if you already have the change_requests table from previous migration
"""

from config.db import db
from sqlalchemy import text
from app import create_app

def update_change_requests_table():
    """Add multi-stage approval fields to existing change_requests table"""
    try:
        app = create_app()

        with app.app_context():
            # Add new columns for multi-stage approval
            alter_statements = [
                # Track current approver
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS current_approver_role VARCHAR(50);",

                # PM Approval fields
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS pm_approved_by_user_id INTEGER;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS pm_approved_by_name VARCHAR(255);",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS pm_approval_date TIMESTAMP;",

                # TD Approval fields
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS td_approved_by_user_id INTEGER;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS td_approved_by_name VARCHAR(255);",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS td_approval_date TIMESTAMP;",

                # Rejection tracking
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS rejected_by_user_id INTEGER;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS rejected_by_name VARCHAR(255);",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS rejected_at_stage VARCHAR(50);"
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

    success = update_change_requests_table()

    if success:
        pass
    else:
        pass
