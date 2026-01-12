from flask import request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import joinedload
from sqlalchemy import func, case
from config.db import db
from models.change_request import ChangeRequest
from models.boq import *
from models.project import Project
from models.po_child import POChild
from models.user import User
from config.logging import get_logger
from config.change_request_config import CR_CONFIG
from services.change_request_workflow import workflow_service
from services.negotiable_profit_calculator import negotiable_profit_calculator
from datetime import datetime
from sqlalchemy.orm.attributes import flag_modified
from utils.boq_email_service import BOQEmailService
from utils.admin_viewing_context import get_effective_user_context
from utils.comprehensive_notification_service import notification_service

log = get_logger()


def create_change_request():
    """
    PM/SE creates a change request to add extra materials to BOQ
    POST /api/boq/{boq_id}/change-request

    Request body:
    {
        "boq_id": 123,
        "justification": "Need additional materials for foundation extension",
        "materials": [
            {
                "material_name": "Cement",
                "quantity": 10,
                "unit": "bags",
                "unit_price": 400
            }
        ]
    }
    """
    try:
        data = request.get_json()

        # Get current user (support admin viewing as another role)
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username') or 'User'
        user_role = current_user.get('role_name', 'user')

        # Get effective role (handles admin viewing as PM/SE)
        context = get_effective_user_context()
        effective_role = context.get('effective_role', current_user.get('role', ''))
        actual_role = current_user.get('role', '')

        log.info(f"Create change request - User: {user_name}, actual_role: {actual_role}, effective_role: {effective_role}")

        # Validate input
        boq_id = data.get('boq_id')
        justification = data.get('justification')
        materials = data.get('materials', [])

        if not boq_id:
            return jsonify({"error": "boq_id is required"}), 400

        if not justification or justification.strip() == '':
            return jsonify({"error": "Justification is required"}), 400

        if not materials or len(materials) == 0:
            return jsonify({"error": "At least one material is required"}), 400

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Build material lookup map from BOQ for auto-populating brand/specification
        # Use both material_id and material_name for lookup
        material_lookup_by_id = {}
        material_lookup_by_name = {}
        if boq_details and boq_details.boq_details:
            boq_items = boq_details.boq_details.get('items', [])
            for item_idx, item in enumerate(boq_items):
                for sub_item_idx, sub_item in enumerate(item.get('sub_items', [])):
                    for mat_idx, boq_material in enumerate(sub_item.get('materials', [])):
                        material_data = {
                            'brand': boq_material.get('brand'),
                            'specification': boq_material.get('specification')
                        }

                        # Lookup by master_material_id if exists
                        material_id = boq_material.get('master_material_id')
                        if material_id:
                            material_lookup_by_id[material_id] = material_data

                        # Also generate ID pattern: mat_{boq_id}_{item_idx}_{sub_item_idx}_{mat_idx}
                        generated_id = f"mat_{boq_id}_{item_idx+1}_{sub_item_idx+1}_{mat_idx+1}"
                        material_lookup_by_id[generated_id] = material_data

                        # Lookup by material name (case-insensitive)
                        material_name = boq_material.get('material_name', '').lower().strip()
                        if material_name:
                            material_lookup_by_name[material_name] = material_data

        # Calculate materials total cost
        materials_total_cost = 0.0
        materials_data = []

        for mat in materials:
            quantity = float(mat.get('quantity', 0))
            unit_price = float(mat.get('unit_price', 0))
            total_price = quantity * unit_price
            materials_total_cost += total_price

            # Get brand/specification from request, or lookup from BOQ if missing
            brand = mat.get('brand')
            specification = mat.get('specification')
            master_material_id = mat.get('master_material_id')

            # If brand/spec not provided, lookup from BOQ
            if not brand or not specification:
                boq_mat = None

                # Try lookup by material ID first
                if master_material_id and master_material_id in material_lookup_by_id:
                    boq_mat = material_lookup_by_id[master_material_id]

                # Fallback to lookup by material name
                if not boq_mat:
                    material_name = mat.get('material_name', '').lower().strip()
                    if material_name and material_name in material_lookup_by_name:
                        boq_mat = material_lookup_by_name[material_name]

                # Populate brand/spec from BOQ if found
                if boq_mat:
                    if not brand:
                        brand = boq_mat.get('brand')
                    if not specification:
                        specification = boq_mat.get('specification')

            # Determine if this is a new material (doesn't exist in BOQ masters)
            is_new_material = master_material_id is None

            materials_data.append({
                'material_name': mat.get('material_name'),
                'quantity': quantity,
                'unit': mat.get('unit', 'nos'),
                'unit_price': unit_price,
                'total_price': total_price,
                'master_material_id': master_material_id,  # Optional
                'is_new_material': is_new_material,  # True only if material doesn't exist in system
                'is_extra_cost': False,  # Will be True if PM increases the amount later
                'original_quantity': quantity,  # Store original for comparison
                'original_unit_price': unit_price,  # Store original for comparison
                'original_total_price': total_price,  # Store original for comparison
                'cost_difference': 0.0,  # Difference from original (positive = increased)
                'justification': mat.get('justification', ''),  # Per-material justification
                'reason': mat.get('reason', ''),  # Reason for new material (used in routing logic)
                'brand': brand,  # Brand for materials (from request or BOQ)
                'specification': specification,  # Specification for materials (from request or BOQ)
                'size': mat.get('size')  # Size for materials
            })

        # Calculate already consumed from change requests that reserve material quantities
        # Uses centralized config to prevent over-allocation
        already_consumed = db.session.query(
            db.func.coalesce(db.func.sum(ChangeRequest.materials_total_cost), 0)
        ).filter(
            ChangeRequest.boq_id == boq_id,
            ChangeRequest.is_deleted == False,
            ChangeRequest.status.in_(CR_CONFIG.MATERIAL_CONSUMING_STATUSES)
        ).scalar() or 0.0

        # Calculate negotiable margin analysis
        margin_analysis = negotiable_profit_calculator.calculate_change_request_margin(
            boq_details, materials_total_cost, boq_id, already_consumed
        )

        # Prepare sub_items_data from materials or extra material data
        sub_items_data = []
        if hasattr(g, 'extra_material_data') and g.extra_material_data:
            # Coming from create_extra_material wrapper
            sub_items_data = g.extra_material_data.get('sub_items', [])
        else:
            # Direct API call - convert materials to sub_items format
            for mat in materials:
                # Get brand/specification from request, or lookup from BOQ if missing
                brand = mat.get('brand')
                specification = mat.get('specification')
                master_material_id = mat.get('master_material_id')

                # If brand/spec not provided, lookup from BOQ
                if not brand or not specification:
                    boq_mat = None

                    # Try lookup by material ID first
                    if master_material_id and master_material_id in material_lookup_by_id:
                        boq_mat = material_lookup_by_id[master_material_id]

                    # Fallback to lookup by material name
                    if not boq_mat:
                        material_name = mat.get('material_name', '').lower().strip()
                        if material_name and material_name in material_lookup_by_name:
                            boq_mat = material_lookup_by_name[material_name]

                    # Populate brand/spec from BOQ if found
                    if boq_mat:
                        if not brand:
                            brand = boq_mat.get('brand')
                        if not specification:
                            specification = boq_mat.get('specification')

                quantity = float(mat.get('quantity', 0))
                unit_price = float(mat.get('unit_price', 0))
                total_price = quantity * unit_price

                sub_items_data.append({
                    'sub_item_id': mat.get('sub_item_id'),  # Sub-item ID (INTEGER from boq_sub_items table)
                    'sub_item_name': mat.get('sub_item_name'),  # Sub-item name (e.g., "Protection")
                    'material_name': mat.get('material_name'),  # Material name (e.g., "Bubble Wrap")
                    'quantity': quantity,
                    'unit': mat.get('unit', 'nos'),
                    'unit_price': unit_price,
                    'total_price': total_price,
                    'master_material_id': master_material_id,  # Include material ID from BOQ
                    'is_new_material': mat.get('master_material_id') is None,  # True only if material doesn't exist in system
                    'is_extra_cost': False,  # Will be True if PM increases the amount
                    'original_quantity': quantity,  # Store original for comparison
                    'original_unit_price': unit_price,  # Store original for comparison
                    'original_total_price': total_price,  # Store original for comparison
                    'cost_difference': 0.0,  # Difference from original (positive = increased)
                    'justification': mat.get('justification', ''),  # Per-material justification
                    'reason': mat.get('reason'),
                    'brand': brand,  # Brand for materials (from request or BOQ)
                    'specification': specification,  # Specification for materials (from request or BOQ)
                    'size': mat.get('size')  # Size for materials
                })

        # Get item info from request data or extra_material_data
        item_id = data.get('item_id') or data.get('boq_item_id')
        item_name = data.get('item_name') or data.get('boq_item_name')

        # Fallback to extra_material_data if available
        if not item_id and hasattr(g, 'extra_material_data') and g.extra_material_data:
            item_id = g.extra_material_data.get('item_id')
            item_name = g.extra_material_data.get('item_name', '')

        # If still no item_name, try to get it from the BOQ details
        if not item_name and item_id and boq_details:
            boq_json = boq_details.boq_details or {}
            items = boq_json.get('items', [])
            for itm in items:
                # Check both master_item_id and generated item_id formats
                itm_id = itm.get('master_item_id', '')
                if not itm_id:
                    # Generate the same ID format as in get_assigned_projects
                    itm_idx = items.index(itm)
                    itm_id = f"item_{boq_id}_{itm_idx + 1}"

                if str(itm_id) == str(item_id):
                    item_name = itm.get('item_name', '')
                    break

        # Extract primary sub_item_id from sub_items_data for easier querying
        primary_sub_item_id = None
        if sub_items_data and len(sub_items_data) > 0:
            # Get the first sub_item_id from the array
            first_sub_item = sub_items_data[0]
            raw_sub_item_id = first_sub_item.get('sub_item_id')
            if raw_sub_item_id:
                try:
                    # Convert to integer if it's a number (sub_item_id should be INTEGER from database)
                    if isinstance(raw_sub_item_id, int):
                        primary_sub_item_id = raw_sub_item_id
                    elif isinstance(raw_sub_item_id, str) and raw_sub_item_id.isdigit():
                        primary_sub_item_id = int(raw_sub_item_id)
                    else:
                        log.warning(f"⚠️ sub_item_id has unexpected format: {raw_sub_item_id} (type: {type(raw_sub_item_id)})")
                except (ValueError, TypeError) as e:
                    log.warning(f"❌ Could not parse sub_item_id: {raw_sub_item_id}, error: {e}")
            else:
                log.info("ℹ️ No sub_item_id provided in change request materials")

        # DUPLICATE DETECTION: Check for similar requests within last 30 seconds
        # This prevents accidental double-clicks and form re-submissions
        from datetime import timedelta
        thirty_seconds_ago = datetime.utcnow() - timedelta(seconds=30)

        similar_request = ChangeRequest.query.filter(
            ChangeRequest.boq_id == boq_id,
            ChangeRequest.requested_by_user_id == user_id,
            ChangeRequest.materials_total_cost == materials_total_cost,
            ChangeRequest.created_at >= thirty_seconds_ago,
            ChangeRequest.is_deleted == False
        ).first()

        if similar_request:
            # Check if item_id matches (if both have item_id)
            if item_id and similar_request.item_id and str(item_id) == str(similar_request.item_id):
                log.warning(f"Duplicate change request detected: User {user_id}, BOQ {boq_id}, Cost {materials_total_cost}, CR {similar_request.cr_id}")
                return jsonify({
                    "success": True,
                    "message": "Similar request already exists (duplicate prevented)",
                    "cr_id": similar_request.cr_id,
                    "is_duplicate": True,
                    "materials_total_cost": round(materials_total_cost, 2),
                    "note": "Duplicate request prevented. Using existing request."
                }), 200

        # Determine status based on user role
        role_lower = user_role.lower() if user_role else ''
        if role_lower in ['projectmanager', 'project_manager', 'pm']:
            initial_status = 'pending'
        elif role_lower in ['sitesupervisor', 'site_supervisor', 'ss', 'siteengineer', 'site_engineer', 'se']:
            initial_status = 'pending'
        elif role_lower in ['mep', 'mepsupervisor', 'mep_supervisor']:
            initial_status = 'pending'
        elif role_lower == 'admin':
            initial_status = 'pending'

        log.info(f"Creating change request with status '{initial_status}' for role '{user_role}'")

        # Create change request with role-based status
        # No auto-routing - user must explicitly send for review
        # If admin is viewing as another role, store that role for filtering
        admin_viewing_as = None
        if actual_role.lower() == 'admin' and effective_role.lower() != 'admin':
            admin_viewing_as = effective_role.lower()
            log.info(f"Admin creating request while viewing as {admin_viewing_as}")

        change_request = ChangeRequest(
            boq_id=boq_id,
            project_id=boq.project_id,
            requested_by_user_id=user_id,
            requested_by_name=user_name,
            requested_by_role=user_role,
            request_type='EXTRA_MATERIALS',
            justification=justification,
            status=initial_status,  # Role-based status
            current_approver_role=None,  # Will be set when sent for review
            approval_required_from=None,  # Will be set when sent for review
            item_id=item_id,
            item_name=item_name,
            sub_item_id=primary_sub_item_id,  # Store primary sub_item_id for easier querying
            materials_data=materials_data,
            materials_total_cost=materials_total_cost,
            sub_items_data=sub_items_data  # Add this required field
        )

        # All users create requests in pending status - no auto-send
        # User must explicitly click "Send for Review" button
        db.session.add(change_request)
        db.session.flush()  # Get the cr_id before committing

        # Log successful change request creation with sub_item_id
        log.info(f"✅ Change request CR-{change_request.cr_id} created with sub_item_id={primary_sub_item_id}")
        if primary_sub_item_id:
            log.info(f"   - sub_item_id {primary_sub_item_id} will be saved to change_requests table")
        else:
            log.info(f"   - No sub_item_id provided (this is OK for some change request types)")

        # Add to BOQ History - Track change request creation
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        # Handle existing actions - ensure it's always a list
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

        # Prepare new action for change request creation
        new_action = {
            "role": user_role,
            "type": "change_request_created",
            "sender": user_name,
            "sender_role": user_role,
            "status": "pending",
            "cr_id": change_request.cr_id,
            "item_name": item_name or f"Extra Materials - CR #{change_request.cr_id}",
            "materials_count": len(materials_data),
            "total_cost": materials_total_cost,
            "comments": f"Change request created: {justification[:100]}{'...' if len(justification) > 100 else ''}",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": user_name,
            "sender_user_id": user_id,
            "project_name": project.project_name if project else None,
            "project_id": boq.project_id,
            "justification": justification
        }

        # Append new action
        current_actions.append(new_action)
        log.info(f"Appending change_request_created action to BOQ {boq_id} history for CR {change_request.cr_id}")

        if existing_history:
            # Update existing history
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = user_name
            existing_history.sender = user_name
            existing_history.receiver = "Change Request System"
            existing_history.comments = f"Change request #{change_request.cr_id} created"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=current_actions,
                action_by=user_name,
                boq_status=boq.status,
                sender=user_name,
                receiver="Change Request System",
                comments=f"Change request #{change_request.cr_id} created",
                sender_role=user_role,
                receiver_role='system',
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(boq_history)

        db.session.commit()

        response_message = "Change request created successfully"
        response_status = "pending"
        approval_from = None

        log.info(f"Change request {change_request.cr_id} created by {user_name} for BOQ {boq_id}")

        # Prepare response
        response = {
            "success": True,
            "message": response_message,
            "cr_id": change_request.cr_id,
            "status": response_status,
            "materials_total_cost": round(materials_total_cost, 2),
            "approval_required_from": approval_from,
            "project_name": project.project_name,
            "boq_name": boq.boq_name,
            "negotiable_margin_analysis": margin_analysis,  # Add negotiable margin analysis
            "note": "Request sent for review." if approval_from else "Request created. Click 'Send for Review' to submit to approver."
        }

        return jsonify(response), 201

    except SQLAlchemyError as e:
        db.session.rollback()
        log.error(f"Database error creating change request: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating change request: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


# DEPRECATED: Use workflow_service.check_budget_threshold() instead
# Kept for backward compatibility
def check_budget_threshold(change_request):
    """
    DEPRECATED: Use workflow_service.check_budget_threshold() instead
    Wrapper function for backward compatibility
    """
    return workflow_service.check_budget_threshold(change_request)


def send_for_review(cr_id):
    """
    Send change request for review
    SE → Sends to assigned PM (only that PM)
    PM → Must explicitly choose TD or Estimator via route_to parameter
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_role = current_user.get('role_name', '') or current_user.get('role', '')
        user_role_lower = user_role.lower() if user_role else ''

        # Check if admin is viewing as another role - use effective role for workflow
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing_as = user_context.get('is_admin_viewing', False)
        effective_role_for_workflow = user_context.get('effective_role', user_role_lower)

        log.info(f"User {user_id} attempting to send change request. Role: '{user_role}' (lowercase: '{user_role_lower}'), effective_role: '{effective_role_for_workflow}', is_admin_viewing_as: {is_admin_viewing_as}")

        # --- Get Change Request ---
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # --- Role check ---
        is_admin = user_role_lower == 'admin'
        is_site_engineer = user_role_lower in ['site engineer', 'siteengineer', 'site_engineer']
        if change_request.requested_by_user_id != user_id and not is_admin and not is_site_engineer:
            log.warning(f"User {user_id} ({user_role_lower}) tried to send CR {cr_id} not created by them")
            return jsonify({"error": "You can only send your own requests for review"}), 403

        # --- Validate workflow state ---
        is_valid, error_msg = workflow_service.validate_workflow_state(change_request, 'send')
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        data = request.get_json() or {}
        route_to = data.get('route_to')
        buyer_id = data.get('buyer_id')
        # Use effective role for workflow when admin is viewing as another role
        normalized_role = workflow_service.normalize_role(effective_role_for_workflow if is_admin_viewing_as else user_role_lower)
        log.info(f"send_for_review: normalized_role='{normalized_role}', is_admin_viewing_as={is_admin_viewing_as}, effective_role_for_workflow='{effective_role_for_workflow}'")

        # --- Determine next approver ---
        next_approver = None
        next_approver_id = None
        next_role = None

        if normalized_role in ['siteengineer', 'sitesupervisor', 'site_engineer', 'site_supervisor']:
            # Site Engineer routes to whoever assigned them (PM or MEP)
            # Check the BOQ item's assigned_by_role to determine routing

            assigned_approver_id = None
            assigner_role = None

            project = Project.query.filter_by(project_id=change_request.project_id, is_deleted=False).first()
            if not project:
                return jsonify({"error": "Project not found"}), 404

            # Try to get the assigner info from the BOQ item
            boq_details = BOQDetails.query.filter_by(boq_id=change_request.boq_id, is_deleted=False).first()
            if boq_details and boq_details.boq_details:
                boq_items = boq_details.boq_details.get('items', [])

                # Parse item_id to get the item index (e.g., "item_1" -> index 0)
                item_id = change_request.item_id
                item_index = None
                if item_id:
                    try:
                        # Handle formats like "item_1", "item_2", etc.
                        if item_id.startswith('item_'):
                            item_index = int(item_id.split('_')[1]) - 1
                        else:
                            item_index = int(item_id) - 1
                    except (ValueError, IndexError):
                        item_index = None

                # Find the item and check who assigned it
                if item_index is not None and 0 <= item_index < len(boq_items):
                    item = boq_items[item_index]
                    assigner_role = item.get('assigned_by_role')
                    assigned_approver_id = item.get('assigned_by_pm_user_id')
                    log.info(f"Found item assignment: assigned_by_role={assigner_role}, assigned_by_pm_user_id={assigned_approver_id}")

            # If we couldn't find from BOQ item, check PMAssignSS table
            if not assigned_approver_id:
                from models.pm_assign_ss import PMAssignSS
                assignment = PMAssignSS.query.filter_by(
                    boq_id=change_request.boq_id,
                    assigned_to_se_id=user_id,
                    is_deleted=False
                ).order_by(PMAssignSS.assignment_date.desc()).first()

                if assignment and assignment.assigned_by_pm_id:
                    assigned_approver_id = assignment.assigned_by_pm_id
                    # Look up the user to determine their role
                    assigner_user = User.query.filter_by(user_id=assigned_approver_id, is_deleted=False).first()
                    if assigner_user and assigner_user.role:
                        assigner_role = assigner_user.role.role.lower()
                        log.info(f"Found assignment from PMAssignSS: assigned_by_pm_id={assigned_approver_id}, role={assigner_role}")

            # Determine the correct approver based on who assigned
            if assigner_role and assigner_role.lower() == 'mep':
                # MEP assigned this SE - route to MEP
                next_role = CR_CONFIG.ROLE_MEP
                log.info(f"SE was assigned by MEP, routing to MEP")
            else:
                # PM assigned this SE (or fallback to PM)
                next_role = CR_CONFIG.ROLE_PROJECT_MANAGER
                log.info(f"SE was assigned by PM, routing to PM")

            # Get the specific approver (either from assignment or fallback to project level)
            if assigned_approver_id:
                assigned_approver_user = User.query.filter_by(user_id=assigned_approver_id, is_deleted=False).first()
                if assigned_approver_user:
                    next_approver = assigned_approver_user.full_name or assigned_approver_user.username
                    next_approver_id = assigned_approver_user.user_id
                    log.info(f"Routing CR {cr_id} to {next_role}: {next_approver} (user_id={next_approver_id})")
                else:
                    assigned_approver_id = None  # Reset to trigger fallback

            # Fallback: Get from project level if no specific approver found
            if not assigned_approver_id:
                if next_role == CR_CONFIG.ROLE_MEP:
                    # Get MEP from project
                    mep_ids = project.mep_supervisor_id if isinstance(project.mep_supervisor_id, list) else ([project.mep_supervisor_id] if project.mep_supervisor_id else [])
                    assigned_approver_id = mep_ids[0] if mep_ids else None
                else:
                    # Get PM from project
                    pm_ids = project.user_id if isinstance(project.user_id, list) else ([project.user_id] if project.user_id else [])
                    assigned_approver_id = pm_ids[0] if pm_ids else None

                if not assigned_approver_id:
                    log.error(f"No assigned {next_role} found for Project ID {change_request.project_id}")
                    return jsonify({"error": f"No {next_role.replace('_', ' ').title()} assigned for this project"}), 400

                assigned_approver_user = User.query.filter_by(user_id=assigned_approver_id, is_deleted=False).first()
                if not assigned_approver_user:
                    return jsonify({"error": f"Assigned {next_role.replace('_', ' ').title()} user record not found"}), 400

                next_approver = assigned_approver_user.full_name or assigned_approver_user.username
                next_approver_id = assigned_approver_user.user_id
                log.info(f"Routing CR {cr_id} to {next_role} (fallback): {next_approver} (user_id={next_approver_id})")

        elif normalized_role in ['projectmanager', 'project_manager', 'mep', 'mepsupervisor', 'admin']:
            # PM/MEP routing logic:
            # - Can send to Estimator or Buyer based on route_to parameter
            # - If not specified, defaults based on material type:
            #   - New materials (master_material_id is None) → Default to Estimator
            #   - Existing BOQ materials (all have master_material_id) → Default to Buyer

            # Check if all materials are existing (from BOQ) or if there are new materials
            # Check both materials_data and sub_items_data
            all_materials = list(change_request.materials_data or []) + list(change_request.sub_items_data or [])

            # Get BOQ details to check allocated quantities
            boq_details = BOQDetails.query.filter_by(boq_id=change_request.boq_id, is_deleted=False).first()
            material_boq_quantities = {}
            if boq_details and boq_details.boq_details:
                boq_items = boq_details.boq_details.get('items', [])
                for item_idx, item in enumerate(boq_items):
                    for sub_item_idx, sub_item in enumerate(item.get('sub_items', [])):
                        for mat_idx, boq_material in enumerate(sub_item.get('materials', [])):
                            material_id = f"mat_{change_request.boq_id}_{item_idx+1}_{sub_item_idx+1}_{mat_idx+1}"
                            material_boq_quantities[material_id] = boq_material.get('quantity', 0)

            # Get all existing change requests for this BOQ to calculate already purchased
            existing_requests = ChangeRequest.query.filter(
                ChangeRequest.boq_id == change_request.boq_id,
                ChangeRequest.status != 'rejected',
                ChangeRequest.cr_id != change_request.cr_id,
                ChangeRequest.item_id == change_request.item_id,
                ChangeRequest.is_deleted == False
            ).all()

            # Function to check if a material should be treated as new
            def is_material_new_or_exceeded(mat):
                master_id = mat.get('master_material_id')

                # If no master_material_id, it's definitely a new material
                if master_id is None:
                    return True

                # Check if BOQ quantity is fully consumed/exceeded
                boq_qty = material_boq_quantities.get(master_id, 0)
                if boq_qty == 0:
                    return True  # No BOQ allocation, treat as new

                # Calculate already purchased quantity
                already_purchased = 0
                for req in existing_requests:
                    req_materials = list(req.materials_data or []) + list(req.sub_items_data or [])
                    for req_mat in req_materials:
                        if req_mat.get('master_material_id') == master_id:
                            already_purchased += req_mat.get('quantity', 0)

                # If already purchased >= BOQ quantity, treat as new purchase
                return already_purchased >= boq_qty

            has_new_materials = any(is_material_new_or_exceeded(mat) for mat in all_materials)

            # Determine routing
            if route_to == 'estimator':
                # Explicitly sending to Estimator
                project = Project.query.filter_by(project_id=change_request.project_id, is_deleted=False).first()
                if not project or not project.estimator_id:
                    return jsonify({"error": "No Estimator assigned for this project"}), 400

                # Fetch estimator details from User table
                assigned_estimator = User.query.filter_by(user_id=project.estimator_id, is_deleted=False).first()
                if not assigned_estimator:
                    return jsonify({"error": "Assigned Estimator user record not found"}), 400

                next_role = CR_CONFIG.ROLE_ESTIMATOR
                next_approver = assigned_estimator.full_name or assigned_estimator.username
                next_approver_id = assigned_estimator.user_id
                log.info(f"Routing CR {cr_id} to Estimator: {next_approver} (user_id={next_approver_id}, project_id={change_request.project_id})")

            elif route_to == 'buyer':
                # Explicitly sending to Buyer - require buyer_id selection
                if not buyer_id:
                    return jsonify({
                        "error": "Buyer selection required",
                        "message": "Please select a buyer to assign this request"
                    }), 400

                # Validate buyer exists and has buyer role
                selected_buyer = User.query.filter_by(user_id=buyer_id, is_deleted=False).first()
                if not selected_buyer:
                    return jsonify({"error": "Selected buyer not found"}), 404

                buyer_role = selected_buyer.role.role.lower() if selected_buyer.role else ''
                if buyer_role != 'buyer':
                    return jsonify({"error": "Selected user is not a buyer"}), 400

                next_role = CR_CONFIG.ROLE_BUYER
                next_approver = selected_buyer.full_name or selected_buyer.username
                next_approver_id = selected_buyer.user_id

                # Assign to buyer immediately since PM selected them
                change_request.assigned_to_buyer_user_id = next_approver_id
                change_request.assigned_to_buyer_name = next_approver
                change_request.assigned_to_buyer_date = datetime.utcnow()

                log.info(f"Routing CR {cr_id} directly to Buyer: {next_approver} (user_id={next_approver_id})")

            elif has_new_materials:
                # No route_to specified, has new materials - default to Estimator
                project = Project.query.filter_by(project_id=change_request.project_id, is_deleted=False).first()
                if not project or not project.estimator_id:
                    return jsonify({"error": "No Estimator assigned for this project"}), 400

                assigned_estimator = User.query.filter_by(user_id=project.estimator_id, is_deleted=False).first()
                if not assigned_estimator:
                    return jsonify({"error": "Assigned Estimator user record not found"}), 400

                next_role = CR_CONFIG.ROLE_ESTIMATOR
                next_approver = assigned_estimator.full_name or assigned_estimator.username
                next_approver_id = assigned_estimator.user_id
                log.info(f"Routing CR {cr_id} with NEW materials to Estimator (default): {next_approver}")

            else:
                # No route_to specified, all materials from BOQ - default to Buyer (require buyer_id)
                if not buyer_id:
                    return jsonify({
                        "error": "Buyer selection required",
                        "message": "All materials are from BOQ. Please select a buyer to assign this request"
                    }), 400

                # Validate buyer exists and has buyer role
                selected_buyer = User.query.filter_by(user_id=buyer_id, is_deleted=False).first()
                if not selected_buyer:
                    return jsonify({"error": "Selected buyer not found"}), 404

                buyer_role = selected_buyer.role.role.lower() if selected_buyer.role else ''
                if buyer_role != 'buyer':
                    return jsonify({"error": "Selected user is not a buyer"}), 400

                next_role = CR_CONFIG.ROLE_BUYER
                next_approver = selected_buyer.full_name or selected_buyer.username
                next_approver_id = selected_buyer.user_id

                # Assign to buyer immediately since PM selected them
                change_request.assigned_to_buyer_user_id = next_approver_id
                change_request.assigned_to_buyer_name = next_approver
                change_request.assigned_to_buyer_date = datetime.utcnow()

                log.info(f"Routing CR {cr_id} with EXISTING BOQ materials to Buyer (default): {next_approver} (user_id={next_approver_id})")

        elif is_admin:
            # Admin sends to assigned PM
            next_role = CR_CONFIG.ROLE_PROJECT_MANAGER
            project = Project.query.filter_by(project_id=change_request.project_id, is_deleted=False).first()
            # The project manager is stored in the user_id field (now JSONB array)
            if project and project.user_id:
                pm_ids = project.user_id if isinstance(project.user_id, list) else [project.user_id]
                assigned_pm_id = pm_ids[0] if pm_ids else None
            else:
                assigned_pm_id = None

            if not assigned_pm_id:
                return jsonify({"error": "No Project Manager assigned for this project"}), 400

            assigned_pm_user = User.query.filter_by(user_id=assigned_pm_id, is_deleted=False).first()
            if not assigned_pm_user:
                return jsonify({"error": "Assigned Project Manager user record not found"}), 400

            next_approver = assigned_pm_user.full_name or assigned_pm_user.username
            next_approver_id = assigned_pm_user.user_id

        else:
            log.error(f"Invalid role '{user_role}' attempting to send change request")
            return jsonify({"error": f"Invalid role for sending request: {user_role}. Only Site Engineers, Project Managers, and MEP Supervisors can send requests."}), 403

        # --- Update Change Request ---
        change_request.approval_required_from = next_role
        change_request.current_approver_role = next_role

        # Set appropriate status based on sender role and next role
        if next_role == CR_CONFIG.ROLE_BUYER and next_approver_id:
            # When routing to specific buyer, set status to assigned_to_buyer
            change_request.status = CR_CONFIG.STATUS_ASSIGNED_TO_BUYER
        elif next_role == CR_CONFIG.ROLE_PROJECT_MANAGER and normalized_role in ['siteengineer', 'sitesupervisor', 'site_engineer', 'site_supervisor']:
            # SS/SE sending to PM - set status to send_to_pm
            change_request.status = CR_CONFIG.STATUS_SEND_TO_PM
            # Store the specific PM who should handle this request (for proper routing)
            change_request.assigned_to_pm_user_id = next_approver_id
            change_request.assigned_to_pm_name = next_approver
            change_request.assigned_to_pm_date = datetime.utcnow()
            log.info(f"SS/SE sending CR {cr_id} to PM {next_approver} (user_id={next_approver_id}) - status set to '{CR_CONFIG.STATUS_SEND_TO_PM}'")
        elif next_role == CR_CONFIG.ROLE_MEP and normalized_role in ['siteengineer', 'sitesupervisor', 'site_engineer', 'site_supervisor']:
            # SS/SE sending to MEP - set status to send_to_mep
            change_request.status = CR_CONFIG.STATUS_SEND_TO_MEP
            # Store the specific MEP who should handle this request (using PM fields for MEP as well)
            change_request.assigned_to_pm_user_id = next_approver_id
            change_request.assigned_to_pm_name = next_approver
            change_request.assigned_to_pm_date = datetime.utcnow()
            log.info(f"SS/SE sending CR {cr_id} to MEP {next_approver} (user_id={next_approver_id}) - status set to '{CR_CONFIG.STATUS_SEND_TO_MEP}'")
        else:
            change_request.status = CR_CONFIG.STATUS_UNDER_REVIEW

        change_request.updated_at = datetime.utcnow()

        # --- Log to BOQ History ---
        existing_history = BOQHistory.query.filter_by(boq_id=change_request.boq_id).order_by(BOQHistory.action_date.desc()).first()
        current_actions = []

        if existing_history:
            if isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]

        new_action = {
            "role": user_role,
            "type": "change_request_sent_for_review",
            "sender": current_user.get('full_name') or current_user.get('username'),
            "receiver": next_approver,
            "receiver_user_id": next_approver_id,
            "sender_role": user_role,
            "receiver_role": next_role,
            "status": change_request.status,  # Use the actual status that was set
            "cr_id": cr_id,
            "item_name": change_request.item_name or f"CR #{cr_id}",
            "materials_count": len(change_request.materials_data or []),
            "total_cost": change_request.materials_total_cost,
            "comments": f"Change request sent to {next_approver} for review",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": current_user.get('full_name') or current_user.get('username'),
            "sender_user_id": user_id,
            "project_name": change_request.project.project_name if change_request.project else None,
            "project_id": change_request.project_id
        }

        current_actions.append(new_action)
        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = current_user.get('full_name') or current_user.get('username')
            existing_history.sender = current_user.get('full_name') or current_user.get('username')
            existing_history.receiver = next_approver
            existing_history.comments = f"CR #{cr_id} sent for review"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = current_user.get('full_name') or current_user.get('username')
            existing_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=change_request.boq_id,
                action=current_actions,
                action_by=current_user.get('full_name') or current_user.get('username'),
                boq_status=change_request.boq.status if change_request.boq else 'unknown',
                sender=current_user.get('full_name') or current_user.get('username'),
                receiver=next_approver,
                comments=f"CR #{cr_id} sent for review",
                sender_role=user_role,
                receiver_role=next_role,
                action_date=datetime.utcnow(),
                created_by=current_user.get('full_name') or current_user.get('username')
            )
            db.session.add(boq_history)

        db.session.commit()
        log.info(f"Change request {cr_id} sent for review to {next_approver} ({next_role})")

        # Send notification to next approver
        try:
            if next_approver_id:
                project_name = change_request.project.project_name if change_request.project else 'Unknown Project'
                # Determine if request has new materials (master_material_id is None)
                has_new_materials = any(
                    mat.get('master_material_id') is None
                    for mat in (change_request.materials_data or [])
                )
                notification_service.notify_cr_created(
                    cr_id=cr_id,
                    project_name=project_name,
                    creator_id=user_id,
                    creator_name=current_user.get('full_name') or current_user.get('username') or 'User',
                    creator_role=user_role,
                    recipient_user_ids=[next_approver_id],
                    recipient_role=next_role,
                    request_type=change_request.request_type,
                    has_new_materials=has_new_materials
                )
        except Exception as notif_error:
            log.error(f"Failed to send CR created notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": f"Change request sent to {next_approver} for review",
            "status": CR_CONFIG.STATUS_UNDER_REVIEW,
            "approval_required_from": next_role,
            "next_approver": next_approver
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error sending change request for review: {str(e)}")
        import traceback
        log.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


def get_all_change_requests():
    """
    Get all change requests (filtered by role)
    Supports admin viewing as another role
    Estimator sees requests ≤50k
    TD sees all requests, especially >50k
    PM/SE see their own requests

    Optional query params for pagination (backward compatible):
    - page: Page number (1-indexed), default None (returns all)
    - page_size: Items per page, default 20, max 100
    """
    try:
        # PERFORMANCE: Optional pagination support (backward compatible)
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)  # Cap at 100 items per page

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_role = current_user.get('role_name', '').lower()

        # Get effective role (handles admin viewing as another role)
        context = get_effective_user_context()
        effective_role = context.get('effective_role', user_role)
        actual_role = current_user.get('role', '').lower()
        is_admin_viewing = context.get('is_admin_viewing', False)

        log.info(f"Get all change requests - User: {user_id}, actual_role: {actual_role}, effective_role: {effective_role}, is_admin_viewing: {is_admin_viewing}")

        # Use effective role for filtering
        user_role = effective_role

        # Base query with eager loading to prevent N+1 queries
        # ✅ PERFORMANCE FIX: Load related project and BOQ data upfront (300+ queries → 3)
        query = ChangeRequest.query.options(
            joinedload(ChangeRequest.project),
            joinedload(ChangeRequest.boq)
        ).filter_by(is_deleted=False)

        # Role-based filtering
        # Check if actual role is admin (direct login or viewing as another role)
        # Check both 'role' and 'role_name' fields as they may differ
        actual_user_role = current_user.get('role_name', '').lower() or current_user.get('role', '').lower()

        # Admin viewing as another role should use that role's filters, not admin filters
        # Only direct admin login (not viewing as another role) sees everything
        if actual_user_role == 'admin' and not is_admin_viewing:
            log.info(f"Admin user (direct login) - showing ALL requests (no filtering). actual_role: {actual_user_role}")
            # No filtering applied - admin sees everything
            pass
        elif user_role in ['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']:
            # NEW FLOW: SE sees requests from projects with item-level assignments via pm_assign_ss
            # OR their own requests (to see pending drafts before items are assigned)
            # PURCHASE LIST VIEW: SE only sees requests where requested_by_role is 'siteengineer' and status is 'pending'
            # NEW FLOW: Get projects where SE has item assignments via pm_assign_ss
            from models.pm_assign_ss import PMAssignSS

            # Get unique project IDs where SE has item assignments
            se_assigned_project_ids = db.session.query(PMAssignSS.project_id).filter(
                PMAssignSS.assigned_to_se_id == user_id,
                PMAssignSS.is_deleted == False
            ).distinct().all()
            se_assigned_project_ids = [p[0] for p in se_assigned_project_ids] if se_assigned_project_ids else []

            # SE sees:
            # 1. Requests where requested_by_role is 'siteengineer'/'sitesupervisor' and status is 'pending'
            # 2. Their own requests (to see pending drafts)
            from sqlalchemy import or_, and_

            # Filter for SE: only show pending requests from site engineers
            se_role_filter = and_(
                ChangeRequest.requested_by_role.in_(['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']),
                ChangeRequest.status == 'pending'
            )

            # Filter for approved/completed requests (to show in Accepted/Completed tabs)
            # SE should ONLY see their own approved requests, NOT PM/MEP created requests
            se_approved_status_filter = and_(
                ChangeRequest.status.in_(CR_CONFIG.APPROVED_WORKFLOW_STATUSES),
                ChangeRequest.requested_by_role.in_(['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor'])  # Only SE created requests
            )

            # Admin raised requests as SE role - show to SE assigned to that project
            admin_as_se_filter = and_(
                ChangeRequest.requested_by_role == 'admin',
            )

            if is_admin_viewing:
                # Admin viewing as SE - show ALL requests (no filtering)
                # Admin should see everything when viewing as any role
                pass  # No additional filtering - admin sees everything
            elif se_assigned_project_ids:
                # Regular SE - sees pending requests from SEs in their assigned projects + own requests
                query = query.filter(
                    or_(
                        and_(
                            ChangeRequest.project_id.in_(se_assigned_project_ids),  # Requests from assigned projects
                            se_role_filter  # Only pending requests from site engineers
                        ),
                        and_(
                            ChangeRequest.project_id.in_(se_assigned_project_ids),  # Requests from assigned projects
                            admin_as_se_filter  # Admin raised as SE role
                        ),
                        and_(
                            ChangeRequest.project_id.in_(se_assigned_project_ids),  # Requests from assigned projects
                            se_approved_status_filter  # Approved/completed/rejected requests (SE created only)
                        ),
                        ChangeRequest.requested_by_user_id == user_id  # Own requests
                    )
                )
            else:
                # No item assignments found - show only own requests
                query = query.filter(ChangeRequest.requested_by_user_id == user_id)
        elif user_role in ['projectmanager', 'project_manager']:
            # PM sees:
            # 1. Requests where requested_by_role is 'projectmanager' and status is 'pending' or 'pm_request'
            # 2. Requests with status 'send_to_pm' (sent by SS/SE for PM approval)
            # 3. Their own requests
            # 4. Admin raised requests as PM role
            from sqlalchemy import or_, and_

            # Get projects where this PM is assigned
            pm_projects = Project.query.filter(
                Project.user_id.contains([user_id]),
                Project.is_deleted == False
            ).all()
            pm_project_ids = [p.project_id for p in pm_projects]

            # Filter for PM: show pending/pm_request requests from project managers
            pm_role_filter = and_(
                ChangeRequest.requested_by_role.in_(['projectmanager', 'project_manager', 'pm']),
                ChangeRequest.status.in_(['pending', 'pm_request'])
            )

            # Filter for SS/SE requests sent to THIS specific PM (status = 'send_to_pm' AND assigned_to_pm_user_id = this PM)
            # Only show requests where this PM was specifically assigned via pm_assign_ss
            send_to_pm_filter = and_(
                ChangeRequest.status == CR_CONFIG.STATUS_SEND_TO_PM,
                ChangeRequest.assigned_to_pm_user_id == user_id  # Only show to the assigned PM
            )

            # Filter for approved/completed requests that were assigned to this PM (to show in Accepted/Completed tabs)
            # For SE-originated requests, only show to the PM who was originally assigned
            approved_status_filter = ChangeRequest.status.in_(CR_CONFIG.APPROVED_WORKFLOW_STATUSES)

            # Filter for SE-originated requests that were assigned to this PM and have been processed
            se_originated_assigned_to_this_pm = and_(
                ChangeRequest.assigned_to_pm_user_id == user_id,  # Assigned to this PM
                approved_status_filter
            )

            # Admin raised requests as PM role - show to PM assigned to that project
            admin_as_pm_filter = and_(
                ChangeRequest.requested_by_role == 'admin',
            )

            if is_admin_viewing:
                # Admin viewing as PM - show requests only from projects where a PM is assigned
                # This simulates what a PM would see - only their assigned projects
                from sqlalchemy import not_, and_, or_

                # Get ALL projects that have a PM assigned (any PM)
                all_pm_projects = Project.query.filter(
                    Project.user_id.isnot(None),
                    Project.is_deleted == False
                ).all()
                all_pm_project_ids = [p.project_id for p in all_pm_projects]

                # SS/SE pending drafts (not yet sent to PM) - these should be EXCLUDED
                # Use lower() for case-insensitive comparison (DB has 'siteEngineer', 'SiteEngineer', etc.)
                is_ss_se_pending_draft = and_(
                    func.lower(ChangeRequest.requested_by_role).in_(['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']),
                    ChangeRequest.status == 'pending'
                )

                # Admin/PM created requests (any status) - these should be INCLUDED
                is_admin_or_pm_created = func.lower(ChangeRequest.requested_by_role).in_(['admin', 'projectmanager', 'project_manager', 'pm'])

                # SS/SE requests that are NOT pending (sent for approval) - these should be INCLUDED
                is_ss_se_sent_for_review = and_(
                    func.lower(ChangeRequest.requested_by_role).in_(['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']),
                    ChangeRequest.status != 'pending'
                )
                # Filter: only show requests from projects with PM assigned
                # Include: admin/PM created (any status) OR SS/SE created but sent for review (not pending)
                if all_pm_project_ids:
                    query = query.filter(
                        and_(
                            ChangeRequest.project_id.in_(all_pm_project_ids),
                            or_(
                                is_admin_or_pm_created,  # Admin/PM created requests
                                is_ss_se_sent_for_review  # SS/SE requests sent for review
                            )
                        )
                    )
                else:
                    # No projects with PM, show nothing
                    query = query.filter(ChangeRequest.cr_id == -1)

                log.info(f"Applied filter: include admin/PM created + SS/SE sent for review, from PM-assigned projects")
            elif pm_project_ids:
                # Regular PM - sees requests from their assigned projects
                # IMPORTANT: For SE-originated requests, only show to the PM who was assigned
                # Admin-created requests (any status) from PM's projects
                admin_created_filter = func.lower(ChangeRequest.requested_by_role) == 'admin'

                # PM-originated requests (not from SE) - show to all PMs on project
                pm_originated_approved = and_(
                    approved_status_filter,
                    func.lower(ChangeRequest.requested_by_role).in_(['projectmanager', 'project_manager', 'pm', 'admin']),
                    ChangeRequest.assigned_to_pm_user_id.is_(None)  # Not SE-originated
                )
                # Requests approved by this PM - show all requests this PM has approved
                pm_approved_by_this_user = ChangeRequest.pm_approved_by_user_id == user_id
                query = query.filter(
                    or_(
                        and_(
                            ChangeRequest.project_id.in_(pm_project_ids),  # Requests from assigned projects
                            pm_role_filter  # Pending requests from project managers
                        ),
                        and_(
                            ChangeRequest.project_id.in_(pm_project_ids),  # Requests from assigned projects
                            admin_created_filter  # Admin created requests (any status)
                        ),
                        and_(
                            ChangeRequest.project_id.in_(pm_project_ids),  # Requests from assigned projects
                            send_to_pm_filter  # SS/SE requests sent to THIS PM specifically
                        ),
                        and_(
                            ChangeRequest.project_id.in_(pm_project_ids),  # Requests from assigned projects
                            se_originated_assigned_to_this_pm  # SE-originated requests assigned to this PM
                        ),
                        and_(
                            ChangeRequest.project_id.in_(pm_project_ids),  # Requests from assigned projects
                            pm_originated_approved  # PM/Admin originated approved requests
                        ),
                        pm_approved_by_this_user,  # Requests approved by this PM
                        ChangeRequest.requested_by_user_id == user_id  # Own requests
                    )
                )
            else:
                # No projects assigned, show only own requests
                log.warning(f"PM {user_id} has no assigned projects")
                query = query.filter(ChangeRequest.requested_by_user_id == user_id)

        elif user_role in ['mep', 'mepsupervisor']:
            # MEP sees:
            # 1. Requests where requested_by_role is 'mep'/'mepsupervisor' and status is 'pending'
            # 2. Requests with status 'send_to_mep' (sent by SS/SE for MEP approval)
            # 3. Admin raised requests as MEP role
            # 4. Their own requests
            # 5. Approved/completed requests from their projects
            from sqlalchemy import or_, and_

            # Get projects where this user is the MEP supervisor (mep_supervisor_id field in Project table)
            # Use JSONB contains operator since mep_supervisor_id is a JSONB array
            mep_projects = Project.query.filter(
                Project.mep_supervisor_id.contains([user_id]),
                Project.is_deleted == False
            ).all()
            mep_project_ids = [p.project_id for p in mep_projects]

            log.info(f"Regular MEP {user_id} - has {len(mep_project_ids)} assigned projects")

            # Filter for MEP: only show pending requests from MEP
            mep_role_filter = and_(
                ChangeRequest.requested_by_role.in_(['mep', 'mepsupervisor']),
                ChangeRequest.status == 'pending'
            )

            # Filter for approved/completed requests (to show in Accepted/Completed tabs)
            mep_approved_status_filter = and_(
                ChangeRequest.status.in_(CR_CONFIG.APPROVED_WORKFLOW_STATUSES),
                ChangeRequest.requested_by_role.in_(['mep', 'mepsupervisor'])  # Only MEP created requests
            )

            # Filter for requests sent by SE to THIS specific MEP for approval
            # Only show requests where this MEP was specifically assigned
            se_to_mep_filter = and_(
                ChangeRequest.status == CR_CONFIG.STATUS_SEND_TO_MEP,
                ChangeRequest.current_approver_role == CR_CONFIG.ROLE_MEP,
                ChangeRequest.assigned_to_pm_user_id == user_id  # Only show to the assigned MEP
            )

            # Admin raised requests as MEP role - show to MEP assigned to that project
            admin_as_mep_filter = and_(
                ChangeRequest.requested_by_role == 'admin',
            )

            # Approved/completed requests status filter
            mep_approved_statuses = ChangeRequest.status.in_(CR_CONFIG.MEP_APPROVED_STATUSES)

            # SE-originated requests assigned to this MEP
            se_originated_assigned_to_this_mep = and_(
                ChangeRequest.assigned_to_pm_user_id == user_id,  # Assigned to this MEP
                mep_approved_statuses
            )

            # MEP-originated approved requests (not from SE) - show to all MEPs on project
            mep_originated_approved = and_(
                mep_approved_statuses,
                func.lower(ChangeRequest.requested_by_role).in_(['mep', 'mepsupervisor', 'admin']),
                ChangeRequest.assigned_to_pm_user_id.is_(None)  # Not SE-originated
            )

            if is_admin_viewing:
                # Admin viewing as MEP - show ALL requests (no filtering)
                # Admin should see everything when viewing as any role
                log.info(f"Admin viewing as MEP - showing ALL requests (no filtering)")
                pass  # No additional filtering - admin sees everything
            elif mep_project_ids:
                # Regular MEP - sees pending requests from MEPs + SE requests sent to THIS MEP + approved/completed + own requests
                query = query.filter(
                    or_(
                        and_(
                            ChangeRequest.project_id.in_(mep_project_ids),  # Requests from assigned projects
                            mep_role_filter  # Only pending requests from MEP
                        ),
                        and_(
                            ChangeRequest.project_id.in_(mep_project_ids),  # Requests from assigned projects
                            se_to_mep_filter  # SE sent requests for THIS MEP specifically
                        ),
                        and_(
                            ChangeRequest.project_id.in_(mep_project_ids),  # Requests from assigned projects
                            admin_as_mep_filter  # Admin raised as MEP role
                        ),
                        and_(
                            ChangeRequest.project_id.in_(mep_project_ids),  # Requests from assigned projects
                            se_originated_assigned_to_this_mep  # SE-originated requests assigned to this MEP
                        ),
                        and_(
                            ChangeRequest.project_id.in_(mep_project_ids),  # Requests from assigned projects
                            mep_originated_approved  # MEP/Admin originated approved requests
                        ),
                        ChangeRequest.requested_by_user_id == user_id  # Own requests
                    )
                )
            else:
                # If MEP has no assigned projects, show only their own requests
                log.warning(f"MEP {user_id} has no assigned projects, showing only their own requests")
                query = query.filter(
                    ChangeRequest.requested_by_user_id == user_id  # MEP's own requests only
                )

        elif user_role == 'estimator':
            # Estimator sees:
            # 1. Requests from their assigned projects that need estimator approval
            # 2. Requests they approved (approved_by_user_id = user_id)
            # 3. Completed purchases from their projects (to see pricing history)
            from sqlalchemy import or_, and_

            log.info(f"Estimator filter - user_id: {user_id}, is_admin_viewing: {is_admin_viewing}")

            if is_admin_viewing:
                # Admin viewing as Estimator - show ALL estimator-relevant requests
                # This includes: requests needing estimator approval, send_to_est, approved by any estimator, completed purchases
                log.info(f"Admin viewing as Estimator - showing ALL estimator-relevant requests")
                query = query.filter(
                    or_(
                        ChangeRequest.approval_required_from == 'estimator',  # Pending estimator approval
                        ChangeRequest.status == CR_CONFIG.STATUS_SEND_TO_EST,  # Sent to estimator
                        ChangeRequest.approved_by_user_id.isnot(None),  # Approved by any estimator
                        ChangeRequest.status == 'purchase_completed',  # Completed purchases
                        ChangeRequest.status == 'routed_to_store',  # Materials sent to M2 Store
                        ChangeRequest.status == 'send_to_buyer',  # Sent to buyer after estimator approval
                        ChangeRequest.status == 'pending_td_approval',  # Pending TD approval
                        ChangeRequest.status == 'rejected',  # Rejected requests
                        ChangeRequest.status == 'split_to_sub_crs'  # Split to sub-CRs
                    )
                )
            else:
                # Regular estimator: filter by assigned projects
                estimator_projects = Project.query.filter_by(estimator_id=user_id, is_deleted=False).all()
                estimator_project_ids = [p.project_id for p in estimator_projects]

                log.info(f"Regular Estimator {user_id} - has {len(estimator_project_ids)} assigned projects: {estimator_project_ids}")

                if estimator_project_ids:
                    # Estimator sees requests from their assigned projects only
                    query = query.filter(
                        or_(
                            and_(
                                ChangeRequest.approval_required_from == 'estimator',
                                ChangeRequest.project_id.in_(estimator_project_ids)
                            ),
                            ChangeRequest.approved_by_user_id == user_id,
                            and_(
                                ChangeRequest.status.in_(['purchase_completed', 'routed_to_store']),
                                ChangeRequest.project_id.in_(estimator_project_ids)
                            ),
                            and_(
                                ChangeRequest.status == 'under_review',
                                ChangeRequest.approval_required_from == 'estimator',
                                ChangeRequest.project_id.in_(estimator_project_ids)
                            ),
                            and_(
                                ChangeRequest.status == 'pending_td_approval',
                                ChangeRequest.project_id.in_(estimator_project_ids)
                            )
                        )
                    )
                else:
                    # If estimator has no assigned projects, show only their own requests
                    log.warning(f"Estimator {user_id} has no assigned projects, showing only their own requests")
                    query = query.filter(
                        ChangeRequest.requested_by_user_id == user_id
                    )
        elif user_role in ['technical_director', 'technicaldirector']:
            # TD sees:
            # 1. Requests where approval_required_from = 'technical_director' (pending TD approval)
            # 2. Requests approved by TD that are assigned_to_buyer or send_to_buyer (approved tab)
            # 3. ALL requests that are purchase_completed (completed tab) - regardless of who approved
            # 4. Requests with vendor selection pending TD approval (vendor_selection_status = 'pending_td_approval')
            # 5. Requests with vendor approved by TD (vendor_selection_status = 'approved')
            # 6. Requests rejected by TD (status = 'rejected')
            from sqlalchemy import or_

            # Admin viewing as TD sees same as regular TD (no user-specific filtering needed)
            query = query.filter(
                or_(
                    ChangeRequest.approval_required_from == 'technical_director',  # Pending requests
                    ChangeRequest.td_approved_by_user_id.isnot(None),  # Approved by TD
                    ChangeRequest.status == 'purchase_completed',  # All completed purchases (actual DB value)
                    ChangeRequest.status == 'routed_to_store',  # Materials sent to M2 Store
                    ChangeRequest.status == 'send_to_buyer',  # Send to buyer status
                    ChangeRequest.status == 'rejected',  # Rejected requests
                    ChangeRequest.vendor_selection_status == 'pending_td_approval',  # Vendor approval pending
                    ChangeRequest.vendor_approved_by_td_id.isnot(None)  # Vendor approved by TD
                )
            )
        elif user_role == 'buyer':
            # Buyer sees:
            # 1. Requests pending buyer review (status='under_review' AND approval_required_from='buyer')
            # 2. Requests assigned to buyer (status='assigned_to_buyer')
            # 3. Requests buyer has completed (status='purchase_complete')
            # 4. Sub-CRs pending TD approval (vendor_selection_status='pending_td_approval')
            # 5. Sub-CRs that are vendor approved (vendor_selection_status='approved')
            from sqlalchemy import or_, and_
            query = query.filter(
                or_(
                    and_(
                        ChangeRequest.status == CR_CONFIG.STATUS_UNDER_REVIEW,
                        ChangeRequest.approval_required_from == 'buyer'
                    ),
                    ChangeRequest.status == CR_CONFIG.STATUS_ASSIGNED_TO_BUYER,
                    ChangeRequest.status == CR_CONFIG.STATUS_PURCHASE_COMPLETE,
                    and_(
                        ChangeRequest.is_sub_cr == True,
                        ChangeRequest.assigned_to_buyer_user_id == user_id,
                        ChangeRequest.vendor_selection_status.in_(['pending_td_approval', 'approved'])
                    )
                )
            )
        elif user_role == 'admin':
            # Admin sees all
            pass
        else:
            # Other roles see nothing
            return jsonify({"success": True, "data": []}), 200

        # Execute query with optional pagination
        ordered_query = query.order_by(ChangeRequest.created_at.desc())

        # PERFORMANCE: Apply pagination if requested, otherwise return all (backward compatible)
        if page is not None:
            total_count = ordered_query.count()
            offset = (page - 1) * page_size
            change_requests = ordered_query.offset(offset).limit(page_size).all()
            log.info(f"📊 Processing page {page} ({len(change_requests)}/{total_count} CRs) for user {user_id}")
        else:
            # PERFORMANCE: Default limit when no pagination to prevent loading huge datasets
            change_requests = ordered_query.limit(200).all()
            total_count = len(change_requests)

        # 🔍 DEBUG: Log what we're returning for buyer role
        if user_role == 'buyer':
            log.info(f"=== BUYER QUERY DEBUG ===")
            log.info(f"Total CRs returned: {len(change_requests)}")
            sub_crs = [cr for cr in change_requests if cr.is_sub_cr]
            log.info(f"Sub-CRs in results: {len(sub_crs)}")
            for cr in sub_crs:
                log.info(f"  Sub-CR {cr.get_formatted_cr_id()}: status={cr.status}, vendor_selection_status={cr.vendor_selection_status}, assigned_to_buyer={cr.assigned_to_buyer_user_id}")

        # Overhead tracking columns removed - negotiable margin calculated on-the-fly

        # PERFORMANCE: Batch load BOQ details for enriching materials_total_cost
        # This prevents N+1 queries when SE-created requests have 0 cost
        boq_ids_needing_enrichment = set()
        for cr in change_requests:
            if (not cr.materials_total_cost or cr.materials_total_cost == 0) and cr.boq_id:
                boq_ids_needing_enrichment.add(cr.boq_id)

        boq_details_map = {}
        if boq_ids_needing_enrichment:
            boq_details_list = BOQDetails.query.filter(
                BOQDetails.boq_id.in_(list(boq_ids_needing_enrichment)),
                BOQDetails.is_deleted == False
            ).all()
            boq_details_map = {bd.boq_id: bd for bd in boq_details_list}

        # Convert to dict with project and BOQ info
        result = []
        for cr in change_requests:
            cr_dict = cr.to_dict()

            # Add project name (no query - data already loaded via joinedload)
            if cr.project:
                cr_dict['project_name'] = cr.project.project_name
                cr_dict['project_code'] = cr.project.project_code
                cr_dict['project_location'] = cr.project.location
                cr_dict['project_client'] = cr.project.client
                cr_dict['area'] = cr.project.area
                # Add PM assignment status (user_id indicates PM is assigned to project)
                cr_dict['pm_assigned'] = bool(cr.project.user_id)

            # Add BOQ name and status (no query - data already loaded via joinedload)
            if cr.boq:
                cr_dict['boq_name'] = cr.boq.boq_name
                cr_dict['boq_status'] = cr.boq.status

            # Enrich materials_total_cost if it's 0 (SE-created requests have no prices)
            # This calculates the cost from BOQ prices for display in cards
            if (not cr_dict.get('materials_total_cost') or cr_dict.get('materials_total_cost') == 0) and cr.boq_id:
                try:
                    # Use batch-loaded BOQ details (no N+1 query)
                    boq_details = boq_details_map.get(cr.boq_id)
                    if boq_details and boq_details.boq_details:
                        # Build material price lookup from BOQ
                        material_prices = {}
                        boq_items = boq_details.boq_details.get('items', [])
                        for item_idx, item in enumerate(boq_items):
                            for sub_item_idx, sub_item in enumerate(item.get('sub_items', [])):
                                for mat_idx, boq_material in enumerate(sub_item.get('materials', [])):
                                    material_id = f"mat_{cr.boq_id}_{item_idx+1}_{sub_item_idx+1}_{mat_idx+1}"
                                    material_prices[material_id] = boq_material.get('unit_price', 0)
                                    # Also store by material name for fallback lookup
                                    mat_name = boq_material.get('material_name', '').lower().strip()
                                    if mat_name:
                                        material_prices[f"name:{mat_name}"] = boq_material.get('unit_price', 0)

                        # Calculate total cost from materials
                        total_cost = 0.0
                        for mat in cr_dict.get('materials_data', []):
                            try:
                                quantity = float(mat.get('quantity', 0) or 0)
                                unit_price = float(mat.get('unit_price', 0) or 0)
                            except (ValueError, TypeError):
                                quantity = 0
                                unit_price = 0

                            # If unit_price is 0, try to get from BOQ lookup
                            if not unit_price:
                                mat_id = mat.get('master_material_id')
                                if mat_id and mat_id in material_prices:
                                    unit_price = float(material_prices[mat_id] or 0)
                                else:
                                    # Fallback to name lookup
                                    mat_name = mat.get('material_name', '').lower().strip()
                                    if mat_name and f"name:{mat_name}" in material_prices:
                                        unit_price = float(material_prices[f"name:{mat_name}"] or 0)

                            total_cost += quantity * unit_price

                        # Also check sub_items_data if materials_data total is 0
                        if total_cost == 0:
                            for sub in cr_dict.get('sub_items_data', []):
                                try:
                                    quantity = float(sub.get('quantity', 0) or 0)
                                    unit_price = float(sub.get('unit_price', 0) or 0)
                                except (ValueError, TypeError):
                                    quantity = 0
                                    unit_price = 0

                                if not unit_price:
                                    mat_id = sub.get('master_material_id')
                                    if mat_id and mat_id in material_prices:
                                        unit_price = float(material_prices[mat_id] or 0)
                                    else:
                                        # Fallback to name lookup (consistent with materials_data)
                                        mat_name = sub.get('material_name', '').lower().strip()
                                        if mat_name and f"name:{mat_name}" in material_prices:
                                            unit_price = float(material_prices[f"name:{mat_name}"] or 0)

                                total_cost += quantity * unit_price

                        if total_cost > 0:
                            cr_dict['materials_total_cost'] = round(total_cost, 2)
                except Exception as e:
                    log.error(f"Failed to enrich materials_total_cost for CR {cr.cr_id}: {e}")
                    # Continue processing - don't crash the whole request

            # Overhead analysis removed - columns dropped from database
            # Negotiable margin is now calculated on-the-fly by negotiable_profit_calculator

            # Skip material lookup - master_material_id values like 'mat_198_1_2'
            # are not database IDs but sub_item identifiers

            # Add POChildren data for this change request (for PM/SE/EST/MEP visibility) with eager loading
            po_children = POChild.query.options(
                joinedload(POChild.vendor)  # Eager load vendor relationship
            ).filter_by(
                parent_cr_id=cr.cr_id,
                is_deleted=False
            ).all()

            if po_children:
                cr_dict['po_children'] = [{
                    'id': pc.id,
                    'formatted_id': pc.get_formatted_id(),
                    'suffix': pc.suffix,
                    'vendor_id': pc.vendor_id,
                    'vendor_name': pc.vendor_name,
                    'status': pc.status,
                    'vendor_selection_status': pc.vendor_selection_status,
                    'materials_count': len(pc.materials_data) if pc.materials_data else 0,
                    'materials_total_cost': round(pc.materials_total_cost, 2) if pc.materials_total_cost else 0,
                    'vendor_email_sent': pc.vendor_email_sent,
                    'purchase_completion_date': pc.purchase_completion_date.isoformat() if pc.purchase_completion_date else None
                } for pc in po_children]
                cr_dict['has_po_children'] = True
                cr_dict['po_children_count'] = len(po_children)
            else:
                cr_dict['po_children'] = []
                cr_dict['has_po_children'] = False
                cr_dict['po_children_count'] = 0

            result.append(cr_dict)

        # PERFORMANCE: Return pagination metadata when paginated
        response = {
            "success": True,
            "data": result,
            "count": len(result)
        }

        if page is not None:
            # Add pagination metadata
            total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
            response["pagination"] = {
                "page": page,
                "page_size": page_size,
                "total_count": total_count,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }

        return jsonify(response), 200

    except Exception as e:
        log.error(f"Error fetching change requests: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def get_change_request_by_id(cr_id):
    """Get specific change request by ID with full details"""
    try:
        # ✅ PERFORMANCE FIX: Eager load project and BOQ to prevent N+1 queries
        change_request = ChangeRequest.query.options(
            joinedload(ChangeRequest.project),
            joinedload(ChangeRequest.boq)
        ).filter_by(cr_id=cr_id, is_deleted=False).first()

        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # Convert to dict
        result = change_request.to_dict()

        # Add project and BOQ details
        if change_request.project:
            result['project_name'] = change_request.project.project_name
            result['project_code'] = change_request.project.project_code
            result['project_location'] = change_request.project.location
            result['project_client'] = change_request.project.client

        if change_request.boq:
            result['boq_name'] = change_request.boq.boq_name
            result['boq_status'] = change_request.boq.status

        # Calculate negotiable margin analysis and enrich with BOQ prices
        if change_request.boq:
            boq_details = BOQDetails.query.filter_by(boq_id=change_request.boq_id, is_deleted=False).first()
            if boq_details:
                # Build material lookup map for BOQ quantities AND unit prices
                # This enriches SE-created requests that were saved with unit_price=0
                material_boq_data = {}
                if boq_details.boq_details:
                    boq_items = boq_details.boq_details.get('items', [])
                    for item_idx, item in enumerate(boq_items):
                        for sub_item_idx, sub_item in enumerate(item.get('sub_items', [])):
                            for mat_idx, boq_material in enumerate(sub_item.get('materials', [])):
                                material_id = f"mat_{change_request.boq_id}_{item_idx+1}_{sub_item_idx+1}_{mat_idx+1}"
                                material_boq_data[material_id] = {
                                    'quantity': boq_material.get('quantity', 0),
                                    'unit': boq_material.get('unit', 'nos'),
                                    'unit_price': boq_material.get('unit_price', 0)
                                }

                # Enrich materials_data with BOQ prices if stored value is 0
                if result.get('materials_data'):
                    for material in result['materials_data']:
                        material_id = material.get('master_material_id')
                        if material_id and material_id in material_boq_data:
                            boq_data = material_boq_data[material_id]
                            material['original_boq_quantity'] = boq_data['quantity']
                            if not material.get('unit_price') or material.get('unit_price') == 0:
                                material['unit_price'] = boq_data.get('unit_price', 0)
                                material['total_price'] = material.get('quantity', 0) * material.get('unit_price', 0)

                # Enrich sub_items_data with BOQ prices if stored value is 0
                if result.get('sub_items_data'):
                    for sub_item in result['sub_items_data']:
                        material_id = sub_item.get('master_material_id')
                        if material_id and material_id in material_boq_data:
                            boq_data = material_boq_data[material_id]
                            sub_item['original_boq_quantity'] = boq_data['quantity']
                            if not sub_item.get('unit_price') or sub_item.get('unit_price') == 0:
                                sub_item['unit_price'] = boq_data.get('unit_price', 0)
                                sub_item['total_price'] = sub_item.get('quantity', 0) * sub_item.get('unit_price', 0)

                # ALWAYS recalculate materials_total_cost from enriched materials data
                # Frontend uses: sub_items_data || materials_data (prefers sub_items_data)
                # We must match the same logic to ensure displayed total matches margin calculation
                displayed_total_cost = 0.0

                # First try sub_items_data (frontend's preferred source)
                sub_items = result.get('sub_items_data', [])
                if sub_items and len(sub_items) > 0:
                    for sub in sub_items:
                        displayed_total_cost += sub.get('total_price', 0) or (sub.get('quantity', 0) * sub.get('unit_price', 0))

                # Fallback to materials_data if sub_items_data is empty
                if displayed_total_cost == 0:
                    for mat in result.get('materials_data', []):
                        displayed_total_cost += mat.get('total_price', 0) or (mat.get('quantity', 0) * mat.get('unit_price', 0))

                # Update result with the calculated total
                if displayed_total_cost > 0:
                    result['materials_total_cost'] = round(displayed_total_cost, 2)

                # Calculate already consumed from OTHER CRs (exclude current CR)
                # Uses centralized config to prevent over-allocation
                already_consumed = db.session.query(
                    db.func.coalesce(db.func.sum(ChangeRequest.materials_total_cost), 0)
                ).filter(
                    ChangeRequest.boq_id == change_request.boq_id,
                    ChangeRequest.cr_id != cr_id,  # Exclude current CR
                    ChangeRequest.is_deleted == False,
                    ChangeRequest.status.in_(CR_CONFIG.MATERIAL_CONSUMING_STATUSES)
                ).scalar() or 0.0

                # Calculate negotiable margin analysis using the DISPLAYED total cost
                # This ensures "This Request" value matches the materials table total
                margin_total = displayed_total_cost if displayed_total_cost > 0 else (change_request.materials_total_cost or 0)
                margin_analysis = negotiable_profit_calculator.calculate_change_request_margin(
                    boq_details, margin_total, change_request.boq_id, already_consumed
                )

                if margin_analysis:
                    result['negotiable_margin_analysis'] = margin_analysis

                # Add actual_profit and negotiable_margin from BOQ summary
                if boq_details.boq_details and isinstance(boq_details.boq_details, dict):
                    summary = boq_details.boq_details.get('summary', {})
                    result['actual_profit'] = summary.get('actual_profit', 0)
                    result['negotiable_margin'] = summary.get('negotiable_margin', 0)
                    result['planned_profit'] = summary.get('planned_profit', 0)
                    result['total_cost'] = boq_details.total_cost

        # Skip material lookup - master_material_id values like 'mat_198_1_2'
        # are not database IDs but sub_item identifiers

        return jsonify({
            "success": True,
            "data": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching change request {cr_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


def approve_change_request(cr_id):
    """
    Approve change request (Estimator/TD)
    POST /api/change-request/{cr_id}/approve
    {
        "comments": "Approved."
    }
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        approver_id = current_user.get('user_id')
        approver_name = current_user.get('full_name') or current_user.get('username') or 'User'
        approver_role = current_user.get('role_name', '').lower()

        # Get effective user context (handles admin viewing as another role)
        user_context = get_effective_user_context()
        effective_role = user_context.get('effective_role', approver_role)
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # When admin is viewing as another role, use the effective role as the approver role
        if is_admin_viewing:
            approver_role = effective_role

        # Get change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # Check if already in final state
        if change_request.status in ['approved', 'rejected']:
            return jsonify({"error": f"Change request already {change_request.status}"}), 400

        # Normalize role for consistent comparison
        normalized_role = workflow_service.normalize_role(approver_role)

        # Admin has full approval authority (like TD) - but only when NOT viewing as another role
        is_admin = (current_user.get('role_name', '').lower() in ['admin'] or normalized_role == 'admin') and not is_admin_viewing

        log.info(f"APPROVAL DEBUG - CR {cr_id}: approver_role={approver_role}, normalized_role={normalized_role}, is_admin={is_admin}, is_admin_viewing={is_admin_viewing}, CR status={change_request.status}, approval_required_from={change_request.approval_required_from}")

        # PM can approve requests that are under_review or send_to_pm from SE
        if normalized_role in ['projectmanager'] and change_request.status in [CR_CONFIG.STATUS_UNDER_REVIEW, CR_CONFIG.STATUS_SEND_TO_PM]:
            # PM can approve requests from Site Engineers
            if change_request.requested_by_role and 'site' in change_request.requested_by_role.lower():
                # This is a valid PM approval scenario
                pass
            elif change_request.approval_required_from == 'project_manager':
                # This is explicitly assigned to PM
                pass
            elif change_request.status == CR_CONFIG.STATUS_SEND_TO_PM:
                # SS/SE sent request to PM for approval
                pass
            else:
                return jsonify({"error": f"PM cannot approve this request. Current approver: {change_request.approval_required_from}"}), 403
        # MEP can approve requests sent to them
        elif normalized_role in ['mep', 'mepsupervisor'] and change_request.status in [CR_CONFIG.STATUS_UNDER_REVIEW, CR_CONFIG.STATUS_SEND_TO_PM, CR_CONFIG.STATUS_SEND_TO_MEP]:
            # MEP can approve requests from their assigned projects
            pass
        # Estimator can approve requests assigned to them
        elif normalized_role == 'estimator':
            # Admin viewing as estimator can approve any request with status send_to_est
            # Regular estimator can only approve requests assigned to estimator role
            if not is_admin_viewing:
                # Regular estimator validation
                if change_request.approval_required_from != 'estimator':
                    return jsonify({"error": "You can only approve requests assigned to you for approval"}), 403
            else:
                # Admin viewing as estimator - allow if status is send_to_est
                if change_request.status != CR_CONFIG.STATUS_SEND_TO_EST:
                    return jsonify({"error": "This request is not in send_to_est status"}), 403
        # Admin can approve any request
        elif is_admin:
            pass
        else:
            # Check if request is under review for other roles
            if change_request.status not in [CR_CONFIG.STATUS_UNDER_REVIEW, CR_CONFIG.STATUS_APPROVED_BY_PM, CR_CONFIG.STATUS_APPROVED_BY_TD, CR_CONFIG.STATUS_SEND_TO_PM, CR_CONFIG.STATUS_SEND_TO_MEP]:
                return jsonify({"error": "Request must be sent for review first"}), 400

            # Validate workflow state
            is_valid, error_msg = workflow_service.validate_workflow_state(change_request, 'approve')
            if not is_valid:
                return jsonify({"error": error_msg}), 400

            # Check if user has permission to approve using workflow service
            required_approver = change_request.approval_required_from
            if not workflow_service.can_approve(approver_role, required_approver):
                return jsonify({"error": f"You don't have permission to approve this request. Required: {required_approver}, Your role: {approver_role}"}), 403

        # Get request data
        data = request.get_json() or {}
        comments = data.get('comments', '')
        selected_buyer_id = data.get('buyer_id')  # Required when PM approves external buy

        # Multi-stage approval logic
        if normalized_role in ['projectmanager', 'mep', 'mepsupervisor'] or is_admin:
            # PM/MEP/Admin approves - route based on material type
            change_request.pm_approved_by_user_id = approver_id
            change_request.pm_approved_by_name = approver_name
            change_request.pm_approval_date = datetime.utcnow()

            # Check if all materials are existing (external buy)
            has_new_materials = any(mat.get('master_material_id') is None for mat in (change_request.materials_data or []))

            if has_new_materials:
                # Has NEW materials → Route to Estimator for pricing
                change_request.status = CR_CONFIG.STATUS_SEND_TO_EST  # PM approved, send to estimator
                log.info(f"{approver_role} approving CR {cr_id} - routing to estimator")

                project = Project.query.filter_by(project_id=change_request.project_id, is_deleted=False).first()
                if not project or not project.estimator_id:
                    return jsonify({"error": "No Estimator assigned for this project"}), 400

                # Fetch estimator details from User table
                assigned_estimator = User.query.filter_by(user_id=project.estimator_id, is_deleted=False).first()
                if not assigned_estimator:
                    return jsonify({"error": "Assigned Estimator user record not found"}), 400

                next_role = CR_CONFIG.ROLE_ESTIMATOR
                next_approver = assigned_estimator.full_name or assigned_estimator.username
                next_approver_id = assigned_estimator.user_id
                log.info(f"PM approved CR {cr_id} with NEW materials → Routing to Estimator: {next_approver} (user_id={next_approver_id})")
            else:
                # All materials are existing (external buy) → PM MUST select a Buyer
                if not selected_buyer_id:
                    return jsonify({
                        "error": "Buyer selection required",
                        "message": "Please select a buyer to assign this external buy request"
                    }), 400

                # Validate buyer exists and has buyer role
                selected_buyer = User.query.filter_by(user_id=selected_buyer_id, is_deleted=False).first()
                if not selected_buyer:
                    return jsonify({"error": "Selected buyer not found"}), 404

                buyer_role = selected_buyer.role.role.lower() if selected_buyer.role else ''
                if buyer_role != 'buyer':
                    return jsonify({"error": "Selected user is not a buyer"}), 400

                # Set status to send_to_buyer when sending to buyer
                change_request.status = CR_CONFIG.STATUS_SEND_TO_BUYER

                next_role = CR_CONFIG.ROLE_BUYER
                next_approver = selected_buyer.full_name or selected_buyer.username
                next_approver_id = selected_buyer.user_id

                # Assign to buyer immediately since PM selected them
                change_request.assigned_to_buyer_user_id = next_approver_id
                change_request.assigned_to_buyer_name = next_approver
                change_request.assigned_to_buyer_date = datetime.utcnow()


            change_request.approval_required_from = next_role
            change_request.current_approver_role = next_role

            # Add to BOQ History - PM Approval
            existing_history = BOQHistory.query.filter_by(boq_id=change_request.boq_id).order_by(BOQHistory.action_date.desc()).first()

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
                "role": "project_manager",
                "type": "change_request_approved_by_pm",
                "sender": approver_name,
                "receiver": next_approver,
                "receiver_user_id": next_approver_id,
                "sender_role": "project_manager",
                "receiver_role": next_role,
                "status": CR_CONFIG.STATUS_APPROVED_BY_PM,
                "cr_id": cr_id,
                "item_name": change_request.item_name or f"CR #{cr_id}",
                "materials_count": len(change_request.materials_data) if change_request.materials_data else 0,
                "total_cost": change_request.materials_total_cost,
                "comments": f"PM approved. Routed to {next_approver} for review",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": approver_name,
                "sender_user_id": approver_id,
                "project_name": change_request.project.project_name if change_request.project else None,
                "project_id": change_request.project_id
            }

            current_actions.append(new_action)
            log.info(f"Appending change_request_approved_by_pm action to BOQ {change_request.boq_id} history")

            if existing_history:
                existing_history.action = current_actions
                flag_modified(existing_history, "action")
                existing_history.action_by = approver_name
                existing_history.sender = approver_name
                existing_history.receiver = next_approver
                existing_history.comments = f"CR #{cr_id} approved by PM"
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = approver_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                boq_history = BOQHistory(
                    boq_id=change_request.boq_id,
                    action=current_actions,
                    action_by=approver_name,
                    boq_status=change_request.boq.status if change_request.boq else 'unknown',
                    sender=approver_name,
                    receiver=next_approver,
                    comments=f"CR #{cr_id} approved by PM",
                    sender_role='project_manager',
                    receiver_role=next_role,
                    action_date=datetime.utcnow(),
                    created_by=approver_name
                )
                db.session.add(boq_history)

            db.session.commit()

            # Send notification to next approver
            try:
                if next_approver_id:
                    project_name = change_request.project.project_name if change_request.project else 'Unknown Project'
                    notification_service.notify_cr_approved(
                        cr_id=cr_id,
                        project_name=project_name,
                        approver_id=approver_id,
                        approver_name=approver_name,
                        approver_role='project_manager',
                        next_user_ids=[next_approver_id],
                        next_role=next_role
                    )
            except Exception as notif_error:
                log.error(f"Failed to send CR approval notification: {notif_error}")

            return jsonify({
                "success": True,
                "message": f"Approved by PM. Automatically forwarded to {next_approver} for review",
                "status": change_request.status,  # Return actual status (send_to_est or send_to_buyer)
                "next_approver": next_approver
            }), 200

        elif normalized_role in ['technicaldirector', 'technical_director']:
            # TD approves - Final approval (simplified linear workflow)
            change_request.td_approved_by_user_id = approver_id
            change_request.td_approved_by_name = approver_name
            change_request.td_approval_date = datetime.utcnow()
            change_request.status = CR_CONFIG.STATUS_PURCHASE_COMPLETE  # Mark as complete
            change_request.approval_required_from = None  # No further approval needed
            change_request.current_approver_role = None
            change_request.updated_at = datetime.utcnow()

            log.info(f"TD {approver_name} gave final approval for CR {cr_id} - Change request complete")

            # Add to BOQ History - TD Approval
            existing_history = BOQHistory.query.filter_by(boq_id=change_request.boq_id).order_by(BOQHistory.action_date.desc()).first()

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
                "type": "change_request_approved_by_td",
                "sender": approver_name,
                "receiver": None,  # No next receiver - final approval
                "sender_role": "technical_director",
                "receiver_role": None,
                "status": CR_CONFIG.STATUS_PURCHASE_COMPLETE,
                "cr_id": cr_id,
                "item_name": change_request.item_name or f"CR #{cr_id}",
                "materials_count": len(change_request.materials_data) if change_request.materials_data else 0,
                "total_cost": change_request.materials_total_cost,
                "comments": f"TD gave final approval. Change request completed.",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": approver_name,
                "sender_user_id": approver_id,
                "project_name": change_request.project.project_name if change_request.project else None,
                "project_id": change_request.project_id
            }

            current_actions.append(new_action)
            log.info(f"Appending change_request_approved_by_td action to BOQ {change_request.boq_id} history")

            if existing_history:
                existing_history.action = current_actions
                flag_modified(existing_history, "action")
                existing_history.action_by = approver_name
                existing_history.sender = approver_name
                existing_history.receiver = None  # Final approval
                existing_history.comments = f"CR #{cr_id} final approval by TD"
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = approver_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                boq_history = BOQHistory(
                    boq_id=change_request.boq_id,
                    action=current_actions,
                    action_by=approver_name,
                    boq_status=change_request.boq.status if change_request.boq else 'unknown',
                    sender=approver_name,
                    receiver=None,  # Final approval
                    comments=f"CR #{cr_id} final approval by TD",
                    sender_role='technical_director',
                    receiver_role=None,
                    action_date=datetime.utcnow(),
                    created_by=approver_name
                )
                db.session.add(boq_history)

            db.session.commit()

            log.info(f"TD gave final approval for CR {cr_id}")

            # Send notification to CR creator about final approval
            try:
                if change_request.requested_by_user_id:
                    project_name = change_request.project.project_name if change_request.project else 'Unknown Project'
                    notification_service.notify_cr_approved(
                        cr_id=cr_id,
                        project_name=project_name,
                        approver_id=approver_id,
                        approver_name=approver_name,
                        approver_role='technical_director',
                        next_user_ids=[change_request.requested_by_user_id],
                        next_role='creator'
                    )
            except Exception as notif_error:
                log.error(f"Failed to send CR final approval notification: {notif_error}")

            return jsonify({
                "success": True,
                "message": "Final approval by TD. Change request completed.",
                "status": CR_CONFIG.STATUS_PURCHASE_COMPLETE,
                "cr_id": cr_id
            }), 200

        elif normalized_role == 'estimator':
            # Estimator approves - change status to send_to_buyer
            log.info(f"ESTIMATOR APPROVAL BLOCK - CR {cr_id}, approver: {approver_name}, is_admin_viewing: {is_admin_viewing}, current status: {change_request.status}")
            change_request.approved_by_user_id = approver_id
            change_request.approved_by_name = approver_name
            change_request.approval_date = datetime.utcnow()
            change_request.status = CR_CONFIG.STATUS_SEND_TO_BUYER
            change_request.approval_required_from = CR_CONFIG.ROLE_BUYER
            change_request.current_approver_role = CR_CONFIG.ROLE_BUYER
            change_request.updated_at = datetime.utcnow()
            log.info(f"ESTIMATOR APPROVAL - Changed status to send_to_buyer for CR {cr_id}")

            # Update materials with pricing if estimator provided updated prices
            updated_materials = data.get('materials_data')
            if updated_materials:
                # Recalculate total cost from updated materials
                total_cost = sum(mat.get('total_price', 0) or (mat.get('quantity', 0) * mat.get('unit_price', 0)) for mat in updated_materials)

                change_request.materials_data = updated_materials
                change_request.materials_total_cost = total_cost
                flag_modified(change_request, "materials_data")

                log.info(f"Estimator updated materials pricing for CR {cr_id}. New total: {total_cost}")

            # Get buyer role_id
            from models.role import Role
            buyer_role = Role.query.filter_by(role='buyer', is_deleted=False).first()

            # Get buyer in priority order: 1) selected by user, 2) project buyer, 3) first available buyer
            buyer = None

            # Priority 1: User selected a specific buyer
            if selected_buyer_id:
                buyer = User.query.filter_by(user_id=selected_buyer_id, is_deleted=False).first()
                # Verify the user is actually a buyer
                if buyer and buyer_role and buyer.role_id == buyer_role.role_id:
                    log.info(f"Estimator selected buyer {buyer.full_name} (ID: {buyer.user_id}) for CR {cr_id}")
                else:
                    buyer = None
                    log.warning(f"Selected buyer_id {selected_buyer_id} not found or not a buyer")

            # Priority 2: Try project buyer if no buyer selected or selected buyer not found
            if not buyer:
                project = Project.query.filter_by(project_id=change_request.project_id, is_deleted=False).first()
                if project and project.buyer_id:
                    buyer = User.query.filter_by(user_id=project.buyer_id, is_deleted=False).first()
                    if buyer:
                        log.info(f"Using project buyer {buyer.full_name} (ID: {buyer.user_id})")

            # Priority 3: Use first available buyer in system
            if not buyer and buyer_role:
                buyer = User.query.filter_by(role_id=buyer_role.role_id, is_deleted=False).first()
                if buyer:
                    log.info(f"No buyer assigned to project {change_request.project_id}, using system buyer: {buyer.full_name}")

            if buyer:
                change_request.assigned_to_buyer_user_id = buyer.user_id
                change_request.assigned_to_buyer_name = buyer.full_name
                change_request.assigned_to_buyer_date = datetime.utcnow()
                log.info(f"CR {cr_id} assigned to buyer {buyer.full_name} (ID: {buyer.user_id})")
            else:
                log.warning(f"CR {cr_id} approved but no buyer found in system!")

            # Add to BOQ History - Estimator Approval
            existing_history = BOQHistory.query.filter_by(boq_id=change_request.boq_id).order_by(BOQHistory.action_date.desc()).first()

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
                "role": "estimator",
                "type": "change_request_approved_by_estimator",
                "sender": approver_name,
                "receiver": change_request.assigned_to_buyer_name or "Buyer",
                "sender_role": "estimator",
                "receiver_role": "buyer",
                "status": CR_CONFIG.STATUS_SEND_TO_BUYER,
                "cr_id": cr_id,
                "item_name": change_request.item_name or f"CR #{cr_id}",
                "materials_count": len(change_request.materials_data) if change_request.materials_data else 0,
                "total_cost": change_request.materials_total_cost,
                "comments": f"Estimator approved. Sent to {change_request.assigned_to_buyer_name or 'Buyer'} for purchase",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": approver_name,
                "sender_user_id": approver_id,
                "project_name": change_request.project.project_name if change_request.project else None,
                "project_id": change_request.project_id
            }

            current_actions.append(new_action)
            log.info(f"Appending change_request_approved_by_estimator action to BOQ {change_request.boq_id} history")

            if existing_history:
                existing_history.action = current_actions
                flag_modified(existing_history, "action")
                existing_history.action_by = approver_name
                existing_history.sender = approver_name
                existing_history.receiver = change_request.assigned_to_buyer_name or "Buyer"
                existing_history.comments = f"CR #{cr_id} approved by Estimator"
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = approver_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                boq_history = BOQHistory(
                    boq_id=change_request.boq_id,
                    action=current_actions,
                    action_by=approver_name,
                    boq_status=change_request.boq.status if change_request.boq else 'unknown',
                    sender=approver_name,
                    receiver=change_request.assigned_to_buyer_name or "Buyer",
                    comments=f"CR #{cr_id} approved by Estimator",
                    sender_role='estimator',
                    receiver_role='buyer',
                    action_date=datetime.utcnow(),
                    created_by=approver_name
                )
                db.session.add(boq_history)

            db.session.commit()

            log.info(f"Estimator approved CR {cr_id}, assigned to Buyer for purchase")

            # Send notification to assigned Buyer
            try:
                if change_request.assigned_to_buyer_user_id:
                    project_name = change_request.project.project_name if change_request.project else 'Unknown Project'
                    notification_service.notify_cr_approved(
                        cr_id=cr_id,
                        project_name=project_name,
                        approver_id=approver_id,
                        approver_name=approver_name,
                        approver_role='estimator',
                        next_user_ids=[change_request.assigned_to_buyer_user_id],
                        next_role='buyer'
                    )
            except Exception as notif_error:
                log.error(f"Failed to send CR approval to Buyer notification: {notif_error}")

            return jsonify({
                "success": True,
                "message": "Approved by Estimator. Sent to Buyer for purchase.",
                "cr_id": cr_id,
                "status": CR_CONFIG.STATUS_SEND_TO_BUYER,
                "next_approver": "Buyer",
                "assigned_to_buyer_name": change_request.assigned_to_buyer_name
            }), 200

        elif is_admin:
            # Admin approves - Final approval with full authority (same as TD)
            change_request.td_approved_by_user_id = approver_id
            change_request.td_approved_by_name = approver_name
            change_request.td_approval_date = datetime.utcnow()
            change_request.status = CR_CONFIG.STATUS_PURCHASE_COMPLETE  # Mark as complete
            change_request.approval_required_from = None  # No further approval needed
            change_request.current_approver_role = None
            change_request.updated_at = datetime.utcnow()

            log.info(f"Admin {approver_name} gave final approval for CR {cr_id} - Change request complete")

            # Add to BOQ History - Admin Approval (use 'admin' role in history)
            existing_history = BOQHistory.query.filter_by(boq_id=change_request.boq_id).order_by(BOQHistory.action_date.desc()).first()

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
                "role": "admin",  # Show as admin in history
                "type": "change_request_approved_by_admin",
                "sender": approver_name,
                "receiver": None,  # No next receiver - final approval
                "sender_role": "admin",  # Use actual admin role, not viewing-as role
                "receiver_role": None,
                "status": CR_CONFIG.STATUS_PURCHASE_COMPLETE,
                "cr_id": cr_id,
                "item_name": change_request.item_name or f"CR #{cr_id}",
                "materials_count": len(change_request.materials_data) if change_request.materials_data else 0,
                "total_cost": change_request.materials_total_cost,
                "comments": f"Admin gave final approval. Change request completed.",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": approver_name,
                "sender_user_id": approver_id,
                "project_name": change_request.project.project_name if change_request.project else None,
                "project_id": change_request.project_id
            }

            current_actions.append(new_action)
            log.info(f"Appending change_request_approved_by_admin action to BOQ {change_request.boq_id} history")

            if existing_history:
                existing_history.action = current_actions
                flag_modified(existing_history, "action")
                existing_history.action_by = approver_name
                existing_history.sender = approver_name
                existing_history.receiver = None  # Final approval
                existing_history.comments = f"CR #{cr_id} final approval by Admin"
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = approver_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                boq_history = BOQHistory(
                    boq_id=change_request.boq_id,
                    action=current_actions,
                    action_by=approver_name,
                    boq_status=change_request.boq.status if change_request.boq else 'unknown',
                    sender=approver_name,
                    receiver=None,  # Final approval
                    comments=f"CR #{cr_id} final approval by Admin",
                    sender_role='admin',  # Use admin role in history
                    receiver_role=None,
                    action_date=datetime.utcnow(),
                    created_by=approver_name
                )
                db.session.add(boq_history)

            db.session.commit()

            log.info(f"Admin gave final approval for CR {cr_id}")

            return jsonify({
                "success": True,
                "message": "Final approval by Admin. Change request completed.",
                "status": CR_CONFIG.STATUS_PURCHASE_COMPLETE,
                "cr_id": cr_id
            }), 200

        else:
            return jsonify({"error": "Invalid approver role. Only Admin, PM, TD, and Estimator can approve change requests."}), 403

    except SQLAlchemyError as e:
        db.session.rollback()
        log.error(f"Database error approving change request {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving change request {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


# ============================================================================
# DEPRECATED FUNCTION - DISABLED
# ============================================================================
# This function has been replaced by complete_purchase() in buyer_controller.py
#
# REASON FOR DEPRECATION:
# - Set status='purchase_completed' (direct to site, bypassed M2 Store)
# - Merged materials directly to BOQ without InternalMaterialRequest
# - Did NOT create inventory tracking records for Production Manager
# - Caused duplicate code paths and confusion
#
# CORRECT FUNCTION: complete_purchase() in buyer_controller.py (line ~2276)
# - Set status='routed_to_store' (routes through Production Manager)
# - Creates InternalMaterialRequest records for PM Stock Out page
# - Proper M2 Store inventory tracking flow
# - Single source of truth for purchase completion
# ============================================================================

def complete_purchase_and_merge_to_boq(cr_id):
    """
    ⚠️ DEPRECATED - DO NOT USE

    This function is deprecated and disabled.
    Use complete_purchase() in buyer_controller.py instead.

    Old behavior:
    - Buyer completes purchase and merges materials to BOQ
    - POST /api/change-request/{cr_id}/complete-purchase
    - Status set to 'purchase_completed' (bypasses M2 Store)

    New behavior (use POST /api/buyer/complete-purchase instead):
    - Status set to 'routed_to_store'
    - Creates InternalMaterialRequest for Production Manager
    - Routes through M2 Store for proper inventory tracking
    """
    return jsonify({
        "error": "This endpoint is deprecated",
        "message": "Use POST /api/buyer/complete-purchase instead",
        "deprecated_endpoint": f"/api/change-request/{cr_id}/complete-purchase",
        "correct_endpoint": "/api/buyer/complete-purchase",
        "reason": "This old flow bypasses M2 Store and doesn't create proper inventory tracking"
    }), 410  # 410 Gone - indicates the resource is no longer available

# OLD FUNCTION BODY REMOVED - See git history if needed (456 lines deleted)
# The old implementation merged materials directly to BOQ without creating
# InternalMaterialRequest records, causing Production Manager to not see purchases.
def get_boq_change_requests(boq_id):
    """
    Get all change requests for a specific BOQ
    GET /api/boq/{boq_id}/change-requests
    Returns pending, approved, and rejected requests
    """
    try:
        # Verify BOQ exists
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get BOQ details to access material quantities
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()

        # Build material lookup map for BOQ quantities AND unit prices
        # This is needed to enrich change requests created by Site Engineers
        # (SEs don't see prices, so their requests are saved with unit_price=0)
        material_boq_quantities = {}
        if boq_details and boq_details.boq_details:
            boq_items = boq_details.boq_details.get('items', [])
            for item_idx, item in enumerate(boq_items):
                for sub_item_idx, sub_item in enumerate(item.get('sub_items', [])):
                    for mat_idx, boq_material in enumerate(sub_item.get('materials', [])):
                        # Create material ID
                        material_id = f"mat_{boq_id}_{item_idx+1}_{sub_item_idx+1}_{mat_idx+1}"
                        material_boq_quantities[material_id] = {
                            'quantity': boq_material.get('quantity', 0),
                            'unit': boq_material.get('unit', 'nos'),
                            'unit_price': boq_material.get('unit_price', 0)  # Include unit price for enrichment
                        }

        # Get all change requests for this BOQ
        change_requests = ChangeRequest.query.filter_by(
            boq_id=boq_id,
            is_deleted=False
        ).order_by(ChangeRequest.created_at.desc()).all()

        # Format response
        requests_data = []
        for cr in change_requests:
            request_data = cr.to_dict()

            # Enrich materials_data with BOQ quantities and unit prices
            if request_data.get('materials_data'):
                enriched_materials = []
                for material in request_data['materials_data']:
                    material_id = material.get('master_material_id')
                    if material_id and material_id in material_boq_quantities:
                        boq_data = material_boq_quantities[material_id]
                        material['original_boq_quantity'] = boq_data['quantity']
                        # Enrich unit_price from BOQ if stored value is 0 (SE-created requests)
                        if not material.get('unit_price') or material.get('unit_price') == 0:
                            material['unit_price'] = boq_data.get('unit_price', 0)
                            # Also recalculate total_price
                            material['total_price'] = material.get('quantity', 0) * material.get('unit_price', 0)
                    enriched_materials.append(material)
                request_data['materials_data'] = enriched_materials

            # Enrich sub_items_data with BOQ quantities and unit prices
            if request_data.get('sub_items_data'):
                enriched_sub_items = []
                for sub_item in request_data['sub_items_data']:
                    material_id = sub_item.get('master_material_id')
                    if material_id and material_id in material_boq_quantities:
                        boq_data = material_boq_quantities[material_id]
                        sub_item['original_boq_quantity'] = boq_data['quantity']
                        # Enrich unit_price from BOQ if stored value is 0 (SE-created requests)
                        if not sub_item.get('unit_price') or sub_item.get('unit_price') == 0:
                            sub_item['unit_price'] = boq_data.get('unit_price', 0)
                            # Also recalculate total_price
                            sub_item['total_price'] = sub_item.get('quantity', 0) * sub_item.get('unit_price', 0)
                    enriched_sub_items.append(sub_item)
                request_data['sub_items_data'] = enriched_sub_items

            # Recalculate materials_total_cost if it was 0 (SE-created requests)
            # Use enriched prices from either materials_data or sub_items_data
            if not request_data.get('materials_total_cost') or request_data.get('materials_total_cost') == 0:
                total_cost = 0.0
                # Sum from materials_data
                for mat in request_data.get('materials_data', []):
                    total_cost += mat.get('total_price', 0) or (mat.get('quantity', 0) * mat.get('unit_price', 0))
                # Sum from sub_items_data if materials_data is empty
                if total_cost == 0:
                    for sub in request_data.get('sub_items_data', []):
                        total_cost += sub.get('total_price', 0) or (sub.get('quantity', 0) * sub.get('unit_price', 0))
                if total_cost > 0:
                    request_data['materials_total_cost'] = round(total_cost, 2)

            # Budget impact removed - columns dropped from database

            requests_data.append(request_data)

        return jsonify({
            "success": True,
            "boq_id": boq_id,
            "count": len(requests_data),
            "data": requests_data
        }), 200

    except Exception as e:
        log.error(f"Error getting change requests for BOQ {boq_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def update_change_request(cr_id):
    """
    Update a pending change request
    PUT /api/change-request/{cr_id}
    {
        "justification": "Updated justification",
        "materials": [...]
    }
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')

        # Get change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # Check edit permissions
        user_role = current_user.get('role_name', '').lower()
        normalized_role = workflow_service.normalize_role(user_role)

        # PM/Admin can edit any pending request, SE can only edit their own, Estimator can edit requests assigned to them
        if user_role in ['projectmanager', 'project_manager', 'admin', 'mep', 'mepsupervisor']:
            # PM/Admin/MEP can edit pending, under_review, send_to_pm, send_to_mep, approved_by_pm, send_to_est, send_to_buyer requests
            editable_statuses = ['pending', 'under_review', 'send_to_pm', 'send_to_mep', 'approved_by_pm', 'pm_request', 'ss_request', 'mep_request', 'admin_request', 'send_to_est', 'send_to_buyer']
            if change_request.status not in editable_statuses:
                return jsonify({"error": f"Can only edit requests with status: {', '.join(editable_statuses)}"}), 400
        elif normalized_role == 'estimator':
            # Estimator can edit requests that are assigned to them for approval
            if change_request.approval_required_from != 'estimator':
                return jsonify({"error": "You can only edit requests assigned to you for approval"}), 403
        else:
            # SE can only edit their own requests
            if change_request.requested_by_user_id != user_id:
                return jsonify({"error": "You can only edit your own requests"}), 403

            # SE can only edit pending requests (not yet sent for review)
            if change_request.status != 'pending':
                return jsonify({"error": "Can only edit pending requests. Once sent for review, contact your PM to edit."}), 400

        # Get updated data
        data = request.get_json()
        justification = data.get('justification')
        materials = data.get('materials', [])

        if not justification or justification.strip() == '':
            return jsonify({"error": "Justification is required"}), 400

        if not materials or len(materials) == 0:
            return jsonify({"error": "At least one material is required"}), 400

        # Build lookup of original amounts from existing sub_items_data
        # Key by multiple identifiers to ensure we find matches
        original_lookup = {}
        existing_sub_items = change_request.sub_items_data or []
        for orig_mat in existing_sub_items:
            mat_name = orig_mat.get('material_name', '').lower().strip()
            sub_item_id = orig_mat.get('sub_item_id')
            master_material_id = orig_mat.get('master_material_id')

            # Determine if this was originally a new material or existing
            # Priority: is_new_material flag > is_new flag > check master_material_id
            was_new_material = orig_mat.get('is_new_material')
            if was_new_material is None:
                was_new_material = orig_mat.get('is_new')
            if was_new_material is None:
                # Fallback: if it has a valid master_material_id, it's existing
                was_new_material = master_material_id is None

            original_data = {
                'original_quantity': orig_mat.get('original_quantity', orig_mat.get('quantity', 0)),
                'original_unit_price': orig_mat.get('original_unit_price', orig_mat.get('unit_price', 0)),
                'original_total_price': orig_mat.get('original_total_price', orig_mat.get('total_price', 0)),
                'is_new_material': was_new_material,  # Preserve original new/existing status
                'master_material_id': master_material_id
            }

            # Store with multiple keys for better matching
            if mat_name:
                original_lookup[f"name:{mat_name}"] = original_data
            if sub_item_id:
                original_lookup[f"id:{sub_item_id}"] = original_data
            if master_material_id:
                original_lookup[f"mat_id:{master_material_id}"] = original_data

        # Calculate new materials total cost with cost comparison
        materials_total_cost = 0.0
        original_total_cost = 0.0
        materials_data = []
        sub_items_data = []
        total_cost_increase = 0.0

        for mat in materials:
            quantity = float(mat.get('quantity', 0))
            unit_price = float(mat.get('unit_price', 0))
            total_price = quantity * unit_price
            materials_total_cost += total_price

            # Find original values for this material using multiple lookup keys
            mat_name = mat.get('material_name', '').lower().strip()
            sub_item_id = mat.get('sub_item_id')
            master_material_id = mat.get('master_material_id')

            original_data = None
            # Try multiple lookup keys in priority order
            if master_material_id and f"mat_id:{master_material_id}" in original_lookup:
                original_data = original_lookup[f"mat_id:{master_material_id}"]
            elif mat_name and f"name:{mat_name}" in original_lookup:
                original_data = original_lookup[f"name:{mat_name}"]
            elif sub_item_id and f"id:{sub_item_id}" in original_lookup:
                original_data = original_lookup[f"id:{sub_item_id}"]

            # Get original values (if exists) or use current as original (new material)
            if original_data:
                # EXISTING material - preserve its original status
                orig_quantity = float(original_data.get('original_quantity', 0))
                orig_unit_price = float(original_data.get('original_unit_price', 0))
                orig_total_price = float(original_data.get('original_total_price', 0))
                # IMPORTANT: Preserve the original is_new_material status - DO NOT change it
                is_new_material = original_data.get('is_new_material', False)
            else:
                # NEW material added during edit - current values ARE the originals
                orig_quantity = quantity
                orig_unit_price = unit_price
                orig_total_price = total_price
                # Only mark as new material if it doesn't have a master_material_id
                is_new_material = master_material_id is None

            original_total_cost += orig_total_price

            # Calculate cost difference (positive = cost increased)
            cost_difference = total_price - orig_total_price
            is_extra_cost = cost_difference > 0  # Only mark as extra if cost INCREASED

            if cost_difference > 0:
                total_cost_increase += cost_difference

            materials_data.append({
                'material_name': mat.get('material_name'),
                'quantity': quantity,
                'unit': mat.get('unit', 'nos'),
                'unit_price': unit_price,
                'total_price': total_price,
                'master_material_id': mat.get('master_material_id'),
                'justification': mat.get('justification', ''),
                'brand': mat.get('brand'),
                'specification': mat.get('specification'),
                'size': mat.get('size'),
                # Cost tracking
                'original_quantity': orig_quantity,
                'original_unit_price': orig_unit_price,
                'original_total_price': orig_total_price,
                'cost_difference': round(cost_difference, 2),
                'is_extra_cost': is_extra_cost
            })

            sub_items_data.append({
                'sub_item_id': mat.get('sub_item_id'),
                'sub_item_name': mat.get('sub_item_name'),
                'material_name': mat.get('material_name'),
                'quantity': quantity,
                'unit': mat.get('unit', 'nos'),
                'unit_price': unit_price,
                'total_price': total_price,
                'master_material_id': mat.get('master_material_id'),
                'is_new_material': is_new_material,  # True ONLY if material doesn't exist in system
                'is_extra_cost': is_extra_cost,  # True ONLY if cost INCREASED from original
                'original_quantity': orig_quantity,
                'original_unit_price': orig_unit_price,
                'original_total_price': orig_total_price,
                'cost_difference': round(cost_difference, 2),
                'reason': mat.get('reason'),
                'justification': mat.get('justification', ''),
                'brand': mat.get('brand'),
                'specification': mat.get('specification'),
                'size': mat.get('size')
            })

        # Update change request
        change_request.justification = justification
        change_request.materials_data = materials_data
        change_request.sub_items_data = sub_items_data
        change_request.materials_total_cost = materials_total_cost
        change_request.updated_at = datetime.utcnow()

        # Cost tracking columns removed - calculated on-the-fly if needed

        db.session.commit()

        log.info(f"Change request {cr_id} updated by user {user_id}. Original cost: {original_total_cost}, New cost: {materials_total_cost}, Increase: {total_cost_increase}")

        return jsonify({
            "success": True,
            "message": "Change request updated successfully",
            "cr_id": cr_id,
            "materials_total_cost": round(materials_total_cost, 2),
            "original_total_cost": round(original_total_cost, 2),
            "cost_increase": round(total_cost_increase, 2),
            "cost_comparison": {
                "original": round(original_total_cost, 2),
                "new": round(materials_total_cost, 2),
                "difference": round(materials_total_cost - original_total_cost, 2),
                "has_increase": total_cost_increase > 0
            }
        }), 200

    except SQLAlchemyError as e:
        db.session.rollback()
        log.error(f"Database error updating change request {cr_id}: {str(e)}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating change request {cr_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500


def reject_change_request(cr_id):
    """
    Reject change request (Estimator/TD)
    POST /api/change-request/{cr_id}/reject
    {
        "rejection_reason": "Overhead exceeded. Reduce quantity."
    }
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        approver_id = current_user.get('user_id')
        approver_name = current_user.get('full_name') or current_user.get('username') or 'User'
        approver_role = current_user.get('role_name', '').lower()

        # Get change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # Check if already in final state
        if change_request.status in ['approved', 'rejected']:
            return jsonify({"error": f"Change request already {change_request.status}"}), 400

        # Normalize role for consistent comparison
        normalized_role = workflow_service.normalize_role(approver_role)

        # Admin, Estimator, PM, and TD have full rejection authority
        is_admin = approver_role in ['admin'] or normalized_role == 'admin'
        is_estimator = normalized_role in ['estimator']
        is_pm = normalized_role == 'projectmanager'
        is_td = normalized_role == 'technicaldirector'

        # Roles that can bypass status checks
        can_bypass_status = is_admin or is_estimator or is_pm or is_td

        if not can_bypass_status:
            # Check if request is under review (can reject at any stage) - Privileged roles bypass this check
            if change_request.status not in ['under_review', 'approved_by_pm', 'approved_by_td']:
                return jsonify({"error": "Request must be under review to reject"}), 400

        # For other roles, check if user has permission to reject (privileged roles bypass this check)
        if not can_bypass_status:
            required_approver = change_request.approval_required_from
            if not workflow_service.can_approve(approver_role, required_approver):
                return jsonify({"error": f"You don't have permission to reject this request. Required: {required_approver}, Your role: {approver_role}"}), 403

        # Get request data
        data = request.get_json() or {}
        rejection_reason = data.get('rejection_reason', '')

        if not rejection_reason or rejection_reason.strip() == '':
            return jsonify({"error": "Rejection reason is required"}), 400

        # Update change request - Record who rejected and at what stage
        # Use 'admin' role in history when admin rejects
        history_role = 'admin' if is_admin else approver_role

        change_request.status = 'rejected'
        change_request.rejected_by_user_id = approver_id
        change_request.rejected_by_name = approver_name
        change_request.rejected_at_stage = history_role
        change_request.rejection_reason = rejection_reason
        change_request.updated_at = datetime.utcnow()

        # Add to BOQ History - Rejection
        existing_history = BOQHistory.query.filter_by(boq_id=change_request.boq_id).order_by(BOQHistory.action_date.desc()).first()

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
            "role": 'admin' if is_admin else normalized_role,
            "type": "change_request_rejected",
            "sender": approver_name,
            "receiver": change_request.requested_by_name,
            "sender_role": history_role,  # Use admin role in history
            "receiver_role": change_request.requested_by_role,
            "status": "rejected",
            "cr_id": cr_id,
            "item_name": change_request.item_name or f"CR #{cr_id}",
            "materials_count": len(change_request.materials_data) if change_request.materials_data else 0,
            "total_cost": change_request.materials_total_cost,
            "rejection_reason": rejection_reason,
            "rejected_at_stage": history_role,  # Use admin role in history
            "comments": f"Rejected by {history_role.replace('_', ' ').title()}: {rejection_reason}",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": approver_name,
            "sender_user_id": approver_id,
            "project_name": change_request.project.project_name if change_request.project else None,
            "project_id": change_request.project_id
        }

        current_actions.append(new_action)
        log.info(f"Appending change_request_rejected action to BOQ {change_request.boq_id} history")

        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = approver_name
            existing_history.sender = approver_name
            existing_history.receiver = change_request.requested_by_name
            existing_history.comments = f"CR #{cr_id} rejected by {history_role}"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = approver_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=change_request.boq_id,
                action=current_actions,
                action_by=approver_name,
                boq_status=change_request.boq.status if change_request.boq else 'unknown',
                sender=approver_name,
                receiver=change_request.requested_by_name,
                comments=f"CR #{cr_id} rejected by {history_role}",
                sender_role=history_role,  # Use admin role in history
                receiver_role=change_request.requested_by_role,
                action_date=datetime.utcnow(),
                created_by=approver_name
            )
            db.session.add(boq_history)

        db.session.commit()

        log.info(f"Change request {cr_id} rejected by {approver_name}")

        # Send notification to CR creator about rejection
        try:
            if change_request.requested_by_user_id:
                project_name = change_request.project.project_name if change_request.project else 'Unknown Project'
                notification_service.notify_cr_rejected(
                    cr_id=cr_id,
                    project_name=project_name,
                    rejector_id=approver_id,
                    rejector_name=approver_name,
                    rejector_role=history_role,
                    creator_user_id=change_request.requested_by_user_id,
                    rejection_reason=rejection_reason
                )
        except Exception as notif_error:
            log.error(f"Failed to send CR rejection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Change request rejected",
            "cr_id": cr_id,
            "status": "rejected",
            "rejected_by": approver_name,
            "rejection_reason": rejection_reason,
            "rejection_date": change_request.approval_date.isoformat() if change_request.approval_date else None
        }), 200

    except SQLAlchemyError as e:
        db.session.rollback()
        log.error(f"Database error rejecting change request {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting change request {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def resend_change_request(cr_id):
    """
    Resend/resubmit a rejected change request
    PUT /api/change-request/{cr_id}/resend
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username') or 'User'

        # Get change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # Only allow resending rejected CRs
        if change_request.status != 'rejected' and change_request.vendor_selection_status != 'rejected':
            return jsonify({"error": "Only rejected requests can be resent"}), 400

        # Determine what type of rejection this was and reset appropriately
        if change_request.vendor_selection_status == 'rejected':
            # Vendor was rejected - reset vendor selection fields but keep CR approved
            change_request.vendor_selection_status = None
            change_request.selected_vendor_id = None
            change_request.selected_vendor_name = None
            change_request.vendor_rejection_reason = None
            change_request.vendor_approved_by_td_id = None
            change_request.vendor_approved_by_td_name = None
            change_request.vendor_approval_date = None
            change_request.vendor_selected_by_buyer_id = None
            change_request.vendor_selected_by_buyer_name = None
            change_request.vendor_selection_date = None
            # Keep status as assigned_to_buyer so buyer can select new vendor
            if change_request.status == 'rejected':
                change_request.status = 'assigned_to_buyer'
        else:
            # CR was rejected - reset to under_review for resubmission
            change_request.status = 'under_review'
            change_request.rejected_by_user_id = None
            change_request.rejected_by_name = None
            change_request.rejection_reason = None
            change_request.rejected_at_stage = None

        change_request.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Change request resent successfully",
            "cr_id": cr_id,
            "new_status": change_request.status,
            "vendor_selection_status": change_request.vendor_selection_status
        }), 200

    except SQLAlchemyError as e:
        db.session.rollback()
        log.error(f"Database error resending change request {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        db.session.rollback()
        log.error(f"Error resending change request {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


# REMOVED: update_change_request_status - DEPRECATED
# Use send_for_review() instead
# This function has been removed as the endpoint is no longer available
# The send_for_review() function provides better workflow control


# REMOVED: get_extra_materials, create_extra_material, approve_extra_material functions
# These functions have been removed as they were just wrappers around the main change request functionality.
# Use the main change request functions directly:
# - get_all_change_requests() for fetching
# - create_change_request() for creating
# - approve_change_request() for approving
# This eliminates duplicate code and maintains a single source of truth.


def get_all_buyers():
    """
    Get all active buyers in the system
    GET /api/buyers
    Used by Estimator/TD to select buyer when approving change requests
    """
    try:
        from models.role import Role
        from datetime import timedelta

        # Get buyer role_id first
        buyer_role = Role.query.filter_by(role='buyer', is_deleted=False).first()
        if not buyer_role:
            log.warning("Buyer role not found in roles table")
            return jsonify({
                "success": True,
                "buyers": [],
                "count": 0,
                "message": "No buyer role configured"
            }), 200

        # Get all active buyers using role_id
        buyers = User.query.filter_by(
            role_id=buyer_role.role_id,
            is_deleted=False
        ).all()

        # Calculate online status dynamically: user is online if last_login was within last 5 minutes
        current_time = datetime.utcnow()
        online_threshold = timedelta(minutes=5)

        buyers_list = []
        for buyer in buyers:
            # Check online status based on user_status field
            # Only "online" is considered online, everything else (offline/NULL) is offline
            is_online = buyer.user_status == 'online'
            log.info(f"Buyer {buyer.full_name}: user_status={buyer.user_status}, is_online={is_online}")

            buyers_list.append({
                'user_id': buyer.user_id,
                'full_name': buyer.full_name,
                'email': buyer.email,
                'username': buyer.email,  # Use email as username since User model doesn't have username
                'is_active': is_online  # Dynamic online status based on last_login
            })

        return jsonify({
            "success": True,
            "buyers": buyers_list,
            "count": len(buyers_list)
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyers: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def delete_change_request(cr_id):
    """
    Delete a change request (soft delete)
    DELETE /api/change-request/{cr_id}

    Only the creator or admin can delete.
    Only pending or rejected requests can be deleted.
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_role = current_user.get('role_name', '').lower()

        # Get change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # Check permissions - only creator or admin can delete
        is_admin = user_role == 'admin'
        is_creator = change_request.requested_by_user_id == user_id

        if not (is_admin or is_creator):
            return jsonify({"error": "You don't have permission to delete this request"}), 403

        # Only pending or rejected requests can be deleted
        if change_request.status not in ['pending', 'rejected']:
            return jsonify({
                "error": f"Cannot delete a request with status '{change_request.status}'. Only pending or rejected requests can be deleted."
            }), 400

        # Soft delete
        change_request.is_deleted = True
        change_request.updated_at = datetime.utcnow()
        db.session.commit()

        log.info(f"Change request {cr_id} deleted by user {user_id}")

        return jsonify({
            "success": True,
            "message": "Change request deleted successfully"
        }), 200

    except Exception as e:
        log.error(f"Error deleting change request {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
