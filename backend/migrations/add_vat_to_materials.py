"""
Migration script to add vat_percentage column to boq_material table
"""
from sqlalchemy import text
from config.db import db
from app import create_app

def main():
    app = create_app()

    with app.app_context():
        try:
            # Add vat_percentage column to boq_material table
            with db.engine.connect() as conn:
                conn.execute(text('''
                    ALTER TABLE boq_material
                    ADD COLUMN IF NOT EXISTS vat_percentage DECIMAL(5,2) DEFAULT 0
                '''))
                conn.commit()

            print("VAT percentage column added to boq_material table successfully")

        except Exception as e:
            print(f"Error adding VAT percentage column: {str(e)}")
            raise

if __name__ == "__main__":
    main()
