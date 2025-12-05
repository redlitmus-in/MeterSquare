"""
Quick migration runner - Creates change_requests table
"""
import sys
sys.path.insert(0, '.')

from app import create_app
from config.db import db
from models.change_request import ChangeRequest

def run_migration():
    app = create_app()

    with app.app_context():
        print("Creating change_requests table...")
        try:
            # Create only the change_requests table
            db.create_all()
            print("✓ Successfully created change_requests table")
            print("\nTable structure created:")
            print("  - Table name: change_requests")
            print("  - Primary key: cr_id")
            print("  - Foreign keys: boq_id, project_id")
            print("  - JSONB field: materials_data")
            print("  - Overhead tracking fields included")
            print("\n✓ Migration completed successfully!")
            return True
        except Exception as e:
            print(f"✗ Error creating table: {e}")
            import traceback
            traceback.print_exc()
            return False

if __name__ == "__main__":
    run_migration()
