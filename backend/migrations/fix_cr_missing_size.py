"""
Migration script to fix missing size field in change request materials_data and sub_items_data
This script looks up the size from BOQ materials and updates existing change requests
"""
from config.db import db
from models.change_request import ChangeRequest
from models.boq import BOQDetails
from sqlalchemy.orm.attributes import flag_modified


def fix_missing_sizes():
    """Fix missing size fields in existing change requests by looking them up from BOQ"""

    # Get all non-deleted change requests
    change_requests = ChangeRequest.query.filter_by(is_deleted=False).all()

    fixed_count = 0
    total_count = len(change_requests)

    print(f"Processing {total_count} change requests...")

    for cr in change_requests:
        try:
            # Get BOQ details for this change request
            boq_details = BOQDetails.query.filter_by(
                boq_id=cr.boq_id,
                is_deleted=False
            ).first()

            if not boq_details or not boq_details.boq_details:
                print(f"⚠️  CR {cr.cr_id}: No BOQ details found, skipping")
                continue

            # Build material lookup from BOQ
            material_lookup = {}
            boq_items = boq_details.boq_details.get('items', [])

            for item_idx, item in enumerate(boq_items):
                for sub_item_idx, sub_item in enumerate(item.get('sub_items', [])):
                    for mat_idx, boq_material in enumerate(sub_item.get('materials', [])):
                        # Store size, brand, spec for each material
                        material_data = {
                            'size': boq_material.get('size'),
                            'brand': boq_material.get('brand'),
                            'specification': boq_material.get('specification')
                        }

                        # Index by master_material_id
                        material_id = boq_material.get('master_material_id')
                        if material_id:
                            material_lookup[material_id] = material_data

                        # Also index by generated ID pattern
                        generated_id = f"mat_{cr.boq_id}_{item_idx+1}_{sub_item_idx+1}_{mat_idx+1}"
                        material_lookup[generated_id] = material_data

                        # Also index by material name (case-insensitive)
                        material_name = boq_material.get('material_name', '').lower().strip()
                        if material_name:
                            if material_name not in material_lookup:
                                material_lookup[material_name] = material_data

            # Fix materials_data
            updated_materials = False
            if cr.materials_data:
                for mat in cr.materials_data:
                    # Skip if already has size
                    if mat.get('size'):
                        continue

                    # Try to find size from BOQ lookup
                    master_id = mat.get('master_material_id')
                    mat_name = mat.get('material_name', '').lower().strip()

                    boq_mat = None
                    if master_id and master_id in material_lookup:
                        boq_mat = material_lookup[master_id]
                    elif mat_name and mat_name in material_lookup:
                        boq_mat = material_lookup[mat_name]

                    if boq_mat and boq_mat.get('size'):
                        mat['size'] = boq_mat['size']
                        updated_materials = True
                        print(f"  ✓ Updated material '{mat.get('material_name')}' with size: {boq_mat['size']}")

            # Fix sub_items_data
            if cr.sub_items_data:
                for sub_item in cr.sub_items_data:
                    # Skip if already has size
                    if sub_item.get('size'):
                        continue

                    # Try to find size from BOQ lookup
                    master_id = sub_item.get('master_material_id')
                    mat_name = sub_item.get('material_name', '').lower().strip()

                    boq_mat = None
                    if master_id and master_id in material_lookup:
                        boq_mat = material_lookup[master_id]
                    elif mat_name and mat_name in material_lookup:
                        boq_mat = material_lookup[mat_name]

                    if boq_mat and boq_mat.get('size'):
                        sub_item['size'] = boq_mat['size']
                        updated_materials = True

            # If we updated anything, mark as modified and save
            if updated_materials:
                flag_modified(cr, 'materials_data')
                flag_modified(cr, 'sub_items_data')
                fixed_count += 1
                print(f"✅ CR {cr.cr_id} ({cr.formatted_cr_id}): Fixed missing size fields")

        except Exception as e:
            print(f"❌ Error processing CR {cr.cr_id}: {str(e)}")
            continue

    # Commit all changes
    try:
        db.session.commit()
        print(f"\n✅ Migration complete! Fixed {fixed_count} out of {total_count} change requests")
    except Exception as e:
        db.session.rollback()
        print(f"\n❌ Error committing changes: {str(e)}")
        raise


if __name__ == '__main__':
    print("=" * 60)
    print("Fix Missing Size Fields in Change Requests")
    print("=" * 60)
    fix_missing_sizes()
