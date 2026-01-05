"""
Migration script to add delivery_note_item_id column to material_returns table
and clean up invalid return records.

Run this script:
python migrations/add_delivery_note_item_to_returns.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db
from sqlalchemy import text

app = create_app()

def run_migration():
    with app.app_context():
        try:
            # Step 1: Add delivery_note_item_id column
            print("Step 1: Adding delivery_note_item_id column...")
            db.session.execute(text("""
                ALTER TABLE material_returns
                ADD COLUMN IF NOT EXISTS delivery_note_item_id INTEGER
                REFERENCES delivery_note_items(item_id);
            """))
            db.session.commit()
            print("  Column added successfully.")

            # Step 2: Clean up invalid return records (returns without valid delivery)
            print("\nStep 2: Checking for invalid return records...")

            # Find returns that don't have a matching delivery note item
            invalid_returns = db.session.execute(text("""
                SELECT mr.return_id, mr.inventory_material_id, mr.project_id,
                       mr.quantity, mr.condition, mr.created_at,
                       im.material_name
                FROM material_returns mr
                LEFT JOIN inventory_materials im ON mr.inventory_material_id = im.inventory_material_id
                WHERE mr.delivery_note_item_id IS NULL
                AND NOT EXISTS (
                    SELECT 1 FROM delivery_note_items dni
                    JOIN material_delivery_notes mdn ON dni.delivery_note_id = mdn.delivery_note_id
                    WHERE dni.inventory_material_id = mr.inventory_material_id
                    AND mdn.project_id = mr.project_id
                    AND mdn.status IN ('ISSUED', 'IN_TRANSIT', 'DELIVERED')
                    AND mdn.created_at <= mr.created_at
                )
            """)).fetchall()

            if invalid_returns:
                print(f"  Found {len(invalid_returns)} invalid return record(s):")
                for r in invalid_returns:
                    print(f"    - Return ID {r[0]}: {r[6]} ({r[3]} units, {r[4]}) created {r[5]}")

                # Delete invalid returns
                print("\n  Deleting invalid return records...")
                db.session.execute(text("""
                    DELETE FROM material_returns
                    WHERE delivery_note_item_id IS NULL
                    AND NOT EXISTS (
                        SELECT 1 FROM delivery_note_items dni
                        JOIN material_delivery_notes mdn ON dni.delivery_note_id = mdn.delivery_note_id
                        WHERE dni.inventory_material_id = material_returns.inventory_material_id
                        AND mdn.project_id = material_returns.project_id
                        AND mdn.status IN ('ISSUED', 'IN_TRANSIT', 'DELIVERED')
                        AND mdn.created_at <= material_returns.created_at
                    )
                """))
                db.session.commit()
                print("  Invalid records deleted.")
            else:
                print("  No invalid return records found.")

            # Step 3: Link existing valid returns to their delivery note items
            print("\nStep 3: Linking existing returns to delivery note items...")
            db.session.execute(text("""
                UPDATE material_returns mr
                SET delivery_note_item_id = (
                    SELECT dni.item_id
                    FROM delivery_note_items dni
                    JOIN material_delivery_notes mdn ON dni.delivery_note_id = mdn.delivery_note_id
                    WHERE dni.inventory_material_id = mr.inventory_material_id
                    AND mdn.project_id = mr.project_id
                    AND mdn.status IN ('ISSUED', 'IN_TRANSIT', 'DELIVERED')
                    AND mdn.created_at <= mr.created_at
                    ORDER BY mdn.created_at DESC
                    LIMIT 1
                )
                WHERE mr.delivery_note_item_id IS NULL
            """))
            db.session.commit()
            print("  Existing returns linked to delivery note items.")

            print("\nMigration completed successfully!")

        except Exception as e:
            db.session.rollback()
            print(f"Error during migration: {str(e)}")
            raise

if __name__ == '__main__':
    run_migration()
