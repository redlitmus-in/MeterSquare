from flask import request, jsonify, g
from models.user import User
from models.role import Role
from utils.boq_email_service import BOQEmailService
from models.project import Project
from models.boq import *
from config.logging import get_logger
from models.boq import *
from config.db import db
from flask import g
from utils.comprehensive_notification_service import notification_service

log = get_logger()

def confirm_client_approval(boq_id):
    """Estimator confirms that client has approved the BOQ"""
    try:
        # Get request data for client details and comments
        data = request.get_json(silent=True) or {}
        client_email = data.get('client_email')
        client_name = data.get('client_name')
        comments = data.get('comments', '')
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404
        # Get project details
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        # Get BOQ details for total cost
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        total_cost = float(boq_details.total_cost) if boq_details and boq_details.total_cost else 0.0

        # Get current user
        current_user = getattr(g, 'user', None)
        estimator_name = current_user.get('full_name', 'Estimator') if current_user else 'Estimator'
        estimator_id = current_user.get('user_id') if current_user else None

        # Update status to Client_Confirmed (lowercase for frontend consistency)
        boq.status = "Client_Confirmed"
        boq.client_status = True
        boq.last_modified_at = datetime.utcnow()

        if current_user:
            boq.last_modified_by = current_user.get('full_name', 'Unknown')

        # Get existing BOQ history
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

        # Prepare new action for client confirmation
        new_action = {
            "role": "estimator",
            "type": "client_confirmation",
            "sender": "estimator",
            "receiver": client_name,
            "status": "Client_Confirmed",
            "client_status":boq.client_status,
            "boq_name": boq.boq_name,
            "comments": comments or "Client has approved the BOQ",
            "timestamp": datetime.utcnow().isoformat(),
            "decided_by": estimator_name,
            "decided_by_user_id": estimator_id,
            "total_cost": total_cost,
            "project_name": project.project_name if project else None,
            "recipient_email": client_email if client_email else (project.client if project else None),
            "recipient_name": client_name if client_name else (project.client if project else "Client")
        }

        # Append new action
        current_actions.append(new_action)

        if existing_history:
            # Update existing history
            existing_history.action = current_actions
            # Mark JSONB field as modified for SQLAlchemy
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(existing_history, "action")

            existing_history.action_by = estimator_name
            existing_history.boq_status = "approved"
            existing_history.sender = estimator_name
            existing_history.receiver = client_name if client_name else (project.client if project else "Client")
            existing_history.comments = comments or "Client has approved the BOQ"
            existing_history.sender_role = 'estimator'
            existing_history.receiver_role = 'client'
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = estimator_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=current_actions,
                action_by=estimator_name,
                boq_status="Client_Confirmed",
                client_status=True,
                sender=estimator_name,
                receiver=client_name if client_name else (project.client if project else "Client"),
                comments=comments or "Client has approved the BOQ",
                sender_role='estimator',
                receiver_role='client',
                action_date=datetime.utcnow(),
                created_by=estimator_name
            )
            db.session.add(boq_history)

        # Cache fields BEFORE commit to avoid SQLAlchemy lazy-loading issues
        cached_project_name = project.project_name if project else "project"

        db.session.commit()

        # Send notification to TD about client approval using comprehensive service
        notification_sent = False
        try:
            from utils.comprehensive_notification_service import ComprehensiveNotificationService
            ComprehensiveNotificationService.notify_client_confirmed(
                boq_id=boq_id,
                project_name=cached_project_name,
                estimator_id=estimator_id,
                estimator_name=estimator_name,
                client_name=client_name
            )
            notification_sent = True
        except Exception as notif_error:
            log.error(f"[confirm_client_approval] Failed to send notification: {notif_error}")
            import traceback
            log.error(traceback.format_exc())

            # Fallback: create notification directly in DB
            if not notification_sent:
                try:
                    from utils.notification_utils import NotificationManager
                    from socketio_server import send_notification_to_user
                    from models.role import Role as RoleModel
                    td_role = RoleModel.query.filter(RoleModel.role.ilike('%technical%director%')).first()
                    if td_role:
                        td_users = User.query.filter_by(role_id=td_role.role_id, is_active=True, is_deleted=False).all()
                        for td in td_users:
                            fallback_notif = NotificationManager.create_notification(
                                user_id=td.user_id,
                                type='success',
                                title='Client Approved BOQ',
                                message=f'BOQ for {cached_project_name} has been approved. Confirmed by {estimator_name}',
                                priority='high',
                                category='boq',
                                action_label='View BOQ',
                                metadata={'boq_id': boq_id, 'client_confirmed': True},
                                sender_id=estimator_id,
                                sender_name=estimator_name
                            )
                            send_notification_to_user(td.user_id, fallback_notif.to_dict())
                            notification_sent = True
                except Exception as fallback_err:
                    log.error(f"[confirm_client_approval] Fallback also failed: {fallback_err}")

        # Send email to offline TDs only
        try:
            from models.role import Role as RoleModel
            boq_email_service = BOQEmailService()
            td_role_obj = RoleModel.query.filter(RoleModel.role.ilike('%technical%director%')).first()
            if td_role_obj:
                td_users = User.query.filter_by(role_id=td_role_obj.role_id, is_active=True, is_deleted=False).all()
                for td in td_users:
                    td_status = str(td.user_status).lower().strip() if td.user_status else "unknown"
                    if td_status == "offline":
                        email_sent = boq_email_service.send_client_confirmed_to_td(
                            boq_id=boq_id,
                            boq_name=boq.boq_name,
                            project_name=cached_project_name,
                            estimator_name=estimator_name,
                            client_name=client_name,
                            td_email=td.email,
                            td_name=td.full_name
                        )
                    else:
                        log.info(f"[confirm_client_approval] TD {td.user_id} is ONLINE - Email skipped")
        except Exception as email_err:
            log.error(f"[confirm_client_approval] Failed to send email to TD: {email_err}")

        return jsonify({
            "success": True,
            "message": "Client approval confirmed successfully",
            "boq_id": boq_id,
            "status": "Client_Confirmed",
            "client_status": True,
            "action_appended": True,
            "notification_sent": notification_sent
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error confirming client approval: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def reject_client_approval(boq_id):
    """Estimator confirms that client has rejected the BOQ"""
    try:
        data = request.get_json()
        rejection_reason = data.get('rejection_reason', '')

        if not rejection_reason:
            return jsonify({"success": False, "error": "Rejection reason is required"}), 400

        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()

        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Check if BOQ is in correct status
        if boq.status != "Sent_for_Confirmation":
            return jsonify({
                "success": False,
                "error": f"BOQ must be in 'Sent_for_Confirmation' status. Current status: {boq.status}"
            }), 400

        # Update status to client_rejected (lowercase for frontend consistency)
        boq.status = "Client_Rejected"
        boq.client_status = False
        boq.client_rejection_reason = rejection_reason  # Store rejection reason in client_rejection_reason
        boq.last_modified_at = datetime.utcnow()

        current_user = getattr(g, 'user', None)
        estimator_id = current_user.get('user_id') if current_user else None
        estimator_name = current_user.get('full_name', 'Estimator') if current_user else 'Estimator'
        if current_user:
            boq.last_modified_by = current_user.get('email', 'Unknown')

        project = boq.project
        # Cache fields BEFORE commit to avoid SQLAlchemy lazy-loading issues
        cached_project_name = project.project_name if project else "project"

        db.session.commit()

        # Send notification to TD about client rejection using comprehensive service
        try:
            from utils.comprehensive_notification_service import ComprehensiveNotificationService
            ComprehensiveNotificationService.notify_client_rejected(
                boq_id=boq_id,
                project_name=cached_project_name,
                estimator_id=estimator_id,
                estimator_name=estimator_name,
                rejection_reason=rejection_reason
            )
        except Exception as notif_error:
            log.error(f"[reject_client_approval] Failed to send notification: {notif_error}")
            import traceback
            log.error(traceback.format_exc())

        return jsonify({
            "success": True,
            "message": "Client rejection recorded successfully",
            "boq_id": boq_id,
            "status": "Client_Rejected",
            "client_status": False,
            "rejection_reason": rejection_reason
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

def cancel_boq(boq_id):
    """Estimator cancels BOQ because client doesn't want to proceed"""
    try:
        data = request.get_json()
        cancellation_reason = data.get('cancellation_reason', '')

        if not cancellation_reason:
            return jsonify({"success": False, "error": "Cancellation reason is required"}), 400

        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()

        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # BOQ can be cancelled from any status (except completed)
        if boq.status == "Completed":
            return jsonify({
                "success": False,
                "error": "Cannot cancel a completed BOQ"
            }), 400

        # Update status to Client_Cancelled
        boq.status = "Client_Cancelled"
        boq.client_rejection_reason = cancellation_reason  # Store cancellation reason
        boq.last_modified_at = datetime.utcnow()

        current_user = getattr(g, 'user', None)
        estimator_id = current_user.get('user_id') if current_user else None
        estimator_name = current_user.get('full_name', 'Estimator') if current_user else 'Estimator'
        if current_user:
            boq.last_modified_by = current_user.get('email', 'Unknown')

        project = boq.project

        db.session.commit()

        # Send notification to TD about BOQ cancellation
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            td_role = Role.query.filter_by(role='Technical Director', is_deleted=False).first()
            if td_role:
                td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                for td_user in td_users:
                    notification = NotificationManager.create_notification(
                        user_id=td_user.user_id,
                        type='warning',
                        title='BOQ Cancelled',
                        message=f'BOQ for {project.project_name if project else "project"} has been cancelled. Reason: {cancellation_reason}',
                        priority='high',
                        category='boq',
                        action_url=f'/technical-director/boq/{boq_id}',
                        action_label='View BOQ',
                        metadata={'boq_id': boq_id, 'cancellation_reason': cancellation_reason},
                        sender_id=estimator_id,
                        sender_name=estimator_name
                    )
                    send_notification_to_user(td_user.user_id, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send BOQ cancellation notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "BOQ cancelled successfully",
            "boq_id": boq_id,
            "status": boq.status,
            "cancellation_reason": cancellation_reason
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

def get_boq_details_history(boq_id):
    """Get BOQ version history and current details only if history exists"""
    try:
        from sqlalchemy import text

        # 1️⃣ Check if BOQ exists
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({
                "success": False,
                "error": "BOQ not found"
            }), 404

        # 2️⃣ Get history records for this BOQ
        history_records = (
            BOQDetailsHistory.query
            .filter_by(boq_id=boq_id)
            .order_by(BOQDetailsHistory.version.desc())
            .all()
        )

        # 3️⃣ If no history exists, return empty response (don't show BOQDetails)
        if not history_records:
            return jsonify({
                "success": True,
                "boq_id": boq_id,
                "boq_name": boq.boq_name,
                "message": "No history found for this BOQ",
                "total_versions": 0,
                "current_version": None,
                "history": []
            }), 200

        # 4️⃣ Fetch current BOQ details (only if history exists)
        current_boq_details = (
            BOQDetails.query
            .filter_by(boq_id=boq_id, is_deleted=False)
            .first()
        )

        # Helper function to enrich BOQ details with terms_conditions and images
        def enrich_boq_details(boq_details_json):
            if not boq_details_json:
                return boq_details_json

            import copy
            enriched = copy.deepcopy(boq_details_json)

            # Fetch terms & conditions from database (single row with term_ids array)
            try:
                # First get selected term_ids for this BOQ
                term_ids_query = text("""
                    SELECT term_ids FROM boq_terms_selections WHERE boq_id = :boq_id
                """)
                term_ids_result = db.session.execute(term_ids_query, {'boq_id': boq_id}).fetchone()
                selected_term_ids = term_ids_result[0] if term_ids_result and term_ids_result[0] else []

                # Get all active terms from master
                all_terms_query = text("""
                    SELECT term_id, terms_text, display_order
                    FROM boq_terms
                    WHERE is_active = TRUE AND is_deleted = FALSE
                    ORDER BY display_order, term_id
                """)
                all_terms_result = db.session.execute(all_terms_query)
                terms_items = []
                for row in all_terms_result:
                    term_id = row[0]
                    terms_items.append({
                        'term_id': term_id,
                        'terms_text': row[1],
                        'checked': term_id in selected_term_ids
                    })

                # Add terms_conditions to boq_details
                if terms_items:
                    enriched['terms_conditions'] = {
                        'items': terms_items
                    }
            except Exception as e:
                log.error(f"Error fetching terms for BOQ {boq_id}: {str(e)}")

            # Fetch sub_item images from database
            try:
                items = enriched.get('items', [])
                for item in items:
                    if item.get('sub_items'):
                        for sub_item in item['sub_items']:
                            sub_item_id = sub_item.get('sub_item_id')
                            if sub_item_id:
                                # Fetch image from master_sub_items table
                                master_sub_item = MasterSubItem.query.filter_by(
                                    sub_item_id=sub_item_id,
                                    is_deleted=False
                                ).first()

                                if master_sub_item and master_sub_item.sub_item_image:
                                    sub_item['sub_item_image'] = master_sub_item.sub_item_image
            except Exception as e:
                log.error(f"Error fetching images for BOQ {boq_id}: {str(e)}")

            return enriched

        # 5️⃣ Build history list with enriched data
        history_list = []
        for history in history_records:
            enriched_details = enrich_boq_details(history.boq_details)
            history_list.append({
                "boq_detail_history_id": history.boq_detail_history_id,
                "boq_id": history.boq_id,
                "boq_detail_id": history.boq_detail_id,
                "version": history.version,
                "boq_details": enriched_details,
                "total_cost": history.total_cost,
                "total_items": history.total_items,
                "total_materials": history.total_materials,
                "total_labour": history.total_labour,
                "created_at": history.created_at.isoformat() if history.created_at else None,
                "created_by": history.created_by
            })

        # 6️⃣ Prepare current version info with enriched data
        current_version = None
        if current_boq_details:
            enriched_current = enrich_boq_details(current_boq_details.boq_details)
            current_version = {
                "boq_detail_id": current_boq_details.boq_detail_id,
                "boq_id": current_boq_details.boq_id,
                "version": "current",
                "boq_details": enriched_current,
                "total_cost": current_boq_details.total_cost,
                "total_items": current_boq_details.total_items,
                "total_materials": current_boq_details.total_materials,
                "total_labour": current_boq_details.total_labour,
                "created_at": current_boq_details.created_at.isoformat() if current_boq_details.created_at else None,
                "created_by": current_boq_details.created_by,
                "last_modified_at": current_boq_details.last_modified_at.isoformat() if current_boq_details.last_modified_at else None,
                "last_modified_by": current_boq_details.last_modified_by
            }

        # 7️⃣ Return response
        return jsonify({
            "success": True,
            "boq_id": boq_id,
            "boq_name": boq.boq_name,
            "total_versions": len(history_records),
            "current_version": current_version,
            "history": history_list
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error fetching BOQ details history: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch BOQ history: {str(e)}"
        }), 500

def send_boq_to_project_manager():
    """Send BOQ to a specific Project Manager"""
    try:
        data = request.get_json()
        # Validate required fields
        boq_id = data.get('boq_id')
        pm_id = data.get('project_manager_id')
        if not boq_id:
            return jsonify({"error": "boq_id is required"}), 400
        if not pm_id:
            return jsonify({"error": "project_manager_id is required"}), 400
        # Get current user (Technical Director)
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        current_user_name = current_user.get('full_name')
        current_user_id = current_user.get('user_id')
        current_user_role = current_user.get('role')
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

        # Get SPECIFIC Project Manager by ID
        pm = User.query.filter_by(user_id=pm_id, is_deleted=False).first()
        if not pm:
            return jsonify({"error": f"Project Manager with ID {pm_id} not found"}), 404

        if not pm.email:
            return jsonify({"error": f"Project Manager {pm.full_name} has no email address"}), 400
        # Prepare BOQ data
        boq_data = {
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'status': boq.status
        }

        # Prepare project data
        project_data = {
            'project_name': project.project_name,
            'client': project.client if hasattr(project, 'client') else 'N/A',
            'location': project.location if hasattr(project, 'location') else 'N/A'
        }

        # Prepare items summary from BOQ details JSON
        boq_json = boq_details.boq_details

        # Handle both old and new data structures
        if 'existing_purchase' in boq_json and 'items' in boq_json['existing_purchase']:
            items = boq_json['existing_purchase']['items']
            items_summary = boq_json.get('combined_summary', {})
        else:
            items = boq_json.get('items', [])
            items_summary = boq_json.get('summary', {})

        items_summary['items'] = items

        # Initialize email service
        boq_email_service = BOQEmailService()

        # Check if PM is offline - only send email if offline
        email_sent = False
        if pm.user_status == "offline":
            # Send professional BOQ approval email to PM
            email_sent = boq_email_service.send_boq_approval_to_pm(
                boq_data=boq_data,
                project_data=project_data,
                items_summary=items_summary,
                pm_email=pm.email,
                comments=None,  # No comments when estimator sends to PM
                estimator_name=current_user_name,
                pm_name=pm.full_name
            )
        else:
            # PM is online - they will receive in-app notification only
            log.info(f"📧 ⏭️  PM {pm.full_name} is ONLINE - Email skipped, will send in-app notification")

        # Update BOQ status (regardless of online/offline status)
        boq.status = 'Pending_PM_Approval'
        boq.last_modified_by = current_user_name
        boq.last_modified_at = datetime.utcnow()
        boq.email_sent = email_sent  # Only True if email was actually sent (PM offline)
        boq.last_pm_user_id = pm_id  # Store which PM this BOQ was sent to

        # NOTE: PM is NOT assigned to project here - only after client approval and TD assignment

        # Check if history entry already exists for this BOQ
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        # Prepare action data
        new_action = {
            "role": current_user_role,
            "type": "sent_to_pm",
            "sender": current_user_name,
            "receiver": pm.full_name,
            "sender_role": current_user_role,
            "receiver_role": "project_manager",
            "status": boq.status,
            "comments": f"BOQ sent to Project Manager {pm.full_name}",
            "timestamp": datetime.utcnow().isoformat(),
            "decided_by": current_user_name,
            "decided_by_user_id": current_user_id,
            "recipient_email": pm.email,
            "recipient_name": pm.full_name,
            "recipient_user_id": pm_id,
            "boq_name": boq.boq_name,
            "project_name": project_data.get("project_name")
        }

        if existing_history:
            # Handle existing actions - ensure it's always a list
            if existing_history.action is None:
                current_actions = []
            elif isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]
            else:
                current_actions = []

            # Check if similar action already exists
            action_exists = False
            for existing_action in current_actions:
                if (existing_action.get('type') == new_action['type'] and
                    existing_action.get('sender') == new_action['sender'] and
                    existing_action.get('receiver') == new_action['receiver']):
                    existing_ts = existing_action.get('timestamp', '')
                    new_ts = new_action['timestamp']
                    if existing_ts and new_ts:
                        try:
                            existing_dt = datetime.fromisoformat(existing_ts)
                            new_dt = datetime.fromisoformat(new_ts)
                            if abs((new_dt - existing_dt).total_seconds()) < 60:
                                action_exists = True
                                break
                        except:
                            pass

            if not action_exists:
                current_actions.append(new_action)
                existing_history.action = current_actions
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(existing_history, "action")

            existing_history.action_by = current_user_name
            existing_history.boq_status = boq.status
            existing_history.sender = current_user_name
            existing_history.receiver = pm.full_name
            existing_history.comments = f"BOQ sent to Project Manager {pm.full_name}"
            existing_history.sender_role = current_user_role
            existing_history.receiver_role = 'project_manager'
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = current_user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=[new_action],
                action_by=current_user_name,
                boq_status=boq.status,
                sender=current_user_name,
                receiver=pm.full_name,
                comments=f"BOQ sent to Project Manager {pm.full_name}",
                sender_role=current_user_role,
                receiver_role='project_manager',
                action_date=datetime.utcnow(),
                created_by=current_user_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Send notification to PM about BOQ requiring approval
        try:
            notification_service.notify_boq_sent_to_pm(
                boq_id=boq_id,
                project_name=project.project_name,
                estimator_id=current_user_id,
                estimator_name=current_user_name,
                pm_user_id=pm_id
            )
        except Exception as notif_error:
            log.error(f"Failed to send BOQ to PM notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": f"BOQ sent successfully to Project Manager {pm.full_name}",
            "boq_id": boq_id,
            "project_manager": {
                "id": pm_id,
                "name": pm.full_name,
                "email": pm.email
            },
            "status": boq.status
        }), 200
        # else:
        #     return jsonify({
        #         "success": False,
        #         "message": "Failed to send BOQ email to Project Manager",
        #         "boq_id": boq_id,
        #         "error": "Email service failed"
        #     }), 500

    except Exception as e:
        db.session.rollback()
        log.error(f"Error sending BOQ to Project Manager: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to send BOQ to Project Manager",
            "error": str(e)
        }), 500

def send_boq_to_technical_director():
    """Send PM-approved BOQ to Technical Director for final approval"""
    try:
        data = request.get_json()

        boq_id = data.get('boq_id')
        td_id = data.get('technical_director_id')

        if not boq_id:
            return jsonify({"error": "boq_id is required"}), 400

        # Get current user (Estimator)
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        current_user_name = current_user.get('full_name')
        current_user_id = current_user.get('user_id')
        current_user_role = current_user.get('role')

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Validate BOQ status - must be PM_Approved
        if boq.status != 'PM_Approved':
            return jsonify({
                "error": f"BOQ must be approved by Project Manager first. Current status: {boq.status}"
            }), 400

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get Technical Director
        td_role = Role.query.filter_by(role='technicalDirector').first()
        if not td_role:
            return jsonify({"error": "Technical Director role not found"}), 404

        # If specific TD ID provided, use it; otherwise get first available TD
        if td_id:
            td = User.query.filter_by(user_id=td_id, role_id=td_role.role_id, is_deleted=False).first()
        else:
            td = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).first()

        if not td:
            return jsonify({"error": "Technical Director not found"}), 404

        if not td.email:
            return jsonify({"error": f"Technical Director {td.full_name} has no email address"}), 400

        # Prepare BOQ data
        boq_data = {
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'status': boq.status
        }

        # Prepare project data
        project_data = {
            'project_name': project.project_name,
            'client': project.client if hasattr(project, 'client') else 'N/A',
            'location': project.location if hasattr(project, 'location') else 'N/A'
        }

        # Prepare items summary from BOQ details JSON
        boq_json = boq_details.boq_details

        # Handle both old and new data structures
        if 'existing_purchase' in boq_json and 'items' in boq_json['existing_purchase']:
            items = boq_json['existing_purchase']['items']
            items_summary = boq_json.get('combined_summary', {})
        else:
            items = boq_json.get('items', [])
            items_summary = boq_json.get('summary', {})

        items_summary['items'] = items

        # Initialize email service
        boq_email_service = BOQEmailService()

        # Add project_code to project_data
        project_data['project_code'] = getattr(project, 'project_code', 'N/A')

        # Send email to TD ONLY if they are OFFLINE
        # If online, they will receive in-app notification only
        email_sent = False

        # Normalize status to lowercase for comparison
        td_status = str(td.user_status).lower().strip() if td.user_status else "unknown"

        if td_status == "offline":
            # Send professional BOQ submission email to TD (similar to estimator → PM)
            email_sent = boq_email_service.send_boq_approval_to_pm(
                boq_data=boq_data,
                project_data=project_data,
                items_summary=items_summary,
                pm_email=td.email,
                comments=None,
                estimator_name=current_user_name,
                pm_name=td.full_name
            )

            if email_sent:
                log.info(f"📧 ✅ SUCCESS: BOQ submission email sent to TD {td.email}")
            else:
                log.error(f"📧 ❌ FAILED: Could not send email to TD {td.email}")
        else:
            log.info(f"📧 ⏭️  TD is ONLINE (status='{td_status}') - Email skipped, in-app notification will be sent")

        if email_sent or td_status != "offline":
            # Update BOQ status to Pending_TD_Approval
            boq.status = 'Pending_TD_Approval'
            boq.last_modified_by = current_user_name
            boq.last_modified_at = datetime.utcnow()
            boq.email_sent = True

            # Check if history entry already exists for this BOQ
            existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

            # Prepare action data
            new_action = {
                "role": current_user_role,
                "type": "sent_to_td",
                "sender": current_user_name,
                "receiver": td.full_name,
                "sender_role": current_user_role,
                "receiver_role": "technical_director",
                "status": boq.status,
                "comments": f"BOQ sent to Technical Director {td.full_name} for final approval",
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": current_user_name,
                "decided_by_user_id": current_user_id,
                "recipient_email": td.email,
                "recipient_name": td.full_name,
                "recipient_user_id": td.user_id,
                "boq_name": boq.boq_name,
                "project_name": project_data.get("project_name")
            }

            if existing_history:
                # Handle existing actions - ensure it's always a list
                if existing_history.action is None:
                    current_actions = []
                elif isinstance(existing_history.action, list):
                    current_actions = existing_history.action
                elif isinstance(existing_history.action, dict):
                    current_actions = [existing_history.action]
                else:
                    current_actions = []

                # Check if similar action already exists
                action_exists = False
                for existing_action in current_actions:
                    if (existing_action.get('type') == new_action['type'] and
                        existing_action.get('sender') == new_action['sender'] and
                        existing_action.get('receiver') == new_action['receiver']):
                        existing_ts = existing_action.get('timestamp', '')
                        new_ts = new_action['timestamp']
                        if existing_ts and new_ts:
                            try:
                                existing_dt = datetime.fromisoformat(existing_ts)
                                new_dt = datetime.fromisoformat(new_ts)
                                if abs((new_dt - existing_dt).total_seconds()) < 60:
                                    action_exists = True
                                    break
                            except:
                                pass

                if not action_exists:
                    current_actions.append(new_action)
                    existing_history.action = current_actions
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(existing_history, "action")

                existing_history.action_by = current_user_name
                existing_history.boq_status = boq.status
                existing_history.sender = current_user_name
                existing_history.receiver = td.full_name
                existing_history.comments = f"BOQ sent to Technical Director {td.full_name} for final approval"
                existing_history.sender_role = current_user_role
                existing_history.receiver_role = 'technical_director'
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = current_user_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                # Create new history entry
                boq_history = BOQHistory(
                    boq_id=boq_id,
                    action=[new_action],
                    action_by=current_user_name,
                    boq_status=boq.status,
                    sender=current_user_name,
                    receiver=td.full_name,
                    comments=f"BOQ sent to Technical Director {td.full_name} for final approval",
                    sender_role=current_user_role,
                    receiver_role='technical_director',
                    action_date=datetime.utcnow(),
                    created_by=current_user_name
                )
                db.session.add(boq_history)

            db.session.commit()

            # Send notification to TD about BOQ requiring final approval
            try:
                notification_service.notify_boq_sent_to_td(
                    boq_id=boq_id,
                    project_name=project.project_name,
                    estimator_id=current_user_id,
                    estimator_name=current_user_name,
                    td_user_id=td.user_id
                )
            except Exception as notif_error:
                log.error(f"=== NOTIFICATION FAILED ===")
                log.error(f"Failed to send BOQ to TD notification: {notif_error}")
                import traceback
                log.error(traceback.format_exc())

            return jsonify({
                "success": True,
                "message": f"BOQ sent successfully to Technical Director {td.full_name}",
                "boq_id": boq_id,
                "technical_director": {
                    "id": td.user_id,
                    "name": td.full_name,
                    "email": td.email
                },
                "status": boq.status
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": "Failed to send BOQ email to Technical Director",
                "boq_id": boq_id,
                "error": "Email service failed"
            }), 500

    except Exception as e:
        db.session.rollback()
        log.error(f"Error sending BOQ to Technical Director: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to send BOQ to Technical Director",
            "error": str(e)
        }), 500
