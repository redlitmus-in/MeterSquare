from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from models.preliminary import BOQInternalRevision
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role

log = get_logger()

def get_all_td_boqs():
    try:
        # Get current user role
        current_user = g.get('user', {})
        user_role = current_user.get('role', '').lower()

        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 10, type=int), 100)

        # Build query - Admin sees ALL BOQs, TD sees specific statuses
        if user_role == 'admin':
            # Admin sees all BOQs
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True
            ).order_by(BOQ.created_at.desc())
        else:
            # TD should see: Pending_TD_Approval, approved, rejected, sent_for_review, new_purchase_create
            # TD should NOT see: Pending_PM_Approval (those are for PM only)
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True,
                BOQ.status != 'Pending_PM_Approval'  # Exclude BOQs pending PM approval
            ).order_by(BOQ.created_at.desc())
        # Paginate
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)
        # Build response with BOQ details and history
        boqs_list = []
        for boq in paginated.items:
            # Get BOQ history (will be empty array if no history)
            history = BOQHistory.query.filter_by(boq_id=boq.boq_id).order_by(BOQHistory.action_date.desc()).all()
            # Get BOQ details
            boq_details = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()
            display_status = boq.status
            if boq.status in ['new_purchase_create', 'sent_for_review']:
                display_status = 'approved'

            # Serialize history data
            history_list = []
            for h in history:
                history_list.append({
                    "boq_history_id": h.boq_history_id,
                    "boq_status": h.boq_status
                   })
            # Calculate costs from BOQ details - handle both old and new formats
            total_material_cost = 0
            total_labour_cost = 0
            total_selling_price = 0
            overhead_percentage = 0
            profit_margin = 0

            if boq_details and boq_details.boq_details and "items" in boq_details.boq_details:
                items = boq_details.boq_details["items"]
                for item in items:
                    item_materials_cost = 0
                    item_labour_cost = 0
                    item_client_amount = 0  # CLIENT SELLING PRICE

                    # Check if item has sub_items (new format)
                    if "sub_items" in item and item.get("sub_items"):
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
                            labour = sub_item.get("labour", [])
                            for lab in labour:
                                lab_cost = lab.get("total_cost", 0)
                                total_labour_cost += lab_cost
                                item_labour_cost += lab_cost
                    else:
                        # OLD FORMAT: materials/labour are at item level
                        materials = item.get("materials", [])
                        for mat in materials:
                            mat_cost = mat.get("total_price", 0)
                            total_material_cost += mat_cost
                            item_materials_cost += mat_cost
                        labour = item.get("labour", [])
                        for lab in labour:
                            lab_cost = lab.get("total_cost", 0)
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

                    log.debug(f"Item '{item.get('item_name', 'Unknown')}': client_amount={item_client_amount}, selling_price={item_selling_price}, materials={item_materials_cost}, labour={item_labour_cost}")

                    # Get overhead and profit percentages (use first item's values)
                    if overhead_percentage == 0:
                        overhead_percentage = item.get("overhead_percentage", 0)
                    if profit_margin == 0:
                        profit_margin = item.get("profit_margin", 0) or item.get("profit_margin_percentage", 0)

            # Use calculated selling price if available, otherwise fall back to database value
            final_total_cost = total_selling_price if total_selling_price > 0 else (float(boq_details.total_cost) if boq_details and boq_details.total_cost else 0.0)

            # Apply discount if present in BOQ details
            discount_percentage = 0
            discount_amount = 0
            if boq_details and boq_details.boq_details:
                discount_percentage = boq_details.boq_details.get("discount_percentage", 0) or 0
                discount_amount = boq_details.boq_details.get("discount_amount", 0) or 0

                # Calculate discount amount if only percentage is provided
                if discount_amount == 0 and discount_percentage > 0 and final_total_cost > 0:
                    discount_amount = final_total_cost * (discount_percentage / 100)

                # Apply discount to final total
                if discount_amount > 0:
                    final_total_cost = final_total_cost - discount_amount
                    log.info(f"BOQ {boq.boq_id}: Applied discount {discount_percentage}% (AED {discount_amount}) to total. Before: {total_selling_price}, After: {final_total_cost}")

            boq_data = {
                "boq_id": boq.boq_id,
                "project_id": boq.project_id,
                "boq_name": boq.boq_name,
                "project_name": boq.project.project_name if boq.project else None,
                "client": boq.project.client if boq.project else None,
                "location": boq.project.location if boq.project else None,
                "area": boq.project.area if boq.project else None,
                "floor_name": boq.project.floor_name if boq.project else None,
                "status": display_status,  # Use 'status' to match frontend expectations
                "boq_status": display_status,
                "client_rejection_reason": boq.client_rejection_reason,  # Include rejection/cancellation reason
                "project_status" : boq.project.status if boq.project else None,
                "email_sent": boq.email_sent,
                "user_id": boq.project.user_id if boq.project else None,  # PM assignment indicator
                "revision_number": boq.revision_number if hasattr(boq, 'revision_number') else 0,  # Revision tracking
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
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "created_by": boq.created_by,
                "last_modified_at": boq.last_modified_at.isoformat() if boq.last_modified_at else None,
                "last_modified_by": boq.last_modified_by
            }

            # 🔍 DEBUG: Log the final values being sent to frontend
            log.info(f"📤 [TD API Response] BOQ {boq.boq_id} ({boq.boq_name}) - Sending to frontend: total_cost={final_total_cost}, selling_price={final_total_cost}, discount_percentage={discount_percentage}%, discount_amount={discount_amount}")

            boqs_list.append(boq_data)

        return jsonify({
            "boqs": boqs_list,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated.total,
                "pages": paginated.pages,
                "has_prev": paginated.has_prev,
                "has_next": paginated.has_next
            }
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error fetching BOQs: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch BOQs: {str(e)}",
            "error_type": type(e).__name__
        }), 500

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
        boq_email_service = BOQEmailService()

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

            # Send approval email to Estimator
            email_sent = boq_email_service.send_boq_approval_to_pm(
                boq_data, project_data, items_summary, recipient_email, comments
            )

            if not email_sent:
                return jsonify({
                    "success": False,
                    "message": "Failed to send approval email to Estimator",
                    "error": "Email service failed"
                }), 500

            # Prepare new action for APPROVED
            new_action = {
                "role": "technicalDirector",
                "type": "revision_approved" if is_revision_approval else "status_change",
                "sender": "technicalDirector",
                "receiver": "estimator",
                "status": "revision_approved" if is_revision_approval else "approved",
                "boq_name": boq.boq_name,
                "comments": comments or ("BOQ revision approved by Technical Director" if is_revision_approval else "BOQ approved by Technical Director"),
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

            # Send rejection email to Estimator
            email_sent = boq_email_service.send_boq_rejection_to_estimator(
                boq_data, project_data, items_summary, recipient_email,
                rejection_reason or comments
            )

            if not email_sent:
                return jsonify({
                    "success": False,
                    "message": "Failed to send rejection email to Estimator",
                    "error": "Email service failed"
                }), 500

            # Prepare new action for REJECTED
            new_action = {
                "role": "technicalDirector",
                "type": "status_change",
                "sender": "technicalDirector",
                "receiver": "estimator",
                "status": "rejected",
                "boq_name": boq.boq_name,
                "comments": comments or rejection_reason or "BOQ rejected",
                "rejection_reason": rejection_reason if rejection_reason else None,
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": td_name,
                "decided_by_user_id": td_user_id,
                "total_cost": items_summary.get("total_cost"),
                "project_name": project_data.get("project_name"),
                "recipient_email": recipient_email,
                "recipient_name": recipient_name
            }

            # ==================== CREATE INTERNAL REVISION FOR TD REJECTION ====================
            # Increment internal revision number and create snapshot
            current_internal_rev = boq.internal_revision_number or 0
            new_internal_rev = current_internal_rev + 1
            boq.internal_revision_number = new_internal_rev
            boq.has_internal_revisions = True

            # Create complete BOQ snapshot for internal revision tracking
            complete_boq_snapshot = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "status": boq.status,
                "revision_number": boq.revision_number or 0,
                "internal_revision_number": new_internal_rev,
                "total_cost": float(boq_details.total_cost) if boq_details.total_cost else 0,
                "total_items": boq_details.total_items or 0,
                "total_materials": boq_details.total_materials or 0,
                "total_labour": boq_details.total_labour or 0,
                "preliminaries": boq_details.boq_details.get("preliminaries", {}) if boq_details.boq_details else {},
                "items": items_summary.get('items', []),
                "summary": items_summary if items_summary else {},
                "created_by": boq.created_by,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "last_modified_by": td_name,
                "last_modified_at": datetime.utcnow().isoformat()
            }

            # # Create internal revision record for TD rejection
            # internal_revision = BOQInternalRevision(
            #     boq_id=boq_id,
            #     internal_revision_number=new_internal_rev,
            #     action_type='TD_REJECTED',
            #     actor_role='technicalDirector',
            #     actor_name=td_name,
            #     actor_user_id=td_user_id,
            #     status_before=boq.status,
            #     status_after=new_status,
            #     rejection_reason=rejection_reason or comments,
            #     changes_summary=complete_boq_snapshot
            # )
            # db.session.add(internal_revision)
            # log.info(f"✅ Internal revision {new_internal_rev} created for TD rejection of BOQ {boq_id}")

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
            existing_history.comments = comments or rejection_reason or f"BOQ {new_status.lower()}"
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
                comments=comments or rejection_reason or f"BOQ {new_status.lower()}",
                sender_role='technicalDirector',
                receiver_role=recipient_role,
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)
            log.info(f"BOQ {boq_id} - Created new history with {len(current_actions)} actions")

        db.session.commit()
        log.info(f"BOQ {boq_id} - Database committed successfully")

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

        current_user = g.user
        td_id = current_user['user_id']

        # Get all assignments with pending TD approval or already approved/rejected
        assignments = BOQMaterialAssignment.query.filter(
            BOQMaterialAssignment.is_deleted == False,
            BOQMaterialAssignment.selected_vendor_id != None
        ).order_by(BOQMaterialAssignment.vendor_selection_date.desc()).all()

        assignments_list = []
        for assignment in assignments:
            # Get BOQ
            boq = BOQ.query.filter_by(boq_id=assignment.boq_id, is_deleted=False).first()
            if not boq:
                continue

            # Get project
            project = Project.query.filter_by(project_id=assignment.project_id, is_deleted=False).first()
            if not project:
                continue

            # Get vendor
            vendor = None
            vendor_info = None
            if assignment.selected_vendor_id:
                vendor = Vendor.query.filter_by(vendor_id=assignment.selected_vendor_id, is_deleted=False).first()
                if vendor:
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
                # Get BOQ details which contains materials as JSON
                boq_detail = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()

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