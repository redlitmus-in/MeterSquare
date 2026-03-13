"""
Verify that 'test labour 04' skill was added to workers
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db
from sqlalchemy import text

app = create_app()


def verify_skill():
    """Verify 'test labour 04' skill was added to workers"""
    with app.app_context():

        # Count total workers with the skill using JSONB contains operator
        result = db.session.execute(text("""
            SELECT COUNT(*) as total
            FROM workers
            WHERE is_deleted = false
            AND skills @> '"test labour 04"'
        """)).fetchone()

        total_count = result[0]

        # Show details of workers with the skill
        details = db.session.execute(text("""
            SELECT
                worker_id,
                full_name,
                skills
            FROM workers
            WHERE is_deleted = false
            AND skills @> '"test labour 04"'
            ORDER BY worker_id
            LIMIT 25
        """)).fetchall()

        if details:
            for row in details:
                worker_id = row[0]
                full_name = str(row[1])[:28]
                skills = row[2] if row[2] else []
                skills_str = ', '.join(skills) if skills else '(none)'
        else:
            pass



if __name__ == "__main__":
    verify_skill()
