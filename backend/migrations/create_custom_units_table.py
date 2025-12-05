"""
Migration script to create custom_units table
Run this script to add custom unit functionality to your database
"""

import sys
import os
# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from models.boq import CustomUnit
from app import create_app

def create_custom_units_table():
    """Create custom_units table in database"""
    try:
        app = create_app()

        with app.app_context():
            # Create only the custom_units table
            db.create_all()

            print("Successfully created custom_units table")
            print(f"  Table name: {CustomUnit.__tablename__}")
            print("\nTable structure:")
            print("  - unit_id (PK)")
            print("  - unit_value (unique, indexed)")
            print("  - unit_label")
            print("  - created_at")
            print("  - created_by")
            print("  - is_deleted (indexed)")
            print("\nMigration completed successfully!")

    except Exception as e:
        print(f"Error creating custom_units table: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == "__main__":
    print("=" * 60)
    print("Creating Custom Units Table")
    print("=" * 60)
    print()

    success = create_custom_units_table()

    if success:
        print("\n" + "=" * 60)
        print("Next Steps:")
        print("=" * 60)
        print("1. Database table created")
        print("2. Start backend server: python app.py")
        print("3. Test API: GET /api/boq/custom-units")
        print("4. Test API: POST /api/boq/custom-units")
        print()
    else:
        print("\nMigration failed. Please check the error above.")
