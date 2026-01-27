from flask import Blueprint, g, jsonify
from controllers.buyer_controller import *
from controllers.auth_controller import jwt_required
from controllers.upload_image_controller import *
from controllers.boq_controller import get_custom_units
from utils.response_cache import cached_response, cache_dashboard_data

# Create blueprint with URL prefix
buyer_routes = Blueprint('buyer_routes', __name__, url_prefix='/api/buyer')

# Helper function to check if user is Buyer or Admin
def check_buyer_or_admin_access():
    """Check if current user is a Buyer or Admin"""
    current_user = g.user
    original_role = current_user.get('role', '')
    user_role = original_role.lower().replace('_', '').replace(' ', '')

    # Check role by name only - dynamic role system
    is_buyer_or_admin = (
        'buyer' in user_role or
        'admin' in user_role
    )

    if not is_buyer_or_admin:
        return jsonify({"error": "Access denied. Buyer or Admin role required."}), 403
    return None

# Helper function to check if user is TD or Admin (for vendor approval)
def check_td_or_admin_access():
    """Check if current user is a Technical Director or Admin"""
    current_user = g.user
    user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')

    # Check role by name only - dynamic role system
    is_td_or_admin = (
        'technicaldirector' in user_role or
        'admin' in user_role
    )

    if not is_td_or_admin:
        return jsonify({"error": "Access denied. Technical Director or Admin role required."}), 403
    return None

