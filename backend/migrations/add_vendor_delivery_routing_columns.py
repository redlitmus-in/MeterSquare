"""
Migration: Add Vendor Delivery Routing columns to internal_inventory_material_requests table
Date: 2025-12-29
Description: Adds columns for the "Complete & Send to Store" feature that routes
             vendor deliveries through the M2 Store

Columns added:
- source_type: 'manual' or 'from_vendor_delivery'
- vendor_delivery_confirmed: Boolean - Vendor delivered to store
- final_destination_site: Which site gets materials
- intended_recipient_name: Site engineer who will receive delivery
- routed_by_buyer_id: Buyer who routed this
- routed_to_store_at: When buyer completed routing
"""

import os
import sys
from datetime import datetime

# Add the parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def run_migration():
    """Add vendor delivery routing columns to internal_inventory_material_requests table"""

    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            log.info("=" * 70)
            log.info("MIGRATION: Add Vendor Delivery Routing Columns")
            log.info("Table: internal_inventory_material_requests")
            log.info("=" * 70)

            # Define columns to add with their specifications
            columns_to_add = [
                {
                    'name': 'source_type',
                    'type': "VARCHAR(50) DEFAULT 'manual'",
                    'description': "Source type: 'manual' or 'from_vendor_delivery'"
                },
                {
                    'name': 'vendor_delivery_confirmed',
                    'type': 'BOOLEAN DEFAULT FALSE',
                    'description': 'Vendor delivered to store'
                },
                {
                    'name': 'final_destination_site',
                    'type': 'VARCHAR(255)',
                    'description': 'Which site gets materials'
                },
                {
                    'name': 'intended_recipient_name',
                    'type': 'VARCHAR(255)',
                    'description': 'Site engineer who will receive delivery'
                },
                {
                    'name': 'routed_by_buyer_id',
                    'type': 'INTEGER',
                    'description': 'Buyer who routed this'
                },
                {
                    'name': 'routed_to_store_at',
                    'type': 'TIMESTAMP',
                    'description': 'When buyer completed routing'
                }
            ]

            # Check which columns already exist
            existing_columns_query = text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'internal_inventory_material_requests'
            """)

            result = db.session.execute(existing_columns_query)
            existing_columns = {row[0] for row in result}

            log.info(f"Existing columns: {len(existing_columns)}")

            columns_added = 0
            columns_skipped = 0

            for col in columns_to_add:
                col_name = col['name']
                col_type = col['type']
                col_desc = col['description']

                if col_name in existing_columns:
                    log.info(f"  [SKIP] Column '{col_name}' already exists")
                    columns_skipped += 1
                else:
                    log.info(f"  [ADD] Adding column '{col_name}' ({col_desc})")
                    alter_query = text(f"""
                        ALTER TABLE internal_inventory_material_requests
                        ADD COLUMN IF NOT EXISTS {col_name} {col_type}
                    """)
                    db.session.execute(alter_query)
                    columns_added += 1

            db.session.commit()

            log.info("")
            log.info("=" * 70)
            log.info("MIGRATION COMPLETED SUCCESSFULLY")
            log.info(f"  Columns added: {columns_added}")
            log.info(f"  Columns skipped (already exist): {columns_skipped}")
            log.info("=" * 70)

            return True

        except Exception as e:
            db.session.rollback()
            log.error(f"Migration failed: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
