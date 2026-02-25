"""
Migration: Add material-level vendor selection support
Allows buyer to select different vendors for different materials in a purchase order
"""

from config.db import db
from sqlalchemy import text

def upgrade():
    """
    Add material_vendor_selections JSONB field to change_requests table

    Structure:
    {
        "material_name": {
            "vendor_id": 123,
            "vendor_name": "ABC Suppliers",
            "selected_by_user_id": 456,
            "selected_by_name": "John Doe",
            "selection_date": "2025-01-15T10:30:00",
            "selection_status": "pending_td_approval", // or "approved", "rejected"
            "approved_by_td_id": 789,
            "approved_by_td_name": "Jane Smith",
            "approval_date": "2025-01-15T12:00:00",
            "rejection_reason": null,
            "unit_price": 50.00,  // Price quoted by vendor for this material
            "total_price": 500.00  // quantity * unit_price
        }
    }
    """
    try:
        # Add JSONB column for per-material vendor selections
        db.session.execute(text("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS material_vendor_selections JSONB DEFAULT '{}'::jsonb;
        """))

        # Add column to track if using per-material vendor selection
        db.session.execute(text("""
            ALTER TABLE change_requests
            ADD COLUMN IF NOT EXISTS use_per_material_vendors BOOLEAN DEFAULT FALSE;
        """))

        # Add index for faster queries on material vendor selections
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_material_vendor_selections
            ON change_requests USING GIN (material_vendor_selections);
        """))

        db.session.commit()
        print("✓ Successfully added material_vendor_selections support to change_requests")

    except Exception as e:
        db.session.rollback()
        print(f"✗ Error in migration: {str(e)}")
        raise

def downgrade():
    """Rollback the migration"""
    try:
        db.session.execute(text("""
            DROP INDEX IF EXISTS idx_material_vendor_selections;
        """))

        db.session.execute(text("""
            ALTER TABLE change_requests
            DROP COLUMN IF EXISTS use_per_material_vendors;
        """))

        db.session.execute(text("""
            ALTER TABLE change_requests
            DROP COLUMN IF EXISTS material_vendor_selections;
        """))

        db.session.commit()
        print("✓ Successfully rolled back material_vendor_selections migration")

    except Exception as e:
        db.session.rollback()
        print(f"✗ Error in rollback: {str(e)}")
        raise

if __name__ == "__main__":
    print("Running migration: add_material_vendor_selections")
    upgrade()
    print("Migration completed successfully!")
