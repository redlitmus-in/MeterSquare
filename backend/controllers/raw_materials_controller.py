"""
Raw Materials Catalog Controller

This controller manages the master catalog of raw materials maintained by Procurement/Buyer team.
Estimators must select materials from this catalog when creating BOQs to ensure consistency.

Endpoints:
- GET /api/raw-materials - List all active materials
- GET /api/raw-materials/search - Search materials by name/brand
- POST /api/raw-materials - Create new material (Buyer/Admin only)
- PUT /api/raw-materials/<id> - Update material (Buyer/Admin only)
- DELETE /api/raw-materials/<id> - Soft delete material (Buyer/Admin only)
"""

from flask import request, jsonify, g
from sqlalchemy import or_, and_, func
from config.db import db
from models.raw_materials_catalog import RawMaterialsCatalog
from models.user import User
from config.logging import get_logger

log = get_logger()


# ============================================================================
# ROLE CHECK HELPER FUNCTIONS
# ============================================================================

def is_buyer_role(user_role: str) -> bool:
    """Check if user role is Buyer or Procurement"""
    if not user_role:
        return False
    # Normalize role name by removing spaces, underscores, and converting to lowercase
    role_lower = user_role.lower().replace('_', '').replace(' ', '').replace('-', '')

    # Check against multiple variations
    allowed_roles = ['buyer', 'procurement', 'procurementuser', 'buyeruser']

    return role_lower in allowed_roles


def is_admin_role(user_role: str) -> bool:
    """Check if user role is Admin"""
    if not user_role:
        return False
    return user_role.lower() == 'admin'


def can_manage_raw_materials(user_role: str) -> bool:
    """Check if user can create/edit/delete raw materials"""
    return is_buyer_role(user_role) or is_admin_role(user_role)


# ============================================================================
# RAW MATERIALS CRUD ENDPOINTS
# ============================================================================

def get_all_raw_materials():
    """
    GET /api/raw-materials

    Retrieve all active raw materials from the catalog.
    Supports filtering by category and searching.

    Query Parameters:
    - category (optional): Filter by material category
    - active_only (optional): If true, return only active materials (default: true)
    - page (optional): Page number for pagination (default: 1)
    - per_page (optional): Items per page (default: 50, max: 200)

    Returns:
    - materials: List of material objects
    - total_count: Total number of materials
    - page: Current page number
    - per_page: Items per page
    - total_pages: Total number of pages
    """
    try:
        # Get query parameters
        category = request.args.get('category', None)
        active_only = request.args.get('active_only', 'true').lower() == 'true'
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 50)), 200)  # Cap at 200

        # Build query
        query = RawMaterialsCatalog.query

        # Filter by active status
        if active_only:
            query = query.filter(RawMaterialsCatalog.is_active == True)

        # Filter by category if provided
        if category:
            query = query.filter(RawMaterialsCatalog.category == category)

        # Order by material name
        query = query.order_by(RawMaterialsCatalog.material_name.asc())

        # Paginate
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        materials = [material.to_dict() for material in paginated.items]

        return jsonify({
            'success': True,
            'materials': materials,
            'total_count': paginated.total,
            'page': page,
            'per_page': per_page,
            'total_pages': paginated.pages
        }), 200

    except Exception as e:
        log.error(f"Error fetching raw materials: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch raw materials',
            'message': str(e)
        }), 500


def search_raw_materials():
    """
    GET /api/raw-materials/search

    Search raw materials by name, brand, or description.

    Query Parameters:
    - q (required): Search query
    - active_only (optional): If true, return only active materials (default: true)
    - limit (optional): Maximum number of results (default: 20, max: 100)

    Returns:
    - materials: List of matching material objects
    - total_count: Total number of matches
    """
    try:
        # Get query parameters
        search_query = request.args.get('q', '').strip()
        active_only = request.args.get('active_only', 'true').lower() == 'true'
        limit = min(int(request.args.get('limit', 20)), 100)  # Cap at 100

        if not search_query:
            return jsonify({
                'success': False,
                'error': 'Search query is required',
                'message': 'Please provide a search query using the "q" parameter'
            }), 400

        # Build search query with ILIKE for case-insensitive partial matching
        search_pattern = f"%{search_query}%"

        query = RawMaterialsCatalog.query.filter(
            or_(
                RawMaterialsCatalog.material_name.ilike(search_pattern),
                RawMaterialsCatalog.brand.ilike(search_pattern),
                RawMaterialsCatalog.description.ilike(search_pattern),
                RawMaterialsCatalog.category.ilike(search_pattern)
            )
        )

        # Filter by active status
        if active_only:
            query = query.filter(RawMaterialsCatalog.is_active == True)

        # Order by relevance (exact matches first, then partial)
        query = query.order_by(
            func.length(RawMaterialsCatalog.material_name).asc(),
            RawMaterialsCatalog.material_name.asc()
        )

        # Limit results
        materials = query.limit(limit).all()

        return jsonify({
            'success': True,
            'materials': [material.to_dict() for material in materials],
            'total_count': len(materials),
            'search_query': search_query
        }), 200

    except Exception as e:
        log.error(f"Error searching raw materials: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to search raw materials',
            'message': str(e)
        }), 500


