"""
Catalog Items Controller

Manages hierarchical catalog entries: Items -> Sub-Items -> Materials.
Buyer/Admin creates templates; Estimators import them into BOQs.

Endpoints:
- GET    /api/catalog-items             - List all catalog items
- GET    /api/catalog-items/search      - Search items by name/category
- GET    /api/catalog-items/full-tree   - Full hierarchy for estimator import
- GET    /api/catalog-items/<id>        - Get single item with sub-items + materials
- POST   /api/catalog-items             - Create catalog item (Buyer/Admin)
- PUT    /api/catalog-items/<id>        - Update catalog item (Buyer/Admin)
- DELETE /api/catalog-items/<id>        - Soft delete catalog item (Buyer/Admin)
- POST   /api/catalog-items/<id>/sub-items           - Add sub-item
- PUT    /api/catalog-items/sub-items/<id>           - Update sub-item
- DELETE /api/catalog-items/sub-items/<id>           - Soft delete sub-item
- POST   /api/catalog-items/sub-items/<id>/materials - Link material
- DELETE /api/catalog-items/sub-items/<sub_id>/materials/<material_id> - Unlink material
"""

from flask import request, jsonify, g
from sqlalchemy import or_, func
from sqlalchemy.orm import joinedload
from config.db import db
from models.catalog_item import CatalogItem, CatalogSubItem, CatalogSubItemMaterial
from models.raw_materials_catalog import RawMaterialsCatalog
from config.logging import get_logger

log = get_logger()


# ============================================================================
# ROLE CHECK (reuse pattern from raw_materials_controller)
# ============================================================================

def _can_manage(user_role: str) -> bool:
    """Check if user can create/edit/delete catalog items (Buyer/Admin)."""
    if not user_role:
        return False
    role_lower = user_role.lower().replace('_', '').replace(' ', '').replace('-', '')
    return role_lower in ('buyer', 'procurement', 'procurementuser', 'buyeruser', 'admin')


def _get_user_context():
    """Extract user_id and role from g.user. Returns (user_id, role, error_response)."""
    if not hasattr(g, 'user') or g.user is None:
        return None, None, (jsonify({
            'success': False,
            'error': 'Authentication error',
            'message': 'User session not found. Please log out and log in again.'
        }), 401)

    current_user = g.user
    user_id = current_user.get('user_id')
    user_role = current_user.get('role') or current_user.get('role_name') or ''

    if not user_role:
        return None, None, (jsonify({
            'success': False,
            'error': 'Authentication error',
            'message': 'User role not found in session. Please log out and log in again.'
        }), 401)

    return user_id, user_role, None


def _require_manage_permission():
    """Returns (user_id, error_response). error_response is None if authorized."""
    user_id, user_role, err = _get_user_context()
    if err:
        return None, err
    if not _can_manage(user_role):
        return None, (jsonify({
            'success': False,
            'error': 'Unauthorized',
            'message': f'Only Buyer and Admin roles can manage catalog items. Your role: {user_role}'
        }), 403)
    return user_id, None


# ============================================================================
# CATALOG ITEMS CRUD
# ============================================================================

def get_all_catalog_items():
    """GET /api/catalog-items - List all active catalog items."""
    try:
        active_only = request.args.get('active_only', 'true').lower() == 'true'
        include_full = request.args.get('include_full', 'false').lower() == 'true'
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 50)), 200)

        query = CatalogItem.query
        if active_only:
            query = query.filter(CatalogItem.is_active == True)

        # Always eager-load creator and sub_items to avoid N+1
        query = query.options(
            joinedload(CatalogItem.creator),
            joinedload(CatalogItem.sub_items)
        )

        if include_full:
            query = query.options(
                joinedload(CatalogItem.sub_items)
                .joinedload(CatalogSubItem.creator),
                joinedload(CatalogItem.sub_items)
                .joinedload(CatalogSubItem.material_links)
                .joinedload(CatalogSubItemMaterial.raw_material)
            )

        query = query.order_by(CatalogItem.item_name.asc())
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        if include_full:
            items = [item.to_dict_full() for item in paginated.items]
        else:
            items = [item.to_dict() for item in paginated.items]

        return jsonify({
            'success': True,
            'items': items,
            'total_count': paginated.total,
            'page': page,
            'per_page': per_page,
            'total_pages': paginated.pages
        }), 200

    except ValueError:
        return jsonify({
            'success': False,
            'error': 'Invalid parameters',
            'message': 'page and per_page must be valid integers'
        }), 400
    except Exception as e:
        log.error(f"Error fetching catalog items: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch catalog items',
            'message': 'An unexpected error occurred while fetching catalog items'
        }), 500


