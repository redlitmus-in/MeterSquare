from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role

log = get_logger()

def get_all_td_boqs():
    try:
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 10, type=int), 100)

        # Build query - get all BOQs
        query = db.session.query(BOQ).filter(
            BOQ.is_deleted == False,
            BOQ.email_sent == True,
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

            # Serialize history data
            history_list = []
            for h in history:
                history_list.append({
                    "boq_history_id": h.boq_history_id,
                    "boq_status": h.boq_status
                   })

            # Serialize boq_details to dictionary
            boq_details_dict = None
            if boq_details:
                boq_details_dict = {
                    "boq_detail_id": boq_details.boq_detail_id,
                    "boq_id": boq_details.boq_id,
                    "total_cost": float(boq_details.total_cost) if boq_details.total_cost else 0.0,
                    "total_items": int(boq_details.total_items) if boq_details.total_items else 0,
                    "total_materials": int(boq_details.total_materials) if boq_details.total_materials else 0,
                    "total_labour": int(boq_details.total_labour) if boq_details.total_labour else 0,
                    "file_name": boq_details.file_name,
                    "boq_details": boq_details.boq_details,  # This is already a JSONB/dict
                    "created_at": boq_details.created_at.isoformat() if boq_details.created_at else None,
                    "created_by": boq_details.created_by
                }

            boq_data = {
                "boq_id": boq.boq_id,
                "project_id": boq.project_id,
                "boq_name": boq.boq_name,
                "status": boq.status,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "created_by": boq.created_by,
                "last_modified_at": boq.last_modified_at.isoformat() if boq.last_modified_at else None,
                "last_modified_by": boq.last_modified_by,
                "email_sent": boq.email_sent,
                "project_name": boq.project.project_name if boq.project else None,
                "history": history_list,  # Will be [] if no history exists
                "boq_details": boq_details_dict  # Now properly serialized
            }
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
    Technical Director sends approval/rejection email
    - If approved: Send to Project Manager
    - If rejected: Send to Estimator
    """
    try:
        # Get request data
        data = request.get_json(silent=True)
        if not data:
            return jsonify({
                "error": "Invalid request",
                "message": "Request body must be valid JSON"
            }), 400

        boq_id = data.get("boq_id")
        comments = data.get("comments") or ""  # Handle null/empty comments
        rejection_reason = data.get("rejection_reason") or ""  # Handle null/empty rejection reason
        technical_director_status = data.get("technical_director_status")

        # Validate required fields
        if not boq_id:
            return jsonify({
                "error": "Missing required field",
                "message": "boq_id is required"
            }), 400

        if not technical_director_status:
            return jsonify({
                "error": "Missing required field",
                "message": "technical_director_status is required (approved/rejected)"
            }), 400

        # Validate status value
        if technical_director_status.lower() not in ['approved', 'rejected']:
            return jsonify({
                "error": "Invalid status",
                "message": "technical_director_status must be 'approved' or 'rejected'"
            }), 400

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({
                "error": "BOQ not found",
                "message": f"No BOQ found with ID {boq_id}"
            }), 404

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({
                "error": "BOQ details not found",
                "message": f"No BOQ details found for BOQ ID {boq_id}"
            }), 404

        # Get project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({
                "error": "Project not found",
                "message": f"No project found with ID {boq.project_id}"
            }), 404

        # Get current TD user info
        current_user = getattr(g, 'user', None)
        td_name = current_user.get('full_name', 'Technical Director') if current_user else 'Technical Director'
        td_email = current_user.get('email', '') if current_user else ''

        # Prepare BOQ data for email
        boq_data = {
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'status': technical_director_status.capitalize(),
            'created_by': boq.created_by,
            'created_at': boq.created_at.strftime('%d-%b-%Y %I:%M %p') if boq.created_at else 'N/A'
        }

        # Prepare project data
        project_data = {
            'project_name': project.project_name,
            'client': project.client if hasattr(project, 'client') else 'N/A',
            'location': project.location if hasattr(project, 'location') else 'N/A'
        }

        # Prepare items summary
        items_summary = boq_details.boq_details.get('summary', {}) if boq_details.boq_details else {}
        items_summary['items'] = boq_details.boq_details.get('items', []) if boq_details.boq_details else []

        # Initialize email service
        from utils.boq_email_service import BOQEmailService
        boq_email_service = BOQEmailService()

        recipient_email = None
        recipient_name = None
        recipient_role = None
        new_status = None

        if technical_director_status.lower() == 'approved':
            # BOQ approved - Send to Project Manager assigned to this project
            log.info(f"BOQ {boq_id} approved by TD, finding Project Manager for project {project.project_id}")

            # Check if project has an assigned PM
            if not project.user_id:
                return jsonify({
                    "error": "No Project Manager assigned",
                    "message": f"Project '{project.project_name}' does not have a Project Manager assigned"
                }), 404

            # Get the Project Manager assigned to this project
            project_manager = User.query.filter_by(
                user_id=project.user_id,
                is_active=True,
                is_deleted=False
            ).first()

            if not project_manager:
                return jsonify({
                    "error": "Project Manager not found",
                    "message": f"No active Project Manager found with ID {project.user_id}"
                }), 404

            if not project_manager.email:
                return jsonify({
                    "error": "Project Manager has no email",
                    "message": f"Project Manager {project_manager.full_name} does not have an email address"
                }), 400

            recipient_email = project_manager.email
            recipient_name = project_manager.full_name or "Project Manager"
            recipient_role = "projectManager"
            new_status = "Approved"

            # Send approval email to PM
            email_sent = boq_email_service.send_boq_approval_to_pm(
                boq_data, project_data, items_summary, recipient_email, comments
            )

        else:  # rejected
            # BOQ REJECTED - Send to Estimator (original creator)
            log.info(f"BOQ {boq_id} rejected by TD, finding Estimator")

            # Find Estimator role
            estimator_role = Role.query.filter(
                Role.role.in_(['estimator', 'Estimator']),
                Role.is_deleted == False
            ).first()

            if not estimator_role:
                return jsonify({
                    "error": "Estimator role not found",
                    "message": "Estimator role not configured in the system"
                }), 404

            # Find the estimator who created this BOQ
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

            # If not found by created_by, get any active estimator
            if not estimator:
                estimator = User.query.filter_by(
                    role_id=estimator_role.role_id,
                    is_active=True,
                    is_deleted=False
                ).first()

            if not estimator:
                return jsonify({
                    "error": "No Estimator found",
                    "message": "No active Estimator found in the system"
                }), 404

            if not estimator.email:
                return jsonify({
                    "error": "Estimator has no email",
                    "message": f"Estimator {estimator.full_name} does not have an email address"
                }), 400

            recipient_email = estimator.email
            recipient_name = estimator.full_name or "Estimator"
            recipient_role = "estimator"
            new_status = "Rejected"

            # Send rejection email to Estimator
            email_sent = boq_email_service.send_boq_rejection_to_estimator(
                boq_data, project_data, items_summary, recipient_email,
                rejection_reason or comments  # Use rejection_reason if provided, otherwise comments
            )

        if not email_sent:
            return jsonify({
                "success": False,
                "message": f"Failed to send {new_status.lower()} email",
                "error": "Email service failed"
            }), 500

        # Update BOQ status
        boq.status = new_status
        boq.last_modified_by = td_name
        boq.last_modified_at = datetime.utcnow()

        # Check if history entry already exists for this BOQ
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        # Prepare action data in the new format
        new_action = {
            "role": "technicalDirector",
            "type": "status_change",
            "sender": "technicalDirector",
            "receiver": recipient_role,
            "status": new_status.lower(),
            "comments": comments if comments else (rejection_reason if new_status == "Rejected" else "BOQ decision notification"),
            "timestamp": datetime.utcnow().isoformat(),
            "decided_by": td_name,
            "decided_by_user_id": current_user.get('user_id') if current_user else None,
            "reject_category": None,
            "rejection_reason": rejection_reason if rejection_reason and new_status == "Rejected" else None,
            "recipient_email": recipient_email,
            "recipient_name": recipient_name,
            "boq_name": boq.boq_name,
            "project_name": project_data.get("project_name"),
            "total_cost": items_summary.get("total_cost")
        }

        if existing_history:
            # Append to existing action array (avoid duplicates)
            current_actions = existing_history.action if isinstance(existing_history.action, list) else [existing_history.action] if existing_history.action else []

            # Check if similar action already exists (same type, sender, receiver, status, timestamp within 1 minute)
            action_exists = False
            for existing_action in current_actions:
                if (existing_action.get('type') == new_action['type'] and
                    existing_action.get('sender') == new_action['sender'] and
                    existing_action.get('receiver') == new_action['receiver'] and
                    existing_action.get('status') == new_action['status']):
                    # Check if timestamps are within 1 minute (to avoid duplicate on retry)
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
            existing_history.action_by = td_name
            existing_history.boq_status = new_status
            existing_history.sender = td_name
            existing_history.receiver = recipient_name
            existing_history.comments = comments if comments else (rejection_reason if new_status == "Rejected" else "BOQ decision notification")
            existing_history.sender_role = 'technicalDirector'
            existing_history.receiver_role = recipient_role
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = td_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry with action as array
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=[new_action],  # Store as array
                action_by=td_name,
                boq_status=new_status,
                sender=td_name,
                receiver=recipient_name,
                comments=comments if comments else (rejection_reason if new_status == "Rejected" else "BOQ decision notification"),
                sender_role='technicalDirector',
                receiver_role=recipient_role,
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)

        db.session.commit()

        log.info(f"BOQ {boq_id} {new_status.lower()} by TD, email sent to {recipient_email}")

        return jsonify({
            "success": True,
            "message": f"BOQ {new_status.lower()} successfully and email sent to {recipient_role}",
            "boq_id": boq_id,
            "status": new_status,
            "recipient": recipient_email,
            "recipient_role": recipient_role
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