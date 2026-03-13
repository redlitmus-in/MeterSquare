"""
Migration script to add unit_price column to raw_materials_catalog table

This adds a unit_price field to store the current market price per unit for each material.

Run this migration with:
    python migrations/add_unit_price_to_raw_materials.py

To rollback:
    python migrations/add_unit_price_to_raw_materials.py --rollback
"""

import sys
import os

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

app = create_app()


def add_unit_price_column():
    """Add unit_price column to raw_materials_catalog table"""

    with app.app_context():
        add_column_sql = """
        ALTER TABLE raw_materials_catalog
        ADD COLUMN IF NOT EXISTS unit_price NUMERIC(15, 2) DEFAULT 0.00;

        COMMENT ON COLUMN raw_materials_catalog.unit_price IS 'Current market price per unit';
        """

        try:
            db.session.execute(db.text(add_column_sql))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            import traceback
            traceback.print_exc()
            raise


def remove_unit_price_column():
    """Remove unit_price column from raw_materials_catalog table (for rollback)"""

    with app.app_context():
        drop_column_sql = """
        ALTER TABLE raw_materials_catalog
        DROP COLUMN IF EXISTS unit_price;
        """

        try:
            db.session.execute(db.text(drop_column_sql))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    import argparse


    parser = argparse.ArgumentParser(description='Add unit_price column migration')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration (remove column)')
    args = parser.parse_args()

    if args.rollback:
        remove_unit_price_column()
    else:
        add_unit_price_column()

