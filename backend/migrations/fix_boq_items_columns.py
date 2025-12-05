"""
Migration: Fix boq_items table columns
- Renames overhead_profit_percentage to profit_margin_percentage
- Renames overhead_profit_amount to profit_margin_amount
- Adds overhead_percentage and overhead_amount columns
- Adds size column to boq_sub_items
"""

import sys
import os

# Set UTF-8 encoding for console output
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config.db import db
from app import create_app
from sqlalchemy import text

app = create_app()

def fix_boq_items_columns():
    """Fix column names and add missing columns in boq_items and boq_sub_items tables"""

    with app.app_context():
        try:
            with db.engine.connect() as conn:
                print("Starting migration...")

                # Check if old columns exist
                check_query = text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'boq_items'
                    AND column_name IN ('overhead_profit_percentage', 'overhead_profit_amount',
                                       'overhead_percentage', 'overhead_amount',
                                       'profit_margin_percentage', 'profit_margin_amount');
                """)
                result = conn.execute(check_query)
                existing_columns = [row[0] for row in result]
                print(f"Existing columns: {existing_columns}")

                # Rename overhead_profit_percentage to profit_margin_percentage if needed
                if 'overhead_profit_percentage' in existing_columns and 'profit_margin_percentage' not in existing_columns:
                    print("Renaming overhead_profit_percentage to profit_margin_percentage...")
                    conn.execute(text("""
                        ALTER TABLE boq_items
                        RENAME COLUMN overhead_profit_percentage TO profit_margin_percentage;
                    """))
                    conn.commit()
                    print("✅ Renamed overhead_profit_percentage to profit_margin_percentage")

                # Rename overhead_profit_amount to profit_margin_amount if needed
                if 'overhead_profit_amount' in existing_columns and 'profit_margin_amount' not in existing_columns:
                    print("Renaming overhead_profit_amount to profit_margin_amount...")
                    conn.execute(text("""
                        ALTER TABLE boq_items
                        RENAME COLUMN overhead_profit_amount TO profit_margin_amount;
                    """))
                    conn.commit()
                    print("✅ Renamed overhead_profit_amount to profit_margin_amount")

                # Add overhead_percentage column if it doesn't exist
                if 'overhead_percentage' not in existing_columns:
                    print("Adding overhead_percentage column...")
                    conn.execute(text("""
                        ALTER TABLE boq_items
                        ADD COLUMN overhead_percentage FLOAT;
                    """))
                    conn.commit()
                    print("✅ Added overhead_percentage column")

                # Add overhead_amount column if it doesn't exist
                if 'overhead_amount' not in existing_columns:
                    print("Adding overhead_amount column...")
                    conn.execute(text("""
                        ALTER TABLE boq_items
                        ADD COLUMN overhead_amount FLOAT;
                    """))
                    conn.commit()
                    print("✅ Added overhead_amount column")

                # Add size column to boq_sub_items if it doesn't exist
                print("\nChecking boq_sub_items table...")
                check_sub_items = text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'boq_sub_items'
                    AND column_name = 'size';
                """)
                result = conn.execute(check_sub_items)
                has_size = len(list(result)) > 0

                if not has_size:
                    print("Adding size column to boq_sub_items...")
                    conn.execute(text("""
                        ALTER TABLE boq_sub_items
                        ADD COLUMN size VARCHAR(255);
                    """))
                    conn.commit()
                    print("✅ Added size column to boq_sub_items")
                else:
                    print("ℹ️  size column already exists in boq_sub_items")

                print("\n✅ Migration completed successfully!")

        except Exception as e:
            print(f"\n❌ Error during migration: {str(e)}")
            raise

if __name__ == "__main__":
    fix_boq_items_columns()
