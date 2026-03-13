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


        except Exception as e:
            raise

if __name__ == "__main__":
    main()
