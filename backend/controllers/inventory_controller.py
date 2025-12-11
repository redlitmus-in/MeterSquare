from flask import jsonify, request, g
from config.db import db
from models.inventory import *
from models.project import Project
from models.user import User
from models.system_settings import SystemSettings
from datetime import datetime
from utils.comprehensive_notification_service import ComprehensiveNotificationService


# ==================== HELPER FUNCTIONS ====================

def generate_material_code():
    """Auto-generate sequential material code (MAT001, MAT002, ...)"""
    try:
        # Get the last material ordered by ID
        last_material = InventoryMaterial.query.order_by(
            InventoryMaterial.inventory_material_id.desc()
        ).first()

        if last_material and last_material.material_code:
            # Extract number from last code (e.g., "MAT005" -> 5)
            last_code = last_material.material_code
            if last_code.startswith('MAT'):
                last_number = int(last_code.replace('MAT', ''))
                new_number = last_number + 1
            else:
                # Fallback if format is unexpected
                new_number = 1
        else:
            # First material ever
            new_number = 1

        # Format as MAT001, MAT002, etc. (zero-padded to 3 digits)
        return f"MAT{new_number:03d}"

    except Exception as e:
        # Fallback to timestamp-based code if something goes wrong
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        return f"MAT{timestamp}"


# ==================== CONSTANTS ====================

DELIVERY_NOTE_PREFIX = 'MDN'
MAX_STOCK_ALERTS = 10

# Material return constants
MATERIAL_CONDITIONS = ['Good', 'Damaged', 'Defective']
RETURNABLE_DN_STATUSES = ['DELIVERED']  # Only delivered materials can be returned

# Disposal status constants
DISPOSAL_PENDING_APPROVAL = 'pending_approval'
DISPOSAL_APPROVED = 'approved'
DISPOSAL_PENDING_REVIEW = 'pending_review'
DISPOSAL_APPROVED_DISPOSAL = 'approved_disposal'
DISPOSAL_DISPOSED = 'disposed'
DISPOSAL_REPAIRED = 'repaired'
DISPOSAL_REJECTED = 'rejected'


def build_returnable_material_item(delivery_note, item, material):
    """Build returnable material dictionary for a delivery note item.

    Args:
        delivery_note: MaterialDeliveryNote object
        item: DeliveryNoteItem object
        material: InventoryMaterial object

    Returns:
        dict with returnable material info, or None if nothing to return
    """
    returns = MaterialReturn.query.filter_by(
        delivery_note_item_id=item.item_id
    ).all()

    total_returned = sum(r.quantity for r in returns)
    returnable_quantity = max(0, item.quantity - total_returned)

    if returnable_quantity <= 0:
        return None

    return {
        'delivery_note_item_id': item.item_id,
        'delivery_note_id': delivery_note.delivery_note_id,
        'delivery_note_number': delivery_note.delivery_note_number,
        'delivery_date': delivery_note.delivery_date.isoformat() if delivery_note.delivery_date else None,
        'inventory_material_id': item.inventory_material_id,
        'material_code': material.material_code,
        'material_name': material.material_name,
        'brand': material.brand,
        'unit': material.unit,
        'is_returnable': material.is_returnable,
        'dispatched_quantity': item.quantity,
        'returned_quantity': total_returned,
        'returnable_quantity': returnable_quantity
    }


def validate_quantity(value, field_name='quantity'):
    """Validate that a value is a valid positive number.

    Args:
        value: The value to validate
        field_name: Name of the field for error messages

    Returns:
        tuple: (is_valid: bool, parsed_value: float or None, error_message: str or None)
    """
    if value is None:
        return False, None, f'{field_name} is required'

    try:
        parsed = float(value)
        if parsed <= 0:
            return False, None, f'{field_name} must be greater than 0'
        return True, parsed, None
    except (TypeError, ValueError):
        return False, None, f'{field_name} must be a valid number'


def get_store_name():
    """Get store name from system settings"""
    try:
        settings = SystemSettings.query.first()
        if settings and settings.store_name:
            return settings.store_name
        return 'M2 Store'  # Fallback default
    except:
        return 'M2 Store'


