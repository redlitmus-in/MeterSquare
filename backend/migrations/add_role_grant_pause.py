"""
Migration: Pause / resume for role access grants
Date: 2026-10-12
Description: Admin or TD can pause a grant (access stops until resumed) without ending it.
             Additive only - three nullable columns on user_role_grants; nothing else changes.

Columns:
- paused_at      : TIMESTAMP - set while the grant is paused, NULL otherwise
- paused_by      : INTEGER FK -> users(user_id)
- paused_by_name : VARCHAR(255)

Run:   python migrations/add_role_grant_pause.py
Undo:  python migrations/add_role_grant_pause.py --down
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def up():
    """Add the pause columns to user_role_grants."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            db.session.execute(text("""
                ALTER TABLE user_role_grants
                    ADD COLUMN IF NOT EXISTS paused_at      TIMESTAMP,
                    ADD COLUMN IF NOT EXISTS paused_by      INTEGER REFERENCES users(user_id),
                    ADD COLUMN IF NOT EXISTS paused_by_name VARCHAR(255)
            """))
            db.session.commit()
            log.info("user_role_grants: pause columns added")
            return True

        except Exception as e:
            db.session.rollback()
            log.error(f"Migration failed: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False


def down():
    """Remove the pause columns."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            db.session.execute(text("""
                ALTER TABLE user_role_grants
                    DROP COLUMN IF EXISTS paused_at,
                    DROP COLUMN IF EXISTS paused_by,
                    DROP COLUMN IF EXISTS paused_by_name
            """))
            db.session.commit()
            return True

        except Exception as e:
            db.session.rollback()
            log.error(f"Rollback failed: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False


if __name__ == '__main__':
    if '--down' in sys.argv:
        success = down()
    else:
        success = up()
    sys.exit(0 if success else 1)
