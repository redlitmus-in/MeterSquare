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
            print("✓ Successfully added transport_fee field to material_delivery_notes")
            print("  - transport_fee (FLOAT, default 0.0)")
    except Exception as e:
        print(f"✗ Error adding transport_fee field: {e}")
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
            print("✓ Successfully removed transport_fee field from material_delivery_notes")
    except Exception as e:
        print(f"✗ Error removing transport_fee field: {e}")
        raise

if __name__ == '__main__':
    print("=" * 60)
    print("Migration: Add transport_fee to material_delivery_notes")
    print("=" * 60)
    print("\nThis migration adds transport_fee column for tracking delivery transport costs:")
    print("  - transport_fee - Manually entered transport cost (AED)")
    print("\nTarget: DEVELOP database only")
    print("Role: Production Manager")
    print("\nStarting migration...\n")

    upgrade()

    print("\n" + "=" * 60)
    print("Migration complete!")
    print("=" * 60)
