# controllers/role_access_controller.py
"""
Role Access (multi-role with expiry).

Admin and Technical Director grant a user temporary access to another role:
- fresh:    the user works in that role as themselves (starts with no projects)
- existing: the user works with the same access as an existing holder of the role

Users log in with the same email (choosing the granted role) or switch roles
from the account menu. Access ends automatically after end_date.
"""

from datetime import datetime, date

import jwt
from flask import g, request, jsonify, make_response
from sqlalchemy import cast
from sqlalchemy.dialects.postgresql import JSONB

from config.db import db
from config.logging import get_logger
from models.user import User
from models.role import Role
from models.project import Project
from models.user_role_grant import UserRoleGrant, ACCESS_TYPES, ACCESS_TYPE_EXISTING, ACCESS_TYPE_FRESH
from utils.role_access import (
    SECRET_KEY, GRANT_MANAGER_ROLES, GRANTABLE_ROLES, ROLE_ACCESS_EXPIRED,
    normalize_role, company_today, validate_grant_claims, issue_session_token,
    role_access_summary,
)

log = get_logger()

MAX_GRANT_DAYS = 366


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _can_manage_grants():
    """Only users whose OWN role is Admin or TD may manage grants (not via a grant)."""
    user = getattr(g, 'user', None) or {}
    own_role = user.get('primary_role') if user.get('grant_id') else user.get('role')
    return normalize_role(own_role) in GRANT_MANAGER_ROLES


def _forbidden():
    return jsonify({"success": False, "error": "Only Admin or Technical Director can manage role access"}), 403


def _actual_user_id():
    user = g.user
    return user.get('actual_user_id') or user.get('user_id')


def _actual_user_name():
    user = g.user
    return user.get('actual_user_name') or user.get('full_name')


def _parse_date(value, field):
    try:
        return date.fromisoformat(str(value)[:10]), None
    except (TypeError, ValueError):
        return None, f"{field} must be a date (YYYY-MM-DD)"


def _role_project_column(role_name):
    """(column, is_jsonb_list) linking a holder of role_name to projects, or (None, False)."""
    r = normalize_role(role_name)
    if r == 'projectmanager':
        return Project.user_id, True
    if r == 'mep':
        return Project.mep_supervisor_id, True
    if r == 'estimator':
        return Project.estimator_id, False
    if r in ('siteengineer', 'sitesupervisor'):
        return Project.site_supervisor_id, False
    if r == 'buyer':
        return Project.buyer_id, False
    return None, False


def _project_count(user_id, role_name):
    col, is_list = _role_project_column(role_name)
    if col is None:
        return None
    q = Project.query.filter(Project.is_deleted == False)
    q = q.filter(col.op('@>')(cast([user_id], JSONB))) if is_list else q.filter(col == user_id)
    return q.count()


CR_CLOSED_STATUSES = ('purchase_completed', 'routed_to_store', 'completed', 'rejected', 'cancelled')


def open_work_for(user_id, role_name):
    """
    Open work a user holds in a role: projects, open change requests and open item
    assignments. Used to remind Admin/TD to hand work over before a fresh grant ends.
    Returns {'projects', 'change_requests', 'item_assignments', 'total'} (zeros if none).
    """
    from models.change_request import ChangeRequest
    from models.pm_assign_ss import PMAssignSS

    r = normalize_role(role_name)
    work = {'projects': _project_count(user_id, role_name) or 0, 'change_requests': 0, 'item_assignments': 0}

    cr_column = {'projectmanager': ChangeRequest.assigned_to_pm_user_id,
                 'buyer': ChangeRequest.assigned_to_buyer_user_id}.get(r)
    if cr_column is not None:
        work['change_requests'] = ChangeRequest.query.filter(
            cr_column == user_id,
            ChangeRequest.is_deleted == False,
            ~ChangeRequest.status.in_(CR_CLOSED_STATUSES),
        ).count()

    assign_column = {'projectmanager': PMAssignSS.assigned_by_pm_id, 'mep': PMAssignSS.assigned_by_pm_id,
                     'siteengineer': PMAssignSS.assigned_to_se_id, 'sitesupervisor': PMAssignSS.assigned_to_se_id}.get(r)
    if assign_column is not None:
        work['item_assignments'] = PMAssignSS.query.filter(
            assign_column == user_id,
            PMAssignSS.is_deleted == False,
            db.or_(PMAssignSS.pm_confirmed_completion == False, PMAssignSS.pm_confirmed_completion.is_(None)),
        ).count()

    work['total'] = work['projects'] + work['change_requests'] + work['item_assignments']
    return work


