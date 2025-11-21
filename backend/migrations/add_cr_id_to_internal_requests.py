"""
Migration: Add cr_id column to internal_inventory_material_requests table
Run this script to add the cr_id column for tracking which CR each request belongs to.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from sqlalchemy import text

def migrate():
    with app.app_context():
        try:
            # Add cr_id column if it doesn't exist
            db.session.execute(text(
                'ALTER TABLE internal_inventory_material_requests ADD COLUMN IF NOT EXISTS cr_id INTEGER'
            ))
            db.session.commit()
            print("✓ Successfully added cr_id column to internal_inventory_material_requests table")
        except Exception as e:
            print(f"✗ Error adding cr_id column: {str(e)}")
            db.session.rollback()

if __name__ == '__main__':
    migrate()
