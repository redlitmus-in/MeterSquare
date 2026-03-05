"""
Migration: Add user block fields to users table
Date: 2026-03-04
Description: Adds is_blocked, blocked_reason, blocked_at, and blocked_by columns
             to the users table to support account-level blocking by administrators.
             A blocked user is denied login regardless of credentials.

Columns added:
- is_blocked    : BOOLEAN DEFAULT FALSE NOT NULL – whether the account is blocked
- blocked_reason: VARCHAR(255) – human-readable reason for the block
- blocked_at    : TIMESTAMP – when the block was applied
- blocked_by    : INTEGER FK → users(user_id) – admin who applied the block

Index added:
- idx_users_is_blocked : speeds up active-user queries that filter on is_blocked
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
    """Add is_blocked fields and supporting index to the users table."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            log.info("=" * 70)
            log.info("MIGRATION: Add is_blocked fields to users table")
            log.info("=" * 70)

            db.session.execute(text("""
                ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS is_blocked   BOOLEAN      DEFAULT FALSE NOT NULL,
                    ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS blocked_at   TIMESTAMP,
                    ADD COLUMN IF NOT EXISTS blocked_by   INTEGER      REFERENCES users(user_id)
            """))

            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_users_is_blocked
                ON users(is_blocked)
            """))

            db.session.commit()

            print("✅ Added is_blocked fields to users table")
            log.info("=" * 70)
            log.info("MIGRATION COMPLETED SUCCESSFULLY")
            log.info("  Table  : users")
            log.info("  Columns: is_blocked, blocked_reason, blocked_at, blocked_by")
            log.info("  Index  : idx_users_is_blocked")
            log.info("=" * 70)
            return True

        except Exception as e:
            db.session.rollback()
            log.error(f"Migration failed: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False


def down():
    """Drop the is_blocked columns and index from the users table."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            log.info("=" * 70)
            log.info("ROLLBACK: Remove is_blocked fields from users table")
            log.info("=" * 70)

            db.session.execute(text("""
                DROP INDEX IF EXISTS idx_users_is_blocked
            """))

            db.session.execute(text("""
                ALTER TABLE users
                    DROP COLUMN IF EXISTS blocked_by,
                    DROP COLUMN IF EXISTS blocked_at,
                    DROP COLUMN IF EXISTS blocked_reason,
                    DROP COLUMN IF EXISTS is_blocked
            """))

            db.session.commit()

            print("✅ Removed is_blocked fields from users table")
            log.info("ROLLBACK COMPLETED SUCCESSFULLY")
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
