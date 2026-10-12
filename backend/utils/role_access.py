# utils/role_access.py
"""
Multi-role access helpers (temporary role grants).

Everything here is a no-op for normal sessions: a session only behaves
differently when its JWT carries a `grant_id` claim, which is issued solely
when a user logs in with (or switches to) a role granted in user_role_grants.
"""

import os
import uuid as _uuid
from datetime import datetime, timedelta, timezone as dt_timezone

import jwt
import pytz
from flask import g

from config.db import db
from config.logging import get_logger
from models.user import User
from models.role import Role
from models.user_role_grant import UserRoleGrant, ACCESS_TYPE_EXISTING, ACCESS_TYPE_FRESH

log = get_logger()

SECRET_KEY = os.getenv('SECRET_KEY')
SESSION_HOURS = 10

ROLE_ACCESS_EXPIRED = 'ROLE_ACCESS_EXPIRED'

# Roles whose holders (by their own primary role) may manage grants
GRANT_MANAGER_ROLES = {'admin', 'technicaldirector'}

# Roles that can be granted: the roles the app has pages and a login option for
# (normalized names; 'buyer' is shown as Procurement)
GRANTABLE_ROLES = {
    'admin', 'technicaldirector', 'estimator', 'projectmanager',
    'productionmanager', 'mep', 'siteengineer', 'buyer',
}


def normalize_role(name):
    return (name or '').lower().replace(' ', '').replace('_', '').replace('-', '')


def company_timezone():
    try:
        from models.system_settings import SystemSettings
        settings = SystemSettings.query.first()
        if settings and settings.timezone:
            return pytz.timezone(settings.timezone)
    except Exception:
        pass
    return pytz.utc


def company_today():
    """Today's date in the company timezone. A grant's end_date runs until 23:59 of that day."""
    return datetime.now(dt_timezone.utc).astimezone(company_timezone()).date()


def find_role_by_name(role_name):
    if not role_name:
        return None
    return Role.query.filter(
        db.func.lower(db.func.trim(Role.role)) == role_name.lower().strip(),
        Role.is_deleted == False
    ).first()


# ---------------------------------------------------------------------------
# Grant lookups
# ---------------------------------------------------------------------------

def _active_filter(query, today):
    from models.user_role_grant import pause_supported
    query = query.filter(
        UserRoleGrant.is_revoked == False,
        UserRoleGrant.start_date <= today,
        UserRoleGrant.end_date >= today,
    )
    if pause_supported():
        query = query.filter(UserRoleGrant.paused_at.is_(None))
    return query


def active_grants_for_user(user_id):
    today = company_today()
    return _active_filter(UserRoleGrant.query.filter(UserRoleGrant.user_id == user_id), today) \
        .order_by(UserRoleGrant.end_date.asc()).all()


def find_active_grant_for_role(user_id, role_name):
    """Active grant of `role_name` (DB role name, case-insensitive) for user_id, or None."""
    role = find_role_by_name(role_name)
    if not role:
        return None
    today = company_today()
    return _active_filter(
        UserRoleGrant.query.filter(UserRoleGrant.user_id == user_id, UserRoleGrant.role_id == role.role_id),
        today
    ).order_by(UserRoleGrant.end_date.desc()).first()


def users_with_role(role_id):
    """
    Users whose own role is role_id, plus users holding an active *fresh* grant
    for it (so they can be picked/assigned like any other holder of the role).
    Existing-type grantees are not added: they work through the source user.
    """
    users = User.query.filter_by(role_id=role_id, is_deleted=False).all()
    try:
        today = company_today()
        grant_end_by_user = dict(
            _active_filter(
                db.session.query(UserRoleGrant.user_id, db.func.max(UserRoleGrant.end_date)).filter(
                    UserRoleGrant.role_id == role_id,
                    UserRoleGrant.access_type == ACCESS_TYPE_FRESH,
                ),
                today
            ).group_by(UserRoleGrant.user_id).all()
        )
        known = {u.user_id for u in users}
        extra_ids = [uid for uid in grant_end_by_user if uid not in known]
        if extra_ids:
            extras = User.query.filter(
                User.user_id.in_(extra_ids),
                User.is_deleted == False,
                User.is_active == True,
            ).all()
            for u in extras:
                # Transient marker (not a column) so pickers can tag granted users
                u.granted_until = grant_end_by_user[u.user_id].isoformat()
            users += extras
    except Exception as e:
        db.session.rollback()
        log.warning(f"users_with_role: grant lookup skipped: {e}")
    return users


def granted_until(user):
    """End date (ISO) if this user is in a role list through a fresh grant, else None."""
    return getattr(user, 'granted_until', None)


def user_has_role(user, role_name):
    """True if the user's own role is role_name or they hold an active fresh grant for it."""
    if not user:
        return False
    if user.role and normalize_role(user.role.role) == normalize_role(role_name):
        return True
    try:
        grant = find_active_grant_for_role(user.user_id, role_name)
        return bool(grant and grant.access_type == ACCESS_TYPE_FRESH)
    except Exception:
        return False


def current_role_name(user):
    """
    Role name to use for permission checks on `user`.
    For the user making the request this is the session's active role (which,
    for normal sessions, is the same role loaded from the database).
    """
    if not user:
        return 'unknown'
    session_user = getattr(g, 'user', None)
    if session_user and session_user.get('user_id') == user.user_id and session_user.get('role'):
        return session_user['role']
    return user.role.role if user.role else 'unknown'


# ---------------------------------------------------------------------------
# Session (JWT) handling
# ---------------------------------------------------------------------------

