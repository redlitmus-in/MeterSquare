"""
Catalog Items Routes

Routes for managing hierarchical catalog entries (Items -> Sub-Items -> Materials).
Buyer/Admin manages the catalog; all authenticated users can read.
"""

from flask import Blueprint
from controllers.catalog_items_controller import (
    get_all_catalog_items,
    get_catalog_item,
    search_catalog_items,
    get_full_tree,
    create_catalog_item,
    update_catalog_item,
    delete_catalog_item,
    create_catalog_sub_item,
    update_catalog_sub_item,
    delete_catalog_sub_item,
    link_material_to_sub_item,
    unlink_material_from_sub_item,
    get_catalog_categories,
)
from controllers.auth_controller import jwt_required

catalog_items_routes = Blueprint('catalog_items_routes', __name__, url_prefix='/api/catalog-items')


# ============================================================================
# CATALOG ITEMS
# ============================================================================

@catalog_items_routes.route('', methods=['GET'])
@jwt_required
def list_items():
    """GET /api/catalog-items"""
    return get_all_catalog_items()


@catalog_items_routes.route('/search', methods=['GET'])
@jwt_required
def search_items():
    """GET /api/catalog-items/search?q=foundation"""
    return search_catalog_items()


@catalog_items_routes.route('/full-tree', methods=['GET'])
@jwt_required
def full_tree():
    """GET /api/catalog-items/full-tree"""
    return get_full_tree()


@catalog_items_routes.route('/categories', methods=['GET'])
@jwt_required
def categories():
    """GET /api/catalog-items/categories"""
    return get_catalog_categories()


@catalog_items_routes.route('/<int:item_id>', methods=['GET'])
@jwt_required
def get_item(item_id):
    """GET /api/catalog-items/<id>"""
    return get_catalog_item(item_id)


@catalog_items_routes.route('', methods=['POST'])
@jwt_required
def create_item():
    """POST /api/catalog-items"""
    return create_catalog_item()


@catalog_items_routes.route('/<int:item_id>', methods=['PUT'])
@jwt_required
def update_item(item_id):
    """PUT /api/catalog-items/<id>"""
    return update_catalog_item(item_id)


@catalog_items_routes.route('/<int:item_id>', methods=['DELETE'])
@jwt_required
def delete_item(item_id):
    """DELETE /api/catalog-items/<id>"""
    return delete_catalog_item(item_id)


# ============================================================================
# CATALOG SUB-ITEMS
# ============================================================================

@catalog_items_routes.route('/<int:item_id>/sub-items', methods=['POST'])
@jwt_required
def create_sub_item(item_id):
    """POST /api/catalog-items/<id>/sub-items"""
    return create_catalog_sub_item(item_id)


@catalog_items_routes.route('/sub-items/<int:sub_item_id>', methods=['PUT'])
@jwt_required
def update_sub_item(sub_item_id):
    """PUT /api/catalog-items/sub-items/<id>"""
    return update_catalog_sub_item(sub_item_id)


@catalog_items_routes.route('/sub-items/<int:sub_item_id>', methods=['DELETE'])
@jwt_required
def delete_sub_item(sub_item_id):
    """DELETE /api/catalog-items/sub-items/<id>"""
    return delete_catalog_sub_item(sub_item_id)


# ============================================================================
# MATERIAL LINKING
# ============================================================================

@catalog_items_routes.route('/sub-items/<int:sub_item_id>/materials', methods=['POST'])
@jwt_required
def link_material(sub_item_id):
    """POST /api/catalog-items/sub-items/<id>/materials"""
    return link_material_to_sub_item(sub_item_id)


@catalog_items_routes.route('/sub-items/<int:sub_item_id>/materials/<int:material_id>', methods=['DELETE'])
@jwt_required
def unlink_material(sub_item_id, material_id):
    """DELETE /api/catalog-items/sub-items/<sub_id>/materials/<material_id>"""
    return unlink_material_from_sub_item(sub_item_id, material_id)
