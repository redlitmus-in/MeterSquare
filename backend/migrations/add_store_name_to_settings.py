"""
Migration script to add store_name column to system_settings table
"""

import sys
import os

# Add the parent directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

app = create_app()


def add_store_name_column():
    """Add store_name column to system_settings table"""

    with app.app_context():
        try:
            # Check if column already exists
            result = db.session.execute(db.text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'system_settings' AND column_name = 'store_name'
            """))

            if result.fetchone():
                print("Column 'store_name' already exists in system_settings table. Skipping.")
                return

            # Add the column
            db.session.execute(db.text("""
                ALTER TABLE system_settings
                ADD COLUMN store_name VARCHAR(255) DEFAULT 'M2 Store'
            """))
            db.session.commit()
            print("Successfully added 'store_name' column to system_settings table!")

        except Exception as e:
            db.session.rollback()
            print(f"Error adding store_name column: {e}")
            raise


if __name__ == "__main__":
    add_store_name_column()