def get_inventory_config():
    """Get inventory configuration for frontend"""
    try:
        settings = SystemSettings.query.first()
        store_name = settings.store_name if settings and settings.store_name else 'M2 Store'
        company_name = settings.company_name if settings and settings.company_name else 'MeterSquare ERP'
        currency = settings.currency if settings and settings.currency else 'AED'

        return jsonify({
            'store_name': store_name,
            'company_name': company_name,
            'currency': currency,
            'delivery_note_prefix': DELIVERY_NOTE_PREFIX
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== ENRICHMENT HELPERS ====================

def get_project_managers(project):
    """Extract project managers from project object"""
    managers = []
    if project and project.user_id:
        pm_ids = project.user_id if isinstance(project.user_id, list) else []
        for pm_id in pm_ids:
            pm_user = User.query.get(pm_id)
            if pm_user:
                managers.append({
                    'user_id': pm_user.user_id,
                    'full_name': pm_user.full_name,
                    'email': pm_user.email
                })
    return managers


def get_mep_supervisors(project):
    """Extract MEP supervisors from project object"""
    supervisors = []
    if project and project.mep_supervisor_id:
        mep_ids = project.mep_supervisor_id if isinstance(project.mep_supervisor_id, list) else []
        for mep_id in mep_ids:
            mep_user = User.query.get(mep_id)
            if mep_user:
                supervisors.append({
                    'user_id': mep_user.user_id,
                    'full_name': mep_user.full_name,
                    'email': mep_user.email
                })
    return supervisors


def enrich_project_details(project, include_mep=True):
    """Get enriched project details including managers and supervisors"""
    if not project:
        return None
    details = {
        'project_id': project.project_id,
        'project_name': project.project_name,
        'project_code': project.project_code,
        'location': project.location,
        'project_managers': get_project_managers(project)
    }
    if include_mep:
        details['mep_managers'] = get_mep_supervisors(project)
    return details


# ==================== INVENTORY MATERIAL APIs ====================

def create_inventory_item():
    """Add a new material to MSQ inventory store"""
    try:
        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Validate required fields
        required_fields = ['material_name', 'unit']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        # Auto-generate material code
        material_code = generate_material_code()

        new_material = InventoryMaterial(
            material_code=material_code,
            material_name=data['material_name'],
            brand=data.get('brand'),
            size=data.get('size'),
            category=data.get('category'),
            unit=data['unit'],
            current_stock=data.get('current_stock', 0.0),
            min_stock_level=data.get('min_stock_level', 0.0),
            unit_price=data.get('unit_price', 0.0),
            description=data.get('description'),
            is_active=data.get('is_active', True),
            created_by=current_user,
            last_modified_by=current_user
        )

        db.session.add(new_material)
        db.session.commit()

        return jsonify({
            'message': 'Material added to inventory successfully',
            'material': new_material.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def get_all_inventory_items():
    """Get all materials in inventory with optional filters"""
    try:
        # Get query parameters
        category = request.args.get('category')
        is_active = request.args.get('is_active')
        low_stock = request.args.get('low_stock')

        query = InventoryMaterial.query

        # Apply filters
        if category:
            query = query.filter_by(category=category)
        if is_active is not None:
            query = query.filter_by(is_active=is_active.lower() == 'true')
        if low_stock and low_stock.lower() == 'true':
            query = query.filter(InventoryMaterial.current_stock <= InventoryMaterial.min_stock_level)

        materials = query.all()

        return jsonify({
            'materials': [material.to_dict() for material in materials],
            'total': len(materials)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_inventory_item_by_id(inventory_material_id):
    """Get a specific material by ID"""
    try:
        material = InventoryMaterial.query.get(inventory_material_id)

        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        material_data = material.to_dict()
        material_data['total_transactions'] = len(material.transactions)

        return jsonify({'material': material_data}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def update_inventory_item(inventory_material_id):
    """Update a material in inventory"""
    try:
        material = InventoryMaterial.query.get(inventory_material_id)

        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Update fields (material_code is immutable - cannot be changed)
        if 'material_code' in data:
            return jsonify({'error': 'Material code cannot be changed once created'}), 400

        if 'material_name' in data:
            material.material_name = data['material_name']
        if 'brand' in data:
            material.brand = data['brand']
        if 'size' in data:
            material.size = data['size']
        if 'category' in data:
            material.category = data['category']
        if 'unit' in data:
            material.unit = data['unit']
        if 'current_stock' in data:
            material.current_stock = data['current_stock']
        if 'min_stock_level' in data:
            material.min_stock_level = data['min_stock_level']
        if 'unit_price' in data:
            material.unit_price = data['unit_price']
        if 'description' in data:
            material.description = data['description']
        if 'is_active' in data:
            material.is_active = data['is_active']

        material.last_modified_at = datetime.utcnow()
        material.last_modified_by = current_user

        db.session.commit()

        return jsonify({
            'message': 'Material updated successfully',
            'material': material.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def delete_inventory_item(inventory_material_id):
    """Delete a material from inventory"""
    try:
        material = InventoryMaterial.query.get(inventory_material_id)

        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        # Check if material has transactions
        if len(material.transactions) > 0:
            return jsonify({
                'error': 'Cannot delete material with existing transactions. Please deactivate instead.'
            }), 400

        db.session.delete(material)
        db.session.commit()

        return jsonify({'message': 'Material deleted from inventory successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ==================== INVENTORY TRANSACTION APIs ====================

def create_inventory_transaction():
    """Create a new material transaction (purchase or withdrawal)"""
    try:
        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Validate required fields
        required_fields = ['inventory_material_id', 'transaction_type', 'quantity']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'{field} is required'}), 400

        # Validate transaction type (accept both cases for flexibility)
        transaction_type = data['transaction_type'].upper()
        if transaction_type not in ['PURCHASE', 'WITHDRAWAL']:
            return jsonify({'error': 'Invalid transaction type. Must be PURCHASE or WITHDRAWAL'}), 400

        # Check if material exists
        material = InventoryMaterial.query.get(data['inventory_material_id'])
        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        quantity = float(data['quantity'])
        # Use provided unit_price or default to material's unit_price
        unit_price = float(data.get('unit_price', material.unit_price))

        # Validate withdrawal quantity
        if transaction_type == 'WITHDRAWAL':
            if quantity > material.current_stock:
                return jsonify({
                    'error': f'Insufficient stock. Available: {material.current_stock} {material.unit}'
                }), 400

        # Calculate total amount
        total_amount = quantity * unit_price

        # Create transaction
        new_transaction = InventoryTransaction(
            inventory_material_id=data['inventory_material_id'],
            transaction_type=transaction_type,
            quantity=quantity,
            unit_price=unit_price,
            total_amount=total_amount,
            reference_number=data.get('reference_number'),
            project_id=data.get('project_id'),
            notes=data.get('notes'),
            created_by=current_user
        )

        # Update material stock
        if transaction_type == 'PURCHASE':
            material.current_stock += quantity
        else:  # WITHDRAWAL
            material.current_stock -= quantity

        material.last_modified_at = datetime.utcnow()
        material.last_modified_by = current_user

        db.session.add(new_transaction)
        db.session.commit()

        return jsonify({
            'message': f'{data["transaction_type"].capitalize()} transaction created successfully',
            'transaction': new_transaction.to_dict(),
            'updated_stock': material.current_stock
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def get_all_inventory_transactions():
    """Get all material transactions with optional filters"""
    try:
        # Get query parameters
        inventory_material_id = request.args.get('inventory_material_id')
        transaction_type = request.args.get('transaction_type')
        project_id = request.args.get('project_id')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        query = InventoryTransaction.query

        # Apply filters
        if inventory_material_id:
            query = query.filter_by(inventory_material_id=inventory_material_id)
        if transaction_type:
            query = query.filter_by(transaction_type=transaction_type.upper())
        if project_id:
            query = query.filter_by(project_id=project_id)
        if start_date:
            query = query.filter(InventoryTransaction.created_at >= start_date)
        if end_date:
            query = query.filter(InventoryTransaction.created_at <= end_date)

        # Order by latest first
        transactions = query.order_by(InventoryTransaction.created_at.desc()).all()

        # Enrich with material details
        result = []
        for txn in transactions:
            txn_data = txn.to_dict()
            if txn.material:
                txn_data['material_code'] = txn.material.material_code
                txn_data['material_name'] = txn.material.material_name
                txn_data['brand'] = txn.material.brand
                txn_data['size'] = txn.material.size
                txn_data['category'] = txn.material.category
                txn_data['unit'] = txn.material.unit
            result.append(txn_data)

        return jsonify({
            'transactions': result,
            'total': len(result)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_inventory_transaction_by_id(inventory_transaction_id):
    """Get a specific material transaction by ID"""
    try:
        transaction = InventoryTransaction.query.get(inventory_transaction_id)

        if not transaction:
            return jsonify({'error': 'Transaction not found'}), 404

        txn_data = transaction.to_dict()
        if transaction.material:
            txn_data['material_code'] = transaction.material.material_code
            txn_data['material_name'] = transaction.material.material_name
            txn_data['brand'] = transaction.material.brand
            txn_data['size'] = transaction.material.size
            txn_data['category'] = transaction.material.category
            txn_data['unit'] = transaction.material.unit

        return jsonify({'transaction': txn_data}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_item_transaction_history(inventory_material_id):
    """Get transaction history for a specific material with project details"""
    try:
        material = InventoryMaterial.query.get(inventory_material_id)

        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        transactions = InventoryTransaction.query.filter_by(
            inventory_material_id=inventory_material_id
        ).order_by(InventoryTransaction.created_at.desc()).all()

        # Enrich transactions with project details
        enriched_transactions = []
        for txn in transactions:
            txn_data = txn.to_dict()

            # Add project details if project_id exists
            if txn.project_id:
                project = Project.query.get(txn.project_id)
                if project:
                    txn_data['project_details'] = enrich_project_details(project)

            enriched_transactions.append(txn_data)

        return jsonify({
            'material': material.to_dict(),
            'transactions': enriched_transactions,
            'total_internal_withdraw': len(transactions)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_inventory_summary():
    """Get overall material inventory summary"""
    try:
        materials = InventoryMaterial.query.filter_by(is_active=True).all()

        total_materials = len(materials)
        total_value = sum(mat.current_stock * mat.unit_price for mat in materials)
        low_stock_materials = [mat.to_dict() for mat in materials if mat.current_stock <= mat.min_stock_level]

        return jsonify({
            'summary': {
                'total_materials': total_materials,
                'total_inventory_value': round(total_value, 2),
                'low_stock_materials_count': len(low_stock_materials),
                'low_stock_materials': low_stock_materials
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_inventory_dashboard():
    """Get comprehensive inventory dashboard data in a single API call"""
    try:
        # Get all active materials
        materials = InventoryMaterial.query.filter_by(is_active=True).all()

        # Calculate stock health metrics
        total_items = len(materials)
        healthy_items = 0
        low_stock_items = 0
        critical_items = 0
        out_of_stock_items = 0
        stock_alerts = []

        for mat in materials:
            if mat.current_stock <= 0:
                out_of_stock_items += 1
                stock_alerts.append({
                    'name': mat.material_name,
                    'stock': mat.current_stock,
                    'unit': mat.unit,
                    'status': 'out-of-stock',
                    'material_code': mat.material_code
                })
            elif mat.min_stock_level and mat.current_stock <= mat.min_stock_level * 0.5:
                critical_items += 1
                stock_alerts.append({
                    'name': mat.material_name,
                    'stock': mat.current_stock,
                    'unit': mat.unit,
                    'status': 'critical',
                    'material_code': mat.material_code
                })
            elif mat.min_stock_level and mat.current_stock <= mat.min_stock_level:
                low_stock_items += 1
                stock_alerts.append({
                    'name': mat.material_name,
                    'stock': mat.current_stock,
                    'unit': mat.unit,
                    'status': 'low',
                    'material_code': mat.material_code
                })
            else:
                healthy_items += 1

        # Calculate total inventory value
        total_value = sum(mat.current_stock * mat.unit_price for mat in materials)

        # Get category distribution
        category_map = {}
        for mat in materials:
            cat = mat.category or 'Uncategorized'
            if cat not in category_map:
                category_map[cat] = {'count': 0, 'value': 0}
            category_map[cat]['count'] += 1
            category_map[cat]['value'] += mat.current_stock * mat.unit_price

        categories = [
            {'name': k, 'count': v['count'], 'value': round(v['value'], 2)}
            for k, v in category_map.items()
        ]

        # Get transaction data
        transactions = InventoryTransaction.query.order_by(
            InventoryTransaction.created_at.desc()
        ).limit(10).all()

        recent_transactions = []
        for txn in transactions:
            txn_data = txn.to_dict()
            if txn.material:
                txn_data['material_name'] = txn.material.material_name
                txn_data['material_code'] = txn.material.material_code
            recent_transactions.append(txn_data)

        total_transactions = InventoryTransaction.query.count()

        # Get internal request data
        pending_requests = InternalMaterialRequest.query.filter(
            InternalMaterialRequest.status.in_(['PENDING', 'send_request'])
        ).count()

        approved_requests = InternalMaterialRequest.query.filter_by(status='approved').count()
        rejected_requests = InternalMaterialRequest.query.filter_by(status='rejected').count()

        return jsonify({
            'dashboard': {
                'totalItems': total_items,
                'totalValue': round(total_value, 2),
                'healthyStockItems': healthy_items,
                'lowStockItems': low_stock_items,
                'criticalItems': critical_items,
                'outOfStockItems': out_of_stock_items,
                'stockAlerts': stock_alerts[:10],  # Limit to 10 alerts
                'categories': categories,
                'totalTransactions': total_transactions,
                'recentTransactions': recent_transactions,
                'pendingRequests': pending_requests,
                'approvedRequests': approved_requests,
                'rejectedRequests': rejected_requests
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== INTERNAL MATERIAL REQUEST APIs ====================

def internal_inventory_material_request():
    """Create an internal material purchase request from a project"""
    try:
        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Validate required fields
        required_fields = ['material_name', 'inventory_material_id', 'quantity', 'project_id']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        # Validate project exists
        project = Project.query.get(data['project_id'])
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        # Check for existing active request for the same material and CR
        cr_id = data.get('cr_id')
        if cr_id:
            existing_request = InternalMaterialRequest.query.filter(
                InternalMaterialRequest.inventory_material_id == data['inventory_material_id'],
                InternalMaterialRequest.cr_id == cr_id,
                InternalMaterialRequest.status.in_(['PENDING', 'send_request', 'approved'])
            ).first()

            if existing_request:
                status_text = 'pending approval' if existing_request.status in ['PENDING', 'send_request'] else 'already approved'
                return jsonify({
                    'error': f'A request for this material from CR-{cr_id} is {status_text}. Request ID: #{existing_request.request_id}'
                }), 400

        # Generate sequential request number
        # last_request = InternalMaterialRequest.query.order_by(
        #     InternalMaterialRequest.request_number.desc()
        # ).first()

        # request_number = 1 if not last_request else last_request.request_number + 1

        # Create new request
        # Automatically mark as sent if from buyer request
        is_buyer_request = data.get('request_type') == 'buyer_request'

        new_request = InternalMaterialRequest(
            # request_number=request_number,
            project_id=data['project_id'],
            cr_id=data.get('cr_id'),
            material_name=data['material_name'],
            inventory_material_id=data['inventory_material_id'],
            quantity=float(data['quantity']),
            brand=data.get('brand'),  # Handles null
            size=data.get('size'),    # Handles null
            notes=data.get('notes'),
            request_send=True if is_buyer_request else data.get('request_send', False),
            status='send_request' if is_buyer_request else 'PENDING',
            created_by=current_user,
            request_buyer_id=g.user.get('user_id'),
            last_modified_by=current_user
        )

        db.session.add(new_request)
        db.session.commit()

        # Prepare response with project details
        response_data = {
            'message': 'Internal material purchase request created successfully',
            'request': new_request.to_dict()
        }

        # Add project details to response
        response_data['project_details'] = enrich_project_details(project)

        return jsonify(response_data), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

def get_internal_material_request_by_id(request_id):
    """Get a specific internal material request with full project and material details"""
    try:
        internal_req = InternalMaterialRequest.query.get(request_id)

        if not internal_req:
            return jsonify({'error': 'Internal request not found'}), 404

        # Build request data
        req_data = internal_req.to_dict()

        # Get project details
        project = Project.query.get(internal_req.project_id)
        if project:
            req_data['project_details'] = enrich_project_details(project)

        # Get material details if allocated
        material = None
        if internal_req.inventory_material_id:
            material = InventoryMaterial.query.get(internal_req.inventory_material_id)
            if material:
                req_data['material_details'] = {
                    'material_code': material.material_code,
                    'material_name': material.material_name,
                    'brand': material.brand,
                    'size': material.size,
                    'category': material.category,
                    'unit': material.unit,
                    'current_stock': material.current_stock,
                    'unit_price': material.unit_price
                }

        # Get requester details
        if internal_req.request_buyer_id:
            requester = User.query.get(internal_req.request_buyer_id)
            if requester:
                req_data['requester_details'] = {
                    'user_id': requester.user_id,
                    'full_name': requester.full_name,
                    'email': requester.email
                }

        # Calculate withdrawal statistics
        withdrawal_stats = {}
        if internal_req.inventory_material_id:
            # Get all withdrawal transactions for this material (check both cases for legacy data)
            all_withdrawals = InventoryTransaction.query.filter(
                InventoryTransaction.inventory_material_id == internal_req.inventory_material_id,
                InventoryTransaction.transaction_type.in_(['WITHDRAWAL', 'withdrawl'])
            ).all()

            total_internal_withdraw = len(all_withdrawals)
            total_withdrawn_quantity = sum(txn.quantity for txn in all_withdrawals)

            # Get withdrawals specific to this project
            project_withdrawals = [txn for txn in all_withdrawals if txn.project_id == internal_req.project_id]
            project_withdraw_count = len(project_withdrawals)
            project_withdrawn_quantity = sum(txn.quantity for txn in project_withdrawals)

            withdrawal_stats = {
                'total_internal_withdraw_count': total_internal_withdraw,
                'total_withdrawn_quantity': total_withdrawn_quantity,
                'project_withdraw_count': project_withdraw_count,
                'project_withdrawn_quantity': project_withdrawn_quantity,
                'unit': material.unit if material else None
            }

        req_data['withdrawal_statistics'] = withdrawal_stats

        return jsonify({
            'request': req_data
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def update_internal_material_request(request_id):
    """Update an internal material request (only if status is pending)"""
    try:
        internal_req = InternalMaterialRequest.query.get(request_id)

        if not internal_req:
            return jsonify({'error': 'Internal request not found'}), 404

        # Only allow updates if request is still PENDING
        if internal_req.status != 'pending':
            return jsonify({'error': f'Cannot update request with status {internal_req.status}. Only pending requests can be updated.'}), 400

        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Update allowed fields
        if 'material_name' in data:
            internal_req.material_name = data['material_name']
        if 'inventory_material_id' in data:
            internal_req.inventory_material_id = data['inventory_material_id']
        if 'quantity' in data:
            internal_req.quantity = float(data['quantity'])
        if 'brand' in data:
            internal_req.brand = data['brand']
        if 'size' in data:
            internal_req.size = data['size']
        if 'notes' in data:
            internal_req.notes = data['notes']

        internal_req.last_modified_at = datetime.utcnow()
        internal_req.last_modified_by = current_user

        db.session.commit()

        return jsonify({
            'message': 'Internal material request updated successfully',
            'request': internal_req.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def delete_internal_material_request(request_id):
    """Delete an internal material request (only if status is pending or rejected)"""
    try:
        internal_req = InternalMaterialRequest.query.get(request_id)

        if not internal_req:
            return jsonify({'error': 'Internal request not found'}), 404

        # Only allow deletion if request is PENDING or REJECTED
        if internal_req.status not in ['pending', 'rejected']:
            return jsonify({
                'error': f'Cannot delete request with status {internal_req.status}. Only pending or rejected requests can be deleted.'
            }), 400

        db.session.delete(internal_req)
        db.session.commit()

        return jsonify({'message': 'Internal material request deleted successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def send_internal_material_request(request_id):
    """Send internal material request for approval (sets request_send=True, assigns request_number, and status='SEND_REQUEST')"""
    try:
        internal_req = InternalMaterialRequest.query.get(request_id)

        if not internal_req:
            return jsonify({'error': 'Internal request not found'}), 404

        # Can only send if not already sent
        if internal_req.request_send:
            return jsonify({'error': 'Request has already been sent'}), 400

        current_user = g.user.get('email', 'system')

        # Generate sequential request number only when sending
        last_sent_request = InternalMaterialRequest.query.filter_by(
            request_send=True
        ).filter(InternalMaterialRequest.request_number.isnot(None)).order_by(
            InternalMaterialRequest.request_number.desc()
        ).first()

        request_number = 1 if not last_sent_request or last_sent_request.request_number is None else last_sent_request.request_number + 1

        # Mark as sent and assign request number
        internal_req.request_send = True
        internal_req.request_number = request_number
        internal_req.status = 'send_request'
        internal_req.last_modified_by = current_user
        internal_req.last_modified_at = datetime.utcnow()

        db.session.commit()

        # Get project details for response
        project = Project.query.get(internal_req.project_id)
        project_details = None
        if project:
            project_details = {
                'project_name': project.project_name,
                'project_code': project.project_code,
                'location': project.location
            }

        return jsonify({
            'message': 'Internal material request sent for approval successfully',
            'request': internal_req.to_dict(),
            'project_details': project_details
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def get_sent_internal_requests():
    """Get all sent internal material requests (request_send=True) with project and material details"""
    try:
        # Get query parameters
        project_id = request.args.get('project_id')

        query = InternalMaterialRequest.query.filter_by(request_send=True)

        # Apply additional filters
        if project_id:
            query = query.filter_by(project_id=int(project_id))

        # Order by latest first
        requests = query.order_by(InternalMaterialRequest.created_at.desc()).all()

        # Enrich with project and material details
        result = []
        for req in requests:
            req_data = req.to_dict()

            # Get project details
            project = Project.query.get(req.project_id)
            if project:
                req_data['project_details'] = enrich_project_details(project)

            # Get material details if allocated
            if req.inventory_material_id:
                material = InventoryMaterial.query.get(req.inventory_material_id)
                if material:
                    req_data['material_details'] = {
                        'material_code': material.material_code,
                        'current_stock': material.current_stock,
                        'unit': material.unit,
                        'unit_price': material.unit_price
                    }

            # Get requester details
            if req.request_buyer_id:
                requester = User.query.get(req.request_buyer_id)
                if requester:
                    req_data['requester_details'] = {
                        'user_id': requester.user_id,
                        'full_name': requester.full_name,
                        'email': requester.email
                    }

            result.append(req_data)

        return jsonify({
            'requests': result,
            'total': len(result)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_all_internal_material_requests():
    """Get all internal material purchase requests with optional filters"""
    try:
        current_user = g.user.get('email', 'system')
        current_user_id = g.user.get('user_id')
        # Get query parameters
        project_id = request.args.get('project_id')
        status = request.args.get('status')

        query = InternalMaterialRequest.query.filter_by(request_buyer_id=current_user_id)

        # Apply filters
        if project_id:
            query = query.filter_by(project_id=project_id)
        if status:
            query = query.filter_by(status=status.upper())

        # Order by latest first
        requests = query.order_by(InternalMaterialRequest.created_at.desc()).all()

        # Enrich with project details
        result = []
        for req in requests:
            req_data = req.to_dict()

            # Get project details
            project = Project.query.get(req.project_id)
            if project:
                req_data['project_details'] = enrich_project_details(project)

            result.append(req_data)

        return jsonify({
            'requests': result,
            'total': len(result),
            'buyer_info': {
                'user_id': current_user_id,
                'email': current_user
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def approve_internal_request(request_id):
    """Approve an internal material request and deduct material from inventory"""
    try:
        internal_req = InternalMaterialRequest.query.get(request_id)

        if not internal_req:
            return jsonify({'error': 'Internal request not found'}), 404

        if internal_req.status not in ['pending', 'PENDING', 'send_request']:
            return jsonify({'error': f'Request is already {internal_req.status}'}), 400

        # Validate that inventory_material_id exists
        if not internal_req.inventory_material_id:
            return jsonify({'error': 'inventory_material_id is required for approval'}), 400

        # Get the material from inventory
        material = InventoryMaterial.query.get(internal_req.inventory_material_id)
        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        # Check if sufficient stock available
        if material.current_stock < internal_req.quantity:
            return jsonify({
                'error': f'Insufficient stock. Available: {material.current_stock} {material.unit}, Requested: {internal_req.quantity}'
            }), 400

        current_user = g.user.get('email', 'system')

        # Deduct material from inventory
        material.current_stock -= internal_req.quantity
        material.last_modified_at = datetime.utcnow()
        material.last_modified_by = current_user

        # Create withdrawal transaction
        total_amount = internal_req.quantity * material.unit_price
        new_transaction = InventoryTransaction(
            inventory_material_id=internal_req.inventory_material_id,
            transaction_type='WITHDRAWAL',
            quantity=internal_req.quantity,
            unit_price=material.unit_price,
            total_amount=total_amount,
            reference_number=f'REQ-{internal_req.request_number}',
            project_id=internal_req.project_id,
            notes=f'Approved internal request #{internal_req.request_number}',
            created_by=current_user
        )

        # Approve the request
        internal_req.status = 'APPROVED'
        internal_req.approved_by = current_user
        internal_req.approved_at = datetime.utcnow()
        internal_req.inventory_transaction_id = new_transaction.inventory_transaction_id
        internal_req.last_modified_by = current_user

        db.session.add(new_transaction)
        db.session.commit()

        return jsonify({
            'message': 'Internal request approved successfully and material deducted from inventory',
            'request': internal_req.to_dict(),
            'transaction': new_transaction.to_dict(),
            'material_details': {
                'material_code': material.material_code,
                'material_name': material.material_name,
                'previous_stock': material.current_stock + internal_req.quantity,
                'deducted_quantity': internal_req.quantity,
                'updated_stock': material.current_stock,
                'unit': material.unit
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def reject_internal_request(request_id):
    """Reject an internal material request"""
    try:
        internal_req = InternalMaterialRequest.query.get(request_id)

        if not internal_req:
            return jsonify({'error': 'Internal request not found'}), 404

        if internal_req.status not in ['pending', 'PENDING', 'send_request']:
            return jsonify({'error': f'Request is already {internal_req.status}'}), 400

        data = request.get_json()
        rejection_reason = data.get('rejection_reason', 'No reason provided')

        current_user = g.user.get('email', 'system')

        # Reject the request
        internal_req.status = 'rejected'
        internal_req.rejected_by = current_user
        internal_req.rejected_at = datetime.utcnow()
        internal_req.rejection_reason = rejection_reason
        internal_req.last_modified_by = current_user

        db.session.commit()

        return jsonify({
            'message': 'Internal request rejected',
            'request': internal_req.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def dispatch_material(request_id):
    """Dispatch material to project - marks material as dispatched with automatic timestamp"""
    try:
        internal_req = InternalMaterialRequest.query.get(request_id)

        if not internal_req:
            return jsonify({'error': 'Internal request not found'}), 404

        # Validate status - can only dispatch if APPROVED
        if internal_req.status != 'APPROVED':
            return jsonify({'error': f'Cannot dispatch material. Request status is {internal_req.status}. Must be APPROVED.'}), 400

        # Verify material has been allocated
        if not internal_req.inventory_material_id:
            return jsonify({'error': 'No material allocated to this request. Cannot dispatch.'}), 400

        current_user = g.user.get('email', 'system')

        # Update status to DISPATCHED and set dispatch timestamp
        internal_req.status = 'DISPATCHED'
        internal_req.dispatch_date = datetime.utcnow()  # Automatically calculate and store dispatch time
        internal_req.last_modified_by = current_user

        db.session.commit()

        # Get project details
        project = Project.query.get(internal_req.project_id)
        project_info = {
            'project_id': internal_req.project_id,
            'project_name': project.project_name if project else None,
            'project_code': project.project_code if project else None,
            'location': project.location if project else None
        }

        # Get material details
        material = InventoryMaterial.query.get(internal_req.inventory_material_id)
        material_info = {
            'inventory_material_id': internal_req.inventory_material_id,
            'material_code': material.material_code if material else None,
            'material_name': material.material_name if material else internal_req.material_name,
            'quantity': internal_req.quantity,
            'brand': internal_req.brand,
            'size': internal_req.size
        }

        return jsonify({
            'message': 'Material dispatched successfully to project',
            'request': internal_req.to_dict(),
            'project_details': project_info,
            'material_details': material_info,
            'dispatch_info': {
                'dispatch_date': internal_req.dispatch_date.isoformat(),
                'expected_delivery_date': internal_req.expected_delivery_date.isoformat() if internal_req.expected_delivery_date else None,
                'dispatched_by': current_user
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def check_inventory_availability(request_id):
    """Check if requested material is available in inventory"""
    try:
        internal_req = InternalMaterialRequest.query.get(request_id)

        if not internal_req:
            return jsonify({'error': 'Internal request not found'}), 404

        availability = _check_material_availability(internal_req)

        return jsonify({
            'request_id': request_id,
            'availability': availability
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _check_material_availability(internal_req):
    """Helper function to check material availability in inventory"""

    # MODE 1: Check by inventory_material_id if already mapped
    if internal_req.inventory_material_id:
        material = InventoryMaterial.query.filter_by(
            inventory_material_id=internal_req.inventory_material_id,
            is_active=True
        ).first()

        if material:
            can_fulfill = material.current_stock >= internal_req.quantity
            return {
                'check_method': 'by_id',
                'available_in_inventory': can_fulfill,
                'inventory_material_id': material.inventory_material_id,
                'material_details': {
                    'material_code': material.material_code,
                    'material_name': material.material_name,
                    'brand': material.brand,
                    'size': material.size,
                    'unit': material.unit,
                    'unit_price': material.unit_price,
                    'category': material.category
                },
                'current_stock': material.current_stock,
                'requested_quantity': internal_req.quantity,
                'can_fulfill': can_fulfill,
                'stock_shortage': max(0, internal_req.quantity - material.current_stock) if not can_fulfill else 0
            }
        else:
            # Material ID exists but material not found or inactive
            return {
                'check_method': 'by_id',
                'available_in_inventory': False,
                'inventory_material_id': internal_req.inventory_material_id,
                'error': 'Material not found or inactive in inventory',
                'requested_quantity': internal_req.quantity,
                'can_fulfill': False
            }

    # MODE 2: Search by name/brand/size (Fallback)
    query = InventoryMaterial.query.filter(
        InventoryMaterial.material_name.ilike(f'%{internal_req.material_name}%'),
        InventoryMaterial.is_active == True
    )

    # Filter by brand if specified
    if internal_req.brand:
        query = query.filter(InventoryMaterial.brand.ilike(f'%{internal_req.brand}%'))

    # Filter by size if specified
    if internal_req.size:
        query = query.filter(InventoryMaterial.size.ilike(f'%{internal_req.size}%'))

    matching_materials = query.all()

    available_materials = []
    for material in matching_materials:
        if material.current_stock >= internal_req.quantity:
            available_materials.append({
                'inventory_material_id': material.inventory_material_id,
                'material_code': material.material_code,
                'material_name': material.material_name,
                'brand': material.brand,
                'size': material.size,
                'current_stock': material.current_stock,
                'unit': material.unit,
                'unit_price': material.unit_price,
                'can_fulfill': True
            })

    return {
        'check_method': 'by_search',
        'available_in_inventory': len(available_materials) > 0,
        'matching_materials': available_materials,
        'requested_quantity': internal_req.quantity,
        'total_matches': len(matching_materials),
        'available_matches': len(available_materials)
    }


def issue_material_from_inventory(request_id):
    """Issue material from inventory to fulfill internal request"""
    try:
        internal_req = InternalMaterialRequest.query.get(request_id)

        if not internal_req:
            return jsonify({'error': 'Internal request not found'}), 404

        if internal_req.status not in ['approved', 'pending']:
            return jsonify({'error': f'Cannot issue material for request with status {internal_req.status}'}), 400

        data = request.get_json()
        inventory_material_id = data.get('inventory_material_id')

        if not inventory_material_id:
            return jsonify({'error': 'inventory_material_id is required'}), 400

        # Get the material
        material = InventoryMaterial.query.get(inventory_material_id)
        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        # Check if sufficient stock
        if material.current_stock < internal_req.quantity:
            return jsonify({
                'error': f'Insufficient stock. Available: {material.current_stock} {material.unit}, Requested: {internal_req.quantity}'
            }), 400

        current_user = g.user.get('email', 'system')

        # Create withdrawal transaction
        total_amount = internal_req.quantity * material.unit_price
        new_transaction = InventoryTransaction(
            inventory_material_id=inventory_material_id,
            transaction_type='WITHDRAWAL',
            quantity=internal_req.quantity,
            unit_price=material.unit_price,
            total_amount=total_amount,
            reference_number=f'REQ-{internal_req.request_number}',
            project_id=internal_req.project_id,
            notes=f'Internal request #{internal_req.request_number}',
            created_by=current_user
        )

        # Update material stock
        material.current_stock -= internal_req.quantity
        material.last_modified_at = datetime.utcnow()
        material.last_modified_by = current_user

        # Update internal request status
        internal_req.status = 'FULFILLED'
        internal_req.inventory_material_id = inventory_material_id
        internal_req.actual_delivery_date = datetime.utcnow()  # Set actual delivery date
        internal_req.last_modified_by = current_user

        db.session.add(new_transaction)
        db.session.commit()

        # Update internal request with transaction ID
        internal_req.inventory_transaction_id = new_transaction.inventory_transaction_id
        db.session.commit()

        return jsonify({
            'message': 'Material issued successfully from inventory',
            'request': internal_req.to_dict(),
            'transaction': new_transaction.to_dict(),
            'updated_stock': material.current_stock
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ==================== MATERIAL RETURN APIs ====================

def create_material_return():
    """Create a material return record with condition tracking linked to specific delivery note item"""
    try:
        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Validate required fields - delivery_note_item_id is now required
        required_fields = ['delivery_note_item_id', 'quantity', 'condition']
        for field in required_fields:
            if field not in data or data[field] is None:
                return jsonify({'error': f'{field} is required'}), 400

        # Validate condition value using constant
        if data['condition'] not in MATERIAL_CONDITIONS:
            return jsonify({'error': f'Invalid condition. Must be one of: {", ".join(MATERIAL_CONDITIONS)}'}), 400

        # Validate quantity using helper
        is_valid, quantity, error_msg = validate_quantity(data['quantity'])
        if not is_valid:
            return jsonify({'error': error_msg}), 400

        # Validate delivery note item exists
        delivery_note_item = DeliveryNoteItem.query.get(data['delivery_note_item_id'])
        if not delivery_note_item:
            return jsonify({'error': 'Delivery note item not found'}), 404

        # Get the delivery note to extract project_id
        delivery_note = MaterialDeliveryNote.query.get(delivery_note_item.delivery_note_id)
        if not delivery_note:
            return jsonify({'error': 'Delivery note not found'}), 404

        # Validate delivery note status - only delivered materials can be returned
        if delivery_note.status not in RETURNABLE_DN_STATUSES:
            return jsonify({'error': 'Can only return materials from delivered shipments'}), 400

        # Get material from the delivery note item
        material = InventoryMaterial.query.get(delivery_note_item.inventory_material_id)
        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        # Get project from delivery note
        project = Project.query.get(delivery_note.project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        condition = data['condition']

        # Calculate already returned quantity for this specific delivery note item
        existing_returns = MaterialReturn.query.filter_by(
            delivery_note_item_id=data['delivery_note_item_id']
        ).all()
        total_returned = sum(r.quantity for r in existing_returns)
        returnable_quantity = delivery_note_item.quantity - total_returned

        # Validate return quantity against returnable
        if quantity > returnable_quantity:
            return jsonify({
                'error': f'Return quantity ({quantity}) exceeds returnable quantity ({returnable_quantity})'
            }), 400

        # ALL returns require PM approval - do not auto-add to stock
        add_to_stock = False

        # Set disposal status based on condition using constants
        if condition == 'Good':
            disposal_status = DISPOSAL_PENDING_APPROVAL
        else:
            disposal_status = DISPOSAL_PENDING_REVIEW

        # Create the return record with delivery_note_item_id
        new_return = MaterialReturn(
            delivery_note_item_id=data['delivery_note_item_id'],
            inventory_material_id=delivery_note_item.inventory_material_id,
            project_id=delivery_note.project_id,
            quantity=quantity,
            condition=condition,
            add_to_stock=add_to_stock,
            return_reason=data.get('return_reason'),
            reference_number=data.get('reference_number'),
            notes=data.get('notes'),
            disposal_status=disposal_status,
            created_by=current_user
        )

        new_stock_level = material.current_stock

        db.session.add(new_return)
        db.session.commit()

        # Send notification for damaged/defective returns that need review
        if condition in ['Damaged', 'Defective']:
            try:
                # Get the user who created the return
                returned_by_user = User.query.filter_by(email=current_user).first()
                returned_by_name = returned_by_user.full_name if returned_by_user else current_user

                ComprehensiveNotificationService.notify_damaged_return_needs_review(
                    material_name=material.material_name,
                    material_code=material.material_code,
                    quantity=quantity,
                    unit=material.unit,
                    condition=condition,
                    return_id=new_return.return_id,
                    project_name=project.project_name,
                    returned_by_name=returned_by_name
                )
            except Exception as notif_err:
                print(f"Error sending damaged return notification: {notif_err}")

        # Get project details for response
        project_info = {
            'project_id': project.project_id,
            'project_name': project.project_name,
            'project_code': project.project_code
        }

        # Get delivery note details for response
        delivery_info = {
            'delivery_note_id': delivery_note.delivery_note_id,
            'delivery_note_number': delivery_note.delivery_note_number,
            'delivery_date': delivery_note.delivery_date.isoformat() if delivery_note.delivery_date else None
        }

        return jsonify({
            'message': 'Material return recorded successfully. Awaiting PM approval.',
            'return': new_return.to_dict(),
            'stock_updated': False,
            'new_stock_level': new_stock_level,
            'project_details': project_info,
            'delivery_details': delivery_info,
            'requires_approval': True
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def get_all_material_returns():
    """Get all material returns with optional filters"""
    try:
        # Get query parameters
        project_id = request.args.get('project_id')
        condition = request.args.get('condition')
        disposal_status = request.args.get('disposal_status')
        inventory_material_id = request.args.get('inventory_material_id')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        query = MaterialReturn.query

        # Apply filters
        if project_id:
            query = query.filter_by(project_id=int(project_id))
        if condition:
            query = query.filter_by(condition=condition)
        if disposal_status:
            query = query.filter_by(disposal_status=disposal_status)
        if inventory_material_id:
            query = query.filter_by(inventory_material_id=int(inventory_material_id))
        if start_date:
            query = query.filter(MaterialReturn.created_at >= start_date)
        if end_date:
            query = query.filter(MaterialReturn.created_at <= end_date)

        # Order by latest first
        returns = query.order_by(MaterialReturn.created_at.desc()).all()

        # Enrich with project details
        result = []
        for ret in returns:
            ret_data = ret.to_dict()

            # Get project details
            project = Project.query.get(ret.project_id)
            if project:
                ret_data['project_details'] = {
                    'project_id': project.project_id,
                    'project_name': project.project_name,
                    'project_code': project.project_code,
                    'location': project.location
                }

            result.append(ret_data)

        return jsonify({
            'returns': result,
            'total': len(result)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_material_return_by_id(return_id):
    """Get a specific material return by ID with full details"""
    try:
        material_return = MaterialReturn.query.get(return_id)

        if not material_return:
            return jsonify({'error': 'Material return not found'}), 404

        ret_data = material_return.to_dict()

        # Get project details
        project = Project.query.get(material_return.project_id)
        if project:
            ret_data['project_details'] = enrich_project_details(project, include_mep=False)

        # Get full material details
        if material_return.inventory_material:
            ret_data['material_details'] = material_return.inventory_material.to_dict()

        return jsonify({'return': ret_data}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_dispatched_materials_for_project(project_id):
    """Get materials dispatched to a project that can be returned.

    Returns materials from delivered delivery notes tracked per delivery note item
    with their dispatched quantity, already returned quantity, and returnable quantity.
    """
    try:
        # Get all delivery notes for this project with delivered status
        delivery_notes = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.project_id == project_id,
            MaterialDeliveryNote.status.in_(RETURNABLE_DN_STATUSES)
        ).order_by(MaterialDeliveryNote.delivery_date.desc()).all()

        # Track each delivery note item separately using helper function
        result = []

        for dn in delivery_notes:
            for item in dn.items:
                material = InventoryMaterial.query.get(item.inventory_material_id)
                if not material:
                    continue

                # Use helper function to build returnable material dict
                material_data = build_returnable_material_item(dn, item, material)
                if material_data:
                    result.append(material_data)

        # Sort by material name, then by delivery date
        result.sort(key=lambda x: (x['material_name'], x['delivery_date'] or ''))

        return jsonify({
            'project_id': project_id,
            'materials': result,
            'total': len(result)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_pending_disposal_returns():
    """Get all material returns pending disposal review"""
    try:
        returns = MaterialReturn.query.filter_by(
            disposal_status=DISPOSAL_PENDING_REVIEW
        ).order_by(MaterialReturn.created_at.desc()).all()

        # Enrich with project and material details
        result = []
        for ret in returns:
            ret_data = ret.to_dict()

            # Get project details
            project = Project.query.get(ret.project_id)
            if project:
                ret_data['project_details'] = {
                    'project_id': project.project_id,
                    'project_name': project.project_name,
                    'project_code': project.project_code
                }

            result.append(ret_data)

        return jsonify({
            'pending_disposals': result,
            'total': len(result)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def review_disposal(return_id):
    """Review and approve disposal of damaged/defective materials.

    Options:
    - 'approve': Mark for disposal (material is completely unusable)
    - 'backup': Add to backup stock (material is partially usable)
    """
    try:
        material_return = MaterialReturn.query.get(return_id)

        if not material_return:
            return jsonify({'error': 'Material return not found'}), 404

        if material_return.disposal_status != DISPOSAL_PENDING_REVIEW:
            return jsonify({'error': f'Cannot review disposal. Current status is {material_return.disposal_status}'}), 400

        data = request.get_json()
        action = data.get('action')

        # Valid actions: approve (disposal) or backup (add to backup stock)
        if action not in ['approve', 'backup']:
            return jsonify({'error': 'Invalid action. Use "approve" for disposal or "backup" for partial use'}), 400

        current_user = g.user.get('email', 'system')

        if action == 'backup':
            # Add to backup stock (partially usable material)
            usable_quantity = data.get('usable_quantity')
            notes = data.get('notes')

            if not usable_quantity or usable_quantity <= 0:
                return jsonify({'error': 'Usable quantity is required for backup stock'}), 400

            if usable_quantity > material_return.quantity:
                return jsonify({'error': f'Usable quantity cannot exceed returned quantity ({material_return.quantity})'}), 400

            if not notes:
                return jsonify({'error': 'Condition notes are required for backup stock'}), 400

            # Get the inventory material
            material = InventoryMaterial.query.get(material_return.inventory_material_id)
            if not material:
                return jsonify({'error': 'Material not found in inventory'}), 404

            # Update backup stock on the material
            material.backup_stock = (material.backup_stock or 0) + usable_quantity

            # Append condition notes (with date and source info)
            condition_note = f"[{datetime.utcnow().strftime('%Y-%m-%d')}] {usable_quantity} {material.unit} from return #{return_id}: {notes}"
            if material.backup_condition_notes:
                material.backup_condition_notes = f"{material.backup_condition_notes}\n{condition_note}"
            else:
                material.backup_condition_notes = condition_note

            material.last_modified_by = current_user
            material.last_modified_at = datetime.utcnow()

            # Update the return record
            material_return.disposal_status = 'backup_added'
            material_return.disposal_reviewed_by = current_user
            material_return.disposal_reviewed_at = datetime.utcnow()
            material_return.disposal_notes = notes

            db.session.commit()

            # Send notification for backup stock added
            try:
                # Get the user who created the return (site engineer)
                site_engineer_id = None
                if material_return.created_by:
                    se_user = User.query.filter_by(email=material_return.created_by).first()
                    if se_user:
                        site_engineer_id = se_user.user_id

                # Get reviewer name
                reviewer_user = User.query.filter_by(email=current_user).first()
                reviewer_name = reviewer_user.full_name if reviewer_user else current_user

                ComprehensiveNotificationService.notify_material_added_to_backup(
                    material_name=material.material_name,
                    material_code=material.material_code,
                    quantity=usable_quantity,
                    unit=material.unit,
                    condition_notes=notes,
                    return_id=return_id,
                    reviewed_by_name=reviewer_name,
                    site_engineer_id=site_engineer_id
                )
            except Exception as notif_err:
                print(f"Error sending backup stock notification: {notif_err}")

            return jsonify({
                'message': f'{usable_quantity} {material.unit} added to backup stock',
                'return': material_return.to_dict(),
                'new_backup_stock': material.backup_stock
            }), 200

        else:
            # Mark for disposal (original behavior)
            # Get material info for notification
            material = InventoryMaterial.query.get(material_return.inventory_material_id)

            material_return.disposal_status = DISPOSAL_APPROVED_DISPOSAL
            material_return.disposal_value = data.get('disposal_value', 0)
            material_return.disposal_reviewed_by = current_user
            material_return.disposal_reviewed_at = datetime.utcnow()
            material_return.disposal_notes = data.get('notes')

            db.session.commit()

            # Send notification for disposal approved
            try:
                # Get the user who created the return (site engineer)
                site_engineer_id = None
                if material_return.created_by:
                    se_user = User.query.filter_by(email=material_return.created_by).first()
                    if se_user:
                        site_engineer_id = se_user.user_id

                # Get reviewer name
                reviewer_user = User.query.filter_by(email=current_user).first()
                reviewer_name = reviewer_user.full_name if reviewer_user else current_user

                if material:
                    ComprehensiveNotificationService.notify_material_disposal_approved(
                        material_name=material.material_name,
                        material_code=material.material_code,
                        quantity=material_return.quantity,
                        unit=material.unit,
                        disposal_value=material_return.disposal_value,
                        return_id=return_id,
                        reviewed_by_name=reviewer_name,
                        site_engineer_id=site_engineer_id
                    )
            except Exception as notif_err:
                print(f"Error sending disposal notification: {notif_err}")

            return jsonify({
                'message': 'Material approved for disposal',
                'return': material_return.to_dict()
            }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def mark_as_disposed(return_id):
    """Mark a material return as physically disposed"""
    try:
        material_return = MaterialReturn.query.get(return_id)

        if not material_return:
            return jsonify({'error': 'Material return not found'}), 404

        if material_return.disposal_status != DISPOSAL_APPROVED_DISPOSAL:
            return jsonify({'error': f'Cannot mark as disposed. Status must be approved_disposal, current: {material_return.disposal_status}'}), 400

        data = request.get_json()
        current_user = g.user.get('email', 'system')

        material_return.disposal_status = DISPOSAL_DISPOSED
        material_return.disposal_notes = data.get('notes', material_return.disposal_notes)

        db.session.commit()

        return jsonify({
            'message': 'Material marked as disposed',
            'return': material_return.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def add_repaired_to_stock(return_id):
    """Add repaired material back to inventory stock"""
    try:
        material_return = MaterialReturn.query.get(return_id)

        if not material_return:
            return jsonify({'error': 'Material return not found'}), 404

        if material_return.disposal_status != DISPOSAL_REPAIRED:
            return jsonify({'error': f'Material must be marked as repaired first. Current status: {material_return.disposal_status}'}), 400

        if material_return.add_to_stock:
            return jsonify({'error': 'Material has already been added to stock'}), 400

        current_user = g.user.get('email', 'system')

        # Get material
        material = InventoryMaterial.query.get(material_return.inventory_material_id)
        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        # Create RETURN transaction
        total_amount = material_return.quantity * material.unit_price
        new_transaction = InventoryTransaction(
            inventory_material_id=material_return.inventory_material_id,
            transaction_type='RETURN',
            quantity=material_return.quantity,
            unit_price=material.unit_price,
            total_amount=total_amount,
            reference_number=material_return.reference_number,
            project_id=material_return.project_id,
            notes=f'Repaired material return added to stock - {material_return.notes or ""}',
            created_by=current_user
        )
        db.session.add(new_transaction)

        # Update material stock
        material.current_stock += material_return.quantity
        material.last_modified_at = datetime.utcnow()
        material.last_modified_by = current_user

        # Update return record
        material_return.add_to_stock = True
        material_return.inventory_transaction_id = new_transaction.inventory_transaction_id

        db.session.commit()

        return jsonify({
            'message': 'Repaired material added to stock successfully',
            'return': material_return.to_dict(),
            'new_stock_level': material.current_stock
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def approve_return_to_stock(return_id):
    """PM approves a Good condition return and adds it to stock"""
    try:
        material_return = MaterialReturn.query.get(return_id)

        if not material_return:
            return jsonify({'error': 'Material return not found'}), 404

        # Only Good condition returns with pending_approval status can be approved
        if material_return.condition != 'Good':
            return jsonify({'error': f'Only Good condition returns can be approved. This return is: {material_return.condition}'}), 400

        if material_return.disposal_status != DISPOSAL_PENDING_APPROVAL:
            return jsonify({'error': f'Return is not pending approval. Current status: {material_return.disposal_status}'}), 400

        if material_return.add_to_stock:
            return jsonify({'error': 'Material has already been added to stock'}), 400

        current_user = g.user.get('email', 'system')
        data = request.get_json() or {}

        # Get material
        material = InventoryMaterial.query.get(material_return.inventory_material_id)
        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        # Create RETURN transaction
        total_amount = material_return.quantity * material.unit_price
        new_transaction = InventoryTransaction(
            inventory_material_id=material_return.inventory_material_id,
            transaction_type='RETURN',
            quantity=material_return.quantity,
            unit_price=material.unit_price,
            total_amount=total_amount,
            reference_number=material_return.reference_number,
            project_id=material_return.project_id,
            notes=f'Approved return from site - {material_return.return_reason or "Material returned in good condition"}',
            created_by=current_user
        )
        db.session.add(new_transaction)

        # Update material stock
        material.current_stock += material_return.quantity
        material.last_modified_at = datetime.utcnow()
        material.last_modified_by = current_user

        # Update return record
        material_return.add_to_stock = True
        material_return.disposal_status = 'approved'
        material_return.disposal_reviewed_by = current_user
        material_return.disposal_reviewed_at = datetime.utcnow()
        material_return.disposal_notes = data.get('notes', 'Approved and added to stock')
        material_return.inventory_transaction_id = new_transaction.inventory_transaction_id

        db.session.commit()

        # Send notification to Site Engineer
        try:
            site_engineer_id = None
            if material_return.created_by:
                se_user = User.query.filter_by(email=material_return.created_by).first()
                if se_user:
                    site_engineer_id = se_user.user_id

            approver_user = User.query.filter_by(email=current_user).first()
            approver_name = approver_user.full_name if approver_user else current_user

            ComprehensiveNotificationService.notify_return_approved_to_stock(
                material_name=material.material_name,
                material_code=material.material_code,
                quantity=material_return.quantity,
                unit=material.unit,
                return_id=return_id,
                approved_by_name=approver_name,
                site_engineer_id=site_engineer_id
            )
        except Exception as notif_err:
            print(f"Error sending return approved notification: {notif_err}")

        return jsonify({
            'message': 'Return approved and added to stock successfully',
            'return': material_return.to_dict(),
            'new_stock_level': material.current_stock
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def reject_return(return_id):
    """PM rejects a return (for Good condition items that shouldn't be added to stock)"""
    try:
        material_return = MaterialReturn.query.get(return_id)

        if not material_return:
            return jsonify({'error': 'Material return not found'}), 404

        if material_return.disposal_status not in [DISPOSAL_PENDING_APPROVAL, DISPOSAL_PENDING_REVIEW]:
            return jsonify({'error': f'Return is not pending. Current status: {material_return.disposal_status}'}), 400

        current_user = g.user.get('email', 'system')
        data = request.get_json() or {}

        # Get material info for notification
        material = InventoryMaterial.query.get(material_return.inventory_material_id)

        # Update return record
        material_return.disposal_status = DISPOSAL_REJECTED
        material_return.disposal_reviewed_by = current_user
        material_return.disposal_reviewed_at = datetime.utcnow()
        material_return.disposal_notes = data.get('notes', 'Return rejected by PM')

        db.session.commit()

        # Send notification to Site Engineer
        try:
            site_engineer_id = None
            if material_return.created_by:
                se_user = User.query.filter_by(email=material_return.created_by).first()
                if se_user:
                    site_engineer_id = se_user.user_id

            rejector_user = User.query.filter_by(email=current_user).first()
            rejector_name = rejector_user.full_name if rejector_user else current_user

            if material:
                ComprehensiveNotificationService.notify_return_rejected(
                    material_name=material.material_name,
                    material_code=material.material_code,
                    quantity=material_return.quantity,
                    unit=material.unit,
                    return_id=return_id,
                    rejected_by_name=rejector_name,
                    rejection_reason=data.get('notes'),
                    site_engineer_id=site_engineer_id
                )
        except Exception as notif_err:
            print(f"Error sending return rejected notification: {notif_err}")

        return jsonify({
            'message': 'Return rejected',
            'return': material_return.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ==================== MATERIAL DELIVERY NOTE APIs ====================

def generate_delivery_note_number():
    """Auto-generate sequential delivery note number (MDN-2025-001, MDN-2025-002, ...)"""
    try:
        current_year = datetime.now().year
        prefix = f"{DELIVERY_NOTE_PREFIX}-{current_year}-"

        # Get the last delivery note for current year
        last_note = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.delivery_note_number.like(f'{prefix}%')
        ).order_by(MaterialDeliveryNote.delivery_note_id.desc()).first()

        if last_note and last_note.delivery_note_number:
            last_number = int(last_note.delivery_note_number.split('-')[-1])
            new_number = last_number + 1
        else:
            new_number = 1

        return f"{prefix}{new_number:03d}"

    except Exception:
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        return f"{DELIVERY_NOTE_PREFIX}-{timestamp}"


def create_delivery_note():
    """Create a new material delivery note"""
    try:
        data = request.get_json()
        current_user_email = g.user.get('email', 'system')
        current_user_id = g.user.get('user_id')

        # Get user's full name for prepared_by field
        prepared_by_name = current_user_email
        if current_user_id:
            user = User.query.get(current_user_id)
            if user and user.full_name:
                prepared_by_name = user.full_name

        # Validate required fields
        required_fields = ['project_id', 'delivery_date']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        # Validate project exists
        project = Project.query.get(data['project_id'])
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        delivery_note_number = generate_delivery_note_number()

        # Parse delivery date
        delivery_date = datetime.fromisoformat(data['delivery_date'].replace('Z', '+00:00')) if isinstance(data['delivery_date'], str) else data['delivery_date']

        # Parse request date if provided
        request_date = None
        if data.get('request_date'):
            request_date = datetime.fromisoformat(data['request_date'].replace('Z', '+00:00')) if isinstance(data['request_date'], str) else data['request_date']

        new_note = MaterialDeliveryNote(
            delivery_note_number=delivery_note_number,
            project_id=data['project_id'],
            delivery_date=delivery_date,
            attention_to=data.get('attention_to'),
            delivery_from=data.get('delivery_from', get_store_name()),
            requested_by=data.get('requested_by'),
            request_date=request_date,
            vehicle_number=data.get('vehicle_number'),
            driver_name=data.get('driver_name'),
            driver_contact=data.get('driver_contact'),
            prepared_by=prepared_by_name,
            checked_by=data.get('checked_by'),
            status='DRAFT',
            notes=data.get('notes'),
            created_by=current_user_email
        )

        db.session.add(new_note)
        db.session.commit()

        project_info = {
            'project_id': project.project_id,
            'project_name': project.project_name,
            'project_code': project.project_code,
            'location': project.location
        }

        return jsonify({
            'message': 'Delivery note created successfully',
            'delivery_note': new_note.to_dict(),
            'project_details': project_info
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def get_all_delivery_notes():
    """Get all delivery notes with optional filters"""
    try:
        project_id = request.args.get('project_id')
        status = request.args.get('status')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        query = MaterialDeliveryNote.query

        if project_id:
            query = query.filter_by(project_id=int(project_id))
        if status:
            query = query.filter_by(status=status.upper())
        if start_date:
            query = query.filter(MaterialDeliveryNote.delivery_date >= start_date)
        if end_date:
            query = query.filter(MaterialDeliveryNote.delivery_date <= end_date)

        notes = query.order_by(MaterialDeliveryNote.created_at.desc()).all()

        result = []
        for note in notes:
            note_data = note.to_dict()
            project = Project.query.get(note.project_id)
            if project:
                note_data['project_details'] = {
                    'project_id': project.project_id,
                    'project_name': project.project_name,
                    'project_code': project.project_code,
                    'location': project.location
                }
            result.append(note_data)

        return jsonify({
            'delivery_notes': result,
            'total': len(result)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_delivery_note_by_id(delivery_note_id):
    """Get a specific delivery note by ID with full details"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        note_data = note.to_dict()

        project = Project.query.get(note.project_id)
        if project:
            note_data['project_details'] = enrich_project_details(project, include_mep=False)

        return jsonify({'delivery_note': note_data}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def update_delivery_note(delivery_note_id):
    """Update a delivery note (only if status is DRAFT)"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status != 'DRAFT':
            return jsonify({'error': f'Cannot update delivery note with status {note.status}. Only DRAFT notes can be updated.'}), 400

        data = request.get_json()
        current_user = g.user.get('email', 'system')

        if 'delivery_date' in data:
            note.delivery_date = datetime.fromisoformat(data['delivery_date'].replace('Z', '+00:00')) if isinstance(data['delivery_date'], str) else data['delivery_date']
        if 'attention_to' in data:
            note.attention_to = data['attention_to']
        if 'delivery_from' in data:
            note.delivery_from = data['delivery_from']
        if 'requested_by' in data:
            note.requested_by = data['requested_by']
        if 'request_date' in data and data['request_date']:
            note.request_date = datetime.fromisoformat(data['request_date'].replace('Z', '+00:00')) if isinstance(data['request_date'], str) else data['request_date']
        if 'vehicle_number' in data:
            note.vehicle_number = data['vehicle_number']
        if 'driver_name' in data:
            note.driver_name = data['driver_name']
        if 'driver_contact' in data:
            note.driver_contact = data['driver_contact']
        if 'checked_by' in data:
            note.checked_by = data['checked_by']
        if 'notes' in data:
            note.notes = data['notes']

        note.last_modified_by = current_user
        note.last_modified_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            'message': 'Delivery note updated successfully',
            'delivery_note': note.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def add_item_to_delivery_note(delivery_note_id):
    """Add an item to a delivery note"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status != 'DRAFT':
            return jsonify({'error': f'Cannot add items to delivery note with status {note.status}.'}), 400

        data = request.get_json()

        if not data.get('inventory_material_id'):
            return jsonify({'error': 'inventory_material_id is required'}), 400

        # Validate quantity with proper type checking
        try:
            quantity = float(data.get('quantity', 0))
            if quantity <= 0:
                return jsonify({'error': 'Quantity must be greater than zero'}), 400
        except (TypeError, ValueError):
            return jsonify({'error': 'Quantity must be a valid number'}), 400

        material = InventoryMaterial.query.get(data['inventory_material_id'])
        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        existing_item = DeliveryNoteItem.query.filter_by(
            delivery_note_id=delivery_note_id,
            inventory_material_id=data['inventory_material_id']
        ).first()

        if existing_item:
            return jsonify({'error': 'This material is already in the delivery note.'}), 400

        new_item = DeliveryNoteItem(
            delivery_note_id=delivery_note_id,
            inventory_material_id=data['inventory_material_id'],
            internal_request_id=data.get('internal_request_id'),
            quantity=quantity,
            unit_price=material.unit_price,
            notes=data.get('notes'),
            use_backup=data.get('use_backup', False)
        )

        db.session.add(new_item)

        # If linked to a request, update the request status to indicate DN is pending
        if data.get('internal_request_id'):
            internal_req = InternalMaterialRequest.query.get(data['internal_request_id'])
            if internal_req and internal_req.status in ['APPROVED', 'approved']:
                internal_req.status = 'DN_PENDING'
                internal_req.last_modified_by = g.user.get('email', 'system')

        db.session.commit()

        return jsonify({
            'message': 'Item added to delivery note successfully',
            'item': new_item.to_dict(),
            'delivery_note': note.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def update_delivery_note_item(delivery_note_id, item_id):
    """Update an item in a delivery note"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status != 'DRAFT':
            return jsonify({'error': f'Cannot update items in delivery note with status {note.status}.'}), 400

        item = DeliveryNoteItem.query.get(item_id)
        if not item or item.delivery_note_id != delivery_note_id:
            return jsonify({'error': 'Item not found in this delivery note'}), 404

        data = request.get_json()

        if 'quantity' in data:
            if float(data['quantity']) <= 0:
                return jsonify({'error': 'Quantity must be greater than 0'}), 400
            item.quantity = float(data['quantity'])
        if 'notes' in data:
            item.notes = data['notes']

        db.session.commit()

        return jsonify({
            'message': 'Item updated successfully',
            'item': item.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def remove_delivery_note_item(delivery_note_id, item_id):
    """Remove an item from a delivery note"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status != 'DRAFT':
            return jsonify({'error': f'Cannot remove items from delivery note with status {note.status}.'}), 400

        item = DeliveryNoteItem.query.get(item_id)
        if not item or item.delivery_note_id != delivery_note_id:
            return jsonify({'error': 'Item not found in this delivery note'}), 404

        db.session.delete(item)
        db.session.commit()

        return jsonify({
            'message': 'Item removed from delivery note successfully',
            'delivery_note': note.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def issue_delivery_note(delivery_note_id):
    """Issue a delivery note - deducts stock and marks as ISSUED"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status != 'DRAFT':
            return jsonify({'error': f'Cannot issue delivery note with status {note.status}.'}), 400

        if not note.items or len(note.items) == 0:
            return jsonify({'error': 'Cannot issue delivery note with no items'}), 400

        current_user = g.user.get('email', 'system')

        # Check stock availability for all items
        for item in note.items:
            material = InventoryMaterial.query.get(item.inventory_material_id)
            if not material:
                return jsonify({'error': f'Material with ID {item.inventory_material_id} not found'}), 404

            # Check appropriate stock based on use_backup flag
            if item.use_backup:
                available_backup = material.backup_stock or 0
                if available_backup < item.quantity:
                    return jsonify({
                        'error': f'Insufficient backup stock for {material.material_name}. Available: {available_backup} {material.unit}, Required: {item.quantity}'
                    }), 400
            else:
                if material.current_stock < item.quantity:
                    return jsonify({
                        'error': f'Insufficient stock for {material.material_name}. Available: {material.current_stock} {material.unit}, Required: {item.quantity}'
                    }), 400

        # Deduct stock and create transactions
        for item in note.items:
            material = InventoryMaterial.query.get(item.inventory_material_id)

            total_amount = item.quantity * material.unit_price
            transaction_notes = f'Material delivery - {note.delivery_note_number}'
            if item.use_backup:
                transaction_notes += ' (from backup stock)'

            new_transaction = InventoryTransaction(
                inventory_material_id=item.inventory_material_id,
                transaction_type='WITHDRAWAL',
                quantity=item.quantity,
                unit_price=material.unit_price,
                total_amount=total_amount,
                reference_number=note.delivery_note_number,
                project_id=note.project_id,
                notes=transaction_notes,
                created_by=current_user
            )
            db.session.add(new_transaction)

            # Deduct from appropriate stock
            if item.use_backup:
                material.backup_stock = (material.backup_stock or 0) - item.quantity
            else:
                material.current_stock -= item.quantity

            material.last_modified_at = datetime.utcnow()
            material.last_modified_by = current_user

            db.session.flush()
            item.inventory_transaction_id = new_transaction.inventory_transaction_id
            item.unit_price = material.unit_price

            if item.internal_request_id:
                internal_req = InternalMaterialRequest.query.get(item.internal_request_id)
                if internal_req:
                    internal_req.status = 'DISPATCHED'
                    internal_req.dispatch_date = datetime.utcnow()
                    internal_req.last_modified_by = current_user

        note.status = 'ISSUED'
        note.issued_at = datetime.utcnow()
        note.issued_by = current_user
        note.last_modified_by = current_user

        db.session.commit()

        return jsonify({
            'message': 'Delivery note issued successfully. Stock has been deducted.',
            'delivery_note': note.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def dispatch_delivery_note(delivery_note_id):
    """Mark delivery note as dispatched (in transit)"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status != 'ISSUED':
            return jsonify({'error': f'Cannot dispatch delivery note with status {note.status}.'}), 400

        data = request.get_json() or {}
        current_user = g.user.get('email', 'system')

        if data.get('vehicle_number'):
            note.vehicle_number = data['vehicle_number']
        if data.get('driver_name'):
            note.driver_name = data['driver_name']
        if data.get('driver_contact'):
            note.driver_contact = data['driver_contact']

        note.status = 'IN_TRANSIT'
        note.dispatched_at = datetime.utcnow()
        note.dispatched_by = current_user
        note.last_modified_by = current_user

        # Update linked internal requests to DISPATCHED
        for item in note.items:
            if item.internal_request_id:
                internal_req = InternalMaterialRequest.query.get(item.internal_request_id)
                if internal_req and internal_req.status in ['APPROVED', 'approved']:
                    internal_req.status = 'DISPATCHED'
                    internal_req.dispatch_date = datetime.utcnow()
                    internal_req.last_modified_by = current_user

        db.session.commit()

        return jsonify({
            'message': 'Delivery note dispatched successfully',
            'delivery_note': note.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def confirm_delivery(delivery_note_id):
    """Confirm delivery receipt at site"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status not in ['ISSUED', 'IN_TRANSIT']:
            return jsonify({'error': f'Cannot confirm delivery for note with status {note.status}.'}), 400

        data = request.get_json() or {}
        current_user = g.user.get('email', 'system')

        is_partial = False
        if data.get('items_received'):
            for item_data in data['items_received']:
                item = DeliveryNoteItem.query.get(item_data['item_id'])
                if item and item.delivery_note_id == delivery_note_id:
                    item.quantity_received = float(item_data.get('quantity_received', item.quantity))
                    if item.quantity_received < item.quantity:
                        is_partial = True

        note.status = 'PARTIAL' if is_partial else 'DELIVERED'
        note.received_by = data.get('received_by', current_user)
        note.received_at = datetime.utcnow()
        note.receiver_notes = data.get('receiver_notes')
        note.last_modified_by = current_user

        for item in note.items:
            if item.internal_request_id:
                internal_req = InternalMaterialRequest.query.get(item.internal_request_id)
                if internal_req:
                    internal_req.status = 'FULFILLED'
                    internal_req.actual_delivery_date = datetime.utcnow()
                    internal_req.last_modified_by = current_user

        db.session.commit()

        return jsonify({
            'message': 'Delivery confirmed successfully',
            'delivery_note': note.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def cancel_delivery_note(delivery_note_id):
    """Cancel a delivery note - only DRAFT notes can be cancelled"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status != 'DRAFT':
            return jsonify({'error': f'Cannot cancel delivery note with status {note.status}.'}), 400

        current_user = g.user.get('email', 'system')
        note.status = 'CANCELLED'
        note.last_modified_by = current_user

        db.session.commit()

        return jsonify({
            'message': 'Delivery note cancelled successfully',
            'delivery_note': note.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def delete_delivery_note(delivery_note_id):
    """Delete a delivery note - only DRAFT or CANCELLED notes can be deleted"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status not in ['DRAFT', 'CANCELLED']:
            return jsonify({'error': f'Cannot delete delivery note with status {note.status}.'}), 400

        db.session.delete(note)
        db.session.commit()

        return jsonify({'message': 'Delivery note deleted successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def get_delivery_notes_for_se():
    """Get delivery notes for Site Engineer's assigned projects"""
    try:
        current_user_id = g.user.get('user_id')

        # Get projects where user is site supervisor (site_supervisor_id is an integer column)
        from models.project import Project
        assigned_projects = Project.query.filter(
            Project.site_supervisor_id == current_user_id,
            Project.is_deleted == False
        ).all()

        project_ids = [p.project_id for p in assigned_projects]

        if not project_ids:
            return jsonify({
                'delivery_notes': [],
                'message': 'No assigned projects found'
            }), 200

        # Get delivery notes for these projects that have been dispatched or in transit
        status_filter = request.args.get('status')
        query = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.project_id.in_(project_ids)
        )

        if status_filter:
            query = query.filter_by(status=status_filter.upper())
        else:
            # By default, show issued/dispatched and in-transit notes (not draft or cancelled)
            query = query.filter(MaterialDeliveryNote.status.in_(['ISSUED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'PARTIAL']))

        notes = query.order_by(MaterialDeliveryNote.created_at.desc()).all()

        # Enrich with project details
        project_map = {p.project_id: {'project_name': p.project_name, 'project_code': p.project_code} for p in assigned_projects}

        result = []
        for note in notes:
            note_dict = note.to_dict()
            note_dict['project_name'] = project_map.get(note.project_id, {}).get('project_name', f'Project #{note.project_id}')
            note_dict['project_code'] = project_map.get(note.project_id, {}).get('project_code', '')
            result.append(note_dict)

        return jsonify({
            'delivery_notes': result,
            'total': len(result)
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def get_returnable_materials_for_se():
    """Get all returnable materials for Site Engineer's assigned projects.

    Returns materials from delivered delivery notes that can still be returned,
    tracked per delivery note item and grouped by project.
    """
    try:
        current_user_id = g.user.get('user_id')

        # Get projects where user is site supervisor
        assigned_projects = Project.query.filter(
            Project.site_supervisor_id == current_user_id,
            Project.is_deleted == False
        ).all()

        if not assigned_projects:
            return jsonify({
                'projects': [],
                'message': 'No assigned projects found'
            }), 200

        result = []

        for project in assigned_projects:
            # Get delivery notes for this project with returnable status
            delivery_notes = MaterialDeliveryNote.query.filter(
                MaterialDeliveryNote.project_id == project.project_id,
                MaterialDeliveryNote.status.in_(RETURNABLE_DN_STATUSES)
            ).order_by(MaterialDeliveryNote.delivery_date.desc()).all()

            if not delivery_notes:
                continue

            # Track each delivery note item separately using helper function
            materials = []

            for dn in delivery_notes:
                for item in dn.items:
                    material = InventoryMaterial.query.get(item.inventory_material_id)
                    if not material:
                        continue

                    # Use helper function to build returnable material dict
                    material_data = build_returnable_material_item(dn, item, material)
                    if material_data:
                        materials.append(material_data)

            if materials:
                # Sort by material name, then by delivery date
                materials.sort(key=lambda x: (x['material_name'], x['delivery_date'] or ''))

                result.append({
                    'project_id': project.project_id,
                    'project_name': project.project_name,
                    'project_code': project.project_code,
                    'location': project.location,
                    'materials': materials,
                    'total_materials': len(materials)
                })

        return jsonify({
            'projects': result,
            'total_projects': len(result)
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def get_material_returns_for_se():
    """Get all material returns submitted by or for Site Engineer's assigned projects."""
    try:
        current_user_id = g.user.get('user_id')

        # Get projects where user is site supervisor
        from models.project import Project
        assigned_projects = Project.query.filter(
            Project.site_supervisor_id == current_user_id,
            Project.is_deleted == False
        ).all()

        project_ids = [p.project_id for p in assigned_projects]

        if not project_ids:
            return jsonify({
                'returns': [],
                'message': 'No assigned projects found'
            }), 200

        # Get all returns for these projects
        returns = MaterialReturn.query.filter(
            MaterialReturn.project_id.in_(project_ids)
        ).order_by(MaterialReturn.created_at.desc()).all()

        # Enrich with project details
        project_map = {p.project_id: {
            'project_name': p.project_name,
            'project_code': p.project_code,
            'location': p.location
        } for p in assigned_projects}

        result = []
        for ret in returns:
            ret_data = ret.to_dict()
            ret_data['project_name'] = project_map.get(ret.project_id, {}).get('project_name', f'Project #{ret.project_id}')
            ret_data['project_code'] = project_map.get(ret.project_id, {}).get('project_code', '')
            ret_data['project_location'] = project_map.get(ret.project_id, {}).get('location', '')

            # Add delivery note info if available
            if ret.delivery_note_item_id:
                delivery_note_item = DeliveryNoteItem.query.get(ret.delivery_note_item_id)
                if delivery_note_item:
                    delivery_note = MaterialDeliveryNote.query.get(delivery_note_item.delivery_note_id)
                    if delivery_note:
                        ret_data['delivery_note_number'] = delivery_note.delivery_note_number
                        ret_data['delivery_date'] = delivery_note.delivery_date.isoformat() if delivery_note.delivery_date else None

            result.append(ret_data)

        return jsonify({
            'returns': result,
            'total': len(result)
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500