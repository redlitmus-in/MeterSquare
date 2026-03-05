# models/suspicious_activity.py
"""
Suspicious Activity Alert Model - Tracks security anomalies detected during
authentication and session analysis (multiple IPs, unusual hours, rapid logins).
"""

from datetime import datetime
from config.db import db


class SuspiciousActivityAlert(db.Model):
    """
    Records security anomalies associated with a user account. Each alert
    captures the alert type, severity, a human-readable description, and an
    arbitrary JSON payload (`details`) for context that varies per alert type.

    Alert types:
        - 'multiple_ips'   : Same session observed from multiple IP addresses
        - 'unusual_hours'  : Login at an atypical hour for this user
        - 'rapid_logins'   : Unusually high login frequency in a short window

    Severity levels:
        - 'low', 'medium' (default), 'high'
    """

    __tablename__ = 'suspicious_activity_alerts'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.user_id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )

    alert_type = db.Column(db.String(50), nullable=False)
    severity = db.Column(db.String(20), nullable=False, default='medium')
    description = db.Column(db.Text, nullable=True)
    details = db.Column(db.JSON, nullable=True)

    is_resolved = db.Column(db.Boolean, nullable=False, default=False)

    resolved_by = db.Column(
        db.Integer,
        db.ForeignKey('users.user_id', ondelete='SET NULL'),
        nullable=True,
    )
    resolved_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    user = db.relationship(
        'User',
        foreign_keys=[user_id],
        backref=db.backref('suspicious_activity_alerts', lazy='dynamic'),
    )
    resolver = db.relationship(
        'User',
        foreign_keys=[resolved_by],
        backref=db.backref('resolved_alerts', lazy='dynamic'),
    )

    def __repr__(self):
        return (
            f'<SuspiciousActivityAlert id={self.id} user={self.user_id} '
            f'type={self.alert_type} severity={self.severity} resolved={self.is_resolved}>'
        )

    def to_dict(self):
        """Serialize the alert to a plain dictionary suitable for JSON responses."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'alert_type': self.alert_type,
            'severity': self.severity,
            'description': self.description,
            'details': self.details,
            'is_resolved': self.is_resolved,
            'resolved_by': self.resolved_by,
            'resolved_at': self.resolved_at.isoformat() + 'Z' if self.resolved_at else None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }

    # ------------------------------------------------------------------
    # Classmethods
    # ------------------------------------------------------------------

    @classmethod
    def get_unresolved(cls, limit: int = 100):
        """
        Return up to `limit` unresolved alerts ordered by most recent first.
        """
        return (
            cls.query
            .filter_by(is_resolved=False)
            .order_by(cls.created_at.desc())
            .limit(limit)
            .all()
        )

    @classmethod
    def get_all(cls, limit: int = 100, offset: int = 0):
        """
        Return all alerts (resolved and unresolved) ordered by most recent
        first, with pagination support via `limit` and `offset`.
        """
        return (
            cls.query
            .order_by(cls.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    @classmethod
    def get_for_user(cls, user_id: int):
        """
        Return all alerts for the given user ordered by most recent first.
        """
        return (
            cls.query
            .filter_by(user_id=user_id)
            .order_by(cls.created_at.desc())
            .all()
        )
