from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from models.preliminary_master import BOQInternalRevision
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload  # ✅ PERFORMANCE: Eager loading for N+1 fix
from sqlalchemy import or_, and_, func
from sqlalchemy import func, and_  # For aggregations and conditions
from datetime import datetime  # For datetime.min in sorting
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role
from utils.comprehensive_notification_service import notification_service

log = get_logger()


def calculate_boq_financial_data(boq, boq_details):
    """
    Calculate financial data from BOQ and BOQDetails
    Returns dict with total_cost, material_cost, labour_cost, etc.
    """
    if not boq_details or not boq_details.boq_details:
        return {
            'total_cost': 0,
            'total_material_cost': 0,
            'total_labour_cost': 0,
            'items_count': 0
        }

    total_material_cost = 0
    total_labour_cost = 0
    total_selling_price = 0
    items_count = 0

    boq_json = boq_details.boq_details
    items = boq_json.get('items', [])
    items_count = len(items)

    for item in items:
        # Check for sub_items (new format)
        if 'sub_items' in item and item.get('sub_items'):
            for sub_item in item.get('sub_items', []):
                # Materials
                for mat in sub_item.get('materials', []):
                    total_material_cost += mat.get('total_price', 0) or 0
                # Labour
                for lab in sub_item.get('labour', []):
                    lab_cost = lab.get('total_cost') or (lab.get('hours', 0) * lab.get('rate_per_hour', 0))
                    total_labour_cost += lab_cost
                # Selling price from quantity * rate
                sub_quantity = sub_item.get('quantity', 0) or 0
                sub_rate = sub_item.get('rate', 0) or 0
                total_selling_price += sub_quantity * sub_rate
        else:
            # Old format
            for mat in item.get('materials', []):
                total_material_cost += mat.get('total_price', 0) or 0
            for lab in item.get('labour', []):
                lab_cost = lab.get('total_cost') or (lab.get('hours', 0) * lab.get('rate_per_hour', 0))
                total_labour_cost += lab_cost

    # Use database total_cost if no selling price calculated
    final_total = total_selling_price if total_selling_price > 0 else (float(boq_details.total_cost) if boq_details.total_cost else 0)

    return {
        'total_cost': final_total,
        'selling_price': final_total,
        'total_material_cost': total_material_cost,
        'total_labour_cost': total_labour_cost,
        'items_count': items_count,
        'material_count': boq_details.total_materials if boq_details.total_materials else 0,
        'labour_count': boq_details.total_labour if boq_details.total_labour else 0
    }

def calculate_boq_financial_data(boq, boq_details):
    """
    Helper function to calculate financial data from BOQ details
    Returns a dict with financial fields needed by frontend
    """
    total_material_cost = 0
    total_labour_cost = 0
    total_selling_price = 0
    overhead_percentage = 0
    profit_margin = 0

    log.info(f"🔍 [Financial Calc] BOQ {boq.boq_id if boq else 'Unknown'}: Starting calculation")
    log.info(f"🔍 [Financial Calc] Has boq_details: {boq_details is not None}, Has boq_details.boq_details: {boq_details.boq_details is not None if boq_details else False}")

    if boq_details and boq_details.boq_details and "items" in boq_details.boq_details:
        items = boq_details.boq_details["items"]
        log.info(f"🔍 [Financial Calc] BOQ {boq.boq_id if boq else 'Unknown'}: Processing {len(items)} items")
        for item in items:
            item_materials_cost = 0
            item_labour_cost = 0
            item_client_amount = 0  # CLIENT SELLING PRICE

            # Check if item has sub_items (new format)
            if "sub_items" in item and item.get("sub_items"):
                log.debug(f"🔍 [Item Format] Item '{item.get('item_name', 'Unknown')}' has {len(item.get('sub_items', []))} sub_items")
                # NEW FORMAT: Client amount comes from sub_item quantity × rate
                for sub_item in item.get("sub_items", []):
                    # Calculate CLIENT AMOUNT (what client pays) = quantity × rate
                    sub_quantity = sub_item.get("quantity", 0)
                    sub_rate = sub_item.get("rate", 0)
                    sub_client_amount = sub_quantity * sub_rate
                    item_client_amount += sub_client_amount

                    # Sum up materials cost from sub_item (for internal tracking)
                    materials = sub_item.get("materials", [])
                    for mat in materials:
                        mat_cost = mat.get("total_price", 0)
                        total_material_cost += mat_cost
                        item_materials_cost += mat_cost
                    # Sum up labour cost from sub_item (for internal tracking)
                    # Check both "labour" and "labor" spellings
                    labour = sub_item.get("labour", sub_item.get("labor", []))
                    for lab in labour:
                        # Try multiple field names for labour cost (total_amount is the actual field used)
                        lab_cost = lab.get("total_amount", 0) or lab.get("total_cost", 0) or lab.get("totalCost", 0) or lab.get("total_price", 0) or lab.get("amount", 0)
                        log.debug(f"🔍 [Labour] Sub-item labour: {lab}, calculated_cost: {lab_cost}")
                        total_labour_cost += lab_cost
                        item_labour_cost += lab_cost
            else:
                # OLD FORMAT: materials/labour are at item level
                log.debug(f"🔍 [Item Format] Item '{item.get('item_name', 'Unknown')}' using OLD FORMAT")
                materials = item.get("materials", [])
                log.debug(f"🔍 [Old Format] Materials count: {len(materials)}")
                for mat in materials:
                    mat_cost = mat.get("total_price", 0)
                    total_material_cost += mat_cost
                    item_materials_cost += mat_cost
                # Check both "labour" and "labor" spellings
                labour = item.get("labour", item.get("labor", []))
                log.debug(f"🔍 [Old Format] Labour count: {len(labour)}, Labour data: {labour}")
                for lab in labour:
                    # Try multiple field names for labour cost (total_amount is the actual field used)
                    lab_cost = lab.get("total_amount", 0) or lab.get("total_cost", 0) or lab.get("totalCost", 0) or lab.get("total_price", 0) or lab.get("amount", 0)
                    log.debug(f"🔍 [Old Format Labour] Entry: {lab}, calculated_cost: {lab_cost}")
                    total_labour_cost += lab_cost
                    item_labour_cost += lab_cost

            # Determine item selling price (client amount)
            item_selling_price = 0

            # For NEW FORMAT with sub_items, use calculated client amount
            if item_client_amount > 0:
                item_selling_price = item_client_amount
            else:
                # For OLD FORMAT or if no sub_items, try to get from item fields
                item_selling_price = item.get("selling_price", 0) or item.get("estimatedSellingPrice", 0)

                # If still no selling price, calculate from base cost + markup
                if not item_selling_price or item_selling_price == 0:
                    item_base_cost = item_materials_cost + item_labour_cost
                    item_overhead = item.get("overhead_amount", 0)
                    item_profit = item.get("profit_margin_amount", 0)
                    item_misc = item.get("miscellaneous_amount", 0)

                    # If amounts are not present, calculate from percentages
                    if item_overhead == 0 and item.get("overhead_percentage", 0) > 0:
                        item_overhead = item_base_cost * (item.get("overhead_percentage", 0) / 100)
                    if item_profit == 0 and item.get("profit_margin_percentage", 0) > 0:
                        item_profit = item_base_cost * (item.get("profit_margin_percentage", 0) / 100)
                    if item_misc == 0 and item.get("miscellaneous_percentage", 0) > 0:
                        item_misc = item_base_cost * (item.get("miscellaneous_percentage", 0) / 100)

                    item_selling_price = item_base_cost + item_overhead + item_profit + item_misc

            total_selling_price += item_selling_price

            # Get overhead and profit percentages (use first item's values)
            if overhead_percentage == 0:
                overhead_percentage = item.get("overhead_percentage", 0)
            if profit_margin == 0:
                profit_margin = item.get("profit_margin", 0) or item.get("profit_margin_percentage", 0)

    # Use calculated selling price if available, otherwise fall back to database value
    items_subtotal = total_selling_price if total_selling_price > 0 else (float(boq_details.total_cost) if boq_details and boq_details.total_cost else 0.0)

    # Get preliminaries amount from BOQ details JSON
    preliminaries_amount = 0
    if boq_details and boq_details.boq_details:
        preliminaries = boq_details.boq_details.get("preliminaries", {})
        if preliminaries and "cost_details" in preliminaries:
            preliminaries_amount = float(preliminaries.get("cost_details", {}).get("amount", 0) or 0)

    # Calculate subtotal (items + preliminaries) BEFORE discount
    subtotal_before_discount = items_subtotal + preliminaries_amount

    # Apply discount if present in BOQ details
    discount_percentage = 0
    discount_amount = 0
    if boq_details and boq_details.boq_details:
        discount_percentage = boq_details.boq_details.get("discount_percentage", 0) or 0
        discount_amount = boq_details.boq_details.get("discount_amount", 0) or 0

        # Calculate discount amount if only percentage is provided
        # Discount is applied on subtotal (items + preliminaries)
        if discount_amount == 0 and discount_percentage > 0 and subtotal_before_discount > 0:
            discount_amount = subtotal_before_discount * (discount_percentage / 100)

    # Calculate GRAND TOTAL (Excluding VAT) = Subtotal - Discount
    final_total_cost = subtotal_before_discount - discount_amount

    log.info(f"💰 [Financial Calc] BOQ {boq.boq_id if boq else 'Unknown'}: Materials={total_material_cost}, Labour={total_labour_cost}, Total={final_total_cost}")

    return {
        "items_count": boq_details.total_items if boq_details else 0,
        "material_count": boq_details.total_materials if boq_details else 0,
        "labour_count": boq_details.total_labour if boq_details else 0,
        "total_cost": final_total_cost,
        "selling_price": final_total_cost,
        "total_material_cost": total_material_cost,
        "total_labour_cost": total_labour_cost,
        "overhead_percentage": overhead_percentage,
        "profit_margin": profit_margin,
        "discount_percentage": discount_percentage,
        "discount_amount": discount_amount,
    }

