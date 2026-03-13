"""
Migration: Add labour_role column to daily_attendance table
This column tracks which labour type/skill the worker performed for accurate BOQ cost tracking
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db

app = create_app()


def run_migration():
    """Add labour_role column to daily_attendance table"""
    with app.app_context():
        try:
            # Check if column already exists
            result = db.session.execute(db.text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'daily_attendance'
                AND column_name = 'labour_role'
            """))

            if result.fetchone():
                return True

            # Add the column
            db.session.execute(db.text("""
                ALTER TABLE daily_attendance
                ADD COLUMN labour_role VARCHAR(100) NULL
            """))

            # Add index for performance
            db.session.execute(db.text("""
                CREATE INDEX IF NOT EXISTS idx_daily_attendance_labour_role
                ON daily_attendance(labour_role)
            """))

            db.session.commit()
            return True

        except Exception as e:
            db.session.rollback()
            return False


if __name__ == "__main__":
    run_migration()
