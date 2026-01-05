"""
Asset Controller - Handles all Returnable Assets operations
Including categories, items, dispatch, return, and maintenance management.
"""

from flask import jsonify, request, g, current_app
from config.db import db
from sqlalchemy.orm import joinedload
from models.returnable_assets import (
    ReturnableAssetCategory,
    ReturnableAssetItem,
    AssetMovement,
    AssetMaintenance,
    AssetReturnRequest
)
from models.project import Project
from models.user import User
from datetime import datetime
from utils.comprehensive_notification_service import ComprehensiveNotificationService


# ==================== CONSTANTS ====================

RECENT_MOVEMENTS_LIMIT = 10
VALID_TRACKING_MODES = ['individual', 'quantity']
VALID_CONDITIONS = ['good', 'fair', 'poor', 'damaged']
VALID_STATUSES = ['available', 'dispatched', 'maintenance', 'retired']
VALID_MAINTENANCE_ACTIONS = ['repair', 'write_off', 'in_progress']
DAMAGED_CONDITIONS = ['damaged', 'poor']


# ==================== HELPER FUNCTIONS ====================

def validate_positive_integer(value, field_name):
    """
    Validate that a value is a positive integer.

    Args:
        value: The value to validate
        field_name: Name of the field for error messages

    Returns:
        tuple: (is_valid: bool, error_message: str or None)
    """
    if value is None:
        return False, f'{field_name} is required'
    if not isinstance(value, int) or value <= 0:
        return False, f'{field_name} must be a positive integer'
    return True, None


def validate_non_negative_integer(value, field_name):
    """
    Validate that a value is a non-negative integer.

    Args:
        value: The value to validate
        field_name: Name of the field for error messages

    Returns:
        tuple: (is_valid: bool, error_message: str or None)
    """
    if value is None:
        return True, None  # Optional field
    if not isinstance(value, int) or value < 0:
        return False, f'{field_name} must be a non-negative integer'
    return True, None


def generate_category_code(category_name):
    """
    Generate a unique category code from the category name.
    Takes the first 3 letters and adds a number if the code already exists.

    Args:
        category_name: The name of the category

    Returns:
        str: A unique category code (e.g., 'LAD', 'LAD2', 'LAD3')
    """
    if not category_name:
        return "AST"

    base_code = category_name[:3].upper()

    existing = ReturnableAssetCategory.query.filter(
        ReturnableAssetCategory.category_code.like(f"{base_code}%")
    ).count()

    if existing == 0:
        return base_code
    return f"{base_code}{existing + 1}"


def generate_item_code(category_code):
    """
    Generate a unique item code for an individual asset.
    Format: CATEGORY_CODE-XXX (e.g., LAD-001, LAD-002)

    Args:
        category_code: The category code to use as prefix

    Returns:
        str: A unique item code
    """
    count = ReturnableAssetItem.query.join(ReturnableAssetCategory).filter(
        ReturnableAssetCategory.category_code == category_code
    ).count()

    return f"{category_code}-{count + 1:03d}"


def enrich_project_details(project):
    """
    Convert a Project model to a dictionary with essential details.

    Args:
        project: A Project model instance

    Returns:
        dict: Project details or None if project is None
    """
    if not project:
        return None
    return {
        'project_id': project.project_id,
        'project_name': project.project_name,
        'project_code': project.project_code,
        'location': project.location
    }


def get_user_name(user_id):
    """
    Get the full name of a user by their ID.

    Args:
        user_id: The user's ID

    Returns:
        str: The user's full name, or None if not found
    """
    try:
        user = User.query.get(user_id)
        return user.full_name if user else None
    except Exception as e:
        current_app.logger.error(f"Error fetching user {user_id}: {e}")
        return None


def batch_load_projects(project_ids):
    """
    Load multiple projects in a single query to avoid N+1 queries.

    Args:
        project_ids: List of project IDs to load

    Returns:
        dict: Mapping of project_id to Project model
    """
    if not project_ids:
        return {}

    unique_ids = list(set(pid for pid in project_ids if pid))
    if not unique_ids:
        return {}

    projects = Project.query.filter(Project.project_id.in_(unique_ids)).all()
    return {p.project_id: p for p in projects}


def batch_load_categories(category_ids):
    """
    Load multiple categories in a single query to avoid N+1 queries.

    Args:
        category_ids: List of category IDs to load

    Returns:
        dict: Mapping of category_id to ReturnableAssetCategory model
    """
    if not category_ids:
        return {}

    unique_ids = list(set(cid for cid in category_ids if cid))
    if not unique_ids:
        return {}

    categories = ReturnableAssetCategory.query.filter(
        ReturnableAssetCategory.category_id.in_(unique_ids)
    ).all()
    return {c.category_id: c for c in categories}


def get_dispatched_quantity_for_project(category_id, project_id):
    """
    Calculate how many items are currently dispatched to a specific project.

    Args:
        category_id: The category ID
        project_id: The project ID

    Returns:
        int: Number of items currently dispatched to the project
    """
    result = db.session.query(
        db.func.coalesce(
            db.func.sum(db.case(
                (AssetMovement.movement_type == 'DISPATCH', AssetMovement.quantity),
                else_=0
            )), 0
        ) - db.func.coalesce(
            db.func.sum(db.case(
                (AssetMovement.movement_type == 'RETURN', AssetMovement.quantity),
                else_=0
            )), 0
        )
    ).filter(
        AssetMovement.category_id == category_id,
        AssetMovement.project_id == project_id
    ).scalar()

    return result or 0


# ==================== CATEGORY APIs ====================

