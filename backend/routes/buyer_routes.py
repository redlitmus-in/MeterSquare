from flask import Blueprint, g, jsonify
from controllers.buyer_controller import *
from controllers.auth_controller import jwt_required
from controllers.upload_image_controller import *
# Create blueprint with URL prefix
buyer_routes = Blueprint('buyer_routes', __name__, url_prefix='/api/buyer')

# Helper function to check if user is Buyer or Admin
def check_buyer_or_admin_access():
    """Check if current user is a Buyer or Admin"""
    current_user = g.user
    original_role = current_user.get('role', '')
    user_role = original_role.lower().replace('_', '').replace(' ', '')
    role_id = current_user.get('role_id')

    # Check role by name or role_id (4 = Buyer, 5 = Admin)
    is_buyer_or_admin = (
        'buyer' in user_role or
        'admin' in user_role or
        role_id == 4 or
        role_id == 5
    )

    if not is_buyer_or_admin:
        return jsonify({"error": "Access denied. Buyer or Admin role required."}), 403
    return None

# Helper function to check if user is TD or Admin (for vendor approval)
def check_td_or_admin_access():
    """Check if current user is a Technical Director or Admin"""
    current_user = g.user
    user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')
    role_id = current_user.get('role_id')

    # Check role by name or role_id (3 = TD, 5 = Admin)
    is_td_or_admin = (
        'technicaldirector' in user_role or
        'admin' in user_role or
        role_id == 3 or
        role_id == 5
    )

    if not is_td_or_admin:
        return jsonify({"error": "Access denied. Technical Director or Admin role required."}), 403
    return None

# Helper function to check if user is Buyer, TD, or Admin (for vendor selection)
def check_buyer_td_or_admin_access():
    """Check if current user is a Buyer, Technical Director, or Admin"""
    current_user = g.user
    user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')
    role_id = current_user.get('role_id')

    # Check role by name or role_id (4 = Buyer, 3 = TD, 5 = Admin)
    is_authorized = (
        'buyer' in user_role or
        'technicaldirector' in user_role or
        'admin' in user_role or
        role_id == 4 or
        role_id == 3 or
        role_id == 5
    )

    if not is_authorized:
        return jsonify({"error": "Access denied. Buyer, Technical Director, or Admin role required."}), 403
    return None

# ============================================================================
# NOTE: Buyer CRUD (Create/Update/Delete) is managed by Project Manager
# See projectmanager_routes.py for buyer CRUD operations:
# - POST /api/create_buyer
# - GET /api/all_buyers
# - GET /api/get_buyer/<user_id>
# - PUT /api/update_buyer/<user_id>
# - DELETE /api/delete_buyer/<user_id>
#
# This file contains buyer-specific operational routes (dashboard, purchases, etc.)
# ============================================================================


