"""
Migration: Revert project.user_id column type from INTEGER to JSON

This migration reverts the user_id column back to JSON type.

Run this migration: python backend/migrations/revert_project_user_id_type.py
"""

import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config.db import db
from sqlalchemy import text
from flask import Flask

def run_migration():
    """Revert project.user_id column type from INTEGER to JSON"""

    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        print("Usage: DATABASE_URL='postgresql://...' python migrations/revert_project_user_id_type.py")
        return False

    # Create Flask app context
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    with app.app_context():
        try:
            print("=" * 60)
            print("MIGRATION: Revert project.user_id column type to JSON")
            print("=" * 60)

            # Check current column type
            check_type_query = text("""
                SELECT data_type, column_name
                FROM information_schema.columns
                WHERE table_name = 'project' AND column_name = 'user_id'
            """)

            result = db.session.execute(check_type_query).fetchone()

            if result:
                current_type = result[0]
                print(f"\n✓ Current type of user_id column: {current_type}")

                if current_type.lower() in ['json', 'jsonb']:
                    print("\n✓ Column is already JSON/JSONB type - no revert needed")
                    print("=" * 60)
                    return True
                elif current_type.lower() == 'integer':
                    print("\n⚠️  Column is INTEGER type - reverting to JSON")

                    # Step 1: Check if there's any data
                    count_query = text("SELECT COUNT(*) FROM project")
                    count = db.session.execute(count_query).scalar()
                    print(f"✓ Found {count} projects in database")

                    # Step 2: Alter column type back to JSON
                    print("\n→ Altering column type to JSON...")

                    alter_query = text("""
                        ALTER TABLE project
                        ALTER COLUMN user_id TYPE JSON
                        USING CASE
                            WHEN user_id IS NOT NULL THEN to_jsonb(user_id)
                            ELSE NULL
                        END
                    """)

                    db.session.execute(alter_query)
                    db.session.commit()

                    print("✓ Column type changed to JSON")

                    # Verify the change
                    result_after = db.session.execute(check_type_query).fetchone()
                    new_type = result_after[0]
                    print(f"✓ Verified new type: {new_type}")

                    if new_type.lower() in ['json', 'jsonb']:
                        print("\n✅ MIGRATION SUCCESSFUL!")
                        print("=" * 60)
                        return True
                    else:
                        print(f"\n❌ MIGRATION FAILED: Type is still {new_type}")
                        return False
                else:
                    print(f"\n⚠️  Unexpected column type: {current_type}")
                    print("   Manual intervention may be required")
                    return False
            else:
                print("\n❌ ERROR: user_id column not found in project table")
                return False

        except Exception as e:
            print(f"\n❌ MIGRATION FAILED WITH ERROR:")
            print(f"   {str(e)}")
            db.session.rollback()
            import traceback
            print("\nFull traceback:")
            print(traceback.format_exc())
            return False

if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
