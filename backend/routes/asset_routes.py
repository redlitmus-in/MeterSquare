from flask import Blueprint
from controllers.asset_controller import *
from controllers.auth_controller import jwt_required

# Create blueprint with URL prefix
asset_routes = Blueprint('asset_routes', __name__, url_prefix='/api/assets')


# ==================== CATEGORY ROUTES ====================

@asset_routes.route('/categories', methods=['POST'])
@jwt_required
def create_category_route():
    """Create a new asset category"""
    return create_asset_category()


@asset_routes.route('/categories', methods=['GET'])
@jwt_required
def get_categories_route():
    """Get all asset categories"""
    return get_all_asset_categories()


@asset_routes.route('/categories/<int:category_id>', methods=['GET'])
@jwt_required
def get_category_route(category_id):
    """Get specific asset category by ID"""
    return get_asset_category_by_id(category_id)


@asset_routes.route('/categories/<int:category_id>', methods=['PUT'])
@jwt_required
def update_category_route(category_id):
    """Update asset category"""
    return update_asset_category(category_id)


@asset_routes.route('/categories/<int:category_id>', methods=['DELETE'])
@jwt_required
def delete_category_route(category_id):
    """Delete/deactivate asset category"""
    return delete_asset_category(category_id)


# ==================== ITEM ROUTES (Individual Tracking) ====================

@asset_routes.route('/items', methods=['POST'])
@jwt_required
def create_item_route():
    """Create a new individual asset item"""
    return create_asset_item()


@asset_routes.route('/items', methods=['GET'])
@jwt_required
def get_items_route():
    """Get all individual asset items"""
    return get_all_asset_items()


@asset_routes.route('/items/<int:item_id>', methods=['GET'])
@jwt_required
def get_item_route(item_id):
    """Get specific asset item by ID"""
    return get_asset_item_by_id(item_id)


@asset_routes.route('/items/<int:item_id>', methods=['PUT'])
@jwt_required
def update_item_route(item_id):
    """Update asset item"""
    return update_asset_item(item_id)


# ==================== DISPATCH ROUTES ====================

@asset_routes.route('/dispatch', methods=['POST'])
@jwt_required
def dispatch_route():
    """Dispatch asset(s) to a project"""
    return dispatch_asset()


@asset_routes.route('/dispatched', methods=['GET'])
@jwt_required
def get_dispatched_route():
    """Get all currently dispatched assets"""
    return get_dispatched_assets()


@asset_routes.route('/project/<int:project_id>/assets', methods=['GET'])
@jwt_required
def get_project_assets_route(project_id):
    """Get all assets currently at a specific project"""
    return get_assets_at_project(project_id)


@asset_routes.route('/my-site-assets', methods=['GET'])
@jwt_required
def get_my_site_assets_route():
    """Get all assets at projects assigned to the current Site Engineer"""
    return get_my_site_assets()


@asset_routes.route('/my-dispatched-movements', methods=['GET'])
@jwt_required
def get_my_dispatched_movements_route():
    """Get all dispatch movements for SE's projects with received status"""
    return get_dispatched_movements_for_se()


@asset_routes.route('/mark-received', methods=['POST'])
@jwt_required
def mark_received_route():
    """SE marks dispatched asset as received"""
    return mark_asset_received()


# ==================== RETURN ROUTES ====================

@asset_routes.route('/return', methods=['POST'])
@jwt_required
def return_route():
    """Return asset(s) from a project"""
    return return_asset()


# ==================== MAINTENANCE ROUTES ====================

@asset_routes.route('/maintenance', methods=['GET'])
@jwt_required
def get_maintenance_route():
    """Get all assets pending maintenance"""
    return get_pending_maintenance()


@asset_routes.route('/maintenance/<int:maintenance_id>', methods=['PUT'])
@jwt_required
def update_maintenance_route(maintenance_id):
    """Update maintenance record (repair or write-off)"""
    return update_maintenance(maintenance_id)


# ==================== DASHBOARD/SUMMARY ROUTES ====================

@asset_routes.route('/dashboard', methods=['GET'])
@jwt_required
def get_dashboard_route():
    """Get asset dashboard summary"""
    return get_asset_dashboard()


@asset_routes.route('/movements', methods=['GET'])
@jwt_required
def get_movements_route():
    """Get all asset movements with filters"""
    return get_asset_movements()


# ==================== RETURN REQUEST ROUTES (SE -> PM Flow) ====================

@asset_routes.route('/return-requests', methods=['POST'])
@jwt_required
def create_return_request_route():
    """SE creates a return request for assets at their site"""
    return create_return_request()


@asset_routes.route('/return-requests', methods=['GET'])
@jwt_required
def get_return_requests_route():
    """PM gets all pending return requests"""
    return get_pending_return_requests()


@asset_routes.route('/return-requests/my', methods=['GET'])
@jwt_required
def get_my_return_requests_route():
    """SE gets their own return requests"""
    return get_my_return_requests()


@asset_routes.route('/return-requests/<int:request_id>/process', methods=['PUT'])
@jwt_required
def process_return_request_route(request_id):
    """PM processes a return request with quality check"""
    return process_return_request(request_id)


@asset_routes.route('/tracking/<tracking_code>', methods=['GET'])
@jwt_required
def get_tracking_history_route(tracking_code):
    """Get full history for an asset by tracking code"""
    return get_asset_tracking_history(tracking_code)