# Dashboard route
@buyer_routes.route('/dashboard', methods=['GET'])
@jwt_required
def get_buyer_dashboard_route():
    """Get buyer dashboard statistics (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_buyer_dashboard()


# Material management routes
@buyer_routes.route('/boq-materials', methods=['GET'])
@jwt_required
def get_buyer_boq_materials_route():
    """Get BOQ materials (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_buyer_boq_materials()


@buyer_routes.route('/new-purchases', methods=['GET'])
@jwt_required
def get_buyer_pending_purchases_route():
    """Get pending purchases (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_buyer_pending_purchases()


@buyer_routes.route('/completed-purchases', methods=['GET'])
@jwt_required
def get_buyer_completed_purchases_route():
    """Get completed purchases (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_buyer_completed_purchases()


@buyer_routes.route('/complete-purchase', methods=['POST'])
@jwt_required
def complete_purchase_route():
    """Mark purchase as complete (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return complete_purchase()


@buyer_routes.route('/purchase/<int:cr_id>', methods=['GET'])
@jwt_required
def get_purchase_by_id_route(cr_id):
    """Get purchase details (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_purchase_by_id(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/select-vendor', methods=['POST'])
@jwt_required
def select_vendor_for_purchase_route(cr_id):
    """Select vendor for purchase (Buyer, TD, or Admin)"""
    access_check = check_buyer_td_or_admin_access()
    if access_check:
        return access_check
    return select_vendor_for_purchase(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/update', methods=['PUT'])
@jwt_required
def update_purchase_order_route(cr_id):
    """Update purchase order (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return update_purchase_order(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/notes', methods=['PUT'])
@jwt_required
def update_purchase_notes_route(cr_id):
    """Update purchase notes (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return update_purchase_notes(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/td-approve-vendor', methods=['POST'])
@jwt_required
def td_approve_vendor_route(cr_id):
    """TD or Admin approves vendor selection"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return td_approve_vendor(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/td-reject-vendor', methods=['POST'])
@jwt_required
def td_reject_vendor_route(cr_id):
    """TD or Admin rejects vendor selection"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return td_reject_vendor(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/preview-vendor-email', methods=['GET'])
@jwt_required
def preview_vendor_email_route(cr_id):
    """Preview vendor email (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return preview_vendor_email(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/send-vendor-email', methods=['POST'])
@jwt_required
def send_vendor_email_route(cr_id):
    """Send PO email to vendor (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return send_vendor_email(cr_id)


# SE BOQ Assignment routes
@buyer_routes.route('/se-boq-assignments', methods=['GET'])
@jwt_required
def get_se_boq_assignments_route():
    """Get all SE BOQ assignments for current buyer (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_se_boq_assignments()


@buyer_routes.route('/se-boq/<int:assignment_id>/select-vendor', methods=['POST'])
@jwt_required
def select_vendor_for_se_boq_route(assignment_id):
    """Select vendor for SE BOQ assignment (Buyer, TD, or Admin)"""
    access_check = check_buyer_td_or_admin_access()
    if access_check:
        return access_check
    return select_vendor_for_se_boq(assignment_id)


@buyer_routes.route('/se-boq/<int:assignment_id>/td-approve-vendor', methods=['POST'])
@jwt_required
def td_approve_vendor_for_se_boq_route(assignment_id):
    """TD or Admin approves vendor selection for SE BOQ assignment"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return td_approve_vendor_for_se_boq(assignment_id)


@buyer_routes.route('/se-boq/<int:assignment_id>/td-reject-vendor', methods=['POST'])
@jwt_required
def td_reject_vendor_for_se_boq_route(assignment_id):
    """TD or Admin rejects vendor selection for SE BOQ assignment"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return td_reject_vendor_for_se_boq(assignment_id)


@buyer_routes.route('/se-boq/<int:assignment_id>/complete-purchase', methods=['POST'])
@jwt_required
def complete_se_boq_purchase_route(assignment_id):
    """Complete purchase for SE BOQ assignment (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return complete_se_boq_purchase(assignment_id)


@buyer_routes.route('/se-boq/<int:assignment_id>/send-vendor-email', methods=['POST'])
@jwt_required
def send_se_boq_vendor_email_route(assignment_id):
    """Send PO email to vendor for SE BOQ assignment (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return send_se_boq_vendor_email(assignment_id)


# File Management routes
@buyer_routes.route('/upload/<int:cr_id>', methods=['POST'])
# @jwt_required
def upload_files_route(cr_id):
    return buyer_upload_files(cr_id)


@buyer_routes.route('/files/<int:cr_id>', methods=['GET'])
# @jwt_required
def view_files_route(cr_id):
    return buyer_view_files(cr_id)


@buyer_routes.route('/files/<int:cr_id>', methods=['DELETE'])
# @jwt_required
def delete_files_route(cr_id):
    return buyer_delete_files(cr_id)


@buyer_routes.route('/files/all/<int:cr_id>', methods=['DELETE'])
# @jwt_required
def delete_all_files_route(cr_id):
    return buyer_delete_all_files(cr_id)

