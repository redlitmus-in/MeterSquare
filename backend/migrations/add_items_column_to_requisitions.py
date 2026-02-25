"""
Migration: Add items JSONB column to asset_requisitions table
Supports multi-item requisitions in a single request
Also makes category_id and quantity nullable for multi-item support
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db


def run_migration():
    """Add items column to asset_requisitions table"""
    app = create_app()

    alter_sql = """
    -- Add items JSONB column for multi-item support
    -- Format: [{"category_id": 1, "category_code": "CHA", "category_name": "Chair", "quantity": 5}, ...]
    ALTER TABLE asset_requisitions
    ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;

    -- Make category_id nullable for multi-item requisitions
    ALTER TABLE asset_requisitions
    ALTER COLUMN category_id DROP NOT NULL;

    -- Make quantity nullable for multi-item requisitions
    ALTER TABLE asset_requisitions
    ALTER COLUMN quantity DROP NOT NULL;

    -- Add comment to explain the column
    COMMENT ON COLUMN asset_requisitions.items IS 'JSONB array of items for multi-item requisitions. Format: [{category_id, category_code, category_name, quantity}, ...]';
    """

    with app.app_context():
        try:
            # Execute the SQL
            db.session.execute(db.text(alter_sql))
            db.session.commit()
            print("Successfully added items column to asset_requisitions table")
            print("Made category_id and quantity nullable for multi-item support")

            # Verify the column exists
            result = db.session.execute(db.text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'asset_requisitions'
                AND column_name IN ('items', 'category_id', 'quantity')
                ORDER BY column_name
            """))

            columns = result.fetchall()
            print("\nVerified columns:")
            for col in columns:
                print(f"  - {col[0]}: {col[1]} (nullable: {col[2]})")

            return True

        except Exception as e:
            db.session.rollback()
            print(f"Error updating table: {e}")
            return False


if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
