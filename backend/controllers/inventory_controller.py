from flask import jsonify, request, g, send_file
from sqlalchemy import func
from config.db import db
from models.inventory import *
from models.project import Project
from models.user import User
from models.system_settings import SystemSettings
from datetime import datetime
from utils.comprehensive_notification_service import ComprehensiveNotificationService
from utils.rdn_pdf_generator import RDNPDFGenerator

# Import shared helpers (these can also be used by other controllers)
from controllers.inventory_helpers import (
    DELIVERY_NOTE_PREFIX,
    MAX_STOCK_ALERTS,
    MAX_PAGINATION_LIMIT,
    MAX_BATCH_SIZE,
    MATERIAL_CONDITIONS,
    RETURNABLE_DN_STATUSES,
    DISPOSAL_PENDING_APPROVAL,
    DISPOSAL_APPROVED,
    DISPOSAL_PENDING_REVIEW,
    DISPOSAL_APPROVED_DISPOSAL,
    DISPOSAL_DISPOSED,
    DISPOSAL_SENT_FOR_REPAIR,
    DISPOSAL_REPAIRED,
    DISPOSAL_REJECTED,
    generate_material_code,
    sanitize_search_term,
    validate_pagination_params,
    validate_quantity,
    get_store_name,
    get_inventory_config,
    get_project_managers,
    get_mep_supervisors,
    get_site_supervisor,
    enrich_project_details,
    build_returnable_material_item,
)

# Note: Constants and helper functions are now imported from inventory_helpers.py
# This file contains the main API endpoint functions


def _build_returnable_material_item_local(delivery_note, item, material):
    """Build returnable material dictionary for a delivery note item.

    Args:
        delivery_note: MaterialDeliveryNote object
        item: DeliveryNoteItem object
        material: InventoryMaterial object

    Returns:
        dict with returnable material info, or None if nothing to return
    """
    # Check MaterialReturn table (legacy returns)
    returns = MaterialReturn.query.filter_by(
        delivery_note_item_id=item.item_id
    ).all()
    total_returned_legacy = sum(r.quantity for r in returns)

    # Check ReturnDeliveryNoteItem table (new RDN-based returns)
    # Only count items in RDNs that are not yet RECEIVED (to avoid double counting)
    rdn_items_quantity = db.session.query(
        db.func.coalesce(db.func.sum(ReturnDeliveryNoteItem.quantity), 0)
    ).join(
        ReturnDeliveryNote,
        ReturnDeliveryNoteItem.return_note_id == ReturnDeliveryNote.return_note_id
    ).filter(
        ReturnDeliveryNoteItem.original_delivery_note_item_id == item.item_id,
        # Exclude RECEIVED status as those are processed and would be in MaterialReturn
        ReturnDeliveryNote.status.notin_(['RECEIVED', 'PARTIAL'])
    ).scalar() or 0

    total_returned = total_returned_legacy + float(rdn_items_quantity)
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


def get_site_supervisors(project):
    """Extract all site supervisors/engineers assigned to this project

    Checks three sources:
    1. project.site_supervisor_id (single SE from Project table)
    2. PMAssignSS.ss_ids (array of SE IDs)
    3. PMAssignSS.assigned_to_se_id (single SE assignment)

    Returns array of site supervisor objects with user details

    IMPORTANT: Only returns users with Site Engineer role to prevent
    incorrect assignments (e.g., Estimators being listed as Site Engineers)
    """
    from models.pm_assign_ss import PMAssignSS

    supervisors = []
    seen_ids = set()

    # Helper function to validate user is actually a Site Engineer
    def is_site_engineer(user):
        """Check if user has Site Engineer role"""
        if not user or not user.role_id:
            return False
        role = Role.query.get(user.role_id)
        if not role:
            return False
        # Check for Site Engineer role (case-insensitive)
        role_name_lower = role.role.lower().replace('_', '').replace(' ', '')
        return role_name_lower in ['siteengineer', 'sitesupervisor', 'se']

    # First, check if project has direct site_supervisor_id
    if project and project.site_supervisor_id:
        site_user = User.query.get(project.site_supervisor_id)
        if site_user and is_site_engineer(site_user):
            supervisors.append({
                'user_id': site_user.user_id,
                'full_name': site_user.full_name,
                'email': site_user.email
            })
            seen_ids.add(site_user.user_id)

    # Then, check PMAssignSS table for additional site supervisors
    if project:
        assignments = PMAssignSS.query.filter_by(
            project_id=project.project_id,
            is_deleted=False
        ).all()

        for assignment in assignments:
            # Check ss_ids array
            if assignment.ss_ids:  # ss_ids is an array
                for ss_id in assignment.ss_ids:
                    if ss_id not in seen_ids:
                        ss_user = User.query.get(ss_id)
                        if ss_user and is_site_engineer(ss_user):
                            supervisors.append({
                                'user_id': ss_user.user_id,
                                'full_name': ss_user.full_name,
                                'email': ss_user.email
                            })
                            seen_ids.add(ss_user.user_id)

            # Also check assigned_to_se_id (single SE assignment)
            if assignment.assigned_to_se_id and assignment.assigned_to_se_id not in seen_ids:
                se_user = User.query.get(assignment.assigned_to_se_id)
                if se_user and is_site_engineer(se_user):
                    supervisors.append({
                        'user_id': se_user.user_id,
                        'full_name': se_user.full_name,
                        'email': se_user.email
                    })
                    seen_ids.add(se_user.user_id)

    return supervisors if supervisors else None


def get_site_supervisor(project):
    """Legacy function - returns first site supervisor for backward compatibility"""
    supervisors = get_site_supervisors(project)
    return supervisors[0] if supervisors else None


