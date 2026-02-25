"""
Migration script to create change_requests table
Run this script to add the change request functionality to your database
"""

from config.db import db
from models.change_request import ChangeRequest
from models.boq import BOQ
from models.project import Project
from models.user import User
from app import create_app

def create_change_requests_table():
    """Create change_requests table in database"""
    try:
        app = create_app()

        with app.app_context():
            # Create only the change_requests table
            db.create_all()

            print("✓ Successfully created change_requests table")
            print(f"  Table name: {ChangeRequest.__tablename__}")
            print("\nTable structure:")
            print("  - cr_id (PK)")
            print("  - boq_id (FK to boq)")
            print("  - project_id (FK to project)")
            print("  - requested_by_user_id")
            print("  - requested_by_name")
            print("  - requested_by_role")
            print("  - request_type")
            print("  - justification")
            print("  - status")
            print("  - materials_data (JSONB)")
            print("  - materials_total_cost")
            print("  - overhead_consumed")
            print("  - overhead_balance_impact")
            print("  - profit_impact")
            print("  - original_overhead_allocated")
            print("  - original_overhead_used")
            print("  - original_overhead_remaining")
            print("  - original_overhead_percentage")
            print("  - original_profit_percentage")
            print("  - new_overhead_remaining")
            print("  - new_base_cost")
            print("  - new_total_cost")
            print("  - is_over_budget")
            print("  - cost_increase_amount")
            print("  - cost_increase_percentage")
            print("  - approval_required_from")
            print("  - approved_by_user_id")
            print("  - approved_by_name")
            print("  - approval_date")
            print("  - rejection_reason")
            print("  - notification_sent")
            print("  - notification_sent_at")
            print("  - created_at")
            print("  - updated_at")
            print("  - is_deleted")
            print("\n✓ Migration completed successfully!")

    except Exception as e:
        print(f"✗ Error creating change_requests table: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == "__main__":
    print("=" * 60)
    print("Creating Change Requests Table")
    print("=" * 60)
    print()

    success = create_change_requests_table()

    if success:
        print("\n" + "=" * 60)
        print("Next Steps:")
        print("=" * 60)
        print("1. ✓ Database table created")
        print("2. → Start backend server: python app.py")
        print("3. → Test API: POST /api/boq/change-request")
        print("4. → Build frontend components")
        print()
    else:
        print("\n✗ Migration failed. Please check the error above.")
