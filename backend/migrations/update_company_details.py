"""
Migration to add company_contact_person column and update company details
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

def run_migration():
    app = create_app()
    with app.app_context():
        try:
            from sqlalchemy import inspect
            inspector = inspect(db.engine)

            # Add company_contact_person column if not exists
            try:
                columns = [col['name'] for col in inspector.get_columns('system_settings')]
                if 'company_contact_person' not in columns:
                    db.session.execute(db.text("""
                        ALTER TABLE system_settings
                        ADD COLUMN company_contact_person VARCHAR(255) DEFAULT 'Mr. Mohammed Sabir'
                    """))
                    db.session.commit()
                    print("Added 'company_contact_person' column")
                else:
                    print("Column 'company_contact_person' already exists")
            except Exception as e:
                print(f"Error adding column: {e}")
                db.session.rollback()

            # Update all company details
            db.session.execute(db.text("""
                UPDATE system_settings
                SET
                    company_name = 'Meter Square Interiors LLC',
                    company_contact_person = 'Mr. Mohammed Sabir',
                    company_phone = '06-5398189/050-1080853',
                    company_fax = '06-5398289'
            """))
            db.session.commit()
            print("Updated company details:")
            print("  - company_name: Meter Square Interiors LLC")
            print("  - company_contact_person: Mr. Mohammed Sabir")
            print("  - company_phone: 06-5398189/050-1080853")
            print("  - company_fax: 06-5398289")
            print("\nMigration completed successfully!")

        except Exception as e:
            print(f"Error running migration: {e}")
            db.session.rollback()
            raise

if __name__ == '__main__':
    run_migration()
