"""
Clean up duplicate/separated IMR records created by old code
Merge them into single grouped IMR records per CR
"""
import os
import sys
from datetime import datetime
import json

# Set up database connection - PRODUCTION
os.environ['DATABASE_URL'] = 'postgresql://postgres.wgddnoiakkoskbbkbygw:Rameshdev$08@aws-0-ap-south-1.pooler.supabase.com:6543/postgres'

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine(os.environ['DATABASE_URL'])
Session = sessionmaker(bind=engine)
session = Session()

def cleanup_cr_imrs(cr_id):
    """Merge multiple IMRs for a CR into one grouped IMR"""

    # Get all IMR records for this CR
    check_sql = text("""
        SELECT
            request_id,
            material_name,
            quantity,
            brand,
            size,
            materials_data,
            materials_count
        FROM internal_inventory_material_requests
        WHERE cr_id = :cr_id
        ORDER BY request_id ASC
    """)
    imrs = session.execute(check_sql, {'cr_id': cr_id}).fetchall()

    if len(imrs) == 0:
        print(f"❌ CR-{cr_id} has NO Internal Material Requests")
        return False

    if len(imrs) == 1:
        print(f"✅ CR-{cr_id} already has 1 grouped IMR - no cleanup needed")
        return False

    print(f"⚠️  CR-{cr_id} has {len(imrs)} separate IMR records - merging into 1 grouped record...")

    # Collect all materials from the separate IMRs
    all_materials = []
    first_imr_id = None
    imr_ids_to_delete = []

    for idx, imr in enumerate(imrs):
        if idx == 0:
            first_imr_id = imr.request_id  # Keep the first IMR, update it
        else:
            imr_ids_to_delete.append(imr.request_id)  # Delete the rest

        # Extract materials data
        if imr.materials_data:
            materials = imr.materials_data if isinstance(imr.materials_data, list) else json.loads(imr.materials_data)
            all_materials.extend(materials)
        else:
            # If no materials_data, create from individual fields
            all_materials.append({
                'material_name': imr.material_name,
                'quantity': float(imr.quantity) if imr.quantity else 0,
                'brand': imr.brand,
                'size': imr.size,
                'unit': 'pcs'  # Default unit
            })

    print(f"📋 Found {len(all_materials)} total materials across {len(imrs)} IMRs")

    # Get CR info for display name
    cr_sql = text("""
        SELECT item_name, project_id
        FROM change_requests
        WHERE cr_id = :cr_id
    """)
    cr = session.execute(cr_sql, {'cr_id': cr_id}).fetchone()

    primary_material_name = all_materials[0]['material_name'] if all_materials else 'Materials'
    item_name = cr.item_name if cr and cr.item_name else primary_material_name
    display_name = f"{item_name} (+{len(all_materials)-1} more)" if len(all_materials) > 1 else item_name

    # Update the first IMR to be grouped
    update_sql = text("""
        UPDATE internal_inventory_material_requests
        SET
            material_name = :display_name,
            quantity = :materials_count,
            brand = NULL,
            size = NULL,
            materials_data = CAST(:materials_data AS jsonb),
            materials_count = :materials_count,
            notes = :notes,
            last_modified_at = :modified_at,
            last_modified_by = 'System Cleanup Script'
        WHERE request_id = :request_id
    """)

    session.execute(update_sql, {
        'request_id': first_imr_id,
        'display_name': display_name,
        'materials_count': len(all_materials),
        'materials_data': json.dumps(all_materials),
        'notes': f"CR-{cr_id} - {len(all_materials)} material(s) - Grouped from {len(imrs)} separate records",
        'modified_at': datetime.utcnow()
    })

    print(f"  ✅ Updated IMR #{first_imr_id} to grouped format: '{display_name}'")

    # Delete the duplicate IMRs
    if imr_ids_to_delete:
        delete_sql = text("""
            DELETE FROM internal_inventory_material_requests
            WHERE request_id = ANY(:ids)
        """)
        session.execute(delete_sql, {'ids': imr_ids_to_delete})
        print(f"  🗑️  Deleted {len(imr_ids_to_delete)} duplicate IMR record(s): {imr_ids_to_delete}")

    session.commit()
    print(f"✅ Successfully merged CR-{cr_id} from {len(imrs)} separate IMRs into 1 grouped IMR")
    return True

if __name__ == '__main__':
    print("=" * 80)
    print("🧹 Cleaning Up Duplicate/Separated IMR Records")
    print("=" * 80)

    try:
        # Clean up CR-540, CR-541, CR-542 which have separated IMRs
        print("\n📌 Cleaning CR-540...")
        cleanup_cr_imrs(540)

        print("\n📌 Cleaning CR-541...")
        cleanup_cr_imrs(541)

        print("\n📌 Cleaning CR-542...")
        cleanup_cr_imrs(542)

        print("\n" + "=" * 80)
        print("✅ Cleanup completed successfully!")
        print("=" * 80)

        # Show current state
        print("\n📊 Current Internal Material Requests:")
        result = session.execute(text("""
            SELECT
                imr.request_id,
                imr.cr_id,
                imr.material_name,
                imr.materials_count,
                imr.status,
                p.project_name
            FROM internal_inventory_material_requests imr
            LEFT JOIN project p ON imr.project_id = p.project_id
            WHERE imr.cr_id IN (540, 541, 542)
            ORDER BY imr.request_id DESC
        """))

        for row in result:
            print(f"  Request #{row.request_id}: CR-{row.cr_id} | {row.material_name} ({row.materials_count} materials) | {row.status} | {row.project_name}")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        print(traceback.format_exc())
        session.rollback()
        sys.exit(1)
    finally:
        session.close()
