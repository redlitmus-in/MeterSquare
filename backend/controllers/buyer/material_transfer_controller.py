from flask import request, jsonify, g
from sqlalchemy import or_, func
from config.db import db
from models.project import Project
from models.boq import BOQ
from models.change_request import ChangeRequest
from models.user import User
from models.inventory import *
from config.logging import get_logger
from datetime import datetime
import json

log = get_logger()

__all__ = [
    'get_crs_for_material_transfer', 'create_buyer_material_transfer',
    'get_site_engineers_for_transfer', 'get_projects_for_site_engineer',
    'get_buyer_transfer_history',
]


# ============================================================================
# BUYER MATERIAL TRANSFER - GET AVAILABLE CRs FOR TRANSFER
# Returns CRs that have been purchase completed and are ready for transfer
# ============================================================================

def get_crs_for_material_transfer():
    """
    Get Change Requests that are ready for material transfer
    Returns CRs with status 'routed_to_store' or 'purchase_completed'
    """
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role_name', '').lower()

        # Check if admin is viewing as buyer
        from utils.admin_viewing_context import get_effective_user_context
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # FORCE admin to see all buyer data if they are admin
        if user_role == 'admin':
            is_admin_viewing = True

        # Convert buyer_id to int with error handling
        try:
            buyer_id_int = int(buyer_id)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid buyer ID format"}), 400

        # Pagination parameters - PERFORMANCE FIX
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        per_page = min(per_page, 100)  # Max 100 per page to prevent DoS

        # Base query for CRs that are purchase completed and ready for transfer
        from sqlalchemy.orm import joinedload, selectinload
        base_query = ChangeRequest.query.options(
            joinedload(ChangeRequest.project),
            selectinload(ChangeRequest.boq).selectinload(BOQ.details),
            joinedload(ChangeRequest.vendor)
        )

        # Apply role-based filtering
        if is_admin_viewing:
            # Admin sees all CRs ready for transfer
            query = base_query.filter(
                ChangeRequest.status.in_(['routed_to_store', 'purchase_completed']),
                ChangeRequest.is_deleted == False
            )
        else:
            # Buyer sees their assigned CRs OR CRs they completed
            query = base_query.filter(
                ChangeRequest.status.in_(['routed_to_store', 'purchase_completed']),
                or_(
                    ChangeRequest.assigned_to_buyer_user_id == buyer_id_int,
                    ChangeRequest.purchase_completed_by_user_id == buyer_id_int
                ),
                ChangeRequest.is_deleted == False
            )

        # Order and paginate
        paginated = query.order_by(
            ChangeRequest.purchase_completion_date.desc().nulls_last(),
            ChangeRequest.updated_at.desc()
        ).paginate(page=page, per_page=per_page, error_out=False)

        change_requests = paginated.items

        available_crs = []

        for cr in change_requests:
            # Get project details
            project = cr.project
            if not project:
                continue

            # Get BOQ details
            boq = cr.boq
            if not boq:
                continue

            # Get materials data
            from controllers.buyer.helpers import process_materials_with_negotiated_prices
            boq_details = boq.details[0] if boq.details else None
            materials_list, cr_total = process_materials_with_negotiated_prices(cr, boq_details)

            available_crs.append({
                "cr_id": cr.cr_id,
                "formatted_cr_id": cr.get_formatted_cr_id(),
                "project_id": project.project_id,
                "project_name": project.project_name,
                "project_code": project.project_code,
                "item_name": cr.item_name or "N/A",
                "vendor_name": cr.selected_vendor_name,
                "vendor_id": cr.selected_vendor_id,
                "purchase_completed_by": cr.purchase_completed_by_name,
                "purchase_completion_date": cr.purchase_completion_date.isoformat() if cr.purchase_completion_date else None,
                "materials_data": materials_list,
                "total_cost": round(cr_total, 2),
                "status": cr.status,
                "delivery_routing": cr.delivery_routing,
                "store_request_status": cr.store_request_status
            })

        return jsonify({
            "success": True,
            "total_count": paginated.total,
            "count": len(available_crs),
            "page": page,
            "per_page": per_page,
            "total_pages": paginated.pages,
            "has_next": paginated.has_next,
            "has_prev": paginated.has_prev,
            "change_requests": available_crs
        }), 200

    except ValueError as e:
        log.warning(f"Validation error in get_crs_for_material_transfer: {e}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        log.error(f"Error fetching CRs for material transfer: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": "Failed to fetch CRs. Please try again later."}), 500


# ============================================================================
# BUYER MATERIAL TRANSFER - CREATE DELIVERY NOTE
# Allows buyer to manually transfer materials to site or M2 Store with DN
# ============================================================================

def create_buyer_material_transfer():
    """
    Create a delivery note for buyer-initiated material transfer
    Buyer can send materials to:
    1. Construction Site (direct delivery)
    2. M2 Store (for inventory with availability check)
    """
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Unknown Buyer')

        data = request.get_json()

        # Required fields
        destination_type = data.get('destination_type')  # 'site' or 'store'
        site_engineer_id = data.get('site_engineer_id')  # Site Engineer selection
        project_id_from_request = data.get('project_id')  # Project selection (cascading dropdown)
        materials = data.get('materials', [])  # [{inventory_material_id, quantity}]

        # Optional fields for DN - SANITIZE to prevent XSS
        from controllers.buyer.helpers import sanitize_string, MAX_STRING_LENGTH, MAX_TEXT_LENGTH
        try:
            vehicle_number = sanitize_string(data.get('vehicle_number'), MAX_STRING_LENGTH, 'Vehicle number')
            driver_name = sanitize_string(data.get('driver_name'), MAX_STRING_LENGTH, 'Driver name')
            driver_contact = sanitize_string(data.get('driver_contact'), MAX_STRING_LENGTH, 'Driver contact')
            notes = sanitize_string(data.get('notes', ''), MAX_TEXT_LENGTH, 'Notes')
        except ValueError as e:
            return jsonify({"success": False, "error": str(e)}), 400

        transfer_date = data.get('transfer_date')  # ISO string
        transfer_fee = data.get('transfer_fee', 0)

        # Validation
        if not destination_type or destination_type not in ['site', 'store']:
            return jsonify({"success": False, "error": "destination_type must be 'site' or 'store'"}), 400

        # Site Engineer ID and Project ID required when destination is 'site'
        if destination_type == 'site' and not site_engineer_id:
            return jsonify({"success": False, "error": "Site Engineer selection is required for site delivery"}), 400

        if destination_type == 'site' and not project_id_from_request:
            return jsonify({"success": False, "error": "Project selection is required for site delivery"}), 400

        if not materials or len(materials) == 0:
            return jsonify({"success": False, "error": "At least one material is required"}), 400

        # Get Site Engineer and their project (for site delivery)
        site_engineer = None
        project = None
        attention_to_name = None
        project_id = None

        if destination_type == 'site':
            # Validate Site Engineer exists
            site_engineer = User.query.filter_by(
                user_id=site_engineer_id,
                is_active=True,
                is_deleted=False
            ).first()

            if not site_engineer:
                return jsonify({"success": False, "error": "Site Engineer not found"}), 404

            attention_to_name = site_engineer.full_name

            # Validate Project exists and is assigned to this Site Engineer
            project = Project.query.filter_by(
                project_id=project_id_from_request,
                is_deleted=False
            ).first()

            if not project:
                return jsonify({"success": False, "error": "Project not found"}), 404

            # Verify this Site Engineer is assigned to this project via PMAssignSS
            from models.pm_assign_ss import PMAssignSS
            assignment = (
                db.session.query(PMAssignSS)
                .join(BOQ, PMAssignSS.boq_id == BOQ.boq_id)
                .filter(
                    PMAssignSS.assigned_to_se_id == site_engineer_id,
                    BOQ.project_id == project_id_from_request,
                    PMAssignSS.is_deleted == False
                )
                .first()
            )

            if not assignment:
                return jsonify({
                    "success": False,
                    "error": f"Site Engineer {site_engineer.full_name} is not assigned to project {project.project_name}"
                }), 400

            project_id = project.project_id

        # Parse transfer date
        delivery_date = datetime.utcnow()
        if transfer_date:
            try:
                delivery_date = datetime.fromisoformat(transfer_date.replace('Z', '+00:00'))
            except (ValueError, TypeError) as e:
                log.warning(f"Invalid transfer_date format: {transfer_date}, using current time. Error: {e}")

        # Generate DN number
        from controllers.inventory_controller import generate_delivery_note_number
        dn_number = generate_delivery_note_number()

        # Determine delivery_from and attention_to based on destination
        if destination_type == 'site':
            delivery_from = 'Buyer - Direct from Vendor'
            attention_to = attention_to_name  # Already set from Site Engineer selection
        else:  # destination_type == 'store'
            delivery_from = 'Buyer - Transfer to Store'
            attention_to = 'Production Manager'

        # Create MaterialDeliveryNote
        dn = MaterialDeliveryNote(
            delivery_note_number=dn_number,
            project_id=project_id,
            delivery_date=delivery_date,
            attention_to=attention_to,
            delivery_from=delivery_from,
            requested_by=buyer_name,
            request_date=datetime.utcnow(),
            vehicle_number=vehicle_number,
            driver_name=driver_name,
            driver_contact=driver_contact,
            transport_fee=transfer_fee,
            prepared_by=buyer_name,
            status='DRAFT',  # Start as DRAFT, buyer will issue it
            notes=notes,
            created_by=buyer_name,
            created_at=datetime.utcnow()
        )

        db.session.add(dn)
        db.session.flush()  # Get DN ID

        # Add delivery note items
        total_quantity = 0
        for mat_data in materials:
            inventory_material_id = mat_data.get('inventory_material_id')
            material_name = mat_data.get('material_name', '').strip()
            quantity = mat_data.get('quantity', 0)
            unit = mat_data.get('unit', 'pcs').strip()

            # Optional material attributes for new materials
            category = mat_data.get('category', '').strip()
            brand = mat_data.get('brand', '').strip()
            size = mat_data.get('size', '').strip()
            material_unit_price = mat_data.get('material_unit_price', 0)

            # Validate quantity is a valid number
            try:
                quantity = float(quantity)
            except (ValueError, TypeError):
                db.session.rollback()
                return jsonify({
                    "success": False,
                    "error": f"Invalid quantity format: {mat_data.get('quantity')}"
                }), 400

            # Validate basic material data
            if quantity <= 0:
                db.session.rollback()
                return jsonify({
                    "success": False,
                    "error": f"Quantity must be greater than 0"
                }), 400

            if not material_name:
                db.session.rollback()
                return jsonify({
                    "success": False,
                    "error": f"Material name is required"
                }), 400

            # Check for unreasonably large quantities (prevent DoS/overflow)
            if quantity > 1_000_000:
                db.session.rollback()
                return jsonify({
                    "success": False,
                    "error": f"Quantity exceeds maximum allowed limit (1,000,000)"
                }), 400

            # If inventory_material_id provided, validate it exists
            inv_material = None
            if inventory_material_id:
                inv_material = InventoryMaterial.query.filter_by(
                    inventory_material_id=inventory_material_id,
                    is_active=True
                ).first()

                if not inv_material:
                    db.session.rollback()
                    return jsonify({
                        "success": False,
                        "error": f"Inventory material {inventory_material_id} not found or inactive"
                    }), 404
            else:
                # No inventory_material_id provided - need to check if material already exists
                # For M2 Store transfers, intelligently match existing materials to avoid duplicates
                # For Site transfers, create custom material entry

                if destination_type == 'store':
                    # Smart matching for M2 Store transfers: check by material name (case-insensitive)
                    log.info(f"Checking if material '{material_name}' already exists in M2 Store inventory")

                    # Try exact case-insensitive match on material_name
                    existing_material = InventoryMaterial.query.filter(
                        db.func.lower(InventoryMaterial.material_name) == material_name.lower(),
                        InventoryMaterial.is_active == True
                    ).first()

                    if existing_material:
                        # Material already exists - use it and Production Manager will update stock later
                        inv_material = existing_material
                        inventory_material_id = existing_material.inventory_material_id
                        log.info(f"✓ Found existing material in inventory: '{existing_material.material_name}' (ID: {inventory_material_id})")
                    else:
                        # Material doesn't exist - create new inventory entry for M2 Store
                        log.info(f"✗ Material '{material_name}' not found in inventory - creating new entry")

                        # Use provided category or default to 'General'
                        material_category = category if category else 'General'

                        inv_material = InventoryMaterial(
                            material_name=material_name,
                            unit=unit,
                            current_stock=0,  # PM will update stock when receiving
                            min_stock_level=0,
                            material_code=f"MAT-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}",
                            category=material_category,
                            brand=brand if brand else None,
                            size=size if size else None,
                            unit_price=material_unit_price if material_unit_price else 0.0,
                            is_active=True,
                            created_by=buyer_name,
                            created_at=datetime.utcnow(),
                            last_modified_by=buyer_name,
                            last_modified_at=datetime.utcnow()
                        )
                        db.session.add(inv_material)
                        db.session.flush()
                        inventory_material_id = inv_material.inventory_material_id
                        log.info(f"✓ Created new inventory material ID: {inventory_material_id} for '{material_name}'")
                else:
                    # Site transfer - create custom material entry (not added to M2 Store inventory)
                    log.info(f"Creating custom material entry for site transfer: {material_name}")

                    # Use provided category or default to 'Custom Materials'
                    material_category = category if category else 'Custom Materials'

                    inv_material = InventoryMaterial(
                        material_name=material_name,
                        unit=unit,
                        current_stock=0,
                        min_stock_level=0,
                        material_code=f"CUSTOM-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
                        category=material_category,
                        brand=brand if brand else None,
                        size=size if size else None,
                        unit_price=material_unit_price if material_unit_price else 0.0,
                        is_active=True,
                        created_by=buyer_name,
                        created_at=datetime.utcnow(),
                        last_modified_by=buyer_name,
                        last_modified_at=datetime.utcnow()
                    )
                    db.session.add(inv_material)
                    db.session.flush()
                    inventory_material_id = inv_material.inventory_material_id
                    log.info(f"Created custom material ID: {inventory_material_id} for '{material_name}'")

            # Create DN item
            dn_item = DeliveryNoteItem(
                delivery_note_id=dn.delivery_note_id,
                inventory_material_id=inventory_material_id,
                quantity=quantity,
                unit_price=mat_data.get('unit_price'),  # Optional
                notes=mat_data.get('notes', '')
            )

            db.session.add(dn_item)
            total_quantity += quantity

            log.info(f"Added DN item: {material_name} x {quantity} {unit} (inventory ID: {inventory_material_id})")

            # NOTE: Stock deduction happens when DN is ISSUED by Production Manager, not at creation
            # Buyer creates DRAFT DN, PM issues it and deducts stock

        db.session.commit()

        log.info(f"Buyer {buyer_name} created manual material transfer DN {dn_number} to {destination_type}")

        return jsonify({
            "success": True,
            "message": f"Material transfer DN created successfully",
            "delivery_note": {
                "delivery_note_id": dn.delivery_note_id,
                "delivery_note_number": dn.delivery_note_number,
                "destination_type": destination_type,
                "project_id": project_id,
                "project_name": project.project_name if project else "M2 Store",
                "status": dn.status,
                "total_items": len(materials),
                "total_quantity": total_quantity,
                "created_at": dn.created_at.isoformat()
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        import traceback
        import json
        log.error(f"Error creating buyer material transfer for buyer {buyer_id}: {e}")
        log.error(f"Request data: {json.dumps(data, default=str)}")
        log.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": f"Failed to create material transfer: {str(e)}"
        }), 500


def get_site_engineers_for_transfer():
    """
    Get all Site Engineers for buyer material transfer
    Returns Site Engineers without project details (projects fetched separately)
    """
    try:
        # Get Site Engineer role
        from models.role import Role
        se_role = Role.query.filter_by(role='siteEngineer', is_deleted=False).first()

        if not se_role:
            log.warning("Site Engineer role 'siteEngineer' not found in database")
            return jsonify([]), 200

        # Get all users with Site Engineer role
        site_engineers = User.query.filter_by(
            role_id=se_role.role_id,
            is_deleted=False,
            is_active=True
        ).all()

        log.info(f"Found {len(site_engineers)} Site Engineers with role_id={se_role.role_id}")

        se_list = []
        from models.pm_assign_ss import PMAssignSS

        for se in site_engineers:
            # Count ONLY ONGOING projects assigned to this Site Engineer via PMAssignSS
            # Exclude: 1) completed/draft projects, 2) PM confirmed completion assignments
            project_count = (
                db.session.query(Project.project_id)
                .join(BOQ, Project.project_id == BOQ.project_id)
                .join(PMAssignSS, BOQ.boq_id == PMAssignSS.boq_id)
                .filter(
                    PMAssignSS.assigned_to_se_id == se.user_id,
                    PMAssignSS.is_deleted == False,
                    PMAssignSS.pm_confirmed_completion != True,  # Exclude PM-confirmed completed assignments
                    Project.is_deleted == False,
                    ~Project.status.in_(['completed', 'Completed', 'draft', 'Draft'])  # Only active projects
                )
                .distinct()
                .count()
            )

            se_data = {
                'user_id': se.user_id,
                'full_name': se.full_name,
                'email': se.email,
                'phone_number': se.phone,
                'role_name': se.role.role if se.role else 'siteEngineer',
                'project_count': project_count,
                'display_label': f"{se.full_name} ({project_count} project{'s' if project_count != 1 else ''})"
            }
            se_list.append(se_data)

        log.info(f"Returning {len(se_list)} Site Engineers to frontend")
        return jsonify(se_list), 200

    except Exception as e:
        log.error(f"Error fetching site engineers: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": "Failed to fetch site engineers"}), 500


def get_projects_for_site_engineer(site_engineer_id):
    """
    Get all projects assigned to a specific Site Engineer
    Used for material transfer project selection
    """
    try:
        # Validate Site Engineer exists
        se = User.query.filter_by(
            user_id=site_engineer_id,
            is_deleted=False,
            is_active=True
        ).first()

        if not se:
            return jsonify({"error": "Site Engineer not found"}), 404

        # Get ONLY ONGOING projects assigned to this Site Engineer via PMAssignSS table
        # Site Engineers are assigned to BOQs, which link to projects
        # Filter out: 1) completed/draft projects, 2) PM confirmed completion assignments
        from models.pm_assign_ss import PMAssignSS

        # Query: PMAssignSS → BOQ → Project (only active ongoing projects)
        assignments = (
            db.session.query(
                Project.project_id,
                Project.project_name,
                Project.project_code,
                Project.location,
                Project.area
            )
            .join(BOQ, Project.project_id == BOQ.project_id)
            .join(PMAssignSS, BOQ.boq_id == PMAssignSS.boq_id)
            .filter(
                PMAssignSS.assigned_to_se_id == site_engineer_id,
                PMAssignSS.is_deleted == False,
                PMAssignSS.pm_confirmed_completion != True,  # Exclude PM-confirmed completed assignments
                Project.is_deleted == False,
                ~Project.status.in_(['completed', 'Completed', 'draft', 'Draft'])  # Only active projects
            )
            .distinct()  # Prevent duplicates if SE is assigned to multiple BOQs in same project
            .all()
        )

        log.info(f"Found {len(assignments)} projects for Site Engineer {se.full_name} (ID: {site_engineer_id}) via PMAssignSS")

        project_list = []
        for proj in assignments:
            project_data = {
                'project_id': proj.project_id,
                'project_name': proj.project_name,
                'project_code': proj.project_code,
                'location': proj.location,
                'area': proj.area,
                'display_label': f"{proj.project_name} ({proj.project_code or 'No Code'})"
            }
            project_list.append(project_data)
            log.info(f"  - {proj.project_name} (ID: {proj.project_id})")

        return jsonify(project_list), 200

    except Exception as e:
        log.error(f"Error fetching projects for site engineer: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": "Failed to fetch projects"}), 500


