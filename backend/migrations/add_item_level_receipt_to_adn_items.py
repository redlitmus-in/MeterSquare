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

        print("Connected to database successfully")

        # Check if is_received column exists
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'asset_delivery_note_items'
            AND column_name = 'is_received'
        """)

        if cursor.fetchone():
            print("✓ Column 'is_received' already exists in asset_delivery_note_items table")
        else:
            # Add new columns for item-level receipt tracking
            print("Adding item-level receipt columns...")

            cursor.execute("""
                ALTER TABLE asset_delivery_note_items
                ADD COLUMN is_received BOOLEAN DEFAULT FALSE
            """)
            print("  ✓ Added is_received column")

            cursor.execute("""
                ALTER TABLE asset_delivery_note_items
                ADD COLUMN received_at TIMESTAMP
            """)
            print("  ✓ Added received_at column")

            cursor.execute("""
                ALTER TABLE asset_delivery_note_items
                ADD COLUMN received_by VARCHAR(255)
            """)
            print("  ✓ Added received_by column")

            cursor.execute("""
                ALTER TABLE asset_delivery_note_items
                ADD COLUMN received_by_id INTEGER
            """)
            print("  ✓ Added received_by_id column")

            print("✓ Successfully added item-level receipt columns")

            # Update existing items in DELIVERED ADNs to mark them as received
            print("\nUpdating existing DELIVERED items to is_received=TRUE...")

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
            print(f"✓ Updated {updated_count} existing DELIVERED items to is_received=TRUE")

        print("\n✓ Migration completed successfully!")
        return True

    except Exception as e:
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
