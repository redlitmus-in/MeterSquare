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

# ============================================================================
# STRICT ROLE-BASED ACCESS CONTROL DECORATORS
# These decorators ensure PM and MEP roles are properly separated
# ============================================================================

def check_pm_or_admin_access():
    """
    Check if current user is a Project Manager or Admin.
    STRICT: Only allows PM or Admin roles.
    """
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    if user_role not in ['projectmanager', 'admin', 'mep']:
        return jsonify({
            "error": "Access denied. Project Manager or Admin role required.",
            "required_roles": ["projectManager", "admin"],
            "your_role": user_role
        }), 403
    return None

def check_mep_or_admin_access():
    """
    Check if current user is a MEP Supervisor or Admin.
    STRICT: Only allows MEP or Admin roles.
    """
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    if user_role not in ['mep', 'admin']:
        return jsonify({
            "error": "Access denied. MEP Supervisor or Admin role required.",
            "required_roles": ["mep", "admin"],
            "your_role": user_role
        }), 403
    return None

def check_pm_or_mep_or_admin_access():
    """
    Check if current user is a Project Manager, MEP Supervisor, or Admin.
    SHARED CODE: Allows both PM and MEP roles to access the same endpoints.
    This decorator is used for shared functionality where both roles have identical capabilities.
    """
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    if user_role not in ['projectmanager', 'mep', 'admin']:
        return jsonify({
            "error": "Access denied. Project Manager, MEP Supervisor, or Admin role required.",
            "required_roles": ["projectManager", "mep", "admin"],
            "your_role": user_role
        }), 403
    return None

# ============================================================================
# BOQ ROUTES - Project Manager BOQ Management
# ============================================================================

@pm_routes.route('/boq/send_estimator', methods=['POST'])
@jwt_required
def send_boq_to_estimator_route():
    # SHARED: Allow PM, MEP, and Admin access
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return send_boq_to_estimator()

# Dashboard statistics
@pm_routes.route('/pm_dashboard', methods=['GET'])
@jwt_required
def get_pm_dashboard_route():
    """Get PM dashboard statistics (PM or Admin)"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return get_pm_dashboard()

@pm_routes.route('/all_sitesupervisor', methods=['GET'])
@jwt_required
def get_all_sitesupervisor_route():
    """Get PM dashboard statistics (PM or Admin)"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return get_all_sitesupervisor()

# ============================================================================
# SITE ENGINEER (SE) ROUTES - PM manages Site Engineers
# ============================================================================

# Create site engineer/supervisor
@pm_routes.route('/create_sitesupervisor', methods=['POST'])
@jwt_required
def create_sitesupervisor_route():
    """SHARED: PM, MEP, or Admin creates a new Site Engineer"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return create_sitesupervisor()


# Get specific site engineer by ID
@pm_routes.route('/get_sitesupervisor/<int:site_supervisor_id>', methods=['GET'])
@jwt_required
def get_sitesupervisor_id_route(site_supervisor_id):
    """SHARED: PM, MEP, or Admin views a specific Site Engineer"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_sitesupervisor_id(site_supervisor_id)

# Update site engineer
@pm_routes.route('/update_sitesupervisor/<int:site_supervisor_id>', methods=['PUT'])
@jwt_required
def update_sitesupervisor_route(site_supervisor_id):
    """SHARED: PM, MEP, or Admin updates Site Engineer details"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return update_sitesupervisor(site_supervisor_id)

# Delete site engineer
@pm_routes.route('/delete_sitesupervisor/<int:site_supervisor_id>', methods=['DELETE'])
@jwt_required
def delete_sitesupervisor_route(site_supervisor_id):
    """SHARED: PM, MEP, or Admin deletes a Site Engineer"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return delete_sitesupervisor(site_supervisor_id)

# Assign site engineer to project
@pm_routes.route('/ss_assign', methods=['POST'])
@jwt_required
def assign_projects_sitesupervisor_route():
    """SHARED: PM, MEP, or Admin assigns Site Engineer to projects"""
    access_check = check_pm_or_mep_or_admin_access()
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
    """SHARED: PM, MEP, or Admin creates a new Buyer"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return create_buyer()

# Get all buyers
@pm_routes.route('/all_buyers', methods=['GET'])
@jwt_required
def get_all_buyers_route():
    """SHARED: PM, MEP, or Admin views all Buyers (assigned and unassigned)"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_all_buyers()

