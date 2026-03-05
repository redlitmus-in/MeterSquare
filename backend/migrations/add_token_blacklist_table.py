"""
Migration: Create token_blacklist table
Date: 2026-03-04
Description: Creates the token_blacklist table for JWT force-logout / token
             invalidation support. Allows server-side revocation of individual
             tokens without requiring a full password reset.

Columns:
- id             : SERIAL PRIMARY KEY
- jti            : VARCHAR(36) – JWT ID claim (unique per token)
- user_id        : INTEGER FK → users(user_id) ON DELETE CASCADE
- blacklisted_at : TIMESTAMP – when the token was revoked
- expires_at     : TIMESTAMP – when the original token would have expired
- reason         : VARCHAR(100) – human-readable revocation reason
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
    """Create the token_blacklist table and its indexes."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            log.info("=" * 70)
            log.info("MIGRATION: Create token_blacklist table")
            log.info("=" * 70)

            db.session.execute(text("""
                CREATE TABLE IF NOT EXISTS token_blacklist (
                    id            SERIAL PRIMARY KEY,
                    jti           VARCHAR(36)  NOT NULL UNIQUE,
                    user_id       INTEGER      NOT NULL
                                  REFERENCES users(user_id) ON DELETE CASCADE,
                    blacklisted_at TIMESTAMP   DEFAULT NOW() NOT NULL,
                    expires_at    TIMESTAMP    NOT NULL,
                    reason        VARCHAR(100) DEFAULT 'force_logout'
                )
            """))

            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti
                ON token_blacklist(jti)
            """))

            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires
                ON token_blacklist(expires_at)
            """))

            db.session.commit()

            print("✅ Created token_blacklist table")
            log.info("=" * 70)
            log.info("MIGRATION COMPLETED SUCCESSFULLY")
            log.info("  Table  : token_blacklist")
            log.info("  Indexes: idx_token_blacklist_jti, idx_token_blacklist_expires")
            log.info("=" * 70)
            return True

        except Exception as e:
            db.session.rollback()
            log.error(f"Migration failed: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False


def down():
    """Drop the token_blacklist table."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            log.info("=" * 70)
            log.info("ROLLBACK: Drop token_blacklist table")
            log.info("=" * 70)

            db.session.execute(text("""
                DROP TABLE IF EXISTS token_blacklist
            """))

            db.session.commit()

            print("✅ Dropped token_blacklist table")
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
