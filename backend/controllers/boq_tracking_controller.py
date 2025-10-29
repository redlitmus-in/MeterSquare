from flask import request, jsonify, g
from config.db import db
from models.boq import *
from config.logging import get_logger
from datetime import datetime
from decimal import Decimal
import json
from models.change_request import ChangeRequest

log = get_logger()


def get_boq_planned_vs_actual(boq_id):
    """
    Get planned vs actual comparison for a BOQ
    - Planned data: from boq_details.boq_details JSON
    - Actual data: from MaterialPurchaseTracking and LabourTracking tables

    This function handles the old purchase_history structure: {"materials": [...]}
    and matches materials by master_material_id only (not requiring master_item_id match)
    """
    try:
        # Get BOQ details
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        boq_detail = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_detail or not boq_detail.boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Parse BOQ details (planned data)
        boq_data = json.loads(boq_detail.boq_details) if isinstance(boq_detail.boq_details, str) else boq_detail.boq_details

        # Extract discount from top-level BOQ data
        boq_level_discount_percentage = Decimal(str(boq_data.get('discount_percentage', 0)))
        boq_level_discount_amount = Decimal(str(boq_data.get('discount_amount', 0)))

        # Fetch ALL change requests (regardless of status) to show in comparison
        change_requests = ChangeRequest.query.filter_by(
            boq_id=boq_id,
            is_deleted=False
        ).all()

        # Merge CR materials into BOQ data as sub-items
        for cr in change_requests:
            materials_data = cr.materials_data or []
            if not materials_data:
                continue
            cr_item_id = cr.item_id
            cr_item_name = cr.item_name

            # Find target item in BOQ
            target_item = None
            for item in boq_data.get('items', []):
                item_master_id = item.get('master_item_id')
                item_name = item.get('item_name')

                # Match by ID or name
                if (item_master_id and cr_item_id and str(item_master_id) == str(cr_item_id)) or \
                   (cr_item_name and item_name and cr_item_name.lower().strip() == item_name.lower().strip()):
                    target_item = item
                    break

            # Fallback: use first item
            if not target_item and boq_data.get('items'):
                target_item = boq_data['items'][0]

            if target_item:
                # Ensure sub_items array exists
                if 'sub_items' not in target_item:
                    target_item['sub_items'] = []

                # Create CR sub-item
                cr_sub_item = {
                    'sub_item_name': f"Extra Materials - CR #{cr.cr_id}",
                    'description': f"{cr.justification} [Status: {cr.status}]",
                    'materials': []
                }

                # Add materials from CR
                for mat in materials_data:
                    # Use CR-level justification if material doesn't have its own
                    material_justification = mat.get('justification') or cr.justification or ''

                    cr_sub_item['materials'].append({
                        'master_material_id': mat.get('master_material_id'),
                        'material_name': mat.get('material_name'),
                        'quantity': mat.get('quantity', 0),
                        'unit': mat.get('unit', 'nos'),
                        'unit_price': mat.get('unit_price', 0),
                        'total_price': mat.get('total_price', 0),
                        'is_from_change_request': True,
                        'change_request_id': cr.cr_id,
                        'justification': material_justification,
                        # Mark planned as 0 = unplanned spending
                        'planned_quantity': 0,
                        'planned_unit_price': 0,
                        'planned_total_price': 0
                    })

                target_item['sub_items'].append(cr_sub_item)
        # Get actual material purchases from MaterialPurchaseTracking
        # Group by (master_item_id, master_material_id) and take only the latest entry for each group
        from sqlalchemy import func

        # Subquery to get the latest purchase_tracking_id for each (master_item_id, master_material_id) combination
        latest_tracking_subquery = db.session.query(
            MaterialPurchaseTracking.master_item_id,
            MaterialPurchaseTracking.master_material_id,
            MaterialPurchaseTracking.material_name,
            func.max(MaterialPurchaseTracking.purchase_tracking_id).label('latest_id')
        ).filter_by(
            boq_id=boq_id, is_deleted=False
        ).group_by(
            MaterialPurchaseTracking.master_item_id,
            MaterialPurchaseTracking.master_material_id,
            MaterialPurchaseTracking.material_name
        ).subquery()

        # Get only the latest MaterialPurchaseTracking records
        actual_materials = db.session.query(MaterialPurchaseTracking).join(
            latest_tracking_subquery,
            MaterialPurchaseTracking.purchase_tracking_id == latest_tracking_subquery.c.latest_id
        ).all()

        # Get actual labour tracking from LabourTracking
        actual_labour = LabourTracking.query.filter_by(
            boq_id=boq_id, is_deleted=False
        ).all()

        # Build comparison
        comparison = {
            "boq_id": boq_id,
            "project_id": boq.project_id,
            "boq_name": boq.boq_name,
            "items": []
        }

        # Process each item
        for planned_item in boq_data.get('items', []):
            master_item_id = planned_item.get('master_item_id')

            # Material comparison
            materials_comparison = []
            planned_materials_total = Decimal('0')
            actual_materials_total = Decimal('0')

            # First, collect original materials and CR materials separately
            original_materials = []  # List of original (non-CR) materials
            cr_materials_map = {}  # Map material_id/name to CR material data (for updates)
            cr_materials_name_map = {}  # Map material_name to the CR that's updating it
            cr_new_materials = []  # List of CR materials that are truly new additions

            # Step 1: Collect all original materials first
            for sub_item in planned_item.get('sub_items', []):
                for mat in sub_item.get('materials', []):
                    if not mat.get('is_from_change_request'):
                        original_materials.append({
                            'data': mat,
                            'sub_item_name': sub_item.get('sub_item_name'),
                            'master_sub_item_id': sub_item.get('master_sub_item_id')
                        })

            # Step 2: Process CR materials and determine if they're updates or new
            for sub_item in planned_item.get('sub_items', []):
                for mat in sub_item.get('materials', []):
                    if mat.get('is_from_change_request'):
                        mat_id = mat.get('master_material_id')
                        mat_name = mat.get('material_name', '').lower().strip()
                        cr_id = mat.get('change_request_id')

                        # Check if this CR material is updating an existing material or is new
                        is_updating_existing = False

                        # Check against collected original materials
                        for orig_mat_info in original_materials:
                            orig_mat = orig_mat_info['data']
                            check_mat_id = orig_mat.get('master_material_id')
                            check_mat_name = orig_mat.get('material_name', '').lower().strip()

                            # Match by ID or by name
                            if (mat_id and check_mat_id and mat_id == check_mat_id) or \
                               (mat_name and check_mat_name and mat_name == check_mat_name):
                                is_updating_existing = True
                                break

                        if is_updating_existing:
                            # This CR is updating an existing material
                            if mat_id:
                                # Keep track of the highest CR ID for each material (latest update)
                                if mat_id not in cr_materials_map or cr_id > cr_materials_map.get(mat_id, {}).get('cr_id', 0):
                                    cr_materials_map[mat_id] = {'cr_id': cr_id, 'data': mat, 'sub_item_name': sub_item.get('sub_item_name')}

                            # Also track by name for materials without IDs
                            if mat_name:
                                if mat_name not in cr_materials_name_map or cr_id > cr_materials_name_map.get(mat_name, {}).get('cr_id', 0):
                                    cr_materials_name_map[mat_name] = {'cr_id': cr_id, 'data': mat, 'sub_item_name': sub_item.get('sub_item_name')}
                        else:
                            # This CR is a NEW material (not updating existing)
                            cr_new_materials.append({
                                'data': mat,
                                'sub_item_name': sub_item.get('sub_item_name'),
                                'master_sub_item_id': sub_item.get('master_sub_item_id')
                            })

            # Process ONLY original materials (CR materials are processed separately)
            for orig_mat_info in original_materials:
                planned_mat = orig_mat_info['data']
                sub_item_name = orig_mat_info['sub_item_name']
                master_sub_item_id = orig_mat_info['master_sub_item_id']
                master_material_id = planned_mat.get('master_material_id')
                material_name = planned_mat.get('material_name')

                actual_mat = None
                matched_material_id = master_material_id

                # Strategy 1: Find by exact match (master_material_id + master_item_id)
                if master_material_id:
                    actual_mat = next(
                        (am for am in actual_materials
                         if am.master_material_id == master_material_id
                         and am.master_item_id == master_item_id),
                        None
                    )

                # Strategy 2: Find by material_id only
                if not actual_mat and master_material_id:
                    actual_mat = next(
                        (am for am in actual_materials
                         if am.master_material_id == master_material_id),
                        None
                    )

                # Strategy 3: Search inside purchase_history.materials array for matching master_material_id
                if not actual_mat and master_material_id:
                    for am in actual_materials:
                        if am.purchase_history:
                            if isinstance(am.purchase_history, dict) and 'materials' in am.purchase_history:
                                for mat_entry in am.purchase_history.get('materials', []):
                                    if mat_entry.get('master_material_id') == master_material_id:
                                        actual_mat = am
                                        matched_material_id = master_material_id
                                        break
                        if actual_mat:
                            break

                # Strategy 4: Match by material name (case-insensitive) if no master_material_id in BOQ
                if not actual_mat and material_name:
                    actual_mat = next(
                        (am for am in actual_materials
                         if am.material_name and am.material_name.lower().strip() == material_name.lower().strip()),
                        None
                    )
                    if actual_mat:
                        matched_material_id = actual_mat.master_material_id

                # Strategy 5: Search by material name inside purchase_history
                if not actual_mat and material_name:
                    for am in actual_materials:
                        if am.purchase_history:
                            if isinstance(am.purchase_history, dict) and 'materials' in am.purchase_history:
                                for mat_entry in am.purchase_history.get('materials', []):
                                    mat_entry_name = mat_entry.get('material_name', '')
                                    if mat_entry_name.lower().strip() == material_name.lower().strip():
                                        actual_mat = am
                                        matched_material_id = mat_entry.get('master_material_id')
                                        break
                        if actual_mat:
                            break

                # Calculate planned total
                # Check if this material is from a change request (planned_quantity: 0)
                is_from_change_request = planned_mat.get('is_from_change_request', False)

                if is_from_change_request:
                    # Material from change request - use planned_quantity (should be 0)
                    planned_quantity = Decimal(str(planned_mat.get('planned_quantity', 0)))
                    planned_unit_price = Decimal(str(planned_mat.get('planned_unit_price', 0)))
                else:
                    # Regular planned material
                    planned_quantity = Decimal(str(planned_mat.get('quantity', 0)))
                    planned_unit_price = Decimal(str(planned_mat.get('unit_price', 0)))

                planned_total = planned_quantity * planned_unit_price

                # Calculate actual total from purchase history
                actual_total = Decimal('0')
                actual_quantity = Decimal('0')
                actual_avg_unit_price = Decimal('0')
                purchase_history = []

                # Check if this original material has been updated by a CR
                cr_update_data = None
                cr_update_id = None
                if not is_from_change_request:
                    # Check by material ID first
                    if master_material_id and master_material_id in cr_materials_map:
                        cr_update_data = cr_materials_map[master_material_id]['data']
                        cr_update_id = cr_materials_map[master_material_id]['cr_id']
                    # Check by material name if no ID match
                    elif material_name and material_name.lower().strip() in cr_materials_name_map:
                        cr_update_data = cr_materials_name_map[material_name.lower().strip()]['data']
                        cr_update_id = cr_materials_name_map[material_name.lower().strip()]['cr_id']

                # If this material has been updated by a CR, use CR data for actual values
                if cr_update_data:
                    # Use CR data for actual values
                    actual_quantity = Decimal(str(cr_update_data.get('quantity', 0)))
                    actual_avg_unit_price = Decimal(str(cr_update_data.get('unit_price', 0)))
                    actual_total = Decimal(str(cr_update_data.get('total_price', 0)))

                    # Add purchase history from CR
                    purchase_history.append({
                        "purchase_date": datetime.utcnow().isoformat(),
                        "quantity": float(actual_quantity),
                        "unit": cr_update_data.get('unit'),
                        "unit_price": float(actual_avg_unit_price),
                        "total_price": float(actual_total),
                        "purchased_by": f"Change Request #{cr_update_id}"
                    })
                elif actual_mat and actual_mat.purchase_history:
                    purchase_data = actual_mat.purchase_history

                    # Handle dictionary structure: {"materials": [...], "new_material": {...}, ...}
                    if isinstance(purchase_data, dict):
                        # Collect all material entries from the dictionary
                        all_material_entries = []

                        # Check for 'materials' array
                        if 'materials' in purchase_data and isinstance(purchase_data['materials'], list):
                            all_material_entries.extend(purchase_data['materials'])

                        # Check for other fields that contain material objects (like 'new_material')
                        for key, value in purchase_data.items():
                            if key != 'materials' and isinstance(value, dict):
                                # Check if this dict has material fields
                                if 'material_name' in value or 'master_material_id' in value:
                                    all_material_entries.append(value)

                        # Process all material entries
                        for mat_entry in all_material_entries:
                            # Check if this material matches by ID or by name
                            entry_mat_id = mat_entry.get('master_material_id')
                            entry_mat_name = mat_entry.get('material_name', '')

                            is_match = False
                            if matched_material_id and entry_mat_id == matched_material_id:
                                is_match = True
                            elif not matched_material_id and material_name and entry_mat_name.lower().strip() == material_name.lower().strip():
                                is_match = True

                            if is_match:
                                purchase_qty = Decimal(str(mat_entry.get('quantity', 0)))
                                purchase_price = Decimal(str(mat_entry.get('unit_price', 0)))
                                purchase_total = Decimal(str(mat_entry.get('total_price', 0)))

                                actual_quantity += purchase_qty
                                actual_total += purchase_total

                                purchase_history.append({
                                    "purchase_date": actual_mat.created_at.isoformat() if actual_mat.created_at else None,
                                    "quantity": float(purchase_qty),
                                    "unit": mat_entry.get('unit', planned_mat.get('unit')),
                                    "unit_price": float(purchase_price),
                                    "total_price": float(purchase_total),
                                    "purchased_by": actual_mat.created_by or "Unknown"
                                })

                    # Handle new structure: [{...}, {...}]
                    elif isinstance(purchase_data, list):
                        for purchase in purchase_data:
                            purchase_qty = Decimal(str(purchase.get('quantity', 0)))
                            purchase_price = Decimal(str(purchase.get('unit_price', 0)))
                            purchase_total = Decimal(str(purchase.get('total_price', 0)))

                            actual_quantity += purchase_qty
                            actual_total += purchase_total

                            purchase_history.append({
                                "purchase_date": purchase.get('purchase_date'),
                                "quantity": float(purchase_qty),
                                "unit_price": float(purchase_price),
                                "total_price": float(purchase_total),
                                "purchased_by": purchase.get('purchased_by')
                            })

                    if actual_quantity > 0:
                        actual_avg_unit_price = actual_total / actual_quantity

                # For change request materials without purchase_history yet,
                # use the quantity/price from the CR data itself
                if is_from_change_request and actual_quantity == 0:
                    # Get actual values from the CR material data
                    actual_quantity = Decimal(str(planned_mat.get('quantity', 0)))
                    actual_avg_unit_price = Decimal(str(planned_mat.get('unit_price', 0)))
                    actual_total = Decimal(str(planned_mat.get('total_price', 0)))

                    # Add purchase history from CR
                    purchase_history.append({
                        "purchase_date": datetime.utcnow().isoformat(),
                        "quantity": float(actual_quantity),
                        "unit": planned_mat.get('unit'),
                        "unit_price": float(actual_avg_unit_price),
                        "total_price": float(actual_total),
                        "purchased_by": f"Change Request #{planned_mat.get('change_request_id')}"
                    })

                planned_materials_total += planned_total

                # For actual total: use actual if purchased, otherwise use planned (for pending items)
                if actual_total > 0:
                    actual_materials_total += actual_total
                elif not is_from_change_request:
                    # Regular material is pending - assume planned cost
                    # But don't add CR materials if no actual data
                    actual_materials_total += planned_total

                # Calculate variances
                quantity_variance = actual_quantity - planned_quantity
                price_variance = actual_avg_unit_price - planned_unit_price
                total_variance = actual_total - planned_total

                # Determine status
                material_status = "pending"
                if actual_quantity > 0:
                    material_status = "completed"

                # For change request materials, mark as "from_change_request"
                if is_from_change_request:
                    material_status = "from_change_request"

                # Generate reason based on variance
                variance_reason = None
                variance_response = None

                if actual_quantity > 0:
                    if is_from_change_request:
                        # Special handling for CR materials - show justification in variance_reason
                        justification_preview = planned_mat.get('justification', '')
                        if justification_preview:
                            variance_reason = justification_preview
                        else:
                            variance_reason = "Unplanned item from Change Request"
                    elif cr_update_data:
                        # This material was updated via CR - show CR justification
                        justification_preview = cr_update_data.get('justification', '')
                        if justification_preview:
                            variance_reason = justification_preview
                        else:
                            variance_reason = f"Updated via Change Request #{cr_update_id}"
                    elif total_variance > 0:
                        variance_reason = f"Cost overrun: AED{float(total_variance):.2f} over budget"
                        if price_variance > 0:
                            variance_reason += f" (Price increased by AED{float(price_variance):.2f})"
                        if quantity_variance > 0:
                            variance_reason += f" (Quantity increased by {float(quantity_variance):.2f} {planned_mat.get('unit', '')})"
                    elif total_variance < 0:
                        variance_reason = f"Cost saved: AED{abs(float(total_variance)):.2f} under budget"
                    else:
                        variance_reason = "On budget"

                    # Response placeholder - can be updated later from tracking data
                    if actual_mat:
                        variance_response = actual_mat.variance_response if hasattr(actual_mat, 'variance_response') else None

                # Check if this material is from a change request
                cr_id = planned_mat.get('change_request_id') if is_from_change_request else cr_update_id
                if actual_mat and not cr_id:
                    cr_id = getattr(actual_mat, 'change_request_id', None)

                # Get justification - fetch from CR if needed
                justification_text = None
                if is_from_change_request:
                    justification_text = planned_mat.get('justification')
                    # If empty or None, try to fetch from ChangeRequest table
                    if not justification_text and cr_id:
                        cr_record = next((cr for cr in change_requests if cr.cr_id == cr_id), None)
                        if cr_record:
                            justification_text = cr_record.justification
                elif cr_update_data:
                    # Material updated via CR - get justification
                    justification_text = cr_update_data.get('justification')
                    if not justification_text and cr_update_id:
                        cr_record = next((cr for cr in change_requests if cr.cr_id == cr_update_id), None)
                        if cr_record:
                            justification_text = cr_record.justification

                materials_comparison.append({
                    "material_name": material_name,
                    "sub_item_name": sub_item_name,  # Sub item name from parent sub_item
                    "master_sub_item_id": master_sub_item_id,  # Track sub-item ID
                    "master_material_id": matched_material_id,  # Use the matched ID (could be from purchase_history)
                    "planned": {
                        "quantity": float(planned_quantity),
                        "unit": planned_mat.get('unit'),
                        "unit_price": float(planned_unit_price),
                        "total": float(planned_total)
                    },
                    "actual": {
                        "quantity": float(actual_quantity),
                        "unit": purchase_history[0].get('unit') if purchase_history else planned_mat.get('unit'),
                        "unit_price": float(actual_avg_unit_price),
                        "total": float(actual_total),
                        "purchase_history": purchase_history
                    } if actual_quantity > 0 else None,
                    "variance": {
                        "quantity": float(quantity_variance),
                        "unit": planned_mat.get('unit'),
                        "price": float(price_variance),
                        "total": float(total_variance),
                        "percentage": (float(total_variance) / float(planned_total) * 100) if planned_total > 0 else (100.0 if (is_from_change_request or cr_update_data) else 0),
                        "status": "unplanned" if (is_from_change_request or cr_update_data) else ("overrun" if total_variance > 0 else "saved" if total_variance < 0 else "on_budget")
                    } if actual_quantity > 0 else None,
                    "status": material_status,
                    "variance_reason": variance_reason,
                    "variance_response": variance_response,
                    "justification": justification_text,
                    "is_from_change_request": is_from_change_request or bool(cr_update_data),
                    "change_request_id": cr_id,
                    # IMPORTANT: source should be "original_boq" if material was in original BOQ
                    # Only NEW materials from CRs should have source="change_request"
                    # cr_update_data means: material exists in original BOQ but was updated by CR
                    "source": "change_request" if is_from_change_request else "original_boq"
                })

                # Check for unplanned materials (purchased but not in BOQ)
                # Build a set of all material IDs we've already processed
                processed_material_ids = set()
                processed_material_names = set()
                # Track processed change request materials separately (cr_id + material_name)
                processed_cr_materials = set()

                for planned_mat in planned_item.get('materials', []):
                    mat_id = planned_mat.get('master_material_id')
                    mat_name = planned_mat.get('material_name', '').lower().strip()
                    if mat_id:
                        processed_material_ids.add(mat_id)
                    if mat_name:
                        processed_material_names.add(mat_name)

                # Find materials in actual purchases that weren't in the plan
                for am in actual_materials:
                    if am.master_item_id == master_item_id or not master_item_id:
                        if am.purchase_history:
                            purchase_data = am.purchase_history

                            if isinstance(purchase_data, dict):
                                # Collect all material entries
                                all_material_entries = []

                                if 'materials' in purchase_data and isinstance(purchase_data['materials'], list):
                                    all_material_entries.extend(purchase_data['materials'])

                                for key, value in purchase_data.items():
                                    if key != 'materials' and isinstance(value, dict):
                                        if 'material_name' in value or 'master_material_id' in value:
                                            all_material_entries.append(value)

                                # Check each material entry
                                for mat_entry in all_material_entries:
                                    entry_mat_id = mat_entry.get('master_material_id')
                                    entry_mat_name = mat_entry.get('material_name', '').lower().strip()

                                    # Check if this unplanned material is from a change request
                                    is_from_cr = getattr(am, 'is_from_change_request', False)
                                    cr_id = getattr(am, 'change_request_id', None)

                                    # Check if this material is unplanned
                                    is_unplanned = True

                                    # For change request materials, check by CR ID + name combination
                                    if is_from_cr and cr_id:
                                        cr_material_key = f"{cr_id}_{entry_mat_name}"
                                        if cr_material_key in processed_cr_materials:
                                            is_unplanned = False
                                    else:
                                        # For non-CR materials, check by ID or name as before
                                        if entry_mat_id and entry_mat_id in processed_material_ids:
                                            is_unplanned = False
                                        if entry_mat_name and entry_mat_name in processed_material_names:
                                            is_unplanned = False

                                    if is_unplanned:
                                        # Add this as an unplanned material
                                        purchase_qty = Decimal(str(mat_entry.get('quantity', 0)))
                                        purchase_price = Decimal(str(mat_entry.get('unit_price', 0)))
                                        purchase_total = Decimal(str(mat_entry.get('total_price', 0)))

                                        actual_materials_total += purchase_total

                                        # Mark as processed to avoid duplicates
                                        if is_from_cr and cr_id:
                                            # Track CR materials by CR ID + name
                                            cr_material_key = f"{cr_id}_{entry_mat_name}"
                                            processed_cr_materials.add(cr_material_key)
                                        else:
                                            # Track non-CR materials by ID or name
                                            if entry_mat_id:
                                                processed_material_ids.add(entry_mat_id)
                                            if entry_mat_name:
                                                processed_material_names.add(entry_mat_name)

                                        materials_comparison.append({
                                            "material_name": mat_entry.get('material_name'),
                                            "master_material_id": entry_mat_id,
                                            "planned": None,  # Not in original BOQ
                                            "actual": {
                                                "quantity": float(purchase_qty),
                                                "unit": mat_entry.get('unit'),
                                                "unit_price": float(purchase_price),
                                                "total": float(purchase_total),
                                                "purchase_history": [{
                                                    "purchase_date": am.created_at.isoformat() if am.created_at else None,
                                                    "quantity": float(purchase_qty),
                                                    "unit": mat_entry.get('unit'),
                                                    "unit_price": float(purchase_price),
                                                    "total_price": float(purchase_total),
                                                    "purchased_by": am.created_by or "Unknown"
                                                }]
                                            },
                                            "variance": {
                                                "quantity": float(purchase_qty),
                                                "unit": mat_entry.get('unit'),
                                                "price": float(purchase_price),
                                                "total": float(purchase_total),
                                                "percentage": 0,  # No baseline to compare
                                                "status": "unplanned",
                                                "reason": mat_entry.get('reason'),
                                            },
                                            "status": "unplanned",
                                            "note": "This material was purchased but was not in the original BOQ plan",
                                            "is_from_change_request": is_from_cr,
                                            "change_request_id": cr_id,
                                            "source": "change_request" if is_from_cr else "unplanned"
                                        })

            # Add NEW CR materials (that don't update existing materials)
            for cr_mat_info in cr_new_materials:
                cr_mat_data = cr_mat_info['data']
                cr_sub_item_name = cr_mat_info['sub_item_name']
                cr_master_sub_item_id = cr_mat_info.get('master_sub_item_id')

                material_name = cr_mat_data.get('material_name')
                master_material_id = cr_mat_data.get('master_material_id')
                cr_id = cr_mat_data.get('change_request_id')

                # For NEW CR materials, planned values are 0
                planned_quantity = Decimal('0')
                planned_unit_price = Decimal('0')
                planned_total = Decimal('0')

                # Actual values from CR
                actual_quantity = Decimal(str(cr_mat_data.get('quantity', 0)))
                actual_avg_unit_price = Decimal(str(cr_mat_data.get('unit_price', 0)))
                actual_total = Decimal(str(cr_mat_data.get('total_price', 0)))

                # Add to totals
                actual_materials_total += actual_total

                # Purchase history
                purchase_history = [{
                    "purchase_date": datetime.utcnow().isoformat(),
                    "quantity": float(actual_quantity),
                    "unit": cr_mat_data.get('unit'),
                    "unit_price": float(actual_avg_unit_price),
                    "total_price": float(actual_total),
                    "purchased_by": f"Change Request #{cr_id}"
                }]

                # Get justification
                justification_text = cr_mat_data.get('justification')
                if not justification_text and cr_id:
                    cr_record = next((cr for cr in change_requests if cr.cr_id == cr_id), None)
                    if cr_record:
                        justification_text = cr_record.justification

                materials_comparison.append({
                    "material_name": material_name,
                    "sub_item_name": cr_sub_item_name,
                    "master_sub_item_id": cr_master_sub_item_id,
                    "master_material_id": master_material_id,
                    "planned": {
                        "quantity": 0,
                        "unit": cr_mat_data.get('unit'),
                        "unit_price": 0,
                        "total": 0
                    },
                    "actual": {
                        "quantity": float(actual_quantity),
                        "unit": cr_mat_data.get('unit'),
                        "unit_price": float(actual_avg_unit_price),
                        "total": float(actual_total),
                        "purchase_history": purchase_history
                    },
                    "variance": {
                        "quantity": float(actual_quantity),
                        "unit": cr_mat_data.get('unit'),
                        "price": float(actual_avg_unit_price),
                        "total": float(actual_total),
                        "percentage": 100.0,
                        "status": "unplanned"
                    },
                    "status": "from_change_request",
                    "variance_reason": justification_text or "New item from Change Request",
                    "variance_response": None,
                    "justification": justification_text,
                    "is_from_change_request": True,
                    "change_request_id": cr_id,
                    "source": "change_request"
                })

            # Labour comparison
            labour_comparison = []
            planned_labour_total = Decimal('0')
            actual_labour_total = Decimal('0')

            for planned_lab in planned_item.get('labour', []):
                master_labour_id = planned_lab.get('master_labour_id')

                # Find actual labour tracking for this role - Try exact match first
                actual_lab = next(
                    (al for al in actual_labour
                     if al.master_labour_id == master_labour_id
                     and al.master_item_id == master_item_id),
                    None
                )

                # Fallback: match by labour_id only
                if not actual_lab:
                    actual_lab = next(
                        (al for al in actual_labour
                         if al.master_labour_id == master_labour_id),
                        None
                    )

                # Calculate planned total
                planned_hours = Decimal(str(planned_lab.get('hours', 0)))
                planned_rate = Decimal(str(planned_lab.get('rate_per_hour', 0)))
                planned_total = planned_hours * planned_rate

                # Calculate actual total from labour history
                actual_total = Decimal('0')
                actual_hours = Decimal('0')
                actual_avg_rate = Decimal('0')
                labour_history = []

                if actual_lab and actual_lab.labour_history:
                    for work_entry in actual_lab.labour_history:
                        work_hours = Decimal(str(work_entry.get('hours', 0)))
                        work_rate = Decimal(str(work_entry.get('rate_per_hour', 0)))
                        work_total = Decimal(str(work_entry.get('total_cost', 0)))

                        actual_hours += work_hours
                        actual_total += work_total

                        labour_history.append({
                            "work_date": work_entry.get('work_date'),
                            "hours": float(work_hours),
                            "rate_per_hour": float(work_rate),
                            "total_cost": float(work_total),
                            "worker_name": work_entry.get('worker_name'),
                            "notes": work_entry.get('notes')
                        })

                    if actual_hours > 0:
                        actual_avg_rate = actual_total / actual_hours

                planned_labour_total += planned_total

                # For actual total: use actual if recorded, otherwise use planned (for pending items)
                if actual_total > 0:
                    actual_labour_total += actual_total
                else:
                    # Labour is pending - assume planned cost
                    actual_labour_total += planned_total

                # Calculate variances
                hours_variance = actual_hours - planned_hours
                rate_variance = actual_avg_rate - planned_rate
                total_variance = actual_total - planned_total

                # Determine status
                labour_status = "pending"
                if actual_lab and actual_hours > 0:
                    labour_status = "completed"

                labour_comparison.append({
                    "labour_role": planned_lab.get('labour_role'),
                    "master_labour_id": master_labour_id,
                    "planned": {
                        "hours": float(planned_hours),
                        "rate_per_hour": float(planned_rate),
                        "total": float(planned_total)
                    },
                    "actual": {
                        "hours": float(actual_hours),
                        "rate_per_hour": float(actual_avg_rate),
                        "total": float(actual_total),
                        "labour_history": labour_history
                    } if actual_lab and actual_hours > 0 else None,
                    "variance": {
                        "hours": float(hours_variance),
                        "rate": float(rate_variance),
                        "total": float(total_variance),
                        "percentage": (float(total_variance) / float(planned_total) * 100) if planned_total > 0 else 0
                    } if actual_lab and actual_hours > 0 else None,
                    "status": labour_status
                })

            # NEW FLOW: Calculate overhead, profit, and miscellaneous at SUB-ITEM level
            # Then aggregate to item level

            # Calculate planned amounts from sub-items
            planned_base = Decimal('0')
            planned_overhead = Decimal('0')
            planned_profit = Decimal('0')
            planned_miscellaneous = Decimal('0')
            planned_transport = Decimal('0')
            planned_total = Decimal('0')
            planned_discount_amount = Decimal('0')

            # Calculate actual amounts from sub-items
            actual_base = Decimal('0')
            actual_overhead = Decimal('0')
            actual_profit = Decimal('0')
            actual_miscellaneous = Decimal('0')
            actual_transport = Decimal('0')
            actual_total = Decimal('0')
            actual_discount_amount = Decimal('0')

            sub_items_breakdown = []

            for sub_item in planned_item.get('sub_items', []):
                sub_item_name = sub_item.get('sub_item_name', '')
                master_sub_item_id = sub_item.get('master_sub_item_id')

                # Get the base_total (client rate) from sub-item
                # This is the main amount on which percentages are calculated
                sub_item_base_total = Decimal(str(sub_item.get('base_total', 0)))

                # Also track internal costs (materials + labour) for comparison
                sub_item_materials_cost = Decimal(str(sub_item.get('materials_cost', 0)))
                sub_item_labour_cost = Decimal(str(sub_item.get('labour_cost', 0)))
                sub_item_internal_cost = sub_item_materials_cost + sub_item_labour_cost

                # Get percentages from sub-item or use defaults
                misc_pct = Decimal(str(sub_item.get('misc_percentage', 10)))
                overhead_profit_pct = Decimal(str(sub_item.get('overhead_profit_percentage', 25)))
                transport_pct = Decimal(str(sub_item.get('transport_percentage', 5)))

                # IMPORTANT: Calculate based on base_total (client rate), NOT internal cost
                # This is the correct calculation flow as per your example
                sub_planned_misc = sub_item_base_total * (misc_pct / 100)
                sub_planned_overhead_profit = sub_item_base_total * (overhead_profit_pct / 100)
                sub_planned_transport = sub_item_base_total * (transport_pct / 100)

                # Split overhead/profit 40/60 (common industry practice)
                sub_planned_overhead = sub_planned_overhead_profit * Decimal('0.4')
                sub_planned_profit = sub_planned_overhead_profit * Decimal('0.6')

                # Get discount if available
                sub_discount_pct = Decimal(str(sub_item.get('discount_percentage', 0)))
                sub_discount_amount = Decimal(str(sub_item.get('discount_amount', 0)))

                # If no discount_amount but has percentage, calculate it based on base_total
                if sub_discount_amount == 0 and sub_discount_pct > 0:
                    sub_discount_amount = sub_item_base_total * (sub_discount_pct / 100)

                # CORRECT FORMULA: Total = Materials + Labour + Misc + Overhead + Profit + Transport - Discount
                sub_planned_total = (sub_item_materials_cost + sub_item_labour_cost +
                                   sub_planned_misc + sub_planned_overhead + sub_planned_profit +
                                   sub_planned_transport - sub_discount_amount)

                # Calculate actual internal cost from tracking
                sub_actual_materials_cost = Decimal('0')
                sub_actual_labour_cost = Decimal('0')

                # Get actual materials for this sub-item from tracking
                for mat in materials_comparison:
                    if mat.get('sub_item_name') == sub_item_name or mat.get('master_sub_item_id') == master_sub_item_id:
                        if mat.get('actual') and mat['actual'].get('total'):
                            sub_actual_materials_cost += Decimal(str(mat['actual']['total']))
                        elif mat.get('planned') and mat['planned'].get('total'):
                            # If not purchased yet, use planned as estimate
                            sub_actual_materials_cost += Decimal(str(mat['planned']['total']))

                # Get actual labour for this sub-item (from labour tracking if available)
                for lab in sub_item.get('labour', []):
                    lab_cost = Decimal(str(lab.get('total_cost', 0)))
                    sub_actual_labour_cost += lab_cost

                sub_actual_internal_cost = sub_actual_materials_cost + sub_actual_labour_cost

                # Actual percentages stay the same (based on base_total)
                sub_actual_misc = sub_item_base_total * (misc_pct / 100)  # Same as planned
                sub_actual_overhead = sub_planned_overhead  # Same as planned
                sub_actual_transport = sub_planned_transport  # Same as planned

                # Actual profit = we don't calculate from percentages, it's what remains
                # For now, use planned profit (will be adjusted by consumption flow later)
                sub_actual_profit = sub_planned_profit

                # CORRECT FORMULA: Total = Materials + Labour + Misc + Overhead + Profit + Transport - Discount
                sub_actual_total = (sub_actual_materials_cost + sub_actual_labour_cost +
                                  sub_actual_misc + sub_actual_overhead + sub_actual_profit +
                                  sub_actual_transport - sub_discount_amount)

                # Aggregate to item level (planned)
                planned_base += sub_item_base_total
                planned_materials_total += sub_item_materials_cost
                planned_labour_total += sub_item_labour_cost
                planned_miscellaneous += sub_planned_misc
                planned_overhead += sub_planned_overhead
                planned_profit += sub_planned_profit
                planned_transport += sub_planned_transport
                planned_discount_amount += sub_discount_amount
                planned_total += sub_planned_total

                # Aggregate to item level (actual) - using actual internal costs
                actual_base += sub_item_base_total  # Client rate stays the same
                actual_materials_total += sub_actual_materials_cost
                actual_labour_total += sub_actual_labour_cost
                actual_miscellaneous += sub_actual_misc  # Misc % stays the same
                actual_overhead += sub_actual_overhead  # Overhead % stays the same
                actual_profit += sub_actual_profit  # Profit varies based on actual spending
                actual_transport += sub_actual_transport  # Transport % stays the same
                actual_discount_amount += sub_discount_amount  # Discount stays the same
                actual_total += sub_actual_total  # Total varies based on actual costs

                # Store sub-item breakdown for transparency
                sub_items_breakdown.append({
                    'sub_item_name': sub_item_name,
                    'master_sub_item_id': master_sub_item_id,
                    'base_total': float(sub_item_base_total),  # Client rate
                    'planned_internal_cost': float(sub_item_internal_cost),
                    'actual_internal_cost': float(sub_actual_internal_cost),
                    'materials_cost': {
                        'planned': float(sub_item_materials_cost),
                        'actual': float(sub_actual_materials_cost)
                    },
                    'labour_cost': {
                        'planned': float(sub_item_labour_cost),
                        'actual': float(sub_actual_labour_cost)
                    },
                    'miscellaneous': {
                        'percentage': float(misc_pct),
                        'amount': float(sub_planned_misc)
                    },
                    'overhead': {
                        'percentage': float(overhead_profit_pct * Decimal('0.4')),
                        'amount': float(sub_planned_overhead)
                    },
                    'profit': {
                        'percentage': float(overhead_profit_pct * Decimal('0.6')),
                        'planned_amount': float(sub_planned_profit),
                        'actual_amount': float(sub_actual_profit)
                    },
                    'transport': {
                        'percentage': float(transport_pct),
                        'amount': float(sub_planned_transport)
                    },
                    'discount': {
                        'percentage': float(sub_discount_pct),
                        'amount': float(sub_discount_amount)
                    },
                    'planned_total': float(sub_planned_total),
                    'actual_total': float(sub_actual_total),
                    'calculation_note': 'Total = Materials + Labour + Misc + Overhead + Profit + Transport - Discount'
                })

            # Get overall percentages for display (from item level)
            overhead_pct = Decimal(str(planned_item.get('overhead_percentage', 0)))
            profit_pct = Decimal(str(planned_item.get('profit_margin_percentage', 0)))
            misc_pct = Decimal(str(planned_item.get('miscellaneous_percentage', 10)))

            # The selling price BEFORE discount is calculated from sub-items
            selling_price_before_discount = planned_base

            # USE BOQ-LEVEL DISCOUNT (from top-level boq_data)
            # If sub-item level discount exists, use that; otherwise use BOQ-level discount
            item_discount_amount = planned_discount_amount if planned_discount_amount > 0 else Decimal('0')
            item_discount_percentage = Decimal('0')

            # If no sub-item discount and BOQ has discount, calculate item's share
            if item_discount_amount == 0 and boq_level_discount_amount > 0:
                # Apply BOQ-level discount amount directly to this item
                item_discount_amount = boq_level_discount_amount
                item_discount_percentage = boq_level_discount_percentage
            elif item_discount_amount > 0 and selling_price_before_discount > 0:
                # Calculate percentage from sub-item discount
                item_discount_percentage = (item_discount_amount / selling_price_before_discount) * 100

            # If still no discount amount but have percentage, calculate it
            if item_discount_amount == 0 and item_discount_percentage > 0 and selling_price_before_discount > 0:
                item_discount_amount = selling_price_before_discount * (item_discount_percentage / 100)

            # Calculate Client Amount (Grand Total) after discount
            # This is the actual amount client will pay
            client_amount_after_discount = selling_price_before_discount - item_discount_amount

            # Calculate profit BEFORE giving discount to client
            # This shows profit if we kept the discount as margin
            profit_before_discount = selling_price_before_discount - actual_total

            # Calculate actual profit after giving discount to client
            # Actual Profit = Client Amount (after discount) - Total Actual Spending
            after_discount_actual_profit = client_amount_after_discount - actual_total

            # The selling price shown to client (after discount)
            selling_price = client_amount_after_discount

            # 1. Calculate extra costs from material/labour overruns and unplanned items
            extra_costs = Decimal('0')

            # Add overspend from planned materials (only positive variances)
            for mat_comp in materials_comparison:
                if mat_comp.get('status') == 'completed' and mat_comp.get('variance'):
                    # Only count if we overspent (positive variance)
                    mat_variance = Decimal(str(mat_comp['variance'].get('total', 0)))
                    if mat_variance > 0:
                        extra_costs += mat_variance
                elif mat_comp.get('status') in ['unplanned', 'from_change_request'] and mat_comp.get('actual'):
                    # Add full cost of unplanned materials or change request materials
                    unplanned_cost = Decimal(str(mat_comp['actual'].get('total', 0)))
                    extra_costs += unplanned_cost

            # Add overspend from labour (only positive variances)
            for lab_comp in labour_comparison:
                if lab_comp.get('status') == 'completed' and lab_comp.get('variance'):
                    lab_variance = Decimal(str(lab_comp['variance'].get('total', 0)))
                    if lab_variance > 0:
                        extra_costs += lab_variance

            # 2. Consumption flow: extra costs consume miscellaneous first, then overhead, then profit
            remaining_miscellaneous = planned_miscellaneous
            remaining_overhead = planned_overhead
            remaining_profit = planned_profit
            misc_consumed = Decimal('0')
            overhead_consumed = Decimal('0')
            profit_consumed = Decimal('0')

            if extra_costs > 0:
                # Step 1: Consume miscellaneous first
                misc_consumed = min(extra_costs, planned_miscellaneous)
                remaining_miscellaneous = planned_miscellaneous - misc_consumed

                # Step 2: If extra costs exceed miscellaneous, consume overhead
                if extra_costs > planned_miscellaneous:
                    excess_after_misc = extra_costs - planned_miscellaneous
                    overhead_consumed = min(excess_after_misc, planned_overhead)
                    remaining_overhead = planned_overhead - overhead_consumed

                    # Step 3: If extra costs exceed miscellaneous + overhead, consume profit
                    if excess_after_misc > planned_overhead:
                        excess_after_overhead = excess_after_misc - planned_overhead
                        profit_consumed = min(excess_after_overhead, planned_profit)
                        remaining_profit = planned_profit - profit_consumed
            else:
                # No extra costs - keep full miscellaneous, overhead and profit
                remaining_miscellaneous = planned_miscellaneous
                remaining_overhead = planned_overhead
                remaining_profit = planned_profit

            # 3. Update actual amounts based on consumption (if needed for consumption flow display)
            # But don't recalculate actual_total - it's already correctly calculated from sub-items
            remaining_actual_miscellaneous = actual_miscellaneous - misc_consumed
            remaining_actual_overhead = actual_overhead - overhead_consumed
            remaining_actual_profit = actual_profit - profit_consumed

            # 4. actual_total is already correctly calculated from sub-items aggregation
            # Don't recalculate it here!

            # 5. Calculate variances
            base_cost_variance = actual_base - planned_base  # For reporting
            misc_variance = remaining_actual_miscellaneous - planned_miscellaneous
            overhead_variance = remaining_actual_overhead - planned_overhead
            profit_variance = remaining_actual_profit - planned_profit

            # Calculate savings/overrun (use absolute values for display)
            cost_savings = abs(planned_base - actual_base)  # Always positive
            misc_diff = abs(planned_miscellaneous - actual_miscellaneous)  # Always positive
            overhead_diff = abs(planned_overhead - actual_overhead)  # Always positive
            profit_diff = abs(planned_profit - actual_profit)  # Always positive

           # Calculate completion percentage
            total_materials = len(planned_item.get('materials', []))
            total_labour = len(planned_item.get('labour', []))
            completed_materials = len([m for m in materials_comparison if m['status'] == 'completed'])
            completed_labour = len([l for l in labour_comparison if l['status'] == 'completed'])
            unplanned_materials = len([m for m in materials_comparison if m['status'] == 'unplanned'])

            # Count unplanned materials as "completed" since they were purchased
            completion_percentage = 0
            if (total_materials + total_labour) > 0:
                completion_percentage = ((completed_materials + completed_labour + unplanned_materials) / (total_materials + total_labour)) * 100

            item_comparison = {
                "item_name": planned_item.get('item_name'),
                "master_item_id": master_item_id,
                "description": planned_item.get('description'),
                "discount_details": {
                    "has_discount": float(item_discount_amount) > 0,
                    "client_cost_before_discount": float(selling_price_before_discount),
                    "discount_percentage": float(item_discount_percentage),
                    "discount_amount": float(item_discount_amount),
                    "grand_total_after_discount": float(client_amount_after_discount),
                    "profit_impact": {
                        "profit_before_discount": float(profit_before_discount),
                        "profit_after_discount": float(after_discount_actual_profit),
                        "profit_reduction": float(profit_before_discount - after_discount_actual_profit)
                    }
                },
                "completion_status": {
                    "percentage": round(completion_percentage, 2),
                    "materials_completed": f"{completed_materials}/{total_materials}",
                    "labour_completed": f"{completed_labour}/{total_labour}",
                    "unplanned_materials": unplanned_materials,
                    "is_fully_completed": completion_percentage == 100,
                    "note": f"{unplanned_materials} unplanned material(s) purchased" if unplanned_materials > 0 else None
                },
                "materials": materials_comparison,
                "labour": labour_comparison,
                "sub_items_breakdown": sub_items_breakdown,  # NEW: Sub-item level breakdown
                "planned": {
                    "materials_total": float(planned_materials_total),
                    "labour_total": float(planned_labour_total),
                    "base_cost": float(planned_base),
                    "client_amount_before_discount": float(selling_price_before_discount),
                    "discount_amount": float(item_discount_amount),
                    "discount_percentage": float(item_discount_percentage),
                    "client_amount_after_discount": float(client_amount_after_discount),
                    "grand_total": float(client_amount_after_discount),
                    "miscellaneous_amount": float(planned_miscellaneous),
                    "miscellaneous_percentage": float(misc_pct),
                    "overhead_amount": float(planned_overhead),
                    "overhead_percentage": float(overhead_pct),
                    "profit_amount": float(planned_profit),
                    "profit_percentage": float(profit_pct),
                    "transport_amount": float(planned_transport),
                    "total": float(planned_total),
                    "selling_price": float(selling_price)
                },
                "actual": {
                    "materials_total": float(actual_materials_total),
                    "labour_total": float(actual_labour_total),
                    "base_cost": float(actual_base),
                    "client_amount_before_discount": float(selling_price_before_discount),
                    "discount_amount": float(item_discount_amount),
                    "discount_percentage": float(item_discount_percentage),
                    "client_amount_after_discount": float(client_amount_after_discount),
                    "grand_total": float(client_amount_after_discount),
                    "profit_before_discount": float(profit_before_discount),
                    "actual_profit": float(after_discount_actual_profit),
                    "miscellaneous_amount": float(actual_miscellaneous),
                    "miscellaneous_percentage": float(misc_pct),
                    "overhead_amount": float(actual_overhead),
                    "overhead_percentage": float(overhead_pct),
                    "profit_amount": float(actual_profit),
                    "profit_percentage": (float(actual_profit) / float(selling_price) * 100) if selling_price > 0 else 0,
                    "transport_amount": float(actual_transport),
                    "total": float(actual_total),
                    "selling_price": float(selling_price)
                },
                "consumption_flow": {
                    "extra_costs": float(extra_costs),
                    "base_cost_variance": float(base_cost_variance),
                    "variance_status": "overspent" if extra_costs > 0 else "saved",
                    "miscellaneous_consumed": float(misc_consumed),
                    "miscellaneous_remaining": float(remaining_actual_miscellaneous),
                    "miscellaneous_variance": float(misc_variance),
                    "overhead_consumed": float(overhead_consumed),
                    "overhead_remaining": float(remaining_actual_overhead),
                    "overhead_variance": float(overhead_variance),
                    "profit_consumed": float(profit_consumed),
                    "profit_remaining": float(remaining_actual_profit),
                    "profit_variance": float(profit_variance),
                    "explanation": "Extra costs (overruns + unplanned items) consume miscellaneous first, then overhead, then profit. Calculations are done at sub-item level and aggregated."
                },
                "savings_breakdown": {
                    "total_cost_savings": float(cost_savings),
                    "miscellaneous_difference": float(misc_diff),
                    "overhead_difference": float(overhead_diff),
                    "profit_difference": float(profit_diff),
                    "note": "All values shown as absolute (positive) amounts for clarity. Calculated from sub-item level."
                },
                "variance": {
                    "materials": {
                        "amount": float(abs(actual_materials_total - planned_materials_total)),
                        "status": "saved" if (planned_materials_total - actual_materials_total) > 0 else "overrun"
                    },
                    "labour": {
                        "amount": float(abs(actual_labour_total - planned_labour_total)),
                        "status": "saved" if (planned_labour_total - actual_labour_total) > 0 else "overrun"
                    },
                    "base_cost": {
                        "amount": float(abs(actual_base - planned_base)),
                        "status": "saved" if (planned_base - actual_base) > 0 else "overrun"
                    },
                    "miscellaneous": {
                        "planned": float(planned_miscellaneous),
                        "actual": float(remaining_actual_miscellaneous),
                        "difference": float(abs(misc_variance))
                    },
                    "overhead": {
                        "planned": float(planned_overhead),
                        "actual": float(remaining_actual_overhead),
                        "difference": float(abs(overhead_variance))
                    },
                    "profit": {
                        "planned": float(planned_profit),
                        "actual": float(remaining_actual_profit),
                        "difference": float(abs(profit_variance))
                    }
                }
            }

            comparison['items'].append(item_comparison)

        # Calculate overall summary
        total_base_cost = sum(float(item['planned']['base_cost']) for item in comparison['items'])  # Base cost
        total_client_amount_before_discount = sum(float(item['planned']['client_amount_before_discount']) for item in comparison['items'])
        total_planned = sum(float(item['planned']['total']) for item in comparison['items'])
        total_actual = sum(float(item['actual']['total']) for item in comparison['items'])
        total_discount_amount = sum(float(item['planned']['discount_amount']) for item in comparison['items'])
        total_client_amount_after_discount = sum(float(item['planned']['client_amount_after_discount']) for item in comparison['items'])
        total_profit_before_discount = sum(float(item['actual']['profit_before_discount']) for item in comparison['items'])
        total_after_discount_profit = sum(float(item['actual']['actual_profit']) for item in comparison['items'])
        total_planned_miscellaneous = sum(float(item['planned']['miscellaneous_amount']) for item in comparison['items'])
        total_actual_miscellaneous = sum(float(item['actual']['miscellaneous_amount']) for item in comparison['items'])
        total_planned_overhead = sum(float(item['planned']['overhead_amount']) for item in comparison['items'])
        total_actual_overhead = sum(float(item['actual']['overhead_amount']) for item in comparison['items'])
        total_planned_profit = sum(float(item['planned']['profit_amount']) for item in comparison['items'])
        total_actual_profit = sum(float(item['actual']['profit_amount']) for item in comparison['items'])
        total_planned_transport = sum(float(item['planned']['transport_amount']) for item in comparison['items'])
        total_actual_transport = sum(float(item['actual']['transport_amount']) for item in comparison['items'])

        # Calculate overall discount percentage
        total_discount_percentage = (total_discount_amount / total_client_amount_before_discount * 100) if total_client_amount_before_discount > 0 else 0

        # Calculate total extra costs that exceeded buffers (losses)
        total_extra_costs = Decimal('0')
        total_misc_consumed = Decimal('0')
        total_overhead_consumed = Decimal('0')
        total_profit_consumed = Decimal('0')

        for item in comparison['items']:
            consumption_flow = item.get('consumption_flow', {})
            extra_costs = Decimal(str(consumption_flow.get('extra_costs', 0)))
            misc_consumed = Decimal(str(consumption_flow.get('miscellaneous_consumed', 0)))
            overhead_consumed = Decimal(str(consumption_flow.get('overhead_consumed', 0)))
            profit_consumed = Decimal(str(consumption_flow.get('profit_consumed', 0)))

            total_extra_costs += extra_costs
            total_misc_consumed += misc_consumed
            total_overhead_consumed += overhead_consumed
            total_profit_consumed += profit_consumed

        # Calculate net loss (costs that exceeded all buffers)
        total_loss_beyond_buffers = total_extra_costs - total_misc_consumed - total_overhead_consumed - total_profit_consumed

        # Calculate actual profit using formula: Base Cost (Selling Price) - Total Actual Spending
        actual_project_profit = total_base_cost - total_actual

        comparison['summary'] = {
            "base_cost": float(total_base_cost),  # Add base cost to summary
            "client_amount_before_discount": float(total_client_amount_before_discount),
            "discount_amount": float(total_discount_amount),
            "discount_percentage": float(total_discount_percentage),
            "client_amount_after_discount": float(total_client_amount_after_discount),
            "grand_total": float(total_client_amount_after_discount),
            "profit_before_discount": float(total_profit_before_discount),
            "actual_profit": float(total_after_discount_profit),
            "discount_details": {
                "has_discount": float(total_discount_amount) > 0,
                "client_cost_before_discount": float(total_client_amount_before_discount),
                "discount_percentage": float(total_discount_percentage),
                "discount_amount": float(total_discount_amount),
                "grand_total_after_discount": float(total_client_amount_after_discount),
                "profit_impact": {
                    "profit_before_discount": float(total_profit_before_discount),
                    "profit_after_discount": float(total_after_discount_profit),
                    "profit_reduction": float(total_profit_before_discount - total_after_discount_profit)
                }
            },
            "planned_total": float(total_planned),
            "actual_total": float(total_actual),
            "variance": float(abs(total_actual - total_planned)),  # Always positive number
            "variance_percentage": float(abs((total_actual - total_planned) / total_planned * 100)) if total_planned > 0 else 0,
            "status": "under_budget" if total_actual < total_planned else "over_budget" if total_actual > total_planned else "on_budget",
            "total_planned_miscellaneous": float(total_planned_miscellaneous),
            "total_actual_miscellaneous": float(total_actual_miscellaneous),
            "miscellaneous_variance": float(abs(total_actual_miscellaneous - total_planned_miscellaneous)),
            "total_planned_overhead": float(total_planned_overhead),
            "total_actual_overhead": float(total_actual_overhead),
            "overhead_variance": float(abs(total_actual_overhead - total_planned_overhead)),
            "total_planned_profit": float(total_planned_profit),
            "total_actual_profit": float(actual_project_profit),  # Use simple formula: Planned - Actual
            "profit_variance": float(abs(actual_project_profit - total_planned_profit)),
            "profit_status": "loss" if actual_project_profit < 0 else ("reduced" if actual_project_profit < total_planned_profit else "maintained" if actual_project_profit == total_planned_profit else "increased"),
            "total_planned_transport": float(total_planned_transport),
            "total_actual_transport": float(total_actual_transport),
            "transport_variance": float(abs(total_actual_transport - total_planned_transport)),
            "total_buffers": float(total_actual_miscellaneous + total_actual_overhead + actual_project_profit + total_actual_transport),
            "planned_buffers": float(total_planned_miscellaneous + total_planned_overhead + total_planned_profit + total_planned_transport),
            "total_extra_costs": float(total_extra_costs),
            "total_miscellaneous_consumed": float(total_misc_consumed),
            "total_overhead_consumed": float(total_overhead_consumed),
            "total_profit_consumed": float(total_profit_consumed),
            "total_loss_beyond_buffers": float(total_loss_beyond_buffers),
            "calculation_note": "Client Amount (Before Discount) is the base selling price. Discount = Client Amount × Discount %. Grand Total (Client Amount After Discount) = Client Amount - Discount. Actual Profit = Grand Total - Actual Total Spending."
        }

        return jsonify(comparison), 200

    except Exception as e:
        log.error(f"Error getting planned vs actual: {str(e)}")
        return jsonify({"error": f"Failed to get comparison: {str(e)}"}), 500
