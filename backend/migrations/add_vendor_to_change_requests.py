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
                    print(f"✓ Executed: {statement[:60]}...")
                except Exception as e:
                    # Column might already exist
                    if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                        print(f"⊙ Skipped (already exists): {statement[:60]}...")
                    else:
                        raise e

            db.session.commit()

            print("\n✓ Successfully updated change_requests table with vendor fields")
            print("\nNew fields added:")
            print("  - selected_vendor_id (FK to vendors)")
            print("  - selected_vendor_name")
            print("  - vendor_selected_by_buyer_id")
            print("  - vendor_selected_by_buyer_name")
            print("  - vendor_selection_date")
            print("  - vendor_selection_status")
            print("  - vendor_approved_by_td_id")
            print("  - vendor_approved_by_td_name")
            print("  - vendor_approval_date")
            print("  - vendor_rejection_reason")
            print("\n✓ Migration completed successfully!")

    except Exception as e:
        db.session.rollback()
        print(f"✗ Error updating change_requests table: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == "__main__":
    print("=" * 70)
    print("Adding Vendor Selection Fields to Change Requests Table")
    print("=" * 70)
    print()

    success = add_vendor_fields_to_change_requests()

    if success:
        print("\n" + "=" * 70)
        print("Migration Complete! Next Steps:")
        print("=" * 70)
        print("1. ✓ Database updated with vendor selection fields")
        print("2. → Restart backend server")
        print("3. → Test the new vendor selection workflow:")
        print("   - Buyer selects vendor → Sent to TD for approval")
        print("   - TD approves/rejects vendor selection")
        print()
    else:
        print("\n✗ Migration failed. Please check the error above.")
