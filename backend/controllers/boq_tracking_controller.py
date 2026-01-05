from flask import request, jsonify, g
from config.db import db
from models.boq import *
from models.project import Project
from config.logging import get_logger
from datetime import datetime
from decimal import Decimal
import json
from models.change_request import ChangeRequest
from models.lpo_customization import LPOCustomization

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

        # Extract preliminaries data from BOQ
        preliminaries_data = boq_data.get('preliminaries', {})
        preliminary_cost_details = preliminaries_data.get('cost_details', {})

        # Convert all preliminary values to Decimal for consistent calculations
        preliminary_amount = Decimal(str(preliminary_cost_details.get('amount', 0) or 0))
        preliminary_quantity = float(preliminary_cost_details.get('quantity', 0) or 0)
        preliminary_unit = preliminary_cost_details.get('unit', 'Nos') or 'Nos'
        preliminary_rate = Decimal(str(preliminary_cost_details.get('rate', 0) or 0))

        # Calculate preliminary internal cost breakdown
        preliminary_internal_cost = Decimal(str(preliminary_cost_details.get('internal_cost', 0) or 0))
        preliminary_misc_amount = Decimal(str(preliminary_cost_details.get('misc_amount', 0) or 0))
        preliminary_overhead_profit_amount = Decimal(str(preliminary_cost_details.get('overhead_profit_amount', 0) or 0))
        preliminary_transport_amount = Decimal(str(preliminary_cost_details.get('transport_amount', 0) or 0))
        preliminary_planned_profit = Decimal(str(preliminary_cost_details.get('planned_profit', 0) or 0))

        # Fetch ALL change requests (regardless of status) to show in comparison
        change_requests = ChangeRequest.query.filter_by(
            boq_id=boq_id,
            is_deleted=False
        ).all()

        # Merge CR materials into BOQ data as sub-items
        # IMPORTANT: Only add truly NEW materials, not updates to existing materials
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
                # First, collect all existing materials from the target item to check for duplicates
                existing_materials_ids = set()
                existing_materials_names = set()

                for sub_item in target_item.get('sub_items', []):
                    for existing_mat in sub_item.get('materials', []):
                        mat_id = existing_mat.get('master_material_id')
                        mat_name = existing_mat.get('material_name', '').lower().strip()
                        if mat_id:
                            existing_materials_ids.add(mat_id)
                        if mat_name:
                            existing_materials_names.add(mat_name)

                # Ensure sub_items array exists
                if 'sub_items' not in target_item:
                    target_item['sub_items'] = []

                # Create CR sub-item - but only add truly NEW materials
                cr_new_materials = []

                # Filter materials: only include NEW materials, not updates to existing ones
                for mat in materials_data:
                    mat_id = mat.get('master_material_id')
                    mat_name = mat.get('material_name', '').lower().strip()

                    # Check if this material already exists in the BOQ
                    is_updating_existing = False
                    if mat_id and mat_id in existing_materials_ids:
                        is_updating_existing = True
                    elif mat_name and mat_name in existing_materials_names:
                        is_updating_existing = True

                    # Only add if it's a NEW material (not updating existing)
                    if not is_updating_existing:
                        # Use CR-level justification if material doesn't have its own
                        material_justification = mat.get('justification') or cr.justification or ''

                        cr_new_materials.append({
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

                # Only create and add the CR sub-item if there are NEW materials
                if cr_new_materials:
                    cr_sub_item = {
                        'sub_item_name': f"Extra Materials - CR #{cr.cr_id}",
                        'description': f"{cr.justification} [Status: {cr.status}]",
                        'materials': cr_new_materials
                    }
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

        # Calculate total items base cost for preliminary distribution
        # This is needed to calculate each item's proportional share of preliminaries
        # Use base_total (same as planned_base calculation) to ensure consistency
        total_items_base_cost = Decimal('0')
        for item in boq_data.get('items', []):
            for sub_item in item.get('sub_items', []):
                # IMPORTANT: Calculate base_total from quantity × rate to ensure correctness
                sub_item_quantity = Decimal(str(sub_item.get('quantity', 1)))
                sub_item_rate = Decimal(str(sub_item.get('rate', 0)))

                # Calculate base_total as quantity × rate if both are available
                if sub_item_quantity > 0 and sub_item_rate > 0:
                    sub_item_base_total = sub_item_quantity * sub_item_rate
                else:
                    # Fallback: Get base_total from stored value
                    sub_item_base_total = Decimal(str(
                        sub_item.get('base_total') or
                        sub_item.get('per_unit_cost') or
                        sub_item.get('client_rate') or
                        0
                    ))

                    # If still no base_total, calculate from materials + labour
                    if sub_item_base_total == 0:
                        sub_item_materials = sub_item.get('materials', [])
                        sub_item_labour = sub_item.get('labour', [])

                        sub_item_materials_cost = sum(
                            Decimal(str(mat.get('quantity', 0))) * Decimal(str(mat.get('unit_price', 0)))
                            for mat in sub_item_materials
                        )
                        sub_item_labour_cost = sum(
                            Decimal(str(lab.get('hours', 0))) * Decimal(str(lab.get('rate_per_hour', 0)))
                            for lab in sub_item_labour
                        )
                        sub_item_base_total = sub_item_materials_cost + sub_item_labour_cost

                total_items_base_cost += sub_item_base_total

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
                    "source": "change_request" if is_from_change_request else "original_boq",
                    "balance": float(planned_total - actual_total)  # Planned - Actual balance
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
                                            "source": "change_request" if is_from_cr else "unplanned",
                                            "balance": float(-purchase_total)  # Unplanned = 0 planned - actual
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
                    "source": "change_request",
                    "balance": float(-actual_total)  # CR materials: 0 planned - actual
                })

            # Labour comparison
            labour_comparison = []
            planned_labour_total = Decimal('0')
            actual_labour_total = Decimal('0')

            # Collect labour from both item level and sub-item level
            all_labour = list(planned_item.get('labour', []))
            for sub_item in planned_item.get('sub_items', []):
                all_labour.extend(sub_item.get('labour', []))

            for planned_lab in all_labour:
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

            # Reset materials and labour totals - they will be recalculated from sub-items
            # This avoids double counting from the materials/labour loops above
            planned_materials_total = Decimal('0')
            planned_labour_total = Decimal('0')
            actual_materials_total = Decimal('0')
            actual_labour_total = Decimal('0')

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
            negotiable_margin = Decimal('0')
            actual_miscellaneous = Decimal('0')
            actual_transport = Decimal('0')
            actual_total = Decimal('0')
            actual_discount_amount = Decimal('0')

            sub_items_breakdown = []

            # Track if item-level labour has been assigned to a sub-item
            item_level_labour_assigned = False
            # Track which labour IDs and roles have been processed across ALL sub-items to prevent double-counting
            item_level_labour_ids_processed = set()
            item_level_labour_roles_processed = set()

            for sub_item in planned_item.get('sub_items', []):
                sub_item_name = sub_item.get('sub_item_name', '')
                master_sub_item_id = sub_item.get('master_sub_item_id')

                # Check if this is a CR sub-item
                is_cr_sub_item = sub_item_name.startswith('Extra Materials - CR #')

                # Also track internal costs (materials + labour) for comparison
                # Calculate from materials and labour arrays if not provided
                # IMPORTANT: CR sub-items should have ZERO planned costs (they're unplanned additions)
                if is_cr_sub_item:
                    # CR sub-items have no planned costs
                    sub_item_materials_cost = Decimal('0')
                    sub_item_labour_cost = Decimal('0')
                else:
                    # Original sub-items - calculate planned costs from arrays
                    sub_item_materials_cost = Decimal(str(sub_item.get('materials_cost', 0)))
                    if sub_item_materials_cost == 0:
                        # Calculate from materials array
                        for mat in sub_item.get('materials', []):
                            mat_qty = Decimal(str(mat.get('quantity', 0)))
                            mat_price = Decimal(str(mat.get('unit_price', 0)))
                            sub_item_materials_cost += mat_qty * mat_price

                    sub_item_labour_cost = Decimal(str(sub_item.get('labour_cost', 0)))
                    if sub_item_labour_cost == 0:
                        # Calculate from labour array
                        for lab in sub_item.get('labour', []):
                            lab_cost = Decimal(str(lab.get('total_cost', 0)))
                            if lab_cost == 0:
                                # Calculate from hours * rate if total_cost not provided
                                lab_hours = Decimal(str(lab.get('hours', 0)))
                                lab_rate = Decimal(str(lab.get('rate_per_hour', 0)))
                                lab_cost = lab_hours * lab_rate
                            sub_item_labour_cost += lab_cost

                sub_item_internal_cost = sub_item_materials_cost + sub_item_labour_cost

                # Get the base_total (client rate) from sub-item
                # This is the main amount on which percentages are calculated
                # IMPORTANT: Calculate base_total from quantity × rate to ensure correctness
                sub_item_quantity = Decimal(str(sub_item.get('quantity', 1)))
                sub_item_rate = Decimal(str(sub_item.get('rate', 0)))

                # Calculate base_total as quantity × rate if both are available
                if sub_item_quantity > 0 and sub_item_rate > 0:
                    sub_item_base_total = sub_item_quantity * sub_item_rate
                else:
                    # Fallback: Try base_total first, then fall back to per_unit_cost or client_rate
                    sub_item_base_total = Decimal(str(
                        sub_item.get('base_total') or
                        sub_item.get('per_unit_cost') or
                        sub_item.get('client_rate') or
                        0
                    ))

                    # If no base_total provided, use internal_cost as the base
                    if sub_item_base_total == 0:
                        sub_item_base_total = sub_item_internal_cost

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
                    # Match by sub_item_name first (exact match), then by master_sub_item_id if name doesn't match
                    mat_sub_item_name = mat.get('sub_item_name')
                    mat_master_sub_item_id = mat.get('master_sub_item_id')

                    # For exact matching, prioritize sub_item_name match
                    is_match = False
                    if mat_sub_item_name == sub_item_name:
                        is_match = True
                    elif master_sub_item_id and mat_master_sub_item_id == master_sub_item_id and not mat_sub_item_name:
                        # Only match by ID if sub_item_name is not set
                        is_match = True

                    if is_match:
                        if mat.get('actual') and mat['actual'].get('total'):
                            sub_actual_materials_cost += Decimal(str(mat['actual']['total']))
                        elif mat.get('planned') and mat['planned'].get('total'):
                            # If not purchased yet, use planned as estimate
                            sub_actual_materials_cost += Decimal(str(mat['planned']['total']))

                # Get actual labour for this sub-item from labour_comparison
                # Handle two cases:
                # 1. Labour defined in sub-item's labour array
                # 2. Item-level labour (should be assigned to first non-CR sub-item only)

                # Case 1: Process labour from sub-item's labour array
                for planned_labour_entry in sub_item.get('labour', []):
                    labour_id = planned_labour_entry.get('master_labour_id')
                    labour_role = planned_labour_entry.get('labour_role', '').lower().strip()
                    # Skip labour entries with both empty ID and empty role (invalid)
                    if not labour_id and not labour_role:
                        continue

                    # Skip if this labour was already processed in a previous sub-item
                    if labour_id and labour_id in item_level_labour_ids_processed:
                        continue
                    if labour_role and labour_role in item_level_labour_roles_processed:
                        continue

                    # Find matching entry in labour_comparison
                    # Match by ID if available, otherwise match by role
                    if labour_id:
                        matching_labour = next(
                            (lab for lab in labour_comparison if lab.get('master_labour_id') == labour_id),
                            None
                        )
                    elif labour_role:
                        matching_labour = next(
                            (lab for lab in labour_comparison
                             if lab.get('labour_role', '').lower().strip() == labour_role),
                            None
                        )
                    else:
                        matching_labour = None

                    if matching_labour:
                        # Use actual if available, otherwise use planned for pending labour
                        if matching_labour.get('actual') and matching_labour['actual'].get('total', 0) > 0:
                            lab_cost = Decimal(str(matching_labour['actual']['total']))
                        else:
                            # Pending labour - use planned cost
                            lab_cost = Decimal(str(matching_labour['planned']['total']))
                        sub_actual_labour_cost += lab_cost
                        # Track this labour ID and role at ITEM level to avoid double-counting across sub-items
                        if labour_id:
                            item_level_labour_ids_processed.add(labour_id)
                        if labour_role:
                            item_level_labour_roles_processed.add(labour_role)
                    else:
                        # If no tracking data found, use planned from sub_item
                        lab_cost = Decimal(str(planned_labour_entry.get('total_cost', 0)))
                        if lab_cost == 0:
                            lab_hours = Decimal(str(planned_labour_entry.get('hours', 0)))
                            lab_rate = Decimal(str(planned_labour_entry.get('rate_per_hour', 0)))
                            lab_cost = lab_hours * lab_rate
                        sub_actual_labour_cost += lab_cost
                        # Track this labour ID and role at ITEM level to avoid double-counting across sub-items
                        if labour_id:
                            item_level_labour_ids_processed.add(labour_id)
                        if labour_role:
                            item_level_labour_roles_processed.add(labour_role)

                # Case 2: If this is the first non-CR sub-item and item-level labour hasn't been assigned yet,
                # assign item-level labour to this sub-item
                if not item_level_labour_assigned and not is_cr_sub_item:
                    for item_labour_entry in planned_item.get('labour', []):
                        labour_id = item_labour_entry.get('master_labour_id')
                        labour_role = item_labour_entry.get('labour_role', '').lower().strip()

                        # Skip labour entries with both empty ID and empty role (invalid)
                        if not labour_id and not labour_role:
                            continue

                        # Skip if this labour was already processed from any sub-item's labour array
                        # Check both by ID (if available) and by role name
                        if labour_id and labour_id in item_level_labour_ids_processed:
                            continue
                        if labour_role and labour_role in item_level_labour_roles_processed:
                            continue

                        # Find matching entry in labour_comparison
                        # Match by ID if available, otherwise match by role
                        if labour_id:
                            matching_labour = next(
                                (lab for lab in labour_comparison if lab.get('master_labour_id') == labour_id),
                                None
                            )
                        elif labour_role:
                            matching_labour = next(
                                (lab for lab in labour_comparison
                                 if lab.get('labour_role', '').lower().strip() == labour_role),
                                None
                            )
                        else:
                            matching_labour = None

                        if matching_labour:
                            # Use actual if available, otherwise use planned for pending labour
                            if matching_labour.get('actual') and matching_labour['actual'].get('total', 0) > 0:
                                lab_cost = Decimal(str(matching_labour['actual']['total']))
                            else:
                                # Pending labour - use planned cost
                                lab_cost = Decimal(str(matching_labour['planned']['total']))
                            sub_actual_labour_cost += lab_cost
                            # Track this labour to prevent processing in future sub-items
                            if labour_id:
                                item_level_labour_ids_processed.add(labour_id)
                            if labour_role:
                                item_level_labour_roles_processed.add(labour_role)
                        else:
                            # If no tracking data found, use planned from item
                            lab_cost = Decimal(str(item_labour_entry.get('total_cost', 0)))
                            if lab_cost == 0:
                                lab_hours = Decimal(str(item_labour_entry.get('hours', 0)))
                                lab_rate = Decimal(str(item_labour_entry.get('rate_per_hour', 0)))
                                lab_cost = lab_hours * lab_rate
                            sub_actual_labour_cost += lab_cost
                            # Track this labour to prevent processing in future sub-items
                            if labour_id:
                                item_level_labour_ids_processed.add(labour_id)
                            if labour_role:
                                item_level_labour_roles_processed.add(labour_role)

                    # Mark that item-level labour has been assigned
                    item_level_labour_assigned = True

                sub_actual_internal_cost = sub_actual_materials_cost + sub_actual_labour_cost

                # Actual percentages stay the same (based on base_total)
                sub_actual_misc = sub_item_base_total * (misc_pct / 100)  # Same as planned
                sub_actual_overhead = sub_planned_overhead  # Same as planned
                sub_actual_transport = sub_planned_transport  # Same as planned

                # Actual profit = we don't calculate from percentages, it's what remains
                # For now, use planned profit (will be adjusted by consumption flow later)
                sub_negotiable_margin = sub_planned_profit

                # CORRECT FORMULA: Total = Materials + Labour + Misc + Overhead + Profit + Transport - Discount
                sub_actual_total = (sub_actual_materials_cost + sub_actual_labour_cost +
                                  sub_actual_misc + sub_actual_overhead + sub_negotiable_margin +
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
                # For CR sub-items, use actual internal cost instead of base_total (which is 0)
                if is_cr_sub_item:
                    actual_base += sub_actual_internal_cost  # CR items: use actual cost
                else:
                    actual_base += sub_item_base_total  # Regular items: client rate stays the same
                actual_materials_total += sub_actual_materials_cost
                actual_labour_total += sub_actual_labour_cost
                actual_miscellaneous += sub_actual_misc  # Misc % stays the same
                actual_overhead += sub_actual_overhead  # Overhead % stays the same
                negotiable_margin += sub_negotiable_margin  # Profit varies based on actual spending
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
                        'actual_amount': float(sub_negotiable_margin)
                    },
                    'negotiable_margin': {
                        'planned': float(sub_planned_profit),
                        'actual': float(sub_negotiable_margin)
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

            # Get overall percentages for display
            # Calculate actual percentages from the aggregated amounts and base cost
            misc_pct = (planned_miscellaneous / planned_base * 100) if planned_base > 0 else Decimal('0')

            # Calculate combined overhead + profit percentage from actual amounts
            combined_overhead_profit = planned_overhead + planned_profit
            overhead_profit_pct = (combined_overhead_profit / planned_base * 100) if planned_base > 0 else Decimal('0')

            # Split the combined percentage 40/60 for display
            overhead_pct = overhead_profit_pct * Decimal('0.4')
            profit_pct = overhead_profit_pct * Decimal('0.6')

            # Calculate item's proportional share of preliminaries
            # This ensures discount is applied to the combined amount (items + preliminaries)
            item_preliminary_share = Decimal('0')
            if total_items_base_cost > 0 and preliminary_amount > 0:
                # Item's proportion of total items base cost
                item_proportion = planned_base / total_items_base_cost
                # Item's share of preliminaries
                item_preliminary_share = preliminary_amount * item_proportion

            # The selling price BEFORE discount includes item base cost + preliminary share
            selling_price_before_discount = planned_base + item_preliminary_share

            # USE BOQ-LEVEL DISCOUNT (from top-level boq_data)
            # If sub-item level discount exists, use that; otherwise use BOQ-level discount
            item_discount_amount = planned_discount_amount if planned_discount_amount > 0 else Decimal('0')
            item_discount_percentage = Decimal('0')

            # If no sub-item discount and BOQ has discount, calculate item's share
            if item_discount_amount == 0 and boq_level_discount_percentage > 0:
                # Apply BOQ-level discount PERCENTAGE to this item's selling price (including preliminary share)
                item_discount_percentage = boq_level_discount_percentage
                item_discount_amount = selling_price_before_discount * (item_discount_percentage / Decimal('100'))
            elif item_discount_amount > 0 and selling_price_before_discount > 0:
                # Calculate percentage from sub-item discount
                item_discount_percentage = (item_discount_amount / selling_price_before_discount) * Decimal('100')

            # If still no discount amount but have percentage, calculate it
            if item_discount_amount == 0 and item_discount_percentage > 0 and selling_price_before_discount > 0:
                item_discount_amount = selling_price_before_discount * (item_discount_percentage / Decimal('100'))

            # Calculate Client Amount (Grand Total) after discount
            # This is the actual amount client will pay
            client_amount_after_discount = selling_price_before_discount - item_discount_amount

            # Calculate profit BEFORE giving discount to client
            # This shows profit if we kept the discount as margin
            profit_before_discount = selling_price_before_discount - actual_total

            # Calculate actual profit after giving discount to client
            # Actual Profit = Client Amount (after discount) - Total Actual Spending
            after_discount_negotiable_margin = client_amount_after_discount - actual_total

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

            # 2. Allocation Impact Analysis
            # NOTE: Miscellaneous, Overhead, and Transport are FIXED allocations
            # Only the Negotiable Margin (profit) absorbs all variances

            # Calculate profit variance (how much profit was impacted)
            profit_variance = after_discount_negotiable_margin - planned_profit

            # Determine if extra costs impacted profit
            profit_impact_from_extra_costs = Decimal('0')
            if extra_costs > 0:
                # Extra costs directly reduce negotiable margin
                profit_impact_from_extra_costs = extra_costs

            # Calculate variances (allocations stay same, only profit changes)
            base_cost_variance = actual_base - planned_base
            misc_variance = Decimal('0')  # Miscellaneous stays at allocation
            overhead_variance = Decimal('0')  # Overhead stays at allocation
            transport_variance = Decimal('0')  # Transport stays at allocation

            # Calculate savings/overrun (use absolute values for display)
            cost_savings = abs(planned_base - actual_base)  # Always positive
            misc_diff = abs(planned_miscellaneous - actual_miscellaneous)  # Always positive
            overhead_diff = abs(planned_overhead - actual_overhead)  # Always positive
            profit_diff = abs(planned_profit - negotiable_margin)  # Always positive

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
                        "profit_after_discount": float(after_discount_negotiable_margin),
                        "profit_reduction": float(profit_before_discount - after_discount_negotiable_margin)
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
                    "negotiable_margin": float(planned_profit),  # Planned profit/negotiable margin
                    "miscellaneous_amount": float(planned_miscellaneous),
                    "miscellaneous_percentage": float(misc_pct),
                    "overhead_amount": float(planned_overhead),
                    "overhead_percentage": float(overhead_pct),
                    "profit_amount": float(planned_profit),
                    "profit_percentage": float(profit_pct),
                    "transport_amount": float(planned_transport),
                    "total": float(planned_total),
                    "selling_price": float(selling_price),
                    "balance": float(planned_total - actual_total),  # Item-level balance
                    "materials_balance": float(planned_materials_total - actual_materials_total),
                    "labour_balance": float(planned_labour_total - actual_labour_total)
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
                    "negotiable_margin": float(after_discount_negotiable_margin),
                    "miscellaneous_amount": float(actual_miscellaneous),
                    "miscellaneous_percentage": float(misc_pct),
                    "overhead_amount": float(actual_overhead),
                    "overhead_percentage": float(overhead_pct),
                    "profit_amount": float(negotiable_margin),
                    "profit_percentage": (float(negotiable_margin) / float(selling_price) * 100) if selling_price > 0 else 0,
                    "transport_amount": float(actual_transport),
                    "total": float(actual_total),
                    "selling_price": float(selling_price)
                },
                "consumption_flow": {
                    "extra_costs": float(extra_costs),
                    "base_cost_variance": float(base_cost_variance),
                    "variance_status": "overspent" if extra_costs > 0 else "saved",
                    "miscellaneous_consumed": 0.0,  # Miscellaneous is fixed allocation
                    "miscellaneous_remaining": float(actual_miscellaneous),
                    "miscellaneous_variance": float(misc_variance),
                    "overhead_consumed": 0.0,  # Overhead is fixed allocation
                    "overhead_remaining": float(actual_overhead),
                    "overhead_variance": float(overhead_variance),
                    "profit_consumed": float(profit_impact_from_extra_costs),  # All extra costs impact profit
                    "profit_remaining": float(after_discount_negotiable_margin),  # Actual negotiable margin
                    "profit_variance": float(profit_variance),
                    "explanation": "Miscellaneous, Overhead, and Transport are fixed allocations. All extra costs (overruns + unplanned items) directly reduce the Negotiable Margin (profit)."
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
                        "actual": float(actual_miscellaneous),  # Fixed allocation
                        "difference": float(abs(misc_variance))
                    },
                    "overhead": {
                        "planned": float(planned_overhead),
                        "actual": float(actual_overhead),  # Fixed allocation
                        "difference": float(abs(overhead_variance))
                    },
                    "profit": {
                        "planned": float(planned_profit),
                        "actual": float(after_discount_negotiable_margin),  # Actual negotiable margin
                        "difference": float(abs(profit_variance))
                    }
                }
            }

            comparison['items'].append(item_comparison)

        # Calculate overall summary
        total_base_cost = sum(float(item['planned']['base_cost']) for item in comparison['items'])  # Base cost (items only, no preliminaries)
        total_client_amount_before_discount = sum(float(item['planned']['client_amount_before_discount']) for item in comparison['items'])  # Includes preliminary shares
        total_planned = sum(float(item['planned']['total']) for item in comparison['items'])
        total_actual = sum(float(item['actual']['total']) for item in comparison['items'])
        total_discount_amount = sum(float(item['planned']['discount_amount']) for item in comparison['items'])
        total_client_amount_after_discount = sum(float(item['planned']['client_amount_after_discount']) for item in comparison['items'])
        total_profit_before_discount = sum(float(item['actual']['profit_before_discount']) for item in comparison['items'])
        total_after_discount_profit = sum(float(item['actual']['negotiable_margin']) for item in comparison['items'])

        # Calculate items subtotal (base cost only, without preliminary shares)
        # This is the sum of items' base costs before adding preliminaries
        items_only_subtotal = Decimal(str(total_base_cost))

        # Add materials and labour totals for variance display
        total_planned_materials = sum(float(item['planned']['materials_total']) for item in comparison['items'])
        total_actual_materials = sum(float(item['actual']['materials_total']) for item in comparison['items'])
        total_planned_labour = sum(float(item['planned']['labour_total']) for item in comparison['items'])
        total_actual_labour = sum(float(item['actual']['labour_total']) for item in comparison['items'])

        total_planned_miscellaneous = sum(float(item['planned']['miscellaneous_amount']) for item in comparison['items'])
        total_actual_miscellaneous = sum(float(item['actual']['miscellaneous_amount']) for item in comparison['items'])
        total_planned_overhead = sum(float(item['planned']['overhead_amount']) for item in comparison['items'])
        total_actual_overhead = sum(float(item['actual']['overhead_amount']) for item in comparison['items'])
        total_planned_profit = sum(float(item['planned']['profit_amount']) for item in comparison['items'])
        total_negotiable_margin = sum(float(item['actual']['profit_amount']) for item in comparison['items'])
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

        # Calculate actual profit using formula: Client Amount (After Discount) - Total Actual Spending
        # This is the REAL profit/loss - what client pays minus what we spent
        actual_project_profit = total_client_amount_after_discount - total_actual

        # Calculate combined subtotal and discount
        # NOTE: total_client_amount_before_discount already includes each item's preliminary share
        # So we DON'T add preliminary_amount again (that would be double-counting)
        combined_subtotal_before_discount = Decimal(str(total_client_amount_before_discount))

        # Calculate discount on combined subtotal
        combined_discount_amount = Decimal('0')
        combined_discount_percentage = Decimal('0')

        if boq_level_discount_percentage > 0:
            combined_discount_percentage = boq_level_discount_percentage
            combined_discount_amount = combined_subtotal_before_discount * (combined_discount_percentage / Decimal('100'))

        # Calculate grand total after discount
        combined_grand_total_after_discount = combined_subtotal_before_discount - combined_discount_amount

        # Calculate profit impact on combined totals
        combined_profit_before_discount = combined_subtotal_before_discount - Decimal(str(total_actual))
        combined_profit_after_discount = combined_grand_total_after_discount - Decimal(str(total_actual))
        combined_profit_reduction = combined_profit_before_discount - combined_profit_after_discount

        comparison['summary'] = {
            "base_cost": float(total_base_cost),  # Add base cost to summary
            "client_amount_before_discount": float(total_client_amount_before_discount),
            "discount_amount": float(total_discount_amount),
            "discount_percentage": float(total_discount_percentage),
            "client_amount_after_discount": float(total_client_amount_after_discount),
            "grand_total": float(total_client_amount_after_discount),
            "profit_before_discount": float(total_profit_before_discount),
            "negotiable_margin": float(actual_project_profit),  # Use the correctly calculated profit
            "discount_details": {
                "has_discount": float(combined_discount_amount) > 0,
                "client_cost_before_discount": float(combined_subtotal_before_discount),
                "discount_percentage": float(combined_discount_percentage),
                "discount_amount": float(combined_discount_amount),
                "grand_total_after_discount": float(combined_grand_total_after_discount),
                "profit_impact": {
                    "profit_before_discount": float(combined_profit_before_discount),
                    "profit_after_discount": float(combined_profit_after_discount),
                    "profit_reduction": float(combined_profit_reduction)
                }
            },
            "planned_total": float(total_planned),
            "actual_total": float(total_actual),
            "variance": float(abs(total_actual - total_planned)),  # Always positive number
            "variance_percentage": float(abs((total_actual - total_planned) / total_planned * 100)) if total_planned > 0 else 0,
            "status": "under_budget" if total_actual < total_planned else "over_budget" if total_actual > total_planned else "on_budget",

            # Add materials and labour totals for variance calculations
            "planned_materials_total": float(total_planned_materials),
            "actual_materials_total": float(total_actual_materials),
            "planned_labour_total": float(total_planned_labour),
            "actual_labour_total": float(total_actual_labour),

            # Balance calculations (Planned - Actual)
            "balance": float(total_planned - total_actual),
            "materials_balance": float(total_planned_materials - total_actual_materials),
            "labour_balance": float(total_planned_labour - total_actual_labour),

            "total_planned_miscellaneous": float(total_planned_miscellaneous),
            "total_actual_miscellaneous": float(total_actual_miscellaneous),
            "miscellaneous_variance": float(abs(total_actual_miscellaneous - total_planned_miscellaneous)),
            "total_planned_overhead": float(total_planned_overhead),
            "total_actual_overhead": float(total_actual_overhead),
            "overhead_variance": float(abs(total_actual_overhead - total_planned_overhead)),
            "total_planned_profit": float(total_planned_profit),
            "total_negotiable_margin": float(actual_project_profit),  # Overall project profit: Client Amount - Actual Spending
            "total_actual_profit": float(total_negotiable_margin),  # Sum of actual profit components from items
            "profit_variance": float(abs(total_negotiable_margin - total_planned_profit)),
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
            "calculation_note": "Client Amount (Before Discount) is the base selling price. Discount = Client Amount × Discount %. Grand Total (Client Amount After Discount) = Client Amount - Discount. Actual Profit = Grand Total - Actual Total Spending.",

            # Add preliminaries data
            "preliminaries": {
                "client_amount": float(preliminary_amount),
                "quantity": preliminary_quantity,
                "unit": preliminary_unit,
                "rate": float(preliminary_rate) if preliminary_rate else 0,
                "internal_cost": float(preliminary_internal_cost),
                "misc_amount": float(preliminary_misc_amount),
                "overhead_profit_amount": float(preliminary_overhead_profit_amount),
                "transport_amount": float(preliminary_transport_amount),
                "planned_profit": float(preliminary_planned_profit),
                "items": preliminaries_data.get('items', []),
                "notes": preliminaries_data.get('notes', '')
            },
            "items_subtotal": float(items_only_subtotal),
            "combined_subtotal": float(items_only_subtotal) + float(preliminary_amount),
            "grand_total_with_preliminaries": float(combined_grand_total_after_discount)
        }

        return jsonify(comparison), 200

    except Exception as e:
        log.error(f"Error getting planned vs actual: {str(e)}")
        return jsonify({"error": f"Failed to get comparison: {str(e)}"}), 500


