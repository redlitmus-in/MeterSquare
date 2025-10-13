from flask import request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError
from config.db import db
from models.change_request import ChangeRequest
from models.boq import BOQ, BOQDetails, BOQHistory
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
                'master_material_id': mat.get('master_material_id')  # Optional
            })

        # Calculate overhead impact
        overhead_impact = calculate_overhead_impact(boq_details, materials_total_cost)

        if not overhead_impact:
            return jsonify({"error": "Failed to calculate overhead impact"}), 500

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
            materials_data=materials_data,
            materials_total_cost=materials_total_cost,
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

        db.session.add(change_request)
        db.session.commit()

        log.info(f"Change request {change_request.cr_id} created by {user_name} for BOQ {boq_id}")

        # Prepare response
        response = {
            "success": True,
            "message": "Change request created successfully",
            "cr_id": change_request.cr_id,
            "status": "pending",
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
            "approval_required_from": None,  # Not set until sent for review
            "project_name": project.project_name,
            "boq_name": boq.boq_name,
            "note": "Request created. Click 'Send for Review' to submit to approver."
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
    SE → Sends to PM
    PM → Sends to Estimator or TD (based on budget threshold)

    POST /api/change-request/{cr_id}/send-for-review
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

        # Determine where to route based on requester role using workflow service
        try:
            next_role, next_approver = workflow_service.determine_initial_approver(user_role, change_request)
        except ValueError as e:
            log.error(f"Error determining approver: {str(e)}")
            return jsonify({"error": str(e)}), 403

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
            # SE sees only their own requests (sent to PM)
            query = query.filter_by(requested_by_user_id=user_id)
        elif user_role in ['projectmanager', 'project_manager']:
            # PM sees:
            # 1. Their own requests (sent to Estimator)
            # 2. Requests from SEs that need PM approval (approval_required_from = 'project_manager')
            from sqlalchemy import or_
            query = query.filter(
                or_(
                    ChangeRequest.requested_by_user_id == user_id,
                    ChangeRequest.approval_required_from == 'project_manager'
                )
            )
        elif user_role == 'estimator':
            # Estimator sees requests where approval_required_from = 'estimator'
            # This includes: PM direct requests (within budget) AND TD-approved requests
            query = query.filter_by(approval_required_from='estimator')
        elif user_role in ['technical_director', 'technicaldirector']:
            # TD sees requests where approval_required_from = 'technical_director'
            # This includes: PM requests over budget OR over 50k
            query = query.filter_by(approval_required_from='technical_director')
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

            # Add BOQ name
            if cr.boq:
                cr_dict['boq_name'] = cr.boq.boq_name

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

        # Check if request is under review
        if change_request.status not in ['under_review', 'approved_by_pm', 'approved_by_td']:
            return jsonify({"error": "Request must be sent for review first"}), 400

        # Validate workflow state
        is_valid, error_msg = workflow_service.validate_workflow_state(change_request, 'approve')
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        # Check if user has permission to approve using workflow service
        required_approver = change_request.approval_required_from
        if not workflow_service.can_approve(approver_role, required_approver):
            return jsonify({"error": f"You don't have permission to approve this request. Required: {required_approver}"}), 403

        # Get request data
        data = request.get_json() or {}
        comments = data.get('comments', '')

        # Normalize role for consistent comparison
        normalized_role = workflow_service.normalize_role(approver_role)

        # Multi-stage approval logic
        if normalized_role in ['projectmanager']:
            # PM approves - route to TD or Estimator based on budget
            change_request.pm_approved_by_user_id = approver_id
            change_request.pm_approved_by_name = approver_name
            change_request.pm_approval_date = datetime.utcnow()
            change_request.status = CR_CONFIG.STATUS_APPROVED_BY_PM

            # Determine next approver using workflow service
            next_role, next_approver = workflow_service.determine_next_approver_after_pm(change_request)
            change_request.approval_required_from = next_role
            change_request.current_approver_role = next_role

            db.session.commit()

            log.info(f"PM approved CR {cr_id}, routing to {next_approver}")

            return jsonify({
                "success": True,
                "message": f"Approved by PM. Forwarded to {next_approver}",
                "status": CR_CONFIG.STATUS_APPROVED_BY_PM,
                "next_approver": next_approver
            }), 200

        elif normalized_role in ['technicaldirector', 'technical_director']:
            # TD approves - route to Estimator
            change_request.td_approved_by_user_id = approver_id
            change_request.td_approved_by_name = approver_name
            change_request.td_approval_date = datetime.utcnow()
            change_request.status = CR_CONFIG.STATUS_APPROVED_BY_TD

            # Always route to Estimator after TD approval
            next_role, next_approver = workflow_service.determine_next_approver_after_td()
            change_request.approval_required_from = next_role
            change_request.current_approver_role = next_role

            db.session.commit()

            log.info(f"TD approved CR {cr_id}, routing to Estimator")

            return jsonify({
                "success": True,
                "message": "Approved by TD. Forwarded to Estimator",
                "status": CR_CONFIG.STATUS_APPROVED_BY_TD,
                "next_approver": next_approver
            }), 200

        elif normalized_role == 'estimator':
            # Estimator approves - FINAL APPROVAL, merge to BOQ
            change_request.approved_by_user_id = approver_id
            change_request.approved_by_name = approver_name
            change_request.approval_date = datetime.utcnow()
            change_request.status = CR_CONFIG.STATUS_APPROVED
            change_request.updated_at = datetime.utcnow()

            log.info(f"Estimator approved CR {cr_id}, merging to BOQ")

            # Now merge materials into BOQ
            boq_details = BOQDetails.query.filter_by(boq_id=change_request.boq_id, is_deleted=False).first()
            if not boq_details:
                db.session.rollback()
                return jsonify({"error": "BOQ details not found"}), 404

            # Get existing items
            boq_json = boq_details.boq_details or {}
            existing_items = boq_json.get('items', [])

            # Add materials as a new item entry
            materials = change_request.materials_data or []

            # Create a new item for the extra materials
            new_item = {
                'item_name': f'Extra Materials - CR #{change_request.cr_id}',
                'description': change_request.justification,
                'work_type': 'extra_materials',
                'materials': materials,
                'labour': [],
                'totalMaterialCost': change_request.materials_total_cost,
                'totalLabourCost': 0,
                'base_cost': change_request.materials_total_cost,
                'overhead_percentage': change_request.original_overhead_percentage,
                'overhead_amount': change_request.overhead_consumed,
                'profit_margin_percentage': change_request.original_profit_percentage,
                'profit_margin_amount': change_request.profit_impact,
                'total_cost': change_request.materials_total_cost + change_request.overhead_consumed,
                'selling_price': change_request.materials_total_cost + change_request.overhead_consumed + change_request.profit_impact,
                'change_request_id': change_request.cr_id,  # Link back to change request
                'is_extra_purchase': True  # Flag for identification
            }

            # Append new item
            existing_items.append(new_item)

            # Update BOQ details
            boq_json['items'] = existing_items

            # Recalculate summary
            total_material_cost = sum(item.get('totalMaterialCost', 0) for item in existing_items)
            total_labour_cost = sum(item.get('totalLabourCost', 0) for item in existing_items)
            total_cost = sum(item.get('selling_price', 0) for item in existing_items)

            boq_json['summary'] = {
                'total_items': len(existing_items),
                'total_materials': sum(len(item.get('materials', [])) for item in existing_items),
                'total_labour': sum(len(item.get('labour', [])) for item in existing_items),
                'total_material_cost': total_material_cost,
                'total_labour_cost': total_labour_cost,
                'total_cost': total_cost,
                'selling_price': total_cost
            }

            boq_details.boq_details = boq_json
            boq_details.total_cost = total_cost
            boq_details.total_items = len(existing_items)
            boq_details.last_modified_by = approver_name
            boq_details.last_modified_at = datetime.utcnow()

            flag_modified(boq_details, 'boq_details')

            db.session.commit()

            log.info(f"Change request {cr_id} approved by {approver_name} and merged into BOQ {change_request.boq_id}")

            return jsonify({
                "success": True,
                "message": "Change request approved and materials added to BOQ",
                "cr_id": cr_id,
                "status": "approved",
                "approved_by": approver_name,
                "approval_date": change_request.approval_date.isoformat() if change_request.approval_date else None,
                "boq_updated": True
            }), 200

        else:
            return jsonify({"error": "Invalid approver role"}), 403

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

        # Check if request is under review (can reject at any stage)
        if change_request.status not in ['under_review', 'approved_by_pm', 'approved_by_td']:
            return jsonify({"error": "Request must be under review to reject"}), 400

        # Check if user has permission to reject
        required_approver = change_request.approval_required_from
        if required_approver == 'project_manager' and approver_role not in ['projectmanager', 'project_manager', 'admin']:
            return jsonify({"error": "Only Project Manager can reject this request"}), 403
        elif required_approver == 'estimator' and approver_role not in ['estimator', 'admin']:
            return jsonify({"error": "Only Estimator can reject this request"}), 403
        elif required_approver == 'technical_director' and approver_role not in ['technical_director', 'technicaldirector', 'admin']:
            return jsonify({"error": "Only Technical Director can reject this request"}), 403

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


def get_extra_materials():
    """
    Get extra material requests (separate from BOQ view)
    Filters: project_id, area_id, status
    GET /api/change_request/extra_materials
    """
    try:
        current_user = g.get("user")
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')
        user_id = current_user.get('user_id')

        # Build query
        query = ChangeRequest.query.filter_by(
            request_type='EXTRA_MATERIALS',
            is_deleted=False
        )

        # Apply filters from query params
        project_id = request.args.get('project_id')
        area_id = request.args.get('area_id')
        status = request.args.get('status')

        if project_id:
            query = query.filter_by(project_id=int(project_id))
        if status:
            query = query.filter_by(status=status)

        # Role-based filtering
        if user_role in ['siteengineer', 'sitesupervisor']:
            query = query.filter_by(requested_by_user_id=user_id)
        elif user_role == 'projectmanager':
            # Get projects assigned to PM
            projects = Project.query.filter_by(pm_id=user_id, is_deleted=False).all()
            project_ids = [p.project_id for p in projects]
            query = query.filter(ChangeRequest.project_id.in_(project_ids))

        extra_materials = query.order_by(ChangeRequest.created_at.desc()).all()

        # Format response
        result = []
        for em in extra_materials:
            # Get project and area info
            project = Project.query.get(em.project_id)

            # Parse sub_items_data for display
            sub_items = em.sub_items_data or []
            for sub_item in sub_items:
                result.append({
                    'id': em.cr_id,
                    'project_id': em.project_id,
                    'project_name': project.project_name if project else 'Unknown',
                    'area_id': 1,  # Placeholder - would come from area table
                    'area_name': project.floor_name if project else 'Main Area',
                    'boq_item_id': em.item_id,
                    'boq_item_name': em.item_name,
                    'sub_item_id': sub_item.get('sub_item_id'),
                    'sub_item_name': sub_item.get('name') or sub_item.get('sub_item_name'),
                    'quantity': sub_item.get('qty') or sub_item.get('quantity'),
                    'unit_rate': sub_item.get('unit_price'),
                    'total_cost': (sub_item.get('qty', 0) or sub_item.get('quantity', 0)) * sub_item.get('unit_price', 0),
                    'reason_for_new_sub_item': sub_item.get('new_reason'),
                    'requested_by': em.requested_by_name,
                    'overhead_percent': em.percentage_of_item_overhead,
                    'status': em.status,
                    'created_at': em.created_at.isoformat() if em.created_at else None,
                    'remarks': em.justification
                })

        return jsonify({"extra_materials": result}), 200

    except Exception as e:
        log.error(f"Error getting extra materials: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def create_extra_material():
    """
    Create extra material request with proper routing
    Routes: PM → Purchase → TD (>40%) or PM → Estimator (≤40%)
    POST /api/change_request/extra_materials/create
    """
    try:
        data = request.get_json()
        current_user = g.get("user")

        # Create sub_items array with proper structure
        sub_items = [{
            'sub_item_id': data.get('sub_item_id'),
            'name': data.get('sub_item_name'),
            'qty': data.get('quantity'),
            'unit': data.get('unit'),
            'unit_price': data.get('unit_rate'),
            'is_new': data.get('sub_item_id') is None,
            'new_reason': data.get('reason')
        }]

        # Create change request using existing logic
        cr_data = {
            'boq_id': data.get('boq_item_id'),  # May need to map from item_id to boq_id
            'project_id': data.get('project_id'),
            'area_id': data.get('area_id'),
            'item_id': data.get('boq_item_id'),
            'item_name': data.get('boq_item_name', ''),
            'sub_items': sub_items,
            'justification': data.get('remarks', ''),
            'requester_id': current_user.get('user_id')
        }

        # Use existing create_change_request logic
        request._cached_json = (cr_data, cr_data)  # Hack to pass data through
        response = create_change_request()

        # Extract response data
        response_data, status_code = response

        if status_code == 200 or status_code == 201:
            return jsonify({"success": True, "message": "Extra material request created"}), 200
        else:
            return response_data, status_code

    except Exception as e:
        log.error(f"Error creating extra material: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def approve_extra_material(id):
    """
    Approve extra material request
    Roles allowed: PM, Purchase, Estimator, TD
    PATCH /api/change_request/extra_materials/approve/:id
    """
    try:
        # Use existing approval logic
        return approve_change_request(id)

    except Exception as e:
        log.error(f"Error approving extra material: {str(e)}")
        return jsonify({"error": str(e)}), 500
