"""
Asset Delivery Note (ADN) and Return Delivery Note (ARDN) Routes
Blueprint for the proper DN/RDN flow for returnable assets.
"""

from flask import Blueprint
from controllers.asset_dn_controller import (
    # Stock In
    create_stock_in,
    get_stock_in_list,
    # Asset Delivery Note (ADN)
    create_delivery_note,
    get_delivery_notes,
    get_delivery_note,
    dispatch_delivery_note,
    receive_delivery_note,
    # Asset Return Delivery Note (ARDN)
    create_return_note,
    get_return_notes,
    get_return_note,
    issue_return_note,
    update_return_note,
    dispatch_return_note,
    receive_return_note,
    process_return_note,
    # Dashboard & Utility
    get_dn_dashboard,
    get_available_for_dispatch,
    get_project_dispatched_assets,
    # Stock In Documents
    upload_stock_in_document,
    get_stock_in_document,
    delete_stock_in_document,
    # PDF Downloads
    download_asset_delivery_note,
    download_asset_return_note,
    # Site Engineer
    get_se_dispatched_assets,
    se_receive_adn,
    se_receive_selected_items,
    # Asset Repairs
    get_asset_repair_items,
    complete_asset_repair,
    dispose_unrepairable_asset,
)
from controllers.auth_controller import jwt_required

# Create blueprint
asset_dn_routes = Blueprint('asset_dn', __name__)


# ==================== STOCK IN ROUTES ====================

@asset_dn_routes.route('/api/assets/stock-in', methods=['POST'])
@jwt_required
def create_stock_in_route():
    """Create a stock in record for new assets"""
    return create_stock_in()


@asset_dn_routes.route('/api/assets/stock-in', methods=['GET'])
def get_stock_in_list_route():
    """Get list of stock in records"""
    return get_stock_in_list()


# ==================== ASSET DELIVERY NOTE (ADN) ROUTES ====================

@asset_dn_routes.route('/api/assets/delivery-notes', methods=['POST'])
@jwt_required
def create_delivery_note_route():
    """Create a new Asset Delivery Note (ADN) - Dispatch assets to site"""
    return create_delivery_note()


@asset_dn_routes.route('/api/assets/delivery-notes', methods=['GET'])
def get_delivery_notes_route():
    """Get list of Asset Delivery Notes"""
    return get_delivery_notes()


@asset_dn_routes.route('/api/assets/delivery-notes/<int:adn_id>', methods=['GET'])
def get_delivery_note_route(adn_id):
    """Get single Asset Delivery Note with details"""
    return get_delivery_note(adn_id)


@asset_dn_routes.route('/api/assets/delivery-notes/<int:adn_id>/dispatch', methods=['PUT'])
@jwt_required
def dispatch_delivery_note_route(adn_id):
    """Dispatch the delivery note - deduct from inventory and mark as dispatched"""
    return dispatch_delivery_note(adn_id)


@asset_dn_routes.route('/api/assets/delivery-notes/<int:adn_id>/receive', methods=['PUT'])
@jwt_required
def receive_delivery_note_route(adn_id):
    """Mark delivery note as received at site"""
    return receive_delivery_note(adn_id)


# ==================== ASSET RETURN DELIVERY NOTE (ARDN) ROUTES ====================

@asset_dn_routes.route('/api/assets/return-notes', methods=['POST'])
@jwt_required
def create_return_note_route():
    """Create a new Asset Return Delivery Note (ARDN)"""
    return create_return_note()


@asset_dn_routes.route('/api/assets/return-notes', methods=['GET'])
def get_return_notes_route():
    """Get list of Asset Return Delivery Notes"""
    return get_return_notes()


@asset_dn_routes.route('/api/assets/return-notes/<int:ardn_id>', methods=['GET'])
def get_return_note_route(ardn_id):
    """Get single Asset Return Delivery Note with details"""
    return get_return_note(ardn_id)


@asset_dn_routes.route('/api/assets/return-notes/<int:ardn_id>/issue', methods=['PUT'])
@jwt_required
def issue_return_note_route(ardn_id):
    """Issue return note - formally prepare it for dispatch"""
    return issue_return_note(ardn_id)


@asset_dn_routes.route('/api/assets/return-notes/<int:ardn_id>/update', methods=['PUT'])
@jwt_required
def update_return_note_route(ardn_id):
    """Update return note details (driver info, notes, etc.) - only for DRAFT/ISSUED status"""
    return update_return_note(ardn_id)


@asset_dn_routes.route('/api/assets/return-notes/<int:ardn_id>/dispatch', methods=['PUT'])
@jwt_required
def dispatch_return_note_route(ardn_id):
    """Mark return note as dispatched from site - can also update driver details"""
    return dispatch_return_note(ardn_id)


