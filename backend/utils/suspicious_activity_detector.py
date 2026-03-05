# utils/suspicious_activity_detector.py
"""
Suspicious Activity Detector - Runs security checks after each successful login.

Detects three categories of anomalous behaviour:
    1. multiple_ips   – user logged in from >= 3 distinct IPs in the last 24 hours (HIGH)
    2. unusual_hours  – login occurred between 00:00 and 05:59 UTC (MEDIUM)
    3. rapid_logins   – >= 5 logins in the last 5 minutes (HIGH)

Each detected anomaly is persisted as a SuspiciousActivityAlert row. A
deduplication guard prevents creating a new alert if an unresolved alert of
the same type already exists for this user within the last hour.

Usage:
    from utils.suspicious_activity_detector import check_suspicious_activity

    alerts = check_suspicious_activity(
        user_id=user.user_id,
        ip_address=request.remote_addr,
        login_at=datetime.utcnow(),
    )
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import func

from config.db import db
from models.login_history import LoginHistory
from models.suspicious_activity import SuspiciousActivityAlert

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MULTIPLE_IPS_WINDOW_HOURS = 24
_MULTIPLE_IPS_THRESHOLD = 3

_UNUSUAL_HOUR_START = 0   # inclusive  (midnight)
_UNUSUAL_HOUR_END = 5     # inclusive  (05:xx UTC)

_RAPID_LOGINS_WINDOW_MINUTES = 5
_RAPID_LOGINS_THRESHOLD = 5

_DEDUP_WINDOW_HOURS = 1


# ---------------------------------------------------------------------------
# Deduplication helper
# ---------------------------------------------------------------------------

def _already_alerted(user_id: int, alert_type: str) -> bool:
    """
    Return True if an unresolved alert of `alert_type` already exists for
    `user_id` and was created within the last hour.

    This prevents noisy duplicate alerts for the same ongoing anomaly.
    """
    cutoff = datetime.utcnow() - timedelta(hours=_DEDUP_WINDOW_HOURS)
    exists = (
        SuspiciousActivityAlert.query
        .filter(
            SuspiciousActivityAlert.user_id == user_id,
            SuspiciousActivityAlert.alert_type == alert_type,
            SuspiciousActivityAlert.is_resolved == False,  # noqa: E712
            SuspiciousActivityAlert.created_at >= cutoff,
        )
        .first()
    )
    return exists is not None


# ---------------------------------------------------------------------------
# Rule 1 – Multiple IPs in 24 hours
# ---------------------------------------------------------------------------

def _check_multiple_ips(
    user_id: int,
    ip_address: str,
    login_at: datetime,
) -> "SuspiciousActivityAlert | None":
    """
    HIGH severity alert when the user has logged in from >= 3 distinct IP
    addresses during the 24-hour window ending at `login_at`.
    """
    alert_type = "multiple_ips"

    if _already_alerted(user_id, alert_type):
        logger.debug(
            "[SuspiciousActivity] Skipping duplicate %s alert for user %s",
            alert_type, user_id,
        )
        return None

    window_start = login_at - timedelta(hours=_MULTIPLE_IPS_WINDOW_HOURS)

    rows = (
        db.session.query(LoginHistory.ip_address)
        .filter(
            LoginHistory.user_id == user_id,
            LoginHistory.login_at >= window_start,
            LoginHistory.login_at <= login_at,
            LoginHistory.ip_address.isnot(None),
        )
        .distinct()
        .all()
    )

    distinct_ips = [row.ip_address for row in rows if row.ip_address]
    count = len(distinct_ips)

    if count < _MULTIPLE_IPS_THRESHOLD:
        return None

    logger.warning(
        "[SuspiciousActivity] user=%s logged in from %d distinct IPs in last %dh: %s",
        user_id, count, _MULTIPLE_IPS_WINDOW_HOURS, distinct_ips,
    )

    return SuspiciousActivityAlert(
        user_id=user_id,
        alert_type=alert_type,
        severity="high",
        description=(
            f"User logged in from {count} different IP addresses "
            f"in the last {_MULTIPLE_IPS_WINDOW_HOURS} hours"
        ),
        details={
            "ips": distinct_ips,
            "count": count,
            "window_hours": _MULTIPLE_IPS_WINDOW_HOURS,
        },
    )


# ---------------------------------------------------------------------------
# Rule 2 – Unusual hours (00:00–05:59 UTC)
# ---------------------------------------------------------------------------

def _check_unusual_hours(
    user_id: int,
    login_at: datetime,
) -> "SuspiciousActivityAlert | None":
    """
    MEDIUM severity alert when the login occurs between midnight and 05:59 UTC.
    """
    alert_type = "unusual_hours"

    hour = login_at.hour
    minute = login_at.minute

    if not (_UNUSUAL_HOUR_START <= hour <= _UNUSUAL_HOUR_END):
        return None

    if _already_alerted(user_id, alert_type):
        logger.debug(
            "[SuspiciousActivity] Skipping duplicate %s alert for user %s",
            alert_type, user_id,
        )
        return None

    logger.warning(
        "[SuspiciousActivity] user=%s logged in at unusual hour %02d:%02d UTC",
        user_id, hour, minute,
    )

    return SuspiciousActivityAlert(
        user_id=user_id,
        alert_type=alert_type,
        severity="medium",
        description=f"Login detected at unusual hour: {hour:02d}:{minute:02d} UTC",
        details={
            "hour": hour,
            "minute": minute,
            "login_at": login_at.isoformat(),
        },
    )


# ---------------------------------------------------------------------------
# Rule 3 – Rapid successive logins (>= 5 in 5 minutes)
# ---------------------------------------------------------------------------

def _check_rapid_logins(
    user_id: int,
    login_at: datetime,
) -> "SuspiciousActivityAlert | None":
    """
    HIGH severity alert when the user has logged in >= 5 times within the
    5-minute window ending at `login_at`.
    """
    alert_type = "rapid_logins"

    if _already_alerted(user_id, alert_type):
        logger.debug(
            "[SuspiciousActivity] Skipping duplicate %s alert for user %s",
            alert_type, user_id,
        )
        return None

    window_start = login_at - timedelta(minutes=_RAPID_LOGINS_WINDOW_MINUTES)

    count = (
        db.session.query(func.count(LoginHistory.id))
        .filter(
            LoginHistory.user_id == user_id,
            LoginHistory.login_at >= window_start,
            LoginHistory.login_at <= login_at,
        )
        .scalar()
    ) or 0

    if count < _RAPID_LOGINS_THRESHOLD:
        return None

    logger.warning(
        "[SuspiciousActivity] user=%s logged in %d times in last %d minutes",
        user_id, count, _RAPID_LOGINS_WINDOW_MINUTES,
    )

    return SuspiciousActivityAlert(
        user_id=user_id,
        alert_type=alert_type,
        severity="high",
        description=(
            f"User logged in {count} times in the last "
            f"{_RAPID_LOGINS_WINDOW_MINUTES} minutes"
        ),
        details={
            "login_count": count,
            "window_minutes": _RAPID_LOGINS_WINDOW_MINUTES,
        },
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def check_suspicious_activity(
    user_id: int,
    ip_address: str,
    login_at: datetime,
) -> list:
    """
    Run all three detection rules after a successful login.

    Parameters
    ----------
    user_id   : ID of the user who just authenticated.
    ip_address: Remote IP of the incoming request (may be None/empty string).
    login_at  : UTC datetime of the login event (usually datetime.utcnow()).

    Returns
    -------
    List of SuspiciousActivityAlert objects that were created and committed.
    The list is empty when no anomalies were detected or when the detector
    itself raises an exception (so login flow is never blocked).
    """
    alerts: list = []

    try:
        checks = [
            lambda: _check_multiple_ips(user_id, ip_address, login_at),
            lambda: _check_unusual_hours(user_id, login_at),
            lambda: _check_rapid_logins(user_id, login_at),
        ]

        for check_fn in checks:
            alert = check_fn()
            if alert is not None:
                db.session.add(alert)
                db.session.commit()
                alerts.append(alert)
                logger.info(
                    "[SuspiciousActivity] Created %s alert (id=%s) for user %s",
                    alert.alert_type, alert.id, user_id,
                )

    except Exception as exc:
        logger.error(
            "[SuspiciousActivity] Detection failed for user %s: %s",
            user_id, exc,
            exc_info=True,
        )
        # Intentionally swallowed – login must not fail due to detector errors.

    return alerts