def get_catalog_item(item_id):
    """GET /api/catalog-items/<id> - Single item with sub-items and materials."""
    try:
        item = CatalogItem.query.options(
            joinedload(CatalogItem.creator),
            joinedload(CatalogItem.sub_items)
            .joinedload(CatalogSubItem.creator),
            joinedload(CatalogItem.sub_items)
            .joinedload(CatalogSubItem.material_links)
            .joinedload(CatalogSubItemMaterial.raw_material)
        ).get(item_id)

        if not item or not item.is_active:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': f'Catalog item with ID {item_id} not found'
            }), 404

        return jsonify({
            'success': True,
            'item': item.to_dict_full()
        }), 200

    except Exception as e:
        log.error(f"Error fetching catalog item {item_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch catalog item',
            'message': 'An unexpected error occurred while fetching the catalog item'
        }), 500


def search_catalog_items():
    """GET /api/catalog-items/search - Search by name or category."""
    try:
        search_query = request.args.get('q', '').strip()
        limit = min(int(request.args.get('limit', 20)), 100)

        if not search_query:
            return jsonify({
                'success': False,
                'error': 'Search query is required',
                'message': 'Please provide a search query using the "q" parameter'
            }), 400

        search_pattern = f"%{search_query}%"

        items = CatalogItem.query.filter(
            CatalogItem.is_active == True,
            or_(
                CatalogItem.item_name.ilike(search_pattern),
                CatalogItem.description.ilike(search_pattern),
                CatalogItem.category.ilike(search_pattern)
            )
        ).order_by(
            func.length(CatalogItem.item_name).asc(),
            CatalogItem.item_name.asc()
        ).limit(limit).all()

        return jsonify({
            'success': True,
            'items': [item.to_dict() for item in items],
            'total_count': len(items),
            'search_query': search_query
        }), 200

    except ValueError:
        return jsonify({
            'success': False,
            'error': 'Invalid parameters',
            'message': 'limit must be a valid integer'
        }), 400
    except Exception as e:
        log.error(f"Error searching catalog items: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to search catalog items',
            'message': 'An unexpected error occurred while searching catalog items'
        }), 500


def get_full_tree():
    """GET /api/catalog-items/full-tree - Complete hierarchy for estimator import."""
    try:
        items = CatalogItem.query.filter(
            CatalogItem.is_active == True
        ).options(
            joinedload(CatalogItem.creator),
            joinedload(CatalogItem.sub_items)
            .joinedload(CatalogSubItem.creator),
            joinedload(CatalogItem.sub_items)
            .joinedload(CatalogSubItem.material_links)
            .joinedload(CatalogSubItemMaterial.raw_material)
        ).order_by(CatalogItem.item_name.asc()).all()

        return jsonify({
            'success': True,
            'items': [item.to_dict_full() for item in items],
            'total_count': len(items)
        }), 200

    except Exception as e:
        log.error(f"Error fetching catalog full tree: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch catalog tree',
            'message': 'An unexpected error occurred while fetching the catalog tree'
        }), 500


def create_catalog_item():
    """POST /api/catalog-items - Create a catalog item."""
    try:
        user_id, err = _require_manage_permission()
        if err:
            return err

        data = request.get_json(silent=True)
        if not data:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'Request body is required (JSON)'
            }), 400

        item_name = (data.get('item_name') or '').strip()
        if not item_name:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'Item name is required'
            }), 400

        new_item = CatalogItem(
            item_name=item_name,
            description=data.get('description', '').strip() if data.get('description') else None,
            category=data.get('category', '').strip() if data.get('category') else None,
            created_by=user_id,
            is_active=True
        )

        db.session.add(new_item)
        db.session.commit()
        db.session.refresh(new_item)

        log.info(f"Catalog item created: {new_item.id} - {new_item.item_name} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Catalog item created successfully',
            'item': new_item.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating catalog item: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create catalog item',
            'message': 'An unexpected error occurred while creating the catalog item'
        }), 500


def update_catalog_item(item_id):
    """PUT /api/catalog-items/<id> - Update a catalog item."""
    try:
        user_id, err = _require_manage_permission()
        if err:
            return err

        item = CatalogItem.query.get(item_id)
        if not item or not item.is_active:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': f'Catalog item with ID {item_id} not found'
            }), 404

        data = request.get_json(silent=True)
        if not data:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'Request body is required (JSON)'
            }), 400

        if 'item_name' in data:
            new_name = (data['item_name'] or '').strip()
            if not new_name:
                return jsonify({
                    'success': False,
                    'error': 'Validation error',
                    'message': 'Item name cannot be empty'
                }), 400
            item.item_name = new_name
        if 'description' in data:
            item.description = data['description'].strip() if data['description'] else None
        if 'category' in data:
            item.category = data['category'].strip() if data['category'] else None

        db.session.commit()
        db.session.refresh(item)

        log.info(f"Catalog item updated: {item.id} - {item.item_name} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Catalog item updated successfully',
            'item': item.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating catalog item {item_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update catalog item',
            'message': 'An unexpected error occurred while updating the catalog item'
        }), 500


