from flask import Blueprint
from controllers.vendor_inspection_controller import (
    # PM Inspection
    get_pending_inspections,
    get_inspection_details,
    submit_inspection,
    get_pending_stockin_inspections,
    complete_inspection_stockin,
    get_inspection_history,
    get_inspection_by_id,
    upload_inspection_evidence,
    get_held_materials,
    # Buyer Return Request
    upload_return_evidence,
    get_rejected_deliveries,
    create_return_request,
    get_return_requests,
    get_return_request_by_id,
    update_return_request,
    initiate_vendor_return,
    confirm_refund_received,
    confirm_replacement_received,
    select_new_vendor,
    # TD Approval
    get_pending_return_approvals,
    get_all_td_return_requests,
    td_approve_return_request,
    td_reject_return_request,
    td_approve_new_vendor_for_return,
    # Shared / Timeline
    get_inspection_timeline,
)
from controllers.auth_controller import jwt_required

vendor_inspection_routes = Blueprint('vendor_inspection_routes', __name__, url_prefix='/api')


# ==================== PM INSPECTION ROUTES ====================

@vendor_inspection_routes.route('/inventory/pending-inspections', methods=['GET'])
@jwt_required
def get_pending_inspections_route():
    """List vendor deliveries awaiting PM inspection"""
    return get_pending_inspections()


@vendor_inspection_routes.route('/inventory/inspection/<int:imr_id>', methods=['GET'])
@jwt_required
def get_inspection_details_route(imr_id):
    """Get full details of a delivery for inspection"""
    return get_inspection_details(imr_id)


@vendor_inspection_routes.route('/inventory/inspection/<int:imr_id>/submit', methods=['POST'])
@jwt_required
def submit_inspection_route(imr_id):
    """PM submits inspection decision"""
    return submit_inspection(imr_id)


@vendor_inspection_routes.route('/inventory/inspections/pending-stockin', methods=['GET'])
@jwt_required
def get_pending_stockin_inspections_route():
    """List inspections awaiting manual stock-in by PM"""
    return get_pending_stockin_inspections()


@vendor_inspection_routes.route('/inventory/inspection/<int:inspection_id>/complete-stockin', methods=['POST'])
@jwt_required
def complete_inspection_stockin_route(inspection_id):
    """Mark inspection stock-in as completed"""
    return complete_inspection_stockin(inspection_id)


@vendor_inspection_routes.route('/inventory/inspections/history', methods=['GET'])
@jwt_required
def get_inspection_history_route():
    """Get completed inspections history"""
    return get_inspection_history()


@vendor_inspection_routes.route('/inventory/inspections/<int:inspection_id>', methods=['GET'])
@jwt_required
def get_inspection_by_id_route(inspection_id):
    """Get a specific inspection record"""
    return get_inspection_by_id(inspection_id)


@vendor_inspection_routes.route('/inventory/inspection/upload-evidence', methods=['POST'])
@jwt_required
def upload_inspection_evidence_route():
    """Upload photos/videos for inspection evidence"""
    return upload_inspection_evidence()


@vendor_inspection_routes.route('/inventory/held-materials', methods=['GET'])
@jwt_required
def get_held_materials_route():
    """Get materials in Held/Pending Return state"""
    return get_held_materials()


# ==================== BUYER RETURN REQUEST ROUTES ====================

@vendor_inspection_routes.route('/buyer/return-request/upload-evidence', methods=['POST'])
@jwt_required
def upload_return_evidence_route():
    """Upload proof documents for return requests"""
    return upload_return_evidence()


@vendor_inspection_routes.route('/buyer/rejected-deliveries', methods=['GET'])
@jwt_required
def get_rejected_deliveries_route():
    """Get deliveries rejected/partially rejected for buyer"""
    return get_rejected_deliveries()


@vendor_inspection_routes.route('/buyer/return-request', methods=['POST'])
@jwt_required
def create_return_request_route():
    """Create a new return request"""
    return create_return_request()


@vendor_inspection_routes.route('/buyer/return-requests', methods=['GET'])
@jwt_required
def get_return_requests_route():
    """Get all return requests for buyer"""
    return get_return_requests()


@vendor_inspection_routes.route('/buyer/return-request/<int:request_id>', methods=['GET'])
@jwt_required
def get_return_request_by_id_route(request_id):
    """Get details of a specific return request"""
    return get_return_request_by_id(request_id)


@vendor_inspection_routes.route('/buyer/return-request/<int:request_id>', methods=['PUT'])
@jwt_required
def update_return_request_route(request_id):
    """Update return request before TD approval"""
    return update_return_request(request_id)


@vendor_inspection_routes.route('/buyer/return-request/<int:request_id>/initiate-return', methods=['POST'])
@jwt_required
def initiate_vendor_return_route(request_id):
    """Mark materials as returned to vendor"""
    return initiate_vendor_return(request_id)


@vendor_inspection_routes.route('/buyer/return-request/<int:request_id>/confirm-refund', methods=['POST'])
@jwt_required
def confirm_refund_received_route(request_id):
    """Confirm credit note/refund received"""
    return confirm_refund_received(request_id)


@vendor_inspection_routes.route('/buyer/return-request/<int:request_id>/confirm-replacement', methods=['POST'])
@jwt_required
def confirm_replacement_received_route(request_id):
    """Confirm replacement materials received from vendor"""
    return confirm_replacement_received(request_id)


@vendor_inspection_routes.route('/buyer/return-request/<int:request_id>/select-new-vendor', methods=['POST'])
@jwt_required
def select_new_vendor_route(request_id):
    """Select new vendor for rejected materials"""
    return select_new_vendor(request_id)


# ==================== TD APPROVAL ROUTES ====================

@vendor_inspection_routes.route('/technical-director/pending-return-approvals', methods=['GET'])
@jwt_required
def get_pending_return_approvals_route():
    """Get return requests pending TD approval"""
    return get_pending_return_approvals()


@vendor_inspection_routes.route('/technical-director/all-return-requests', methods=['GET'])
@jwt_required
def get_all_td_return_requests_route():
    """Get all return requests for TD (all statuses, for history view)"""
    return get_all_td_return_requests()


@vendor_inspection_routes.route('/technical-director/return-request/<int:request_id>/approve', methods=['POST'])
@jwt_required
def td_approve_return_request_route(request_id):
    """TD approves return request"""
    return td_approve_return_request(request_id)


@vendor_inspection_routes.route('/technical-director/return-request/<int:request_id>/reject', methods=['POST'])
@jwt_required
def td_reject_return_request_route(request_id):
    """TD rejects return request"""
    return td_reject_return_request(request_id)


@vendor_inspection_routes.route('/technical-director/return-request/<int:request_id>/approve-new-vendor', methods=['POST'])
@jwt_required
def td_approve_new_vendor_route(request_id):
    """TD approves new vendor for return resolution"""
    return td_approve_new_vendor_for_return(request_id)


# ==================== SHARED / TIMELINE ROUTES ====================

@vendor_inspection_routes.route('/inventory/inspection-timeline/<int:cr_id>', methods=['GET'])
@jwt_required
def get_inspection_timeline_route(cr_id):
    """Get full inspection/return timeline for a CR"""
    return get_inspection_timeline(cr_id)
