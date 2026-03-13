"""
Migration to add signature fields to system_settings table
Run this script to add signature_image and signature_enabled columns
"""
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from flask import Flask
from dotenv import load_dotenv
from sqlalchemy import text

# Load environment variables
load_dotenv()

def run_migration():
    """Add signature fields to system_settings table"""

    # Create Flask app for database context
    app = Flask(__name__)

    # Database configuration
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    with app.app_context():
        try:
            # Check if columns already exist
            check_query = text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'system_settings'
                AND column_name IN ('signature_image', 'signature_enabled')
            """)
            result = db.session.execute(check_query)
            existing_columns = [row[0] for row in result]

            # Add signature_image column if not exists
            if 'signature_image' not in existing_columns:
                add_signature_image = text("""
                    ALTER TABLE system_settings
                    ADD COLUMN signature_image TEXT
                """)
                db.session.execute(add_signature_image)
            else:
                pass

            # Add signature_enabled column if not exists
            if 'signature_enabled' not in existing_columns:
                add_signature_enabled = text("""
                    ALTER TABLE system_settings
                    ADD COLUMN signature_enabled BOOLEAN DEFAULT FALSE
                """)
                db.session.execute(add_signature_enabled)
            else:
                pass

            db.session.commit()
            return True

        except Exception as e:
            db.session.rollback()
            return False

if __name__ == '__main__':
    run_migration()
