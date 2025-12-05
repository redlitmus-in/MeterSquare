"""
Migration script to create boq_material_assignments table
Run this script to add the BOQ material assignment functionality to your database
"""

import sys
import os

# Add backend directory to Python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from config.db import db
from models.boq_material_assignment import BOQMaterialAssignment
from models.boq import BOQ
from models.project import Project
from models.vendor import Vendor
from app import create_app


def create_boq_material_assignments_table():
    """Create boq_material_assignments table in database"""
    try:
        app = create_app()

        with app.app_context():
            # Create only the boq_material_assignments table
            db.create_all()

            print("[OK] Successfully created boq_material_assignments table")
            print(f"  Table name: {BOQMaterialAssignment.__tablename__}")
            print("\nTable structure:")
            print("  - assignment_id (PK)")
            print("  - boq_id (FK to boq)")
            print("  - project_id (FK to project)")
            print("  - assigned_by_user_id")
            print("  - assigned_by_name")
            print("  - assigned_to_buyer_user_id")
            print("  - assigned_to_buyer_name")
            print("  - assigned_to_buyer_date")
            print("  - status")
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
            print("  - vendor_email_sent")
            print("  - vendor_email_sent_date")
            print("  - vendor_email_sent_by_user_id")
            print("  - purchase_completed_by_user_id")
            print("  - purchase_completed_by_name")
            print("  - purchase_completion_date")
            print("  - purchase_notes")
            print("  - created_at")
            print("  - updated_at")
            print("  - is_deleted")
            print("\n[OK] Migration completed successfully!")

    except Exception as e:
        print(f"[ERROR] creating boq_material_assignments table: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True


if __name__ == "__main__":
    print("=" * 60)
    print("Creating BOQ Material Assignments Table")
    print("=" * 60)
    print()

    success = create_boq_material_assignments_table()

    if success:
        print("\n" + "=" * 60)
        print("Next Steps:")
        print("=" * 60)
        print("1. [OK] Database table created")
        print("2. -> Start backend server: python app.py")
        print("3. -> Test API: POST /api/sitesupervisor/boq/{boq_id}/assign-buyer")
        print("4. -> Build frontend components")
        print()
    else:
        print("\n[ERROR] Migration failed. Please check the error above.")
