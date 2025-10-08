from flask import request, jsonify, g
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

        log.info(f"Confirming client approval for BOQ {boq_id}")
        log.info(f"Request data: {data}")

        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()

        if not boq:
            log.error(f"BOQ {boq_id} not found")
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        log.info(f"BOQ found: ID={boq_id}, Status={boq.status}")

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
        log.info(f"Appending action to history. Current actions count: {len(current_actions)}")

        if existing_history:
            log.info(f"Updating existing history record for BOQ {boq_id}")
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
            log.info(f"History updated with {len(existing_history.action)} actions")
        else:
            log.info(f"Creating new history record for BOQ {boq_id}")
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
            log.info(f"New history created with {len(current_actions)} actions")

        db.session.commit()
        log.info(f"Successfully committed client approval for BOQ {boq_id}")

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
    """Get all version history of BOQ details for a particular BOQ ID"""
    try:
        # Check if BOQ exists
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()

        if not boq:
            return jsonify({
                "success": False,
                "error": "BOQ not found"
            }), 404

        # Get current BOQ details
        current_boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()

        if not current_boq_details:
            return jsonify({
                "success": False,
                "error": "BOQ details not found"
            }), 404

        # Get all history versions for this BOQ detail
        history_records = BOQDetailsHistory.query.filter_by(
            boq_id=boq_id
        ).order_by(BOQDetailsHistory.version.desc()).all()

        # Prepare history list
        history_list = []

        for history in history_records:
            history_data = {
                "boq_detail_history_id": history.boq_detail_history_id,
                "boq_id": history.boq_id,
                "boq_detail_id": history.boq_detail_id,
                "version": history.version,
                "boq_details": history.boq_details,  # Complete BOQ structure
                "total_cost": history.total_cost,
                "total_items": history.total_items,
                "total_materials": history.total_materials,
                "total_labour": history.total_labour,
                "created_at": history.created_at.isoformat() if history.created_at else None,
                "created_by": history.created_by
            }
            history_list.append(history_data)

        # Get current/latest version info
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

        return jsonify({
            "success": True,
            "boq_id": boq_id,
            "boq_name": boq.boq_name,
            "total_versions": len(history_records),
            "current_version": current_version,
            "history": history_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching BOQ details history: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
