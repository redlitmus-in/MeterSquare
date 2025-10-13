from flask import Blueprint
from utils.authentication import jwt_required
from controllers.change_request_controller import (
    create_change_request,
    get_all_change_requests,
    get_change_request_by_id,
    approve_change_request,
    reject_change_request,
    get_boq_change_requests,
    send_for_review
)

change_request_routes = Blueprint('change_request_routes', __name__, url_prefix='/api')


# Create change request (PM/SE adds extra materials)
@change_request_routes.route('/boq/change-request', methods=['POST'])
@jwt_required
def create_change_request_route():
    """
    PM/SE creates a change request to add extra materials to BOQ
    Request body:
    {
        "boq_id": 123,
        "justification": "Need additional materials for foundation extension",
        "materials": [
            {
                "material_name": "Cement",
                "quantity": 10,
                "unit": "bags",
                "unit_price": 400
            }
        ]
    }
    """
    return create_change_request()


# Get all change requests (role-filtered)
@change_request_routes.route('/change-requests', methods=['GET'])
@jwt_required
def get_all_change_requests_route():
    """
    Get all change requests filtered by user role:
    - PM/SE: See their own requests
    - Estimator: See requests requiring estimator approval (≤50k)
    - TD: See all requests, especially >50k
    - Admin: See all
    """
    return get_all_change_requests()


# Get specific change request by ID
@change_request_routes.route('/change-request/<int:cr_id>', methods=['GET'])
@jwt_required
def get_change_request_by_id_route(cr_id):
    """
    Get detailed information about a specific change request
    Includes overhead analysis, budget impact, and materials
    """
    return get_change_request_by_id(cr_id)


# Approve change request (Estimator/TD)
@change_request_routes.route('/change-request/<int:cr_id>/approve', methods=['POST'])
@jwt_required
def approve_change_request_route(cr_id):
    """
    Approve change request and merge materials into BOQ
    Request body:
    {
        "comments": "Approved. Within overhead budget."
    }
    """
    return approve_change_request(cr_id)


# Reject change request (Estimator/TD)
@change_request_routes.route('/change-request/<int:cr_id>/reject', methods=['POST'])
@jwt_required
def reject_change_request_route(cr_id):
    """
    Reject change request
    Request body:
    {
        "rejection_reason": "Overhead exceeded. Please reduce quantity or request budget increase."
    }
    """
    return reject_change_request(cr_id)


# Send for review (PM/SE sends request to next approver)
@change_request_routes.route('/change-request/<int:cr_id>/send-for-review', methods=['POST'])
@jwt_required
def send_for_review_route(cr_id):
    """
    Send change request for review
    SE → Sends to PM
    PM → Sends to TD or Estimator (based on budget threshold)
    Changes status from 'pending' to 'under_review'
    """
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


# Extra Material Endpoints - Separate from main BOQ view
@change_request_routes.route('/change_request/extra_materials', methods=['GET'])
@jwt_required
def get_extra_materials_route():
    """
    Get extra material requests (separate from BOQ view)
    Filters: project_id, area_id, status
    """
    from controllers.change_request_controller import get_extra_materials
    return get_extra_materials()


@change_request_routes.route('/change_request/extra_materials/create', methods=['POST'])
@jwt_required
def create_extra_material_route():
    """
    Create extra material request with proper routing
    Routes: PM → Purchase → TD (>40%) or PM → Estimator (≤40%)
    """
    from controllers.change_request_controller import create_extra_material
    return create_extra_material()


@change_request_routes.route('/change_request/extra_materials/approve/<int:id>', methods=['PATCH'])
@jwt_required
def approve_extra_material_route(id):
    """
    Approve extra material request
    Roles allowed: PM, Purchase, Estimator, TD
    """
    from controllers.change_request_controller import approve_extra_material
    return approve_extra_material(id)