def get_purchase_comparision(project_id):
    """
    Get material purchase comparison for a specific project.
    Compares planned materials (from BOQ) vs actual purchased materials.
    Returns data split into planned_materials and actual_materials sections.

    Args:
        project_id: The project ID to compare materials for

    Returns:
        JSON response with planned and actual materials data separated
    """
    try:
        # Get project and its BOQ
        project = Project.query.filter_by(project_id=project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get BOQ for this project
        boq = BOQ.query.filter_by(project_id=project_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found for this project"}), 404

        boq_id = boq.boq_id

        # Get BOQ details (planned data)
        boq_detail = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_detail or not boq_detail.boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Parse BOQ details
        boq_data = json.loads(boq_detail.boq_details) if isinstance(boq_detail.boq_details, str) else boq_detail.boq_details

        # Extract all planned materials from BOQ (same method as get_boq_planned_vs_actual)
        # Materials can exist at two levels:
        # 1. item.sub_items[].materials[] - sub-item level materials
        # 2. item.materials[] - item level materials (from change requests)
        planned_materials_list = []
        total_planned_quantity = 0
        total_planned_amount = Decimal('0')

        for item in boq_data.get('items', []):
            item_name = item.get('item_name', '')
            master_item_id = item.get('master_item_id')

            # 1. Extract materials from sub_items
            for sub_item in item.get('sub_items', []):
                sub_item_name = sub_item.get('sub_item_name', '')

                for material in sub_item.get('materials', []):
                    # Skip materials that are from change requests (they have is_from_change_request flag)
                    # These will be counted as actual, not planned
                    if material.get('is_from_change_request'):
                        continue

                    # Get quantity
                    mat_qty = Decimal(str(material.get('quantity', 0) or 0))

                    # Get rate/unit_price (try multiple field names for compatibility)
                    mat_rate = Decimal(str(
                        material.get('unit_price') or
                        material.get('rate') or
                        material.get('price') or
                        0
                    ))

                    # Get amount or calculate from quantity * rate
                    mat_amount = Decimal(str(material.get('amount', 0) or 0))
                    if mat_amount == 0:
                        mat_amount = Decimal(str(material.get('total_price', 0) or 0))
                    if mat_amount == 0:
                        # Calculate from quantity * rate
                        mat_amount = mat_qty * mat_rate

                    planned_materials_list.append({
                        'item_name': item_name,
                        'master_item_id': master_item_id,
                        'sub_item_name': sub_item_name,
                        'material_name': material.get('material_name', ''),
                        'master_material_id': material.get('master_material_id'),
                        'quantity': float(mat_qty),
                        'unit': material.get('unit', ''),
                        'rate': float(mat_rate),
                        'amount': float(mat_amount)
                    })
                    total_planned_quantity += float(mat_qty)
                    total_planned_amount += mat_amount

            # 2. Extract materials directly from item level (if any)
            # These are usually from change requests added to item level
            for material in item.get('materials', []):
                # Skip materials that are from change requests
                if material.get('is_from_change_request'):
                    continue

                mat_qty = Decimal(str(material.get('quantity', 0) or 0))
                mat_rate = Decimal(str(
                    material.get('unit_price') or
                    material.get('rate') or
                    material.get('price') or
                    0
                ))
                mat_amount = Decimal(str(material.get('amount', 0) or 0))
                if mat_amount == 0:
                    mat_amount = Decimal(str(material.get('total_price', 0) or 0))
                if mat_amount == 0:
                    mat_amount = mat_qty * mat_rate

                sub_item_name = material.get('sub_item_name', '')

                planned_materials_list.append({
                    'item_name': item_name,
                    'master_item_id': master_item_id,
                    'sub_item_name': sub_item_name,
                    'material_name': material.get('material_name', ''),
                    'master_material_id': material.get('master_material_id'),
                    'quantity': float(mat_qty),
                    'unit': material.get('unit', ''),
                    'rate': float(mat_rate),
                    'amount': float(mat_amount)
                })
                total_planned_quantity += float(mat_qty)
                total_planned_amount += mat_amount

        # Get actual purchase data for this project using MaterialPurchaseTracking as mapping
        purchase_records = MaterialPurchaseTracking.query.filter_by(
            project_id=project_id,
            is_deleted=False
        ).all()

        # Collect all change_request_ids to fetch actual amounts from ChangeRequest table
        cr_ids = set()
        for record in purchase_records:
            if record.change_request_id:
                cr_ids.add(record.change_request_id)

        # Fetch all ChangeRequests for this project with status: vendor_approved, purchase_completed, pending_td_approval
        # These are the only statuses that should show in actual materials
        valid_statuses = ['vendor_approved', 'purchase_completed', 'pending_td_approval', 'split_to_sub_crs']

        all_project_crs = ChangeRequest.query.filter(
            ChangeRequest.project_id == project_id,
            ChangeRequest.is_deleted == False,
            ChangeRequest.status.in_(valid_statuses)
        ).all()

        for cr in all_project_crs:
            cr_ids.add(cr.cr_id)

        # Fetch all related change requests - only with valid statuses
        # Actual material amount comes from ChangeRequest.materials_data JSON
        change_requests_lookup = {}
        if cr_ids:
            change_requests = ChangeRequest.query.filter(
                ChangeRequest.cr_id.in_(list(cr_ids)),
                ChangeRequest.is_deleted == False,
                ChangeRequest.status.in_(valid_statuses)
            ).all()
            for cr in change_requests:
                # Build per-material list from sub_items_data JSON (PRIMARY source)
                # sub_items_data format: [{master_material_id, material_name, quantity, unit_price, total_price, is_new, ...}]
                materials_list = []  # List of all materials with original data

                # Get item_name from ChangeRequest record (not from sub_items_data)
                cr_item_name = cr.item_name or ''

                # Parse material_vendor_selections for negotiated prices
                # Format: {"material_name": {"negotiated_price": 44.0, ...}, ...}
                vendor_selections = {}
                if cr.material_vendor_selections:
                    mvs = cr.material_vendor_selections
                    if isinstance(mvs, str):
                        mvs = json.loads(mvs)
                    if isinstance(mvs, dict):
                        vendor_selections = mvs

                # Parse sub_items_data (PRIMARY source with unit_price, total_price)
                if cr.sub_items_data:
                    sub_items_data = cr.sub_items_data
                    if isinstance(sub_items_data, str):
                        sub_items_data = json.loads(sub_items_data)

                    if isinstance(sub_items_data, list):
                        for mat in sub_items_data:
                            material_name = mat.get('material_name', '') or mat.get('sub_item_name', '')
                            quantity = float(mat.get('quantity') if mat.get('quantity') is not None else 0)
                            boq_unit_price = float(mat.get('unit_price') if mat.get('unit_price') is not None else 0)

                            # Check for negotiated (vendor) price in material_vendor_selections
                            # This is the actual price paid to vendor, which may differ from BOQ price
                            negotiated_price = None
                            if material_name and material_name in vendor_selections:
                                negotiated_price = vendor_selections[material_name].get('negotiated_price')

                            # Use negotiated price if available, otherwise fall back to BOQ price
                            actual_unit_price = float(negotiated_price) if negotiated_price else boq_unit_price

                            mat_info = {
                                'master_material_id': mat.get('master_material_id'),
                                'material_name': material_name,
                                'amount': quantity * actual_unit_price,  # Calculate from qty * actual price
                                'quantity': quantity,
                                'unit_price': actual_unit_price,  # Use vendor price if available
                                'is_new_material': mat.get('is_new', False),
                                'item_name': cr_item_name,  # Use item_name from CR record
                                'sub_item_name': mat.get('sub_item_name', ''),
                                'master_item_id': mat.get('master_item_id') or cr.item_id,
                                'unit': mat.get('unit', '')
                            }
                            materials_list.append(mat_info)

                change_requests_lookup[cr.cr_id] = {
                    'materials_total_cost': float(cr.materials_total_cost or 0),
                    'materials_list': materials_list,  # List of all materials
                    'status': cr.status,
                    'material_vendor_selections': vendor_selections  # Include for PO children lookup
                }

        # Fetch VAT percent from LPOCustomization table for all cr_ids
        # We use vat_percent to calculate VAT per material (not stored vat_amount which is total)
        lpo_vat_percent_lookup = {}  # {cr_id: vat_percent}
        lpo_vat_percent_by_po_child = {}  # {po_child_id: vat_percent} for split CRs
        if cr_ids:
            lpo_customizations = LPOCustomization.query.filter(
                LPOCustomization.cr_id.in_(list(cr_ids))
            ).all()
            for lpo_custom in lpo_customizations:
                if lpo_custom.po_child_id is None:
                    # VAT for parent CR (applies when not split)
                    lpo_vat_percent_lookup[lpo_custom.cr_id] = float(lpo_custom.vat_percent or 5.0)
                else:
                    # VAT for specific PO child (applies when CR is split)
                    lpo_vat_percent_by_po_child[lpo_custom.po_child_id] = float(lpo_custom.vat_percent or 5.0)

        # Fetch PO children for CRs with split_to_sub_crs status
        from models.po_child import POChild
        po_children_by_cr = {}  # {cr_id: [po_child, ...]}
        split_cr_ids = [cr_id for cr_id, cr_data in change_requests_lookup.items() if cr_data.get('status') == 'split_to_sub_crs']
        if split_cr_ids:
            po_children = POChild.query.filter(
                POChild.parent_cr_id.in_(split_cr_ids),
                POChild.is_deleted == False,
                POChild.status.in_(['vendor_approved', 'purchase_completed', 'pending_td_approval'])
            ).all()
            for po_child in po_children:
                if po_child.parent_cr_id not in po_children_by_cr:
                    po_children_by_cr[po_child.parent_cr_id] = []
                po_children_by_cr[po_child.parent_cr_id].append(po_child)

        # Build actual materials list from ChangeRequest.materials_data directly
        # This ensures ALL materials from CRs are included (not just those in MaterialPurchaseTracking)
        actual_materials_list = []
        total_actual_quantity = 0
        total_actual_amount = Decimal('0')

        # Add all materials directly from ChangeRequest.materials_data (keep original data)
        for cr_id, cr_data in change_requests_lookup.items():
            cr_status = cr_data.get('status', '')

            # For split CRs, get materials from PO children instead of parent CR
            if cr_status == 'split_to_sub_crs' and cr_id in po_children_by_cr:
                # Process PO children materials
                for po_child in po_children_by_cr[cr_id]:
                    po_child_id = po_child.id
                    # Get VAT percent for this PO child (or fall back to parent CR's VAT)
                    po_child_vat_percent = lpo_vat_percent_by_po_child.get(po_child_id, lpo_vat_percent_lookup.get(cr_id, 5.0))

                    # Parse PO child materials_data
                    materials_data = po_child.materials_data
                    if isinstance(materials_data, str):
                        materials_data = json.loads(materials_data)

                    if isinstance(materials_data, list):
                        # Get vendor selections from parent CR for negotiated prices
                        parent_vendor_selections = cr_data.get('material_vendor_selections', {})

                        # Calculate PO child total subtotal first (sum of all materials)
                        po_child_subtotal = 0
                        materials_with_prices = []
                        for mat in materials_data:
                            mat_qty = float(mat.get('quantity', 0))
                            mat_name = mat.get('material_name', '') or mat.get('sub_item_name', '')
                            neg_price = mat.get('negotiated_price')
                            if not neg_price and mat_name in parent_vendor_selections:
                                neg_price = parent_vendor_selections[mat_name].get('negotiated_price')
                            mat_unit_price = float(neg_price) if neg_price else float(mat.get('unit_price', 0))
                            mat_amount = mat_qty * mat_unit_price
                            po_child_subtotal += mat_amount
                            materials_with_prices.append((mat, mat_qty, mat_unit_price, mat_amount, mat_name))

                        # Calculate total VAT for entire PO child (not per material)
                        po_child_total_vat = round((po_child_subtotal * po_child_vat_percent) / 100, 2)
                        num_po_child_materials = len(materials_with_prices)

                        for idx, (mat, material_quantity, material_unit_price, material_amount, material_name) in enumerate(materials_with_prices):
                            is_new_material = mat.get('is_new', False) or mat.get('is_new_material', False)

                            # VAT: Show full PO child VAT only on LAST material (avoid splitting)
                            is_last_material = (idx == num_po_child_materials - 1)
                            material_vat_amount = po_child_total_vat if is_last_material else 0

                            total_actual_quantity += material_quantity
                            total_actual_amount += Decimal(str(material_amount))

                            actual_materials_list.append({
                                'material_name': material_name,
                                'master_material_id': mat.get('master_material_id'),
                                'item_name': po_child.item_name or cr_data.get('item_name', ''),
                                'master_item_id': mat.get('master_item_id'),
                                'sub_item_name': mat.get('sub_item_name', ''),
                                'unit': mat.get('unit', ''),
                                'quantity': material_quantity,
                                'quantity_used': 0,
                                'remaining_quantity': 0,
                                'rate': material_unit_price,
                                'amount': material_amount,
                                'is_from_change_request': True,
                                'is_new_material': is_new_material,
                                'change_request_id': cr_id,
                                'po_child_id': po_child_id,
                                'cr_status': po_child.status,
                                'vat_amount': material_vat_amount,  # VAT shown only on last material
                                'cr_total_vat': po_child_total_vat,  # Total PO child VAT for reference
                                'cr_subtotal': po_child_subtotal  # PO child subtotal for reference
                            })
                continue  # Skip parent CR materials for split CRs

            # For non-split CRs, use parent CR materials
            materials_list = cr_data.get('materials_list', [])
            # Get VAT percent for this CR from LPOCustomization (default 5%)
            cr_vat_percent = lpo_vat_percent_lookup.get(cr_id, 5.0)

            # Calculate CR total subtotal first (sum of all materials)
            cr_subtotal = sum(
                float(mat.get('quantity', 0)) * float(mat.get('unit_price', 0))
                for mat in materials_list
            )
            # Calculate total VAT for entire CR (not per material)
            cr_total_vat = round((cr_subtotal * cr_vat_percent) / 100, 2)
            num_materials = len(materials_list)

            for idx, mat_info in enumerate(materials_list):
                material_quantity = float(mat_info.get('quantity', 0))
                material_unit_price = float(mat_info.get('unit_price', 0))
                # Always calculate subtotal from quantity * unit_price (stored amount may include VAT or be stale)
                material_amount = material_quantity * material_unit_price
                is_new_material = mat_info.get('is_new_material', False)
                material_name = mat_info.get('material_name', '')
                master_material_id = mat_info.get('master_material_id')  # Original value (can be null)
                item_name = mat_info.get('item_name', '')
                sub_item_name = mat_info.get('sub_item_name', '')
                master_item_id = mat_info.get('master_item_id')
                unit = mat_info.get('unit', '')

                # VAT: Show full CR VAT only on LAST material of this CR (avoid splitting)
                # For single-material CRs, show full VAT
                # For multi-material CRs, show VAT only on last material
                is_last_material = (idx == num_materials - 1)
                material_vat_amount = cr_total_vat if is_last_material else 0

                total_actual_quantity += material_quantity
                total_actual_amount += Decimal(str(material_amount))

                actual_materials_list.append({
                    'material_name': material_name,
                    'master_material_id': master_material_id,  # Keep original (null for new materials)
                    'item_name': item_name,
                    'master_item_id': master_item_id,
                    'sub_item_name': sub_item_name,
                    'unit': unit,
                    'quantity': material_quantity,
                    'quantity_used': 0,
                    'remaining_quantity': 0,
                    'rate': material_unit_price,
                    'amount': material_amount,
                    'is_from_change_request': True,
                    'is_new_material': is_new_material,
                    'change_request_id': cr_id,
                    'cr_status': cr_status,
                    'vat_amount': material_vat_amount,  # VAT shown only on last material of CR
                    'cr_total_vat': cr_total_vat,  # Total CR VAT for reference
                    'cr_subtotal': cr_subtotal  # CR subtotal for reference
                })

        # Build lookups for actual materials (for comparison matching)
        actual_by_id = {}  # {master_material_id: aggregated_data with purchases list}
        actual_by_name_subitem = {}  # {material_name + sub_item_name: aggregated_data}

        for mat in actual_materials_list:
            mat_id = mat.get('master_material_id')
            mat_name = mat.get('material_name', '')
            sub_item_name = mat.get('sub_item_name', '')

            # Individual purchase record with cr_id
            purchase_record = {
                'cr_id': mat.get('change_request_id'),
                'cr_status': mat.get('cr_status', ''),
                'quantity': mat.get('quantity', 0),
                'rate': mat.get('rate', 0),
                'amount': mat.get('amount', 0),
                'is_new_material': mat.get('is_new_material', False),
                'vat_amount': mat.get('vat_amount', 0),  # VAT (only on last material of CR)
                'cr_total_vat': mat.get('cr_total_vat', 0),  # Total CR VAT for frontend grouping
                'cr_subtotal': mat.get('cr_subtotal', 0)  # CR subtotal for frontend grouping
            }

            # Calculate amount with VAT for aggregation
            # Use vat_amount which is only set on last material of each CR
            amount_with_vat = mat.get('amount', 0) + mat.get('vat_amount', 0)

            # Aggregate by master_material_id if available
            if mat_id:
                if mat_id not in actual_by_id:
                    actual_by_id[mat_id] = {
                        'quantity': 0,
                        'unit_price': mat.get('rate', 0),
                        'amount': 0,
                        'material_name': mat_name,
                        'is_new_material': mat.get('is_new_material', False),
                        'purchases': []
                    }
                actual_by_id[mat_id]['quantity'] += mat.get('quantity', 0)
                actual_by_id[mat_id]['amount'] += amount_with_vat  # Include VAT in actual amount
                actual_by_id[mat_id]['purchases'].append(purchase_record)
                if mat.get('rate', 0) > 0:
                    actual_by_id[mat_id]['unit_price'] = mat.get('rate', 0)

            # Aggregate by material_name + sub_item_name combination (unique key)
            if mat_name:
                # Create unique key using material_name + sub_item_name
                name_key = f"{mat_name.lower().strip()}|{sub_item_name.lower().strip()}"
                if name_key not in actual_by_name_subitem:
                    actual_by_name_subitem[name_key] = {
                        'quantity': 0,
                        'unit_price': mat.get('rate', 0),
                        'amount': 0,
                        'material_name': mat_name,
                        'sub_item_name': sub_item_name,
                        'master_material_id': mat_id,
                        'is_new_material': mat.get('is_new_material', False),
                        'purchases': []
                    }
                actual_by_name_subitem[name_key]['quantity'] += mat.get('quantity', 0)
                actual_by_name_subitem[name_key]['amount'] += amount_with_vat  # Include VAT in actual amount
                actual_by_name_subitem[name_key]['purchases'].append(purchase_record)
                if mat.get('rate', 0) > 0:
                    actual_by_name_subitem[name_key]['unit_price'] = mat.get('rate', 0)

        # Build comparison for materials that exist in both planned and actual
        comparison_list = []
        matched_material_ids = set()
        matched_material_names = set()

        for planned in planned_materials_list:
            master_material_id = planned.get('master_material_id')
            planned_name = planned.get('material_name', '')
            planned_sub_item = planned.get('sub_item_name', '')
            actual = {}
            matched_key = None

            # First try to match by master_material_id
            if master_material_id and master_material_id in actual_by_id:
                actual = actual_by_id[master_material_id]
                matched_key = master_material_id

            # If no match by ID, try matching by material_name + sub_item_name combination
            if not actual and planned_name:
                name_subitem_key = f"{planned_name.lower().strip()}|{planned_sub_item.lower().strip()}"
                if name_subitem_key in actual_by_name_subitem:
                    actual = actual_by_name_subitem[name_subitem_key]
                    matched_key = name_subitem_key

            if matched_key:
                matched_material_ids.add(matched_key)
                matched_material_names.add(f"{planned_name.lower().strip()}|{planned_sub_item.lower().strip()}")

            planned_qty = planned['quantity']
            planned_rate = planned['rate']
            planned_amount = planned['amount']

            actual_qty = float(actual.get('quantity', 0))
            actual_unit_price = float(actual.get('unit_price', 0))
            actual_spent = float(actual.get('amount', 0))

            # Determine status
            if actual_spent > planned_amount:
                status = 'over_budget'
            elif actual_spent < planned_amount and actual_spent > 0:
                status = 'under_budget'
            elif actual_spent == 0:
                status = 'not_purchased'
            else:
                status = 'on_budget'

            # Get individual purchases list (each purchase with cr_id)
            purchases_list = actual.get('purchases', [])

            comparison_list.append({
                'material_name': planned['material_name'],
                'master_material_id': master_material_id,
                'item_name': planned['item_name'],
                'sub_item_name': planned['sub_item_name'],
                'unit': planned['unit'],
                'planned_amount': planned_amount,
                'actual_amount': actual_spent,
                'purchases': purchases_list
            })

        # Find unplanned materials (purchased but not in BOQ)
        unplanned_materials = []
        for mat in actual_materials_list:
            mat_id = mat.get('master_material_id')
            mat_name = mat.get('material_name', '').lower().strip()

            # Check if this material was matched (by ID or name+subitem)
            is_matched = False
            mat_sub_item = mat.get('sub_item_name', '')
            name_subitem_key = f"{mat_name}|{mat_sub_item.lower().strip()}"

            if mat_id and mat_id in matched_material_ids:
                is_matched = True
            elif name_subitem_key in matched_material_names:
                is_matched = True

            if not is_matched:
                unplanned_materials.append({
                    'material_name': mat['material_name'],
                    'master_material_id': mat_id,
                    'item_name': mat.get('item_name', ''),
                    'sub_item_name': mat.get('sub_item_name', ''),
                    'unit': mat.get('unit', ''),
                    'planned_amount': 0,
                    'actual_amount': float(mat.get('amount', 0)),
                    'vat_amount': float(mat.get('vat_amount', 0)),
                    'change_request_id': mat.get('change_request_id'),
                    'cr_status': mat.get('cr_status', ''),
                    'is_new_material': mat.get('is_new_material', True)
                })

        # Calculate summary totals
        unplanned_total = sum(m['actual_amount'] for m in unplanned_materials)

        # Group comparison by item_name
        comparison_by_item = {}
        for comp in comparison_list:
            item_name = comp.get('item_name', '') or 'Other'
            if item_name not in comparison_by_item:
                comparison_by_item[item_name] = {
                    'item_name': item_name,
                    'materials': [],
                    'summary': {
                        'planned_amount': 0,
                        'actual_amount': 0
                    }
                }
            comparison_by_item[item_name]['materials'].append(comp)
            comparison_by_item[item_name]['summary']['planned_amount'] += comp['planned_amount']
            comparison_by_item[item_name]['summary']['actual_amount'] += comp['actual_amount']

        # Convert to list
        comparison_items_list = list(comparison_by_item.values())

        # Group unplanned materials by item_name
        unplanned_by_item = {}
        for mat in unplanned_materials:
            item_name = mat.get('item_name', '') or 'Other'
            if item_name not in unplanned_by_item:
                unplanned_by_item[item_name] = {
                    'item_name': item_name,
                    'materials': [],
                    'summary': {
                        'actual_amount': 0
                    }
                }
            unplanned_by_item[item_name]['materials'].append(mat)
            unplanned_by_item[item_name]['summary']['actual_amount'] += mat['actual_amount']

        # Convert to list
        unplanned_items_list = list(unplanned_by_item.values())

        return jsonify({
            "success": True,
            "data": {
                "project_id": project_id,
                "project_name": project.project_name,
                "boq_id": boq_id,

                # Comparison grouped by item
                "comparison": {
                    "items": comparison_items_list,
                    "summary": {
                        "total_items": len(comparison_items_list),
                        "total_materials": len(comparison_list),
                        "planned_total_amount": float(total_planned_amount),
                        "actual_total_amount": float(total_actual_amount)
                    }
                },

                # Unplanned materials grouped by item
                "unplanned_materials": {
                    "items": unplanned_items_list,
                    "summary": {
                        "total_items": len(unplanned_items_list),
                        "total_materials": len(unplanned_materials),
                        "actual_total_amount": unplanned_total
                    }
                },

                # Overall summary
                "overall_summary": {
                    "planned_total_amount": float(total_planned_amount),
                    "actual_total_amount": float(total_actual_amount),
                    "unplanned_total_amount": unplanned_total
                }
            }
        }), 200

    except Exception as e:
        log.error(f"Error in get_purchase_comparision: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_all_purchase_comparision_projects():
    """
    Get all projects that have at least one ChangeRequest with valid purchase status.
    Valid statuses: vendor_approved, purchase_completed, pending_td_approval, split_to_sub_crs
    """
    try:
        valid_statuses = ['vendor_approved', 'purchase_completed', 'pending_td_approval', 'split_to_sub_crs']

        # Get distinct project_ids that have CRs with valid statuses
        project_ids_with_purchases = db.session.query(ChangeRequest.project_id).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.status.in_(valid_statuses)
        ).distinct().all()

        project_ids = [p[0] for p in project_ids_with_purchases]

        if not project_ids:
            return jsonify({
                "success": True,
                "data": [],
                "count": 0
            }), 200

        # Get projects with their BOQ info
        projects = Project.query.filter(
            Project.project_id.in_(project_ids),
            Project.is_deleted == False
        ).all()

        project_list = []
        for project in projects:
            # Get BOQ for this project
            boq = BOQ.query.filter_by(
                project_id=project.project_id,
                is_deleted=False
            ).first()

            project_list.append({
                'project_id': project.project_id,
                'project_name': project.project_name,
                'boq_id': boq.boq_id if boq else None,
                'boq_status': boq.status if boq else None,
                'end_date': project.end_date.isoformat() if project.end_date else None
            })

        return jsonify({
            "success": True,
            "data": project_list,
            "count": len(project_list)
        }), 200

    except Exception as e:
        log.error(f"Error in get_all_purchase_boq: {str(e)}")
        return jsonify({"error": str(e)}), 500
