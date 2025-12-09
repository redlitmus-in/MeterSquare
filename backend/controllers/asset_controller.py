from flask import jsonify, request, g
from config.db import db
from models.returnable_assets import (
    ReturnableAssetCategory,
    ReturnableAssetItem,
    AssetMovement,
    AssetMaintenance
)
from models.project import Project
from models.user import User
from datetime import datetime


# ==================== HELPER FUNCTIONS ====================

def generate_category_code(category_name):
    """Generate category code from name (first 3 letters uppercase)"""
    if not category_name:
        return "AST"
    # Take first 3 letters, uppercase
    base_code = category_name[:3].upper()

    # Check if code exists, if so add number
    existing = ReturnableAssetCategory.query.filter(
        ReturnableAssetCategory.category_code.like(f"{base_code}%")
    ).count()

    if existing == 0:
        return base_code
    return f"{base_code}{existing + 1}"


def generate_item_code(category_code):
    """Generate item code (e.g., LAD-001, LAD-002)"""
    # Get count of items in this category
    count = ReturnableAssetItem.query.join(ReturnableAssetCategory).filter(
        ReturnableAssetCategory.category_code == category_code
    ).count()

    return f"{category_code}-{count + 1:03d}"


def enrich_project_details(project):
    """Get project details for display"""
    if not project:
        return None
    return {
        'project_id': project.project_id,
        'project_name': project.project_name,
        'project_code': project.project_code,
        'location': project.location
    }


def get_user_name(user_id):
    """Get user full name by ID"""
    try:
        user = User.query.get(user_id)
        return user.full_name if user else None
    except:
        return None


# ==================== CATEGORY APIs ====================

