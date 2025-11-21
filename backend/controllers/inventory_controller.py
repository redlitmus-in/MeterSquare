from flask import jsonify, request, g
from config.db import db
from models.inventory import *
from models.project import Project
from models.user import User
from datetime import datetime


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

        # Validate transaction type
        if data['transaction_type'] not in ['purchase', 'withdrawl']:
            return jsonify({'error': 'Invalid transaction type. Must be PURCHASE or WITHDRAWAL'}), 400

        # Check if material exists
        material = InventoryMaterial.query.get(data['inventory_material_id'])
        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        quantity = float(data['quantity'])
        # Use provided unit_price or default to material's unit_price
        unit_price = float(data.get('unit_price', material.unit_price))

        # Validate withdrawal quantity
        if data['transaction_type'] == 'withdrawl':
            if quantity > material.current_stock:
                return jsonify({
                    'error': f'Insufficient stock. Available: {material.current_stock} {material.unit}'
                }), 400

        # Calculate total amount
        total_amount = quantity * unit_price

        # Create transaction
        new_transaction = InventoryTransaction(
            inventory_material_id=data['inventory_material_id'],
            transaction_type=data['transaction_type'],
            quantity=quantity,
            unit_price=unit_price,
            total_amount=total_amount,
            reference_number=data.get('reference_number'),
            project_id=data.get('project_id'),
            notes=data.get('notes'),
            created_by=current_user
        )

        # Update material stock
        if data['transaction_type'] == 'purchase':
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
                    # Get project managers
                    project_managers = []
                    if project.user_id:
                        pm_ids = project.user_id if isinstance(project.user_id, list) else []
                        for pm_id in pm_ids:
                            pm_user = User.query.get(pm_id)
                            if pm_user:
                                project_managers.append({
                                    'user_id': pm_user.user_id,
                                    'full_name': pm_user.full_name,
                                    'email': pm_user.email
                                })

                    # Get MEP managers
                    mep_managers = []
                    if project.mep_supervisor_id:
                        mep_ids = project.mep_supervisor_id if isinstance(project.mep_supervisor_id, list) else []
                        for mep_id in mep_ids:
                            mep_user = User.query.get(mep_id)
                            if mep_user:
                                mep_managers.append({
                                    'user_id': mep_user.user_id,
                                    'full_name': mep_user.full_name,
                                    'email': mep_user.email
                                })

                    # Add project details to transaction
                    txn_data['project_details'] = {
                        'project_name': project.project_name,
                        'project_code': project.project_code,
                        'location': project.location,
                        'project_managers': project_managers,
                        'mep_managers': mep_managers
                    }

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

        # Get project managers
        project_managers = []
        if project.user_id:
            pm_ids = project.user_id if isinstance(project.user_id, list) else []
            for pm_id in pm_ids:
                pm_user = User.query.get(pm_id)
                if pm_user:
                    project_managers.append({
                        'user_id': pm_user.user_id,
                        'full_name': pm_user.full_name,
                        'email': pm_user.email
                    })

        # Get MEP managers
        mep_managers = []
        if project.mep_supervisor_id:
            mep_ids = project.mep_supervisor_id if isinstance(project.mep_supervisor_id, list) else []
            for mep_id in mep_ids:
                mep_user = User.query.get(mep_id)
                if mep_user:
                    mep_managers.append({
                        'user_id': mep_user.user_id,
                        'full_name': mep_user.full_name,
                        'email': mep_user.email
                    })

        # Add project details to response
        response_data['project_details'] = {
            'project_name': project.project_name,
            'project_code': project.project_code,
            'location': project.location,
            'project_managers': project_managers,
            'mep_managers': mep_managers
        }

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
            # Get project managers
            project_managers = []
            if project.user_id:
                pm_ids = project.user_id if isinstance(project.user_id, list) else []
                for pm_id in pm_ids:
                    pm_user = User.query.get(pm_id)
                    if pm_user:
                        project_managers.append({
                            'user_id': pm_user.user_id,
                            'full_name': pm_user.full_name,
                            'email': pm_user.email
                        })

            # Get MEP managers
            mep_managers = []
            if project.mep_supervisor_id:
                mep_ids = project.mep_supervisor_id if isinstance(project.mep_supervisor_id, list) else []
                for mep_id in mep_ids:
                    mep_user = User.query.get(mep_id)
                    if mep_user:
                        mep_managers.append({
                            'user_id': mep_user.user_id,
                            'full_name': mep_user.full_name,
                            'email': mep_user.email
                        })

            req_data['project_details'] = {
                'project_name': project.project_name,
                'project_code': project.project_code,
                'location': project.location,
                'project_managers': project_managers,
                'mep_managers': mep_managers
            }

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
            # Get all withdrawal transactions for this material
            all_withdrawals = InventoryTransaction.query.filter_by(
                inventory_material_id=internal_req.inventory_material_id,
                transaction_type='withdrawl'
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
                # Get project managers
                project_managers = []
                if project.user_id:
                    pm_ids = project.user_id if isinstance(project.user_id, list) else []
                    for pm_id in pm_ids:
                        pm_user = User.query.get(pm_id)
                        if pm_user:
                            project_managers.append({
                                'user_id': pm_user.user_id,
                                'full_name': pm_user.full_name,
                                'email': pm_user.email
                            })

                # Get MEP managers
                mep_managers = []
                if project.mep_supervisor_id:
                    mep_ids = project.mep_supervisor_id if isinstance(project.mep_supervisor_id, list) else []
                    for mep_id in mep_ids:
                        mep_user = User.query.get(mep_id)
                        if mep_user:
                            mep_managers.append({
                                'user_id': mep_user.user_id,
                                'full_name': mep_user.full_name,
                                'email': mep_user.email
                            })

                req_data['project_details'] = {
                    'project_name': project.project_name,
                    'project_code': project.project_code,
                    'location': project.location,
                    'project_managers': project_managers,
                    'mep_managers': mep_managers
                }

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
                # Get project managers
                project_managers = []
                if project.user_id:
                    pm_ids = project.user_id if isinstance(project.user_id, list) else []
                    for pm_id in pm_ids:
                        pm_user = User.query.get(pm_id)
                        if pm_user:
                            project_managers.append({
                                'user_id': pm_user.user_id,
                                'full_name': pm_user.full_name,
                                'email': pm_user.email
                            })

                # Get MEP managers
                mep_managers = []
                if project.mep_supervisor_id:
                    mep_ids = project.mep_supervisor_id if isinstance(project.mep_supervisor_id, list) else []
                    for mep_id in mep_ids:
                        mep_user = User.query.get(mep_id)
                        if mep_user:
                            mep_managers.append({
                                'user_id': mep_user.user_id,
                                'full_name': mep_user.full_name,
                                'email': mep_user.email
                            })

                req_data['project_details'] = {
                    'project_name': project.project_name,
                    'project_code': project.project_code,
                    'location': project.location,
                    'project_managers': project_managers,
                    'mep_managers': mep_managers
                }

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
        internal_req.status = 'approved'
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
        internal_req.status = 'dispatched'
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