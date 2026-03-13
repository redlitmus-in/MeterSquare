"""
Migration: Add "test labour 04" skill to 20 workers
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db
from models.worker import Worker
from sqlalchemy import text

app = create_app()


def add_test_labour_04_skill():
    """Add 'test labour 04' skill to 20 workers"""
    with app.app_context():
        try:

            # Get first 20 active workers
            workers = Worker.query.filter_by(is_deleted=False).order_by(Worker.worker_id).limit(20).all()


            updated_count = 0
            already_had_skill = 0
            skill_to_add = 'test labour 04'

            for worker in workers:
                # Initialize skills array if None
                if worker.skills is None:
                    worker.skills = []

                # Check if worker already has this skill
                if skill_to_add in worker.skills:
                    already_had_skill += 1
                else:
                    # Add the skill
                    worker.skills.append(skill_to_add)
                    worker.last_modified_by = 'System - Skill Update'
                    updated_count += 1

            # Commit changes
            db.session.commit()


            # Verify the update
            result = db.session.execute(text("""
                SELECT COUNT(*) as total
                FROM workers
                WHERE is_deleted = false
                AND 'test labour 04' = ANY(skills)
            """)).fetchone()


            return True

        except Exception as e:
            db.session.rollback()
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    success = add_test_labour_04_skill()
    sys.exit(0 if success else 1)
