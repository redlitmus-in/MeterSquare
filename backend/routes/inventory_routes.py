from flask import Blueprint
from controllers.inventory_controller import *
from controllers.auth_controller import jwt_required

# Create blueprint with URL prefix
inventory_routes = Blueprint('inventory_routes', __name__, url_prefix='/api')

# ==================== INVENTORY ITEM ROUTES ====================

@inventory_routes.route('/add_item_inventory', methods=['POST'])
@jwt_required
def create_item_route():
    """Create a new inventory item"""
    return create_inventory_item()


@inventory_routes.route('/all_item_inventory', methods=['GET'])
@jwt_required
def get_items_route():
    """Get all inventory items"""
    return get_all_inventory_items()


@inventory_routes.route('/inventory/<int:inventory_material_id>', methods=['GET'])
@jwt_required
def get_item_route(inventory_material_id):
    """Get specific inventory item by ID"""
    return get_inventory_item_by_id(inventory_material_id)


@inventory_routes.route('/inventory/<int:inventory_material_id>', methods=['PUT'])
@jwt_required
def update_item_route(inventory_material_id):
    """Update inventory item"""
    return update_inventory_item(inventory_material_id)


@inventory_routes.route('/inventory/<int:inventory_material_id>', methods=['DELETE'])
@jwt_required
def delete_item_route(inventory_material_id):
    """Delete inventory item"""
    return delete_inventory_item(inventory_material_id)


@inventory_routes.route('/inventory/<int:inventory_material_id>/history', methods=['GET'])
@jwt_required
def get_item_history_route(inventory_material_id):
    """Get transaction history for an item"""
    return get_item_transaction_history(inventory_material_id)


# ==================== INVENTORY TRANSACTION ROUTES ====================

@inventory_routes.route('/transactions', methods=['POST'])
@jwt_required
def create_transaction_route():
    """Create a new inventory transaction (purchase or withdrawal)"""
    return create_inventory_transaction()


@inventory_routes.route('/transactions', methods=['GET'])
@jwt_required
def get_transactions_route():
    """Get all inventory transactions"""
    return get_all_inventory_transactions()


@inventory_routes.route('/transactions/<int:transaction_id>', methods=['GET'])
@jwt_required
def get_transaction_route(transaction_id):
    """Get specific inventory transaction by ID"""
    return get_inventory_transaction_by_id(transaction_id)


# ==================== INVENTORY SUMMARY ROUTE ====================

@inventory_routes.route('/summary', methods=['GET'])
@jwt_required
def get_summary_route():
    """Get overall inventory summary"""
    return get_inventory_summary()


# ==================== INTERNAL MATERIAL REQUEST ROUTES ====================
#create a new request in procurement
@inventory_routes.route('/internal_material_request', methods=['POST'])
@jwt_required
def internal_inventory_material_request_route():
    """Create a new internal material purchase request"""
    return internal_inventory_material_request()

#To view a  request list in current user based on
@inventory_routes.route('/internal_material_requests', methods=['GET'])
@jwt_required
def get_internal_requests_route():
    """Get all internal material purchase requests"""
    return get_all_internal_material_requests()


#To view only sent requests (PENDING status)
@inventory_routes.route('/sent_internal_requests', methods=['GET'])
@jwt_required
def get_sent_internal_requests_route():
    """Get all sent (PENDING) internal material requests"""
    return get_sent_internal_requests()


#View a particular request
@inventory_routes.route('/internal_material/<int:request_id>', methods=['GET'])
@jwt_required
def get_internal_request_route(request_id):
    """Get specific internal material request with project details"""
    return get_internal_material_request_by_id(request_id)

#To edit the request
@inventory_routes.route('/internal_material/<int:request_id>', methods=['PUT'])
@jwt_required
def update_internal_request_route(request_id):
    """Update an internal material request"""
    return update_internal_material_request(request_id)

#Delete the request
@inventory_routes.route('/internal_material/<int:request_id>', methods=['DELETE'])
@jwt_required
def delete_internal_request_route(request_id):
    """Delete an internal material request"""
    return delete_internal_material_request(request_id)

#To send a request (procurement to production manager)
@inventory_routes.route('/internal_material/<int:request_id>/send', methods=['GET'])
@jwt_required
def send_internal_request_route(request_id):
    """Send an internal material request for approval"""
    return send_internal_material_request(request_id)

#request approved
@inventory_routes.route('/internal_material/<int:request_id>/approve', methods=['POST'])
@jwt_required
def approve_internal_request_route(request_id):
    """Approve an internal material request"""
    return approve_internal_request(request_id)

#request decline
@inventory_routes.route('/internal_material/<int:request_id>/reject', methods=['POST'])
@jwt_required
def reject_internal_request_route(request_id):
    """Reject an internal material request"""
    return reject_internal_request(request_id)

#request withdraw
@inventory_routes.route('/internal_material/<int:request_id>/dispatch', methods=['POST'])
@jwt_required
def dispatch_material_route(request_id):
    """Dispatch material to project"""
    return dispatch_material(request_id)

#check availability
@inventory_routes.route('/internal_material/<int:request_id>/check_availability', methods=['GET'])
@jwt_required
def check_availability_route(request_id):
    """Check inventory availability for an internal request"""
    return check_inventory_availability(request_id)

#material return
@inventory_routes.route('/internal_material/<int:request_id>/issue_material', methods=['POST'])
@jwt_required
def issue_material_route(request_id):
    """Issue material from inventory to fulfill internal request"""
    return issue_material_from_inventory(request_id)