def create_asset_category():
    """Create a new asset category"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        current_user = g.user.get('email', 'system')

        # Validate required fields
        category_name = data.get('category_name')
        if not category_name or not isinstance(category_name, str) or not category_name.strip():
            return jsonify({'error': 'category_name is required and must be a non-empty string'}), 400

        # Generate or use provided category code
        category_code = data.get('category_code')
        if not category_code:
            category_code = generate_category_code(category_name)
        else:
            if not isinstance(category_code, str):
                return jsonify({'error': 'category_code must be a string'}), 400
            category_code = category_code.upper().strip()
            existing = ReturnableAssetCategory.query.filter_by(category_code=category_code).first()
            if existing:
                return jsonify({'error': f'Category code {category_code} already exists'}), 400

        # Validate tracking mode
        tracking_mode = data.get('tracking_mode', 'quantity')
        if tracking_mode not in VALID_TRACKING_MODES:
            return jsonify({'error': f'tracking_mode must be one of: {", ".join(VALID_TRACKING_MODES)}'}), 400

        # Validate total_quantity
        total_quantity = data.get('total_quantity', 0)
        is_valid, error = validate_non_negative_integer(total_quantity, 'total_quantity')
        if not is_valid:
            return jsonify({'error': error}), 400

        # Validate unit_price
        unit_price = data.get('unit_price', 0)
        if unit_price is not None and (not isinstance(unit_price, (int, float)) or unit_price < 0):
            return jsonify({'error': 'unit_price must be a non-negative number'}), 400

        new_category = ReturnableAssetCategory(
            category_code=category_code,
            category_name=category_name.strip(),
            description=data.get('description'),
            tracking_mode=tracking_mode,
            total_quantity=total_quantity,
            available_quantity=total_quantity,  # Initially all available
            unit_price=unit_price,
            image_url=data.get('image_url'),
            created_by=current_user,
            last_modified_by=current_user
        )

        db.session.add(new_category)
        db.session.commit()

        return jsonify({
            'message': 'Asset category created successfully',
            'category': new_category.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating asset category: {e}")
        return jsonify({'error': str(e)}), 500


def get_all_asset_categories():
    """Get all asset categories with optional filters"""
    try:
        query = ReturnableAssetCategory.query

        # Filters
        if request.args.get('active_only', 'true').lower() == 'true':
            query = query.filter_by(is_active=True)

        tracking_mode = request.args.get('tracking_mode')
        if tracking_mode and tracking_mode in VALID_TRACKING_MODES:
            query = query.filter_by(tracking_mode=tracking_mode)

        search = request.args.get('search')
        if search:
            search_term = f'%{search}%'
            query = query.filter(
                db.or_(
                    ReturnableAssetCategory.category_name.ilike(search_term),
                    ReturnableAssetCategory.category_code.ilike(search_term)
                )
            )

        categories = query.order_by(ReturnableAssetCategory.category_name).all()

        return jsonify({
            'categories': [cat.to_dict() for cat in categories],
            'total': len(categories)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching asset categories: {e}")
        return jsonify({'error': str(e)}), 500


def get_asset_category_by_id(category_id):
    """Get single asset category with details"""
    try:
        category = ReturnableAssetCategory.query.get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        result = category.to_dict()

        # Add items list for individual tracking
        if category.tracking_mode == 'individual':
            items = ReturnableAssetItem.query.filter_by(
                category_id=category_id,
                is_active=True
            ).all()
            result['items'] = [item.to_dict() for item in items]

        # Add recent movements with batch-loaded projects
        movements = AssetMovement.query.filter_by(
            category_id=category_id
        ).order_by(AssetMovement.created_at.desc()).limit(RECENT_MOVEMENTS_LIMIT).all()

        project_ids = [m.project_id for m in movements]
        projects_map = batch_load_projects(project_ids)

        movements_list = []
        for m in movements:
            m_dict = m.to_dict()
            project = projects_map.get(m.project_id)
            m_dict['project_details'] = enrich_project_details(project)
            movements_list.append(m_dict)

        result['recent_movements'] = movements_list

        return jsonify(result), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching asset category {category_id}: {e}")
        return jsonify({'error': str(e)}), 500


def update_asset_category(category_id):
    """Update asset category"""
    try:
        # Use SELECT FOR UPDATE to prevent race conditions
        category = ReturnableAssetCategory.query.with_for_update().get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        current_user = g.user.get('email', 'system')

        # Update fields with validation
        if 'category_name' in data:
            if not isinstance(data['category_name'], str) or not data['category_name'].strip():
                return jsonify({'error': 'category_name must be a non-empty string'}), 400
            category.category_name = data['category_name'].strip()

        if 'description' in data:
            category.description = data['description']

        if 'unit_price' in data:
            unit_price = data['unit_price']
            if unit_price is not None and (not isinstance(unit_price, (int, float)) or unit_price < 0):
                return jsonify({'error': 'unit_price must be a non-negative number'}), 400
            category.unit_price = unit_price

        if 'image_url' in data:
            category.image_url = data['image_url']

        if 'is_active' in data:
            if not isinstance(data['is_active'], bool):
                return jsonify({'error': 'is_active must be a boolean'}), 400
            category.is_active = data['is_active']

        # Update quantity only for quantity mode
        if category.tracking_mode == 'quantity' and 'total_quantity' in data:
            new_total = data['total_quantity']
            is_valid, error = validate_non_negative_integer(new_total, 'total_quantity')
            if not is_valid:
                return jsonify({'error': error}), 400

            old_total = category.total_quantity or 0
            diff = new_total - old_total
            category.total_quantity = new_total
            category.available_quantity = max(0, (category.available_quantity or 0) + diff)

        category.last_modified_by = current_user
        category.last_modified_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            'message': 'Category updated successfully',
            'category': category.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating asset category {category_id}: {e}")
        return jsonify({'error': str(e)}), 500


def delete_asset_category(category_id):
    """Delete/deactivate asset category"""
    try:
        category = ReturnableAssetCategory.query.get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        # Check for active movements
        active_dispatches = AssetMovement.query.filter_by(
            category_id=category_id,
            movement_type='DISPATCH',
            returned_at=None
        ).count()

        if active_dispatches > 0:
            return jsonify({
                'error': f'Cannot delete category with {active_dispatches} assets still dispatched'
            }), 400

        # Soft delete
        category.is_active = False
        category.last_modified_by = g.user.get('email', 'system')
        category.last_modified_at = datetime.utcnow()

        db.session.commit()

        return jsonify({'message': 'Category deactivated successfully'}), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting asset category {category_id}: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== ITEM APIs (Individual Tracking) ====================

def create_asset_item():
    """Create a new individual asset item"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        current_user = g.user.get('email', 'system')

        # Validate category_id
        category_id = data.get('category_id')
        is_valid, error = validate_positive_integer(category_id, 'category_id')
        if not is_valid:
            return jsonify({'error': error}), 400

        # Use SELECT FOR UPDATE to prevent race conditions on category
        category = ReturnableAssetCategory.query.with_for_update().get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        if category.tracking_mode != 'individual':
            return jsonify({'error': 'Category does not use individual tracking'}), 400

        # Generate item code
        item_code = data.get('item_code')
        if not item_code:
            item_code = generate_item_code(category.category_code)
        else:
            if not isinstance(item_code, str):
                return jsonify({'error': 'item_code must be a string'}), 400
            existing = ReturnableAssetItem.query.filter_by(item_code=item_code).first()
            if existing:
                return jsonify({'error': f'Item code {item_code} already exists'}), 400

        # Validate condition
        current_condition = data.get('current_condition', 'good')
        if current_condition not in VALID_CONDITIONS:
            return jsonify({'error': f'current_condition must be one of: {", ".join(VALID_CONDITIONS)}'}), 400

        # Validate purchase_price
        purchase_price = data.get('purchase_price')
        if purchase_price is not None and (not isinstance(purchase_price, (int, float)) or purchase_price < 0):
            return jsonify({'error': 'purchase_price must be a non-negative number'}), 400

        # Parse purchase_date
        purchase_date = None
        if data.get('purchase_date'):
            try:
                purchase_date = datetime.strptime(data['purchase_date'], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({'error': 'purchase_date must be in YYYY-MM-DD format'}), 400

        new_item = ReturnableAssetItem(
            category_id=category_id,
            item_code=item_code,
            serial_number=data.get('serial_number'),
            purchase_date=purchase_date,
            purchase_price=purchase_price,
            current_condition=current_condition,
            current_status='available',
            notes=data.get('notes'),
            created_by=current_user,
            last_modified_by=current_user
        )

        db.session.add(new_item)

        # Update category totals
        category.total_quantity = (category.total_quantity or 0) + 1
        category.available_quantity = (category.available_quantity or 0) + 1

        db.session.commit()

        return jsonify({
            'message': 'Asset item created successfully',
            'item': new_item.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating asset item: {e}")
        return jsonify({'error': str(e)}), 500


def get_all_asset_items():
    """Get all individual asset items with filters"""
    try:
        query = ReturnableAssetItem.query.options(
            joinedload(ReturnableAssetItem.category)
        )

        # Filters
        category_id = request.args.get('category_id')
        if category_id:
            try:
                query = query.filter_by(category_id=int(category_id))
            except ValueError:
                pass

        status = request.args.get('status')
        if status and status in VALID_STATUSES:
            query = query.filter_by(current_status=status)

        condition = request.args.get('condition')
        if condition and condition in VALID_CONDITIONS:
            query = query.filter_by(current_condition=condition)

        project_id = request.args.get('project_id')
        if project_id:
            try:
                query = query.filter_by(current_project_id=int(project_id))
            except ValueError:
                pass

        if request.args.get('active_only', 'true').lower() == 'true':
            query = query.filter_by(is_active=True)

        items = query.order_by(ReturnableAssetItem.item_code).all()

        # Batch load projects to avoid N+1 queries
        project_ids = [item.current_project_id for item in items if item.current_project_id]
        projects_map = batch_load_projects(project_ids)

        result = []
        for item in items:
            item_dict = item.to_dict()
            if item.current_project_id:
                project = projects_map.get(item.current_project_id)
                item_dict['project_details'] = enrich_project_details(project)
            result.append(item_dict)

        return jsonify({
            'items': result,
            'total': len(result)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching asset items: {e}")
        return jsonify({'error': str(e)}), 500


def get_asset_item_by_id(item_id):
    """Get single asset item with full history"""
    try:
        item = ReturnableAssetItem.query.options(
            joinedload(ReturnableAssetItem.category)
        ).get(item_id)

        if not item:
            return jsonify({'error': 'Item not found'}), 404

        result = item.to_dict()

        # Get all movements for this item
        movements = AssetMovement.query.filter_by(
            item_id=item_id
        ).order_by(AssetMovement.created_at.desc()).all()

        # Batch load projects
        project_ids = [m.project_id for m in movements]
        if item.current_project_id:
            project_ids.append(item.current_project_id)
        projects_map = batch_load_projects(project_ids)

        # Add current project details
        if item.current_project_id:
            project = projects_map.get(item.current_project_id)
            result['project_details'] = enrich_project_details(project)

        # Add movement history with project details
        movement_history = []
        for m in movements:
            m_dict = m.to_dict()
            project = projects_map.get(m.project_id)
            m_dict['project_details'] = enrich_project_details(project)
            movement_history.append(m_dict)

        result['movement_history'] = movement_history

        # Add maintenance history
        maintenance = AssetMaintenance.query.filter_by(
            item_id=item_id
        ).order_by(AssetMaintenance.created_at.desc()).all()
        result['maintenance_history'] = [m.to_dict() for m in maintenance]

        return jsonify(result), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching asset item {item_id}: {e}")
        return jsonify({'error': str(e)}), 500


def update_asset_item(item_id):
    """Update asset item details"""
    try:
        item = ReturnableAssetItem.query.get(item_id)
        if not item:
            return jsonify({'error': 'Item not found'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        current_user = g.user.get('email', 'system')

        # Update fields with validation
        if 'serial_number' in data:
            item.serial_number = data['serial_number']

        if 'purchase_date' in data:
            if data['purchase_date']:
                try:
                    item.purchase_date = datetime.strptime(data['purchase_date'], '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({'error': 'purchase_date must be in YYYY-MM-DD format'}), 400
            else:
                item.purchase_date = None

        if 'purchase_price' in data:
            purchase_price = data['purchase_price']
            if purchase_price is not None and (not isinstance(purchase_price, (int, float)) or purchase_price < 0):
                return jsonify({'error': 'purchase_price must be a non-negative number'}), 400
            item.purchase_price = purchase_price

        if 'current_condition' in data:
            if data['current_condition'] not in VALID_CONDITIONS:
                return jsonify({'error': f'current_condition must be one of: {", ".join(VALID_CONDITIONS)}'}), 400
            item.current_condition = data['current_condition']

        if 'notes' in data:
            item.notes = data['notes']

        item.last_modified_by = current_user
        item.last_modified_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            'message': 'Item updated successfully',
            'item': item.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating asset item {item_id}: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== DISPATCH APIs ====================

def dispatch_asset():
    """Dispatch asset(s) to a project"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        current_user = g.user.get('email', 'system')

        # Validate required fields
        category_id = data.get('category_id')
        is_valid, error = validate_positive_integer(category_id, 'category_id')
        if not is_valid:
            return jsonify({'error': error}), 400

        project_id = data.get('project_id')
        is_valid, error = validate_positive_integer(project_id, 'project_id')
        if not is_valid:
            return jsonify({'error': error}), 400

        # Use SELECT FOR UPDATE to prevent race conditions
        category = ReturnableAssetCategory.query.with_for_update().get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        project = Project.query.get(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        movements_created = []

        if category.tracking_mode == 'individual':
            # Individual tracking - dispatch specific items
            item_ids = data.get('item_ids', [])
            if not item_ids or not isinstance(item_ids, list):
                return jsonify({'error': 'item_ids required for individual tracking (must be a list)'}), 400

            # Validate all item_ids are integers
            for item_id in item_ids:
                if not isinstance(item_id, int) or item_id <= 0:
                    return jsonify({'error': 'All item_ids must be positive integers'}), 400

            for item_id in item_ids:
                item = ReturnableAssetItem.query.with_for_update().get(item_id)
                if not item:
                    return jsonify({'error': f'Item with ID {item_id} not found'}), 404
                if item.category_id != category_id:
                    return jsonify({'error': f'Item {item.item_code} does not belong to this category'}), 400
                if item.current_status != 'available':
                    return jsonify({'error': f'Item {item.item_code} is not available (status: {item.current_status})'}), 400

                # Create movement
                movement = AssetMovement(
                    category_id=category_id,
                    item_id=item_id,
                    movement_type='DISPATCH',
                    project_id=project_id,
                    quantity=1,
                    condition_before=item.current_condition,
                    dispatched_by=current_user,
                    dispatched_at=datetime.utcnow(),
                    reference_number=data.get('reference_number'),
                    notes=data.get('notes'),
                    created_by=current_user
                )
                db.session.add(movement)

                # Update item status
                item.current_status = 'dispatched'
                item.current_project_id = project_id
                item.last_modified_by = current_user

                movements_created.append(movement)

            # Update category available count
            category.available_quantity = max(0, (category.available_quantity or 0) - len(item_ids))

        else:
            # Quantity tracking
            quantity = data.get('quantity', 1)
            is_valid, error = validate_positive_integer(quantity, 'quantity')
            if not is_valid:
                return jsonify({'error': error}), 400

            available = category.available_quantity or 0
            if quantity > available:
                return jsonify({
                    'error': f'Not enough available. Requested: {quantity}, Available: {available}'
                }), 400

            # Validate condition if provided
            condition = data.get('condition', 'good')
            if condition not in VALID_CONDITIONS:
                return jsonify({'error': f'condition must be one of: {", ".join(VALID_CONDITIONS)}'}), 400

            # Create movement
            movement = AssetMovement(
                category_id=category_id,
                item_id=None,
                movement_type='DISPATCH',
                project_id=project_id,
                quantity=quantity,
                condition_before=condition,
                dispatched_by=current_user,
                dispatched_at=datetime.utcnow(),
                reference_number=data.get('reference_number'),
                notes=data.get('notes'),
                created_by=current_user
            )
            db.session.add(movement)
            movements_created.append(movement)

            # Update category
            category.available_quantity = available - quantity

        category.last_modified_by = current_user
        db.session.commit()

        # Send notification to Site Engineers assigned to this project
        try:
            # Get SE user IDs from project
            se_user_ids = []
            if project.site_supervisor_id:
                if isinstance(project.site_supervisor_id, list):
                    se_user_ids = project.site_supervisor_id
                else:
                    se_user_ids = [project.site_supervisor_id]

            if se_user_ids:
                # Get item codes for individual tracking
                item_codes = None
                if category.tracking_mode == 'individual':
                    item_codes = [ReturnableAssetItem.query.get(iid).item_code for iid in data.get('item_ids', [])]

                dispatched_qty = len(item_codes) if item_codes else quantity if 'quantity' in dir() else 1

                ComprehensiveNotificationService.notify_asset_dispatched(
                    project_id=project_id,
                    project_name=project.project_name,
                    category_name=category.category_name,
                    category_code=category.category_code,
                    quantity=dispatched_qty,
                    dispatched_by_name=get_user_name(g.user.get('user_id')) or current_user,
                    se_user_ids=se_user_ids,
                    notes=data.get('notes'),
                    item_codes=item_codes
                )
        except Exception as notify_error:
            current_app.logger.error(f"Error sending dispatch notification: {notify_error}")

        return jsonify({
            'message': 'Assets dispatched successfully',
            'movements': [m.to_dict() for m in movements_created],
            'category': category.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error dispatching asset: {e}")
        return jsonify({'error': str(e)}), 500


def get_dispatched_assets():
    """Get all currently dispatched assets"""
    try:
        # For individual items - use eager loading
        dispatched_items = ReturnableAssetItem.query.options(
            joinedload(ReturnableAssetItem.category)
        ).filter_by(
            current_status='dispatched',
            is_active=True
        ).all()

        # Collect all unique project IDs
        project_ids = set(item.current_project_id for item in dispatched_items if item.current_project_id)

        # For quantity tracking - get unreturned movements
        quantity_movements = db.session.query(
            AssetMovement.category_id,
            AssetMovement.project_id,
            db.func.sum(
                db.case(
                    (AssetMovement.movement_type == 'DISPATCH', AssetMovement.quantity),
                    else_=0
                )
            ).label('dispatched'),
            db.func.sum(
                db.case(
                    (AssetMovement.movement_type == 'RETURN', AssetMovement.quantity),
                    else_=0
                )
            ).label('returned')
        ).join(ReturnableAssetCategory).filter(
            ReturnableAssetCategory.tracking_mode == 'quantity'
        ).group_by(
            AssetMovement.category_id,
            AssetMovement.project_id
        ).all()

        # Add project IDs from quantity movements
        for mov in quantity_movements:
            if (mov.dispatched or 0) - (mov.returned or 0) > 0:
                project_ids.add(mov.project_id)

        # Batch load all projects
        projects_map = batch_load_projects(list(project_ids))

        # Batch load categories for quantity movements
        category_ids = [mov.category_id for mov in quantity_movements]
        categories_map = batch_load_categories(category_ids)

        # Group by project
        by_project = {}

        for item in dispatched_items:
            pid = item.current_project_id
            if pid not in by_project:
                project = projects_map.get(pid)
                by_project[pid] = {
                    'project': enrich_project_details(project),
                    'items': [],
                    'quantity_assets': []
                }
            by_project[pid]['items'].append(item.to_dict())

        # Get received info for quantity assets
        received_info = {}
        dispatch_movements = AssetMovement.query.filter(
            AssetMovement.movement_type == 'DISPATCH'
        ).all()
        for dm in dispatch_movements:
            key = (dm.category_id, dm.project_id)
            existing = received_info.get(key)
            if not existing or (dm.received_at and (not existing.get('_received_at_raw') or dm.received_at > existing['_received_at_raw'])):
                received_info[key] = {
                    'received_at': dm.received_at.isoformat() if dm.received_at else None,
                    '_received_at_raw': dm.received_at,  # Keep raw datetime for comparison
                    'received_by': dm.received_by,
                    'dispatched_at': dm.dispatched_at.isoformat() if dm.dispatched_at else None,
                    'dispatched_by': dm.dispatched_by
                }

        for mov in quantity_movements:
            outstanding = (mov.dispatched or 0) - (mov.returned or 0)
            if outstanding > 0:
                pid = mov.project_id
                if pid not in by_project:
                    project = projects_map.get(pid)
                    by_project[pid] = {
                        'project': enrich_project_details(project),
                        'items': [],
                        'quantity_assets': []
                    }

                category = categories_map.get(mov.category_id)
                recv_info = received_info.get((mov.category_id, pid), {})
                by_project[pid]['quantity_assets'].append({
                    'category_id': mov.category_id,
                    'category_code': category.category_code if category else None,
                    'category_name': category.category_name if category else None,
                    'quantity_dispatched': outstanding,
                    'dispatched_at': recv_info.get('dispatched_at'),
                    'dispatched_by': recv_info.get('dispatched_by'),
                    'received_at': recv_info.get('received_at'),
                    'received_by': recv_info.get('received_by'),
                    'is_received': recv_info.get('received_at') is not None
                })

        return jsonify({
            'dispatched_by_project': list(by_project.values()),
            'total_projects': len(by_project)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching dispatched assets: {e}")
        return jsonify({'error': str(e)}), 500


def get_assets_at_project(project_id):
    """Get all assets currently at a specific project"""
    try:
        project = Project.query.get(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        result = {
            'project': enrich_project_details(project),
            'individual_items': [],
            'quantity_assets': []
        }

        # Individual items with eager loading
        items = ReturnableAssetItem.query.options(
            joinedload(ReturnableAssetItem.category)
        ).filter_by(
            current_project_id=project_id,
            current_status='dispatched',
            is_active=True
        ).all()
        result['individual_items'] = [item.to_dict() for item in items]

        # Quantity assets
        quantity_movements = db.session.query(
            AssetMovement.category_id,
            db.func.sum(
                db.case(
                    (AssetMovement.movement_type == 'DISPATCH', AssetMovement.quantity),
                    else_=0
                )
            ).label('dispatched'),
            db.func.sum(
                db.case(
                    (AssetMovement.movement_type == 'RETURN', AssetMovement.quantity),
                    else_=0
                )
            ).label('returned')
        ).join(ReturnableAssetCategory).filter(
            AssetMovement.project_id == project_id,
            ReturnableAssetCategory.tracking_mode == 'quantity'
        ).group_by(AssetMovement.category_id).all()

        # Batch load categories
        category_ids = [mov.category_id for mov in quantity_movements]
        categories_map = batch_load_categories(category_ids)

        for mov in quantity_movements:
            outstanding = (mov.dispatched or 0) - (mov.returned or 0)
            if outstanding > 0:
                category = categories_map.get(mov.category_id)
                result['quantity_assets'].append({
                    'category_id': mov.category_id,
                    'category_code': category.category_code if category else None,
                    'category_name': category.category_name if category else None,
                    'quantity_at_site': outstanding
                })

        return jsonify(result), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching assets at project {project_id}: {e}")
        return jsonify({'error': str(e)}), 500


def get_my_site_assets():
    """Get all assets at projects assigned to the current Site Engineer"""
    try:
        user_id = g.user.get('user_id')
        if not user_id:
            return jsonify({'error': 'User not authenticated'}), 401

        # Get projects where this user is a site supervisor
        # 1. Direct assignment via Project.site_supervisor_id (integer)
        # 2. PM assignment via PMAssignSS.ss_ids (array)
        from models.pm_assign_ss import PMAssignSS

        # Get project IDs from PM assignments where user is in ss_ids array
        pm_assigned_project_ids = db.session.query(PMAssignSS.project_id).filter(
            PMAssignSS.ss_ids.any(user_id)
        ).distinct().all()
        pm_project_ids = [p[0] for p in pm_assigned_project_ids if p[0]]

        # Get projects either directly assigned or via PM assignment
        from sqlalchemy import or_
        my_projects = Project.query.filter(
            or_(
                Project.site_supervisor_id == user_id,
                Project.project_id.in_(pm_project_ids) if pm_project_ids else False
            )
        ).all()

        if not my_projects:
            return jsonify({
                'projects': [],
                'total_assets': 0,
                'message': 'No projects assigned to you'
            }), 200

        result = []
        total_items = 0
        total_quantity_assets = 0

        for project in my_projects:
            project_data = {
                'project': enrich_project_details(project),
                'individual_items': [],
                'quantity_assets': []
            }

            # Individual items at this project
            items = ReturnableAssetItem.query.options(
                joinedload(ReturnableAssetItem.category)
            ).filter_by(
                current_project_id=project.project_id,
                current_status='dispatched',
                is_active=True
            ).all()

            for item in items:
                item_dict = item.to_dict()
                if item.category:
                    item_dict['category_code'] = item.category.category_code
                    item_dict['category_name'] = item.category.category_name
                    item_dict['tracking_mode'] = item.category.tracking_mode
                project_data['individual_items'].append(item_dict)
                total_items += 1

            # Quantity assets at this project
            quantity_movements = db.session.query(
                AssetMovement.category_id,
                db.func.sum(
                    db.case(
                        (AssetMovement.movement_type == 'DISPATCH', AssetMovement.quantity),
                        else_=0
                    )
                ).label('dispatched'),
                db.func.sum(
                    db.case(
                        (AssetMovement.movement_type == 'RETURN', AssetMovement.quantity),
                        else_=0
                    )
                ).label('returned')
            ).join(ReturnableAssetCategory).filter(
                AssetMovement.project_id == project.project_id,
                ReturnableAssetCategory.tracking_mode == 'quantity'
            ).group_by(AssetMovement.category_id).all()

            # Batch load categories
            category_ids = [mov.category_id for mov in quantity_movements]
            categories_map = batch_load_categories(category_ids)

            for mov in quantity_movements:
                outstanding = (mov.dispatched or 0) - (mov.returned or 0)
                if outstanding > 0:
                    category = categories_map.get(mov.category_id)
                    project_data['quantity_assets'].append({
                        'category_id': mov.category_id,
                        'category_code': category.category_code if category else None,
                        'category_name': category.category_name if category else None,
                        'quantity_at_site': outstanding,
                        'tracking_mode': 'quantity'
                    })
                    total_quantity_assets += outstanding

            # Only include projects with assets
            if project_data['individual_items'] or project_data['quantity_assets']:
                result.append(project_data)

        return jsonify({
            'projects': result,
            'total_individual_items': total_items,
            'total_quantity_assets': total_quantity_assets,
            'total_projects_with_assets': len(result)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching site assets for user: {e}")
        return jsonify({'error': str(e)}), 500


def mark_asset_received():
    """SE marks dispatched asset as received - acknowledges receipt"""
    try:
        user_id = g.user.get('user_id')
        user_name = g.user.get('full_name', g.user.get('email', 'Unknown'))

        if not user_id:
            return jsonify({'error': 'User not authenticated'}), 401

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        movement_id = data.get('movement_id')
        is_valid, error = validate_positive_integer(movement_id, 'movement_id')
        if not is_valid:
            return jsonify({'error': error}), 400

        # Get the dispatch movement
        movement = AssetMovement.query.get(movement_id)
        if not movement:
            return jsonify({'error': 'Movement not found'}), 404

        if movement.movement_type != 'DISPATCH':
            return jsonify({'error': 'Can only mark dispatch movements as received'}), 400

        if movement.received_at:
            return jsonify({'error': 'This asset has already been marked as received'}), 400

        # Update the movement with received info
        movement.received_at = datetime.utcnow()
        movement.received_by = user_name
        movement.received_by_id = user_id

        db.session.commit()

        # Send notification to PM
        try:
            project = Project.query.get(movement.project_id)
            category = ReturnableAssetCategory.query.get(movement.category_id)

            ComprehensiveNotificationService.send_asset_received_notification(
                project_id=movement.project_id,
                project_name=project.project_name if project else 'Unknown',
                category_name=category.category_name if category else 'Unknown',
                quantity=movement.quantity,
                received_by=user_name,
                received_by_id=user_id
            )
        except Exception as notif_err:
            current_app.logger.error(f"Error sending received notification: {notif_err}")

        return jsonify({
            'message': 'Asset marked as received',
            'movement_id': movement_id,
            'received_at': movement.received_at.isoformat(),
            'received_by': movement.received_by
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error marking asset as received: {e}")
        return jsonify({'error': str(e)}), 500


def get_dispatched_movements_for_se():
    """Get all dispatch movements for SE's projects - only those still at site (not returned)"""
    try:
        user_id = g.user.get('user_id')
        if not user_id:
            return jsonify({'error': 'User not authenticated'}), 401

        # Get projects assigned to SE
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import or_

        pm_assigned_project_ids = db.session.query(PMAssignSS.project_id).filter(
            PMAssignSS.ss_ids.any(user_id)
        ).distinct().all()
        pm_project_ids = [p[0] for p in pm_assigned_project_ids if p[0]]

        my_projects = Project.query.filter(
            or_(
                Project.site_supervisor_id == user_id,
                Project.project_id.in_(pm_project_ids) if pm_project_ids else False
            )
        ).all()

        if not my_projects:
            return jsonify({'movements': []}), 200

        project_ids = [p.project_id for p in my_projects]

        # Get all DISPATCH movements for these projects
        dispatch_movements = AssetMovement.query.options(
            joinedload(AssetMovement.category),
            joinedload(AssetMovement.item)
        ).filter(
            AssetMovement.movement_type == 'DISPATCH',
            AssetMovement.project_id.in_(project_ids)
        ).order_by(AssetMovement.dispatched_at.desc()).all()

        # Get all RETURN movements for these projects to track what's been returned
        return_movements = AssetMovement.query.filter(
            AssetMovement.movement_type == 'RETURN',
            AssetMovement.project_id.in_(project_ids)
        ).all()

        # For individual tracking: build a set of returned item_ids
        returned_item_ids = set()
        # For quantity tracking: build a map of (category_id, project_id) -> total returned quantity
        returned_quantities = {}

        for ret_mov in return_movements:
            if ret_mov.item_id:
                # Individual tracking
                returned_item_ids.add(ret_mov.item_id)
            else:
                # Quantity tracking
                key = (ret_mov.category_id, ret_mov.project_id)
                returned_quantities[key] = returned_quantities.get(key, 0) + (ret_mov.quantity or 0)

        # Create a map of projects
        projects_map = {p.project_id: p for p in my_projects}

        # For quantity tracking: track dispatched quantities per (category_id, project_id)
        dispatched_quantities = {}

        result = []
        for mov in dispatch_movements:
            project = projects_map.get(mov.project_id)

            # For individual tracking: skip if this item has been returned
            if mov.item_id:
                if mov.item_id in returned_item_ids:
                    continue  # This item has been returned, don't show it

                mov_dict = mov.to_dict()
                mov_dict['project_name'] = project.project_name if project else None
                mov_dict['is_received'] = mov.received_at is not None
                result.append(mov_dict)
            else:
                # Quantity tracking: calculate remaining quantity at site
                key = (mov.category_id, mov.project_id)
                dispatched_qty = dispatched_quantities.get(key, 0) + (mov.quantity or 0)
                dispatched_quantities[key] = dispatched_qty

        # Get pending return requests for these projects
        pending_requests = AssetReturnRequest.query.filter(
            AssetReturnRequest.project_id.in_(project_ids),
            AssetReturnRequest.status == 'pending'
        ).all()

        # Build map of pending requests by (category_id, project_id)
        pending_request_map = {}
        for req in pending_requests:
            key = (req.category_id, req.project_id)
            if key not in pending_request_map:
                pending_request_map[key] = {
                    'has_pending_request': True,
                    'tracking_code': req.tracking_code,
                    'requested_at': req.requested_at.isoformat() if req.requested_at else None,
                    'pending_quantity': req.quantity
                }
            else:
                # Accumulate pending quantity
                pending_request_map[key]['pending_quantity'] += req.quantity

        # For quantity tracking: add entries for categories that still have quantity at site
        # We need to aggregate and only show if there's remaining quantity
        quantity_entries = {}
        for mov in dispatch_movements:
            if not mov.item_id:  # Quantity tracking
                key = (mov.category_id, mov.project_id)
                if key not in quantity_entries:
                    total_dispatched = sum(
                        m.quantity or 0 for m in dispatch_movements
                        if m.category_id == mov.category_id and m.project_id == mov.project_id and not m.item_id
                    )
                    total_returned = returned_quantities.get(key, 0)
                    remaining = total_dispatched - total_returned

                    if remaining > 0:
                        project = projects_map.get(mov.project_id)
                        mov_dict = mov.to_dict()
                        mov_dict['project_name'] = project.project_name if project else None
                        mov_dict['is_received'] = mov.received_at is not None
                        mov_dict['quantity'] = remaining  # Show remaining quantity
                        mov_dict['original_quantity'] = total_dispatched

                        # Add pending return request info
                        pending_info = pending_request_map.get(key, {})
                        mov_dict['has_pending_return'] = pending_info.get('has_pending_request', False)
                        mov_dict['pending_return_tracking'] = pending_info.get('tracking_code')
                        mov_dict['pending_return_at'] = pending_info.get('requested_at')
                        mov_dict['pending_return_quantity'] = pending_info.get('pending_quantity', 0)

                        quantity_entries[key] = mov_dict

        # Add quantity entries to result
        result.extend(quantity_entries.values())

        # Sort by dispatched_at desc
        result.sort(key=lambda x: x.get('dispatched_at', ''), reverse=True)

        return jsonify({'movements': result}), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching dispatched movements: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== RETURN APIs ====================

def return_asset():
    """Return asset(s) from a project"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        current_user = g.user.get('email', 'system')

        # Validate required fields
        category_id = data.get('category_id')
        is_valid, error = validate_positive_integer(category_id, 'category_id')
        if not is_valid:
            return jsonify({'error': error}), 400

        project_id = data.get('project_id')
        is_valid, error = validate_positive_integer(project_id, 'project_id')
        if not is_valid:
            return jsonify({'error': error}), 400

        # Validate condition
        condition_after = data.get('condition', 'good')
        if condition_after not in VALID_CONDITIONS:
            return jsonify({'error': f'condition must be one of: {", ".join(VALID_CONDITIONS)}'}), 400

        # Use SELECT FOR UPDATE to prevent race conditions
        category = ReturnableAssetCategory.query.with_for_update().get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        movements_created = []
        maintenance_created = []

        if category.tracking_mode == 'individual':
            # Return specific items
            item_ids = data.get('item_ids', [])
            if not item_ids or not isinstance(item_ids, list):
                return jsonify({'error': 'item_ids required for individual tracking (must be a list)'}), 400

            # Validate all item_ids are integers
            for item_id in item_ids:
                if not isinstance(item_id, int) or item_id <= 0:
                    return jsonify({'error': 'All item_ids must be positive integers'}), 400

            for item_id in item_ids:
                item = ReturnableAssetItem.query.with_for_update().get(item_id)
                if not item:
                    return jsonify({'error': f'Item with ID {item_id} not found'}), 404
                if item.current_status != 'dispatched':
                    return jsonify({'error': f'Item {item.item_code} is not dispatched (status: {item.current_status})'}), 400
                if item.current_project_id != project_id:
                    return jsonify({'error': f'Item {item.item_code} is not at the specified project'}), 400

                item_condition = data.get(f'condition_{item_id}', condition_after)
                if item_condition not in VALID_CONDITIONS:
                    item_condition = condition_after

                # Create return movement
                movement = AssetMovement(
                    category_id=category_id,
                    item_id=item_id,
                    movement_type='RETURN',
                    project_id=project_id,
                    quantity=1,
                    condition_before=item.current_condition,
                    condition_after=item_condition,
                    returned_by=current_user,
                    returned_at=datetime.utcnow(),
                    reference_number=data.get('reference_number'),
                    notes=data.get('notes'),
                    created_by=current_user
                )
                db.session.add(movement)
                movements_created.append(movement)

                # Update item
                item.current_condition = item_condition
                item.current_project_id = None
                item.last_modified_by = current_user

                # Handle damaged items
                if item_condition in DAMAGED_CONDITIONS:
                    item.current_status = 'maintenance'

                    # Create maintenance record
                    maint = AssetMaintenance(
                        category_id=category_id,
                        item_id=item_id,
                        quantity=1,
                        issue_description=data.get('damage_description', f'Returned in {item_condition} condition'),
                        reported_by=current_user,
                        status='pending',
                        created_by=current_user
                    )
                    db.session.add(maint)
                    maintenance_created.append(maint)
                else:
                    item.current_status = 'available'
                    category.available_quantity = (category.available_quantity or 0) + 1

        else:
            # Quantity tracking
            quantity = data.get('quantity', 1)
            is_valid, error = validate_positive_integer(quantity, 'quantity')
            if not is_valid:
                return jsonify({'error': error}), 400

            # Validate that return quantity doesn't exceed dispatched quantity
            dispatched_to_project = get_dispatched_quantity_for_project(category_id, project_id)
            if quantity > dispatched_to_project:
                return jsonify({
                    'error': f'Cannot return {quantity} items. Only {dispatched_to_project} dispatched to this project'
                }), 400

            # Validate damaged_quantity
            damaged_qty = data.get('damaged_quantity', 0)
            is_valid, error = validate_non_negative_integer(damaged_qty, 'damaged_quantity')
            if not is_valid:
                return jsonify({'error': error}), 400
            if damaged_qty > quantity:
                return jsonify({'error': 'damaged_quantity cannot exceed quantity'}), 400

            # Create return movement
            movement = AssetMovement(
                category_id=category_id,
                item_id=None,
                movement_type='RETURN',
                project_id=project_id,
                quantity=quantity,
                condition_before=data.get('condition_before'),
                condition_after=condition_after,
                returned_by=current_user,
                returned_at=datetime.utcnow(),
                reference_number=data.get('reference_number'),
                notes=data.get('notes'),
                created_by=current_user
            )
            db.session.add(movement)
            movements_created.append(movement)

            good_qty = quantity - damaged_qty

            if damaged_qty > 0:
                # Create maintenance record for damaged
                maint = AssetMaintenance(
                    category_id=category_id,
                    item_id=None,
                    quantity=damaged_qty,
                    issue_description=data.get('damage_description', 'Returned in damaged condition'),
                    reported_by=current_user,
                    status='pending',
                    created_by=current_user
                )
                db.session.add(maint)
                maintenance_created.append(maint)

            # Return good items to stock
            category.available_quantity = (category.available_quantity or 0) + good_qty

        category.last_modified_by = current_user
        db.session.commit()

        return jsonify({
            'message': 'Assets returned successfully',
            'movements': [m.to_dict() for m in movements_created],
            'maintenance_records': [m.to_dict() for m in maintenance_created],
            'category': category.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error returning asset: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== MAINTENANCE APIs ====================

def get_pending_maintenance():
    """Get all assets pending maintenance"""
    try:
        maintenance = AssetMaintenance.query.options(
            joinedload(AssetMaintenance.category),
            joinedload(AssetMaintenance.item)
        ).filter(
            AssetMaintenance.status.in_(['pending', 'in_progress'])
        ).order_by(AssetMaintenance.reported_at.desc()).all()

        result = []
        for m in maintenance:
            m_dict = m.to_dict()
            if m.category:
                m_dict['category'] = m.category.to_dict()
            result.append(m_dict)

        return jsonify({
            'maintenance_records': result,
            'total': len(result)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching pending maintenance: {e}")
        return jsonify({'error': str(e)}), 500


def update_maintenance(maintenance_id):
    """Update maintenance record (repair or write-off)"""
    try:
        maint = AssetMaintenance.query.get(maintenance_id)
        if not maint:
            return jsonify({'error': 'Maintenance record not found'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        current_user = g.user.get('email', 'system')
        action = data.get('action')

        if not action or action not in VALID_MAINTENANCE_ACTIONS:
            return jsonify({'error': f'action must be one of: {", ".join(VALID_MAINTENANCE_ACTIONS)}'}), 400

        # Use SELECT FOR UPDATE to prevent race conditions
        category = ReturnableAssetCategory.query.with_for_update().get(maint.category_id)

        if action == 'in_progress':
            maint.status = 'in_progress'

        elif action == 'repair':
            maint.status = 'completed'
            maint.repair_notes = data.get('repair_notes')

            repair_cost = data.get('repair_cost', 0)
            if repair_cost is not None and (not isinstance(repair_cost, (int, float)) or repair_cost < 0):
                return jsonify({'error': 'repair_cost must be a non-negative number'}), 400
            maint.repair_cost = repair_cost

            maint.repaired_by = current_user
            maint.repaired_at = datetime.utcnow()
            maint.returned_to_stock = True

            # Validate condition_after
            condition_after = data.get('condition_after', 'good')
            if condition_after not in VALID_CONDITIONS:
                return jsonify({'error': f'condition_after must be one of: {", ".join(VALID_CONDITIONS)}'}), 400

            # Return to stock
            if maint.item_id:
                item = ReturnableAssetItem.query.with_for_update().get(maint.item_id)
                if item:
                    item.current_status = 'available'
                    item.current_condition = condition_after
                    item.last_modified_by = current_user
                    if category:
                        category.available_quantity = (category.available_quantity or 0) + 1
            else:
                # Quantity mode
                if category:
                    category.available_quantity = (category.available_quantity or 0) + maint.quantity

        elif action == 'write_off':
            maint.status = 'written_off'
            maint.repair_notes = data.get('write_off_reason', 'Asset written off - beyond repair')
            maint.repaired_by = current_user
            maint.repaired_at = datetime.utcnow()
            maint.returned_to_stock = False

            # Update totals
            if maint.item_id:
                item = ReturnableAssetItem.query.with_for_update().get(maint.item_id)
                if item:
                    item.current_status = 'retired'
                    item.is_active = False
                    item.last_modified_by = current_user
                    if category:
                        category.total_quantity = max(0, (category.total_quantity or 0) - 1)
            else:
                # Quantity mode
                if category:
                    category.total_quantity = max(0, (category.total_quantity or 0) - maint.quantity)

        if category:
            category.last_modified_by = current_user

        db.session.commit()

        return jsonify({
            'message': f'Maintenance {action} completed',
            'maintenance': maint.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating maintenance {maintenance_id}: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== DASHBOARD/SUMMARY APIs ====================

def get_asset_dashboard():
    """Get asset dashboard summary"""
    try:
        # Category summary
        categories = ReturnableAssetCategory.query.filter_by(is_active=True).all()

        total_categories = len(categories)
        total_value = sum((c.total_quantity or 0) * (c.unit_price or 0) for c in categories)
        total_available = sum(c.available_quantity or 0 for c in categories)
        total_dispatched = sum((c.total_quantity or 0) - (c.available_quantity or 0) for c in categories)

        # Maintenance pending
        pending_maintenance = AssetMaintenance.query.filter(
            AssetMaintenance.status.in_(['pending', 'in_progress'])
        ).count()

        # Recent movements with batch-loaded projects
        recent_movements = AssetMovement.query.order_by(
            AssetMovement.created_at.desc()
        ).limit(RECENT_MOVEMENTS_LIMIT).all()

        project_ids = [m.project_id for m in recent_movements]
        projects_map = batch_load_projects(project_ids)

        movements_list = []
        for m in recent_movements:
            m_dict = m.to_dict()
            project = projects_map.get(m.project_id)
            m_dict['project_details'] = enrich_project_details(project)
            movements_list.append(m_dict)

        # Category breakdown
        category_breakdown = []
        for cat in categories:
            category_breakdown.append({
                'category_id': cat.category_id,
                'category_code': cat.category_code,
                'category_name': cat.category_name,
                'tracking_mode': cat.tracking_mode,
                'total': cat.total_quantity or 0,
                'available': cat.available_quantity or 0,
                'dispatched': (cat.total_quantity or 0) - (cat.available_quantity or 0),
                'value': (cat.total_quantity or 0) * (cat.unit_price or 0)
            })

        return jsonify({
            'summary': {
                'total_categories': total_categories,
                'total_asset_value': total_value,
                'total_available': total_available,
                'total_dispatched': total_dispatched,
                'pending_maintenance': pending_maintenance
            },
            'category_breakdown': category_breakdown,
            'recent_movements': movements_list
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching asset dashboard: {e}")
        return jsonify({'error': str(e)}), 500


def get_asset_movements():
    """Get all asset movements with filters"""
    try:
        query = AssetMovement.query.options(
            joinedload(AssetMovement.category),
            joinedload(AssetMovement.item)
        )

        # Filters
        category_id = request.args.get('category_id')
        if category_id:
            try:
                query = query.filter_by(category_id=int(category_id))
            except ValueError:
                pass

        project_id = request.args.get('project_id')
        if project_id:
            try:
                query = query.filter_by(project_id=int(project_id))
            except ValueError:
                pass

        movement_type = request.args.get('type')
        if movement_type and movement_type.upper() in ['DISPATCH', 'RETURN']:
            query = query.filter_by(movement_type=movement_type.upper())

        # Date range
        from_date = request.args.get('from_date')
        if from_date:
            try:
                query = query.filter(AssetMovement.created_at >= datetime.strptime(from_date, '%Y-%m-%d'))
            except ValueError:
                pass

        to_date = request.args.get('to_date')
        if to_date:
            try:
                query = query.filter(AssetMovement.created_at <= datetime.strptime(to_date, '%Y-%m-%d'))
            except ValueError:
                pass

        movements = query.order_by(AssetMovement.created_at.desc()).all()

        # Batch load projects
        project_ids = [m.project_id for m in movements]
        projects_map = batch_load_projects(project_ids)

        result = []
        for m in movements:
            m_dict = m.to_dict()
            project = projects_map.get(m.project_id)
            m_dict['project_details'] = enrich_project_details(project)
            result.append(m_dict)

        return jsonify({
            'movements': result,
            'total': len(result)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching asset movements: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== RETURN REQUEST APIs (SE -> PM Flow) ====================

def generate_tracking_code():
    """Generate unique tracking code for return requests: RR-YYYY-NNNN"""
    year = datetime.utcnow().year
    # Get the latest request ID to create sequential number
    latest = AssetReturnRequest.query.order_by(AssetReturnRequest.request_id.desc()).first()
    next_num = (latest.request_id + 1) if latest else 1
    return f"RR-{year}-{next_num:04d}"


def create_return_request():
    """SE creates a return request for assets at their site"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        current_user = g.user.get('email', 'system')
        current_user_id = g.user.get('user_id')

        # Validate required fields
        category_id = data.get('category_id')
        is_valid, error = validate_positive_integer(category_id, 'category_id')
        if not is_valid:
            return jsonify({'error': error}), 400

        project_id = data.get('project_id')
        is_valid, error = validate_positive_integer(project_id, 'project_id')
        if not is_valid:
            return jsonify({'error': error}), 400

        # Get category
        category = ReturnableAssetCategory.query.get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        # Validate condition
        se_condition = data.get('condition', 'good')
        if se_condition not in VALID_CONDITIONS:
            return jsonify({'error': f'condition must be one of: {", ".join(VALID_CONDITIONS)}'}), 400

        # Get project
        project = Project.query.get(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        # Generate tracking code
        tracking_code = generate_tracking_code()

        requests_created = []

        if category.tracking_mode == 'individual':
            # Return specific items
            item_ids = data.get('item_ids', [])
            if not item_ids or not isinstance(item_ids, list):
                return jsonify({'error': 'item_ids required for individual tracking'}), 400

            for item_id in item_ids:
                item = ReturnableAssetItem.query.get(item_id)
                if not item:
                    return jsonify({'error': f'Item with ID {item_id} not found'}), 404
                if item.current_status != 'dispatched':
                    return jsonify({'error': f'Item {item.item_code} is not dispatched'}), 400
                if item.current_project_id != project_id:
                    return jsonify({'error': f'Item {item.item_code} is not at this project'}), 400

                # Create return request for this item
                return_request = AssetReturnRequest(
                    category_id=category_id,
                    item_id=item_id,
                    project_id=project_id,
                    quantity=1,
                    se_condition_assessment=data.get(f'condition_{item_id}', se_condition),
                    se_notes=data.get('notes'),
                    se_damage_description=data.get('damage_description') if se_condition in DAMAGED_CONDITIONS else None,
                    status='pending',
                    tracking_code=tracking_code,
                    requested_by=current_user,
                    requested_by_id=current_user_id,
                    created_by=current_user
                )
                db.session.add(return_request)
                requests_created.append(return_request)

        else:
            # Quantity mode
            quantity = data.get('quantity', 1)
            is_valid, error = validate_positive_integer(quantity, 'quantity')
            if not is_valid:
                return jsonify({'error': error}), 400

            # Verify quantity is available at project
            dispatched_qty = get_dispatched_quantity_for_project(category_id, project_id)
            if quantity > dispatched_qty:
                return jsonify({'error': f'Only {dispatched_qty} units are at this project'}), 400

            return_request = AssetReturnRequest(
                category_id=category_id,
                item_id=None,
                project_id=project_id,
                quantity=quantity,
                se_condition_assessment=se_condition,
                se_notes=data.get('notes'),
                se_damage_description=data.get('damage_description') if se_condition in DAMAGED_CONDITIONS else None,
                status='pending',
                tracking_code=tracking_code,
                requested_by=current_user,
                requested_by_id=current_user_id,
                created_by=current_user
            )
            db.session.add(return_request)
            requests_created.append(return_request)

        db.session.commit()

        # Send notification to Production Manager
        try:
            # Get PM user IDs by joining User with Role
            from models.role import Role
            pm_users = User.query.join(Role, User.role_id == Role.role_id).filter(
                Role.role == 'production-manager',
                User.is_active == True
            ).all()
            pm_user_ids = [pm.user_id for pm in pm_users]

            if pm_user_ids:
                ComprehensiveNotificationService.notify_asset_return_requested(
                    project_id=project_id,
                    project_name=project.project_name,
                    category_name=category.category_name,
                    category_code=category.category_code,
                    quantity=len(requests_created) if category.tracking_mode == 'individual' else quantity,
                    condition=se_condition,
                    pm_user_ids=pm_user_ids,
                    returned_by_name=get_user_name(current_user_id) or current_user,
                    damage_description=data.get('damage_description')
                )
        except Exception as notify_error:
            current_app.logger.error(f"Error sending return request notification: {notify_error}")

        return jsonify({
            'message': 'Return request created successfully',
            'tracking_code': tracking_code,
            'requests': [r.to_dict() for r in requests_created]
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating return request: {e}")
        return jsonify({'error': str(e)}), 500


def get_pending_return_requests():
    """PM gets all pending return requests"""
    try:
        status_filter = request.args.get('status', 'pending')

        query = AssetReturnRequest.query.options(
            joinedload(AssetReturnRequest.category),
            joinedload(AssetReturnRequest.item)
        )

        if status_filter != 'all':
            query = query.filter_by(status=status_filter)

        requests = query.order_by(AssetReturnRequest.requested_at.desc()).all()

        # Batch load projects
        project_ids = list(set([r.project_id for r in requests]))
        projects_map = batch_load_projects(project_ids)

        result = []
        for req in requests:
            req_dict = req.to_dict()
            project = projects_map.get(req.project_id)
            req_dict['project_details'] = enrich_project_details(project)

            # Get dispatch history for context
            dispatch_movements = AssetMovement.query.filter_by(
                category_id=req.category_id,
                project_id=req.project_id,
                movement_type='DISPATCH'
            ).order_by(AssetMovement.dispatched_at.desc()).limit(5).all()

            req_dict['dispatch_history'] = [m.to_dict() for m in dispatch_movements]
            result.append(req_dict)

        return jsonify({
            'return_requests': result,
            'total': len(result)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching return requests: {e}")
        return jsonify({'error': str(e)}), 500


def get_my_return_requests():
    """SE gets their own return requests"""
    try:
        user_id = g.user.get('user_id')
        if not user_id:
            return jsonify({'error': 'User not authenticated'}), 401

        requests = AssetReturnRequest.query.options(
            joinedload(AssetReturnRequest.category),
            joinedload(AssetReturnRequest.item)
        ).filter_by(requested_by_id=user_id).order_by(
            AssetReturnRequest.requested_at.desc()
        ).all()

        # Batch load projects
        project_ids = list(set([r.project_id for r in requests]))
        projects_map = batch_load_projects(project_ids)

        result = []
        for req in requests:
            req_dict = req.to_dict()
            project = projects_map.get(req.project_id)
            req_dict['project_details'] = enrich_project_details(project)
            result.append(req_dict)

        return jsonify({
            'return_requests': result,
            'total': len(result)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching my return requests: {e}")
        return jsonify({'error': str(e)}), 500


def process_return_request(request_id):
    """PM processes a return request - does quality check and determines action"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400

        current_user = g.user.get('email', 'system')
        current_user_id = g.user.get('user_id')

        # Get the return request
        return_request = AssetReturnRequest.query.with_for_update().get(request_id)
        if not return_request:
            return jsonify({'error': 'Return request not found'}), 404

        if return_request.status != 'pending':
            return jsonify({'error': f'Request already processed (status: {return_request.status})'}), 400

        # PM's assessment
        pm_condition = data.get('pm_condition_assessment')
        if pm_condition and pm_condition not in VALID_CONDITIONS:
            return jsonify({'error': f'pm_condition_assessment must be one of: {", ".join(VALID_CONDITIONS)}'}), 400

        pm_action = data.get('pm_action')  # return_to_stock, send_to_maintenance, write_off
        if not pm_action:
            return jsonify({'error': 'pm_action is required (return_to_stock, send_to_maintenance, write_off)'}), 400

        valid_actions = ['return_to_stock', 'send_to_maintenance', 'write_off']
        if pm_action not in valid_actions:
            return jsonify({'error': f'pm_action must be one of: {", ".join(valid_actions)}'}), 400

        # Update return request
        return_request.pm_condition_assessment = pm_condition or return_request.se_condition_assessment
        return_request.pm_notes = data.get('pm_notes')
        return_request.pm_action = pm_action
        return_request.status = 'completed'
        return_request.processed_by = current_user
        return_request.processed_by_id = current_user_id
        return_request.processed_at = datetime.utcnow()

        # Get category for processing
        category = ReturnableAssetCategory.query.with_for_update().get(return_request.category_id)
        final_condition = pm_condition or return_request.se_condition_assessment

        # Process based on action
        if category.tracking_mode == 'individual' and return_request.item_id:
            item = ReturnableAssetItem.query.with_for_update().get(return_request.item_id)
            if item:
                # Create return movement
                movement = AssetMovement(
                    category_id=return_request.category_id,
                    item_id=return_request.item_id,
                    movement_type='RETURN',
                    project_id=return_request.project_id,
                    quantity=1,
                    condition_before=item.current_condition,
                    condition_after=final_condition,
                    returned_by=current_user,
                    returned_at=datetime.utcnow(),
                    notes=f"Return Request: {return_request.tracking_code}. PM Action: {pm_action}",
                    created_by=current_user
                )
                db.session.add(movement)

                # Update item based on action
                item.current_condition = final_condition
                item.current_project_id = None
                item.last_modified_by = current_user

                if pm_action == 'return_to_stock':
                    item.current_status = 'available'
                elif pm_action == 'send_to_maintenance':
                    item.current_status = 'maintenance'
                    # Create maintenance record
                    maintenance = AssetMaintenance(
                        category_id=return_request.category_id,
                        item_id=return_request.item_id,
                        quantity=1,
                        issue_description=return_request.se_damage_description or f"Returned in {final_condition} condition",
                        reported_by=return_request.requested_by,
                        status='pending',
                        created_by=current_user
                    )
                    db.session.add(maintenance)
                elif pm_action == 'write_off':
                    item.current_status = 'retired'
                    item.is_active = False

        else:
            # Quantity mode
            quantity = return_request.quantity

            # Create return movement
            movement = AssetMovement(
                category_id=return_request.category_id,
                item_id=None,
                movement_type='RETURN',
                project_id=return_request.project_id,
                quantity=quantity,
                condition_after=final_condition,
                returned_by=current_user,
                returned_at=datetime.utcnow(),
                notes=f"Return Request: {return_request.tracking_code}. PM Action: {pm_action}",
                created_by=current_user
            )
            db.session.add(movement)

            if pm_action == 'return_to_stock':
                category.available_quantity = (category.available_quantity or 0) + quantity
            elif pm_action == 'send_to_maintenance':
                # Create maintenance record
                maintenance = AssetMaintenance(
                    category_id=return_request.category_id,
                    item_id=None,
                    quantity=quantity,
                    issue_description=return_request.se_damage_description or f"Returned in {final_condition} condition",
                    reported_by=return_request.requested_by,
                    status='pending',
                    created_by=current_user
                )
                db.session.add(maintenance)
            elif pm_action == 'write_off':
                category.total_quantity = (category.total_quantity or 0) - quantity

            category.last_modified_by = current_user

        db.session.commit()

        # Send notification to SE that request was processed
        try:
            if return_request.requested_by_id:
                ComprehensiveNotificationService.create_notification(
                    user_id=return_request.requested_by_id,
                    notification_type='asset_return_processed',
                    title='Return Request Processed',
                    message=f'Your return request for {category.category_name} has been processed. Action: {pm_action.replace("_", " ").title()}',
                    priority='normal',
                    metadata={
                        'tracking_code': return_request.tracking_code,
                        'pm_action': pm_action,
                        'pm_condition': final_condition
                    },
                    action_url='/site-engineer/site-assets'
                )
        except Exception as notify_error:
            current_app.logger.error(f"Error sending process notification: {notify_error}")

        return jsonify({
            'message': 'Return request processed successfully',
            'tracking_code': return_request.tracking_code,
            'pm_action': pm_action,
            'request': return_request.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error processing return request: {e}")
        return jsonify({'error': str(e)}), 500


def get_asset_tracking_history(tracking_code):
    """Get full history for an asset by tracking code"""
    try:
        # Find return requests with this tracking code
        requests = AssetReturnRequest.query.filter_by(tracking_code=tracking_code).all()

        if not requests:
            return jsonify({'error': 'Tracking code not found'}), 404

        result = {
            'tracking_code': tracking_code,
            'return_requests': [r.to_dict() for r in requests],
            'movements': [],
            'maintenance': []
        }

        # ✅ PERFORMANCE: Batch load movements and maintenance to avoid N+1 queries
        # Collect unique category/project combinations and item_ids
        category_project_pairs = set()
        item_ids = set()
        category_ids = set()

        for req in requests:
            category_project_pairs.add((req.category_id, req.project_id))
            if req.item_id:
                item_ids.add(req.item_id)
            else:
                category_ids.add(req.category_id)

        # Batch query movements (single query instead of N queries)
        from sqlalchemy import or_, and_
        if category_project_pairs:
            movement_conditions = [
                and_(AssetMovement.category_id == cat_id, AssetMovement.project_id == proj_id)
                for cat_id, proj_id in category_project_pairs
            ]
            movements = AssetMovement.query.filter(
                or_(*movement_conditions)
            ).order_by(AssetMovement.created_at.desc()).limit(200).all()
            result['movements'] = [m.to_dict() for m in movements]

        # Batch query maintenance records (single query instead of N queries)
        maintenance_records = []
        if item_ids:
            maintenance_records.extend(
                AssetMaintenance.query.filter(AssetMaintenance.item_id.in_(item_ids)).limit(100).all()
            )
        if category_ids:
            maintenance_records.extend(
                AssetMaintenance.query.filter(AssetMaintenance.category_id.in_(category_ids)).limit(100).all()
            )
        result['maintenance'] = [m.to_dict() for m in maintenance_records]

        return jsonify(result), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching tracking history: {e}")
        return jsonify({'error': str(e)}), 500
