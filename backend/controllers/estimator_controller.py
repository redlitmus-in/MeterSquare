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

        # Update status to Client_Confirmed
        boq.status = "Client_Confirmed"
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
                sender=estimator_name,
                receiver=client_name if client_name else (project.client if project else "Client"),
                comments=comments or "Client has approved the BOQ",
                sender_role='estimator',
                receiver_role='client',
                action_date=datetime.utcnow(),
                created_by=estimator_name
            )
            db.session.add(boq_history)

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Client approval confirmed successfully",
            "boq_id": boq_id,
            "status": boq.status,
            "action_appended": True
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

        # Update status to Client_Rejected
        boq.status = "Client_Rejected"
        boq.client_rejection_reason = rejection_reason  # Store rejection reason in client_rejection_reason
        boq.last_modified_at = datetime.utcnow()

        current_user = getattr(g, 'user', None)
        if current_user:
            boq.last_modified_by = current_user.get('email', 'Unknown')

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Client rejection recorded successfully",
            "boq_id": boq_id,
            "status": boq.status,
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
        if current_user:
            boq.last_modified_by = current_user.get('email', 'Unknown')

        db.session.commit()

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

        # 3️⃣ If no history exists, return empty response (don’t show BOQDetails)
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

        # 5️⃣ Build history list
        history_list = []
        for history in history_records:
            history_list.append({
                "boq_detail_history_id": history.boq_detail_history_id,
                "boq_id": history.boq_id,
                "boq_detail_id": history.boq_detail_id,
                "version": history.version,
                "boq_details": history.boq_details,
                "total_cost": history.total_cost,
                "total_items": history.total_items,
                "total_materials": history.total_materials,
                "total_labour": history.total_labour,
                "created_at": history.created_at.isoformat() if history.created_at else None,
                "created_by": history.created_by
            })

        # 6️⃣ Prepare current version info
        current_version = None
        if current_boq_details:
            current_version = {
                "boq_detail_id": current_boq_details.boq_detail_id,
                "boq_id": current_boq_details.boq_id,
                "version": "current",
                "boq_details": current_boq_details.boq_details,
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
        items_summary = boq_details.boq_details.get('summary', {})
        items_summary['items'] = boq_details.boq_details.get('items', [])

        # Initialize email service
        boq_email_service = BOQEmailService()

        # Prepare projects data for PM assignment notification
        projects_data = [{
            'project_id': project.project_id,
            'project_name': project.project_name,
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'client': project.client if hasattr(project, 'client') else 'N/A',
            'location': project.location if hasattr(project, 'location') else 'N/A',
            'total_cost': items_summary.get('total_cost', 0),
            'status': boq.status
        }]

        # Send email to the SPECIFIC Project Manager using existing method
        email_sent = boq_email_service.send_pm_assignment_notification(
            pm.email, pm.full_name, current_user_name, projects_data
        )

        if email_sent:
            # Update BOQ status to indicate it's sent to PM for approval (NOT assignment)
            boq.status = 'Pending_PM_Approval'
            boq.last_modified_by = current_user_name
            boq.last_modified_at = datetime.utcnow()
            boq.email_sent = True

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
        else:
            return jsonify({
                "success": False,
                "message": "Failed to send BOQ email to Project Manager",
                "boq_id": boq_id,
                "error": "Email service failed"
            }), 500

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
        items_summary = boq_details.boq_details.get('summary', {})
        items_summary['items'] = boq_details.boq_details.get('items', [])

        # Initialize email service
        boq_email_service = BOQEmailService()

        # Prepare projects data for TD notification
        projects_data = [{
            'project_id': project.project_id,
            'project_name': project.project_name,
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'client': project.client if hasattr(project, 'client') else 'N/A',
            'location': project.location if hasattr(project, 'location') else 'N/A',
            'total_cost': items_summary.get('total_cost', 0),
            'status': 'Pending TD Approval'
        }]

        # Send email to Technical Director
        email_sent = boq_email_service.send_pm_assignment_notification(
            td.email, td.full_name, current_user_name, projects_data
        )

        if email_sent:
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
