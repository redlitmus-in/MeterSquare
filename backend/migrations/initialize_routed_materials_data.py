"""
Migration: Initialize routed_materials data for existing change requests
Purpose: Populate routed_materials based on existing store requests and PO children
Date: 2026-02-10
"""

import os
import sys
from sqlalchemy import text

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

app = create_app()

def run_migration():
    """Initialize routed_materials for existing CRs"""

    print("=" * 70)
    print("MIGRATION: Initialize routed_materials data")
    print("=" * 70)

    with app.app_context():
        try:
            print("\n1. Initializing routed_materials for CRs with store requests...")

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
                )
                WHERE cr.cr_id IN (
                    SELECT DISTINCT cr_id
                    FROM internal_inventory_material_requests
                    WHERE cr_id IS NOT NULL
                )
                AND (cr.routed_materials IS NULL OR cr.routed_materials = '{}'::jsonb)
            """))

            db.session.commit()

            updated_store = db.session.execute(text("""
                SELECT COUNT(*) FROM change_requests
                WHERE routed_materials IS NOT NULL AND routed_materials != '{}'::jsonb
            """)).scalar()

            print(f"✓ Initialized {updated_store} CRs with store-routed materials")

            print("\n2. Checking for PO children table...")

            # Check if po_children table exists
            table_exists = db.session.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'po_children'
                )
            """)).scalar()

            if table_exists:
                print("✓ PO children table found. Initializing vendor-routed materials...")

                # Mark materials as routed for CRs that have PO children
                db.session.execute(text("""
                    UPDATE change_requests cr
                    SET routed_materials = COALESCE(cr.routed_materials, '{}'::jsonb) || (
                        SELECT jsonb_object_agg(
                            mat->>'material_name',
                            jsonb_build_object(
                                'routing', 'vendor',
                                'po_child_id', pc.po_child_id,
                                'routed_at', pc.created_at::text,
                                'routed_by', pc.created_by_user_id
                            )
                        )
                        FROM po_children pc,
                        LATERAL jsonb_array_elements(
                            COALESCE(pc.sub_items_data, pc.materials_data, '[]'::jsonb)
                        ) AS mat
                        WHERE pc.parent_cr_id = cr.cr_id
                        AND mat->>'material_name' IS NOT NULL
                    )
                    WHERE cr.cr_id IN (
                        SELECT DISTINCT parent_cr_id
                        FROM po_children
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
            else:
                print("⚠ PO children table not found. Skipping vendor-routed materials initialization.")

            # Show sample
            print("\n3. Sample routed_materials data:")
            result = db.session.execute(text("""
                SELECT cr_id, routed_materials
                FROM change_requests
                WHERE routed_materials IS NOT NULL
                AND routed_materials != '{}'::jsonb
                LIMIT 3
            """))

            for row in result:
                print(f"   CR-{row[0]}: {row[1]}")

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
