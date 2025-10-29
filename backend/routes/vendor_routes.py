from flask import Blueprint, g, jsonify
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

# Helper function - Vendor routes accessible by Buyer, TD (for approval), or Admin
def check_vendor_access():
    """Check if current user can access Vendor operations"""
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    allowed_roles = ['buyer', 'technicaldirector', 'admin']
    if user_role not in allowed_roles:
        return jsonify({"error": "Access denied. Buyer, TD, or Admin role required."}), 403
    return None


# Vendor CRUD routes
@vendor_routes.route('/create', methods=['POST'])
@jwt_required
def create_vendor_route():
    """Create a new vendor (Buyer, TD, or Admin)"""
    access_check = check_vendor_access()
    if access_check:
        return access_check
    return create_vendor()


@vendor_routes.route('/all', methods=['GET'])
@jwt_required
def get_all_vendors_route():
    """Get all vendors (Buyer, TD, or Admin)"""
    access_check = check_vendor_access()
    if access_check:
        return access_check
    return get_all_vendors()


@vendor_routes.route('/<int:vendor_id>', methods=['GET'])
@jwt_required
def get_vendor_by_id_route(vendor_id):
    """Get vendor by ID (Buyer, TD, or Admin)"""
    access_check = check_vendor_access()
    if access_check:
        return access_check
    return get_vendor_by_id(vendor_id)


@vendor_routes.route('/<int:vendor_id>', methods=['PUT'])
@jwt_required
def update_vendor_route(vendor_id):
    """Update vendor details (Buyer, TD, or Admin)"""
    access_check = check_vendor_access()
    if access_check:
        return access_check
    return update_vendor(vendor_id)


@vendor_routes.route('/<int:vendor_id>', methods=['DELETE'])
@jwt_required
def delete_vendor_route(vendor_id):
    """Soft delete a vendor (Buyer, TD, or Admin)"""
    access_check = check_vendor_access()
    if access_check:
        return access_check
    return delete_vendor(vendor_id)


# Vendor products routes
@vendor_routes.route('/<int:vendor_id>/products', methods=['POST'])
@jwt_required
def add_vendor_product_route(vendor_id):
    """Add product/service to vendor (Buyer, TD, or Admin)"""
    access_check = check_vendor_access()
    if access_check:
        return access_check
    return add_vendor_product(vendor_id)


@vendor_routes.route('/<int:vendor_id>/products', methods=['GET'])
@jwt_required
def get_vendor_products_route(vendor_id):
    """Get all products for a vendor (Buyer, TD, or Admin)"""
    access_check = check_vendor_access()
    if access_check:
        return access_check
    return get_vendor_products(vendor_id)


@vendor_routes.route('/<int:vendor_id>/products/<int:product_id>', methods=['PUT'])
@jwt_required
def update_vendor_product_route(vendor_id, product_id):
    """Update vendor product (Buyer, TD, or Admin)"""
    access_check = check_vendor_access()
    if access_check:
        return access_check
    return update_vendor_product(vendor_id, product_id)


@vendor_routes.route('/<int:vendor_id>/products/<int:product_id>', methods=['DELETE'])
@jwt_required
def delete_vendor_product_route(vendor_id, product_id):
    """Delete vendor product (Buyer, TD, or Admin)"""
    access_check = check_vendor_access()
    if access_check:
        return access_check
    return delete_vendor_product(vendor_id, product_id)


# Utility routes
@vendor_routes.route('/categories', methods=['GET'])
@jwt_required
def get_vendor_categories_route():
    """Get list of vendor categories (Buyer, TD, or Admin)"""
    access_check = check_vendor_access()
    if access_check:
        return access_check
    return get_vendor_categories()
