"""
Migration: Add change request tracking to MaterialPurchaseTracking
This allows tracking which materials came from approved change requests
"""
from config.db import db
from sqlalchemy import text
from app import create_app

def upgrade():
    """Add change request tracking columns to material_purchase_tracking"""
    app = create_app()

    with app.app_context():
        with db.engine.connect() as conn:
            # Add is_from_change_request column
            conn.execute(text("""
                ALTER TABLE material_purchase_tracking
                ADD COLUMN IF NOT EXISTS is_from_change_request BOOLEAN DEFAULT FALSE;
            """))

            # Add change_request_id column with foreign key
            conn.execute(text("""
                ALTER TABLE material_purchase_tracking
                ADD COLUMN IF NOT EXISTS change_request_id INTEGER;
            """))

            # Add foreign key constraint
            conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints
                        WHERE constraint_name = 'fk_material_purchase_change_request'
                    ) THEN
                        ALTER TABLE material_purchase_tracking
                        ADD CONSTRAINT fk_material_purchase_change_request
                        FOREIGN KEY (change_request_id)
                        REFERENCES change_requests(cr_id);
                    END IF;
                END $$;
            """))

            # Fix existing NULL master_item_id values for change request materials
            # Extract item_id from change_requests table and update material_purchase_tracking
            conn.execute(text("""
                UPDATE material_purchase_tracking mpt
                SET master_item_id = CASE
                    -- If item_id is already an integer, use it directly
                    WHEN cr.item_id ~ '^[0-9]+$' THEN cr.item_id::INTEGER
                    -- If item_id is like 'item_234' or 'item_234_1', extract the first number
                    WHEN cr.item_id ~ '^item_[0-9]+' THEN
                        (regexp_match(cr.item_id, 'item_([0-9]+)'))[1]::INTEGER
                    ELSE NULL
                END
                FROM change_requests cr
                WHERE mpt.change_request_id = cr.cr_id
                  AND mpt.is_from_change_request = TRUE
                  AND mpt.master_item_id IS NULL
                  AND cr.item_id IS NOT NULL;
            """))

            conn.commit()

        print("✅ Migration completed: Added change request tracking columns to material_purchase_tracking")
        print("\nColumns added:")
        print("  - is_from_change_request (BOOLEAN, default: FALSE)")
        print("  - change_request_id (INTEGER, FK to change_requests.cr_id)")
        print("\nForeign key constraint created:")
        print("  - fk_material_purchase_change_request")
        print("\nData fix applied:")
        print("  - Updated master_item_id for existing change request materials")

def downgrade():
    """Remove change request tracking columns"""
    app = create_app()

    with app.app_context():
        with db.engine.connect() as conn:
            # Drop foreign key constraint
            conn.execute(text("""
                ALTER TABLE material_purchase_tracking
                DROP CONSTRAINT IF EXISTS fk_material_purchase_change_request;
            """))

            # Drop columns
            conn.execute(text("""
                ALTER TABLE material_purchase_tracking
                DROP COLUMN IF EXISTS change_request_id;
            """))

            conn.execute(text("""
                ALTER TABLE material_purchase_tracking
                DROP COLUMN IF EXISTS is_from_change_request;
            """))

            conn.commit()

        print("✅ Migration rolled back: Removed change request tracking columns")

if __name__ == "__main__":
    print("=" * 70)
    print("MIGRATION: Add Change Request Tracking to Material Purchase Tracking")
    print("=" * 70)
    print("\nThis migration adds the following columns:")
    print("  1. is_from_change_request - Flags materials from change requests")
    print("  2. change_request_id - Links to the originating change request")
    print("\nRunning migration...\n")

    try:
        upgrade()
        print("\n" + "=" * 70)
        print("✅ MIGRATION SUCCESSFUL")
        print("=" * 70)
    except Exception as e:
        print("\n" + "=" * 70)
        print("❌ MIGRATION FAILED")
        print("=" * 70)
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