@asset_dn_routes.route('/api/assets/return-notes/<int:ardn_id>/receive', methods=['PUT'])
@jwt_required
def receive_return_note_route(ardn_id):
    """Mark return note as received at store"""
    return receive_return_note(ardn_id)


@asset_dn_routes.route('/api/assets/return-notes/<int:ardn_id>/process', methods=['PUT'])
@jwt_required
def process_return_note_route(ardn_id):
    """Process return note - verify each item and decide fate"""
    return process_return_note(ardn_id)


# ==================== DASHBOARD & UTILITY ROUTES ====================

@asset_dn_routes.route('/api/assets/dn-dashboard', methods=['GET'])
def get_dn_dashboard_route():
    """Get dashboard stats for asset DN/RDN flow"""
    return get_dn_dashboard()


@asset_dn_routes.route('/api/assets/available-for-dispatch', methods=['GET'])
def get_available_for_dispatch_route():
    """Get assets available for dispatch"""
    return get_available_for_dispatch()


@asset_dn_routes.route('/api/assets/project/<int:project_id>/dispatched', methods=['GET'])
def get_project_dispatched_assets_route(project_id):
    """Get assets dispatched to a specific project (for creating return notes)"""
    return get_project_dispatched_assets(project_id)


# ==================== STOCK IN DOCUMENT UPLOAD ROUTES ====================

@asset_dn_routes.route('/api/assets/stock-in/<int:stock_in_id>/upload', methods=['POST'])
def upload_stock_in_document_route(stock_in_id):
    """Upload a document (DN/invoice/receipt) for a stock in record to inventory-files bucket"""
    return upload_stock_in_document(stock_in_id)


@asset_dn_routes.route('/api/assets/stock-in/<int:stock_in_id>/document', methods=['GET'])
def get_stock_in_document_route(stock_in_id):
    """Get document URL for a stock in record"""
    return get_stock_in_document(stock_in_id)


@asset_dn_routes.route('/api/assets/stock-in/<int:stock_in_id>/document', methods=['DELETE'])
def delete_stock_in_document_route(stock_in_id):
    """Delete document for a stock in record"""
    return delete_stock_in_document(stock_in_id)


# ==================== PDF DOWNLOAD ROUTES ====================

@asset_dn_routes.route('/api/assets/delivery-notes/<int:adn_id>/download', methods=['GET'])
def download_asset_delivery_note_route(adn_id):
    """Generate and download Asset Delivery Note PDF"""
    return download_asset_delivery_note(adn_id)


@asset_dn_routes.route('/api/assets/return-notes/<int:ardn_id>/download', methods=['GET'])
def download_asset_return_note_route(ardn_id):
    """Generate and download Asset Return Delivery Note (ARDN) PDF"""
    return download_asset_return_note(ardn_id)


# ==================== SITE ENGINEER ROUTES ====================

@asset_dn_routes.route('/api/assets/se/dispatched-assets', methods=['GET'])
@jwt_required
def get_se_dispatched_assets_route():
    """Get all dispatched assets for the Site Engineer's projects from ADN flow"""
    return get_se_dispatched_assets()


@asset_dn_routes.route('/api/assets/se/receive-adn/<int:adn_id>', methods=['PUT'])
@jwt_required
def se_receive_adn_route(adn_id):
    """SE marks an entire ADN as received (all items)"""
    return se_receive_adn(adn_id)


@asset_dn_routes.route('/api/assets/se/receive-items', methods=['PUT'])
@jwt_required
def se_receive_selected_items_route():
    """SE marks selected ADN items as received (selective receive)"""
    return se_receive_selected_items()


# ==================== ASSET REPAIR MANAGEMENT ROUTES ====================

@asset_dn_routes.route('/api/assets/repairs', methods=['GET'])
@jwt_required
def get_asset_repair_items_route():
    """Get all asset items sent for repair from ARDNs"""
    return get_asset_repair_items()


@asset_dn_routes.route('/api/assets/repairs/<int:return_item_id>/complete', methods=['PUT'])
@jwt_required
def complete_asset_repair_route(return_item_id):
    """Mark asset repair as complete and return to stock"""
    return complete_asset_repair(return_item_id)


@asset_dn_routes.route('/api/assets/repairs/<int:return_item_id>/dispose', methods=['PUT'])
@jwt_required
def dispose_unrepairable_asset_route(return_item_id):
    """Mark unrepairable asset for disposal - creates disposal request for TD approval"""
    return dispose_unrepairable_asset(return_item_id)


# ==================== SE MOVEMENT HISTORY ROUTE ====================

@asset_dn_routes.route('/api/assets/se/movement-history', methods=['GET'])
@jwt_required
def get_se_movement_history_route():
    """Get ADN/ARDN movement history for SE's assigned projects"""
    return get_se_movement_history()
