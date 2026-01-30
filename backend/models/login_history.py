# models/login_history.py
"""
Login History Model - Tracks all user login sessions for audit purposes
"""

from datetime import datetime
from config.db import db


class LoginHistory(db.Model):
    """
    Tracks all user login sessions including:
    - Login timestamp
    - IP address
    - User agent (browser/device info)
    - Login method (email OTP, SMS OTP)
    - Session status (active, logged_out, expired)
    """
    __tablename__ = 'login_history'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)

    # Login details
    login_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    logout_at = db.Column(db.DateTime, nullable=True)

    # Client information
    ip_address = db.Column(db.String(45), nullable=True)  # IPv6 can be up to 45 chars
    user_agent = db.Column(db.String(500), nullable=True)
    device_type = db.Column(db.String(50), nullable=True)  # desktop, mobile, tablet
    browser = db.Column(db.String(100), nullable=True)
    os = db.Column(db.String(100), nullable=True)

    # Login method
    login_method = db.Column(db.String(20), default='email_otp', nullable=False)  # email_otp, sms_otp

    # Session status
    status = db.Column(db.String(20), default='active', nullable=False)  # active, logged_out, expired

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = db.relationship('User', backref=db.backref('login_history', lazy='dynamic'))

    def __init__(self, user_id, ip_address=None, user_agent=None, device_type=None,
                 browser=None, os=None, login_method='email_otp'):
        self.user_id = user_id
        self.ip_address = ip_address
        self.user_agent = user_agent
        self.device_type = device_type
        self.browser = browser
        self.os = os
        self.login_method = login_method
        self.login_at = datetime.utcnow()
        self.status = 'active'

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "login_at": self.login_at.isoformat() if self.login_at else None,
            "logout_at": self.logout_at.isoformat() if self.logout_at else None,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "device_type": self.device_type,
            "browser": self.browser,
            "os": self.os,
            "login_method": self.login_method,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

    def mark_logged_out(self):
        """Mark this session as logged out"""
        self.logout_at = datetime.utcnow()
        self.status = 'logged_out'

    def mark_expired(self):
        """Mark this session as expired"""
        self.status = 'expired'

    @classmethod
    def get_user_login_history(cls, user_id, limit=50, offset=0):
        """Get login history for a specific user"""
        return cls.query.filter_by(user_id=user_id)\
            .order_by(cls.login_at.desc())\
            .offset(offset)\
            .limit(limit)\
            .all()

    @classmethod
    def get_recent_logins(cls, user_id, days=30):
        """Get logins from the last N days"""
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=days)
        return cls.query.filter(
            cls.user_id == user_id,
            cls.login_at >= cutoff
        ).order_by(cls.login_at.desc()).all()

    def __repr__(self):
        return f'<LoginHistory {self.id} user={self.user_id} at={self.login_at}>'
