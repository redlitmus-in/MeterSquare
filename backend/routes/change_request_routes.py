from flask import Blueprint, g, jsonify
from utils.authentication import jwt_required
from controllers.change_request_controller import *

change_request_routes = Blueprint('change_request_routes', __name__, url_prefix='/api')

# Helper function - Change requests accessible by PM, MEP, SE, Estimator, TD, or Admin
def check_cr_access():
    """
    Check if current user can access Change Request operations
    Supports admin viewing as another role
    """
    from utils.admin_viewing_context import get_effective_user_context

    current_user = g.user
    user_role = current_user.get('role', '').lower()

    # Admin always has access
    if user_role == 'admin':
        return None

    # Check effective role (handles admin viewing as another role)
    context = get_effective_user_context()
    effective_role = context.get('effective_role', user_role)

    allowed_roles = ['projectmanager', 'mep', 'sitesupervisor', 'siteengineer', 'estimator', 'technicaldirector', 'admin']
    if effective_role.lower() not in allowed_roles:
        return jsonify({"error": "Access denied. PM, MEP, SE, Estimator, TD, or Admin role required."}), 403
    return None


# Create change request (PM/SE adds extra materials)
@change_request_routes.route('/boq/change-request', methods=['POST'])
@jwt_required
def create_change_request_route():
    """PM/SE/Admin creates change request"""
    access_check = check_cr_access()
    if access_check:
        return access_check
    return create_change_request()


# Get all change requests (role-filtered)
@change_request_routes.route('/change-requests', methods=['GET'])
@jwt_required
def get_all_change_requests_route():
    """Get all change requests (role-filtered, Admin sees all)"""
    access_check = check_cr_access()
    if access_check:
        return access_check
    return get_all_change_requests()


# Get specific change request by ID
@change_request_routes.route('/change-request/<int:cr_id>', methods=['GET'])
@jwt_required
def get_change_request_by_id_route(cr_id):
    """Get specific change request details"""
    access_check = check_cr_access()
    if access_check:
        return access_check
    return get_change_request_by_id(cr_id)


# Update change request (Only for pending requests by creator)
@change_request_routes.route('/change-request/<int:cr_id>', methods=['PUT'])
@jwt_required
def update_change_request_route(cr_id):
    """Update pending change request (creator or Admin)"""
    access_check = check_cr_access()
    if access_check:
        return access_check
    return update_change_request(cr_id)


# Delete change request (Only for pending/rejected requests by creator)
@change_request_routes.route('/change-request/<int:cr_id>', methods=['DELETE'])
@jwt_required
def delete_change_request_route(cr_id):
    """Delete pending or rejected change request (creator or Admin)"""
    access_check = check_cr_access()
    if access_check:
        return access_check
    return delete_change_request(cr_id)


# Approve change request (Estimator/TD/Admin)
@change_request_routes.route('/change-request/<int:cr_id>/approve', methods=['POST'])
@jwt_required
def approve_change_request_route(cr_id):
    """Approve change request (Estimator/TD/Admin)"""
    access_check = check_cr_access()
    if access_check:
        return access_check
    return approve_change_request(cr_id)


# Reject change request (Estimator/TD/Admin)
@change_request_routes.route('/change-request/<int:cr_id>/reject', methods=['POST'])
@jwt_required
def reject_change_request_route(cr_id):
    """Reject change request (Estimator/TD/Admin)"""
    access_check = check_cr_access()
    if access_check:
        return access_check
    return reject_change_request(cr_id)


# Resend rejected change request (Creator/Buyer/Admin)
@change_request_routes.route('/change-request/<int:cr_id>/resend', methods=['PUT'])
@jwt_required
def resend_change_request_route(cr_id):
    """Resend/resubmit rejected change request"""
    access_check = check_cr_access()
    if access_check:
        return access_check
    return resend_change_request(cr_id)


# Send for review (PM/SE/Admin sends request to next approver)
@change_request_routes.route('/change-request/<int:cr_id>/send-for-review', methods=['POST'])
@jwt_required
def send_for_review_route(cr_id):
    """Send change request for review (PM/SE/Admin)"""
    access_check = check_cr_access()
    if access_check:
        return access_check
    return send_for_review(cr_id)


# REMOVED: update_change_request_status endpoint - DEPRECATED
# Use /send-for-review endpoint instead
# This endpoint has been removed to avoid confusion and maintain single responsibility


# Get all change requests for a specific BOQ
@change_request_routes.route('/boq/<int:boq_id>/change-requests', methods=['GET'])
@jwt_required
def get_boq_change_requests_route(boq_id):
    """
    Get all change requests (pending/approved/rejected) for a specific BOQ
    Used by PM/SE to view their submitted requests in BOQ modal
    """
    return get_boq_change_requests(boq_id)


# Get item overhead snapshot
@change_request_routes.route('/boq/<int:boq_id>/item-overhead/<string:item_id>', methods=['GET'])
@jwt_required
def get_item_overhead_route(boq_id, item_id):
    """
    Get overhead snapshot for a specific BOQ item
    Used for live calculations before creating change request
    """
    from controllers.change_request_controller import get_item_overhead
    return get_item_overhead(boq_id, item_id)


# ============================================================================
# DEPRECATED ENDPOINT - REMOVED
# ============================================================================
# This endpoint has been PERMANENTLY DISABLED to prevent duplicate code paths.
#
# OLD ENDPOINT: POST /api/change-request/<cr_id>/complete-purchase
# - Set status='purchase_completed' (direct to site, bypassed M2 Store)
# - Merged materials directly to BOQ
# - No InternalMaterialRequest created
#
# CORRECT ENDPOINT: POST /api/buyer/complete-purchase
# - Set status='routed_to_store' (routes through Production Manager)
# - Creates InternalMaterialRequest for PM
# - Proper inventory tracking via M2 Store
# ============================================================================

# @change_request_routes.route('/change-request/<int:cr_id>/complete-purchase', methods=['POST'])
# @jwt_required
# def complete_purchase_route(cr_id):
#     """DEPRECATED - DO NOT USE"""
#     return jsonify({"error": "This endpoint is deprecated. Use POST /api/buyer/complete-purchase instead."}), 410


# Get all buyers (for Estimator/TD to select when approving)
@change_request_routes.route('/buyers', methods=['GET'])
@jwt_required
def get_all_buyers_route():
    """
    Get all active buyers in the system
    Used by Estimator/TD to select buyer when approving change requests
    """
    return get_all_buyers()


# REMOVED: Extra Material Endpoints - DEPRECATED
# These endpoints have been removed to avoid duplication.
# Use the main change request endpoints instead:
# - GET /api/change-requests (for fetching all change requests)
# - POST /api/boq/change-request (for creating change requests)
# - POST /api/change-request/{id}/approve (for approving)
# The extra_materials endpoints were just wrappers around the main functionality
