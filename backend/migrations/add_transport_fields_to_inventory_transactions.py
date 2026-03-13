"""
Migration: Add transport/delivery fields to inventory_transactions
Date: 2026-01-20
Purpose: Track transport costs and delivery details for vendor material deliveries (Production Manager role)

IMPORTANT: This script should be run manually by the developer.
Database: Run on DEVELOP database only

Usage:
    python migrations/add_transport_fields_to_inventory_transactions.py
"""

from config.db import db
from sqlalchemy import text

def upgrade():
    """Add transport fields to inventory_transactions table"""
    try:
        with db.engine.connect() as conn:
            # Add columns for transport/delivery tracking
            conn.execute(text("""
                ALTER TABLE inventory_transactions
                ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255),
                ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(100),
                ADD COLUMN IF NOT EXISTS transport_fee FLOAT DEFAULT 0.0,
                ADD COLUMN IF NOT EXISTS transport_notes TEXT;
            """))
            conn.commit()
    except Exception as e:
        raise

def downgrade():
    """Remove transport fields from inventory_transactions table"""
    try:
        with db.engine.connect() as conn:
            conn.execute(text("""
                ALTER TABLE inventory_transactions
                DROP COLUMN IF EXISTS driver_name,
                DROP COLUMN IF EXISTS vehicle_number,
                DROP COLUMN IF EXISTS transport_fee,
                DROP COLUMN IF EXISTS transport_notes;
            """))
            conn.commit()
    except Exception as e:
        raise

if __name__ == '__main__':

    upgrade()

