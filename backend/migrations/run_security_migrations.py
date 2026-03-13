"""
Run Security Migrations — 2026-03-04 batch
==========================================
Applies 4 migrations required for the security monitoring feature.
Safe to re-run: all statements use IF NOT EXISTS guards.

Run order (dependency-safe):
  1. add_user_block_fields       — adds columns to users table
  2. add_token_blacklist_table   — creates token_blacklist (FK → users)
  3. add_jti_to_login_history    — adds jti column to login_history
  4. add_suspicious_activity_alerts — creates suspicious_activity_alerts (FK → users)

Usage:
  python migrations/run_security_migrations.py
  python migrations/run_security_migrations.py --rollback
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)


def run_up():
    from migrations.add_user_block_fields import up as block_up
    from migrations.add_token_blacklist_table import up as blacklist_up
    from migrations.add_jti_to_login_history import upgrade as jti_up
    from migrations.add_suspicious_activity_alerts import up as alerts_up

    migrations = [
        ("add_user_block_fields",         block_up),
        ("add_token_blacklist_table",     blacklist_up),
        ("add_jti_to_login_history",      jti_up),
        ("add_suspicious_activity_alerts",alerts_up),
    ]


    all_ok = True
    for name, fn in migrations:
        ok = fn()
        if ok:
            pass
        else:
            all_ok = False
            break   # stop on first failure — later migrations may depend on this one

    if all_ok:
        pass
    else:
        pass
    return all_ok


def run_down():
    from migrations.add_suspicious_activity_alerts import down as alerts_down
    from migrations.add_jti_to_login_history import downgrade as jti_down
    from migrations.add_token_blacklist_table import down as blacklist_down
    from migrations.add_user_block_fields import down as block_down

    # Rollback in reverse order
    rollbacks = [
        ("add_suspicious_activity_alerts", alerts_down),
        ("add_jti_to_login_history",       jti_down),
        ("add_token_blacklist_table",      blacklist_down),
        ("add_user_block_fields",          block_down),
    ]


    all_ok = True
    for name, fn in rollbacks:
        ok = fn()
        if ok:
            pass
        else:
            all_ok = False

    if all_ok:
        pass
    else:
        pass
    return all_ok


if __name__ == "__main__":
    if "--rollback" in sys.argv:
        success = run_down()
    else:
        success = run_up()
    sys.exit(0 if success else 1)
