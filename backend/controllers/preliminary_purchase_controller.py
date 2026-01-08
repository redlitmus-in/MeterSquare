"""
Preliminary Purchase Controller - CRUD operations for preliminary purchase requests
Implements simplified workflow: PM → Buyer (skip TD and Estimator approval)
"""
from flask import jsonify, request, g
from models.preliminary_master import PreliminaryPurchaseRequest, BOQPreliminary, PreliminaryMaster
from models.boq import BOQ
from models.project import Project
from models.user import User
from config.db import db
from datetime import datetime
import logging

log = logging.getLogger(__name__)


def create_preliminary_purchase_request():
    """
    Create a new preliminary purchase request
    PM creates request and assigns to a buyer directly

    Expected JSON:
    {
        "boq_id": 123,
        "project_id": 456,
        "buyer_id": 789,  # Required - assign to buyer directly
        "preliminaries": [
            {
                "prelim_id": 1,
                "name": "Site Mobilization",
                "description": "Site setup costs",
                "unit": "nos",
                "quantity": 1,
                "rate": 50000,
                "justification": "Required for project setup"
            }
        ],
        "remarks": "Optional overall remarks"
    }
    """
    try:
        data = request.get_json()

        # Validate required fields
        boq_id = data.get('boq_id')
        project_id = data.get('project_id')
        preliminaries = data.get('preliminaries', [])

        if not boq_id:
            return jsonify({"success": False, "error": "BOQ ID is required"}), 400

        if not project_id:
            return jsonify({"success": False, "error": "Project ID is required"}), 400

        if not preliminaries or len(preliminaries) == 0:
            return jsonify({"success": False, "error": "At least one preliminary item is required"}), 400

        # Verify BOQ exists
        boq = BOQ.query.get(boq_id)
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Verify Project exists
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"success": False, "error": "Project not found"}), 404

        # Get current user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"success": False, "error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username', 'Unknown')
        user_role = current_user.get('role', 'project_manager')

        # Calculate total amount and prepare preliminaries data
        total_amount = 0
        preliminaries_data = []

        for prelim in preliminaries:
            quantity = float(prelim.get('quantity', 1))
            rate = float(prelim.get('rate', 0))
            # Use provided amount if available, otherwise calculate from quantity * rate
            amount = float(prelim.get('amount', 0)) or (quantity * rate)
            allocated_amount = float(prelim.get('allocated_amount', 0))
            total_amount += amount

            preliminaries_data.append({
                'prelim_id': prelim.get('prelim_id'),
                'name': prelim.get('name', ''),
                'description': prelim.get('description', ''),
                'unit': prelim.get('unit', 'nos'),
                'quantity': quantity,
                'rate': rate,
                'amount': amount,  # Purchase amount (editable)
                'allocated_amount': allocated_amount,  # Original BOQ allocated amount
                'justification': prelim.get('justification', '')
            })

        # Create the preliminary purchase request
        ppr = PreliminaryPurchaseRequest(
            boq_id=boq_id,
            project_id=project_id,
            requested_by_user_id=user_id,
            requested_by_name=user_name,
            requested_by_role=user_role,
            request_type='PRELIMINARY_PURCHASE',
            justification=data.get('remarks', ''),
            status='pending',  # Created as pending, PM can assign to buyer later
            preliminaries_data=preliminaries_data,
            total_amount=total_amount,
            created_at=datetime.now()
        )

        db.session.add(ppr)
        db.session.commit()

        log.info(f"Created preliminary purchase request PPR-{ppr.ppr_id} for BOQ {boq_id} by user {user_id}")

        return jsonify({
            "success": True,
            "message": "Preliminary purchase request created successfully",
            "data": ppr.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating preliminary purchase request: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to create preliminary purchase request: {str(e)}"
        }), 500


