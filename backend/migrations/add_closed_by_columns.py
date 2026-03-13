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
            else:
                pass

            if 'closed_by_name' not in existing_columns:
                columns_to_add.append("ADD COLUMN closed_by_name VARCHAR(255)")
            else:
                pass

            if 'closed_date' not in existing_columns:
                columns_to_add.append("ADD COLUMN closed_date TIMESTAMP")
            else:
                pass

            if columns_to_add:
                alter_query = f"ALTER TABLE support_tickets {', '.join(columns_to_add)}"
                db.session.execute(db.text(alter_query))
                db.session.commit()
            else:
                pass

            # Verify columns were added
            verify_query = """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'support_tickets'
                AND column_name IN ('closed_by', 'closed_by_name', 'closed_date')
                ORDER BY column_name
            """
            result = db.session.execute(db.text(verify_query))
            for row in result.fetchall():
                pass

        except Exception as e:
            db.session.rollback()
            raise

if __name__ == '__main__':
    run_migration()
