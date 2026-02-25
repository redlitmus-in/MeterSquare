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
                    print(f"✓ Executed: {statement[:60]}...")
                except Exception as e:
                    # Column might already exist
                    if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                        print(f"⊙ Skipped (already exists): {statement[:60]}...")
                    else:
                        raise e

            db.session.commit()

            print("\n✓ Successfully updated change_requests table with multi-stage approval fields")
            print("\nNew fields added:")
            print("  - current_approver_role")
            print("  - pm_approved_by_user_id")
            print("  - pm_approved_by_name")
            print("  - pm_approval_date")
            print("  - td_approved_by_user_id")
            print("  - td_approved_by_name")
            print("  - td_approval_date")
            print("  - rejected_by_user_id")
            print("  - rejected_by_name")
            print("  - rejected_at_stage")
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
    print("Updating Change Requests Table for Multi-Stage Approval")
    print("=" * 70)
    print()

    success = update_change_requests_table()

    if success:
        print("\n" + "=" * 70)
        print("Migration Complete! Next Steps:")
        print("=" * 70)
        print("1. ✓ Database updated with new approval fields")
        print("2. → Restart backend server")
        print("3. → Test the multi-stage approval workflow")
        print()
    else:
        print("\n✗ Migration failed. Please check the error above.")
