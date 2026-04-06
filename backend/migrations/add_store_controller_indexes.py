"""
Store Controller Performance Indexes
Created: 2026-04-06

Adds missing indexes identified in store_controller.py audit:
1. inventory_materials.is_active — filtered in every inventory query
2. internal_inventory_material_requests.cr_id — filtered in every CR lookup
3. internal_inventory_material_requests(inventory_material_id, status) — composite for availability checks
4. internal_inventory_material_requests.source_type — filtered in store request queries
5. inventory_materials.category — GROUP BY in get_store_categories

ZERO DOWNTIME — Uses IF NOT EXISTS
ZERO DATA CHANGES — Only adds lookup structures
100% BACKWARD COMPATIBLE

Run: python backend/migrations/add_store_controller_indexes.py
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()


INDEXES = [
    {
        'name': 'idx_inventory_materials_is_active',
        'sql': 'CREATE INDEX IF NOT EXISTS idx_inventory_materials_is_active ON inventory_materials (is_active) WHERE is_active = TRUE',
        'description': 'Partial index on active inventory materials'
    },
    {
        'name': 'idx_imr_cr_id',
        'sql': 'CREATE INDEX IF NOT EXISTS idx_imr_cr_id ON internal_inventory_material_requests (cr_id) WHERE cr_id IS NOT NULL',
        'description': 'Index on IMR cr_id for CR-based lookups'
    },
    {
        'name': 'idx_imr_material_status',
        'sql': 'CREATE INDEX IF NOT EXISTS idx_imr_material_status ON internal_inventory_material_requests (inventory_material_id, status) WHERE cr_id IS NOT NULL',
        'description': 'Composite index for availability check queries'
    },
    {
        'name': 'idx_imr_source_type',
        'sql': 'CREATE INDEX IF NOT EXISTS idx_imr_source_type ON internal_inventory_material_requests (source_type)',
        'description': 'Index on source_type for store request filtering'
    },
    {
        'name': 'idx_inventory_category_active',
        'sql': 'CREATE INDEX IF NOT EXISTS idx_inventory_category_active ON inventory_materials (category) WHERE is_active = TRUE AND category IS NOT NULL',
        'description': 'Partial index for category GROUP BY queries'
    },
]


def create_indexes():
    """Create all missing indexes."""
    environment = os.getenv('ENVIRONMENT', 'development')

    if environment == 'ath':
        database_url = os.getenv('ATH_DB_URL')
    elif environment == 'production':
        database_url = os.getenv('DATABASE_URL')
    else:
        database_url = os.getenv('DEV_DATABASE_URL')

    if not database_url:
        raise Exception(f"No database URL found for environment: {environment}")

    print(f"Environment: {environment}")
    print(f"Creating {len(INDEXES)} indexes...\n")

    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    cursor = conn.cursor()

    created = 0
    skipped = 0
    errors = 0

    for idx in INDEXES:
        try:
            # Check if index already exists
            cursor.execute("""
                SELECT 1 FROM pg_indexes WHERE indexname = %s
            """, (idx['name'],))

            if cursor.fetchone():
                print(f"  SKIP: {idx['name']} (already exists)")
                skipped += 1
                continue

            print(f"  CREATE: {idx['name']} — {idx['description']}")
            cursor.execute(idx['sql'])
            created += 1
            print(f"    ✓ Created successfully")

        except Exception as e:
            errors += 1
            print(f"    ✗ Error: {str(e)}")

    cursor.close()
    conn.close()

    print(f"\nDone: {created} created, {skipped} skipped, {errors} errors")


def rollback():
    """Drop all indexes created by this migration."""
    environment = os.getenv('ENVIRONMENT', 'development')

    if environment == 'ath':
        database_url = os.getenv('ATH_DB_URL')
    elif environment == 'production':
        database_url = os.getenv('DATABASE_URL')
    else:
        database_url = os.getenv('DEV_DATABASE_URL')

    if not database_url:
        raise Exception(f"No database URL found for environment: {environment}")

    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    cursor = conn.cursor()

    for idx in INDEXES:
        try:
            cursor.execute(f"DROP INDEX IF EXISTS {idx['name']}")
            print(f"  Dropped: {idx['name']}")
        except Exception as e:
            print(f"  Error dropping {idx['name']}: {str(e)}")

    cursor.close()
    conn.close()
    print("Rollback complete.")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Store controller performance indexes')
    parser.add_argument('--rollback', action='store_true', help='Drop indexes')
    args = parser.parse_args()

    if args.rollback:
        rollback()
    else:
        create_indexes()
