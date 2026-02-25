"""
Migration: Fix Change Requests with Missing sub_item_name in materials_data and sub_items_data

This script populates the missing sub_item_name field in existing change requests
by looking up the sub-item name from the BOQ structure.

Usage:
    python migrations/fix_cr_missing_sub_item_name.py

Date: 2026-02-09
"""

import os
import sys

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app, db
from models.change_request import ChangeRequest
from models.boq import BOQDetails
from datetime import datetime


def fix_missing_sub_item_names():
    """
    Fix all change requests that have materials_data or sub_items_data without sub_item_name
    """

    with app.app_context():
        print("\n" + "="*80)
        print("MIGRATION: Fix Missing sub_item_name in Change Requests")
        print("="*80 + "\n")

        # Get all non-deleted change requests
        change_requests = ChangeRequest.query.filter_by(is_deleted=False).all()

        print(f"📊 Total change requests to process: {len(change_requests)}\n")

        fixed_count = 0
        skipped_count = 0
        error_count = 0

        for cr in change_requests:
            try:
                needs_update = False

                # Get BOQ details for lookup
                boq_details = BOQDetails.query.filter_by(
                    boq_id=cr.boq_id,
                    is_deleted=False
                ).first()

                if not boq_details or not boq_details.boq_details:
                    print(f"⚠️  CR-{cr.cr_id}: No BOQ details found, skipping...")
                    skipped_count += 1
                    continue

                # Build material lookup map from BOQ
                material_lookup = {}
                boq_items = boq_details.boq_details.get('items', [])

                for item in boq_items:
                    for sub_item in item.get('sub_items', []):
                        sub_item_name = sub_item.get('sub_item_name')
                        for material in sub_item.get('materials', []):
                            # Lookup by master_material_id
                            mat_id = material.get('master_material_id')
                            if mat_id:
                                material_lookup[mat_id] = {
                                    'sub_item_name': sub_item_name,
                                    'brand': material.get('brand'),
                                    'specification': material.get('specification'),
                                    'size': material.get('size')
                                }

                            # Lookup by material name (lowercase)
                            mat_name = material.get('material_name', '').lower().strip()
                            if mat_name:
                                material_lookup[mat_name] = {
                                    'sub_item_name': sub_item_name,
                                    'brand': material.get('brand'),
                                    'specification': material.get('specification'),
                                    'size': material.get('size')
                                }

                # Fix materials_data
                if cr.materials_data:
                    updated_materials = []
                    for mat in cr.materials_data:
                        # Check if sub_item_name is missing
                        if not mat.get('sub_item_name'):
                            # Try to look up from BOQ
                            lookup_key = None
                            if mat.get('master_material_id'):
                                lookup_key = mat.get('master_material_id')
                            elif mat.get('material_name'):
                                lookup_key = mat.get('material_name', '').lower().strip()

                            if lookup_key and lookup_key in material_lookup:
                                mat['sub_item_name'] = material_lookup[lookup_key]['sub_item_name']
                                needs_update = True
                                print(f"  ✅ CR-{cr.cr_id}: Added sub_item_name '{mat['sub_item_name']}' to material '{mat.get('material_name')}'")
                            else:
                                print(f"  ⚠️  CR-{cr.cr_id}: Could not find sub_item_name for material '{mat.get('material_name')}'")

                        updated_materials.append(mat)

                    cr.materials_data = updated_materials

                # Fix sub_items_data
                if cr.sub_items_data:
                    updated_sub_items = []
                    for sub_item in cr.sub_items_data:
                        # Check if sub_item_name is missing
                        if not sub_item.get('sub_item_name'):
                            # Try to look up from BOQ
                            lookup_key = None
                            if sub_item.get('master_material_id'):
                                lookup_key = sub_item.get('master_material_id')
                            elif sub_item.get('material_name'):
                                lookup_key = sub_item.get('material_name', '').lower().strip()

                            if lookup_key and lookup_key in material_lookup:
                                sub_item['sub_item_name'] = material_lookup[lookup_key]['sub_item_name']
                                needs_update = True
                                print(f"  ✅ CR-{cr.cr_id}: Added sub_item_name '{sub_item['sub_item_name']}' to sub-item '{sub_item.get('material_name')}'")
                            else:
                                print(f"  ⚠️  CR-{cr.cr_id}: Could not find sub_item_name for sub-item '{sub_item.get('material_name')}'")

                        updated_sub_items.append(sub_item)

                    cr.sub_items_data = updated_sub_items

                # Commit if changes were made
                if needs_update:
                    cr.updated_at = datetime.utcnow()
                    db.session.commit()
                    fixed_count += 1
                    print(f"  💾 CR-{cr.cr_id}: Updated and saved")
                else:
                    skipped_count += 1

            except Exception as e:
                print(f"❌ CR-{cr.cr_id}: Error - {str(e)}")
                db.session.rollback()
                error_count += 1
                continue

        print("\n" + "="*80)
        print("MIGRATION SUMMARY")
        print("="*80)
        print(f"✅ Fixed: {fixed_count}")
        print(f"⏭️  Skipped (no changes needed): {skipped_count}")
        print(f"❌ Errors: {error_count}")
        print(f"📊 Total processed: {len(change_requests)}")
        print("="*80 + "\n")


if __name__ == '__main__':
    fix_missing_sub_item_names()