def describe_open_work(work):
    """'2 projects, 3 change requests' style text."""
    parts = []
    for key, one, many in (('projects', 'project', 'projects'),
                           ('change_requests', 'change request', 'change requests'),
                           ('item_assignments', 'item assignment', 'item assignments')):
        n = work.get(key) or 0
        if n:
            parts.append(f"{n} {one if n == 1 else many}")
    return ', '.join(parts)


def _grant_to_dict(grant, today, roles_by_id, users_by_id):
    role = roles_by_id.get(grant.role_id)
    user = users_by_id.get(grant.user_id)
    source = users_by_id.get(grant.source_user_id) if grant.source_user_id else None
    status = grant.status_on(today)
    data = {
        'grant_id': grant.grant_id,
        'user_id': grant.user_id,
        'user_name': user.full_name if user else None,
        'user_email': user.email if user else None,
        'user_primary_role': user.role.role if (user and user.role) else None,
        'role_id': grant.role_id,
        'role': role.role if role else None,
        'access_type': grant.access_type,
        'source_user_id': grant.source_user_id,
        'source_user_name': source.full_name if source else None,
        'start_date': grant.start_date.isoformat(),
        'end_date': grant.end_date.isoformat(),
        'notes': grant.notes,
        'status': status,
        'days_left': (grant.end_date - today).days if status == 'active' else None,
        'granted_by_name': grant.granted_by_name,
        'revoked_by_name': grant.revoked_by_name,
        'revoked_at': grant.revoked_at.isoformat() if grant.revoked_at else None,
        'created_at': grant.created_at.isoformat() if grant.created_at else None,
        'projects_still_assigned': None,
        'open_work': None,
        'open_work_text': None,
    }
    # Fresh grants: work still assigned to the user in that role (for hand-over)
    if grant.access_type == ACCESS_TYPE_FRESH and role and status in ('active', 'expired', 'revoked'):
        own_role = user.role.role if (user and user.role) else ''
        if normalize_role(own_role) != normalize_role(role.role):
            work = open_work_for(grant.user_id, role.role)
            data['open_work'] = work
            data['open_work_text'] = describe_open_work(work) or None
            data['projects_still_assigned'] = work['total']
    return data


# ---------------------------------------------------------------------------
# Admin / TD endpoints
# ---------------------------------------------------------------------------

def list_grants():
    if not _can_manage_grants():
        return _forbidden()
    try:
        status_filter = (request.args.get('status') or 'all').lower()
        today = company_today()
        grants = UserRoleGrant.query.order_by(UserRoleGrant.created_at.desc()).all()

        roles_by_id = {r.role_id: r for r in Role.query.all()}
        user_ids = {gr.user_id for gr in grants} | {gr.source_user_id for gr in grants if gr.source_user_id}
        users_by_id = {u.user_id: u for u in User.query.filter(User.user_id.in_(user_ids)).all()} if user_ids else {}

        items = [_grant_to_dict(gr, today, roles_by_id, users_by_id) for gr in grants]
        counts = {
            'active': sum(1 for i in items if i['status'] == 'active'),
            'ending_soon': sum(1 for i in items if i['status'] == 'active' and i['days_left'] is not None and i['days_left'] <= 3),
            'scheduled': sum(1 for i in items if i['status'] == 'scheduled'),
            'expired': sum(1 for i in items if i['status'] == 'expired'),
            'revoked': sum(1 for i in items if i['status'] == 'revoked'),
            'all': len(items),
        }
        if status_filter != 'all':
            items = [i for i in items if i['status'] == status_filter]

        return jsonify({"success": True, "grants": items, "counts": counts, "today": today.isoformat()}), 200
    except Exception as e:
        log.error(f"list_grants error: {e}")
        return jsonify({"success": False, "error": "Failed to load role access grants"}), 500


