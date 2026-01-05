"""
Migration script to create the material_delivery_notes and delivery_note_items tables
for tracking material dispatches to project sites.
"""

import sys
import os

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

app = create_app()


def create_delivery_notes_tables():
    """Create the material_delivery_notes and delivery_note_items tables"""

    with app.app_context():
        from sqlalchemy import inspect
        inspector = inspect(db.engine)

        existing_tables = inspector.get_table_names()

        # Create material_delivery_notes table
        if 'material_delivery_notes' not in existing_tables:
            create_delivery_notes_sql = """
            CREATE TABLE material_delivery_notes (
                delivery_note_id SERIAL PRIMARY KEY,
                delivery_note_number VARCHAR(50) UNIQUE NOT NULL,
                project_id INTEGER NOT NULL,
                delivery_date TIMESTAMP NOT NULL,
                attention_to VARCHAR(255),
                delivery_from VARCHAR(255) DEFAULT 'M2 Store',
                requested_by VARCHAR(255),
                request_date TIMESTAMP,
                vehicle_number VARCHAR(100),
                driver_name VARCHAR(255),
                driver_contact VARCHAR(50),
                prepared_by VARCHAR(255) NOT NULL,
                checked_by VARCHAR(255),
                status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'IN_TRANSIT', 'DELIVERED', 'PARTIAL', 'CANCELLED')),
                notes TEXT,
                received_by VARCHAR(255),
                received_at TIMESTAMP,
                receiver_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                created_by VARCHAR(255) NOT NULL,
                last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified_by VARCHAR(255),
                issued_at TIMESTAMP,
                issued_by VARCHAR(255)
            );

            -- Create indexes for material_delivery_notes
            CREATE INDEX idx_delivery_notes_project_id ON material_delivery_notes(project_id);
            CREATE INDEX idx_delivery_notes_status ON material_delivery_notes(status);
            CREATE INDEX idx_delivery_notes_delivery_date ON material_delivery_notes(delivery_date);
            CREATE INDEX idx_delivery_notes_created_at ON material_delivery_notes(created_at);
            CREATE INDEX idx_delivery_notes_number ON material_delivery_notes(delivery_note_number);
            """

            try:
                db.session.execute(db.text(create_delivery_notes_sql))
                db.session.commit()
                print("Successfully created 'material_delivery_notes' table with indexes!")
            except Exception as e:
                db.session.rollback()
                print(f"Error creating material_delivery_notes table: {e}")
                raise
        else:
            print("Table 'material_delivery_notes' already exists. Skipping creation.")

        # Create delivery_note_items table
        if 'delivery_note_items' not in existing_tables:
            create_items_sql = """
            CREATE TABLE delivery_note_items (
                item_id SERIAL PRIMARY KEY,
                delivery_note_id INTEGER NOT NULL REFERENCES material_delivery_notes(delivery_note_id) ON DELETE CASCADE,
                inventory_material_id INTEGER NOT NULL REFERENCES inventory_materials(inventory_material_id),
                internal_request_id INTEGER REFERENCES internal_inventory_material_requests(request_id),
                quantity FLOAT NOT NULL,
                unit_price FLOAT,
                notes TEXT,
                quantity_received FLOAT,
                inventory_transaction_id INTEGER
            );

            -- Create indexes for delivery_note_items
            CREATE INDEX idx_delivery_note_items_note_id ON delivery_note_items(delivery_note_id);
            CREATE INDEX idx_delivery_note_items_material_id ON delivery_note_items(inventory_material_id);
            CREATE INDEX idx_delivery_note_items_request_id ON delivery_note_items(internal_request_id);
            """

            try:
                db.session.execute(db.text(create_items_sql))
                db.session.commit()
                print("Successfully created 'delivery_note_items' table with indexes!")
            except Exception as e:
                db.session.rollback()
                print(f"Error creating delivery_note_items table: {e}")
                raise
        else:
            print("Table 'delivery_note_items' already exists. Skipping creation.")


def drop_delivery_notes_tables():
    """Drop the delivery notes tables (for rollback)"""

    with app.app_context():
        # Drop in reverse order due to foreign key constraints
        drop_items_sql = "DROP TABLE IF EXISTS delivery_note_items CASCADE;"
        drop_notes_sql = "DROP TABLE IF EXISTS material_delivery_notes CASCADE;"

        try:
            db.session.execute(db.text(drop_items_sql))
            db.session.execute(db.text(drop_notes_sql))
            db.session.commit()
            print("Successfully dropped delivery notes tables!")
        except Exception as e:
            db.session.rollback()
            print(f"Error dropping tables: {e}")
            raise


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Delivery Notes Tables Migration')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration (drop tables)')
    args = parser.parse_args()

    if args.rollback:
        drop_delivery_notes_tables()
    else:
        create_delivery_notes_tables()
