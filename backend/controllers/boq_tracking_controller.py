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

# Simple TTL cache for expensive read-only endpoints
import time as _time
_profit_report_cache = {}  # {boq_id: (timestamp, data)}
_PROFIT_REPORT_TTL = 120  # 2 minutes

# Shared file-based bust flag — same as boq_controller.py
# All Gunicorn workers read the same file, so one worker's bust invalidates all.
_CACHE_BUST_FLAG = '/tmp/msq_catalog_cache_bust'

def _get_bust_ts():
    try:
        with open(_CACHE_BUST_FLAG, 'r') as f:
            return float(f.read().strip())
    except Exception:
        return 0.0


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

        # If internal_cost is not provided, calculate it by excluding O&P from the amount
        # Internal Cost = Amount - O&P (since Amount includes O&P)
        if preliminary_internal_cost == 0 and preliminary_amount > 0:
            # If overhead_profit_amount is provided, use it
            if preliminary_overhead_profit_amount > 0:
                preliminary_internal_cost = preliminary_amount - preliminary_overhead_profit_amount
            else:
                # Otherwise, assume Amount includes misc, transport, and O&P, so internal cost is the base
                # Internal Cost = Amount / (1 + misc% + overhead_profit% + transport%)
                # For simplicity, if no breakdown is provided, use Amount as-is (will be corrected in future updates)
                preliminary_internal_cost = preliminary_amount

        # Fetch ALL change requests (regardless of status) to show in comparison
        change_requests = ChangeRequest.query.filter_by(
            boq_id=boq_id,
            is_deleted=False
        ).all()

        # Load POChildren for all CRs to get actual vendor purchase prices
        # When buyer selects a vendor and sets prices, the amounts go into POChild.materials_data
        # The parent CR's materials_data may still have 0 prices
        from models.po_child import POChild
        cr_ids_all = [cr.cr_id for cr in change_requests]
        po_children_all = []
        if cr_ids_all:
            po_children_all = POChild.query.filter(
                POChild.parent_cr_id.in_(cr_ids_all),
                POChild.is_deleted == False
            ).all()

        # Build a map: cr_id -> list of (material_name_lower, unit_price, total_price)
        # from POChild materials_data so we can look up actual purchase prices per material
        po_child_prices_by_cr = {}  # {cr_id: {mat_name_lower: {'unit_price': x, 'total_price': y}}}
        for poc in po_children_all:
            cr_id = poc.parent_cr_id
            if cr_id not in po_child_prices_by_cr:
                po_child_prices_by_cr[cr_id] = {}
            mats = poc.materials_data or []
            if isinstance(mats, str):
                import json as _j
                try:
                    mats = _j.loads(mats)
                except Exception:
                    mats = []
            for m in mats:
                m_name = (m.get('material_name') or m.get('sub_item_name') or '').lower().strip()
                neg_price = m.get('negotiated_price') or m.get('unit_price') or 0
                qty = float(m.get('quantity', 0) or 0)
                unit_price = float(neg_price or 0)
                total_price = float(m.get('total_price', 0) or unit_price * qty)
                if m_name and (unit_price > 0 or total_price > 0):
                    # Keep the highest total_price across all POChildren for this material
                    existing = po_child_prices_by_cr[cr_id].get(m_name, {})
                    if total_price > existing.get('total_price', 0):
                        po_child_prices_by_cr[cr_id][m_name] = {
                            'unit_price': unit_price,
                            'quantity': qty,
                            'total_price': total_price,
                        }

        # Fetch VAT percent from LPOCustomization for each CR (for profit comparison display)
        lpo_vat_lookup = {}  # {cr_id: vat_percent}
        if cr_ids_all:
            lpo_customs = LPOCustomization.query.filter(
                LPOCustomization.cr_id.in_(cr_ids_all),
                LPOCustomization.po_child_id == None  # Parent CR VAT only
            ).all()
            for lpo in lpo_customs:
                lpo_vat_lookup[lpo.cr_id] = float(lpo.vat_percent or 5.0)

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

        # Get actual labour tracking from DailyAttendance (new workflow)
        # Import required models
        from models.labour_requisition import LabourRequisition
        from models.worker_assignment import WorkerAssignment
        from models.daily_attendance import DailyAttendance
        from models.worker import Worker
        from sqlalchemy.orm import selectinload
        from sqlalchemy import func
        from collections import defaultdict

        # Get all labour requisitions for this BOQ
        # Note: Cannot use selectinload on 'assignments' because it's lazy='dynamic'
        # IMPORTANT: boq_id can be in the deprecated boq_id column OR in labour_items JSONB array
        from sqlalchemy import or_, cast, Integer
        from sqlalchemy.dialects.postgresql import JSONB
        import re

        # First, try the straightforward queries (deprecated boq_id or explicit boq_id in JSONB)
        requisitions = LabourRequisition.query.filter(
            or_(
                # Check deprecated boq_id column
                LabourRequisition.boq_id == boq_id,
                # Check labour_items JSONB array for boq_id
                LabourRequisition.labour_items.op('@>')(
                    cast([{"boq_id": boq_id}], JSONB)
                )
            ),
            LabourRequisition.is_deleted == False
        ).all()

        # If no requisitions found, check labour_id pattern: lab_{boq_id}_...
        # Cast JSONB to text and use LIKE — much faster than loading all rows into Python
        if not requisitions:
            from sqlalchemy import Text
            _pattern = f'%"lab_{boq_id}\\_%'  # matches "lab_843_..." inside the JSONB text
            requisitions = LabourRequisition.query.filter(
                LabourRequisition.is_deleted == False,
                LabourRequisition.labour_items.isnot(None),
                cast(LabourRequisition.labour_items, Text).like(_pattern)
            ).all()

        # Aggregate actual labour by labour_role (skill_required)
        # Group attendance records by labour role
        labour_aggregates = defaultdict(lambda: {
            'total_hours': Decimal('0'),
            'total_cost': Decimal('0'),
            'work_entries': [],
            'labour_role': None,
            'master_labour_id': None
        })

        # Preload all assignments and attendance for efficiency
        # Note: WorkerAssignment.attendance_records is lazy='dynamic', so we can't eager load it
        if requisitions:
            req_ids = [r.requisition_id for r in requisitions]

            # Query assignments separately (without attendance eager loading)
            assignments_with_data = WorkerAssignment.query.options(
                selectinload(WorkerAssignment.worker)
            ).filter(
                WorkerAssignment.requisition_id.in_(req_ids),
                WorkerAssignment.is_deleted == False
            ).all()

            # Query attendance records separately
            from models.daily_attendance import DailyAttendance
            from models.worker import Worker
            assignment_ids = [a.assignment_id for a in assignments_with_data]

            # IMPORTANT: Attendance can be linked via assignment_id OR requisition_id
            # Some attendance records have assignment_id=NULL but requisition_id set
            attendance_records_all = []

            # First, try to get attendance by assignment_id
            if assignment_ids:
                attendance_by_assignment_id = DailyAttendance.query.filter(
                    DailyAttendance.assignment_id.in_(assignment_ids),
                    DailyAttendance.is_deleted == False,
                    DailyAttendance.approval_status == 'locked'
                ).all()
                attendance_records_all.extend(attendance_by_assignment_id)

            # Also get attendance directly by requisition_id (for records where assignment_id is NULL)
            attendance_by_req_id = DailyAttendance.query.filter(
                DailyAttendance.requisition_id.in_(req_ids),
                DailyAttendance.is_deleted == False,
                DailyAttendance.approval_status == 'locked'
            ).all()

            # Add only records not already included (avoid duplicates)
            existing_att_ids = {att.attendance_id for att in attendance_records_all}
            for att in attendance_by_req_id:
                if att.attendance_id not in existing_att_ids:
                    attendance_records_all.append(att)

            # Batch pre-fetch all Workers needed by attendance records (eliminates N+1 in loop below)
            _att_worker_ids = list({att.worker_id for att in attendance_records_all if att.worker_id})
            batch_attendance_workers = {
                w.worker_id: w
                for w in Worker.query.filter(Worker.worker_id.in_(_att_worker_ids)).all()
            } if _att_worker_ids else {}

            # Group attendance by assignment_id (for records with assignment_id)
            attendance_by_assignment = defaultdict(list)
            # Also group by requisition_id (for records without assignment_id)
            attendance_by_requisition = defaultdict(list)

            for att in attendance_records_all:
                if att.assignment_id:
                    attendance_by_assignment[att.assignment_id].append(att)
                if att.requisition_id:
                    attendance_by_requisition[att.requisition_id].append(att)

            # Attach attendance to assignments manually
            for assignment in assignments_with_data:
                assignment._preloaded_attendance = attendance_by_assignment.get(assignment.assignment_id, [])

            # Group assignments by requisition_id for easy lookup
            assignments_by_req = defaultdict(list)
            for assignment in assignments_with_data:
                assignments_by_req[assignment.requisition_id].append(assignment)

            for req in requisitions:
                # Process EACH labour_item in the requisition separately
                # This ensures each labour role gets its own aggregate entry
                labour_items_to_process = req.labour_items or []

                # If no labour_items, use the requisition's skill_required
                if not labour_items_to_process and req.skill_required:
                    labour_items_to_process = [{
                        'skill_required': req.skill_required,
                        'master_labour_id': None
                    }]

                for labour_item in labour_items_to_process:
                    labour_role = labour_item.get('skill_required') or labour_item.get('labour_role')
                    master_labour_id = labour_item.get('master_labour_id')

                    if not labour_role:
                        continue

                    # Initialize this labour_role in aggregates
                    labour_aggregates[labour_role]['labour_role'] = labour_role
                    labour_aggregates[labour_role]['master_labour_id'] = master_labour_id

                # Use the primary labour role for this requisition (first item or skill_required)
                primary_labour_role = None
                if labour_items_to_process:
                    primary_labour_role = labour_items_to_process[0].get('skill_required') or labour_items_to_process[0].get('labour_role')
                if not primary_labour_role:
                    primary_labour_role = req.skill_required

                # CHANGED: Get attendance records DIRECTLY by requisition_id
                # This handles the case where attendance has requisition_id but no assignment_id
                req_attendance_records = attendance_by_requisition.get(req.requisition_id, [])

                # Build a lookup of labour roles from labour_items (case-insensitive)
                labour_role_lookup = {}
                for labour_item in labour_items_to_process:
                    role_name = labour_item.get('skill_required') or labour_item.get('labour_role')
                    if role_name:
                        labour_role_lookup[role_name.lower().strip()] = role_name

                # Process each attendance record directly
                for attendance in req_attendance_records:
                    # Get worker info (pre-fetched — no DB query)
                    worker = batch_attendance_workers.get(attendance.worker_id) if attendance.worker_id else None

                    hours = Decimal(str(attendance.total_hours or 0))
                    cost = Decimal(str(attendance.total_cost or 0))
                    rate = Decimal(str(attendance.hourly_rate or 0))

                    # Determine the labour role for this attendance record
                    # Priority: 1) attendance.labour_role (direct), 2) assignment's role_at_site, 3) worker's skills, 4) primary_labour_role
                    determined_labour_role = None

                    # FIRST: Check if attendance record has labour_role set directly
                    if hasattr(attendance, 'labour_role') and attendance.labour_role:
                        # Check if it matches any labour_item (case-insensitive)
                        role_key = attendance.labour_role.lower().strip()
                        if role_key in labour_role_lookup:
                            determined_labour_role = labour_role_lookup[role_key]
                        else:
                            determined_labour_role = attendance.labour_role

                    # Try to get role from assignment
                    if not determined_labour_role and attendance.assignment_id:
                        assignment = next(
                            (a for a in assignments_with_data if a.assignment_id == attendance.assignment_id),
                            None
                        )
                        if assignment and assignment.role_at_site:
                            # Check if role_at_site matches any labour_item
                            role_key = assignment.role_at_site.lower().strip()
                            if role_key in labour_role_lookup:
                                determined_labour_role = labour_role_lookup[role_key]
                            else:
                                determined_labour_role = assignment.role_at_site

                    # Try to match worker's skills to labour_items
                    if not determined_labour_role and worker and worker.skills:
                        for skill in worker.skills:
                            skill_key = skill.lower().strip() if isinstance(skill, str) else ''
                            if skill_key in labour_role_lookup:
                                determined_labour_role = labour_role_lookup[skill_key]
                                break

                    # Fallback to primary_labour_role
                    if not determined_labour_role:
                        determined_labour_role = primary_labour_role

                    # Add to aggregates using determined_labour_role
                    if determined_labour_role:
                        labour_aggregates[determined_labour_role]['total_hours'] += hours
                        labour_aggregates[determined_labour_role]['total_cost'] += cost
                        labour_aggregates[determined_labour_role]['labour_role'] = determined_labour_role
                        labour_aggregates[determined_labour_role]['work_entries'].append({
                            'work_date': attendance.attendance_date.isoformat() if attendance.attendance_date else None,
                            'hours': float(hours),
                            'rate_per_hour': float(rate),
                            'total_cost': float(cost),
                            'worker_name': worker.full_name if worker else 'Unknown',
                            'notes': attendance.entry_notes
                        })

        # ALSO fetch old labour_tracking data for backward compatibility
        # Some BOQs may have data in the deprecated labour_tracking table
        old_labour_tracking = LabourTracking.query.filter_by(
            boq_id=boq_id,
            is_deleted=False
        ).all()

        # Merge old labour_tracking data into labour_aggregates
        for old_labour in old_labour_tracking:
            labour_role = old_labour.labour_role
            hours = Decimal(str(old_labour.total_hours or 0))
            cost = Decimal(str(old_labour.total_cost or 0))

            # Add to existing aggregate or create new
            labour_aggregates[labour_role]['total_hours'] += hours
            labour_aggregates[labour_role]['total_cost'] += cost
            labour_aggregates[labour_role]['labour_role'] = labour_role
            labour_aggregates[labour_role]['master_labour_id'] = labour_aggregates[labour_role]['master_labour_id'] or old_labour.master_labour_id

            # Add labour history entries if available
            if hasattr(old_labour, 'labour_history') and old_labour.labour_history:
                for entry in old_labour.labour_history:
                    labour_aggregates[labour_role]['work_entries'].append({
                        'work_date': entry.get('work_date'),
                        'hours': entry.get('hours', 0),
                        'rate_per_hour': entry.get('rate_per_hour', 0),
                        'total_cost': entry.get('total_cost', 0),
                        'worker_name': entry.get('worker_name', 'Unknown'),
                        'notes': entry.get('notes')
                    })

        # Convert aggregates to LabourTracking-like objects for compatibility
        # Create a mock object that has the same interface as LabourTracking
        class ActualLabourData:
            def __init__(self, labour_role, master_labour_id, master_item_id, total_hours, total_cost, work_entries):
                self.labour_role = labour_role
                self.master_labour_id = master_labour_id
                self.master_item_id = master_item_id
                self.total_hours_worked = float(total_hours)
                self.total_cost = float(total_cost)
                self.labour_history = work_entries

        actual_labour = []
        for labour_role, data in labour_aggregates.items():
            # Include all labour roles that have data (even if hours = 0)
            # This shows the labour roles from requisitions in the actual column
            if data['labour_role']:  # Only need a valid labour_role
                actual_labour.append(ActualLabourData(
                    labour_role=data['labour_role'],
                    master_labour_id=data['master_labour_id'],
                    master_item_id=None,  # We don't have item-level granularity from attendance
                    total_hours=data['total_hours'],
                    total_cost=data['total_cost'],
                    work_entries=data['work_entries']
                ))

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

        # Build actual transport per BOQ item from vendor delivery inspections
        # Chain: VendorDeliveryInspection.cr_id -> ChangeRequest.item_id
        #        materials_inspection._stock_in_reference_number -> InventoryTransaction.transport_fee
        actual_transport_per_item = {}  # {str(master_item_id): Decimal}
        all_vdi_ref_numbers = set()  # ALL VDI refs for this project (including null-item_id CRs)
        from models.inventory import InventoryTransaction
        if cr_ids_all:
            from models.vendor_inspection import VendorDeliveryInspection
            inspections = VendorDeliveryInspection.query.filter(
                VendorDeliveryInspection.cr_id.in_(cr_ids_all),
                VendorDeliveryInspection.stock_in_completed == True,
                VendorDeliveryInspection.is_deleted == False
            ).all()
            cr_to_item_id = {cr.cr_id: str(cr.item_id) for cr in change_requests if cr.item_id}
            # Build fallback reference map: cr_id → formatted reference used when
            # _stock_in_reference_number was not entered during inspection.
            # ManualStockInForm pre-fills batchReference with this same fallback so
            # the transaction's reference_number matches even when the VDI field is blank.
            cr_to_fallback_ref = {cr.cr_id: cr.get_formatted_cr_id() for cr in change_requests}
            # Load POChild formatted IDs for inspections that came from a PO child
            _po_child_ids = [insp.po_child_id for insp in inspections if insp.po_child_id]
            if _po_child_ids:
                from models.po_child import POChild
                _po_children = POChild.query.filter(POChild.id.in_(_po_child_ids)).all()
                _poc_map = {poc.id: poc for poc in _po_children}
                for insp in inspections:
                    if insp.po_child_id and insp.po_child_id in _poc_map:
                        cr_to_fallback_ref[insp.cr_id] = _poc_map[insp.po_child_id].get_formatted_id()
            ref_number_to_item_id = {}
            for insp in inspections:
                item_id = cr_to_item_id.get(insp.cr_id)
                mats_insp = insp.materials_inspection or []
                if isinstance(mats_insp, str):
                    try:
                        mats_insp = json.loads(mats_insp)
                    except Exception:
                        mats_insp = []
                for mat in mats_insp:
                    ref_num = mat.get('_stock_in_reference_number')
                    # Fallback: when PM didn't enter a reference during inspection,
                    # _stock_in_reference_number is blank but ManualStockInForm pre-fills
                    # the CR/PO formatted ID as the transaction reference — use that.
                    if not ref_num:
                        ref_num = cr_to_fallback_ref.get(insp.cr_id, '')
                    if ref_num:
                        all_vdi_ref_numbers.add(ref_num)  # Always collect — even for null-item_id CRs
                        if item_id:
                            ref_number_to_item_id[ref_num] = item_id
            if ref_number_to_item_id:
                ref_numbers = list(ref_number_to_item_id.keys())
                transactions = InventoryTransaction.query.filter(
                    InventoryTransaction.project_id == boq.project_id,
                    InventoryTransaction.delivery_batch_ref.like('MSQ-IN-%'),
                    InventoryTransaction.reference_number.in_(ref_numbers),
                    InventoryTransaction.transport_fee.isnot(None),
                    InventoryTransaction.transport_fee > 0
                ).all()
                # Deduplicate by (delivery_batch_ref, item_id): when multiple materials
                # from the same delivery batch each create a transaction with the same
                # transport_fee (inherited from the batch), only count it once per item.
                _seen_vdi_batch_keys = set()
                for txn in transactions:
                    item_id = ref_number_to_item_id.get(txn.reference_number)
                    if item_id:
                        transport = Decimal(str(txn.transport_fee or 0))
                        if txn.delivery_batch_ref:
                            batch_key = (txn.delivery_batch_ref, item_id)
                            if batch_key in _seen_vdi_batch_keys:
                                continue
                            _seen_vdi_batch_keys.add(batch_key)
                        actual_transport_per_item[item_id] = (
                            actual_transport_per_item.get(item_id, Decimal('0')) + transport
                        )

        # Compute total actual project transport — mirrors ALL sources from the Profit Report
        # Transport Details page so both views show the same total.
        # Sources: MDN, RDN, InventoryTransaction PURCHASE, LabourRequisition,
        #          AssetDeliveryNote, AssetReturnDeliveryNote
        from models.inventory import MaterialDeliveryNote, ReturnDeliveryNote
        from models.returnable_assets import AssetDeliveryNote, AssetReturnDeliveryNote
        from models.labour_requisition import LabourRequisition
        from sqlalchemy import func as _func

        # Use aggregation queries (SUM at DB level) instead of loading all rows into Python
        _mdn_sum = db.session.query(_func.coalesce(_func.sum(MaterialDeliveryNote.transport_fee), 0)).filter(
            MaterialDeliveryNote.project_id == boq.project_id,
            MaterialDeliveryNote.status.notin_(['DRAFT', 'CANCELLED'])
        ).scalar() or 0

        _rdn_sum = db.session.query(_func.coalesce(_func.sum(ReturnDeliveryNote.transport_fee), 0)).filter(
            ReturnDeliveryNote.project_id == boq.project_id,
            ReturnDeliveryNote.status.notin_(['DRAFT', 'CANCELLED'])
        ).scalar() or 0

        # Inventory Transactions — deduplicate by delivery_batch_ref before summing
        # Use subquery to get one transport_fee per unique batch ref
        _inv_sum_rows = db.session.query(
            InventoryTransaction.delivery_batch_ref,
            _func.max(InventoryTransaction.transport_fee).label('fee')
        ).filter(
            InventoryTransaction.project_id == boq.project_id,
            InventoryTransaction.transaction_type == 'PURCHASE',
            InventoryTransaction.delivery_batch_ref.like('MSQ-IN-%'),
            InventoryTransaction.transport_fee > 0
        ).group_by(InventoryTransaction.delivery_batch_ref).all()
        _inv_sum = sum(row.fee or 0 for row in _inv_sum_rows)

        _lab_sum = db.session.query(_func.coalesce(_func.sum(LabourRequisition.transport_fee), 0)).filter(
            LabourRequisition.project_id == boq.project_id,
            LabourRequisition.is_deleted == False
        ).scalar() or 0

        _adn_sum = db.session.query(_func.coalesce(_func.sum(AssetDeliveryNote.transport_fee), 0)).filter(
            AssetDeliveryNote.project_id == boq.project_id,
            AssetDeliveryNote.status.notin_(['DRAFT', 'CANCELLED'])
        ).scalar() or 0

        _ardn_sum = db.session.query(_func.coalesce(_func.sum(AssetReturnDeliveryNote.transport_fee), 0)).filter(
            AssetReturnDeliveryNote.project_id == boq.project_id,
            AssetReturnDeliveryNote.status.notin_(['DRAFT', 'CANCELLED'])
        ).scalar() or 0

        _total_actual_project_transport = Decimal(str(_mdn_sum)) + Decimal(str(_rdn_sum)) + \
            Decimal(str(_inv_sum)) + Decimal(str(_lab_sum)) + \
            Decimal(str(_adn_sum)) + Decimal(str(_ardn_sum))

        # Reset per-item attribution: VDI _stock_in_reference_number values are unreliable
        # (PMs type arbitrary strings). Using them for per-item attribution causes partial
        # or inflated totals. Instead, distribute the authoritative _total_actual_project_transport
        # proportionally across BOQ items to guarantee the totals always match the Transport Report.
        actual_transport_per_item = {}

        # All project transport is unattributed — will be distributed proportionally below.
        _vdi_attributed = Decimal('0')
        _unattributed = _total_actual_project_transport

        if _unattributed > 0:
            _total_planned_transport = Decimal('0')
            _total_planned_base = Decimal('0')
            _item_planned_map = {}
            _item_base_map = {}
            for _pi in boq_data.get('items', []):
                _pid = str(_pi.get('master_item_id'))
                _ipt = Decimal('0')
                _ipb = Decimal('0')
                for _sub in _pi.get('sub_items', []):
                    _qty = Decimal(str(_sub.get('quantity', 1)))
                    _rate = Decimal(str(_sub.get('rate', 0)))
                    _base = (_qty * _rate) if (_qty > 0 and _rate > 0) else Decimal(str(
                        _sub.get('base_total') or _sub.get('per_unit_cost') or _sub.get('client_rate') or 0
                    ))
                    if _base == 0:
                        # Fallback: use internal cost (materials + labour) — mirrors the response builder
                        _mat_cost = sum(
                            Decimal(str(m.get('total', 0) or
                                       float(m.get('quantity', 0)) * float(m.get('unit_price', 0))))
                            for m in _sub.get('materials', [])
                        )
                        _lab_cost = sum(
                            Decimal(str(l.get('total_cost', 0) or
                                       float(l.get('hours', 0)) * float(l.get('rate_per_hour', 0))))
                            for l in _sub.get('labour', [])
                        )
                        _base = _mat_cost + _lab_cost
                    _ipt += _base * (Decimal(str(_sub.get('transport_percentage', 5))) / 100)
                    _ipb += _base
                _item_planned_map[_pid] = _ipt
                _item_base_map[_pid] = _ipb
                _total_planned_transport += _ipt
                _total_planned_base += _ipb
            if _total_planned_transport > 0:
                for _pid, _ipt in _item_planned_map.items():
                    if _ipt > 0:
                        _share = _unattributed * (_ipt / _total_planned_transport)
                        actual_transport_per_item[_pid] = (
                            actual_transport_per_item.get(_pid, Decimal('0')) + _share
                        )
            elif _total_planned_base > 0:
                # BOQ has no planned transport percentages; distribute by base cost share
                for _pid, _ipb in _item_base_map.items():
                    if _ipb > 0:
                        _share = _unattributed * (_ipb / _total_planned_base)
                        actual_transport_per_item[_pid] = (
                            actual_transport_per_item.get(_pid, Decimal('0')) + _share
                        )

        # Process each item
        for planned_item in boq_data.get('items', []):
            master_item_id = planned_item.get('master_item_id')

            # Material comparison
            materials_comparison = []
            planned_materials_total = Decimal('0')
            actual_materials_total = Decimal('0')

            # First, collect original materials and CR materials separately
            # Use dicts for O(1) lookup instead of O(n) list scan
            original_materials = []  # List of original (non-CR) materials (for display)
            _orig_mat_ids = set()    # Set of master_material_ids for fast lookup
            _orig_mat_names = set()  # Set of lowercased names for fast lookup
            cr_materials_map = {}  # Map material_id/name to CR material data (for updates)
            cr_materials_name_map = {}  # Map material_name to the CR that's updating it
            cr_new_materials = []  # List of CR materials that are truly new additions

            # Step 1: Collect all original materials first, build lookup sets
            for sub_item in planned_item.get('sub_items', []):
                for mat in sub_item.get('materials', []):
                    if not mat.get('is_from_change_request'):
                        original_materials.append({
                            'data': mat,
                            'sub_item_name': sub_item.get('sub_item_name'),
                            'master_sub_item_id': sub_item.get('master_sub_item_id')
                        })
                        if mat.get('master_material_id'):
                            _orig_mat_ids.add(mat['master_material_id'])
                        name = mat.get('material_name', '').lower().strip()
                        if name:
                            _orig_mat_names.add(name)

            # Step 2: Process CR materials and determine if they're updates or new
            # O(1) lookup via sets instead of O(n) loop through original_materials
            for sub_item in planned_item.get('sub_items', []):
                for mat in sub_item.get('materials', []):
                    if mat.get('is_from_change_request'):
                        mat_id = mat.get('master_material_id')
                        mat_name = mat.get('material_name', '').lower().strip()
                        cr_id = mat.get('change_request_id')

                        # O(1) set lookup — replaces O(n) inner loop
                        is_updating_existing = (
                            (mat_id and mat_id in _orig_mat_ids) or
                            (mat_name and mat_name in _orig_mat_names)
                        )

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

            # SUPPLEMENT: Populate cr_materials_map directly from change_requests for
            # existing BOQ materials that were purchased at a vendor-negotiated price.
            # The merge step above only adds NEW CR materials to sub_items, so existing
            # materials updated by CRs are never captured via the sub_items loop above.
            for cr in change_requests:
                # Only apply this CR to the current BOQ item it belongs to.
                # Without this check, a material like "sengal" that appears in multiple BOQ
                # items would receive the same CR actual price in every item, causing duplicates.
                cr_item_id_str = str(cr.item_id) if cr.item_id else None
                cr_item_name_lower = (cr.item_name or '').lower().strip()
                current_item_id_str = str(master_item_id) if master_item_id else None
                current_item_name_lower = (planned_item.get('item_name', '') or '').lower().strip()

                if cr_item_id_str and current_item_id_str and cr_item_id_str != current_item_id_str:
                    continue
                if not cr_item_id_str and cr_item_name_lower and current_item_name_lower and cr_item_name_lower != current_item_name_lower:
                    continue

                cr_mats_raw = cr.sub_items_data or cr.materials_data or []
                if isinstance(cr_mats_raw, str):
                    try:
                        cr_mats_raw = json.loads(cr_mats_raw)
                    except Exception:
                        cr_mats_raw = []
                if not isinstance(cr_mats_raw, list):
                    continue
                for mat in cr_mats_raw:
                    mat_id = mat.get('master_material_id')
                    mat_name_key = (mat.get('material_name', '') or '').lower().strip()
                    cr_id_val = cr.cr_id
                    # Only process if this material matches one of the original BOQ materials
                    for orig_mat_info in original_materials:
                        orig_mat = orig_mat_info['data']
                        check_mat_id = orig_mat.get('master_material_id')
                        check_mat_name = (orig_mat.get('material_name', '') or '').lower().strip()
                        if (mat_id and check_mat_id and mat_id == check_mat_id) or \
                           (mat_name_key and check_mat_name and mat_name_key == check_mat_name):
                            # CR updates an existing material — add to map (keep latest CR)
                            if mat_id:
                                if mat_id not in cr_materials_map or cr_id_val > cr_materials_map.get(mat_id, {}).get('cr_id', 0):
                                    cr_materials_map[mat_id] = {'cr_id': cr_id_val, 'data': mat, 'sub_item_name': orig_mat_info['sub_item_name']}
                            if mat_name_key:
                                if mat_name_key not in cr_materials_name_map or cr_id_val > cr_materials_name_map.get(mat_name_key, {}).get('cr_id', 0):
                                    cr_materials_name_map[mat_name_key] = {'cr_id': cr_id_val, 'data': mat, 'sub_item_name': orig_mat_info['sub_item_name']}
                            break

            # Deduplication guards: prevent the same CR update or actual purchase record
            # from being applied to more than one planned material (e.g. two sub-items both
            # named "Tempered glass" with the same master_material_id would otherwise both
            # receive the same CR actual price, doubling the value shown).
            cr_update_consumed_ids = set()    # master_material_id values already used for CR update
            cr_update_consumed_names = set()  # material_name_lower values already used for CR update
            used_actual_mat_ids = set()       # purchase_tracking_id values already matched

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

                # Deduplicate actual_mat: once a MaterialPurchaseTracking record has been used
                # for one planned material, don't reuse it for another (e.g. two sub-items with
                # the same material name that share one tracking record).
                if actual_mat is not None:
                    tracking_id = getattr(actual_mat, 'purchase_tracking_id', None)
                    if tracking_id is not None and tracking_id in used_actual_mat_ids:
                        actual_mat = None
                    elif tracking_id is not None:
                        used_actual_mat_ids.add(tracking_id)

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

                # Check if this original material has been updated by a CR.
                # Use consumed-sets so the same CR update is applied at most once.
                cr_update_data = None
                cr_update_id = None
                if not is_from_change_request:
                    # Check by material ID first
                    if master_material_id and master_material_id in cr_materials_map \
                            and master_material_id not in cr_update_consumed_ids:
                        cr_update_data = cr_materials_map[master_material_id]['data']
                        cr_update_id = cr_materials_map[master_material_id]['cr_id']
                        cr_update_consumed_ids.add(master_material_id)
                    # Check by material name if no ID match
                    elif material_name and material_name.lower().strip() in cr_materials_name_map:
                        _mat_name_key = material_name.lower().strip()
                        if _mat_name_key not in cr_update_consumed_names:
                            cr_update_data = cr_materials_name_map[_mat_name_key]['data']
                            cr_update_id = cr_materials_name_map[_mat_name_key]['cr_id']
                            cr_update_consumed_names.add(_mat_name_key)

                # If this material has been updated by a CR, use CR data for actual values
                if cr_update_data:
                    cr_upd_mat_name = (material_name or '').lower().strip()
                    # Priority 1: POChild prices
                    po_upd_prices = po_child_prices_by_cr.get(cr_update_id, {}).get(cr_upd_mat_name, {})
                    # Priority 2: material_vendor_selections.negotiated_price
                    cr_upd_record = next((cr for cr in change_requests if cr.cr_id == cr_update_id), None)
                    upd_vendor_price = 0.0
                    if cr_upd_record:
                        upd_mvs = cr_upd_record.material_vendor_selections or {}
                        upd_mvs_entry = upd_mvs.get(material_name) or upd_mvs.get(cr_upd_mat_name)
                        if not upd_mvs_entry:
                            for k, v in upd_mvs.items():
                                if k.lower().strip() == cr_upd_mat_name:
                                    upd_mvs_entry = v
                                    break
                        if upd_mvs_entry:
                            upd_vendor_price = float(upd_mvs_entry.get('negotiated_price', 0) or 0)

                    if po_upd_prices and po_upd_prices.get('total_price', 0) > 0:
                        actual_quantity = Decimal(str(po_upd_prices.get('quantity', cr_update_data.get('quantity', 0))))
                        actual_avg_unit_price = Decimal(str(po_upd_prices['unit_price']))
                        actual_total = Decimal(str(po_upd_prices['total_price']))
                    elif upd_vendor_price > 0:
                        actual_quantity = Decimal(str(cr_update_data.get('quantity', 0)))
                        actual_avg_unit_price = Decimal(str(upd_vendor_price))
                        actual_total = actual_quantity * actual_avg_unit_price
                    else:
                        # Fallback: use CR materials_data values
                        actual_quantity = Decimal(str(cr_update_data.get('quantity', 0)))
                        actual_avg_unit_price = Decimal(str(cr_update_data.get('unit_price', 0)))
                        actual_total = Decimal(str(cr_update_data.get('total_price', 0)))
                        if actual_total == 0 and actual_quantity > 0 and actual_avg_unit_price > 0:
                            actual_total = actual_quantity * actual_avg_unit_price

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

                # Compute VAT for materials that were purchased via a CR (updated original BOQ materials)
                upd_vat_pct = lpo_vat_lookup.get(cr_update_id, 0.0) if (cr_update_data and cr_update_id) else 0.0
                upd_vat_amount = round(float(actual_total) * upd_vat_pct / 100, 2) if upd_vat_pct > 0 else 0.0
                upd_total_with_vat = float(actual_total) + upd_vat_amount

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
                        "vat_amount": upd_vat_amount,
                        "total_with_vat": upd_total_with_vat,
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

                # Actual values: look up from multiple sources in priority order:
                # 1. POChild.materials_data (vendor's actual purchase price)
                # 2. CR.material_vendor_selections[material_name].negotiated_price
                # 3. CR materials_data unit_price/total_price (may be 0 if estimator didn't set price)
                mat_name_lower = (material_name or '').lower().strip()

                # Priority 1: POChild prices
                po_prices = po_child_prices_by_cr.get(cr_id, {}).get(mat_name_lower, {})

                # Priority 2: CR.material_vendor_selections - this stores negotiated_price per material
                cr_record = next((cr for cr in change_requests if cr.cr_id == cr_id), None)
                vendor_selection_price = 0.0
                vendor_name_label = f"Change Request #{cr_id}"
                if cr_record:
                    mvs = cr_record.material_vendor_selections or {}
                    # Try exact material name key first, then case-insensitive match
                    mvs_entry = mvs.get(material_name) or mvs.get(mat_name_lower)
                    if not mvs_entry:
                        # Try case-insensitive match
                        for k, v in mvs.items():
                            if k.lower().strip() == mat_name_lower:
                                mvs_entry = v
                                break
                    if mvs_entry:
                        vendor_selection_price = float(mvs_entry.get('negotiated_price', 0) or 0)
                        vendor_name_label = mvs_entry.get('vendor_name', vendor_name_label)

                if po_prices and po_prices.get('total_price', 0) > 0:
                    # Use actual vendor purchase price from POChild
                    actual_quantity = Decimal(str(po_prices.get('quantity', cr_mat_data.get('quantity', 0))))
                    actual_avg_unit_price = Decimal(str(po_prices['unit_price']))
                    actual_total = Decimal(str(po_prices['total_price']))
                elif vendor_selection_price > 0:
                    # Use negotiated price from material_vendor_selections
                    actual_quantity = Decimal(str(cr_mat_data.get('quantity', 0)))
                    actual_avg_unit_price = Decimal(str(vendor_selection_price))
                    actual_total = actual_quantity * actual_avg_unit_price
                else:
                    # Fallback: use CR materials_data values
                    actual_quantity = Decimal(str(cr_mat_data.get('quantity', 0)))
                    actual_avg_unit_price = Decimal(str(cr_mat_data.get('unit_price', 0)))
                    actual_total = Decimal(str(cr_mat_data.get('total_price', 0)))
                    if actual_total == 0 and actual_quantity > 0 and actual_avg_unit_price > 0:
                        actual_total = actual_quantity * actual_avg_unit_price

                # Add to totals
                actual_materials_total += actual_total

                # Purchase history
                purchase_history = [{
                    "purchase_date": datetime.utcnow().isoformat(),
                    "quantity": float(actual_quantity),
                    "unit": cr_mat_data.get('unit'),
                    "unit_price": float(actual_avg_unit_price),
                    "total_price": float(actual_total),
                    "purchased_by": vendor_name_label
                }]

                # Get justification (cr_record already fetched above)
                justification_text = cr_mat_data.get('justification')
                if not justification_text and cr_record:
                    justification_text = cr_record.justification

                # Calculate VAT for this CR material (proportional: material_amount × vat_percent / 100)
                cr_vat_percent = lpo_vat_lookup.get(cr_id, 5.0)
                vat_amount = round(float(actual_total) * cr_vat_percent / 100, 2)
                total_with_vat = float(actual_total) + vat_amount

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
                        "vat_amount": vat_amount,
                        "total_with_vat": total_with_vat,
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
                planned_labour_role = planned_lab.get('labour_role', '').lower().strip()

                # Find actual labour tracking for this role - Try exact match first by master_labour_id and master_item_id
                actual_lab = next(
                    (al for al in actual_labour
                     if al.master_labour_id == master_labour_id
                     and al.master_item_id == master_item_id),
                    None
                )

                # Fallback 1: match by master_labour_id only
                if not actual_lab and master_labour_id:
                    actual_lab = next(
                        (al for al in actual_labour
                         if al.master_labour_id == master_labour_id),
                        None
                    )

                # Fallback 2: match by labour_role name (case-insensitive)
                if not actual_lab and planned_labour_role:
                    actual_lab = next(
                        (al for al in actual_labour
                         if al.labour_role and al.labour_role.lower().strip() == planned_labour_role),
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

                # For actual total: always use actual (0 if no locked attendance)
                actual_labour_total += actual_total

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

            # Use each item's proportional share of actual transport (pre-computed above).
            # actual_transport_per_item distributes _total_actual_project_transport
            # by each item's planned-transport weight so each item shows only its share.
            item_actual_transport = actual_transport_per_item.get(str(master_item_id), Decimal('0'))
            # Pre-compute total planned transport and total planned base across all sub-items
            item_total_planned_transport = Decimal('0')
            item_total_planned_base = Decimal('0')
            for _sub in planned_item.get('sub_items', []):
                _qty = Decimal(str(_sub.get('quantity', 1)))
                _rate = Decimal(str(_sub.get('rate', 0)))
                if _qty > 0 and _rate > 0:
                    _base = _qty * _rate
                else:
                    _base = Decimal(str(
                        _sub.get('base_total') or _sub.get('per_unit_cost') or _sub.get('client_rate') or 0
                    ))
                _transport_pct = Decimal(str(_sub.get('transport_percentage', 5)))
                item_total_planned_transport += _base * (_transport_pct / 100)
                item_total_planned_base += _base

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
                        # Only use actual cost if there's actual work done (assigned workers)
                        # Do NOT include planned cost for unassigned labour in actual spending
                        if matching_labour.get('actual') and matching_labour['actual'].get('total', 0) > 0:
                            lab_cost = Decimal(str(matching_labour['actual']['total']))
                            sub_actual_labour_cost += lab_cost
                        # else: Skip unassigned labour - don't add to actual costs

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
                            # Only use actual cost if there's actual work done (assigned workers)
                            # Do NOT include planned cost for unassigned labour in actual spending
                            if matching_labour.get('actual') and matching_labour['actual'].get('total', 0) > 0:
                                lab_cost = Decimal(str(matching_labour['actual']['total']))
                                sub_actual_labour_cost += lab_cost
                            # else: Skip unassigned labour - don't add to actual costs

                            # Track this labour to prevent processing in future sub-items
                            if labour_id:
                                item_level_labour_ids_processed.add(labour_id)
                            if labour_role:
                                item_level_labour_roles_processed.add(labour_role)
                        # else: If no tracking data found, skip (don't use planned cost)

                    # Mark that item-level labour has been assigned
                    item_level_labour_assigned = True

                sub_actual_internal_cost = sub_actual_materials_cost + sub_actual_labour_cost

                # Actual percentages stay the same (based on base_total)
                sub_actual_misc = sub_item_base_total * (misc_pct / 100)  # Same as planned
                sub_actual_overhead = sub_planned_overhead  # Keep as allocation for tracking

                # ACTUAL TRANSPORT: Distribute actual item transport proportionally across
                # sub-items by planned transport weight. This ensures per-item actual spending
                # uses real transport costs from MDN/RDN/VDI records (via item_actual_transport)
                # rather than the planned allocation.
                if item_total_planned_transport > 0:
                    sub_actual_transport = item_actual_transport * (sub_planned_transport / item_total_planned_transport)
                elif item_total_planned_base > 0:
                    sub_actual_transport = item_actual_transport * (sub_item_base_total / item_total_planned_base)
                else:
                    sub_actual_transport = Decimal('0')

                # Calculate actual spending (NO O&P, NO Profit included in spending)
                # Actual Spending = Materials + Labour + Misc + Transport
                sub_actual_spending = (sub_actual_materials_cost + sub_actual_labour_cost +
                                      sub_actual_misc + sub_actual_transport)

                # Client amount for this sub-item (after discount)
                sub_client_amount = sub_item_base_total - sub_discount_amount

                # NEW CORRECT FORMULA: Negotiable Margin = Client Amount - Actual Spending
                # This includes BOTH O&P allocation (25%) AND remaining profit
                # Per client requirement: Negotiable Margin = CLIENT Quoted Price - (Materials + Labour + Misc + Transport)
                sub_negotiable_margin = sub_client_amount - sub_actual_spending

                # For compatibility, keep sub_actual_total for now but it's not used in margin calculation
                sub_actual_total = sub_client_amount  # Client pays this amount (fixed)

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
                # CORRECTED: actual_base should ALWAYS be materials + labour (internal cost), NOT client rate
                actual_base += sub_actual_internal_cost  # Use actual materials + labour cost
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
                    'actual_spending': float(sub_actual_spending),
                    'calculation_note': 'Negotiable Margin = Client Amount - (Materials + Labour + Misc + Transport). O&P is included in margin, not subtracted.'
                })

            # actual_transport is accumulated as the proportional share of real project transport
            # distributed across sub-items by planned transport weight.

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

            # The selling price BEFORE discount is the BOQ client amount (planned_base)
            # NOT including preliminary share (preliminary is separate)
            selling_price_before_discount = planned_base

            # USE ITEM-LEVEL DISCOUNT (only if item has specific discount)
            # NOTE: BOQ-level discount is applied at PROJECT level, NOT distributed to individual items
            item_discount_amount = planned_discount_amount if planned_discount_amount > 0 else Decimal('0')
            item_discount_percentage = Decimal('0')

            # Calculate percentage from item-level discount (if any)
            if item_discount_amount > 0 and selling_price_before_discount > 0:
                item_discount_percentage = (item_discount_amount / selling_price_before_discount) * Decimal('100')

            # Calculate Client Amount for this item (with item-level discount only)
            # BOQ-level discount will be applied at the project summary level
            client_amount_after_discount = selling_price_before_discount - item_discount_amount

            # Calculate actual spending (Materials + Labour + Misc + Transport)
            # DO NOT include O&P or Profit - those are part of the Negotiable Margin
            actual_spending = (actual_materials_total + actual_labour_total +
                              actual_miscellaneous + actual_transport)

            # Calculate profit BEFORE giving discount to client
            # Negotiable Margin = Selling Price - Actual Spending (includes O&P allocation)
            profit_before_discount = selling_price_before_discount - actual_spending

            # Calculate actual profit after giving discount to client
            # NEW CORRECT FORMULA: Negotiable Margin = Client Amount (after discount) - Actual Spending
            # This includes BOTH O&P allocation (25%) AND remaining profit
            # Per client requirement: Negotiable Margin = CLIENT Quoted Price - (Materials + Labour + Misc + Transport)
            after_discount_negotiable_margin = client_amount_after_discount - actual_spending

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
            # The Negotiable Margin now INCLUDES O&P allocation PLUS remaining profit

            # Calculate the planned negotiable margin correctly
            # Planned spending = Materials + Labour + Misc + Transport (NO O&P)
            planned_spending = (planned_materials_total + planned_labour_total +
                               planned_miscellaneous + planned_transport)
            planned_negotiable_margin = client_amount_after_discount - planned_spending

            # Calculate profit variance (how much profit was impacted)
            # This now compares the full negotiable margin (including O&P)
            profit_variance = after_discount_negotiable_margin - planned_negotiable_margin

            # Determine if extra costs impacted profit
            profit_impact_from_extra_costs = Decimal('0')
            if extra_costs > 0:
                # Extra costs directly reduce negotiable margin
                profit_impact_from_extra_costs = extra_costs

            # Calculate variances (allocations stay same, only profit changes)
            base_cost_variance = actual_base - planned_base
            misc_variance = Decimal('0')  # Miscellaneous stays at allocation
            overhead_variance = Decimal('0')  # Overhead stays at allocation (but included in margin now)
            transport_variance = actual_transport - planned_transport  # positive = overspent, negative = saved

            # Calculate savings/overrun (use absolute values for display)
            cost_savings = abs(planned_base - actual_base)  # Always positive
            misc_diff = abs(planned_miscellaneous - actual_miscellaneous)  # Always positive
            overhead_diff = abs(planned_overhead - actual_overhead)  # Always positive
            profit_diff = abs(planned_negotiable_margin - after_discount_negotiable_margin)  # Always positive

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
                    "base_cost": float(planned_materials_total + planned_labour_total),
                    "client_amount_before_discount": float(selling_price_before_discount),
                    "discount_amount": float(item_discount_amount),
                    "discount_percentage": float(item_discount_percentage),
                    "client_amount_after_discount": float(client_amount_after_discount),
                    "grand_total": float(client_amount_after_discount),
                    "negotiable_margin": float(planned_negotiable_margin),  # NEW: Includes O&P + profit
                    "miscellaneous_amount": float(planned_miscellaneous),
                    "miscellaneous_percentage": float(misc_pct),
                    "overhead_amount": float(planned_overhead),
                    "overhead_percentage": float(overhead_pct),
                    "profit_amount": float(planned_profit),  # Keep for reference (60% of O&P)
                    "profit_percentage": float(profit_pct),
                    "transport_amount": float(planned_transport),
                    "total": float(planned_total),
                    "selling_price": float(selling_price),
                    "spending": float(planned_spending),  # NEW: Materials + Labour + Misc + Transport
                    "balance": float(client_amount_after_discount - actual_spending),  # NEW: Actual balance
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
                    "negotiable_margin": float(after_discount_negotiable_margin),  # NEW: Includes O&P + profit
                    "miscellaneous_amount": float(actual_miscellaneous),
                    "miscellaneous_percentage": float(misc_pct),
                    "overhead_amount": float(actual_overhead),  # Keep as allocation for tracking
                    "overhead_percentage": float(overhead_pct),
                    "profit_amount": float(after_discount_negotiable_margin),  # Same as negotiable margin now
                    "profit_percentage": (float(after_discount_negotiable_margin) / float(selling_price) * 100) if selling_price > 0 else 0,
                    "transport_amount": float(actual_transport),
                    "spending": float(actual_spending),  # NEW: Materials + Labour + Misc + Transport
                    "total": float(client_amount_after_discount),  # Client pays this (after discount)
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
                    "explanation": "Miscellaneous and Overhead are fixed allocations. Transport uses actual costs (MDN/RDN records) distributed proportionally across items. All extra costs (overruns + unplanned items) directly reduce the Negotiable Margin (profit)."
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
        total_planned_spending = sum(float(item['planned']['spending']) for item in comparison['items'])  # NEW: Planned spending
        # Each item includes the full _total_actual_project_transport in its spending.
        # To avoid counting transport N times (once per item), sum only materials+labour+misc
        # from items and add the project transport exactly once.
        total_actual_spending = (
            sum(
                float(item['actual']['materials_total']) + float(item['actual']['labour_total']) + float(item['actual']['miscellaneous_amount'])
                for item in comparison['items']
            )
            + float(_total_actual_project_transport)
        )
        total_discount_amount = sum(float(item['planned']['discount_amount']) for item in comparison['items'])
        total_client_amount_after_discount = sum(float(item['planned']['client_amount_after_discount']) for item in comparison['items'])
        total_profit_before_discount = sum(float(item['actual']['profit_before_discount']) for item in comparison['items'])
        total_after_discount_profit = sum(float(item['actual']['negotiable_margin']) for item in comparison['items'])

        # Calculate items subtotal using client-facing amount (what client is quoted)
        # This is the sum of items' client amounts before discount
        items_only_subtotal = Decimal(str(total_client_amount_before_discount))

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
        # Use the authoritative real actual transport from MDN/RDN/VDI records, not the per-item
        # planned-transport allocations (which are fixed and equal to planned at item level).
        total_actual_transport = float(_total_actual_project_transport)

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

        # IMPORTANT: Add preliminaries' internal cost to total spending
        # Total Planned Spending = BOQ Items Planned Spending + Preliminaries Internal Cost
        total_planned_spending_with_preliminaries = total_planned_spending + float(preliminary_internal_cost)

        # Total Actual Spending = BOQ Items Spending + Preliminaries Internal Cost
        total_actual_spending_with_preliminaries = total_actual_spending + float(preliminary_internal_cost)

        # Calculate combined subtotal (Items + Preliminaries) BEFORE discount
        combined_subtotal_before_discount = items_only_subtotal + Decimal(str(preliminary_amount))

        # Calculate discount on combined subtotal
        combined_discount_amount = Decimal('0')
        combined_discount_percentage = Decimal('0')

        if boq_level_discount_percentage > 0:
            combined_discount_percentage = boq_level_discount_percentage
            # Use stored discount amount if available (matches BOQ Details page exactly)
            # Otherwise recompute from percentage
            if boq_level_discount_amount > 0:
                combined_discount_amount = boq_level_discount_amount
            else:
                combined_discount_amount = combined_subtotal_before_discount * (combined_discount_percentage / Decimal('100'))

        # Calculate grand total after discount (this is what client pays)
        combined_grand_total_after_discount = combined_subtotal_before_discount - combined_discount_amount

        # Calculate actual profit using formula: Grand Total (After Discount) - Total Actual Spending
        # This is the REAL profit/loss - what client pays minus what we spent
        actual_project_profit = float(combined_grand_total_after_discount) - total_actual_spending_with_preliminaries

        # Calculate profit impact on combined totals (using PLANNED spending)
        # This shows how discount affects the planned profitability
        combined_profit_before_discount = combined_subtotal_before_discount - Decimal(str(total_planned_spending_with_preliminaries))
        combined_profit_after_discount = combined_grand_total_after_discount - Decimal(str(total_planned_spending_with_preliminaries))
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
            "planned_spending": float(total_planned_spending_with_preliminaries),  # NEW: Materials + Labour + Misc + Transport + Preliminaries Internal Cost
            "actual_spending": float(total_actual_spending_with_preliminaries),  # NEW: Materials + Labour + Misc + Transport + Preliminaries Internal Cost
            "variance": float(abs(total_actual_spending_with_preliminaries - total_planned_spending_with_preliminaries)),  # Spending variance
            "variance_percentage": float(abs((total_actual_spending_with_preliminaries - total_planned_spending_with_preliminaries) / total_planned_spending_with_preliminaries * 100)) if total_planned_spending_with_preliminaries > 0 else 0,
            "status": "under_budget" if total_actual_spending_with_preliminaries < total_planned_spending_with_preliminaries else "over_budget" if total_actual_spending_with_preliminaries > total_planned_spending_with_preliminaries else "on_budget",

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
            "calculation_note": "Client Amount (Before Discount) is the base selling price. Discount = Client Amount × Discount %. Grand Total (Client Amount After Discount) = Client Amount - Discount. Negotiable Margin = Grand Total - Actual Spending (Materials + Labour + Misc + Transport). O&P is included in Negotiable Margin, not subtracted.",

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

        # Include ALL non-rejected statuses so newly added CR materials appear immediately.
        # Query all CRs for this BOQ regardless of status (same as Profit Report).
        # No status filter — every non-deleted CR for the BOQ is included.
        all_boq_crs = ChangeRequest.query.filter(
            ChangeRequest.boq_id == boq_id,
            ChangeRequest.is_deleted == False
        ).all()

        for cr in all_boq_crs:
            cr_ids.add(cr.cr_id)

        # Fetch all related change requests - no status filter, matches Profit Report approach
        # Actual material amount comes from ChangeRequest.materials_data JSON
        change_requests_lookup = {}
        if cr_ids:
            change_requests = ChangeRequest.query.filter(
                ChangeRequest.cr_id.in_(list(cr_ids)),
                ChangeRequest.is_deleted == False
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

                # Parse sub_items_data (PRIMARY source) with fallback to materials_data
                raw_mats_source = cr.sub_items_data or cr.materials_data
                if raw_mats_source:
                    sub_items_data = raw_mats_source
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

                            # is_new_material: check both 'is_new_material' and 'is_new' field names
                            is_new_mat = bool(mat.get('is_new_material') or mat.get('is_new', False))

                            mat_info = {
                                'master_material_id': mat.get('master_material_id'),
                                'material_name': material_name,
                                'amount': quantity * actual_unit_price,  # Calculate from qty * actual price
                                'quantity': quantity,
                                'unit_price': actual_unit_price,  # Use vendor price if available
                                'is_new_material': is_new_mat,
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
                POChild.status.notin_(['rejected', 'cancelled'])
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

                            # VAT: Distribute proportionally by each material's share of PO subtotal
                            # This gives the same result as applying vat_percent directly per material
                            if po_child_subtotal > 0 and material_amount > 0:
                                material_vat_amount = round((material_amount / po_child_subtotal) * po_child_total_vat, 2)
                            else:
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

                # VAT: Distribute proportionally by each material's share of CR subtotal
                # This gives the same result as applying vat_percent directly per material
                if cr_subtotal > 0 and material_amount > 0:
                    material_vat_amount = round((material_amount / cr_subtotal) * cr_total_vat, 2)
                else:
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
                    'master_item_id': mat.get('master_item_id'),  # BOQ item link (needed for grouping)
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

        # Build lookup: BOQ item ID → item_name.
        # Used to resolve the item_name for unplanned materials whose CR has item_name = NULL.
        # (e.g. "plain black cover" belongs to CR with item_id=X; X maps to "TEST GLASS")
        master_item_id_to_name = {}
        for p in planned_materials_list:
            mid = p.get('master_item_id')
            iname = p.get('item_name', '')
            if mid and iname:
                master_item_id_to_name[mid] = iname

        # Group unplanned materials by item_name, with two levels of fallback:
        # 1. If item_name is empty, resolve via master_item_id → BOQ item name.
        # 2. Normalise case so "test glass" merges into the existing "TEST GLASS" group.
        _comparison_norm_map = {k.lower().strip(): k for k in comparison_by_item.keys()}

        unplanned_by_item = {}
        for mat in unplanned_materials:
            raw_item_name = mat.get('item_name', '') or ''

            # Fallback 1: resolve empty item_name from the BOQ item ID
            if not raw_item_name:
                mat_item_id = mat.get('master_item_id')
                raw_item_name = master_item_id_to_name.get(mat_item_id, '') if mat_item_id else ''

            raw_item_name = raw_item_name or 'Other'

            # Fallback 2: prefer the existing comparison group key (preserves BOQ casing)
            item_name = _comparison_norm_map.get(raw_item_name.lower().strip(), raw_item_name)

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
    Get all projects that have a BOQ (for purchase comparison).
    Shows ALL projects so Live and Completed tabs both work correctly.
    The comparison view will show planned materials vs actual purchases (actual may be 0 if no purchases yet).
    """
    try:
        from sqlalchemy import func as _func, and_ as _and

        # Single JOIN query: subquery picks the first (lowest) BOQ per project,
        # then we join Project + BOQ in one round trip (was 3 separate queries).
        _min_boq_subq = db.session.query(
            BOQ.project_id,
            _func.min(BOQ.boq_id).label('min_boq_id')
        ).filter(BOQ.is_deleted == False).group_by(BOQ.project_id).subquery()

        rows = db.session.query(
            Project.project_id,
            Project.project_name,
            Project.project_code,
            Project.status.label('project_status'),
            Project.end_date,
            BOQ.boq_id,
            BOQ.status.label('boq_status')
        ).join(
            _min_boq_subq, Project.project_id == _min_boq_subq.c.project_id
        ).join(
            BOQ, BOQ.boq_id == _min_boq_subq.c.min_boq_id
        ).filter(
            Project.is_deleted == False
        ).all()

        if not rows:
            return jsonify({"success": True, "data": [], "count": 0}), 200

        project_list = [{
            'project_id': row.project_id,
            'project_name': row.project_name,
            'project_code': row.project_code,
            'project_status': row.project_status,
            'boq_id': row.boq_id,
            'boq_status': row.boq_status,
            'end_date': row.end_date.isoformat() if row.end_date else None
        } for row in rows]

        return jsonify({
            "success": True,
            "data": project_list,
            "count": len(project_list)
        }), 200

    except Exception as e:
        log.error(f"Error in get_all_purchase_boq: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_labour_workflow_details(boq_id):
    """
    Get comprehensive labour workflow details for a BOQ including:
    - Labour requisitions (who requested, when, approval status)
    - Worker assignments (which workers, rates, dates)
    - Daily attendance records (clock times, hours, costs)
    - Attendance locks (approval status, who locked, when)
    - Payment status and locks

    This endpoint provides complete visibility into the labour workflow
    from requisition through to payment.
    """
    try:
        from models.labour_requisition import LabourRequisition
        from models.worker_assignment import WorkerAssignment
        from models.daily_attendance import DailyAttendance
        from models.worker import Worker
        from sqlalchemy import func, and_
        from sqlalchemy.orm import selectinload
        from collections import defaultdict

        # Input validation
        try:
            boq_id = int(boq_id)
            if boq_id <= 0:
                return jsonify({"error": "BOQ ID must be positive"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid BOQ ID"}), 400

        # Verify BOQ exists
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Authorization check - verify user has access to this BOQ's project
        current_user = g.user if hasattr(g, 'user') else None
        if current_user:
            user_role = current_user.get('role', '').strip().lower()
            user_id = current_user.get('user_id')

            # Admin and TD have access to all BOQs
            # PM and MEP need to be assigned to the project
            if user_role not in ['admin', 'technical director', 'technical_director', 'technicaldirector', 'td']:
                # Check if user is assigned to this project
                project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
                if not project:
                    return jsonify({"error": "Project not found"}), 404

                # Check PM assignment
                if user_role in ['projectmanager', 'project_manager', 'project manager', 'pm']:
                    if project.project_manager_id != user_id:
                        return jsonify({"error": "Access denied. You are not assigned to this project."}), 403

                # Check MEP assignment
                elif user_role in ['mep', 'mep manager', 'mep_manager', 'mepmanager']:
                    if project.mep_id != user_id:
                        return jsonify({"error": "Access denied. You are not assigned to this project."}), 403

        # Get all labour requisitions for this BOQ
        # Note: Cannot use selectinload on 'assignments' because it's lazy='dynamic'
        import re
        from sqlalchemy import or_, cast
        from sqlalchemy.dialects.postgresql import JSONB

        # First, try the straightforward queries (deprecated boq_id or explicit boq_id in JSONB)
        requisitions = LabourRequisition.query.filter(
            or_(
                # Check deprecated boq_id column
                LabourRequisition.boq_id == boq_id,
                # Check labour_items JSONB array for boq_id
                LabourRequisition.labour_items.op('@>')(
                    cast([{"boq_id": boq_id}], JSONB)
                )
            ),
            LabourRequisition.is_deleted == False
        ).order_by(LabourRequisition.request_date.desc()).all()

        # If no requisitions found, check labour_id pattern: lab_{boq_id}_...
        if not requisitions:
            all_requisitions = LabourRequisition.query.filter(
                LabourRequisition.is_deleted == False,
                LabourRequisition.labour_items.isnot(None)
            ).order_by(LabourRequisition.request_date.desc()).all()

            # Filter requisitions that have labour_id matching pattern lab_{boq_id}_
            matching_requisitions = []
            for req in all_requisitions:
                if req.labour_items:
                    for item in req.labour_items:
                        labour_id = item.get('labour_id', '')
                        # Pattern: lab_{boq_id}_... (e.g., lab_843_1_2_1)
                        match = re.match(r'^lab_(\d+)_', labour_id)
                        if match and int(match.group(1)) == boq_id:
                            matching_requisitions.append(req)
                            break

            requisitions = matching_requisitions

        # Preload all assignments and attendance for efficiency (prevents N+1 queries)
        # Note: WorkerAssignment.attendance_records is also lazy='dynamic', so we can't eager load it
        if requisitions:
            req_ids = [r.requisition_id for r in requisitions]

            # Query assignments separately (without attendance eager loading)
            assignments_with_data = WorkerAssignment.query.options(
                selectinload(WorkerAssignment.worker)
            ).filter(
                WorkerAssignment.requisition_id.in_(req_ids),
                WorkerAssignment.is_deleted == False
            ).all()

            # Query attendance records separately
            from models.daily_attendance import DailyAttendance
            assignment_ids = [a.assignment_id for a in assignments_with_data]
            attendance_records_all = DailyAttendance.query.filter(
                DailyAttendance.assignment_id.in_(assignment_ids),
                DailyAttendance.is_deleted == False
            ).all()

            # Group attendance by assignment_id
            attendance_by_assignment = defaultdict(list)
            for att in attendance_records_all:
                attendance_by_assignment[att.assignment_id].append(att)

            # Attach attendance to assignments manually
            for assignment in assignments_with_data:
                assignment._preloaded_attendance = attendance_by_assignment.get(assignment.assignment_id, [])

            # Group assignments by requisition_id for easy lookup
            assignments_by_req = defaultdict(list)
            for assignment in assignments_with_data:
                assignments_by_req[assignment.requisition_id].append(assignment)
        else:
            assignments_by_req = defaultdict(list)

        labour_workflow_data = []

        for req in requisitions:
            # Get worker assignments for this requisition from preloaded data
            assignments = assignments_by_req.get(req.requisition_id, [])

            assignment_details = []
            total_worked_hours = Decimal('0')
            total_worked_cost = Decimal('0')
            attendance_records_list = []

            for assignment in assignments:
                # Get worker details (already loaded via eager loading)
                worker = assignment.worker

                # Get attendance records for this assignment (preloaded manually)
                attendance_records = getattr(assignment, '_preloaded_attendance', [])
                attendance_records.sort(key=lambda x: x.attendance_date, reverse=True)

                # Calculate totals for this worker
                worker_total_hours = Decimal('0')
                worker_total_cost = Decimal('0')
                locked_count = 0
                pending_count = 0

                attendance_list = []
                for attendance in attendance_records:
                    hours = Decimal(str(attendance.total_hours or 0))
                    cost = Decimal(str(attendance.total_cost or 0))
                    worker_total_hours += hours
                    worker_total_cost += cost

                    # Count lock statuses
                    if attendance.approval_status == 'locked':
                        locked_count += 1
                    elif attendance.approval_status == 'pending':
                        pending_count += 1

                    attendance_list.append({
                        'attendance_id': attendance.attendance_id,
                        'attendance_date': attendance.attendance_date.isoformat() if attendance.attendance_date else None,
                        'clock_in_time': attendance.clock_in_time.strftime('%H:%M') if attendance.clock_in_time else '--',
                        'clock_out_time': attendance.clock_out_time.strftime('%H:%M') if attendance.clock_out_time else '--',
                        'total_hours': float(hours),
                        'regular_hours': float(attendance.regular_hours or 0),
                        'overtime_hours': float(attendance.overtime_hours or 0),
                        'hourly_rate': float(attendance.hourly_rate or 0),
                        'total_cost': float(cost),
                        'attendance_status': attendance.attendance_status,
                        'approval_status': attendance.approval_status,  # pending, locked, rejected
                        'approved_by_name': attendance.approved_by_name,
                        'approval_date': attendance.approval_date.isoformat() if attendance.approval_date else None,
                        'is_locked': attendance.approval_status == 'locked'
                    })

                total_worked_hours += worker_total_hours
                total_worked_cost += worker_total_cost

                # Determine payment lock status
                payment_locked = locked_count > 0
                payment_status = 'locked' if payment_locked else 'pending'

                assignment_details.append({
                    'assignment_id': assignment.assignment_id,
                    'worker_id': assignment.worker_id,
                    'worker_name': worker.full_name if worker else 'Unknown',
                    'worker_code': worker.worker_code if worker else None,
                    'assignment_start_date': assignment.assignment_start_date.isoformat() if assignment.assignment_start_date else None,
                    'assignment_end_date': assignment.assignment_end_date.isoformat() if assignment.assignment_end_date else None,
                    'hourly_rate': float(assignment.hourly_rate_override or (worker.hourly_rate if worker else 0)),
                    'role_at_site': assignment.role_at_site,
                    'assignment_status': assignment.status,
                    'total_hours_worked': float(worker_total_hours),
                    'total_cost': float(worker_total_cost),
                    'attendance_records': attendance_list,
                    'attendance_locked_count': locked_count,
                    'attendance_pending_count': pending_count,
                    'payment_status': payment_status,
                    'payment_locked': payment_locked
                })

                attendance_records_list.extend(attendance_list)

            # Get labour items from requisition
            labour_items_list = req.labour_items or []

            # Calculate planned totals from labour items
            planned_workers = sum(item.get('workers_count', 0) for item in labour_items_list)

            # Determine overall lock status
            total_attendance_records = len(attendance_records_list)
            locked_attendance = sum(1 for a in attendance_records_list if a['is_locked'])
            overall_lock_status = 'fully_locked' if locked_attendance == total_attendance_records and total_attendance_records > 0 else \
                                  'partially_locked' if locked_attendance > 0 else 'unlocked'

            labour_workflow_data.append({
                'requisition_id': req.requisition_id,
                'requisition_code': req.requisition_code,
                'labour_items': labour_items_list,
                'planned_workers_count': planned_workers,
                'site_name': req.site_name,
                'required_date': req.required_date.isoformat() if req.required_date else None,
                'work_description': req.work_description,
                'skill_required': req.skill_required,

                # Requester info
                'requested_by_user_id': req.requested_by_user_id,
                'requested_by_name': req.requested_by_name,
                'request_date': req.request_date.isoformat() if req.request_date else None,

                # Approval workflow
                'status': req.status,
                'approved_by_user_id': req.approved_by_user_id,
                'approved_by_name': req.approved_by_name,
                'approval_date': req.approval_date.isoformat() if req.approval_date else None,
                'rejection_reason': req.rejection_reason,

                # Assignment tracking
                'assignment_status': req.assignment_status,
                'assigned_by_name': req.assigned_by_name,
                'assignment_date': req.assignment_date.isoformat() if req.assignment_date else None,
                'work_status': req.work_status,

                # Worker assignments and attendance
                'assignments': assignment_details,
                'assigned_workers_count': len(assignment_details),

                # Totals
                'total_hours_worked': float(total_worked_hours),
                'total_cost': float(total_worked_cost),

                # Lock status
                'overall_lock_status': overall_lock_status,
                'total_attendance_records': total_attendance_records,
                'locked_attendance_records': locked_attendance,
                'pending_attendance_records': total_attendance_records - locked_attendance
            })

        return jsonify({
            "success": True,
            "data": {
                "boq_id": boq_id,
                "boq_name": boq.boq_name,
                "project_id": boq.project_id,
                "labour_workflow": labour_workflow_data,
                "total_requisitions": len(labour_workflow_data)
            }
        }), 200

    except Exception as e:
        log.error(f"Error in get_labour_workflow_details: {str(e)}")
        import traceback
        log.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


def get_profit_report(boq_id):
    """
    Get profit report for a BOQ with transport, material, and item breakdown.
    Used by the Report tab in the Profit Comparison page.

    Returns:
    - transport: planned vs actual with detailed rows (driver, vehicle, purpose)
    - materials: planned vs actual per material
    - items: planned vs actual per item
    """
    try:
        # Cache check — profit reports are historical, 2-min TTL is safe
        # Also check shared bust flag so all workers invalidate together
        _now = _time.time()
        _cached = _profit_report_cache.get(boq_id)
        if _cached and (_now - _cached[0]) < _PROFIT_REPORT_TTL and _cached[0] > _get_bust_ts():
            return jsonify(_cached[1]), 200

        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        boq_detail = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_detail or not boq_detail.boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        boq_data = json.loads(boq_detail.boq_details) if isinstance(boq_detail.boq_details, str) else boq_detail.boq_details
        project_id = boq.project_id

        # ============================================================
        # 1. PLANNED DATA from BOQ JSON
        # ============================================================
        planned_transport = Decimal('0')
        materials_planned = {}
        items_planned = []

        for item in boq_data.get('items', []):
            item_planned_materials = Decimal('0')
            item_planned_transport = Decimal('0')

            for sub_item in item.get('sub_items', []):
                # Mirror the purchase-comparison calculation exactly:
                # 1. Use stored transport_amount if present (> 0).
                # 2. Otherwise derive base_total: qty×rate → boq fields → internal cost fallback.
                # 3. transport = base_total × transport_percentage / 100.
                sub_transport_pct = Decimal(str(sub_item.get('transport_percentage', 5) or 5))
                stored_transport = sub_item.get('transport_amount', 0) or 0
                if stored_transport:
                    transport_amt = Decimal(str(stored_transport))
                else:
                    sub_qty = Decimal(str(sub_item.get('quantity', 0) or 0))
                    sub_rate = Decimal(str(sub_item.get('rate', 0) or 0))
                    if sub_qty > 0 and sub_rate > 0:
                        sub_base_total = sub_qty * sub_rate
                    else:
                        sub_base_total = Decimal(str(
                            sub_item.get('base_total') or
                            sub_item.get('per_unit_cost') or
                            sub_item.get('client_rate') or
                            0
                        ))
                        if sub_base_total == 0:
                            # Fall back to internal cost: sum of materials + labour
                            mat_cost = sum(
                                Decimal(str(m.get('total', 0) or
                                           float(m.get('quantity', 0)) * float(m.get('unit_price', 0))))
                                for m in sub_item.get('materials', [])
                            )
                            lab_cost = sum(
                                Decimal(str(l.get('total_cost', 0) or
                                           float(l.get('hours', 0)) * float(l.get('rate_per_hour', 0))))
                                for l in sub_item.get('labour', [])
                            )
                            sub_base_total = mat_cost + lab_cost
                    transport_amt = sub_base_total * (sub_transport_pct / 100)
                planned_transport += transport_amt
                item_planned_transport += transport_amt

                for mat in sub_item.get('materials', []):
                    mat_name = (mat.get('material_name') or '').strip()
                    if not mat_name:
                        continue
                    mat_qty = float(mat.get('quantity', 0) or 0)
                    mat_rate = float(mat.get('unit_price', 0) or 0)
                    mat_total = float(mat.get('total', mat_qty * mat_rate) or mat_qty * mat_rate)

                    if mat_name not in materials_planned:
                        materials_planned[mat_name] = {
                            'material_name': mat_name,
                            'unit': mat.get('unit', ''),
                            'planned_quantity': 0.0,
                            'planned_rate': mat_rate,
                            'planned_amount': 0.0,
                            'item_name': item.get('item_name', ''),
                        }
                    materials_planned[mat_name]['planned_quantity'] += mat_qty
                    materials_planned[mat_name]['planned_amount'] += mat_total
                    item_planned_materials += Decimal(str(mat_total))

            items_planned.append({
                'item_name': item.get('item_name', ''),
                'master_item_id': item.get('master_item_id'),
                'planned_amount': float(item_planned_materials),
                'planned_transport': float(item_planned_transport),
            })

        # ============================================================
        # 2. ACTUAL TRANSPORT DETAILS from delivery note tables
        # ============================================================
        from models.inventory import MaterialDeliveryNote, ReturnDeliveryNote, InventoryTransaction
        from models.returnable_assets import AssetDeliveryNote, AssetReturnDeliveryNote
        from models.labour_requisition import LabourRequisition
        from models.user import User

        transport_details = []
        actual_transport_total = Decimal('0')

        # Material Delivery Notes (Store → Site) - show all issued/dispatched/delivered notes
        mdn_records = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.project_id == project_id,
            MaterialDeliveryNote.status.notin_(['DRAFT', 'CANCELLED'])
        ).order_by(MaterialDeliveryNote.dispatched_at.desc()).all()

        # Return Delivery Notes (Site → Store) - show all issued/in-transit/received notes
        rdn_records = ReturnDeliveryNote.query.filter(
            ReturnDeliveryNote.project_id == project_id,
            ReturnDeliveryNote.status.notin_(['DRAFT', 'CANCELLED'])
        ).order_by(ReturnDeliveryNote.created_at.desc()).all()

        # Batch-resolve dispatched_by email → user full_name for MDN and RDN
        dispatcher_emails = set()
        for m in mdn_records:
            if m.dispatched_by:
                dispatcher_emails.add(m.dispatched_by)
        for r in rdn_records:
            if r.dispatched_by:
                dispatcher_emails.add(r.dispatched_by)
        user_name_map = {}
        if dispatcher_emails:
            dispatcher_users = User.query.filter(User.email.in_(list(dispatcher_emails))).all()
            for u in dispatcher_users:
                if u.email not in user_name_map:
                    user_name_map[u.email] = u.full_name

        for m in mdn_records:
            fee = Decimal(str(m.transport_fee or 0))
            actual_transport_total += fee
            dispatcher_name = user_name_map.get(m.dispatched_by, m.dispatched_by) if m.dispatched_by else '-'
            transport_details.append({
                'purpose': 'Store to Site',
                'driver_name': m.driver_name or '-',
                'vehicle_number': m.vehicle_number or '-',
                'driver_contact': m.driver_contact or '-',
                'vendor_name': dispatcher_name or '-',
                'amount': float(fee),
                'date': m.dispatched_at.isoformat() if m.dispatched_at else None,
                'reference': m.delivery_note_number or '-',
                'status': m.status or '-',
                'notes': m.notes or '-',
            })

        for r in rdn_records:
            fee = Decimal(str(r.transport_fee or 0))
            actual_transport_total += fee
            dispatcher_name = user_name_map.get(r.dispatched_by, r.dispatched_by) if r.dispatched_by else '-'
            transport_details.append({
                'purpose': 'Site to Store (Return)',
                'driver_name': r.driver_name or '-',
                'vehicle_number': r.vehicle_number or '-',
                'driver_contact': r.driver_contact or '-',
                'vendor_name': dispatcher_name or '-',
                'amount': float(fee),
                'date': r.created_at.isoformat() if r.created_at else None,
                'reference': r.return_note_number or '-',
                'status': r.status or '-',
                'notes': '-',
            })

        # Inventory Transactions (Vendor → Store) — filter strictly by delivery_batch_ref
        # derived from this project's PURCHASE transactions that have a properly
        # auto-generated delivery_batch_ref (MSQ-IN-XX format, set by ManualStockInForm).
        # Transactions with NULL or non-MSQ-IN delivery_batch_ref are old/unlinked stock-ins
        # with garbage reference_numbers and are excluded.
        _seen_inv_batches_pr = set()
        _seen_inv_refs_pr = set()
        inv_records = InventoryTransaction.query.filter(
            InventoryTransaction.project_id == project_id,
            InventoryTransaction.transaction_type == 'PURCHASE',
            InventoryTransaction.delivery_batch_ref.like('MSQ-IN-%')
        ).order_by(InventoryTransaction.created_at.desc()).all()
        for t in inv_records:
            fee = Decimal(str(t.transport_fee or 0))
            if t.reference_number:
                _seen_inv_refs_pr.add(t.reference_number)
            if t.delivery_batch_ref:
                _seen_inv_refs_pr.add(t.delivery_batch_ref)
            if fee <= 0:
                continue
            if t.delivery_batch_ref:
                if t.delivery_batch_ref in _seen_inv_batches_pr:
                    continue
                _seen_inv_batches_pr.add(t.delivery_batch_ref)
            actual_transport_total += fee
            ref_label = t.delivery_batch_ref or t.reference_number or (t.material.material_name if t.material else '-')
            transport_details.append({
                'purpose': 'Vendor to Store',
                'driver_name': t.driver_name or '-',
                'vehicle_number': t.vehicle_number or '-',
                'driver_contact': '-',
                'vendor_name': '-',
                'amount': float(fee),
                'date': t.created_at.isoformat() if t.created_at else None,
                'reference': ref_label,
                'status': 'Completed',
                'notes': t.notes or '-',
            })

        # Labour Requisitions (Labour Transport) - show all active requisitions
        lab_records = LabourRequisition.query.filter(
            LabourRequisition.project_id == project_id,
            LabourRequisition.is_deleted == False
        ).order_by(LabourRequisition.created_at.desc()).all()

        for lr in lab_records:
            fee = Decimal(str(lr.transport_fee or 0))
            actual_transport_total += fee
            transport_details.append({
                'purpose': 'Labour Transport',
                'driver_name': lr.driver_name or '-',
                'vehicle_number': lr.vehicle_number or '-',
                'driver_contact': lr.driver_contact or '-',
                'vendor_name': lr.skill_required or '-',
                'amount': float(fee),
                'date': lr.created_at.isoformat() if lr.created_at else None,
                'reference': f'LR-{lr.requisition_id}',
                'status': lr.status or '-',
                'notes': '-',
            })

        # Asset Delivery Notes - show all issued/dispatched/delivered notes
        adn_records = AssetDeliveryNote.query.filter(
            AssetDeliveryNote.project_id == project_id,
            AssetDeliveryNote.status.notin_(['DRAFT', 'CANCELLED'])
        ).order_by(AssetDeliveryNote.dispatched_at.desc()).all()

        for a in adn_records:
            fee = Decimal(str(a.transport_fee or 0))
            actual_transport_total += fee
            transport_details.append({
                'purpose': 'Asset Delivery',
                'driver_name': a.driver_name or '-',
                'vehicle_number': a.vehicle_number or '-',
                'driver_contact': a.driver_contact or '-',
                'vendor_name': '-',
                'amount': float(fee),
                'date': a.dispatched_at.isoformat() if a.dispatched_at else None,
                'reference': a.adn_number or '-',
                'status': a.status or '-',
                'notes': '-',
            })

        # Asset Return Delivery Notes - show all issued/in-transit/received notes
        ardn_records = AssetReturnDeliveryNote.query.filter(
            AssetReturnDeliveryNote.project_id == project_id,
            AssetReturnDeliveryNote.status.notin_(['DRAFT', 'CANCELLED'])
        ).order_by(AssetReturnDeliveryNote.return_date.desc()).all()

        for ar in ardn_records:
            fee = Decimal(str(ar.transport_fee or 0))
            actual_transport_total += fee
            transport_details.append({
                'purpose': 'Asset Return',
                'driver_name': ar.driver_name or '-',
                'vehicle_number': ar.vehicle_number or '-',
                'driver_contact': ar.driver_contact or '-',
                'vendor_name': '-',
                'amount': float(fee),
                'date': ar.return_date.isoformat() if ar.return_date else None,
                'reference': ar.ardn_number or '-',
                'status': ar.status or '-',
                'notes': '-',
            })

        # Sort transport details by date descending
        transport_details.sort(key=lambda x: x['date'] or '', reverse=True)

        # ============================================================
        # 3. ACTUAL MATERIAL DATA from purchase tracking
        # ============================================================
        from models.boq import MaterialPurchaseTracking

        mat_records = MaterialPurchaseTracking.query.filter(
            MaterialPurchaseTracking.boq_id == boq_id,
            MaterialPurchaseTracking.is_deleted == False
        ).all()

        mat_actuals = {}
        for r in mat_records:
            name = (r.material_name or '').strip()
            actual_amount = float(r.total_quantity_purchased or 0) * float(r.latest_unit_price or 0)
            if name in mat_actuals:
                mat_actuals[name]['actual_quantity'] += float(r.total_quantity_purchased or 0)
                mat_actuals[name]['actual_amount'] += actual_amount
            else:
                mat_actuals[name] = {
                    'actual_quantity': float(r.total_quantity_purchased or 0),
                    'actual_rate': float(r.latest_unit_price or 0),
                    'actual_amount': actual_amount,
                    'unit': r.unit or '',
                }

        # ============================================================
        # 3b. SUPPLEMENT actual material data from Change Requests
        # CR new materials won't be in material_purchase_tracking yet —
        # their prices are in material_vendor_selections (negotiated_price)
        # or in sub_items_data/materials_data (unit_price, usually 0)
        # ============================================================
        cr_for_boq = ChangeRequest.query.filter(
            ChangeRequest.boq_id == boq_id,
            ChangeRequest.is_deleted == False
        ).all()

        # Fetch VAT percent from LPOCustomization for each CR
        cr_ids_for_boq = [cr.cr_id for cr in cr_for_boq]
        profit_lpo_vat_lookup = {}  # {cr_id: vat_percent}
        if cr_ids_for_boq:
            profit_lpo_customs = LPOCustomization.query.filter(
                LPOCustomization.cr_id.in_(cr_ids_for_boq),
                LPOCustomization.po_child_id == None
            ).all()
            for lpo in profit_lpo_customs:
                profit_lpo_vat_lookup[lpo.cr_id] = float(lpo.vat_percent or 5.0)

        for cr in cr_for_boq:
            # Get negotiated prices from vendor selections
            mvs = cr.material_vendor_selections or {}
            if isinstance(mvs, str):
                try:
                    mvs = json.loads(mvs)
                except Exception:
                    mvs = {}

            # Get materials list: prefer sub_items_data, fallback to materials_data
            cr_mats = cr.sub_items_data or cr.materials_data or []
            if isinstance(cr_mats, str):
                try:
                    cr_mats = json.loads(cr_mats)
                except Exception:
                    cr_mats = []
            if not isinstance(cr_mats, list):
                cr_mats = []

            for mat in cr_mats:
                mat_name = (mat.get('material_name') or '').strip()
                if not mat_name:
                    continue

                is_new = bool(mat.get('is_new_material') or mat.get('is_new', False))
                quantity = float(mat.get('quantity', 0) or 0)

                # Price priority (highest to lowest):
                # 1. material_vendor_selections.negotiated_price (vendor confirmed price)
                # 2. materials_data.unit_price (estimator's proposed price at CR creation)
                # 3. 0 (unknown, pending)
                negotiated_price = 0.0
                mvs_entry = mvs.get(mat_name)
                if not mvs_entry:
                    for k, v in mvs.items():
                        if isinstance(v, dict) and k.lower().strip() == mat_name.lower().strip():
                            mvs_entry = v
                            break
                if mvs_entry and isinstance(mvs_entry, dict):
                    negotiated_price = float(mvs_entry.get('negotiated_price', 0) or 0)

                # Fallback to materials_data unit_price when no vendor negotiated price yet
                mat_unit_price = float(mat.get('unit_price', 0) or 0)
                mat_total_price = float(mat.get('total_price', 0) or 0)
                if negotiated_price == 0 and mat_unit_price > 0:
                    negotiated_price = mat_unit_price

                # Calculate actual amount
                if mat_total_price > 0 and negotiated_price == mat_unit_price:
                    # Use stored total_price directly (avoids rounding from qty × unit_price)
                    actual_amount = mat_total_price
                else:
                    actual_amount = quantity * negotiated_price

                # Only supplement if this material is NOT already tracked by purchase_tracking
                if mat_name not in mat_actuals:
                    # Show the material if it has any price or it's a new pending CR material
                    if negotiated_price > 0 or is_new:
                        mat_actuals[mat_name] = {
                            'actual_quantity': quantity,
                            'actual_rate': negotiated_price,
                            'actual_amount': actual_amount,
                            'unit': mat.get('unit', ''),
                            'cr_id': cr.cr_id,
                        }
                elif negotiated_price > 0:
                    # Override stale MaterialPurchaseTracking data with the actual vendor
                    # negotiated price. MaterialPurchaseTracking.latest_unit_price can be
                    # set to the original BOQ planned rate if it was never updated after
                    # the vendor selection step.
                    mat_actuals[mat_name]['actual_rate'] = negotiated_price
                    mat_actuals[mat_name]['actual_amount'] = actual_amount
                    mat_actuals[mat_name]['actual_quantity'] = quantity
                    mat_actuals[mat_name]['cr_id'] = cr.cr_id  # needed for VAT lookup

                # If it's a new CR material (not in BOQ), add it to materials_planned with 0 values
                # so it appears as a row with planned=0, actual=CR amount
                if is_new and mat_name not in materials_planned:
                    materials_planned[mat_name] = {
                        'material_name': mat_name,
                        'unit': mat.get('unit', ''),
                        'planned_quantity': 0.0,
                        'planned_rate': 0.0,
                        'planned_amount': 0.0,
                        'item_name': cr.item_name or '',
                        'is_new_cr_material': True,
                        'cr_id': cr.cr_id,
                        'cr_status': cr.status,
                    }

        all_mat_names = set(list(materials_planned.keys()) + list(mat_actuals.keys()))
        materials_comparison = []
        for mat_name in all_mat_names:
            planned = materials_planned.get(mat_name, {})
            actual = mat_actuals.get(mat_name, {})
            planned_amt = float(planned.get('planned_amount', 0))
            actual_amt = float(actual.get('actual_amount', 0))
            is_new_cr = bool(planned.get('is_new_cr_material', False))
            cr_id_val = planned.get('cr_id') or actual.get('cr_id')
            cr_status_val = planned.get('cr_status', '')
            # Compute VAT for ALL CR-purchased materials (both new CR materials and
            # existing BOQ materials bought via a CR) using LPOCustomization vat_percent.
            # Only apply VAT when the CR has a LPO with a VAT configuration.
            has_cr_vat = bool(cr_id_val and cr_id_val in profit_lpo_vat_lookup)
            vat_pct = profit_lpo_vat_lookup.get(cr_id_val, 0.0) if has_cr_vat else 0.0
            vat_amount = round(actual_amt * vat_pct / 100, 2) if has_cr_vat else 0.0
            actual_amount_with_vat = round(actual_amt + vat_amount, 2)
            materials_comparison.append({
                'material_name': mat_name,
                'unit': planned.get('unit') or actual.get('unit', ''),
                'item_name': planned.get('item_name', ''),
                'planned_quantity': float(planned.get('planned_quantity', 0)),
                'planned_rate': float(planned.get('planned_rate', 0)),
                'planned_amount': planned_amt,
                'actual_quantity': float(actual.get('actual_quantity', 0)),
                'actual_rate': float(actual.get('actual_rate', 0)),
                'actual_amount': actual_amt,
                'vat_amount': vat_amount,
                'actual_amount_with_vat': actual_amount_with_vat,
                'variance': round(planned_amt - actual_amt, 2),
                'variance_pct': round((planned_amt - actual_amt) / planned_amt * 100, 2) if planned_amt > 0 else 0,
                'is_new_cr_material': is_new_cr,
                'cr_id': cr_id_val,
                'cr_status': cr_status_val,
                'status': 'under' if actual_amt < planned_amt else ('over' if actual_amt > planned_amt else 'on_plan'),
            })
        materials_comparison.sort(key=lambda x: x['planned_amount'], reverse=True)

        total_planned_materials = sum(m['planned_amount'] for m in materials_comparison)
        total_actual_materials = sum(m['actual_amount'] for m in materials_comparison)
        total_vat_materials = sum(m['vat_amount'] for m in materials_comparison)

        # ============================================================
        # 4. LABOUR COMPARISON
        # ============================================================

        # Planned labour from BOQ JSON (check both item-level and sub-item-level labour)
        planned_labour_total = Decimal('0')
        planned_workers = []
        for item in boq_data.get('items', []):
            item_name = item.get('item_name') or item.get('name', '')
            # Item-level labour
            for lab in item.get('labour', []):
                role = lab.get('labour_role') or lab.get('role', '')
                hours = float(lab.get('hours', 0) or lab.get('planned_hours', 0) or 0)
                rate = float(lab.get('rate_per_hour', 0) or lab.get('rate', 0) or 0)
                lab_total = float(lab.get('total', 0) or 0)
                if lab_total == 0:
                    lab_total = hours * rate
                # Skip placeholder entries with no role and no meaningful cost
                if not role and rate == 0 and lab_total == 0:
                    continue
                planned_labour_total += Decimal(str(lab_total))
                planned_workers.append({
                    'labour_role': role or '-',
                    'hours': round(hours, 2),
                    'rate_per_hour': round(rate, 2),
                    'total': round(lab_total, 2),
                    'item_name': item_name,
                })
            # Sub-item-level labour
            for sub_item in item.get('sub_items', []):
                sub_name = sub_item.get('sub_item_name') or sub_item.get('name', '')
                for lab in sub_item.get('labour', []):
                    role = lab.get('labour_role') or lab.get('role', '')
                    hours = float(lab.get('hours', 0) or lab.get('planned_hours', 0) or 0)
                    rate = float(lab.get('rate_per_hour', 0) or lab.get('rate', 0) or 0)
                    lab_total = float(lab.get('total', 0) or 0)
                    if lab_total == 0:
                        lab_total = hours * rate
                    # Skip placeholder entries with no role and no meaningful cost
                    if not role and rate == 0 and lab_total == 0:
                        continue
                    planned_labour_total += Decimal(str(lab_total))
                    planned_workers.append({
                        'labour_role': role or '-',
                        'hours': round(hours, 2),
                        'rate_per_hour': round(rate, 2),
                        'total': round(lab_total, 2),
                        'item_name': (f"{item_name} / {sub_name}" if sub_name else item_name),
                    })

        # Actual labour: per-worker breakdown from daily_attendance
        from sqlalchemy import func
        from models.daily_attendance import DailyAttendance
        from models.worker import Worker

        total_cost_expr = func.sum(func.coalesce(DailyAttendance.total_cost, 0))

        worker_rows = (
            db.session.query(
                Worker.worker_id,
                Worker.worker_code,
                Worker.full_name.label('worker_name'),
                Worker.phone,
                DailyAttendance.labour_role,
                func.count(DailyAttendance.attendance_date.distinct()).label('working_days'),
                func.sum(func.coalesce(DailyAttendance.regular_hours, 0)).label('regular_hours'),
                func.sum(func.coalesce(DailyAttendance.overtime_hours, 0)).label('overtime_hours'),
                func.sum(func.coalesce(DailyAttendance.total_hours, 0)).label('total_hours'),
                func.avg(func.coalesce(DailyAttendance.hourly_rate, 0)).label('avg_hourly_rate'),
                total_cost_expr.label('total_cost'),
                func.min(DailyAttendance.attendance_date).label('first_date'),
                func.max(DailyAttendance.attendance_date).label('last_date'),
            )
            .join(Worker, DailyAttendance.worker_id == Worker.worker_id)
            .filter(
                DailyAttendance.project_id == project_id,
                DailyAttendance.is_deleted == False,
                DailyAttendance.is_absent == False,
            )
            .group_by(
                Worker.worker_id,
                Worker.worker_code,
                Worker.full_name,
                Worker.phone,
                DailyAttendance.labour_role,
            )
            .order_by(total_cost_expr.desc())
            .all()
        )

        workers_list = []
        total_actual_labour = Decimal('0')
        total_actual_hours = 0.0
        total_regular_hours = 0.0
        total_overtime_hours = 0.0
        total_working_days = 0

        for r in worker_rows:
            cost = float(r.total_cost or 0)
            total_actual_labour += Decimal(str(cost))
            total_actual_hours += float(r.total_hours or 0)
            total_regular_hours += float(r.regular_hours or 0)
            total_overtime_hours += float(r.overtime_hours or 0)
            total_working_days += int(r.working_days or 0)
            workers_list.append({
                'worker_code': r.worker_code or '-',
                'worker_name': r.worker_name or '-',
                'phone': r.phone or '-',
                'labour_role': r.labour_role or '-',
                'working_days': int(r.working_days or 0),
                'regular_hours': round(float(r.regular_hours or 0), 2),
                'overtime_hours': round(float(r.overtime_hours or 0), 2),
                'total_hours': round(float(r.total_hours or 0), 2),
                'avg_hourly_rate': round(float(r.avg_hourly_rate or 0), 2),
                'total_cost': round(cost, 2),
                'first_date': r.first_date.isoformat() if r.first_date else None,
                'last_date': r.last_date.isoformat() if r.last_date else None,
            })

        # Requisition summary for the project
        from models.worker_assignment import WorkerAssignment

        req_records = LabourRequisition.query.filter(
            LabourRequisition.project_id == project_id,
            LabourRequisition.is_deleted == False
        ).order_by(LabourRequisition.required_date.desc()).all()

        req_ids = [lr.requisition_id for lr in req_records]

        # Batch: assigned worker count per requisition
        assigned_counts = {}
        if req_ids:
            assign_agg = (
                db.session.query(
                    WorkerAssignment.requisition_id,
                    func.count(WorkerAssignment.assignment_id).label('cnt')
                )
                .filter(
                    WorkerAssignment.requisition_id.in_(req_ids),
                    WorkerAssignment.is_deleted == False
                )
                .group_by(WorkerAssignment.requisition_id)
                .all()
            )
            assigned_counts = {row.requisition_id: int(row.cnt) for row in assign_agg}

        # Batch: attended count, total hours, total cost per requisition
        attendance_agg = {}
        if req_ids:
            attend_rows = (
                db.session.query(
                    DailyAttendance.requisition_id,
                    func.count(DailyAttendance.worker_id.distinct()).label('attended_count'),
                    func.sum(func.coalesce(DailyAttendance.total_hours, 0)).label('total_hours'),
                    func.sum(func.coalesce(DailyAttendance.total_cost, 0)).label('total_cost'),
                )
                .filter(
                    DailyAttendance.requisition_id.in_(req_ids),
                    DailyAttendance.is_deleted == False,
                    DailyAttendance.is_absent == False,
                )
                .group_by(DailyAttendance.requisition_id)
                .all()
            )
            attendance_agg = {row.requisition_id: row for row in attend_rows}

        requisitions_list = []
        for lr in req_records:
            labour_items = lr.labour_items if lr.labour_items else []
            if isinstance(labour_items, str):
                try:
                    labour_items = json.loads(labour_items)
                except Exception:
                    labour_items = []
            skill_summary = ', '.join(
                str(li.get('skill_required') or li.get('labour_role', ''))
                for li in labour_items if isinstance(li, dict)
            ) if labour_items else (lr.skill_required or '-')

            agg = attendance_agg.get(lr.requisition_id)
            requisitions_list.append({
                'requisition_code': lr.requisition_code or '-',
                'site_name': lr.site_name or '-',
                'required_date': lr.required_date.isoformat() if lr.required_date else None,
                'requested_by': lr.requested_by_name or '-',
                'requester_role': lr.requester_role or '-',
                'status': lr.status or '-',
                'assignment_status': lr.assignment_status or '-',
                'skill_summary': skill_summary,
                'workers_requested': int(lr.workers_count or 0),
                'workers_assigned': assigned_counts.get(lr.requisition_id, 0),
                'workers_attended': int(agg.attended_count if agg else 0),
                'approved_by': lr.approved_by_name or '-',
                'approval_date': lr.approval_date.isoformat() if lr.approval_date else None,
                'total_hours': round(float(agg.total_hours if agg else 0), 2),
                'total_cost': round(float(agg.total_cost if agg else 0), 2),
            })

        labour_variance = float(planned_labour_total) - float(total_actual_labour)

        transport_variance = float(planned_transport) - float(actual_transport_total)

        _result = {
            'success': True,
            'boq_id': boq_id,
            'project_id': project_id,
            'project_name': boq.project.project_name if boq.project else '',
            'boq_name': boq.boq_name,
            'transport': {
                'planned': float(planned_transport),
                'actual': float(actual_transport_total),
                'variance': round(transport_variance, 2),
                'variance_pct': round(transport_variance / float(planned_transport) * 100, 2) if planned_transport > 0 else 0,
                'details': transport_details,
            },
            'materials': {
                'planned': round(total_planned_materials, 2),
                'actual': round(total_actual_materials, 2),
                'total_vat': round(total_vat_materials, 2),
                'variance': round(total_planned_materials - total_actual_materials, 2),
                'variance_pct': round((total_planned_materials - total_actual_materials) / total_planned_materials * 100, 2) if total_planned_materials > 0 else 0,
                'details': materials_comparison,
            },
            'labour': {
                'planned': round(float(planned_labour_total), 2),
                'actual': round(float(total_actual_labour), 2),
                'variance': round(labour_variance, 2),
                'variance_pct': round(labour_variance / float(planned_labour_total) * 100, 2) if planned_labour_total > 0 else 0,
                'summary': {
                    'total_workers': len(workers_list),
                    'total_working_days': total_working_days,
                    'total_hours': round(total_actual_hours, 2),
                    'regular_hours': round(total_regular_hours, 2),
                    'overtime_hours': round(total_overtime_hours, 2),
                    'total_requisitions': len(requisitions_list),
                },
                'planned_workers': planned_workers,
                'workers': workers_list,
                'requisitions': requisitions_list,
            },
        }
        # Store in TTL cache (2 min) — profit data is historical, safe to cache briefly
        _profit_report_cache[boq_id] = (_time.time(), _result)
        return jsonify(_result), 200

    except Exception as e:
        log.error(f"Error in get_profit_report: {str(e)}")
        import traceback
        log.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500
