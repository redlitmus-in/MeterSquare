"""
Migration: Add routed_materials column to change_requests table
Purpose: Track which materials have been sent to store or vendor to prevent duplicates
Date: 2026-02-10
"""

import os
import sys
from sqlalchemy import text
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

app = create_app()

def run_migration():
    """Add routed_materials JSONB column to change_requests table"""

    print("=" * 70)
    print("MIGRATION: Add routed_materials tracking to change_requests")
    print("=" * 70)

    with app.app_context():
        try:
            # Check if column already exists
            result = db.session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'change_requests'
                AND column_name = 'routed_materials'
            """))

            if result.fetchone():
                print("✓ Column 'routed_materials' already exists. Skipping migration.")
                return

            # Add the column
            print("\n1. Adding 'routed_materials' column...")
            db.session.execute(text("""
                ALTER TABLE change_requests
                ADD COLUMN routed_materials JSONB DEFAULT '{}'::jsonb
            """))

            db.session.commit()
            print("✓ Column added successfully")

            # Initialize existing records
            print("\n2. Initializing routed_materials for existing records...")

            # Mark materials as routed for CRs that have store requests
            db.session.execute(text("""
                UPDATE change_requests cr
                SET routed_materials = (
                    SELECT jsonb_object_agg(
                        imr.item_name,
                        jsonb_build_object(
                            'routing', 'store',
                            'routed_at', imr.created_at::text,
                            'routed_by', imr.request_buyer_id
                        )
                    )
                    FROM internal_inventory_material_requests imr
                    WHERE imr.cr_id = cr.cr_id
                    AND imr.item_name IS NOT NULL
                    AND imr.item_name != ''
                )
                WHERE cr.cr_id IN (
                    SELECT DISTINCT cr_id
                    FROM internal_inventory_material_requests
                    WHERE cr_id IS NOT NULL
                    AND item_name IS NOT NULL
                    AND item_name != ''
                )
            """))

            updated_store = db.session.execute(text("""
                SELECT COUNT(*) FROM change_requests
                WHERE routed_materials IS NOT NULL AND routed_materials != '{}'::jsonb
            """)).scalar()

            print(f"✓ Initialized {updated_store} CRs with store-routed materials")

            # Mark materials as routed for CRs that have PO children
            db.session.execute(text("""
                UPDATE change_requests cr
                SET routed_materials = COALESCE(cr.routed_materials, '{}'::jsonb) || COALESCE((
                    SELECT jsonb_object_agg(
                        mat->>'material_name',
                        jsonb_build_object(
                            'routing', 'vendor',
                            'po_child_id', pc.id,
                            'routed_at', pc.created_at::text,
                            'routed_by', pc.vendor_selected_by_buyer_id
                        )
                    )
                    FROM po_child pc,
                    LATERAL jsonb_array_elements(
                        COALESCE(pc.materials_data, '[]'::jsonb)
                    ) AS mat
                    WHERE pc.parent_cr_id = cr.cr_id
                    AND mat->>'material_name' IS NOT NULL
                    AND mat->>'material_name' != ''
                ), '{}'::jsonb)
                WHERE cr.cr_id IN (
                    SELECT DISTINCT parent_cr_id
                    FROM po_child
                    WHERE parent_cr_id IS NOT NULL
                )
            """))

            db.session.commit()

            updated_vendor = db.session.execute(text("""
                SELECT COUNT(*) FROM change_requests
                WHERE routed_materials IS NOT NULL
                AND routed_materials != '{}'::jsonb
                AND routed_materials::text LIKE '%vendor%'
            """)).scalar()

            print(f"✓ Initialized {updated_vendor} CRs with vendor-routed materials")

            print("\n" + "=" * 70)
            print("✓ MIGRATION COMPLETED SUCCESSFULLY")
            print("=" * 70)

        except Exception as e:
            db.session.rollback()
            print(f"\n✗ MIGRATION FAILED: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

if __name__ == "__main__":
    run_migration()