def enrich_project_details(project, include_mep=True):
    """Get enriched project details including managers and supervisors"""
    if not project:
        return None
    details = {
        'project_id': project.project_id,
        'project_name': project.project_name,
        'project_code': project.project_code,
        'location': project.location,
        'area': project.area,
        'project_managers': get_project_managers(project),
        'site_supervisor': get_site_supervisor(project),  # First SE for backward compatibility
        'site_supervisors': get_site_supervisors(project)  # All SEs - NEW
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

        # Check for duplicate materials (case-insensitive comparison)
        material_name = data['material_name'].strip().lower()
        brand = (data.get('brand') or '').strip().lower()
        size = (data.get('size') or '').strip().lower()

        # Build duplicate query - match on material_name, brand, and size
        duplicate_query = InventoryMaterial.query.filter(
            db.func.lower(InventoryMaterial.material_name) == material_name
        )

        # Add brand filter
        if brand:
            duplicate_query = duplicate_query.filter(
                db.func.lower(InventoryMaterial.brand) == brand
            )
        else:
            duplicate_query = duplicate_query.filter(
                (InventoryMaterial.brand == None) | (InventoryMaterial.brand == '')
            )

        # Add size filter
        if size:
            duplicate_query = duplicate_query.filter(
                db.func.lower(InventoryMaterial.size) == size
            )
        else:
            duplicate_query = duplicate_query.filter(
                (InventoryMaterial.size == None) | (InventoryMaterial.size == '')
            )

        existing_material = duplicate_query.first()

        if existing_material:
            return jsonify({
                'error': f'Material already exists: {existing_material.material_code} - {existing_material.material_name}' +
                         (f' ({existing_material.brand})' if existing_material.brand else '') +
                         (f' - {existing_material.size}' if existing_material.size else ''),
                'existing_material': existing_material.to_dict()
            }), 409

        # Auto-generate material code
        material_code = generate_material_code()

        # unit_price defaults to 0.0 and will be updated from first Stock In transaction
        new_material = InventoryMaterial(
            material_code=material_code,
            material_name=data['material_name'],
            brand=data.get('brand'),
            size=data.get('size'),
            category=data.get('category'),
            unit=data['unit'],
            current_stock=data.get('current_stock', 0.0),
            min_stock_level=data.get('min_stock_level', 0.0),
            unit_price=0.0,  # Will be set from first purchase transaction
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
    """Get all materials in inventory with optional filters and pagination"""
    try:
        # Get query parameters
        category = request.args.get('category')
        is_active = request.args.get('is_active')
        low_stock = request.args.get('low_stock')
        search = request.args.get('search')

        # Pagination parameters
        page = request.args.get('page', type=int)
        limit = request.args.get('limit', type=int)

        # Validate pagination parameters
        validation_error = validate_pagination_params(page, limit)
        if validation_error:
            return jsonify(validation_error[0]), validation_error[1]

        query = InventoryMaterial.query

        # Apply filters
        if category:
            query = query.filter_by(category=category)
        if is_active is not None:
            query = query.filter_by(is_active=is_active.lower() == 'true')
        if low_stock and low_stock.lower() == 'true':
            query = query.filter(InventoryMaterial.current_stock <= InventoryMaterial.min_stock_level)
        if search:
            # Sanitize search term to prevent SQL wildcard injection
            search_term = f"%{sanitize_search_term(search)}%"
            query = query.filter(
                db.or_(
                    InventoryMaterial.material_name.ilike(search_term),
                    InventoryMaterial.material_code.ilike(search_term),
                    InventoryMaterial.brand.ilike(search_term),
                    InventoryMaterial.category.ilike(search_term)
                )
            )

        # Order by latest first
        query = query.order_by(InventoryMaterial.inventory_material_id.desc())

        # Get total count before pagination
        total = query.count()

        # Apply pagination if requested
        if page is not None and limit is not None:
            offset = (page - 1) * limit
            materials = query.offset(offset).limit(limit).all()
            total_pages = (total + limit - 1) // limit

            return jsonify({
                'materials': [material.to_dict() for material in materials],
                'total': total,
                'page': page,
                'limit': limit,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_prev': page > 1
            }), 200
        else:
            # Return all (backward compatible)
            materials = query.all()
            return jsonify({
                'materials': [material.to_dict() for material in materials],
                'total': total
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
    """Create a new material transaction (purchase or withdrawal) with optional file upload"""
    try:
        # Check if request has FormData (with file) or JSON
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Handle FormData (with file upload)
            data = request.form.to_dict()
            delivery_note_file = request.files.get('delivery_note_file')
        else:
            # Handle JSON (backward compatibility)
            data = request.get_json()
            delivery_note_file = None

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

        # Extract transport/delivery fields (optional - for Production Manager role)
        driver_name = data.get('driver_name', None)
        vehicle_number = data.get('vehicle_number', None)
        transport_fee = float(data.get('transport_fee', 0.0)) if data.get('transport_fee') else None
        # transport_notes = data.get('transport_notes', None)
        delivery_batch_ref = data.get('delivery_batch_ref', None)
        # Handle file upload to Supabase if provided
        delivery_note_url = None
        if delivery_note_file:
            try:
                import os
                from datetime import datetime as dt
                from supabase import create_client

                # Get Supabase credentials based on environment
                # Use SERVICE_ROLE key for server-side uploads (has admin privileges)
                environment = os.environ.get('ENVIRONMENT', 'production')
                if environment == 'development':
                    supabase_url = os.environ.get('DEV_SUPABASE_URL')
                    supabase_key = os.environ.get('DEV_SUPABASE_ANON_KEY')  # SERVICE_ROLE key
                else:
                    supabase_url = os.environ.get('SUPABASE_URL')
                    supabase_key = os.environ.get('SUPABASE_ANON_KEY')  # SERVICE_ROLE key

                if not supabase_url or not supabase_key:
                    raise Exception('Supabase credentials must be set in environment variables')

                supabase = create_client(supabase_url, supabase_key)

                # Generate unique filename
                timestamp = dt.now().strftime('%Y%m%d_%H%M%S')
                original_filename = delivery_note_file.filename
                file_extension = os.path.splitext(original_filename)[1]
                unique_filename = f"delivery-notes/{timestamp}_{original_filename}"

                # Upload to Supabase Storage
                file_data = delivery_note_file.read()

                # Use the correct API format for supabase-py
                # The upload method signature: upload(path, file, file_options=None)
                bucket = supabase.storage.from_('inventory-files')

                try:
                    response = bucket.upload(
                        unique_filename,  # path (positional)
                        file_data,  # file bytes (positional)
                        {"content-type": delivery_note_file.content_type, "upsert": "false"}  # file_options (positional)
                    )
                except Exception as e:
                    raise

                # Get public URL
                delivery_note_url = bucket.get_public_url(unique_filename)

            except Exception as upload_error:
                return jsonify({'error': f'File upload failed: {str(upload_error)}'}), 500

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
            delivery_note_url=delivery_note_url,
            # Transport/Delivery fields
            driver_name=driver_name,
            vehicle_number=vehicle_number,
            transport_fee=transport_fee,
            # transport_notes=transport_notes,
            delivery_batch_ref=delivery_batch_ref,
            created_by=current_user
        )

        # Update material stock
        if transaction_type == 'PURCHASE':
            material.current_stock += quantity
            # Auto-update reference price if this is the first purchase (unit_price is 0.0)
            if material.unit_price == 0.0:
                material.unit_price = unit_price
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
    """Get all material transactions with optional filters and pagination"""
    try:
        # Get query parameters
        inventory_material_id = request.args.get('inventory_material_id')
        transaction_type = request.args.get('transaction_type')
        project_id = request.args.get('project_id')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        search = request.args.get('search')

        # Pagination parameters
        page = request.args.get('page', type=int)
        limit = request.args.get('limit', type=int)

        # Validate pagination parameters
        validation_error = validate_pagination_params(page, limit)
        if validation_error:
            return jsonify(validation_error[0]), validation_error[1]

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

        # Search across joined material data
        if search:
            # Sanitize search term to prevent SQL wildcard injection
            search_term = f"%{sanitize_search_term(search)}%"
            query = query.join(InventoryMaterial).filter(
                db.or_(
                    InventoryMaterial.material_name.ilike(search_term),
                    InventoryMaterial.material_code.ilike(search_term),
                    InventoryTransaction.reference_number.ilike(search_term)
                )
            )

        # Order by latest first
        query = query.order_by(InventoryTransaction.created_at.desc())

        # Get total count before pagination
        total = query.count()

        # Apply pagination if requested
        if page is not None and limit is not None:
            offset = (page - 1) * limit
            transactions = query.offset(offset).limit(limit).all()
            total_pages = (total + limit - 1) // limit
        else:
            transactions = query.all()
            total_pages = 1

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

        response_data = {
            'transactions': result,
            'total': total
        }

        # Include pagination info if pagination was requested
        if page is not None and limit is not None:
            response_data.update({
                'page': page,
                'limit': limit,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_prev': page > 1
            })

        return jsonify(response_data), 200

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
    """Get comprehensive Production Manager dashboard analytics in a single API call"""
    try:
        from datetime import timedelta
        from sqlalchemy import case
        from sqlalchemy.orm import joinedload

        # ==================== 1. STOCK HEALTH METRICS ====================
        materials = InventoryMaterial.query.filter_by(is_active=True).all()

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
                    'material_code': mat.material_code,
                    'category': mat.category
                })
            elif mat.min_stock_level and mat.current_stock <= mat.min_stock_level * 0.5:
                critical_items += 1
                stock_alerts.append({
                    'name': mat.material_name,
                    'stock': mat.current_stock,
                    'unit': mat.unit,
                    'status': 'critical',
                    'material_code': mat.material_code,
                    'category': mat.category
                })
            elif mat.min_stock_level and mat.current_stock <= mat.min_stock_level:
                low_stock_items += 1
                stock_alerts.append({
                    'name': mat.material_name,
                    'stock': mat.current_stock,
                    'unit': mat.unit,
                    'status': 'low',
                    'material_code': mat.material_code,
                    'category': mat.category
                })
            else:
                healthy_items += 1

        # Calculate total inventory value
        total_value = sum(mat.current_stock * mat.unit_price for mat in materials)
        total_backup_value = sum(mat.backup_stock * mat.unit_price for mat in materials if mat.backup_stock)

        # ==================== 2. CATEGORY DISTRIBUTION ====================
        category_map = {}
        for mat in materials:
            cat = mat.category or 'Uncategorized'
            if cat not in category_map:
                category_map[cat] = {'count': 0, 'value': 0, 'stock': 0}
            category_map[cat]['count'] += 1
            category_map[cat]['value'] += mat.current_stock * mat.unit_price
            category_map[cat]['stock'] += mat.current_stock

        categories = sorted([
            {'name': k, 'count': v['count'], 'value': round(v['value'], 2), 'stock': round(v['stock'], 2)}
            for k, v in category_map.items()
        ], key=lambda x: x['value'], reverse=True)

        # ==================== 3. DELIVERY NOTES TRACKING (Optimized single query) ====================
        dn_counts = db.session.query(
            func.coalesce(func.sum(case((MaterialDeliveryNote.status == 'DRAFT', 1), else_=0)), 0).label('draft'),
            func.coalesce(func.sum(case((MaterialDeliveryNote.status == 'ISSUED', 1), else_=0)), 0).label('issued'),
            func.coalesce(func.sum(case((MaterialDeliveryNote.status == 'IN_TRANSIT', 1), else_=0)), 0).label('in_transit'),
            func.coalesce(func.sum(case((MaterialDeliveryNote.status == 'DELIVERED', 1), else_=0)), 0).label('delivered'),
            func.coalesce(func.sum(case((MaterialDeliveryNote.status == 'PARTIAL', 1), else_=0)), 0).label('partial'),
            func.coalesce(func.sum(case((MaterialDeliveryNote.status == 'CANCELLED', 1), else_=0)), 0).label('cancelled')
        ).first()

        dn_draft = int(dn_counts.draft) if dn_counts else 0
        dn_issued = int(dn_counts.issued) if dn_counts else 0
        dn_in_transit = int(dn_counts.in_transit) if dn_counts else 0
        dn_delivered = int(dn_counts.delivered) if dn_counts else 0
        dn_partial = int(dn_counts.partial) if dn_counts else 0
        dn_cancelled = int(dn_counts.cancelled) if dn_counts else 0

        delivery_notes_status = {
            'draft': dn_draft,
            'issued': dn_issued,
            'in_transit': dn_in_transit,
            'delivered': dn_delivered,
            'partial': dn_partial,
            'cancelled': dn_cancelled,
            'total': dn_draft + dn_issued + dn_in_transit + dn_delivered + dn_partial,
            'pending_action': dn_draft + dn_issued
        }

        # ==================== 4. RETURN DELIVERY NOTES TRACKING (Optimized single query) ====================
        rdn_counts = db.session.query(
            func.coalesce(func.sum(case((ReturnDeliveryNote.status == 'DRAFT', 1), else_=0)), 0).label('draft'),
            func.coalesce(func.sum(case((ReturnDeliveryNote.status == 'ISSUED', 1), else_=0)), 0).label('issued'),
            func.coalesce(func.sum(case((ReturnDeliveryNote.status == 'IN_TRANSIT', 1), else_=0)), 0).label('in_transit'),
            func.coalesce(func.sum(case((ReturnDeliveryNote.status == 'RECEIVED', 1), else_=0)), 0).label('received'),
            func.coalesce(func.sum(case((ReturnDeliveryNote.status == 'PARTIAL', 1), else_=0)), 0).label('partial')
        ).first()

        rdn_draft = int(rdn_counts.draft) if rdn_counts else 0
        rdn_issued = int(rdn_counts.issued) if rdn_counts else 0
        rdn_in_transit = int(rdn_counts.in_transit) if rdn_counts else 0
        rdn_received = int(rdn_counts.received) if rdn_counts else 0
        rdn_partial = int(rdn_counts.partial) if rdn_counts else 0

        return_notes_status = {
            'draft': rdn_draft,
            'issued': rdn_issued,
            'in_transit': rdn_in_transit,
            'received': rdn_received,
            'partial': rdn_partial,
            'total': rdn_draft + rdn_issued + rdn_in_transit + rdn_received + rdn_partial,
            'incoming': rdn_issued + rdn_in_transit
        }

        # ==================== 5. INTERNAL MATERIAL REQUESTS (Optimized single query) ====================
        imr_counts = db.session.query(
            func.coalesce(func.sum(case((InternalMaterialRequest.status.in_(['PENDING', 'send_request']), 1), else_=0)), 0).label('pending'),
            func.coalesce(func.sum(case((InternalMaterialRequest.status == 'awaiting_vendor_delivery', 1), else_=0)), 0).label('awaiting_vendor'),
            func.coalesce(func.sum(case((InternalMaterialRequest.status == 'approved', 1), else_=0)), 0).label('approved'),
            func.coalesce(func.sum(case((InternalMaterialRequest.status == 'dn_pending', 1), else_=0)), 0).label('dn_pending'),
            func.coalesce(func.sum(case((InternalMaterialRequest.status == 'dispatched', 1), else_=0)), 0).label('dispatched'),
            func.coalesce(func.sum(case((InternalMaterialRequest.status == 'fulfilled', 1), else_=0)), 0).label('fulfilled'),
            func.coalesce(func.sum(case((InternalMaterialRequest.status == 'rejected', 1), else_=0)), 0).label('rejected')
        ).first()

        imr_pending = int(imr_counts.pending) if imr_counts else 0
        imr_awaiting_vendor = int(imr_counts.awaiting_vendor) if imr_counts else 0
        imr_approved = int(imr_counts.approved) if imr_counts else 0
        imr_dn_pending = int(imr_counts.dn_pending) if imr_counts else 0
        imr_dispatched = int(imr_counts.dispatched) if imr_counts else 0
        imr_fulfilled = int(imr_counts.fulfilled) if imr_counts else 0
        imr_rejected = int(imr_counts.rejected) if imr_counts else 0

        material_requests_status = {
            'pending': imr_pending,
            'awaiting_vendor': imr_awaiting_vendor,
            'approved': imr_approved,
            'dn_pending': imr_dn_pending,
            'dispatched': imr_dispatched,
            'fulfilled': imr_fulfilled,
            'rejected': imr_rejected,
            'total_active': imr_pending + imr_awaiting_vendor + imr_approved + imr_dn_pending + imr_dispatched,
            'needs_action': imr_pending + imr_approved + imr_dn_pending
        }

        # ==================== 6. MATERIAL RETURNS & DISPOSAL (Optimized single query) ====================
        returns_counts = db.session.query(
            func.coalesce(func.sum(case((MaterialReturn.disposal_status == 'pending_approval', 1), else_=0)), 0).label('pending_approval'),
            func.coalesce(func.sum(case((MaterialReturn.disposal_status == 'pending_review', 1), else_=0)), 0).label('pending_review'),
            func.coalesce(func.sum(case((MaterialReturn.disposal_status == 'sent_for_repair', 1), else_=0)), 0).label('sent_for_repair'),
            func.coalesce(func.sum(case((MaterialReturn.disposal_status == 'approved', 1), else_=0)), 0).label('approved'),
            func.coalesce(func.sum(case((MaterialReturn.disposal_status == 'disposed', 1), else_=0)), 0).label('disposed'),
            func.coalesce(func.sum(case((MaterialReturn.condition == 'Good', 1), else_=0)), 0).label('good'),
            func.coalesce(func.sum(case((MaterialReturn.condition == 'Damaged', 1), else_=0)), 0).label('damaged'),
            func.coalesce(func.sum(case((MaterialReturn.condition == 'Defective', 1), else_=0)), 0).label('defective')
        ).first()

        returns_pending = int(returns_counts.pending_approval) if returns_counts else 0
        returns_pending_review = int(returns_counts.pending_review) if returns_counts else 0
        returns_sent_repair = int(returns_counts.sent_for_repair) if returns_counts else 0
        returns_approved = int(returns_counts.approved) if returns_counts else 0
        returns_disposed = int(returns_counts.disposed) if returns_counts else 0
        returns_good = int(returns_counts.good) if returns_counts else 0
        returns_damaged = int(returns_counts.damaged) if returns_counts else 0
        returns_defective = int(returns_counts.defective) if returns_counts else 0

        returns_status = {
            'pending_approval': returns_pending,
            'pending_review': returns_pending_review,
            'sent_for_repair': returns_sent_repair,
            'approved': returns_approved,
            'disposed': returns_disposed,
            'by_condition': {
                'good': returns_good,
                'damaged': returns_damaged,
                'defective': returns_defective
            },
            'needs_action': returns_pending + returns_pending_review + returns_sent_repair
        }

        # ==================== 7. RECENT TRANSACTIONS (Eager loading to avoid N+1) ====================
        transactions = InventoryTransaction.query.options(
            joinedload(InventoryTransaction.material)
        ).order_by(
            InventoryTransaction.created_at.desc()
        ).limit(10).all()

        recent_transactions = []
        for txn in transactions:
            txn_data = txn.to_dict()
            if txn.material:
                txn_data['material_name'] = txn.material.material_name
                txn_data['material_code'] = txn.material.material_code
            recent_transactions.append(txn_data)

        # ==================== 8. STOCK MOVEMENT SUMMARY (Last 30 days) ====================
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)

        # Purchases in last 30 days
        purchases_30d = db.session.query(
            func.coalesce(func.sum(InventoryTransaction.quantity), 0),
            func.coalesce(func.sum(InventoryTransaction.total_amount), 0)
        ).filter(
            InventoryTransaction.transaction_type == 'PURCHASE',
            InventoryTransaction.created_at >= thirty_days_ago
        ).first()

        # Withdrawals in last 30 days
        withdrawals_30d = db.session.query(
            func.coalesce(func.sum(InventoryTransaction.quantity), 0),
            func.coalesce(func.sum(InventoryTransaction.total_amount), 0)
        ).filter(
            InventoryTransaction.transaction_type == 'WITHDRAWAL',
            InventoryTransaction.created_at >= thirty_days_ago
        ).first()

        stock_movement = {
            'period': '30_days',
            'purchases': {
                'quantity': float(purchases_30d[0]) if purchases_30d[0] else 0,
                'value': round(float(purchases_30d[1]) if purchases_30d[1] else 0, 2)
            },
            'withdrawals': {
                'quantity': float(withdrawals_30d[0]) if withdrawals_30d[0] else 0,
                'value': round(float(withdrawals_30d[1]) if withdrawals_30d[1] else 0, 2)
            }
        }

        # ==================== 9. PROJECT-WISE DISPATCH SUMMARY ====================
        project_dispatch = db.session.query(
            MaterialDeliveryNote.project_id,
            Project.project_name,
            func.count(MaterialDeliveryNote.delivery_note_id).label('total_dns'),
            func.sum(case(
                (MaterialDeliveryNote.status == 'DELIVERED', 1),
                else_=0
            )).label('delivered_count')
        ).join(
            Project, MaterialDeliveryNote.project_id == Project.project_id
        ).filter(
            MaterialDeliveryNote.project_id.isnot(None)
        ).group_by(
            MaterialDeliveryNote.project_id, Project.project_name
        ).order_by(func.count(MaterialDeliveryNote.delivery_note_id).desc()).limit(5).all()

        top_projects = [{
            'project_id': p.project_id,
            'project_name': p.project_name,
            'total_delivery_notes': p.total_dns,
            'delivered': p.delivered_count or 0
        } for p in project_dispatch]

        # ==================== 10. TODAY'S ACTIVITY ====================
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

        today_transactions = InventoryTransaction.query.filter(
            InventoryTransaction.created_at >= today_start
        ).count()

        today_dns_created = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.created_at >= today_start
        ).count()

        today_dns_dispatched = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.dispatched_at >= today_start
        ).count()

        today_activity = {
            'transactions': today_transactions,
            'delivery_notes_created': today_dns_created,
            'delivery_notes_dispatched': today_dns_dispatched
        }

        # ==================== 11. RECENT DELIVERY NOTES ====================
        # Use a single query with join to get project names
        recent_dns_query = db.session.query(
            MaterialDeliveryNote,
            Project.project_name
        ).outerjoin(
            Project, MaterialDeliveryNote.project_id == Project.project_id
        ).order_by(
            MaterialDeliveryNote.created_at.desc()
        ).limit(5).all()

        recent_delivery_notes = []
        for dn, project_name in recent_dns_query:
            # Count items with a subquery to avoid N+1
            item_count = db.session.query(func.count(DeliveryNoteItem.item_id)).filter(
                DeliveryNoteItem.delivery_note_id == dn.delivery_note_id
            ).scalar() or 0
            recent_delivery_notes.append({
                'delivery_note_id': dn.delivery_note_id,
                'delivery_note_number': dn.delivery_note_number,
                'project_name': project_name or 'N/A',
                'status': dn.status,
                'total_items': item_count,
                'created_at': dn.created_at.isoformat() if dn.created_at else None,
                'attention_to': dn.attention_to
            })

        # ==================== 12. PENDING ACTIONS SUMMARY ====================
        pending_actions = {
            'delivery_notes_to_issue': dn_draft,
            'delivery_notes_to_dispatch': dn_issued,
            'material_requests_to_process': imr_pending + imr_approved,
            'returns_to_process': returns_pending + returns_pending_review,
            'incoming_returns': rdn_issued + rdn_in_transit,
            'total': dn_draft + dn_issued + imr_pending + imr_approved + returns_pending + returns_pending_review + rdn_issued + rdn_in_transit
        }

        return jsonify({
            'dashboard': {
                # Stock Overview
                'totalItems': total_items,
                'totalValue': round(total_value, 2),
                'totalBackupValue': round(total_backup_value, 2),
                'healthyStockItems': healthy_items,
                'lowStockItems': low_stock_items,
                'criticalItems': critical_items,
                'outOfStockItems': out_of_stock_items,
                'stockAlerts': stock_alerts[:10],
                'categories': categories,

                # Delivery Notes
                'deliveryNotesStatus': delivery_notes_status,
                'returnNotesStatus': return_notes_status,
                'recentDeliveryNotes': recent_delivery_notes,

                # Material Requests
                'materialRequestsStatus': material_requests_status,

                # Returns & Disposal
                'returnsStatus': returns_status,

                # Transactions & Movement
                'recentTransactions': recent_transactions,
                'stockMovement': stock_movement,

                # Project Summary
                'topProjects': top_projects,

                # Activity
                'todayActivity': today_activity,

                # Pending Actions (Action Required)
                'pendingActions': pending_actions,

                # Legacy fields for backward compatibility
                'totalTransactions': InventoryTransaction.query.count(),
                'pendingRequests': imr_pending,
                'approvedRequests': imr_approved,
                'rejectedRequests': imr_rejected
            }
        }), 200

    except Exception as e:
        import logging
        logging.exception("Error in inventory dashboard")
        return jsonify({'error': 'Failed to load dashboard data'}), 500


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
        project_details = enrich_project_details(project) if project else None

        return jsonify({
            'message': 'Internal material request sent for approval successfully',
            'request': internal_req.to_dict(),
            'project_details': project_details
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def get_sent_internal_requests():
    """Get all sent internal material requests (request_send=True) with project and material details

    OPTIMIZED: Uses batch loading to avoid N+1 query problem
    """
    try:
        # Get query parameters
        project_id = request.args.get('project_id')

        query = InternalMaterialRequest.query.filter_by(request_send=True)

        # Apply additional filters
        if project_id:
            query = query.filter_by(project_id=int(project_id))

        # Order by latest first - PERFORMANCE: Limit to 200 records max
        requests = query.order_by(InternalMaterialRequest.created_at.desc()).limit(200).all()

        if not requests:
            return jsonify({'requests': [], 'total': 0}), 200

        # OPTIMIZATION: Batch load all related data upfront to avoid N+1 queries
        # Collect unique IDs
        project_ids = set(req.project_id for req in requests if req.project_id)
        material_ids = set(req.inventory_material_id for req in requests if req.inventory_material_id)
        buyer_ids = set(req.request_buyer_id for req in requests if req.request_buyer_id)

        # Batch load projects (single query)
        projects_map = {}
        if project_ids:
            projects = Project.query.filter(Project.project_id.in_(project_ids)).all()
            projects_map = {p.project_id: p for p in projects}

        # Batch load materials (single query)
        materials_map = {}
        if material_ids:
            materials = InventoryMaterial.query.filter(
                InventoryMaterial.inventory_material_id.in_(material_ids)
            ).all()
            materials_map = {m.inventory_material_id: m for m in materials}

        # Batch load users (single query)
        users_map = {}
        if buyer_ids:
            users = User.query.filter(User.user_id.in_(buyer_ids)).all()
            users_map = {u.user_id: u for u in users}

        # Pre-compute project details with site supervisors
        # Batch load site supervisor assignments for all projects
        from models.pm_assign_ss import PMAssignSS

        # Get all PMAssignSS records for these projects
        ss_assignments = []
        if project_ids:
            ss_assignments = PMAssignSS.query.filter(PMAssignSS.project_id.in_(project_ids)).all()

        # Collect all site supervisor user IDs
        ss_user_ids = set()
        for project in projects_map.values():
            if project.site_supervisor_id:
                ss_user_ids.add(project.site_supervisor_id)
        for assign in ss_assignments:
            if assign.assigned_to_se_id:
                ss_user_ids.add(assign.assigned_to_se_id)
            if assign.ss_ids:
                for sid in assign.ss_ids:
                    if sid:
                        ss_user_ids.add(sid)

        # Batch load all site supervisor users
        ss_users_map = {}
        if ss_user_ids:
            ss_users = User.query.filter(User.user_id.in_(ss_user_ids)).all()
            ss_users_map = {u.user_id: u for u in ss_users}

        # Build site supervisors list per project
        project_ss_map = {}
        for pid, project in projects_map.items():
            supervisors = []
            seen_ids = set()

            # Check direct site_supervisor_id
            if project.site_supervisor_id and project.site_supervisor_id in ss_users_map:
                user = ss_users_map[project.site_supervisor_id]
                supervisors.append({
                    'user_id': user.user_id,
                    'full_name': user.full_name,
                    'email': user.email,
                    'phone': user.phone
                })
                seen_ids.add(user.user_id)

            # Check PMAssignSS records
            for assign in ss_assignments:
                if assign.project_id == pid:
                    # From ss_ids array
                    if assign.ss_ids:
                        for sid in assign.ss_ids:
                            if sid and sid not in seen_ids and sid in ss_users_map:
                                user = ss_users_map[sid]
                                supervisors.append({
                                    'user_id': user.user_id,
                                    'full_name': user.full_name,
                                    'email': user.email,
                                    'phone': user.phone
                                })
                                seen_ids.add(sid)
                    # From assigned_to_se_id
                    if assign.assigned_to_se_id and assign.assigned_to_se_id not in seen_ids:
                        if assign.assigned_to_se_id in ss_users_map:
                            user = ss_users_map[assign.assigned_to_se_id]
                            supervisors.append({
                                'user_id': user.user_id,
                                'full_name': user.full_name,
                                'email': user.email,
                                'phone': user.phone
                            })
                            seen_ids.add(assign.assigned_to_se_id)

            project_ss_map[pid] = supervisors

        # Build project details cache
        project_details_cache = {}
        for pid, project in projects_map.items():
            site_supervisors = project_ss_map.get(pid, [])
            project_details_cache[pid] = {
                'project_id': project.project_id,
                'project_name': project.project_name,
                'project_code': project.project_code,
                'location': project.location,
                'area': project.area,
                'site_supervisor': site_supervisors[0] if site_supervisors else None,
                'site_supervisors': site_supervisors
            }

        # Build result using cached data
        result = []
        for req in requests:
            req_data = req.to_dict()

            # Add project details from cache
            if req.project_id and req.project_id in project_details_cache:
                req_data['project_details'] = project_details_cache[req.project_id]

            # Add material details from cache
            if req.inventory_material_id and req.inventory_material_id in materials_map:
                material = materials_map[req.inventory_material_id]
                req_data['material_details'] = {
                    'material_code': material.material_code,
                    'material_name': material.material_name,
                    'current_stock': material.current_stock,
                    'unit': material.unit,
                    'unit_price': material.unit_price
                }

            # Add requester details from cache
            if req.request_buyer_id and req.request_buyer_id in users_map:
                requester = users_map[req.request_buyer_id]
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

        # Order by latest first - PERFORMANCE: Limit to 200 records max
        requests = query.order_by(InternalMaterialRequest.created_at.desc()).limit(200).all()

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
    """Approve an internal material request and deduct material from inventory

    For 'from_vendor_delivery' requests:
    - Materials are coming from vendor, not from existing inventory
    - PM confirms vendor delivery receipt and routes to site
    - No inventory deduction needed (materials go directly to site)

    For regular store requests:
    - Deduct material from existing inventory stock
    - Create withdrawal transaction
    """
    try:
        # Use row locking to prevent race conditions on concurrent approvals
        internal_req = InternalMaterialRequest.query.with_for_update().get(request_id)

        if not internal_req:
            return jsonify({'error': 'Internal request not found'}), 404

        if internal_req.status not in ['pending', 'PENDING', 'send_request', 'awaiting_vendor_delivery']:
            return jsonify({'error': f'Request is already {internal_req.status}'}), 400

        current_user = g.user.get('email', 'system')

        # Handle vendor delivery requests - ADD to inventory then DEDUCT (proper audit trail)
        if internal_req.source_type == 'from_vendor_delivery':
            # Validate destination site exists for vendor deliveries
            if not internal_req.final_destination_site or not internal_req.final_destination_site.strip():
                return jsonify({'error': 'Final destination site is required for vendor deliveries'}), 400

            # Check if this is a grouped materials request
            materials_data = internal_req.materials_data
            transaction_details = []

            if materials_data and isinstance(materials_data, list) and len(materials_data) > 0:
                # GROUPED VENDOR DELIVERY - Multiple materials
                print(f"Processing grouped vendor delivery: {len(materials_data)} materials")

                for mat in materials_data:
                    mat_name = mat.get('material_name', '')
                    mat_qty = float(mat.get('quantity', 0))
                    mat_unit = mat.get('unit', 'nos')
                    mat_price = float(mat.get('unit_price', 0) or 0)

                    # Find matching inventory material by name (case-insensitive)
                    inv_material = InventoryMaterial.query.filter(
                        db.func.lower(InventoryMaterial.material_name) == mat_name.lower()
                    ).first()

                    if inv_material:
                        # Step 1: ADD to inventory (received from vendor)
                        inv_material.current_stock += mat_qty
                        inv_material.last_modified_at = datetime.utcnow()
                        inv_material.last_modified_by = current_user

                        # Create RECEIVING transaction
                        receive_transaction = InventoryTransaction(
                            inventory_material_id=inv_material.inventory_material_id,
                            transaction_type='RECEIVING',
                            quantity=mat_qty,
                            unit_price=mat_price or inv_material.unit_price,
                            total_amount=mat_qty * (mat_price or inv_material.unit_price),
                            reference_number=f'VD-{internal_req.request_number}',
                            project_id=internal_req.project_id,
                            notes=f'Received from vendor - Request #{internal_req.request_number}',
                            created_by=current_user
                        )
                        db.session.add(receive_transaction)

                        # Step 2: DEDUCT from inventory (sent to site)
                        inv_material.current_stock -= mat_qty
                        inv_material.last_modified_at = datetime.utcnow()

                        # Create WITHDRAWAL transaction
                        withdraw_transaction = InventoryTransaction(
                            inventory_material_id=inv_material.inventory_material_id,
                            transaction_type='WITHDRAWAL',
                            quantity=mat_qty,
                            unit_price=mat_price or inv_material.unit_price,
                            total_amount=mat_qty * (mat_price or inv_material.unit_price),
                            reference_number=f'VD-{internal_req.request_number}',
                            project_id=internal_req.project_id,
                            notes=f'Dispatched to {internal_req.final_destination_site} - Vendor Delivery #{internal_req.request_number}',
                            created_by=current_user
                        )
                        db.session.add(withdraw_transaction)

                        transaction_details.append({
                            'material_name': mat_name,
                            'quantity': mat_qty,
                            'unit': mat_unit,
                            'action': 'received_and_dispatched'
                        })
                        print(f"Vendor delivery: {mat_name} x{mat_qty} {mat_unit} → received and dispatched to {internal_req.final_destination_site}")
                    else:
                        # Material not in inventory - just log it
                        transaction_details.append({
                            'material_name': mat_name,
                            'quantity': mat_qty,
                            'unit': mat_unit,
                            'action': 'skipped_not_in_inventory'
                        })
                        print(f"Material '{mat_name}' not found in inventory - skipping transaction")

            else:
                # SINGLE MATERIAL VENDOR DELIVERY
                mat_name = internal_req.material_name
                mat_qty = internal_req.quantity

                # Find matching inventory material
                inv_material = InventoryMaterial.query.filter(
                    db.func.lower(InventoryMaterial.material_name) == mat_name.lower()
                ).first()

                if inv_material:
                    # Step 1: ADD to inventory
                    inv_material.current_stock += mat_qty
                    inv_material.last_modified_at = datetime.utcnow()
                    inv_material.last_modified_by = current_user

                    receive_transaction = InventoryTransaction(
                        inventory_material_id=inv_material.inventory_material_id,
                        transaction_type='RECEIVING',
                        quantity=mat_qty,
                        unit_price=inv_material.unit_price,
                        total_amount=mat_qty * inv_material.unit_price,
                        reference_number=f'VD-{internal_req.request_number}',
                        project_id=internal_req.project_id,
                        notes=f'Received from vendor - Request #{internal_req.request_number}',
                        created_by=current_user
                    )
                    db.session.add(receive_transaction)

                    # Step 2: DEDUCT from inventory
                    inv_material.current_stock -= mat_qty

                    withdraw_transaction = InventoryTransaction(
                        inventory_material_id=inv_material.inventory_material_id,
                        transaction_type='WITHDRAWAL',
                        quantity=mat_qty,
                        unit_price=inv_material.unit_price,
                        total_amount=mat_qty * inv_material.unit_price,
                        reference_number=f'VD-{internal_req.request_number}',
                        project_id=internal_req.project_id,
                        notes=f'Dispatched to {internal_req.final_destination_site} - Vendor Delivery #{internal_req.request_number}',
                        created_by=current_user
                    )
                    db.session.add(withdraw_transaction)

                    transaction_details.append({
                        'material_name': mat_name,
                        'quantity': mat_qty,
                        'action': 'received_and_dispatched'
                    })
                    print(f"Vendor delivery: {mat_name} x{mat_qty} → received and dispatched to {internal_req.final_destination_site}")
                else:
                    transaction_details.append({
                        'material_name': mat_name,
                        'quantity': mat_qty,
                        'action': 'skipped_not_in_inventory'
                    })
                    print(f"Material '{mat_name}' not found in inventory - skipping transaction")

            # Approve the request
            internal_req.status = 'APPROVED'
            internal_req.approved_by = current_user
            internal_req.approved_at = datetime.utcnow()
            internal_req.vendor_delivery_confirmed = True
            internal_req.last_modified_by = current_user

            db.session.commit()

            processed_count = len([t for t in transaction_details if t.get('action') == 'received_and_dispatched'])
            skipped_count = len([t for t in transaction_details if t.get('action') == 'skipped_not_in_inventory'])

            return jsonify({
                'success': True,
                'message': f'Vendor delivery confirmed! {processed_count} materials tracked in inventory, {skipped_count} skipped (not in inventory).',
                'request': internal_req.to_dict(),
                'source_type': 'from_vendor_delivery',
                'transaction_details': transaction_details,
                'destination': internal_req.final_destination_site
            }), 200

        # Regular store request - validate and deduct from inventory
        # Check if this is a grouped materials request
        materials_data = internal_req.materials_data

        if materials_data and isinstance(materials_data, list) and len(materials_data) > 0:
            # GROUPED MATERIALS REQUEST - Handle multiple materials
            print(f"Processing grouped materials request: {len(materials_data)} materials")

            # Step 1: Find inventory items for all materials and check stock
            materials_to_deduct = []
            insufficient_stock = []

            for mat in materials_data:
                mat_name = mat.get('material_name', '')
                mat_qty = float(mat.get('quantity', 0))
                mat_unit = mat.get('unit', 'nos')

                # Find matching inventory material by name (case-insensitive)
                inv_material = InventoryMaterial.query.filter(
                    db.func.lower(InventoryMaterial.material_name) == mat_name.lower()
                ).first()

                if inv_material:
                    # Check if sufficient stock available
                    if inv_material.current_stock < mat_qty:
                        insufficient_stock.append({
                            'material_name': mat_name,
                            'requested': mat_qty,
                            'available': inv_material.current_stock,
                            'unit': mat_unit
                        })
                    else:
                        materials_to_deduct.append({
                            'inventory_material': inv_material,
                            'quantity': mat_qty,
                            'material_name': mat_name,
                            'unit': mat_unit
                        })
                else:
                    # Material not found in inventory - skip deduction but log
                    print(f"Material '{mat_name}' not found in inventory - skipping deduction")

            # If any material has insufficient stock, return error
            if insufficient_stock:
                error_details = ', '.join([
                    f"{item['material_name']}: need {item['requested']} {item['unit']}, have {item['available']}"
                    for item in insufficient_stock
                ])
                return jsonify({
                    'error': f'Insufficient stock for some materials: {error_details}',
                    'insufficient_materials': insufficient_stock
                }), 400

            # Step 2: Deduct all materials from inventory
            transactions = []
            deduction_details = []

            for item in materials_to_deduct:
                inv_mat = item['inventory_material']
                qty = item['quantity']

                previous_stock = inv_mat.current_stock
                inv_mat.current_stock -= qty
                inv_mat.last_modified_at = datetime.utcnow()
                inv_mat.last_modified_by = current_user

                # Create withdrawal transaction
                total_amount = qty * inv_mat.unit_price
                new_transaction = InventoryTransaction(
                    inventory_material_id=inv_mat.inventory_material_id,
                    transaction_type='WITHDRAWAL',
                    quantity=qty,
                    unit_price=inv_mat.unit_price,
                    total_amount=total_amount,
                    reference_number=f'REQ-{internal_req.request_number}',
                    project_id=internal_req.project_id,
                    notes=f'Approved grouped request #{internal_req.request_number} - {item["material_name"]}',
                    created_by=current_user
                )
                db.session.add(new_transaction)
                transactions.append(new_transaction)

                deduction_details.append({
                    'material_name': item['material_name'],
                    'previous_stock': previous_stock,
                    'deducted': qty,
                    'new_stock': inv_mat.current_stock,
                    'unit': item['unit']
                })

                print(f"Deducted {qty} {item['unit']} of '{item['material_name']}' from inventory (was {previous_stock}, now {inv_mat.current_stock})")

            # Step 3: Approve the request
            internal_req.status = 'APPROVED'
            internal_req.approved_by = current_user
            internal_req.approved_at = datetime.utcnow()
            internal_req.last_modified_by = current_user

            db.session.commit()

            return jsonify({
                'success': True,
                'message': f'Grouped request approved! {len(materials_to_deduct)} materials deducted from inventory.',
                'request': internal_req.to_dict(),
                'deduction_details': deduction_details,
                'materials_processed': len(materials_to_deduct),
                'materials_skipped': len(materials_data) - len(materials_to_deduct)
            }), 200

        # SINGLE MATERIAL REQUEST - Original logic
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
            'success': True,
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

        if internal_req.status not in ['pending', 'PENDING', 'send_request', 'awaiting_vendor_delivery']:
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

        # Order by latest first - PERFORMANCE: Limit to 200 records max
        returns = query.order_by(MaterialReturn.created_at.desc()).limit(200).all()

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
                    'project_code': project.project_code,
                    'location': project.location,
                    'area': project.area
                }

            # Get material details including brand
            material = InventoryMaterial.query.get(ret.inventory_material_id)
            if material:
                ret_data['material_details'] = {
                    'material_code': material.material_code,
                    'material_name': material.material_name,
                    'brand': material.brand,
                    'unit': material.unit,
                    'current_stock': material.current_stock
                }

            # Get notes from Return Delivery Note if available and notes is empty
            if not ret_data.get('notes') and ret.return_delivery_note_id:
                rdn = ReturnDeliveryNote.query.get(ret.return_delivery_note_id)
                if rdn and rdn.notes:
                    ret_data['notes'] = rdn.notes

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

            # Get project details (skip for catalog disposals where project_id = 0)
            if ret.project_id and ret.project_id > 0:
                project = Project.query.get(ret.project_id)
                if project:
                    ret_data['project_details'] = {
                        'project_id': project.project_id,
                        'project_name': project.project_name,
                        'project_code': project.project_code,
                        'area': project.area
                    }
            else:
                # Catalog disposal (not from a project)
                ret_data['project_details'] = {
                    'project_id': 0,
                    'project_name': 'Materials Catalog',
                    'project_code': 'CATALOG',
                    'area': None
                }

            # Get material details
            material = InventoryMaterial.query.get(ret.inventory_material_id)
            if material:
                ret_data['material_details'] = {
                    'material_code': material.material_code,
                    'material_name': material.material_name,
                    'brand': material.brand,
                    'unit': material.unit,
                    'current_stock': material.current_stock
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
            if not material:
                return jsonify({'error': 'Material not found in inventory'}), 404

            # For catalog disposals (project_id = 0), reduce stock immediately
            if material_return.project_id == 0:
                if material.current_stock < material_return.quantity:
                    return jsonify({'error': f'Insufficient stock. Available: {material.current_stock}, Requested: {material_return.quantity}'}), 400

                material.current_stock -= material_return.quantity
                material.last_modified_by = current_user
                material.last_modified_at = datetime.utcnow()

            material_return.disposal_status = DISPOSAL_APPROVED_DISPOSAL
            material_return.disposal_value = data.get('disposal_value', material_return.disposal_value or 0)
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
    """
    Mark material as repaired and move from backup stock to main stock.
    This is called when PM confirms the repair is complete.

    Flow: sent_for_repair -> repaired (and backup_stock -> current_stock)
    """
    try:
        material_return = MaterialReturn.query.get(return_id)

        if not material_return:
            return jsonify({'error': 'Material return not found'}), 404

        # Must be in sent_for_repair status
        if material_return.disposal_status != DISPOSAL_SENT_FOR_REPAIR:
            return jsonify({'error': f'Material must be sent for repair first. Current status: {material_return.disposal_status}'}), 400

        if material_return.add_to_stock:
            return jsonify({'error': 'Material has already been added to main stock'}), 400

        current_user = g.user.get('email', 'system')
        data = request.get_json() or {}

        # Get material
        material = InventoryMaterial.query.get(material_return.inventory_material_id)
        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        # Get quantity to move (defaults to full return quantity)
        quantity_to_move = data.get('quantity', material_return.quantity)
        if quantity_to_move > (material.backup_stock or 0):
            return jsonify({'error': f'Insufficient backup stock. Available: {material.backup_stock or 0}, Requested: {quantity_to_move}'}), 400

        # Create RETURN transaction (moving from backup to main)
        total_amount = quantity_to_move * material.unit_price
        new_transaction = InventoryTransaction(
            inventory_material_id=material_return.inventory_material_id,
            transaction_type='RETURN',
            quantity=quantity_to_move,
            unit_price=material.unit_price,
            total_amount=total_amount,
            reference_number=material_return.reference_number,
            project_id=material_return.project_id,
            notes=f'Repaired material moved from backup to main stock - {data.get("notes", "")}',
            created_by=current_user
        )
        db.session.add(new_transaction)

        # Move from backup stock to main stock
        material.backup_stock = (material.backup_stock or 0) - quantity_to_move
        material.current_stock = (material.current_stock or 0) + quantity_to_move
        material.last_modified_at = datetime.utcnow()
        material.last_modified_by = current_user

        # Update return record - mark as fully repaired
        material_return.add_to_stock = True
        material_return.disposal_status = DISPOSAL_REPAIRED  # Repair complete
        material_return.disposal_notes = data.get('notes', f'Repair completed - Moved {quantity_to_move} to main stock')
        material_return.inventory_transaction_id = new_transaction.inventory_transaction_id

        db.session.commit()

        return jsonify({
            'message': 'Repaired material added to main stock successfully',
            'return': material_return.to_dict(),
            'new_stock_level': material.current_stock,
            'new_backup_stock': material.backup_stock
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def request_disposal_from_repair(return_id):
    """
    When repair is not possible, request disposal from TD.
    This moves item from sent_for_repair status to pending_review for TD approval.

    Flow: sent_for_repair -> pending_review (awaiting TD approval for disposal)
    """
    try:
        material_return = MaterialReturn.query.get(return_id)

        if not material_return:
            return jsonify({'error': 'Material return not found'}), 404

        # Must be in sent_for_repair status
        if material_return.disposal_status != DISPOSAL_SENT_FOR_REPAIR:
            return jsonify({'error': f'Material must be sent for repair first. Current status: {material_return.disposal_status}'}), 400

        current_user = g.user.get('email', 'system')
        data = request.get_json() or {}

        # Get material
        material = InventoryMaterial.query.get(material_return.inventory_material_id)
        if not material:
            return jsonify({'error': 'Material not found in inventory'}), 404

        # Calculate disposal value
        estimated_value = material_return.quantity * material.unit_price

        # Update return record - send for disposal review
        material_return.disposal_status = DISPOSAL_PENDING_REVIEW
        material_return.disposal_value = estimated_value
        material_return.disposal_notes = data.get('notes', 'Cannot repair - Disposal requested')
        material_return.disposal_reviewed_by = current_user
        material_return.disposal_reviewed_at = datetime.utcnow()

        db.session.commit()

        # Notify TD for disposal approval
        try:
            tds = User.query.filter_by(user_role='Technical Director').all()
            project = Project.query.get(material_return.project_id) if material_return.project_id else None
            project_name = project.project_name if project else 'N/A'

            for td in tds:
                ComprehensiveNotificationService.send_email_notification(
                    recipient=td.email,
                    subject=f'Material Disposal Request - Repair Failed - {material.material_name}',
                    message=f'''
                    <p>A material disposal request has been submitted because repair was not possible.</p>

                    <h3>Material Details:</h3>
                    <ul>
                        <li>Material: {material.material_name} ({material.material_code})</li>
                        <li>Brand: {material.brand or 'N/A'}</li>
                        <li>Quantity: {material_return.quantity} {material.unit}</li>
                        <li>Condition: {material_return.condition}</li>
                        <li>Estimated Value: AED {estimated_value:.2f}</li>
                        <li>Project: {project_name}</li>
                    </ul>

                    <h3>Reason:</h3>
                    <p>{data.get('notes', 'Cannot repair - Disposal requested')}</p>

                    <p>Please review and approve/reject this disposal request in the system.</p>

                    <p>Requested by: {current_user}</p>
                    ''',
                    notification_type='disposal_request',
                    action_url=f'/inventory/disposal-requests'
                )

            print(f"Disposal request notification sent to {len(tds)} TD(s) for material {material.material_name}")
        except Exception as email_error:
            print(f"Failed to send TD notification: {str(email_error)}")

        return jsonify({
            'message': 'Disposal request sent to TD for approval',
            'return': material_return.to_dict()
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
        # Check if request contains files (multipart/form-data)
        if request.content_type and 'multipart/form-data' in request.content_type:
            # Get form data
            data = request.form.to_dict()
            # Get file
            delivery_note_file = request.files.get('delivery_note_file')
        else:
            # Regular JSON request
            data = request.get_json()
            delivery_note_file = None

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
        project = Project.query.get(int(data['project_id']))
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        delivery_note_number = generate_delivery_note_number()

        # Parse delivery date
        delivery_date = datetime.fromisoformat(data['delivery_date'].replace('Z', '+00:00')) if isinstance(data['delivery_date'], str) else data['delivery_date']

        # Parse request date if provided
        request_date = None
        if data.get('request_date'):
            request_date = datetime.fromisoformat(data['request_date'].replace('Z', '+00:00')) if isinstance(data['request_date'], str) else data['request_date']

        # Handle file upload to Supabase if provided, or use existing URL from batch
        delivery_note_url = data.get('delivery_note_url')  # Check if URL provided (for reuse from batch)
        if delivery_note_file:
            try:
                import os
                from datetime import datetime as dt
                from supabase import create_client

                # Get Supabase credentials based on environment
                environment = os.environ.get('ENVIRONMENT', 'production')
                if environment == 'development':
                    supabase_url = os.environ.get('DEV_SUPABASE_URL')
                    supabase_key = os.environ.get('DEV_SUPABASE_ANON_KEY')
                else:
                    supabase_url = os.environ.get('SUPABASE_URL')
                    supabase_key = os.environ.get('SUPABASE_ANON_KEY')

                if not supabase_url or not supabase_key:
                    raise Exception('Supabase credentials must be set in environment variables')

                supabase = create_client(supabase_url, supabase_key)

                # Generate unique filename
                timestamp = dt.now().strftime('%Y%m%d_%H%M%S')
                original_filename = delivery_note_file.filename
                file_extension = os.path.splitext(original_filename)[1]
                unique_filename = f"delivery-notes/{timestamp}_{original_filename}"

                # Upload to Supabase Storage
                file_data = delivery_note_file.read()

                bucket = supabase.storage.from_('inventory-files')

                try:
                    response = bucket.upload(
                        unique_filename,
                        file_data,
                        {"content-type": delivery_note_file.content_type, "upsert": "false"}
                    )
                except Exception as e:
                    raise

                # Get public URL
                delivery_note_url = bucket.get_public_url(unique_filename)

            except Exception as upload_error:
                return jsonify({'error': f'File upload failed: {str(upload_error)}'}), 500

        new_note = MaterialDeliveryNote(
            delivery_note_number=delivery_note_number,
            project_id=int(data['project_id']),
            delivery_date=delivery_date,
            attention_to=data.get('attention_to'),
            delivery_from=data.get('delivery_from', get_store_name()),
            requested_by=data.get('requested_by'),
            request_date=request_date,
            vehicle_number=data.get('vehicle_number'),
            driver_name=data.get('driver_name'),
            driver_contact=data.get('driver_contact'),
            delivery_note_url=delivery_note_url,
            prepared_by=prepared_by_name,
            checked_by=data.get('checked_by'),
            status='DRAFT',
            notes=data.get('notes'),
            # Transport tracking fields
            transport_fee=float(data.get('transport_fee', 0.0)) if data.get('transport_fee') else None,
            delivery_batch_ref=data.get('delivery_batch_ref'),
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
    """Get all delivery notes with optional filters and pagination"""
    try:
        project_id = request.args.get('project_id')
        status = request.args.get('status')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        search = request.args.get('search')

        # Pagination parameters
        page = request.args.get('page', type=int)
        limit = request.args.get('limit', type=int)

        # Validate pagination parameters
        validation_error = validate_pagination_params(page, limit)
        if validation_error:
            return jsonify(validation_error[0]), validation_error[1]

        query = MaterialDeliveryNote.query

        if project_id:
            query = query.filter_by(project_id=int(project_id))
        if status:
            query = query.filter_by(status=status.upper())
        if start_date:
            query = query.filter(MaterialDeliveryNote.delivery_date >= start_date)
        if end_date:
            query = query.filter(MaterialDeliveryNote.delivery_date <= end_date)
        if search:
            # Sanitize search term to prevent SQL wildcard injection
            search_term = f"%{sanitize_search_term(search)}%"
            query = query.outerjoin(Project).filter(
                db.or_(
                    MaterialDeliveryNote.delivery_note_number.ilike(search_term),
                    Project.project_name.ilike(search_term),
                    Project.project_code.ilike(search_term)
                )
            )

        query = query.order_by(MaterialDeliveryNote.created_at.desc())

        # Get total count before pagination
        total = query.count()

        # Apply pagination if requested
        if page is not None and limit is not None:
            offset = (page - 1) * limit
            notes = query.offset(offset).limit(limit).all()
            total_pages = (total + limit - 1) // limit
        else:
            notes = query.all()
            total_pages = 1

        result = []
        for note in notes:
            note_data = note.to_dict()
            project = Project.query.get(note.project_id)
            if project:
                note_data['project_details'] = {
                    'project_id': project.project_id,
                    'project_name': project.project_name,
                    'project_code': project.project_code,
                    'location': project.location,
                    'area': project.area
                }
            result.append(note_data)

        response_data = {
            'delivery_notes': result,
            'total': total
        }

        if page is not None and limit is not None:
            response_data.update({
                'page': page,
                'limit': limit,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_prev': page > 1
            })

        return jsonify(response_data), 200

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
        if 'transport_fee' in data:
            note.transport_fee = float(data['transport_fee']) if data['transport_fee'] else None
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


def add_items_to_delivery_note_bulk(delivery_note_id):
    """Add multiple items to a delivery note in a single request (batch operation)

    For vendor delivery items (is_vendor_delivery=True):
    - Auto-creates inventory material entry if material_name provided
    - Links delivery note item to newly created inventory entry
    """
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status != 'DRAFT':
            return jsonify({'error': f'Cannot add items to delivery note with status {note.status}.'}), 400

        data = request.get_json()
        items = data.get('items', [])

        if not items:
            return jsonify({'error': 'No items provided'}), 400

        if len(items) > MAX_BATCH_SIZE:
            return jsonify({'error': f'Cannot process more than {MAX_BATCH_SIZE} items at once'}), 400

        added_items = []
        errors = []
        current_user = g.user.get('email', 'system')

        for idx, item_data in enumerate(items):
            try:
                # Validate quantity first
                try:
                    quantity = float(item_data.get('quantity', 0))
                    if quantity <= 0:
                        errors.append(f"Item {idx + 1}: Quantity must be greater than zero")
                        continue
                except (TypeError, ValueError):
                    errors.append(f"Item {idx + 1}: Quantity must be a valid number")
                    continue

                material = None
                inventory_material_id = item_data.get('inventory_material_id')

                # Handle vendor delivery items - auto-create inventory entry if needed
                if item_data.get('is_vendor_delivery') and not inventory_material_id:
                    material_name = (item_data.get('material_name') or '').strip()
                    brand = (item_data.get('brand') or '').strip()

                    # Validate material_name
                    if not material_name:
                        errors.append(f"Item {idx + 1}: material_name is required for vendor delivery items")
                        continue
                    if len(material_name) > 255:
                        errors.append(f"Item {idx + 1}: material_name too long (max 255 characters)")
                        continue

                    # Validate brand
                    if len(brand) > 100:
                        errors.append(f"Item {idx + 1}: brand too long (max 100 characters)")
                        continue

                    # Check if material already exists in inventory by name (case-insensitive exact match)
                    existing_material = InventoryMaterial.query.filter(
                        func.lower(InventoryMaterial.material_name) == material_name.lower()
                    ).first()

                    if existing_material:
                        # Use existing material
                        material = existing_material
                        inventory_material_id = existing_material.inventory_material_id
                    else:
                        # Create new inventory material entry for vendor delivery
                        try:
                            material_code = generate_material_code()
                        except Exception as code_gen_error:
                            errors.append(f"Item {idx + 1}: Failed to generate material code: {str(code_gen_error)}")
                            continue

                        new_material = InventoryMaterial(
                            material_code=material_code,
                            material_name=material_name,
                            brand=brand,
                            category='Vendor Delivery',  # Category for vendor-delivered materials
                            unit='pcs',  # Default unit
                            current_stock=0,  # Not adding to stock, just creating catalog entry
                            unit_price=0.0,  # Price to be updated later if needed
                            description=f'Auto-created from vendor delivery - DN #{note.delivery_note_number}',
                            created_by=current_user,
                            last_modified_by=current_user
                        )
                        db.session.add(new_material)
                        db.session.flush()  # Get the ID without committing

                        material = new_material
                        inventory_material_id = new_material.inventory_material_id
                        print(f"Auto-created inventory material: {material_name} (ID: {inventory_material_id})")

                elif inventory_material_id:
                    material = InventoryMaterial.query.get(inventory_material_id)
                    if not material:
                        errors.append(f"Item {idx + 1}: Material not found in inventory")
                        continue
                else:
                    errors.append(f"Item {idx + 1}: inventory_material_id is required")
                    continue

                # Check for duplicate in delivery note
                existing_item = DeliveryNoteItem.query.filter_by(
                    delivery_note_id=delivery_note_id,
                    inventory_material_id=inventory_material_id
                ).first()

                if existing_item:
                    errors.append(f"Item {idx + 1}: Material '{material.material_name}' already in delivery note")
                    continue

                new_item = DeliveryNoteItem(
                    delivery_note_id=delivery_note_id,
                    inventory_material_id=inventory_material_id,
                    internal_request_id=item_data.get('internal_request_id'),
                    quantity=quantity,
                    unit_price=material.unit_price if material else 0.0,
                    notes=item_data.get('notes'),
                    use_backup=item_data.get('use_backup', False)
                )

                db.session.add(new_item)
                added_items.append(new_item)

                # If linked to a request, update the request status and link inventory material
                if item_data.get('internal_request_id'):
                    internal_req = InternalMaterialRequest.query.get(item_data['internal_request_id'])
                    if internal_req:
                        if internal_req.status in ['APPROVED', 'approved']:
                            internal_req.status = 'DN_PENDING'
                        # Link the inventory material to the request for future reference
                        if not internal_req.inventory_material_id:
                            internal_req.inventory_material_id = inventory_material_id
                        internal_req.last_modified_by = current_user

            except Exception as item_error:
                errors.append(f"Item {idx + 1}: {str(item_error)}")

        if added_items:
            db.session.commit()

        return jsonify({
            'message': f'{len(added_items)} items added to delivery note',
            'added_items': [item.to_dict() for item in added_items],
            'errors': errors,
            'delivery_note': note.to_dict()
        }), 201 if added_items else 400

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
    """Issue a delivery note - marks as ISSUED (stock already deducted when items were added)"""
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        if note.status != 'DRAFT':
            return jsonify({'error': f'Cannot issue delivery note with status {note.status}.'}), 400

        if not note.items or len(note.items) == 0:
            return jsonify({'error': 'Cannot issue delivery note with no items'}), 400

        current_user = g.user.get('email', 'system')

        # Update internal request status to DISPATCHED
        for item in note.items:
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
            'message': 'Delivery note issued successfully.',
            'delivery_note': note.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def dispatch_delivery_note(delivery_note_id):
    """Mark delivery note as dispatched (in transit)

    Supports two workflows:
    1. Production Manager: ISSUED → IN_TRANSIT (with stock deduction already done)
    2. Buyer Direct Transfer: DRAFT → IN_TRANSIT (external materials, no stock deduction)
    """
    try:
        note = MaterialDeliveryNote.query.get(delivery_note_id)

        if not note:
            return jsonify({'error': 'Delivery note not found'}), 404

        # Allow dispatch from DRAFT (Buyer external transfer) or ISSUED (PM store dispatch)
        if note.status not in ['DRAFT', 'ISSUED']:
            return jsonify({'error': f'Cannot dispatch delivery note with status {note.status}. Must be DRAFT or ISSUED.'}), 400

        data = request.get_json() or {}
        current_user = g.user.get('email', 'system')

        # Update transport details if provided
        if data.get('vehicle_number'):
            note.vehicle_number = data['vehicle_number']
        if data.get('driver_name'):
            note.driver_name = data['driver_name']
        if data.get('driver_contact'):
            note.driver_contact = data['driver_contact']

        # Set status to IN_TRANSIT (valid for both DRAFT and ISSUED sources)
        # DRAFT → IN_TRANSIT (Buyer external transfer, no stock involved)
        # ISSUED → IN_TRANSIT (PM dispatch from store, stock already deducted)
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
    """Get delivery notes for Site Engineer's assigned projects

    Checks three sources for SE assignment:
    1. Project.site_supervisor_id (direct assignment)
    2. PMAssignSS.ss_ids (array of SE IDs)
    3. PMAssignSS.assigned_to_se_id (single SE assignment)

    Admin viewing as SE gets ALL delivery notes (no user-specific filtering)
    """
    try:
        current_user_id = g.user.get('user_id')
        user_role = g.user.get('role', '').lower()
        view_as_role = request.args.get('view_as_role', '').lower()

        from models.project import Project
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import or_, any_
        import logging
        log = logging.getLogger(__name__)

        # Valid roles for view_as_role parameter
        VALID_VIEW_AS_ROLES = frozenset(['se', 'siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor'])
        SUPER_ADMIN_ROLES = frozenset(['admin', 'superadmin', 'super_admin'])

        # Validate view_as_role if provided
        if view_as_role and view_as_role not in VALID_VIEW_AS_ROLES:
            log.warning(f"Invalid view_as_role '{view_as_role}' provided by user {current_user_id}")
            return jsonify({'error': f'Invalid view_as_role: {view_as_role}'}), 400

        # Check if admin is viewing as SE
        is_admin_viewing_as_role = user_role in SUPER_ADMIN_ROLES and view_as_role

        # Collect all project IDs from multiple sources
        project_ids = set()

        # Admin viewing as role gets ALL projects
        if is_admin_viewing_as_role or user_role in SUPER_ADMIN_ROLES:
            log.info(f"Admin {current_user_id} viewing as {view_as_role or 'admin'} - getting ALL projects for delivery notes")
            all_projects = Project.query.filter(Project.is_deleted == False).all()
            project_ids = set(p.project_id for p in all_projects)
        else:
            # Source 1: Direct assignment via Project.site_supervisor_id
            direct_projects = Project.query.filter(
                Project.site_supervisor_id == current_user_id,
                Project.is_deleted == False
            ).all()
            for p in direct_projects:
                project_ids.add(p.project_id)

            # Source 2 & 3: Assignment via pm_assign_ss table
            pm_assignments = PMAssignSS.query.filter(
                PMAssignSS.is_deleted == False,
                or_(
                    PMAssignSS.assigned_to_se_id == current_user_id,
                    PMAssignSS.ss_ids.any(current_user_id)
                )
            ).all()

            for assignment in pm_assignments:
                if assignment.project_id:
                    project_ids.add(assignment.project_id)

        project_ids = list(project_ids)

        if not project_ids:
            return jsonify({
                'delivery_notes': [],
                'message': 'No assigned projects found'
            }), 200

        # Get project details for all assigned projects
        assigned_projects = Project.query.filter(
            Project.project_id.in_(project_ids),
            Project.is_deleted == False
        ).all()

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

        # PERFORMANCE: Limit to 200 records max
        notes = query.order_by(MaterialDeliveryNote.created_at.desc()).limit(200).all()

        # Enrich with project details
        project_map = {p.project_id: {'project_name': p.project_name, 'project_code': p.project_code, 'area': p.area} for p in assigned_projects}

        result = []
        for note in notes:
            note_dict = note.to_dict()
            note_dict['project_name'] = project_map.get(note.project_id, {}).get('project_name', f'Project #{note.project_id}')
            note_dict['project_code'] = project_map.get(note.project_id, {}).get('project_code', '')
            note_dict['area'] = project_map.get(note.project_id, {}).get('area', '')
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

    Checks three sources for SE assignment:
    1. Project.site_supervisor_id (direct assignment)
    2. PMAssignSS.ss_ids (array of SE IDs)
    3. PMAssignSS.assigned_to_se_id (single SE assignment)

    Admin viewing as SE gets ALL returnable materials (no user-specific filtering)
    """
    try:
        current_user_id = g.user.get('user_id')
        user_role = g.user.get('role', '').lower()
        view_as_role = request.args.get('view_as_role', '').lower()

        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import or_
        import logging
        log = logging.getLogger(__name__)

        # Valid roles for view_as_role parameter
        VALID_VIEW_AS_ROLES = frozenset(['se', 'siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor'])
        SUPER_ADMIN_ROLES = frozenset(['admin', 'superadmin', 'super_admin'])

        # Validate view_as_role if provided
        if view_as_role and view_as_role not in VALID_VIEW_AS_ROLES:
            log.warning(f"Invalid view_as_role '{view_as_role}' provided by user {current_user_id}")
            return jsonify({'error': f'Invalid view_as_role: {view_as_role}'}), 400

        # Check if admin is viewing as SE
        is_admin_viewing_as_role = user_role in SUPER_ADMIN_ROLES and view_as_role

        # Collect all project IDs from multiple sources
        project_ids = set()

        # Admin viewing as role gets ALL projects
        if is_admin_viewing_as_role or user_role in SUPER_ADMIN_ROLES:
            log.info(f"Admin {current_user_id} viewing as {view_as_role or 'admin'} - getting ALL projects for returnable materials")
            all_projects = Project.query.filter(Project.is_deleted == False).all()
            project_ids = set(p.project_id for p in all_projects)
        else:
            # Source 1: Direct assignment via Project.site_supervisor_id
            direct_projects = Project.query.filter(
                Project.site_supervisor_id == current_user_id,
                Project.is_deleted == False
            ).all()
            for p in direct_projects:
                project_ids.add(p.project_id)

            # Source 2 & 3: Assignment via pm_assign_ss table
            pm_assignments = PMAssignSS.query.filter(
                PMAssignSS.is_deleted == False,
                or_(
                    PMAssignSS.assigned_to_se_id == current_user_id,
                    PMAssignSS.ss_ids.any(current_user_id)
                )
            ).all()

            for assignment in pm_assignments:
                if assignment.project_id:
                    project_ids.add(assignment.project_id)

        if not project_ids:
            return jsonify({
                'projects': [],
                'message': 'No assigned projects found'
            }), 200

        # Get project details for all assigned projects
        assigned_projects = Project.query.filter(
            Project.project_id.in_(list(project_ids)),
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
    """Get all material returns submitted by or for Site Engineer's assigned projects.

    Checks three sources for SE assignment:
    1. Project.site_supervisor_id (direct assignment)
    2. PMAssignSS.ss_ids (array of SE IDs)
    3. PMAssignSS.assigned_to_se_id (single SE assignment)

    Admin viewing as SE gets ALL material returns (no user-specific filtering)
    """
    try:
        current_user_id = g.user.get('user_id')
        user_role = g.user.get('role', '').lower()
        view_as_role = request.args.get('view_as_role', '').lower()

        from models.project import Project
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import or_
        import logging
        log = logging.getLogger(__name__)

        # Valid roles for view_as_role parameter
        VALID_VIEW_AS_ROLES = frozenset(['se', 'siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor'])
        SUPER_ADMIN_ROLES = frozenset(['admin', 'superadmin', 'super_admin'])

        # Validate view_as_role if provided
        if view_as_role and view_as_role not in VALID_VIEW_AS_ROLES:
            log.warning(f"Invalid view_as_role '{view_as_role}' provided by user {current_user_id}")
            return jsonify({'error': f'Invalid view_as_role: {view_as_role}'}), 400

        # Check if admin is viewing as SE
        is_admin_viewing_as_role = user_role in SUPER_ADMIN_ROLES and view_as_role

        # Collect all project IDs from multiple sources
        project_ids = set()

        # Admin viewing as role gets ALL projects
        if is_admin_viewing_as_role or user_role in SUPER_ADMIN_ROLES:
            log.info(f"Admin {current_user_id} viewing as {view_as_role or 'admin'} - getting ALL projects for material returns")
            all_projects = Project.query.filter(Project.is_deleted == False).all()
            project_ids = set(p.project_id for p in all_projects)
        else:
            # Source 1: Direct assignment via Project.site_supervisor_id
            direct_projects = Project.query.filter(
                Project.site_supervisor_id == current_user_id,
                Project.is_deleted == False
            ).all()
            for p in direct_projects:
                project_ids.add(p.project_id)

            # Source 2 & 3: Assignment via pm_assign_ss table
            pm_assignments = PMAssignSS.query.filter(
                PMAssignSS.is_deleted == False,
                or_(
                    PMAssignSS.assigned_to_se_id == current_user_id,
                    PMAssignSS.ss_ids.any(current_user_id)
                )
            ).all()

            for assignment in pm_assignments:
                if assignment.project_id:
                    project_ids.add(assignment.project_id)

        project_ids = list(project_ids)

        if not project_ids:
            return jsonify({
                'returns': [],
                'message': 'No assigned projects found'
            }), 200

        # Get project details for all assigned projects
        assigned_projects = Project.query.filter(
            Project.project_id.in_(project_ids),
            Project.is_deleted == False
        ).all()

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



# ==================== RETURN DELIVERY NOTE (RDN) WORKFLOW ====================

def generate_return_note_number():
    """Auto-generate sequential return delivery note number (RDN-2025-001, RDN-2025-002, ...)"""
    try:
        current_year = datetime.now().year

        # Get the last RDN for current year
        last_rdn = ReturnDeliveryNote.query.filter(
            ReturnDeliveryNote.return_note_number.like(f'RDN-{current_year}-%')
        ).order_by(ReturnDeliveryNote.return_note_id.desc()).first()

        if last_rdn and last_rdn.return_note_number:
            # Extract number from last code (e.g., "RDN-2025-005" -> 5)
            parts = last_rdn.return_note_number.split('-')
            if len(parts) == 3:
                last_number = int(parts[2])
                new_number = last_number + 1
            else:
                new_number = 1
        else:
            # First RDN for this year
            new_number = 1

        # Format as RDN-2025-001, RDN-2025-002, etc. (zero-padded to 3 digits)
        return f"RDN-{current_year}-{new_number:03d}"

    except Exception as e:
        # Fallback to timestamp-based code if something goes wrong
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        return f"RDN-{timestamp}"


def create_return_delivery_note():
    """STEP 1: Create a new return delivery note (RDN) - SE creates DRAFT"""
    try:
        # Handle both JSON and multipart/form-data
        delivery_note_file = None

        # Check if this is a multipart request (has files)
        if request.files and len(request.files) > 0:
            # Get form data
            data = request.form.to_dict()
            # Handle materials_data (JSON string)
            if 'materials_data' in data:
                import json
                data['materials_data'] = json.loads(data['materials_data'])
            # Convert numeric fields
            if 'project_id' in data:
                data['project_id'] = int(data['project_id'])
            if 'transport_fee' in data:
                data['transport_fee'] = float(data['transport_fee']) if data['transport_fee'] else 0
            # Get file
            delivery_note_file = request.files.get('delivery_note')
        else:
            # Try to get JSON data
            data = request.get_json(silent=True) or {}
            if not data:
                return jsonify({'error': 'No data provided'}), 400

        current_user_email = g.user.get('email', 'system')
        current_user_id = g.user.get('user_id')

        # Get user's full name for prepared_by field
        prepared_by_name = current_user_email
        if current_user_id:
            user = User.query.get(current_user_id)
            if user and user.full_name:
                prepared_by_name = user.full_name

        # Validate required fields
        required_fields = ['project_id', 'return_date', 'driver_name']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        # Validate project exists
        project = Project.query.get(data['project_id'])
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        # Generate RDN number
        return_note_number = generate_return_note_number()

        # Parse return date
        return_date = datetime.fromisoformat(data['return_date'].replace('Z', '+00:00')) if isinstance(data['return_date'], str) else data['return_date']

        # Upload delivery note file if provided
        delivery_note_url = None
        if delivery_note_file:
            try:
                import os
                from supabase import create_client

                # Get Supabase credentials
                is_dev = os.environ.get('FLASK_ENV') == 'development'
                if is_dev:
                    supabase_url = os.environ.get('DEV_SUPABASE_URL')
                    supabase_key = os.environ.get('DEV_SUPABASE_ANON_KEY')
                else:
                    supabase_url = os.environ.get('SUPABASE_URL')
                    supabase_key = os.environ.get('SUPABASE_ANON_KEY')

                if not supabase_url or not supabase_key:
                    raise Exception("Supabase configuration not found")

                supabase = create_client(supabase_url, supabase_key)

                # Generate unique filename
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                original_filename = delivery_note_file.filename
                unique_filename = f"return-delivery-notes/{timestamp}_{original_filename}"

                # Upload to Supabase Storage
                file_data = delivery_note_file.read()
                bucket = supabase.storage.from_('inventory-files')

                response = bucket.upload(
                    unique_filename,
                    file_data,
                    {"content-type": delivery_note_file.content_type, "upsert": "false"}
                )

                # Get public URL
                delivery_note_url = bucket.get_public_url(unique_filename)

            except Exception as upload_error:
                return jsonify({'error': f'File upload failed: {str(upload_error)}'}), 500

        # Create RDN
        new_rdn = ReturnDeliveryNote(
            return_note_number=return_note_number,
            project_id=data['project_id'],
            return_date=return_date,
            returned_by=prepared_by_name,
            return_to=data.get('return_to', get_store_name()),
            original_delivery_note_id=data.get('original_delivery_note_id'),
            vehicle_number=data.get('vehicle_number'),
            driver_name=data['driver_name'],
            driver_contact=data.get('driver_contact'),
            prepared_by=prepared_by_name,
            checked_by=data.get('checked_by'),
            status='DRAFT',
            notes=data.get('notes'),
            transport_fee=data.get('transport_fee', 0),
            delivery_note_url=delivery_note_url,
            created_by=current_user_email
        )

        db.session.add(new_rdn)
        db.session.commit()

        return jsonify({
            'message': 'Return delivery note created successfully',
            'return_delivery_note': new_rdn.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def get_all_return_delivery_notes():
    """Get all return delivery notes with optional filters"""
    try:
        project_id = request.args.get('project_id')
        status = request.args.get('status')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        query = ReturnDeliveryNote.query

        if project_id:
            query = query.filter_by(project_id=int(project_id))
        if status:
            query = query.filter_by(status=status.upper())
        if start_date:
            query = query.filter(ReturnDeliveryNote.return_date >= start_date)
        if end_date:
            query = query.filter(ReturnDeliveryNote.return_date <= end_date)

        # PERFORMANCE: Limit to 200 records max
        rdns = query.order_by(ReturnDeliveryNote.created_at.desc()).limit(200).all()

        result = []
        for rdn in rdns:
            rdn_data = rdn.to_dict()
            project = Project.query.get(rdn.project_id)
            if project:
                rdn_data['project_details'] = {
                    'project_id': project.project_id,
                    'project_name': project.project_name,
                    'project_code': project.project_code,
                    'location': project.location,
                    'area': project.area
                }
            result.append(rdn_data)

        return jsonify({
            'return_delivery_notes': result,
            'total': len(result)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_return_delivery_note_by_id(return_note_id):
    """Get specific return delivery note by ID with full details"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        rdn_data = rdn.to_dict()

        # Add project details
        project = Project.query.get(rdn.project_id)
        if project:
            rdn_data['project_details'] = {
                'project_id': project.project_id,
                'project_name': project.project_name,
                'project_code': project.project_code,
                'location': project.location,
                'area': project.area
            }

        return jsonify({'return_delivery_note': rdn_data}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def update_return_delivery_note(return_note_id):
    """Update return delivery note details (only in DRAFT status)"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        if rdn.status != 'DRAFT':
            return jsonify({'error': f'Cannot update RDN with status {rdn.status}. Only DRAFT can be edited.'}), 400

        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Update allowed fields
        if 'return_date' in data:
            rdn.return_date = datetime.fromisoformat(data['return_date'].replace('Z', '+00:00')) if isinstance(data['return_date'], str) else data['return_date']
        if 'vehicle_number' in data:
            rdn.vehicle_number = data['vehicle_number']
        if 'driver_name' in data:
            rdn.driver_name = data['driver_name']
        if 'driver_contact' in data:
            rdn.driver_contact = data['driver_contact']
        if 'notes' in data:
            rdn.notes = data['notes']

        rdn.last_modified_by = current_user
        rdn.last_modified_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            'message': 'Return delivery note updated successfully',
            'return_delivery_note': rdn.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def delete_return_delivery_note(return_note_id):
    """Delete return delivery note (only in DRAFT status)"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        if rdn.status != 'DRAFT':
            return jsonify({'error': f'Cannot delete RDN with status {rdn.status}. Only DRAFT can be deleted.'}), 400

        db.session.delete(rdn)
        db.session.commit()

        return jsonify({'message': 'Return delivery note deleted successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def add_item_to_return_delivery_note(return_note_id):
    """STEP 2: Add an item to return delivery note (only in DRAFT status)"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        if rdn.status != 'DRAFT':
            return jsonify({'error': f'Cannot add items to RDN with status {rdn.status}. Only DRAFT can be modified.'}), 400

        data = request.get_json()

        # Validate required fields
        required_fields = ['inventory_material_id', 'quantity', 'condition']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'{field} is required'}), 400

        # Validate condition
        if data['condition'] not in MATERIAL_CONDITIONS:
            return jsonify({'error': f'Invalid condition. Must be one of: {", ".join(MATERIAL_CONDITIONS)}'}), 400

        # Validate material exists
        material = InventoryMaterial.query.get(data['inventory_material_id'])
        if not material:
            return jsonify({'error': 'Material not found'}), 404

        # If original_delivery_note_item_id provided, validate returnable quantity
        if data.get('original_delivery_note_item_id'):
            dn_item = DeliveryNoteItem.query.get(data['original_delivery_note_item_id'])
            if not dn_item:
                return jsonify({'error': 'Original delivery note item not found'}), 404

            # Check already returned quantity
            existing_returns = db.session.query(db.func.sum(ReturnDeliveryNoteItem.quantity)).filter(
                ReturnDeliveryNoteItem.original_delivery_note_item_id == data['original_delivery_note_item_id']
            ).scalar() or 0

            returnable_quantity = dn_item.quantity - existing_returns

            if data['quantity'] > returnable_quantity:
                return jsonify({
                    'error': f'Return quantity ({data["quantity"]}) exceeds returnable quantity ({returnable_quantity})'
                }), 400

        # Create RDN item
        new_item = ReturnDeliveryNoteItem(
            return_note_id=return_note_id,
            inventory_material_id=data['inventory_material_id'],
            original_delivery_note_item_id=data.get('original_delivery_note_item_id'),
            quantity=data['quantity'],
            condition=data['condition'],
            return_reason=data.get('return_reason')
        )

        db.session.add(new_item)
        db.session.commit()

        return jsonify({
            'message': 'Item added to return delivery note successfully',
            'item': new_item.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def update_return_delivery_note_item(return_note_id, item_id):
    """Update an item in return delivery note (only in DRAFT status)"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        if rdn.status != 'DRAFT':
            return jsonify({'error': f'Cannot update items in RDN with status {rdn.status}'}), 400

        item = ReturnDeliveryNoteItem.query.get(item_id)

        if not item or item.return_note_id != return_note_id:
            return jsonify({'error': 'Item not found in this return delivery note'}), 404

        data = request.get_json()

        # Update allowed fields
        if 'quantity' in data:
            item.quantity = data['quantity']
        if 'condition' in data:
            if data['condition'] not in MATERIAL_CONDITIONS:
                return jsonify({'error': f'Invalid condition. Must be one of: {", ".join(MATERIAL_CONDITIONS)}'}), 400
            item.condition = data['condition']
        if 'return_reason' in data:
            item.return_reason = data['return_reason']
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


def remove_return_delivery_note_item(return_note_id, item_id):
    """Remove an item from return delivery note (only in DRAFT status)"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        if rdn.status != 'DRAFT':
            return jsonify({'error': f'Cannot remove items from RDN with status {rdn.status}'}), 400

        item = ReturnDeliveryNoteItem.query.get(item_id)

        if not item or item.return_note_id != return_note_id:
            return jsonify({'error': 'Item not found in this return delivery note'}), 404

        db.session.delete(item)
        db.session.commit()

        return jsonify({'message': 'Item removed successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def issue_return_delivery_note(return_note_id):
    """STEP 3: Issue RDN - SE finalizes, validates, locks for editing"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        if rdn.status != 'DRAFT':
            return jsonify({'error': f'Cannot issue RDN with status {rdn.status}. Only DRAFT can be issued.'}), 400

        # Validate RDN has items
        if not rdn.items or len(rdn.items) == 0:
            return jsonify({'error': 'Cannot issue RDN with no items'}), 400

        current_user = g.user.get('email', 'system')

        # Validate all items
        for item in rdn.items:
            material = InventoryMaterial.query.get(item.inventory_material_id)
            if not material:
                return jsonify({'error': f'Material with ID {item.inventory_material_id} not found'}), 404

            # Validate returnable quantity if linked to original delivery
            if item.original_delivery_note_item_id:
                dn_item = DeliveryNoteItem.query.get(item.original_delivery_note_item_id)
                if dn_item:
                    # Check total returned quantity including this RDN
                    existing_returns = db.session.query(db.func.sum(ReturnDeliveryNoteItem.quantity)).filter(
                        ReturnDeliveryNoteItem.original_delivery_note_item_id == item.original_delivery_note_item_id,
                        ReturnDeliveryNoteItem.return_item_id != item.return_item_id
                    ).scalar() or 0

                    returnable = dn_item.quantity - existing_returns
                    if item.quantity > returnable:
                        return jsonify({
                            'error': f'{material.material_name}: Return quantity ({item.quantity}) exceeds returnable ({returnable})'
                        }), 400

        # Issue the RDN
        rdn.status = 'ISSUED'
        rdn.issued_at = datetime.utcnow()
        rdn.issued_by = current_user
        rdn.last_modified_by = current_user

        db.session.commit()

        # Send notification to PM
        try:
            project = Project.query.get(rdn.project_id)
            # TODO: Implement notification - RDN ready for pickup
            print(f"Notification: RDN {rdn.return_note_number} ready for pickup from {project.project_name}")
        except Exception as notif_err:
            print(f"Error sending RDN issue notification: {notif_err}")

        return jsonify({
            'message': 'Return delivery note issued successfully. Ready for dispatch.',
            'return_delivery_note': rdn.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def dispatch_return_delivery_note(return_note_id):
    """STEP 4: Dispatch RDN - Materials picked up, in transit to store"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        if rdn.status != 'ISSUED':
            return jsonify({'error': f'Cannot dispatch RDN with status {rdn.status}. Must be ISSUED first.'}), 400

        data = request.get_json() or {}
        current_user = g.user.get('email', 'system')

        # Update transport details if provided
        if data.get('vehicle_number'):
            rdn.vehicle_number = data['vehicle_number']
        if data.get('driver_name'):
            rdn.driver_name = data['driver_name']
        if data.get('driver_contact'):
            rdn.driver_contact = data['driver_contact']

        # Dispatch the RDN
        rdn.status = 'IN_TRANSIT'
        rdn.dispatched_at = datetime.utcnow()
        rdn.dispatched_by = current_user
        rdn.last_modified_by = current_user

        db.session.commit()

        # Send notification to PM
        try:
            project = Project.query.get(rdn.project_id)
            print(f"Notification: RDN {rdn.return_note_number} dispatched from {project.project_name}, materials in transit")
        except Exception as notif_err:
            print(f"Error sending RDN dispatch notification: {notif_err}")

        return jsonify({
            'message': 'Return delivery note dispatched successfully. Materials in transit.',
            'return_delivery_note': rdn.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def confirm_return_delivery_receipt(return_note_id):
    """STEP 5: PM confirms receipt of returned materials at store"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        if rdn.status not in ['ISSUED', 'IN_TRANSIT']:
            return jsonify({'error': f'Cannot confirm receipt for RDN with status {rdn.status}.'}), 400

        data = request.get_json() or {}
        current_user = g.user.get('email', 'system')

        # Check for partial receipt
        is_partial = False
        if data.get('items_received'):
            for item_data in data['items_received']:
                item = ReturnDeliveryNoteItem.query.get(item_data['return_item_id'])
                if item and item.return_note_id == return_note_id:
                    quantity_accepted = float(item_data.get('quantity_accepted', item.quantity))
                    item.quantity_accepted = quantity_accepted
                    item.acceptance_status = item_data.get('acceptance_status', 'ACCEPTED')

                    if quantity_accepted < item.quantity:
                        is_partial = True
        else:
            # Accept all items fully
            for item in rdn.items:
                item.quantity_accepted = item.quantity
                item.acceptance_status = 'ACCEPTED'

        # Update RDN status
        rdn.status = 'PARTIAL' if is_partial else 'RECEIVED'
        rdn.accepted_by = current_user
        rdn.accepted_at = datetime.utcnow()
        rdn.acceptance_notes = data.get('acceptance_notes')
        rdn.last_modified_by = current_user

        db.session.commit()

        # Send notification to SE
        try:
            project = Project.query.get(rdn.project_id)
            # TODO: Implement notification - RDN received at store
            print(f"Notification: RDN {rdn.return_note_number} received at store from {project.project_name}")
        except Exception as notif_err:
            print(f"Error sending RDN receipt notification: {notif_err}")

        return jsonify({
            'message': 'Return delivery confirmed successfully. Ready for processing.',
            'return_delivery_note': rdn.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def process_return_delivery_item(return_note_id, item_id):
    """STEP 6: PM processes individual RDN item - creates MaterialReturn and updates stock"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        if rdn.status not in ['RECEIVED', 'PARTIAL']:
            return jsonify({'error': f'Cannot process items for RDN with status {rdn.status}. Must be RECEIVED first.'}), 400

        item = ReturnDeliveryNoteItem.query.get(item_id)

        if not item or item.return_note_id != return_note_id:
            return jsonify({'error': 'Item not found in this return delivery note'}), 404

        # Check if already processed (has material_return_id)
        if item.material_return_id:
            return jsonify({'error': 'This item has already been processed'}), 400

        data = request.get_json()
        current_user = g.user.get('email', 'system')

        # Get material
        material = InventoryMaterial.query.get(item.inventory_material_id)
        if not material:
            return jsonify({'error': 'Material not found'}), 404

        # Create MaterialReturn record
        # Use notes from the Return Delivery Note (parent RDN)
        material_return = MaterialReturn(
            delivery_note_item_id=item.original_delivery_note_item_id,
            return_delivery_note_id=rdn.return_note_id,
            inventory_material_id=item.inventory_material_id,
            project_id=rdn.project_id,
            quantity=item.quantity_accepted or item.quantity,
            condition=item.condition,
            add_to_stock=False,  # Will be set when approved
            return_reason=item.return_reason,
            reference_number=rdn.return_note_number,
            notes=rdn.notes,
            disposal_status='pending_approval',  # PM needs to approve/process
            created_by=rdn.created_by
        )

        db.session.add(material_return)
        db.session.flush()

        # Link RDN item to material return
        item.material_return_id = material_return.return_id

        # If PM action specified in request, process immediately
        # Supports both old actions (approve, backup, reject) and new actions (add_to_stock, repair, disposal)
        pm_action = data.get('action')

        if pm_action in ['approve', 'add_to_stock'] and item.condition == 'Good':
            # Add to stock immediately
            total_amount = material_return.quantity * material.unit_price

            # Create RETURN transaction
            new_transaction = InventoryTransaction(
                inventory_material_id=item.inventory_material_id,
                transaction_type='RETURN',
                quantity=material_return.quantity,
                unit_price=material.unit_price,
                total_amount=total_amount,
                reference_number=rdn.return_note_number,
                project_id=rdn.project_id,
                notes=f'Return from RDN {rdn.return_note_number} - {item.return_reason or "Material returned"}',
                created_by=current_user
            )
            db.session.add(new_transaction)
            db.session.flush()

            # Update stock
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

            # Update RDN item
            item.inventory_transaction_id = new_transaction.inventory_transaction_id

        elif pm_action in ['backup', 'repair'] and item.condition in ['Damaged', 'Defective']:
            # Send for repair - Add to backup stock for repair
            usable_quantity = data.get('usable_quantity', material_return.quantity)

            total_amount = usable_quantity * material.unit_price

            # Create RETURN transaction
            new_transaction = InventoryTransaction(
                inventory_material_id=item.inventory_material_id,
                transaction_type='RETURN',
                quantity=usable_quantity,
                unit_price=material.unit_price,
                total_amount=total_amount,
                reference_number=rdn.return_note_number,
                project_id=rdn.project_id,
                notes=f'Return to backup stock for repair from RDN {rdn.return_note_number} - {item.condition} condition',
                created_by=current_user
            )
            db.session.add(new_transaction)
            db.session.flush()

            # Update backup stock
            material.backup_stock = (material.backup_stock or 0) + usable_quantity
            material.last_modified_at = datetime.utcnow()
            material.last_modified_by = current_user

            # Update return record - mark as sent for repair (NOT add_to_stock yet, waiting for repair)
            # IMPORTANT: Update quantity to match what was actually sent for repair
            material_return.quantity = usable_quantity  # Track actual quantity sent for repair
            material_return.add_to_stock = False  # Will be set to True when repair is complete
            material_return.disposal_status = DISPOSAL_SENT_FOR_REPAIR  # In backup stock, awaiting repair
            material_return.disposal_reviewed_by = current_user
            material_return.disposal_reviewed_at = datetime.utcnow()
            material_return.disposal_notes = data.get('notes', f'Sent for repair - Added {usable_quantity} to backup stock')
            material_return.inventory_transaction_id = new_transaction.inventory_transaction_id

            item.inventory_transaction_id = new_transaction.inventory_transaction_id

        elif pm_action == 'disposal' and item.condition in ['Damaged', 'Defective']:
            # Mark for disposal - Send to TD for approval
            estimated_value = material_return.quantity * material.unit_price

            # Update return record with disposal pending TD review
            material_return.add_to_stock = False
            material_return.disposal_status = DISPOSAL_PENDING_REVIEW  # Requires TD approval
            material_return.disposal_value = estimated_value
            material_return.disposal_notes = data.get('notes', f'Material beyond repair - Disposal requested from RDN {rdn.return_note_number}')

            # Notify TD for approval
            try:
                tds = User.query.filter_by(user_role='Technical Director').all()
                project = Project.query.get(rdn.project_id)
                project_name = project.project_name if project else 'Unknown Project'

                for td in tds:
                    ComprehensiveNotificationService.send_email_notification(
                        recipient=td.email,
                        subject=f'Material Disposal Request - {material.material_name}',
                        message=f'''
                        <p>A material disposal request has been submitted from a return delivery note and requires your review.</p>

                        <h3>Return Details:</h3>
                        <ul>
                            <li>RDN: {rdn.return_note_number}</li>
                            <li>Project: {project_name}</li>
                        </ul>

                        <h3>Material Details:</h3>
                        <ul>
                            <li>Material: {material.material_name} ({material.material_code})</li>
                            <li>Brand: {material.brand or 'N/A'}</li>
                            <li>Quantity: {material_return.quantity} {material.unit}</li>
                            <li>Condition: {item.condition}</li>
                            <li>Estimated Value: AED {estimated_value:.2f}</li>
                        </ul>

                        <h3>Return Reason:</h3>
                        <p>{item.return_reason or 'Not specified'}</p>

                        <h3>Disposal Notes:</h3>
                        <p>{data.get('notes', 'Material beyond repair')}</p>

                        <p>Please review and approve/reject this disposal request in the system.</p>

                        <p>Requested by: {current_user}</p>
                        ''',
                        notification_type='disposal_request',
                        action_url=f'/inventory/disposal-requests'
                    )

                print(f"Disposal request notification sent to {len(tds)} TD(s) for material {material.material_name}")

            except Exception as notif_error:
                print(f"Error sending disposal request notification: {notif_error}")
                # Don't fail the request if notification fails

        elif pm_action == 'reject':
            material_return.disposal_status = 'rejected'
            material_return.disposal_reviewed_by = current_user
            material_return.disposal_reviewed_at = datetime.utcnow()
            material_return.disposal_notes = data.get('notes', 'Return rejected by PM')

        db.session.commit()

        # Check if all items processed - update RDN to APPROVED
        all_processed = all(item.material_return_id is not None for item in rdn.items)
        if all_processed:
            rdn.status = 'APPROVED'
            rdn.last_modified_by = current_user
            db.session.commit()

        return jsonify({
            'message': 'Return item processed successfully',
            'material_return': material_return.to_dict(),
            'new_stock_level': material.current_stock if pm_action == 'approve' else None,
            'rdn_status': rdn.status
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def process_all_return_delivery_items(return_note_id):
    """STEP 6 (Batch): PM processes all RDN items in a single request"""
    try:
        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        if rdn.status not in ['RECEIVED', 'PARTIAL']:
            return jsonify({'error': f'Cannot process items for RDN with status {rdn.status}. Must be RECEIVED first.'}), 400

        data = request.get_json()
        items_data = data.get('items', [])
        current_user = g.user.get('email', 'system')

        if not items_data:
            return jsonify({'error': 'No items provided'}), 400

        if len(items_data) > MAX_BATCH_SIZE:
            return jsonify({'error': f'Cannot process more than {MAX_BATCH_SIZE} items at once'}), 400

        processed_items = []
        errors = []

        for item_action in items_data:
            item_id = item_action.get('item_id')
            pm_action = item_action.get('action')

            try:
                item = ReturnDeliveryNoteItem.query.get(item_id)

                if not item or item.return_note_id != return_note_id:
                    errors.append(f"Item {item_id}: not found in this RDN")
                    continue

                if item.material_return_id:
                    errors.append(f"Item {item_id}: already processed")
                    continue

                material = InventoryMaterial.query.get(item.inventory_material_id)
                if not material:
                    errors.append(f"Item {item_id}: material not found")
                    continue

                # Create MaterialReturn record
                material_return = MaterialReturn(
                    delivery_note_item_id=item.original_delivery_note_item_id,
                    return_delivery_note_id=rdn.return_note_id,
                    inventory_material_id=item.inventory_material_id,
                    project_id=rdn.project_id,
                    quantity=item.quantity_accepted or item.quantity,
                    condition=item.condition,
                    add_to_stock=False,
                    return_reason=item.return_reason,
                    reference_number=rdn.return_note_number,
                    notes=item_action.get('notes', ''),
                    disposal_status='pending_approval',
                    created_by=rdn.created_by
                )

                db.session.add(material_return)
                db.session.flush()

                item.material_return_id = material_return.return_id

                # Support both old actions (approve, backup, reject) and new actions (add_to_stock, repair, disposal)
                if pm_action in ['approve', 'add_to_stock'] and item.condition == 'Good':
                    total_amount = material_return.quantity * material.unit_price

                    new_transaction = InventoryTransaction(
                        inventory_material_id=item.inventory_material_id,
                        transaction_type='RETURN',
                        quantity=material_return.quantity,
                        unit_price=material.unit_price,
                        total_amount=total_amount,
                        reference_number=rdn.return_note_number,
                        project_id=rdn.project_id,
                        notes=f'Return from RDN {rdn.return_note_number} - {item.return_reason or "Material returned"}',
                        created_by=current_user
                    )
                    db.session.add(new_transaction)
                    db.session.flush()

                    material.current_stock += material_return.quantity
                    material.last_modified_at = datetime.utcnow()
                    material.last_modified_by = current_user

                    material_return.add_to_stock = True
                    material_return.disposal_status = 'approved'
                    material_return.disposal_reviewed_by = current_user
                    material_return.disposal_reviewed_at = datetime.utcnow()
                    material_return.disposal_notes = item_action.get('notes', 'Approved and added to stock')
                    material_return.inventory_transaction_id = new_transaction.inventory_transaction_id
                    item.inventory_transaction_id = new_transaction.inventory_transaction_id

                elif pm_action in ['backup', 'repair'] and item.condition in ['Damaged', 'Defective']:
                    # Send for repair - Add to backup stock
                    usable_quantity = item_action.get('usable_quantity', material_return.quantity)
                    total_amount = usable_quantity * material.unit_price

                    new_transaction = InventoryTransaction(
                        inventory_material_id=item.inventory_material_id,
                        transaction_type='RETURN',
                        quantity=usable_quantity,
                        unit_price=material.unit_price,
                        total_amount=total_amount,
                        reference_number=rdn.return_note_number,
                        project_id=rdn.project_id,
                        notes=f'Return to backup stock for repair from RDN {rdn.return_note_number} - {item.condition} condition',
                        created_by=current_user
                    )
                    db.session.add(new_transaction)
                    db.session.flush()

                    material.backup_stock = (material.backup_stock or 0) + usable_quantity
                    material.last_modified_at = datetime.utcnow()
                    material.last_modified_by = current_user

                    # Mark as sent for repair (NOT add_to_stock yet, waiting for repair)
                    # IMPORTANT: Update quantity to match what was actually sent for repair
                    material_return.quantity = usable_quantity  # Track actual quantity sent for repair
                    material_return.add_to_stock = False  # Will be set to True when repair is complete
                    material_return.disposal_status = DISPOSAL_SENT_FOR_REPAIR  # In backup stock, awaiting repair
                    material_return.disposal_reviewed_by = current_user
                    material_return.disposal_reviewed_at = datetime.utcnow()
                    material_return.disposal_notes = item_action.get('notes', f'Sent for repair - Added {usable_quantity} to backup stock')
                    material_return.inventory_transaction_id = new_transaction.inventory_transaction_id
                    item.inventory_transaction_id = new_transaction.inventory_transaction_id

                elif pm_action == 'disposal' and item.condition in ['Damaged', 'Defective']:
                    # Mark for disposal - Send to TD for approval
                    estimated_value = material_return.quantity * material.unit_price

                    material_return.add_to_stock = False
                    material_return.disposal_status = DISPOSAL_PENDING_REVIEW
                    material_return.disposal_value = estimated_value
                    material_return.disposal_notes = item_action.get('notes', f'Material beyond repair - Disposal requested from RDN {rdn.return_note_number}')

                    # Notify TD for approval (collect for batch notification)
                    try:
                        tds = User.query.filter_by(user_role='Technical Director').all()
                        project = Project.query.get(rdn.project_id)
                        project_name = project.project_name if project else 'Unknown Project'

                        for td in tds:
                            ComprehensiveNotificationService.send_email_notification(
                                recipient=td.email,
                                subject=f'Material Disposal Request - {material.material_name}',
                                message=f'''
                                <p>A material disposal request has been submitted from a return delivery note and requires your review.</p>

                                <h3>Return Details:</h3>
                                <ul>
                                    <li>RDN: {rdn.return_note_number}</li>
                                    <li>Project: {project_name}</li>
                                </ul>

                                <h3>Material Details:</h3>
                                <ul>
                                    <li>Material: {material.material_name} ({material.material_code})</li>
                                    <li>Brand: {material.brand or 'N/A'}</li>
                                    <li>Quantity: {material_return.quantity} {material.unit}</li>
                                    <li>Condition: {item.condition}</li>
                                    <li>Estimated Value: AED {estimated_value:.2f}</li>
                                </ul>

                                <h3>Return Reason:</h3>
                                <p>{item.return_reason or 'Not specified'}</p>

                                <h3>Disposal Notes:</h3>
                                <p>{item_action.get('notes', 'Material beyond repair')}</p>

                                <p>Please review and approve/reject this disposal request in the system.</p>

                                <p>Requested by: {current_user}</p>
                                ''',
                                notification_type='disposal_request',
                                action_url=f'/inventory/disposal-requests'
                            )
                    except Exception as notif_error:
                        print(f"Error sending disposal notification: {notif_error}")

                elif pm_action == 'reject':
                    material_return.disposal_status = 'rejected'
                    material_return.disposal_reviewed_by = current_user
                    material_return.disposal_reviewed_at = datetime.utcnow()
                    material_return.disposal_notes = item_action.get('notes', 'Return rejected by PM')

                processed_items.append({
                    'item_id': item_id,
                    'action': pm_action,
                    'material_return_id': material_return.return_id
                })

            except Exception as item_error:
                errors.append(f"Item {item_id}: {str(item_error)}")

        if processed_items:
            # Check if all items processed - update RDN to APPROVED (before commit for atomicity)
            all_processed = all(item.material_return_id is not None for item in rdn.items)
            if all_processed:
                rdn.status = 'APPROVED'
                rdn.last_modified_by = current_user

            # Single commit for all changes (atomic transaction)
            db.session.commit()

        return jsonify({
            'message': f'{len(processed_items)} items processed successfully',
            'processed_items': processed_items,
            'errors': errors,
            'rdn_status': rdn.status
        }), 200 if processed_items else 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


def get_return_delivery_notes_for_se():
    """Get return delivery notes for Site Engineer's assigned projects

    Checks three sources for SE assignment:
    1. Project.site_supervisor_id (direct assignment)
    2. PMAssignSS.ss_ids (array of SE IDs)
    3. PMAssignSS.assigned_to_se_id (single SE assignment)
    """
    try:
        current_user_id = g.user.get('user_id')
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import or_

        # Collect all project IDs from multiple sources
        project_ids = set()

        # Source 1: Direct assignment via Project.site_supervisor_id
        direct_projects = Project.query.filter(
            Project.site_supervisor_id == current_user_id,
            Project.is_deleted == False
        ).all()
        for p in direct_projects:
            project_ids.add(p.project_id)

        # Source 2 & 3: Assignment via pm_assign_ss table
        pm_assignments = PMAssignSS.query.filter(
            PMAssignSS.is_deleted == False,
            or_(
                PMAssignSS.assigned_to_se_id == current_user_id,
                PMAssignSS.ss_ids.any(current_user_id)
            )
        ).all()

        for assignment in pm_assignments:
            if assignment.project_id:
                project_ids.add(assignment.project_id)

        project_ids = list(project_ids)

        if not project_ids:
            return jsonify({
                'return_delivery_notes': [],
                'message': 'No assigned projects found'
            }), 200

        # Get project details for all assigned projects
        assigned_projects = Project.query.filter(
            Project.project_id.in_(project_ids),
            Project.is_deleted == False
        ).all()

        # Get RDNs for these projects
        status_filter = request.args.get('status')
        query = ReturnDeliveryNote.query.filter(
            ReturnDeliveryNote.project_id.in_(project_ids)
        )

        if status_filter:
            query = query.filter_by(status=status_filter.upper())

        rdns = query.order_by(ReturnDeliveryNote.created_at.desc()).all()

        # Enrich with project details
        project_map = {p.project_id: {
            'project_name': p.project_name,
            'project_code': p.project_code
        } for p in assigned_projects}

        result = []
        for rdn in rdns:
            rdn_dict = rdn.to_dict()
            rdn_dict['project_name'] = project_map.get(rdn.project_id, {}).get('project_name', f'Project #{rdn.project_id}')
            rdn_dict['project_code'] = project_map.get(rdn.project_id, {}).get('project_code', '')
            result.append(rdn_dict)

        return jsonify({
            'return_delivery_notes': result,
            'total': len(result)
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def get_return_delivery_notes_for_pm():
    """Get all return delivery notes for Production Manager"""
    try:
        status_filter = request.args.get('status')

        query = ReturnDeliveryNote.query

        if status_filter:
            query = query.filter_by(status=status_filter.upper())
        else:
            # By default, show received/in-transit RDNs (need PM action)
            query = query.filter(ReturnDeliveryNote.status.in_(['IN_TRANSIT', 'RECEIVED', 'PARTIAL', 'APPROVED']))

        rdns = query.order_by(ReturnDeliveryNote.created_at.desc()).all()

        # Enrich with project details
        result = []
        for rdn in rdns:
            rdn_dict = rdn.to_dict()
            project = Project.query.get(rdn.project_id)
            if project:
                rdn_dict['project_name'] = project.project_name
                rdn_dict['project_code'] = project.project_code
                rdn_dict['project_location'] = project.location
            result.append(rdn_dict)

        return jsonify({
            'return_delivery_notes': result,
            'total': len(result)
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def download_dn_pdf(delivery_note_id):
    """Download Material Delivery Note as PDF"""
    import re
    from flask import send_file
    from config.constants import is_admin_role, is_project_manager_role, is_buyer_role, is_site_engineer_role, DefaultValues, ErrorMessages
    from config.logging import get_logger
    log = get_logger()

    try:
        current_user_email = g.user.get('email')
        current_user_id = g.user.get('user_id')
        user_role = g.user.get('role')

        dn = MaterialDeliveryNote.query.filter_by(delivery_note_id=delivery_note_id).first()

        if not dn:
            log.error(f"Delivery note with ID {delivery_note_id} not found")
            return jsonify({'error': f'Delivery note with ID {delivery_note_id} not found'}), 404

        # Get project details (may be None for store-destined DNs)
        project = None
        if dn.project_id:
            project = Project.query.get(dn.project_id)
            if not project:
                return jsonify({'error': 'Project not found for this delivery note'}), 404

        # Helper to check if role is Production Manager
        def is_production_manager_role(role):
            if not role:
                return False
            normalized = role.lower().strip().replace(' ', '').replace('_', '').replace('-', '')
            return normalized in ['productionmanager', 'pm']

        # Authorization check using centralized role helpers
        # Admin, PM, Production Manager, and Buyer have full access
        has_full_access = (
            is_admin_role(user_role) or
            is_project_manager_role(user_role) or
            is_production_manager_role(user_role) or
            is_buyer_role(user_role)
        )

        if not has_full_access:
            # Site Engineers/Supervisors can only access DNs for their assigned projects
            if is_site_engineer_role(user_role):
                # Store-destined DNs (project_id = None) are NOT accessible to Site Engineers
                # Only Production Manager, Buyer, PM, or Admin can access those
                if not project:
                    import logging
                    logging.warning(f"SE {current_user_id} tried to access store DN {delivery_note_id}")
                    return jsonify({'error': 'This delivery note is for store transfer and not accessible'}), 403

                # Check MULTIPLE sources for SE assignment (comprehensive check)
                is_assigned = False

                # Check 1: Primary supervisor (direct assignment via project.site_supervisor_id)
                if project.site_supervisor_id == current_user_id:
                    is_assigned = True
                    import logging
                    logging.info(f"SE {current_user_id} authorized via site_supervisor_id for DN {delivery_note_id}")

                # Check 2: site_supervisors relationship (many-to-many)
                if not is_assigned and hasattr(project, 'site_supervisors') and project.site_supervisors:
                    assigned_se_ids = [se.user_id for se in project.site_supervisors]
                    if current_user_id in assigned_se_ids:
                        is_assigned = True
                        import logging
                        logging.info(f"SE {current_user_id} authorized via site_supervisors relationship for DN {delivery_note_id}")

                # Check 3: PMAssignSS table (Project Manager assigns Site Engineer to BOQ)
                # Check both assigned_to_se_id AND ss_ids array
                if not is_assigned:
                    from models.pm_assign_ss import PMAssignSS
                    from models.boq import BOQ
                    from sqlalchemy import or_

                    pm_assignment = (
                        db.session.query(PMAssignSS)
                        .join(BOQ, PMAssignSS.boq_id == BOQ.boq_id)
                        .filter(
                            BOQ.project_id == project.project_id,
                            PMAssignSS.is_deleted == False,
                            or_(
                                PMAssignSS.assigned_to_se_id == current_user_id,
                                PMAssignSS.ss_ids.any(current_user_id)  # Check ss_ids array
                            )
                        )
                        .first()
                    )
                    if pm_assignment:
                        is_assigned = True
                        import logging
                        logging.info(f"SE {current_user_id} authorized via PMAssignSS (assigned_to_se_id or ss_ids) for DN {delivery_note_id}")

                if not is_assigned:
                    import logging
                    logging.warning(f"SE {current_user_id} NOT authorized for DN {delivery_note_id}, Project {project.project_id}")
                    return jsonify({
                        'error': f'You are not assigned to this project ({project.project_name}). Please contact your Project Manager.'
                    }), 403
            else:
                import logging
                logging.warning(f"User {current_user_id} with role {user_role} tried to access DN {delivery_note_id}")
                return jsonify({'error': f'Role {user_role} is not authorized to access delivery notes'}), 403

        # Get company name from system settings using centralized default
        settings = SystemSettings.query.first()
        company_name = getattr(settings, 'company_name', None) or DefaultValues.DEFAULT_COMPANY_NAME

        # If this DN has a batch reference and transport_fee is 0, lookup the batch's original transport fee
        display_transport_fee = dn.transport_fee
        if dn.delivery_batch_ref and (dn.transport_fee is None or dn.transport_fee == 0):
            # Find the first DN in this batch that has a non-zero transport fee
            batch_dn_with_fee = MaterialDeliveryNote.query.filter(
                MaterialDeliveryNote.delivery_batch_ref == dn.delivery_batch_ref,
                MaterialDeliveryNote.transport_fee.isnot(None),
                MaterialDeliveryNote.transport_fee > 0
            ).order_by(MaterialDeliveryNote.created_at.asc()).first()

            if batch_dn_with_fee:
                display_transport_fee = batch_dn_with_fee.transport_fee

        # Prepare DN data using centralized defaults (no hardcoded values!)
        dn_data = {
            'delivery_note_number': dn.delivery_note_number,
            'status': dn.status,
            'delivery_date': dn.delivery_date,
            'attention_to': dn.attention_to,
            'delivery_from': dn.delivery_from or DefaultValues.DEFAULT_STORE_NAME,
            'vehicle_number': dn.vehicle_number,
            'driver_name': dn.driver_name,
            'driver_contact': dn.driver_contact,
            'transport_fee': display_transport_fee,
            'notes': dn.notes,
            'prepared_by': dn.prepared_by,
            'created_by': dn.created_by,
            'requested_by': dn.requested_by,
            'request_date': dn.request_date
        }

        # Prepare project data (None for store-destined DNs)
        project_data = None
        if project:
            project_data = {
                'project_id': project.project_id,
                'project_name': project.project_name,
                'project_code': project.project_code,
                'location': project.location
            }

        # Prepare items data - PERFORMANCE: Batch load materials to avoid N+1 query
        material_ids = [item.inventory_material_id for item in dn.items]
        materials = {
            m.inventory_material_id: m
            for m in InventoryMaterial.query.filter(
                InventoryMaterial.inventory_material_id.in_(material_ids)
            ).all()
        } if material_ids else {}

        items_data = []
        for item in dn.items:
            material = materials.get(item.inventory_material_id)
            items_data.append({
                'material_name': material.material_name if material else 'Unknown Material',
                'brand': material.brand if material else None,
                'quantity': item.quantity,
                'unit': material.unit if material else '',
                'notes': item.notes
            })

        # Generate PDF
        from utils.dn_pdf_generator import DNPDFGenerator
        pdf_generator = DNPDFGenerator()
        pdf_buffer = pdf_generator.generate_pdf(dn_data, project_data, items_data, company_name)

        # Verify PDF was generated successfully
        # Check buffer size, not position (tell() returns 0 after seek(0) which is correct)
        if not pdf_buffer:
            return jsonify({'error': 'PDF generation failed: no buffer returned'}), 500

        # Check actual content size
        pdf_buffer.seek(0, 2)  # Seek to end
        size = pdf_buffer.tell()
        pdf_buffer.seek(0)  # Seek back to start

        if size == 0:
            return jsonify({'error': 'PDF generation failed: empty buffer'}), 500

        # Clean filename for safe download
        safe_filename = re.sub(r'[^a-zA-Z0-9-]', '-', dn.delivery_note_number)
        filename = f"{safe_filename}.pdf"

        # Send PDF file
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        from config.logging import get_logger
        log = get_logger()
        log.error(f"Error downloading DN PDF: {e}")
        return jsonify({'error': str(e)}), 500


def download_rdn_pdf(return_note_id):
    """Download RDN as PDF"""
    import re
    from werkzeug.utils import secure_filename

    try:
        current_user_email = g.user.get('email')
        current_user_id = g.user.get('user_id')
        user_role = g.user.get('role')

        rdn = ReturnDeliveryNote.query.get(return_note_id)

        if not rdn:
            return jsonify({'error': 'Return delivery note not found'}), 404

        # Get project details
        project = Project.query.get(rdn.project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        # Authorization check - verify user has access to this project's RDN
        # Normalize role name for comparison (handle both snake_case and camelCase)
        normalized_role = user_role.lower().replace('_', '')

        # Admin and PM have full access
        if normalized_role not in ['admin', 'productionmanager', 'production_manager']:
            # Site Engineers/Supervisors can only access RDNs for their assigned projects
            if normalized_role in ['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']:
                # Check if SE/SS is assigned to this project via multiple sources
                from models.pm_assign_ss import PMAssignSS
                from sqlalchemy import or_

                is_assigned = False

                # Source 1: Direct assignment via Project.site_supervisor_id
                if project.site_supervisor_id == current_user_id:
                    is_assigned = True

                # Source 2 & 3: Assignment via pm_assign_ss table
                if not is_assigned:
                    pm_assignment = PMAssignSS.query.filter(
                        PMAssignSS.project_id == project.project_id,
                        PMAssignSS.is_deleted == False,
                        or_(
                            PMAssignSS.assigned_to_se_id == current_user_id,
                            PMAssignSS.ss_ids.any(current_user_id)
                        )
                    ).first()
                    if pm_assignment:
                        is_assigned = True

                if not is_assigned:
                    return jsonify({'error': 'Unauthorized: You are not assigned to this project'}), 403
            else:
                return jsonify({'error': 'Unauthorized: Insufficient permissions'}), 403

        # Get company name from system settings
        try:
            settings = SystemSettings.query.first()
            company_name = settings.company_name if settings and settings.company_name else "MeterSquare"
        except Exception as e:
            print(f"Warning: Failed to load company name from settings: {e}")
            company_name = "MeterSquare"

        # Get the user's full name from email (created_by stores email)
        created_by_name = rdn.created_by  # Fallback to email
        if rdn.created_by:
            created_by_user = User.query.filter_by(email=rdn.created_by).first()
            if created_by_user and created_by_user.full_name:
                created_by_name = created_by_user.full_name

        # Prepare RDN data
        rdn_data = {
            'return_note_number': rdn.return_note_number,
            'status': rdn.status,
            'return_date': rdn.return_date.strftime('%d %B %Y') if rdn.return_date else 'N/A',
            'created_by': created_by_name,
            'returned_by': rdn.returned_by,
            'issued_at': rdn.issued_at.strftime('%d %B %Y %I:%M %p') if rdn.issued_at else None,
            'issued_by': rdn.issued_by,
            'dispatched_at': rdn.dispatched_at.strftime('%d %B %Y %I:%M %p') if rdn.dispatched_at else None,
            'dispatched_by': rdn.dispatched_by,
            'vehicle_number': rdn.vehicle_number,
            'driver_name': rdn.driver_name,
            'driver_contact': rdn.driver_contact,
            'transport_fee': float(rdn.transport_fee) if rdn.transport_fee else 0,
            'notes': rdn.notes,
        }

        # Prepare project data
        project_data = {
            'project_name': project.project_name,
            'project_code': project.project_code,
            'project_location': project.location,
        }

        # Prepare items data - Fix N+1 query by loading all materials at once
        material_ids = [item.inventory_material_id for item in rdn.items]
        materials = {
            m.inventory_material_id: m
            for m in InventoryMaterial.query.filter(
                InventoryMaterial.inventory_material_id.in_(material_ids)
            ).all()
        } if material_ids else {}

        items_data = []
        for item in rdn.items:
            material = materials.get(item.inventory_material_id)
            items_data.append({
                'material_name': material.material_name if material else 'Unknown',
                'material_code': material.material_code if material else 'N/A',
                'quantity': item.quantity,
                'unit': material.unit if material else '',
                'size': (material.size or '') if material else '',
                'condition': item.condition,
                'return_reason': item.return_reason or '',
            })

        # Generate PDF
        pdf_generator = RDNPDFGenerator()
        pdf_buffer = pdf_generator.generate_pdf(rdn_data, project_data, items_data, company_name)

        # Verify PDF was generated successfully
        if pdf_buffer.getbuffer().nbytes == 0:
            return jsonify({'error': 'PDF generation failed: empty buffer'}), 500

        # Sanitize filename to prevent path traversal
        safe_filename = secure_filename(rdn.return_note_number)
        safe_filename = re.sub(r'[^\w\-.]', '-', safe_filename)
        filename = f"{safe_filename}.pdf"

        # Create response with security headers
        response = send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )

        # Add security headers
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Content-Security-Policy'] = "default-src 'none'"
        response.headers['X-Frame-Options'] = 'DENY'

        return response

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def request_material_disposal(material_id):
    """
    Create disposal request for damaged/wasted material from catalog
    PM/Production Manager requests TD approval to dispose material
    """
    try:
        data = request.get_json()

        # Get current user
        current_user = g.user.get('email', 'system')

        # Validate material exists
        material = InventoryMaterial.query.get(material_id)
        if not material:
            return jsonify({'error': 'Material not found'}), 404

        # Validate quantity
        quantity = float(data.get('quantity', 0))
        if quantity <= 0 or quantity > material.current_stock:
            return jsonify({'error': f'Invalid quantity. Must be between 1 and {material.current_stock}'}), 400

        # Get disposal details
        reason = data.get('reason', 'damaged')
        notes = data.get('notes', '')
        estimated_value = float(data.get('estimated_value', quantity * material.unit_price))

        if not notes.strip():
            return jsonify({'error': 'Notes/explanation is required for disposal requests'}), 400

        # Create MaterialReturn record for disposal request
        # Using MaterialReturn model with special flags to indicate it's from catalog
        disposal_return = MaterialReturn(
            inventory_material_id=material_id,
            project_id=0,  # 0 indicates it's from catalog, not project return
            quantity=quantity,
            condition='Damaged',  # Use Damaged for all disposal reasons
            add_to_stock=False,
            return_reason=f"CATALOG_DISPOSAL: {reason}",  # Prefix to identify catalog disposals
            notes=notes,
            disposal_status=DISPOSAL_PENDING_REVIEW,  # Requires TD approval
            disposal_value=estimated_value,
            created_by=current_user
        )

        db.session.add(disposal_return)
        db.session.commit()

        # Notify TD for approval
        try:
            # Get all TDs
            tds = User.query.filter_by(user_role='Technical Director').all()

            for td in tds:
                ComprehensiveNotificationService.send_email_notification(
                    recipient=td.email,
                    subject=f'Material Disposal Request - {material.material_name}',
                    message=f'''
                    <p>A material disposal request has been submitted and requires your review.</p>

                    <h3>Material Details:</h3>
                    <ul>
                        <li>Material: {material.material_name} ({material.material_code})</li>
                        <li>Brand: {material.brand or 'N/A'}</li>
                        <li>Quantity: {quantity} {material.unit}</li>
                        <li>Estimated Value: AED {estimated_value:.2f}</li>
                        <li>Reason: {reason.replace('_', ' ').title()}</li>
                    </ul>

                    <h3>Justification:</h3>
                    <p>{notes}</p>

                    <p>Please review and approve/reject this disposal request in the system.</p>

                    <p>Requested by: {current_user}</p>
                    ''',
                    notification_type='disposal_request',
                    action_url=f'/inventory/disposal-requests'
                )

            print(f"Disposal request notification sent to {len(tds)} TD(s) for material {material.material_name}")

        except Exception as notif_error:
            print(f"Error sending disposal request notification: {notif_error}")
            # Don't fail the request if notification fails

        return jsonify({
            'message': 'Disposal request submitted for TD approval',
            'return_id': disposal_return.return_id,
            'material_name': material.material_name,
            'quantity': quantity,
            'estimated_value': estimated_value,
            'status': disposal_return.disposal_status
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating disposal request: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def check_material_availability():
    """
    Check M2 Store inventory availability for materials before completing purchase.

    Request Body:
    {
        "materials": [
            {
                "material_name": "Cement 50kg",
                "brand": "UltraTech",
                "size": "50kg",
                "quantity": 100
            },
            ...
        ]
    }

    Response:
    {
        "success": true,
        "overall_available": false,
        "materials": [
            {
                "material_name": "Cement 50kg",
                "brand": "UltraTech",
                "size": "50kg",
                "requested_quantity": 100,
                "available_quantity": 75,
                "is_available": false,
                "shortfall": 25,
                "status": "insufficient_stock"
            }
        ]
    }

    Error Response:
    {
        "success": false,
        "error": "Failed to check availability: <error message>",
        "materials": []
    }

    Status Codes:
    - 200: Success
    - 400: Invalid request (no materials, too many materials, invalid quantities)
    - 500: Server error
    """
    try:
        from config.logging import get_logger
        log = get_logger()

        data = request.get_json()
        materials_list = data.get('materials', [])

        if not materials_list:
            return jsonify({
                "success": False,
                "error": "No materials provided for availability check",
                "materials": []
            }), 400

        # Security: Limit max materials per request to prevent DoS
        MAX_MATERIALS_PER_REQUEST = 100
        if len(materials_list) > MAX_MATERIALS_PER_REQUEST:
            return jsonify({
                "success": False,
                "error": f"Too many materials. Maximum {MAX_MATERIALS_PER_REQUEST} per request.",
                "materials": []
            }), 400

        results = []
        overall_available = True

        for material_req in materials_list:
            material_name = material_req.get('material_name', '').strip()
            brand = material_req.get('brand', '').strip()
            size = material_req.get('size', '').strip()
            requested_qty = material_req.get('quantity', 0)

            if not material_name:
                continue

            # Validate quantity using existing helper
            validated_qty, error_msg = validate_quantity(requested_qty, 'quantity')
            if error_msg:  # Validation failed
                results.append({
                    "material_name": material_name,
                    "brand": brand or "N/A",
                    "size": size or "N/A",
                    "requested_quantity": requested_qty,
                    "error": error_msg,
                    "is_available": False,
                    "status": "invalid_quantity"
                })
                overall_available = False
                continue

            # Use validated quantity for further processing
            requested_qty = validated_qty

            # Sanitize input to prevent SQL injection
            sanitized_name = sanitize_search_term(material_name)

            # Search for matching material in inventory
            # Note: Using is_active=True (not is_deleted) as per InventoryMaterial model
            query = InventoryMaterial.query.filter_by(is_active=True)

            # Try exact match first
            exact_match = query.filter(
                func.lower(InventoryMaterial.material_name) == func.lower(material_name)
            )

            if brand:
                exact_match = exact_match.filter(
                    func.lower(InventoryMaterial.brand) == func.lower(brand)
                )

            if size:
                exact_match = exact_match.filter(
                    func.lower(InventoryMaterial.size) == func.lower(size)
                )

            inventory_material = exact_match.first()

            # If no exact match, try fuzzy match on name only (with sanitized input)
            if not inventory_material:
                search_pattern = f'%{sanitized_name}%'
                inventory_material = InventoryMaterial.query.filter(
                    func.lower(InventoryMaterial.material_name).like(search_pattern),
                    InventoryMaterial.is_active == True
                ).first()

            if inventory_material:
                available_qty = inventory_material.current_stock or 0
                shortfall = max(0, requested_qty - available_qty)
                is_available = available_qty >= requested_qty

                if not is_available:
                    overall_available = False

                results.append({
                    "material_name": material_name,
                    "brand": brand or "N/A",
                    "size": size or "N/A",
                    "requested_quantity": requested_qty,
                    "available_quantity": available_qty,
                    "is_available": is_available,
                    "shortfall": shortfall,
                    "status": "in_stock" if is_available else "insufficient_stock",
                    "inventory_material_id": inventory_material.inventory_material_id,
                    "material_code": inventory_material.material_code
                })
            else:
                # Material not found in inventory
                overall_available = False
                results.append({
                    "material_name": material_name,
                    "brand": brand or "N/A",
                    "size": size or "N/A",
                    "requested_quantity": requested_qty,
                    "available_quantity": 0,
                    "is_available": False,
                    "shortfall": requested_qty,
                    "status": "not_in_inventory",
                    "inventory_material_id": None,
                    "material_code": None
                })

        return jsonify({
            "success": True,
            "overall_available": overall_available,
            "total_materials": len(results),
            "available_count": sum(1 for m in results if m.get('is_available')),
            "unavailable_count": sum(1 for m in results if not m.get('is_available')),
            "materials": results
        }), 200

    except Exception as e:
        import traceback
        from config.logging import get_logger
        log = get_logger()
        log.error(f"Error checking material availability: {e}")
        log.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": f"Failed to check availability: {str(e)}",
            "materials": []
        }), 500


# ==================== BUYER TRANSFER RECEPTION (PM) ====================

def get_pending_buyer_transfers():
    """Get all pending buyer transfers to M2 Store for PM to receive"""
    try:
        from config.logging import get_logger
        log = get_logger()

        # Check PM/Admin access
        current_user = g.user
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')
        allowed_roles = ['productionmanager', 'admin']

        if not any(role in user_role for role in allowed_roles):
            return jsonify({"success": False, "error": "Access denied. Production Manager or Admin role required."}), 403

        # Get DNs from buyers to store that are pending (DRAFT or ISSUED status)
        pending_transfers = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.delivery_from.like('%Buyer%Transfer%Store%'),
            MaterialDeliveryNote.status.in_(['DRAFT', 'ISSUED', 'IN_TRANSIT'])
        ).order_by(MaterialDeliveryNote.created_at.desc()).all()

        transfers_data = []
        for dn in pending_transfers:
            # Get project info
            project = Project.query.filter_by(project_id=dn.project_id, is_deleted=False).first()

            transfers_data.append({
                "delivery_note_id": dn.delivery_note_id,
                "delivery_note_number": dn.delivery_note_number,
                "project_id": dn.project_id,
                "project_name": project.project_name if project else "M2 Store",
                "delivery_date": dn.delivery_date.isoformat() if dn.delivery_date else None,
                "vehicle_number": dn.vehicle_number,
                "driver_name": dn.driver_name,
                "driver_contact": dn.driver_contact,
                "transport_fee": dn.transport_fee,
                "notes": dn.notes,
                "status": dn.status,
                "created_by": dn.created_by,
                "created_at": dn.created_at.isoformat() if dn.created_at else None,
                "items": [{
                    "item_id": item.item_id,
                    "inventory_material_id": item.inventory_material_id,
                    "material_name": item.inventory_material.material_name if item.inventory_material else "Unknown",
                    "material_code": item.inventory_material.material_code if item.inventory_material else None,
                    "quantity": item.quantity,
                    "unit": item.inventory_material.unit if item.inventory_material else "pcs",
                    "unit_price": item.unit_price
                } for item in dn.items],
                "total_items": len(dn.items),
                "total_quantity": sum(item.quantity for item in dn.items)
            })

        return jsonify({
            "success": True,
            "transfers": transfers_data,
            "count": len(transfers_data)
        }), 200

    except Exception as e:
        import traceback
        from config.logging import get_logger
        log = get_logger()
        log.error(f"Error fetching pending buyer transfers: {e}")
        log.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


def get_buyer_transfers_history():
    """Get all received buyer transfers history for PM to view"""
    try:
        from config.logging import get_logger
        log = get_logger()
        from models.inventory import MaterialDeliveryNote

        # Get all received buyer transfers (status = DELIVERED)
        # Filter by delivery_from containing 'Buyer...Store' pattern (buyer to M2 Store)
        received_dns = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.delivery_from.like('%Buyer%Store%'),
            MaterialDeliveryNote.status == 'DELIVERED'
        ).order_by(MaterialDeliveryNote.received_at.desc()).limit(100).all()

        transfers_data = []
        for dn in received_dns:
            materials_data = []
            for item in dn.items:
                materials_data.append({
                    'material_name': item.inventory_material.material_name if item.inventory_material else 'Unknown',
                    'quantity': float(item.quantity),
                    'unit': item.inventory_material.unit if item.inventory_material else 'unit',
                    'category': item.inventory_material.category if item.inventory_material else 'General'
                })

            # Creator name is already stored in created_by field as the buyer's full name
            created_by_name = dn.created_by if dn.created_by else 'Unknown Buyer'

            transfers_data.append({
                'delivery_note_id': dn.delivery_note_id,
                'delivery_note_number': dn.delivery_note_number,
                'status': dn.status,
                'created_by': created_by_name,
                'delivery_date': dn.delivery_date.isoformat() if dn.delivery_date else None,
                'received_at': dn.received_at.isoformat() if dn.received_at else None,
                'total_items': len(dn.items),
                'materials': materials_data,
                'vehicle_number': dn.vehicle_number,
                'driver_name': dn.driver_name,
                'driver_contact': dn.driver_contact,
                'transport_fee': float(dn.transport_fee) if dn.transport_fee else 0,
                'notes': dn.notes
            })

        return jsonify({
            "success": True,
            "transfers": transfers_data
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyer transfers history: {e}")
        log.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


def receive_buyer_transfer(delivery_note_id):
    """
    PM confirms receipt of buyer transfer and adds materials to inventory

    This endpoint uses the BuyerTransferService for clean separation of concerns.
    """
    try:
        from config.logging import get_logger
        from services.buyer_transfer_service import BuyerTransferService

        log = get_logger()

        # Authorization check
        current_user = g.user
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')
        pm_name = current_user.get('full_name', 'Production Manager')
        allowed_roles = ['productionmanager', 'admin']

        if not any(role in user_role for role in allowed_roles):
            return jsonify({
                "success": False,
                "error": "Access denied. Production Manager or Admin role required."
            }), 403

        # Extract request data
        data = request.get_json() or {}
        receiver_notes = data.get('notes', '')

        # Use service to handle business logic
        service = BuyerTransferService()
        result = service.receive_transfer(
            delivery_note_id=delivery_note_id,
            receiver_name=pm_name,
            receiver_notes=receiver_notes
        )

        # Handle result
        if not result.success:
            log.warning(f"Failed to receive buyer transfer {delivery_note_id}: {result.error_message}")
            status_code = 404 if "not found" in result.error_message.lower() else 400
            return jsonify({
                "success": False,
                "error": result.error_message
            }), status_code

        # Log success
        log.info(
            f"PM {pm_name} received buyer transfer {result.delivery_note_number} "
            f"with {len(result.items_processed)} items. Batch: {result.batch_reference}"
        )

        # Return success response
        return jsonify({
            "success": True,
            "message": f"Transfer {result.delivery_note_number} received successfully",
            "delivery_note_id": result.delivery_note_id,
            "delivery_note_number": result.delivery_note_number,
            "items_processed": result.items_processed,
            "received_by": result.received_by,
            "received_at": result.received_at,
            "batch_reference": result.batch_reference
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        from config.logging import get_logger
        log = get_logger()
        log.error(f"Error receiving buyer transfer {delivery_note_id}: {e}")
        log.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": "An unexpected error occurred while receiving the transfer"
        }), 500


def get_received_buyer_transfers():
    """Get history of received buyer transfers"""
    try:
        from config.logging import get_logger
        log = get_logger()

        # Check PM/Admin access
        current_user = g.user
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')
        allowed_roles = ['productionmanager', 'admin']

        if not any(role in user_role for role in allowed_roles):
            return jsonify({"success": False, "error": "Access denied. Production Manager or Admin role required."}), 403

        # Get DNs from buyers to store that are DELIVERED
        received_transfers = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.delivery_from.like('%Buyer%Transfer%Store%'),
            MaterialDeliveryNote.status == 'DELIVERED'
        ).order_by(MaterialDeliveryNote.received_at.desc()).limit(50).all()

        transfers_data = []
        for dn in received_transfers:
            project = Project.query.filter_by(project_id=dn.project_id, is_deleted=False).first()

            transfers_data.append({
                "delivery_note_id": dn.delivery_note_id,
                "delivery_note_number": dn.delivery_note_number,
                "project_name": project.project_name if project else "M2 Store",
                "delivery_date": dn.delivery_date.isoformat() if dn.delivery_date else None,
                "received_by": dn.received_by,
                "received_at": dn.received_at.isoformat() if dn.received_at else None,
                "receiver_notes": dn.receiver_notes,
                "created_by": dn.created_by,
                "items": [{
                    "material_name": item.inventory_material.material_name if item.inventory_material else "Unknown",
                    "quantity": item.quantity,
                    "unit": item.inventory_material.unit if item.inventory_material else "pcs"
                } for item in dn.items],
                "total_items": len(dn.items)
            })

        return jsonify({
            "success": True,
            "transfers": transfers_data,
            "count": len(transfers_data)
        }), 200

    except Exception as e:
        import traceback
        from config.logging import get_logger
        log = get_logger()
        log.error(f"Error fetching received buyer transfers: {e}")
        log.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500
