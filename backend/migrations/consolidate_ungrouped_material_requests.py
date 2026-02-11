"""
Migration: Consolidate ungrouped material requests into grouped requests
Purpose: Convert legacy individual material requests into grouped requests with materials_data array
Date: 2026-02-10
Author: Claude (AI Assistant)

Background:
- Old flow created one IMR per material (ungrouped)
- New flow creates one IMR per CR with materials_data array (grouped)
- This migration consolidates legacy ungrouped requests for better UI display
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor
import json
from datetime import datetime


def run_migration():
    """Consolidate ungrouped material requests into grouped requests"""

    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        return False

    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        print("=" * 80)
        print("Migration: Consolidate Ungrouped Material Requests")
        print("=" * 80)
        print()

        # Step 1: Find all ungrouped requests (no materials_data) grouped by CR
        print("Step 1: Finding ungrouped material requests...")
        cursor.execute("""
            SELECT
                cr_id,
                project_id,
                request_buyer_id,
                source_type,
                final_destination_site,
                status,
                COUNT(*) as request_count,
                ARRAY_AGG(request_id ORDER BY created_at) as request_ids,
                MIN(created_at) as earliest_created,
                MIN(created_by) as first_creator
            FROM internal_inventory_material_requests
            WHERE
                materials_data IS NULL
                AND cr_id IS NOT NULL
                AND materials_count IS NULL
            GROUP BY cr_id, project_id, request_buyer_id, source_type, final_destination_site, status
            HAVING COUNT(*) > 1
            ORDER BY cr_id
        """)

        grouped_requests = cursor.fetchall()
        total_groups = len(grouped_requests)

        if total_groups == 0:
            print("  ✓ No ungrouped requests found. All requests are already properly grouped!")
            print()
            cursor.close()
            conn.close()
            return True

        print(f"  ✓ Found {total_groups} groups of ungrouped requests to consolidate")
        print()

        # Step 2: Process each group
        consolidated_count = 0
        deleted_count = 0

        for idx, group in enumerate(grouped_requests, 1):
            cr_id = group['cr_id']
            request_ids = group['request_ids']
            request_count = group['request_count']

            print(f"[{idx}/{total_groups}] Processing CR-{cr_id}: {request_count} requests to consolidate...")

            # Fetch all individual requests for this group
            cursor.execute("""
                SELECT
                    request_id,
                    item_name,
                    quantity,
                    brand,
                    size,
                    inventory_material_id,
                    notes
                FROM internal_inventory_material_requests
                WHERE request_id = ANY(%s)
                ORDER BY created_at
            """, (request_ids,))

            individual_requests = cursor.fetchall()

            # Build materials_data array
            materials_data = []
            for req in individual_requests:
                # Fetch inventory material details if available
                unit = 'pcs'
                unit_price = 0

                if req['inventory_material_id']:
                    cursor.execute("""
                        SELECT unit, unit_price
                        FROM inventory_materials
                        WHERE inventory_material_id = %s
                    """, (req['inventory_material_id'],))

                    inv_mat = cursor.fetchone()
                    if inv_mat:
                        unit = inv_mat['unit'] or 'pcs'
                        unit_price = inv_mat['unit_price'] or 0

                materials_data.append({
                    'material_name': req['item_name'],
                    'quantity': float(req['quantity']) if req['quantity'] else 0,
                    'brand': req['brand'],
                    'size': req['size'],
                    'unit': unit,
                    'unit_price': float(unit_price) if unit_price else 0,
                    'total_price': float(req['quantity'] * unit_price) if req['quantity'] and unit_price else 0,
                    'inventory_material_id': req['inventory_material_id']
                })

            # Get CR item_name for the grouped request
            cursor.execute("""
                SELECT item_name
                FROM change_requests
                WHERE cr_id = %s
            """, (cr_id,))

            cr_result = cursor.fetchone()
            cr_item_name = cr_result['item_name'] if cr_result else 'Multiple Materials'

            # Create consolidated grouped request
            cursor.execute("""
                INSERT INTO internal_inventory_material_requests (
                    cr_id,
                    project_id,
                    request_buyer_id,
                    item_name,
                    quantity,
                    brand,
                    size,
                    status,
                    notes,
                    request_send,
                    source_type,
                    final_destination_site,
                    materials_data,
                    materials_count,
                    created_at,
                    created_by,
                    last_modified_at,
                    last_modified_by
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                RETURNING request_id
            """, (
                group['cr_id'],
                group['project_id'],
                group['request_buyer_id'],
                cr_item_name,
                len(materials_data),  # quantity = materials count
                None,  # brand (N/A for grouped)
                None,  # size (N/A for grouped)
                group['status'],
                f"Consolidated from {request_count} individual requests - CR-{cr_id}",
                True,  # request_send
                group['source_type'] or 'manual',
                group['final_destination_site'],
                json.dumps(materials_data),  # materials_data as JSONB
                len(materials_data),  # materials_count
                group['earliest_created'],
                group['first_creator'],
                datetime.utcnow(),
                'system_migration'
            ))

            new_request = cursor.fetchone()
            new_request_id = new_request['request_id']

            print(f"  ✓ Created consolidated request #{new_request_id} with {len(materials_data)} materials")

            # Delete old individual requests
            cursor.execute("""
                DELETE FROM internal_inventory_material_requests
                WHERE request_id = ANY(%s)
            """, (request_ids,))

            deleted_count += request_count
            consolidated_count += 1

            print(f"  ✓ Deleted {request_count} individual requests")
            print()

        # Commit all changes
        conn.commit()

        print("=" * 80)
        print("Migration completed successfully!")
        print("=" * 80)
        print()
        print(f"Summary:")
        print(f"  - Groups consolidated: {consolidated_count}")
        print(f"  - Individual requests deleted: {deleted_count}")
        print(f"  - New grouped requests created: {consolidated_count}")
        print()
        print("All ungrouped material requests have been consolidated!")
        print()

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        print(f"ERROR: Migration failed - {str(e)}")
        import traceback
        traceback.print_exc()
        if 'conn' in locals():
            conn.rollback()
        return False


def dry_run():
    """Preview what would be consolidated without making changes"""

    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        return False

    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        print("=" * 80)
        print("DRY RUN: Preview Consolidation")
        print("=" * 80)
        print()

        # Find all ungrouped requests
        cursor.execute("""
            SELECT
                cr_id,
                COUNT(*) as request_count,
                ARRAY_AGG(request_id ORDER BY created_at) as request_ids,
                ARRAY_AGG(item_name ORDER BY created_at) as material_names
            FROM internal_inventory_material_requests
            WHERE
                materials_data IS NULL
                AND cr_id IS NOT NULL
                AND materials_count IS NULL
            GROUP BY cr_id
            HAVING COUNT(*) > 1
            ORDER BY cr_id
        """)

        grouped_requests = cursor.fetchall()
        total_groups = len(grouped_requests)

        if total_groups == 0:
            print("  ✓ No ungrouped requests found!")
            print()
            cursor.close()
            conn.close()
            return True

        print(f"Found {total_groups} groups that would be consolidated:\n")

        total_individual = 0
        for idx, group in enumerate(grouped_requests, 1):
            cr_id = group['cr_id']
            request_count = group['request_count']
            material_names = group['material_names']

            print(f"{idx}. CR-{cr_id}: {request_count} requests")
            print(f"   Materials: {', '.join(material_names[:5])}{'...' if len(material_names) > 5 else ''}")
            print()

            total_individual += request_count

        print("=" * 80)
        print(f"Summary:")
        print(f"  - Total groups: {total_groups}")
        print(f"  - Total individual requests: {total_individual}")
        print(f"  - Would create: {total_groups} consolidated requests")
        print(f"  - Would delete: {total_individual} individual requests")
        print()
        print("Run without --dry-run to apply changes")
        print("=" * 80)

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        print(f"ERROR: Dry run failed - {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--dry-run':
        dry_run()
    else:
        print()
        print("⚠️  WARNING: This migration will consolidate ungrouped material requests.")
        print("   Run with --dry-run first to preview changes.")
        print()
        response = input("Continue with migration? (yes/no): ")
        if response.lower() in ['yes', 'y']:
            run_migration()
        else:
            print("Migration cancelled.")
