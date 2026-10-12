# models/user_role_grant.py
"""
User Role Grant Model - temporary extra roles for a user.

A grant lets an existing user work in an additional role between start_date
and end_date (inclusive, company timezone). The user's own role in
users.role_id is never changed.

access_type:
- 'fresh'    : the user acts as themselves in the granted role (starts with
               no projects; projects get assigned to them normally).
- 'existing' : the user works with the same access as source_user_id, an
               existing holder of that role.
"""

from datetime import datetime
from config.db import db


ACCESS_TYPE_FRESH = 'fresh'
ACCESS_TYPE_EXISTING = 'existing'
ACCESS_TYPES = (ACCESS_TYPE_FRESH, ACCESS_TYPE_EXISTING)


class UserRoleGrant(db.Model):
    __tablename__ = 'user_role_grants'

    grant_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False, index=True)
    role_id = db.Column(db.Integer, nullable=False, index=True)
    access_type = db.Column(db.String(20), nullable=False, default=ACCESS_TYPE_FRESH)
    source_user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    notes = db.Column(db.Text, nullable=True)
    granted_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False)
    granted_by_name = db.Column(db.String(255), nullable=True)
    is_revoked = db.Column(db.Boolean, default=False, nullable=False)
    revoked_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)
    revoked_by_name = db.Column(db.String(255), nullable=True)
    revoked_at = db.Column(db.DateTime, nullable=True)
    reminder_sent_at = db.Column(db.DateTime, nullable=True)
    # Paused grants keep their dates but give no access until resumed
    paused_at = db.Column(db.DateTime, nullable=True)
    paused_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)
    paused_by_name = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)

    user = db.relationship('User', foreign_keys=[user_id])
    source_user = db.relationship('User', foreign_keys=[source_user_id])
    role = db.relationship('Role', foreign_keys=[role_id], primaryjoin='UserRoleGrant.role_id == Role.role_id')

    def status_on(self, today):
        """Return 'revoked' | 'expired' | 'paused' | 'scheduled' | 'active' for the given company-local date."""
        if self.is_revoked:
            return 'revoked'
        if today > self.end_date:
            return 'expired'
        if self.paused_at:
            return 'paused'
        if today < self.start_date:
            return 'scheduled'
        return 'active'

    def is_active_on(self, today):
        return self.status_on(today) == 'active'

    def __repr__(self):
        return f'<UserRoleGrant {self.grant_id} user={self.user_id} role={self.role_id} {self.start_date}..{self.end_date}>'
