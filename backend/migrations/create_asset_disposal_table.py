"""
Migration: Create Asset Disposal Table
Creates a table to track returnable asset disposal requests requiring TD approval.
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db


def run_migration():
    """Create the asset_disposal table"""
    app = create_app()

    create_table_sql = """
    CREATE TABLE IF NOT EXISTS asset_disposal (
        disposal_id SERIAL PRIMARY KEY,

        -- Source reference
        return_item_id INTEGER REFERENCES asset_return_delivery_note_items(return_item_id),
        category_id INTEGER REFERENCES returnable_asset_categories(category_id),
        asset_item_id INTEGER REFERENCES returnable_asset_items(item_id),

        -- Disposal details
        quantity INTEGER NOT NULL DEFAULT 1,
        disposal_reason VARCHAR(100) NOT NULL,  -- damaged, unrepairable, obsolete, lost, expired, other
        justification TEXT,
        estimated_value DECIMAL(12, 2) DEFAULT 0,

        -- Image documentation
        image_url TEXT,
        image_filename VARCHAR(255),

        -- Request info
        requested_by VARCHAR(255) NOT NULL,
        requested_by_id INTEGER REFERENCES users(user_id),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Approval workflow
        status VARCHAR(30) DEFAULT 'pending_review',  -- pending_review, approved, rejected
        reviewed_by VARCHAR(255),
        reviewed_by_id INTEGER REFERENCES users(user_id),
        reviewed_at TIMESTAMP,
        review_notes TEXT,

        -- Source tracking
        source_type VARCHAR(30) DEFAULT 'repair',  -- repair, catalog, return
        source_ardn_id INTEGER REFERENCES asset_return_delivery_notes(ardn_id),
        project_id INTEGER REFERENCES project(project_id),

        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Index for fast lookups
    CREATE INDEX IF NOT EXISTS idx_asset_disposal_status ON asset_disposal(status);
    CREATE INDEX IF NOT EXISTS idx_asset_disposal_category ON asset_disposal(category_id);
    CREATE INDEX IF NOT EXISTS idx_asset_disposal_requested_at ON asset_disposal(requested_at DESC);
    """

    with app.app_context():
        try:
            # Execute the SQL
            db.session.execute(db.text(create_table_sql))
            db.session.commit()
            print("Successfully created asset_disposal table")

            # Verify the table exists
            result = db.session.execute(db.text("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'asset_disposal'
                ORDER BY ordinal_position
            """))

            columns = result.fetchall()
            print(f"\nTable has {len(columns)} columns:")
            for col in columns:
                print(f"  - {col[0]}: {col[1]}")

            return True

        except Exception as e:
            db.session.rollback()
            print(f"Error creating table: {e}")
            return False


if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
