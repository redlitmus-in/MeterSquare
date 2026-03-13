"""
Migration script to add buyer purchase completion fields to change_requests table
Adds fields for tracking buyer assignment and purchase completion
"""

from config.db import db
from sqlalchemy import text
from app import create_app

def add_buyer_fields_to_change_requests():
    """Add buyer purchase completion fields to change_requests table"""
    try:
        app = create_app()

        with app.app_context():
            # Add new columns for buyer purchase tracking
            alter_statements = [
                # Buyer Assignment
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS assigned_to_buyer_user_id INTEGER;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS assigned_to_buyer_name VARCHAR(255);",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS assigned_to_buyer_date TIMESTAMP;",

                # Purchase Completion
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS purchase_completed_by_user_id INTEGER;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS purchase_completed_by_name VARCHAR(255);",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS purchase_completion_date TIMESTAMP;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS purchase_notes TEXT;"
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

    success = add_buyer_fields_to_change_requests()

    if success:
        pass
    else:
        pass
