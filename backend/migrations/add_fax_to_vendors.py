"""
Migration: Add fax field to vendors table
Date: 2025-12-18
"""
import sys
import os
# Add parent directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db
from sqlalchemy import text

def upgrade():
    """Add fax column to vendors table"""
    app = create_app()

    with app.app_context():
        try:
            # Add fax column to vendors table
            with db.engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE vendors
                    ADD COLUMN IF NOT EXISTS fax VARCHAR(50);
                """))
                conn.commit()

            print("[SUCCESS] Successfully added fax column to vendors table")

        except Exception as e:
            print(f"[ERROR] Error adding fax column: {str(e)}")
            raise

def downgrade():
    """Remove fax column from vendors table"""
    app = create_app()

    with app.app_context():
        try:
            # Remove fax column from vendors table
            with db.engine.connect() as conn:
                conn.execute(text("""
                    ALTER TABLE vendors
                    DROP COLUMN IF EXISTS fax;
                """))
                conn.commit()

            print("[SUCCESS] Successfully removed fax column from vendors table")

        except Exception as e:
            print(f"[ERROR] Error removing fax column: {str(e)}")
            raise

if __name__ == '__main__':
    print("Running migration: Add fax to vendors")
    upgrade()
    print("Migration completed!")