def create_raw_material():
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

    Returns:
    - material: Created material object
    """
    try:
        # Check if g.user exists (should be set by JWT middleware)
        if not hasattr(g, 'user') or g.user is None:
            log.error("g.user not found - JWT middleware may not have run")
            return jsonify({
                'success': False,
                'error': 'Authentication error',
                'message': 'User session not found. Please log out and log in again.'
            }), 401

        # Get current user from g.user (set by JWT middleware)
        current_user = g.user
        user_id = current_user.get('user_id')

        # Try multiple keys for role (JWT middleware sets both 'role' and 'role_name')
        # Use 'or' to handle None values, not just missing keys
        user_role = current_user.get('role') or current_user.get('role_name') or ''

        # Debug logging - show all available keys and values in g.user
        log.info(f"Create raw material - g.user keys: {list(current_user.keys())}")
        log.info(f"Create raw material - g.user full data: {current_user}")
        log.info(f"Create raw material - User role: '{user_role}', User ID: {user_id}")

        # If role is empty, provide helpful error message
        if not user_role:
            log.warning(f"User role is empty or None. Full g.user data: {current_user}")
            return jsonify({
                'success': False,
                'error': 'Authentication error',
                'message': 'User role not found in session. Please log out and log in again to refresh your session.'
            }), 401

        # Check user role authorization
        if not can_manage_raw_materials(user_role):
            log.warning(f"Unauthorized access attempt by role: '{user_role}'")
            return jsonify({
                'success': False,
                'error': 'Unauthorized',
                'message': f'Only Buyer and Admin roles can create raw materials. Your role: {user_role}'
            }), 403

        # Get request data
        data = request.get_json()

        # Validate required fields
        if not data.get('material_name'):
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'Material name is required'
            }), 400

        # Validate user ID
        if not user_id:
            return jsonify({
                'success': False,
                'error': 'Authentication error',
                'message': 'User ID not found in session'
            }), 401

        # Create new material
        material_data = {
            'material_name': data.get('material_name'),
            'description': data.get('description'),
            'brand': data.get('brand'),
            'size': data.get('size'),
            'specification': data.get('specification'),
            'unit': data.get('unit'),
            'category': data.get('category'),
            'created_by': user_id,
            'is_active': True
        }

        # Add unit_price only if column exists (migration has run)
        if hasattr(RawMaterialsCatalog, 'unit_price'):
            material_data['unit_price'] = data.get('unit_price', 0.0)

        new_material = RawMaterialsCatalog(**material_data)

        db.session.add(new_material)
        db.session.commit()

        # Refresh the object to load relationships
        db.session.refresh(new_material)

        log.info(f"Raw material created: {new_material.id} - {new_material.material_name} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Raw material created successfully',
            'material': new_material.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating raw material: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create raw material',
            'message': str(e)
        }), 500


def update_raw_material(material_id):
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

    Returns:
    - material: Updated material object
    """
    try:
        # Check if g.user exists (should be set by JWT middleware)
        if not hasattr(g, 'user') or g.user is None:
            return jsonify({
                'success': False,
                'error': 'Authentication error',
                'message': 'User session not found. Please log out and log in again.'
            }), 401

        # Get current user from g.user (set by JWT middleware)
        current_user = g.user
        user_id = current_user.get('user_id')

        # Try multiple keys for role (JWT middleware sets both 'role' and 'role_name')
        user_role = current_user.get('role') or current_user.get('role_name') or ''

        # If role is empty, provide helpful error message
        if not user_role:
            log.warning(f"Update: User role is empty. g.user data: {current_user}")
            return jsonify({
                'success': False,
                'error': 'Authentication error',
                'message': 'User role not found in session. Please log out and log in again to refresh your session.'
            }), 401

        # Check user role authorization
        if not can_manage_raw_materials(user_role):
            return jsonify({
                'success': False,
                'error': 'Unauthorized',
                'message': 'Only Buyer and Admin roles can update raw materials'
            }), 403

        # Find material
        material = RawMaterialsCatalog.query.get(material_id)

        if not material:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': f'Raw material with ID {material_id} not found'
            }), 404

        # Get request data
        data = request.get_json()

        # Update fields if provided
        if 'material_name' in data:
            material.material_name = data['material_name']
        if 'description' in data:
            material.description = data['description']
        if 'brand' in data:
            material.brand = data['brand']
        if 'size' in data:
            material.size = data['size']
        if 'specification' in data:
            material.specification = data['specification']
        if 'unit' in data:
            material.unit = data['unit']
        if 'category' in data:
            material.category = data['category']
        if 'unit_price' in data and hasattr(material, 'unit_price'):
            material.unit_price = data['unit_price']
        if 'is_active' in data:
            material.is_active = data['is_active']

        db.session.commit()

        # Refresh the object to load relationships
        db.session.refresh(material)

        log.info(f"Raw material updated: {material.id} - {material.material_name} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Raw material updated successfully',
            'material': material.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating raw material {material_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update raw material',
            'message': str(e)
        }), 500


