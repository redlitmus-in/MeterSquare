from flask import request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError
from config.db import db
from models.change_request import ChangeRequest
from models.boq import *
from models.project import Project
from models.user import User
from config.logging import get_logger
from config.change_request_config import CR_CONFIG
from services.overhead_calculator import overhead_calculator
from services.change_request_workflow import workflow_service
from datetime import datetime
from sqlalchemy.orm.attributes import flag_modified
from utils.boq_email_service import BOQEmailService
from utils.admin_viewing_context import get_effective_user_context

log = get_logger()


# DEPRECATED: Use overhead_calculator.calculate_overhead_impact() instead
# Kept for backward compatibility
def calculate_overhead_impact(boq_details, new_materials_cost):
    """
    DEPRECATED: Use overhead_calculator.calculate_overhead_impact() instead
    Wrapper function for backward compatibility
    """
    return overhead_calculator.calculate_overhead_impact(boq_details, new_materials_cost)


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

        # Calculate materials total cost
        materials_total_cost = 0.0
        materials_data = []

        for mat in materials:
            quantity = float(mat.get('quantity', 0))
            unit_price = float(mat.get('unit_price', 0))
            total_price = quantity * unit_price
            materials_total_cost += total_price

            materials_data.append({
                'material_name': mat.get('material_name'),
                'quantity': quantity,
                'unit': mat.get('unit', 'nos'),
                'unit_price': unit_price,
                'total_price': total_price,
                'master_material_id': mat.get('master_material_id'),  # Optional
                'justification': mat.get('justification', ''),  # Per-material justification
                'reason': mat.get('reason', '')  # Reason for new material (used in routing logic)
            })

        # Calculate overhead impact
        overhead_impact = calculate_overhead_impact(boq_details, materials_total_cost)

        if not overhead_impact:
            return jsonify({"error": "Failed to calculate overhead impact"}), 500

        # Prepare sub_items_data from materials or extra material data
        sub_items_data = []
        if hasattr(g, 'extra_material_data') and g.extra_material_data:
            # Coming from create_extra_material wrapper
            sub_items_data = g.extra_material_data.get('sub_items', [])
        else:
            # Direct API call - convert materials to sub_items format
            for mat in materials:
                sub_items_data.append({
                    'sub_item_id': mat.get('sub_item_id'),  # Sub-item ID (e.g., "subitem_331_1_3")
                    'sub_item_name': mat.get('sub_item_name'),  # Sub-item name (e.g., "Protection")
                    'material_name': mat.get('material_name'),  # Material name (e.g., "Bubble Wrap")
                    'quantity': mat.get('quantity'),
                    'unit': mat.get('unit', 'nos'),
                    'unit_price': mat.get('unit_price'),
                    'total_price': mat.get('quantity', 0) * mat.get('unit_price', 0),
                    'is_new': mat.get('master_material_id') is None,
                    'reason': mat.get('reason')
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

        # Calculate percentage of item overhead - ONLY for NEW materials
        # Separate NEW materials from EXISTING materials for threshold calculation
        new_materials_cost = 0.0
        has_new_materials = False
        for mat in materials_data:
            # New material if master_material_id is None
            if mat.get('master_material_id') is None:
                new_materials_cost += mat.get('total_price', 0)
                has_new_materials = True

        percentage_of_item_overhead = 0.0

        # For NEW materials, calculate percentage against item's overhead (miscellaneous) amount
        # For EXISTING materials, calculate against total overhead_allocated
        if has_new_materials and item_id:
            # Get item overhead amount from BOQ item
            item_overhead_amount = 0.0
            boq_json = boq_details.boq_details or {}
            items = boq_json.get('items', [])

            for itm in items:
                itm_id = itm.get('master_item_id') or f"item_{boq_id}_{items.index(itm) + 1}"
                if str(itm_id) == str(item_id):
                    # Try different field names for overhead amount
                    item_overhead_amount = itm.get('overhead', 0) or itm.get('overhead_amount', 0) or itm.get('miscellaneous_amount', 0)

                    # If overhead is 0, calculate from percentage
                    if item_overhead_amount == 0:
                        overhead_percentage = itm.get('overhead_percentage', 10)
                        total_cost = itm.get('total_cost', 0)
                        item_overhead_amount = (total_cost * overhead_percentage) / 100

                    break

            if item_overhead_amount > 0:
                # Calculate percentage based on NEW materials cost vs item overhead amount
                percentage_of_item_overhead = (new_materials_cost / item_overhead_amount) * 100
                log.info(f"NEW materials: Cost={new_materials_cost}, Item Overhead={item_overhead_amount}, Percentage={percentage_of_item_overhead:.2f}%")
            else:
                # Fallback: If no item overhead, try using total overhead allocated
                # This ensures we don't default to 100% unnecessarily
                if overhead_impact['original_overhead_allocated'] > 0:
                    percentage_of_item_overhead = (new_materials_cost / overhead_impact['original_overhead_allocated']) * 100
                    log.warning(f"No item overhead found for item {item_id}, using total overhead allocated instead: Cost={new_materials_cost}, Overhead={overhead_impact['original_overhead_allocated']}, Percentage={percentage_of_item_overhead:.2f}%")
                else:
                    # Last resort fallback
                    percentage_of_item_overhead = 100.0
                    log.error(f"No item overhead or total overhead allocated found for item {item_id}, defaulting to 100%")
        elif overhead_impact['original_overhead_allocated'] > 0:
            # Existing materials - use total overhead allocated
            percentage_of_item_overhead = (materials_total_cost / overhead_impact['original_overhead_allocated']) * 100
            log.info(f"EXISTING materials: Cost={materials_total_cost}, Overhead={overhead_impact['original_overhead_allocated']}, Percentage={percentage_of_item_overhead:.2f}%")

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
                    "overhead_status": {
                        "original_allocated": round(overhead_impact['original_overhead_allocated'], 2),
                        "previously_used": round(overhead_impact['original_overhead_used'], 2),
                        "available_before": round(overhead_impact['original_overhead_remaining'], 2),
                        "consumed_by_request": round(overhead_impact['overhead_consumed'], 2),
                        "available_after": round(overhead_impact['new_overhead_remaining'], 2),
                        "is_over_budget": overhead_impact['is_over_budget'],
                        "balance": "negative" if overhead_impact['is_over_budget'] else "positive"
                    },
                    "note": "Duplicate request prevented. Using existing request."
                }), 200

        # Create change request with status 'pending'
        # No auto-routing - user must explicitly send for review
        change_request = ChangeRequest(
            boq_id=boq_id,
            project_id=boq.project_id,
            requested_by_user_id=user_id,
            requested_by_name=user_name,
            requested_by_role=user_role,
            request_type='EXTRA_MATERIALS',
            justification=justification,
            status='pending',  # User hasn't sent it yet
            current_approver_role=None,  # Will be set when sent for review
            approval_required_from=None,  # Will be set when sent for review
            item_id=item_id,
            item_name=item_name,
            materials_data=materials_data,
            materials_total_cost=materials_total_cost,
            sub_items_data=sub_items_data,  # Add this required field
            percentage_of_item_overhead=percentage_of_item_overhead,
            overhead_consumed=overhead_impact['overhead_consumed'],
            overhead_balance_impact=overhead_impact['overhead_balance_impact'],
            profit_impact=overhead_impact['profit_impact'],
            original_overhead_allocated=overhead_impact['original_overhead_allocated'],
            original_overhead_used=overhead_impact['original_overhead_used'],
            original_overhead_remaining=overhead_impact['original_overhead_remaining'],
            original_overhead_percentage=overhead_impact['original_overhead_percentage'],
            original_profit_percentage=overhead_impact['original_profit_percentage'],
            new_overhead_remaining=overhead_impact['new_overhead_remaining'],
            new_base_cost=overhead_impact['new_base_cost'],
            new_total_cost=overhead_impact['new_total_cost'],
            is_over_budget=overhead_impact['is_over_budget'],
            cost_increase_amount=overhead_impact['cost_increase_amount'],
            cost_increase_percentage=overhead_impact['cost_increase_percentage']
        )

        # All users create requests in pending status - no auto-send
        # User must explicitly click "Send for Review" button
        db.session.add(change_request)
        db.session.flush()  # Get the cr_id before committing

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
            "overhead_consumed": round(overhead_impact['overhead_consumed'], 2),
            "overhead_status": {
                "original_allocated": round(overhead_impact['original_overhead_allocated'], 2),
                "previously_used": round(overhead_impact['original_overhead_used'], 2),
                "available_before": round(overhead_impact['original_overhead_remaining'], 2),
                "consumed_by_request": round(overhead_impact['overhead_consumed'], 2),
                "available_after": round(overhead_impact['new_overhead_remaining'], 2),
                "is_over_budget": overhead_impact['is_over_budget'],
                "balance": "negative" if overhead_impact['is_over_budget'] else "positive"
            },
            "approval_required_from": approval_from,
            "project_name": project.project_name,
            "boq_name": boq.boq_name,
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

        log.info(f"User {user_id} attempting to send change request. Role: '{user_role}' (lowercase: '{user_role_lower}')")

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
        normalized_role = workflow_service.normalize_role(user_role_lower)

        # --- Helper: get miscellaneous amount ---
        def get_item_miscellaneous_amount(change_request):
            try:
                boq_details = BOQDetails.query.filter_by(boq_id=change_request.boq_id, is_deleted=False).first()
                if not boq_details:
                    return 0
                boq_json = boq_details.boq_details or {}
                items = boq_json.get('items', [])
                for item in items:
                    item_id = item.get('master_item_id') or f"item_{change_request.boq_id}_{items.index(item) + 1}"
                    if str(item_id) == str(change_request.item_id):
                        return item.get('miscellaneous_amount', 0)
                return 0
            except Exception as e:
                log.error(f"Error getting miscellaneous amount: {str(e)}")
                return 0

        # --- Determine next approver ---
        next_approver = None
        next_approver_id = None
        next_role = None

        if normalized_role in ['siteengineer', 'sitesupervisor', 'site_engineer', 'site_supervisor']:
            # Site Engineer routes to assigned PM
            next_role = CR_CONFIG.ROLE_PROJECT_MANAGER

            assigned_pm_id = None
            project = Project.query.filter_by(project_id=change_request.project_id, is_deleted=False).first()
            if project:
                # The project manager is stored in the user_id field
                assigned_pm_id = project.user_id

            if not assigned_pm_id:
                log.error(f"No assigned PM found for Project ID {change_request.project_id}")
                return jsonify({"error": "No Project Manager assigned for this project"}), 400

            # --- Fetch PM details from User table ---
            assigned_pm_user = User.query.filter_by(user_id=assigned_pm_id, is_deleted=False).first()
            if not assigned_pm_user:
                return jsonify({"error": "Assigned Project Manager user record not found"}), 400

            next_approver = assigned_pm_user.full_name or assigned_pm_user.username
            next_approver_id = assigned_pm_user.user_id
            log.info(f"Routing CR {cr_id} to PM: {next_approver} (user_id={next_approver_id})")

        elif normalized_role in ['projectmanager', 'project_manager']:
            # PM explicit or auto-routing
            if route_to:
                if route_to == 'technical_director':
                    next_role = CR_CONFIG.ROLE_TECHNICAL_DIRECTOR
                    next_approver = "Technical Director"
                elif route_to == 'estimator':
                    next_role = CR_CONFIG.ROLE_ESTIMATOR
                    next_approver = "Estimator"
                else:
                    return jsonify({"error": f"Invalid route_to value: {route_to}. Must be 'technical_director' or 'estimator'"}), 400
                next_approver_id = None
            else:
                # Auto-route logic
                has_new_materials = any(mat.get('master_material_id') is None for mat in (change_request.materials_data or []))
                if has_new_materials:
                    new_materials_cost = sum(mat.get('total_price', 0) for mat in change_request.materials_data if mat.get('master_material_id') is None)
                    miscellaneous_amount = get_item_miscellaneous_amount(change_request)
                    percentage = (new_materials_cost / miscellaneous_amount) * 100 if miscellaneous_amount > 0 else 100

                    if percentage > 40:
                        next_role = CR_CONFIG.ROLE_TECHNICAL_DIRECTOR
                        next_approver = "Technical Director"
                    else:
                        next_role = CR_CONFIG.ROLE_ESTIMATOR
                        next_approver = "Estimator"
                else:
                    next_role, next_approver = workflow_service.determine_initial_approver(user_role, change_request)
                next_approver_id = None

        elif is_admin:
            # Admin sends to assigned PM
            next_role = CR_CONFIG.ROLE_PROJECT_MANAGER
            project = Project.query.filter_by(project_id=change_request.project_id, is_deleted=False).first()
            # The project manager is stored in the user_id field
            assigned_pm_id = project.user_id if project else None

            if not assigned_pm_id:
                return jsonify({"error": "No Project Manager assigned for this project"}), 400

            assigned_pm_user = User.query.filter_by(user_id=assigned_pm_id, is_deleted=False).first()
            if not assigned_pm_user:
                return jsonify({"error": "Assigned Project Manager user record not found"}), 400

            next_approver = assigned_pm_user.full_name or assigned_pm_user.username
            next_approver_id = assigned_pm_user.user_id

        else:
            log.error(f"Invalid role '{user_role}' attempting to send change request")
            return jsonify({"error": f"Invalid role for sending request: {user_role}. Only Site Engineers and Project Managers can send requests."}), 403

        # --- Update Change Request ---
        change_request.approval_required_from = next_role
        change_request.current_approver_role = next_role
        change_request.current_approver_id = next_approver_id
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
            "status": CR_CONFIG.STATUS_UNDER_REVIEW,
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
    """
    try:
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

        # Base query
        query = ChangeRequest.query.filter_by(is_deleted=False)

        # Role-based filtering
        if user_role in ['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']:
            # SE sees ALL requests from their assigned projects (both PM and other SE requests)
            # This helps them avoid duplicate requests and coordinate better

            if is_admin_viewing:
                # Admin viewing as SE: Show ALL SE-related requests
                log.info(f"Admin viewing as SE - showing ALL SE-related requests")
                query = query.filter(
                    ChangeRequest.requested_by_role.in_(['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor'])
                )
            else:
                # Regular SE: Filter by their assigned projects
                # Get projects assigned to this SE/SS (site_supervisor_id in Project table)
                se_project_ids = db.session.query(Project.project_id).filter_by(site_supervisor_id=user_id, is_deleted=False).all()
                se_project_ids = [p[0] for p in se_project_ids] if se_project_ids else []

                log.info(f"Regular SE {user_id} - filtering by {len(se_project_ids)} assigned projects")

                # SE/SS should see ALL requests from their projects (including PM requests)
                if se_project_ids:
                    query = query.filter(
                        ChangeRequest.project_id.in_(se_project_ids)  # All requests from SE's projects
                    )
                else:
                    # Fallback: show only own requests if no project assignment found
                    query = query.filter_by(requested_by_user_id=user_id)
        elif user_role in ['projectmanager', 'project_manager']:
            # PM sees ONLY requests from their assigned projects:
            # 1. Their own requests from their projects
            # 2. SE requests from their projects that need PM approval
            # 3. All purchase/change requests from their assigned projects
            from sqlalchemy import or_, and_
            from utils.admin_viewing_context import should_apply_role_filter

            # Check if admin is viewing as PM (should see ALL PM data, not user-specific)
            if is_admin_viewing:
                # Admin viewing as PM: Show ALL requests that ANY PM would see
                log.info(f"Admin viewing as PM - showing ALL PM-related requests (not user-specific)")
                query = query.filter(
                    or_(
                        ChangeRequest.requested_by_role.in_(['projectmanager', 'project_manager']),  # All PM-created requests
                        ChangeRequest.approval_required_from == 'project_manager',  # All SE requests needing PM approval
                        ChangeRequest.pm_approved_by_user_id.isnot(None)  # All requests approved by any PM
                    )
                )
            else:
                # Regular PM: Filter ONLY by their assigned projects
                # Get projects where this user is the project manager (user_id field in Project table)
                pm_projects = Project.query.filter_by(user_id=user_id, is_deleted=False).all()
                pm_project_ids = [p.project_id for p in pm_projects]

                log.info(f"Regular PM {user_id} - has {len(pm_project_ids)} assigned projects")

                if pm_project_ids:
                    # PM sees ALL purchase/change requests from their assigned projects only
                    query = query.filter(
                        ChangeRequest.project_id.in_(pm_project_ids)  # Only requests from PM's assigned projects
                    )
                else:
                    # If PM has no assigned projects, show only their own requests
                    log.warning(f"PM {user_id} has no assigned projects, showing only their own requests")
                    query = query.filter(
                        ChangeRequest.requested_by_user_id == user_id  # PM's own requests only
                    )
        elif user_role == 'estimator':
            # Estimator sees:
            # 1. Requests where approval_required_from = 'estimator' (pending estimator approval)
            # 2. Requests approved by estimator that are assigned_to_buyer (approved tab)
            # 3. ALL requests that are purchase_completed (completed tab) - regardless of who approved
            from sqlalchemy import or_

            log.info(f"Estimator filter - is_admin_viewing: {is_admin_viewing}")
            # Admin viewing as estimator sees same as regular estimator (no user-specific filtering needed)
            query = query.filter(
                or_(
                    ChangeRequest.approval_required_from == 'estimator',  # Pending requests
                    ChangeRequest.approved_by_user_id.isnot(None),  # Approved by estimator
                    ChangeRequest.status == 'purchase_completed'  # All completed purchases (actual DB value)
                )
            )
        elif user_role in ['technical_director', 'technicaldirector']:
            # TD sees:
            # 1. Requests where approval_required_from = 'technical_director' (pending TD approval)
            # 2. Requests approved by TD that are assigned_to_buyer (approved tab)
            # 3. ALL requests that are purchase_completed (completed tab) - regardless of who approved
            # 4. Requests with vendor selection pending TD approval (vendor_selection_status = 'pending_td_approval')
            # 5. Requests with vendor approved by TD (vendor_selection_status = 'approved')
            from sqlalchemy import or_

            log.info(f"TD filter - is_admin_viewing: {is_admin_viewing}")
            # Admin viewing as TD sees same as regular TD (no user-specific filtering needed)
            query = query.filter(
                or_(
                    ChangeRequest.approval_required_from == 'technical_director',  # Pending requests
                    ChangeRequest.td_approved_by_user_id.isnot(None),  # Approved by TD
                    ChangeRequest.status == 'purchase_completed',  # All completed purchases (actual DB value)
                    ChangeRequest.vendor_selection_status == 'pending_td_approval',  # Vendor approval pending
                    ChangeRequest.vendor_approved_by_td_id.isnot(None)  # Vendor approved by TD
                )
            )
        elif user_role == 'buyer':
            # Buyer sees:
            # 1. Requests assigned to buyer (status='assigned_to_buyer')
            # 2. Requests buyer has completed (status='purchase_complete')
            from sqlalchemy import or_
            query = query.filter(
                or_(
                    ChangeRequest.status == CR_CONFIG.STATUS_ASSIGNED_TO_BUYER,
                    ChangeRequest.status == CR_CONFIG.STATUS_PURCHASE_COMPLETE
                )
            )
        elif user_role == 'admin':
            # Admin sees all
            pass
        else:
            # Other roles see nothing
            return jsonify({"success": True, "data": []}), 200

        # Execute query
        change_requests = query.order_by(ChangeRequest.created_at.desc()).all()

        # Convert to dict with project and BOQ info
        result = []
        for cr in change_requests:
            cr_dict = cr.to_dict()

            # Add project name
            if cr.project:
                cr_dict['project_name'] = cr.project.project_name
                cr_dict['project_code'] = cr.project.project_code
                cr_dict['project_location'] = cr.project.location
                cr_dict['project_client'] = cr.project.client
                cr_dict['area'] = cr.project.area

            # Add BOQ name and status
            if cr.boq:
                cr_dict['boq_name'] = cr.boq.boq_name
                cr_dict['boq_status'] = cr.boq.status

            # Skip material lookup - master_material_id values like 'mat_198_1_2'
            # are not database IDs but sub_item identifiers

            result.append(cr_dict)

        return jsonify({
            "success": True,
            "data": result,
            "count": len(result)
        }), 200

    except Exception as e:
        log.error(f"Error fetching change requests: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def get_change_request_by_id(cr_id):
    """Get specific change request by ID with full details"""
    try:
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()

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
        "comments": "Approved. Within overhead budget."
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

        # PM can approve requests that are under_review from SE
        if normalized_role in ['projectmanager'] and change_request.status == 'under_review':
            # PM can approve requests from Site Engineers
            if change_request.requested_by_role and 'site' in change_request.requested_by_role.lower():
                # This is a valid PM approval scenario
                pass
            elif change_request.approval_required_from == 'project_manager':
                # This is explicitly assigned to PM
                pass
            else:
                return jsonify({"error": f"PM cannot approve this request. Current approver: {change_request.approval_required_from}"}), 403
        else:
            # Check if request is under review for other roles
            if change_request.status not in ['under_review', 'approved_by_pm', 'approved_by_td']:
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
        selected_buyer_id = data.get('buyer_id')  # Optional: Estimator/TD can specify which buyer

        # Multi-stage approval logic
        if normalized_role in ['projectmanager']:
            # PM approves - route to TD or Estimator based on material type and percentage threshold
            change_request.pm_approved_by_user_id = approver_id
            change_request.pm_approved_by_name = approver_name
            change_request.pm_approval_date = datetime.utcnow()
            change_request.status = CR_CONFIG.STATUS_APPROVED_BY_PM

            # Determine next approver based on percentage_of_item_overhead
            # This percentage represents: (materials_total_cost / overhead_allocated) * 100
            percentage = change_request.percentage_of_item_overhead or 0

            log.info(f"PM approval routing: CR {cr_id} has percentage_of_item_overhead={percentage:.2f}%")

            # Apply 40% threshold for routing decision
            if percentage > 40:
                # Overhead >40% - Route to Technical Director
                next_role = CR_CONFIG.ROLE_TECHNICAL_DIRECTOR
                next_approver = 'Technical Director'
                log.info(f"PM approved CR {cr_id}: {percentage:.2f}% > 40% → Routing to TD")
            else:
                # Overhead ≤40% - Route to Estimator
                next_role = CR_CONFIG.ROLE_ESTIMATOR
                next_approver = 'Estimator'
                log.info(f"PM approved CR {cr_id}: {percentage:.2f}% ≤ 40% → Routing to Estimator")

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
                "sender_role": "project_manager",
                "receiver_role": next_role,
                "status": CR_CONFIG.STATUS_APPROVED_BY_PM,
                "cr_id": cr_id,
                "item_name": change_request.item_name or f"CR #{cr_id}",
                "materials_count": len(change_request.materials_data) if change_request.materials_data else 0,
                "total_cost": change_request.materials_total_cost,
                "overhead_percentage": percentage,
                "comments": f"PM approved. Routed to {next_approver} (Overhead: {percentage:.2f}%)",
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

            return jsonify({
                "success": True,
                "message": f"Approved by PM. Automatically forwarded to {next_approver} (Overhead: {percentage:.2f}%)",
                "status": CR_CONFIG.STATUS_APPROVED_BY_PM,
                "next_approver": next_approver,
                "overhead_percentage": percentage
            }), 200

        elif normalized_role in ['technicaldirector', 'technical_director']:
            # TD approves - route to Buyer
            change_request.td_approved_by_user_id = approver_id
            change_request.td_approved_by_name = approver_name
            change_request.td_approval_date = datetime.utcnow()
            change_request.status = CR_CONFIG.STATUS_ASSIGNED_TO_BUYER
            change_request.approval_required_from = CR_CONFIG.ROLE_BUYER
            change_request.current_approver_role = CR_CONFIG.ROLE_BUYER

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
                    log.info(f"TD selected buyer {buyer.full_name} (ID: {buyer.user_id}) for CR {cr_id}")
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
                "receiver": change_request.assigned_to_buyer_name or "Buyer",
                "sender_role": "technical_director",
                "receiver_role": "buyer",
                "status": CR_CONFIG.STATUS_ASSIGNED_TO_BUYER,
                "cr_id": cr_id,
                "item_name": change_request.item_name or f"CR #{cr_id}",
                "materials_count": len(change_request.materials_data) if change_request.materials_data else 0,
                "total_cost": change_request.materials_total_cost,
                "comments": f"TD approved. Assigned to {change_request.assigned_to_buyer_name or 'Buyer'} for purchase",
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
                existing_history.receiver = change_request.assigned_to_buyer_name or "Buyer"
                existing_history.comments = f"CR #{cr_id} approved by TD"
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
                    comments=f"CR #{cr_id} approved by TD",
                    sender_role='technical_director',
                    receiver_role='buyer',
                    action_date=datetime.utcnow(),
                    created_by=approver_name
                )
                db.session.add(boq_history)

            db.session.commit()

            log.info(f"TD approved CR {cr_id}, routing to Buyer")

            return jsonify({
                "success": True,
                "message": "Approved by TD. Forwarded to Buyer for purchase.",
                "status": CR_CONFIG.STATUS_ASSIGNED_TO_BUYER,
                "next_approver": "Buyer",
                "assigned_to_buyer_name": change_request.assigned_to_buyer_name
            }), 200

        elif normalized_role == 'estimator':
            # Estimator approves - Assign to Buyer for purchase
            change_request.approved_by_user_id = approver_id
            change_request.approved_by_name = approver_name
            change_request.approval_date = datetime.utcnow()
            change_request.status = CR_CONFIG.STATUS_ASSIGNED_TO_BUYER
            change_request.approval_required_from = CR_CONFIG.ROLE_BUYER
            change_request.current_approver_role = CR_CONFIG.ROLE_BUYER
            change_request.updated_at = datetime.utcnow()

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
                "status": CR_CONFIG.STATUS_ASSIGNED_TO_BUYER,
                "cr_id": cr_id,
                "item_name": change_request.item_name or f"CR #{cr_id}",
                "materials_count": len(change_request.materials_data) if change_request.materials_data else 0,
                "total_cost": change_request.materials_total_cost,
                "comments": f"Estimator approved. Assigned to {change_request.assigned_to_buyer_name or 'Buyer'} for purchase",
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

            return jsonify({
                "success": True,
                "message": "Approved by Estimator. Assigned to Buyer for purchase.",
                "cr_id": cr_id,
                "status": CR_CONFIG.STATUS_ASSIGNED_TO_BUYER,
                "next_approver": "Buyer",
                "assigned_to_buyer_name": change_request.assigned_to_buyer_name
            }), 200

        else:
            return jsonify({"error": "Invalid approver role. Only PM, TD, and Estimator can approve change requests."}), 403

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


def complete_purchase_and_merge_to_boq(cr_id):
    """
    Buyer completes purchase and merges materials to BOQ
    POST /api/change-request/{cr_id}/complete-purchase
    {
        "purchase_notes": "Materials purchased from Supplier XYZ"
    }
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        buyer_id = current_user.get('user_id')
        buyer_name = current_user.get('full_name') or current_user.get('username') or 'User'
        buyer_role = current_user.get('role_name', '').lower()

        # Get change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # Check if assigned to buyer
        if change_request.status != CR_CONFIG.STATUS_ASSIGNED_TO_BUYER:
            return jsonify({"error": f"Purchase can only be completed for requests assigned to buyer. Current status: {change_request.status}"}), 400

        # Check if user is a buyer
        if buyer_role != 'buyer':
            return jsonify({"error": "Only buyers can complete purchases"}), 403

        # Get request data
        data = request.get_json() or {}
        purchase_notes = data.get('purchase_notes', '')

        # Update purchase completion fields
        change_request.purchase_completed_by_user_id = buyer_id
        change_request.purchase_completed_by_name = buyer_name
        change_request.purchase_completion_date = datetime.utcnow()
        change_request.purchase_notes = purchase_notes
        change_request.status = CR_CONFIG.STATUS_PURCHASE_COMPLETE
        change_request.updated_at = datetime.utcnow()

        log.info(f"Buyer {buyer_name} marked purchase complete for CR {cr_id}")

        # IMPORTANT: DO NOT MERGE INTO BOQ JSON
        # The original BOQ should remain immutable
        # CR data is tracked separately in ChangeRequest table and MaterialPurchaseTracking
        # The comparison view will show CRs dynamically without modifying the planned BOQ

        # Skip BOQ merge - just commit the status change
        db.session.commit()

        log.info(f"CR #{cr_id} marked as purchased_by_buyer - BOQ JSON remains unchanged")

        # Return success without modifying BOQ
        return jsonify({
            "success": True,
            "message": "Purchase marked as complete successfully",
            "cr_id": cr_id,
            "status": change_request.status,
            "note": "BOQ remains unchanged - CR is tracked separately"
        }), 200

        # OLD CODE BELOW - COMMENTED OUT TO PRESERVE BOQ IMMUTABILITY
        """
        # Now merge materials into BOQ
        boq_details = BOQDetails.query.filter_by(boq_id=change_request.boq_id, is_deleted=False).first()
        if not boq_details:
            db.session.rollback()
            return jsonify({"error": "BOQ details not found"}), 404

        # Get existing items
        boq_json = boq_details.boq_details or {}
        existing_items = boq_json.get('items', [])

        # Add materials as sub-items to the existing item (not as new item)
        materials = change_request.materials_data or []

        # Find the item to add materials to
        target_item = None
        item_id_str = str(change_request.item_id) if change_request.item_id else None

        if item_id_str:
            # Try to find the item by master_item_id or generated ID
            for idx, item in enumerate(existing_items):
                # Check master_item_id
                if str(item.get('master_item_id', '')) == item_id_str:
                    target_item = item
                    break
                # Check generated ID format (item_boqid_index)
                generated_id = f"item_{change_request.boq_id}_{idx + 1}"
                if generated_id == item_id_str:
                    target_item = item
                    break

        # If no target item found, create new item (fallback)
        if not target_item:
            new_item = {
                'item_name': f'Extra Materials - CR #{change_request.cr_id}',
                'description': change_request.justification,
                'work_type': 'extra_materials',
                'materials': [],
                'labour': [],
                'totalMaterialCost': 0,
                'totalLabourCost': 0,
                'base_cost': 0,
                'overhead_percentage': change_request.original_overhead_percentage or 10,
                'overhead_amount': 0,
                'profit_margin_percentage': change_request.original_profit_percentage or 15,
                'profit_margin_amount': 0,
                'total_cost': 0,
                'selling_price': 0
            }
            existing_items.append(new_item)
            target_item = new_item
            log.info(f"CR #{cr_id}: No target item found, created new item")
        else:
            log.info(f"CR #{cr_id}: Adding materials to existing item '{target_item.get('item_name')}'")

        # Add each material as a sub-item with special marking
        # IMPORTANT: Only add materials that are truly NEW, not updates to existing materials
        existing_materials = target_item.get('materials', [])

        # Create a set of existing material identifiers (by ID and name)
        # Check both direct materials and materials inside sub_items
        existing_material_ids = set()
        existing_material_names = set()

        # Check direct materials array
        for existing_mat in existing_materials:
            # Track by ID if available
            mat_id = existing_mat.get('master_material_id')
            if mat_id:
                existing_material_ids.add(mat_id)

            # Track by name (case-insensitive)
            mat_name = existing_mat.get('material_name', '').lower().strip()
            if mat_name:
                existing_material_names.add(mat_name)

        # Also check materials inside sub_items structure
        for sub_item in target_item.get('sub_items', []):
            for existing_mat in sub_item.get('materials', []):
                # Track by ID if available
                mat_id = existing_mat.get('master_material_id')
                if mat_id:
                    existing_material_ids.add(mat_id)

                # Track by name (case-insensitive)
                mat_name = existing_mat.get('material_name', '').lower().strip()
                if mat_name:
                    existing_material_names.add(mat_name)

        # Get sub_items_data if available (preferred), otherwise use materials_data
        materials_to_merge = change_request.sub_items_data or change_request.materials_data or []

        log.info(f"CR #{cr_id}: Found {len(existing_material_names)} existing materials by name: {existing_material_names}")
        log.info(f"CR #{cr_id}: Found {len(existing_material_ids)} existing materials by ID: {existing_material_ids}")
        log.info(f"CR #{cr_id}: Processing {len(materials_to_merge)} materials to merge")

        for material in materials_to_merge:
            # Check if this material already exists in the BOQ
            mat_id = material.get('master_material_id')
            mat_name = material.get('material_name', '').lower().strip()

            log.info(f"CR #{cr_id}: Checking material '{material.get('material_name')}' (normalized: '{mat_name}', ID: {mat_id})")

            is_existing_material = False

            # Check by ID first
            if mat_id and mat_id in existing_material_ids:
                is_existing_material = True
                log.info(f"CR #{cr_id}: Material '{material.get('material_name')}' (ID: {mat_id}) already exists in BOQ - skipping merge")

            # Check by name if no ID match (ALWAYS check name for materials without IDs)
            if not is_existing_material and mat_name and mat_name in existing_material_names:
                is_existing_material = True
                log.info(f"CR #{cr_id}: Material '{material.get('material_name')}' already exists in BOQ by name '{mat_name}' - skipping merge")

            # Only add truly NEW materials (not updates to existing ones)
            if not is_existing_material:
                # Mark this material as from change request with planned_quantity = 0
                new_material = {
                    'material_name': material.get('material_name'),  # Actual material name like "Bubble Wrap"
                    'sub_item_name': material.get('sub_item_name'),  # Sub-item name like "Protection"
                    'master_material_id': material.get('master_material_id'),
                    'quantity': material.get('quantity', 0),
                    'unit': material.get('unit', 'nos'),
                    'unit_price': material.get('unit_price', 0),
                    'total_price': material.get('total_price', 0),
                    'is_from_change_request': True,
                    'change_request_id': change_request.cr_id,
                    'planned_quantity': 0,  # KEY: This marks it as unplanned
                    'planned_unit_price': 0,
                    'planned_total_price': 0,
                    'justification': material.get('justification', change_request.justification)  # Use per-material justification, fallback to overall
                }
                existing_materials.append(new_material)
                log.info(f"CR #{cr_id}: Added NEW material '{material.get('material_name')}' to BOQ")
            else:
                log.info(f"CR #{cr_id}: Skipped material '{material.get('material_name')}' - already exists in original BOQ")

        target_item['materials'] = existing_materials

        # DON'T recalculate totals - keep original planned amounts
        # The comparison view will show the variance
        # Only flag that this item has change request materials
        target_item['has_change_request_materials'] = True

        # Update BOQ details
        boq_json['items'] = existing_items

        # DON'T recalculate summary totals - keep original planned amounts
        # The BOQ comparison view will calculate actual costs dynamically
        # Just update metadata
        boq_details.boq_details = boq_json
        boq_details.last_modified_by = buyer_name
        boq_details.last_modified_at = datetime.utcnow()

        flag_modified(boq_details, 'boq_details')

        # First, update or create materials in boq_material (MasterMaterial) table
        from models.boq import MasterMaterial

        # Extract numeric item_id from change_request.item_id
        # change_request.item_id can be a string like "233" or need extraction from target_item
        item_id_for_materials = None
        if target_item and target_item.get('master_item_id'):
            try:
                item_id_for_materials = int(target_item.get('master_item_id'))
                log.info(f"Using master_item_id {item_id_for_materials} from target item")
            except (ValueError, TypeError):
                log.warning(f"Could not convert master_item_id to int: {target_item.get('master_item_id')}")

        # Fallback: try to extract from change_request.item_id string
        if not item_id_for_materials and change_request.item_id:
            try:
                # Try direct conversion first
                item_id_for_materials = int(change_request.item_id)
                log.info(f"Converted change_request.item_id '{change_request.item_id}' to integer: {item_id_for_materials}")
            except (ValueError, TypeError):
                # If it's a string like "item_233_1", extract the number
                if isinstance(change_request.item_id, str):
                    parts = change_request.item_id.replace('item_', '').split('_')
                    if parts and parts[0].isdigit():
                        item_id_for_materials = int(parts[0])
                        log.info(f"Extracted item_id {item_id_for_materials} from '{change_request.item_id}'")

        for material in materials:
            material_name = material.get('material_name')
            unit_price = material.get('unit_price', 0)
            unit = material.get('unit', 'nos')

            # Check if material exists in boq_material table
            existing_master_material = MasterMaterial.query.filter_by(
                material_name=material_name
            ).first()

            if existing_master_material:
                # Update existing material's price, unit, and item_id
                existing_master_material.current_market_price = unit_price
                existing_master_material.default_unit = unit
                if item_id_for_materials:
                    existing_master_material.item_id = item_id_for_materials
                log.info(f"Updated MasterMaterial '{material_name}' (ID: {existing_master_material.material_id}) with price AED {unit_price}, item_id: {item_id_for_materials}")

                # Update material dict with the actual integer material_id
                material['master_material_id'] = existing_master_material.material_id
            else:
                # Create new material in boq_material table
                new_master_material = MasterMaterial(
                    material_name=material_name,
                    item_id=item_id_for_materials,  # Store the extracted item_id
                    default_unit=unit,
                    current_market_price=unit_price,
                    is_active=True,
                    created_at=datetime.utcnow(),
                    created_by=buyer_name
                )
                db.session.add(new_master_material)
                db.session.flush()  # Get the new material_id
                log.info(f"Created new MasterMaterial '{material_name}' with ID {new_master_material.material_id}, item_id: {item_id_for_materials}")

                # Update material dict with the new integer master_material_id
                material['master_material_id'] = new_master_material.material_id

        # Create MaterialPurchaseTracking entries for each material in the change request
        # This marks them as "from change request" in the production management
        item_name = change_request.item_name or f'Extra Materials - CR #{change_request.cr_id}'

        for material in materials:
            # Get master_material_id and convert to int if possible, otherwise None
            master_mat_id = material.get('master_material_id')
            if master_mat_id:
                try:
                    master_mat_id = int(master_mat_id)
                except (ValueError, TypeError):
                    # If it's a string like "mat_233_2_3" (generated ID), set to None
                    master_mat_id = None

            # Check if tracking entry already exists
            # For new materials (master_mat_id = None), only match by name
            if master_mat_id:
                existing_tracking = MaterialPurchaseTracking.query.filter_by(
                    boq_id=change_request.boq_id,
                    material_name=material.get('material_name'),
                    master_material_id=master_mat_id,
                    is_from_change_request=True,
                    change_request_id=change_request.cr_id,
                    is_deleted=False
                ).first()
            else:
                existing_tracking = MaterialPurchaseTracking.query.filter_by(
                    boq_id=change_request.boq_id,
                    material_name=material.get('material_name'),
                    is_from_change_request=True,
                    change_request_id=change_request.cr_id,
                    is_deleted=False
                ).first()

            if not existing_tracking:
                # Create new tracking entry marked as from change request
                tracking_entry = MaterialPurchaseTracking(
                    boq_id=change_request.boq_id,
                    project_id=change_request.project_id,
                    master_item_id=None,  # item_id in change_request is a string, but master_item_id expects integer
                    item_name=item_name,
                    master_material_id=master_mat_id,  # Use converted/validated ID
                    material_name=material.get('material_name'),
                    unit=material.get('unit', 'nos'),
                    purchase_history=[],
                    total_quantity_purchased=0.0,
                    total_quantity_used=0.0,
                    remaining_quantity=0.0,
                    is_from_change_request=True,
                    change_request_id=change_request.cr_id,
                    created_by=buyer_name,
                    created_at=datetime.utcnow()
                )
                db.session.add(tracking_entry)
                log.info(f"Created MaterialPurchaseTracking for CR #{cr_id} material: {material.get('material_name')}")

        # Add to BOQ History - Purchase Completion
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
            "role": "buyer",
            "type": "change_request_purchase_completed",
            "sender": buyer_name,
            "receiver": "BOQ System",
            "sender_role": "buyer",
            "receiver_role": "system",
            "status": CR_CONFIG.STATUS_PURCHASE_COMPLETE,
            "cr_id": cr_id,
            "item_name": change_request.item_name or f"CR #{cr_id}",
            "materials_count": len(materials),
            "total_cost": change_request.materials_total_cost,
            "vendor_name": change_request.selected_vendor_name if change_request.selected_vendor_name else None,
            "comments": f"Purchase completed and {len(materials)} material(s) merged to BOQ. {purchase_notes if purchase_notes else ''}".strip(),
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": buyer_name,
            "sender_user_id": buyer_id,
            "project_name": change_request.project.project_name if change_request.project else None,
            "project_id": change_request.project_id,
            "purchase_notes": purchase_notes
        }

        current_actions.append(new_action)
        log.info(f"Appending change_request_purchase_completed action to BOQ {change_request.boq_id} history")

        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = buyer_name
            existing_history.sender = buyer_name
            existing_history.receiver = "BOQ System"
            existing_history.comments = f"CR #{cr_id} purchase completed, materials merged"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = buyer_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=change_request.boq_id,
                action=current_actions,
                action_by=buyer_name,
                boq_status=change_request.boq.status if change_request.boq else 'unknown',
                sender=buyer_name,
                receiver="BOQ System",
                comments=f"CR #{cr_id} purchase completed, materials merged",
                sender_role='buyer',
                receiver_role='system',
                action_date=datetime.utcnow(),
                created_by=buyer_name
            )
            db.session.add(boq_history)

        db.session.commit()

        log.info(f"Buyer {buyer_name} completed purchase for CR {cr_id} - BOQ remains unchanged")

        # Close the docstring from above
        """

        # This return was moved to line 1150 above - old code commented out
        # return jsonify({
        #     "success": True,
        #     "message": "Purchase completed and materials merged to BOQ",
        #     "cr_id": cr_id,
        #     "status": CR_CONFIG.STATUS_PURCHASE_COMPLETE,
        #     "purchase_completed_by": buyer_name,
        #     "purchase_completion_date": change_request.purchase_completion_date.isoformat() if change_request.purchase_completion_date else None,
        #     "boq_updated": True
        # }), 200

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

        # Get all change requests for this BOQ
        change_requests = ChangeRequest.query.filter_by(
            boq_id=boq_id,
            is_deleted=False
        ).order_by(ChangeRequest.created_at.desc()).all()

        # Format response
        requests_data = []
        for cr in change_requests:
            request_data = cr.to_dict()

            # Add overhead analysis
            request_data['overhead_analysis'] = {
                'original_allocated': cr.original_overhead_allocated,
                'overhead_percentage': cr.original_overhead_percentage,
                'consumed_before_request': cr.original_overhead_used,
                'available_before_request': cr.original_overhead_remaining,
                'consumed_by_this_request': cr.overhead_consumed,
                'remaining_after_approval': cr.new_overhead_remaining,
                'is_within_budget': not cr.is_over_budget,
                'balance_type': 'negative' if cr.is_over_budget else 'positive',
                'balance_amount': cr.new_overhead_remaining
            }

            # Add budget impact
            request_data['budget_impact'] = {
                'original_total': cr.new_base_cost if cr.new_base_cost else 0,
                'new_total_if_approved': cr.new_total_cost if cr.new_total_cost else 0,
                'increase_amount': cr.cost_increase_amount if cr.cost_increase_amount else 0,
                'increase_percentage': cr.cost_increase_percentage if cr.cost_increase_percentage else 0
            }

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
        normalized_role = workflow_service.normalize_role(user_role_lower)

        # PM can edit any pending request, SE can only edit their own, Estimator can edit requests assigned to them
        if user_role in ['projectmanager', 'project_manager']:
            # PM can edit any pending or under_review request in their projects
            # under_review means SE sent it to PM, PM can still edit before approving
            if change_request.status not in ['pending', 'under_review']:
                return jsonify({"error": "Can only edit pending or under review requests"}), 400
        elif normalized_role == 'estimator':
            # Estimator can edit requests that are assigned to them for approval
            if change_request.approval_required_from != 'estimator':
                return jsonify({"error": "You can only edit requests assigned to you for approval"}), 403

            # Estimator can only edit if status is under_review or approved_by_pm (meaning it's waiting for estimator review)
            if change_request.status not in ['under_review', 'approved_by_pm']:
                return jsonify({"error": "Can only edit requests that are pending your approval"}), 400
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

        # Calculate new materials total cost
        materials_total_cost = 0.0
        materials_data = []
        sub_items_data = []

        for mat in materials:
            quantity = float(mat.get('quantity', 0))
            unit_price = float(mat.get('unit_price', 0))
            total_price = quantity * unit_price
            materials_total_cost += total_price

            materials_data.append({
                'material_name': mat.get('material_name'),
                'quantity': quantity,
                'unit': mat.get('unit', 'nos'),
                'unit_price': unit_price,
                'total_price': total_price,
                'master_material_id': mat.get('master_material_id'),
                'justification': mat.get('justification', '')  # Per-material justification
            })

            sub_items_data.append({
                'sub_item_id': mat.get('sub_item_id'),  # Sub-item ID
                'sub_item_name': mat.get('sub_item_name'),  # Sub-item name (e.g., "Protection")
                'material_name': mat.get('material_name'),  # Material name (e.g., "Bubble Wrap")
                'quantity': quantity,
                'unit': mat.get('unit', 'nos'),
                'unit_price': unit_price,
                'total_price': total_price,
                'is_new': mat.get('master_material_id') is None,
                'reason': mat.get('reason'),
                'justification': mat.get('justification', '')  # Per-material justification
            })

        # Get BOQ details for recalculation
        boq_details = BOQDetails.query.filter_by(boq_id=change_request.boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Recalculate overhead impact
        overhead_impact = calculate_overhead_impact(boq_details, materials_total_cost)

        # Update change request
        change_request.justification = justification
        change_request.materials_data = materials_data
        change_request.sub_items_data = sub_items_data
        change_request.materials_total_cost = materials_total_cost
        change_request.overhead_consumed = overhead_impact['overhead_consumed']
        change_request.overhead_balance_impact = overhead_impact['overhead_balance_impact']
        change_request.new_overhead_remaining = overhead_impact['new_overhead_remaining']
        change_request.is_over_budget = overhead_impact['is_over_budget']
        change_request.cost_increase_amount = overhead_impact['cost_increase_amount']
        change_request.cost_increase_percentage = overhead_impact['cost_increase_percentage']
        change_request.updated_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Change request {cr_id} updated by user {user_id}")

        return jsonify({
            "success": True,
            "message": "Change request updated successfully",
            "cr_id": cr_id,
            "materials_total_cost": round(materials_total_cost, 2)
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

        # PM can reject requests that are under_review from SE
        if normalized_role in ['projectmanager'] and change_request.status == 'under_review':
            # PM can reject requests from Site Engineers
            if change_request.requested_by_role and 'site' in change_request.requested_by_role.lower():
                # This is a valid PM rejection scenario
                pass
            elif change_request.approval_required_from == 'project_manager':
                # This is explicitly assigned to PM
                pass
            else:
                return jsonify({"error": f"PM cannot reject this request. Current approver: {change_request.approval_required_from}"}), 403
        else:
            # Check if request is under review (can reject at any stage)
            if change_request.status not in ['under_review', 'approved_by_pm', 'approved_by_td']:
                return jsonify({"error": "Request must be under review to reject"}), 400

        # For other roles, check if user has permission to reject
        if normalized_role not in ['projectmanager']:
            required_approver = change_request.approval_required_from
            if not workflow_service.can_approve(approver_role, required_approver):
                return jsonify({"error": f"You don't have permission to reject this request. Required: {required_approver}, Your role: {approver_role}"}), 403

        # Get request data
        data = request.get_json() or {}
        rejection_reason = data.get('rejection_reason', '')

        if not rejection_reason or rejection_reason.strip() == '':
            return jsonify({"error": "Rejection reason is required"}), 400

        # Update change request - Record who rejected and at what stage
        change_request.status = 'rejected'
        change_request.rejected_by_user_id = approver_id
        change_request.rejected_by_name = approver_name
        change_request.rejected_at_stage = approver_role
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
            "role": normalized_role,
            "type": "change_request_rejected",
            "sender": approver_name,
            "receiver": change_request.requested_by_name,
            "sender_role": approver_role,
            "receiver_role": change_request.requested_by_role,
            "status": "rejected",
            "cr_id": cr_id,
            "item_name": change_request.item_name or f"CR #{cr_id}",
            "materials_count": len(change_request.materials_data) if change_request.materials_data else 0,
            "total_cost": change_request.materials_total_cost,
            "rejection_reason": rejection_reason,
            "rejected_at_stage": approver_role,
            "comments": f"Rejected by {approver_role.replace('_', ' ').title()}: {rejection_reason}",
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
            existing_history.comments = f"CR #{cr_id} rejected by {approver_role}"
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
                comments=f"CR #{cr_id} rejected by {approver_role}",
                sender_role=approver_role,
                receiver_role=change_request.requested_by_role,
                action_date=datetime.utcnow(),
                created_by=approver_name
            )
            db.session.add(boq_history)

        db.session.commit()

        log.info(f"Change request {cr_id} rejected by {approver_name}")

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


# REMOVED: update_change_request_status - DEPRECATED
# Use send_for_review() instead
# This function has been removed as the endpoint is no longer available
# The send_for_review() function provides better workflow control


def get_item_overhead(boq_id, item_id):
    """
    Get overhead snapshot for a specific BOQ item
    Used for live calculations before creating change request
    GET /api/boq/{boq_id}/item-overhead/{item_id}
    """
    try:
        # Get BOQ details
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Find the specific item
        boq_json = boq_details.boq_details or {}
        items = boq_json.get('items', [])

        item = None
        for itm in items:
            if itm.get('id') == item_id:
                item = itm
                break

        if not item:
            return jsonify({"error": f"Item {item_id} not found in BOQ"}), 404

        # Calculate item overhead
        item_overhead = item.get('overhead', 0)
        if item_overhead == 0:
            # Calculate from percentage if not stored
            overhead_percentage = item.get('overhead_percentage', 10)
            total_cost = item.get('total_cost', 0)
            item_overhead = (total_cost * overhead_percentage) / 100

        # Calculate consumed overhead from approved change requests
        approved_crs = ChangeRequest.query.filter_by(
            boq_id=boq_id,
            item_id=item_id,
            status='approved',
            is_deleted=False
        ).all()

        consumed = 0.0
        for cr in approved_crs:
            consumed += cr.overhead_consumed or 0

        available = item_overhead - consumed

        return jsonify({
            "item_id": item_id,
            "item_name": item.get('name', ''),
            "overhead_allocated": round(item_overhead, 2),
            "overhead_consumed": round(consumed, 2),
            "overhead_available": round(available, 2)
        }), 200

    except Exception as e:
        log.error(f"Error getting item overhead: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


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
