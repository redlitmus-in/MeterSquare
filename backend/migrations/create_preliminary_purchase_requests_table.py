"""
Migration script to create preliminary_purchase_requests table
Run this script to create the table for tracking preliminary purchase requests

Usage: python migrations/create_preliminary_purchase_requests_table.py
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

def create_preliminary_purchase_requests_table():
    """Create the preliminary_purchase_requests table"""

    sql = """
    -- Create preliminary_purchase_requests table for PM preliminary purchases
    CREATE TABLE IF NOT EXISTS preliminary_purchase_requests (
        ppr_id SERIAL PRIMARY KEY,
        boq_id INTEGER NOT NULL REFERENCES boq(boq_id),
        project_id INTEGER NOT NULL REFERENCES project(project_id),

        -- Requester information
        requested_by_user_id INTEGER NOT NULL,
        requested_by_name VARCHAR(255) NOT NULL,
        requested_by_role VARCHAR(100) NOT NULL,

        -- Request details
        request_type VARCHAR(50) DEFAULT 'PRELIMINARY_PURCHASE',
        justification TEXT,
        status VARCHAR(50) DEFAULT 'pending',

        -- Preliminary items data (JSONB array)
        preliminaries_data JSONB NOT NULL,

        -- Financial tracking
        total_amount FLOAT DEFAULT 0.0,

        -- Buyer Assignment
        assigned_to_buyer_user_id INTEGER,
        assigned_to_buyer_name VARCHAR(255),
        assigned_to_buyer_date TIMESTAMP,

        -- Buyer Purchase Completion
        purchase_completed_by_user_id INTEGER,
        purchase_completed_by_name VARCHAR(255),
        purchase_completion_date TIMESTAMP,
        purchase_notes TEXT,

        -- File uploads
        file_path TEXT,

        -- Vendor Selection
        selected_vendor_id INTEGER REFERENCES vendors(vendor_id),
        selected_vendor_name VARCHAR(255),
        vendor_selection_date TIMESTAMP,

        -- Rejection
        rejection_reason TEXT,
        rejected_by_user_id INTEGER,
        rejected_by_name VARCHAR(255),

        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE
    );

    -- Create indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_ppr_boq_id ON preliminary_purchase_requests(boq_id);
    CREATE INDEX IF NOT EXISTS idx_ppr_project_id ON preliminary_purchase_requests(project_id);
    CREATE INDEX IF NOT EXISTS idx_ppr_status ON preliminary_purchase_requests(status);
    CREATE INDEX IF NOT EXISTS idx_ppr_requested_by ON preliminary_purchase_requests(requested_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_ppr_buyer ON preliminary_purchase_requests(assigned_to_buyer_user_id);
    CREATE INDEX IF NOT EXISTS idx_ppr_created_at ON preliminary_purchase_requests(created_at);
    CREATE INDEX IF NOT EXISTS idx_ppr_is_deleted ON preliminary_purchase_requests(is_deleted);

    -- Composite indexes
    CREATE INDEX IF NOT EXISTS idx_ppr_boq_status ON preliminary_purchase_requests(boq_id, status);
    CREATE INDEX IF NOT EXISTS idx_ppr_project_status ON preliminary_purchase_requests(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_ppr_deleted_status ON preliminary_purchase_requests(is_deleted, status);

    -- Add comment to table
    COMMENT ON TABLE preliminary_purchase_requests IS 'Tracks preliminary purchase requests from PM with simplified workflow (PM → Buyer)';
    """

    app = create_app()
    with app.app_context():
        try:
            # Execute the SQL
            db.session.execute(db.text(sql))
            db.session.commit()
            print("✅ Successfully created preliminary_purchase_requests table with indexes")
            return True
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error creating table: {str(e)}")
            return False


if __name__ == "__main__":
    create_preliminary_purchase_requests_table()
