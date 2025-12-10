"""
Preliminary Purchase Routes - API endpoints for preliminary purchase requests
"""
from flask import Blueprint
from controllers.preliminary_purchase_controller import (
    create_preliminary_purchase_request,
    get_preliminary_purchase_requests,
    get_preliminary_purchase_request,
    complete_preliminary_purchase,
    reject_preliminary_purchase,
    get_boq_selected_preliminaries_for_purchase,
    delete_preliminary_purchase_request
)
from utils.authentication import jwt_required

preliminary_purchase_bp = Blueprint('preliminary_purchase', __name__)


# Create a new preliminary purchase request (PM)
@preliminary_purchase_bp.route('/api/preliminary-purchases', methods=['POST'])
@jwt_required
def create_purchase():
    return create_preliminary_purchase_request()


# Get all preliminary purchase requests (filtered by role)
@preliminary_purchase_bp.route('/api/preliminary-purchases', methods=['GET'])
@jwt_required
def get_purchases():
    return get_preliminary_purchase_requests()


# Get a single preliminary purchase request by ID
@preliminary_purchase_bp.route('/api/preliminary-purchases/<int:ppr_id>', methods=['GET'])
@jwt_required
def get_purchase(ppr_id):
    return get_preliminary_purchase_request(ppr_id)


# Get selected preliminaries for a BOQ (for purchase form dropdown)
@preliminary_purchase_bp.route('/api/boq/<int:boq_id>/preliminaries-for-purchase', methods=['GET'])
@jwt_required
def get_boq_preliminaries_for_purchase(boq_id):
    return get_boq_selected_preliminaries_for_purchase(boq_id)


# Complete a preliminary purchase (Buyer)
@preliminary_purchase_bp.route('/api/preliminary-purchases/<int:ppr_id>/complete', methods=['POST'])
@jwt_required
def complete_purchase(ppr_id):
    return complete_preliminary_purchase(ppr_id)


# Reject a preliminary purchase request
@preliminary_purchase_bp.route('/api/preliminary-purchases/<int:ppr_id>/reject', methods=['POST'])
@jwt_required
def reject_purchase(ppr_id):
    return reject_preliminary_purchase(ppr_id)


# Delete a preliminary purchase request (soft delete)
@preliminary_purchase_bp.route('/api/preliminary-purchases/<int:ppr_id>', methods=['DELETE'])
@jwt_required
def delete_purchase(ppr_id):
    return delete_preliminary_purchase_request(ppr_id)
