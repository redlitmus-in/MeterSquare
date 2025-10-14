"""
Migration: Add change request tracking to MaterialPurchaseTracking
This allows tracking which materials came from approved change requests
"""
from config.db import db
from sqlalchemy import text

def upgrade():
    """Add change request tracking columns to material_purchase_tracking"""

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

        conn.commit()

    print("✅ Migration completed: Added change request tracking columns to material_purchase_tracking")

def downgrade():
    """Remove change request tracking columns"""

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
    print("Running migration: Add change request tracking to materials...")
    upgrade()
    print("Migration complete!")
