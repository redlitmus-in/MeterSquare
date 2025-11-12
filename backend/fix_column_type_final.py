import sys
sys.path.insert(0, '.')

from app import create_app
from models import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    print("=" * 60)
    print("FIXING PROJECT.USER_ID COLUMN TYPE")
    print("=" * 60)

    # Check current type
    result = db.session.execute(text("""
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name='project' AND column_name='user_id'
    """))
    current_type = result.scalar()
    print(f"\nCurrent column type: {current_type}")

    if current_type == 'integer':
        print("\nConverting integer to jsonb...")

        # Step 1: Add temporary column
        print("[1/4] Adding temporary jsonb column...")
        db.session.execute(text("""
            ALTER TABLE project
            ADD COLUMN IF NOT EXISTS user_id_temp jsonb
        """))
        db.session.commit()

        # Step 2: Convert data
        print("[2/4] Converting existing data to JSON arrays...")
        db.session.execute(text("""
            UPDATE project
            SET user_id_temp = to_jsonb(ARRAY[user_id])
            WHERE user_id IS NOT NULL
        """))
        db.session.commit()

        # Step 3: Drop old column and rename
        print("[3/4] Dropping old column...")
        db.session.execute(text("""
            ALTER TABLE project DROP COLUMN user_id
        """))
        db.session.commit()

        print("[4/4] Renaming temp column...")
        db.session.execute(text("""
            ALTER TABLE project RENAME COLUMN user_id_temp TO user_id
        """))
        db.session.commit()

        print("\n[OK] Conversion complete!")

        # Verify
        result = db.session.execute(text("""
            SELECT data_type
            FROM information_schema.columns
            WHERE table_name='project' AND column_name='user_id'
        """))
        new_type = result.scalar()
        print(f"New column type: {new_type}")

        # Show sample data
        result = db.session.execute(text("""
            SELECT project_id, project_name, user_id
            FROM project
            WHERE user_id IS NOT NULL
            LIMIT 5
        """))
        print("\nSample converted data:")
        for row in result:
            print(f"  Project {row[0]} ({row[1]}): {row[2]}")
    else:
        print(f"\n[INFO] Column is already {current_type} type")
