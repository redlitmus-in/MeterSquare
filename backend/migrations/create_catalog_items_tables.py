"""
Migration script to create catalog_items, catalog_sub_items, and catalog_sub_item_materials tables.

These tables enable the buyer to create hierarchical catalog entries (Items -> Sub-Items -> Materials)
that estimators can import directly into BOQs.

Run this migration with:
    python migrations/create_catalog_items_tables.py

To rollback:
    python migrations/create_catalog_items_tables.py --rollback
"""

import sys
import os

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

app = create_app()


def create_catalog_items_tables():
    """Create the catalog_items, catalog_sub_items, and catalog_sub_item_materials tables"""

    with app.app_context():
        from sqlalchemy import inspect
        inspector = inspect(db.engine)

        existing_tables = inspector.get_table_names()

        # ============================================================
        # TABLE 1: catalog_items
        # ============================================================
        if 'catalog_items' not in existing_tables:
            create_catalog_items_sql = """
            CREATE TABLE catalog_items (
                id SERIAL PRIMARY KEY,
                item_name VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                created_by INTEGER NOT NULL REFERENCES users(user_id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE NOT NULL
            );

            CREATE INDEX idx_catalog_item_name ON catalog_items(item_name);
            CREATE INDEX idx_catalog_item_category ON catalog_items(category);
            CREATE INDEX idx_catalog_item_active ON catalog_items(is_active);
            CREATE INDEX idx_catalog_item_created_by ON catalog_items(created_by);
            CREATE INDEX idx_catalog_item_active_name ON catalog_items(is_active, item_name);

            COMMENT ON TABLE catalog_items IS 'Buyer-managed catalog of work items (e.g., Foundation, Roofing) for BOQ templates';
            """

            try:
                db.session.execute(db.text(create_catalog_items_sql))
                db.session.commit()
                print("[SUCCESS] Created 'catalog_items' table with indexes")
            except Exception as e:
                db.session.rollback()
                print(f"[ERROR] Error creating catalog_items table: {e}")
                import traceback
                traceback.print_exc()
                raise
        else:
            print("[WARNING] Table 'catalog_items' already exists. Skipping.")

        # ============================================================
        # TABLE 2: catalog_sub_items
        # ============================================================
        if 'catalog_sub_items' not in existing_tables:
            create_catalog_sub_items_sql = """
            CREATE TABLE catalog_sub_items (
                id SERIAL PRIMARY KEY,
                catalog_item_id INTEGER NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
                sub_item_name VARCHAR(255) NOT NULL,
                description TEXT,
                size VARCHAR(255),
                specification VARCHAR(255),
                brand VARCHAR(255),
                unit VARCHAR(50),
                created_by INTEGER NOT NULL REFERENCES users(user_id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE NOT NULL
            );

            CREATE INDEX idx_catalog_sub_item_name ON catalog_sub_items(sub_item_name);
            CREATE INDEX idx_catalog_sub_item_parent ON catalog_sub_items(catalog_item_id);
            CREATE INDEX idx_catalog_sub_item_active ON catalog_sub_items(is_active);
            CREATE INDEX idx_catalog_sub_item_parent_active ON catalog_sub_items(catalog_item_id, is_active);

            COMMENT ON TABLE catalog_sub_items IS 'Buyer-managed sub-items under catalog items (e.g., Concrete Footings under Foundation)';
            """

            try:
                db.session.execute(db.text(create_catalog_sub_items_sql))
                db.session.commit()
                print("[SUCCESS] Created 'catalog_sub_items' table with indexes")
            except Exception as e:
                db.session.rollback()
                print(f"[ERROR] Error creating catalog_sub_items table: {e}")
                import traceback
                traceback.print_exc()
                raise
        else:
            print("[WARNING] Table 'catalog_sub_items' already exists. Skipping.")

        # ============================================================
        # TABLE 3: catalog_sub_item_materials
        # ============================================================
        if 'catalog_sub_item_materials' not in existing_tables:
            create_link_table_sql = """
            CREATE TABLE catalog_sub_item_materials (
                id SERIAL PRIMARY KEY,
                catalog_sub_item_id INTEGER NOT NULL REFERENCES catalog_sub_items(id) ON DELETE CASCADE,
                raw_material_id INTEGER NOT NULL REFERENCES raw_materials_catalog(id) ON DELETE CASCADE,
                quantity FLOAT DEFAULT 1.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                is_active BOOLEAN DEFAULT TRUE NOT NULL
            );

            CREATE INDEX idx_csim_sub_item ON catalog_sub_item_materials(catalog_sub_item_id);
            CREATE INDEX idx_csim_material ON catalog_sub_item_materials(raw_material_id);
            CREATE UNIQUE INDEX idx_csim_unique_link ON catalog_sub_item_materials(catalog_sub_item_id, raw_material_id) WHERE is_active = TRUE;

            COMMENT ON TABLE catalog_sub_item_materials IS 'Links raw materials to catalog sub-items with default quantities';
            """

            try:
                db.session.execute(db.text(create_link_table_sql))
                db.session.commit()
                print("[SUCCESS] Created 'catalog_sub_item_materials' table with indexes")
            except Exception as e:
                db.session.rollback()
                print(f"[ERROR] Error creating catalog_sub_item_materials table: {e}")
                import traceback
                traceback.print_exc()
                raise
        else:
            print("[WARNING] Table 'catalog_sub_item_materials' already exists. Skipping.")

        print()
        print("[DONE] All catalog tables created successfully!")


def drop_catalog_items_tables():
    """Drop all catalog tables (for rollback)"""

    with app.app_context():
        drop_sql = """
        DROP TABLE IF EXISTS catalog_sub_item_materials CASCADE;
        DROP TABLE IF EXISTS catalog_sub_items CASCADE;
        DROP TABLE IF EXISTS catalog_items CASCADE;
        """

        try:
            db.session.execute(db.text(drop_sql))
            db.session.commit()
            print("[SUCCESS] Dropped all catalog tables (catalog_items, catalog_sub_items, catalog_sub_item_materials)")
        except Exception as e:
            db.session.rollback()
            print(f"[ERROR] Error dropping catalog tables: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    import argparse

    print("=" * 80)
    print("CATALOG ITEMS TABLES MIGRATION")
    print("=" * 80)
    print()

    parser = argparse.ArgumentParser(description='Catalog Items Tables Migration')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration (drop tables)')
    args = parser.parse_args()

    if args.rollback:
        print("ROLLBACK MODE: Dropping catalog tables...")
        print()
        drop_catalog_items_tables()
    else:
        print("Creating catalog tables...")
        print()
        create_catalog_items_tables()

    print()
    print("=" * 80)
    print("MIGRATION COMPLETED")
    print("=" * 80)
