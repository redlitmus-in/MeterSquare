from flask import Blueprint
from controllers.inventory_controller import *
from controllers.auth_controller import jwt_required

# Create blueprint with URL prefix
inventory_routes = Blueprint('inventory_routes', __name__, url_prefix='/api')


# ==================== INVENTORY CONFIG ROUTES ====================

@inventory_routes.route('/inventory/config', methods=['GET'])
@jwt_required
def get_inventory_config_route():
    """Get inventory configuration (store name, currency, etc.)"""
    return get_inventory_config()


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


@inventory_routes.route('/inventory/dashboard', methods=['GET'])
@jwt_required
def get_dashboard_route():
    """Get comprehensive inventory dashboard data"""
    return get_inventory_dashboard()


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


# ==================== MATERIAL RETURN ROUTES ====================

@inventory_routes.route('/material_return', methods=['POST'])
@jwt_required
def create_material_return_route():
    """Create a new material return with condition tracking"""
    return create_material_return()


@inventory_routes.route('/material_returns', methods=['GET'])
@jwt_required
def get_all_material_returns_route():
    """Get all material returns with optional filters"""
    return get_all_material_returns()


@inventory_routes.route('/material_return/<int:return_id>', methods=['GET'])
@jwt_required
def get_material_return_route(return_id):
    """Get specific material return by ID"""
    return get_material_return_by_id(return_id)


@inventory_routes.route('/project/<int:project_id>/dispatched_materials', methods=['GET'])
@jwt_required
def get_project_dispatched_materials_route(project_id):
    """Get materials dispatched to a project that can be returned"""
    return get_dispatched_materials_for_project(project_id)


@inventory_routes.route('/material_returns/pending_disposal', methods=['GET'])
@jwt_required
def get_pending_disposal_route():
    """Get all material returns pending disposal review"""
    return get_pending_disposal_returns()


@inventory_routes.route('/material_return/<int:return_id>/review_disposal', methods=['POST'])
@jwt_required
def review_disposal_route(return_id):
    """Review and approve/reject disposal of damaged/defective materials"""
    return review_disposal(return_id)


@inventory_routes.route('/material_return/<int:return_id>/mark_disposed', methods=['POST'])
@jwt_required
def mark_disposed_route(return_id):
    """Mark a material return as physically disposed"""
    return mark_as_disposed(return_id)


@inventory_routes.route('/material_return/<int:return_id>/add_to_stock', methods=['POST'])
@jwt_required
def add_repaired_to_stock_route(return_id):
    """Mark repair as complete and move from backup stock to main stock"""
    return add_repaired_to_stock(return_id)


@inventory_routes.route('/material_return/<int:return_id>/request_disposal', methods=['POST'])
@jwt_required
def request_disposal_from_repair_route(return_id):
    """Request disposal when repair is not possible - sends to TD for approval"""
    return request_disposal_from_repair(return_id)


@inventory_routes.route('/material_return/<int:return_id>/approve', methods=['POST'])
@jwt_required
def approve_return_to_stock_route(return_id):
    """PM approves a Good condition return and adds it to stock"""
    return approve_return_to_stock(return_id)


@inventory_routes.route('/material_return/<int:return_id>/reject', methods=['POST'])
@jwt_required
def reject_return_route(return_id):
    """PM rejects a return"""
    return reject_return(return_id)


# ==================== MATERIAL DELIVERY NOTE ROUTES ====================

@inventory_routes.route('/delivery_notes', methods=['POST'])
@jwt_required
def create_delivery_note_route():
    """Create a new material delivery note"""
    return create_delivery_note()


@inventory_routes.route('/delivery_notes', methods=['GET'])
@jwt_required
def get_all_delivery_notes_route():
    """Get all delivery notes with optional filters"""
    return get_all_delivery_notes()


@inventory_routes.route('/delivery_note/<int:delivery_note_id>', methods=['GET'])
@jwt_required
def get_delivery_note_route(delivery_note_id):
    """Get specific delivery note by ID"""
    return get_delivery_note_by_id(delivery_note_id)


