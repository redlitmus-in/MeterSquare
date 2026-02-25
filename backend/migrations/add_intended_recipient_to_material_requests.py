"""
Migration: Add intended_recipient_name to internal_inventory_material_requests table

This field stores the site engineer name selected by the buyer when completing a PO,
so the Production Manager knows who should receive the vendor delivery.

Run this migration:
    python migrations/add_intended_recipient_to_material_requests.py
"""

import os
import sys
from sqlalchemy import text

# Add parent directory to path to import db
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config.db import db
from app import create_app

def run_migration():
    """Add intended_recipient_name column to internal_inventory_material_requests"""
    app = create_app()

    with app.app_context():
        try:
            print("Starting migration: Adding intended_recipient_name to internal_inventory_material_requests...")

            # Check if column already exists
            check_query = text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'internal_inventory_material_requests'
                AND column_name = 'intended_recipient_name'
            """)

            result = db.session.execute(check_query).fetchone()

            if result:
                print("✓ Column 'intended_recipient_name' already exists. Skipping migration.")
                return

            # Add the new column
            alter_query = text("""
                ALTER TABLE internal_inventory_material_requests
                ADD COLUMN intended_recipient_name VARCHAR(255) NULL
            """)

            db.session.execute(alter_query)
            db.session.commit()

            print("✓ Successfully added intended_recipient_name column")
            print("✓ Migration completed successfully!")

        except Exception as e:
            db.session.rollback()
            print(f"✗ Migration failed: {str(e)}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

if __name__ == '__main__':
    run_migration()
