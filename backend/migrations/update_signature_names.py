"""
Migration to update MD and TD names in system_settings
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
            # Check current values
            result = db.session.execute(db.text("""
                SELECT md_name, td_name FROM system_settings LIMIT 1
            """))
            row = result.fetchone()

            if row:
                print(f"Current MD Name: {row[0]}")
                print(f"Current TD Name: {row[1]}")

                # Update with actual names if they are still defaults
                if row[0] == 'Managing Director' or row[0] is None:
                    db.session.execute(db.text("""
                        UPDATE system_settings
                        SET md_name = 'Amjath K Aboobacker'
                        WHERE md_name = 'Managing Director' OR md_name IS NULL
                    """))
                    print("Updated MD Name to 'Amjath K Aboobacker'")

                if row[1] == 'Technical Director' or row[1] is None:
                    db.session.execute(db.text("""
                        UPDATE system_settings
                        SET td_name = 'Sujith George Charly'
                        WHERE td_name = 'Technical Director' OR td_name IS NULL
                    """))
                    print("Updated TD Name to 'Sujith George Charly'")

                db.session.commit()
                print("Migration completed successfully!")
            else:
                print("No system_settings record found")

        except Exception as e:
            print(f"Error running migration: {e}")
            db.session.rollback()
            raise

if __name__ == '__main__':
    run_migration()
