"""
Migration: Add delivery_batch_ref field to material_delivery_notes
Date: 2026-01-22
Purpose: Complete transport tracking for material delivery to project sites (Production Manager role)
         - delivery_batch_ref: Reference to group materials from same delivery trip (e.g., "MSQ-OUT-01")

IMPORTANT: This script should be run manually by the developer.
Database: Run on DEVELOP database only

Usage:
    python migrations/add_transport_details_to_material_delivery_notes.py
"""

from config.db import db
from sqlalchemy import text

def upgrade():
    """Add delivery_batch_ref field to material_delivery_notes table"""
    try:
        with db.engine.connect() as conn:
            # Add delivery_batch_ref column with index
            conn.execute(text("""
                ALTER TABLE material_delivery_notes
                ADD COLUMN IF NOT EXISTS delivery_batch_ref TEXT;
            """))

            # Create index on delivery_batch_ref for efficient batch queries
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_mdn_delivery_batch_ref
                ON material_delivery_notes(delivery_batch_ref);
            """))

            conn.commit()
    except Exception as e:
        raise

def downgrade():
    """Remove delivery_batch_ref field from material_delivery_notes table"""
    try:
        with db.engine.connect() as conn:
            # Drop index first
            conn.execute(text("""
                DROP INDEX IF EXISTS idx_mdn_delivery_batch_ref;
            """))

            # Drop column
            conn.execute(text("""
                ALTER TABLE material_delivery_notes
                DROP COLUMN IF EXISTS delivery_batch_ref;
            """))

            conn.commit()
    except Exception as e:
        raise

if __name__ == '__main__':

    upgrade()

