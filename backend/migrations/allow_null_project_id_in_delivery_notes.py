"""
Migration: Allow NULL project_id in material_delivery_notes table

This change allows store transfers (Buyer -> M2 Store) to not require a project_id
since these transfers are not associated with any specific project.

Run this migration: python migrations/allow_null_project_id_in_delivery_notes.py
"""

import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Get database URL from environment
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    exit(1)


def run_migration():
    """Alter material_delivery_notes to allow NULL project_id"""

    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Alter the column to allow NULL
        alter_query = text("""
            ALTER TABLE material_delivery_notes
            ALTER COLUMN project_id DROP NOT NULL;
        """)

        session.execute(alter_query)
        session.commit()


        return True

    except Exception as e:
        session.rollback()
        return False
    finally:
        session.close()


if __name__ == "__main__":

    success = run_migration()

    if success:
        pass
    else:
        exit(1)
