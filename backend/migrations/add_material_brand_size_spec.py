"""
Migration script to add brand, size, and specification fields to boq_material table
Run this script to add material detail fields to existing database
"""

import sys
import os
# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app
from sqlalchemy import text

def add_material_fields():
    """Add brand, size, and specification columns to boq_material table"""
    try:
        app = create_app()

        with app.app_context():
            # Check if columns already exist
            check_query = text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'boq_material'
                AND column_name IN ('brand', 'size', 'specification')
            """)

            existing_columns = [row[0] for row in db.session.execute(check_query)]

            columns_to_add = []
            if 'brand' not in existing_columns:
                columns_to_add.append("ADD COLUMN brand VARCHAR(255)")
            if 'size' not in existing_columns:
                columns_to_add.append("ADD COLUMN size VARCHAR(255)")
            if 'specification' not in existing_columns:
                columns_to_add.append("ADD COLUMN specification TEXT")

            if columns_to_add:
                # Add the new columns
                alter_query = text(f"""
                    ALTER TABLE boq_material
                    {', '.join(columns_to_add)}
                """)

                db.session.execute(alter_query)
                db.session.commit()

            else:
                pass

    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == "__main__":

    success = add_material_fields()

    if success:
        pass
    else:
        pass
