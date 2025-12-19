"""
Quick script to add fax column to current database (development)
"""
import sys
sys.path.insert(0, '.')

from app import create_app
from config.db import db
from sqlalchemy import text

app = create_app()

with app.app_context():
    try:
        print(f"Connected to: {app.config['SQLALCHEMY_DATABASE_URI'][:50]}...")

        # Check if column already exists
        with db.engine.connect() as conn:
            result = conn.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'vendors' AND column_name = 'fax';
            """))
            existing = result.fetchone()

            if existing:
                print("[INFO] fax column already exists in vendors table")
            else:
                # Add fax column
                conn.execute(text("""
                    ALTER TABLE vendors
                    ADD COLUMN fax VARCHAR(50);
                """))
                conn.commit()
                print("[SUCCESS] Added fax column to vendors table")

    except Exception as e:
        print(f"[ERROR] {str(e)}")
        raise

print("Done!")
