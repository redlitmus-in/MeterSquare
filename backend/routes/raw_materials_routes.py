"""
Raw Materials Catalog Routes

Routes for managing the master catalog of raw materials.
Procurement/Buyer team maintains this catalog, and Estimators
select materials from it when creating BOQs.
"""

from flask import Blueprint
from controllers.raw_materials_controller import (
    get_all_raw_materials,
    search_raw_materials,
    create_raw_material,
    update_raw_material,
    delete_raw_material,
    get_material_categories
)
from controllers.auth_controller import jwt_required

# Create blueprint with URL prefix
raw_materials_routes = Blueprint('raw_materials_routes', __name__, url_prefix='/api/raw-materials')


# ============================================================================
# RAW MATERIALS CATALOG ROUTES
# ============================================================================

@raw_materials_routes.route('', methods=['GET'])
@jwt_required
def get_materials_route():
    """
    GET /api/raw-materials

    Get all active raw materials from the catalog.
    Supports pagination and filtering by category.

    Query Parameters:
    - category (optional): Filter by material category
    - active_only (optional): If true, return only active materials (default: true)
    - page (optional): Page number for pagination (default: 1)
    - per_page (optional): Items per page (default: 50, max: 200)
    """
    return get_all_raw_materials()


@raw_materials_routes.route('/search', methods=['GET'])
@jwt_required
def search_materials_route():
    """
    GET /api/raw-materials/search

    Search raw materials by name, brand, or description.

    Query Parameters:
    - q (required): Search query
    - active_only (optional): If true, return only active materials (default: true)
    - limit (optional): Maximum number of results (default: 20, max: 100)
    """
    return search_raw_materials()


@raw_materials_routes.route('/categories', methods=['GET'])
@jwt_required
def get_categories_route():
    """
    GET /api/raw-materials/categories

    Get all unique material categories in the catalog.
    Useful for filtering and dropdown lists.
    """
    return get_material_categories()


@raw_materials_routes.route('', methods=['POST'])
@jwt_required
def create_material_route():
    """
    POST /api/raw-materials

    Create a new raw material in the catalog.
    Only accessible by Buyer and Admin roles.

    Request Body:
    {
        "material_name": "Cement OPC 53 Grade",
        "description": "Ordinary Portland Cement Grade 53",
        "brand": "UltraTech",
        "size": "50kg",
        "specification": "IS 12269:2013 compliant",
        "unit": "bag",
        "category": "Cement"
    }
    """
    return create_raw_material()


@raw_materials_routes.route('/<int:material_id>', methods=['PUT'])
@jwt_required
def update_material_route(material_id):
    """
    PUT /api/raw-materials/<material_id>

    Update an existing raw material in the catalog.
    Only accessible by Buyer and Admin roles.

    Request Body:
    {
        "material_name": "Updated name",
        "description": "Updated description",
        ...
    }
    """
    return update_raw_material(material_id)


@raw_materials_routes.route('/<int:material_id>', methods=['DELETE'])
@jwt_required
def delete_material_route(material_id):
    """
    DELETE /api/raw-materials/<material_id>

    Soft delete a raw material from the catalog.
    Only accessible by Buyer and Admin roles.
    Sets is_active to False instead of actually deleting the record.
    """
    return delete_raw_material(material_id)