def td_mail_send():
    """
    Technical Director approves/rejects BOQ
    - If approved: Send email to assigned Project Manager (from project.user_id)
    - If rejected: Send email back to Estimator
    - Appends action to BOQ history
    """
    try:
        current_user = g.user
        td_name = current_user['full_name']
        td_email = current_user['email']
        td_user_id = current_user['user_id']
 
        # Get request data
        data = request.get_json(silent=True)
        if not data:
            return jsonify({
                "error": "Invalid request",
                "message": "Request body must be valid JSON"
            }), 400
 
        boq_id = data.get("boq_id")
        comments = data.get("comments", "")
        rejection_reason = data.get("rejection_reason", "")
        technical_director_status = data.get("technical_director_status")
 
        # Validate required fields
        if not boq_id:
            return jsonify({"error": "boq_id is required"}), 400
 
        if not technical_director_status:
            return jsonify({"error": "technical_director_status is required (approved/rejected)"}), 400
 
        if technical_director_status.lower() not in ['approved', 'rejected']:
            return jsonify({"error": "technical_director_status must be 'approved' or 'rejected'"}), 400
 
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
 
        # Prepare BOQ data for email
        boq_data = {
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'status': technical_director_status.capitalize(),
            'created_by': boq.created_by,
            'created_at': boq.created_at.strftime('%d-%b-%Y %I:%M %p') if boq.created_at else 'N/A'
        }
 
        project_data = {
            'project_name': project.project_name,
            'client': project.client or 'N/A',
            'location': project.location or 'N/A'
        }
 
        # Handle both old and new data structures
        boq_json = boq_details.boq_details if boq_details.boq_details else {}
 
        if 'existing_purchase' in boq_json and 'items' in boq_json['existing_purchase']:
            items = boq_json['existing_purchase']['items']
            items_summary = boq_json.get('combined_summary', {})
        else:
            items = boq_json.get('items', [])
            items_summary = boq_json.get('summary', {})
 
        items_summary['items'] = items
 
        # Initialize email service
        # boq_email_service = BOQEmailService()

        # Find Estimator (sender of original BOQ)
        estimator_role = Role.query.filter(
            Role.role.in_(['estimator', 'Estimator']),
            Role.is_deleted == False
        ).first()

        estimator = None
        if estimator_role:
            estimator = User.query.filter_by(
                role_id=estimator_role.role_id,
                is_active=True,
                is_deleted=False
            ).filter(
                db.or_(
                    User.full_name == boq.created_by,
                    User.email == boq.created_by
                )
            ).first()

            if not estimator:
                estimator = User.query.filter_by(
                    role_id=estimator_role.role_id,
                    is_active=True,
                    is_deleted=False
                ).first()

        estimator_email = estimator.email if estimator and estimator.email else boq.created_by
        estimator_name = estimator.full_name if estimator else boq.created_by
 
        # Get existing BOQ history
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()
 
        # Handle existing actions - ensure it's always a list
        if existing_history:
            if existing_history.action is None:
                current_actions = []
            elif isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]  # Convert dict to list
            else:
                current_actions = []
        else:
            current_actions = []
 
        log.info(f"BOQ {boq_id} - Existing history found: {existing_history is not None}")
        log.info(f"BOQ {boq_id} - Current actions before append: {current_actions}")
 
        new_status = None
        email_sent = False
        recipient_email = None
        recipient_name = None
        recipient_role = None
 
        # ==================== APPROVED STATUS ====================
        if technical_director_status.lower() == 'approved':
            log.info(f"BOQ {boq_id} approved by TD, sending to Estimator")
 
            # Check if this is a revision approval (status was Pending_Revision)
            # or a regular approval from Pending_TD_Approval
            is_revision_approval = boq.status.lower() == 'pending_revision'
            new_status = "Revision_Approved" if is_revision_approval else "Approved"
 
            # DO NOT increment revision_number here!
            # Revision number is already incremented when estimator clicks "Make Revision" and saves
            # (see boq_controller.py revision_boq function line 1436-1438)
            # TD approval should only change status, not increment revision number
 
            if not estimator or not estimator_email:
                return jsonify({
                    "success": False,
                    "message": "Cannot send approval email - Estimator email not found"
                }), 400
 
            recipient_email = estimator_email
            recipient_name = estimator_name
            recipient_role = "estimator"
 
            # Email sending disabled - approval proceeds without emails
            email_sent = True
            log.info(f"TD approved BOQ {boq_id} for Estimator {recipient_name} - Email disabled")
 
            # Prepare new action for APPROVED
            new_action = {
                "role": "technicalDirector",
                "type": "revision_approved" if is_revision_approval else "status_change",
                "sender": "technicalDirector",
                "receiver": "estimator",
                "status": "revision_approved" if is_revision_approval else "approved",
                "boq_name": boq.boq_name,
                "comments": comments,
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": td_name,
                "decided_by_user_id": td_user_id,
                "total_cost": items_summary.get("total_cost"),
                "project_name": project_data.get("project_name"),
                "recipient_email": recipient_email,
                "recipient_name": recipient_name,
                "is_revision": is_revision_approval
            }
 
        # ==================== REJECTED STATUS ====================
        else:  # rejected
            log.info(f"BOQ {boq_id} rejected by TD, sending back to Estimator")
            new_status = "Rejected"
 
            if not estimator or not estimator_email:
                return jsonify({
                    "success": False,
                    "message": "Cannot send rejection email - Estimator email not found"
                }), 400
 
            recipient_email = estimator_email
            recipient_name = estimator_name
            recipient_role = "estimator"
 
            # Email sending disabled - rejection proceeds without emails
            email_sent = True
            log.info(f"TD rejected BOQ {boq_id} for Estimator {recipient_name} - Email disabled")
 
            # Prepare new action for REJECTED
            new_action = {
                "role": "technicalDirector",
                "type": "status_change",
                "sender": "technicalDirector",
                "receiver": "estimator",
                "status": "rejected",
                "boq_name": boq.boq_name,
                "comments": comments or rejection_reason,
                "rejection_reason": rejection_reason if rejection_reason else None,
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": td_name,
                "decided_by_user_id": td_user_id,
                "total_cost": items_summary.get("total_cost"),
                "project_name": project_data.get("project_name"),
                "recipient_email": recipient_email,
                "recipient_name": recipient_name
            }
 
            # ==================== TD REJECTION - DO NOT CREATE INTERNAL REVISION ====================
            # TD rejection should ONLY show in Rejected tab, NOT in Internal Revisions tab
            # Internal revisions are for tracking estimator edits during internal approval cycle
            # TD rejection is a final decision that sends BOQ back to estimator for complete rework
            log.info(f"✅ TD rejection - BOQ {boq_id} will show only in Rejected tab")
 
        # ==================== UPDATE BOQ & HISTORY ====================
        # Update BOQ status
        boq.status = new_status
        boq.email_sent = True
        boq.last_modified_by = td_name
        boq.last_modified_at = datetime.utcnow()
 
        # Append new action to existing actions array
        current_actions.append(new_action)
 
        log.info(f"BOQ {boq_id} - New action created: {new_action}")
        log.info(f"BOQ {boq_id} - Current actions after append: {current_actions}")
 
        if existing_history:
            # Update existing history
            existing_history.action = current_actions
            # Mark the JSONB field as modified for SQLAlchemy to detect changes
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(existing_history, "action")
 
            existing_history.action_by = td_name
            existing_history.boq_status = new_status
            existing_history.sender = td_name
            existing_history.receiver = recipient_name
            existing_history.comments = comments or rejection_reason
            existing_history.sender_role = 'technicalDirector'
            existing_history.receiver_role = recipient_role
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = td_name
            existing_history.last_modified_at = datetime.utcnow()
 
            log.info(f"BOQ {boq_id} - Updated existing history with {len(current_actions)} actions")
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=current_actions,
                action_by=td_name,
                boq_status=new_status,
                sender=td_name,
                receiver=recipient_name,
                comments=comments or rejection_reason,
                sender_role='technicalDirector',
                receiver_role=recipient_role,
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)
            log.info(f"BOQ {boq_id} - Created new history with {len(current_actions)} actions")
 
        db.session.commit()
        log.info(f"BOQ {boq_id} - Database committed successfully")
 
        # Send notification about TD's decision
        try:
            # Get estimator user_id for notification from BOQHistory actions
            # This ensures we notify the CORRECT estimator who sent the BOQ to TD
            estimator_user_id = None

            # Find the latest "sent_to_td" action to get the estimator's user_id
            if current_actions:
                for action in reversed(current_actions):  # Check from most recent
                    if action.get('type') == 'sent_to_td' and action.get('decided_by_user_id'):
                        estimator_user_id = action.get('decided_by_user_id')
                        break

            # Fallback: Try to get from estimator object (old logic for backwards compatibility)
            if not estimator_user_id and estimator and hasattr(estimator, 'user_id'):
                estimator_user_id = estimator.user_id

            if estimator_user_id:
                log.info(f"Sending notification to estimator user_id {estimator_user_id} ({estimator_name})")
                # Check if this BOQ has internal revisions - send specific notification
                if boq.has_internal_revisions and boq.internal_revision_number and boq.internal_revision_number > 0:
                    from utils.comprehensive_notification_service import ComprehensiveNotificationService
                    if technical_director_status.lower() == 'approved':
                        ComprehensiveNotificationService.notify_internal_revision_approved(
                            boq_id=boq_id,
                            project_name=project.project_name,
                            revision_number=boq.internal_revision_number,
                            td_id=td_user_id,
                            td_name=td_name,
                            actor_user_id=estimator_user_id,
                            actor_name=estimator_name
                        )
                        log.info(f"Sent internal revision approved notification for BOQ {boq_id}")
                    else:
                        ComprehensiveNotificationService.notify_internal_revision_rejected(
                            boq_id=boq_id,
                            project_name=project.project_name,
                            revision_number=boq.internal_revision_number,
                            td_id=td_user_id,
                            td_name=td_name,
                            actor_user_id=estimator_user_id,
                            actor_name=estimator_name,
                            rejection_reason=rejection_reason or comments or "No reason provided"
                        )
                        log.info(f"Sent internal revision rejected notification for BOQ {boq_id}")
                else:
                    # Regular BOQ approval/rejection notification
                    notification_service.notify_td_boq_decision(
                        boq_id=boq_id,
                        project_name=project.project_name,
                        td_id=td_user_id,
                        td_name=td_name,
                        recipient_user_ids=[estimator_user_id],
                        approved=(technical_director_status.lower() == 'approved'),
                        rejection_reason=rejection_reason if technical_director_status.lower() == 'rejected' else None
                    )
            else:
                log.warning(f"Could not find estimator user_id for BOQ {boq_id} notification")
        except Exception as notif_error:
            log.error(f"Failed to send TD decision notification: {notif_error}")
            import traceback
            log.error(traceback.format_exc())
 
        log.info(f"BOQ {boq_id} {new_status.lower()} by TD, email sent to {recipient_email}")
 
        return jsonify({
            "success": True,
            "message": f"BOQ {new_status.lower()} successfully and email sent to {recipient_role}",
            "boq_id": boq_id,
            "status": new_status,
            "recipient": recipient_email,
            "recipient_role": recipient_role,
            "recipient_name": recipient_name
        }), 200
 
    except Exception as e:
        db.session.rollback()
        import traceback
        log.error(f"Error in td_mail_send: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": str(e),
            "error_type": type(e).__name__
        }), 500


