from flask import request, jsonify, g
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import or_, and_, func
from config.db import db
from models.project import Project
from models.boq import BOQ
from models.change_request import ChangeRequest
from models.po_child import POChild
from models.user import User
from models.role import Role
from models.vendor import Vendor
from models.inventory import *
from config.logging import get_logger
from datetime import datetime, timedelta
import json
from utils.comprehensive_notification_service import notification_service

log = get_logger()

__all__ = [
    'select_vendor_for_purchase', 'select_vendor_for_material',
    'create_po_children', 'update_purchase_order',
    'td_approve_vendor', 'td_reject_vendor',
    'get_vendor_selection_data', 'update_vendor_price', 'save_supplier_notes',
    'send_po_children_for_approval',
]

from controllers.buyer.helpers import (
    process_materials_with_negotiated_prices,
    has_buyer_permissions,
    is_buyer_role,
    is_admin_role,
    is_technical_director,
    sanitize_string,
    MAX_STRING_LENGTH,
    MAX_TEXT_LENGTH
)


def select_vendor_for_purchase(cr_id):
    """Select vendor for purchase (requires TD approval)"""
    try:
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        # Get effective context for admin viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']
        effective_role = context['effective_role']

        data = request.get_json()
        vendor_id = data.get('vendor_id')

        if not vendor_id:
            return jsonify({"error": "Vendor ID is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        # Allow admin viewing as buyer to select vendor
        is_admin_as_buyer = is_admin_viewing and effective_role == 'buyer'

        # Verify it's assigned to this buyer (skip check for TD, admin, or admin viewing as buyer)
        if not is_td and not is_admin and not is_admin_as_buyer and cr.assigned_to_buyer_user_id != user_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        # TD can change vendor even when status is pending_td_approval
        # Also allow 'split_to_sub_crs' for re-selecting vendor on rejected PO Children
        # Allow 'sent_to_store' for partial store routing (remaining materials need vendor)
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'split_to_sub_crs', 'sent_to_store']
        if is_td:
            allowed_statuses.append('pending_td_approval')

        if cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot select vendor. Current status: {cr.status}"}), 400

        # Verify vendor exists
        from models.vendor import Vendor
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Verify vendor is active
        if vendor.status != 'active':
            return jsonify({"error": "Selected vendor is not active"}), 400

        # Update the change request with vendor selection
        cr.selected_vendor_id = vendor_id
        cr.selected_vendor_name = vendor.company_name
        cr.updated_at = datetime.utcnow()

        # Set status and fields based on user role
        # TD changing vendor does NOT auto-approve - TD must manually click "Approve Vendor"
        if is_td:
            # TD is selecting/editing vendor - set to pending (TD must manually approve)
            cr.vendor_selection_status = 'pending_td_approval'
            cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD
            # Clear previous approval info since vendor changed
            cr.vendor_approved_by_td_id = None
            cr.vendor_approved_by_td_name = None
            cr.vendor_approval_date = None
            # Track who made the change
            cr.vendor_selected_by_buyer_id = user_id
            cr.vendor_selected_by_buyer_name = user_name
            cr.vendor_selection_date = datetime.utcnow()
        else:
            # Buyer is selecting vendor - needs TD approval
            cr.vendor_selected_by_buyer_id = user_id
            cr.vendor_selected_by_buyer_name = user_name
            cr.vendor_selection_date = datetime.utcnow()
            cr.vendor_selection_status = 'pending_td_approval'
            cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD

        # Add to BOQ History - Vendor Selection
        from models.boq import BOQHistory
        from sqlalchemy.orm.attributes import flag_modified

        existing_history = BOQHistory.query.filter_by(boq_id=cr.boq_id).order_by(BOQHistory.action_date.desc()).first()

        if existing_history:
            if existing_history.action is None:
                current_actions = []
            elif isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        # Create history action based on user role
        # Both TD and Buyer vendor selection goes to pending_td_approval status
        if is_td:
            new_action = {
                "role": "technical_director",
                "type": "change_request_vendor_changed",
                "sender": user_name,
                "receiver": "Technical Director",
                "sender_role": "technical_director",
                "receiver_role": "technical_director",
                "status": cr.status,
                "cr_id": cr_id,
                "item_name": cr.item_name or f"CR #{cr_id}",
                "materials_count": len(cr.materials_data) if cr.materials_data else 0,
                "total_cost": cr.materials_total_cost,
                "vendor_id": vendor_id,
                "vendor_name": vendor.company_name,
                "vendor_selection_status": "pending_td_approval",
                "comments": f"TD changed vendor to '{vendor.company_name}'. Manual approval required.",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": user_name,
                "sender_user_id": user_id,
                "project_name": cr.project.project_name if cr.project else None,
                "project_id": cr.project_id
            }
        else:
            new_action = {
                "role": "buyer",
                "type": "change_request_vendor_selected",
                "sender": user_name,
                "receiver": "Technical Director",
                "sender_role": "buyer",
                "receiver_role": "technical_director",
                "status": cr.status,
                "cr_id": cr_id,
                "item_name": cr.item_name or f"CR #{cr_id}",
                "materials_count": len(cr.materials_data) if cr.materials_data else 0,
                "total_cost": cr.materials_total_cost,
                "vendor_id": vendor_id,
                "vendor_name": vendor.company_name,
                "vendor_selection_status": "pending_td_approval",
                "comments": f"Buyer selected vendor '{vendor.company_name}' for purchase. Awaiting TD approval.",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": user_name,
                "sender_user_id": user_id,
                "project_name": cr.project.project_name if cr.project else None,
                "project_id": cr.project_id
            }

        current_actions.append(new_action)

        # Update history entry based on user role
        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = user_name
            existing_history.sender = user_name

            if is_td:
                existing_history.receiver = "Technical Director"
                existing_history.comments = f"CR #{cr_id} vendor changed by TD, pending manual approval"
                existing_history.sender_role = 'technical_director'
                existing_history.receiver_role = 'technical_director'
            else:
                existing_history.receiver = "Technical Director"
                existing_history.comments = f"CR #{cr_id} vendor selected, pending TD approval"
                existing_history.sender_role = 'buyer'
                existing_history.receiver_role = 'technical_director'

            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            if is_td:
                boq_history = BOQHistory(
                    boq_id=cr.boq_id,
                    action=current_actions,
                    action_by=user_name,
                    boq_status=cr.boq.status if cr.boq else 'unknown',
                    sender=user_name,
                    receiver="Technical Director",
                    comments=f"CR #{cr_id} vendor changed by TD, pending manual approval",
                    sender_role='technical_director',
                    receiver_role='technical_director',
                    action_date=datetime.utcnow(),
                    created_by=user_name
                )
            else:
                boq_history = BOQHistory(
                    boq_id=cr.boq_id,
                    action=current_actions,
                    action_by=user_name,
                    boq_status=cr.boq.status if cr.boq else 'unknown',
                    sender=user_name,
                    receiver="Technical Director",
                    comments=f"CR #{cr_id} vendor selected",
                    sender_role='buyer',
                    receiver_role='technical_director',
                    action_date=datetime.utcnow(),
                    created_by=user_name
                )
            db.session.add(boq_history)

        db.session.commit()

        # Send notification when buyer selects vendor (needs TD approval)
        try:
            if not is_td:  # Only notify TD when buyer selects vendor
                # DEBUG: Log all roles to see what's in the database
                all_roles = Role.query.filter_by(is_deleted=False).all()
                log.info(f"[TD Notification DEBUG] All roles in database: {[(r.role_id, r.role) for r in all_roles]}")

                # Get TD users - try multiple role name variations
                td_role = None
                role_variations = [
                    'Technical Director', 'technicalDirector', 'technical_director',
                    'TechnicalDirector', 'TD', 'td'
                ]

                for role_name in role_variations:
                    td_role = Role.query.filter_by(role=role_name, is_deleted=False).first()
                    if td_role:
                        log.info(f"[TD Notification] Found TD role with name: '{role_name}', role_id={td_role.role_id}")
                        break

                if not td_role:
                    # Try case-insensitive search
                    td_role = Role.query.filter(
                        Role.role.ilike('%technical%director%'),
                        Role.is_deleted == False
                    ).first()
                    if td_role:
                        log.info(f"[TD Notification] Found TD role via ilike: {td_role.role}")

                if td_role:
                    tds = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                    log.info(f"[TD Notification] Found {len(tds)} TD users for role_id={td_role.role_id}")

                    if tds:
                        project_name = cr.project.project_name if cr.project else 'Unknown Project'
                        # Send notification to all TDs
                        for td_user in tds:
                            log.info(f"[TD Notification] Sending notification to TD user_id={td_user.user_id}, name={td_user.full_name}")
                            notification_service.notify_vendor_selected_for_cr(
                                cr_id=cr_id,
                                project_name=project_name,
                                buyer_id=user_id,
                                buyer_name=user_name,
                                td_user_id=td_user.user_id,
                                vendor_name=vendor.company_name
                            )
                    else:
                        log.warning(f"[TD Notification] No active TD users found for role_id={td_role.role_id}")
                else:
                    log.warning(f"[TD Notification] Could not find TD role in database")
        except Exception as notif_error:
            log.error(f"Failed to send vendor selection notification: {notif_error}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")

        # Log and return response based on user role
        if is_td:
            return jsonify({
                "success": True,
                "message": "Vendor selection saved and approved",
                "purchase": {
                    "cr_id": cr.cr_id,
                    "selected_vendor_id": cr.selected_vendor_id,
                    "selected_vendor_name": cr.selected_vendor_name,
                    "vendor_selection_status": cr.vendor_selection_status,
                    "vendor_selection_date": cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None
                }
            }), 200
        else:
            return jsonify({
                "success": True,
                "message": "Vendor selection sent to TD for approval",
                "purchase": {
                    "cr_id": cr.cr_id,
                    "selected_vendor_id": cr.selected_vendor_id,
                    "selected_vendor_name": cr.selected_vendor_name,
                    "vendor_selection_status": cr.vendor_selection_status,
                    "vendor_selection_date": cr.vendor_selection_date.isoformat()
                }
            }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error selecting vendor for purchase: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to select vendor: {str(e)}"}), 500


def select_vendor_for_material(cr_id):
    """Select vendor for specific material(s) in purchase order"""
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        material_selections = data.get('material_selections')  # Array of {material_name, vendor_id}

        if not material_selections or not isinstance(material_selections, list):
            return jsonify({"error": "material_selections array is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        # Get effective user context for admin viewing as buyer
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for TD, Admin, or Admin viewing as Buyer)
        # Convert both to int for safe comparison (user_id from JWT may be string)
        assigned_buyer_id = int(cr.assigned_to_buyer_user_id or 0)
        current_user_id = int(user_id)
        if not is_td and not is_admin and not is_admin_viewing and assigned_buyer_id != current_user_id:
            log.warning(f"select_vendor_for_material - Permission denied: assigned_buyer_id={assigned_buyer_id} != current_user_id={current_user_id}")
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        # Both buyer and TD can change vendor when status is pending_td_approval
        # Buyer may want to update their selection before TD approves
        # Also allow 'split_to_sub_crs' for re-selecting vendor on rejected PO Children
        # Allow 'rejected' for when vendor selection was rejected and buyer needs to resubmit
        # Allow 'sent_to_store' for partial store routing (remaining materials need vendor)
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'pending_td_approval', 'split_to_sub_crs', 'rejected', 'sent_to_store']

        if cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot select vendor. Current status: {cr.status}"}), 400

        # Special handling for sub-CRs: TD changing vendor for specific material(s)
        # When TD changes vendor for ONE material, only that material should be separated
        # Other materials should stay in the original sub-CR with their existing vendor
        if is_td and cr.is_sub_cr and material_selections:
            from models.vendor import Vendor

            # Get the original sub-CR's vendor (convert to int for safe comparison)
            original_vendor_id = int(cr.selected_vendor_id) if cr.selected_vendor_id else None

            # Separate materials into: changed (different vendor) vs unchanged (same vendor)
            changed_materials = []  # Materials that TD is assigning to a DIFFERENT vendor
            unchanged_materials = []  # Materials staying with the original vendor

            for sel in material_selections:
                sel_vendor_id = sel.get('vendor_id')
                # Convert to int for safe comparison (JSON may send as string)
                sel_vendor_id_int = int(sel_vendor_id) if sel_vendor_id else None

                if sel_vendor_id_int and sel_vendor_id_int != original_vendor_id:
                    changed_materials.append(sel)
                else:
                    unchanged_materials.append(sel)

            # If no materials are being changed to a different vendor, just update the sub-CR
            if not changed_materials:
                # Single vendor selected - just update the sub-CR's vendor (no splitting)
                first_selection = material_selections[0]
                new_vendor_id = first_selection.get('vendor_id')

                if new_vendor_id:
                    new_vendor = Vendor.query.filter_by(vendor_id=new_vendor_id, is_deleted=False).first()
                    if not new_vendor:
                        return jsonify({"error": f"Vendor {new_vendor_id} not found"}), 404
                    if new_vendor.status != 'active':
                        return jsonify({"error": f"Vendor '{new_vendor.company_name}' is not active"}), 400

                    old_vendor_name = cr.selected_vendor_name

                    # Update sub-CR's main vendor fields (vendor changed, but NOT auto-approved)
                    cr.selected_vendor_id = new_vendor_id
                    cr.selected_vendor_name = new_vendor.company_name
                    # Keep status as pending_td_approval - TD needs to explicitly approve
                    cr.vendor_selection_status = 'pending_td_approval'
                    cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD
                    cr.updated_at = datetime.utcnow()

                    db.session.commit()

                    return jsonify({
                        "success": True,
                        "message": f"Vendor changed from '{old_vendor_name}' to '{new_vendor.company_name}'",
                        "purchase": {
                            "cr_id": cr.cr_id,
                            "formatted_cr_id": cr.get_formatted_cr_id(),
                            "status": cr.status,
                            "selected_vendor_id": cr.selected_vendor_id,
                            "selected_vendor_name": cr.selected_vendor_name,
                            "vendor_selection_status": cr.vendor_selection_status
                        }
                    })
                # Fall through to normal processing if no vendor_id

            # DEPRECATED: Old sub-CR system - Now use POChild table instead
            # This code path is no longer supported after schema cleanup (2025-12-19)
            # If you need to split materials by vendor, use create_po_children_for_vendor_groups()
            return jsonify({
                "error": "Material-level vendor changes are not supported for this purchase type. Please use the POChild vendor management system."
            }), 400

            # Old deprecated code below (kept for reference):
            # parent_cr = ChangeRequest.query.filter_by(
            #     cr_id=cr.parent_cr_id,  # Column removed
            #     is_deleted=False
            # ).first()
            #
            # if not parent_cr:
            #     return jsonify({"error": "Parent CR not found for sub-CR splitting"}), 404

            # DEPRECATED CODE REMOVED (2025-12-19) - Lines 3216-3369
            # This code tried to create sub-CRs using deprecated columns:
            # - parent_cr_id, cr_number_suffix, submission_group_id
            # Use POChild table and create_po_children_for_vendor_groups() instead

        # Initialize material_vendor_selections if it doesn't exist
        if not cr.material_vendor_selections:
            cr.material_vendor_selections = {}

        # Enable per-material vendor mode
        cr.use_per_material_vendors = True

        # Process each material selection
        from models.vendor import Vendor
        updated_materials = []

        for selection in material_selections:
            material_name = selection.get('material_name')
            vendor_id = selection.get('vendor_id')
            negotiated_price = selection.get('negotiated_price')
            save_price_for_future = selection.get('save_price_for_future', False)
            supplier_notes_from_selection = selection.get('supplier_notes')  # Get notes from selection

            # Get vendor's material name from their catalog/product list
            vendor_material_name = None
            all_selected_vendors = selection.get('all_selected_vendors', [])
            if all_selected_vendors:
                for vendor_info in all_selected_vendors:
                    if vendor_info.get('vendor_id') == vendor_id:
                        vendor_material_name = vendor_info.get('vendor_material_name')
                        break

            if not material_name or not vendor_id:
                continue

            # Verify vendor exists and is active
            vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
            if not vendor:
                return jsonify({"error": f"Vendor {vendor_id} not found"}), 404

            if vendor.status != 'active':
                return jsonify({"error": f"Vendor '{vendor.company_name}' is not active"}), 400

            # Handle price updates for future purchases
            if save_price_for_future and negotiated_price is not None:
                try:
                    from models.vendor import VendorProduct

                    # Find matching product(s) for this vendor and material
                    # Try exact match first
                    material_lower = material_name.lower().strip()
                    products = VendorProduct.query.filter_by(
                        vendor_id=vendor_id,
                        is_deleted=False
                    ).all()

                    matching_products = []
                    for product in products:
                        product_name = (product.product_name or '').lower().strip()
                        # Exact match or contains match
                        if product_name == material_lower or material_lower in product_name or product_name in material_lower:
                            matching_products.append(product)

                    # Update unit_price for all matching products
                    if matching_products:
                        for product in matching_products:
                            product.unit_price = float(negotiated_price)

                        db.session.flush()  # Flush to ensure updates are persisted
                    else:
                        log.warning(f"No matching products found for material '{material_name}' from vendor {vendor_id}")

                except Exception as price_error:
                    log.error(f"Error updating vendor product price: {str(price_error)}")
                    # Continue with vendor selection even if price update fails

            # Set status based on user role
            if is_td:
                selection_status = 'approved'
                approved_by_td_id = user_id
                approved_by_td_name = user_name
                approval_date = datetime.utcnow().isoformat()
            else:
                selection_status = 'pending_td_approval'
                approved_by_td_id = None
                approved_by_td_name = None
                approval_date = None

            # Store vendor selection for this material (including negotiated price and vendor's material name)
            vendor_selection_data = {
                'vendor_id': vendor_id,
                'vendor_name': vendor.company_name,
                'vendor_material_name': vendor_material_name,
                'vendor_email': vendor.email,
                'vendor_phone': vendor.phone,
                'vendor_phone_code': vendor.phone_code,
                'vendor_contact_person': vendor.contact_person_name,
                'selected_by_user_id': user_id,
                'selected_by_name': user_name,
                'selection_date': datetime.utcnow().isoformat(),
                'selection_status': selection_status,
                'approved_by_td_id': approved_by_td_id,
                'approved_by_td_name': approved_by_td_name,
                'approval_date': approval_date,
                'rejection_reason': None
            }

            # CRITICAL: Include supplier_notes - use new notes from selection OR preserve existing ones
            if supplier_notes_from_selection is not None:
                # Use notes from current selection (buyer may have updated them)
                vendor_selection_data['supplier_notes'] = supplier_notes_from_selection.strip() if supplier_notes_from_selection else ''
            elif material_name in cr.material_vendor_selections and 'supplier_notes' in cr.material_vendor_selections[material_name]:
                # Preserve existing notes if not provided in current selection
                vendor_selection_data['supplier_notes'] = cr.material_vendor_selections[material_name]['supplier_notes']

            # Add negotiated price information if provided
            if negotiated_price is not None:
                vendor_selection_data['negotiated_price'] = float(negotiated_price)
                vendor_selection_data['save_price_for_future'] = bool(save_price_for_future)

            # CRITICAL: Store ALL evaluated vendors for TD comparison (vendor_comparison_data)
            # This allows TD to see which vendors were evaluated and their prices
            if all_selected_vendors and len(all_selected_vendors) > 0:
                # PERFORMANCE: Avoid N+1 query - fetch all vendors in one query
                vendor_ids = [v.get('vendor_id') for v in all_selected_vendors if v.get('vendor_id')]

                if vendor_ids:
                    # Single query to fetch all evaluated vendors at once
                    vendors_map = {
                        v.vendor_id: v
                        for v in Vendor.query.filter(
                            Vendor.vendor_id.in_(vendor_ids),
                            Vendor.is_deleted == False
                        ).all()
                    }

                    vendor_comparison_list = []
                    for evaluated_vendor_info in all_selected_vendors:
                        eval_vendor_id = evaluated_vendor_info.get('vendor_id')
                        if eval_vendor_id:
                            # O(1) lookup from pre-fetched map instead of N database queries
                            eval_vendor = vendors_map.get(eval_vendor_id)
                            if eval_vendor:
                                vendor_comparison_list.append({
                                    'vendor_id': eval_vendor_id,
                                    'vendor_name': evaluated_vendor_info.get('vendor_name', eval_vendor.company_name),
                                    'vendor_material_name': evaluated_vendor_info.get('vendor_material_name'),
                                    'negotiated_price': evaluated_vendor_info.get('negotiated_price'),
                                    'vendor_email': eval_vendor.email,
                                    'vendor_phone': eval_vendor.phone,
                                    'vendor_phone_code': eval_vendor.phone_code,
                                    'vendor_contact_person': eval_vendor.contact_person_name,
                                    'vendor_category': eval_vendor.category,
                                    'vendor_street_address': eval_vendor.street_address,
                                    'vendor_city': eval_vendor.city,
                                    'vendor_state': eval_vendor.state,
                                    'vendor_country': eval_vendor.country,
                                    'vendor_gst_number': eval_vendor.gst_number,
                                    'is_selected': eval_vendor_id == vendor_id
                                })
                    vendor_selection_data['vendor_comparison_data'] = vendor_comparison_list
                    log.info(f"Saved vendor comparison data for material '{material_name}': {len(vendor_comparison_list)} vendors evaluated")

            cr.material_vendor_selections[material_name] = vendor_selection_data

            updated_materials.append(material_name)

        # Mark the JSONB field as modified so SQLAlchemy detects the change
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(cr, 'material_vendor_selections')

        # FIX: Check if ALL UNROUTED materials now have vendors selected
        # Don't check materials that have already been routed to store or vendor
        all_materials_have_vendors = True
        routed_materials = cr.routed_materials or {}

        # Check if any materials are store-routed (mixed routing scenario)
        has_store_routing = any(
            isinstance(info, dict) and info.get('routing') == 'store'
            for info in routed_materials.values()
        )

        if cr.materials_data and isinstance(cr.materials_data, list):
            for material in cr.materials_data:
                material_name = material.get('material_name')
                # Skip materials that have already been routed
                if material_name in routed_materials:
                    continue
                # Check if this unrouted material has a vendor selected
                if material_name and material_name not in cr.material_vendor_selections:
                    all_materials_have_vendors = False
                    break

        # CRITICAL FIX: When store-routed materials exist, do NOT set parent CR to pending_td_approval
        # The frontend must use create_po_children to properly separate store and vendor materials
        # Setting parent CR to pending_td_approval with mixed routing causes store materials
        # to appear in TD's vendor approval queue
        if all_materials_have_vendors and not has_store_routing:
            cr.status = 'pending_td_approval'
            cr.vendor_selection_status = 'pending_td_approval'  # Also set vendor_selection_status for Pending Approval tab
            cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD
            # Set selected_vendor fields from the first material's vendor (for single vendor case)
            first_material = list(cr.material_vendor_selections.values())[0] if cr.material_vendor_selections else None
            if first_material:
                cr.selected_vendor_id = first_material.get('vendor_id')
                cr.selected_vendor_name = first_material.get('vendor_name')
                cr.vendor_selected_by_buyer_id = user_id
                cr.vendor_selected_by_buyer_name = user_name
                cr.vendor_selection_date = datetime.utcnow()
        elif all_materials_have_vendors and has_store_routing:
            # Mixed routing: vendor selections saved but parent CR stays in current status
            # Frontend should call create_po_children to properly split vendor and store materials
            log.info(f"CR-{cr_id}: All vendor materials selected but store routing exists. "
                     f"Parent CR NOT set to pending_td_approval. Frontend must create POChildren.")

        cr.updated_at = datetime.utcnow()
        db.session.commit()

        # Send notifications to TD if buyer made selections (only when NO store routing)
        if not is_td and not has_store_routing:
            try:
                from models.role import Role
                from utils.notification_utils import NotificationManager
                from socketio_server import send_notification_to_user

                # Try multiple possible TD role names
                td_role = Role.query.filter_by(role='Technical Director', is_deleted=False).first()
                if not td_role:
                    td_role = Role.query.filter_by(role='technicalDirector', is_deleted=False).first()
                if not td_role:
                    td_role = Role.query.filter(Role.role.ilike('%technical%director%'), Role.is_deleted == False).first()

                log.info(f"TD notification - Found TD role: {td_role.role if td_role else 'None'}")

                if td_role:
                    from models.user import User
                    td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                    log.info(f"TD notification - Found {len(td_users)} TD users")
                    for td_user in td_users:
                        # Customize notification based on whether all materials are submitted
                        if all_materials_have_vendors:
                            notification_title = 'Purchase Order Ready for Approval'
                            notification_message = f'Buyer completed vendor selection for all materials in CR #{cr_id}. Ready for your approval.'
                        else:
                            # Include material names to make each notification unique (avoid duplicate blocking)
                            material_names = ', '.join(updated_materials[:3])  # Show first 3 materials
                            if len(updated_materials) > 3:
                                material_names += f' and {len(updated_materials) - 3} more'
                            notification_title = 'Vendor Selections Need Approval'
                            notification_message = f'Buyer selected vendors for {len(updated_materials)} material(s) in CR #{cr_id}: {material_names}'

                        notification = NotificationManager.create_notification(
                            user_id=td_user.user_id,
                            type='action_required',
                            title=notification_title,
                            message=notification_message,
                            priority='high',
                            category='purchase',
                            action_url=f'/technical-director/change-requests?cr_id={cr_id}',  # TD reviews vendor selections in change-requests
                            action_label='Review Selections',
                            metadata={'cr_id': str(cr_id), 'materials_count': len(updated_materials), 'target_role': 'technical-director'},
                            sender_id=user_id,
                            sender_name=user_name,
                            target_role='technical-director'
                        )
                        send_notification_to_user(td_user.user_id, notification.to_dict())
            except Exception as notif_error:
                log.error(f"Failed to send notification: {notif_error}")

        # Determine appropriate message based on status
        if all_materials_have_vendors and has_store_routing:
            message = f"Vendor selections saved for {len(updated_materials)} material(s). Please submit to create purchase orders (store materials will be separated)."
        elif all_materials_have_vendors:
            if is_td:
                message = f"All materials approved! PO-{cr_id} is ready for purchase."
            else:
                message = f"All materials submitted for TD approval! PO-{cr_id} will be reviewed by Technical Director."
        else:
            message = f"Vendor(s) {'approved' if is_td else 'selected for TD approval'} for {len(updated_materials)} material(s)"

        return jsonify({
            "success": True,
            "message": message,
            "requires_po_children": has_store_routing and all_materials_have_vendors,  # Tell frontend to create POChildren
            "has_store_routing": has_store_routing,
            "purchase": {
                "cr_id": cr.cr_id,
                "status": cr.status,
                "use_per_material_vendors": cr.use_per_material_vendors,
                "material_vendor_selections": cr.material_vendor_selections,
                "updated_materials": updated_materials,
                "all_materials_have_vendors": all_materials_have_vendors
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error selecting vendors for materials: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to select vendors: {str(e)}"}), 500


def create_po_children(cr_id):
    """
    Create POChild records for each vendor group.
    Replaces the deprecated create_sub_crs_for_vendor_groups() function.

    Each POChild will have:
    - parent_cr_id pointing to the original CR
    - suffix like ".1", ".2", ".3"
    - Subset of materials for that vendor
    - Independent lifecycle (vendor approval, purchase tracking)
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_groups = data.get('vendor_groups')  # Array of {vendor_id, vendor_name, materials: []}
        submission_group_id = data.get('submission_group_id')  # UUID to group these PO children
        send_notification = data.get('send_notification', False)  # If True, auto-send TD notification

        if not vendor_groups or not isinstance(vendor_groups, list):
            return jsonify({"error": "vendor_groups array is required"}), 400

        if not submission_group_id:
            import uuid
            submission_group_id = str(uuid.uuid4())

        # Get the parent change request
        parent_cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not parent_cr:
            return jsonify({"error": "Parent purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        # Get effective user context for admin viewing as buyer
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for TD, Admin, or Admin viewing as Buyer)
        assigned_buyer_id = int(parent_cr.assigned_to_buyer_user_id or 0)
        current_user_id = int(user_id)
        if not is_td and not is_admin and not is_admin_viewing and assigned_buyer_id != current_user_id:
            return jsonify({"error": f"This purchase is not assigned to you (assigned to buyer ID {assigned_buyer_id})"}), 403

        # Verify parent CR is in correct status
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'sent_to_store']
        if parent_cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot create PO children. Parent CR status: {parent_cr.status}"}), 400

        # Create POChild records for each vendor group
        created_po_children = []

        # Get existing POChild records for this parent CR (to consolidate same vendors) with eager loading
        existing_po_children = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            parent_cr_id=cr_id,
            is_deleted=False
        ).all()

        # Build a map of vendor_id -> existing POChild for consolidation
        existing_vendor_po_children = {}
        for existing_po in existing_po_children:
            if existing_po.vendor_id:
                existing_vendor_po_children[existing_po.vendor_id] = existing_po

        # CRITICAL FIX: Build a set of ALL materials already in approved/completed POChildren
        # These materials should be REJECTED as duplicates to prevent double-ordering
        materials_already_approved = set()
        for existing_po in existing_po_children:
            if existing_po.status in ['vendor_approved', 'purchase_completed', 'approved']:
                if existing_po.materials_data:
                    for mat in existing_po.materials_data:
                        mat_name = mat.get('material_name')
                        if mat_name:
                            materials_already_approved.add(mat_name.lower().strip())

        if materials_already_approved:
            log.info(f"Materials already approved/purchased for CR {cr_id}: {materials_already_approved}")

        # Count existing POChild records to determine next suffix for NEW vendors
        # Use max suffix to avoid gaps if POChildren were deleted
        max_suffix = 0
        for existing_po in existing_po_children:
            if existing_po.suffix:
                try:
                    suffix_num = int(existing_po.suffix.replace('.', ''))
                    if suffix_num > max_suffix:
                        max_suffix = suffix_num
                except (ValueError, AttributeError):
                    pass
        next_suffix_number = max_suffix + 1

        for vendor_group in vendor_groups:
            vendor_id = vendor_group.get('vendor_id')
            vendor_name = vendor_group.get('vendor_name')
            materials = vendor_group.get('materials')
            routing_type = vendor_group.get('routing_type', 'vendor')  # 'store' or 'vendor'

            if not materials:
                continue

            # For store routing, vendor_id is optional (will be None)
            if routing_type == 'vendor' and not vendor_id:
                log.warning(f"Vendor routing requires vendor_id, skipping group")
                continue

            # Extract child_notes from material_vendor_selections for this vendor
            # Look for any material assigned to this vendor that has supplier_notes
            child_notes_for_vendor = None
            if parent_cr.material_vendor_selections:
                for mat_name, selection in parent_cr.material_vendor_selections.items():
                    if isinstance(selection, dict):
                        selection_vendor_id = selection.get('vendor_id')
                        # Compare as integers to handle both string and int types
                        if selection_vendor_id is not None and int(selection_vendor_id) == int(vendor_id):
                            if selection.get('supplier_notes'):
                                child_notes_for_vendor = selection.get('supplier_notes')
                                log.info(f"Found child_notes for vendor {vendor_id} from material '{mat_name}': {child_notes_for_vendor[:50] if child_notes_for_vendor else ''}...")
                                break

            # Also check materials in vendor_group payload for supplier_notes
            if not child_notes_for_vendor:
                for material in materials:
                    mat_name = material.get('material_name')
                    if mat_name and parent_cr.material_vendor_selections:
                        selection = parent_cr.material_vendor_selections.get(mat_name, {})
                        if isinstance(selection, dict) and selection.get('supplier_notes'):
                            child_notes_for_vendor = selection.get('supplier_notes')
                            log.info(f"Found child_notes from material '{mat_name}' selection: {child_notes_for_vendor[:50] if child_notes_for_vendor else ''}...")
                            break

            # CRITICAL FIX: Filter out materials that are already in approved POChildren
            # This prevents duplicate ordering of the same materials
            filtered_materials = []
            duplicate_materials = []
            for material in materials:
                mat_name = material.get('material_name', '')
                if mat_name.lower().strip() in materials_already_approved:
                    duplicate_materials.append(mat_name)
                else:
                    filtered_materials.append(material)

            if duplicate_materials:
                log.warning(f"Skipping {len(duplicate_materials)} duplicate materials already approved for vendor {vendor_id}: {duplicate_materials}")

            if not filtered_materials:
                # All materials were duplicates, skip this vendor group entirely
                log.warning(f"All materials for vendor {vendor_id} are already approved - skipping vendor group")
                continue

            # Use filtered materials for the rest of the function
            materials = filtered_materials

            # Verify vendor exists and is active (only for vendor routing)
            vendor = None
            vendor_product_prices = {}

            if routing_type == 'vendor':
                vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
                if not vendor:
                    return jsonify({"error": f"Vendor {vendor_id} not found"}), 404

                if vendor.status != 'active':
                    return jsonify({"error": f"Vendor '{vendor.company_name}' is not active"}), 400

                # Get vendor's product prices as fallback
                from models.vendor import VendorProduct
                vendor_products = VendorProduct.query.filter_by(
                    vendor_id=vendor_id,
                    is_deleted=False
                ).all()
                for vp in vendor_products:
                    if vp.product_name:
                        vendor_product_prices[vp.product_name.lower().strip()] = float(vp.unit_price or 0)

            # Extract materials data for this vendor group
            po_materials = []
            total_cost = 0.0

            for material in materials:
                material_name = material.get('material_name')
                quantity = material.get('quantity', 0)
                unit = material.get('unit', '')
                negotiated_price = material.get('negotiated_price')
                supplier_notes_for_material = material.get('supplier_notes')  # Per-material notes from frontend

                # Find the material from parent CR
                # CRITICAL: Search sub_items_data first (has complete structure with sub_item_name)
                # Then fallback to materials_data for backward compatibility
                parent_material = None

                # First, search in sub_items_data (has sub_item_name and complete structure)
                if parent_cr.sub_items_data:
                    for pm in parent_cr.sub_items_data:
                        if pm.get('material_name') == material_name:
                            parent_material = pm
                            break

                # Fallback to materials_data if not found (for old CRs without sub_items_data)
                if not parent_material and parent_cr.materials_data:
                    for pm in parent_cr.materials_data:
                        if pm.get('material_name') == material_name:
                            parent_material = pm
                            break

                # CRITICAL FIX: If negotiated_price not provided, check parent CR's material_vendor_selections
                # This is where the buyer stores the selected vendor price
                if not negotiated_price and parent_cr.material_vendor_selections:
                    vendor_selection = parent_cr.material_vendor_selections.get(material_name, {})
                    if isinstance(vendor_selection, dict):
                        negotiated_price = vendor_selection.get('negotiated_price')
                        if negotiated_price:
                            log.info(f"Using vendor price from parent CR material_vendor_selections for '{material_name}': {negotiated_price}")

                # CRITICAL FIX: If supplier_notes not provided, check parent CR's material_vendor_selections
                # This is where the buyer stores the supplier notes when selecting vendors
                if not supplier_notes_for_material and parent_cr.material_vendor_selections:
                    vendor_selection = parent_cr.material_vendor_selections.get(material_name, {})
                    if isinstance(vendor_selection, dict):
                        supplier_notes_for_material = vendor_selection.get('supplier_notes', '')
                        if supplier_notes_for_material:
                            log.info(f"Using supplier notes from parent CR material_vendor_selections for '{material_name}': {supplier_notes_for_material[:50]}...")

                # Lookup vendor product price as fallback
                vendor_product_price = vendor_product_prices.get(material_name.lower().strip() if material_name else '', 0)

                # Calculate price - priority: negotiated > vendor product price > parent material price (BOQ)
                # CRITICAL: Changed order - only use parent_price (BOQ) as last resort
                parent_price = parent_material.get('unit_price', 0) if parent_material else 0
                unit_price = negotiated_price if negotiated_price else (vendor_product_price if vendor_product_price else parent_price)
                material_total = unit_price * quantity
                total_cost += material_total

                # Get BOQ price for comparison (original_unit_price if stored, or lookup from BOQ)
                boq_unit_price = 0
                if parent_material:
                    # First try original_unit_price (if stored during CR creation)
                    boq_unit_price = parent_material.get('original_unit_price', 0)
                    # Fallback to unit_price from sub_items_data (if not negotiated)
                    if not boq_unit_price:
                        # Check if parent CR has sub_items_data with original prices
                        sub_items = parent_cr.sub_items_data or []
                        for sub in sub_items:
                            if sub.get('material_name') == material_name:
                                boq_unit_price = sub.get('unit_price', 0) or sub.get('original_unit_price', 0)
                                break
                    # If still no price, use the parent material price as fallback
                    if not boq_unit_price:
                        boq_unit_price = parent_material.get('unit_price', 0)

                boq_total_price = boq_unit_price * quantity if boq_unit_price else 0

                po_materials.append({
                    'material_name': material_name,
                    'sub_item_name': parent_material.get('sub_item_name', '') if parent_material else '',
                    'description': parent_material.get('description', '') if parent_material else '',
                    'brand': parent_material.get('brand', '') if parent_material else '',
                    'size': parent_material.get('size', '') if parent_material else '',
                    'specification': parent_material.get('specification', '') if parent_material else '',
                    'quantity': quantity,
                    'unit': unit,
                    'unit_price': unit_price,  # Vendor's price
                    'total_price': material_total,  # Vendor's total
                    'boq_unit_price': boq_unit_price,  # Original BOQ price for comparison
                    'boq_total_price': boq_total_price,  # BOQ total for comparison
                    'master_material_id': parent_material.get('master_material_id') if parent_material else None,
                    'negotiated_price': negotiated_price,  # Store negotiated price
                    'is_new_material': parent_material.get('is_new_material', False) if parent_material else False,  # Flag if new material
                    'supplier_notes': supplier_notes_for_material  # Per-material notes for supplier
                })

            # Check if a POChild already exists for this vendor (consolidate materials)
            # Consolidation logic:
            # - 'pending_td_approval': Not yet approved by TD -> MERGE into existing
            # - 'rejected': TD rejected -> MERGE into existing (resubmit)
            # - 'vendor_approved' / 'approved': TD approved -> CREATE NEW (separate purchase)
            # - 'purchase_completed': Already purchased -> CREATE NEW (separate purchase)
            existing_po_child = existing_vendor_po_children.get(vendor_id)

            # Determine if we should consolidate or create new
            should_consolidate = False
            if existing_po_child:
                consolidate_statuses = ['pending_td_approval', 'rejected']
                if existing_po_child.status in consolidate_statuses:
                    should_consolidate = True
                    log.info(f"Found existing POChild {existing_po_child.get_formatted_id()} for vendor {vendor.company_name} with status '{existing_po_child.status}' - will MERGE materials")
                else:
                    # TD already approved or purchase completed - create new POChild for new purchase
                    log.info(f"Existing POChild {existing_po_child.get_formatted_id()} for vendor {vendor.company_name} has status '{existing_po_child.status}' (approved/completed) - will create NEW POChild for new purchase")

            if should_consolidate and existing_po_child:
                # Consolidate: Add new materials to existing POChild for same vendor/routing
                # Get existing materials and build a lookup by material_name
                existing_materials = list(existing_po_child.materials_data or [])  # Make a copy
                existing_material_names = {m.get('material_name'): idx for idx, m in enumerate(existing_materials)}

                materials_added = 0
                materials_updated = 0
                for new_mat in po_materials:
                    mat_name = new_mat.get('material_name')
                    if mat_name in existing_material_names:
                        # Update existing material (replace with new pricing/quantity)
                        existing_materials[existing_material_names[mat_name]] = new_mat
                        materials_updated += 1
                    else:
                        # Add new material
                        existing_materials.append(new_mat)
                        materials_added += 1

                # Recalculate total cost
                new_total_cost = sum(m.get('total_price', 0) for m in existing_materials)

                # Update existing POChild
                existing_po_child.materials_data = existing_materials
                existing_po_child.materials_total_cost = new_total_cost
                existing_po_child.routing_type = routing_type  # Ensure routing_type is set
                existing_po_child.updated_at = datetime.utcnow()

                # Update vendor-specific fields only for vendor routing
                if routing_type == 'vendor':
                    existing_po_child.vendor_selected_by_buyer_id = user_id
                    existing_po_child.vendor_selected_by_buyer_name = user_name
                    # Only set vendor_selection_date if auto-sending notification
                    # This field is used as "sent to TD" indicator by frontend and idempotency check
                    if send_notification:
                        existing_po_child.vendor_selection_date = datetime.utcnow()
                    existing_po_child.vendor_selection_status = 'pending_td_approval'
                    existing_po_child.status = 'pending_td_approval'
                    # Clear any previous rejection
                    existing_po_child.rejection_reason = None
                else:
                    # Store routing
                    existing_po_child.status = 'routed_to_store'

                # Update child_notes if provided
                if child_notes_for_vendor:
                    existing_po_child.child_notes = child_notes_for_vendor

                # Mark JSON field as modified for SQLAlchemy
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(existing_po_child, 'materials_data')

                po_child = existing_po_child
                routing_label = "vendor" if routing_type == 'vendor' else "store"
                log.info(f"Consolidated into POChild {po_child.get_formatted_id()} for {routing_label} routing: {materials_added} added, {materials_updated} updated. Total: {len(existing_materials)} materials, AED {new_total_cost:.2f}")

                created_po_children.append({
                    'id': po_child.id,
                    'formatted_id': po_child.get_formatted_id(),
                    'routing_type': routing_type,
                    'vendor_id': vendor_id,
                    'vendor_name': vendor.company_name if vendor else 'M2 Store',
                    'materials_count': len(existing_materials),
                    'total_cost': new_total_cost,
                    'consolidated': True,
                    'materials_added': materials_added,
                    'materials_updated': materials_updated
                })
            else:
                # Create NEW POChild record
                # Set status and fields based on routing_type
                if routing_type == 'store':
                    # Store routing: No vendor approval needed - bypasses TD entirely
                    po_child_status = 'routed_to_store'
                    vendor_sel_status = 'store_routed'  # Explicitly NOT 'pending_td_approval'
                    log_message = f"Created new POChild {next_suffix_number} for STORE routing"
                else:
                    # Vendor routing: Requires TD approval
                    po_child_status = 'pending_td_approval'
                    vendor_sel_status = 'pending_td_approval'
                    log_message = f"Created new POChild {next_suffix_number} for vendor {vendor.company_name}"

                po_child = POChild(
                    parent_cr_id=parent_cr.cr_id,
                    suffix=f".{next_suffix_number}",
                    boq_id=parent_cr.boq_id,
                    project_id=parent_cr.project_id,
                    item_id=parent_cr.item_id,
                    item_name=parent_cr.item_name,
                    submission_group_id=submission_group_id,
                    materials_data=po_materials,
                    materials_total_cost=total_cost,
                    child_notes=child_notes_for_vendor,  # Copy supplier notes to child_notes column
                    routing_type=routing_type,  # 'store' or 'vendor'
                    vendor_id=vendor_id if routing_type == 'vendor' else None,
                    vendor_name=vendor.company_name if vendor else 'M2 Store',
                    vendor_selected_by_buyer_id=user_id if routing_type == 'vendor' else None,
                    vendor_selected_by_buyer_name=user_name if routing_type == 'vendor' else None,
                    # Only set vendor_selection_date if auto-sending notification
                    # This field serves as "sent to TD" indicator for frontend and idempotency check
                    vendor_selection_date=datetime.utcnow() if (routing_type == 'vendor' and send_notification) else None,
                    vendor_selection_status=vendor_sel_status,
                    status=po_child_status,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )

                db.session.add(po_child)
                db.session.flush()  # Get the id

                # Add to existing map to prevent duplicates in same batch (use routing_type as key for store)
                map_key = vendor_id if routing_type == 'vendor' else f"store_{next_suffix_number}"
                existing_vendor_po_children[map_key] = po_child
                next_suffix_number += 1

                log.info(f"{log_message}, {len(po_materials)} materials, child_notes: {child_notes_for_vendor[:50] if child_notes_for_vendor else 'None'}")

                created_po_children.append({
                    'id': po_child.id,
                    'formatted_id': po_child.get_formatted_id(),
                    'routing_type': routing_type,
                    'vendor_id': vendor_id,
                    'vendor_name': vendor.company_name if vendor else 'M2 Store',
                    'materials_count': len(po_materials),
                    'total_cost': total_cost,
                    'consolidated': False
                })

        # AUTO-CREATE STORE POChild for store-routed materials (if any exist)
        # When buyer sends some materials to store (via "Get from Store") and then selects
        # vendor for remaining materials, the store materials need a POChild too so they
        # remain visible after parent CR becomes split_to_sub_crs
        routed_materials = parent_cr.routed_materials or {}
        store_routed_names = {
            name for name, info in routed_materials.items()
            if isinstance(info, dict) and info.get('routing') == 'store'
        }

        if store_routed_names:
            # Check if a store POChild already exists for this parent CR
            existing_store_po = POChild.query.filter_by(
                parent_cr_id=parent_cr.cr_id,
                routing_type='store',
                is_deleted=False
            ).first()

            if not existing_store_po:
                # Build materials list from parent CR data for the store-routed subset
                all_materials = parent_cr.sub_items_data or parent_cr.materials_data or []
                store_po_materials = []
                store_total_cost = 0.0

                for mat in all_materials:
                    mat_name = mat.get('material_name') or mat.get('name') or ''
                    if mat_name in store_routed_names:
                        quantity = mat.get('quantity', 0)
                        unit_price = mat.get('unit_price', 0)
                        total_price = mat.get('total_price', quantity * unit_price)
                        store_po_materials.append({
                            'material_name': mat_name,
                            'quantity': quantity,
                            'unit': mat.get('unit', ''),
                            'brand': mat.get('brand'),
                            'size': mat.get('size'),
                            'sub_item_name': mat.get('sub_item_name'),
                            'unit_price': unit_price,
                            'total_price': total_price,
                        })
                        store_total_cost += total_price

                if store_po_materials:
                    store_po_child = POChild(
                        parent_cr_id=parent_cr.cr_id,
                        suffix=f".{next_suffix_number}",
                        boq_id=parent_cr.boq_id,
                        project_id=parent_cr.project_id,
                        item_id=parent_cr.item_id,
                        item_name=parent_cr.item_name,
                        submission_group_id=submission_group_id,
                        materials_data=store_po_materials,
                        materials_total_cost=store_total_cost,
                        routing_type='store',
                        vendor_id=None,
                        vendor_name='M2 Store',
                        vendor_selection_status='store_routed',  # Explicitly NOT 'pending_td_approval'
                        status='routed_to_store',
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow()
                    )
                    db.session.add(store_po_child)
                    db.session.flush()
                    next_suffix_number += 1

                    created_po_children.append({
                        'id': store_po_child.id,
                        'formatted_id': store_po_child.get_formatted_id(),
                        'routing_type': 'store',
                        'vendor_id': None,
                        'vendor_name': 'M2 Store',
                        'materials_count': len(store_po_materials),
                        'total_cost': store_total_cost,
                        'consolidated': False
                    })

                    log.info(f"Auto-created store POChild {store_po_child.get_formatted_id()} for CR-{parent_cr.cr_id} with {len(store_po_materials)} store-routed materials")

        # CLEAN ARCHITECTURE: Always hide parent CR when POChildren are created
        # The parent CR becomes just a container - POChildren handle the actual workflow
        # This prevents confusion where parent CR appears/disappears from buyer view
        all_po_children = POChild.query.filter_by(
            parent_cr_id=parent_cr.cr_id,
            is_deleted=False
        ).count()

        if all_po_children > 0:
            # Mark parent as split - it should not appear in buyer's active lists
            parent_cr.status = 'split_to_sub_crs'  # Parent becomes container only
            parent_cr.updated_at = datetime.utcnow()
            log.info(f"Parent CR-{parent_cr.cr_id} marked as 'split_to_sub_crs' - {all_po_children} POChildren exist")

        db.session.commit()

        # Filter POChildren by routing type for different notifications
        vendor_routed_po_children = [pc for pc in created_po_children if pc.get('routing_type') == 'vendor']
        store_routed_po_children = [pc for pc in created_po_children if pc.get('routing_type') == 'store']

        # Send TD notification only if explicitly requested (send_notification=True)
        # The "Confirm & Send to TD" modal flow passes this flag; the batch creation flow does not
        if not is_td and vendor_routed_po_children and send_notification:
            try:
                from models.role import Role
                from utils.notification_utils import NotificationManager
                from socketio_server import send_notification_to_user

                # Use ilike pattern matching to find TD role
                td_role = Role.query.filter(Role.role.ilike('%technical%director%'), Role.is_deleted == False).first()
                if td_role:
                    from models.user import User
                    td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()

                    for td_user in td_users:
                        try:
                            po_child_ids = [pc.get('formatted_id', f"PO-{pc.get('id')}") for pc in vendor_routed_po_children]

                            notification = NotificationManager.create_notification(
                                user_id=td_user.user_id,
                                type='action_required',
                                title='Purchase Order Needs Approval',
                                message=f'{user_name} sent {len(vendor_routed_po_children)} purchase order(s) for vendor approval: {", ".join(po_child_ids)}',
                                priority='high',
                                category='purchase',
                                action_url='/technical-director/change-requests?tab=vendor_approvals&subtab=pending',
                                action_label='Review Purchase Orders',
                                metadata={
                                    'parent_cr_id': str(cr_id),
                                    'po_children_count': len(vendor_routed_po_children),
                                    'po_child_ids': [pc.get('id') for pc in vendor_routed_po_children],
                                    'submission_group_id': submission_group_id,
                                    'target_role': 'technical-director'
                                },
                                sender_id=user_id,
                                sender_name=user_name,
                                target_role='technical-director'
                            )
                            send_notification_to_user(td_user.user_id, notification.to_dict())
                        except Exception as inner_error:
                            log.error(f"Failed to send notification to TD user {td_user.user_id}: {inner_error}")
            except Exception as notif_error:
                log.error(f"Failed to send TD notifications: {notif_error}")

        # Send notification to Production Manager for STORE-routed POChildren
        if store_routed_po_children:
            try:
                from models.role import Role
                from utils.comprehensive_notification_service import notification_service
                pm_role = Role.query.filter_by(role='production_manager').first()
                if pm_role:
                    pms = User.query.filter_by(
                        role_id=pm_role.role_id,
                        is_deleted=False,
                        is_active=True
                    ).all()

                    project_name = parent_cr.project.project_name if parent_cr.project else f'Project {parent_cr.project_id}'
                    po_child_ids = [pc.get('formatted_id', f"PO-{pc.get('id')}") for pc in store_routed_po_children]

                    for pm in pms:
                        notification_service.create_notification(
                            user_id=pm.user_id,
                            title=f"Materials Routed to Store - {project_name}",
                            message=f"{user_name} routed {len(store_routed_po_children)} material group(s) to M2 Store: {', '.join(po_child_ids)}. Awaiting vendor delivery.",
                            type='store_routing',
                            reference_type='po_child',
                            reference_id=store_routed_po_children[0].get('id'),  # First POChild ID
                            action_url='/store/incoming-deliveries'
                        )
                        log.info(f"Notified PM {pm.full_name} about store-routed materials")
            except Exception as pm_notif_error:
                log.error(f"Failed to send PM notification: {pm_notif_error}")

        # Build success message based on routing types
        vendor_count = len(vendor_routed_po_children)
        store_count = len(store_routed_po_children)

        if vendor_count > 0 and store_count > 0:
            message = f"Successfully split materials: {vendor_count} to vendor approval, {store_count} routed to store"
        elif vendor_count > 0:
            message = f"Successfully created {vendor_count} purchase order(s) for vendor approval"
        elif store_count > 0:
            message = f"Successfully routed {store_count} material group(s) to M2 Store"
        else:
            message = f"Successfully created {len(created_po_children)} purchase orders"

        return jsonify({
            "success": True,
            "message": message,
            "parent_cr_id": parent_cr.cr_id,
            "submission_group_id": submission_group_id,
            "po_children": created_po_children,
            "routing_summary": {
                "vendor_routed": vendor_count,
                "store_routed": store_count,
                "total": len(created_po_children)
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to create PO children: {str(e)}"}), 500


def update_purchase_order(cr_id):
    """Update purchase order materials and costs, and optionally material_vendor_selections"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        materials = data.get('materials')
        total_cost = data.get('total_cost')
        material_vendor_selections = data.get('material_vendor_selections')

        # Allow updating ONLY material_vendor_selections without materials/total_cost
        if not materials and total_cost is None and not material_vendor_selections:
            return jsonify({"error": "Materials, total cost, or material_vendor_selections are required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for admin)
        if not is_admin and not is_admin_viewing and cr.assigned_to_buyer_user_id != buyer_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status (can only edit pending purchases)
        # Allow 'assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', and 'sent_to_store' (partial store routing)
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'sent_to_store']
        if cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot edit purchase. Current status: {cr.status}"}), 400

        # Validate and update materials if provided
        if materials is not None:
            if not isinstance(materials, list):
                return jsonify({"error": "Materials must be an array"}), 400

            # Update materials in sub_items_data format
            updated_materials = []
            for material in materials:
                updated_materials.append({
                    "material_name": material.get('material_name', ''),
                    "sub_item_name": material.get('sub_item_name', ''),
                    "quantity": float(material.get('quantity', 0)),
                    "unit": material.get('unit', ''),
                    "unit_price": float(material.get('unit_price', 0)),
                    "total_price": float(material.get('total_price', 0))
                })

            cr.sub_items_data = updated_materials
            cr.materials_total_cost = float(total_cost)

        # Update material_vendor_selections if provided
        if material_vendor_selections is not None:
            from sqlalchemy.orm.attributes import flag_modified
            cr.material_vendor_selections = material_vendor_selections
            flag_modified(cr, 'material_vendor_selections')
            log.info(f"Updated material_vendor_selections for CR {cr_id}: {material_vendor_selections}")

        cr.updated_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Purchase order updated successfully",
            "purchase": {
                "cr_id": cr.cr_id,
                "materials": cr.sub_items_data if materials is not None else cr.sub_items_data or cr.materials_data,
                "total_cost": cr.materials_total_cost,
                "material_vendor_selections": cr.material_vendor_selections or {}
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating purchase order: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update purchase order: {str(e)}"}), 500


def td_approve_vendor(cr_id):
    """TD approves vendor selection for purchase"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify vendor selection is pending approval
        if cr.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {cr.vendor_selection_status}"}), 400

        # Approve the vendor selection
        cr.vendor_selection_status = 'approved'
        cr.vendor_approved_by_td_id = td_id
        cr.vendor_approved_by_td_name = td_name
        cr.vendor_approval_date = datetime.utcnow()

        # FIX: Update CR status to vendor_approved so buyer can complete purchase
        cr.status = 'vendor_approved'

        cr.updated_at = datetime.utcnow()

        # Add to BOQ History - TD Vendor Approval
        from models.boq import BOQHistory
        from sqlalchemy.orm.attributes import flag_modified

        existing_history = BOQHistory.query.filter_by(boq_id=cr.boq_id).order_by(BOQHistory.action_date.desc()).first()

        if existing_history:
            if existing_history.action is None:
                current_actions = []
            elif isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        new_action = {
            "role": "technical_director",
            "type": "change_request_vendor_approved_by_td",
            "sender": td_name,
            "receiver": cr.vendor_selected_by_buyer_name or "Buyer",
            "sender_role": "technical_director",
            "receiver_role": "buyer",
            "status": cr.status,
            "cr_id": cr_id,
            "item_name": cr.item_name or f"CR #{cr_id}",
            "materials_count": len(cr.materials_data) if cr.materials_data else 0,
            "total_cost": cr.materials_total_cost,
            "vendor_id": cr.selected_vendor_id,
            "vendor_name": cr.selected_vendor_name,
            "vendor_selection_status": "approved",
            "comments": f"TD approved vendor selection: '{cr.selected_vendor_name}'. Buyer can proceed with purchase.",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": td_name,
            "sender_user_id": td_id,
            "project_name": cr.project.project_name if cr.project else None,
            "project_id": cr.project_id
        }

        current_actions.append(new_action)

        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = td_name
            existing_history.sender = td_name
            existing_history.receiver = cr.vendor_selected_by_buyer_name or "Buyer"
            existing_history.comments = f"CR #{cr_id} vendor approved by TD"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = td_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=cr.boq_id,
                action=current_actions,
                action_by=td_name,
                boq_status=cr.boq.status if cr.boq else 'unknown',
                sender=td_name,
                receiver=cr.vendor_selected_by_buyer_name or "Buyer",
                comments=f"CR #{cr_id} vendor approved by TD",
                sender_role='technical_director',
                receiver_role='buyer',
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Send notification to buyer about vendor approval
        # Send to the buyer who selected the vendor, not necessarily the CR creator
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            # Prefer vendor_selected_by_buyer_id, fall back to created_by
            buyer_to_notify = cr.vendor_selected_by_buyer_id or cr.created_by
            if buyer_to_notify:
                notification = NotificationManager.create_notification(
                    user_id=buyer_to_notify,
                    type='approval',
                    title='Vendor Selection Approved',
                    message=f'TD approved vendor "{cr.selected_vendor_name}" for materials purchase: {cr.item_name or "Materials Request"}',
                    priority='high',
                    category='vendor',
                    action_url=f'/buyer/purchase-orders?cr_id={cr_id}',
                    action_label='Proceed with Purchase',
                    metadata={
                        'cr_id': str(cr_id),
                        'vendor_name': cr.selected_vendor_name,
                        'vendor_id': str(cr.selected_vendor_id) if cr.selected_vendor_id else None,
                        'item_name': cr.item_name
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(buyer_to_notify, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor approval notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection approved successfully",
            "purchase": {
                "cr_id": cr.cr_id,
                "vendor_selection_status": cr.vendor_selection_status,
                "vendor_approved_by_td_id": cr.vendor_approved_by_td_id,
                "vendor_approved_by_td_name": cr.vendor_approved_by_td_name,
                "vendor_approval_date": cr.vendor_approval_date.isoformat()
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to approve vendor: {str(e)}"}), 500


def td_reject_vendor(cr_id):
    """TD rejects vendor selection for purchase"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        data = request.get_json()
        reason = data.get('reason', '')

        if not reason:
            return jsonify({"error": "Rejection reason is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify vendor selection is pending approval
        if cr.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {cr.vendor_selection_status}"}), 400

        # Reject the vendor selection - clear vendor and allow buyer to select again
        cr.vendor_selection_status = 'rejected'
        cr.vendor_approved_by_td_id = td_id
        cr.vendor_approved_by_td_name = td_name
        cr.vendor_approval_date = datetime.utcnow()
        cr.vendor_rejection_reason = reason

        # Clear vendor selection so buyer can select new vendor
        cr.selected_vendor_id = None
        cr.selected_vendor_name = None
        cr.vendor_selected_by_buyer_id = None
        cr.vendor_selected_by_buyer_name = None
        cr.vendor_selection_date = None

        cr.updated_at = datetime.utcnow()

        db.session.commit()

        # Send notification to buyer about vendor rejection
        # Send to the buyer who selected the vendor, not necessarily the CR creator
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            # Prefer vendor_selected_by_buyer_id, fall back to created_by
            buyer_to_notify = cr.vendor_selected_by_buyer_id or cr.created_by
            if buyer_to_notify:
                notification = NotificationManager.create_notification(
                    user_id=buyer_to_notify,
                    type='rejection',
                    title='Vendor Selection Rejected',
                    message=f'TD rejected vendor selection for materials purchase: {cr.item_name or "Materials Request"}. Reason: {reason}',
                    priority='high',
                    category='vendor',
                    action_required=True,
                    action_url=f'/buyer/purchase-orders?cr_id={cr_id}',
                    action_label='Select New Vendor',
                    metadata={
                        'cr_id': str(cr_id),
                        'rejection_reason': reason,
                        'item_name': cr.item_name
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(buyer_to_notify, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor rejection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection rejected",
            "purchase": {
                "cr_id": cr.cr_id,
                "vendor_selection_status": cr.vendor_selection_status,
                "vendor_rejection_reason": cr.vendor_rejection_reason
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to reject vendor: {str(e)}"}), 500


def get_vendor_selection_data(cr_id):
    """
    Optimized endpoint for vendor selection modal
    Returns only essential fields (78% smaller payload)

    GET /api/buyer/purchase/{cr_id}/vendor-selection

    Returns:
    - cr_id, boq_id, project_id
    - materials list (from sub_items_data)
    - vendor selection details
    - overhead warning (if applicable)
    - per-material vendor selections (if enabled)
    """
    try:
        current_user = g.user
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')

        # Allow buyer, estimator, TD, or admin
        if not any(role in user_role for role in ['buyer', 'estimator', 'technicaldirector', 'admin']):
            return jsonify({"error": "Access denied. Buyer, Estimator, TD, or Admin role required."}), 403

        # Get change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase order not found"}), 404

        # Get project and BOQ info
        project = Project.query.filter_by(project_id=cr.project_id).first()
        boq = BOQ.query.filter_by(boq_id=cr.boq_id).first()

        # Prepare materials list (use sub_items_data, NOT materials_data)
        all_materials = cr.sub_items_data if cr.sub_items_data else cr.materials_data

        # FIX: Filter out materials that have already been routed to store or vendor
        routed_materials = cr.routed_materials or {}
        materials = [
            mat for mat in (all_materials or [])
            if (mat.get('material_name') or mat.get('name') or '') not in routed_materials
        ]

        # Calculate materials count (only unrouted materials)
        materials_count = len(materials) if materials else 0

        # Validate and refresh material_vendor_selections with current vendor data
        # This ensures deleted vendors are removed and vendor names are up-to-date
        validated_material_vendor_selections = {}
        if cr.material_vendor_selections:
            from models.vendor import Vendor
            # Get all unique vendor IDs from selections
            vendor_ids = set()
            for selection in cr.material_vendor_selections.values():
                if isinstance(selection, dict) and selection.get('vendor_id'):
                    vendor_ids.add(selection.get('vendor_id'))

            # Fetch all referenced vendors in one query
            active_vendors = {
                v.vendor_id: v for v in Vendor.query.filter(
                    Vendor.vendor_id.in_(vendor_ids),
                    Vendor.is_deleted == False
                ).all()
            } if vendor_ids else {}

            # Validate each selection
            for material_name, selection in cr.material_vendor_selections.items():
                if isinstance(selection, dict) and selection.get('vendor_id'):
                    vendor_id = selection.get('vendor_id')
                    if vendor_id in active_vendors:
                        # Vendor exists - refresh vendor_name with current value
                        validated_selection = dict(selection)
                        validated_selection['vendor_name'] = active_vendors[vendor_id].company_name
                        validated_material_vendor_selections[material_name] = validated_selection
                    # If vendor doesn't exist (deleted), skip this selection
                else:
                    # Selection without vendor_id (just negotiated price) - keep it
                    validated_material_vendor_selections[material_name] = selection

        # Prepare vendor selection data
        vendor_data = {
            'selected_vendor_id': cr.selected_vendor_id,
            'selected_vendor_name': cr.selected_vendor_name,
            'vendor_selection_status': cr.vendor_selection_status,
            'vendor_selected_by_buyer_id': cr.vendor_selected_by_buyer_id,
            'vendor_selected_by_buyer_name': cr.vendor_selected_by_buyer_name,
            'vendor_selection_date': cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None,
            'vendor_approved_by_td_id': cr.vendor_approved_by_td_id,
            'vendor_approved_by_td_name': cr.vendor_approved_by_td_name,
            'vendor_approval_date': cr.vendor_approval_date.isoformat() if cr.vendor_approval_date else None,
            'vendor_rejection_reason': cr.vendor_rejection_reason,
            # Per-material vendor selection support
            'use_per_material_vendors': cr.use_per_material_vendors,
            'material_vendor_selections': validated_material_vendor_selections
        }

        # Overhead warning removed - columns dropped from database
        overhead_warning = None

        # Return optimized response (only 18-20 fields instead of 82)
        return jsonify({
            'success': True,
            # Core identifiers
            'cr_id': cr.cr_id,
            'boq_id': cr.boq_id,
            'project_id': cr.project_id,
            'status': cr.status,
            # Display info
            'project_name': project.project_name if project else None,
            'boq_name': boq.boq_name if boq else None,
            'item_name': cr.item_name,
            'item_id': cr.item_id,
            # Materials (from sub_items_data)
            'materials': materials,
            'materials_count': materials_count,
            'total_cost': round(cr.materials_total_cost, 2) if cr.materials_total_cost else 0,
            # Vendor selection
            'vendor': vendor_data,
            # Overhead warning (only if applicable)
            'overhead_warning': overhead_warning,
            # Metadata
            'created_at': cr.created_at.isoformat() if cr.created_at else None
        }), 200

    except Exception as e:
        log.error(f"Error getting vendor selection data for CR {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to get vendor selection data: {str(e)}"}), 500


def update_vendor_price(vendor_id):
    """
    Update vendor product price (immediate price negotiation).
    Supports two modes:
    1. Save for This BOQ: Updates material_vendor_selections for the CR
    2. Save for Future: Updates vendor_products.unit_price in database
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        material_name = data.get('material_name')
        new_price = data.get('new_price')
        save_for_future = data.get('save_for_future', False)
        cr_id = data.get('cr_id')  # Optional: CR to save negotiated price to

        if not material_name or new_price is None:
            return jsonify({"error": "material_name and new_price are required"}), 400

        # Validate new_price
        try:
            new_price = float(new_price)
            if new_price <= 0:
                return jsonify({"error": "Price must be greater than 0"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid price format"}), 400

        # Verify vendor exists
        from models.vendor import Vendor, VendorProduct
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Check role-based permissions (Buyer, TD, or Admin)
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_buyer = user_role == 'buyer'
        is_admin = user_role == 'admin'

        if not (is_buyer or is_td or is_admin):
            return jsonify({"error": "Insufficient permissions"}), 403

        updated_products = []

        # Update vendor product prices if save_for_future=true
        if save_for_future:
            material_lower = material_name.lower().strip()
            products = VendorProduct.query.filter_by(
                vendor_id=vendor_id,
                is_deleted=False
            ).all()

            # Find matching products
            matching_products = []
            for product in products:
                product_name = (product.product_name or '').lower().strip()
                # Exact match or contains match
                if product_name == material_lower or material_lower in product_name or product_name in material_lower:
                    matching_products.append(product)

            # Update unit_price for all matching products
            if matching_products:
                for product in matching_products:
                    old_price = product.unit_price
                    product.unit_price = new_price
                    updated_products.append({
                        'product_id': product.product_id,
                        'product_name': product.product_name,
                        'old_price': old_price,
                        'new_price': new_price
                    })

                db.session.flush()
            else:
                log.warning(f"No matching products found for material '{material_name}' from vendor {vendor_id}")

        # If cr_id provided, save negotiated price to the change request
        if cr_id:
            cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
            if cr:
                # Initialize material_vendor_selections if it doesn't exist
                if not cr.material_vendor_selections:
                    cr.material_vendor_selections = {}

                # Update or create material vendor selection with negotiated price
                if material_name in cr.material_vendor_selections:
                    # Update existing selection
                    cr.material_vendor_selections[material_name]['negotiated_price'] = new_price
                    cr.material_vendor_selections[material_name]['save_price_for_future'] = save_for_future
                else:
                    # Create new selection (for cases where price is negotiated before vendor selection)
                    cr.material_vendor_selections[material_name] = {
                        'vendor_id': vendor_id,
                        'vendor_name': vendor.company_name,
                        'negotiated_price': new_price,
                        'save_price_for_future': save_for_future,
                        'selected_by_user_id': user_id,
                        'selected_by_name': current_user.get('full_name', 'Unknown User'),
                        'selection_date': datetime.utcnow().isoformat()
                    }

                # Mark the JSONB field as modified
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(cr, 'material_vendor_selections')

                cr.updated_at = datetime.utcnow()

        db.session.commit()

        # Prepare response message
        if save_for_future and updated_products:
            message = f"Price updated to AED {new_price:.2f} for {len(updated_products)} product(s). This price will be used for all future purchases."
        elif save_for_future and not updated_products:
            message = f"Price saved for this purchase (AED {new_price:.2f}). No matching products found to update for future."
        else:
            message = f"Negotiated price AED {new_price:.2f} saved for this purchase only."

        return jsonify({
            "success": True,
            "message": message,
            "vendor_id": vendor_id,
            "material_name": material_name,
            "new_price": new_price,
            "save_for_future": save_for_future,
            "updated_products": updated_products if save_for_future else [],
            "cr_id": cr_id
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating vendor price: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update vendor price: {str(e)}"}), 500


def send_po_children_for_approval(cr_id):
    """
    Manually send vendor-routed PO children for TD approval.
    This is called AFTER create_po_children to give the buyer control over when
    the TD notification is sent. Only vendor-routed PO children are sent for approval.
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json() or {}
        po_child_ids = data.get('po_child_ids')  # Optional: specific PO child IDs to send

        # Get parent CR
        parent_cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not parent_cr:
            return jsonify({"error": "Parent purchase not found"}), 404

        # Check permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        assigned_buyer_id = int(parent_cr.assigned_to_buyer_user_id or 0)
        current_user_id = int(user_id)
        if not is_td and not is_admin and not is_admin_viewing and assigned_buyer_id != current_user_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Get vendor-routed PO children for this CR
        query = POChild.query.filter_by(
            parent_cr_id=cr_id,
            routing_type='vendor',
            is_deleted=False
        )

        if po_child_ids:
            query = query.filter(POChild.id.in_(po_child_ids))

        vendor_po_children = query.filter(
            POChild.status == 'pending_td_approval'
        ).all()

        if not vendor_po_children:
            return jsonify({"error": "No vendor PO children pending approval found"}), 404

        # Idempotency: Skip PO children that already had notification sent
        # Use vendor_selection_date as a proxy (it gets updated on send)
        unsent_po_children = []
        already_sent = []
        for pc in vendor_po_children:
            # Check if notification was already sent (vendor_selection_date set by this function)
            if pc.vendor_selection_date and pc.vendor_selected_by_buyer_id:
                already_sent.append(pc)
            else:
                unsent_po_children.append(pc)

        if not unsent_po_children and already_sent:
            po_child_formatted_ids = [pc.get_formatted_id() for pc in already_sent]
            return jsonify({
                "success": True,
                "message": f"Already sent for approval: {', '.join(po_child_formatted_ids)}",
                "po_children_sent": 0,
                "po_child_ids": [pc.id for pc in already_sent],
                "already_sent": True
            }), 200

        # Mark PO children as sent (update tracking fields)
        for pc in unsent_po_children:
            pc.vendor_selected_by_buyer_id = user_id
            pc.vendor_selected_by_buyer_name = user_name
            pc.vendor_selection_date = datetime.utcnow()
        db.session.commit()

        vendor_po_children = unsent_po_children

        # Send notifications to TD
        try:
            from models.role import Role
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            td_role = Role.query.filter(Role.role.ilike('%technical%director%'), Role.is_deleted == False).first()
            if td_role:
                from models.user import User
                td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()

                for td_user in td_users:
                    try:
                        po_child_formatted_ids = [pc.get_formatted_id() for pc in vendor_po_children]

                        notification = NotificationManager.create_notification(
                            user_id=td_user.user_id,
                            type='action_required',
                            title='Purchase Order Needs Approval',
                            message=f'{user_name} sent {len(vendor_po_children)} purchase order(s) for vendor approval: {", ".join(po_child_formatted_ids)}',
                            priority='high',
                            category='purchase',
                            action_url='/technical-director/change-requests?tab=vendor_approvals&subtab=pending',
                            action_label='Review Purchase Orders',
                            metadata={
                                'parent_cr_id': str(cr_id),
                                'po_children_count': len(vendor_po_children),
                                'po_child_ids': [pc.id for pc in vendor_po_children],
                                'target_role': 'technical-director'
                            },
                            sender_id=user_id,
                            sender_name=user_name,
                            target_role='technical-director'
                        )
                        send_notification_to_user(td_user.user_id, notification.to_dict())
                    except Exception as inner_error:
                        log.error(f"Failed to send notification to TD user {td_user.user_id}: {inner_error}")
        except Exception as notif_error:
            log.error(f"Failed to send TD notifications: {notif_error}")

        po_child_formatted_ids = [pc.get_formatted_id() for pc in vendor_po_children]
        return jsonify({
            "success": True,
            "message": f"Sent {len(vendor_po_children)} purchase order(s) for TD approval: {', '.join(po_child_formatted_ids)}",
            "po_children_sent": len(vendor_po_children),
            "po_child_ids": [pc.id for pc in vendor_po_children]
        }), 200

    except Exception as e:
        log.error(f"Error sending PO children for approval: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to send for approval: {str(e)}"}), 500


def save_supplier_notes(cr_id):
    """
    Save supplier notes for a specific material and vendor in CR's material_vendor_selections.
    This allows buyers to add notes immediately without waiting to create POChild.
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        material_name = data.get('material_name')
        vendor_id = data.get('vendor_id')
        supplier_notes = data.get('supplier_notes', '')

        if not material_name:
            return jsonify({"error": "material_name is required"}), 400

        # Validate supplier_notes
        if supplier_notes:
            supplier_notes = supplier_notes.strip()
            # Enforce length limit (5000 characters)
            if len(supplier_notes) > 5000:
                return jsonify({"error": "Supplier notes exceed maximum length of 5000 characters"}), 400
            # Basic content validation (no control characters except newlines/tabs)
            if any(ord(c) < 32 and c not in '\n\r\t' for c in supplier_notes):
                return jsonify({"error": "Supplier notes contain invalid characters"}), 400
            # Set to empty string if only whitespace
            if not supplier_notes:
                supplier_notes = ''

        # Get the change request
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check role-based permissions (Buyer, TD, or Admin)
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_buyer = user_role == 'buyer'
        is_admin = user_role == 'admin'

        if not (is_buyer or is_td or is_admin):
            return jsonify({"error": "Insufficient permissions"}), 403

        # Initialize material_vendor_selections if it doesn't exist
        if not cr.material_vendor_selections:
            cr.material_vendor_selections = {}

        # Update or create material vendor selection with supplier notes
        if material_name in cr.material_vendor_selections:
            # Update existing selection
            cr.material_vendor_selections[material_name]['supplier_notes'] = supplier_notes
        else:
            # Create new selection with notes only (vendor may be selected later)
            cr.material_vendor_selections[material_name] = {
                'supplier_notes': supplier_notes,
                'selected_by_user_id': user_id,
                'selected_by_name': current_user.get('full_name', 'Unknown User'),
                'selection_date': datetime.utcnow().isoformat()
            }
            # Add vendor info if provided
            if vendor_id:
                from models.vendor import Vendor
                vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
                if vendor:
                    cr.material_vendor_selections[material_name]['vendor_id'] = vendor_id
                    cr.material_vendor_selections[material_name]['vendor_name'] = vendor.company_name

        # Mark the JSONB field as modified
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(cr, 'material_vendor_selections')

        cr.updated_at = datetime.utcnow()

        # Update POChild child_notes column directly
        # Find POChild by parent_cr_id and vendor_id OR by material_name in materials_data
        from models.po_child import POChild

        po_child_updated = None
        po_child = None

        # Method 1: Find by vendor_id
        if vendor_id:
            # Convert vendor_id to int for consistent comparison
            vendor_id_int = int(vendor_id)

            po_child = POChild.query.filter_by(
                parent_cr_id=cr_id,
                vendor_id=vendor_id_int,
                is_deleted=False
            ).first()

            log.info(f"Looking for POChild with parent_cr_id={cr_id}, vendor_id={vendor_id_int}, found: {po_child}")

        # Method 2: If not found by vendor_id, find by material_name in materials_data
        if not po_child and material_name:
            # Find all POChildren for this CR and check if any has this material
            all_po_children = POChild.query.filter_by(
                parent_cr_id=cr_id,
                is_deleted=False
            ).all()

            for pc in all_po_children:
                if pc.materials_data:
                    for mat in pc.materials_data:
                        if mat.get('material_name') == material_name:
                            po_child = pc
                            log.info(f"Found POChild {pc.id} by material_name '{material_name}'")
                            break
                    if po_child:
                        break

        if po_child:
            # Store notes in child_notes column
            # If there are existing notes, append the new note with material name prefix
            if po_child.child_notes and supplier_notes:
                # Check if this material's note already exists (avoid duplicates)
                material_prefix = f"[{material_name}]: "
                if material_prefix not in po_child.child_notes:
                    # Append new note with material name prefix
                    po_child.child_notes = f"{po_child.child_notes}\n\n{material_prefix}{supplier_notes}"
                else:
                    # Update existing note for this material
                    lines = po_child.child_notes.split('\n\n')
                    updated_lines = []
                    found = False
                    for line in lines:
                        if line.startswith(material_prefix):
                            updated_lines.append(f"{material_prefix}{supplier_notes}")
                            found = True
                        else:
                            updated_lines.append(line)
                    if not found:
                        updated_lines.append(f"{material_prefix}{supplier_notes}")
                    po_child.child_notes = '\n\n'.join(updated_lines)
            elif supplier_notes:
                # First note for this POChild - add with material name prefix
                po_child.child_notes = f"[{material_name}]: {supplier_notes}"

            po_child.updated_at = datetime.utcnow()
            po_child_updated = po_child.id
            log.info(f"Updated child_notes for POChild {po_child.id}: {po_child.child_notes[:100] if po_child.child_notes else 'empty'}")
        else:
            log.warning(f"No POChild found for CR {cr_id} with vendor_id={vendor_id} or material_name={material_name}")

        db.session.commit()

        log.info(f"Supplier notes saved for material '{material_name}' in CR {cr_id} by user {user_id}. POChild updated: {po_child_updated}")

        return jsonify({
            "success": True,
            "message": "Supplier notes saved successfully",
            "cr_id": cr_id,
            "material_name": material_name,
            "supplier_notes": supplier_notes,
            "po_child_id": po_child_updated
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error saving supplier notes: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to save supplier notes: {str(e)}"}), 500
