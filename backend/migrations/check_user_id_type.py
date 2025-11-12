"""
Check current user_id column type in project table
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config.db import db
from sqlalchemy import text
from flask import Flask

def check_type():
    """Check current user_id column type"""

    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/corporate_interiors')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    with app.app_context():
        try:
            # Check column type
            check_type_query = text("""
                SELECT data_type, column_name
                FROM information_schema.columns
                WHERE table_name = 'project' AND column_name = 'user_id'
            """)

            result = db.session.execute(check_type_query).fetchone()

            if result:
                print(f"Column: {result[1]}")
                print(f"Type: {result[0]}")

                # Try to get a sample value
                sample_query = text("SELECT user_id FROM project LIMIT 1")
                sample = db.session.execute(sample_query).fetchone()
                if sample:
                    print(f"Sample value: {sample[0]}")
                    print(f"Sample value type: {type(sample[0])}")
            else:
                print("Column not found")

        except Exception as e:
            print(f"Error: {str(e)}")
            import traceback
            print(traceback.format_exc())

if __name__ == '__main__':
    check_type()