# Get specific buyer by ID
@pm_routes.route('/get_buyer/<int:user_id>', methods=['GET'])
@jwt_required
def get_buyer_id_route(user_id):
    """SHARED: PM, MEP, or Admin views a specific Buyer with assigned projects"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_buyer_id(user_id)

# Update buyer
@pm_routes.route('/update_buyer/<int:user_id>', methods=['PUT'])
@jwt_required
def update_buyer_route(user_id):
    """SHARED: PM, MEP, or Admin updates Buyer details"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return update_buyer(user_id)

# Delete buyer
@pm_routes.route('/delete_buyer/<int:user_id>', methods=['DELETE'])
@jwt_required
def delete_buyer_route(user_id):
    """SHARED: PM, MEP, or Admin deletes a Buyer"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return delete_buyer(user_id)


# ============================================================================
# ITEM-LEVEL ASSIGNMENT ROUTES - PM assigns items to Site Engineers
# ============================================================================

# Assign BOQ items to Site Engineer
@pm_routes.route('/boq/assign-items-to-se', methods=['POST'])
@jwt_required
def assign_items_to_se_route():
    """SHARED: PM, MEP, or Admin assigns specific BOQ items to a Site Engineer"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return assign_items_to_se()

# Get item assignments for a BOQ
@pm_routes.route('/boq/<int:boq_id>/item-assignments', methods=['GET'])
@jwt_required
def get_item_assignments_route(boq_id):
    """SHARED: PM, MEP, SE, or Admin views item assignments for a BOQ"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_item_assignments(boq_id)

# Unassign items from Site Engineer
@pm_routes.route('/boq/unassign-items', methods=['POST'])
@jwt_required
def unassign_items_from_se_route():
    """SHARED: PM, MEP, or Admin unassigns items from Site Engineer"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return unassign_items_from_se()

# Get available Site Engineers for assignment
@pm_routes.route('/available-site-engineers', methods=['GET'])
@jwt_required
def get_available_site_engineers_route():
    """SHARED: PM, MEP, or Admin gets list of available Site Engineers"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_available_site_engineers()


# ============================================================================
# COMPLETION CONFIRMATION ROUTES - PM confirms SE completion
# ============================================================================

# PM confirms SE completion request
@pm_routes.route('/confirm-se-completion', methods=['POST'])
@jwt_required
def confirm_se_completion_route():
    """SHARED: PM or MEP confirms SE completion (only for their assignments)"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return confirm_se_completion()

# Get project completion details
@pm_routes.route('/projects/<int:project_id>/completion-details', methods=['GET'])
@jwt_required
def get_project_completion_details_route(project_id):
    """SHARED: PM, MEP, or Admin views project completion details"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_project_completion_details(project_id) 

@pm_routes.route('/pm_approval_boq', methods=['GET'])
@jwt_required
def get_pm_approval_boq_route():
    """View BOQs pending PM approval for current user"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_pm_approval_boq()


@pm_routes.route('/pm_assign_project', methods=['GET'])
@jwt_required
def get_pm_assign_project_route():
    """View projects assigned to current PM based on BOQ.last_pm_user_id"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_pm_assign_project()

@pm_routes.route('/pm_approve_boq', methods=['GET'])
@jwt_required
def get_pm_approved_boq_route():
    """View projects assigned to current PM based on BOQ.last_pm_user_id"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_pm_approved_boq()

@pm_routes.route('/pm_production_management', methods=['GET'])
@jwt_required
def get_pm_production_management_boqs_route():
    """Get ALL BOQs for PM Production Management view (shows all project BOQs)"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_pm_production_management_boqs()

@pm_routes.route('/pm_pending_boq', methods=['GET'])
@jwt_required
def get_pm_pending_boq_route():
    """View PM Pending BOQs - status Approved and Project.user_id contains current user"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_pm_pending_boq()

@pm_routes.route('/pm_rejected_boq', methods=['GET'])
@jwt_required
def get_pm_rejected_boq_route():
    """View PM Rejected BOQs - status PM_Rejected and last_pm_user_id matches current user"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_pm_rejected_boq()

@pm_routes.route('/pm_completed_project', methods=['GET'])
@jwt_required
def get_pm_completed_project_route():
    """View PM Completed Projects - status Completed and Project.user_id contains current user"""
    access_check = check_pm_or_mep_or_admin_access()
    if access_check:
        return access_check
    return get_pm_completed_project()
