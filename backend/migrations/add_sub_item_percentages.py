"""
Migration script to add per-sub-item percentage columns to boq_sub_items table
This implements the top-down calculation approach matching the PDF format
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

app = create_app()

def add_sub_item_percentage_columns():
    """Add new percentage and cost breakdown columns to boq_sub_items table"""

    with app.app_context():
        try:
            # SQL statements to add new columns
            sql_statements = [
                # Per-sub-item percentages
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS misc_percentage FLOAT DEFAULT 10.0;",
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS misc_amount FLOAT DEFAULT 0.0;",
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS overhead_profit_percentage FLOAT DEFAULT 25.0;",
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS overhead_profit_amount FLOAT DEFAULT 0.0;",
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS transport_percentage FLOAT DEFAULT 5.0;",
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS transport_amount FLOAT DEFAULT 0.0;",

                # Cost breakdown fields
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS material_cost FLOAT DEFAULT 0.0;",
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS labour_cost FLOAT DEFAULT 0.0;",
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS internal_cost FLOAT DEFAULT 0.0;",
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS planned_profit FLOAT DEFAULT 0.0;",
                "ALTER TABLE boq_sub_items ADD COLUMN IF NOT EXISTS actual_profit FLOAT DEFAULT 0.0;",
            ]

            print("Adding new columns to boq_sub_items table...")

            for sql in sql_statements:
                db.session.execute(db.text(sql))

            db.session.commit()
            print("[SUCCESS] Successfully added all new columns to boq_sub_items table")

            # Update existing records with default values
            print("\nUpdating existing sub-items with default percentage values...")
            update_sql = """
                UPDATE boq_sub_items
                SET
                    misc_percentage = COALESCE(misc_percentage, 10.0),
                    misc_amount = COALESCE(misc_amount, 0.0),
                    overhead_profit_percentage = COALESCE(overhead_profit_percentage, 25.0),
                    overhead_profit_amount = COALESCE(overhead_profit_amount, 0.0),
                    transport_percentage = COALESCE(transport_percentage, 5.0),
                    transport_amount = COALESCE(transport_amount, 0.0),
                    material_cost = COALESCE(material_cost, 0.0),
                    labour_cost = COALESCE(labour_cost, 0.0),
                    internal_cost = COALESCE(internal_cost, 0.0),
                    planned_profit = COALESCE(planned_profit, 0.0),
                    actual_profit = COALESCE(actual_profit, 0.0)
                WHERE sub_item_id IS NOT NULL;
            """
            db.session.execute(db.text(update_sql))
            db.session.commit()

            print("[SUCCESS] Successfully updated existing sub-items with default values")

            # Verify the changes
            verify_sql = "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'boq_sub_items' AND column_name IN ('misc_percentage', 'overhead_profit_percentage', 'transport_percentage', 'material_cost', 'labour_cost', 'internal_cost', 'planned_profit', 'actual_profit') ORDER BY column_name;"
            result = db.session.execute(db.text(verify_sql))

            print("\n[SUCCESS] Migration completed! New columns added:")
            for row in result:
                print(f"  - {row[0]} ({row[1]}) DEFAULT {row[2]}")

        except Exception as e:
            db.session.rollback()
            print(f"[ERROR] Error during migration: {str(e)}")
            raise
        finally:
            db.session.close()

if __name__ == "__main__":
    print("=" * 70)
    print("BOQ Sub-Item Percentage Columns Migration")
    print("=" * 70)
    print("\nThis migration adds per-sub-item percentage calculation fields")
    print("to support top-down cost breakdown matching PDF format.\n")

    add_sub_item_percentage_columns()

    print("\n" + "=" * 70)
    print("Migration completed successfully!")
    print("=" * 70)
