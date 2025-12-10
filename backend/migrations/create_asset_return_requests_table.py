"""
Migration: Create asset_return_requests table
Purpose: Enable Site Engineers to request asset returns with condition assessment
         Production Manager reviews and processes return with quality check
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db


def create_asset_return_requests_table():
    """Create the asset_return_requests table"""
    app = create_app()

    with app.app_context():
        # Check if table already exists
        result = db.session.execute(db.text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'asset_return_requests'
            );
        """))
        exists = result.scalar()

        if exists:
            print("Table 'asset_return_requests' already exists. Skipping creation.")
            return True

        # Create the table
        create_table_sql = """
        CREATE TABLE asset_return_requests (
            request_id SERIAL PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES returnable_asset_categories(category_id),
            item_id INTEGER REFERENCES returnable_asset_items(item_id),
            project_id INTEGER NOT NULL,
            quantity INTEGER DEFAULT 1,

            -- SE provides condition assessment
            se_condition_assessment VARCHAR(20) DEFAULT 'good',
            se_notes TEXT,
            se_damage_description TEXT,

            -- Request status: pending, approved, rejected, completed
            status VARCHAR(30) DEFAULT 'pending',

            -- PM reviews and confirms
            pm_condition_assessment VARCHAR(20),
            pm_notes TEXT,
            pm_action VARCHAR(30),  -- return_to_stock, send_to_maintenance, write_off

            -- Tracking
            tracking_code VARCHAR(50),
            requested_by VARCHAR(255),
            requested_by_id INTEGER,
            requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_by VARCHAR(255),
            processed_by_id INTEGER,
            processed_at TIMESTAMP,

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            created_by VARCHAR(255)
        );
        """

        try:
            db.session.execute(db.text(create_table_sql))
            db.session.commit()
            print("Created table 'asset_return_requests' successfully!")

            # Create indexes for better query performance
            indexes = [
                "CREATE INDEX idx_arr_category_id ON asset_return_requests(category_id);",
                "CREATE INDEX idx_arr_project_id ON asset_return_requests(project_id);",
                "CREATE INDEX idx_arr_status ON asset_return_requests(status);",
                "CREATE INDEX idx_arr_tracking_code ON asset_return_requests(tracking_code);",
                "CREATE INDEX idx_arr_requested_by_id ON asset_return_requests(requested_by_id);"
            ]

            for idx_sql in indexes:
                try:
                    db.session.execute(db.text(idx_sql))
                except Exception as e:
                    print(f"Index creation warning: {e}")

            db.session.commit()
            print("Created indexes successfully!")
            return True

        except Exception as e:
            db.session.rollback()
            print(f"Error creating table: {e}")
            return False


if __name__ == "__main__":
    print("=" * 70)
    print("Migration: Create asset_return_requests table")
    print("=" * 70)
    print()

    success = create_asset_return_requests_table()

    if success:
        print()
        print("=" * 70)
        print("Migration Complete!")
        print("=" * 70)
        print()
        print("New table: asset_return_requests")
        print()
        print("Flow:")
        print("1. SE requests return with condition assessment")
        print("2. PM receives notification of pending return request")
        print("3. PM reviews, does quality check, and processes return")
        print("4. If damaged: sends to maintenance queue")
        print("5. Tracking code generated for history")
    else:
        print()
        print("Migration Failed! Please check the error above.")
        sys.exit(1)
