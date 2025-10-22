from flask import Blueprint
from controllers.vendor_controller import (
    create_vendor,
    get_all_vendors,
    get_vendor_by_id,
    update_vendor,
    delete_vendor,
    add_vendor_product,
    get_vendor_products,
    update_vendor_product,
    delete_vendor_product,
    get_vendor_categories
)
from controllers.auth_controller import jwt_required

# Create blueprint with URL prefix
vendor_routes = Blueprint('vendor_routes', __name__, url_prefix='/api/vendor')


# Vendor CRUD routes
@vendor_routes.route('/create', methods=['POST'])
@jwt_required
def create_vendor_route():
    """Create a new vendor"""
    return create_vendor()


@vendor_routes.route('/all', methods=['GET'])
@jwt_required
def get_all_vendors_route():
    """Get all vendors with optional filtering and pagination"""
    return get_all_vendors()


@vendor_routes.route('/<int:vendor_id>', methods=['GET'])
@jwt_required
def get_vendor_by_id_route(vendor_id):
    """Get vendor by ID with products"""
    return get_vendor_by_id(vendor_id)


@vendor_routes.route('/<int:vendor_id>', methods=['PUT'])
@jwt_required
def update_vendor_route(vendor_id):
    """Update vendor details"""
    return update_vendor(vendor_id)


@vendor_routes.route('/<int:vendor_id>', methods=['DELETE'])
@jwt_required
def delete_vendor_route(vendor_id):
    """Soft delete a vendor"""
    return delete_vendor(vendor_id)


# Vendor products routes
@vendor_routes.route('/<int:vendor_id>/products', methods=['POST'])
@jwt_required
def add_vendor_product_route(vendor_id):
    """Add product/service to vendor"""
    return add_vendor_product(vendor_id)


@vendor_routes.route('/<int:vendor_id>/products', methods=['GET'])
@jwt_required
def get_vendor_products_route(vendor_id):
    """Get all products for a vendor"""
    return get_vendor_products(vendor_id)


@vendor_routes.route('/<int:vendor_id>/products/<int:product_id>', methods=['PUT'])
@jwt_required
def update_vendor_product_route(vendor_id, product_id):
    """Update vendor product"""
    return update_vendor_product(vendor_id, product_id)


@vendor_routes.route('/<int:vendor_id>/products/<int:product_id>', methods=['DELETE'])
@jwt_required
def delete_vendor_product_route(vendor_id, product_id):
    """Delete vendor product"""
    return delete_vendor_product(vendor_id, product_id)


# Utility routes
@vendor_routes.route('/categories', methods=['GET'])
@jwt_required
def get_vendor_categories_route():
    """Get list of vendor categories"""
    return get_vendor_categories()
