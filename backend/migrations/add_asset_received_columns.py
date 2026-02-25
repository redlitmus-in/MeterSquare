"""
Migration: Add received_at and received_by columns to asset_movements
Purpose: Track when Site Engineer acknowledges receipt of dispatched assets
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db


def add_received_columns():
    """Add received tracking columns to asset_movements table"""
    app = create_app()

    with app.app_context():
        # Check if columns already exist
        result = db.session.execute(db.text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'asset_movements'
            AND column_name IN ('received_at', 'received_by', 'received_by_id');
        """))
        existing_columns = [row[0] for row in result.fetchall()]

        columns_to_add = []

        if 'received_at' not in existing_columns:
            columns_to_add.append("ADD COLUMN received_at TIMESTAMP")

        if 'received_by' not in existing_columns:
            columns_to_add.append("ADD COLUMN received_by VARCHAR(255)")

        if 'received_by_id' not in existing_columns:
            columns_to_add.append("ADD COLUMN received_by_id INTEGER")

        if not columns_to_add:
            print("All columns already exist. Nothing to do.")
            return True

        try:
            alter_sql = f"ALTER TABLE asset_movements {', '.join(columns_to_add)};"
            db.session.execute(db.text(alter_sql))
            db.session.commit()
            print(f"Added columns: {columns_to_add}")
            return True

        except Exception as e:
            db.session.rollback()
            print(f"Error adding columns: {e}")
            return False


if __name__ == "__main__":
    print("=" * 70)
    print("Migration: Add received tracking columns to asset_movements")
    print("=" * 70)
    print()

    success = add_received_columns()

    if success:
        print()
        print("=" * 70)
        print("Migration Complete!")
        print("=" * 70)
        print()
        print("New columns added to asset_movements:")
        print("  - received_at: When SE acknowledged receipt")
        print("  - received_by: Name of SE who received")
        print("  - received_by_id: ID of SE who received")
    else:
        print()
        print("Migration Failed! Please check the error above.")
        sys.exit(1)
