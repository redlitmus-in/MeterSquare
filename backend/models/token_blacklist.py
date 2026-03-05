# models/token_blacklist.py
"""
Token Blacklist Model - Tracks revoked JWT tokens for force-logout and security.
Entries are keyed by JTI (JWT ID) and are auto-cleaned when expired.
"""

from datetime import datetime
from config.db import db


class TokenBlacklist(db.Model):
    __tablename__ = 'token_blacklist'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    jti = db.Column(db.String(36), unique=True, nullable=False, index=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.user_id', ondelete='CASCADE'),
        nullable=False,
    )
    blacklisted_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    reason = db.Column(db.String(100), default='force_logout')

    # Relationship
    user = db.relationship('User', backref=db.backref('blacklisted_tokens', lazy='dynamic'))

    def __repr__(self):
        return f'<TokenBlacklist jti={self.jti} user={self.user_id} reason={self.reason}>'

    @classmethod
    def is_blacklisted(cls, jti: str) -> bool:
        """
        Check if a token JTI is blacklisted and not yet expired.
        Opportunistically deletes the entry if it has already expired.
        """
        entry = cls.query.filter_by(jti=jti).first()
        if not entry:
            return False
        if entry.expires_at < datetime.utcnow():
            db.session.delete(entry)
            db.session.commit()
            return False
        return True

    @classmethod
    def add(cls, jti: str, user_id: int, expires_at: datetime, reason: str = 'force_logout'):
        """
        Blacklist a token JTI.  Safe to call if the JTI already exists
        (duplicate inserts are silently ignored via the unique constraint).
        """
        entry = cls(jti=jti, user_id=user_id, expires_at=expires_at, reason=reason)
        db.session.add(entry)
        db.session.commit()

    @classmethod
    def cleanup_expired(cls):
        """
        Delete all expired entries from the table.
        Should be called periodically (e.g. via a scheduled task or cron).
        """
        cls.query.filter(cls.expires_at < datetime.utcnow()).delete()
        db.session.commit()
