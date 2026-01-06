"""
Migration: Add departure tracking fields to labour_arrivals table
Adds departure_time and departed_at columns for clock-out functionality.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from flask import Flask
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)


def run_migration():
    """Add departure tracking columns to labour_arrivals"""

    with app.app_context():
        # Check if columns already exist
        check_sql = """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'labour_arrivals'
        AND column_name IN ('departure_time', 'departed_at');
        """
        result = db.session.execute(db.text(check_sql))
        existing_columns = {row[0] for row in result}

        columns_to_add = []

        # Add departure_time column (HH:MM format string)
        if 'departure_time' not in existing_columns:
            columns_to_add.append("""
                ALTER TABLE labour_arrivals
                ADD COLUMN departure_time VARCHAR(10);
            """)
            print("Will add: departure_time VARCHAR(10)")

        # Add departed_at timestamp column
        if 'departed_at' not in existing_columns:
            columns_to_add.append("""
                ALTER TABLE labour_arrivals
                ADD COLUMN departed_at TIMESTAMP;
            """)
            print("Will add: departed_at TIMESTAMP")

        if not columns_to_add:
            print("All columns already exist. No migration needed.")
            return

        # Execute migrations
        for sql in columns_to_add:
            try:
                db.session.execute(db.text(sql.strip()))
                print(f"Executed: {sql.strip()[:60]}...")
            except Exception as e:
                print(f"Error executing SQL: {e}")
                db.session.rollback()
                raise

        db.session.commit()
        print("\n✅ Migration completed successfully!")
        print("Added columns: departure_time, departed_at to labour_arrivals table")


if __name__ == '__main__':
    run_migration()