def delete_raw_material(material_id):
    """
    DELETE /api/raw-materials/<material_id>

    Soft delete a raw material from the catalog.
    Only accessible by Buyer and Admin roles.
    Sets is_active to False instead of actually deleting the record.

    Returns:
    - message: Success message
    """
    try:
        # Check if g.user exists (should be set by JWT middleware)
        if not hasattr(g, 'user') or g.user is None:
            return jsonify({
                'success': False,
                'error': 'Authentication error',
                'message': 'User session not found. Please log out and log in again.'
            }), 401

        # Get current user from g.user (set by JWT middleware)
        current_user = g.user
        user_id = current_user.get('user_id')

        # Try multiple keys for role (JWT middleware sets both 'role' and 'role_name')
        user_role = current_user.get('role') or current_user.get('role_name') or ''

        # If role is empty, provide helpful error message
        if not user_role:
            log.warning(f"Delete: User role is empty. g.user data: {current_user}")
            return jsonify({
                'success': False,
                'error': 'Authentication error',
                'message': 'User role not found in session. Please log out and log in again to refresh your session.'
            }), 401

        # Check user role authorization
        if not can_manage_raw_materials(user_role):
            return jsonify({
                'success': False,
                'error': 'Unauthorized',
                'message': 'Only Buyer and Admin roles can delete raw materials'
            }), 403

        # Find material
        material = RawMaterialsCatalog.query.get(material_id)

        if not material:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': f'Raw material with ID {material_id} not found'
            }), 404

        # Soft delete by setting is_active to False
        material.is_active = False
        db.session.commit()

        log.info(f"Raw material soft deleted: {material.id} - {material.material_name} by user {user_id}")

        return jsonify({
            'success': True,
            'message': 'Raw material deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting raw material {material_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete raw material',
            'message': str(e)
        }), 500


def get_material_categories():
    """
    GET /api/raw-materials/categories

    Get all unique material categories in the catalog.
    Useful for filtering and dropdown lists.

    Returns:
    - categories: List of unique category names
    """
    try:
        categories = db.session.query(RawMaterialsCatalog.category)\
            .filter(
                and_(
                    RawMaterialsCatalog.is_active == True,
                    RawMaterialsCatalog.category.isnot(None),
                    RawMaterialsCatalog.category != ''
                )
            )\
            .distinct()\
            .order_by(RawMaterialsCatalog.category.asc())\
            .all()

        category_list = [cat[0] for cat in categories]

        return jsonify({
            'success': True,
            'categories': category_list,
            'total_count': len(category_list)
        }), 200

    except Exception as e:
        log.error(f"Error fetching material categories: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch categories',
            'message': str(e)
        }), 500
