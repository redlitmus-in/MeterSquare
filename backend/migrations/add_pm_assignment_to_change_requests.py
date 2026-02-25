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
                    print(f"+ Executed: {statement[:60]}...")
                except Exception as e:
                    # Column might already exist
                    if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                        print(f"= Skipped (already exists): {statement[:60]}...")
                    else:
                        raise e

            db.session.commit()

            print("\n+ Successfully updated change_requests table with PM assignment fields")
            print("\nNew fields added:")
            print("  - assigned_to_pm_user_id (INTEGER) - The specific PM who should handle this request")
            print("  - assigned_to_pm_name (VARCHAR) - Name of the assigned PM")
            print("  - assigned_to_pm_date (TIMESTAMP) - When the PM was assigned")
            print("\nIndex created:")
            print("  - idx_cr_assigned_pm - For efficient PM-based filtering")
            print("\n+ Migration completed successfully!")

    except Exception as e:
        db.session.rollback()
        print(f"X Error updating change_requests table: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == "__main__":
    print("=" * 70)
    print("Adding PM Assignment Fields to Change Requests Table")
    print("=" * 70)
    print()
    print("Purpose: Enable proper routing of SE-created change requests")
    print("         to the specific PM who assigned them (via pm_assign_ss)")
    print()

    success = add_pm_assignment_fields()

    if success:
        print("\n" + "=" * 70)
        print("Migration Complete! What this fixes:")
        print("=" * 70)
        print("1. + SE sends request -> Only assigned PM sees it (not all PMs)")
        print("2. + Uses pm_assign_ss table to determine the correct PM")
        print("3. + Stores PM assignment in change_requests table for filtering")
        print()
        print("Next Steps:")
        print("1. Restart backend server")
        print("2. Test: SE creates request -> Send to PM")
        print("3. Verify: Only the assigned PM sees the request")
        print()
    else:
        print("\nX Migration failed. Please check the error above.")