def list_grantable_users():
    """Users that can receive a grant (picker in step 1)."""
    if not _can_manage_grants():
        return _forbidden()
    try:
        search = (request.args.get('search') or '').strip()
        q = db.session.query(User, Role.role).outerjoin(Role, User.role_id == Role.role_id).filter(
            User.is_deleted == False,
            User.is_active == True,
        )
        if search:
            like = f"%{search}%"
            q = q.filter(db.or_(User.full_name.ilike(like), User.email.ilike(like)))
        rows = q.order_by(User.full_name.asc()).limit(200).all()
        actual_id = _actual_user_id()
        users = [{
            'user_id': u.user_id,
            'full_name': u.full_name,
            'email': u.email,
            'role_id': u.role_id,
            'role': role_name,
        } for u, role_name in rows if u.user_id != actual_id]
        return jsonify({"success": True, "users": users}), 200
    except Exception as e:
        log.error(f"list_grantable_users error: {e}")
        return jsonify({"success": False, "error": "Failed to load users"}), 500


def list_roles():
    if not _can_manage_grants():
        return _forbidden()
    roles = Role.query.filter(Role.is_deleted == False).order_by(Role.role.asc()).all()
    roles = [r for r in roles if normalize_role(r.role) in GRANTABLE_ROLES]
    return jsonify({"success": True, "roles": [{'role_id': r.role_id, 'role': r.role} for r in roles]}), 200


def list_role_holders(role_id):
    """Existing holders of a role (for 'Same as existing user')."""
    if not _can_manage_grants():
        return _forbidden()
    try:
        role = Role.query.filter_by(role_id=role_id, is_deleted=False).first()
        if not role:
            return jsonify({"success": False, "error": "Role not found"}), 404
        exclude = request.args.get('exclude_user_id', type=int)
        holders = User.query.filter(
            User.role_id == role_id,
            User.is_deleted == False,
            User.is_active == True,
        ).order_by(User.full_name.asc()).all()
        users = [{
            'user_id': u.user_id,
            'full_name': u.full_name,
            'email': u.email,
            'project_count': _project_count(u.user_id, role.role),
        } for u in holders if u.user_id != exclude]
        return jsonify({"success": True, "role": role.role, "users": users}), 200
    except Exception as e:
        log.error(f"list_role_holders error: {e}")
        return jsonify({"success": False, "error": "Failed to load users for this role"}), 500


