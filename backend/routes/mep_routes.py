from flask import Blueprint, g, jsonify
from controllers.mep_controller import (
    get_mep_approval_boq,
    get_mep_assign_project,
    get_mep_approved_boq,
    get_mep_pending_boq,
    get_mep_rejected_boq,
    get_mep_completed_project,
    get_mep_dashboard
)
from utils.authentication import jwt_required

mep_routes = Blueprint("mep_routes", __name__, url_prefix='/api')

# ============================================================================
# STRICT ROLE-BASED ACCESS CONTROL DECORATOR
# ============================================================================

def check_mep_or_admin_access():
    """
    Check if current user is a MEP Supervisor or Admin.
    STRICT: Only allows MEP or Admin roles.
    """
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    # Support all MEP role variants: mep, mepsupervisor, mep_supervisor
    allowed_roles = ['mep', 'mepsupervisor', 'mep_supervisor', 'admin']
    if user_role not in allowed_roles:
        return jsonify({
            "error": "Access denied. MEP Supervisor or Admin role required.",
            "required_roles": allowed_roles,
            "your_role": user_role
        }), 403
    return None


# ============================================================================
# MEP SUPERVISOR ROUTES - MEP-specific endpoints
# All routes require MEP or Admin role
# ============================================================================

@mep_routes.route('/mep_approval', methods=['GET'])
@jwt_required
def get_mep_approval_boq_route():
    """
    Get MEP Approval BOQs (For Approval tab - MEP or Admin only)
    Returns: BOQs with Pending_PM_Approval status assigned to MEP
    """
    access_check = check_mep_or_admin_access()
    if access_check:
        return access_check
    return get_mep_approval_boq()


@mep_routes.route('/mep_dashboard', methods=['GET'])
@jwt_required
def get_mep_dashboard_route():
    """
    Get MEP dashboard statistics (MEP or Admin only)
    Returns: Dashboard stats including total BOQ items, assignments, project value, etc.
    """
    access_check = check_mep_or_admin_access()
    if access_check:
        return access_check
    return get_mep_dashboard()


@mep_routes.route('/mep_assign_project', methods=['GET'])
@jwt_required
def get_mep_assign_project_route():
    """
    View projects assigned to current MEP
    Filters by: Project.mep_supervisor_id contains current user_id
    """
    access_check = check_mep_or_admin_access()
    if access_check:
        return access_check
    return get_mep_assign_project()


@mep_routes.route('/mep_approve_boq', methods=['GET'])
@jwt_required
def get_mep_approved_boq_route():
    """
    View approved BOQs for MEP assigned projects
    Filters by: Project.mep_supervisor_id for MEP users
    """
    access_check = check_mep_or_admin_access()
    if access_check:
        return access_check
    return get_mep_approved_boq()


@mep_routes.route('/mep_pending_boq', methods=['GET'])
@jwt_required
def get_mep_pending_boq_route():
    """
    View pending BOQs for MEP assigned projects
    Shows: Projects with approved BOQs that are not yet completed
    """
    access_check = check_mep_or_admin_access()
    if access_check:
        return access_check
    return get_mep_pending_boq()


@mep_routes.route('/mep_rejected_boq', methods=['GET'])
@jwt_required
def get_mep_rejected_boq_route():
    """
    View rejected BOQs for MEP assigned projects
    Filters by: BOQ status = 'PM_Rejected' AND mep_supervisor_id
    """
    access_check = check_mep_or_admin_access()
    if access_check:
        return access_check
    return get_mep_rejected_boq()


@mep_routes.route('/mep_completed_project', methods=['GET'])
@jwt_required
def get_mep_completed_project_route():
    """
    View MEP Completed Projects
    Filters by: Project status = 'Completed' AND mep_supervisor_id contains current user
    """
    access_check = check_mep_or_admin_access()
    if access_check:
        return access_check
    return get_mep_completed_project()
