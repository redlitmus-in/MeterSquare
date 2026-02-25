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
                    print(f"✓ Executed: {statement[:60]}...")
                except Exception as e:
                    # Column might already exist
                    if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                        print(f"⊙ Skipped (already exists): {statement[:60]}...")
                    else:
                        raise e

            db.session.commit()

            print("\n✓ Successfully updated change_requests table with buyer fields")
            print("\nNew fields added:")
            print("  - assigned_to_buyer_user_id")
            print("  - assigned_to_buyer_name")
            print("  - assigned_to_buyer_date")
            print("  - purchase_completed_by_user_id")
            print("  - purchase_completed_by_name")
            print("  - purchase_completion_date")
            print("  - purchase_notes")
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
    print("Adding Buyer Purchase Fields to Change Requests Table")
    print("=" * 70)
    print()

    success = add_buyer_fields_to_change_requests()

    if success:
        print("\n" + "=" * 70)
        print("Migration Complete! Next Steps:")
        print("=" * 70)
        print("1. ✓ Database updated with buyer purchase fields")
        print("2. → Restart backend server")
        print("3. → Test the new buyer purchase workflow:")
        print("   - Estimator approves → Assigned to Buyer")
        print("   - Buyer completes purchase → Status: Complete")
        print()
    else:
        print("\n✗ Migration failed. Please check the error above.")
