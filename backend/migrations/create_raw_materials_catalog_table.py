"""
Migration script to create raw_materials_catalog table

This table stores the master catalog of raw materials maintained by Procurement/Buyer team.
Estimators must select materials from this catalog when creating BOQs to ensure consistency.

Run this migration with:
    python migrations/create_raw_materials_catalog_table.py

To rollback:
    python migrations/create_raw_materials_catalog_table.py --rollback
"""

import sys
import os

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

app = create_app()


def create_raw_materials_catalog_table():
    """Create the raw_materials_catalog table"""

    with app.app_context():
        from sqlalchemy import inspect
        inspector = inspect(db.engine)

        existing_tables = inspector.get_table_names()

        # Create raw_materials_catalog table
        if 'raw_materials_catalog' not in existing_tables:
            create_table_sql = """
            CREATE TABLE raw_materials_catalog (
                id SERIAL PRIMARY KEY,
                material_name VARCHAR(255) NOT NULL,
                description TEXT,
                brand VARCHAR(255),
                size VARCHAR(100),
                specification TEXT,
                unit VARCHAR(50),
                category VARCHAR(100),
                created_by INTEGER NOT NULL REFERENCES users(user_id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE NOT NULL
            );

            -- Create indexes for raw_materials_catalog
            CREATE INDEX idx_raw_material_name ON raw_materials_catalog(material_name);
            CREATE INDEX idx_raw_material_brand ON raw_materials_catalog(brand);
            CREATE INDEX idx_raw_material_category ON raw_materials_catalog(category);
            CREATE INDEX idx_raw_material_created_by ON raw_materials_catalog(created_by);
            CREATE INDEX idx_raw_material_is_active ON raw_materials_catalog(is_active);

            -- Composite indexes for common query patterns
            CREATE INDEX idx_raw_material_active_name ON raw_materials_catalog(is_active, material_name);
            CREATE INDEX idx_raw_material_category_active ON raw_materials_catalog(category, is_active);

            -- Add comment to table
            COMMENT ON TABLE raw_materials_catalog IS 'Master catalog of raw materials maintained by Procurement/Buyer team for BOQ creation';
            """

            try:
                db.session.execute(db.text(create_table_sql))
                db.session.commit()
                print("[SUCCESS] Successfully created 'raw_materials_catalog' table with indexes!")
                print("[SUCCESS] Table includes: id, material_name, description, brand, size, specification, unit, category")
                print("[SUCCESS] Audit fields: created_by, created_at, updated_at, is_active")
                print("[SUCCESS] Indexes created for optimal performance")
            except Exception as e:
                db.session.rollback()
                print(f"[ERROR] Error creating raw_materials_catalog table: {e}")
                import traceback
                traceback.print_exc()
                raise
        else:
            print("[WARNING] Table 'raw_materials_catalog' already exists. Skipping creation.")


def drop_raw_materials_catalog_table():
    """Drop the raw_materials_catalog table (for rollback)"""

    with app.app_context():
        drop_table_sql = "DROP TABLE IF EXISTS raw_materials_catalog CASCADE;"

        try:
            db.session.execute(db.text(drop_table_sql))
            db.session.commit()
            print("[SUCCESS] Successfully dropped 'raw_materials_catalog' table!")
        except Exception as e:
            db.session.rollback()
            print(f"[ERROR] Error dropping raw_materials_catalog table: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    import argparse

    print("="*80)
    print("RAW MATERIALS CATALOG TABLE MIGRATION")
    print("="*80)
    print()

    parser = argparse.ArgumentParser(description='Raw Materials Catalog Table Migration')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration (drop table)')
    args = parser.parse_args()

    if args.rollback:
        print("ROLLBACK MODE: Dropping raw_materials_catalog table...")
        print()
        drop_raw_materials_catalog_table()
    else:
        print("Creating raw_materials_catalog table...")
        print()
        create_raw_materials_catalog_table()

    print()
    print("="*80)
    print("MIGRATION COMPLETED")
    print("="*80)
