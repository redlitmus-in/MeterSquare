"""
Migration: Selected menus for role access grants
Date: 2026-10-14
Description: A fresh-role grant can give only some of the role's menus (for example
             Procurement with Purchase Orders but not Vendors).
             Additive only - one nullable column on user_role_grants; nothing else changes.

Column:
- allowed_menus : TEXT - JSON list of menu keys from utils/role_menus.py.
                  NULL means the whole role (every existing grant keeps working as before).

Run:   python migrations/add_role_grant_menus.py
Undo:  python migrations/add_role_grant_menus.py --down
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
    """Add the allowed_menus column to user_role_grants."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            db.session.execute(text("""
                ALTER TABLE user_role_grants
                    ADD COLUMN IF NOT EXISTS allowed_menus TEXT
            """))
            db.session.commit()
            log.info("user_role_grants: allowed_menus column added")
            return True

        except Exception as e:
            db.session.rollback()
            log.error(f"Migration failed: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False


def down():
    """Remove the allowed_menus column."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            db.session.execute(text("""
                ALTER TABLE user_role_grants
                    DROP COLUMN IF EXISTS allowed_menus
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