def create_asset_category():
    """Create a new asset category"""
    try:
        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Validate required fields
        if not data.get('category_name'):
            return jsonify({'error': 'category_name is required'}), 400

        # Generate or use provided category code
        category_code = data.get('category_code')
        if not category_code:
            category_code = generate_category_code(data['category_name'])
        else:
            # Check if code already exists
            existing = ReturnableAssetCategory.query.filter_by(category_code=category_code.upper()).first()
            if existing:
                return jsonify({'error': f'Category code {category_code} already exists'}), 400
            category_code = category_code.upper()

        tracking_mode = data.get('tracking_mode', 'quantity')
        if tracking_mode not in ['individual', 'quantity']:
            return jsonify({'error': 'tracking_mode must be "individual" or "quantity"'}), 400

        new_category = ReturnableAssetCategory(
            category_code=category_code,
            category_name=data['category_name'],
            description=data.get('description'),
            tracking_mode=tracking_mode,
            total_quantity=data.get('total_quantity', 0),
            available_quantity=data.get('total_quantity', 0),  # Initially all available
            unit_price=data.get('unit_price', 0),
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
        return jsonify({'error': str(e)}), 500


def get_all_asset_categories():
    """Get all asset categories with optional filters"""
    try:
        query = ReturnableAssetCategory.query

        # Filters
        if request.args.get('active_only', 'true').lower() == 'true':
            query = query.filter_by(is_active=True)

        tracking_mode = request.args.get('tracking_mode')
        if tracking_mode:
            query = query.filter_by(tracking_mode=tracking_mode)

        search = request.args.get('search')
        if search:
            query = query.filter(
                db.or_(
                    ReturnableAssetCategory.category_name.ilike(f'%{search}%'),
                    ReturnableAssetCategory.category_code.ilike(f'%{search}%')
                )
            )

        categories = query.order_by(ReturnableAssetCategory.category_name).all()

        return jsonify({
            'categories': [cat.to_dict() for cat in categories],
            'total': len(categories)
        }), 200

    except Exception as e:
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

        # Add recent movements
        movements = AssetMovement.query.filter_by(
            category_id=category_id
        ).order_by(AssetMovement.created_at.desc()).limit(10).all()
        result['recent_movements'] = [m.to_dict() for m in movements]

        return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def update_asset_category(category_id):
    """Update asset category"""
    try:
        category = ReturnableAssetCategory.query.get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Update fields
        if 'category_name' in data:
            category.category_name = data['category_name']
        if 'description' in data:
            category.description = data['description']
        if 'unit_price' in data:
            category.unit_price = data['unit_price']
        if 'image_url' in data:
            category.image_url = data['image_url']
        if 'is_active' in data:
            category.is_active = data['is_active']

        # Update quantity only for quantity mode
        if category.tracking_mode == 'quantity':
            if 'total_quantity' in data:
                old_total = category.total_quantity or 0
                new_total = data['total_quantity']
                diff = new_total - old_total
                category.total_quantity = new_total
                category.available_quantity = (category.available_quantity or 0) + diff

        category.last_modified_by = current_user
        category.last_modified_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            'message': 'Category updated successfully',
            'category': category.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
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
        return jsonify({'error': str(e)}), 500


# ==================== ITEM APIs (Individual Tracking) ====================

def create_asset_item():
    """Create a new individual asset item"""
    try:
        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Validate category
        category_id = data.get('category_id')
        if not category_id:
            return jsonify({'error': 'category_id is required'}), 400

        category = ReturnableAssetCategory.query.get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        if category.tracking_mode != 'individual':
            return jsonify({'error': 'Category does not use individual tracking'}), 400

        # Generate item code
        item_code = data.get('item_code')
        if not item_code:
            item_code = generate_item_code(category.category_code)
        else:
            # Check if code already exists
            existing = ReturnableAssetItem.query.filter_by(item_code=item_code).first()
            if existing:
                return jsonify({'error': f'Item code {item_code} already exists'}), 400

        new_item = ReturnableAssetItem(
            category_id=category_id,
            item_code=item_code,
            serial_number=data.get('serial_number'),
            purchase_date=datetime.strptime(data['purchase_date'], '%Y-%m-%d').date() if data.get('purchase_date') else None,
            purchase_price=data.get('purchase_price'),
            current_condition=data.get('current_condition', 'good'),
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
        return jsonify({'error': str(e)}), 500


def get_all_asset_items():
    """Get all individual asset items with filters"""
    try:
        query = ReturnableAssetItem.query

        # Filters
        category_id = request.args.get('category_id')
        if category_id:
            query = query.filter_by(category_id=category_id)

        status = request.args.get('status')
        if status:
            query = query.filter_by(current_status=status)

        condition = request.args.get('condition')
        if condition:
            query = query.filter_by(current_condition=condition)

        project_id = request.args.get('project_id')
        if project_id:
            query = query.filter_by(current_project_id=project_id)

        if request.args.get('active_only', 'true').lower() == 'true':
            query = query.filter_by(is_active=True)

        items = query.order_by(ReturnableAssetItem.item_code).all()

        # Enrich with project details
        result = []
        for item in items:
            item_dict = item.to_dict()
            if item.current_project_id:
                project = Project.query.get(item.current_project_id)
                item_dict['project_details'] = enrich_project_details(project)
            result.append(item_dict)

        return jsonify({
            'items': result,
            'total': len(result)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_asset_item_by_id(item_id):
    """Get single asset item with full history"""
    try:
        item = ReturnableAssetItem.query.get(item_id)
        if not item:
            return jsonify({'error': 'Item not found'}), 404

        result = item.to_dict()

        # Add project details
        if item.current_project_id:
            project = Project.query.get(item.current_project_id)
            result['project_details'] = enrich_project_details(project)

        # Add movement history
        movements = AssetMovement.query.filter_by(
            item_id=item_id
        ).order_by(AssetMovement.created_at.desc()).all()

        movement_history = []
        for m in movements:
            m_dict = m.to_dict()
            project = Project.query.get(m.project_id)
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
        return jsonify({'error': str(e)}), 500


def update_asset_item(item_id):
    """Update asset item details"""
    try:
        item = ReturnableAssetItem.query.get(item_id)
        if not item:
            return jsonify({'error': 'Item not found'}), 404

        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Update fields
        if 'serial_number' in data:
            item.serial_number = data['serial_number']
        if 'purchase_date' in data:
            item.purchase_date = datetime.strptime(data['purchase_date'], '%Y-%m-%d').date() if data['purchase_date'] else None
        if 'purchase_price' in data:
            item.purchase_price = data['purchase_price']
        if 'current_condition' in data:
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
        return jsonify({'error': str(e)}), 500


# ==================== DISPATCH APIs ====================

def dispatch_asset():
    """Dispatch asset(s) to a project"""
    try:
        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Validate required fields
        category_id = data.get('category_id')
        project_id = data.get('project_id')

        if not category_id:
            return jsonify({'error': 'category_id is required'}), 400
        if not project_id:
            return jsonify({'error': 'project_id is required'}), 400

        category = ReturnableAssetCategory.query.get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        project = Project.query.get(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        movements_created = []

        if category.tracking_mode == 'individual':
            # Individual tracking - dispatch specific items
            item_ids = data.get('item_ids', [])
            if not item_ids:
                return jsonify({'error': 'item_ids required for individual tracking'}), 400

            for item_id in item_ids:
                item = ReturnableAssetItem.query.get(item_id)
                if not item:
                    continue
                if item.current_status != 'available':
                    return jsonify({'error': f'Item {item.item_code} is not available'}), 400

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
            category.available_quantity = (category.available_quantity or 0) - len(item_ids)

        else:
            # Quantity tracking
            quantity = data.get('quantity', 1)
            if quantity <= 0:
                return jsonify({'error': 'quantity must be greater than 0'}), 400

            if quantity > (category.available_quantity or 0):
                return jsonify({
                    'error': f'Not enough available. Requested: {quantity}, Available: {category.available_quantity}'
                }), 400

            # Create movement
            movement = AssetMovement(
                category_id=category_id,
                item_id=None,
                movement_type='DISPATCH',
                project_id=project_id,
                quantity=quantity,
                condition_before=data.get('condition', 'good'),
                dispatched_by=current_user,
                dispatched_at=datetime.utcnow(),
                reference_number=data.get('reference_number'),
                notes=data.get('notes'),
                created_by=current_user
            )
            db.session.add(movement)
            movements_created.append(movement)

            # Update category
            category.available_quantity = (category.available_quantity or 0) - quantity

        category.last_modified_by = current_user
        db.session.commit()

        return jsonify({
            'message': 'Assets dispatched successfully',
            'movements': [m.to_dict() for m in movements_created],
            'category': category.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def get_dispatched_assets():
    """Get all currently dispatched assets"""
    try:
        # For individual items
        dispatched_items = ReturnableAssetItem.query.filter_by(
            current_status='dispatched',
            is_active=True
        ).all()

        # Group by project
        by_project = {}

        for item in dispatched_items:
            pid = item.current_project_id
            if pid not in by_project:
                project = Project.query.get(pid)
                by_project[pid] = {
                    'project': enrich_project_details(project),
                    'items': [],
                    'quantity_assets': []
                }
            by_project[pid]['items'].append(item.to_dict())

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

        for mov in quantity_movements:
            outstanding = (mov.dispatched or 0) - (mov.returned or 0)
            if outstanding > 0:
                pid = mov.project_id
                if pid not in by_project:
                    project = Project.query.get(pid)
                    by_project[pid] = {
                        'project': enrich_project_details(project),
                        'items': [],
                        'quantity_assets': []
                    }

                category = ReturnableAssetCategory.query.get(mov.category_id)
                by_project[pid]['quantity_assets'].append({
                    'category_id': mov.category_id,
                    'category_code': category.category_code if category else None,
                    'category_name': category.category_name if category else None,
                    'quantity_dispatched': outstanding
                })

        return jsonify({
            'dispatched_by_project': list(by_project.values()),
            'total_projects': len(by_project)
        }), 200

    except Exception as e:
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

        # Individual items
        items = ReturnableAssetItem.query.filter_by(
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

        for mov in quantity_movements:
            outstanding = (mov.dispatched or 0) - (mov.returned or 0)
            if outstanding > 0:
                category = ReturnableAssetCategory.query.get(mov.category_id)
                result['quantity_assets'].append({
                    'category_id': mov.category_id,
                    'category_code': category.category_code if category else None,
                    'category_name': category.category_name if category else None,
                    'quantity_at_site': outstanding
                })

        return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== RETURN APIs ====================

def return_asset():
    """Return asset(s) from a project"""
    try:
        data = request.get_json()
        current_user = g.user.get('email', 'system')

        category_id = data.get('category_id')
        project_id = data.get('project_id')
        condition_after = data.get('condition', 'good')

        if not category_id:
            return jsonify({'error': 'category_id is required'}), 400
        if not project_id:
            return jsonify({'error': 'project_id is required'}), 400

        category = ReturnableAssetCategory.query.get(category_id)
        if not category:
            return jsonify({'error': 'Category not found'}), 404

        movements_created = []
        maintenance_created = []

        if category.tracking_mode == 'individual':
            # Return specific items
            item_ids = data.get('item_ids', [])
            if not item_ids:
                return jsonify({'error': 'item_ids required for individual tracking'}), 400

            for item_id in item_ids:
                item = ReturnableAssetItem.query.get(item_id)
                if not item or item.current_status != 'dispatched':
                    continue

                item_condition = data.get(f'condition_{item_id}', condition_after)

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
                if item_condition in ['damaged', 'poor']:
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
            if quantity <= 0:
                return jsonify({'error': 'quantity must be greater than 0'}), 400

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

            # Handle damaged quantity
            damaged_qty = data.get('damaged_quantity', 0)
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
        return jsonify({'error': str(e)}), 500


# ==================== MAINTENANCE APIs ====================

def get_pending_maintenance():
    """Get all assets pending maintenance"""
    try:
        maintenance = AssetMaintenance.query.filter(
            AssetMaintenance.status.in_(['pending', 'in_progress'])
        ).order_by(AssetMaintenance.reported_at.desc()).all()

        result = []
        for m in maintenance:
            m_dict = m.to_dict()
            # Add category details
            category = ReturnableAssetCategory.query.get(m.category_id)
            if category:
                m_dict['category'] = category.to_dict()
            result.append(m_dict)

        return jsonify({
            'maintenance_records': result,
            'total': len(result)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def update_maintenance(maintenance_id):
    """Update maintenance record (repair or write-off)"""
    try:
        maint = AssetMaintenance.query.get(maintenance_id)
        if not maint:
            return jsonify({'error': 'Maintenance record not found'}), 404

        data = request.get_json()
        current_user = g.user.get('email', 'system')
        action = data.get('action')  # 'repair', 'write_off', 'in_progress'

        category = ReturnableAssetCategory.query.get(maint.category_id)

        if action == 'in_progress':
            maint.status = 'in_progress'

        elif action == 'repair':
            maint.status = 'completed'
            maint.repair_notes = data.get('repair_notes')
            maint.repair_cost = data.get('repair_cost', 0)
            maint.repaired_by = current_user
            maint.repaired_at = datetime.utcnow()
            maint.returned_to_stock = True

            # Return to stock
            if maint.item_id:
                item = ReturnableAssetItem.query.get(maint.item_id)
                if item:
                    item.current_status = 'available'
                    item.current_condition = data.get('condition_after', 'good')
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
                item = ReturnableAssetItem.query.get(maint.item_id)
                if item:
                    item.current_status = 'retired'
                    item.is_active = False
                    item.last_modified_by = current_user
                    if category:
                        category.total_quantity = (category.total_quantity or 0) - 1
            else:
                # Quantity mode
                if category:
                    category.total_quantity = (category.total_quantity or 0) - maint.quantity

        if category:
            category.last_modified_by = current_user

        db.session.commit()

        return jsonify({
            'message': f'Maintenance {action} completed',
            'maintenance': maint.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
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

        # Recent movements
        recent_movements = AssetMovement.query.order_by(
            AssetMovement.created_at.desc()
        ).limit(10).all()

        movements_list = []
        for m in recent_movements:
            m_dict = m.to_dict()
            project = Project.query.get(m.project_id)
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
        return jsonify({'error': str(e)}), 500


def get_asset_movements():
    """Get all asset movements with filters"""
    try:
        query = AssetMovement.query

        # Filters
        category_id = request.args.get('category_id')
        if category_id:
            query = query.filter_by(category_id=category_id)

        project_id = request.args.get('project_id')
        if project_id:
            query = query.filter_by(project_id=project_id)

        movement_type = request.args.get('type')
        if movement_type:
            query = query.filter_by(movement_type=movement_type.upper())

        # Date range
        from_date = request.args.get('from_date')
        if from_date:
            query = query.filter(AssetMovement.created_at >= datetime.strptime(from_date, '%Y-%m-%d'))

        to_date = request.args.get('to_date')
        if to_date:
            query = query.filter(AssetMovement.created_at <= datetime.strptime(to_date, '%Y-%m-%d'))

        movements = query.order_by(AssetMovement.created_at.desc()).all()

        result = []
        for m in movements:
            m_dict = m.to_dict()
            project = Project.query.get(m.project_id)
            m_dict['project_details'] = enrich_project_details(project)
            result.append(m_dict)

        return jsonify({
            'movements': result,
            'total': len(result)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
