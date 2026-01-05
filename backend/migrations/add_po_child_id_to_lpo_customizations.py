"""
Migration to add po_child_id column to lpo_customizations table
This allows separate LPO customizations per PO child (split orders)
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

            # Check if column already exists
            columns = [col['name'] for col in inspector.get_columns('lpo_customizations')]

            if 'po_child_id' not in columns:
                # Add po_child_id column
                db.session.execute(db.text("""
                    ALTER TABLE lpo_customizations
                    ADD COLUMN po_child_id INTEGER REFERENCES po_child(id)
                """))
                print("Added 'po_child_id' column to lpo_customizations table")

                # Drop old unique constraint on cr_id if it exists
                try:
                    db.session.execute(db.text("""
                        ALTER TABLE lpo_customizations
                        DROP CONSTRAINT IF EXISTS lpo_customizations_cr_id_key
                    """))
                    print("Dropped old unique constraint on cr_id")
                except Exception as e:
                    print(f"Note: Could not drop old constraint (may not exist): {e}")

                # Add new unique constraint for (cr_id, po_child_id) pair
                db.session.execute(db.text("""
                    ALTER TABLE lpo_customizations
                    ADD CONSTRAINT uq_lpo_customization_cr_po_child
                    UNIQUE (cr_id, po_child_id)
                """))
                print("Added unique constraint on (cr_id, po_child_id)")

                db.session.commit()
                print("Migration completed successfully!")
            else:
                print("Column 'po_child_id' already exists in lpo_customizations table")

        except Exception as e:
            print(f"Error running migration: {e}")
            db.session.rollback()
            raise

if __name__ == '__main__':
    run_migration()
