"""
Migration script to convert project.user_id from Integer to JSON array
This enables multiple Project Managers to be assigned to a single project
"""

from config.db import db
from sqlalchemy import text
from app import create_app

def convert_user_id_to_json():
    """Convert user_id column from Integer to JSON array"""
    try:
        app = create_app()

        with app.app_context():

            # Step 1: Add a temporary column to store JSON data
            db.session.execute(text("""
                ALTER TABLE project
                ADD COLUMN IF NOT EXISTS user_id_json JSON
            """))
            db.session.commit()

            # Step 2: Migrate existing single user_id values to JSON array
            result = db.session.execute(text("""
                UPDATE project
                SET user_id_json = CAST(CONCAT('[', user_id, ']') AS JSON)
                WHERE user_id IS NOT NULL
            """))
            rows_updated = result.rowcount
            db.session.commit()

            # Step 3: Handle NULL values
            db.session.execute(text("""
                UPDATE project
                SET user_id_json = NULL
                WHERE user_id IS NULL
            """))
            db.session.commit()

            # Step 4: Drop old user_id column
            db.session.execute(text("""
                ALTER TABLE project
                DROP COLUMN IF EXISTS user_id
            """))
            db.session.commit()

            # Step 5: Rename temporary column to user_id
            db.session.execute(text("""
                ALTER TABLE project
                RENAME COLUMN user_id_json TO user_id
            """))
            db.session.commit()

            # Step 6: Verify the migration
            result = db.session.execute(text("""
                SELECT project_id, project_name, user_id
                FROM project
                WHERE user_id IS NOT NULL
                LIMIT 5
            """))
            for row in result:
                pass


    except Exception as e:
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return False

    return True

if __name__ == "__main__":

    confirm = input("Do you want to proceed? (yes/no): ")
    if confirm.lower() != 'yes':
        exit(0)

    success = convert_user_id_to_json()

    if not success:
        exit(1)
