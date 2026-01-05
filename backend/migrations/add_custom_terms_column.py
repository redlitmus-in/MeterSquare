"""
Migration to add custom_terms column to lpo_customizations and lpo_default_templates tables
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

            # Add to lpo_customizations table
            try:
                columns = [col['name'] for col in inspector.get_columns('lpo_customizations')]
                if 'custom_terms' not in columns:
                    db.session.execute(db.text("""
                        ALTER TABLE lpo_customizations
                        ADD COLUMN custom_terms TEXT DEFAULT '[]'
                    """))
                    db.session.commit()
                    print("Successfully added 'custom_terms' column to lpo_customizations table")
                else:
                    print("Column 'custom_terms' already exists in lpo_customizations table")
            except Exception as e:
                print(f"Error with lpo_customizations: {e}")
                db.session.rollback()

            # Add to lpo_default_templates table
            try:
                columns = [col['name'] for col in inspector.get_columns('lpo_default_templates')]
                if 'custom_terms' not in columns:
                    db.session.execute(db.text("""
                        ALTER TABLE lpo_default_templates
                        ADD COLUMN custom_terms TEXT DEFAULT '[]'
                    """))
                    db.session.commit()
                    print("Successfully added 'custom_terms' column to lpo_default_templates table")
                else:
                    print("Column 'custom_terms' already exists in lpo_default_templates table")
            except Exception as e:
                print(f"Error with lpo_default_templates: {e}")
                db.session.rollback()

        except Exception as e:
            print(f"Error running migration: {e}")
            db.session.rollback()
            raise

if __name__ == '__main__':
    run_migration()
