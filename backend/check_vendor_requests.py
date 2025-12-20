"""
Debug script to check if Internal Material Requests were created from vendor delivery
"""
import psycopg2
import os

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cursor = conn.cursor()

print('\n' + '='*70)
print('CHECKING INTERNAL MATERIAL REQUESTS CREATED BY BUYER')
print('='*70)

# Check for recently created requests from vendor delivery
cursor.execute('''
    SELECT
        request_id,
        cr_id,
        material_name,
        quantity,
        status,
        source_type,
        final_destination_site,
        routed_by_buyer_id,
        routed_to_store_at,
        created_at
    FROM internal_inventory_material_requests
    WHERE source_type = 'from_vendor_delivery'
    ORDER BY created_at DESC
    LIMIT 10
''')

requests = cursor.fetchall()

if requests:
    print(f'\nFound {len(requests)} requests with source_type = "from_vendor_delivery":\n')
    for r in requests:
        print(f'Request ID: {r[0]}')
        print(f'  CR ID: {r[1]}')
        print(f'  Material: {r[2]}')
        print(f'  Quantity: {r[3]}')
        print(f'  Status: {r[4]}')
        print(f'  Source Type: {r[5]}')
        print(f'  Destination Site: {r[6]}')
        print(f'  Routed By Buyer ID: {r[7]}')
        print(f'  Routed At: {r[8]}')
        print(f'  Created At: {r[9]}')
        print()
else:
    print('\n❌ NO requests found with source_type = "from_vendor_delivery"')
    print('\nThis means the auto-creation code in complete_purchase() did not execute!')

# Also check the most recent change request that was completed
print('\n' + '='*70)
print('CHECKING MOST RECENT COMPLETED CHANGE REQUEST')
print('='*70)

cursor.execute('''
    SELECT
        cr_id,
        status,
        delivery_routing,
        store_request_status,
        updated_at
    FROM change_requests
    WHERE status IN ('routed_to_store', 'purchase_completed')
    ORDER BY updated_at DESC
    LIMIT 5
''')

crs = cursor.fetchall()

if crs:
    print(f'\nFound {len(crs)} recent completed change requests:\n')
    for cr in crs:
        print(f'CR ID: {cr[0]}')
        print(f'  Status: {cr[1]}')
        print(f'  Delivery Routing: {cr[2]}')
        print(f'  Store Request Status: {cr[3]}')
        print(f'  Updated At: {cr[4]}')
        print()

print('='*70)

cursor.close()
conn.close()