@inventory_routes.route('/delivery_note/<int:delivery_note_id>', methods=['PUT'])
@jwt_required
def update_delivery_note_route(delivery_note_id):
    """Update a delivery note"""
    return update_delivery_note(delivery_note_id)


@inventory_routes.route('/delivery_note/<int:delivery_note_id>', methods=['DELETE'])
@jwt_required
def delete_delivery_note_route(delivery_note_id):
    """Delete a delivery note"""
    return delete_delivery_note(delivery_note_id)


@inventory_routes.route('/delivery_note/<int:delivery_note_id>/items', methods=['POST'])
@jwt_required
def add_delivery_note_item_route(delivery_note_id):
    """Add an item to a delivery note"""
    return add_item_to_delivery_note(delivery_note_id)


@inventory_routes.route('/delivery_note/<int:delivery_note_id>/items/bulk', methods=['POST'])
@jwt_required
def add_delivery_note_items_bulk_route(delivery_note_id):
    """Add multiple items to a delivery note in a single request"""
    return add_items_to_delivery_note_bulk(delivery_note_id)


@inventory_routes.route('/delivery_note/<int:delivery_note_id>/items/<int:item_id>', methods=['PUT'])
@jwt_required
def update_delivery_note_item_route(delivery_note_id, item_id):
    """Update an item in a delivery note"""
    return update_delivery_note_item(delivery_note_id, item_id)


@inventory_routes.route('/delivery_note/<int:delivery_note_id>/items/<int:item_id>', methods=['DELETE'])
@jwt_required
def remove_delivery_note_item_route(delivery_note_id, item_id):
    """Remove an item from a delivery note"""
    return remove_delivery_note_item(delivery_note_id, item_id)


@inventory_routes.route('/delivery_note/<int:delivery_note_id>/issue', methods=['POST'])
@jwt_required
def issue_delivery_note_route(delivery_note_id):
    """Issue a delivery note - deducts stock"""
    return issue_delivery_note(delivery_note_id)


@inventory_routes.route('/delivery_note/<int:delivery_note_id>/dispatch', methods=['POST'])
@jwt_required
def dispatch_delivery_note_route(delivery_note_id):
    """Mark delivery note as dispatched (in transit)"""
    return dispatch_delivery_note(delivery_note_id)


@inventory_routes.route('/delivery_note/<int:delivery_note_id>/confirm', methods=['POST'])
@jwt_required
def confirm_delivery_route(delivery_note_id):
    """Confirm delivery receipt at site"""
    return confirm_delivery(delivery_note_id)


@inventory_routes.route('/delivery_note/<int:delivery_note_id>/cancel', methods=['POST'])
@jwt_required
def cancel_delivery_note_route(delivery_note_id):
    """Cancel a delivery note"""
    return cancel_delivery_note(delivery_note_id)


@inventory_routes.route('/my-delivery-notes', methods=['GET'])
@jwt_required
def get_my_delivery_notes_route():
    """Get delivery notes for SE's assigned projects"""
    return get_delivery_notes_for_se()


@inventory_routes.route('/my-returnable-materials', methods=['GET'])
@jwt_required
def get_my_returnable_materials_route():
    """Get returnable materials for SE's assigned projects"""
    return get_returnable_materials_for_se()


@inventory_routes.route('/my-material-returns', methods=['GET'])
@jwt_required
def get_my_material_returns_route():
    """Get material returns for SE's assigned projects"""
    return get_material_returns_for_se()


# ==================== RETURN DELIVERY NOTE (RDN) ROUTES ====================

@inventory_routes.route('/return_delivery_notes', methods=['POST'])
@jwt_required
def create_return_delivery_note_route():
    """STEP 1: Create a new return delivery note (RDN)"""
    return create_return_delivery_note()


