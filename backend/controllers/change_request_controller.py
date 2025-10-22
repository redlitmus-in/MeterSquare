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

        # Get current user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username') or 'User'
        user_role = current_user.get('role_name', 'user')

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
                'justification': mat.get('justification', '')  # Per-material justification
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
                    'sub_item_id': mat.get('sub_item_id') or mat.get('master_material_id'),
                    'sub_item_name': mat.get('sub_item_name') or mat.get('material_name'),
                    'material_name': mat.get('material_name'),
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

        # Calculate percentage of item overhead
        percentage_of_item_overhead = 0.0
        if overhead_impact['original_overhead_allocated'] > 0:
            percentage_of_item_overhead = (materials_total_cost / overhead_impact['original_overhead_allocated']) * 100

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
    SE → Sends to PM (always)
    PM → Must explicitly choose TD or Estimator via route_to parameter

    POST /api/change-request/{cr_id}/send-for-review
    Body (optional for PM):
    {
        "route_to": "technical_director" or "estimator"  // PM only - if not provided, auto-routes based on 40% threshold
    }
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_role = current_user.get('role_name', '').lower()

        log.info(f"User {user_id} attempting to send change request. Role: '{user_role}'")

        # Get change request
        change_request = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not change_request:
            return jsonify({"error": "Change request not found"}), 404

        # Check ownership - only creator can send for review
        if change_request.requested_by_user_id != user_id:
            return jsonify({"error": "You can only send your own requests for review"}), 403

        # Validate workflow state
        is_valid, error_msg = workflow_service.validate_workflow_state(change_request, 'send')
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        # Get request data for PM explicit routing
        data = request.get_json() or {}
        route_to = data.get('route_to')  # PM can specify where to send

        normalized_role = workflow_service.normalize_role(user_role)

        # Determine where to route based on requester role
        if normalized_role in ['siteengineer', 'sitesupervisor', 'site_engineer', 'site_supervisor']:
            # SE always sends to PM
            next_role = CR_CONFIG.ROLE_PROJECT_MANAGER
            next_approver = "Project Manager"
            log.info(f"SE/SS request - routing to PM")

        elif normalized_role in ['projectmanager', 'project_manager']:
            # PM can explicitly choose route_to, or auto-route based on 40% threshold
            if route_to:
                # PM explicitly chose where to send
                if route_to == 'technical_director':
                    next_role = CR_CONFIG.ROLE_TECHNICAL_DIRECTOR
                    next_approver = "Technical Director"
                    log.info(f"PM explicitly routing to TD")
                elif route_to == 'estimator':
                    next_role = CR_CONFIG.ROLE_ESTIMATOR
                    next_approver = "Estimator"
                    log.info(f"PM explicitly routing to Estimator")
                else:
                    return jsonify({"error": f"Invalid route_to value: {route_to}. Must be 'technical_director' or 'estimator'"}), 400
            else:
                # Auto-route based on 40% threshold
                next_role, next_approver = workflow_service.determine_initial_approver(user_role, change_request)
                log.info(f"PM auto-routing based on {change_request.percentage_of_item_overhead}% overhead")
        else:
            log.error(f"Invalid role '{user_role}' attempting to send change request")
            return jsonify({"error": f"Invalid role for sending request: {user_role}. Only Site Engineers and Project Managers can create change requests."}), 403

        # Update change request
        change_request.approval_required_from = next_role
        change_request.current_approver_role = next_role
        change_request.status = CR_CONFIG.STATUS_UNDER_REVIEW
        change_request.updated_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Change request {cr_id} sent for review to {next_approver} (role: {next_role})")

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
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def get_all_change_requests():
    """
    Get all change requests (filtered by role)
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

        # Base query
        query = ChangeRequest.query.filter_by(is_deleted=False)

        # Role-based filtering
        if user_role in ['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']:
            # SE sees ALL requests from their assigned projects (both PM and other SE requests)
            # This helps them avoid duplicate requests and coordinate better

            # Get projects assigned to this SE/SS (site_supervisor_id in Project table)
            se_project_ids = db.session.query(Project.project_id).filter_by(site_supervisor_id=user_id, is_deleted=False).all()
            se_project_ids = [p[0] for p in se_project_ids] if se_project_ids else []

            # SE/SS should see ALL requests from their projects (including PM requests)
            if se_project_ids:
                query = query.filter(
                    ChangeRequest.project_id.in_(se_project_ids)  # All requests from SE's projects
                )
            else:
                # Fallback: show only own requests if no project assignment found
                query = query.filter_by(requested_by_user_id=user_id)
        elif user_role in ['projectmanager', 'project_manager']:
            # PM sees:
            # 1. Their own requests (all statuses)
            # 2. Requests from SEs that need PM approval (approval_required_from = 'project_manager')
            # 3. Requests approved by PM (where pm_approved_by_user_id is set) - stays visible in approved tab
            # 4. ALL requests from their projects (for extra materials page)
            from sqlalchemy import or_, and_

            # Get projects assigned to this PM
            pm_projects = Project.query.filter_by(user_id=user_id).all()
            pm_project_ids = [p.project_id for p in pm_projects]

            query = query.filter(
                or_(
                    ChangeRequest.requested_by_user_id == user_id,  # PM's own requests
                    ChangeRequest.approval_required_from == 'project_manager',  # Requests needing PM approval
                    ChangeRequest.pm_approved_by_user_id == user_id,  # Requests approved by this PM (shows in approved tab even after TD/Est/Buyer approval)
                    ChangeRequest.project_id.in_(pm_project_ids) if pm_project_ids else False  # All requests from PM's projects
                )
            )
        elif user_role == 'estimator':
            # Estimator sees:
            # 1. Requests where approval_required_from = 'estimator' (pending estimator approval)
            # 2. Requests approved by estimator that are assigned_to_buyer (approved tab)
            # 3. Requests approved by estimator that are purchase_completed (completed tab)
            from sqlalchemy import or_
            query = query.filter(
                or_(
                    ChangeRequest.approval_required_from == 'estimator',  # Pending requests
                    ChangeRequest.approved_by_user_id.isnot(None)  # Approved by estimator
                )
            )
        elif user_role in ['technical_director', 'technicaldirector']:
            # TD sees:
            # 1. Requests where approval_required_from = 'technical_director' (pending TD approval)
            # 2. Requests approved by TD that are assigned_to_buyer (approved tab)
            # 3. Requests approved by TD that are purchase_completed (completed tab)
            from sqlalchemy import or_
            query = query.filter(
                or_(
                    ChangeRequest.approval_required_from == 'technical_director',  # Pending requests
                    ChangeRequest.td_approved_by_user_id.isnot(None)  # Approved by TD
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
            # PM approves - route to TD or Buyer based on percentage threshold
            change_request.pm_approved_by_user_id = approver_id
            change_request.pm_approved_by_name = approver_name
            change_request.pm_approval_date = datetime.utcnow()
            change_request.status = CR_CONFIG.STATUS_APPROVED_BY_PM

            # Determine next approver based on 40% threshold
            percentage = change_request.percentage_of_item_overhead or 0

            if percentage > 40:
                # Route to TD for high-value requests
                next_role = CR_CONFIG.ROLE_TECHNICAL_DIRECTOR
                next_approver = 'Technical Director'
                change_request.approval_required_from = next_role
                change_request.current_approver_role = next_role
                log.info(f"PM approved CR {cr_id} with {percentage:.2f}% overhead (>40%), routing to TD")
            else:
                # Route to Estimator for low-value requests
                next_role = CR_CONFIG.ROLE_ESTIMATOR
                next_approver = 'Estimator'
                change_request.approval_required_from = next_role
                change_request.current_approver_role = next_role
                log.info(f"PM approved CR {cr_id} with {percentage:.2f}% overhead (≤40%), routing to Estimator")

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

        log.info(f"Buyer {buyer_name} marked purchase complete for CR {cr_id}, merging to BOQ")

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
        existing_materials = target_item.get('materials', [])

        for material in materials:
            # Mark this material as from change request with planned_quantity = 0
            new_material = {
                'material_name': material.get('material_name'),
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

        db.session.commit()

        log.info(f"Buyer {buyer_name} completed purchase for CR {cr_id} and merged into BOQ {change_request.boq_id}")

        return jsonify({
            "success": True,
            "message": "Purchase completed and materials merged to BOQ",
            "cr_id": cr_id,
            "status": CR_CONFIG.STATUS_PURCHASE_COMPLETE,
            "purchase_completed_by": buyer_name,
            "purchase_completion_date": change_request.purchase_completion_date.isoformat() if change_request.purchase_completion_date else None,
            "boq_updated": True
        }), 200

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
                'original_total': cr.new_base_cost - cr.materials_total_cost if cr.new_base_cost else 0,
                'new_total_if_approved': cr.new_total_cost,
                'increase_amount': cr.cost_increase_amount,
                'increase_percentage': cr.cost_increase_percentage
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

        # PM can edit any pending request, SE can only edit their own
        if user_role in ['projectmanager', 'project_manager']:
            # PM can edit any pending or under_review request in their projects
            # under_review means SE sent it to PM, PM can still edit before approving
            if change_request.status not in ['pending', 'under_review']:
                return jsonify({"error": "Can only edit pending or under review requests"}), 400
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
                'sub_item_name': mat.get('material_name'),
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
