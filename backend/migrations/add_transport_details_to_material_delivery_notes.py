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
            print("✓ Successfully added delivery_batch_ref to material_delivery_notes")
            print("  - delivery_batch_ref (TEXT, indexed)")
    except Exception as e:
        print(f"✗ Error adding delivery_batch_ref field: {e}")
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
            print("✓ Successfully removed delivery_batch_ref from material_delivery_notes")
    except Exception as e:
        print(f"✗ Error removing delivery_batch_ref field: {e}")
        raise

if __name__ == '__main__':
    print("=" * 60)
    print("Migration: Add delivery_batch_ref to material_delivery_notes")
    print("=" * 60)
    print("\nThis migration adds batch reference field:")
    print("  - delivery_batch_ref - Batch reference for grouping materials from same trip (e.g., MSQ-OUT-01)")
    print("\nTarget: DEVELOP database only")
    print("Role: Production Manager (Stock Out)")
    print("\nStarting migration...\n")

    upgrade()

    print("\n" + "=" * 60)
    print("Migration complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Test Stock Out page with transport details")
    print("2. Verify batch reference system works correctly (MSQ-OUT-01, MSQ-OUT-02, etc.)")
    print("3. Check that materials from same trip share transport info and batch reference")