def get_buyer_transfer_history():
    """Get all delivery notes created by the buyer for material transfers"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Unknown Buyer')

        # Pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        per_page = min(per_page, 100)  # Max 100 per page

        # Get all DNs created by this buyer with pagination
        dns_paginated = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.created_by == buyer_name
        ).order_by(MaterialDeliveryNote.created_at.desc()).paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )

        dns = dns_paginated.items

        transfer_history = []
        for dn in dns:
            # Get project details
            project = Project.query.filter_by(
                project_id=dn.project_id,
                is_deleted=False
            ).first()

            # Determine destination type from delivery_from
            destination_type = 'store' if 'Store' in dn.delivery_from else 'site'

            transfer_history.append({
                "delivery_note_id": dn.delivery_note_id,
                "delivery_note_number": dn.delivery_note_number,
                "project_id": dn.project_id,
                "project_name": project.project_name if project else "Unknown Project",
                "destination_type": destination_type,
                "delivery_date": dn.delivery_date.isoformat() if dn.delivery_date else None,
                "status": dn.status,
                "attention_to": dn.attention_to,
                "vehicle_number": dn.vehicle_number,
                "driver_name": dn.driver_name,
                "driver_contact": dn.driver_contact,
                "notes": dn.notes,
                "total_items": len(dn.items) if dn.items else 0,
                "created_at": dn.created_at.isoformat() if dn.created_at else None,
                "issued_at": dn.issued_at.isoformat() if dn.issued_at else None,
                "dispatched_at": dn.dispatched_at.isoformat() if dn.dispatched_at else None,
                "received_at": dn.received_at.isoformat() if dn.received_at else None,
                "items": [item.to_dict() for item in dn.items] if dn.items else []
            })

        return jsonify({
            "success": True,
            "total_count": dns_paginated.total,
            "page": page,
            "per_page": per_page,
            "total_pages": dns_paginated.pages,
            "transfers": transfer_history
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error getting buyer transfer history: {e}")
        log.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": f"Failed to get transfer history: {str(e)}",
            "transfers": []
        }), 500
