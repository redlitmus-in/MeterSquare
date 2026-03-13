"""
Migration: Fix NULL completion flags in pm_assign_ss table

This migration fixes existing NULL values in se_completion_requested and
pm_confirmed_completion columns by setting them to FALSE.

The NULL values were causing bool_and() aggregation to return incorrect results,
preventing PM from seeing SE completion requests.

Run this script once to fix existing data.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from app import create_app

def run_migration():
    """Fix NULL values in completion tracking columns"""
    app = create_app()
    with app.app_context():
        try:

            # Count NULL values before fix
            count_se_null = db.session.execute("""
                SELECT COUNT(*) FROM pm_assign_ss
                WHERE se_completion_requested IS NULL AND is_deleted = FALSE
            """).scalar()

            count_pm_null = db.session.execute("""
                SELECT COUNT(*) FROM pm_assign_ss
                WHERE pm_confirmed_completion IS NULL AND is_deleted = FALSE
            """).scalar()


            if count_se_null == 0 and count_pm_null == 0:
                return

            # Fix NULL se_completion_requested values
            if count_se_null > 0:
                db.session.execute("""
                    UPDATE pm_assign_ss
                    SET se_completion_requested = FALSE,
                        last_modified_at = NOW(),
                        last_modified_by = 'migration_fix_null_flags'
                    WHERE se_completion_requested IS NULL
                """)

            # Fix NULL pm_confirmed_completion values
            if count_pm_null > 0:
                db.session.execute("""
                    UPDATE pm_assign_ss
                    SET pm_confirmed_completion = FALSE,
                        last_modified_at = NOW(),
                        last_modified_by = 'migration_fix_null_flags'
                    WHERE pm_confirmed_completion IS NULL
                """)

            db.session.commit()

            # Verify fix
            verify_se = db.session.execute("""
                SELECT COUNT(*) FROM pm_assign_ss
                WHERE se_completion_requested IS NULL AND is_deleted = FALSE
            """).scalar()

            verify_pm = db.session.execute("""
                SELECT COUNT(*) FROM pm_assign_ss
                WHERE pm_confirmed_completion IS NULL AND is_deleted = FALSE
            """).scalar()


            if verify_se == 0 and verify_pm == 0:
                pass
            else:
                pass


        except Exception as e:
            db.session.rollback()
            import traceback
            traceback.print_exc()
            raise

if __name__ == "__main__":
    run_migration()
