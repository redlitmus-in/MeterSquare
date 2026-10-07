"""
Migration: Create user_role_grants table
Date: 2026-10-07
Description: Temporary extra roles for users (multi-role access with expiry).
             Additive only - no existing table or column is changed.

Columns:
- grant_id         : SERIAL PRIMARY KEY
- user_id          : INTEGER FK -> users(user_id) ON DELETE CASCADE (who receives the role)
- role_id          : INTEGER - granted role (roles.role_id)
- access_type      : VARCHAR(20) - 'fresh' | 'existing'
- source_user_id   : INTEGER FK -> users(user_id) - whose access is shared ('existing' only)
- start_date       : DATE - first day of access (company timezone)
- end_date         : DATE - last day of access, ends 23:59 company timezone
- notes            : TEXT
- granted_by       : INTEGER FK -> users(user_id)
- granted_by_name  : VARCHAR(255)
- is_revoked       : BOOLEAN
- revoked_by       : INTEGER FK -> users(user_id)
- revoked_by_name  : VARCHAR(255)
- revoked_at       : TIMESTAMP
- reminder_sent_at : TIMESTAMP - hand-over reminder for fresh grants
- created_at, last_modified_at : TIMESTAMP
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
    """Create the user_role_grants table and its indexes."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            db.session.execute(text("""
                CREATE TABLE IF NOT EXISTS user_role_grants (
                    grant_id          SERIAL PRIMARY KEY,
                    user_id           INTEGER      NOT NULL
                                      REFERENCES users(user_id) ON DELETE CASCADE,
                    role_id           INTEGER      NOT NULL,
                    access_type       VARCHAR(20)  NOT NULL DEFAULT 'fresh'
                                      CHECK (access_type IN ('fresh', 'existing')),
                    source_user_id    INTEGER      REFERENCES users(user_id),
                    start_date        DATE         NOT NULL,
                    end_date          DATE         NOT NULL,
                    notes             TEXT,
                    granted_by        INTEGER      NOT NULL REFERENCES users(user_id),
                    granted_by_name   VARCHAR(255),
                    is_revoked        BOOLEAN      NOT NULL DEFAULT FALSE,
                    revoked_by        INTEGER      REFERENCES users(user_id),
                    revoked_by_name   VARCHAR(255),
                    revoked_at        TIMESTAMP,
                    reminder_sent_at  TIMESTAMP,
                    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
                    last_modified_at  TIMESTAMP    DEFAULT NOW(),
                    CONSTRAINT chk_user_role_grants_dates CHECK (end_date >= start_date),
                    CONSTRAINT chk_user_role_grants_source CHECK (
                        (access_type = 'existing' AND source_user_id IS NOT NULL)
                        OR (access_type = 'fresh' AND source_user_id IS NULL)
                    )
                )
            """))

            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_user_role_grants_user
                ON user_role_grants(user_id)
            """))

            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_user_role_grants_role_dates
                ON user_role_grants(role_id, start_date, end_date)
                WHERE is_revoked = FALSE
            """))

            db.session.commit()
            log.info("user_role_grants table created")
            return True

        except Exception as e:
            db.session.rollback()
            log.error(f"Migration failed: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False


def down():
    """Drop the user_role_grants table."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:
            db.session.execute(text("""
                DROP TABLE IF EXISTS user_role_grants
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
