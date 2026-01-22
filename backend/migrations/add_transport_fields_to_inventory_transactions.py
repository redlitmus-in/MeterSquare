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
            print("✓ Successfully added transport fields to inventory_transactions")
            print("  - driver_name (VARCHAR 255)")
            print("  - vehicle_number (VARCHAR 100)")
            print("  - transport_fee (FLOAT, default 0.0)")
            print("  - transport_notes (TEXT)")
    except Exception as e:
        print(f"✗ Error adding transport fields: {e}")
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
            print("✓ Successfully removed transport fields from inventory_transactions")
    except Exception as e:
        print(f"✗ Error removing transport fields: {e}")
        raise

if __name__ == '__main__':
    print("=" * 60)
    print("Migration: Add transport fields to inventory_transactions")
    print("=" * 60)
    print("\nThis migration adds 4 new columns for tracking vendor delivery transport details:")
    print("  1. driver_name - Name of the delivery driver")
    print("  2. vehicle_number - Vehicle registration number")
    print("  3. transport_fee - Manually entered transport cost (AED)")
    print("  4. transport_notes - Additional delivery notes")
    print("\nTarget: DEVELOP database only")
    print("Role: Production Manager")
    print("\nStarting migration...\n")

    upgrade()

    print("\n" + "=" * 60)
    print("Migration complete!")
    print("=" * 60)
