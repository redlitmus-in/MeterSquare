"""
Security Models for MeterSquare
Database models for security audit logs and blocked IPs
"""

from datetime import datetime, timedelta
from config.db import db


class SecurityAuditLog(db.Model):
    """
    Stores security events for audit trail and compliance
    """
    __tablename__ = "security_audit_logs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    timestamp = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    event_type = db.Column(db.String(50), nullable=False)  # LOGIN_FAILED, IP_BLOCKED, etc.
    severity = db.Column(db.String(20), default='INFO')  # INFO, WARNING, CRITICAL
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='SET NULL'), nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)
    path = db.Column(db.String(500), nullable=True)
    method = db.Column(db.String(10), nullable=True)
    details = db.Column(db.JSON, default=dict)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'event_type': self.event_type,
            'severity': self.severity,
            'user_id': self.user_id,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'path': self.path,
            'method': self.method,
            'details': self.details or {},
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class BlockedIP(db.Model):
    """
    Stores blocked IP addresses with expiration
    Supports progressive blocking - longer bans for repeat offenders
    """
    __tablename__ = "blocked_ips"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    ip_address = db.Column(db.String(45), nullable=False, unique=True)
    reason = db.Column(db.Text, nullable=True)
    blocked_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)
    is_permanent = db.Column(db.Boolean, default=False)
    block_count = db.Column(db.Integer, default=1)  # Track repeat offenders for progressive blocking
    blocked_by = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='SET NULL'), nullable=True)
    unblocked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    unblocked_by = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    def is_expired(self):
        """Check if the block has expired"""
        if self.is_permanent:
            return False
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at

    def is_active(self):
        """Check if the block is currently active"""
        return not self.is_expired() and self.unblocked_at is None

    def to_dict(self):
        return {
            'id': self.id,
            'ip_address': self.ip_address,
            'reason': self.reason,
            'blocked_at': self.blocked_at.isoformat() if self.blocked_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_permanent': self.is_permanent,
            'block_count': self.block_count or 1,
            'is_active': self.is_active(),
            'blocked_by': self.blocked_by,
            'unblocked_at': self.unblocked_at.isoformat() if self.unblocked_at else None
        }