def create_grant():
    if not _can_manage_grants():
        return _forbidden()
    try:
        data = request.get_json(silent=True) or {}
        user_id = data.get('user_id')
        role_id = data.get('role_id')
        access_type = (data.get('access_type') or '').lower()
        source_user_id = data.get('source_user_id')
        notes = (data.get('notes') or '').strip() or None

        if not isinstance(user_id, int) or not isinstance(role_id, int):
            return jsonify({"success": False, "error": "user_id and role_id are required"}), 400
        if access_type not in ACCESS_TYPES:
            return jsonify({"success": False, "error": "access_type must be 'fresh' or 'existing'"}), 400

        start_date, err = _parse_date(data.get('start_date'), 'start_date')
        if err:
            return jsonify({"success": False, "error": err}), 400
        end_date, err = _parse_date(data.get('end_date'), 'end_date')
        if err:
            return jsonify({"success": False, "error": err}), 400
        today = company_today()
        if end_date < start_date:
            return jsonify({"success": False, "error": "End date must be on or after the start date"}), 400
        if end_date < today:
            return jsonify({"success": False, "error": "End date cannot be in the past"}), 400
        if (end_date - start_date).days > MAX_GRANT_DAYS:
            return jsonify({"success": False, "error": f"Access period cannot be longer than {MAX_GRANT_DAYS} days"}), 400

        if user_id == _actual_user_id():
            return jsonify({"success": False, "error": "You cannot grant a role to yourself"}), 400

        user = User.query.filter_by(user_id=user_id, is_deleted=False, is_active=True).first()
        if not user:
            return jsonify({"success": False, "error": "User not found or inactive"}), 404
        role = Role.query.filter_by(role_id=role_id, is_deleted=False).first()
        if not role:
            return jsonify({"success": False, "error": "Role not found"}), 404
        if normalize_role(role.role) not in GRANTABLE_ROLES:
            return jsonify({"success": False, "error": f"The {role.role} role cannot be granted"}), 400
        if user.role_id == role_id:
            return jsonify({"success": False, "error": "This is already the user's own role"}), 400

        if access_type == ACCESS_TYPE_EXISTING:
            if not isinstance(source_user_id, int):
                return jsonify({"success": False, "error": "Choose the existing user whose access to share"}), 400
            if source_user_id == user_id:
                return jsonify({"success": False, "error": "Choose a different user to share access from"}), 400
            source = User.query.filter_by(user_id=source_user_id, is_deleted=False, is_active=True).first()
            if not source or source.role_id != role_id:
                return jsonify({"success": False, "error": f"Selected user does not have the {role.role} role"}), 400
        else:
            source_user_id = None

        overlapping = UserRoleGrant.query.filter(
            UserRoleGrant.user_id == user_id,
            UserRoleGrant.role_id == role_id,
            UserRoleGrant.is_revoked == False,
            UserRoleGrant.start_date <= end_date,
            UserRoleGrant.end_date >= start_date,
        ).first()
        if overlapping:
            return jsonify({
                "success": False,
                "error": f"{user.full_name} already has {role.role} access from "
                         f"{overlapping.start_date.isoformat()} to {overlapping.end_date.isoformat()}. Revoke it first."
            }), 409

        grant = UserRoleGrant(
            user_id=user_id,
            role_id=role_id,
            access_type=access_type,
            source_user_id=source_user_id,
            start_date=start_date,
            end_date=end_date,
            notes=notes,
            granted_by=_actual_user_id(),
            granted_by_name=_actual_user_name(),
        )
        db.session.add(grant)
        db.session.commit()

        log.info(f"Role access granted: grant={grant.grant_id} user={user_id} role={role.role} "
                 f"type={access_type} {start_date}..{end_date} by={_actual_user_id()}")

        try:
            from utils.role_access_notify import notify_granted
            notify_granted(grant, user, role, today)
        except Exception as notify_err:
            log.warning(f"Role access notification failed for grant {grant.grant_id}: {notify_err}")

        roles_by_id = {role.role_id: role}
        users_by_id = {user.user_id: user}
        if source_user_id:
            users_by_id[source_user_id] = User.query.get(source_user_id)
        return jsonify({
            "success": True,
            "message": f"{user.full_name} can now use {role.role} until {end_date.isoformat()}",
            "grant": _grant_to_dict(grant, today, roles_by_id, users_by_id),
        }), 201
    except Exception as e:
        db.session.rollback()
        log.error(f"create_grant error: {e}")
        return jsonify({"success": False, "error": "Failed to grant role access"}), 500


def revoke_grant(grant_id):
    if not _can_manage_grants():
        return _forbidden()
    try:
        grant = UserRoleGrant.query.get(grant_id)
        if not grant:
            return jsonify({"success": False, "error": "Grant not found"}), 404
        if grant.is_revoked:
            return jsonify({"success": False, "error": "Already revoked"}), 400
        if grant.status_on(company_today()) == 'expired':
            return jsonify({"success": False, "error": "This access has already ended"}), 400

        grant.is_revoked = True
        grant.revoked_by = _actual_user_id()
        grant.revoked_by_name = _actual_user_name()
        grant.revoked_at = datetime.utcnow()
        db.session.commit()
        log.info(f"Role access revoked: grant={grant_id} by={_actual_user_id()}")
        try:
            from utils.role_access_notify import notify_revoked
            revoked_user = User.query.get(grant.user_id)
            revoked_role = Role.query.get(grant.role_id)
            if revoked_user and revoked_role:
                notify_revoked(grant, revoked_user, revoked_role, grant.revoked_by_name)
        except Exception as notify_err:
            log.warning(f"Role access revoke notification failed for grant {grant_id}: {notify_err}")
        return jsonify({"success": True, "message": "Role access revoked"}), 200
    except Exception as e:
        db.session.rollback()
        log.error(f"revoke_grant error: {e}")
        return jsonify({"success": False, "error": "Failed to revoke role access"}), 500