def delete_catalog_item(item_id):
    """DELETE /api/catalog-items/<id> - Soft delete a catalog item and its sub-items."""
    try:
        user_id, err = _require_manage_permission()
        if err:
            return err

        item = CatalogItem.query.get(item_id)
        if not item:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': f'Catalog item with ID {item_id} not found'
            }), 404

        # Soft delete item and all its sub-items
        item.is_active = False
        for sub_item in item.sub_items:
            sub_item.is_active = False
            for link in sub_item.material_links:
                link.is_active = False

        db.session.commit()

        log.info(f"Catalog item soft deleted: {item.id} - {item.item_name} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Catalog item deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting catalog item {item_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete catalog item',
            'message': 'An unexpected error occurred while deleting the catalog item'
        }), 500


# ============================================================================
# CATALOG SUB-ITEMS CRUD
# ============================================================================

def create_catalog_sub_item(item_id):
    """POST /api/catalog-items/<id>/sub-items - Add a sub-item to a catalog item."""
    try:
        user_id, err = _require_manage_permission()
        if err:
            return err

        parent = CatalogItem.query.get(item_id)
        if not parent or not parent.is_active:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': f'Catalog item with ID {item_id} not found'
            }), 404

        data = request.get_json(silent=True)
        if not data:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'Request body is required (JSON)'
            }), 400

        sub_item_name = (data.get('sub_item_name') or '').strip()
        if not sub_item_name:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'Sub-item name is required'
            }), 400

        new_sub = CatalogSubItem(
            catalog_item_id=item_id,
            sub_item_name=sub_item_name,
            description=data.get('description', '').strip() if data.get('description') else None,
            size=data.get('size', '').strip() if data.get('size') else None,
            specification=data.get('specification', '').strip() if data.get('specification') else None,
            brand=data.get('brand', '').strip() if data.get('brand') else None,
            unit=data.get('unit', '').strip() if data.get('unit') else None,
            created_by=user_id,
            is_active=True
        )

        db.session.add(new_sub)
        db.session.commit()
        db.session.refresh(new_sub)

        log.info(f"Catalog sub-item created: {new_sub.id} - {new_sub.sub_item_name} under item {item_id} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Sub-item created successfully',
            'sub_item': new_sub.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating catalog sub-item for item {item_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create sub-item',
            'message': 'An unexpected error occurred while creating the sub-item'
        }), 500


def update_catalog_sub_item(sub_item_id):
    """PUT /api/catalog-items/sub-items/<id> - Update a sub-item."""
    try:
        user_id, err = _require_manage_permission()
        if err:
            return err

        sub = CatalogSubItem.query.get(sub_item_id)
        if not sub or not sub.is_active:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': f'Sub-item with ID {sub_item_id} not found'
            }), 404

        data = request.get_json(silent=True)
        if not data:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'Request body is required (JSON)'
            }), 400

        if 'sub_item_name' in data:
            new_name = (data['sub_item_name'] or '').strip()
            if not new_name:
                return jsonify({
                    'success': False,
                    'error': 'Validation error',
                    'message': 'Sub-item name cannot be empty'
                }), 400
            sub.sub_item_name = new_name
        if 'description' in data:
            sub.description = data['description'].strip() if data['description'] else None
        if 'size' in data:
            sub.size = data['size'].strip() if data['size'] else None
        if 'specification' in data:
            sub.specification = data['specification'].strip() if data['specification'] else None
        if 'brand' in data:
            sub.brand = data['brand'].strip() if data['brand'] else None
        if 'unit' in data:
            sub.unit = data['unit'].strip() if data['unit'] else None

        db.session.commit()
        db.session.refresh(sub)

        log.info(f"Catalog sub-item updated: {sub.id} - {sub.sub_item_name} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Sub-item updated successfully',
            'sub_item': sub.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating catalog sub-item {sub_item_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update sub-item',
            'message': 'An unexpected error occurred while updating the sub-item'
        }), 500


