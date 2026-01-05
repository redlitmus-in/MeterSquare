"""
Migration: Add supplier_notes column to po_child table

This migration adds a supplier_notes field to the po_child table to store
additional specifications, cutting details, sizes, or other requirements
that the buyer needs to communicate to the supplier.

Run with: python backend/migrations/add_supplier_notes_to_po_child.py
"""

import os
import sys
from sqlalchemy import create_engine, text

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def run_migration():
    """Add supplier_notes column to po_child table"""

    # Get database URL from environment
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        print("Usage: DATABASE_URL='postgresql://...' python migrations/add_supplier_notes_to_po_child.py")
        sys.exit(1)

    try:
        engine = create_engine(database_url)

        with engine.connect() as conn:
            # Start transaction
            trans = conn.begin()

            try:
                # Check if column already exists
                check_query = text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'po_child'
                    AND column_name = 'supplier_notes'
                """)
                result = conn.execute(check_query)

                if result.fetchone():
                    print("✓ Column 'supplier_notes' already exists in po_child table")
                    trans.rollback()
                    return

                # Add supplier_notes column
                print("Adding supplier_notes column to po_child table...")
                alter_query = text("""
                    ALTER TABLE po_child
                    ADD COLUMN supplier_notes TEXT NULL
                """)
                conn.execute(alter_query)

                # Commit transaction
                trans.commit()
                print("✓ Successfully added supplier_notes column to po_child table")

                # Show count
                count_query = text("SELECT COUNT(*) FROM po_child")
                result = conn.execute(count_query)
                count = result.scalar()
                print(f"✓ Table has {count} existing records (supplier_notes will be NULL for existing records)")

            except Exception as e:
                trans.rollback()
                raise e

    except Exception as e:
        print(f"ERROR: Migration failed: {str(e)}")
        sys.exit(1)
    finally:
        engine.dispose()

if __name__ == '__main__':
    print("=" * 60)
    print("Migration: Add supplier_notes to po_child")
    print("=" * 60)
    run_migration()
    print("=" * 60)
    print("Migration completed successfully!")
    print("=" * 60)
