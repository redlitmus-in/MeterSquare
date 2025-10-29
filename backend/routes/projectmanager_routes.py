from flask import Blueprint, g, jsonify
from controllers.site_supervisor_controller import *
from controllers.projectmanager_controller import *
from controllers.buyer_controller import (
    create_buyer,
    get_all_buyers,
    get_buyer_id,
    update_buyer,
    delete_buyer
)
from utils.authentication import *

pm_routes = Blueprint("pm_routes", __name__, url_prefix='/api')

# Helper function to check if user is PM or Admin
def check_pm_or_admin_access():
    """Check if current user is a Project Manager or Admin"""
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    if user_role not in ['projectmanager', 'admin']:
        return jsonify({"error": "Access denied. Project Manager or Admin role required."}), 403
    return None

# ============================================================================
# BOQ ROUTES - Project Manager BOQ Management
# ============================================================================

#Role based listout a boq
@pm_routes.route('/pm_boq', methods=['GET'])
@jwt_required
def get_all_PM_boqs_route():
    # Allow both PM and Admin access
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return get_all_pm_boqs()

@pm_routes.route('/boq/send_estimator', methods=['POST'])
@jwt_required
def send_boq_to_estimator_route():
    # Allow both PM and Admin access
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return send_boq_to_estimator()


# ============================================================================
# SITE ENGINEER (SE) ROUTES - PM manages Site Engineers
# ============================================================================

# Create site engineer/supervisor
@pm_routes.route('/create_sitesupervisor', methods=['POST'])
@jwt_required
def create_sitesupervisor_route():
    """PM or Admin creates a new Site Engineer"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return create_sitesupervisor()

# Get all site engineers/supervisors
@pm_routes.route('/all_sitesupervisor', methods=['GET'])
@jwt_required
def get_all_sitesupervisor_route():
    """PM or Admin views all Site Engineers"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return get_all_sitesupervisor()

# Get specific site engineer by ID
@pm_routes.route('/get_sitesupervisor/<int:site_supervisor_id>', methods=['GET'])
@jwt_required
def get_sitesupervisor_id_route(site_supervisor_id):
    """PM or Admin views a specific Site Engineer"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return get_sitesupervisor_id(site_supervisor_id)

# Update site engineer
@pm_routes.route('/update_sitesupervisor/<int:site_supervisor_id>', methods=['PUT'])
@jwt_required
def update_sitesupervisor_route(site_supervisor_id):
    """PM or Admin updates Site Engineer details"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return update_sitesupervisor(site_supervisor_id)

# Delete site engineer
@pm_routes.route('/delete_sitesupervisor/<int:site_supervisor_id>', methods=['DELETE'])
@jwt_required
def delete_sitesupervisor_route(site_supervisor_id):
    """PM or Admin deletes a Site Engineer"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return delete_sitesupervisor(site_supervisor_id)

# Assign site engineer to project
@pm_routes.route('/ss_assign', methods=['POST'])
@jwt_required
def assign_projects_sitesupervisor_route():
    """PM or Admin assigns Site Engineer to projects"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return assign_projects_sitesupervisor()


# ============================================================================
# BUYER ROUTES - PM manages Buyers
# ============================================================================

# Create buyer
@pm_routes.route('/create_buyer', methods=['POST'])
@jwt_required
def create_buyer_route():
    """PM or Admin creates a new Buyer"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return create_buyer()

# Get all buyers
@pm_routes.route('/all_buyers', methods=['GET'])
@jwt_required
def get_all_buyers_route():
    """PM or Admin views all Buyers (assigned and unassigned)"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return get_all_buyers()

# Get specific buyer by ID
@pm_routes.route('/get_buyer/<int:user_id>', methods=['GET'])
@jwt_required
def get_buyer_id_route(user_id):
    """PM or Admin views a specific Buyer with assigned projects"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return get_buyer_id(user_id)

# Update buyer
@pm_routes.route('/update_buyer/<int:user_id>', methods=['PUT'])
@jwt_required
def update_buyer_route(user_id):
    """PM or Admin updates Buyer details"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return update_buyer(user_id)

# Delete buyer
@pm_routes.route('/delete_buyer/<int:user_id>', methods=['DELETE'])
@jwt_required
def delete_buyer_route(user_id):
    """PM or Admin deletes a Buyer"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return delete_buyer(user_id) 
