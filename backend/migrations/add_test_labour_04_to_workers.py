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
            print('\n' + '='*80)
            print('📝 ADDING "test labour 04" SKILL TO WORKERS')
            print('='*80)

            # Get first 20 active workers
            workers = Worker.query.filter_by(is_deleted=False).order_by(Worker.worker_id).limit(20).all()

            print(f'\nFound {len(workers)} workers to update')
            print('-'*80)

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
                    print(f'  ⊙ {worker.worker_id:<4} {worker.full_name:<30} - Already has skill')
                else:
                    # Add the skill
                    worker.skills.append(skill_to_add)
                    worker.last_modified_by = 'System - Skill Update'
                    updated_count += 1
                    print(f'  ✓ {worker.worker_id:<4} {worker.full_name:<30} - Skill added')

            # Commit changes
            db.session.commit()

            print('\n' + '='*80)
            print(f'✓ SKILL UPDATE COMPLETE')
            print(f'  - Updated: {updated_count} workers')
            print(f'  - Already had skill: {already_had_skill} workers')
            print(f'  - Total processed: {len(workers)} workers')
            print('='*80)

            # Verify the update
            print('\n📊 VERIFICATION:')
            print('-'*80)
            result = db.session.execute(text("""
                SELECT COUNT(*) as total
                FROM workers
                WHERE is_deleted = false
                AND 'test labour 04' = ANY(skills)
            """)).fetchone()

            print(f'Total workers with "test labour 04" skill: {result[0]}')
            print('-'*80)

            return True

        except Exception as e:
            db.session.rollback()
            print(f'\n✗ Migration failed: {str(e)}')
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    success = add_test_labour_04_skill()
    sys.exit(0 if success else 1)
