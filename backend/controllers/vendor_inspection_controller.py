"""
Vendor Delivery Inspection & Return Controller

Handles:
1. PM Inspection - Quality check when vendor delivers to M2 Store
2. Buyer Return Requests - Refund, Replacement, or New Vendor
3. TD Approval - Approves return requests and new vendor selections
4. Iteration Tracking - Parent-child numbering for re-purchases
"""

from datetime import datetime
from flask import request, jsonify, g
from config.db import db
from models.vendor_inspection import (
    VendorDeliveryInspection,
    VendorReturnRequest,
    InspectionIterationTracker
)
from models.inventory import (
    InternalMaterialRequest,
    InventoryMaterial,
    InventoryTransaction
)
from models.change_request import ChangeRequest
from models.po_child import POChild
from models.vendor import Vendor

import logging

log = logging.getLogger(__name__)


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def _normalize_role(role_str):
    """Normalize role name for comparison"""
    return role_str.lower().replace('_', '').replace(' ', '').replace('-', '')


def _check_pm_access():
    """Check if current user is Production Manager or Admin"""
    current_user = g.user
    role = _normalize_role(current_user.get('role', ''))
    if role not in ('productionmanager', 'admin'):
        return jsonify({"success": False, "error": "Access denied. Production Manager or Admin role required."}), 403
    return None


def _check_buyer_access():
    """Check if current user is Buyer or Admin"""
    current_user = g.user
    role = _normalize_role(current_user.get('role', ''))
    if role not in ('buyer', 'admin'):
        return jsonify({"success": False, "error": "Access denied. Buyer or Admin role required."}), 403
    return None


def _check_td_access():
    """Check if current user is Technical Director or Admin"""
    current_user = g.user
    role = _normalize_role(current_user.get('role', ''))
    if role not in ('technicaldirector', 'admin'):
        return jsonify({"success": False, "error": "Access denied. Technical Director or Admin role required."}), 403
    return None


def _safe_float(val, default=0.0):
    """Safely convert to float, returning default on failure."""
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _enrich_vrr_rejected_value(rr, data):
    """Recalculate total_rejected_value on-the-fly if stored as 0.
    Looks up prices from POChild materials_data as fallback.
    Uses rr.po_child (eager-loaded) to avoid N+1 queries.
    """
    if data.get('total_rejected_value') and data['total_rejected_value'] > 0:
        return  # Already has a value

    materials = rr.rejected_materials or []
    if not materials:
        return

    # Use eager-loaded po_child relationship (avoid N+1)
    if rr.po_child_id:
        po_child = rr.po_child  # Must be joinedload-ed by caller
        if po_child and not po_child.is_deleted and po_child.materials_data:
            price_map = {}
            for mat in po_child.materials_data:
                name = (mat.get('material_name', '') or mat.get('name', '')).strip().lower()
                price = mat.get('unit_price') or mat.get('price') or mat.get('unit_cost')
                if name and price:
                    price_map[name] = _safe_float(price)

            total = 0.0
            for m in materials:
                mat_name = (m.get('material_name', '') or '').strip().lower()
                unit_price = _safe_float(m.get('unit_price')) or price_map.get(mat_name, 0)
                qty = _safe_float(m.get('rejected_qty', 0))
                total += qty * unit_price

            if total > 0:
                data['total_rejected_value'] = round(total, 2)


def _generate_return_request_number():
    """Generate sequential return request number: VRR-2026-001
    Uses MAX() aggregate to avoid row-level locking.
    The UNIQUE constraint on return_request_number prevents duplicates at DB level.
    """
    current_year = datetime.utcnow().year
    prefix = f'VRR-{current_year}-'

    last_num_str = db.session.query(
        db.func.max(VendorReturnRequest.return_request_number)
    ).filter(
        VendorReturnRequest.return_request_number.like(f'{prefix}%')
    ).scalar()

    if last_num_str:
        next_num = int(last_num_str.split('-')[-1]) + 1
    else:
        next_num = 1

    return f"{prefix}{next_num:03d}"


def _get_next_iteration_suffix(cr_id, parent_iteration_id=None):
    """Calculate next iteration suffix for a CR"""
    if parent_iteration_id:
        # Child of an existing iteration (e.g., .1 -> .1.1)
        parent = InspectionIterationTracker.query.get(parent_iteration_id)
        if parent:
            existing = InspectionIterationTracker.query.filter_by(
                parent_iteration_id=parent_iteration_id,
                is_deleted=False
            ).count()
            return f"{parent.iteration_suffix}.{existing + 1}"

    # Top-level iteration (e.g., .1, .2, .3)
    existing = InspectionIterationTracker.query.filter_by(
        cr_id=cr_id,
        parent_iteration_id=None,
        is_deleted=False
    ).count()
    return f".{existing + 1}"


# ============================================================
# PM INSPECTION ENDPOINTS
# ============================================================