@inventory_routes.route('/return_delivery_notes', methods=['GET'])
@jwt_required
def get_all_return_delivery_notes_route():
    """Get all return delivery notes with filters"""
    return get_all_return_delivery_notes()


@inventory_routes.route('/return_delivery_note/<int:return_note_id>', methods=['GET'])
@jwt_required
def get_return_delivery_note_route(return_note_id):
    """Get specific return delivery note by ID"""
    return get_return_delivery_note_by_id(return_note_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>', methods=['PUT'])
@jwt_required
def update_return_delivery_note_route(return_note_id):
    """Update return delivery note (only DRAFT)"""
    return update_return_delivery_note(return_note_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>', methods=['DELETE'])
@jwt_required
def delete_return_delivery_note_route(return_note_id):
    """Delete return delivery note (only DRAFT)"""
    return delete_return_delivery_note(return_note_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>/items', methods=['POST'])
@jwt_required
def add_return_delivery_note_item_route(return_note_id):
    """STEP 2: Add an item to return delivery note"""
    return add_item_to_return_delivery_note(return_note_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>/items/<int:item_id>', methods=['PUT'])
@jwt_required
def update_return_delivery_note_item_route(return_note_id, item_id):
    """Update an item in return delivery note"""
    return update_return_delivery_note_item(return_note_id, item_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>/items/<int:item_id>', methods=['DELETE'])
@jwt_required
def remove_return_delivery_note_item_route(return_note_id, item_id):
    """Remove an item from return delivery note"""
    return remove_return_delivery_note_item(return_note_id, item_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>/issue', methods=['POST'])
@jwt_required
def issue_return_delivery_note_route(return_note_id):
    """STEP 3: Issue RDN - SE finalizes and validates"""
    return issue_return_delivery_note(return_note_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>/dispatch', methods=['POST'])
@jwt_required
def dispatch_return_delivery_note_route(return_note_id):
    """STEP 4: Dispatch RDN - Materials in transit"""
    return dispatch_return_delivery_note(return_note_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>/confirm', methods=['POST'])
@jwt_required
def confirm_return_delivery_receipt_route(return_note_id):
    """STEP 5: PM confirms receipt at store"""
    return confirm_return_delivery_receipt(return_note_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>/items/<int:item_id>/process', methods=['POST'])
@jwt_required
def process_return_delivery_item_route(return_note_id, item_id):
    """STEP 6: PM processes individual RDN item"""
    return process_return_delivery_item(return_note_id, item_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>/process_all_items', methods=['POST'])
@jwt_required
def process_all_return_delivery_items_route(return_note_id):
    """STEP 6 (Batch): PM processes all RDN items in a single request"""
    return process_all_return_delivery_items(return_note_id)


@inventory_routes.route('/my-return-delivery-notes', methods=['GET'])
@jwt_required
def get_my_return_delivery_notes_route():
    """Get return delivery notes for SE's assigned projects"""
    return get_return_delivery_notes_for_se()


@inventory_routes.route('/pm-return-delivery-notes', methods=['GET'])
@jwt_required
def get_pm_return_delivery_notes_route():
    """Get all return delivery notes for PM"""
    return get_return_delivery_notes_for_pm()


@inventory_routes.route('/delivery_note/<int:delivery_note_id>/download', methods=['GET'])
@jwt_required
def download_dn_pdf_route(delivery_note_id):
    """Download Material Delivery Note as PDF"""
    return download_dn_pdf(delivery_note_id)


@inventory_routes.route('/return_delivery_note/<int:return_note_id>/download', methods=['GET'])
@jwt_required
def download_rdn_pdf_route(return_note_id):
    """Download RDN as PDF"""
    return download_rdn_pdf(return_note_id)


# ==================== DISPOSAL REQUEST ROUTES ====================

@inventory_routes.route('/inventory/materials/<int:material_id>/request-disposal', methods=['POST'])
@jwt_required
def request_material_disposal_route(material_id):
    """Request disposal for damaged/wasted material from catalog"""
    return request_material_disposal(material_id)
