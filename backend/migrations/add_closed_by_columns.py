"""
Migration script to add closed_by tracking columns to support_tickets table
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from flask import Flask
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

def run_migration():
    """Add closed_by, closed_by_name, and closed_date columns to support_tickets table"""
    with app.app_context():
        try:
            # Check if columns already exist
            check_query = """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'support_tickets'
                AND column_name IN ('closed_by', 'closed_by_name', 'closed_date')
            """
            result = db.session.execute(db.text(check_query))
            existing_columns = [row[0] for row in result.fetchall()]

            columns_to_add = []

            if 'closed_by' not in existing_columns:
                columns_to_add.append("ADD COLUMN closed_by VARCHAR(50)")
                print("Will add: closed_by")
            else:
                print("Column closed_by already exists")

            if 'closed_by_name' not in existing_columns:
                columns_to_add.append("ADD COLUMN closed_by_name VARCHAR(255)")
                print("Will add: closed_by_name")
            else:
                print("Column closed_by_name already exists")

            if 'closed_date' not in existing_columns:
                columns_to_add.append("ADD COLUMN closed_date TIMESTAMP")
                print("Will add: closed_date")
            else:
                print("Column closed_date already exists")

            if columns_to_add:
                alter_query = f"ALTER TABLE support_tickets {', '.join(columns_to_add)}"
                db.session.execute(db.text(alter_query))
                db.session.commit()
                print(f"\nSuccessfully added {len(columns_to_add)} column(s) to support_tickets table")
            else:
                print("\nAll columns already exist. No changes needed.")

            # Verify columns were added
            verify_query = """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'support_tickets'
                AND column_name IN ('closed_by', 'closed_by_name', 'closed_date')
                ORDER BY column_name
            """
            result = db.session.execute(db.text(verify_query))
            print("\nVerification - Current columns:")
            for row in result.fetchall():
                print(f"  - {row[0]}: {row[1]}")

        except Exception as e:
            db.session.rollback()
            print(f"Error running migration: {str(e)}")
            raise

if __name__ == '__main__':
    print("Running migration: Add closed_by columns to support_tickets")
    print("=" * 60)
    run_migration()
    print("=" * 60)
    print("Migration completed!")