def get_preliminary_purchase_requests():
    """
    Get preliminary purchase requests based on user role

    Query params:
    - boq_id: Filter by BOQ
    - project_id: Filter by project
    - status: Filter by status (pending, purchased, rejected)
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"success": False, "error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')

        # Build query
        query = PreliminaryPurchaseRequest.query.filter_by(is_deleted=False)

        # Filter by role
        if user_role == 'buyer':
            # Buyers see requests assigned to them
            query = query.filter_by(assigned_to_buyer_user_id=user_id)
        elif user_role == 'projectmanager':
            # PMs see requests they created
            query = query.filter_by(requested_by_user_id=user_id)

        # Apply filters
        boq_id = request.args.get('boq_id')
        project_id = request.args.get('project_id')
        status = request.args.get('status')

        if boq_id:
            query = query.filter_by(boq_id=int(boq_id))

        if project_id:
            query = query.filter_by(project_id=int(project_id))

        if status:
            query = query.filter_by(status=status)

        # Order by created_at descending
        query = query.order_by(PreliminaryPurchaseRequest.created_at.desc())

        # Execute query
        pprs = query.all()

        # Get counts by status
        pending_count = sum(1 for p in pprs if p.status == 'pending')
        purchased_count = sum(1 for p in pprs if p.status == 'purchased')
        rejected_count = sum(1 for p in pprs if p.status == 'rejected')

        return jsonify({
            "success": True,
            "data": [ppr.to_dict() for ppr in pprs],
            "count": len(pprs),
            "summary": {
                "pending": pending_count,
                "purchased": purchased_count,
                "rejected": rejected_count
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching preliminary purchase requests: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch preliminary purchase requests: {str(e)}"
        }), 500


def get_preliminary_purchase_request(ppr_id):
    """Get a single preliminary purchase request by ID"""
    try:
        ppr = PreliminaryPurchaseRequest.query.get(ppr_id)

        if not ppr or ppr.is_deleted:
            return jsonify({"success": False, "error": "Preliminary purchase request not found"}), 404

        # Get BOQ and Project details
        boq = BOQ.query.get(ppr.boq_id)
        project = Project.query.get(ppr.project_id)

        result = ppr.to_dict()
        result['boq_name'] = boq.boq_name if boq else None
        result['project_name'] = project.project_name if project else None

        return jsonify({
            "success": True,
            "data": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching preliminary purchase request: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch preliminary purchase request: {str(e)}"
        }), 500


def complete_preliminary_purchase(ppr_id):
    """
    Mark a preliminary purchase as completed by buyer

    Expected JSON:
    {
        "purchase_notes": "Optional notes about the purchase",
        "vendor_id": 123,  # Optional vendor ID
        "vendor_name": "Vendor Name"  # Optional vendor name
    }
    """
    try:
        ppr = PreliminaryPurchaseRequest.query.get(ppr_id)

        if not ppr or ppr.is_deleted:
            return jsonify({"success": False, "error": "Preliminary purchase request not found"}), 404

        if ppr.status != 'pending':
            return jsonify({"success": False, "error": f"Cannot complete a request with status: {ppr.status}"}), 400

        # Get current user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"success": False, "error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username', 'Unknown')

        data = request.get_json() or {}

        # Update status to purchased
        ppr.status = 'purchased'
        ppr.purchase_completed_by_user_id = user_id
        ppr.purchase_completed_by_name = user_name
        ppr.purchase_completion_date = datetime.now()
        ppr.purchase_notes = data.get('purchase_notes', '')

        # Set vendor if provided
        if data.get('vendor_id'):
            ppr.selected_vendor_id = data.get('vendor_id')
            ppr.selected_vendor_name = data.get('vendor_name', '')
            ppr.vendor_selection_date = datetime.now()

        ppr.updated_at = datetime.now()

        db.session.commit()

        log.info(f"Preliminary purchase PPR-{ppr_id} marked as completed by buyer {user_id}")

        return jsonify({
            "success": True,
            "message": "Preliminary purchase completed successfully",
            "data": ppr.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error completing preliminary purchase: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to complete preliminary purchase: {str(e)}"
        }), 500


def reject_preliminary_purchase(ppr_id):
    """
    Reject a preliminary purchase request

    Expected JSON:
    {
        "rejection_reason": "Reason for rejection"
    }
    """
    try:
        ppr = PreliminaryPurchaseRequest.query.get(ppr_id)

        if not ppr or ppr.is_deleted:
            return jsonify({"success": False, "error": "Preliminary purchase request not found"}), 404

        if ppr.status != 'pending':
            return jsonify({"success": False, "error": f"Cannot reject a request with status: {ppr.status}"}), 400

        data = request.get_json() or {}
        rejection_reason = data.get('rejection_reason', '')

        if not rejection_reason:
            return jsonify({"success": False, "error": "Rejection reason is required"}), 400

        # Get current user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"success": False, "error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username', 'Unknown')

        # Update status to rejected
        ppr.status = 'rejected'
        ppr.rejection_reason = rejection_reason
        ppr.rejected_by_user_id = user_id
        ppr.rejected_by_name = user_name
        ppr.updated_at = datetime.now()

        db.session.commit()

        log.info(f"Preliminary purchase PPR-{ppr_id} rejected by user {user_id}")

        return jsonify({
            "success": True,
            "message": "Preliminary purchase request rejected",
            "data": ppr.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting preliminary purchase: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to reject preliminary purchase: {str(e)}"
        }), 500


def get_boq_selected_preliminaries_for_purchase(boq_id):
    """
    Get the selected preliminaries for a BOQ that can be used for purchase requests
    Returns only the preliminaries that were checked/selected in the BOQ
    Also includes allocated amount from BOQ details JSON
    """
    try:
        from models.boq import BOQDetails

        # Get BOQ to verify it exists
        boq = BOQ.query.get(boq_id)
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Get BOQ details from BOQDetails table for cost_details
        boq_details_record = BOQDetails.query.filter_by(boq_id=boq_id).first()
        boq_details_json = boq_details_record.boq_details if boq_details_record else {}

        # Get total preliminary amount from cost_details
        stored_preliminaries = boq_details_json.get('preliminaries', {})
        total_preliminary_amount = float(stored_preliminaries.get('cost_details', {}).get('amount', 0) or 0)

        log.info(f"BOQ {boq_id}: Total preliminary amount from cost_details: {total_preliminary_amount}")

        result = []

        # Get selected preliminaries from boq_preliminaries junction table
        # This is the authoritative source for which preliminaries are selected
        selected = db.session.query(
            BOQPreliminary, PreliminaryMaster
        ).join(
            PreliminaryMaster, BOQPreliminary.prelim_id == PreliminaryMaster.prelim_id
        ).filter(
            BOQPreliminary.boq_id == boq_id,
            BOQPreliminary.is_checked == True,
            PreliminaryMaster.is_deleted == False,
            PreliminaryMaster.is_active == True
        ).order_by(PreliminaryMaster.display_order.asc()).all()

        log.info(f"BOQ {boq_id}: Found {len(selected)} selected preliminaries in junction table")

        # Calculate per-item amount if we have a total
        num_items = len(selected)
        per_item_amount = total_preliminary_amount / num_items if num_items > 0 and total_preliminary_amount > 0 else 0

        for idx, (boq_prelim, prelim_master) in enumerate(selected):
            result.append({
                'prelim_id': prelim_master.prelim_id,
                'name': prelim_master.name,
                'description': prelim_master.description,
                'unit': prelim_master.unit or 'nos',
                'rate': total_preliminary_amount if num_items == 1 else per_item_amount,
                'allocated_amount': total_preliminary_amount if num_items == 1 else per_item_amount,
                'allocated_quantity': 1,
                'display_order': prelim_master.display_order or idx
            })

        # If junction table is empty, try getting from JSON items as fallback
        if not result:
            log.info(f"BOQ {boq_id}: No items in junction table, checking JSON items")
            prelim_items_from_boq = stored_preliminaries.get('items', [])

            for idx, item in enumerate(prelim_items_from_boq):
                # Only include checked/selected items
                is_checked = item.get('checked', False) or item.get('selected', False) or item.get('is_checked', True)
                if not is_checked:
                    continue

                prelim_id = item.get('prelim_id')
                name = item.get('name', '')
                description = item.get('description', '')
                unit = item.get('unit', 'nos')
                rate = float(item.get('rate', 0) or 0)
                quantity = float(item.get('quantity', 1) or 1)

                # Calculate allocated amount
                amount = item.get('amount')
                if amount:
                    allocated_amount = float(amount)
                else:
                    allocated_amount = rate * quantity if rate > 0 else per_item_amount

                result.append({
                    'prelim_id': prelim_id or f'boq_prelim_{idx}',
                    'name': name or description[:50] if description else f'Preliminary {idx + 1}',
                    'description': description,
                    'unit': unit,
                    'rate': rate if rate > 0 else allocated_amount,
                    'allocated_amount': allocated_amount,
                    'allocated_quantity': quantity,
                    'display_order': idx
                })

        log.info(f"BOQ {boq_id}: Returning {len(result)} preliminaries for purchase")

        return jsonify({
            "success": True,
            "boq_id": boq_id,
            "data": result,
            "count": len(result),
            "total_preliminary_amount": total_preliminary_amount
        }), 200

    except Exception as e:
        log.error(f"Error fetching selected preliminaries for purchase: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch selected preliminaries: {str(e)}"
        }), 500


def delete_preliminary_purchase_request(ppr_id):
    """Soft delete a preliminary purchase request"""
    try:
        ppr = PreliminaryPurchaseRequest.query.get(ppr_id)

        if not ppr:
            return jsonify({"success": False, "error": "Preliminary purchase request not found"}), 404

        if ppr.is_deleted:
            return jsonify({"success": False, "error": "Request already deleted"}), 400

        # Only allow deletion if status is pending
        if ppr.status != 'pending':
            return jsonify({"success": False, "error": "Only pending requests can be deleted"}), 400

        # Soft delete
        ppr.is_deleted = True
        ppr.updated_at = datetime.now()

        db.session.commit()

        log.info(f"Preliminary purchase request PPR-{ppr_id} deleted")

        return jsonify({
            "success": True,
            "message": "Preliminary purchase request deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting preliminary purchase request: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to delete preliminary purchase request: {str(e)}"
        }), 500