def get_td_se_boq_vendor_requests():
    """Get all SE BOQ vendor approval requests for TD"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQ
        from models.vendor import Vendor
        from datetime import datetime
        # PERFORMANCE: Import eager loading functions
        from sqlalchemy.orm import selectinload, joinedload

        current_user = g.user
        td_id = current_user['user_id']

        # PERFORMANCE: Get all assignments with eager loading to prevent N+1 queries
        assignments = BOQMaterialAssignment.query.options(
            joinedload(BOQMaterialAssignment.boq).selectinload(BOQ.details),
            joinedload(BOQMaterialAssignment.project),
            joinedload(BOQMaterialAssignment.vendor)
        ).filter(
            BOQMaterialAssignment.is_deleted == False,
            BOQMaterialAssignment.selected_vendor_id != None
        ).order_by(BOQMaterialAssignment.vendor_selection_date.desc()).all()

        assignments_list = []
        for assignment in assignments:
            # PERFORMANCE: Use preloaded relationships instead of queries
            boq = assignment.boq
            if not boq or boq.is_deleted:
                continue

            # PERFORMANCE: Use preloaded project
            project = assignment.project
            if not project or project.is_deleted:
                continue

            # PERFORMANCE: Use preloaded vendor
            vendor = None
            vendor_info = None
            if assignment.selected_vendor_id:
                vendor = assignment.vendor
                if vendor and not vendor.is_deleted:
                    vendor_info = {
                        'vendor_id': vendor.vendor_id,
                        'company_name': vendor.company_name,
                        'email': vendor.email,
                        'phone': vendor.phone,
                        'phone_code': vendor.phone_code,
                        'category': vendor.category
                    }

            # Get materials for this assignment from BOQDetails JSON
            from models.boq import BOQDetails
            material_ids = assignment.material_ids or []
            materials_list = []
            total_cost = 0

            if boq:
                # PERFORMANCE: Use preloaded BOQ details
                boq_detail = next((d for d in boq.details if not d.is_deleted), None)

                if boq_detail and boq_detail.boq_details:
                    items = boq_detail.boq_details.get('items', [])

                    # Extract ALL materials from the JSON structure
                    for item in items:
                        item_name = item.get('description', '')
                        sub_items = item.get('sub_items', [])

                        for sub_item in sub_items:
                            sub_item_name = sub_item.get('sub_item_name', '')
                            materials = sub_item.get('materials', [])

                            for material in materials:
                                # If material_ids is specified, only include those materials
                                # Otherwise include all materials
                                material_name = material.get('material_name', '') or material.get('name', '')

                                if not material_ids or material_name in material_ids:
                                    material_dict = {
                                        'id': f"{item_name}_{sub_item_name}_{material_name}",
                                        'item_name': item_name,
                                        'sub_item_name': sub_item_name,
                                        'material_name': material_name,
                                        'quantity': float(material.get('quantity', 0)),
                                        'unit': material.get('unit', ''),
                                        'unit_price': float(material.get('unit_price', 0)),
                                        'total_price': float(material.get('total_price', 0))
                                    }
                                    materials_list.append(material_dict)
                                    total_cost += material_dict['total_price']

            # Calculate overhead if present
            # Use calculated total_cost from materials as the base total
            overhead_percentage = float(assignment.overhead_percentage or 0)
            base_total = total_cost  # Base total is the sum of all material costs
            overhead_allocated = (base_total * overhead_percentage / 100) if overhead_percentage > 0 else 0
            total_cost_with_overhead = base_total + overhead_allocated

            assignment_data = {
                'assignment_id': assignment.assignment_id,
                'boq_id': assignment.boq_id,
                'project_id': assignment.project_id,
                'status': assignment.status,
                'assigned_by_name': assignment.assigned_by_name,
                'assigned_to_buyer_name': assignment.assigned_to_buyer_name,
                'assignment_date': assignment.assignment_date.isoformat() if assignment.assignment_date else None,
                'vendor_selection_status': assignment.vendor_selection_status,
                'selected_vendor_id': assignment.selected_vendor_id,
                'selected_vendor_name': assignment.selected_vendor_name,
                'vendor_selected_by_buyer_name': assignment.vendor_selected_by_buyer_name,
                'vendor_selection_date': assignment.vendor_selection_date.isoformat() if assignment.vendor_selection_date else None,
                'vendor_approved_by_td_name': assignment.vendor_approved_by_td_name,
                'vendor_approval_date': assignment.vendor_approval_date.isoformat() if assignment.vendor_approval_date else None,
                'vendor_rejection_reason': assignment.vendor_rejection_reason,
                'boq': {
                    'boq_id': boq.boq_id,
                    'boq_name': boq.boq_name
                },
                'project': {
                    'project_id': project.project_id,
                    'project_name': project.project_name,
                    'client': project.client,
                    'location': project.location
                },
                'materials': materials_list,
                'total_cost': round(total_cost_with_overhead, 2),
                'overhead_allocated': round(overhead_allocated, 2),
                'overhead_percentage': round(overhead_percentage, 2),
                'base_total': round(base_total, 2),
                'vendor': vendor_info
            }
            assignments_list.append(assignment_data)

        return jsonify({
            "success": True,
            "assignments": assignments_list,
            "count": len(assignments_list)
        }), 200

    except Exception as e:
        log.error(f"Error fetching TD SE BOQ vendor requests: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch vendor requests: {str(e)}"}), 500


def get_td_dashboard_stats():
    """Get comprehensive dashboard statistics for Technical Director - using SAME data as Project Approvals"""
    try:
        from sqlalchemy import func, extract
        from datetime import datetime, timedelta

        current_user = g.user
        user_role = current_user.get('role', '').lower()

        # ============ Use EXACT same query as Project Approvals page ============
        boqs_query = db.session.query(BOQ).options(
            selectinload(BOQ.project),
            selectinload(BOQ.details)
        ).filter(
            BOQ.is_deleted == False,
            BOQ.email_sent == True,
            BOQ.status != 'Pending_PM_Approval'
        ).all()

        # Count BOQs using EXACT same logic as frontend tabs
        status_counts = {
            'in_progress': 0,  # Revisions
            'completed': 0,     # Approved
            'pending': 0,       # Pending
            'delayed': 0        # Rejected by TD
        }

        for boq in boqs_query:
            project = boq.project
            if not project or project.is_deleted:
                continue

            # Check PM assignment - matching frontend logic exactly
            pm_assigned = project.user_id is not None and (
                (isinstance(project.user_id, list) and len(project.user_id) > 0) or
                (not isinstance(project.user_id, list) and project.user_id)
            )

            status_lower = boq.status.lower() if boq.status else ''

            # Pending: status='pending' AND no PM assigned
            if status_lower == 'pending' and not pm_assigned:
                status_counts['pending'] += 1
            # Revisions: status='pending_revision'
            elif status_lower == 'pending_revision':
                status_counts['in_progress'] += 1
            # Approved: status in ['approved', 'revision_approved', 'sent_for_confirmation'] AND no PM assigned
            elif status_lower in ['approved', 'revision_approved', 'sent_for_confirmation'] and not pm_assigned:
                status_counts['completed'] += 1
            # Rejected by TD: status='rejected'
            elif status_lower == 'rejected':
                status_counts['delayed'] += 1

        # ============ Budget Distribution by Work Type (from same BOQs) ============
        budget_distribution = {}
        total_budget = 0

        for boq in boqs_query:
            project = boq.project
            if not project or project.is_deleted:
                continue

            # Get BOQ cost
            boq_details = next((bd for bd in boq.details if not bd.is_deleted), None)
            if not boq_details or not boq_details.total_cost:
                continue

            work_type = project.work_type if project.work_type else 'Uncategorized'
            cost = float(boq_details.total_cost)

            budget_distribution[work_type] = budget_distribution.get(work_type, 0) + cost
            total_budget += cost

        # Calculate percentages
        budget_percentages = {}
        for type_name, budget_val in budget_distribution.items():
            budget_percentages[type_name] = round((budget_val / total_budget * 100), 1) if total_budget > 0 else 0

        # ============ Performance Metrics (BOQ Approval Rate by Month - Last 12 Months) ============
        from datetime import datetime, timedelta
        monthly_performance = []
        performance_month_labels = []
        current_date = datetime.now()

        # Get last 12 months of data
        for i in range(11, -1, -1):
            # Calculate month start and end
            month_date = current_date - timedelta(days=30 * i)
            month_start = month_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

            # Get next month's start
            if month_start.month == 12:
                month_end = month_start.replace(year=month_start.year + 1, month=1)
            else:
                month_end = month_start.replace(month=month_start.month + 1)

            # Add month label (e.g., "Jan", "Feb", etc.)
            performance_month_labels.append(month_start.strftime('%b'))

            total_boqs = db.session.query(func.count(BOQ.boq_id)).filter(
                BOQ.is_deleted == False,
                BOQ.created_at >= month_start,
                BOQ.created_at < month_end
            ).scalar() or 0

            approved_boqs = db.session.query(func.count(BOQ.boq_id)).filter(
                BOQ.is_deleted == False,
                BOQ.status.in_(['Approved', 'approved', 'Revision_Approved', 'new_purchase_create', 'sent_for_review']),
                BOQ.created_at >= month_start,
                BOQ.created_at < month_end
            ).scalar() or 0

            success_rate = round((approved_boqs / total_boqs * 100), 0) if total_boqs > 0 else 0
            monthly_performance.append(success_rate)

        # ============ Revenue Growth (Quarterly) ============
        current_year = datetime.now().year
        quarterly_revenue = {
            'current_year': [],
            'previous_year': []
        }

        for year in [current_year - 1, current_year]:
            year_revenue = []
            for quarter in range(1, 5):
                quarter_start_month = (quarter - 1) * 3 + 1
                quarter_start = datetime(year, quarter_start_month, 1)
                if quarter == 4:
                    quarter_end = datetime(year + 1, 1, 1)
                else:
                    quarter_end = datetime(year, quarter_start_month + 3, 1)

                revenue = db.session.query(
                    func.sum(BOQDetails.total_cost)
                ).join(
                    BOQ, BOQ.boq_id == BOQDetails.boq_id
                ).filter(
                    BOQ.is_deleted == False,
                    BOQDetails.is_deleted == False,
                    BOQ.status.in_(['Approved', 'approved', 'new_purchase_create', 'sent_for_review']),
                    BOQ.created_at >= quarter_start,
                    BOQ.created_at < quarter_end
                ).scalar() or 0

                # Convert to lakhs
                revenue_lakhs = round(float(revenue) / 100000, 0) if revenue else 0
                year_revenue.append(revenue_lakhs)

            if year == current_year - 1:
                quarterly_revenue['previous_year'] = year_revenue
            else:
                quarterly_revenue['current_year'] = year_revenue

        # ============ BOQ Status Distribution (from same BOQs) ============
        boq_status_counts = {}
        for boq in boqs_query:
            status = boq.status if boq.status else 'Unknown'
            # Normalize status names for better display
            display_status = status.replace('_', ' ').title()
            boq_status_counts[display_status] = boq_status_counts.get(display_status, 0) + 1

        # ============ Top 5 Projects by Budget (from same BOQs) ============
        project_budgets = {}
        for boq in boqs_query:
            project = boq.project
            if not project or project.is_deleted:
                continue

            boq_details = next((bd for bd in boq.details if not bd.is_deleted), None)
            if not boq_details or not boq_details.total_cost:
                continue

            project_name = project.project_name
            project_budgets[project_name] = project_budgets.get(project_name, 0) + float(boq_details.total_cost)

        # Sort and get top 5
        top_projects = [
            {'name': name, 'budget': int(budget)}
            for name, budget in sorted(project_budgets.items(), key=lambda x: x[1], reverse=True)[:5]
        ]

        # ============ Monthly Revenue Trend (Last 6 Months) ============
        from datetime import datetime, timedelta
        monthly_revenue = []
        month_labels = []

        for i in range(5, -1, -1):  # Last 6 months
            month_start = datetime.now().replace(day=1) - timedelta(days=30*i)
            month_end = (month_start + timedelta(days=32)).replace(day=1)

            revenue = db.session.query(
                func.sum(BOQDetails.total_cost)
            ).join(
                BOQ, BOQ.boq_id == BOQDetails.boq_id
            ).filter(
                BOQ.is_deleted == False,
                BOQDetails.is_deleted == False,
                BOQ.status.in_(['Approved', 'approved', 'new_purchase_create', 'sent_for_review']),
                BOQ.created_at >= month_start,
                BOQ.created_at < month_end
            ).scalar() or 0

            # Convert to lakhs
            revenue_lakhs = round(float(revenue) / 100000, 0) if revenue else 0
            monthly_revenue.append(revenue_lakhs)
            month_labels.append(month_start.strftime('%b %Y'))

        # ============ Team Performance (Top Estimators by BOQ Count from same BOQs) ============
        estimator_counts = {}
        for boq in boqs_query:
            if boq.created_by:
                estimator_counts[boq.created_by] = estimator_counts.get(boq.created_by, 0) + 1

        # Sort and get top 5
        top_estimators = [
            {'name': name, 'count': count}
            for name, count in sorted(estimator_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        ]

        # ============ Active Projects Overview ============
        active_projects_query = db.session.query(Project).filter(
            Project.is_deleted == False,
            Project.status.in_(['In Progress', 'in_progress', 'ongoing', 'Ongoing'])
        ).order_by(Project.created_at.desc()).limit(10).all()

        active_projects = []
        for project in active_projects_query:
            # Get total budget from all BOQs
            total_budget = db.session.query(
                func.sum(BOQDetails.total_cost)
            ).join(
                BOQ, BOQ.boq_id == BOQDetails.boq_id
            ).filter(
                BOQ.project_id == project.project_id,
                BOQ.is_deleted == False,
                BOQDetails.is_deleted == False
            ).scalar() or 0

            # Get project manager names from user_id JSONB array
            pm_names = 'Unassigned'
            if project.user_id:
                try:
                    # user_id is a JSONB array of PM IDs
                    pm_ids = project.user_id if isinstance(project.user_id, list) else []
                    if pm_ids:
                        pms = User.query.filter(
                            User.user_id.in_(pm_ids),
                            User.is_deleted == False
                        ).all()
                        if pms:
                            pm_names = ', '.join([pm.full_name for pm in pms])
                except Exception as pm_error:
                    log.warning(f"Error fetching PM names for project {project.project_id}: {str(pm_error)}")

            # Calculate progress based on BOQ status (simplified metric)
            total_boqs = db.session.query(func.count(BOQ.boq_id)).filter(
                BOQ.project_id == project.project_id,
                BOQ.is_deleted == False
            ).scalar() or 0

            approved_boqs = db.session.query(func.count(BOQ.boq_id)).filter(
                BOQ.project_id == project.project_id,
                BOQ.is_deleted == False,
                BOQ.status.in_(['Approved', 'approved', 'new_purchase_create', 'sent_for_review'])
            ).scalar() or 0

            # Calculate progress as percentage of approved BOQs
            progress = int((approved_boqs / total_boqs * 100)) if total_boqs > 0 else 0

            # Estimate spent based on progress
            spent = int(total_budget * (progress / 100)) if total_budget else 0

            # Determine status based on end date and progress
            from datetime import datetime, date
            status = 'on-track'
            if project.end_date:
                today = date.today()
                days_remaining = (project.end_date - today).days
                # If overdue or close to deadline with low progress, mark as delayed
                if days_remaining < 0 or (days_remaining < 30 and progress < 70):
                    status = 'delayed'

            active_projects.append({
                'id': project.project_id,
                'name': project.project_name,
                'pm': pm_names,
                'progress': progress,
                'budget': int(total_budget) if total_budget else 0,
                'spent': spent,
                'status': status,
                'dueDate': project.end_date.strftime('%Y-%m-%d') if project.end_date else None
            })

        # ============ Return Complete Dashboard Data ============
        dashboard_data = {
            'projectStatus': status_counts,
            'budgetDistribution': budget_percentages,
            'monthlyPerformance': monthly_performance,
            'performanceMonthLabels': performance_month_labels,
            'quarterlyRevenue': quarterly_revenue,
            'boqStatusDistribution': boq_status_counts,
            'topProjects': top_projects,
            'monthlyRevenue': monthly_revenue,
            'monthLabels': month_labels,
            'topEstimators': top_estimators,
            'activeProjects': active_projects
        }

        # Simple logging for verification
        log.info(f"TD Dashboard - BOQ Counts: Pending={status_counts['pending']}, Approved={status_counts['completed']}, Revisions={status_counts['in_progress']}, Rejected={status_counts['delayed']}")
        log.info(f"TD Dashboard - Total BOQs processed: {len(boqs_query)}")
        log.info(f"TD Dashboard - Active Projects: {len(active_projects)}")

        return jsonify({
            'success': True,
            'data': dashboard_data
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error fetching TD dashboard stats: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to fetch dashboard statistics: {str(e)}",
            "error_type": type(e).__name__
        }), 500


def get_td_purchase_orders():
    """Get all purchase orders for TD (read-only view)"""
    try:
        from models.change_request import ChangeRequest
        from models.po_child import POChild
        from sqlalchemy import or_, and_

        current_user = g.user
        td_id = current_user['user_id']
        user_role = current_user.get('role_name', '').lower()

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 50, type=int), 100)
        status_filter = request.args.get('status', 'all')  # all, pending, approved, completed, rejected

        # Build base query - TD sees ALL change requests (read-only)
        # Include both change requests and PO children
        base_query = db.session.query(ChangeRequest).options(
            selectinload(ChangeRequest.project),
            selectinload(ChangeRequest.boq),
            selectinload(ChangeRequest.vendor)
        ).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.status.in_([
                'vendor_approval_pending',
                'pending_td_approval',
                'vendor_approved',
                'purchase_completed',
                'rejected'
            ])
        )

        # Apply status filter
        if status_filter == 'pending':
            base_query = base_query.filter(ChangeRequest.status == 'pending_td_approval')
        elif status_filter == 'approved':
            base_query = base_query.filter(ChangeRequest.status == 'vendor_approved')
        elif status_filter == 'completed':
            base_query = base_query.filter(ChangeRequest.status == 'purchase_completed')
        elif status_filter == 'rejected':
            base_query = base_query.filter(ChangeRequest.status == 'rejected')

        # Order by created_at desc
        base_query = base_query.order_by(ChangeRequest.created_at.desc())

        # Paginate
        paginated = base_query.paginate(page=page, per_page=per_page, error_out=False)

        # Build response
        purchases_list = []
        for cr in paginated.items:
            project = cr.project
            boq = cr.boq
            vendor = cr.vendor

            # Get materials from sub_items_data or materials_data
            materials_list = cr.sub_items_data or cr.materials_data or []

            purchase_data = {
                'cr_id': cr.cr_id,
                'formatted_cr_id': f"CR-{cr.cr_id}",
                'project_id': cr.project_id,
                'project_name': project.project_name if project else None,
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_id': cr.boq_id,
                'boq_name': boq.boq_name if boq else None,
                'item_name': cr.item_id,
                'request_type': cr.request_type,
                'status': cr.status,
                'materials': materials_list if isinstance(materials_list, list) else [],
                'materials_count': len(materials_list) if isinstance(materials_list, list) else 0,
                'total_cost': float(cr.materials_total_cost) if cr.materials_total_cost else 0,
                'requested_by_name': cr.requested_by_name,
                'created_at': cr.created_at.isoformat() if cr.created_at else None,
                'vendor_id': cr.selected_vendor_id,
                'vendor_name': vendor.company_name if vendor else None,
                'vendor_selection_status': cr.vendor_selection_status,
                'vendor_approved_by_td_name': cr.vendor_approved_by_td_name,
                'vendor_approval_date': cr.vendor_approval_date.isoformat() if cr.vendor_approval_date else None,
                'purchase_completed_by_name': cr.purchase_completed_by_name,
                'purchase_completion_date': cr.purchase_completion_date.isoformat() if cr.purchase_completion_date else None
            }
            purchases_list.append(purchase_data)

        # Get summary counts
        pending_count = db.session.query(ChangeRequest).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.status == 'pending_td_approval'
        ).count()

        approved_count = db.session.query(ChangeRequest).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.status == 'vendor_approved'
        ).count()

        completed_count = db.session.query(ChangeRequest).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.status == 'purchase_completed'
        ).count()

        rejected_count = db.session.query(ChangeRequest).filter(
            ChangeRequest.is_deleted == False,
            ChangeRequest.status == 'rejected'
        ).count()

        return jsonify({
            'success': True,
            'purchases': purchases_list,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': paginated.total,
                'pages': paginated.pages,
                'has_prev': paginated.has_prev,
                'has_next': paginated.has_next
            },
            'summary': {
                'pending_count': pending_count,
                'approved_count': approved_count,
                'completed_count': completed_count,
                'rejected_count': rejected_count,
                'total_count': pending_count + approved_count + completed_count + rejected_count
            }
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error fetching TD purchase orders: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to fetch purchase orders: {str(e)}",
            "error_type": type(e).__name__
        }), 500


def get_td_purchase_order_by_id(cr_id):
    """Get specific purchase order details for TD view"""
    try:
        from models.change_request import ChangeRequest

        current_user = g.user
        td_id = current_user['user_id']

        # Get change request with relationships
        cr = db.session.query(ChangeRequest).options(
            selectinload(ChangeRequest.project),
            selectinload(ChangeRequest.boq),
            selectinload(ChangeRequest.vendor)
        ).filter(
            ChangeRequest.cr_id == cr_id,
            ChangeRequest.is_deleted == False
        ).first()

        if not cr:
            return jsonify({
                "success": False,
                "error": "Purchase order not found"
            }), 404

        project = cr.project
        boq = cr.boq
        vendor = cr.vendor

        # Get materials from sub_items_data or materials_data
        materials_list = cr.sub_items_data or cr.materials_data or []

        purchase_data = {
            'cr_id': cr.cr_id,
            'formatted_cr_id': f"CR-{cr.cr_id}",
            'project_id': cr.project_id,
            'project_name': project.project_name if project else None,
            'project_code': project.project_code if project else None,
            'client': project.client if project else None,
            'location': project.location if project else None,
            'boq_id': cr.boq_id,
            'boq_name': boq.boq_name if boq else None,
            'item_name': cr.item_id,
            'sub_item_name': cr.sub_item_id,
            'request_type': cr.request_type,
            'reason': cr.justification,
            'status': cr.status,
            'materials': materials_list if isinstance(materials_list, list) else [],
            'materials_count': len(materials_list) if isinstance(materials_list, list) else 0,
            'total_cost': float(cr.materials_total_cost) if cr.materials_total_cost else 0,
            'requested_by_user_id': cr.requested_by_user_id,
            'requested_by_name': cr.requested_by_name,
            'requested_by_role': cr.requested_by_role,
            'created_at': cr.created_at.isoformat() if cr.created_at else None,
            'approved_by': cr.approved_by,
            'approved_at': cr.approved_at.isoformat() if cr.approved_at else None,
            'vendor_id': cr.selected_vendor_id,
            'vendor_name': vendor.company_name if vendor else None,
            'vendor_phone': vendor.phone if vendor else None,
            'vendor_email': vendor.email if vendor else None,
            'vendor_selection_status': cr.vendor_selection_status,
            'vendor_selected_by_buyer_name': cr.vendor_selected_by_buyer_name,
            'vendor_selection_date': cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None,
            'vendor_approved_by_td_id': cr.vendor_approved_by_td_id,
            'vendor_approved_by_td_name': cr.vendor_approved_by_td_name,
            'vendor_approval_date': cr.vendor_approval_date.isoformat() if cr.vendor_approval_date else None,
            'vendor_rejection_reason': cr.vendor_rejection_reason,
            'purchase_completed_by_user_id': cr.purchase_completed_by_user_id,
            'purchase_completed_by_name': cr.purchase_completed_by_name,
            'purchase_completion_date': cr.purchase_completion_date.isoformat() if cr.purchase_completion_date else None,
            'purchase_notes': cr.purchase_notes
        }

        return jsonify({
            'success': True,
            'purchase': purchase_data
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error fetching TD purchase order details: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch purchase order details: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def get_td_pending_boq():
    """Get TD pending BOQs - OPTIMIZED FOR SPEED (No N+1 queries)"""
    try:
        from sqlalchemy import func

        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

        # OPTIMIZED: Join BOQDetails to eliminate N+1 queries
        query = (
            db.session.query(
                BOQ,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.user_id.label('project_user_id'),
                User.full_name.label('last_pm_name'),
                BOQDetails
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .outerjoin(BOQDetails, and_(BOQDetails.boq_id == BOQ.boq_id, BOQDetails.is_deleted == False))
            .filter(
                BOQ.is_deleted == False,
                Project.is_deleted == False,
                BOQ.status.in_(['Pending_TD_Approval', 'Pending'])
            )
        )

        # Apply role filter early
        if user_role == 'projectmanager' or user_role == 'project_manager':
            query = query.filter(BOQ.last_pm_user_id == user_id)

        query = query.order_by(BOQ.created_at.desc())

        # OPTIMIZED: Use func.count() instead of .count()
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()
            if total_count == 0:
                return jsonify({"message": "PM Approval BOQs retrieved successfully", "count": 0, "data": [], "pagination": {"page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}}), 200
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)
            if total_count == 0:
                return jsonify({"message": "PM Approval BOQs retrieved successfully", "count": 0, "data": []}), 200

        # OPTIMIZED: Build response without N+1 queries (all data already loaded)
        pm_approval_boqs = []
        for row in rows:
            boq_obj = row.BOQ
            boq_details = row.BOQDetails

            # Calculate financial data using already-loaded objects
            financial_data = calculate_boq_financial_data(boq_obj, boq_details) if boq_details else {}

            boq_entry = {
                "boq_id": boq_obj.boq_id,
                "boq_name": boq_obj.boq_name,
                "project_id": boq_obj.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "status": boq_obj.status,
                "client_status": boq_obj.client_status,
                "revision_number": boq_obj.revision_number or 0,
                "email_sent": boq_obj.email_sent,
                "user_id": row.project_user_id,
                "created_at": boq_obj.created_at.isoformat() if boq_obj.created_at else None,
                "created_by": boq_obj.created_by,
                "client_rejection_reason": boq_obj.client_rejection_reason,
                "last_pm_user_id": boq_obj.last_pm_user_id,
                "last_pm_name": row.last_pm_name,
                **financial_data
            }
            pm_approval_boqs.append(boq_entry)

        # Build response
        response = {
            "message": "PM Approval BOQs retrieved successfully",
            "count": len(pm_approval_boqs),
            "data": pm_approval_boqs
        }

        if page is not None:
            total_pages = (total_count + page_size - 1) // page_size
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
        db.session.rollback()
        log.error(f"Error retrieving PM Approval BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve PM Approval BOQs',
            'details': str(e)
        }), 500   

def get_client_boq():
    """Get projects assigned to the current PM based on Project.user_id (JSONB array)"""
    try:
        # PERFORMANCE: Optional pagination support (backward compatible)
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)  # Cap at 100 items per page

        # Get current logged-in user
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

        # OPTIMIZED: Join BOQDetails to eliminate N+1 queries
        query = (
            db.session.query(
                BOQ,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.user_id,
                User.full_name.label('last_pm_name'),
                BOQDetails
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .outerjoin(BOQDetails, and_(BOQDetails.boq_id == BOQ.boq_id, BOQDetails.is_deleted == False))
            .filter(BOQ.is_deleted == False, Project.is_deleted == False)
            .filter(BOQ.status.in_(['Client_Confirmed', 'client_confirmed', 'Client_Rejected', 'client_rejected']))
            .order_by(BOQ.created_at.desc())
        )

        # Filter by BOQ.last_pm_user_id (the PM this BOQ was sent to)
        # Admin sees all BOQs with Pending_PM_Approval status
        if user_role == 'admin':
            pass  # No additional filter for admin - sees all
        elif user_role in ['projectmanager', 'project_manager']:
            # PM sees only BOQs assigned to them via last_pm_user_id
            query = query.filter(BOQ.last_pm_user_id == user_id)

        # OPTIMIZED: Use func.count() for better performance
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()
            if total_count == 0:
                return jsonify({
                    "message": "No client BOQs found",
                    "count": 0,
                    "data": [],
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total_count": 0,
                        "total_pages": 0,
                        "has_next": False,
                        "has_prev": False
                    }
                }), 200
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            if not rows:
                return jsonify({"message": "No client BOQs found", "count": 0, "data": []}), 200
            total_count = len(rows)

        # Build response with financial data
        pm_approval_boqs = []
        for row in rows:
            # Use already-loaded BOQ and BOQDetails from JOIN (no additional queries)
            boq_obj = row.BOQ
            boq_details = row.BOQDetails

            # Calculate financial data
            financial_data = calculate_boq_financial_data(boq_obj, boq_details) if boq_details else {}

            boq_entry = {
                "boq_id": boq_obj.boq_id,
                "boq_name": boq_obj.boq_name,
                "project_id": boq_obj.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "status": boq_obj.status,
                "client_status": boq_obj.client_status,
                "revision_number": boq_obj.revision_number or 0,
                "email_sent": boq_obj.email_sent,
                "user_id": row.user_id,
                "created_at": boq_obj.created_at.isoformat() if boq_obj.created_at else None,
                "created_by": boq_obj.created_by,
                "client_rejection_reason": boq_obj.client_rejection_reason,
                "last_pm_user_id": boq_obj.last_pm_user_id,
                "last_pm_name": row.last_pm_name,
                # Add financial data
                **financial_data
            }
            pm_approval_boqs.append(boq_entry)

        # Build response
        response = {
            "message": "PM Approval BOQs retrieved successfully",
            "count": len(pm_approval_boqs),
            "data": pm_approval_boqs
        }

        if page is not None:
            total_pages = (total_count + page_size - 1) // page_size
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
        db.session.rollback()
        log.error(f"Error retrieving PM Approval BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve PM Approval BOQs',
            'details': str(e)
        }), 500

def get_td_assign_boq():
    """Get BOQs for projects where TD assigned PM based on Project.user_id (JSONB array)"""
    try:
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

        # OPTIMIZED: Join BOQDetails to eliminate N+1 queries
        query = (
            db.session.query(
                BOQ,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.user_id,
                User.full_name.label('last_pm_name'),
                BOQDetails
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .outerjoin(BOQDetails, and_(BOQDetails.boq_id == BOQ.boq_id, BOQDetails.is_deleted == False))
            .filter(BOQ.is_deleted == False, Project.is_deleted == False)
            # Only show projects where user_id is not null and not empty
            .filter(Project.user_id != None, Project.user_id != '[]', Project.user_id != 'null')
            .order_by(BOQ.created_at.desc())
        )

        # OPTIMIZED: Use func.count() for better performance
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()
            if total_count == 0:
                return jsonify({
                    "message": "No TD assigned BOQs found",
                    "count": 0,
                    "data": [],
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total_count": 0,
                        "total_pages": 0,
                        "has_next": False,
                        "has_prev": False
                    }
                }), 200
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            if not rows:
                return jsonify({"message": "No TD assigned BOQs found", "count": 0, "data": []}), 200
            total_count = len(rows)

        # Build response with financial data
        td_assign_boqs = []
        for row in rows:
            # Use already-loaded BOQ and BOQDetails from JOIN (no additional queries)
            boq_obj = row.BOQ
            boq_details = row.BOQDetails

            # Calculate financial data
            financial_data = calculate_boq_financial_data(boq_obj, boq_details) if boq_details else {}

            boq_entry = {
                "boq_id": boq_obj.boq_id,
                "boq_name": boq_obj.boq_name,
                "project_id": boq_obj.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "status": boq_obj.status,
                "client_status": boq_obj.client_status,
                "revision_number": boq_obj.revision_number or 0,
                "email_sent": boq_obj.email_sent,
                "user_id": row.user_id,
                "created_at": boq_obj.created_at.isoformat() if boq_obj.created_at else None,
                "created_by": boq_obj.created_by,
                "client_rejection_reason": boq_obj.client_rejection_reason,
                "last_pm_user_id": boq_obj.last_pm_user_id,
                "last_pm_name": row.last_pm_name,
                # Add financial data
                **financial_data
            }
            td_assign_boqs.append(boq_entry)

        response = {
            "message": "TD assigned BOQs retrieved successfully",
            "count": len(td_assign_boqs),
            "data": td_assign_boqs
        }

        if page is not None:
            total_pages = (total_count + page_size - 1) // page_size
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
        db.session.rollback()
        log.error(f"Error retrieving TD assigned BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve TD assigned BOQs',
            'details': str(e)
        }), 500

def td_approved_boq():
    """Get TD approved BOQs - BOQs with Approved status"""
    try:
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower() if current_user else ''

        # OPTIMIZED: Join BOQDetails and User to eliminate N+1 queries
        query = (
            db.session.query(
                BOQ,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.user_id,
                User.full_name.label('last_pm_name'),
                BOQDetails
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .outerjoin(BOQDetails, and_(BOQDetails.boq_id == BOQ.boq_id, BOQDetails.is_deleted == False))
            .filter(
                BOQ.is_deleted == False,
                Project.is_deleted == False,
                BOQ.status.in_(['Approved', 'approved', 'Revision_Approved', 'Sent_for_Confirmation']),
                # Only show projects where user_id is null or empty (not assigned to PM yet)
                or_(
                    Project.user_id == None,
                    Project.user_id == '[]',
                    Project.user_id == 'null'
                )
            )
            .order_by(BOQ.created_at.desc())
        )

        # OPTIMIZED: Use func.count() for better performance
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()
            if total_count == 0:
                return jsonify({
                    "message": "No TD approved BOQs found",
                    "count": 0,
                    "data": [],
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total_count": 0,
                        "total_pages": 0,
                        "has_next": False,
                        "has_prev": False
                    }
                }), 200
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            if not rows:
                return jsonify({"message": "No TD approved BOQs found", "count": 0, "data": []}), 200
            total_count = len(rows)

        # Build response with financial data
        td_approved_boqs = []
        for row in rows:
            # Use already-loaded BOQ and BOQDetails from JOIN (no additional queries)
            boq_obj = row.BOQ
            boq_details = row.BOQDetails

            # Calculate financial data
            financial_data = calculate_boq_financial_data(boq_obj, boq_details) if boq_details else {}

            boq_entry = {
                "boq_id": boq_obj.boq_id,
                "boq_name": boq_obj.boq_name,
                "project_id": boq_obj.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "status": boq_obj.status,
                "client_status": boq_obj.client_status,
                "revision_number": boq_obj.revision_number or 0,
                "email_sent": boq_obj.email_sent,
                "user_id": row.user_id,
                "created_at": boq_obj.created_at.isoformat() if boq_obj.created_at else None,
                "created_by": boq_obj.created_by,
                "client_rejection_reason": boq_obj.client_rejection_reason,
                "last_pm_user_id": boq_obj.last_pm_user_id,
                "last_pm_name": row.last_pm_name,
                # Add financial data
                **financial_data
            }
            td_approved_boqs.append(boq_entry)

        response = {
            "message": "TD Approved BOQs retrieved successfully",
            "count": len(td_approved_boqs),
            "data": td_approved_boqs
        }

        if page is not None:
            total_pages = (total_count + page_size - 1) // page_size
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
        db.session.rollback()
        log.error(f"Error retrieving TD approved BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve TD approved BOQs',
            'details': str(e)
        }), 500

def get_td_revisions_boq():
    """Get BOQs with revisions (revision_number > 0)"""
    try:
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401

        # OPTIMIZED: Join BOQDetails to eliminate N+1 queries
        query = (
            db.session.query(
                BOQ,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.user_id,
                User.full_name.label('last_pm_name'),
                BOQDetails
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .outerjoin(BOQDetails, and_(BOQDetails.boq_id == BOQ.boq_id, BOQDetails.is_deleted == False))
            .filter(BOQ.is_deleted == False, Project.is_deleted == False)
            .filter(BOQ.revision_number > 0)
            .order_by(BOQ.created_at.desc())
        )

        # OPTIMIZED: Use func.count() for better performance
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()
            if total_count == 0:
                return jsonify({
                    "message": "No revision BOQs found",
                    "count": 0,
                    "data": [],
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total_count": 0,
                        "total_pages": 0,
                        "has_next": False,
                        "has_prev": False
                    }
                }), 200
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            if not rows:
                return jsonify({"message": "No revision BOQs found", "count": 0, "data": []}), 200
            total_count = len(rows)

        # Build response with financial data
        revision_boqs = []
        for row in rows:
            # Use already-loaded BOQ and BOQDetails from JOIN (no additional queries)
            boq_obj = row.BOQ
            boq_details = row.BOQDetails

            # Calculate financial data
            financial_data = calculate_boq_financial_data(boq_obj, boq_details) if boq_details else {}

            boq_entry = {
                "boq_id": boq_obj.boq_id,
                "boq_name": boq_obj.boq_name,
                "project_id": boq_obj.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "status": boq_obj.status,
                "client_status": boq_obj.client_status,
                "revision_number": boq_obj.revision_number or 0,
                "email_sent": boq_obj.email_sent,
                "user_id": row.user_id,
                "created_at": boq_obj.created_at.isoformat() if boq_obj.created_at else None,
                "created_by": boq_obj.created_by,
                "client_rejection_reason": boq_obj.client_rejection_reason,
                "last_pm_user_id": boq_obj.last_pm_user_id,
                "last_pm_name": row.last_pm_name,
                # Add financial data
                **financial_data
            }
            revision_boqs.append(boq_entry)

        response = {
            "message": "TD Revisions BOQs retrieved successfully",
            "count": len(revision_boqs),
            "data": revision_boqs
        }

        if page is not None:
            total_pages = (total_count + page_size - 1) // page_size
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
        db.session.rollback()
        log.error(f"Error retrieving TD revisions BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve TD revisions BOQs',
            'details': str(e)
        }), 500

def get_td_completed_boq():
    """Get BOQs with completed status"""
    try:
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401

        # OPTIMIZED: Join BOQDetails to eliminate N+1 queries
        query = (
            db.session.query(
                BOQ,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.user_id,
                User.full_name.label('last_pm_name'),
                BOQDetails
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .outerjoin(BOQDetails, and_(BOQDetails.boq_id == BOQ.boq_id, BOQDetails.is_deleted == False))
            .filter(BOQ.is_deleted == False, Project.is_deleted == False)
            .filter(BOQ.status.in_(['Completed', 'completed']))
            .order_by(BOQ.created_at.desc())
        )

        # OPTIMIZED: Use func.count() for better performance
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()
            if total_count == 0:
                return jsonify({
                    "message": "No completed BOQs found",
                    "count": 0,
                    "data": [],
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total_count": 0,
                        "total_pages": 0,
                        "has_next": False,
                        "has_prev": False
                    }
                }), 200
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            if not rows:
                return jsonify({"message": "No completed BOQs found", "count": 0, "data": []}), 200
            total_count = len(rows)

        # Build response with financial data
        completed_boqs = []
        for row in rows:
            # Use already-loaded BOQ and BOQDetails from JOIN (no additional queries)
            boq_obj = row.BOQ
            boq_details = row.BOQDetails

            # Calculate financial data
            financial_data = calculate_boq_financial_data(boq_obj, boq_details) if boq_details else {}

            boq_entry = {
                "boq_id": boq_obj.boq_id,
                "boq_name": boq_obj.boq_name,
                "project_id": boq_obj.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "status": boq_obj.status,
                "client_status": boq_obj.client_status,
                "revision_number": boq_obj.revision_number or 0,
                "email_sent": boq_obj.email_sent,
                "user_id": row.user_id,
                "created_at": boq_obj.created_at.isoformat() if boq_obj.created_at else None,
                "created_by": boq_obj.created_by,
                "client_rejection_reason": boq_obj.client_rejection_reason,
                "last_pm_user_id": boq_obj.last_pm_user_id,
                "last_pm_name": row.last_pm_name,
                # Add financial data
                **financial_data
            }
            completed_boqs.append(boq_entry)

        response = {
            "message": "TD Completed BOQs retrieved successfully",
            "count": len(completed_boqs),
            "data": completed_boqs
        }

        if page is not None:
            total_pages = (total_count + page_size - 1) // page_size
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
        db.session.rollback()
        log.error(f"Error retrieving TD completed BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve TD completed BOQs',
            'details': str(e)
        }), 500

def get_td_rejected_boq():
    """Get BOQs with rejected status (rejected by TD)"""
    try:
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401

        # OPTIMIZED: Join BOQDetails to eliminate N+1 queries
        query = (
            db.session.query(
                BOQ,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.user_id,
                User.full_name.label('last_pm_name'),
                BOQDetails
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .outerjoin(BOQDetails, and_(BOQDetails.boq_id == BOQ.boq_id, BOQDetails.is_deleted == False))
            .filter(BOQ.is_deleted == False, Project.is_deleted == False)
            .filter(BOQ.status.in_(['Rejected', 'rejected']))
            .order_by(BOQ.created_at.desc())
        )

        # OPTIMIZED: Use func.count() for better performance
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()
            if total_count == 0:
                return jsonify({
                    "message": "No rejected BOQs found",
                    "count": 0,
                    "data": [],
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total_count": 0,
                        "total_pages": 0,
                        "has_next": False,
                        "has_prev": False
                    }
                }), 200
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            if not rows:
                return jsonify({"message": "No rejected BOQs found", "count": 0, "data": []}), 200
            total_count = len(rows)

        # Build response with financial data
        rejected_boqs = []
        for row in rows:
            # Use already-loaded BOQ and BOQDetails from JOIN (no additional queries)
            boq_obj = row.BOQ
            boq_details = row.BOQDetails

            # Calculate financial data
            financial_data = calculate_boq_financial_data(boq_obj, boq_details) if boq_details else {}

            boq_entry = {
                "boq_id": boq_obj.boq_id,
                "boq_name": boq_obj.boq_name,
                "project_id": boq_obj.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "status": boq_obj.status,
                "client_status": boq_obj.client_status,
                "revision_number": boq_obj.revision_number or 0,
                "email_sent": boq_obj.email_sent,
                "user_id": row.user_id,
                "created_at": boq_obj.created_at.isoformat() if boq_obj.created_at else None,
                "created_by": boq_obj.created_by,
                "client_rejection_reason": boq_obj.client_rejection_reason,
                "last_pm_user_id": boq_obj.last_pm_user_id,
                "last_pm_name": row.last_pm_name,
                # Add financial data
                **financial_data
            }
            rejected_boqs.append(boq_entry)

        response = {
            "message": "TD Rejected BOQs retrieved successfully",
            "count": len(rejected_boqs),
            "data": rejected_boqs
        }

        if page is not None:
            total_pages = (total_count + page_size - 1) // page_size
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
        db.session.rollback()
        log.error(f"Error retrieving TD rejected BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve TD rejected BOQs',
            'details': str(e)
        }), 500

def get_td_tab_counts():
    """Get counts for all TD tabs"""
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401

        # OPTIMIZED: Use func.count() for better performance (2-3x faster)

        # Count for Pending tab (Pending_TD_Approval and Pending statuses)
        pending_count = db.session.query(BOQ).join(
            Project, BOQ.project_id == Project.project_id
        ).filter(
            BOQ.is_deleted == False,
            Project.is_deleted == False,
            BOQ.status.in_(['Pending_TD_Approval', 'Pending'])
        ).with_entities(func.count()).scalar()

        # Count for Approved tab (Approved, Revision_Approved, Sent_for_Confirmation AND not assigned to PM)
        approved_count = db.session.query(BOQ).join(
            Project, BOQ.project_id == Project.project_id
        ).filter(
            BOQ.is_deleted == False,
            Project.is_deleted == False,
            BOQ.status.in_(['Approved', 'approved', 'Revision_Approved', 'Sent_for_Confirmation']),
            or_(
                Project.user_id == None,
                Project.user_id == '[]',
                Project.user_id == 'null'
            )
        ).with_entities(func.count()).scalar()

        # Count for Client Response tab (Client_Confirmed or Client_Rejected)
        client_response_count = db.session.query(BOQ).join(
            Project, BOQ.project_id == Project.project_id
        ).filter(
            BOQ.is_deleted == False,
            Project.is_deleted == False,
            BOQ.status.in_(['Client_Confirmed', 'client_confirmed', 'Client_Rejected', 'client_rejected'])
        ).with_entities(func.count()).scalar()

        # Count for Revisions tab (revision_number > 0)
        revisions_count = db.session.query(BOQ).join(
            Project, BOQ.project_id == Project.project_id
        ).filter(
            BOQ.is_deleted == False,
            Project.is_deleted == False,
            BOQ.revision_number > 0
        ).with_entities(func.count()).scalar()

        # Count for Assigned tab (projects where user_id is not null/empty AND NOT rejected/completed/cancelled)
        assigned_count = db.session.query(BOQ).join(
            Project, BOQ.project_id == Project.project_id
        ).filter(
            BOQ.is_deleted == False,
            Project.is_deleted == False,
            Project.user_id != None,
            Project.user_id != '[]',
            Project.user_id != 'null',
            ~BOQ.status.in_(['Rejected', 'rejected', 'Completed', 'completed', 'Client_Cancelled', 'Cancelled', 'cancelled'])
        ).with_entities(func.count()).scalar()

        # Count for Completed tab
        completed_count = db.session.query(BOQ).join(
            Project, BOQ.project_id == Project.project_id
        ).filter(
            BOQ.is_deleted == False,
            Project.is_deleted == False,
            BOQ.status.in_(['Completed', 'completed'])
        ).with_entities(func.count()).scalar()

        # Count for Rejected by TD tab
        rejected_count = db.session.query(BOQ).join(
            Project, BOQ.project_id == Project.project_id
        ).filter(
            BOQ.is_deleted == False,
            Project.is_deleted == False,
            BOQ.status.in_(['Rejected', 'rejected'])
        ).with_entities(func.count()).scalar()

        # Count for Cancelled tab
        cancelled_count = db.session.query(BOQ).join(
            Project, BOQ.project_id == Project.project_id
        ).filter(
            BOQ.is_deleted == False,
            Project.is_deleted == False,
            BOQ.status.in_(['Client_Cancelled', 'Cancelled', 'cancelled'])
        ).with_entities(func.count()).scalar()

        return jsonify({
            "success": True,
            "counts": {
                "pending": pending_count,
                "approved": approved_count,
                "sent": client_response_count,
                "revisions": revisions_count,
                "assigned": assigned_count,
                "completed": completed_count,
                "rejected": rejected_count,
                "cancelled": cancelled_count
            }
        }), 200

    except Exception as e:
        log.error(f"Error getting TD tab counts: {str(e)}")
        return jsonify({
            'error': 'Failed to get tab counts',
            'details': str(e)
        }), 500

def get_td_cancelled_boq():
    """Get BOQs with cancelled status"""
    try:
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401

        # OPTIMIZED: Join BOQDetails to eliminate N+1 queries
        query = (
            db.session.query(
                BOQ,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.user_id,
                User.full_name.label('last_pm_name'),
                BOQDetails
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .outerjoin(BOQDetails, and_(BOQDetails.boq_id == BOQ.boq_id, BOQDetails.is_deleted == False))
            .filter(BOQ.is_deleted == False, Project.is_deleted == False)
            .filter(BOQ.status.in_(['Client_Cancelled']))
            .order_by(BOQ.created_at.desc())
        )

        # OPTIMIZED: Use func.count() for better performance
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()
            if total_count == 0:
                return jsonify({
                    "message": "No cancelled BOQs found",
                    "count": 0,
                    "data": [],
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total_count": 0,
                        "total_pages": 0,
                        "has_next": False,
                        "has_prev": False
                    }
                }), 200
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            if not rows:
                return jsonify({"message": "No cancelled BOQs found", "count": 0, "data": []}), 200
            total_count = len(rows)

        # Build response with financial data
        cancelled_boqs = []
        for row in rows:
            # Use already-loaded BOQ and BOQDetails from JOIN (no additional queries)
            boq_obj = row.BOQ
            boq_details = row.BOQDetails

            # Calculate financial data
            financial_data = calculate_boq_financial_data(boq_obj, boq_details) if boq_details else {}

            boq_entry = {
                "boq_id": boq_obj.boq_id,
                "boq_name": boq_obj.boq_name,
                "project_id": boq_obj.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "status": boq_obj.status,
                "client_status": boq_obj.client_status,
                "revision_number": boq_obj.revision_number or 0,
                "email_sent": boq_obj.email_sent,
                "user_id": row.user_id,
                "created_at": boq_obj.created_at.isoformat() if boq_obj.created_at else None,
                "created_by": boq_obj.created_by,
                "client_rejection_reason": boq_obj.client_rejection_reason,
                "last_pm_user_id": boq_obj.last_pm_user_id,
                "last_pm_name": row.last_pm_name,
                # Add financial data
                **financial_data
            }
            cancelled_boqs.append(boq_entry)

        response = {
            "message": "TD Cancelled BOQs retrieved successfully",
            "count": len(cancelled_boqs),
            "data": cancelled_boqs
        }

        if page is not None:
            total_pages = (total_count + page_size - 1) // page_size
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
        db.session.rollback()
        log.error(f"Error retrieving TD cancelled BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve TD cancelled BOQs',
            'details': str(e)
        }), 500
        
def get_td_production_management_boqs():
    """
    Get ALL BOQs for TD Production Management view (including completed)
    Returns all project BOQs regardless of assignment or completion status
    Frontend handles filtering between live and completed projects
    This is different from td_approved_boq which only shows unassigned projects
    """
    try:
        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401

        # OPTIMIZED: Join BOQDetails and User to eliminate N+1 queries
        query = (
            db.session.query(
                BOQ,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.start_date,
                Project.end_date,
                Project.status.label('project_status'),
                Project.user_id,
                User.full_name.label('last_pm_name'),
                BOQDetails
            )
            .join(Project, BOQ.project_id == Project.project_id)
            .outerjoin(User, BOQ.last_pm_user_id == User.user_id)
            .outerjoin(BOQDetails, and_(BOQDetails.boq_id == BOQ.boq_id, BOQDetails.is_deleted == False))
            .filter(
                BOQ.is_deleted == False,
                Project.is_deleted == False,
                BOQ.status != 'Rejected'  # Exclude rejected BOQs
                # NOTE: Removed completed project filter - frontend handles live/completed tab filtering
            )
            .order_by(BOQ.created_at.desc())
        )

        # OPTIMIZED: Use func.count() for better performance
        if page is not None:
            total_count = query.with_entities(func.count()).scalar()
            if total_count == 0:
                return jsonify({
                    "message": "No BOQs found for production management",
                    "count": 0,
                    "data": [],
                    "pagination": {
                        "page": page,
                        "page_size": page_size,
                        "total_count": 0,
                        "total_pages": 0,
                        "has_next": False,
                        "has_prev": False
                    }
                }), 200
            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            if not rows:
                return jsonify({"message": "No BOQs found for production management", "count": 0, "data": []}), 200
            total_count = len(rows)

        # Build response with financial data
        production_boqs = []
        for row in rows:
            # Use already-loaded BOQ and BOQDetails from JOIN (no additional queries)
            boq_obj = row.BOQ
            boq_details = row.BOQDetails

            # Calculate financial data
            financial_data = calculate_boq_financial_data(boq_obj, boq_details) if boq_details else {}

            boq_entry = {
                "boq_id": boq_obj.boq_id,
                "boq_name": boq_obj.boq_name,
                "project_id": boq_obj.project_id,
                "project_name": row.project_name,
                "project_code": row.project_code,
                "client": row.client,
                "location": row.location,
                "floor": row.floor_name,
                "hours": row.working_hours,
                "start_date": row.start_date.isoformat() if row.start_date else None,
                "end_date": row.end_date.isoformat() if row.end_date else None,
                "status": boq_obj.status,
                "boq_status": boq_obj.status,
                "project_status": row.project_status,
                "client_status": boq_obj.client_status,
                "revision_number": boq_obj.revision_number or 0,
                "email_sent": boq_obj.email_sent,
                "user_id": row.user_id,
                "created_at": boq_obj.created_at.isoformat() if boq_obj.created_at else None,
                "created_by": boq_obj.created_by,
                "client_rejection_reason": boq_obj.client_rejection_reason,
                "last_pm_user_id": boq_obj.last_pm_user_id,
                "last_pm_name": row.last_pm_name,
                # Flag to indicate if PM is assigned
                "pm_assigned": bool(row.user_id and row.user_id not in [None, '[]', 'null', '']),
                # Add financial data
                **financial_data
            }
            production_boqs.append(boq_entry)

        response = {
            "message": "TD Production Management BOQs retrieved successfully",
            "count": len(production_boqs),
            "data": production_boqs
        }

        if page is not None:
            total_pages = (total_count + page_size - 1) // page_size
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
        db.session.rollback()
        log.error(f"Error retrieving TD production management BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve TD production management BOQs',
            'details': str(e)
        }), 500
