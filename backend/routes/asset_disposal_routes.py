"""
Asset Disposal Routes
Routes for returnable asset disposal with TD approval workflow.
"""

from flask import Blueprint
from controllers.asset_disposal_controller import *
from utils.authentication import jwt_required

# Create blueprint
asset_disposal_routes = Blueprint('asset_disposal', __name__)


# ============================================================================
# DISPOSAL REQUEST ROUTES
# ============================================================================

@asset_disposal_routes.route('/api/assets/disposal', methods=['GET'])
@jwt_required
def get_disposal_requests_route():
    """Get all disposal requests with filtering"""
    return get_disposal_requests()


@asset_disposal_routes.route('/api/assets/disposal', methods=['POST'])
@jwt_required
def create_disposal_request_route():
    """Create new disposal request (requires TD approval)"""
    return create_disposal_request()


@asset_disposal_routes.route('/api/assets/disposal/<int:disposal_id>', methods=['GET'])
@jwt_required
def get_disposal_detail_route(disposal_id):
    """Get detailed disposal information"""
    return get_disposal_detail(disposal_id)


@asset_disposal_routes.route('/api/assets/disposal/<int:disposal_id>/upload-image', methods=['POST'])
@jwt_required
def upload_disposal_image_route(disposal_id):
    """Upload disposal documentation image"""
    return upload_disposal_image(disposal_id)


# ============================================================================
# TD APPROVAL ROUTES
# ============================================================================

@asset_disposal_routes.route('/api/assets/disposal/<int:disposal_id>/approve', methods=['PUT'])
@jwt_required
def approve_disposal_route(disposal_id):
    """TD approves disposal (reduces inventory)"""
    return approve_disposal(disposal_id)


@asset_disposal_routes.route('/api/assets/disposal/<int:disposal_id>/reject', methods=['PUT'])
@jwt_required
def reject_disposal_route(disposal_id):
    """TD rejects disposal (return to stock/repair)"""
    return reject_disposal(disposal_id)


# ============================================================================
# CATALOG DISPOSAL ROUTES
# ============================================================================

@asset_disposal_routes.route('/api/assets/catalog/<int:category_id>/dispose', methods=['POST'])
@jwt_required
def request_catalog_disposal_route(category_id):
    """Request disposal from catalog directly"""
    return request_catalog_disposal(category_id)
