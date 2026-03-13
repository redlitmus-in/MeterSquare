"""
Migration: Add transport_fee field to material_delivery_notes
Date: 2026-01-21
Purpose: Track transport costs for material delivery to project sites (Production Manager role)

IMPORTANT: This script should be run manually by the developer.
Database: Run on DEVELOP database only

Usage:
    python migrations/add_transport_fee_to_delivery_notes.py
"""

from config.db import db
from sqlalchemy import text

def upgrade():
    """Add transport_fee field to material_delivery_notes table"""
    try:
        with db.engine.connect() as conn:
            # Add transport_fee column
            conn.execute(text("""
                ALTER TABLE material_delivery_notes
                ADD COLUMN IF NOT EXISTS transport_fee FLOAT DEFAULT 0.0;
            """))
            conn.commit()
    except Exception as e:
        raise

def downgrade():
    """Remove transport_fee field from material_delivery_notes table"""
    try:
        with db.engine.connect() as conn:
            conn.execute(text("""
                ALTER TABLE material_delivery_notes
                DROP COLUMN IF EXISTS transport_fee;
            """))
            conn.commit()
    except Exception as e:
        raise

if __name__ == '__main__':

    upgrade()

