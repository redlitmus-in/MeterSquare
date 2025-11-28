"""
Migration to add last_pm_user_id column to boq table.
This stores which PM the BOQ was last sent to, so when re-sending after PM rejection,
we can send directly to the same PM without asking for selection.
"""

import os
import sys

# Add the parent directory to the path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from flask import Flask
from sqlalchemy import text

def run_migration():
    """Add last_pm_user_id column to boq table"""

    # Create Flask app context
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'DATABASE_URL',
        'postgresql://postgres:postgres@localhost:5432/metersquare'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    with app.app_context():
        try:
            # Check if column already exists
            check_sql = text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'boq' AND column_name = 'last_pm_user_id'
            """)
            result = db.session.execute(check_sql)
            if result.fetchone():
                print("Column 'last_pm_user_id' already exists in 'boq' table. Skipping migration.")
                return True

            # Add the column
            alter_sql = text("""
                ALTER TABLE boq
                ADD COLUMN last_pm_user_id INTEGER REFERENCES users(user_id)
            """)
            db.session.execute(alter_sql)
            db.session.commit()

            print("Successfully added 'last_pm_user_id' column to 'boq' table.")
            return True

        except Exception as e:
            db.session.rollback()
            print(f"Error running migration: {e}")
            return False

if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)
