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
            print("\n" + "="*60)
            print("Migration: Fix NULL completion flags in pm_assign_ss")
            print("="*60)

            # Count NULL values before fix
            count_se_null = db.session.execute("""
                SELECT COUNT(*) FROM pm_assign_ss
                WHERE se_completion_requested IS NULL AND is_deleted = FALSE
            """).scalar()

            count_pm_null = db.session.execute("""
                SELECT COUNT(*) FROM pm_assign_ss
                WHERE pm_confirmed_completion IS NULL AND is_deleted = FALSE
            """).scalar()

            print(f"\nBefore fix:")
            print(f"  - Records with NULL se_completion_requested: {count_se_null}")
            print(f"  - Records with NULL pm_confirmed_completion: {count_pm_null}")

            if count_se_null == 0 and count_pm_null == 0:
                print("\n✓ No NULL values found. Migration not needed.")
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
                print(f"  ✓ Updated {count_se_null} records: se_completion_requested NULL -> FALSE")

            # Fix NULL pm_confirmed_completion values
            if count_pm_null > 0:
                db.session.execute("""
                    UPDATE pm_assign_ss
                    SET pm_confirmed_completion = FALSE,
                        last_modified_at = NOW(),
                        last_modified_by = 'migration_fix_null_flags'
                    WHERE pm_confirmed_completion IS NULL
                """)
                print(f"  ✓ Updated {count_pm_null} records: pm_confirmed_completion NULL -> FALSE")

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

            print(f"\nAfter fix:")
            print(f"  - Records with NULL se_completion_requested: {verify_se}")
            print(f"  - Records with NULL pm_confirmed_completion: {verify_pm}")

            if verify_se == 0 and verify_pm == 0:
                print("\n✓ Migration completed successfully!")
            else:
                print("\n⚠ Warning: Some NULL values may remain. Check the data.")

            print("="*60 + "\n")

        except Exception as e:
            db.session.rollback()
            print(f"\n✗ Migration failed: {e}")
            import traceback
            traceback.print_exc()
            raise

if __name__ == "__main__":
    run_migration()
