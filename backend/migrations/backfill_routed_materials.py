"""
Backfill routed_materials column data for existing change_requests.
Run after add_routed_materials_tracking.py if the column exists but data is empty.
"""

import os
import sys
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

app = create_app()

def run_backfill():
    print("=" * 70)
    print("BACKFILL: routed_materials data for existing change_requests")
    print("=" * 70)

    with app.app_context():
        # Step 1: Backfill store-routed materials
        try:
            count = db.session.execute(text(
                "SELECT COUNT(*) FROM change_requests "
                "WHERE routed_materials IS NOT NULL AND routed_materials <> '{}'::jsonb"
            )).scalar()
            print(f"CRs with existing routed_materials data: {count}")

            if count > 0:
                print("Backfill already has data. Skipping store backfill.")
            else:
                print("\n1. Backfilling store-routed materials...")
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
                        AND imr.item_name <> ''
                    )
                    WHERE cr.cr_id IN (
                        SELECT DISTINCT cr_id
                        FROM internal_inventory_material_requests
                        WHERE cr_id IS NOT NULL
                        AND item_name IS NOT NULL
                        AND item_name <> ''
                    )
                """))
                db.session.commit()

                store_count = db.session.execute(text(
                    "SELECT COUNT(*) FROM change_requests "
                    "WHERE routed_materials IS NOT NULL AND routed_materials <> '{}'::jsonb"
                )).scalar()
                print(f"   Store-routed CRs updated: {store_count}")

        except Exception as e:
            db.session.rollback()
            print(f"\n   Store backfill failed: {str(e)}")
            import traceback
            traceback.print_exc()

        # Step 2: Backfill vendor-routed materials
        try:
            print("\n2. Backfilling vendor-routed materials...")
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
                    AND pc.is_deleted = false
                    AND mat->>'material_name' IS NOT NULL
                    AND mat->>'material_name' <> ''
                ), '{}'::jsonb)
                WHERE cr.cr_id IN (
                    SELECT DISTINCT parent_cr_id
                    FROM po_child
                    WHERE parent_cr_id IS NOT NULL
                    AND is_deleted = false
                )
            """))
            db.session.commit()

            vendor_count = db.session.execute(text(
                "SELECT COUNT(*) FROM change_requests "
                "WHERE routed_materials IS NOT NULL "
                "AND routed_materials <> '{}'::jsonb "
                "AND routed_materials::text LIKE '%vendor%'"
            )).scalar()
            print(f"   Vendor-routed CRs updated: {vendor_count}")

        except Exception as e:
            db.session.rollback()
            print(f"\n   Vendor backfill failed: {str(e)}")
            import traceback
            traceback.print_exc()

        print("\n" + "=" * 70)
        print("BACKFILL COMPLETED")
        print("=" * 70)

if __name__ == "__main__":
    run_backfill()
