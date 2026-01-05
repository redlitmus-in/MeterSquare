"""
Migration script to create the material_returns table for tracking
reusable product returns with condition and disposal workflow.
"""

import sys
import os

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app
app = create_app()

def create_material_returns_table():
    """Create the material_returns table"""

    with app.app_context():
        # Check if table already exists
        from sqlalchemy import inspect
        inspector = inspect(db.engine)

        if 'material_returns' in inspector.get_table_names():
            print("Table 'material_returns' already exists. Skipping creation.")
            return

        # Create the table using raw SQL
        create_table_sql = """
        CREATE TABLE material_returns (
            return_id SERIAL PRIMARY KEY,
            inventory_material_id INTEGER NOT NULL REFERENCES inventory_materials(inventory_material_id),
            project_id INTEGER NOT NULL,
            quantity FLOAT NOT NULL,
            condition VARCHAR(20) NOT NULL CHECK (condition IN ('Good', 'Damaged', 'Defective')),
            add_to_stock BOOLEAN DEFAULT FALSE,
            return_reason TEXT,
            reference_number VARCHAR(100),
            notes TEXT,
            disposal_status VARCHAR(30) CHECK (disposal_status IN ('pending_review', 'approved_disposal', 'disposed', 'repaired', NULL)),
            disposal_reviewed_by VARCHAR(255),
            disposal_reviewed_at TIMESTAMP,
            disposal_notes TEXT,
            disposal_value FLOAT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            created_by VARCHAR(255) NOT NULL,
            inventory_transaction_id INTEGER
        );

        -- Create indexes for common queries
        CREATE INDEX idx_material_returns_material_id ON material_returns(inventory_material_id);
        CREATE INDEX idx_material_returns_project_id ON material_returns(project_id);
        CREATE INDEX idx_material_returns_condition ON material_returns(condition);
        CREATE INDEX idx_material_returns_disposal_status ON material_returns(disposal_status);
        CREATE INDEX idx_material_returns_created_at ON material_returns(created_at);
        """

        try:
            db.session.execute(db.text(create_table_sql))
            db.session.commit()
            print("Successfully created 'material_returns' table with indexes!")
        except Exception as e:
            db.session.rollback()
            print(f"Error creating table: {e}")
            raise


def drop_material_returns_table():
    """Drop the material_returns table (for rollback)"""

    with app.app_context():
        drop_sql = "DROP TABLE IF EXISTS material_returns CASCADE;"

        try:
            db.session.execute(db.text(drop_sql))
            db.session.commit()
            print("Successfully dropped 'material_returns' table!")
        except Exception as e:
            db.session.rollback()
            print(f"Error dropping table: {e}")
            raise


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Material Returns Table Migration')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration (drop table)')
    args = parser.parse_args()

    if args.rollback:
        drop_material_returns_table()
    else:
        create_material_returns_table()
