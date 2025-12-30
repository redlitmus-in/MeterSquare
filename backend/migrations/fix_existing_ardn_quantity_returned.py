"""
Migration: Fix existing ARDN quantity_returned
This script syncs quantity_returned on ADN items based on existing ARDN items
that were created before the fix was applied.
"""

import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def run_migration():
    """Sync quantity_returned from existing ARDN items to ADN items"""

    conn = None
    try:
        # Connect using DATABASE_URL environment variable
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = False
        cursor = conn.cursor()

        print("Connected to database successfully")

        # Find all ARDN items that have original_adn_item_id set
        cursor.execute("""
            SELECT
                ardn_item.original_adn_item_id,
                SUM(ardn_item.quantity) as total_returned
            FROM asset_return_delivery_note_items ardn_item
            WHERE ardn_item.original_adn_item_id IS NOT NULL
            GROUP BY ardn_item.original_adn_item_id
        """)

        ardn_items = cursor.fetchall()
        print(f"Found {len(ardn_items)} ADN items with returns")

        updated_count = 0
        for original_adn_item_id, total_returned in ardn_items:
            # Get the original ADN item
            cursor.execute("""
                SELECT item_id, quantity, quantity_returned, status
                FROM asset_delivery_note_items
                WHERE item_id = %s
            """, (original_adn_item_id,))

            adn_item = cursor.fetchone()
            if not adn_item:
                print(f"  Warning: ADN item {original_adn_item_id} not found")
                continue

            item_id, quantity, current_returned, current_status = adn_item
            current_returned = current_returned or 0

            # Only update if there's a difference
            if current_returned != total_returned:
                # Determine new status
                if total_returned >= quantity:
                    new_status = 'fully_returned'
                elif total_returned > 0:
                    new_status = 'partial_return'
                else:
                    new_status = 'dispatched'

                cursor.execute("""
                    UPDATE asset_delivery_note_items
                    SET quantity_returned = %s, status = %s
                    WHERE item_id = %s
                """, (total_returned, new_status, item_id))

                print(f"  Updated ADN item {item_id}: quantity_returned {current_returned} -> {total_returned}, status -> {new_status}")
                updated_count += 1
            else:
                print(f"  ADN item {item_id}: already correct (quantity_returned={current_returned})")

        conn.commit()
        print(f"\n✓ Migration completed successfully! Updated {updated_count} items.")
        return True

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"\n✗ Migration failed: {str(e)}")
        return False

    finally:
        if conn:
            conn.close()
            print("Database connection closed")


if __name__ == '__main__':
    import sys
    success = run_migration()
    sys.exit(0 if success else 1)
