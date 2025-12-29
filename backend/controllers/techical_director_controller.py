from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from models.preliminary_master import BOQInternalRevision
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload  # ✅ PERFORMANCE: Eager loading for N+1 fix
from datetime import datetime  # For datetime.min in sorting
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role
from utils.comprehensive_notification_service import notification_service

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
        # ✅ PERFORMANCE FIX: Eager load history and details to prevent N+1 queries
        if user_role == 'admin':
            # Admin sees all BOQs
            query = db.session.query(BOQ).options(
                selectinload(BOQ.history),
                selectinload(BOQ.details)
            ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True
            ).order_by(BOQ.created_at.desc())
        else:
            # TD should see: Pending_TD_Approval, Pending_Revision, approved, rejected, sent_for_review, new_purchase_create
            # TD should NOT see: Pending_PM_Approval (those are for PM only)
            # TD should NOT see: Internal_Revision_Pending (estimator still editing, not sent to TD yet)
            # Use db.func.lower() for case-insensitive comparison
            query = db.session.query(BOQ).options(
                selectinload(BOQ.history),
                selectinload(BOQ.details)
            ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True,
                db.func.lower(BOQ.status) != 'pending_pm_approval',  # Exclude BOQs pending PM approval
                db.func.lower(BOQ.status) != 'internal_revision_pending'  # Exclude BOQs still being edited by estimator
            ).order_by(BOQ.created_at.desc())
        # Paginate
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)
        # Build response with BOQ details and history
        boqs_list = []
        for boq in paginated.items:
            # ✅ PERFORMANCE: Use pre-loaded history and details (no queries!)
            history = sorted(
                [h for h in boq.history if h],
                key=lambda h: h.action_date if h.action_date else datetime.min,
                reverse=True
            )
            # Get BOQ details from pre-loaded relationship
            boq_details = next((bd for bd in boq.details if not bd.is_deleted), None)
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
                log.info(f"🔍 BOQ {boq.boq_id} ({boq.boq_name}): Processing {len(items)} items for cost calculation")
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
                            if labour:
                                log.debug(f"  Sub-item has {len(labour)} labour entries")
                            for lab in labour:
                                lab_cost = lab.get("total_cost") or (lab.get("hours", 0) * lab.get("rate_per_hour", 0))
                                if lab_cost > 0:
                                    log.debug(f"    Labour cost: AED {lab_cost}")
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
                        if labour:
                            log.debug(f"  Item has {len(labour)} labour entries (old format)")
                        for lab in labour:
                            lab_cost = lab.get("total_cost") or (lab.get("hours", 0) * lab.get("rate_per_hour", 0))
                            if lab_cost > 0:
                                log.debug(f"    Labour cost: AED {lab_cost}")
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

                    # Enhanced logging for labor cost debugging
                    log.info(f"  Item '{item.get('item_name', 'Unknown')}': materials={item_materials_cost}, labour={item_labour_cost}, selling_price={item_selling_price}")

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

            log.info(f"BOQ {boq.boq_id}: Items={items_subtotal}, Preliminaries={preliminaries_amount}, Subtotal={subtotal_before_discount}, Discount={discount_amount}, Grand Total={final_total_cost}")
            log.info(f"💰 BOQ {boq.boq_id} COST SUMMARY: Material={total_material_cost}, Labour={total_labour_cost}, Total={final_total_cost}")

            boq_data = {
                "boq_id": boq.boq_id,
                "project_id": boq.project_id,
                "boq_name": boq.boq_name,
                "project_name": boq.project.project_name if boq.project else None,
                "project_code": boq.project.project_code if boq.project else None,
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

            # Note: Old preliminary system removed - now using preliminaries_master + boq_preliminaries tables
            # Preliminary data is fetched through the new system in boq_controller.py
            # This section is kept for backward compatibility but does nothing
            try:
                pass  # Preliminaries now handled by new system
            except Exception as prelim_error:
                log.warning(f"⚠️ Failed to fetch preliminaries for BOQ {boq.boq_id}: {str(prelim_error)}")

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
                notification_service.notify_td_boq_decision(
                    boq_id=boq_id,
                    project_name=project.project_name,
                    td_id=td_user_id,
                    td_name=td_name,
                    recipient_user_ids=[estimator_user_id],
                    approved=(technical_director_status.lower() == 'approved'),
                    rejection_reason=rejection_reason if technical_director_status.lower() == 'rejected' else None
                )
        except Exception as notif_error:
            log.error(f"Failed to send TD decision notification: {notif_error}")

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