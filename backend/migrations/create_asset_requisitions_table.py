"""
Migration: Create Asset Requisitions Table
Creates a table to track asset requisition requests from Site Engineers
with multi-stage approval: SE → PM → Production Manager → Dispatch

Workflow:
1. SE creates requisition (status: pending_pm)
2. PM approves (status: pending_prod_mgr)
3. Production Manager approves (status: prod_mgr_approved)
4. Production Manager dispatches (status: dispatched)
5. SE confirms receipt (status: completed)
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db


def run_migration():
    """Create the asset_requisitions table"""
    app = create_app()

    create_table_sql = """
    CREATE TABLE IF NOT EXISTS asset_requisitions (
        requisition_id SERIAL PRIMARY KEY,
        requisition_code VARCHAR(50) UNIQUE NOT NULL,  -- ARQ-2025-0001

        -- Project & Asset References
        project_id INTEGER NOT NULL REFERENCES project(project_id),
        category_id INTEGER NOT NULL REFERENCES returnable_asset_categories(category_id),
        asset_item_id INTEGER REFERENCES returnable_asset_items(item_id),  -- For individual tracking

        -- Request Details
        quantity INTEGER NOT NULL DEFAULT 1,
        required_date DATE NOT NULL,
        urgency VARCHAR(20) DEFAULT 'normal',  -- urgent, high, normal, low
        purpose TEXT NOT NULL,
        site_location VARCHAR(255),

        -- Status Tracking (Multi-stage workflow)
        status VARCHAR(30) NOT NULL DEFAULT 'pending_pm',
        -- Values: pending_pm, pm_approved, pm_rejected, pending_prod_mgr,
        --         prod_mgr_approved, prod_mgr_rejected, dispatched, completed, cancelled
        approval_required_from VARCHAR(50) DEFAULT 'pm',  -- 'pm' or 'production_manager' or NULL

        -- Requester Info (Site Engineer)
        requested_by_user_id INTEGER NOT NULL REFERENCES users(user_id),
        requested_by_name VARCHAR(255) NOT NULL,
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- PM Approval Stage
        pm_reviewed_by_user_id INTEGER REFERENCES users(user_id),
        pm_reviewed_by_name VARCHAR(255),
        pm_reviewed_at TIMESTAMP,
        pm_notes TEXT,
        pm_decision VARCHAR(20),  -- approved, rejected
        pm_rejection_reason TEXT,

        -- Production Manager Approval Stage
        prod_mgr_reviewed_by_user_id INTEGER REFERENCES users(user_id),
        prod_mgr_reviewed_by_name VARCHAR(255),
        prod_mgr_reviewed_at TIMESTAMP,
        prod_mgr_notes TEXT,
        prod_mgr_decision VARCHAR(20),  -- approved, rejected
        prod_mgr_rejection_reason TEXT,

        -- Dispatch Details
        dispatched_by_user_id INTEGER,
        dispatched_by_name VARCHAR(255),
        dispatched_at TIMESTAMP,
        dispatch_notes TEXT,
        adn_id INTEGER REFERENCES asset_delivery_notes(adn_id),

        -- Receipt Confirmation
        received_by_user_id INTEGER,
        received_by_name VARCHAR(255),
        received_at TIMESTAMP,
        receipt_notes TEXT,

        -- Standard Audit Fields
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        created_by VARCHAR(255) NOT NULL,
        last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_modified_by VARCHAR(255)
    );

    -- Primary indexes for filtering and lookups
    CREATE INDEX IF NOT EXISTS idx_arq_status ON asset_requisitions(status);
    CREATE INDEX IF NOT EXISTS idx_arq_project_id ON asset_requisitions(project_id);
    CREATE INDEX IF NOT EXISTS idx_arq_category_id ON asset_requisitions(category_id);
    CREATE INDEX IF NOT EXISTS idx_arq_requester ON asset_requisitions(requested_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_arq_required_date ON asset_requisitions(required_date);
    CREATE INDEX IF NOT EXISTS idx_arq_approval_from ON asset_requisitions(approval_required_from);
    CREATE INDEX IF NOT EXISTS idx_arq_is_deleted ON asset_requisitions(is_deleted);

    -- Composite indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_arq_project_status ON asset_requisitions(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_arq_requester_status ON asset_requisitions(requested_by_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_arq_approval_deleted ON asset_requisitions(approval_required_from, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_arq_created_at_desc ON asset_requisitions(created_at DESC);
    """

    with app.app_context():
        try:
            # Execute the SQL
            db.session.execute(db.text(create_table_sql))
            db.session.commit()
            print("Successfully created asset_requisitions table")

            # Verify the table exists
            result = db.session.execute(db.text("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'asset_requisitions'
                ORDER BY ordinal_position
            """))

            columns = result.fetchall()
            print(f"\nTable has {len(columns)} columns:")
            for col in columns:
                print(f"  - {col[0]}: {col[1]}")

            # Verify indexes
            result = db.session.execute(db.text("""
                SELECT indexname
                FROM pg_indexes
                WHERE tablename = 'asset_requisitions'
            """))

            indexes = result.fetchall()
            print(f"\nCreated {len(indexes)} indexes:")
            for idx in indexes:
                print(f"  - {idx[0]}")

            return True

        except Exception as e:
            db.session.rollback()
            print(f"Error creating table: {e}")
            return False


if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
