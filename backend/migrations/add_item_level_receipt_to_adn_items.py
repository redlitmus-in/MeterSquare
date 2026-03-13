"""
Migration: Add item-level receipt tracking to asset_delivery_note_items table
This enables selective receiving where SE can mark individual items as received
instead of marking entire ADN at once.
"""

import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def run_migration():
    """Add item-level receipt columns to asset_delivery_note_items"""

    conn = None
    try:
        # Connect using DATABASE_URL environment variable
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("DATABASE_URL not found in environment variables")

        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()


        # Check if is_received column exists
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'asset_delivery_note_items'
            AND column_name = 'is_received'
        """)

        if cursor.fetchone():
            pass
        else:
            # Add new columns for item-level receipt tracking

            cursor.execute("""
                ALTER TABLE asset_delivery_note_items
                ADD COLUMN is_received BOOLEAN DEFAULT FALSE
            """)

            cursor.execute("""
                ALTER TABLE asset_delivery_note_items
                ADD COLUMN received_at TIMESTAMP
            """)

            cursor.execute("""
                ALTER TABLE asset_delivery_note_items
                ADD COLUMN received_by VARCHAR(255)
            """)

            cursor.execute("""
                ALTER TABLE asset_delivery_note_items
                ADD COLUMN received_by_id INTEGER
            """)


            # Update existing items in DELIVERED ADNs to mark them as received

            cursor.execute("""
                UPDATE asset_delivery_note_items
                SET is_received = TRUE,
                    received_at = adn.received_at,
                    received_by = adn.received_by,
                    received_by_id = adn.received_by_id
                FROM asset_delivery_notes adn
                WHERE asset_delivery_note_items.adn_id = adn.adn_id
                AND adn.status = 'DELIVERED'
                AND adn.received_at IS NOT NULL
            """)

            updated_count = cursor.rowcount

        return True

    except Exception as e:
        return False

    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    import sys
    success = run_migration()
    sys.exit(0 if success else 1)
