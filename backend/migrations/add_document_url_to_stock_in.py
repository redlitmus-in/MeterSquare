"""
Migration: Add document_url column to asset_stock_in table
For uploading DN/invoice/receipt documents to stock in records
"""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db


def run_migration():
    """Add document_url column to asset_stock_in table"""
    app = create_app()

    with app.app_context():
        try:
            # Check if column already exists
            result = db.session.execute(db.text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'asset_stock_in'
                AND column_name = 'document_url'
            """))

            if result.fetchone():
                print("Column 'document_url' already exists in asset_stock_in table")
                return True

            # Add the column
            db.session.execute(db.text("""
                ALTER TABLE asset_stock_in
                ADD COLUMN document_url TEXT
            """))

            db.session.commit()
            print("Successfully added 'document_url' column to asset_stock_in table")
            return True

        except Exception as e:
            db.session.rollback()
            print(f"Migration failed: {e}")
            return False


if __name__ == '__main__':
    print("=" * 70)
    print("Migration: Add document_url to asset_stock_in table")
    print("=" * 70)
    print()

    success = run_migration()

    if success:
        print()
        print("=" * 70)
        print("Migration Complete!")
        print("=" * 70)
    else:
        print()
        print("Migration Failed! Please check the error above.")
        sys.exit(1)
