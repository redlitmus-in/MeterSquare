"""
Migration: Add delivery_batch_ref to inventory_transactions
Date: 2026-01-21
Purpose: Group materials from the same vendor delivery trip with a unique batch reference

IMPORTANT: This script should be run manually by the developer.
Database: Run on DEVELOP database only

Usage:
    python migrations/add_delivery_batch_ref_to_transactions.py
"""

from config.db import db
from sqlalchemy import text

def upgrade():
    """Add delivery_batch_ref column to inventory_transactions table"""
    try:
        with db.engine.connect() as conn:
            # Add column with index for efficient grouping
            conn.execute(text("""
                ALTER TABLE inventory_transactions
                ADD COLUMN IF NOT EXISTS delivery_batch_ref VARCHAR(50);
            """))

            # Add index for query performance
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_inventory_transactions_delivery_batch_ref
                ON inventory_transactions(delivery_batch_ref);
            """))

            conn.commit()
            print("✓ Successfully added delivery_batch_ref to inventory_transactions")
            print("  - delivery_batch_ref (VARCHAR 50)")
            print("  - Added index for performance")
    except Exception as e:
        print(f"✗ Error adding delivery_batch_ref: {e}")
        raise

def downgrade():
    """Remove delivery_batch_ref column"""
    try:
        with db.engine.connect() as conn:
            conn.execute(text("""
                DROP INDEX IF EXISTS idx_inventory_transactions_delivery_batch_ref;
            """))
            conn.execute(text("""
                ALTER TABLE inventory_transactions
                DROP COLUMN IF EXISTS delivery_batch_ref;
            """))
            conn.commit()
            print("✓ Successfully removed delivery_batch_ref from inventory_transactions")
    except Exception as e:
        print(f"✗ Error removing delivery_batch_ref: {e}")
        raise

if __name__ == '__main__':
    print("=" * 70)
    print("Migration: Add delivery_batch_ref to inventory_transactions")
    print("=" * 70)
    print("\nAdds unique batch reference to group materials from same delivery:")
    print("  - Format: DB-YYYY-NNN (e.g., DB-2026-001)")
    print("  - Links materials delivered together in one trip")
    print("  - Prevents duplicate transport fee tracking")
    print("\nTarget: DEVELOP database only")
    print("Role: Production Manager")
    print("\nStarting migration...\n")

    upgrade()

    print("\n" + "=" * 70)
    print("Migration complete!")
    print("=" * 70)
