"""
Migration: Create asset_stock_in_items table
For tracking individual items (serial numbers) in stock in records
"""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db


def run_migration():
    """Create asset_stock_in_items table"""
    app = create_app()

    with app.app_context():
        try:
            # Check if table already exists
            result = db.session.execute(db.text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'asset_stock_in_items'
                )
            """))

            if result.fetchone()[0]:
                return True

            # Create the table
            db.session.execute(db.text("""
                CREATE TABLE asset_stock_in_items (
                    stock_in_item_id SERIAL PRIMARY KEY,
                    stock_in_id INTEGER NOT NULL REFERENCES asset_stock_in(stock_in_id) ON DELETE CASCADE,
                    asset_item_id INTEGER REFERENCES returnable_asset_items(item_id),
                    serial_number VARCHAR(100),
                    condition VARCHAR(20) DEFAULT 'new',
                    notes TEXT
                )
            """))

            # Create index for faster lookups
            db.session.execute(db.text("""
                CREATE INDEX idx_stock_in_items_stock_in_id ON asset_stock_in_items(stock_in_id)
            """))

            db.session.commit()
            return True

        except Exception as e:
            db.session.rollback()
            return False


if __name__ == '__main__':

    success = run_migration()

    if success:
        pass
    else:
        sys.exit(1)
