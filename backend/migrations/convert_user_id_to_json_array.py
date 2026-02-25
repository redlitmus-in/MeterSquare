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
            print("=" * 60)
            print("Converting project.user_id to JSON array format")
            print("=" * 60)
            print()

            # Step 1: Add a temporary column to store JSON data
            print("[1/6] Adding temporary JSON column...")
            db.session.execute(text("""
                ALTER TABLE project
                ADD COLUMN IF NOT EXISTS user_id_json JSON
            """))
            db.session.commit()
            print("  [OK] Temporary column added")

            # Step 2: Migrate existing single user_id values to JSON array
            print("[2/6] Migrating existing user_id values to JSON arrays...")
            result = db.session.execute(text("""
                UPDATE project
                SET user_id_json = CAST(CONCAT('[', user_id, ']') AS JSON)
                WHERE user_id IS NOT NULL
            """))
            rows_updated = result.rowcount
            db.session.commit()
            print(f"  [OK] Migrated {rows_updated} projects with single PM to JSON array")

            # Step 3: Handle NULL values
            print("[3/6] Handling NULL values...")
            db.session.execute(text("""
                UPDATE project
                SET user_id_json = NULL
                WHERE user_id IS NULL
            """))
            db.session.commit()
            print("  [OK] NULL values handled")

            # Step 4: Drop old user_id column
            print("[4/6] Dropping old user_id column...")
            db.session.execute(text("""
                ALTER TABLE project
                DROP COLUMN IF EXISTS user_id
            """))
            db.session.commit()
            print("  [OK] Old column dropped")

            # Step 5: Rename temporary column to user_id
            print("[5/6] Renaming temporary column to user_id...")
            db.session.execute(text("""
                ALTER TABLE project
                RENAME COLUMN user_id_json TO user_id
            """))
            db.session.commit()
            print("  [OK] Column renamed")

            # Step 6: Verify the migration
            print("[6/6] Verifying migration...")
            result = db.session.execute(text("""
                SELECT project_id, project_name, user_id
                FROM project
                WHERE user_id IS NOT NULL
                LIMIT 5
            """))
            print("  Sample migrated data:")
            for row in result:
                print(f"    Project {row[0]} ({row[1]}): user_id = {row[2]}")

            print()
            print("=" * 60)
            print("[OK] Migration completed successfully!")
            print("=" * 60)
            print()
            print("Next steps:")
            print("1. [OK] user_id column now stores JSON arrays")
            print("2. [TODO] Update backend API to handle multiple PMs")
            print("3. [TODO] Test PM assignment with multiple PMs")
            print()

    except Exception as e:
        print(f"[ERROR] Migration failed: {e}")
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return False

    return True

if __name__ == "__main__":
    print()
    print("=" * 60)
    print("PROJECT USER_ID TO JSON ARRAY MIGRATION")
    print("=" * 60)
    print()
    print("This will convert the user_id column from Integer to JSON array")
    print("to support multiple Project Managers per project.")
    print()

    confirm = input("Do you want to proceed? (yes/no): ")
    if confirm.lower() != 'yes':
        print("Migration cancelled.")
        exit(0)

    print()
    success = convert_user_id_to_json()

    if not success:
        print("\n[ERROR] Migration failed. Please check the error above.")
        exit(1)