def validate_grant_claims(payload, actual_user=None):
    """
    Check a token's grant claims. Returns (grant, source_user, error_message).
    Tokens without grant_id return (None, None, None).
    """
    grant_id = payload.get('grant_id')
    if not grant_id:
        return None, None, None

    grant = UserRoleGrant.query.get(grant_id)
    user_id = actual_user.user_id if actual_user else payload.get('user_id')
    if not grant or grant.user_id != user_id:
        return None, None, 'This role access is no longer available.'

    if not grant.is_active_on(company_today()):
        if grant.is_paused() and not grant.is_revoked:
            return None, None, 'Your access to this role is paused.'
        return None, None, 'Your access to this role has ended.'

    role = Role.query.filter_by(role_id=grant.role_id, is_deleted=False).first()
    if not role:
        return None, None, 'This role is no longer available.'

    source_user = None
    if grant.access_type == ACCESS_TYPE_EXISTING:
        source_user = User.query.filter_by(user_id=grant.source_user_id, is_deleted=False, is_active=True).first()
        if not source_user or source_user.role_id != grant.role_id:
            return None, None, 'The user whose access was shared no longer has this role.'

    return grant, source_user, None


def build_session_user(actual_user, grant=None, source_user=None, role=None):
    """
    The g.user dict for a granted session.
    - fresh: the actual user, with the granted role.
    - existing: the source user's identity (so every query and action matches
      what the source user would see/do), with the granted role.
    Extra keys describe the grant; normal sessions never contain them.
    """
    role = role or Role.query.filter_by(role_id=grant.role_id).first()
    effective = source_user if (grant.access_type == ACCESS_TYPE_EXISTING and source_user) else actual_user
    primary_role = actual_user.role.role if actual_user.role else 'user'
    return {
        'user_id': effective.user_id,
        'email': effective.email,
        'full_name': effective.full_name,
        'role_id': role.role_id,
        'role': role.role,
        'role_name': role.role,
        'department': effective.department,
        'phone': effective.phone,
        'is_active': actual_user.is_active,
        'user_status': getattr(actual_user, 'user_status', None),
        # grant context
        'grant_id': grant.grant_id,
        'access_type': grant.access_type,
        'actual_user_id': actual_user.user_id,
        'actual_user_name': actual_user.full_name,
        'actual_user_email': actual_user.email,
        'primary_role': primary_role,
        'primary_role_id': actual_user.role_id,
        'grant_end_date': grant.end_date.isoformat(),
        'source_user_id': source_user.user_id if source_user else None,
        'source_user_name': source_user.full_name if source_user else None,
    }, effective


def role_access_summary(actual_user, grant=None, source_user=None):
    """The `role_access` block returned to the frontend with the user object."""
    primary_role = actual_user.role.role if actual_user.role else 'user'
    grants = []
    try:
        for gr in active_grants_for_user(actual_user.user_id):
            r = Role.query.filter_by(role_id=gr.role_id, is_deleted=False).first()
            if not r:
                continue
            grants.append({
                'grant_id': gr.grant_id,
                'role': r.role,
                'role_id': r.role_id,
                'access_type': gr.access_type,
                'source_user_name': gr.source_user.full_name if gr.source_user else None,
                'start_date': gr.start_date.isoformat(),
                'end_date': gr.end_date.isoformat(),
            })
    except Exception as e:
        db.session.rollback()
        log.warning(f"role_access_summary: {e}")

    return {
        'primary_role': primary_role,
        'primary_role_id': actual_user.role_id,
        'active_grant_id': grant.grant_id if grant else None,
        'active_access_type': grant.access_type if grant else None,
        'active_source_user_name': source_user.full_name if source_user else None,
        'active_end_date': grant.end_date.isoformat() if grant else None,
        'available_grants': grants,
    }


def issue_session_token(actual_user, grant=None, source_user=None, expires_at=None):
    """
    Create a JWT for actual_user in their own role (grant=None) or a granted role.
    The own-role payload is identical to the regular login payload.
    Returns (token, expiration_time, jti, user_dict) where user_dict matches the login response.
    """
    now = datetime.utcnow()
    expiration_time = expires_at or (now + timedelta(hours=SESSION_HOURS))

    if grant:
        role = Role.query.filter_by(role_id=grant.role_id, is_deleted=False).first()
    else:
        role = Role.query.filter_by(role_id=actual_user.role_id, is_deleted=False).first() if actual_user.role_id else None
    role_name = role.role if role else 'user'
    role_id = role.role_id if role else actual_user.role_id
    permissions = role.permissions if (role and isinstance(role.permissions, list)) else []

    effective = source_user if (grant and grant.access_type == ACCESS_TYPE_EXISTING and source_user) else actual_user

    payload = {
        'user_id': actual_user.user_id,
        'email': actual_user.email,
        'username': actual_user.email,
        'role': role_name,
        'role_id': role_id,
        'permissions': permissions,
        'full_name': actual_user.full_name,
        'creation_time': now.isoformat(),
        'jti': str(_uuid.uuid4()),
        'exp': expiration_time,
    }
    if grant:
        payload['grant_id'] = grant.grant_id
        payload['primary_role'] = actual_user.role.role if actual_user.role else 'user'
        payload['effective_user_id'] = effective.user_id

    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode('utf-8')

    user_dict = {
        # Ids follow the effective identity so client-side filters match the data;
        # name/email stay the person who is signed in.
        'user_id': effective.user_id,
        'email': actual_user.email,
        'full_name': actual_user.full_name,
        'phone': actual_user.phone,
        'role': role_name,
        'role_id': role_id,
        'department': effective.department,
        'permissions': permissions,
        'user_status': 'online',
        'role_access': role_access_summary(actual_user, grant, source_user),
    }
    return token, expiration_time, payload['jti'], user_dict
