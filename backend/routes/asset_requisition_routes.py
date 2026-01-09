"""
Asset Requisition Routes Blueprint
Routes for SE asset requests with PM and Production Manager approval workflow
"""

from flask import Blueprint
from controllers.asset_requisition_controller import (
    create_asset_requisition,
    get_my_requisitions,
    confirm_requisition_receipt,
    send_to_pm,
    update_requisition,
    get_pm_pending_requisitions,
    pm_approve_requisition,
    pm_reject_requisition,
    get_prod_mgr_pending_requisitions,
    prod_mgr_approve_requisition,
    prod_mgr_reject_requisition,
    get_ready_for_dispatch,
    dispatch_requisition,
    get_requisition_by_id,
    get_all_requisitions,
    cancel_requisition
)
from controllers.auth_controller import jwt_required


# Create blueprint with URL prefix
asset_requisition_routes = Blueprint('asset_requisition_routes', __name__, url_prefix='/api/assets/requisitions')


# ==================== SE ENDPOINTS ====================

@asset_requisition_routes.route('', methods=['POST'])
@jwt_required
def create_requisition_route():
    """SE creates a new asset requisition"""
    return create_asset_requisition()


@asset_requisition_routes.route('/my-requests', methods=['GET'])
@jwt_required
def get_my_requests_route():
    """SE gets their own requisitions"""
    return get_my_requisitions()


@asset_requisition_routes.route('/<int:requisition_id>/confirm-receipt', methods=['PUT'])
@jwt_required
def confirm_receipt_route(requisition_id):
    """SE confirms receipt of dispatched asset"""
    return confirm_requisition_receipt(requisition_id)


@asset_requisition_routes.route('/<int:requisition_id>/send-to-pm', methods=['PUT'])
@jwt_required
def send_to_pm_route(requisition_id):
    """SE sends draft or rejected requisition to PM for approval"""
    return send_to_pm(requisition_id)


@asset_requisition_routes.route('/<int:requisition_id>', methods=['PUT'])
@jwt_required
def update_requisition_route(requisition_id):
    """SE updates a draft or rejected requisition"""
    return update_requisition(requisition_id)


# ==================== PM ENDPOINTS ====================

@asset_requisition_routes.route('/pm/pending', methods=['GET'])
@jwt_required
def get_pm_pending_route():
    """PM gets requisitions pending their approval"""
    return get_pm_pending_requisitions()


@asset_requisition_routes.route('/<int:requisition_id>/pm/approve', methods=['PUT'])
@jwt_required
def pm_approve_route(requisition_id):
    """PM approves a requisition"""
    return pm_approve_requisition(requisition_id)


@asset_requisition_routes.route('/<int:requisition_id>/pm/reject', methods=['PUT'])
@jwt_required
def pm_reject_route(requisition_id):
    """PM rejects a requisition"""
    return pm_reject_requisition(requisition_id)


# ==================== PRODUCTION MANAGER ENDPOINTS ====================

@asset_requisition_routes.route('/prod-mgr/pending', methods=['GET'])
@jwt_required
def get_prod_mgr_pending_route():
    """Production Manager gets requisitions pending their approval"""
    return get_prod_mgr_pending_requisitions()


@asset_requisition_routes.route('/<int:requisition_id>/prod-mgr/approve', methods=['PUT'])
@jwt_required
def prod_mgr_approve_route(requisition_id):
    """Production Manager approves a requisition"""
    return prod_mgr_approve_requisition(requisition_id)


@asset_requisition_routes.route('/<int:requisition_id>/prod-mgr/reject', methods=['PUT'])
@jwt_required
def prod_mgr_reject_route(requisition_id):
    """Production Manager rejects a requisition"""
    return prod_mgr_reject_requisition(requisition_id)


@asset_requisition_routes.route('/ready-dispatch', methods=['GET'])
@jwt_required
def get_ready_dispatch_route():
    """Production Manager gets requisitions ready for dispatch"""
    return get_ready_for_dispatch()


@asset_requisition_routes.route('/<int:requisition_id>/dispatch', methods=['PUT'])
@jwt_required
def dispatch_route(requisition_id):
    """Production Manager dispatches an approved requisition"""
    return dispatch_requisition(requisition_id)


# ==================== GENERAL ENDPOINTS ====================

@asset_requisition_routes.route('', methods=['GET'])
@jwt_required
def get_all_route():
    """Get all requisitions with filters"""
    return get_all_requisitions()


@asset_requisition_routes.route('/<int:requisition_id>', methods=['GET'])
@jwt_required
def get_by_id_route(requisition_id):
    """Get single requisition by ID"""
    return get_requisition_by_id(requisition_id)


@asset_requisition_routes.route('/<int:requisition_id>/cancel', methods=['PUT'])
@jwt_required
def cancel_route(requisition_id):
    """Cancel a requisition (before dispatch)"""
    return cancel_requisition(requisition_id)
