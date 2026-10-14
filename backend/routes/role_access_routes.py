# routes/role_access_routes.py
"""Multi-role access: Admin/TD manage temporary role grants; users switch roles."""

from flask import Blueprint

from utils.authentication import jwt_required
from controllers.role_access_controller import (
    list_grants, list_grantable_users, list_roles, list_role_holders, list_role_menus, list_user_open_grants,
    create_grant, revoke_grant, update_grant, pause_grant, resume_grant, my_roles, switch_role,
)

role_access_routes = Blueprint('role_access_routes', __name__, url_prefix='/api/role-access')


# Admin / Technical Director
@role_access_routes.route('/grants', methods=['GET'])
@jwt_required
def list_grants_route():
    return list_grants()


@role_access_routes.route('/grants', methods=['POST'])
@jwt_required
def create_grant_route():
    return create_grant()


@role_access_routes.route('/grants/<int:grant_id>/revoke', methods=['POST'])
@jwt_required
def revoke_grant_route(grant_id):
    return revoke_grant(grant_id)


@role_access_routes.route('/grants/<int:grant_id>', methods=['PATCH'])
@jwt_required
def update_grant_route(grant_id):
    return update_grant(grant_id)


@role_access_routes.route('/grants/<int:grant_id>/pause', methods=['POST'])
@jwt_required
def pause_grant_route(grant_id):
    return pause_grant(grant_id)


@role_access_routes.route('/grants/<int:grant_id>/resume', methods=['POST'])
@jwt_required
def resume_grant_route(grant_id):
    return resume_grant(grant_id)


@role_access_routes.route('/users', methods=['GET'])
@jwt_required
def list_grantable_users_route():
    return list_grantable_users()


@role_access_routes.route('/users/<int:user_id>/grants', methods=['GET'])
@jwt_required
def list_user_open_grants_route(user_id):
    return list_user_open_grants(user_id)


@role_access_routes.route('/roles', methods=['GET'])
@jwt_required
def list_roles_route():
    return list_roles()


@role_access_routes.route('/roles/<int:role_id>/users', methods=['GET'])
@jwt_required
def list_role_holders_route(role_id):
    return list_role_holders(role_id)


@role_access_routes.route('/roles/<int:role_id>/menus', methods=['GET'])
@jwt_required
def list_role_menus_route(role_id):
    return list_role_menus(role_id)


# Signed-in user (validates the token itself so an ended grant can still switch back)
@role_access_routes.route('/my-roles', methods=['GET'])
def my_roles_route():
    return my_roles()


@role_access_routes.route('/switch', methods=['POST'])
def switch_role_route():
    return switch_role()
