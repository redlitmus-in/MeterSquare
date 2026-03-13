"""
Migration: Add jti column to login_history table
Date: 2026-03-04
Description: Adds jti (JWT ID) column to login_history so force_logout_user
             can look up the JTI and blacklist it in token_blacklist.

Changes:
- Add jti VARCHAR(36) column to login_history
- Add index on jti for fast lookup during force logout
"""

import os
import sys
from datetime import datetime

# Add the parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def upgrade():
    """Add jti column and index to login_history"""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:

            # Add jti column
            db.session.execute(text("""
                ALTER TABLE login_history
                ADD COLUMN IF NOT EXISTS jti VARCHAR(36)
            """))

            # Add index for fast lookup
            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_login_history_jti
                ON login_history(jti)
            """))

            db.session.commit()


            return True

        except Exception as e:
            db.session.rollback()
            log.error(f"Migration failed: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False


def downgrade():
    """Remove jti column and index from login_history"""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:

            db.session.execute(text("""
                DROP INDEX IF EXISTS idx_login_history_jti
            """))

            db.session.execute(text("""
                ALTER TABLE login_history
                DROP COLUMN IF EXISTS jti
            """))

            db.session.commit()


            return True

        except Exception as e:
            db.session.rollback()
            log.error(f"Rollback failed: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Migrate: add jti to login_history")
    parser.add_argument('--rollback', action='store_true', help='Run rollback instead of upgrade')
    args = parser.parse_args()

    if args.rollback:
        success = downgrade()
    else:
        success = upgrade()

    sys.exit(0 if success else 1)
