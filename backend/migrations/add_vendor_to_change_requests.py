"""
Migration script to add vendor selection fields to change_requests table
Adds fields for tracking vendor selection by buyer and TD approval
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config.db import db
from sqlalchemy import text
from app import create_app

def add_vendor_fields_to_change_requests():
    """Add vendor selection fields to change_requests table"""
    try:
        app = create_app()

        with app.app_context():
            # Add new columns for vendor selection tracking
            alter_statements = [
                # Vendor Selection
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS selected_vendor_id INTEGER REFERENCES vendors(vendor_id);",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS selected_vendor_name VARCHAR(255);",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_selected_by_buyer_id INTEGER;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_selected_by_buyer_name VARCHAR(255);",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_selection_date TIMESTAMP;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_selection_status VARCHAR(50);",

                # TD Approval for Vendor
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_approved_by_td_id INTEGER;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_approved_by_td_name VARCHAR(255);",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_approval_date TIMESTAMP;",
                "ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS vendor_rejection_reason TEXT;"
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

    success = add_vendor_fields_to_change_requests()

    if success:
        pass
    else:
        pass
