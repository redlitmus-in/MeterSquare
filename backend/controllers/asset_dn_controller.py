"""
Asset Delivery Note (ADN) and Return Delivery Note (ARDN) Controller
Handles the proper DN/RDN flow for returnable assets - similar to materials flow.

Flow:
1. Stock In → Add assets to inventory
2. Create ADN → Dispatch assets to site
3. Create ARDN → Return assets from site
4. Process ARDN → Verify condition and decide fate (stock/repair/dispose)
"""

import logging
from datetime import datetime
from flask import request, jsonify, g
from config.db import db
from sqlalchemy import func, and_

logger = logging.getLogger(__name__)
from models.returnable_assets import *
from models.project import Project
from models.user import User


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def generate_adn_number():
    """Generate next ADN number: ADN-YYYY-XXXX"""
    year = datetime.now().year
    prefix = f"ADN-{year}-"

    last_adn = AssetDeliveryNote.query.filter(
        AssetDeliveryNote.adn_number.like(f"{prefix}%")
    ).order_by(AssetDeliveryNote.adn_id.desc()).first()

    if last_adn:
        try:
            last_num = int(last_adn.adn_number.split('-')[-1])
            next_num = last_num + 1
        except (ValueError, IndexError):
            next_num = 1
    else:
        next_num = 1

    return f"{prefix}{next_num:04d}"


def generate_ardn_number():
    """Generate next ARDN number: ARDN-YYYY-XXXX"""
    year = datetime.now().year
    prefix = f"ARDN-{year}-"

    last_ardn = AssetReturnDeliveryNote.query.filter(
        AssetReturnDeliveryNote.ardn_number.like(f"{prefix}%")
    ).order_by(AssetReturnDeliveryNote.ardn_id.desc()).first()

    if last_ardn:
        try:
            last_num = int(last_ardn.ardn_number.split('-')[-1])
            next_num = last_num + 1
        except (ValueError, IndexError):
            next_num = 1
    else:
        next_num = 1

    return f"{prefix}{next_num:04d}"


def generate_stock_in_number():
    """Generate next Stock In number: ASI-YYYY-XXXX"""
    year = datetime.now().year
    prefix = f"ASI-{year}-"

    last_si = AssetStockIn.query.filter(
        AssetStockIn.stock_in_number.like(f"{prefix}%")
    ).order_by(AssetStockIn.stock_in_id.desc()).first()

    if last_si:
        try:
            last_num = int(last_si.stock_in_number.split('-')[-1])
            next_num = last_num + 1
        except (ValueError, IndexError):
            next_num = 1
    else:
        next_num = 1

    return f"{prefix}{next_num:04d}"


def batch_load_projects(project_ids):
    """Batch load projects to avoid N+1 queries"""
    if not project_ids:
        return {}
    projects = Project.query.filter(Project.project_id.in_(project_ids)).all()
    return {p.project_id: p for p in projects}


def resolve_user_name(name_value, user_id_value):
    """
    Resolve actual user name when stored value is 'System' or empty.
    Looks up user from database by ID if name is invalid.
    Returns '-' if no valid name can be found.
    """
    # If we have a valid name (not 'System' or empty), use it
    if name_value and name_value != 'System':
        return name_value

    # Try to look up by user ID
    if user_id_value:
        try:
            user = User.query.get(int(user_id_value))
            if user:
                return user.full_name or user.email or '-'
        except (ValueError, TypeError):
            pass

    # Return '-' instead of 'System'
    return '-'


def batch_load_users(user_ids):
    """Batch load users to avoid N+1 queries"""
    if not user_ids:
        return {}
    # Filter out None and invalid values
    valid_ids = [uid for uid in user_ids if uid is not None]
    if not valid_ids:
        return {}
    users = User.query.filter(User.user_id.in_(valid_ids)).all()
    return {u.user_id: u for u in users}


# ============================================================================
# STOCK IN ENDPOINTS
# ============================================================================

def parse_date(date_str, format_str='%Y-%m-%d'):
    """Safely parse a date string"""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, format_str).date()
    except (ValueError, TypeError):
        return None


def parse_datetime(datetime_str):
    """Safely parse a datetime string"""
    if not datetime_str:
        return datetime.utcnow()
    try:
        # Try ISO format first
        if 'T' in datetime_str:
            return datetime.fromisoformat(datetime_str.replace('Z', '+00:00').replace('+00:00', ''))
        return datetime.strptime(datetime_str, '%Y-%m-%d %H:%M:%S')
    except (ValueError, TypeError):
        return datetime.utcnow()


def validate_positive_int(value, field_name):
    """Validate that value is a positive integer"""
    if value is None:
        return None, f'{field_name} is required'
    try:
        int_val = int(value)
        if int_val < 1:
            return None, f'{field_name} must be positive'
        return int_val, None
    except (ValueError, TypeError):
        return None, f'{field_name} must be a valid number'


