from flask import Blueprint, g, jsonify
from controllers.site_supervisor_controller import *
from utils.authentication import *

sitesupervisor_routes = Blueprint("sitesupervisor_routes", __name__, url_prefix='/api')

# Helper function to check if user is Site Supervisor or Admin
def check_ss_or_admin_access():
    """Check if current user is a Site Supervisor or Admin"""
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    if user_role not in ['sitesupervisor', 'siteengineer', 'admin']:
        return jsonify({"error": "Access denied. Site Supervisor or Admin role required."}), 403
    return None


#Dashboard statistics for site engineer
@sitesupervisor_routes.route('/sitesupervisor_boq/dashboard', methods=['GET'])
@jwt_required
def get_sitesupervisor_dashboard_route():
    """Site Supervisor or Admin views dashboard stats"""
    access_check = check_ss_or_admin_access()
    if access_check:
        return access_check
    return get_sitesupervisor_dashboard()

# Site Engineer validates completion request (read-only check)
@sitesupervisor_routes.route('/validate_completion/<int:project_id>', methods=['GET'])
@jwt_required
def validate_completion_request_route(project_id):
    """Site Supervisor validates if completion can be requested (no side effects)"""
    access_check = check_ss_or_admin_access()
    if access_check:
        return access_check
    return validate_completion_request(project_id)

#Site Engineer requests project completion
@sitesupervisor_routes.route('/request_completion/<int:project_id>', methods=['POST'])
@jwt_required
def request_project_completion_route(project_id):
    """Site Supervisor or Admin requests project completion"""
    access_check = check_ss_or_admin_access()
    if access_check:
        return access_check
    return request_project_completion(project_id)

# Site Engineer gets available buyers
@sitesupervisor_routes.route('/available-buyers', methods=['GET'])
@jwt_required
def get_available_buyers_route():
    """Site Supervisor or Admin gets list of available buyers"""
    access_check = check_ss_or_admin_access()
    if access_check:
        return access_check
    return get_available_buyers()

# Site Engineer assigns BOQ to buyer
@sitesupervisor_routes.route('/boq/<int:boq_id>/assign-buyer', methods=['POST'])
@jwt_required
def assign_boq_to_buyer_route(boq_id):
    """Site Supervisor or Admin assigns BOQ materials to buyer"""
    access_check = check_ss_or_admin_access()
    if access_check:
        return access_check
    return assign_boq_to_buyer(boq_id)

# Site Engineer gets items assigned to them
@sitesupervisor_routes.route('/my-assigned-items', methods=['GET'])
@jwt_required
def get_my_assigned_items_route():
    """Site Supervisor or Admin gets all BOQ items assigned to them"""
    access_check = check_ss_or_admin_access()
    if access_check:
        return access_check
    return get_my_assigned_items()

# Site Engineer gets ongoing projects (status != completed)
@sitesupervisor_routes.route('/se_ongoing_projects', methods=['GET'])
@jwt_required
def get_se_ongoing_projects_route():
    """Site Engineer or Admin gets ongoing projects"""
    access_check = check_ss_or_admin_access()
    if access_check:
        return access_check
    return get_se_ongoing_projects()

# Site Engineer gets completed projects (status = completed)
@sitesupervisor_routes.route('/se_completed_projects', methods=['GET'])
@jwt_required
def get_se_completed_projects_route():
    """Site Engineer or Admin gets completed projects"""
    access_check = check_ss_or_admin_access()
    if access_check:
        return access_check
    return get_se_completed_projects()

#Role base view a site supervisor boq
@sitesupervisor_routes.route('/sitesupervisor_boq', methods=['GET'])
@jwt_required
def get_all_sitesupervisor_boqs_route():
    """Site Supervisor or Admin views assigned projects"""
    access_check = check_ss_or_admin_access()
    if access_check:
        return access_check
    return get_all_sitesupervisor_boqs()