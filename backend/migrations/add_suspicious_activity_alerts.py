"""
Migration: Create suspicious_activity_alerts table
Date: 2026-03-04
Description: Creates the suspicious_activity_alerts table for Feature 3 —
             Suspicious Activity Alerts. Auto-flags users logging in from
             multiple IPs, at unusual hours, or with rapid successive logins.

Columns:
- id          : SERIAL PRIMARY KEY
- user_id     : INTEGER FK → users(user_id) ON DELETE CASCADE
- alert_type  : VARCHAR(50) – 'multiple_ips', 'unusual_hours', 'rapid_logins'
- severity    : VARCHAR(20) – 'low', 'medium', 'high'  (default: 'medium')
- description : TEXT – human-readable summary of the alert
- details     : JSONB – structured metadata (IPs seen, timestamps, counts, etc.)
- is_resolved : BOOLEAN DEFAULT FALSE – whether an admin has cleared the alert
- resolved_by : INTEGER FK → users(user_id) – admin who resolved the alert
- resolved_at : TIMESTAMP – when the alert was resolved
- created_at  : TIMESTAMP DEFAULT NOW() – when the alert was raised

Indexes:
- idx_saa_user_id    : fast lookup of alerts by user
- idx_saa_is_resolved: fast filter of open vs. resolved alerts
- idx_saa_created_at : time-ordered scans / recent-first listing
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
    """Create the suspicious_activity_alerts table and its indexes."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:

            db.session.execute(text("""
                CREATE TABLE IF NOT EXISTS suspicious_activity_alerts (
                    id          SERIAL PRIMARY KEY,
                    user_id     INTEGER      NOT NULL
                                REFERENCES users(user_id) ON DELETE CASCADE,
                    alert_type  VARCHAR(50)  NOT NULL,
                    severity    VARCHAR(20)  NOT NULL DEFAULT 'medium',
                    description TEXT         NOT NULL,
                    details     JSONB,
                    is_resolved BOOLEAN      NOT NULL DEFAULT FALSE,
                    resolved_by INTEGER      REFERENCES users(user_id),
                    resolved_at TIMESTAMP,
                    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
                )
            """))

            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_saa_user_id
                ON suspicious_activity_alerts(user_id)
            """))

            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_saa_is_resolved
                ON suspicious_activity_alerts(is_resolved)
            """))

            db.session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_saa_created_at
                ON suspicious_activity_alerts(created_at DESC)
            """))

            db.session.commit()

            return True

        except Exception as e:
            db.session.rollback()
            log.error(f"Migration failed: {str(e)}")
            import traceback
            log.error(traceback.format_exc())
            return False


def down():
    """Drop the suspicious_activity_alerts table."""
    from app import create_app, db

    app = create_app()

    with app.app_context():
        try:

            db.session.execute(text("""
                DROP TABLE IF EXISTS suspicious_activity_alerts
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
