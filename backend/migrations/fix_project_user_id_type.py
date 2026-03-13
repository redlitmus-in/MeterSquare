"""
Migration: Fix project.user_id column type from JSON to INTEGER

This migration fixes the incorrect column type for user_id in the project table.
The column was mistakenly set as JSON type instead of INTEGER.

Run this migration: python backend/migrations/fix_project_user_id_type.py
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
    """Fix project.user_id column type"""

    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        return False

    # Create Flask app context
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    with app.app_context():
        try:

            # Check current column type
            check_type_query = text("""
                SELECT data_type, column_name
                FROM information_schema.columns
                WHERE table_name = 'project' AND column_name = 'user_id'
            """)

            result = db.session.execute(check_type_query).fetchone()

            if result:
                current_type = result[0]

                if current_type.lower() == 'json':

                    # Step 1: Check if there's any data
                    count_query = text("SELECT COUNT(*) FROM project")
                    count = db.session.execute(count_query).scalar()

                    # Step 2: Alter column type to INTEGER
                    # USING clause will attempt to cast JSON to INTEGER
                    # If data can't be cast, we'll handle it

                    alter_query = text("""
                        ALTER TABLE project
                        ALTER COLUMN user_id TYPE INTEGER
                        USING CASE
                            WHEN user_id::text ~ '^[0-9]+$' THEN user_id::text::integer
                            ELSE NULL
                        END
                    """)

                    db.session.execute(alter_query)
                    db.session.commit()


                    # Verify the change
                    result_after = db.session.execute(check_type_query).fetchone()
                    new_type = result_after[0]

                    if new_type.lower() == 'integer':
                        return True
                    else:
                        return False

                elif current_type.lower() == 'integer':
                    return True
                else:
                    return False
            else:
                return False

        except Exception as e:
            db.session.rollback()
            import traceback
            return False

if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
