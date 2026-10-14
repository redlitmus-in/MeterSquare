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

import json
import time
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import deferred

from config.db import db


ACCESS_TYPE_FRESH = 'fresh'
ACCESS_TYPE_EXISTING = 'existing'
ACCESS_TYPES = (ACCESS_TYPE_FRESH, ACCESS_TYPE_EXISTING)

COLUMN_RECHECK_SECONDS = 300
_optional_columns = {}


def _column_present(column):
    """
    True once a migration has added `column` to user_role_grants. Until then the
    column is never queried, so Role Access keeps working. A missing result is
    re-checked every few minutes, so running the migration turns the feature on
    without a code change or restart.
    """
    state = _optional_columns.setdefault(column, {'present': None, 'checked_at': 0.0})
    if state['present']:
        return True
    if state['present'] is not None and time.time() - state['checked_at'] < COLUMN_RECHECK_SECONDS:
        return False
    try:
        found = db.session.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'user_role_grants' AND column_name = :column"
        ), {'column': column}).first()
        state['present'] = found is not None
    except Exception:
        db.session.rollback()
        state['present'] = False
    state['checked_at'] = time.time()
    return state['present']


def pause_supported():
    """True once migrations/add_role_grant_pause.py has added the pause columns."""
    return _column_present('paused_at')


def menus_supported():
    """True once migrations/add_role_grant_menus.py has added allowed_menus."""
    return _column_present('allowed_menus')


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
    # Paused grants keep their dates but give no access until resumed.
    # Deferred: only loaded when read, and only read when pause_supported().
    paused_at = deferred(db.Column(db.DateTime, nullable=True))
    paused_by = deferred(db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True))
    paused_by_name = deferred(db.Column(db.String(255), nullable=True))
    # Fresh grants can give only some of the role's menus: JSON list of menu keys
    # (utils/role_menus.py). NULL = the whole role. Deferred like the pause columns.
    allowed_menus = deferred(db.Column(db.Text, nullable=True))
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
        if self.is_paused():
            return 'paused'
        if today < self.start_date:
            return 'scheduled'
        return 'active'

    def is_paused(self):
        return pause_supported() and self.paused_at is not None

    def is_active_on(self, today):
        return self.status_on(today) == 'active'

    def menu_keys(self):
        """The menu keys this grant is limited to, or None for the whole role."""
        if not menus_supported() or not self.allowed_menus:
            return None
        try:
            keys = json.loads(self.allowed_menus)
        except (TypeError, ValueError):
            return None
        return [k for k in keys if isinstance(k, str)] or None

    def __repr__(self):
        return f'<UserRoleGrant {self.grant_id} user={self.user_id} role={self.role_id} {self.start_date}..{self.end_date}>'
