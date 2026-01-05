"""
Migration: Drop supplier_notes TEXT columns from change_requests and po_child tables

Reason: We now use per-material notes stored in JSONB fields:
- change_requests.material_vendor_selections[material_name]['supplier_notes']
- po_child.materials_data[n]['supplier_notes']

The purchase-level supplier_notes TEXT columns are no longer used and can be safely dropped.

Run this migration to clean up the database schema.
"""

import os
import sys

# Add parent directory to path so we can import app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from sqlalchemy import text

def run_migration():
    """Drop supplier_notes columns from change_requests and po_child tables"""

    app = create_app()

    with app.app_context():
        try:
            print("=" * 60)
            print("MIGRATION: Drop supplier_notes TEXT columns")
            print("=" * 60)

            # Check if columns exist before dropping
            print("\n1. Checking if columns exist...")

            # Check change_requests.supplier_notes
            cr_check = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'change_requests'
                AND column_name = 'supplier_notes'
            """)).fetchone()

            # Check po_child.supplier_notes
            po_check = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'po_child'
                AND column_name = 'supplier_notes'
            """)).fetchone()

            if not cr_check and not po_check:
                print("\n✓ Both columns have already been dropped. Nothing to do.")
                return

            # Drop change_requests.supplier_notes
            if cr_check:
                print("\n2. Dropping change_requests.supplier_notes column...")
                db.session.execute(text("""
                    ALTER TABLE change_requests DROP COLUMN IF EXISTS supplier_notes
                """))
                print("   ✓ Dropped change_requests.supplier_notes")
            else:
                print("\n2. change_requests.supplier_notes already dropped")

            # Drop po_child.supplier_notes
            if po_check:
                print("\n3. Dropping po_child.supplier_notes column...")
                db.session.execute(text("""
                    ALTER TABLE po_child DROP COLUMN IF EXISTS supplier_notes
                """))
                print("   ✓ Dropped po_child.supplier_notes")
            else:
                print("\n3. po_child.supplier_notes already dropped")

            db.session.commit()

            print("\n" + "=" * 60)
            print("✅ MIGRATION COMPLETED SUCCESSFULLY")
            print("=" * 60)
            print("\nPer-material notes are now the only supplier notes:")
            print("  - Stored in: change_requests.material_vendor_selections")
            print("  - Stored in: po_child.materials_data")
            print("  - Displayed in: LPO PDF as sub-rows under each material")
            print("=" * 60)

        except Exception as e:
            db.session.rollback()
            print(f"\n❌ ERROR during migration: {str(e)}")
            import traceback
            print(traceback.format_exc())
            raise

if __name__ == '__main__':
    run_migration()