def delete_catalog_sub_item(sub_item_id):
    """DELETE /api/catalog-items/sub-items/<id> - Soft delete a sub-item."""
    try:
        user_id, err = _require_manage_permission()
        if err:
            return err

        sub = CatalogSubItem.query.get(sub_item_id)
        if not sub:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': f'Sub-item with ID {sub_item_id} not found'
            }), 404

        sub.is_active = False
        for link in sub.material_links:
            link.is_active = False

        db.session.commit()

        log.info(f"Catalog sub-item soft deleted: {sub.id} - {sub.sub_item_name} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Sub-item deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting catalog sub-item {sub_item_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete sub-item',
            'message': 'An unexpected error occurred while deleting the sub-item'
        }), 500


# ============================================================================
# MATERIAL LINKING
# ============================================================================

def link_material_to_sub_item(sub_item_id):
    """POST /api/catalog-items/sub-items/<id>/materials - Link a raw material."""
    try:
        user_id, err = _require_manage_permission()
        if err:
            return err

        sub = CatalogSubItem.query.get(sub_item_id)
        if not sub or not sub.is_active:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': f'Sub-item with ID {sub_item_id} not found'
            }), 404

        data = request.get_json(silent=True)
        if not data:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'Request body is required (JSON)'
            }), 400

        raw_material_id = data.get('raw_material_id')
        quantity = data.get('quantity', 1.0)

        if not raw_material_id:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'raw_material_id is required'
            }), 400

        try:
            quantity = float(quantity)
        except (TypeError, ValueError):
            quantity = 1.0

        if quantity <= 0:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'Quantity must be a positive number'
            }), 400

        # Verify material exists
        material = RawMaterialsCatalog.query.get(raw_material_id)
        if not material or not material.is_active:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': f'Raw material with ID {raw_material_id} not found'
            }), 404

        # Check if already linked (active)
        existing = CatalogSubItemMaterial.query.filter_by(
            catalog_sub_item_id=sub_item_id,
            raw_material_id=raw_material_id,
            is_active=True
        ).first()

        if existing:
            # Update quantity instead of creating duplicate
            existing.quantity = quantity
            db.session.commit()
            db.session.refresh(existing)
            return jsonify({
                'success': True,
                'message': 'Material link updated',
                'link': existing.to_dict()
            }), 200

        # Re-activate if soft-deleted link exists
        inactive = CatalogSubItemMaterial.query.filter_by(
            catalog_sub_item_id=sub_item_id,
            raw_material_id=raw_material_id,
            is_active=False
        ).first()

        if inactive:
            inactive.is_active = True
            inactive.quantity = quantity
            db.session.commit()
            db.session.refresh(inactive)
            return jsonify({
                'success': True,
                'message': 'Material linked successfully',
                'link': inactive.to_dict()
            }), 201

        new_link = CatalogSubItemMaterial(
            catalog_sub_item_id=sub_item_id,
            raw_material_id=raw_material_id,
            quantity=quantity,
            is_active=True
        )

        db.session.add(new_link)
        db.session.commit()
        db.session.refresh(new_link)

        log.info(f"Material {raw_material_id} linked to sub-item {sub_item_id} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Material linked successfully',
            'link': new_link.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error linking material to sub-item {sub_item_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to link material',
            'message': 'An unexpected error occurred while linking the material'
        }), 500


def unlink_material_from_sub_item(sub_item_id, material_id):
    """DELETE /api/catalog-items/sub-items/<sub_id>/materials/<material_id> - Unlink."""
    try:
        user_id, err = _require_manage_permission()
        if err:
            return err

        link = CatalogSubItemMaterial.query.filter_by(
            catalog_sub_item_id=sub_item_id,
            raw_material_id=material_id,
            is_active=True
        ).first()

        if not link:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': 'Material link not found'
            }), 404

        link.is_active = False
        db.session.commit()

        log.info(f"Material {material_id} unlinked from sub-item {sub_item_id} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Material unlinked successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error unlinking material {material_id} from sub-item {sub_item_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to unlink material',
            'message': 'An unexpected error occurred while unlinking the material'
        }), 500


def get_catalog_categories():
    """GET /api/catalog-items/categories - Get unique categories from catalog items."""
    try:
        categories = db.session.query(CatalogItem.category).filter(
            CatalogItem.is_active == True,
            CatalogItem.category.isnot(None),
            CatalogItem.category != ''
        ).distinct().order_by(CatalogItem.category.asc()).all()

        category_list = [cat[0] for cat in categories]

        return jsonify({
            'success': True,
            'categories': category_list,
            'total_count': len(category_list)
        }), 200

    except Exception as e:
        log.error(f"Error fetching catalog categories: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch categories',
            'message': 'An unexpected error occurred while fetching categories'
        }), 500
