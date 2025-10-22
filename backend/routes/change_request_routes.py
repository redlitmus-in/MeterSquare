from flask import Blueprint
from utils.authentication import jwt_required
from controllers.change_request_controller import (
    create_change_request,
    get_all_change_requests,
    get_change_request_by_id,
    approve_change_request,
    reject_change_request,
    update_change_request,
    get_boq_change_requests,
    send_for_review,
    complete_purchase_and_merge_to_boq,
    get_all_buyers
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


# Update change request (Only for pending requests by creator)
@change_request_routes.route('/change-request/<int:cr_id>', methods=['PUT'])
@jwt_required
def update_change_request_route(cr_id):
    """
    Update a pending change request
    Only the creator can update their own pending requests
    Request body:
    {
        "justification": "Updated justification",
        "materials": [
            {
                "material_name": "Cement",
                "quantity": 15,
                "unit": "bags",
                "unit_price": 450
            }
        ]
    }
    """
    return update_change_request(cr_id)


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


# Complete purchase (Buyer completes purchase and merges to BOQ)
@change_request_routes.route('/change-request/<int:cr_id>/complete-purchase', methods=['POST'])
@jwt_required
def complete_purchase_route(cr_id):
    """
    Buyer completes purchase and materials are merged into BOQ
    Request body:
    {
        "purchase_notes": "Materials purchased from Supplier XYZ on 2025-10-18"
    }
    """
    return complete_purchase_and_merge_to_boq(cr_id)


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