# ---------------------------------------------------------------------------
# Session endpoints (any signed-in user)
# ---------------------------------------------------------------------------

def _token_from_request():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header.split(' ', 1)[1]
    return request.cookies.get('access_token')


def _load_session():
    """
    Validate the token WITHOUT requiring its grant to still be active, so a user
    whose granted role just ended can still list roles and switch back.
    Returns (payload, actual_user, error_response).
    """
    token = _token_from_request()
    if not token:
        return None, None, (jsonify({'error': 'Token is missing'}), 401)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None, None, (jsonify({'error': 'Token expired', 'message': 'Token has expired'}), 401)
    except jwt.InvalidTokenError:
        return None, None, (jsonify({'error': 'Invalid token', 'message': 'Invalid token'}), 401)

    from models.token_blacklist import TokenBlacklist
    if payload.get('jti') and TokenBlacklist.is_blacklisted(payload['jti']):
        return None, None, (jsonify({'error': 'Session has been terminated'}), 401)

    user = User.query.filter_by(user_id=payload.get('user_id'), is_deleted=False, is_active=True).first()
    if not user:
        return None, None, (jsonify({'error': 'User not found or inactive'}), 401)
    if getattr(user, 'is_blocked', False):
        return None, None, (jsonify({'error': 'Account blocked', 'message': 'Your account has been blocked by an administrator.'}), 403)
    return payload, user, None


def my_roles():
    payload, user, err = _load_session()
    if err:
        return err
    grant, source, grant_error = validate_grant_claims(payload, user)
    summary = role_access_summary(user, grant, source)
    summary['current_role'] = payload.get('role')
    summary['active_grant_ended'] = bool(payload.get('grant_id') and grant_error)
    return jsonify({"success": True, **summary}), 200


def switch_role():
    """
    Switch the session to the user's own role (grant_id null) or to an active grant.
    Issues a new token (same expiry as the current one) and ends the old token.
    """
    payload, user, err = _load_session()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    target_grant_id = data.get('grant_id')

    grant = source = None
    if target_grant_id is not None:
        if not isinstance(target_grant_id, int):
            return jsonify({"success": False, "error": "grant_id must be a number"}), 400
        grant, source, grant_error = validate_grant_claims({'grant_id': target_grant_id}, user)
        if grant_error:
            return jsonify({"success": False, "error": grant_error, "error_code": ROLE_ACCESS_EXPIRED}), 403

    old_exp = payload.get('exp')
    expires_at = datetime.utcfromtimestamp(old_exp) if old_exp else None

    # End the previous token first so only one role session is live. If it was
    # already ended (e.g. a double-click sent two switches), refuse this one.
    if payload.get('jti') and expires_at:
        from sqlalchemy.exc import IntegrityError
        from models.token_blacklist import TokenBlacklist
        try:
            TokenBlacklist.add(payload['jti'], user.user_id, expires_at, reason='role_switch')
        except IntegrityError:
            db.session.rollback()
            return jsonify({"success": False, "error": "This session was already switched. Please refresh."}), 409

    token, expiration_time, _jti, user_data = issue_session_token(user, grant, source, expires_at=expires_at)

    log.info(f"Role switch: user={user.user_id} -> {'grant ' + str(grant.grant_id) if grant else 'own role'}")

    response = make_response(jsonify({
        "success": True,
        "message": "Role switched",
        "access_token": token,
        "expires_at": expiration_time.isoformat(),
        "user": user_data,
    }), 200)
    from utils.authentication import ENVIRONMENT
    response.set_cookie(
        'access_token', token, expires=expiration_time, httponly=True, secure=True,
        samesite='Strict' if ENVIRONMENT == 'production' else 'Lax'
    )
    return response