def create_stock_in():
    """Create a stock in record for new assets"""
    try:
        from flask import g
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required'}), 400

        # Get user info from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')

        # Validate required fields
        category_id, err = validate_positive_int(data.get('category_id'), 'Category ID')
        if err:
            return jsonify({'success': False, 'error': err}), 400

        quantity, err = validate_positive_int(data.get('quantity'), 'Quantity')
        if err:
            return jsonify({'success': False, 'error': err}), 400

        # Get category with lock
        category = ReturnableAssetCategory.query.with_for_update().get(category_id)
        if not category:
            return jsonify({'success': False, 'error': 'Category not found'}), 404

        # Parse purchase date safely
        purchase_date = parse_date(data.get('purchase_date'))

        # Create stock in record
        stock_in = AssetStockIn(
            stock_in_number=generate_stock_in_number(),
            category_id=category_id,
            quantity=quantity,
            purchase_date=purchase_date,
            vendor_name=data.get('vendor_name'),
            vendor_id=data.get('vendor_id'),
            invoice_number=data.get('invoice_number'),
            unit_cost=data.get('unit_cost', 0),
            total_cost=data.get('unit_cost', 0) * quantity,
            condition=data.get('condition', 'new'),
            notes=data.get('notes'),
            created_by=user_name,
            created_by_id=int(user_id) if user_id else None
        )
        db.session.add(stock_in)

        # Update category quantities
        category.total_quantity = (category.total_quantity or 0) + quantity
        category.available_quantity = (category.available_quantity or 0) + quantity

        # For individual tracking, create asset items
        if category.tracking_mode == 'individual':
            items_data = data.get('items', [])
            # Get base count once to avoid race condition
            base_count = ReturnableAssetItem.query.filter_by(category_id=category.category_id).count()

            for i, item_data in enumerate(items_data):
                # Generate item code using base count
                item_code = f"{category.category_code}-{base_count + i + 1:03d}"

                # Create asset item
                asset_item = ReturnableAssetItem(
                    category_id=category.category_id,
                    item_code=item_code,
                    serial_number=item_data.get('serial_number'),
                    purchase_date=purchase_date,
                    purchase_price=data.get('unit_cost'),
                    current_condition=item_data.get('condition', 'good'),
                    current_status='available',
                    notes=item_data.get('notes'),
                    created_by=user_name
                )
                db.session.add(asset_item)
                db.session.flush()

                # Create stock in item
                stock_in_item = AssetStockInItem(
                    stock_in_id=stock_in.stock_in_id,
                    asset_item_id=asset_item.item_id,
                    serial_number=item_data.get('serial_number'),
                    condition=item_data.get('condition', 'new'),
                    notes=item_data.get('notes')
                )
                db.session.add(stock_in_item)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Stock in created successfully: {stock_in.stock_in_number}',
            'data': stock_in.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def get_stock_in_list():
    """Get list of stock in records"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        category_id = request.args.get('category_id', type=int)

        query = AssetStockIn.query

        if category_id:
            query = query.filter_by(category_id=category_id)

        query = query.order_by(AssetStockIn.created_at.desc())

        pagination = query.paginate(page=page, per_page=per_page, error_out=False)

        return jsonify({
            'success': True,
            'data': [si.to_dict() for si in pagination.items],
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# ASSET DELIVERY NOTE (ADN) ENDPOINTS
# ============================================================================

def create_delivery_note():
    """Create a new Asset Delivery Note (ADN) - Dispatch assets to site"""
    try:
        from flask import g
        data = request.json
        # Get user info from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')

        # Validate required fields
        if not data.get('project_id'):
            return jsonify({'success': False, 'error': 'Project ID is required'}), 400
        if not data.get('items') or len(data['items']) == 0:
            return jsonify({'success': False, 'error': 'At least one item is required'}), 400

        # Verify project exists
        project = Project.query.get(data['project_id'])
        if not project:
            return jsonify({'success': False, 'error': 'Project not found'}), 404

        # Create ADN
        adn = AssetDeliveryNote(
            adn_number=generate_adn_number(),
            project_id=data['project_id'],
            site_location=data.get('site_location'),
            delivery_date=datetime.fromisoformat(data['delivery_date'].replace('Z', '+00:00')) if data.get('delivery_date') else datetime.utcnow(),
            attention_to=data.get('attention_to'),
            attention_to_id=data.get('attention_to_id'),
            delivery_from=data.get('delivery_from', 'M2 Store'),
            prepared_by=user_name,
            prepared_by_id=int(user_id) if user_id else None,
            checked_by=data.get('checked_by'),
            vehicle_number=data.get('vehicle_number'),
            driver_name=data.get('driver_name'),
            driver_contact=data.get('driver_contact'),
            transport_fee=data.get('transport_fee', 0.0),
            delivery_note_url=data.get('delivery_note_url'),
            status='DRAFT',
            notes=data.get('notes'),
            created_by=user_name
        )
        db.session.add(adn)
        db.session.flush()

        # Process items
        for item_data in data['items']:
            category = ReturnableAssetCategory.query.with_for_update().get(item_data['category_id'])
            if not category:
                db.session.rollback()
                return jsonify({'success': False, 'error': f'Category {item_data["category_id"]} not found'}), 404

            quantity = item_data.get('quantity', 1)

            # Check availability
            if category.tracking_mode == 'quantity':
                if (category.available_quantity or 0) < quantity:
                    db.session.rollback()
                    return jsonify({
                        'success': False,
                        'error': f'Insufficient stock for {category.category_name}. Available: {category.available_quantity}'
                    }), 400

                # Create ADN item
                adn_item = AssetDeliveryNoteItem(
                    adn_id=adn.adn_id,
                    category_id=category.category_id,
                    quantity=quantity,
                    condition_at_dispatch=item_data.get('condition', 'good'),
                    notes=item_data.get('notes')
                )
                db.session.add(adn_item)

            else:  # individual tracking
                asset_item_id = item_data.get('asset_item_id')
                if not asset_item_id:
                    db.session.rollback()
                    return jsonify({
                        'success': False,
                        'error': f'Asset item ID required for individual tracking ({category.category_name})'
                    }), 400

                asset_item = ReturnableAssetItem.query.get(asset_item_id)
                if not asset_item or asset_item.current_status != 'available':
                    db.session.rollback()
                    return jsonify({
                        'success': False,
                        'error': f'Asset item not available for dispatch'
                    }), 400

                adn_item = AssetDeliveryNoteItem(
                    adn_id=adn.adn_id,
                    category_id=category.category_id,
                    asset_item_id=asset_item_id,
                    quantity=1,
                    condition_at_dispatch=asset_item.current_condition,
                    notes=item_data.get('notes')
                )
                db.session.add(adn_item)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Delivery note created: {adn.adn_number}',
            'data': adn.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def get_delivery_notes():
    """Get list of Asset Delivery Notes"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        status = request.args.get('status')
        project_id = request.args.get('project_id', type=int)

        query = AssetDeliveryNote.query

        if status:
            query = query.filter_by(status=status)
        if project_id:
            query = query.filter_by(project_id=project_id)

        query = query.order_by(AssetDeliveryNote.created_at.desc())

        pagination = query.paginate(page=page, per_page=per_page, error_out=False)

        # Batch load projects
        project_ids = list(set(adn.project_id for adn in pagination.items))
        projects_map = batch_load_projects(project_ids)

        result = []
        for adn in pagination.items:
            adn_dict = adn.to_dict()
            project = projects_map.get(adn.project_id)
            adn_dict['project_name'] = project.project_name if project else None
            result.append(adn_dict)

        return jsonify({
            'success': True,
            'data': result,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def get_delivery_note(adn_id):
    """Get single Asset Delivery Note with details"""
    try:
        adn = AssetDeliveryNote.query.get(adn_id)
        if not adn:
            return jsonify({'success': False, 'error': 'Delivery note not found'}), 404

        adn_dict = adn.to_dict()

        # Add project details
        project = Project.query.get(adn.project_id)
        adn_dict['project_name'] = project.project_name if project else None

        return jsonify({
            'success': True,
            'data': adn_dict
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def dispatch_delivery_note(adn_id):
    """Dispatch the delivery note - deduct from inventory and mark as dispatched"""
    try:
        from flask import g
        # Get user info from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'

        adn = AssetDeliveryNote.query.get(adn_id)
        if not adn:
            return jsonify({'success': False, 'error': 'Delivery note not found'}), 404

        if adn.status not in ['DRAFT', 'ISSUED']:
            return jsonify({'success': False, 'error': f'Cannot dispatch. Current status: {adn.status}'}), 400

        # Process each item - deduct from inventory
        for item in adn.items:
            category = ReturnableAssetCategory.query.with_for_update().get(item.category_id)

            if category.tracking_mode == 'quantity':
                if (category.available_quantity or 0) < item.quantity:
                    db.session.rollback()
                    return jsonify({
                        'success': False,
                        'error': f'Insufficient stock for {category.category_name}'
                    }), 400

                category.available_quantity = (category.available_quantity or 0) - item.quantity

            else:  # individual tracking
                asset_item = ReturnableAssetItem.query.get(item.asset_item_id)
                if asset_item:
                    asset_item.current_status = 'dispatched'
                    asset_item.current_project_id = adn.project_id
                    category.available_quantity = max(0, (category.available_quantity or 0) - 1)

        # Update ADN status
        adn.status = 'IN_TRANSIT'
        adn.dispatched_at = datetime.utcnow()
        adn.dispatched_by = user_name

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Delivery note {adn.adn_number} dispatched successfully',
            'data': adn.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def receive_delivery_note(adn_id):
    """Mark delivery note as received at site"""
    try:
        from flask import g
        data = request.json
        # Get user info from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')

        adn = AssetDeliveryNote.query.get(adn_id)
        if not adn:
            return jsonify({'success': False, 'error': 'Delivery note not found'}), 404

        if adn.status != 'IN_TRANSIT':
            return jsonify({'success': False, 'error': f'Cannot receive. Current status: {adn.status}'}), 400

        adn.status = 'DELIVERED'
        adn.received_by = data.get('received_by', user_name)
        adn.received_by_id = int(user_id) if user_id else None
        adn.received_at = datetime.utcnow()
        adn.receiver_notes = data.get('notes')

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Delivery note {adn.adn_number} received successfully',
            'data': adn.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# ASSET RETURN DELIVERY NOTE (ARDN) ENDPOINTS
# ============================================================================

def create_return_note():
    """Create a new Asset Return Delivery Note (ARDN)"""
    try:
        from flask import g
        data = request.json
        # Get user info from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')

        # Validate required fields
        if not data.get('project_id'):
            return jsonify({'success': False, 'error': 'Project ID is required'}), 400
        if not data.get('items') or len(data['items']) == 0:
            return jsonify({'success': False, 'error': 'At least one item is required'}), 400

        # Create ARDN
        ardn = AssetReturnDeliveryNote(
            ardn_number=generate_ardn_number(),
            project_id=data['project_id'],
            site_location=data.get('site_location'),
            return_date=datetime.strptime(data['return_date'], '%Y-%m-%dT%H:%M:%S') if data.get('return_date') else datetime.utcnow(),
            original_adn_id=data.get('original_adn_id'),
            returned_by=data.get('returned_by', user_name),
            returned_by_id=int(user_id) if user_id else None,
            return_to=data.get('return_to', 'M2 Store'),
            prepared_by=user_name,
            prepared_by_id=int(user_id) if user_id else None,
            checked_by=data.get('checked_by'),
            vehicle_number=data.get('vehicle_number'),
            driver_name=data.get('driver_name'),
            driver_contact=data.get('driver_contact'),
            status='DRAFT',
            return_reason=data.get('return_reason'),
            notes=data.get('notes'),
            created_by=user_name
        )
        db.session.add(ardn)
        db.session.flush()

        # Process items
        for item_data in data['items']:
            ardn_item = AssetReturnDeliveryNoteItem(
                ardn_id=ardn.ardn_id,
                category_id=item_data['category_id'],
                asset_item_id=item_data.get('asset_item_id'),
                original_adn_item_id=item_data.get('original_adn_item_id'),
                quantity=item_data.get('quantity', 1),
                reported_condition=item_data['reported_condition'],
                damage_description=item_data.get('damage_description'),
                photo_url=item_data.get('photo_url'),
                return_notes=item_data.get('notes'),
                acceptance_status='PENDING'
            )
            db.session.add(ardn_item)

            # Update quantity_returned on original ADN item so it disappears from SE view
            if item_data.get('original_adn_item_id'):
                original_item = AssetDeliveryNoteItem.query.get(item_data['original_adn_item_id'])
                if original_item:
                    current_returned = original_item.quantity_returned or 0
                    return_qty = item_data.get('quantity', 1)
                    original_item.quantity_returned = current_returned + return_qty
                    # Update status
                    if original_item.quantity_returned >= original_item.quantity:
                        original_item.status = 'fully_returned'
                    else:
                        original_item.status = 'partial_return'

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Return note created: {ardn.ardn_number}',
            'data': ardn.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def get_return_notes():
    """Get list of Asset Return Delivery Notes"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        status = request.args.get('status')
        project_id = request.args.get('project_id', type=int)

        query = AssetReturnDeliveryNote.query

        if status:
            query = query.filter_by(status=status)
        if project_id:
            query = query.filter_by(project_id=project_id)

        query = query.order_by(AssetReturnDeliveryNote.created_at.desc())

        pagination = query.paginate(page=page, per_page=per_page, error_out=False)

        # Batch load projects
        project_ids = list(set(ardn.project_id for ardn in pagination.items))
        projects_map = batch_load_projects(project_ids)

        # Batch load users for resolving 'System' names
        user_ids = set()
        for ardn in pagination.items:
            if ardn.returned_by_id:
                user_ids.add(ardn.returned_by_id)
            if ardn.prepared_by_id:
                user_ids.add(ardn.prepared_by_id)
        users_map = batch_load_users(list(user_ids))

        result = []
        for ardn in pagination.items:
            ardn_dict = ardn.to_dict()
            project = projects_map.get(ardn.project_id)
            ardn_dict['project_name'] = project.project_name if project else None

            # Resolve user names if stored as 'System'
            if not ardn_dict.get('returned_by') or ardn_dict.get('returned_by') == 'System':
                user = users_map.get(ardn.returned_by_id) or users_map.get(ardn.prepared_by_id)
                if user:
                    ardn_dict['returned_by'] = user.full_name or user.email or '-'
                else:
                    ardn_dict['returned_by'] = '-'

            if not ardn_dict.get('prepared_by') or ardn_dict.get('prepared_by') == 'System':
                user = users_map.get(ardn.prepared_by_id)
                if user:
                    ardn_dict['prepared_by'] = user.full_name or user.email or '-'
                else:
                    ardn_dict['prepared_by'] = '-'

            result.append(ardn_dict)

        return jsonify({
            'success': True,
            'data': result,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def get_return_note(ardn_id):
    """Get single Asset Return Delivery Note with details"""
    try:
        ardn = AssetReturnDeliveryNote.query.get(ardn_id)
        if not ardn:
            return jsonify({'success': False, 'error': 'Return note not found'}), 404

        ardn_dict = ardn.to_dict()

        # Add project details
        project = Project.query.get(ardn.project_id)
        ardn_dict['project_name'] = project.project_name if project else None

        # Resolve user names if stored as 'System'
        ardn_dict['returned_by'] = resolve_user_name(ardn.returned_by, ardn.returned_by_id or ardn.prepared_by_id)
        ardn_dict['prepared_by'] = resolve_user_name(ardn.prepared_by, ardn.prepared_by_id)

        return jsonify({
            'success': True,
            'data': ardn_dict
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def issue_return_note(ardn_id):
    """Issue return note - formally prepare it for dispatch"""
    try:
        from flask import g
        # Get user info from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'

        ardn = AssetReturnDeliveryNote.query.get(ardn_id)
        if not ardn:
            return jsonify({'success': False, 'error': 'Return note not found'}), 404

        if ardn.status != 'DRAFT':
            return jsonify({'success': False, 'error': f'Cannot issue. Current status: {ardn.status}'}), 400

        ardn.status = 'ISSUED'
        ardn.issued_at = datetime.utcnow()
        ardn.issued_by = user_name

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Return note {ardn.ardn_number} issued',
            'data': ardn.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def update_return_note(ardn_id):
    """Update return note details (driver info, notes, etc.) - only for DRAFT/ISSUED status"""
    try:
        from flask import g
        data = request.json
        # Get user info from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'

        ardn = AssetReturnDeliveryNote.query.get(ardn_id)
        if not ardn:
            return jsonify({'success': False, 'error': 'Return note not found'}), 404

        if ardn.status not in ['DRAFT', 'ISSUED']:
            return jsonify({'success': False, 'error': f'Cannot update. Current status: {ardn.status}'}), 400

        # Update allowed fields
        if 'vehicle_number' in data:
            ardn.vehicle_number = data['vehicle_number']
        if 'driver_name' in data:
            ardn.driver_name = data['driver_name']
        if 'driver_contact' in data:
            ardn.driver_contact = data['driver_contact']
        if 'site_location' in data:
            ardn.site_location = data['site_location']
        if 'return_reason' in data:
            ardn.return_reason = data['return_reason']
        if 'notes' in data:
            ardn.notes = data['notes']

        ardn.last_modified_at = datetime.utcnow()
        ardn.last_modified_by = user_name

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Return note {ardn.ardn_number} updated',
            'data': ardn.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def dispatch_return_note(ardn_id):
    """Mark return note as dispatched from site - can also update driver details"""
    try:
        from flask import g
        data = request.json or {}
        # Get user info from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'

        ardn = AssetReturnDeliveryNote.query.get(ardn_id)
        if not ardn:
            return jsonify({'success': False, 'error': 'Return note not found'}), 404

        if ardn.status not in ['DRAFT', 'ISSUED']:
            return jsonify({'success': False, 'error': f'Cannot dispatch. Current status: {ardn.status}'}), 400

        # Update driver details if provided
        if data.get('vehicle_number'):
            ardn.vehicle_number = data['vehicle_number']
        if data.get('driver_name'):
            ardn.driver_name = data['driver_name']
        if data.get('driver_contact'):
            ardn.driver_contact = data['driver_contact']

        # Update transport fee if provided
        if 'transport_fee' in data:
            ardn.transport_fee = float(data['transport_fee']) if data['transport_fee'] else 0.0

        # Update notes if provided
        if data.get('notes'):
            ardn.notes = data['notes']

        # Update delivery note URL if provided
        if data.get('delivery_note_url'):
            ardn.delivery_note_url = data['delivery_note_url']

        ardn.status = 'IN_TRANSIT'
        ardn.dispatched_at = datetime.utcnow()
        ardn.dispatched_by = user_name

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Return note {ardn.ardn_number} dispatched',
            'data': ardn.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def upload_return_note_delivery_note():
    """Upload delivery note document for ARDN (from vendor/transporter)"""
    try:
        from werkzeug.utils import secure_filename
        from supabase import create_client
        import uuid
        import os

        # Get ARDN ID from request
        ardn_id = request.form.get('ardn_id')
        if not ardn_id:
            return jsonify({'success': False, 'error': 'ARDN ID is required'}), 400

        # Get the ARDN record
        ardn = AssetReturnDeliveryNote.query.get(ardn_id)
        if not ardn:
            return jsonify({'success': False, 'error': 'Return note not found'}), 404

        # Get file from request
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        # Validate file type
        filename = secure_filename(file.filename)
        allowed_extensions = {'pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'}
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        if ext not in allowed_extensions:
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Allowed: PDF, DOC, DOCX, JPG, PNG (Max 10MB)'
            }), 400

        # Read file content
        file_content = file.read()
        file_size = len(file_content)

        # Check file size (max 10MB)
        max_size = 10 * 1024 * 1024
        if file_size > max_size:
            return jsonify({
                'success': False,
                'error': 'File too large. Maximum size is 10MB'
            }), 400

        if file_size == 0:
            return jsonify({'success': False, 'error': 'File is empty'}), 400

        # Create unique filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_id = str(uuid.uuid4())[:8]
        unique_filename = f"asset-return-notes/{ardn.ardn_number}/{timestamp}_{unique_id}_{filename}"

        # Get content type
        content_type = file.content_type or 'application/octet-stream'

        # Initialize Supabase client based on ENVIRONMENT variable
        environment = os.environ.get('ENVIRONMENT', 'production')
        if environment == 'development':
            supabase_url = os.environ.get('DEV_SUPABASE_URL')
            supabase_key = os.environ.get('DEV_SUPABASE_ANON_KEY')
        else:
            supabase_url = os.environ.get('SUPABASE_URL')
            supabase_key = os.environ.get('SUPABASE_ANON_KEY')

        if not supabase_url or not supabase_key:
            return jsonify({'success': False, 'error': 'Storage configuration missing'}), 500

        supabase = create_client(supabase_url, supabase_key)

        # Upload to inventory-files bucket
        bucket = supabase.storage.from_('inventory-files')
        try:
            response = bucket.upload(
                unique_filename,
                file_content,
                {"content-type": content_type, "upsert": "false"}
            )
        except Exception as upload_error:
            return jsonify({'success': False, 'error': f'Upload failed: {str(upload_error)}'}), 500

        # Get public URL
        public_url = bucket.get_public_url(unique_filename)

        # Update ARDN record with delivery note URL
        ardn.delivery_note_url = public_url
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Delivery note uploaded successfully',
            'data': {
                'ardn_id': ardn_id,
                'ardn_number': ardn.ardn_number,
                'delivery_note_url': public_url,
                'filename': filename,
                'file_size': file_size
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def receive_return_note(ardn_id):
    """Mark return note as received at store"""
    try:
        from flask import g
        data = request.json
        # Get user info from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')

        ardn = AssetReturnDeliveryNote.query.get(ardn_id)
        if not ardn:
            return jsonify({'success': False, 'error': 'Return note not found'}), 404

        if ardn.status != 'IN_TRANSIT':
            return jsonify({'success': False, 'error': f'Cannot receive. Current status: {ardn.status}'}), 400

        ardn.status = 'RECEIVED'
        ardn.accepted_by = data.get('accepted_by', user_name)
        ardn.accepted_by_id = int(user_id) if user_id else None
        ardn.accepted_at = datetime.utcnow()
        ardn.acceptance_notes = data.get('notes')

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Return note {ardn.ardn_number} received at store',
            'data': ardn.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def process_return_note(ardn_id):
    """Process return note - verify each item and decide fate"""
    try:
        from flask import g
        data = request.json
        # Get user info from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')

        ardn = AssetReturnDeliveryNote.query.get(ardn_id)
        if not ardn:
            return jsonify({'success': False, 'error': 'Return note not found'}), 404

        if ardn.status not in ['RECEIVED', 'IN_TRANSIT']:
            return jsonify({'success': False, 'error': f'Cannot process. Current status: {ardn.status}'}), 400

        # Process each item
        items_data = data.get('items', [])
        for item_data in items_data:
            ardn_item = AssetReturnDeliveryNoteItem.query.get(item_data['return_item_id'])
            if not ardn_item or ardn_item.ardn_id != ardn_id:
                continue

            # Update PM verification
            ardn_item.verified_condition = item_data.get('verified_condition', ardn_item.reported_condition)
            ardn_item.pm_notes = item_data.get('pm_notes')
            ardn_item.action_taken = item_data['action_taken']
            ardn_item.quantity_accepted = item_data.get('quantity_accepted', ardn_item.quantity)
            ardn_item.acceptance_status = 'ACCEPTED'

            # Get category for inventory update
            category = ReturnableAssetCategory.query.with_for_update().get(ardn_item.category_id)

            # Handle based on action
            if item_data['action_taken'] == 'return_to_stock':
                # Return to inventory
                if category.tracking_mode == 'quantity':
                    category.available_quantity = (category.available_quantity or 0) + ardn_item.quantity
                else:
                    asset_item = ReturnableAssetItem.query.get(ardn_item.asset_item_id)
                    if asset_item:
                        asset_item.current_status = 'available'
                        asset_item.current_project_id = None
                        asset_item.current_condition = item_data.get('verified_condition', 'good')
                        category.available_quantity = (category.available_quantity or 0) + 1

            elif item_data['action_taken'] == 'send_to_repair':
                # Create maintenance record
                maintenance = AssetMaintenance(
                    category_id=ardn_item.category_id,
                    item_id=ardn_item.asset_item_id,
                    quantity=ardn_item.quantity if category.tracking_mode == 'quantity' else 1,
                    issue_description=ardn_item.damage_description or item_data.get('pm_notes', 'Needs repair'),
                    reported_by=user_name,
                    status='pending',
                    created_by=user_name
                )
                db.session.add(maintenance)
                db.session.flush()
                ardn_item.maintenance_id = maintenance.maintenance_id

                # Update item status if individual
                if category.tracking_mode == 'individual' and ardn_item.asset_item_id:
                    asset_item = ReturnableAssetItem.query.get(ardn_item.asset_item_id)
                    if asset_item:
                        asset_item.current_status = 'maintenance'
                        asset_item.current_project_id = None

            elif item_data['action_taken'] in ['dispose', 'write_off']:
                # Create disposal request for TD approval (don't directly reduce inventory)
                # Note: Inventory reduction is deferred until TD approves the disposal request.
                # See asset_disposal_controller.py approve_disposal()

                # Check for existing pending disposal request to avoid duplicates
                existing_disposal = AssetDisposal.query.filter_by(
                    return_item_id=ardn_item.return_item_id,
                    status='pending_review'
                ).first()
                if existing_disposal:
                    # Already has pending disposal request, just update action
                    ardn_item.action_taken = 'pending_disposal'
                    continue

                # Determine disposal reason from verified condition
                verified = ardn_item.verified_condition or ardn_item.reported_condition
                if verified == 'damaged':
                    disposal_reason = 'damaged'
                elif verified == 'lost':
                    disposal_reason = 'lost'
                else:
                    disposal_reason = 'damaged'  # Default

                # Calculate estimated value
                unit_price = category.unit_price or 0
                estimated_value = unit_price * ardn_item.quantity

                # Create AssetDisposal record for TD approval
                disposal = AssetDisposal(
                    return_item_id=ardn_item.return_item_id,
                    category_id=ardn_item.category_id,
                    asset_item_id=ardn_item.asset_item_id,
                    quantity=ardn_item.quantity,
                    disposal_reason=disposal_reason,
                    justification=ardn_item.damage_description or item_data.get('pm_notes', ''),
                    estimated_value=estimated_value,
                    requested_by=user_name,
                    requested_by_id=user_id,
                    status='pending_review',
                    source_type='return',
                    source_ardn_id=ardn_id,
                    project_id=ardn.project_id
                )
                db.session.add(disposal)

                # Set action to pending_disposal (will change to 'dispose' when TD approves)
                ardn_item.action_taken = 'pending_disposal'

                # Update individual asset item status if applicable
                if category.tracking_mode == 'individual' and ardn_item.asset_item_id:
                    asset_item = ReturnableAssetItem.query.get(ardn_item.asset_item_id)
                    if asset_item:
                        asset_item.current_status = 'pending_disposal'
                        asset_item.current_project_id = None

            # Update original ADN item if linked
            if ardn_item.original_adn_item_id:
                adn_item = AssetDeliveryNoteItem.query.get(ardn_item.original_adn_item_id)
                if adn_item:
                    adn_item.quantity_returned = (adn_item.quantity_returned or 0) + ardn_item.quantity
                    if adn_item.quantity_returned >= adn_item.quantity:
                        adn_item.status = 'fully_returned'
                    else:
                        adn_item.status = 'partial_return'

        # Update ARDN status
        ardn.status = 'PROCESSED'
        ardn.processed_by = user_name
        ardn.processed_by_id = int(user_id) if user_id else None
        ardn.processed_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Return note {ardn.ardn_number} processed successfully',
            'data': ardn.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# DASHBOARD & UTILITY ENDPOINTS
# ============================================================================

def get_dn_dashboard():
    """Get dashboard stats for asset DN/RDN flow"""
    try:
        # ADN stats
        total_adns = AssetDeliveryNote.query.count()
        draft_adns = AssetDeliveryNote.query.filter_by(status='DRAFT').count()
        in_transit_adns = AssetDeliveryNote.query.filter_by(status='IN_TRANSIT').count()
        delivered_adns = AssetDeliveryNote.query.filter_by(status='DELIVERED').count()

        # ARDN stats
        total_ardns = AssetReturnDeliveryNote.query.count()
        pending_ardns = AssetReturnDeliveryNote.query.filter(
            AssetReturnDeliveryNote.status.in_(['DRAFT', 'ISSUED', 'IN_TRANSIT', 'RECEIVED'])
        ).count()
        processed_ardns = AssetReturnDeliveryNote.query.filter_by(status='PROCESSED').count()

        # Asset category stats
        categories = ReturnableAssetCategory.query.filter_by(is_active=True).all()
        total_available = sum(c.available_quantity or 0 for c in categories)
        total_dispatched = sum((c.total_quantity or 0) - (c.available_quantity or 0) for c in categories)

        # Stock In stats
        total_stock_ins = AssetStockIn.query.count()

        return jsonify({
            'success': True,
            'data': {
                'delivery_notes': {
                    'total': total_adns,
                    'draft': draft_adns,
                    'in_transit': in_transit_adns,
                    'delivered': delivered_adns
                },
                'return_notes': {
                    'total': total_ardns,
                    'pending': pending_ardns,
                    'processed': processed_ardns
                },
                'inventory': {
                    'total_available': total_available,
                    'total_dispatched': total_dispatched,
                    'categories_count': len(categories)
                },
                'stock_ins': {
                    'total': total_stock_ins
                }
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def get_available_for_dispatch():
    """Get assets available for dispatch"""
    try:
        # Get quantity-based categories with available stock
        quantity_categories = ReturnableAssetCategory.query.filter(
            ReturnableAssetCategory.is_active == True,
            ReturnableAssetCategory.tracking_mode == 'quantity',
            ReturnableAssetCategory.available_quantity > 0
        ).all()

        # Get individual items that are available
        individual_items = ReturnableAssetItem.query.join(
            ReturnableAssetCategory
        ).filter(
            ReturnableAssetCategory.is_active == True,
            ReturnableAssetCategory.tracking_mode == 'individual',
            ReturnableAssetItem.current_status == 'available',
            ReturnableAssetItem.is_active == True
        ).all()

        result = {
            'quantity_based': [c.to_dict() for c in quantity_categories],
            'individual_items': [i.to_dict() for i in individual_items]
        }

        return jsonify({
            'success': True,
            'data': result
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def get_project_dispatched_assets(project_id):
    """Get assets dispatched to a specific project (for creating return notes)"""
    try:
        # Get delivered ADNs for this project
        adns = AssetDeliveryNote.query.filter(
            AssetDeliveryNote.project_id == project_id,
            AssetDeliveryNote.status.in_(['DELIVERED', 'IN_TRANSIT'])
        ).all()

        dispatched_items = []
        for adn in adns:
            for item in adn.items:
                # Calculate remaining quantity (not yet returned)
                remaining = item.quantity - (item.quantity_returned or 0)
                if remaining > 0:
                    item_dict = item.to_dict()
                    item_dict['adn_number'] = adn.adn_number
                    item_dict['adn_id'] = adn.adn_id
                    item_dict['delivery_date'] = adn.delivery_date.isoformat() if adn.delivery_date else None
                    item_dict['remaining_quantity'] = remaining
                    dispatched_items.append(item_dict)

        return jsonify({
            'success': True,
            'data': dispatched_items
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# STOCK IN DOCUMENT UPLOAD ENDPOINTS
# ============================================================================

def upload_stock_in_document(stock_in_id):
    """Upload a document (DN/invoice/receipt) for a stock in record to inventory-files bucket"""
    try:
        from werkzeug.utils import secure_filename
        from supabase import create_client
        import uuid
        import os

        # Get the stock in record
        stock_in = AssetStockIn.query.get(stock_in_id)
        if not stock_in:
            return jsonify({'success': False, 'error': 'Stock in record not found'}), 404

        # Get file from request
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        # Validate file type
        filename = secure_filename(file.filename)
        allowed_extensions = {'pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'xlsx'}
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        if ext not in allowed_extensions:
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Allowed: pdf, doc, docx, jpg, jpeg, png, xlsx'
            }), 400

        # Read file content
        file_content = file.read()
        file_size = len(file_content)

        # Check file size (max 10MB - inventory-files bucket limit)
        max_size = 10 * 1024 * 1024
        if file_size > max_size:
            return jsonify({
                'success': False,
                'error': 'File too large. Maximum size is 10MB'
            }), 400

        if file_size == 0:
            return jsonify({'success': False, 'error': 'File is empty'}), 400

        # Create unique filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_id = str(uuid.uuid4())[:8]
        unique_filename = f"asset-stock-in/{stock_in.stock_in_number}/{timestamp}_{unique_id}_{filename}"

        # Get content type
        content_type = file.content_type or 'application/octet-stream'

        # Initialize Supabase client based on ENVIRONMENT variable
        environment = os.environ.get('ENVIRONMENT', 'production')
        if environment == 'development':
            supabase_url = os.environ.get('DEV_SUPABASE_URL')
            supabase_key = os.environ.get('DEV_SUPABASE_ANON_KEY')
        else:
            supabase_url = os.environ.get('SUPABASE_URL')
            supabase_key = os.environ.get('SUPABASE_ANON_KEY')

        if not supabase_url or not supabase_key:
            return jsonify({'success': False, 'error': 'Storage configuration missing'}), 500

        supabase = create_client(supabase_url, supabase_key)

        # Upload to inventory-files bucket (same as inventory materials)
        bucket = supabase.storage.from_('inventory-files')
        try:
            response = bucket.upload(
                unique_filename,
                file_content,
                {"content-type": content_type, "upsert": "false"}
            )
        except Exception as upload_error:
            return jsonify({'success': False, 'error': f'Upload failed: {str(upload_error)}'}), 500

        # Get public URL
        public_url = bucket.get_public_url(unique_filename)

        # Update stock in record with document URL
        stock_in.document_url = public_url
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Document uploaded successfully',
            'data': {
                'stock_in_id': stock_in_id,
                'stock_in_number': stock_in.stock_in_number,
                'document_url': public_url,
                'filename': filename,
                'file_size': file_size
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def get_stock_in_document(stock_in_id):
    """Get document URL for a stock in record"""
    try:
        stock_in = AssetStockIn.query.get(stock_in_id)
        if not stock_in:
            return jsonify({'success': False, 'error': 'Stock in record not found'}), 404

        return jsonify({
            'success': True,
            'data': {
                'stock_in_id': stock_in_id,
                'stock_in_number': stock_in.stock_in_number,
                'document_url': stock_in.document_url,
                'has_document': stock_in.document_url is not None
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def delete_stock_in_document(stock_in_id):
    """Delete document for a stock in record"""
    try:
        stock_in = AssetStockIn.query.get(stock_in_id)
        if not stock_in:
            return jsonify({'success': False, 'error': 'Stock in record not found'}), 404

        if not stock_in.document_url:
            return jsonify({'success': False, 'error': 'No document to delete'}), 400

        # Clear the document URL
        old_url = stock_in.document_url
        stock_in.document_url = None
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Document deleted successfully',
            'data': {
                'stock_in_id': stock_in_id,
                'deleted_url': old_url
            }
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# PDF DOWNLOAD ENDPOINTS
# ============================================================================

def download_asset_delivery_note(adn_id):
    """Generate and download Asset Delivery Note PDF"""
    try:
        from flask import send_file
        from utils.asset_dn_pdf_generator import AssetDNPDFGenerator

        # Get ADN with items
        adn = AssetDeliveryNote.query.get(adn_id)
        if not adn:
            return jsonify({'success': False, 'error': 'Delivery note not found'}), 404

        # Get project details
        project = Project.query.get(adn.project_id)
        if not project:
            return jsonify({'success': False, 'error': 'Project not found'}), 404

        # Prepare ADN data
        adn_data = {
            'adn_number': adn.adn_number,
            'delivery_date': adn.delivery_date.isoformat() if adn.delivery_date else None,
            'attention_to': adn.attention_to,
            'delivery_from': adn.delivery_from or 'M2 Store',
            'vehicle_number': adn.vehicle_number,
            'driver_name': adn.driver_name,
            'transport_fee': adn.transport_fee,
            'notes': adn.notes,
        }

        # Prepare project data
        project_data = {
            'project_name': project.project_name,
            'location': project.location or adn.site_location or '',
        }

        # Prepare items data - batch load categories
        category_ids = list(set(item.category_id for item in adn.items))
        categories = ReturnableAssetCategory.query.filter(
            ReturnableAssetCategory.category_id.in_(category_ids)
        ).all()
        category_map = {c.category_id: c for c in categories}

        # Batch load asset items for individual tracking
        asset_item_ids = [item.asset_item_id for item in adn.items if item.asset_item_id]
        asset_items = {}
        if asset_item_ids:
            items = ReturnableAssetItem.query.filter(
                ReturnableAssetItem.item_id.in_(asset_item_ids)
            ).all()
            asset_items = {i.item_id: i for i in items}

        items_data = []
        for item in adn.items:
            category = category_map.get(item.category_id)
            asset_item = asset_items.get(item.asset_item_id) if item.asset_item_id else None

            item_dict = {
                'category_name': category.category_name if category else 'Unknown',
                'item_code': asset_item.item_code if asset_item else None,
                'serial_number': asset_item.serial_number if asset_item else None,
                'quantity': item.quantity,
                'condition_at_dispatch': item.condition_at_dispatch or 'Good',
                'notes': item.notes,
            }
            items_data.append(item_dict)

        # Generate PDF
        generator = AssetDNPDFGenerator()
        pdf_buffer = generator.generate_pdf(adn_data, project_data, items_data)

        # Return PDF file
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'{adn.adn_number}.pdf'
        )

    except Exception as e:
        logger.error(f"Error generating ADN PDF: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


def download_asset_return_note(ardn_id):
    """Generate and download Asset Return Delivery Note (ARDN) PDF"""
    try:
        from flask import send_file
        from utils.rdn_pdf_generator import RDNPDFGenerator

        # Get ARDN with items
        ardn = AssetReturnDeliveryNote.query.get(ardn_id)
        if not ardn:
            return jsonify({'success': False, 'error': 'Return note not found'}), 404

        # Get project details
        project = Project.query.get(ardn.project_id)
        if not project:
            return jsonify({'success': False, 'error': 'Project not found'}), 404

        # Get actual user name - use helper to resolve 'System' values
        returned_by_name = resolve_user_name(
            ardn.returned_by or ardn.prepared_by,
            ardn.returned_by_id or ardn.prepared_by_id
        )

        # Prepare ARDN data (mapped to RDN format)
        rdn_data = {
            'return_note_number': ardn.ardn_number,
            'return_date': ardn.return_date.isoformat() if ardn.return_date else None,
            'returned_by': returned_by_name or '-',
            'vehicle_number': ardn.vehicle_number,
            'driver_name': ardn.driver_name,
            'driver_contact': ardn.driver_contact,
            'transport_fee': ardn.transport_fee,
            'notes': ardn.notes,
        }

        # Prepare project data
        project_data = {
            'project_name': project.project_name,
            'project_location': project.location or ardn.site_location or '',
        }

        # Prepare items data - batch load categories
        category_ids = list(set(item.category_id for item in ardn.items))
        categories = ReturnableAssetCategory.query.filter(
            ReturnableAssetCategory.category_id.in_(category_ids)
        ).all()
        category_map = {c.category_id: c for c in categories}

        # Batch load asset items for individual tracking
        asset_item_ids = [item.asset_item_id for item in ardn.items if item.asset_item_id]
        asset_items = {}
        if asset_item_ids:
            items = ReturnableAssetItem.query.filter(
                ReturnableAssetItem.item_id.in_(asset_item_ids)
            ).all()
            asset_items = {i.item_id: i for i in items}

        items_data = []
        for item in ardn.items:
            category = category_map.get(item.category_id)
            asset_item = asset_items.get(item.asset_item_id) if item.asset_item_id else None

            # Map condition to display text
            condition_map = {
                'ok': 'Good',
                'damaged': 'Damaged',
                'needs_repair': 'Needs Repair',
                'lost': 'Lost',
                'good': 'Good',
                'fair': 'Fair',
                'poor': 'Poor'
            }

            item_dict = {
                'material_name': category.category_name if category else 'Unknown',
                'material_code': asset_item.item_code if asset_item else None,
                'quantity': item.quantity,
                'unit': 'pcs',
                'condition': condition_map.get(item.reported_condition, item.reported_condition or 'Good'),
                'return_reason': item.damage_description or item.return_notes or '',
            }
            items_data.append(item_dict)

        # Generate PDF
        generator = RDNPDFGenerator()
        pdf_buffer = generator.generate_pdf(rdn_data, project_data, items_data)

        # Return PDF file
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'{ardn.ardn_number}.pdf'
        )

    except Exception as e:
        logger.error(f"Error generating ARDN PDF: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# SITE ENGINEER ENDPOINTS - View dispatched assets from ADN
# ============================================================================

def get_se_dispatched_assets():
    """Get all dispatched assets for the Site Engineer's projects from ADN flow"""
    try:
        from flask import g
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import or_

        # Get user from JWT token (set by @jwt_required decorator)
        user_id = g.user.get('user_id')

        logger.info(f"SE dispatched-assets request for user_id: {user_id}")

        # Get projects assigned to this SE via pm_assign_ss table
        # Check both ss_ids array AND assigned_to_se_id
        pm_assignments = PMAssignSS.query.filter(
            PMAssignSS.is_deleted == False,
            or_(
                PMAssignSS.ss_ids.contains([user_id]),
                PMAssignSS.assigned_to_se_id == user_id
            )
        ).all()
        pm_project_ids = list(set(a.project_id for a in pm_assignments if a.project_id))
        logger.info(f"PM assigned project IDs: {pm_project_ids}")

        # Build query conditions - check Project.site_supervisor_id OR pm_assign_ss
        conditions = [Project.site_supervisor_id == user_id]
        if pm_project_ids:
            conditions.append(Project.project_id.in_(pm_project_ids))

        my_projects = Project.query.filter(or_(*conditions)).all()
        logger.info(f"Found {len(my_projects)} projects for SE: {[p.project_name for p in my_projects]}")

        if not my_projects:
            return jsonify({
                'success': True,
                'data': {
                    'pending_receipt': [],
                    'received': [],
                    'total_dispatched': 0
                }
            })

        project_ids = [p.project_id for p in my_projects]
        projects_map = {p.project_id: p for p in my_projects}

        # Get all ADNs that are IN_TRANSIT, PARTIAL, or DELIVERED for SE's projects
        adns = AssetDeliveryNote.query.filter(
            AssetDeliveryNote.project_id.in_(project_ids),
            AssetDeliveryNote.status.in_(['IN_TRANSIT', 'PARTIAL', 'DELIVERED'])
        ).order_by(AssetDeliveryNote.created_at.desc()).all()

        # Batch load categories
        all_category_ids = set()
        all_asset_item_ids = set()
        for adn in adns:
            for item in adn.items:
                all_category_ids.add(item.category_id)
                if item.asset_item_id:
                    all_asset_item_ids.add(item.asset_item_id)

        categories = ReturnableAssetCategory.query.filter(
            ReturnableAssetCategory.category_id.in_(all_category_ids)
        ).all() if all_category_ids else []
        category_map = {c.category_id: c for c in categories}

        asset_items = ReturnableAssetItem.query.filter(
            ReturnableAssetItem.item_id.in_(all_asset_item_ids)
        ).all() if all_asset_item_ids else []
        asset_item_map = {a.item_id: a for a in asset_items}

        pending_receipt = []
        received = []

        for adn in adns:
            project = projects_map.get(adn.project_id)

            for item in adn.items:
                # Skip fully returned items
                remaining_qty = item.quantity - (item.quantity_returned or 0)
                if remaining_qty <= 0:
                    continue

                category = category_map.get(item.category_id)
                asset_item = asset_item_map.get(item.asset_item_id) if item.asset_item_id else None

                # Use item-level is_received for selective receive support
                item_is_received = getattr(item, 'is_received', False) or False

                item_data = {
                    'adn_id': adn.adn_id,
                    'adn_number': adn.adn_number,
                    'adn_item_id': item.item_id,  # Primary key of AssetDeliveryNoteItem
                    'adn_status': adn.status,  # ADN-level status (IN_TRANSIT, PARTIAL, DELIVERED)
                    'receiver_notes': adn.receiver_notes,  # Notes from partial receive
                    'category_id': item.category_id,
                    'category_code': category.category_code if category else None,
                    'category_name': category.category_name if category else 'Unknown',
                    'asset_item_id': item.asset_item_id,
                    'item_code': asset_item.item_code if asset_item else None,
                    'serial_number': asset_item.serial_number if asset_item else None,
                    'project_id': adn.project_id,
                    'project_name': project.project_name if project else None,
                    'quantity': remaining_qty,
                    'condition': item.condition_at_dispatch,
                    'dispatched_at': adn.dispatched_at.isoformat() if adn.dispatched_at else adn.created_at.isoformat(),
                    'dispatched_by': adn.dispatched_by or adn.prepared_by,
                    'delivery_date': adn.delivery_date.isoformat() if adn.delivery_date else None,
                    'is_received': item_is_received,
                    'received_at': item.received_at.isoformat() if getattr(item, 'received_at', None) else (adn.received_at.isoformat() if adn.received_at else None),
                    'received_by': getattr(item, 'received_by', None) or adn.received_by
                }

                # Use item-level is_received for sorting into lists
                if item_is_received:
                    received.append(item_data)
                else:
                    pending_receipt.append(item_data)

        return jsonify({
            'success': True,
            'data': {
                'pending_receipt': pending_receipt,
                'received': received,
                'total_dispatched': len(pending_receipt) + len(received)
            }
        })

    except Exception as e:
        import traceback
        logger.error(f"Error fetching SE dispatched assets: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


def se_receive_adn(adn_id):
    """SE marks an entire ADN as received (all items)"""
    try:
        from flask import g

        # Get user from JWT token (set by @jwt_required decorator)
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')
        data = request.json or {}

        adn = AssetDeliveryNote.query.get(adn_id)
        if not adn:
            return jsonify({'success': False, 'error': 'Delivery note not found'}), 404

        if adn.status not in ['IN_TRANSIT', 'PARTIAL']:
            return jsonify({'success': False, 'error': f'Cannot receive. Current status: {adn.status}'}), 400

        now = datetime.utcnow()

        # Mark all items as received
        for item in adn.items:
            if not item.is_received:
                item.is_received = True
                item.received_at = now
                item.received_by = user_name
                item.received_by_id = user_id

        adn.status = 'DELIVERED'
        adn.received_by = data.get('received_by', user_name)
        adn.received_by_id = user_id
        adn.received_at = now
        adn.receiver_notes = data.get('notes')

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Delivery note {adn.adn_number} received successfully',
            'data': adn.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


def se_receive_selected_items():
    """SE marks selected ADN items as received (selective receive)"""
    try:
        from flask import g

        # Get user from JWT token
        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')
        data = request.json or {}

        adn_id = data.get('adn_id')
        item_ids = data.get('item_ids', [])

        if not adn_id:
            return jsonify({'success': False, 'error': 'adn_id is required'}), 400

        if not item_ids:
            return jsonify({'success': False, 'error': 'item_ids array is required'}), 400

        adn = AssetDeliveryNote.query.get(adn_id)
        if not adn:
            return jsonify({'success': False, 'error': 'Delivery note not found'}), 404

        if adn.status not in ['IN_TRANSIT', 'PARTIAL']:
            return jsonify({'success': False, 'error': f'Cannot receive. Current status: {adn.status}'}), 400

        # Mark selected items as received
        received_count = 0
        now = datetime.utcnow()

        for item in adn.items:
            if item.item_id in item_ids and not item.is_received:
                item.is_received = True
                item.received_at = now
                item.received_by = user_name
                item.received_by_id = user_id
                received_count += 1

        # Check if all items are now received
        all_received = all(item.is_received for item in adn.items)
        some_received = any(item.is_received for item in adn.items)

        if all_received:
            adn.status = 'DELIVERED'
            adn.received_by = user_name
            adn.received_by_id = user_id
            adn.received_at = now
        elif some_received:
            adn.status = 'PARTIAL'

        adn.receiver_notes = data.get('notes')

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'{received_count} item(s) marked as received',
            'data': {
                'adn_id': adn.adn_id,
                'adn_number': adn.adn_number,
                'status': adn.status,
                'all_received': all_received,
                'received_count': received_count,
                'total_items': len(adn.items)
            }
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error receiving selected items: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================================
# ASSET REPAIR MANAGEMENT ENDPOINTS
# ============================================================================

def get_asset_repair_items():
    """Get all asset items sent for repair from ARDNs

    Query params:
    - status: 'pending' (default) for items currently in repair,
              'completed' for repaired items returned to stock,
              'disposed' for disposed items,
              'all' for all repair-related items
    """
    try:
        status = request.args.get('status', 'pending')

        # Build query based on status
        if status == 'pending':
            # Items currently in repair
            items = AssetReturnDeliveryNoteItem.query.filter(
                AssetReturnDeliveryNoteItem.action_taken == 'send_to_repair'
            ).all()
        elif status == 'completed':
            # Items that were repaired (pm_notes contains "[Repair completed")
            items = AssetReturnDeliveryNoteItem.query.filter(
                AssetReturnDeliveryNoteItem.action_taken == 'return_to_stock',
                AssetReturnDeliveryNoteItem.pm_notes.like('%[Repair completed%')
            ).all()
        elif status == 'disposed':
            # Items disposed from repair (TD approved disposal)
            items = AssetReturnDeliveryNoteItem.query.filter(
                AssetReturnDeliveryNoteItem.action_taken == 'dispose',
                AssetReturnDeliveryNoteItem.pm_notes.like('%[Disposal approved by TD%')
            ).all()
        elif status == 'history':
            # All completed repairs and TD-approved disposals (excludes pending_disposal)
            from sqlalchemy import or_
            items = AssetReturnDeliveryNoteItem.query.filter(
                or_(
                    db.and_(
                        AssetReturnDeliveryNoteItem.action_taken == 'return_to_stock',
                        AssetReturnDeliveryNoteItem.pm_notes.like('%[Repair completed%')
                    ),
                    db.and_(
                        AssetReturnDeliveryNoteItem.action_taken == 'dispose',
                        AssetReturnDeliveryNoteItem.pm_notes.like('%[Disposal approved by TD%')
                    )
                )
            ).all()
        else:
            # All items (pending repairs + history, excludes pending_disposal)
            from sqlalchemy import or_
            items = AssetReturnDeliveryNoteItem.query.filter(
                or_(
                    AssetReturnDeliveryNoteItem.action_taken == 'send_to_repair',
                    db.and_(
                        AssetReturnDeliveryNoteItem.action_taken == 'return_to_stock',
                        AssetReturnDeliveryNoteItem.pm_notes.like('%[Repair completed%')
                    ),
                    db.and_(
                        AssetReturnDeliveryNoteItem.action_taken == 'dispose',
                        AssetReturnDeliveryNoteItem.pm_notes.like('%[Disposal approved by TD%')
                    )
                )
            ).all()

        # Batch load related data
        ardn_ids = list(set(item.ardn_id for item in items))
        ardns = {ardn.ardn_id: ardn for ardn in AssetReturnDeliveryNote.query.filter(
            AssetReturnDeliveryNote.ardn_id.in_(ardn_ids)
        ).all()} if ardn_ids else {}

        project_ids = list(set(ardn.project_id for ardn in ardns.values()))
        projects = batch_load_projects(project_ids)

        result = []
        for item in items:
            ardn = ardns.get(item.ardn_id)
            project = projects.get(ardn.project_id) if ardn else None

            result.append({
                'return_item_id': item.return_item_id,
                'ardn_id': item.ardn_id,
                'ardn_number': ardn.ardn_number if ardn else None,
                'category_id': item.category_id,
                'category_name': item.category.category_name if item.category else None,
                'category_code': item.category.category_code if item.category else None,
                'item_code': item.asset_item.item_code if item.asset_item else None,
                'serial_number': item.asset_item.serial_number if item.asset_item else None,
                'quantity': item.quantity,
                'reported_condition': item.reported_condition,
                'verified_condition': item.verified_condition,
                'damage_description': item.damage_description,
                'pm_notes': item.pm_notes,
                'action_taken': item.action_taken,
                'project_id': ardn.project_id if ardn else None,
                'project_name': project.project_name if project else None,
                'return_date': ardn.return_date.isoformat() if ardn and ardn.return_date else None,
                'processed_at': ardn.processed_at.isoformat() if ardn and ardn.processed_at else None,
                'maintenance_id': item.maintenance_id,
                # Repair status based on maintenance_id
                'repair_status': 'completed' if item.maintenance_id else 'pending'
            })

        return jsonify({
            'success': True,
            'data': result
        })

    except Exception as e:
        logger.error(f"Error fetching repair items: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


def complete_asset_repair(return_item_id):
    """Mark asset repair as complete and return to stock"""
    try:
        from flask import g
        data = request.json or {}

        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'

        item = AssetReturnDeliveryNoteItem.query.get(return_item_id)
        if not item:
            return jsonify({'success': False, 'error': 'Item not found'}), 404

        if item.action_taken != 'send_to_repair':
            return jsonify({'success': False, 'error': 'Item is not sent for repair'}), 400

        # Update inventory - add back to available stock
        if item.category:
            item.category.available_quantity = (item.category.available_quantity or 0) + item.quantity

        # Update item
        item.action_taken = 'return_to_stock'
        item.pm_notes = (item.pm_notes or '') + f"\n[Repair completed by {user_name}]"

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Repair completed and item returned to stock'
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error completing repair: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


def dispose_unrepairable_asset(return_item_id):
    """Mark unrepairable asset for disposal - creates disposal request for TD approval"""
    try:
        from flask import g
        data = request.json or {}

        user_name = g.user.get('full_name') or g.user.get('email') or 'Unknown'
        user_id = g.user.get('user_id')
        reason = data.get('reason', 'Cannot be repaired')

        item = AssetReturnDeliveryNoteItem.query.get(return_item_id)
        if not item:
            return jsonify({'success': False, 'error': 'Item not found'}), 404

        if item.action_taken != 'send_to_repair':
            return jsonify({'success': False, 'error': 'Item is not sent for repair'}), 400

        # Get category for estimated value calculation
        category = ReturnableAssetCategory.query.get(item.category_id)
        estimated_value = (category.unit_price or 0) * (item.quantity or 1) if category else 0

        # Get ARDN for project info
        ardn = AssetReturnDeliveryNote.query.get(item.ardn_id)
        project_id = ardn.project_id if ardn else None

        # Create disposal request in asset_disposal table for TD approval
        disposal = AssetDisposal(
            return_item_id=return_item_id,
            category_id=item.category_id,
            asset_item_id=item.asset_item_id,
            quantity=item.quantity or 1,
            disposal_reason='unrepairable',
            justification=reason,
            estimated_value=estimated_value,
            image_url=item.photo_url,
            requested_by=user_name,
            requested_by_id=user_id,
            source_type='repair',
            source_ardn_id=item.ardn_id,
            project_id=project_id,
            status='pending_review'
        )
        db.session.add(disposal)

        # Update item to pending disposal (awaiting TD approval)
        item.action_taken = 'pending_disposal'
        item.pm_notes = (item.pm_notes or '') + f"\n[Disposal requested by {user_name}: {reason}]"

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Disposal request sent to TD for approval',
            'disposal_id': disposal.disposal_id
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating disposal request: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


def get_se_movement_history():
    """Get ADN/ARDN movement history for SE's assigned projects"""
    try:
        user_id = g.user.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        limit = request.args.get('limit', 50, type=int)
        project_id_filter = request.args.get('project_id', type=int)

        # Get SE's assigned projects
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import or_

        pm_assignments = PMAssignSS.query.filter(
            PMAssignSS.is_deleted == False,
            or_(
                PMAssignSS.ss_ids.contains([user_id]),
                PMAssignSS.assigned_to_se_id == user_id
            )
        ).all()
        pm_project_ids = list(set(a.project_id for a in pm_assignments if a.project_id))

        # Also check Project.site_supervisor_id
        conditions = [Project.site_supervisor_id == user_id]
        if pm_project_ids:
            conditions.append(Project.project_id.in_(pm_project_ids))

        my_projects = Project.query.filter(or_(*conditions)).all()
        project_ids = [p.project_id for p in my_projects]
        projects_map = {p.project_id: p for p in my_projects}

        if not project_ids:
            return jsonify({
                'success': True,
                'data': {'movements': []}
            })

        # Apply project filter if specified
        if project_id_filter:
            if project_id_filter in project_ids:
                project_ids = [project_id_filter]
            else:
                return jsonify({
                    'success': True,
                    'data': {'movements': []}
                })

        movements = []

        # Get ADNs (Dispatches) for SE's projects
        adns = AssetDeliveryNote.query.filter(
            AssetDeliveryNote.project_id.in_(project_ids),
            AssetDeliveryNote.status.in_(['IN_TRANSIT', 'PARTIAL', 'DELIVERED'])
        ).order_by(AssetDeliveryNote.created_at.desc()).limit(limit).all()

        # Batch load categories for ADN items
        all_category_ids = set()
        all_asset_item_ids = set()
        for adn in adns:
            for item in adn.items:
                all_category_ids.add(item.category_id)
                if item.asset_item_id:
                    all_asset_item_ids.add(item.asset_item_id)

        categories = ReturnableAssetCategory.query.filter(
            ReturnableAssetCategory.category_id.in_(all_category_ids)
        ).all() if all_category_ids else []
        category_map = {c.category_id: c for c in categories}

        asset_items = ReturnableAssetItem.query.filter(
            ReturnableAssetItem.item_id.in_(all_asset_item_ids)
        ).all() if all_asset_item_ids else []
        asset_item_map = {a.item_id: a for a in asset_items}

        # Convert ADNs to movement records
        for adn in adns:
            project = projects_map.get(adn.project_id)
            for item in adn.items:
                category = category_map.get(item.category_id)
                asset_item = asset_item_map.get(item.asset_item_id) if item.asset_item_id else None

                movements.append({
                    'movement_id': adn.adn_id * 100000 + item.item_id,  # Unique numeric ID
                    'movement_type': 'DISPATCH',
                    'category_name': category.category_name if category else 'Unknown',
                    'category_code': category.category_code if category else None,
                    'item_code': asset_item.item_code if asset_item else None,
                    'serial_number': asset_item.serial_number if asset_item else None,
                    'project_id': adn.project_id,
                    'project_name': project.project_name if project else f'Project #{adn.project_id}',
                    'quantity': item.quantity,
                    'condition_before': item.condition_at_dispatch,
                    'dispatched_at': adn.dispatched_at.isoformat() if adn.dispatched_at else adn.created_at.isoformat(),
                    'dispatched_by': adn.dispatched_by or adn.prepared_by,
                    'adn_number': adn.adn_number,
                    'adn_status': adn.status,
                    'notes': adn.notes,
                    'created_at': adn.created_at.isoformat()
                })

        # Get ARDNs (Returns) for SE's projects
        ardns = AssetReturnDeliveryNote.query.filter(
            AssetReturnDeliveryNote.project_id.in_(project_ids),
            AssetReturnDeliveryNote.status.in_(['ISSUED', 'IN_TRANSIT', 'RECEIVED', 'PROCESSED'])
        ).order_by(AssetReturnDeliveryNote.created_at.desc()).limit(limit).all()

        # Batch load categories for ARDN items
        all_category_ids = set()
        all_asset_item_ids = set()
        for ardn in ardns:
            for item in ardn.items:
                all_category_ids.add(item.category_id)
                if item.asset_item_id:
                    all_asset_item_ids.add(item.asset_item_id)

        categories = ReturnableAssetCategory.query.filter(
            ReturnableAssetCategory.category_id.in_(all_category_ids)
        ).all() if all_category_ids else []
        category_map = {c.category_id: c for c in categories}

        asset_items = ReturnableAssetItem.query.filter(
            ReturnableAssetItem.item_id.in_(all_asset_item_ids)
        ).all() if all_asset_item_ids else []
        asset_item_map = {a.item_id: a for a in asset_items}

        # Convert ARDNs to movement records
        for ardn in ardns:
            project = projects_map.get(ardn.project_id)
            # Resolve user names
            returned_by_name = resolve_user_name(
                ardn.returned_by or ardn.prepared_by,
                ardn.returned_by_id or ardn.prepared_by_id
            )

            for item in ardn.items:
                category = category_map.get(item.category_id)
                asset_item = asset_item_map.get(item.asset_item_id) if item.asset_item_id else None

                movements.append({
                    'movement_id': ardn.ardn_id * 100000 + item.return_item_id,  # Unique numeric ID
                    'movement_type': 'RETURN',
                    'category_name': category.category_name if category else 'Unknown',
                    'category_code': category.category_code if category else None,
                    'item_code': asset_item.item_code if asset_item else None,
                    'serial_number': asset_item.serial_number if asset_item else None,
                    'project_id': ardn.project_id,
                    'project_name': project.project_name if project else f'Project #{ardn.project_id}',
                    'quantity': item.quantity,
                    'condition_before': item.reported_condition,
                    'condition_after': item.verified_condition,
                    'returned_at': ardn.return_date.isoformat() if ardn.return_date else ardn.created_at.isoformat(),
                    'returned_by': returned_by_name,
                    'ardn_number': ardn.ardn_number,
                    'ardn_status': ardn.status,
                    'return_reason': ardn.return_reason,
                    'action_taken': item.action_taken,
                    'notes': item.return_notes or ardn.notes,
                    'created_at': ardn.created_at.isoformat()
                })

        # Sort by created_at descending
        movements.sort(key=lambda x: x['created_at'], reverse=True)

        # Limit to specified number
        movements = movements[:limit]

        return jsonify({
            'success': True,
            'data': {'movements': movements}
        })

    except Exception as e:
        import traceback
        logger.error(f"Error fetching SE movement history: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

def get_ss_return_notes():
    """Get list of Asset Return Delivery Notes - filtered by user's assigned projects"""
    try:
        user_id = g.user.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        status = request.args.get('status')
        project_id = request.args.get('project_id', type=int)

        # Get SE's assigned projects from pm_assign_ss table
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import or_

        se_project_ids = []
        se_assignments = db.session.query(PMAssignSS.project_id).filter(
            or_(
                PMAssignSS.ss_ids.contains([user_id]),
                PMAssignSS.assigned_to_se_id == user_id
            ),
            PMAssignSS.is_deleted == False
        ).distinct().all()

        se_project_ids = [p[0] for p in se_assignments if p[0]]

        # If no projects assigned, return empty list
        if not se_project_ids:
            return jsonify({
                'success': True,
                'data': [],
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': 0,
                    'pages': 0
                }
            }), 200

        # Filter return notes by SE's assigned projects
        query = AssetReturnDeliveryNote.query.filter(
            AssetReturnDeliveryNote.project_id.in_(se_project_ids)
        )

        if status:
            query = query.filter_by(status=status)
        if project_id:
            # Additional filter if specific project requested
            if project_id in se_project_ids:
                query = query.filter_by(project_id=project_id)
            else:
                # Requested project not assigned to this SE
                return jsonify({
                    'success': True,
                    'data': [],
                    'pagination': {
                        'page': page,
                        'per_page': per_page,
                        'total': 0,
                        'pages': 0
                    }
                }), 200

        query = query.order_by(AssetReturnDeliveryNote.created_at.desc())

        pagination = query.paginate(page=page, per_page=per_page, error_out=False)

        # Batch load projects
        project_ids = list(set(ardn.project_id for ardn in pagination.items))
        projects_map = batch_load_projects(project_ids)

        # Batch load users for resolving 'System' names
        user_ids = set()
        for ardn in pagination.items:
            if ardn.returned_by_id:
                user_ids.add(ardn.returned_by_id)
            if ardn.prepared_by_id:
                user_ids.add(ardn.prepared_by_id)
        users_map = batch_load_users(list(user_ids))

        result = []
        for ardn in pagination.items:
            ardn_dict = ardn.to_dict()
            project = projects_map.get(ardn.project_id)
            ardn_dict['project_name'] = project.project_name if project else None

            # Resolve user names if stored as 'System'
            if not ardn_dict.get('returned_by') or ardn_dict.get('returned_by') == 'System':
                user = users_map.get(ardn.returned_by_id) or users_map.get(ardn.prepared_by_id)
                if user:
                    ardn_dict['returned_by'] = user.full_name or user.email or '-'
                else:
                    ardn_dict['returned_by'] = '-'

            if not ardn_dict.get('prepared_by') or ardn_dict.get('prepared_by') == 'System':
                user = users_map.get(ardn.prepared_by_id)
                if user:
                    ardn_dict['prepared_by'] = user.full_name or user.email or '-'
                else:
                    ardn_dict['prepared_by'] = '-'

            result.append(ardn_dict)

        return jsonify({
            'success': True,
            'data': result,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500