# Helper function to check if user is Buyer, TD, or Admin (for vendor selection and LPO operations)
def check_buyer_td_or_admin_access():
    """Check if current user is a Buyer, Technical Director, or Admin"""
    current_user = g.user
    user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')

    # Check role by name only - dynamic role system
    is_authorized = (
        'buyer' in user_role or
        'technicaldirector' in user_role or
        'admin' in user_role
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
@cache_dashboard_data(timeout=30)  # Cache dashboard for 30 seconds
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
@cached_response(timeout=15, key_prefix='buyer_pending')  # Short cache for frequently updated data
def get_buyer_pending_purchases_route():
    """Get pending purchases (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_buyer_pending_purchases()


@buyer_routes.route('/completed-purchases', methods=['GET'])
@jwt_required
@cached_response(timeout=30, key_prefix='buyer_completed')  # Longer cache for historical data
def get_buyer_completed_purchases_route():
    """Get completed purchases (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_buyer_completed_purchases()


@buyer_routes.route('/rejected-purchases', methods=['GET'])
@jwt_required
@cached_response(timeout=30, key_prefix='buyer_rejected')  # Longer cache for historical data
def get_buyer_rejected_purchases_route():
    """Get rejected purchases (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_buyer_rejected_purchases()


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


@buyer_routes.route('/purchase/<int:cr_id>/select-vendor-for-material', methods=['POST'])
@jwt_required
def select_vendor_for_material_route(cr_id):
    """Select vendor for specific material(s) in purchase (Buyer, TD, or Admin)"""
    access_check = check_buyer_td_or_admin_access()
    if access_check:
        return access_check
    return select_vendor_for_material(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/create-sub-crs', methods=['POST'])
@jwt_required
def create_sub_crs_route(cr_id):
    """Create separate sub-CRs for each vendor group (Buyer, TD, or Admin) - DEPRECATED, use create-po-children"""
    access_check = check_buyer_td_or_admin_access()
    if access_check:
        return access_check
    return create_sub_crs_for_vendor_groups(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/create-po-children', methods=['POST'])
@jwt_required
def create_po_children_route(cr_id):
    """Create POChild records for each vendor group (Buyer, TD, or Admin)"""
    access_check = check_buyer_td_or_admin_access()
    if access_check:
        return access_check
    return create_po_children(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/update', methods=['PUT'])
@jwt_required
def update_purchase_order_route(cr_id):
    """Update purchase order (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return update_purchase_order(cr_id)


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


# POChild routes
@buyer_routes.route('/po-children/pending', methods=['GET'])
@jwt_required
def get_pending_po_children_route():
    """Get all POChild records pending TD approval (TD or Admin)"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return get_pending_po_children()


@buyer_routes.route('/po-children/buyer-pending', methods=['GET'])
@jwt_required
def get_buyer_pending_po_children_route():
    """Get POChild records pending TD approval for buyer (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    from controllers.buyer_controller import get_buyer_pending_po_children
    return get_buyer_pending_po_children()


@buyer_routes.route('/po-children/approved', methods=['GET'])
@jwt_required
def get_approved_po_children_route():
    """Get all POChild records with approved vendor (Buyer, TD, or Admin)"""
    from controllers.buyer_controller import get_approved_po_children
    return get_approved_po_children()


@buyer_routes.route('/po-children/rejected', methods=['GET'])
@jwt_required
def get_rejected_po_children_route():
    """Get all POChild records rejected by TD (TD or Admin)"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    from controllers.buyer_controller import get_rejected_po_children
    return get_rejected_po_children()


@buyer_routes.route('/po-child/<int:po_child_id>/td-approve', methods=['POST'])
@jwt_required
def td_approve_po_child_route(po_child_id):
    """TD or Admin approves vendor selection for POChild"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return td_approve_po_child(po_child_id)


@buyer_routes.route('/po-child/<int:po_child_id>/td-reject', methods=['POST'])
@jwt_required
def td_reject_po_child_route(po_child_id):
    """TD or Admin rejects vendor selection for POChild"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return td_reject_po_child(po_child_id)


@buyer_routes.route('/po-child/<int:po_child_id>/reselect-vendor', methods=['POST'])
@jwt_required
def reselect_vendor_for_po_child_route(po_child_id):
    """Buyer re-selects vendor for a TD-rejected POChild"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    from controllers.buyer_controller import reselect_vendor_for_po_child
    return reselect_vendor_for_po_child(po_child_id)


@buyer_routes.route('/po-child/<int:po_child_id>/complete', methods=['POST'])
@jwt_required
def complete_po_child_purchase_route(po_child_id):
    """Complete purchase for POChild (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return complete_po_child_purchase(po_child_id)


@buyer_routes.route('/po-child/<int:po_child_id>/update-prices', methods=['PUT'])
@jwt_required
def update_po_child_prices_route(po_child_id):
    """Update negotiated prices for POChild materials (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    from controllers.buyer_controller import update_po_child_prices
    return update_po_child_prices(po_child_id)


@buyer_routes.route('/purchase/<int:cr_id>/update-prices', methods=['PUT'])
@jwt_required
def update_purchase_prices_route(cr_id):
    """Update negotiated prices for Purchase (Change Request) materials (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    from controllers.buyer_controller import update_purchase_prices
    return update_purchase_prices(cr_id)


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


@buyer_routes.route('/purchase/<int:cr_id>/generate-lpo-pdf', methods=['POST'])
@jwt_required
def generate_lpo_pdf_route(cr_id):
    """Generate LPO PDF for purchase order (Buyer, TD, or Admin)"""
    access_check = check_buyer_td_or_admin_access()
    if access_check:
        return access_check
    return generate_lpo_pdf(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/preview-lpo-pdf', methods=['POST'])
@jwt_required
def preview_lpo_pdf_route(cr_id):
    """Preview LPO PDF data before generation (Buyer, TD, or Admin)"""
    access_check = check_buyer_td_or_admin_access()
    if access_check:
        return access_check
    return preview_lpo_pdf(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/save-lpo-customization', methods=['POST'])
@jwt_required
def save_lpo_customization_route(cr_id):
    """Save LPO customizations to database (Buyer, TD, or Admin)"""
    access_check = check_buyer_td_or_admin_access()
    if access_check:
        return access_check
    return save_lpo_customization(cr_id)


@buyer_routes.route('/lpo-default-template', methods=['POST'])
@jwt_required
def save_lpo_default_template_route():
    """Save current LPO customizations as default template (Buyer, TD, or Admin)"""
    access_check = check_buyer_td_or_admin_access()
    if access_check:
        return access_check
    return save_lpo_default_template()


@buyer_routes.route('/lpo-default-template', methods=['GET'])
@jwt_required
def get_lpo_default_template_route():
    """Get user's default LPO template (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_lpo_default_template()


@buyer_routes.route('/lpo-settings', methods=['GET'])
@jwt_required
def get_lpo_settings_route():
    """Get LPO settings (signatures, company info) for PDF generation (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_lpo_settings()


@buyer_routes.route('/po-child/<int:po_child_id>/preview-vendor-email', methods=['GET'])
@jwt_required
def preview_po_child_vendor_email_route(po_child_id):
    """Preview PO email to vendor for POChild (vendor-split purchases) (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return preview_po_child_vendor_email(po_child_id)


@buyer_routes.route('/po-child/<int:po_child_id>/send-vendor-email', methods=['POST'])
@jwt_required
def send_po_child_vendor_email_route(po_child_id):
    """Send PO email to vendor for POChild (vendor-split purchases) (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return send_po_child_vendor_email(po_child_id)


@buyer_routes.route('/purchase/<int:cr_id>/send-vendor-whatsapp', methods=['POST'])
@jwt_required
def send_vendor_whatsapp_route(cr_id):
    """Send PO via WhatsApp to vendor (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return send_vendor_whatsapp(cr_id)


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
@jwt_required
def upload_files_route(cr_id):
    return buyer_upload_files(cr_id)


@buyer_routes.route('/files/<int:cr_id>', methods=['GET'])
@jwt_required
def view_files_route(cr_id):
    return buyer_view_files(cr_id)


@buyer_routes.route('/files/<int:cr_id>', methods=['DELETE'])
@jwt_required
def delete_files_route(cr_id):
    return buyer_delete_files(cr_id)


@buyer_routes.route('/files/all/<int:cr_id>', methods=['DELETE'])
@jwt_required
def delete_all_files_route(cr_id):
    return buyer_delete_all_files(cr_id)


# Store Management Routes
@buyer_routes.route('/store/items', methods=['GET'])
@jwt_required
def get_store_items_route():
    """Get all available store items (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_store_items()


@buyer_routes.route('/store/items/<int:item_id>', methods=['GET'])
@jwt_required
def get_store_item_details_route(item_id):
    """Get details of a specific store item (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_store_item_details(item_id)


@buyer_routes.route('/store/categories', methods=['GET'])
@jwt_required
def get_store_categories_route():
    """Get all store categories (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_store_categories()


@buyer_routes.route('/store/projects-by-material/<int:material_id>', methods=['GET'])
@jwt_required
def get_projects_by_material_route(material_id):
    """Get projects that have this material in their BOQ (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_projects_by_material(material_id)


@buyer_routes.route('/purchase/<int:cr_id>/check-store-availability', methods=['GET'])
@jwt_required
def check_store_availability_route(cr_id):
    """Check if CR materials are available in M2 Store (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return check_store_availability(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/complete-from-store', methods=['POST'])
@jwt_required
def complete_from_store_route(cr_id):
    """Request materials from M2 Store (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return complete_from_store(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/store-request-status', methods=['GET'])
@jwt_required
def get_store_request_status_route(cr_id):
    """Get store request status for a CR (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_store_request_status(cr_id)


@buyer_routes.route('/purchase/<int:cr_id>/vendor-selection', methods=['GET'])
@jwt_required
def get_vendor_selection_data_route(cr_id):
    """Get optimized vendor selection data (Buyer, TD, or Admin) - 78% smaller payload"""
    access_check = check_buyer_td_or_admin_access()
    if access_check:
        return access_check
    return get_vendor_selection_data(cr_id)


@buyer_routes.route('/vendor/<int:vendor_id>/update-price', methods=['POST'])
@jwt_required
def update_vendor_price_route(vendor_id):
    """Update vendor product price for a material (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return update_vendor_price(vendor_id)


@buyer_routes.route('/purchase/<int:cr_id>/save-supplier-notes', methods=['POST'])
@jwt_required
def save_supplier_notes_route(cr_id):
    """Save supplier notes for a specific material (Buyer, TD, or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return save_supplier_notes(cr_id)


@buyer_routes.route('/debug/cr/<int:cr_id>/material-selections', methods=['GET'])
@jwt_required
def debug_material_selections(cr_id):
    """Debug endpoint to check material_vendor_selections"""
    from models.change_request import ChangeRequest
    cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
    if cr:
        return jsonify({
            "cr_id": cr.cr_id,
            "material_vendor_selections": cr.material_vendor_selections,
            "use_per_material_vendors": cr.use_per_material_vendors
        }), 200
    else:
        return jsonify({"error": "CR not found"}), 404


# Project Site Engineers route
@buyer_routes.route('/project/<int:project_id>/site-engineers', methods=['GET'])
@jwt_required
def get_project_site_engineers_route(project_id):
    """Get all site engineers assigned to a project for buyer to select recipient (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_project_site_engineers(project_id)


# Buyer Material Transfer - Get Available CRs
@buyer_routes.route('/crs-for-transfer', methods=['GET'])
@jwt_required
def get_crs_for_material_transfer_route():
    """Get CRs that are ready for material transfer (purchase completed) (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_crs_for_material_transfer()


# Buyer Material Transfer - Create DN
@buyer_routes.route('/material-transfer', methods=['POST'])
@jwt_required
def create_buyer_material_transfer_route():
    """Create delivery note for buyer-initiated material transfer to site or store (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return create_buyer_material_transfer()


# Buyer Transfer History
@buyer_routes.route('/transfer-history', methods=['GET'])
@jwt_required
def get_buyer_transfer_history_route():
    """Get all delivery notes created by buyer for material transfers (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_buyer_transfer_history()


# Get Site Engineers for Material Transfer
@buyer_routes.route('/site-engineers', methods=['GET'])
@jwt_required
def get_site_engineers_route():
    """Get all site engineers for buyer to select delivery recipient (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_site_engineers_for_transfer()


# Get Projects for Site Engineer
@buyer_routes.route('/site-engineers/<int:site_engineer_id>/projects', methods=['GET'])
@jwt_required
def get_se_projects_route(site_engineer_id):
    """Get all projects for a specific site engineer (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_projects_for_site_engineer(site_engineer_id)

# Get Custom Units (for Material Transfer)
@buyer_routes.route('/custom-units', methods=['GET'])
@jwt_required
def get_buyer_custom_units_route():
    """Get all custom units for material transfers (Buyer or Admin)"""
    access_check = check_buyer_or_admin_access()
    if access_check:
        return access_check
    return get_custom_units()


