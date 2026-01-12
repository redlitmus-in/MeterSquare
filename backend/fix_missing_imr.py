"""
Fix script to create missing InternalMaterialRequest records for PO-540 and PO-541
These were completed before the new routed_to_store flow was implemented
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

def check_and_create_imr(cr_id):
    """Check if CR has InternalMaterialRequest, create if missing"""

    # Check if IMR already exists
    check_sql = text("""
        SELECT COUNT(*) as count
        FROM internal_inventory_material_requests
        WHERE cr_id = :cr_id
    """)
    result = session.execute(check_sql, {'cr_id': cr_id}).fetchone()

    if result[0] > 0:
        print(f"✅ CR-{cr_id} already has {result[0]} Internal Material Request(s)")
        return False

    print(f"⚠️  CR-{cr_id} has NO Internal Material Request - creating now...")

    # Get CR details - use 'project' table (singular)
    cr_sql = text("""
        SELECT
            cr.cr_id,
            cr.project_id,
            cr.assigned_to_buyer_user_id,
            cr.materials_data::text,
            cr.sub_items_data::text,
            cr.status,
            cr.purchase_completed_by_user_id,
            p.project_name
        FROM change_requests cr
        LEFT JOIN project p ON cr.project_id = p.project_id
        WHERE cr.cr_id = :cr_id
    """)

    cr = session.execute(cr_sql, {'cr_id': cr_id}).fetchone()

    if not cr:
        print(f"❌ CR-{cr_id} not found")
        return False

    print(f"📦 Found CR-{cr_id}: Project={cr.project_name}, Status={cr.status}")

    # Get materials data - parse JSON strings
    materials_data = []
    if cr.sub_items_data:
        materials_data = json.loads(cr.sub_items_data) if isinstance(cr.sub_items_data, str) else cr.sub_items_data
    elif cr.materials_data:
        materials_data = json.loads(cr.materials_data) if isinstance(cr.materials_data, str) else cr.materials_data

    if not materials_data:
        print(f"⚠️  No materials data found for CR-{cr_id}")
        return False

    print(f"📋 Found {len(materials_data)} material(s) to create requests for")

    # Create InternalMaterialRequest for each material
    created_count = 0
    for idx, material in enumerate(materials_data):
        if isinstance(material, dict):
            material_name = material.get('sub_item_name') or material.get('material_name', 'Unknown')
            quantity = material.get('quantity', 0)
            brand = material.get('brand', '')
            size = material.get('size', '')
            unit = material.get('unit', 'pcs')
            unit_price = material.get('unit_price', 0)
            total_cost = material.get('total_price', 0)

            # Store full material data in materials_data JSONB column
            materials_json = json.dumps([{
                'material_name': material_name,
                'quantity': quantity,
                'brand': brand,
                'size': size,
                'unit': unit,
                'unit_price': unit_price,
                'total_price': total_cost
            }])

            insert_sql = text("""
                INSERT INTO internal_inventory_material_requests (
                    cr_id,
                    project_id,
                    request_buyer_id,
                    material_name,
                    quantity,
                    brand,
                    size,
                    source_type,
                    status,
                    vendor_delivery_confirmed,
                    final_destination_site,
                    routed_by_buyer_id,
                    routed_to_store_at,
                    request_send,
                    materials_data,
                    materials_count,
                    created_at,
                    created_by
                ) VALUES (
                    :cr_id,
                    :project_id,
                    :buyer_id,
                    :material_name,
                    :quantity,
                    :brand,
                    :size,
                    'from_vendor_delivery',
                    'awaiting_vendor_delivery',
                    FALSE,
                    :final_destination,
                    :buyer_id,
                    :created_at,
                    TRUE,
                    CAST(:materials_data AS jsonb),
                    1,
                    :created_at,
                    'System Fix Script'
                )
            """)

            session.execute(insert_sql, {
                'cr_id': cr.cr_id,
                'project_id': cr.project_id,
                'buyer_id': cr.purchase_completed_by_user_id or cr.assigned_to_buyer_user_id,
                'material_name': material_name,
                'quantity': quantity,
                'brand': brand,
                'size': size,
                'materials_data': materials_json,
                'final_destination': cr.project_name or f'Project {cr.project_id}',
                'created_at': datetime.utcnow()
            })

            created_count += 1
            print(f"  ✅ Created IMR #{idx+1}: {material_name} (Qty: {quantity} {unit})")

    session.commit()
    print(f"✅ Successfully created {created_count} Internal Material Request(s) for CR-{cr_id}")
    return True

if __name__ == '__main__':
    print("=" * 80)
    print("🔧 Fixing Missing Internal Material Requests for PO-540, PO-541, and CR-542")
    print("=" * 80)

    try:
        # Fix PO-540
        print("\n📌 Checking CR-540...")
        check_and_create_imr(540)

        # Fix PO-541
        print("\n📌 Checking CR-541...")
        check_and_create_imr(541)

        # Fix CR-542 (new)
        print("\n📌 Checking CR-542...")
        check_and_create_imr(542)

        print("\n" + "=" * 80)
        print("✅ Fix completed successfully!")
        print("=" * 80)

        # Show all IMRs
        print("\n📊 Current Internal Material Requests:")
        result = session.execute(text("""
            SELECT
                imr.request_id,
                imr.cr_id,
                imr.material_name,
                imr.quantity,
                imr.status,
                p.project_name
            FROM internal_inventory_material_requests imr
            LEFT JOIN project p ON imr.project_id = p.project_id
            ORDER BY imr.request_id DESC
            LIMIT 10
        """))

        for row in result:
            print(f"  Request #{row.request_id}: CR-{row.cr_id} | {row.material_name} (Qty: {row.quantity}) | {row.status} | {row.project_name}")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        session.rollback()
        sys.exit(1)
    finally:
        session.close()
