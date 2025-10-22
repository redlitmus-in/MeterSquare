from flask import Blueprint
from controllers.buyer_controller import (
    create_buyer,
    get_all_buyers,
    get_buyer_id,
    update_buyer,
    delete_buyer,
    get_buyer_boq_materials,
    get_buyer_pending_purchases,
    get_buyer_dashboard
)
from controllers.auth_controller import jwt_required

# Create blueprint with URL prefix
buyer_routes = Blueprint('buyer_routes', __name__, url_prefix='/api/buyer')

# Buyer CRUD routes
@buyer_routes.route('/create', methods=['POST'])
@jwt_required
def create_buyer_route():
    """Create a new buyer"""
    return create_buyer()


@buyer_routes.route('/all', methods=['GET'])
@jwt_required
def get_all_buyers_route():
    """Get all buyers (assigned and unassigned)"""
    return get_all_buyers()


@buyer_routes.route('/<int:user_id>', methods=['GET'])
@jwt_required
def get_buyer_id_route(user_id):
    """Get buyer by ID with assigned projects"""
    return get_buyer_id(user_id)


@buyer_routes.route('/<int:user_id>', methods=['PUT'])
@jwt_required
def update_buyer_route(user_id):
    """Update buyer details"""
    return update_buyer(user_id)


@buyer_routes.route('/<int:user_id>', methods=['DELETE'])
@jwt_required
def delete_buyer_route(user_id):
    """Soft delete a buyer"""
    return delete_buyer(user_id)


# Dashboard route
@buyer_routes.route('/dashboard', methods=['GET'])
@jwt_required
def get_buyer_dashboard_route():
    """Get buyer dashboard statistics"""
    return get_buyer_dashboard()


# Material management routes
@buyer_routes.route('/boq-materials', methods=['GET'])
@jwt_required
def get_buyer_boq_materials_route():
    """Get BOQ materials from projects assigned to buyer by PM"""
    return get_buyer_boq_materials()


@buyer_routes.route('/new-purchases', methods=['GET'])
@jwt_required
def get_buyer_pending_purchases_route():
    """Get approved change requests (extra materials) for buyer to purchase"""
    return get_buyer_pending_purchases()
