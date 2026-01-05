"""
Migration: Create Asset Delivery Note (ADN) and Return Delivery Note (ARDN) tables
Date: 2025-12-29
Description: Creates tables for proper DN/RDN flow for returnable assets,
             similar to material delivery notes flow.

Tables created:
- asset_delivery_notes (ADN)
- asset_delivery_note_items
- asset_return_delivery_notes (ARDN)
- asset_return_delivery_note_items
- asset_stock_in
- asset_stock_in_items
"""

import os
import sys

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import app


def run_migration():
    """Create the new asset DN/RDN tables"""

    with app.app_context():
        # SQL to create tables
        sql_statements = [
            # Asset Delivery Notes (ADN)
            """
            CREATE TABLE IF NOT EXISTS asset_delivery_notes (
                adn_id SERIAL PRIMARY KEY,
                adn_number VARCHAR(50) UNIQUE NOT NULL,
                project_id INTEGER NOT NULL,
                site_location VARCHAR(255),
                delivery_date TIMESTAMP NOT NULL,

                -- Personnel
                attention_to VARCHAR(255),
                attention_to_id INTEGER,
                delivery_from VARCHAR(255) DEFAULT 'M2 Store',
                prepared_by VARCHAR(255) NOT NULL,
                prepared_by_id INTEGER,
                checked_by VARCHAR(255),

                -- Transport
                vehicle_number VARCHAR(100),
                driver_name VARCHAR(255),
                driver_contact VARCHAR(50),

                -- Status
                status VARCHAR(20) DEFAULT 'DRAFT',
                notes TEXT,

                -- Delivery confirmation
                received_by VARCHAR(255),
                received_by_id INTEGER,
                received_at TIMESTAMP,
                receiver_notes TEXT,

                -- Audit
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                created_by VARCHAR(255) NOT NULL,
                last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified_by VARCHAR(255),
                issued_at TIMESTAMP,
                issued_by VARCHAR(255),
                dispatched_at TIMESTAMP,
                dispatched_by VARCHAR(255)
            );
            """,

            # Asset Delivery Note Items
            """
            CREATE TABLE IF NOT EXISTS asset_delivery_note_items (
                item_id SERIAL PRIMARY KEY,
                adn_id INTEGER NOT NULL REFERENCES asset_delivery_notes(adn_id) ON DELETE CASCADE,
                category_id INTEGER NOT NULL REFERENCES returnable_asset_categories(category_id),
                asset_item_id INTEGER REFERENCES returnable_asset_items(item_id),
                quantity INTEGER DEFAULT 1,
                condition_at_dispatch VARCHAR(20) DEFAULT 'good',
                notes TEXT,

                -- Return tracking
                quantity_returned INTEGER DEFAULT 0,
                status VARCHAR(20) DEFAULT 'dispatched'
            );
            """,

            # Asset Return Delivery Notes (ARDN)
            """
            CREATE TABLE IF NOT EXISTS asset_return_delivery_notes (
                ardn_id SERIAL PRIMARY KEY,
                ardn_number VARCHAR(50) UNIQUE NOT NULL,
                project_id INTEGER NOT NULL,
                site_location VARCHAR(255),
                return_date TIMESTAMP NOT NULL,

                -- Link to original ADN
                original_adn_id INTEGER REFERENCES asset_delivery_notes(adn_id),

                -- Personnel
                returned_by VARCHAR(255) NOT NULL,
                returned_by_id INTEGER,
                return_to VARCHAR(255) DEFAULT 'M2 Store',
                prepared_by VARCHAR(255) NOT NULL,
                prepared_by_id INTEGER,
                checked_by VARCHAR(255),

                -- Transport
                vehicle_number VARCHAR(100),
                driver_name VARCHAR(255),
                driver_contact VARCHAR(50),

                -- Status
                status VARCHAR(20) DEFAULT 'DRAFT',
                return_reason VARCHAR(100),
                notes TEXT,

                -- Store acceptance
                accepted_by VARCHAR(255),
                accepted_by_id INTEGER,
                accepted_at TIMESTAMP,
                acceptance_notes TEXT,

                -- Processing
                processed_by VARCHAR(255),
                processed_by_id INTEGER,
                processed_at TIMESTAMP,

                -- Audit
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                created_by VARCHAR(255) NOT NULL,
                last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified_by VARCHAR(255),
                issued_at TIMESTAMP,
                issued_by VARCHAR(255),
                dispatched_at TIMESTAMP,
                dispatched_by VARCHAR(255)
            );
            """,

            # Asset Return Delivery Note Items
            """
            CREATE TABLE IF NOT EXISTS asset_return_delivery_note_items (
                return_item_id SERIAL PRIMARY KEY,
                ardn_id INTEGER NOT NULL REFERENCES asset_return_delivery_notes(ardn_id) ON DELETE CASCADE,
                category_id INTEGER NOT NULL REFERENCES returnable_asset_categories(category_id),
                asset_item_id INTEGER REFERENCES returnable_asset_items(item_id),
                original_adn_item_id INTEGER REFERENCES asset_delivery_note_items(item_id),
                quantity INTEGER DEFAULT 1,

                -- SE reports
                reported_condition VARCHAR(20) NOT NULL,
                damage_description TEXT,
                photo_url TEXT,
                return_notes TEXT,

                -- PM verification
                verified_condition VARCHAR(20),
                pm_notes TEXT,
                action_taken VARCHAR(30),

                -- Acceptance
                quantity_accepted INTEGER,
                acceptance_status VARCHAR(20),

                -- Link to maintenance
                maintenance_id INTEGER REFERENCES asset_maintenance(maintenance_id)
            );
            """,

            # Asset Stock In
            """
            CREATE TABLE IF NOT EXISTS asset_stock_in (
                stock_in_id SERIAL PRIMARY KEY,
                stock_in_number VARCHAR(50) UNIQUE NOT NULL,
                category_id INTEGER NOT NULL REFERENCES returnable_asset_categories(category_id),
                quantity INTEGER NOT NULL,

                -- Purchase details
                purchase_date DATE,
                vendor_name VARCHAR(255),
                vendor_id INTEGER,
                invoice_number VARCHAR(100),
                unit_cost FLOAT DEFAULT 0.0,
                total_cost FLOAT DEFAULT 0.0,

                -- Condition
                condition VARCHAR(20) DEFAULT 'new',
                notes TEXT,

                -- Audit
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                created_by VARCHAR(255) NOT NULL,
                created_by_id INTEGER
            );
            """,

            # Asset Stock In Items (for individual tracking)
            """
            CREATE TABLE IF NOT EXISTS asset_stock_in_items (
                stock_in_item_id SERIAL PRIMARY KEY,
                stock_in_id INTEGER NOT NULL REFERENCES asset_stock_in(stock_in_id) ON DELETE CASCADE,
                asset_item_id INTEGER REFERENCES returnable_asset_items(item_id),
                serial_number VARCHAR(100),
                condition VARCHAR(20) DEFAULT 'new',
                notes TEXT
            );
            """,

            # Create indexes for performance
            """
            CREATE INDEX IF NOT EXISTS idx_adn_project_id ON asset_delivery_notes(project_id);
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_adn_status ON asset_delivery_notes(status);
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_ardn_project_id ON asset_return_delivery_notes(project_id);
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_ardn_status ON asset_return_delivery_notes(status);
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_adn_items_category ON asset_delivery_note_items(category_id);
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_ardn_items_category ON asset_return_delivery_note_items(category_id);
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_stock_in_category ON asset_stock_in(category_id);
            """
        ]

        # Execute each statement
        for i, sql in enumerate(sql_statements):
            try:
                db.session.execute(db.text(sql))
                print(f"✓ Statement {i + 1} executed successfully")
            except Exception as e:
                if "already exists" in str(e).lower():
                    print(f"⚠ Statement {i + 1} skipped (already exists)")
                else:
                    print(f"✗ Statement {i + 1} failed: {str(e)}")
                    raise e

        db.session.commit()
        print("\n✅ Migration completed successfully!")
        print("\nTables created:")
        print("  - asset_delivery_notes (ADN)")
        print("  - asset_delivery_note_items")
        print("  - asset_return_delivery_notes (ARDN)")
        print("  - asset_return_delivery_note_items")
        print("  - asset_stock_in")
        print("  - asset_stock_in_items")


def rollback_migration():
    """Rollback - drop the tables"""

    with app.app_context():
        sql_statements = [
            "DROP TABLE IF EXISTS asset_stock_in_items CASCADE;",
            "DROP TABLE IF EXISTS asset_stock_in CASCADE;",
            "DROP TABLE IF EXISTS asset_return_delivery_note_items CASCADE;",
            "DROP TABLE IF EXISTS asset_return_delivery_notes CASCADE;",
            "DROP TABLE IF EXISTS asset_delivery_note_items CASCADE;",
            "DROP TABLE IF EXISTS asset_delivery_notes CASCADE;",
        ]

        for sql in sql_statements:
            try:
                db.session.execute(db.text(sql))
                print(f"✓ Executed: {sql[:50]}...")
            except Exception as e:
                print(f"✗ Failed: {str(e)}")

        db.session.commit()
        print("\n✅ Rollback completed!")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Asset DN/RDN Migration')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration')
    args = parser.parse_args()

    if args.rollback:
        rollback_migration()
    else:
        run_migration()