def get_pending_inspections():
    """
    GET /api/inventory/pending-inspections
    List vendor deliveries awaiting PM inspection.
    Queries IMRs where source_type='from_vendor_delivery' and status='awaiting_vendor_delivery'
    """
    access_check = _check_pm_access()
    if access_check:
        return access_check

    try:
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        search = request.args.get('search', '', type=str)

        query = InternalMaterialRequest.query.filter(
            InternalMaterialRequest.source_type == 'from_vendor_delivery',
            InternalMaterialRequest.status == 'awaiting_vendor_delivery'
        )

        if search:
            query = query.filter(
                db.or_(
                    InternalMaterialRequest.item_name.ilike(f'%{search}%'),
                    db.cast(InternalMaterialRequest.cr_id, db.String).ilike(f'%{search}%')
                )
            )

        query = query.order_by(InternalMaterialRequest.created_at.desc())
        total = query.count()
        imrs = query.offset((page - 1) * per_page).limit(per_page).all()

        # Batch-fetch CRs (with project eager-loaded) and POChildren to avoid N+1 queries
        from sqlalchemy.orm import joinedload

        cr_ids = list({imr.cr_id for imr in imrs if imr.cr_id})
        po_child_ids = list({imr.po_child_id for imr in imrs if imr.po_child_id})

        cr_map = {}
        if cr_ids:
            crs = ChangeRequest.query.options(
                joinedload(ChangeRequest.project)
            ).filter(
                ChangeRequest.cr_id.in_(cr_ids),
                ChangeRequest.is_deleted == False
            ).all()
            cr_map = {cr.cr_id: cr for cr in crs}

        po_child_map = {}
        if po_child_ids:
            po_children = POChild.query.filter(POChild.id.in_(po_child_ids)).all()
            po_child_map = {pc.id: pc for pc in po_children}

        # Batch-fetch replacement VRR links to tag replacement deliveries
        imr_ids = [imr.request_id for imr in imrs]
        replacement_vrr_map = {}
        if imr_ids:
            replacement_vrrs = VendorReturnRequest.query.filter(
                VendorReturnRequest.replacement_imr_id.in_(imr_ids),
                VendorReturnRequest.is_deleted == False
            ).all()
            replacement_vrr_map = {vrr.replacement_imr_id: vrr for vrr in replacement_vrrs}

        results = []
        for imr in imrs:
            imr_data = imr.to_dict()

            # Tag replacement deliveries
            linked_vrr = replacement_vrr_map.get(imr.request_id)
            imr_data['is_replacement'] = linked_vrr is not None
            imr_data['replacement_vrr_number'] = linked_vrr.return_request_number if linked_vrr else None

            # Enrich with CR and vendor info
            cr = cr_map.get(imr.cr_id)
            if cr:
                imr_data['formatted_cr_id'] = cr.get_formatted_cr_id()
                imr_data['project_id'] = cr.project_id
                imr_data['vendor_id'] = cr.selected_vendor_id
                imr_data['vendor_name'] = cr.selected_vendor_name
                imr_data['item_name'] = cr.item_name

                # Check if this is from a POChild
                if imr.po_child_id:
                    po_child = po_child_map.get(imr.po_child_id)
                    if po_child:
                        imr_data['formatted_po_id'] = po_child.get_formatted_id()
                        imr_data['vendor_id'] = po_child.vendor_id
                        imr_data['vendor_name'] = po_child.vendor_name

            # Get project name
            if cr and cr.project:
                imr_data['project_name'] = cr.project.project_name
            else:
                imr_data['project_name'] = None

            results.append(imr_data)

        return jsonify({
            "success": True,
            "data": results,
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200

    except Exception as e:
        log.error(f"Error fetching pending inspections: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def get_inspection_details(imr_id):
    """
    GET /api/inventory/inspection/<imr_id>
    Get full details of a delivery for inspection.
    """
    access_check = _check_pm_access()
    if access_check:
        return access_check

    try:
        imr = InternalMaterialRequest.query.get(imr_id)
        if not imr:
            return jsonify({"success": False, "error": "Internal Material Request not found"}), 404

        if imr.source_type != 'from_vendor_delivery':
            return jsonify({"success": False, "error": "This IMR is not from a vendor delivery"}), 400

        imr_data = imr.to_dict()

        # Get CR details
        cr = ChangeRequest.query.filter_by(cr_id=imr.cr_id, is_deleted=False).first()
        if cr:
            imr_data['cr_details'] = {
                'cr_id': cr.cr_id,
                'formatted_cr_id': cr.get_formatted_cr_id(),
                'project_id': cr.project_id,
                'item_name': cr.item_name,
                'justification': cr.justification,
                'materials_total_cost': cr.materials_total_cost,
                'vendor_id': cr.selected_vendor_id,
                'vendor_name': cr.selected_vendor_name,
                'purchase_completed_by_name': cr.purchase_completed_by_name,
                'purchase_completion_date': cr.purchase_completion_date.isoformat() if cr.purchase_completion_date else None,
            }

            # Get project name
            if cr.project:
                imr_data['cr_details']['project_name'] = cr.project.project_name

        # Get POChild details if exists
        po_child = None
        if imr.po_child_id:
            po_child = POChild.query.get(imr.po_child_id)
            if po_child:
                imr_data['po_child_details'] = po_child.to_dict()

        # Get vendor details
        vendor_id = None
        if po_child:
            vendor_id = po_child.vendor_id
        elif cr:
            vendor_id = cr.selected_vendor_id

        if vendor_id:
            vendor = Vendor.query.get(vendor_id)
            if vendor:
                imr_data['vendor_details'] = {
                    'vendor_id': vendor.vendor_id,
                    'company_name': vendor.company_name,
                    'contact_person_name': vendor.contact_person_name,
                    'email': vendor.email,
                    'phone': vendor.phone,
                    'phone_code': vendor.phone_code,
                }

        # Parse materials from materials_data for inspection form
        materials_for_inspection = []
        materials_data = imr.materials_data or []
        mat_index = 0
        if isinstance(materials_data, list):
            for item in materials_data:
                if isinstance(item, dict):
                    # Handle grouped sub-items format
                    materials_list = item.get('materials', [item])
                    for mat in materials_list:
                        qty = mat.get('quantity', 0)
                        materials_for_inspection.append({
                            'material_id': mat_index,
                            'material_name': mat.get('material_name', ''),
                            'brand': mat.get('brand', ''),
                            'size': mat.get('size', ''),
                            'unit': mat.get('unit', ''),
                            'quantity': qty,
                            'ordered_qty': qty,
                            'unit_price': mat.get('unit_price', 0),
                        })
                        mat_index += 1

        imr_data['materials_for_inspection'] = materials_for_inspection

        # Get previous inspections for this CR (iteration history) with eager-loaded relationships
        from sqlalchemy.orm import joinedload as jl
        previous_inspections = VendorDeliveryInspection.query.options(
            jl(VendorDeliveryInspection.vendor),
            jl(VendorDeliveryInspection.change_request),
            jl(VendorDeliveryInspection.po_child)
        ).filter_by(
            cr_id=imr.cr_id,
            is_deleted=False
        ).order_by(VendorDeliveryInspection.created_at.desc()).limit(50).all()
        imr_data['previous_inspections'] = [i.to_dict() for i in previous_inspections]

        return jsonify({
            "success": True,
            "data": imr_data
        }), 200

    except Exception as e:
        log.error(f"Error fetching inspection details: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def submit_inspection(imr_id):
    """
    POST /api/inventory/inspection/<imr_id>/submit
    PM submits inspection decision (fully_approved, partially_approved, fully_rejected).

    Request body:
    {
        "decision": "fully_approved" | "partially_approved" | "fully_rejected",
        "materials_inspection": [{material_name, brand, size, unit, ordered_qty, accepted_qty, rejected_qty, rejection_category, rejection_notes, photo_urls}],
        "overall_notes": "...",
        "overall_rejection_category": "...",
        "evidence_urls": [{url, file_name, file_type}]
    }
    """
    access_check = _check_pm_access()
    if access_check:
        return access_check

    try:
        current_user = g.user
        data = request.get_json()

        if not data:
            return jsonify({"success": False, "error": "Request body required"}), 400

        decision = data.get('decision')
        if decision not in ('fully_approved', 'partially_approved', 'fully_rejected'):
            return jsonify({"success": False, "error": "Invalid decision. Must be: fully_approved, partially_approved, or fully_rejected"}), 400

        materials_inspection = data.get('materials_inspection', [])
        if not materials_inspection:
            return jsonify({"success": False, "error": "materials_inspection is required"}), 400

        # Optional stock-in details (actual prices, transport, delivery note)
        stock_in_details = data.get('stock_in_details') or {}

        # Validate IMR (row lock to prevent concurrent inspection submissions)
        imr = InternalMaterialRequest.query.filter_by(request_id=imr_id).with_for_update().first()
        if not imr:
            return jsonify({"success": False, "error": "Internal Material Request not found"}), 404

        if imr.source_type != 'from_vendor_delivery':
            return jsonify({"success": False, "error": "This IMR is not from a vendor delivery"}), 400

        if imr.status != 'awaiting_vendor_delivery':
            return jsonify({"success": False, "error": f"IMR is not awaiting vendor delivery. Current status: {imr.status}"}), 400

        # Get CR and vendor info
        cr = ChangeRequest.query.filter_by(cr_id=imr.cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"success": False, "error": "Change Request not found"}), 404

        vendor_id = None
        po_child = None
        if imr.po_child_id:
            po_child = POChild.query.get(imr.po_child_id)
            if po_child:
                vendor_id = po_child.vendor_id
        else:
            vendor_id = cr.selected_vendor_id

        # Determine iteration number
        iteration_number = VendorDeliveryInspection.query.filter_by(
            cr_id=imr.cr_id,
            is_deleted=False
        ).count()

        # Embed stock_in_details into materials_inspection so it persists with the inspection
        # This allows the "Awaiting Stock In" tab to pre-fill transport details later
        if stock_in_details and decision != 'fully_rejected':
            for mat_entry in materials_inspection:
                mat_entry['_stock_in_driver_name'] = stock_in_details.get('driver_name', '')
                mat_entry['_stock_in_vehicle_number'] = stock_in_details.get('vehicle_number', '')
                mat_entry['_stock_in_reference_number'] = stock_in_details.get('reference_number', '')
                mat_entry['_stock_in_per_unit_transport_fee'] = stock_in_details.get('per_unit_transport_fee', 0)

        # Create inspection record
        inspection = VendorDeliveryInspection(
            cr_id=imr.cr_id,
            po_child_id=imr.po_child_id,
            imr_id=imr_id,
            vendor_id=vendor_id,
            inspection_status=decision,
            inspected_by_user_id=current_user['user_id'],
            inspected_by_name=current_user.get('full_name', ''),
            inspected_at=datetime.utcnow(),
            materials_inspection=materials_inspection,
            overall_notes=data.get('overall_notes'),
            overall_rejection_category=data.get('overall_rejection_category'),
            evidence_urls=data.get('evidence_urls', []),
            iteration_number=iteration_number,
            created_by=current_user['user_id']
        )
        db.session.add(inspection)
        db.session.flush()  # Ensure inspection.id is populated for VRR linkage

        accepted_count = 0
        rejected_count = 0

        if decision == 'fully_approved':
            # Inspection approved — stock-in will be completed manually by PM via Manual Entry
            imr.status = 'inspected_pending_stockin'
            imr.vendor_delivery_confirmed = True
            cr.vendor_delivered_to_store = True
            cr.vendor_delivery_date = datetime.utcnow()
            cr.store_request_status = 'delivered_to_store'
            cr.inspection_status = 'fully_approved'

            if po_child:
                po_child.inspection_status = 'fully_approved'
                po_child.store_request_status = 'delivered_to_store'

            accepted_count = len(materials_inspection)

        elif decision == 'partially_approved':
            # Partially approved — accepted qty will be stocked in manually by PM
            imr.status = 'inspected_pending_stockin'
            imr.vendor_delivery_confirmed = True
            cr.vendor_delivered_to_store = True
            cr.vendor_delivery_date = datetime.utcnow()
            cr.store_request_status = 'partially_delivered'
            cr.inspection_status = 'partially_approved'

            if po_child:
                po_child.inspection_status = 'partially_approved'
                po_child.store_request_status = 'partially_delivered'

            for mat in materials_inspection:
                if mat.get('accepted_qty', 0) > 0:
                    accepted_count += 1
                if mat.get('rejected_qty', 0) > 0:
                    rejected_count += 1

        elif decision == 'fully_rejected':
            # Nothing enters inventory
            imr.status = 'REJECTED'
            cr.store_request_status = 'inspection_rejected'
            cr.inspection_status = 'fully_rejected'

            if po_child:
                po_child.inspection_status = 'fully_rejected'
                po_child.store_request_status = 'inspection_rejected'

            rejected_count = len(materials_inspection)

        # Check if this IMR is linked to a replacement VRR — auto-complete VRR if approved
        linked_vrr = VendorReturnRequest.query.filter_by(
            replacement_imr_id=imr_id, is_deleted=False
        ).first()

        if linked_vrr:
            inspection.parent_inspection_id = linked_vrr.inspection_id
            if decision in ('fully_approved', 'partially_approved'):
                linked_vrr.status = 'completed'
                linked_vrr.return_confirmed_at = datetime.utcnow()
                linked_vrr.replacement_inspection_id = inspection.id
                linked_vrr.updated_at = datetime.utcnow()

                # Check if all VRRs for this CR are completed → resolve CR
                pending_returns = VendorReturnRequest.query.filter(
                    VendorReturnRequest.cr_id == linked_vrr.cr_id,
                    VendorReturnRequest.id != linked_vrr.id,
                    VendorReturnRequest.status != 'completed',
                    VendorReturnRequest.is_deleted == False
                ).count()
                if pending_returns == 0:
                    cr.inspection_status = 'resolved'

                log.info(f"Replacement inspection approved → VRR {linked_vrr.return_request_number} completed")

            elif decision == 'fully_rejected':
                # VRR stays in replacement_pending — rejection flow continues
                log.info(f"Replacement inspection rejected → VRR {linked_vrr.return_request_number} stays pending")

        db.session.commit()

        # Send notifications
        try:
            if decision in ('partially_approved', 'fully_rejected'):
                _notify_buyer_inspection_result(cr, inspection, decision)
        except Exception as notif_err:
            log.error(f"Failed to send inspection notification: {str(notif_err)}")

        # Build accepted_materials list so frontend can pre-fill the stock-in form
        # stock_in_details was already read at line 357 — reuse it here
        accepted_materials_for_stockin = []
        if decision in ('fully_approved', 'partially_approved'):
            for mat in materials_inspection:
                accepted_qty = mat.get('accepted_qty', 0)
                if accepted_qty > 0:
                    accepted_materials_for_stockin.append({
                        'material_name': mat.get('material_name', ''),
                        'brand': mat.get('brand', ''),
                        'size': mat.get('size', ''),
                        'unit': mat.get('unit', ''),
                        'quantity': accepted_qty,
                        'unit_price': mat.get('unit_price', 0),
                        'driver_name': stock_in_details.get('driver_name', ''),
                        'vehicle_number': stock_in_details.get('vehicle_number', ''),
                        'reference_number': stock_in_details.get('reference_number', ''),
                        'per_unit_transport_fee': stock_in_details.get('per_unit_transport_fee', 0),
                    })

        return jsonify({
            "success": True,
            "message": f"Inspection submitted: {decision.replace('_', ' ')}",
            "data": {
                "inspection_id": inspection.id,
                "inspection_status": decision,
                "accepted_materials_count": accepted_count,
                "rejected_materials_count": rejected_count,
                "accepted_materials": accepted_materials_for_stockin,
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error submitting inspection: {str(e)}", exc_info=True)
        return jsonify({"success": False, "error": "An internal error occurred while processing the inspection. Please try again."}), 500


def _add_material_to_inventory(material_data, current_user, imr, inv_material_count=None, stock_in_details=None, is_first_material=False):
    """Helper: Add an accepted material to M2 Store inventory.

    Args:
        inv_material_count: Pre-computed InventoryMaterial count to avoid repeated COUNT(*) queries.
        stock_in_details: Optional dict with stock-in fields (actual prices, transport, delivery note).
        is_first_material: If True, transport fee is applied to this material's transaction.
                          Only the first material in a delivery batch should carry the transport fee.

    Returns:
        True if a new InventoryMaterial row was created, False if existing stock was updated.
    """
    material_name = material_data.get('material_name', '')
    brand = material_data.get('brand', '')
    size = material_data.get('size', '')
    quantity = material_data.get('quantity', material_data.get('accepted_qty', 0))
    unit = material_data.get('unit', '')
    unit_price = material_data.get('unit_price', 0)

    # Use actual purchase price from stock_in_details if provided
    if stock_in_details:
        actual_prices = stock_in_details.get('actual_unit_prices') or {}
        if material_name and material_name in actual_prices:
            actual_price = actual_prices[material_name]
            if isinstance(actual_price, (int, float)) and actual_price >= 0:
                unit_price = actual_price

    if quantity <= 0:
        return False

    created_new = False

    # Find or create inventory material
    inv_material = InventoryMaterial.query.filter(
        InventoryMaterial.material_name.ilike(material_name),
        InventoryMaterial.is_active == True
    ).first()

    if inv_material:
        # Update existing stock and latest unit price
        inv_material.current_stock = (inv_material.current_stock or 0) + quantity
        inv_material.unit_price = unit_price
        inv_material.last_modified_at = datetime.utcnow()
        inv_material.last_modified_by = current_user.get('full_name', '')
    else:
        # Generate material code using pre-computed count
        count = inv_material_count if inv_material_count is not None else (db.session.query(db.func.max(InventoryMaterial.inventory_material_id)).scalar() or 0)
        material_code = f"MAT-{datetime.utcnow().year}-{count + 1:03d}"

        inv_material = InventoryMaterial(
            material_code=material_code,
            material_name=material_name,
            brand=brand,
            size=size,
            unit=unit or 'pcs',
            current_stock=quantity,
            unit_price=unit_price,
            created_by=current_user.get('full_name', ''),
            last_modified_by=current_user.get('full_name', ''),
        )
        db.session.add(inv_material)
        db.session.flush()
        created_new = True

    # Build transaction with stock-in details
    transport_fee = None
    driver_name = None
    driver_contact = None
    vehicle_number = None
    delivery_batch_ref = None
    reference_number = f"INSP-{imr.cr_id}" if imr else None
    delivery_note_url = None
    notes = "Vendor delivery inspection - accepted"

    if stock_in_details:
        # Transport fee only on first material to avoid double-counting
        if is_first_material:
            per_unit_fee = stock_in_details.get('per_unit_transport_fee')
            if isinstance(per_unit_fee, (int, float)) and per_unit_fee > 0:
                transport_fee = per_unit_fee * quantity
        driver_name = str(stock_in_details.get('driver_name') or '')[:200] or None
        driver_contact = str(stock_in_details.get('driver_contact') or '')[:50] or None
        vehicle_number = str(stock_in_details.get('vehicle_number') or '')[:100] or None
        delivery_note_url = str(stock_in_details.get('delivery_note_url') or '')[:500] or None
        ref = stock_in_details.get('reference_number')
        if ref:
            reference_number = str(ref)[:200]

    # Create inventory transaction record
    transaction = InventoryTransaction(
        inventory_material_id=inv_material.inventory_material_id,
        transaction_type='PURCHASE',
        quantity=quantity,
        unit_price=unit_price,
        total_amount=quantity * unit_price,
        project_id=imr.project_id if imr else None,
        reference_number=reference_number,
        notes=notes,
        transport_fee=transport_fee,
        driver_name=driver_name,
        driver_contact=driver_contact,
        vehicle_number=vehicle_number,
        delivery_batch_ref=delivery_batch_ref,
        delivery_note_url=delivery_note_url,
        created_by=current_user.get('full_name', ''),
    )
    db.session.add(transaction)

    return created_new


def _notify_buyer_inspection_result(cr, inspection, decision):
    """Notify buyer about inspection result"""
    try:
        from utils.comprehensive_notification_service import ComprehensiveNotificationService
        buyer_id = cr.assigned_to_buyer_user_id or cr.purchase_completed_by_user_id
        if not buyer_id:
            return

        if decision == 'fully_rejected':
            title = f"Delivery Fully Rejected - {cr.get_formatted_cr_id()}"
            message = f"All materials in {cr.get_formatted_cr_id()} have been rejected during quality inspection. Please create a return request."
            notif_type = 'warning'
        else:
            title = f"Delivery Partially Approved - {cr.get_formatted_cr_id()}"
            message = f"Some materials in {cr.get_formatted_cr_id()} were rejected during quality inspection. Please review and create a return request for rejected items."
            notif_type = 'info'

        ComprehensiveNotificationService.send_simple_notification(
            user_id=buyer_id,
            title=title,
            message=message,
            type=notif_type,
            action_url='/buyer/rejected-deliveries',
            metadata={
                'cr_id': cr.cr_id,
                'inspection_id': inspection.id,
                'workflow': 'vendor_inspection'
            }
        )
    except Exception as e:
        log.error(f"Failed to notify buyer about inspection: {str(e)}")


def get_pending_stockin_inspections():
    """
    GET /api/inventory/inspections/pending-stockin
    List inspections that are approved but PM hasn't completed stock-in yet.
    """
    access_check = _check_pm_access()
    if access_check:
        return access_check

    try:
        from sqlalchemy.orm import joinedload

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)

        base_filter = VendorDeliveryInspection.query.filter(
            VendorDeliveryInspection.is_deleted == False,
            VendorDeliveryInspection.inspection_status.in_(['fully_approved', 'partially_approved']),
            VendorDeliveryInspection.stock_in_completed == False
        )

        total = base_filter.count()

        inspections = base_filter.options(
            joinedload(VendorDeliveryInspection.vendor),
            joinedload(VendorDeliveryInspection.change_request),
            joinedload(VendorDeliveryInspection.po_child)
        ).order_by(
            VendorDeliveryInspection.inspected_at.desc()
        ).offset((page - 1) * per_page).limit(per_page).all()

        results = []
        for insp in inspections:
            data = insp.to_dict()

            # Build PO/CR reference for display (fallback if not stored in inspection)
            fallback_reference = ''
            if insp.po_child:
                fallback_reference = insp.po_child.get_formatted_id() or ''
            elif insp.change_request:
                fallback_reference = insp.change_request.get_formatted_cr_id() or ''

            # Extract accepted materials + stored transport details from materials_inspection JSONB
            accepted = []
            all_mats = insp.materials_inspection or []
            # Transport details are embedded in each material entry (prefixed with _stock_in_)
            first_mat = all_mats[0] if all_mats else {}
            stored_driver = first_mat.get('_stock_in_driver_name', '')
            stored_vehicle = first_mat.get('_stock_in_vehicle_number', '')
            stored_reference = first_mat.get('_stock_in_reference_number', '') or fallback_reference
            stored_transport_fee = first_mat.get('_stock_in_per_unit_transport_fee', 0)

            for mat in all_mats:
                accepted_qty = mat.get('accepted_qty', 0)
                if accepted_qty > 0:
                    accepted.append({
                        'material_name': mat.get('material_name', ''),
                        'brand': mat.get('brand', ''),
                        'size': mat.get('size', ''),
                        'unit': mat.get('unit', ''),
                        'quantity': accepted_qty,
                        'unit_price': mat.get('unit_price', 0),
                        'driver_name': stored_driver,
                        'vehicle_number': stored_vehicle,
                        'reference_number': stored_reference,
                        'per_unit_transport_fee': stored_transport_fee,
                    })
            data['accepted_materials'] = accepted
            results.append(data)

        return jsonify({
            "success": True,
            "data": results,
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200

    except Exception as e:
        log.error(f"Error fetching pending stock-in inspections: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred."}), 500


def complete_inspection_stockin(inspection_id):
    """
    POST /api/inventory/inspection/<inspection_id>/complete-stockin
    Mark an inspection's stock-in as completed after PM does manual stock entry.
    Transitions IMR from 'inspected_pending_stockin' -> 'APPROVED'.
    """
    access_check = _check_pm_access()
    if access_check:
        return access_check

    try:
        current_user = g.user

        inspection = VendorDeliveryInspection.query.filter_by(
            id=inspection_id, is_deleted=False
        ).first()

        if not inspection:
            return jsonify({"success": False, "error": "Inspection not found"}), 404

        if inspection.stock_in_completed:
            return jsonify({"success": True, "message": "Stock-in was already completed for this inspection", "data": inspection.to_dict()}), 200

        if inspection.inspection_status not in ('fully_approved', 'partially_approved'):
            return jsonify({"success": False, "error": "Only approved inspections can be marked as stocked in"}), 400

        # Mark inspection as stocked in
        inspection.stock_in_completed = True
        inspection.stock_in_completed_at = datetime.utcnow()
        inspection.stock_in_completed_by = current_user['user_id']

        # Transition IMR from inspected_pending_stockin -> APPROVED
        if inspection.imr_id:
            imr = InternalMaterialRequest.query.get(inspection.imr_id)
            if imr and imr.status == 'inspected_pending_stockin':
                imr.status = 'APPROVED'

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Stock-in completed for this inspection",
            "data": inspection.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error completing inspection stock-in: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred."}), 500


def get_inspection_history():
    """
    GET /api/inventory/inspections/history
    Get completed inspections with filters.
    """
    access_check = _check_pm_access()
    if access_check:
        return access_check

    try:
        from sqlalchemy.orm import joinedload

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        status_filter = request.args.get('status', '', type=str)
        search = request.args.get('search', '', type=str)

        # Build base filter without eager-loads (for efficient COUNT)
        base_query = VendorDeliveryInspection.query.filter_by(is_deleted=False)

        if status_filter:
            base_query = base_query.filter_by(inspection_status=status_filter)

        if search:
            base_query = base_query.filter(
                db.or_(
                    db.cast(VendorDeliveryInspection.cr_id, db.String).ilike(f'%{search}%'),
                    VendorDeliveryInspection.inspected_by_name.ilike(f'%{search}%'),
                )
            )

        total = base_query.count()

        # Eager-load relationships used by to_dict() to avoid N+1
        inspections = base_query.options(
            joinedload(VendorDeliveryInspection.vendor),
            joinedload(VendorDeliveryInspection.change_request),
            joinedload(VendorDeliveryInspection.po_child)
        ).order_by(VendorDeliveryInspection.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

        return jsonify({
            "success": True,
            "data": [i.to_dict() for i in inspections],
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200

    except Exception as e:
        log.error(f"Error fetching inspection history: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def get_inspection_by_id(inspection_id):
    """
    GET /api/inventory/inspections/<inspection_id>
    Get a specific inspection record with full details.
    Accessible by PM, Buyer, TD, and Admin.
    """
    # Authorization: restrict to PM, Buyer, TD, Admin
    current_user = g.user
    role = _normalize_role(current_user.get('role', ''))
    allowed_roles = ('productionmanager', 'buyer', 'technicaldirector', 'admin')
    if role not in allowed_roles:
        return jsonify({"success": False, "error": "Access denied"}), 403

    try:
        inspection = VendorDeliveryInspection.query.filter_by(
            id=inspection_id, is_deleted=False
        ).first()

        if not inspection:
            return jsonify({"success": False, "error": "Inspection not found"}), 404

        data = inspection.to_dict()

        # Include return requests linked to this inspection
        return_requests = VendorReturnRequest.query.filter_by(
            inspection_id=inspection_id, is_deleted=False
        ).all()
        data['return_requests'] = [rr.to_dict() for rr in return_requests]

        return jsonify({"success": True, "data": data}), 200

    except Exception as e:
        log.error(f"Error fetching inspection: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def upload_inspection_evidence():
    """
    POST /api/inventory/inspection/upload-evidence
    Upload photos/videos to Supabase Storage for inspection evidence.
    """
    access_check = _check_pm_access()
    if access_check:
        return access_check

    try:
        import os
        from supabase import create_client

        environment = os.environ.get('ENVIRONMENT', 'production')
        if environment == 'development':
            supabase_url = os.environ.get('DEV_SUPABASE_URL')
            supabase_key = os.environ.get('DEV_SUPABASE_KEY')
        else:
            supabase_url = os.environ.get('SUPABASE_URL')
            supabase_key = os.environ.get('SUPABASE_KEY')

        if not supabase_url or not supabase_key:
            return jsonify({"success": False, "error": "Supabase not configured"}), 500

        supabase = create_client(supabase_url, supabase_key)
        BUCKET = "file_upload"

        if 'file' not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400

        file = request.files['file']
        cr_id = request.form.get('cr_id', 'unknown')

        if not file.filename:
            return jsonify({"success": False, "error": "No file selected"}), 400

        # Validate file type
        allowed_extensions = {'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm', 'pdf'}
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in allowed_extensions:
            return jsonify({"success": False, "error": f"File type '{ext}' not allowed. Allowed: {', '.join(allowed_extensions)}"}), 400

        # Early size check via Content-Length header (avoids reading huge files into memory)
        max_size = 200 * 1024 * 1024 if ext in ('mp4', 'mov', 'webm') else 50 * 1024 * 1024
        content_length = request.content_length
        if content_length and content_length > max_size:
            return jsonify({"success": False, "error": f"File too large. Max: {max_size // (1024*1024)}MB"}), 400

        # Read and validate actual file size
        file_content = file.read()
        if len(file_content) > max_size:
            return jsonify({"success": False, "error": f"File too large. Max: {max_size // (1024*1024)}MB"}), 400

        # Generate unique path
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        path = f"inspections/{cr_id}/{timestamp}_{unique_id}.{ext}"

        # Determine content type
        content_type_map = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'webp': 'image/webp', 'gif': 'image/gif', 'pdf': 'application/pdf',
            'mp4': 'video/mp4', 'mov': 'video/quicktime', 'webm': 'video/webm',
        }
        content_type = content_type_map.get(ext, 'application/octet-stream')

        # Upload to Supabase
        supabase.storage.from_(BUCKET).upload(
            path=path,
            file=file_content,
            file_options={"content-type": content_type, "upsert": "true"}
        )

        public_url = f"{supabase_url}/storage/v1/object/public/{BUCKET}/{path}"

        file_type = 'video' if ext in ('mp4', 'mov', 'webm') else 'image'

        return jsonify({
            "success": True,
            "data": {
                "url": public_url,
                "file_name": file.filename,
                "file_type": f"{file_type}/{ext}",
                "uploaded_at": datetime.utcnow().isoformat()
            }
        }), 200

    except Exception as e:
        log.error(f"Error uploading inspection evidence: {str(e)}", exc_info=True)
        return jsonify({"success": False, "error": f"Upload error: {str(e)}"}), 500


def upload_return_evidence():
    """
    POST /api/buyer/return-request/upload-evidence
    Upload proof documents (credit notes, receipts, photos) for return requests.
    Accessible by buyers.
    """
    access_check = _check_buyer_access()
    if access_check:
        return access_check

    try:
        import os
        from supabase import create_client

        environment = os.environ.get('ENVIRONMENT', 'production')
        if environment == 'development':
            supabase_url = os.environ.get('DEV_SUPABASE_URL')
            supabase_key = os.environ.get('DEV_SUPABASE_KEY')
        else:
            supabase_url = os.environ.get('SUPABASE_URL')
            supabase_key = os.environ.get('SUPABASE_KEY')

        if not supabase_url or not supabase_key:
            return jsonify({"success": False, "error": "Storage not configured"}), 500

        supabase = create_client(supabase_url, supabase_key)
        BUCKET = "file_upload"

        if 'file' not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400

        file = request.files['file']
        return_request_id = request.form.get('return_request_id', 'unknown')

        if not file.filename:
            return jsonify({"success": False, "error": "No file selected"}), 400

        allowed_extensions = {'jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'mp4', 'mov'}
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in allowed_extensions:
            return jsonify({"success": False, "error": f"File type '{ext}' not allowed"}), 400

        max_size = 50 * 1024 * 1024
        file_content = file.read()
        if len(file_content) > max_size:
            return jsonify({"success": False, "error": "File too large. Max: 50MB"}), 400

        import uuid
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        unique_id = str(uuid.uuid4())[:8]
        path = f"return_evidence/{return_request_id}/{timestamp}_{unique_id}.{ext}"

        content_type_map = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'webp': 'image/webp', 'gif': 'image/gif', 'pdf': 'application/pdf',
            'mp4': 'video/mp4', 'mov': 'video/quicktime',
        }
        content_type = content_type_map.get(ext, 'application/octet-stream')

        supabase.storage.from_(BUCKET).upload(
            path=path,
            file=file_content,
            file_options={"content-type": content_type, "upsert": "true"}
        )

        public_url = f"{supabase_url}/storage/v1/object/public/{BUCKET}/{path}"

        return jsonify({
            "success": True,
            "data": {
                "url": public_url,
                "file_name": file.filename,
                "file_type": content_type,
            }
        }), 200

    except Exception as e:
        log.error(f"Error uploading return evidence: {str(e)}", exc_info=True)
        return jsonify({"success": False, "error": f"Upload error: {str(e)}"}), 500


# ============================================================
# BUYER RETURN REQUEST ENDPOINTS
# ============================================================

def get_rejected_deliveries():
    """
    GET /api/buyer/rejected-deliveries
    Get all deliveries rejected/partially rejected for the current buyer.
    """
    access_check = _check_buyer_access()
    if access_check:
        return access_check

    try:
        from sqlalchemy.orm import joinedload

        current_user = g.user
        buyer_id = current_user['user_id']
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)

        # Build base filter without eager-loads (for efficient COUNT)
        base_filter = VendorDeliveryInspection.query.join(
            ChangeRequest, VendorDeliveryInspection.cr_id == ChangeRequest.cr_id
        ).filter(
            VendorDeliveryInspection.inspection_status.in_(['partially_approved', 'fully_rejected']),
            VendorDeliveryInspection.is_deleted == False,
            ChangeRequest.is_deleted == False,
            db.or_(
                ChangeRequest.assigned_to_buyer_user_id == buyer_id,
                ChangeRequest.purchase_completed_by_user_id == buyer_id
            )
        )

        total = base_filter.count()

        # Eager-load relationships used by to_dict() to avoid N+1
        inspections = base_filter.options(
            joinedload(VendorDeliveryInspection.vendor),
            joinedload(VendorDeliveryInspection.change_request),
            joinedload(VendorDeliveryInspection.po_child)
        ).order_by(VendorDeliveryInspection.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

        # Batch-fetch return requests for all inspections to avoid N+1
        # NOTE: Business rule enforces max 1 active return request per inspection
        # (enforced in create_return_request via uniqueness check)
        inspection_ids = [insp.id for insp in inspections]
        return_req_map = {}
        if inspection_ids:
            return_reqs = VendorReturnRequest.query.filter(
                VendorReturnRequest.inspection_id.in_(inspection_ids),
                VendorReturnRequest.is_deleted == False
            ).all()
            return_req_map = {rr.inspection_id: rr for rr in return_reqs}

        results = []
        for inspection in inspections:
            data = inspection.to_dict()

            # Enrich materials_inspection with unit_price from POChild
            if inspection.po_child and inspection.po_child.materials_data:
                price_map = {}
                for mat in inspection.po_child.materials_data:
                    # Handle flat structure
                    name = (mat.get('material_name', '') or mat.get('name', '') or '').strip().lower()
                    price = mat.get('unit_price') or mat.get('price') or mat.get('unit_cost')
                    if name and price:
                        price_map[name] = _safe_float(price)
                    # Handle nested structure (sub-items with materials array)
                    for sub_mat in (mat.get('materials', []) or []):
                        sub_name = (sub_mat.get('material_name', '') or sub_mat.get('name', '') or '').strip().lower()
                        sub_price = sub_mat.get('unit_price') or sub_mat.get('price') or sub_mat.get('unit_cost')
                        if sub_name and sub_price:
                            price_map[sub_name] = _safe_float(sub_price)

                if price_map and data.get('materials_inspection'):
                    for m in data['materials_inspection']:
                        if not m.get('unit_price'):
                            mat_key = (m.get('material_name', '') or '').strip().lower()
                            m['unit_price'] = price_map.get(mat_key, 0)

            # Fallback: enrich from CR sub_items_data / materials_data if still missing
            if data.get('materials_inspection') and inspection.change_request:
                cr = inspection.change_request
                cr_materials = cr.sub_items_data or cr.materials_data or []
                cr_price_map = {}
                for item in cr_materials:
                    iname = (item.get('material_name', '') or item.get('name', '') or '').strip().lower()
                    iprice = item.get('unit_price') or item.get('price') or item.get('unit_cost')
                    if iname and iprice:
                        cr_price_map[iname] = _safe_float(iprice)
                    for sub_mat in (item.get('materials', []) or []):
                        sname = (sub_mat.get('material_name', '') or sub_mat.get('name', '') or '').strip().lower()
                        sprice = sub_mat.get('unit_price') or sub_mat.get('price') or sub_mat.get('unit_cost')
                        if sname and sprice:
                            cr_price_map[sname] = _safe_float(sprice)
                if cr_price_map:
                    for m in data['materials_inspection']:
                        if not m.get('unit_price'):
                            mat_key = (m.get('material_name', '') or '').strip().lower()
                            m['unit_price'] = cr_price_map.get(mat_key, 0)

            # Check if return request already exists (from batch-fetched map)
            existing_return = return_req_map.get(inspection.id)
            data['has_return_request'] = existing_return is not None
            if existing_return:
                data['return_request_id'] = existing_return.id
                data['return_request_status'] = existing_return.status

            results.append(data)

        return jsonify({
            "success": True,
            "data": results,
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200

    except Exception as e:
        log.error(f"Error fetching rejected deliveries: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def create_return_request():
    """
    POST /api/buyer/return-request
    Buyer creates return request for rejected materials.

    Request body:
    {
        "inspection_id": 42,
        "resolution_type": "refund" | "replacement" | "new_vendor",
        "rejected_materials": [{material_name, brand, size, unit, rejected_qty, unit_price, rejection_category}],
        "sla_deadline": "2026-03-01T00:00:00Z" (optional),
        "sla_notes": "..." (optional),
        "buyer_notes": "...",
        "new_vendor_id": 5 (required when resolution_type is "new_vendor")
    }
    """
    access_check = _check_buyer_access()
    if access_check:
        return access_check

    try:
        current_user = g.user
        data = request.get_json()

        if not data:
            return jsonify({"success": False, "error": "Request body required"}), 400

        inspection_id = data.get('inspection_id')
        resolution_type = data.get('resolution_type')
        rejected_materials = data.get('rejected_materials', [])

        if not inspection_id:
            return jsonify({"success": False, "error": "inspection_id is required"}), 400

        if resolution_type not in ('refund', 'replacement', 'new_vendor'):
            return jsonify({"success": False, "error": "resolution_type must be: refund, replacement, or new_vendor"}), 400

        # For new_vendor, buyer must select the vendor upfront
        new_vendor_id = data.get('new_vendor_id') if resolution_type == 'new_vendor' else None
        if resolution_type == 'new_vendor' and not new_vendor_id:
            return jsonify({"success": False, "error": "new_vendor_id is required for new vendor resolution"}), 400

        new_vendor = None
        if new_vendor_id:
            new_vendor = Vendor.query.filter_by(vendor_id=new_vendor_id, is_deleted=False).first()
            if not new_vendor:
                return jsonify({"success": False, "error": "Selected vendor not found"}), 404

        if not rejected_materials:
            return jsonify({"success": False, "error": "rejected_materials is required"}), 400

        # Validate inspection exists and was rejected (eager-load vendor for vendor_name)
        from sqlalchemy.orm import joinedload
        inspection = VendorDeliveryInspection.query.options(
            joinedload(VendorDeliveryInspection.vendor)
        ).filter_by(
            id=inspection_id, is_deleted=False
        ).first()

        if not inspection:
            return jsonify({"success": False, "error": "Inspection not found"}), 404

        # Ensure new vendor is different from the original vendor
        if new_vendor_id and inspection.vendor_id and new_vendor_id == inspection.vendor_id:
            return jsonify({"success": False, "error": "New vendor must be different from the original vendor"}), 400

        if inspection.inspection_status not in ('partially_approved', 'fully_rejected'):
            return jsonify({"success": False, "error": "Inspection was not rejected or partially approved"}), 400

        # Check no existing return request for this inspection
        existing = VendorReturnRequest.query.filter_by(
            inspection_id=inspection_id, is_deleted=False
        ).first()

        if existing:
            return jsonify({"success": False, "error": f"Return request already exists: {existing.return_request_number}"}), 409

        # Build price lookup: request → inspection JSONB → POChild materials_data
        material_prices = {}
        for mat in (inspection.materials_inspection or []):
            name = (mat.get('material_name', '') or '').strip().lower()
            if name and mat.get('unit_price'):
                material_prices[name] = _safe_float(mat['unit_price'])

        # Fallback: get prices from the POChild materials_data
        if inspection.po_child_id:
            po_child = POChild.query.filter_by(id=inspection.po_child_id, is_deleted=False).first()
            if po_child and po_child.materials_data:
                for mat in po_child.materials_data:
                    name = (mat.get('material_name', '') or mat.get('name', '') or '').strip().lower()
                    price = mat.get('unit_price') or mat.get('price') or mat.get('unit_cost')
                    if name and price and name not in material_prices:
                        material_prices[name] = _safe_float(price)

        # Enrich rejected_materials with prices and calculate total
        for m in rejected_materials:
            if not m.get('unit_price'):
                mat_key = (m.get('material_name', '') or '').strip().lower()
                m['unit_price'] = material_prices.get(mat_key, 0)

        total_value = sum(
            _safe_float(m.get('rejected_qty', 0)) * _safe_float(m.get('unit_price', 0))
            for m in rejected_materials
        )

        # Parse SLA deadline
        sla_deadline = None
        if data.get('sla_deadline'):
            try:
                sla_deadline = datetime.fromisoformat(data['sla_deadline'].replace('Z', '+00:00'))
            except (ValueError, TypeError):
                pass

        # Generate return request number
        vrr_number = _generate_return_request_number()

        return_request = VendorReturnRequest(
            inspection_id=inspection_id,
            cr_id=inspection.cr_id,
            po_child_id=inspection.po_child_id,
            vendor_id=inspection.vendor_id,
            vendor_name=inspection.vendor.company_name if inspection.vendor else None,
            return_request_number=vrr_number,
            resolution_type=resolution_type,
            status='pending_td_approval',
            rejected_materials=rejected_materials,
            total_rejected_value=total_value,
            sla_deadline=sla_deadline,
            sla_notes=data.get('sla_notes'),
            created_by_buyer_id=current_user['user_id'],
            created_by_buyer_name=current_user.get('full_name', ''),
            buyer_notes=data.get('buyer_notes'),
        )

        # For new_vendor: attach vendor selection upfront so TD approves both at once
        if new_vendor:
            return_request.new_vendor_id = new_vendor.vendor_id
            return_request.new_vendor_name = new_vendor.company_name
            return_request.new_vendor_status = 'pending_td_approval'
        db.session.add(return_request)

        # Update CR inspection status
        cr = ChangeRequest.query.filter_by(cr_id=inspection.cr_id, is_deleted=False).first()
        if cr:
            cr.inspection_status = 'return_in_progress'

        db.session.commit()

        # Notify TD
        try:
            _notify_td_return_request_created(return_request, cr)
        except Exception as notif_err:
            log.error(f"Failed to notify TD about return request: {str(notif_err)}")

        return jsonify({
            "success": True,
            "message": f"Return request created: {vrr_number}",
            "data": return_request.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating return request: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def _notify_td_return_request_created(return_request, cr):
    """Notify TD about new return request requiring approval"""
    try:
        from utils.comprehensive_notification_service import ComprehensiveNotificationService
        from models.user import User
        from models.role import Role

        td_role = Role.query.filter(
            db.func.lower(db.func.replace(Role.role, ' ', '')).like('%technicaldirector%')
        ).first()

        if not td_role:
            return

        td_users = User.query.filter_by(role_id=td_role.role_id, is_active=True).all()
        for td in td_users:
            ComprehensiveNotificationService.send_simple_notification(
                user_id=td.user_id,
                title=f"Return Request Pending Approval - {return_request.return_request_number}",
                message=f"Buyer {return_request.created_by_buyer_name} has created a {return_request.resolution_type} return request for {cr.get_formatted_cr_id() if cr else 'N/A'}. Total value: AED {return_request.total_rejected_value:,.2f}",
                type='warning',
                action_url='/technical-director/return-approvals',
                metadata={
                    'return_request_id': return_request.id,
                    'cr_id': return_request.cr_id,
                    'workflow': 'vendor_return'
                }
            )
    except Exception as e:
        log.error(f"Failed to notify TD: {str(e)}")


def get_return_requests():
    """
    GET /api/buyer/return-requests
    Get all return requests for the current buyer.
    """
    access_check = _check_buyer_access()
    if access_check:
        return access_check

    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        status_filter = request.args.get('status', '', type=str)
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)

        query = VendorReturnRequest.query.filter_by(
            created_by_buyer_id=buyer_id,
            is_deleted=False
        )

        if status_filter:
            query = query.filter_by(status=status_filter)

        from sqlalchemy.orm import joinedload
        query = query.options(
            joinedload(VendorReturnRequest.inspection)
        ).order_by(VendorReturnRequest.created_at.desc())
        total = query.count()
        requests = query.offset((page - 1) * per_page).limit(per_page).all()

        results = []
        for rr in requests:
            data = rr.to_dict()
            if rr.inspection:
                data['inspection_evidence'] = rr.inspection.evidence_urls or []
            results.append(data)

        return jsonify({
            "success": True,
            "data": results,
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200

    except Exception as e:
        log.error(f"Error fetching return requests: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def get_return_request_by_id(request_id):
    """
    GET /api/buyer/return-request/<request_id>
    Get details of a specific return request.
    Accessible by Buyer (own requests), TD, and Admin.
    """
    # Authorization: restrict to Buyer, TD, Admin
    current_user = g.user
    role = _normalize_role(current_user.get('role', ''))
    allowed_roles = ('buyer', 'technicaldirector', 'admin')
    if role not in allowed_roles:
        return jsonify({"success": False, "error": "Access denied"}), 403

    try:
        from sqlalchemy.orm import joinedload

        return_request = VendorReturnRequest.query.options(
            joinedload(VendorReturnRequest.inspection).joinedload(VendorDeliveryInspection.vendor),
            joinedload(VendorReturnRequest.inspection).joinedload(VendorDeliveryInspection.change_request),
            joinedload(VendorReturnRequest.inspection).joinedload(VendorDeliveryInspection.po_child),
        ).filter_by(
            id=request_id, is_deleted=False
        ).first()

        if not return_request:
            return jsonify({"success": False, "error": "Return request not found"}), 404

        data = return_request.to_dict()

        # Include inspection details (already eager-loaded)
        if return_request.inspection:
            data['inspection_details'] = return_request.inspection.to_dict()

        # Include iteration history
        iterations = InspectionIterationTracker.query.filter_by(
            return_request_id=return_request.id,
            is_deleted=False
        ).order_by(InspectionIterationTracker.created_at.asc()).all()
        data['iterations'] = [it.to_dict() for it in iterations]

        return jsonify({"success": True, "data": data}), 200

    except Exception as e:
        log.error(f"Error fetching return request: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def update_return_request(request_id):
    """
    PUT /api/buyer/return-request/<request_id>
    Update return request before TD approval.
    """
    access_check = _check_buyer_access()
    if access_check:
        return access_check

    try:
        return_request = VendorReturnRequest.query.filter_by(
            id=request_id, is_deleted=False
        ).first()

        if not return_request:
            return jsonify({"success": False, "error": "Return request not found"}), 404

        # Verify ownership: only the buyer who created the request (or admin) can edit
        current_user = g.user
        if return_request.created_by_buyer_id != current_user['user_id']:
            role = _normalize_role(current_user.get('role', ''))
            if 'admin' not in role:
                return jsonify({"success": False, "error": "You can only modify your own return requests"}), 403

        if return_request.status != 'pending_td_approval':
            return jsonify({"success": False, "error": "Can only edit return requests pending TD approval"}), 400

        data = request.get_json()

        if data.get('resolution_type'):
            return_request.resolution_type = data['resolution_type']
        if data.get('rejected_materials'):
            return_request.rejected_materials = data['rejected_materials']
            # Fallback to inspection prices if unit_price missing
            insp = VendorDeliveryInspection.query.get(return_request.inspection_id) if return_request.inspection_id else None
            insp_prices = {}
            if insp:
                for mat in (insp.materials_inspection or []):
                    name = mat.get('material_name', '')
                    if name and mat.get('unit_price'):
                        insp_prices[name] = mat['unit_price']
            return_request.total_rejected_value = sum(
                m.get('rejected_qty', 0) * (m.get('unit_price') or insp_prices.get(m.get('material_name', ''), 0))
                for m in data['rejected_materials']
            )
        if data.get('sla_deadline'):
            try:
                return_request.sla_deadline = datetime.fromisoformat(data['sla_deadline'].replace('Z', '+00:00'))
            except (ValueError, TypeError):
                pass
        if 'sla_notes' in data:
            return_request.sla_notes = data['sla_notes']
        if 'buyer_notes' in data:
            return_request.buyer_notes = data['buyer_notes']

        return_request.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Return request updated",
            "data": return_request.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating return request: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def initiate_vendor_return(request_id):
    """
    POST /api/buyer/return-request/<request_id>/initiate-return
    Mark materials as physically returned to vendor.
    """
    access_check = _check_buyer_access()
    if access_check:
        return access_check

    try:
        return_request = VendorReturnRequest.query.filter_by(
            id=request_id, is_deleted=False
        ).first()

        if not return_request:
            return jsonify({"success": False, "error": "Return request not found"}), 404

        # Verify ownership
        current_user = g.user
        if return_request.created_by_buyer_id != current_user['user_id']:
            role = _normalize_role(current_user.get('role', ''))
            if 'admin' not in role:
                return jsonify({"success": False, "error": "You can only initiate returns on your own requests"}), 403

        if return_request.status != 'td_approved':
            return jsonify({"success": False, "error": "Return request must be TD approved first"}), 400

        data = request.get_json() or {}

        return_request.status = 'return_in_progress'
        return_request.return_initiated_at = datetime.utcnow()
        return_request.vendor_return_reference = data.get('vendor_return_reference')
        return_request.updated_at = datetime.utcnow()

        db.session.commit()

        # Notify PM about return being initiated
        try:
            _notify_pm_return_initiated(return_request)
        except Exception as notif_err:
            log.error(f"Failed to notify PM about return: {str(notif_err)}")

        return jsonify({
            "success": True,
            "message": "Vendor return initiated",
            "data": return_request.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error initiating return: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def _notify_pm_return_initiated(return_request):
    """Notify PM that materials are being returned to vendor"""
    try:
        from utils.comprehensive_notification_service import ComprehensiveNotificationService
        from models.user import User
        from models.role import Role

        pm_role = Role.query.filter(
            db.func.lower(db.func.replace(Role.role, ' ', '')).like('%productionmanager%')
        ).first()

        if not pm_role:
            return

        pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True).all()
        for pm in pm_users:
            ComprehensiveNotificationService.send_simple_notification(
                user_id=pm.user_id,
                title=f"Materials Being Returned to Vendor - {return_request.return_request_number}",
                message=f"Buyer {return_request.created_by_buyer_name} has initiated a return to vendor for {return_request.return_request_number}. Resolution: {return_request.resolution_type}.",
                type='info',
                action_url='/production-manager/m2-store/vendor-inspections',
                metadata={
                    'return_request_id': return_request.id,
                    'workflow': 'vendor_return'
                }
            )
    except Exception as e:
        log.error(f"Failed to notify PM about return: {str(e)}")


def confirm_refund_received(request_id):
    """
    POST /api/buyer/return-request/<request_id>/confirm-refund
    Buyer confirms credit note/refund received from vendor.
    Updates LPO amount.
    """
    access_check = _check_buyer_access()
    if access_check:
        return access_check

    try:
        return_request = VendorReturnRequest.query.filter_by(
            id=request_id, is_deleted=False
        ).first()

        if not return_request:
            return jsonify({"success": False, "error": "Return request not found"}), 404

        if return_request.resolution_type != 'refund':
            return jsonify({"success": False, "error": "This is not a refund return request"}), 400

        # Status guard: must be approved and return initiated before confirming refund
        if return_request.status not in ('td_approved', 'return_in_progress', 'returned_to_vendor', 'refund_pending'):
            return jsonify({
                "success": False,
                "error": "Return must be approved and initiated before confirming refund"
            }), 400

        # Verify ownership
        current_user = g.user
        if return_request.created_by_buyer_id != current_user['user_id']:
            role = _normalize_role(current_user.get('role', ''))
            if 'admin' not in role:
                return jsonify({"success": False, "error": "You can only confirm refunds on your own return requests"}), 403

        data = request.get_json() or {}

        return_request.credit_note_number = data.get('credit_note_number')
        return_request.credit_note_amount = data.get('credit_note_amount', return_request.total_rejected_value)
        return_request.credit_note_date = datetime.utcnow()
        return_request.lpo_adjustment_amount = return_request.credit_note_amount
        return_request.refund_evidence = data.get('refund_evidence') or []
        return_request.return_confirmed_at = datetime.utcnow()
        return_request.status = 'completed'
        return_request.updated_at = datetime.utcnow()

        # Update CR inspection status to resolved
        cr = ChangeRequest.query.filter_by(cr_id=return_request.cr_id, is_deleted=False).first()
        if cr:
            # Check if all return requests for this CR are completed
            pending_returns = VendorReturnRequest.query.filter(
                VendorReturnRequest.cr_id == return_request.cr_id,
                VendorReturnRequest.id != return_request.id,
                VendorReturnRequest.status != 'completed',
                VendorReturnRequest.is_deleted == False
            ).count()

            if pending_returns == 0:
                cr.inspection_status = 'resolved'

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Refund confirmed and LPO adjusted",
            "data": return_request.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error confirming refund: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def confirm_replacement_received(request_id):
    """
    POST /api/buyer/return-request/<request_id>/confirm-replacement
    Buyer confirms that the vendor has delivered replacement materials to M2 Store.
    Creates a new IMR so PM can inspect the replacement delivery (same pipeline).
    VRR stays in 'replacement_pending' until PM completes inspection.
    """
    access_check = _check_buyer_access()
    if access_check:
        return access_check

    try:
        return_request = VendorReturnRequest.query.filter_by(
            id=request_id, is_deleted=False
        ).with_for_update().first()

        if not return_request:
            return jsonify({"success": False, "error": "Return request not found"}), 404

        if return_request.resolution_type != 'replacement':
            return jsonify({"success": False, "error": "This is not a replacement return request"}), 400

        # Guard against double-confirmation (already sent to inspection)
        if return_request.replacement_imr_id is not None:
            return jsonify({"success": False, "error": "Replacement materials already sent for inspection"}), 409

        if return_request.status not in ('return_in_progress', 'returned_to_vendor'):
            return jsonify({
                "success": False,
                "error": "Return must be in progress before confirming replacement arrival"
            }), 400

        # Verify ownership
        current_user = g.user
        if return_request.created_by_buyer_id != current_user['user_id']:
            role = _normalize_role(current_user.get('role', ''))
            if 'admin' not in role:
                return jsonify({"success": False, "error": "You can only confirm replacements on your own return requests"}), 403

        data = request.get_json() or {}

        # Get CR for project info
        cr = ChangeRequest.query.filter_by(cr_id=return_request.cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"success": False, "error": "Associated change request not found"}), 404

        # Build materials_data from the rejected materials (these are being replaced)
        replacement_materials = []
        for mat in (return_request.rejected_materials or []):
            replacement_materials.append({
                'material_name': mat.get('material_name', ''),
                'brand': mat.get('brand', ''),
                'size': mat.get('size', ''),
                'unit': mat.get('unit', ''),
                'quantity': mat.get('rejected_qty', 0),
                'unit_price': mat.get('unit_price', 0),
                'total_price': mat.get('rejected_qty', 0) * mat.get('unit_price', 0),
            })

        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', current_user.get('username', 'Unknown'))

        # Determine destination from CR (use existing relationship to avoid extra query)
        final_destination = None
        if cr.project_id and cr.project:
            final_destination = cr.project.project_name

        # Create new IMR for PM inspection of replacement materials
        imr = InternalMaterialRequest(
            cr_id=return_request.cr_id,
            po_child_id=return_request.po_child_id,
            project_id=cr.project_id,
            request_buyer_id=buyer_id,
            item_name=cr.item_name or 'Replacement Materials',
            quantity=sum(m.get('quantity', 0) for m in replacement_materials),
            brand=None,
            size=None,
            notes=f"Replacement delivery for {return_request.return_request_number} - {len(replacement_materials)} material(s)",

            # Vendor delivery tracking — same fields as original purchase
            source_type='from_vendor_delivery',
            status='awaiting_vendor_delivery',
            vendor_delivery_confirmed=False,
            final_destination_site=final_destination,
            routed_by_buyer_id=buyer_id,
            routed_to_store_at=datetime.utcnow(),
            request_send=True,

            # Materials data
            materials_data=replacement_materials,
            materials_count=len(replacement_materials),

            created_at=datetime.utcnow(),
            created_by=buyer_name,
            last_modified_by=buyer_name
        )
        db.session.add(imr)
        db.session.flush()  # Get the IMR request_id

        # Update VRR: link to new IMR, set status to replacement_pending
        return_request.replacement_imr_id = imr.request_id
        return_request.vendor_return_reference = data.get('vendor_return_reference', return_request.vendor_return_reference)
        return_request.refund_evidence = data.get('replacement_evidence') or []
        return_request.status = 'replacement_pending'
        return_request.updated_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Replacement materials sent for inspection: VRR {return_request.return_request_number} → IMR {imr.request_id}")

        return jsonify({
            "success": True,
            "message": "Replacement materials sent for PM inspection",
            "data": return_request.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error confirming replacement: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def select_new_vendor(request_id):
    """
    POST /api/buyer/return-request/<request_id>/select-new-vendor
    Buyer selects a new vendor for rejected materials.
    Sends to TD for vendor approval (same flow as original CR).
    """
    access_check = _check_buyer_access()
    if access_check:
        return access_check

    try:
        current_user = g.user
        return_request = VendorReturnRequest.query.filter_by(
            id=request_id, is_deleted=False
        ).first()

        if not return_request:
            return jsonify({"success": False, "error": "Return request not found"}), 404

        # Verify ownership
        if return_request.created_by_buyer_id != current_user['user_id']:
            role = _normalize_role(current_user.get('role', ''))
            if 'admin' not in role:
                return jsonify({"success": False, "error": "You can only select vendors on your own return requests"}), 403

        if return_request.resolution_type != 'new_vendor':
            return jsonify({"success": False, "error": "This is not a new vendor return request"}), 400

        if return_request.status not in ('td_approved', 'new_vendor_pending'):
            return jsonify({"success": False, "error": "Return must be TD approved first"}), 400

        data = request.get_json() or {}
        new_vendor_id = data.get('vendor_id')

        if not new_vendor_id:
            return jsonify({"success": False, "error": "vendor_id is required"}), 400

        vendor = Vendor.query.filter_by(vendor_id=new_vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"success": False, "error": "Vendor not found"}), 404

        return_request.new_vendor_id = new_vendor_id
        return_request.new_vendor_name = vendor.company_name
        return_request.new_vendor_status = 'pending_td_approval'
        return_request.status = 'new_vendor_pending'
        return_request.updated_at = datetime.utcnow()

        db.session.commit()

        # Notify TD about new vendor selection
        try:
            cr = ChangeRequest.query.filter_by(cr_id=return_request.cr_id).first()
            _notify_td_new_vendor_selected(return_request, cr)
        except Exception as notif_err:
            log.error(f"Failed to notify TD: {str(notif_err)}")

        return jsonify({
            "success": True,
            "message": f"New vendor {vendor.company_name} selected. Pending TD approval.",
            "data": return_request.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error selecting new vendor: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def _notify_td_new_vendor_selected(return_request, cr):
    """Notify TD about new vendor selection requiring approval"""
    try:
        from utils.comprehensive_notification_service import ComprehensiveNotificationService
        from models.user import User
        from models.role import Role

        td_role = Role.query.filter(
            db.func.lower(db.func.replace(Role.role, ' ', '')).like('%technicaldirector%')
        ).first()

        if not td_role:
            return

        td_users = User.query.filter_by(role_id=td_role.role_id, is_active=True).all()
        for td in td_users:
            ComprehensiveNotificationService.send_simple_notification(
                user_id=td.user_id,
                title=f"New Vendor Approval Required - {return_request.return_request_number}",
                message=f"Buyer has selected {return_request.new_vendor_name} as replacement vendor for {cr.get_formatted_cr_id() if cr else 'N/A'}. Please approve.",
                type='warning',
                action_url='/technical-director/return-approvals',
                metadata={
                    'return_request_id': return_request.id,
                    'workflow': 'vendor_return_new_vendor'
                }
            )
    except Exception as e:
        log.error(f"Failed to notify TD: {str(e)}")


# ============================================================
# TD APPROVAL ENDPOINTS
# ============================================================

def get_pending_return_approvals():
    """
    GET /api/technical-director/pending-return-approvals
    Get all return requests pending TD approval.
    """
    access_check = _check_td_access()
    if access_check:
        return access_check

    try:
        from sqlalchemy.orm import joinedload

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)

        # Shared filter for count and data queries
        base_filter = [
            VendorReturnRequest.is_deleted == False,
            db.or_(
                VendorReturnRequest.status == 'pending_td_approval',
                VendorReturnRequest.new_vendor_status == 'pending_td_approval'
            )
        ]

        # Count without joinedload (avoids unnecessary JOIN in COUNT)
        total = VendorReturnRequest.query.filter(*base_filter).count()

        # Fetch with joinedload for eager-loading inspection, new_vendor, po_child
        requests = VendorReturnRequest.query.options(
            joinedload(VendorReturnRequest.inspection),
            joinedload(VendorReturnRequest.new_vendor),
            joinedload(VendorReturnRequest.po_child),
        ).filter(
            *base_filter
        ).order_by(
            VendorReturnRequest.created_at.desc()
        ).offset((page - 1) * per_page).limit(per_page).all()

        results = []
        for rr in requests:
            data = rr.to_dict()

            # Include inspection evidence
            if rr.inspection:
                data['inspection_evidence'] = rr.inspection.evidence_urls or []
                data['inspection_notes'] = rr.inspection.overall_notes
                data['inspection_category'] = rr.inspection.overall_rejection_category

            # Recalculate rejected value if stored as 0
            _enrich_vrr_rejected_value(rr, data)

            # Include full new vendor details for TD decision-making
            if rr.new_vendor_id and rr.new_vendor:
                v = rr.new_vendor
                data['new_vendor_details'] = {
                    'vendor_id': v.vendor_id,
                    'company_name': v.company_name,
                    'contact_person_name': v.contact_person_name,
                    'email': v.email,
                    'phone_code': v.phone_code,
                    'phone': v.phone,
                    'city': v.city,
                    'state': v.state,
                    'country': v.country,
                    'category': v.category,
                    'gst_number': v.gst_number,
                    'status': v.status,
                }

            results.append(data)

        return jsonify({
            "success": True,
            "data": results,
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200

    except Exception as e:
        log.error(f"Error fetching pending return approvals: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def get_all_td_return_requests():
    """
    GET /api/technical-director/all-return-requests
    Get ALL return requests for TD (all statuses) — used for history tabs.
    Supports optional ?status= filter.
    """
    access_check = _check_td_access()
    if access_check:
        return access_check

    try:
        from sqlalchemy.orm import joinedload

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 50, type=int), 100)
        status_filter = request.args.get('status', None)

        base_filter = [VendorReturnRequest.is_deleted == False]

        if status_filter:
            base_filter.append(VendorReturnRequest.status == status_filter)

        total = VendorReturnRequest.query.filter(*base_filter).count()

        requests_list = VendorReturnRequest.query.options(
            joinedload(VendorReturnRequest.inspection),
            joinedload(VendorReturnRequest.new_vendor),
            joinedload(VendorReturnRequest.po_child),
        ).filter(
            *base_filter
        ).order_by(
            VendorReturnRequest.created_at.desc()
        ).offset((page - 1) * per_page).limit(per_page).all()

        results = []
        for rr in requests_list:
            data = rr.to_dict()
            if rr.inspection:
                data['inspection_evidence'] = rr.inspection.evidence_urls or []
                data['inspection_notes'] = rr.inspection.overall_notes
                data['inspection_category'] = rr.inspection.overall_rejection_category

            # Recalculate rejected value if stored as 0
            _enrich_vrr_rejected_value(rr, data)

            if rr.new_vendor_id and rr.new_vendor:
                v = rr.new_vendor
                data['new_vendor_details'] = {
                    'vendor_id': v.vendor_id,
                    'company_name': v.company_name,
                    'contact_person_name': v.contact_person_name,
                    'email': v.email,
                    'phone_code': v.phone_code,
                    'phone': v.phone,
                    'city': v.city,
                    'state': v.state,
                    'country': v.country,
                    'category': v.category,
                    'gst_number': v.gst_number,
                    'status': v.status,
                }
            results.append(data)

        return jsonify({
            "success": True,
            "data": results,
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200

    except Exception as e:
        log.error(f"Error fetching all TD return requests: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def td_approve_return_request(request_id):
    """
    POST /api/technical-director/return-request/<request_id>/approve
    TD approves the return request.
    """
    access_check = _check_td_access()
    if access_check:
        return access_check

    try:
        current_user = g.user
        return_request = VendorReturnRequest.query.filter_by(
            id=request_id, is_deleted=False
        ).first()

        if not return_request:
            return jsonify({"success": False, "error": "Return request not found"}), 404

        if return_request.status != 'pending_td_approval':
            return jsonify({"success": False, "error": "Return request is not pending TD approval"}), 400

        return_request.td_approved_by_id = current_user['user_id']
        return_request.td_approved_by_name = current_user.get('full_name', '')
        return_request.td_approval_date = datetime.utcnow()
        return_request.updated_at = datetime.utcnow()

        # For new_vendor VRRs with vendor already selected, approve vendor + create POChild in one step
        if return_request.resolution_type == 'new_vendor' and return_request.new_vendor_id:
            return_request.status = 'new_vendor_approved'
            return_request.new_vendor_status = 'approved'

            # Create new POChild for the selected vendor (lock CR to prevent suffix collision)
            cr = ChangeRequest.query.filter_by(
                cr_id=return_request.cr_id, is_deleted=False
            ).with_for_update().first()
            if not cr:
                return jsonify({"success": False, "error": "Change Request not found"}), 404

            existing_children = POChild.query.filter_by(
                parent_cr_id=cr.cr_id, is_deleted=False
            ).count()
            new_suffix = f".{existing_children + 1}"

            new_po_child = POChild(
                parent_cr_id=cr.cr_id,
                suffix=new_suffix,
                boq_id=cr.boq_id,
                project_id=cr.project_id,
                item_id=cr.item_id,
                item_name=cr.item_name,
                materials_data=return_request.rejected_materials,
                materials_total_cost=return_request.total_rejected_value,
                routing_type='vendor',
                vendor_id=return_request.new_vendor_id,
                vendor_name=return_request.new_vendor_name,
                vendor_selection_status='approved',
                vendor_approved_by_td_id=current_user['user_id'],
                vendor_approved_by_td_name=current_user.get('full_name', ''),
                vendor_approval_date=datetime.utcnow(),
                status='vendor_approved',
                delivery_routing='via_production_manager',
            )
            db.session.add(new_po_child)
            db.session.flush()

            iteration = InspectionIterationTracker(
                cr_id=cr.cr_id,
                po_child_id=new_po_child.id,
                iteration_suffix=_get_next_iteration_suffix(cr.cr_id),
                inspection_id=return_request.inspection_id,
                return_request_id=return_request.id,
                resolution_type='new_vendor',
                vendor_id=return_request.new_vendor_id,
                vendor_name=return_request.new_vendor_name,
                new_po_child_id=new_po_child.id,
                status='active',
                created_by=current_user['user_id'],
            )
            db.session.add(iteration)
            return_request.new_lpo_id = new_po_child.id

            db.session.commit()

            # Notify buyer about vendor approval + POChild creation
            try:
                from utils.comprehensive_notification_service import ComprehensiveNotificationService
                ComprehensiveNotificationService.send_simple_notification(
                    user_id=return_request.created_by_buyer_id,
                    title=f"New Vendor Approved - {return_request.return_request_number}",
                    message=f"TD approved {return_request.new_vendor_name} for {cr.get_formatted_cr_id()}. New PO: {new_po_child.get_formatted_id()}. Please proceed with LPO generation.",
                    type='success',
                    action_url='/buyer/purchase-orders',
                    metadata={
                        'return_request_id': return_request.id,
                        'po_child_id': new_po_child.id,
                        'workflow': 'vendor_return_new_vendor'
                    }
                )
            except Exception as notif_err:
                log.error(f"Failed to notify buyer: {str(notif_err)}")

            return jsonify({
                "success": True,
                "message": f"Return request approved. New vendor {return_request.new_vendor_name} approved. POChild {new_po_child.get_formatted_id()} created.",
                "data": {
                    "return_request": return_request.to_dict(),
                    "new_po_child": new_po_child.to_dict(),
                    "iteration": iteration.to_dict()
                }
            }), 200

        # Standard approval (refund / replacement)
        return_request.status = 'td_approved'

        db.session.commit()

        # Notify buyer
        try:
            _notify_buyer_return_approved(return_request)
        except Exception as notif_err:
            log.error(f"Failed to notify buyer: {str(notif_err)}")

        return jsonify({
            "success": True,
            "message": "Return request approved",
            "data": return_request.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving return request: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def _notify_buyer_return_approved(return_request):
    """Notify buyer that TD approved their return request"""
    try:
        from utils.comprehensive_notification_service import ComprehensiveNotificationService
        ComprehensiveNotificationService.send_simple_notification(
            user_id=return_request.created_by_buyer_id,
            title=f"Return Request Approved - {return_request.return_request_number}",
            message=f"TD has approved your {return_request.resolution_type} return request. You can now proceed.",
            type='success',
            action_url='/buyer/return-requests',
            metadata={
                'return_request_id': return_request.id,
                'workflow': 'vendor_return'
            }
        )
    except Exception as e:
        log.error(f"Failed to notify buyer: {str(e)}")


def td_reject_return_request(request_id):
    """
    POST /api/technical-director/return-request/<request_id>/reject
    TD rejects the return request with reason.
    """
    access_check = _check_td_access()
    if access_check:
        return access_check

    try:
        current_user = g.user
        data = request.get_json() or {}

        return_request = VendorReturnRequest.query.filter_by(
            id=request_id, is_deleted=False
        ).first()

        if not return_request:
            return jsonify({"success": False, "error": "Return request not found"}), 404

        if return_request.status != 'pending_td_approval':
            return jsonify({"success": False, "error": "Return request is not pending TD approval"}), 400

        return_request.status = 'td_rejected'
        return_request.td_approved_by_id = current_user['user_id']
        return_request.td_approved_by_name = current_user.get('full_name', '')
        return_request.td_approval_date = datetime.utcnow()
        return_request.td_rejection_reason = data.get('reason', '')
        return_request.updated_at = datetime.utcnow()

        db.session.commit()

        # Notify buyer
        try:
            from utils.comprehensive_notification_service import ComprehensiveNotificationService
            ComprehensiveNotificationService.send_simple_notification(
                user_id=return_request.created_by_buyer_id,
                title=f"Return Request Rejected - {return_request.return_request_number}",
                message=f"TD has rejected your return request. Reason: {return_request.td_rejection_reason or 'No reason provided'}",
                type='error',
                action_url='/buyer/return-requests',
                metadata={
                    'return_request_id': return_request.id,
                    'workflow': 'vendor_return'
                }
            )
        except Exception as notif_err:
            log.error(f"Failed to notify buyer: {str(notif_err)}")

        return jsonify({
            "success": True,
            "message": "Return request rejected",
            "data": return_request.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting return request: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def td_approve_new_vendor_for_return(request_id):
    """
    POST /api/technical-director/return-request/<request_id>/approve-new-vendor
    TD approves the new vendor selected by buyer.
    Creates a new POChild and triggers the standard purchase flow.
    """
    access_check = _check_td_access()
    if access_check:
        return access_check

    try:
        current_user = g.user
        return_request = VendorReturnRequest.query.filter_by(
            id=request_id, is_deleted=False
        ).first()

        if not return_request:
            return jsonify({"success": False, "error": "Return request not found"}), 404

        if return_request.new_vendor_status != 'pending_td_approval':
            return jsonify({"success": False, "error": "No vendor approval pending"}), 400

        # Approve new vendor
        return_request.new_vendor_status = 'approved'
        return_request.status = 'new_vendor_approved'
        return_request.updated_at = datetime.utcnow()

        # Create new POChild for the new vendor (lock CR to prevent suffix collision)
        cr = ChangeRequest.query.filter_by(
            cr_id=return_request.cr_id, is_deleted=False
        ).with_for_update().first()
        if not cr:
            return jsonify({"success": False, "error": "Change Request not found"}), 404

        # Determine suffix for new POChild
        existing_children = POChild.query.filter_by(
            parent_cr_id=cr.cr_id, is_deleted=False
        ).count()
        new_suffix = f".{existing_children + 1}"

        new_po_child = POChild(
            parent_cr_id=cr.cr_id,
            suffix=new_suffix,
            boq_id=cr.boq_id,
            project_id=cr.project_id,
            item_id=cr.item_id,
            item_name=cr.item_name,
            materials_data=return_request.rejected_materials,
            materials_total_cost=return_request.total_rejected_value,
            routing_type='vendor',
            vendor_id=return_request.new_vendor_id,
            vendor_name=return_request.new_vendor_name,
            vendor_selection_status='approved',
            vendor_approved_by_td_id=current_user['user_id'],
            vendor_approved_by_td_name=current_user.get('full_name', ''),
            vendor_approval_date=datetime.utcnow(),
            status='vendor_approved',
            delivery_routing='via_production_manager',
        )
        db.session.add(new_po_child)
        db.session.flush()

        # Create iteration tracker
        iteration = InspectionIterationTracker(
            cr_id=cr.cr_id,
            po_child_id=new_po_child.id,
            iteration_suffix=_get_next_iteration_suffix(cr.cr_id),
            inspection_id=return_request.inspection_id,
            return_request_id=return_request.id,
            resolution_type='new_vendor',
            vendor_id=return_request.new_vendor_id,
            vendor_name=return_request.new_vendor_name,
            new_po_child_id=new_po_child.id,
            status='active',
            created_by=current_user['user_id'],
        )
        db.session.add(iteration)

        return_request.new_lpo_id = new_po_child.id

        db.session.commit()

        # Notify buyer
        try:
            from utils.comprehensive_notification_service import ComprehensiveNotificationService
            ComprehensiveNotificationService.send_simple_notification(
                user_id=return_request.created_by_buyer_id,
                title=f"New Vendor Approved - {return_request.return_request_number}",
                message=f"TD approved {return_request.new_vendor_name} for {cr.get_formatted_cr_id()}. New PO: {new_po_child.get_formatted_id()}. Please proceed with LPO generation.",
                type='success',
                action_url='/buyer/purchase-orders',
                metadata={
                    'return_request_id': return_request.id,
                    'po_child_id': new_po_child.id,
                    'workflow': 'vendor_return_new_vendor'
                }
            )
        except Exception as notif_err:
            log.error(f"Failed to notify buyer: {str(notif_err)}")

        return jsonify({
            "success": True,
            "message": f"New vendor {return_request.new_vendor_name} approved. POChild {new_po_child.get_formatted_id()} created.",
            "data": {
                "return_request": return_request.to_dict(),
                "new_po_child": new_po_child.to_dict(),
                "iteration": iteration.to_dict()
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving new vendor: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


# ============================================================
# SHARED / TIMELINE ENDPOINTS
# ============================================================

def get_inspection_timeline(cr_id):
    """
    GET /api/inventory/inspection-timeline/<cr_id>
    Get full timeline of inspections, returns, and resolutions for a CR.
    Accessible by PM, Buyer, TD, and Admin.
    """
    # Authorization: restrict to PM, Buyer, TD, Admin
    current_user = g.user
    role = _normalize_role(current_user.get('role', ''))
    allowed_roles = ('productionmanager', 'buyer', 'technicaldirector', 'admin')
    if role not in allowed_roles:
        return jsonify({"success": False, "error": "Access denied"}), 403

    try:
        from sqlalchemy.orm import joinedload

        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"success": False, "error": "Change Request not found"}), 404

        # Eager-load relationships used by to_dict() to avoid N+1
        inspections = VendorDeliveryInspection.query.options(
            joinedload(VendorDeliveryInspection.vendor),
            joinedload(VendorDeliveryInspection.change_request),
            joinedload(VendorDeliveryInspection.po_child)
        ).filter_by(
            cr_id=cr_id, is_deleted=False
        ).order_by(VendorDeliveryInspection.created_at.asc()).all()

        # Eager-load relationships used by to_dict()
        return_requests = VendorReturnRequest.query.options(
            joinedload(VendorReturnRequest.change_request),
            joinedload(VendorReturnRequest.inspection)
        ).filter_by(
            cr_id=cr_id, is_deleted=False
        ).order_by(VendorReturnRequest.created_at.asc()).all()

        # Get all iterations
        iterations = InspectionIterationTracker.query.filter_by(
            cr_id=cr_id, is_deleted=False
        ).order_by(InspectionIterationTracker.created_at.asc()).all()

        # Build timeline events
        timeline = []

        for insp in inspections:
            timeline.append({
                'type': 'inspection',
                'id': insp.id,
                'status': insp.inspection_status,
                'timestamp': insp.inspected_at.isoformat() if insp.inspected_at else insp.created_at.isoformat(),
                'actor': insp.inspected_by_name,
                'details': f"Inspection #{insp.iteration_number}: {insp.inspection_status.replace('_', ' ')}",
                'data': insp.to_dict()
            })

        for rr in return_requests:
            # 1. Return request created
            timeline.append({
                'type': 'return_request',
                'id': rr.id,
                'status': 'created',
                'timestamp': rr.created_at.isoformat(),
                'actor': rr.created_by_buyer_name,
                'details': f"Return Request {rr.return_request_number}: {rr.resolution_type} - submitted for TD approval",
                'data': rr.to_dict()
            })

            # 2. TD approved / rejected
            if rr.td_approval_date:
                is_approved = rr.status not in ('td_rejected',)
                timeline.append({
                    'type': 'return_request_td',
                    'id': rr.id,
                    'status': 'td_approved' if is_approved else 'td_rejected',
                    'timestamp': rr.td_approval_date.isoformat(),
                    'actor': rr.td_approved_by_name or 'TD',
                    'details': f"Return Request {rr.return_request_number}: {'approved' if is_approved else 'rejected'} by {rr.td_approved_by_name or 'TD'}",
                    'data': rr.to_dict()
                })

            # 3. Return initiated (buyer clicked "Initiate Return to Vendor")
            if rr.return_initiated_at:
                timeline.append({
                    'type': 'return_initiated',
                    'id': rr.id,
                    'status': 'return_in_progress',
                    'timestamp': rr.return_initiated_at.isoformat(),
                    'actor': rr.created_by_buyer_name,
                    'details': f"Return Request {rr.return_request_number}: return initiated to vendor",
                    'data': rr.to_dict()
                })

            # 4. Return confirmed / refund confirmed
            if rr.return_confirmed_at:
                timeline.append({
                    'type': 'return_completed',
                    'id': rr.id,
                    'status': 'completed',
                    'timestamp': rr.return_confirmed_at.isoformat(),
                    'actor': rr.created_by_buyer_name,
                    'details': f"Return Request {rr.return_request_number}: {rr.resolution_type} completed",
                    'data': rr.to_dict()
                })

        for it in iterations:
            timeline.append({
                'type': 'iteration',
                'id': it.id,
                'status': it.status,
                'timestamp': it.created_at.isoformat(),
                'details': f"Iteration {it.iteration_suffix}: {it.resolution_type or ''} - {it.vendor_name or ''}",
                'data': it.to_dict()
            })

        # Sort timeline by timestamp
        timeline.sort(key=lambda x: x['timestamp'])

        return jsonify({
            "success": True,
            "data": {
                "cr_id": cr_id,
                "formatted_cr_id": cr.get_formatted_cr_id(),
                "inspection_status": cr.inspection_status,
                "timeline": timeline,
                "summary": {
                    "total_inspections": len(inspections),
                    "total_return_requests": len(return_requests),
                    "total_iterations": len(iterations),
                }
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching inspection timeline: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500


def get_held_materials():
    """
    GET /api/inventory/held-materials
    Get materials in 'Held/Pending Return' state (rejected, not in inventory).
    Quick view section for PM dashboard.
    """
    access_check = _check_pm_access()
    if access_check:
        return access_check

    try:
        from sqlalchemy.orm import joinedload

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)

        # Shared filter for count and data queries
        base_filter = [
            VendorDeliveryInspection.inspection_status.in_(['partially_approved', 'fully_rejected']),
            VendorDeliveryInspection.is_deleted == False
        ]

        # Count without joinedload
        total_inspections = VendorDeliveryInspection.query.filter(*base_filter).count()

        # Fetch with joinedload for vendor to avoid N+1
        inspections = VendorDeliveryInspection.query.options(
            joinedload(VendorDeliveryInspection.vendor)
        ).filter(
            *base_filter
        ).order_by(
            VendorDeliveryInspection.created_at.desc()
        ).offset((page - 1) * per_page).limit(per_page).all()

        # Batch-fetch return requests for all inspections in this page
        # NOTE: Business rule enforces max 1 active return request per inspection
        inspection_ids = [insp.id for insp in inspections]
        return_req_map = {}
        if inspection_ids:
            return_reqs = VendorReturnRequest.query.filter(
                VendorReturnRequest.inspection_id.in_(inspection_ids),
                VendorReturnRequest.is_deleted == False
            ).all()
            return_req_map = {rr.inspection_id: rr for rr in return_reqs}

        held_materials = []
        for insp in inspections:
            return_req = return_req_map.get(insp.id)

            if return_req and return_req.status == 'completed':
                continue  # Already resolved

            for mat in (insp.materials_inspection or []):
                rejected_qty = mat.get('rejected_qty', 0)
                if rejected_qty > 0:
                    held_materials.append({
                        'inspection_id': insp.id,
                        'cr_id': insp.cr_id,
                        'formatted_cr_id': f"CR-{insp.cr_id}",
                        'vendor_name': insp.vendor.company_name if insp.vendor else 'Unknown',
                        'material_name': mat.get('material_name'),
                        'brand': mat.get('brand'),
                        'size': mat.get('size'),
                        'unit': mat.get('unit'),
                        'rejected_qty': rejected_qty,
                        'rejection_category': mat.get('rejection_category'),
                        'rejection_notes': mat.get('rejection_notes'),
                        'inspected_at': insp.inspected_at.isoformat() if insp.inspected_at else None,
                        'has_return_request': return_req is not None,
                        'return_status': return_req.status if return_req else None,
                        'return_request_number': return_req.return_request_number if return_req else None,
                        'resolution_type': return_req.resolution_type if return_req else None,
                        'credit_note_number': return_req.credit_note_number if return_req else None,
                        'credit_note_amount': return_req.credit_note_amount if return_req else None,
                        'credit_note_date': return_req.credit_note_date.isoformat() if return_req and return_req.credit_note_date else None,
                        'refund_evidence': return_req.refund_evidence if return_req else None,
                    })

        return jsonify({
            "success": True,
            "data": held_materials,
            "total_inspections": total_inspections,
            "materials_on_page": len(held_materials),
            "page": page,
            "per_page": per_page
        }), 200

    except Exception as e:
        log.error(f"Error fetching held materials: {str(e)}")
        return jsonify({"success": False, "error": "An internal error occurred. Please try again."}), 500
