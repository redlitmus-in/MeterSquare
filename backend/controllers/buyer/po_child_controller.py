from flask import request, jsonify, g
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import or_, and_, func, desc
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails
from models.change_request import ChangeRequest
from models.po_child import POChild
from models.user import User
from models.vendor import Vendor
from models.inventory import *
from config.logging import get_logger
from datetime import datetime, timedelta
import json

log = get_logger()

__all__ = [
    'update_po_child_prices', 'update_purchase_prices',
    'td_approve_po_child', 'td_reject_po_child',
    'reselect_vendor_for_po_child', 'get_project_site_engineers',
    'complete_po_child_purchase', 'get_pending_po_children',
    'get_rejected_po_children', 'get_buyer_pending_po_children',
    'get_approved_po_children',
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


def update_po_child_prices(po_child_id):
    """
    Update negotiated prices for POChild materials
    Allows buyer to edit prices based on vendor negotiation
    Returns original and negotiated prices for diff display
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')

        data = request.get_json()
        materials_updates = data.get('materials')  # Array of {material_name, negotiated_price}

        if not materials_updates or not isinstance(materials_updates, list):
            return jsonify({"error": "materials array is required"}), 400

        # Get the POChild with eager loading
        po_child = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(id=po_child_id, is_deleted=False).first()
        if not po_child:
            return jsonify({"error": "Purchase order not found"}), 404

        # Verify POChild is approved (vendor_approved status) - buyer can edit prices after TD approval
        if po_child.status not in ['vendor_approved', 'pending_td_approval']:
            return jsonify({"error": "Can only edit prices for approved purchase orders"}), 400

        # Get current materials_data
        materials_data = po_child.materials_data or []
        if not materials_data:
            return jsonify({"error": "No materials found in this purchase order"}), 400

        # Create a lookup map for updates
        updates_map = {update['material_name']: update for update in materials_updates}

        # Update materials with negotiated prices
        updated_materials = []
        new_total_cost = 0

        for material in materials_data:
            material_name = material.get('material_name', '')
            original_price = material.get('original_unit_price') or material.get('unit_price', 0)
            quantity = material.get('quantity', 0)

            # Store original price if not already stored
            if 'original_unit_price' not in material:
                material['original_unit_price'] = original_price

            # Check if there's an update for this material
            if material_name in updates_map:
                update = updates_map[material_name]
                negotiated_price = update.get('negotiated_price')

                if negotiated_price is not None and negotiated_price > 0:
                    material['negotiated_price'] = float(negotiated_price)
                    material['unit_price'] = float(negotiated_price)  # Update unit_price to negotiated
                    material['total_price'] = float(quantity) * float(negotiated_price)
                    material['price_updated_by'] = user_name
                    material['price_updated_at'] = datetime.utcnow().isoformat()
                else:
                    # Clear negotiated price if set to null/0
                    material.pop('negotiated_price', None)
                    material['unit_price'] = float(original_price)
                    material['total_price'] = float(quantity) * float(original_price)
            else:
                # No update for this material, recalculate with current price
                current_price = material.get('negotiated_price') or material.get('unit_price', 0)
                material['total_price'] = float(quantity) * float(current_price)

            new_total_cost += material.get('total_price', 0)
            updated_materials.append(material)

        # Update POChild with new materials_data and total
        from sqlalchemy.orm.attributes import flag_modified
        po_child.materials_data = updated_materials
        flag_modified(po_child, 'materials_data')
        po_child.materials_total_cost = new_total_cost
        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Prepare response with price diff information
        materials_response = []
        for material in updated_materials:
            original_price = material.get('original_unit_price', 0)
            negotiated_price = material.get('negotiated_price')
            current_price = negotiated_price if negotiated_price else original_price
            price_diff = float(current_price) - float(original_price) if negotiated_price else 0

            materials_response.append({
                'material_name': material.get('material_name', ''),
                'quantity': material.get('quantity', 0),
                'unit': material.get('unit', ''),
                'original_unit_price': original_price,
                'negotiated_price': negotiated_price,
                'unit_price': current_price,
                'total_price': material.get('total_price', 0),
                'price_diff': price_diff,
                'price_diff_percentage': round((price_diff / float(original_price)) * 100, 2) if original_price else 0,
                'price_updated_by': material.get('price_updated_by'),
                'price_updated_at': material.get('price_updated_at')
            })

        return jsonify({
            "success": True,
            "message": "Prices updated successfully",
            "po_child_id": po_child_id,
            "formatted_id": po_child.get_formatted_id(),
            "materials": materials_response,
            "original_total": sum(m.get('original_unit_price', 0) * m.get('quantity', 0) for m in updated_materials),
            "new_total": new_total_cost,
            "total_diff": new_total_cost - sum(m.get('original_unit_price', 0) * m.get('quantity', 0) for m in updated_materials)
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating POChild prices: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update prices: {str(e)}"}), 500


def update_purchase_prices(cr_id):
    """
    Update negotiated prices for Purchase (Change Request) materials
    Allows buyer to edit prices based on vendor negotiation before sending for TD approval
    Returns original and negotiated prices for diff display
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')

        data = request.get_json()
        materials_updates = data.get('materials')  # Array of {material_name, negotiated_price}

        if not materials_updates or not isinstance(materials_updates, list):
            return jsonify({"error": "materials array is required"}), 400

        # Get the Change Request
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify CR is in appropriate status for price editing
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'pending']
        if cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot edit prices for purchase with status: {cr.status}"}), 400

        # Get current materials data
        materials_data = cr.sub_items_data or cr.materials_data or []
        if not materials_data:
            return jsonify({"error": "No materials found in this purchase"}), 400

        # Create a lookup map for updates
        updates_map = {update['material_name']: update for update in materials_updates}

        # Update material_vendor_selections to store negotiated prices
        # This is where process_materials_with_negotiated_prices looks for them
        material_vendor_selections = cr.material_vendor_selections or {}
        for update in materials_updates:
            material_name = update['material_name']
            negotiated_price = update.get('negotiated_price')

            if material_name not in material_vendor_selections:
                material_vendor_selections[material_name] = {}

            if negotiated_price is not None and negotiated_price > 0:
                material_vendor_selections[material_name]['negotiated_price'] = float(negotiated_price)
                material_vendor_selections[material_name]['price_updated_by'] = user_name
                material_vendor_selections[material_name]['price_updated_at'] = datetime.utcnow().isoformat()
            else:
                # Clear negotiated price
                material_vendor_selections[material_name].pop('negotiated_price', None)
                material_vendor_selections[material_name].pop('price_updated_by', None)
                material_vendor_selections[material_name].pop('price_updated_at', None)

        # Update materials with negotiated prices
        updated_materials = []
        new_total_cost = 0

        for material in materials_data:
            # Handle nested materials structure
            if isinstance(material, dict) and 'materials' in material:
                sub_materials = material.get('materials', [])
                updated_sub_materials = []
                for sub_mat in sub_materials:
                    material_name = sub_mat.get('material_name', '')
                    original_price = sub_mat.get('original_unit_price') or sub_mat.get('unit_price', 0)
                    quantity = sub_mat.get('quantity', 0)

                    # Store original price if not already stored
                    if 'original_unit_price' not in sub_mat:
                        sub_mat['original_unit_price'] = original_price

                    # Check if there's an update for this material
                    if material_name in updates_map:
                        update = updates_map[material_name]
                        negotiated_price = update.get('negotiated_price')

                        if negotiated_price is not None and negotiated_price > 0:
                            sub_mat['negotiated_price'] = float(negotiated_price)
                            sub_mat['unit_price'] = float(negotiated_price)
                            sub_mat['total_price'] = float(quantity) * float(negotiated_price)
                            sub_mat['price_updated_by'] = user_name
                            sub_mat['price_updated_at'] = datetime.utcnow().isoformat()
                        else:
                            # Clear negotiated price if set to null/0
                            sub_mat.pop('negotiated_price', None)
                            sub_mat['unit_price'] = float(original_price)
                            sub_mat['total_price'] = float(quantity) * float(original_price)
                    else:
                        current_price = sub_mat.get('negotiated_price') or sub_mat.get('unit_price', 0)
                        sub_mat['total_price'] = float(quantity) * float(current_price)

                    new_total_cost += sub_mat.get('total_price', 0)
                    updated_sub_materials.append(sub_mat)

                material['materials'] = updated_sub_materials
                updated_materials.append(material)
            else:
                # Direct material (not nested)
                material_name = material.get('material_name', '')
                original_price = material.get('original_unit_price') or material.get('unit_price', 0)
                quantity = material.get('quantity', 0)

                # Store original price if not already stored
                if 'original_unit_price' not in material:
                    material['original_unit_price'] = original_price

                # Check if there's an update for this material
                if material_name in updates_map:
                    update = updates_map[material_name]
                    negotiated_price = update.get('negotiated_price')

                    if negotiated_price is not None and negotiated_price > 0:
                        material['negotiated_price'] = float(negotiated_price)
                        material['unit_price'] = float(negotiated_price)
                        material['total_price'] = float(quantity) * float(negotiated_price)
                        material['price_updated_by'] = user_name
                        material['price_updated_at'] = datetime.utcnow().isoformat()
                    else:
                        # Clear negotiated price if set to null/0
                        material.pop('negotiated_price', None)
                        material['unit_price'] = float(original_price)
                        material['total_price'] = float(quantity) * float(original_price)
                else:
                    current_price = material.get('negotiated_price') or material.get('unit_price', 0)
                    material['total_price'] = float(quantity) * float(current_price)

                new_total_cost += material.get('total_price', 0)
                updated_materials.append(material)

        # Update CR with new materials data and material_vendor_selections
        from sqlalchemy.orm.attributes import flag_modified
        if cr.sub_items_data:
            cr.sub_items_data = updated_materials
            flag_modified(cr, 'sub_items_data')
        else:
            cr.materials_data = updated_materials
            flag_modified(cr, 'materials_data')

        # Save material_vendor_selections (where negotiated prices are stored for the API)
        cr.material_vendor_selections = material_vendor_selections
        flag_modified(cr, 'material_vendor_selections')

        cr.updated_at = datetime.utcnow()
        db.session.commit()

        # Prepare response with price diff information
        materials_response = []

        def extract_materials_for_response(mats, vendor_selections):
            result = []
            for mat in mats:
                if isinstance(mat, dict) and 'materials' in mat:
                    result.extend(extract_materials_for_response(mat['materials'], vendor_selections))
                else:
                    material_name = mat.get('material_name', '')
                    original_price = mat.get('original_unit_price') or mat.get('unit_price', 0)

                    # Get negotiated price from material_vendor_selections
                    vendor_sel = vendor_selections.get(material_name, {})
                    negotiated_price = vendor_sel.get('negotiated_price')
                    price_updated_by = vendor_sel.get('price_updated_by')
                    price_updated_at = vendor_sel.get('price_updated_at')

                    current_price = negotiated_price if negotiated_price else original_price
                    price_diff = float(current_price) - float(original_price) if negotiated_price else 0

                    result.append({
                        'material_name': material_name,
                        'quantity': mat.get('quantity', 0),
                        'unit': mat.get('unit', ''),
                        'original_unit_price': original_price,
                        'negotiated_price': negotiated_price,
                        'unit_price': current_price,
                        'total_price': float(mat.get('quantity', 0)) * float(current_price),
                        'price_diff': price_diff,
                        'price_diff_percentage': round((price_diff / float(original_price)) * 100, 2) if original_price else 0,
                        'price_updated_by': price_updated_by,
                        'price_updated_at': price_updated_at
                    })
            return result

        materials_response = extract_materials_for_response(updated_materials, material_vendor_selections)

        original_total = sum(m.get('original_unit_price', 0) * m.get('quantity', 0) for m in materials_response)
        negotiated_total = sum(m.get('total_price', 0) for m in materials_response)

        return jsonify({
            "success": True,
            "message": "Prices updated successfully",
            "cr_id": cr_id,
            "materials": materials_response,
            "original_total": original_total,
            "new_total": negotiated_total,
            "total_diff": negotiated_total - original_total
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating Purchase prices: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update prices: {str(e)}"}), 500


def td_approve_po_child(po_child_id):
    """TD approves vendor selection for POChild"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        # Get the PO child with eager loading
        po_child = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Verify vendor selection is pending approval
        if po_child.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {po_child.vendor_selection_status}"}), 400

        # Approve the vendor selection
        po_child.vendor_selection_status = 'approved'
        po_child.status = 'vendor_approved'
        po_child.vendor_approved_by_td_id = td_id
        po_child.vendor_approved_by_td_name = td_name
        po_child.vendor_approval_date = datetime.utcnow()
        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Send notification to buyer about vendor approval
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            if po_child.vendor_selected_by_buyer_id:
                notification = NotificationManager.create_notification(
                    user_id=po_child.vendor_selected_by_buyer_id,
                    type='approval',
                    title='Vendor Selection Approved',
                    message=f'TD approved vendor "{po_child.vendor_name}" for {po_child.get_formatted_id()}',
                    priority='high',
                    category='vendor',
                    action_url=f'/buyer/purchase-orders?po_child_id={po_child_id}',
                    action_label='Proceed with Purchase',
                    metadata={
                        'po_child_id': str(po_child_id),
                        'vendor_name': po_child.vendor_name,
                        'vendor_id': str(po_child.vendor_id) if po_child.vendor_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(po_child.vendor_selected_by_buyer_id, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor approval notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection approved successfully",
            "po_child": po_child.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving PO child vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to approve vendor: {str(e)}"}), 500


def td_reject_po_child(po_child_id):
    """TD rejects vendor selection for POChild"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        data = request.get_json()
        reason = data.get('reason', '')

        if not reason:
            return jsonify({"error": "Rejection reason is required"}), 400

        # Get the PO child with eager loading
        po_child = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Verify vendor selection is pending approval
        if po_child.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {po_child.vendor_selection_status}"}), 400

        # Store buyer info before clearing for notification
        original_buyer_id = po_child.vendor_selected_by_buyer_id

        # Reject the vendor selection
        po_child.vendor_selection_status = 'td_rejected'
        po_child.status = 'td_rejected'
        po_child.vendor_approved_by_td_id = td_id
        po_child.vendor_approved_by_td_name = td_name
        po_child.vendor_approval_date = datetime.utcnow()
        po_child.rejection_reason = reason

        # Clear vendor selection so buyer can select a new vendor
        # BUT keep vendor_selected_by_buyer_id so we can query by buyer later
        po_child.vendor_id = None
        po_child.vendor_name = None
        # Don't clear buyer id - needed for querying rejected items
        # po_child.vendor_selected_by_buyer_id = None
        # po_child.vendor_selected_by_buyer_name = None
        po_child.vendor_selection_date = None

        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Send notification to buyer about vendor rejection
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            if original_buyer_id:
                notification = NotificationManager.create_notification(
                    user_id=original_buyer_id,
                    type='rejection',
                    title='Vendor Selection Rejected',
                    message=f'TD rejected vendor selection for {po_child.get_formatted_id()}. Reason: {reason}',
                    priority='high',
                    category='vendor',
                    action_required=True,
                    action_url=f'/buyer/purchase-orders?po_child_id={po_child_id}',
                    action_label='Select New Vendor',
                    metadata={
                        'po_child_id': str(po_child_id),
                        'rejection_reason': reason
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(original_buyer_id, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor rejection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection rejected",
            "po_child": po_child.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting PO child vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to reject vendor: {str(e)}"}), 500


def reselect_vendor_for_po_child(po_child_id):
    """Buyer re-selects vendor for a TD-rejected POChild (with full material data and prices)"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Unknown Buyer')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_id = data.get('vendor_id')
        materials = data.get('materials', [])

        # Input validation
        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        try:
            vendor_id = int(vendor_id)
        except (ValueError, TypeError):
            return jsonify({"error": "vendor_id must be a valid integer"}), 400

        if not isinstance(materials, list):
            return jsonify({"error": "materials must be an array"}), 400

        # Validate each material
        for idx, material in enumerate(materials):
            if not isinstance(material, dict):
                return jsonify({"error": f"Material at index {idx} must be an object"}), 400

            if 'material_name' not in material or not material.get('material_name'):
                return jsonify({"error": f"Material at index {idx} missing material_name"}), 400

            if 'negotiated_price' in material and material['negotiated_price'] is not None:
                try:
                    price = float(material['negotiated_price'])
                    if price < 0:
                        return jsonify({"error": f"Negative price not allowed for material {material.get('material_name')}"}), 400
                except (ValueError, TypeError):
                    return jsonify({"error": f"Invalid negotiated_price for material {material.get('material_name')}"}), 400

        # Get the PO child with eager loading
        po_child = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Check if admin or buyer assigned to parent CR
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # Get parent CR to check assignment
        parent_cr = ChangeRequest.query.get(po_child.parent_cr_id)
        if not parent_cr:
            return jsonify({"error": "Parent change request not found"}), 404

        # Verify buyer is assigned to this purchase (or is admin)
        if not is_admin and not is_admin_viewing:
            if parent_cr.assigned_to_buyer_user_id != buyer_id and po_child.vendor_selected_by_buyer_id != buyer_id:
                return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify PO Child is in td_rejected status
        if po_child.vendor_selection_status != 'td_rejected' and po_child.status != 'td_rejected':
            return jsonify({"error": f"Cannot re-select vendor. PO Child status: {po_child.status}, vendor_selection_status: {po_child.vendor_selection_status}"}), 400

        # Verify vendor exists and is active
        from models.vendor import Vendor
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        if vendor.status != 'active':
            return jsonify({"error": "Vendor is not active"}), 400

        # Update materials_data with new negotiated prices if provided
        if materials and len(materials) > 0:
            existing_materials = po_child.materials_data or []
            updated_materials = []
            total_cost = 0.0

            for existing_mat in existing_materials:
                mat_name = existing_mat.get('material_name', '')
                # Find matching material from request
                matching_material = next(
                    (m for m in materials if m.get('material_name') == mat_name),
                    None
                )

                if matching_material:
                    # Update with new negotiated price
                    negotiated_price = matching_material.get('negotiated_price')
                    if negotiated_price is not None:
                        existing_mat['negotiated_price'] = negotiated_price
                        existing_mat['unit_price'] = negotiated_price

                    # Calculate cost for this material
                    price = negotiated_price or existing_mat.get('unit_price', 0) or 0
                    quantity = existing_mat.get('quantity', 0) or 0
                    total_cost += price * quantity

                    # Track if price should be saved for future
                    if matching_material.get('save_price_for_future'):
                        existing_mat['save_price_for_future'] = True
                else:
                    # Keep existing material data, add to total
                    price = existing_mat.get('negotiated_price') or existing_mat.get('unit_price', 0) or 0
                    quantity = existing_mat.get('quantity', 0) or 0
                    total_cost += price * quantity

                updated_materials.append(existing_mat)

            # Update materials_data and total_cost
            po_child.materials_data = updated_materials
            po_child.materials_total_cost = round(total_cost, 2)

        # Update PO Child with new vendor (always use authoritative vendor name from database)
        po_child.vendor_id = vendor_id
        po_child.vendor_name = vendor.company_name
        po_child.vendor_selected_by_buyer_id = buyer_id
        po_child.vendor_selected_by_buyer_name = buyer_name
        po_child.vendor_selection_date = datetime.utcnow()
        po_child.vendor_selection_status = 'pending_td_approval'
        po_child.status = 'pending_td_approval'
        po_child.rejection_reason = None  # Clear previous rejection reason
        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Audit log for vendor re-selection
        log.info(f"PO Child {po_child.get_formatted_id()} vendor re-selected: "
                 f"vendor_id={vendor_id} ({vendor.company_name}), "
                 f"materials_total_cost={po_child.materials_total_cost}, "
                 f"by buyer {buyer_name} (id={buyer_id})")

        # Send notification to TD about new vendor selection
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user
            from models.user import User

            # Find TD users to notify
            td_users = User.query.filter(
                User.role.in_(['technical_director', 'TechnicalDirector', 'Technical Director']),
                User.is_deleted == False
            ).all()

            for td_user in td_users:
                notification = NotificationManager.create_notification(
                    user_id=td_user.user_id,
                    type='approval',
                    title='Vendor Re-selected for Approval',
                    message=f'{buyer_name} re-selected vendor "{vendor.company_name}" for {po_child.get_formatted_id()} after previous rejection',
                    priority='high',
                    category='vendor',
                    action_url=f'/technical-director/vendor-approval?po_child_id={po_child_id}',
                    action_label='Review Selection',
                    metadata={
                        'po_child_id': str(po_child_id),
                        'vendor_name': vendor.company_name,
                        'vendor_id': str(vendor_id),
                        'target_role': 'technical-director'
                    },
                    sender_id=buyer_id,
                    sender_name=buyer_name,
                    target_role='technical-director'
                )
                send_notification_to_user(td_user.user_id, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor re-selection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor re-selected successfully. Awaiting TD approval.",
            "po_child": po_child.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error re-selecting vendor for PO child: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to re-select vendor: {str(e)}"}), 500


def get_project_site_engineers(project_id):
    """Get all site engineers assigned to a project for buyer to select recipient"""
    try:
        from models.pm_assign_ss import PMAssignSS
        from models.role import Role

        log.info(f"\ud83d\udd0d Fetching site engineers for project {project_id}")

        project = Project.query.filter_by(
            project_id=project_id,
            is_deleted=False
        ).first()

        if not project:
            log.warning(f"Project {project_id} not found")
            return jsonify({"error": "Project not found"}), 404

        log.info(f"\u2705 Project found: {project.project_name} (Code: {project.project_code})")
        log.info(f"   project.site_supervisor_id = {project.site_supervisor_id}")

        site_engineers = []
        seen_ids = set()

        # Get Site Engineer/Supervisor role IDs
        se_roles = Role.query.filter(
            Role.role.in_(['Site Engineer', 'Site Supervisor', 'site_engineer', 'site_supervisor', 'siteengineer', 'sitesupervisor']),
            Role.is_deleted == False
        ).all()
        se_role_ids = [role.role_id for role in se_roles]
        log.info(f"   SE Role IDs: {se_role_ids}")

        # Check direct site_supervisor_id
        if project.site_supervisor_id:
            se_user = User.query.filter_by(
                user_id=project.site_supervisor_id,
                is_deleted=False
            ).first()
            if se_user:
                log.info(f"   \u2705 Found direct SE: {se_user.full_name} (ID: {se_user.user_id})")
                site_engineers.append({
                    'user_id': se_user.user_id,
                    'full_name': se_user.full_name,
                    'email': se_user.email
                })
                seen_ids.add(se_user.user_id)
            else:
                log.warning(f"   \u26a0\ufe0f site_supervisor_id {project.site_supervisor_id} not found or deleted")

        # Check PMAssignSS table for additional site engineers
        assignments = PMAssignSS.query.filter_by(
            project_id=project_id,
            is_deleted=False
        ).all()

        # Collect all SE IDs from project assignments (batch fetch to avoid N+1)
        se_ids_to_fetch = set()
        for assignment in assignments:
            if assignment.ss_ids and isinstance(assignment.ss_ids, list):
                se_ids_to_fetch.update(assignment.ss_ids)
            if assignment.assigned_to_se_id:
                se_ids_to_fetch.add(assignment.assigned_to_se_id)

        # Remove already seen IDs and fetch in single query
        se_ids_to_fetch -= seen_ids
        if se_ids_to_fetch:
            se_users = User.query.filter(
                User.user_id.in_(se_ids_to_fetch),
                User.is_deleted.is_(False)
            ).all()
            for se_user in se_users:
                site_engineers.append({
                    'user_id': se_user.user_id,
                    'full_name': se_user.full_name,
                    'email': se_user.email
                })
                seen_ids.add(se_user.user_id)

        log.debug(f"Site engineers from project assignments: {len(site_engineers)}")

        # FALLBACK: If no SEs found, get SEs associated with project's PMs
        if not site_engineers:
            log.debug("No direct SEs found, checking PMs' associated SEs")

            # Get PM IDs from project (user_id is a JSONB array)
            pm_ids = []
            if project.user_id:
                if isinstance(project.user_id, list):
                    pm_ids = [int(pid) for pid in project.user_id if pid]
                elif isinstance(project.user_id, (int, str)):
                    pm_ids = [int(project.user_id)]

            if pm_ids:
                # Find all SEs that have been assigned by these PMs (across any project)
                pm_assignments = PMAssignSS.query.filter(
                    PMAssignSS.assigned_by_pm_id.in_(pm_ids),
                    PMAssignSS.is_deleted.is_(False)
                ).all()

                # Collect SE IDs from PM assignments (batch fetch)
                pm_se_ids = set()
                for assignment in pm_assignments:
                    if assignment.ss_ids and isinstance(assignment.ss_ids, list):
                        pm_se_ids.update(assignment.ss_ids)
                    if assignment.assigned_to_se_id:
                        pm_se_ids.add(assignment.assigned_to_se_id)

                # Remove already seen IDs and fetch in single query
                pm_se_ids -= seen_ids
                if pm_se_ids:
                    pm_se_users = User.query.filter(
                        User.user_id.in_(pm_se_ids),
                        User.is_deleted.is_(False)
                    ).all()
                    for se_user in pm_se_users:
                        site_engineers.append({
                            'user_id': se_user.user_id,
                            'full_name': se_user.full_name,
                            'email': se_user.email
                        })
                        seen_ids.add(se_user.user_id)

                log.debug(f"After PM fallback: {len(site_engineers)} SEs found")

        log.info(f"Site engineers for project {project_id}: {len(site_engineers)} found")

        return jsonify({
            "success": True,
            "project_id": project_id,
            "project_name": project.project_name,
            "project_code": project.project_code,
            "site_engineers": site_engineers
        }), 200

    except Exception as e:
        log.error(f"Error fetching site engineers for project {project_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch site engineers: {str(e)}"
        }), 500


def complete_po_child_purchase(po_child_id):
    """Mark a POChild purchase as complete"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Unknown Buyer')
        user_role = current_user.get('role', '').lower()

        data = request.get_json() or {}
        notes = data.get('notes', '')
        intended_recipient = data.get('intended_recipient_name', '')  # Site engineer selected by buyer

        # Get the PO child with eager loading
        po_child = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (via parent CR)
        parent_cr = po_child.parent_cr
        if parent_cr and not is_admin and not is_admin_viewing:
            if parent_cr.assigned_to_buyer_user_id != buyer_id:
                return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        # Store-routed POChildren start with 'routed_to_store' and can be completed immediately
        # Vendor-routed POChildren need TD approval first ('vendor_approved')
        allowed_po_statuses = ['vendor_approved', 'send_to_buyer', 'routed_to_store']
        if po_child.status not in allowed_po_statuses:
            return jsonify({"error": f"Purchase cannot be completed. Current status: {po_child.status}"}), 400

        # Get routing type to determine flow
        routing_type = po_child.routing_type or 'vendor'  # Default to vendor for old records

        # Update the PO child based on routing type
        if routing_type == 'store':
            # Store routing: Already routed, just complete purchase
            po_child.status = 'purchase_completed'  # Mark as fully completed
            log.info(f"Store-routed POChild {po_child.get_formatted_id()}: Completing purchase")
        else:
            # Vendor routing: Route through Production Manager (M2 Store)
            po_child.status = 'routed_to_store'  # Intermediate status
            log.info(f"Vendor-routed POChild {po_child.get_formatted_id()}: Routing to store")

        po_child.purchase_completed_by_user_id = buyer_id
        po_child.purchase_completed_by_name = buyer_name
        po_child.purchase_completion_date = datetime.utcnow()
        po_child.updated_at = datetime.utcnow()

        # Set delivery routing fields (for vendor-routed)
        if routing_type == 'vendor':
            po_child.delivery_routing = 'via_production_manager'
            po_child.store_request_status = 'pending_vendor_delivery'

        # NOTE: Don't commit yet - wait until IMR is also created so they're atomic
        # db.session.commit() - REMOVED to fix bug where POChild status was committed but IMR wasn't created

        # Create Internal Material Requests for Production Manager
        created_imr_count = 0
        materials_to_route = po_child.materials_data

        # CRITICAL FIX: Handle case where materials_data might be a JSON string
        if materials_to_route:
            if isinstance(materials_to_route, str):
                import json
                try:
                    materials_to_route = json.loads(materials_to_route)
                    log.warning(f"POChild {po_child_id} materials_data was string, parsed to list with {len(materials_to_route)} items")
                except json.JSONDecodeError:
                    log.error(f"Failed to parse materials_data string for POChild {po_child_id}")
                    materials_to_route = []

            # Ensure it's a list
            if not isinstance(materials_to_route, list):
                log.error(f"POChild {po_child_id} materials_data is not a list: {type(materials_to_route)}")
                materials_to_route = [materials_to_route] if materials_to_route else []

            log.info(f"POChild {po_child_id}: Processing {len(materials_to_route)} materials for routing to store")

            from models.inventory import InternalMaterialRequest
            # notification_service is already imported at top of file

            # Get project info for the request
            parent_cr = po_child.parent_cr
            project_id = parent_cr.project_id if parent_cr else None
            project = Project.query.get(project_id) if project_id else None
            project_name = project.project_name if project else "Unknown Project"
            final_destination = project.location if project else "Unknown Site"

            # Prepare grouped materials list for single request
            grouped_materials = []
            primary_material_name = None

            for idx, sub_item in enumerate(materials_to_route):
                if isinstance(sub_item, dict):
                    # Check if this sub-item has nested materials array (handle both flat and nested structures)
                    nested_materials = sub_item.get('materials', [])

                    # If no materials array, treat the sub_item itself as a material
                    if not nested_materials:
                        nested_materials = [sub_item]

                    # Process each material (handles both flat and nested structures)
                    for material in nested_materials:
                        material_name = material.get('material_name', '').strip()

                        # Fallback to sub_item_name if material_name is empty
                        if not material_name:
                            material_name = material.get('sub_item_name', 'Unknown').strip()

                        quantity = material.get('quantity', 0)
                        log.info(f"  Material {idx+1}/{len(materials_to_route)}: {material_name} x {quantity}")

                        grouped_materials.append({
                            'material_name': material_name,
                            'quantity': quantity,
                            'brand': material.get('brand'),
                            'size': material.get('size'),
                            'unit': material.get('unit', '')
                        })
                        if not primary_material_name:
                            primary_material_name = material_name
                else:
                    log.warning(f"  Skipping material {idx+1}: not a dict, type={type(sub_item)}")

            # Create ONE grouped Internal Material Request (not multiple)
            if grouped_materials:
                # Get item_name from parent CR
                parent_item_name = po_child.item_name or (parent_cr.item_name if parent_cr else None)

                imr = InternalMaterialRequest(
                    cr_id=po_child.parent_cr_id,
                    project_id=project_id,
                    request_buyer_id=buyer_id,
                    item_name=parent_item_name,
                    quantity=len(grouped_materials),  # Number of materials
                    brand=None,
                    size=None,
                    notes=f"From {po_child.get_formatted_id()} - {len(grouped_materials)} material(s) - Vendor delivery expected",
                    source_type='from_vendor_delivery',
                    status='awaiting_vendor_delivery',
                    final_destination_site=final_destination,
                    intended_recipient_name=intended_recipient,
                    routed_by_buyer_id=buyer_id,
                    routed_to_store_at=datetime.utcnow(),
                    po_child_id=po_child.id,  # Link to source POChild
                    materials_data=grouped_materials,  # All materials in JSONB
                    materials_count=len(grouped_materials),
                    request_send=True,
                    created_at=datetime.utcnow(),
                    created_by=buyer_name,
                    last_modified_by=buyer_name
                )
                db.session.add(imr)
                created_imr_count = 1

                # ✅ FIX: Mark materials as routed in parent CR to prevent duplicates
                if parent_cr:
                    routed_materials_to_add = {}
                    for mat in grouped_materials:
                        mat_name = mat.get('material_name')
                        if mat_name:
                            routed_materials_to_add[mat_name] = {
                                'routing': 'vendor',  # Routed to specific vendor (via POChild)
                                'po_child_id': po_child.id,
                                'routed_at': datetime.utcnow().isoformat(),
                                'routed_by': buyer_id
                            }

                    # Update parent CR's routed_materials field
                    current_routed = parent_cr.routed_materials or {}
                    current_routed.update(routed_materials_to_add)
                    parent_cr.routed_materials = current_routed

            db.session.commit()
            log.info(f"POChild {po_child_id}: Created 1 grouped request with {len(grouped_materials)} materials")

            # Notify Production Manager about incoming vendor delivery
            materials_count = len(grouped_materials) if grouped_materials else 0
            if created_imr_count > 0:
                from utils.comprehensive_notification_service import notification_service
                from models.user import User
                from models.role import Role
                pm = User.query.filter(
                    User.role.has(Role.role == 'Production Manager'),
                    User.is_deleted == False
                ).first()
                if pm:
                    notification_service.create_notification(
                        user_id=pm.user_id,
                        title=f"\ud83d\udce6 Incoming Vendor Delivery - {project_name}",
                        message=f"{buyer_name} has routed {po_child.get_formatted_id()} with {materials_count} material(s) to M2 Store. Expected destination: {final_destination}",
                        type='vendor_delivery_incoming',
                        link=f'/production-manager/stock-out'
                    )
        else:
            materials_count = 0

        # Check if all PO children for parent CR are completed with eager loading
        all_po_children = POChild.query.options(
            joinedload(POChild.vendor)
        ).filter_by(
            parent_cr_id=po_child.parent_cr_id,
            is_deleted=False
        ).all()

        all_routed = all(pc.status in ['routed_to_store', 'purchase_completed'] for pc in all_po_children)

        # If all routed to store, update parent CR status
        if all_routed and parent_cr:
            parent_cr.status = 'routed_to_store'
            parent_cr.delivery_routing = 'via_production_manager'
            parent_cr.store_request_status = 'pending_vendor_delivery'
            parent_cr.purchase_completed_by_user_id = buyer_id
            parent_cr.purchase_completed_by_name = buyer_name
            parent_cr.purchase_completion_date = datetime.utcnow()
            parent_cr.updated_at = datetime.utcnow()
            db.session.commit()

        return jsonify({
            "success": True,
            "message": f"Purchase routed to M2 Store successfully! 1 request with {materials_count} material(s) created for Production Manager.",
            "po_child": po_child.to_dict(),
            "all_po_children_completed": all_routed,
            "material_requests_created": 1,
            "materials_count": materials_count,
            "status": "routed_to_store"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error completing PO child purchase: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to complete purchase: {str(e)}"}), 500


def get_pending_po_children():
    """Get all POChild records pending TD approval"""
    try:
        current_user = g.user
        user_role = current_user.get('role', '').lower()

        # Check if TD or admin
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        if not is_td and not is_admin:
            return jsonify({"error": "Access denied. TD or Admin role required."}), 403

        # Get all POChild records pending TD approval with eager loading
        # FIX: Exclude store-routed POChildren - they bypass TD approval entirely
        pending_po_children = POChild.query.options(
            joinedload(POChild.vendor)  # Eager load vendor relationship
        ).filter(
            POChild.vendor_selection_status == 'pending_td_approval',
            POChild.routing_type != 'store',  # Store routing bypasses TD
            POChild.is_deleted == False
        ).order_by(
            POChild.updated_at.desc().nulls_last(),
            POChild.created_at.desc()
        ).all()

        result = []
        for po_child in pending_po_children:
            # Get parent CR
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id) if po_child.parent_cr_id else None

            # Get project details
            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            # Get BOQ details
            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            # Enrich materials with BOQ prices for comparison
            enriched_materials = []
            po_materials = po_child.materials_data or []

            # Get material vendor selections from parent CR for negotiated prices
            material_vendor_selections = {}
            if parent_cr and parent_cr.material_vendor_selections:
                material_vendor_selections = parent_cr.material_vendor_selections
                log.info(f"\ud83d\udce6 POChild {po_child.id}: Parent CR {parent_cr.cr_id} has material_vendor_selections with {len(material_vendor_selections)} materials")
                for key, val in material_vendor_selections.items():
                    neg_price = val.get('negotiated_price') if isinstance(val, dict) else None
                    log.info(f"  - Material: '{key}' \u2192 negotiated_price: {neg_price}")
            else:
                log.warning(f"\u26a0\ufe0f POChild {po_child.id}: No material_vendor_selections found for parent CR {parent_cr.cr_id if parent_cr else 'None'}")

            # Get vendor product prices as fallback
            vendor_product_prices = {}
            if po_child.vendor_id:
                from models.vendor import VendorProduct
                vendor_products = VendorProduct.query.filter_by(
                    vendor_id=po_child.vendor_id,
                    is_deleted=False
                ).all()
                for vp in vendor_products:
                    if vp.product_name:
                        vendor_product_prices[vp.product_name.lower().strip()] = float(vp.unit_price or 0)
                log.info(f"\ud83d\udce6 POChild {po_child.id}: Loaded {len(vendor_product_prices)} vendor products for vendor {po_child.vendor_id}")

            # Build BOQ price lookup - get REAL BOQ prices from BOQ details
            boq_price_lookup = {}

            # First, try to get prices from BOQ details (most accurate)
            boq_id = po_child.boq_id or (parent_cr.boq_id if parent_cr else None)
            if boq_id:
                boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
                if boq_details and boq_details.boq_details:
                    boq_items = boq_details.boq_details.get('items', [])
                    for item in boq_items:
                        for sub_item in item.get('sub_items', []):
                            for boq_mat in sub_item.get('materials', []):
                                mat_name = boq_mat.get('material_name', '').lower().strip()
                                if mat_name:
                                    boq_price_lookup[mat_name] = boq_mat.get('unit_price', 0)

            # Also check parent CR's sub_items_data and materials_data for prices
            # Build separate negotiated price lookup (vendor prices set by buyer)
            negotiated_price_lookup = {}

            if parent_cr:
                sub_items = parent_cr.sub_items_data or []
                for sub in sub_items:
                    mat_name = sub.get('material_name', '').lower().strip()
                    # Get negotiated price (buyer's vendor price) first
                    neg_price = sub.get('negotiated_price') or 0
                    if mat_name and neg_price:
                        negotiated_price_lookup[mat_name] = neg_price

                    # Fallback to BOQ/original price
                    if mat_name and mat_name not in boq_price_lookup:
                        price = sub.get('original_unit_price') or sub.get('unit_price', 0)
                        if price:
                            boq_price_lookup[mat_name] = price

                # Also check materials_data
                materials = parent_cr.materials_data or []
                for mat in materials:
                    mat_name = mat.get('material_name', '').lower().strip()
                    # Get negotiated price first
                    neg_price = mat.get('negotiated_price') or 0
                    if mat_name and neg_price and mat_name not in negotiated_price_lookup:
                        negotiated_price_lookup[mat_name] = neg_price

                    # Fallback to BOQ/original price
                    if mat_name and mat_name not in boq_price_lookup:
                        price = mat.get('original_unit_price') or mat.get('unit_price', 0)
                        if price:
                            boq_price_lookup[mat_name] = price

            for material in po_materials:
                mat_copy = dict(material)
                mat_name = material.get('material_name', '').lower().strip()
                mat_name_original = material.get('material_name', '')
                boq_price = boq_price_lookup.get(mat_name, 0)
                quantity = material.get('quantity', 0)

                # If BOQ price not found by exact name, try partial match
                if not boq_price:
                    for boq_name, price in boq_price_lookup.items():
                        if mat_name in boq_name or boq_name in mat_name:
                            boq_price = price
                            break

                # Check material_vendor_selections for negotiated price (set by buyer)
                log.info(f"\ud83d\udd0d Looking for material: '{mat_name_original}' (lowercase: '{mat_name}')")

                # Try multiple name variations for robust matching
                selection = (material_vendor_selections.get(mat_name_original) or
                           material_vendor_selections.get(mat_name) or
                           material_vendor_selections.get(mat_name.title()) or {})

                # If still not found, try case-insensitive match
                if not selection or not isinstance(selection, dict):
                    for key, val in material_vendor_selections.items():
                        if key.lower() == mat_name:
                            selection = val
                            log.info(f"\u2713 Found match via case-insensitive search: key='{key}'")
                            break

                negotiated_from_selection = selection.get('negotiated_price') if isinstance(selection, dict) else None
                # ✅ Get supplier notes from vendor selection
                supplier_notes_from_selection = selection.get('supplier_notes', '') if isinstance(selection, dict) else ''

                # Check negotiated_price_lookup from sub_items_data
                negotiated_from_sub_items = negotiated_price_lookup.get(mat_name, 0)

                # Check if material already has negotiated/vendor price directly
                # POChild materials_data already has vendor price in unit_price field (set during creation)
                material_unit_price = material.get('unit_price', 0)
                material_negotiated_price = material.get('negotiated_price', 0)
                material_vendor_price = material.get('vendor_price', 0)

                # Check vendor product catalog
                vendor_product_price = vendor_product_prices.get(mat_name, 0)

                # Priority: selection > sub_items > material negotiated > material vendor > material unit_price > vendor product
                vendor_price = (negotiated_from_selection or
                              negotiated_from_sub_items or
                              material_negotiated_price or
                              material_vendor_price or
                              material_unit_price or
                              vendor_product_price or 0)

                if negotiated_from_selection:
                    log.info(f"\u2705 Found negotiated price {negotiated_from_selection} for '{mat_name_original}' from material_vendor_selections")
                elif negotiated_from_sub_items:
                    log.info(f"\u2705 Found negotiated price {negotiated_from_sub_items} for '{mat_name_original}' from sub_items_data")
                elif material_negotiated_price:
                    log.info(f"\u2705 Found negotiated price {material_negotiated_price} for '{mat_name_original}' from material.negotiated_price")
                elif material_vendor_price:
                    log.info(f"\u2705 Found vendor price {material_vendor_price} for '{mat_name_original}' from material.vendor_price")
                elif material_unit_price:
                    log.info(f"\u2705 Using unit_price {material_unit_price} for '{mat_name_original}' from material.unit_price (may be vendor or BOQ)")
                elif vendor_product_price:
                    log.info(f"\u2705 Found vendor product price {vendor_product_price} for '{mat_name_original}' from vendor catalog")
                else:
                    log.warning(f"\u274c No vendor price found for '{mat_name_original}'")

                # ALWAYS set BOQ price for reference (even if vendor price exists)
                mat_copy['boq_unit_price'] = boq_price
                mat_copy['boq_total_price'] = boq_price * quantity if boq_price else 0

                # Use vendor/negotiated price if available, otherwise BOQ price
                # CRITICAL: vendor_price may come from multiple sources (see priority above)
                if vendor_price and vendor_price > 0:
                    # Vendor negotiated price found - use it
                    mat_copy['unit_price'] = vendor_price
                    mat_copy['total_price'] = vendor_price * quantity
                    mat_copy['negotiated_price'] = vendor_price
                    log.info(f"\u2713 Set vendor price {vendor_price} for '{mat_name_original}' (BOQ: {boq_price})")
                elif boq_price and boq_price > 0:
                    # No vendor price - fallback to BOQ price
                    mat_copy['unit_price'] = boq_price
                    mat_copy['total_price'] = boq_price * quantity
                    mat_copy['negotiated_price'] = None  # No negotiation happened
                    log.info(f"\u2139 Set BOQ price {boq_price} for '{mat_name_original}' (no vendor price)")
                else:
                    # No prices found at all - this shouldn't happen
                    mat_copy['unit_price'] = material.get('unit_price', 0)  # Keep original if any
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity if mat_copy['unit_price'] else 0
                    mat_copy['negotiated_price'] = None
                    log.warning(f"\u26a0 No BOQ or vendor price found for '{mat_name_original}', using stored unit_price: {mat_copy['unit_price']}")

                # Ensure total_price is calculated if unit_price exists but total_price is missing
                if mat_copy.get('unit_price') and (not mat_copy.get('total_price') or mat_copy.get('total_price') == 0):
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity

                # ✅ Add supplier notes - prioritize selection, then preserve existing material notes
                # CRITICAL FIX: Material may already have supplier_notes from POChild creation
                existing_supplier_notes = material.get('supplier_notes', '')
                final_supplier_notes = supplier_notes_from_selection or existing_supplier_notes

                if final_supplier_notes:
                    mat_copy['supplier_notes'] = final_supplier_notes
                    source = "vendor_selection" if supplier_notes_from_selection else "po_material_data"
                    log.info(f"\u2705 Added supplier notes for '{mat_name_original}' from {source}: {final_supplier_notes[:50]}...")
                else:
                    mat_copy['supplier_notes'] = ''  # Ensure field exists even if empty

                enriched_materials.append(mat_copy)

            # Recalculate total cost from enriched materials
            enriched_total_cost = sum(m.get('total_price', 0) for m in enriched_materials)

            po_dict = po_child.to_dict()
            po_dict['materials'] = enriched_materials  # Override with enriched materials
            po_dict['materials_total_cost'] = enriched_total_cost  # Override with recalculated total

            result.append({
                **po_dict,
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None,
                # ✅ Include parent CR's material_vendor_selections for vendor comparison display
                'material_vendor_selections': material_vendor_selections,

                # ✅ Frontend compatibility fields (ChangeRequestDetailsModal expects these)
                'selected_vendor_id': po_child.vendor_id,  # Frontend checks for this field
                'selected_vendor_name': po_child.vendor_name,  # Frontend displays this
                'requested_by_name': parent_cr.requested_by_name if parent_cr else None,  # Original CR requester (PM/SE)
                'requested_by_role': parent_cr.requested_by_role if parent_cr else None,  # Original requester role

                # ✅ Include justification from parent CR
                'justification': parent_cr.justification if parent_cr else None,

                # ✅ Include vendor selection tracking
                'vendor_selected_by_buyer_name': po_child.vendor_selected_by_buyer_name,
                'vendor_selection_date': po_child.vendor_selection_date.isoformat() if po_child.vendor_selection_date else None,

                # ✅ Include material_vendor_selections from parent CR for competitor comparison
                'material_vendor_selections': parent_cr.material_vendor_selections if parent_cr and parent_cr.material_vendor_selections else {},
            })

        return jsonify({
            "success": True,
            "pending_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching pending PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch pending PO children: {str(e)}"}), 500


def get_rejected_po_children():
    """Get all POChild records rejected by TD"""
    try:
        from sqlalchemy import or_

        current_user = g.user
        user_role = current_user.get('role', '').lower()

        # Check if TD or admin
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        if not is_td and not is_admin:
            return jsonify({"error": "Access denied. TD or Admin role required."}), 403

        # Get all POChild records rejected by TD with eager loading
        rejected_po_children = POChild.query.options(
            joinedload(POChild.vendor)  # Eager load vendor relationship
        ).filter(
            or_(
                POChild.vendor_selection_status == 'td_rejected',
                POChild.vendor_selection_status == 'rejected',
                POChild.status == 'td_rejected'
            ),
            POChild.is_deleted == False
        ).order_by(
            POChild.updated_at.desc().nulls_last(),
            POChild.created_at.desc()
        ).all()

        result = []
        for po_child in rejected_po_children:
            # Get parent CR
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id) if po_child.parent_cr_id else None

            # Get project details
            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            # Get BOQ details
            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            # Enrich materials with prices from BOQ AND negotiated prices
            enriched_materials = []
            po_materials = po_child.materials_data or []

            # Get material vendor selections from parent CR for negotiated prices
            material_vendor_selections = {}
            if parent_cr and parent_cr.material_vendor_selections:
                material_vendor_selections = parent_cr.material_vendor_selections

            # Get vendor product prices as fallback
            vendor_product_prices = {}
            if po_child.vendor_id:
                from models.vendor import VendorProduct
                vendor_products = VendorProduct.query.filter_by(
                    vendor_id=po_child.vendor_id,
                    is_deleted=False
                ).all()
                for vp in vendor_products:
                    if vp.product_name:
                        vendor_product_prices[vp.product_name.lower().strip()] = float(vp.unit_price or 0)

            # Build BOQ price lookup
            boq_price_lookup = {}
            boq_id = po_child.boq_id or (parent_cr.boq_id if parent_cr else None)
            if boq_id:
                boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
                if boq_details and boq_details.boq_details:
                    boq_items = boq_details.boq_details.get('items', [])
                    for item in boq_items:
                        for sub_item in item.get('sub_items', []):
                            for boq_mat in sub_item.get('materials', []):
                                mat_name = boq_mat.get('material_name', '').lower().strip()
                                if mat_name:
                                    boq_price_lookup[mat_name] = boq_mat.get('unit_price', 0)

            for material in po_materials:
                mat_copy = dict(material)
                mat_name = material.get('material_name', '').lower().strip()
                mat_name_original = material.get('material_name', '')
                boq_price = boq_price_lookup.get(mat_name, 0)
                quantity = material.get('quantity', 0)

                # Check material_vendor_selections for negotiated price
                selection = (material_vendor_selections.get(mat_name_original) or
                           material_vendor_selections.get(mat_name) or {})
                if not selection or not isinstance(selection, dict):
                    for key, val in material_vendor_selections.items():
                        if key.lower() == mat_name:
                            selection = val
                            break

                negotiated_price = selection.get('negotiated_price') if isinstance(selection, dict) else None
                # ✅ Get supplier notes from vendor selection
                supplier_notes = selection.get('supplier_notes', '') if isinstance(selection, dict) else ''

                # Check vendor product catalog
                vendor_product_price = vendor_product_prices.get(mat_name, 0)

                # Priority: negotiated > material fields > material unit_price > vendor product
                vendor_price = (negotiated_price or
                              material.get('negotiated_price') or
                              material.get('vendor_price') or
                              material.get('unit_price') or
                              vendor_product_price or 0)

                # ALWAYS set BOQ price for reference
                mat_copy['boq_unit_price'] = boq_price
                mat_copy['boq_total_price'] = boq_price * quantity if boq_price else 0

                # CRITICAL FIX: For rejected PO children, ALWAYS use vendor price stored in material
                # Do NOT fall back to BOQ price - the material.unit_price contains the vendor price
                if vendor_price and vendor_price > 0:
                    mat_copy['unit_price'] = vendor_price
                    mat_copy['total_price'] = vendor_price * quantity
                    mat_copy['negotiated_price'] = vendor_price
                else:
                    # If no vendor price found, use stored unit_price (should be vendor price)
                    # Only use BOQ price as absolute last resort for display reference
                    stored_unit_price = material.get('unit_price', 0)
                    mat_copy['unit_price'] = stored_unit_price if stored_unit_price > 0 else boq_price
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity if mat_copy['unit_price'] else 0
                    mat_copy['negotiated_price'] = stored_unit_price if stored_unit_price > 0 else None

                # Ensure total_price is calculated
                if mat_copy.get('unit_price') and (not mat_copy.get('total_price') or mat_copy.get('total_price') == 0):
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity

                # ✅ Add supplier notes from vendor selection if available
                if supplier_notes:
                    mat_copy['supplier_notes'] = supplier_notes

                enriched_materials.append(mat_copy)

            # Recalculate total cost from enriched materials
            enriched_total_cost = sum(m.get('total_price', 0) for m in enriched_materials)

            po_dict = po_child.to_dict()
            po_dict['materials'] = enriched_materials
            po_dict['materials_total_cost'] = enriched_total_cost

            result.append({
                **po_dict,
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None,
                # ✅ Include parent CR's material_vendor_selections for vendor comparison display
                'material_vendor_selections': material_vendor_selections,

                # ✅ Frontend compatibility fields (ChangeRequestDetailsModal expects these)
                'selected_vendor_id': po_child.vendor_id,
                'selected_vendor_name': po_child.vendor_name,
                'requested_by_name': parent_cr.requested_by_name if parent_cr else None,
                'requested_by_role': parent_cr.requested_by_role if parent_cr else None,

                # ✅ Include justification from parent CR
                'justification': parent_cr.justification if parent_cr else None,

                # ✅ Include vendor selection tracking
                'vendor_selected_by_buyer_name': po_child.vendor_selected_by_buyer_name,
                'vendor_selection_date': po_child.vendor_selection_date.isoformat() if po_child.vendor_selection_date else None,

                # ✅ Include material_vendor_selections from parent CR for competitor comparison
                'material_vendor_selections': parent_cr.material_vendor_selections if parent_cr and parent_cr.material_vendor_selections else {},
            })

        return jsonify({
            "success": True,
            "rejected_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching rejected PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch rejected PO children: {str(e)}"}), 500


def get_buyer_pending_po_children():
    """Get POChild records pending TD approval for the current buyer"""
    try:
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role_name', current_user.get('role', '')).lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        if user_role == 'admin':
            is_admin_viewing = True

        # Get POChildren where parent CR is assigned to this buyer and pending TD approval
        # FIX: Exclude store-routed POChildren - they should NEVER appear in TD approval queue
        # Store routing bypasses TD approval entirely (goes directly to PM via internal request)
        if is_admin_viewing:
            pending_po_children = POChild.query.options(
                joinedload(POChild.vendor)  # Eager load vendor relationship
            ).filter(
                POChild.vendor_selection_status == 'pending_td_approval',
                POChild.routing_type != 'store',  # Exclude store-routed POChildren
                POChild.is_deleted == False
            ).order_by(
                POChild.updated_at.desc().nulls_last(),
                POChild.created_at.desc()
            ).all()
        else:
            pending_po_children = POChild.query.options(
                joinedload(POChild.vendor)  # Eager load vendor relationship
            ).join(
                ChangeRequest, POChild.parent_cr_id == ChangeRequest.cr_id
            ).filter(
                POChild.vendor_selection_status == 'pending_td_approval',
                POChild.routing_type != 'store',  # Exclude store-routed POChildren
                POChild.is_deleted == False,
                ChangeRequest.assigned_to_buyer_user_id == user_id
            ).order_by(
                POChild.updated_at.desc().nulls_last(),
                POChild.created_at.desc()
            ).all()


        result = []
        for po_child in pending_po_children:
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id) if po_child.parent_cr_id else None

            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            # Enrich materials with prices from BOQ
            enriched_materials = []
            po_materials = po_child.materials_data or []

            # Get material vendor selections from parent CR for negotiated prices
            material_vendor_selections = {}
            if parent_cr and parent_cr.material_vendor_selections:
                material_vendor_selections = parent_cr.material_vendor_selections

            # Build BOQ price lookup
            boq_price_lookup = {}
            boq_id_for_lookup = po_child.boq_id or (parent_cr.boq_id if parent_cr else None)
            if boq_id_for_lookup:
                boq_details = BOQDetails.query.filter_by(boq_id=boq_id_for_lookup, is_deleted=False).first()
                if boq_details and boq_details.boq_details:
                    boq_items = boq_details.boq_details.get('items', [])
                    for item in boq_items:
                        for sub_item in item.get('sub_items', []):
                            for boq_mat in sub_item.get('materials', []):
                                mat_name = boq_mat.get('material_name', '').lower().strip()
                                if mat_name:
                                    boq_price_lookup[mat_name] = boq_mat.get('unit_price', 0)

            for material in po_materials:
                mat_copy = dict(material)
                mat_name = material.get('material_name', '').lower().strip()
                mat_name_original = material.get('material_name', '')
                boq_price = boq_price_lookup.get(mat_name, 0)
                quantity = material.get('quantity', 0)

                # Get supplier notes from material_vendor_selections
                selection = (material_vendor_selections.get(mat_name_original) or
                           material_vendor_selections.get(mat_name) or {})
                if not selection or not isinstance(selection, dict):
                    for key, val in material_vendor_selections.items():
                        if key.lower() == mat_name:
                            selection = val
                            break

                supplier_notes = selection.get('supplier_notes', '') if isinstance(selection, dict) else ''
                if supplier_notes:
                    log.info(f"\u2705 Buyer POChild: Found supplier notes for '{mat_name_original}': {supplier_notes[:50]}...")

                # If unit_price is 0 or missing, use BOQ price as fallback
                if not mat_copy.get('unit_price') or mat_copy.get('unit_price') == 0:
                    mat_copy['unit_price'] = boq_price
                    mat_copy['total_price'] = boq_price * quantity if boq_price else 0

                # Ensure total_price is calculated
                if mat_copy.get('unit_price') and (not mat_copy.get('total_price') or mat_copy.get('total_price') == 0):
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity

                # ✅ Add supplier notes from vendor selection if available
                if supplier_notes:
                    mat_copy['supplier_notes'] = supplier_notes
                    log.info(f"\u2705 [get_approved_po_children] Added supplier notes to material '{mat_name_original}': {supplier_notes[:50]}...")
                else:
                    # Ensure supplier_notes field exists even if empty (for frontend consistency)
                    mat_copy['supplier_notes'] = ''
                    log.info(f"\u26a0\ufe0f [get_approved_po_children] No supplier notes for material '{mat_name_original}'")

                enriched_materials.append(mat_copy)

            # Recalculate total cost from enriched materials
            enriched_total_cost = sum(m.get('total_price', 0) for m in enriched_materials)

            po_dict = po_child.to_dict()
            po_dict['materials'] = enriched_materials
            po_dict['materials_total_cost'] = enriched_total_cost

            result.append({
                **po_dict,
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None,
                # ✅ Include parent CR's material_vendor_selections for vendor comparison display
                'material_vendor_selections': material_vendor_selections,

                # ✅ Frontend compatibility fields (ChangeRequestDetailsModal expects these)
                'selected_vendor_id': po_child.vendor_id,
                'selected_vendor_name': po_child.vendor_name,
                'requested_by_name': parent_cr.requested_by_name if parent_cr else None,
                'requested_by_role': parent_cr.requested_by_role if parent_cr else None,

                # ✅ Include justification from parent CR
                'justification': parent_cr.justification if parent_cr else None,

                # ✅ Include vendor selection tracking
                'vendor_selected_by_buyer_name': po_child.vendor_selected_by_buyer_name,
                'vendor_selection_date': po_child.vendor_selection_date.isoformat() if po_child.vendor_selection_date else None,

                # ✅ Include material_vendor_selections from parent CR for competitor comparison
                'material_vendor_selections': parent_cr.material_vendor_selections if parent_cr and parent_cr.material_vendor_selections else {},
            })

        return jsonify({
            "success": True,
            "pending_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyer pending PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch pending PO children: {str(e)}"}), 500


def get_approved_po_children():
    """Get all POChild records with approved vendor selection (for buyer to complete purchase)"""
    try:
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role_name', current_user.get('role', '')).lower()

        log.info(f"get_approved_po_children called by user {user_id}, role: '{user_role}'")

        # Check roles
        is_buyer = user_role == 'buyer'
        is_estimator = user_role == 'estimator'
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        log.info(f"Role check: is_buyer={is_buyer}, is_estimator={is_estimator}, is_td={is_td}, is_admin={is_admin}")

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        if user_role == 'admin':
            is_admin_viewing = True

        if not is_buyer and not is_estimator and not is_td and not is_admin:
            return jsonify({"error": "Access denied. Buyer, Estimator, TD, or Admin role required."}), 403

        # Get all POChild records that are ready for buyer action (not yet completed) with eager loading
        # Include: vendor-approved POChildren AND store-routed POChildren
        approved_po_children = POChild.query.options(
            joinedload(POChild.vendor)  # Eager load vendor relationship
        ).filter(
            db.or_(
                # Vendor routing: TD approved, not yet completed or routed to store
                db.and_(
                    POChild.vendor_selection_status == 'approved',
                    ~POChild.status.in_(['purchase_completed', 'routed_to_store'])
                ),
                # Store routing: Routed to store, visible until buyer marks complete
                db.and_(
                    POChild.routing_type == 'store',
                    POChild.status == 'routed_to_store'
                )
            ),
            POChild.is_deleted == False
        ).order_by(
            POChild.updated_at.desc().nulls_last(),
            POChild.created_at.desc()
        ).all()

        log.info(f"Found {len(approved_po_children)} approved PO children in database")

        result = []
        for po_child in approved_po_children:
            # Get parent CR to check buyer assignment
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id)

            # For buyer, only show PO children for CRs assigned to them (unless admin viewing)
            if is_buyer and not is_admin_viewing:
                if not parent_cr or parent_cr.assigned_to_buyer_user_id != user_id:
                    continue

            # Get project details
            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            # Get BOQ details
            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            # Get vendor details for phone/email
            vendor_phone = None
            vendor_email = None
            if po_child.vendor_id:
                vendor = Vendor.query.filter_by(vendor_id=po_child.vendor_id, is_deleted=False).first()
                if vendor:
                    vendor_phone = vendor.phone
                    vendor_email = vendor.email

            # Enrich materials with prices from BOQ AND negotiated prices
            enriched_materials = []
            po_materials = po_child.materials_data or []

            # Get material vendor selections from parent CR for negotiated prices
            material_vendor_selections = {}
            if parent_cr and parent_cr.material_vendor_selections:
                material_vendor_selections = parent_cr.material_vendor_selections

            # Get vendor product prices as fallback
            vendor_product_prices = {}
            if po_child.vendor_id:
                from models.vendor import VendorProduct
                vendor_products = VendorProduct.query.filter_by(
                    vendor_id=po_child.vendor_id,
                    is_deleted=False
                ).all()
                for vp in vendor_products:
                    if vp.product_name:
                        vendor_product_prices[vp.product_name.lower().strip()] = float(vp.unit_price or 0)

            # Build BOQ price lookup
            boq_price_lookup = {}
            boq_id_for_lookup = po_child.boq_id or (parent_cr.boq_id if parent_cr else None)
            if boq_id_for_lookup:
                boq_details = BOQDetails.query.filter_by(boq_id=boq_id_for_lookup, is_deleted=False).first()
                if boq_details and boq_details.boq_details:
                    boq_items = boq_details.boq_details.get('items', [])
                    for item in boq_items:
                        for sub_item in item.get('sub_items', []):
                            for boq_mat in sub_item.get('materials', []):
                                mat_name = boq_mat.get('material_name', '').lower().strip()
                                if mat_name:
                                    boq_price_lookup[mat_name] = boq_mat.get('unit_price', 0)

            for material in po_materials:
                mat_copy = dict(material)
                mat_name = material.get('material_name', '').lower().strip()
                mat_name_original = material.get('material_name', '')
                boq_price = boq_price_lookup.get(mat_name, 0)
                quantity = material.get('quantity', 0)

                # Check material_vendor_selections for negotiated price
                selection = (material_vendor_selections.get(mat_name_original) or
                           material_vendor_selections.get(mat_name) or {})
                if not selection or not isinstance(selection, dict):
                    for key, val in material_vendor_selections.items():
                        if key.lower() == mat_name:
                            selection = val
                            break

                negotiated_price = selection.get('negotiated_price') if isinstance(selection, dict) else None
                # ✅ Get supplier notes from vendor selection
                supplier_notes = selection.get('supplier_notes', '') if isinstance(selection, dict) else ''

                # Check vendor product catalog
                vendor_product_price = vendor_product_prices.get(mat_name, 0)

                # Priority: negotiated > material fields > material unit_price > vendor product
                vendor_price = (negotiated_price or
                              material.get('negotiated_price') or
                              material.get('vendor_price') or
                              material.get('unit_price') or
                              vendor_product_price or 0)

                # ALWAYS set BOQ price for reference
                mat_copy['boq_unit_price'] = boq_price
                mat_copy['boq_total_price'] = boq_price * quantity if boq_price else 0

                # CRITICAL FIX: For approved PO children, ALWAYS use vendor price stored in material
                # Do NOT fall back to BOQ price when vendor has been approved by TD
                # The material.unit_price contains the TD-approved vendor price
                if vendor_price and vendor_price > 0:
                    mat_copy['unit_price'] = vendor_price
                    mat_copy['total_price'] = vendor_price * quantity
                    mat_copy['negotiated_price'] = vendor_price
                else:
                    # If no vendor price found, use stored unit_price (should be vendor price)
                    # Only use BOQ price as absolute last resort for display reference
                    stored_unit_price = material.get('unit_price', 0)
                    mat_copy['unit_price'] = stored_unit_price if stored_unit_price > 0 else boq_price
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity if mat_copy['unit_price'] else 0
                    mat_copy['negotiated_price'] = stored_unit_price if stored_unit_price > 0 else None

                # Ensure total_price is calculated
                if mat_copy.get('unit_price') and (not mat_copy.get('total_price') or mat_copy.get('total_price') == 0):
                    mat_copy['total_price'] = mat_copy['unit_price'] * quantity

                # ✅ Add supplier notes from vendor selection if available
                if supplier_notes:
                    mat_copy['supplier_notes'] = supplier_notes

                enriched_materials.append(mat_copy)

            # Recalculate total cost from enriched materials
            enriched_total_cost = sum(m.get('total_price', 0) for m in enriched_materials)

            po_dict = po_child.to_dict()
            po_dict['materials'] = enriched_materials
            po_dict['materials_total_cost'] = enriched_total_cost

            result.append({
                **po_dict,
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None,
                'vendor_phone': vendor_phone,
                'vendor_email': vendor_email,

                # ✅ Frontend compatibility fields (ChangeRequestDetailsModal expects these)
                'selected_vendor_id': po_child.vendor_id,
                'selected_vendor_name': po_child.vendor_name,
                'requested_by_name': parent_cr.requested_by_name if parent_cr else None,
                'requested_by_role': parent_cr.requested_by_role if parent_cr else None,

                # ✅ Include justification from parent CR
                'justification': parent_cr.justification if parent_cr else None,

                # ✅ Include vendor selection tracking
                'vendor_selected_by_buyer_name': po_child.vendor_selected_by_buyer_name,
                'vendor_selection_date': po_child.vendor_selection_date.isoformat() if po_child.vendor_selection_date else None,

                # ✅ Include material_vendor_selections from parent CR for competitor comparison
                'material_vendor_selections': parent_cr.material_vendor_selections if parent_cr and parent_cr.material_vendor_selections else {},
            })

        log.info(f"Returning {len(result)} approved PO children to user {user_id} (role: {user_role})")

        return jsonify({
            "success": True,
            "approved_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching approved PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch approved PO children: {str(e)}"}), 500
