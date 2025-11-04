from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role
from datetime import datetime

log = get_logger()

def create_pm():
    try:
        data = request.get_json()

        # Validate role exists
        role = Role.query.filter_by(role='projectManager').first()
        if not role:
            return jsonify({"error": "Project Manager role not found"}), 404

        # Create new Project Manager user
        new_pm = User(
            email=data['email'],
            phone=data['phone'],
            role_id=role.role_id,
            full_name=data['full_name'],
            created_at=datetime.utcnow(),
            is_deleted=False,
            is_active=True,
            department='Project Management'
        )

        db.session.add(new_pm)
        db.session.commit()
        new_user_id = new_pm.user_id

        # Assign PM to multiple projects (accept both 'project_id' and 'project_ids')
        project_ids = data.get('project_ids', data.get('project_id', []))
        assigned_count = 0
        if project_ids:
            for proj_id in project_ids:
                project = Project.query.filter_by(project_id=proj_id, is_deleted=False).first()
                if project:
                    # Assign this PM to the project (one PM per project, but PM can have multiple projects)
                    project.user_id = new_user_id
                    project.last_modified_at = datetime.utcnow()
                    db.session.add(project)
                    assigned_count += 1

            db.session.commit()

        return jsonify({
            "message": "Project Manager created successfully",
            "user_id": new_user_id,
            "assigned_projects": project_ids
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating Project Manager: {str(e)}")
        return jsonify({
            "error": f"Failed to create Project Manager: {str(e)}"
        }), 500

def get_all_pm_boqs():
    try:
        from utils.admin_viewing_context import get_effective_user_context, should_apply_role_filter

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get effective user context (handles admin viewing as another role)
        context = get_effective_user_context()

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 10, type=int), 100)

        # Get all projects assigned to this project manager (admin sees all projects with PM assigned)
        if user_role == 'admin' or not should_apply_role_filter(context):
            assigned_projects = db.session.query(Project.project_id).filter(
                Project.user_id.isnot(None),  # Only projects with PM assigned
                Project.is_deleted == False
            ).all()
        else:
            assigned_projects = db.session.query(Project.project_id).filter(
                Project.user_id == user_id,
                Project.is_deleted == False
            ).all()
        # Extract project IDs
        project_ids = [p.project_id for p in assigned_projects]

        # Admin sees all BOQs, skip the complex approval query
        if user_role == 'admin':
            boq_ids_for_approval = []
        else:
            # MODIFIED: Also get BOQs where this PM is the recipient in BOQ history (for approval requests)
            # Find BOQs where this PM was sent the BOQ for approval OR where PM approved it
            # Query using raw SQL to search in JSONB array
            from sqlalchemy import text

            boqs_for_approval_query = db.session.execute(
                text("""
                    SELECT DISTINCT bh.boq_id
                    FROM boq_history bh,
                         jsonb_array_elements(bh.action) AS action_item
                    WHERE (
                        (action_item->>'receiver_role' = 'project_manager'
                         AND (action_item->>'recipient_user_id')::INTEGER = :user_id
                         AND action_item->>'type' = 'sent_to_pm')
                        OR
                        (action_item->>'sender_role' = 'project_manager'
                         AND (action_item->>'decided_by_user_id')::INTEGER = :user_id
                         AND action_item->>'type' = 'sent_to_estimator')
                    )
                """),
                {"user_id": user_id}
            )

            boq_ids_for_approval = [row[0] for row in boqs_for_approval_query]

        # Build query - get all BOQs for assigned projects OR sent for approval
        # Handle empty lists by providing a fallback
        # Admin sees BOQs only for projects with PM assigned
        if user_role == 'admin':
            # Admin sees BOQs for projects with PM assigned OR BOQs with Pending_PM_Approval status
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True,
                db.or_(
                    BOQ.project_id.in_(project_ids) if project_ids else False,  # BOQs for projects with PM assigned
                    BOQ.status == 'Pending_PM_Approval',  # OR BOQs with Pending_PM_Approval status
                    BOQ.status == 'PM_Approved'
                )
            ).order_by(BOQ.created_at.desc())
        elif not project_ids and not boq_ids_for_approval:
            # No projects assigned and no approval requests
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.boq_id == -1  # No results
            )
        elif not project_ids:
            # Only approval requests - show from PM approval onwards until project is assigned
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True,
                BOQ.boq_id.in_(boq_ids_for_approval),
                BOQ.status.in_(['Pending_PM_Approval', 'PM_Approved', 'PM_Rejected', 'Pending_TD_Approval', 'Approved', 'Sent_for_Confirmation', 'Client_Confirmed', 'Pending_Revision', 'Under_Revision', 'Revision_Approved', 'draft', 'Draft', 'pending', 'Pending'])  # Show throughout approval and revision flow
            ).order_by(BOQ.created_at.desc())
        elif not boq_ids_for_approval:
            # Only assigned projects
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True,
                BOQ.project_id.in_(project_ids)
            ).order_by(BOQ.created_at.desc())
        else:
            # Both assigned projects and approval requests
            query = db.session.query(BOQ).filter(
                BOQ.is_deleted == False,
                BOQ.email_sent == True,
                db.or_(
                    BOQ.project_id.in_(project_ids),  # Show all BOQs for assigned projects
                    db.and_(
                        BOQ.boq_id.in_(boq_ids_for_approval),  # For approval requests
                        BOQ.status.in_(['Pending_PM_Approval', 'PM_Approved', 'PM_Rejected', 'Pending_TD_Approval', 'Approved', 'Sent_for_Confirmation', 'Client_Confirmed', 'Pending_Revision', 'Under_Revision', 'Revision_Approved', 'draft', 'Draft', 'pending', 'Pending'])  # Show throughout approval and revision flow
                    )
                )
            ).order_by(BOQ.created_at.desc())
        # Paginate
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)
        # Build response with BOQ details and history
        boqs_list = []
        for boq in paginated.items:
            # Get BOQ history (will be empty array if no history)
            history = BOQHistory.query.filter(
                BOQHistory.boq_id == boq.boq_id,
                (BOQHistory.sender_role != 'estimator') | (BOQHistory.receiver_role != 'estimator')
            ).order_by(BOQHistory.action_date.desc()).all()

            # Determine the correct status to display for Project Manager
            display_status = boq.status
            for h in history:
                if h.receiver_role == 'projectManager':
                    # If PM is receiver, show as pending
                    display_status = 'pending'
                    break
                elif h.sender_role == 'projectManager':
                    # If PM is sender, show the original status
                    display_status = h.boq_status
                    break

            # Get PM status from the project's assigned user
            pm_status = None
            pm_name = current_user.get('full_name')
            if boq.project and boq.project.user_id:
                pm_user = User.query.filter_by(user_id=boq.project.user_id).first()
                if pm_user:
                    # Get user_status from database, fallback to is_active if user_status is null
                    pm_status = pm_user.user_status if pm_user.user_status else ("Active" if pm_user.is_active else "Inactive")
                    pm_name = pm_user.full_name

            # Build complete project details
            project_details = None
            if boq.project:
                # Get Site Engineer name if assigned
                se_name = None
                if boq.project.site_supervisor_id:
                    se_user = User.query.filter_by(user_id=boq.project.site_supervisor_id).first()
                    if se_user:
                        se_name = se_user.full_name

                # Calculate end_date from start_date and duration_days
                end_date = None
                if boq.project.start_date and boq.project.duration_days:
                    from datetime import timedelta
                    end_date = (boq.project.start_date + timedelta(days=boq.project.duration_days)).isoformat()

                project_details = {
                    "project_id": boq.project.project_id,
                    "project_name": boq.project.project_name,
                    "project_code": boq.project.project_code if boq.project else None,
                    "user_id": boq.project.user_id,
                    "user_name": pm_name,
                    "site_supervisor_id": boq.project.site_supervisor_id,
                    "site_supervisor_name": se_name,
                    "location": boq.project.location,
                    "area": boq.project.area,
                    "floor_name": boq.project.floor_name,
                    "working_hours": boq.project.working_hours,
                    "client": boq.project.client,
                    "work_type": boq.project.work_type,
                    "start_date": boq.project.start_date.isoformat() if boq.project.start_date else None,
                    "end_date": end_date,
                    "duration_days": boq.project.duration_days,
                    "project_status": boq.project.status,
                    "project_manager_status": pm_status,
                    "description": boq.project.description,
                    "created_at": boq.project.created_at.isoformat() if boq.project.created_at else None,
                    "created_by": boq.project.created_by,
                    "last_modified_at": boq.project.last_modified_at.isoformat() if boq.project.last_modified_at else None,
                    "last_modified_by": boq.project.last_modified_by,
                    "completion_requested": boq.project.completion_requested if boq.project.completion_requested is not None else False
                }

            # Check for pending and approved day extension requests that PM sent to TD
            has_pending_day_extension = False
            pending_day_extension_count = 0
            has_approved_extension = False
            if boq.project and boq.project.user_id:  # Only check if PM is assigned
                pending_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).all()
                for hist in pending_history:
                    if hist.action and isinstance(hist.action, list):
                        for action in hist.action:
                            action_type = action.get('type', '').lower()
                            action_status = action.get('status', '').lower()
                            # Check for requests PM sent to TD that are still pending
                            if (action_type == 'day_extension_requested' and
                                action_status in ['day_request_send_td', 'edited_by_td']):
                                has_pending_day_extension = True
                                pending_day_extension_count += 1
                            # Check for approved extensions
                            elif action_type == 'day_extension_approved' and action_status == 'approved':
                                has_approved_extension = True

            boq_data = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "boq_status": display_status,  # Use the determined status based on role
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "created_by": boq.created_by,
                "last_modified_at": boq.last_modified_at.isoformat() if boq.last_modified_at else None,
                "last_modified_by": boq.last_modified_by,
                "email_sent": boq.email_sent,
                "project_name": boq.project.project_name if boq.project else None,
                "project_details": project_details,  # Complete project information
                # Day extension status
                "has_pending_day_extension": has_pending_day_extension,
                "pending_day_extension_count": pending_day_extension_count,
                "has_approved_extension": has_approved_extension
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
        log.error(f"Error fetching BOQs: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch BOQs: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def get_all_pm():
    try:
        from datetime import timedelta

        role = Role.query.filter_by(role='projectManager').first()
        if not role:
            return jsonify({"error": "Role 'projectManager' not found"}), 404

        get_pms = User.query.filter_by(role_id=role.role_id,is_deleted=False).all()
        assigned_list = []
        unassigned_list = []

        # Calculate online status dynamically: user is online if last_login was within last 5 minutes
        current_time = datetime.utcnow()
        online_threshold = timedelta(minutes=5)

        for pm in get_pms:
            # Check online status based on user_status field
            # Only "online" is considered online, everything else (offline/NULL) is offline
            is_online = pm.user_status == 'online'
            log.info(f"PM {pm.full_name}: user_status={pm.user_status}, is_online={is_online}")

            # Fetch all projects assigned to this PM
            projects = Project.query.filter_by(user_id=pm.user_id).all()

            if projects and len(projects) > 0:
                # Add each project under assigned list
                for project in projects:
                    assigned_list.append({
                        "user_id": pm.user_id,  # Added user_id for assignment functionality
                        "pm_name": pm.full_name,
                        "email": pm.email,
                        "phone": pm.phone,
                        "is_active": is_online,  # Dynamic online status
                        "project_id": project.project_id,
                        "project_name": project.project_name if hasattr(project, "project_name") else None
                    })
            else:
                # PM without project assignment
                unassigned_list.append({
                    "user_id": pm.user_id,
                    "pm_name": pm.full_name,
                    "full_name": pm.full_name,
                    "email": pm.email,
                    "phone": pm.phone,
                    "is_active": is_online,  # Dynamic online status
                    "project_id": None
                })

        return jsonify({
            "success": True,
            "assigned_count": len(assigned_list),
            "unassigned_count": len(unassigned_list),
            "assigned_project_managers": assigned_list,
            "unassigned_project_managers": unassigned_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching PMs: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch PMs: {str(e)}"
        }), 500

def get_pm_id(user_id):
    try:
        user_list = []
        projects = Project.query.filter_by(user_id=user_id).all()

        # If no projects found for this user
        if not projects:
            return jsonify({
                "success": True,
                "count": 0,
                "user_list": []
            }), 200

        # Fetch user only once (no need to query inside loop)
        user = User.query.filter_by(user_id=user_id).first()

        for project in projects:
            user_list.append({
                "user_id": user.user_id,
                "user_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "project_id": project.project_id,
                "project_name": getattr(project, "project_name", None)
            })

        return jsonify({
            "success": True,
            "count": len(user_list),
            "user_list": user_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching PMs: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch PMs: {str(e)}"
        }), 500

def update_pm(user_id):
    try:
        # Fetch the PM
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({"error": "Project Manager not found"}), 404

        data = request.get_json()

        # Update PM details
        if "full_name" in data:
            user.full_name = data["full_name"]
        if "email" in data:
            user.email = data["email"]
        if "phone" in data:
            user.phone = data["phone"]

        # Reassign projects if provided
        if "assigned_projects" in data:
            # First remove PM from all current projects
            Project.query.filter_by(user_id=user_id).update({"user_id": None})

            # Assign PM to new projects
            for project_id in data["assigned_projects"]:
                project = Project.query.filter_by(project_id=project_id).first()
                if project:
                    project.user_id = user_id

        db.session.commit()

        # Build response with updated project assignments
        updated_projects = Project.query.filter_by(user_id=user_id).all()
        projects_list = [
            {"project_id": p.project_id, "project_name": getattr(p, "project_name", None)}
            for p in updated_projects
        ]

        return jsonify({
            "success": True,
            "message": "Project Manager updated successfully",
            "pm": {
                "user_id": user.user_id,
                "full_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "assigned_projects": projects_list
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating PM: {str(e)}")
        return jsonify({
            "error": f"Failed to update Project Manager: {str(e)}"
        }), 500

def delete_pm(user_id):
    try:
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({"error": "Project Manager not found"}), 404

        # Check assigned projects
        assigned_projects = Project.query.filter_by(user_id=user_id).all()
        if assigned_projects and len(assigned_projects) > 0:
            projects_list = [
                {
                    "project_id": p.project_id,
                    "project_name": getattr(p, "project_name", None)
                }
                for p in assigned_projects
            ]
            return jsonify({
                "success": False,
                "message": "Cannot delete Project Manager. They are assigned to one or more projects.",
                "assigned_projects": projects_list
            }), 400

        # Perform soft delete
        user.is_deleted = True
        user.is_active = False
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Project Manager deleted successfully",
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting PM: {str(e)}")
        return jsonify({
            "error": f"Failed to delete Project Manager: {str(e)}"
        }), 500

def assign_projects():
    try:
        data = request.get_json(silent=True)

        user_id = data.get("user_id")
        project_ids = data.get("project_ids")  # list of project IDs

        if not user_id or not project_ids:
            return jsonify({"error": "user_id and project_ids are required"}), 400

        # Validate user
        user = User.query.filter_by(user_id=user_id).first()
        if not user:
            return jsonify({"error": "Project Manager not found"}), 404

        # Validate that all projects have Client_Confirmed BOQs
        for pid in project_ids:
            project = Project.query.filter_by(project_id=pid).first()
            if project:
                boqs = BOQ.query.filter_by(project_id=pid, is_deleted=False).all()
                for boq in boqs:
                    if boq.status not in ['Client_Confirmed', 'approved']:
                        return jsonify({
                            "error": f"Cannot assign PM. BOQ '{boq.boq_name}' must be client-approved first. Current status: {boq.status}"
                        }), 400

        # Get current user (Technical Director)
        current_user = getattr(g, 'user', None)
        td_name = current_user.get('full_name', 'Technical Director') if current_user else 'Technical Director'
        td_id = current_user.get('user_id') if current_user else None

        assigned_projects = []
        projects_data_for_email = []
        boq_histories_updated = 0

        for pid in project_ids:
            project = Project.query.filter_by(project_id=pid).first()
            if project:
                project.user_id = user_id
                project.last_modified_at = datetime.utcnow()
                project.last_modified_by = td_name

                assigned_projects.append({
                    "project_id": project.project_id,
                    "project_name": getattr(project, "project_name", None)
                })

                # Collect project data for email
                projects_data_for_email.append({
                    "project_name": getattr(project, "project_name", "N/A"),
                    "client": getattr(project, "client", "N/A"),
                    "location": getattr(project, "location", "N/A"),
                    "status": getattr(project, "status", "Active")
                })

                # Find BOQs associated with this project
                boqs = BOQ.query.filter_by(project_id=pid, is_deleted=False).all()

                for boq in boqs:
                    # Get existing BOQ history
                    status = boq.status
                    boq.status = "approved"
                    db.session.add(boq)
                    db.session.commit()
                    existing_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).order_by(BOQHistory.action_date.desc()).first()

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

                    # Prepare new action for PM assignment
                    new_action = {
                        "role": "technical_director",
                        "type": "assigned_project_manager",
                        "sender": "technical_director",
                        "receiver": "project_manager",
                        "status": "PM_Assigned",
                        "boq_name": boq.boq_name,
                        "comments": f"Project Manager {user.full_name} assigned to project",
                        "timestamp": datetime.utcnow().isoformat(),
                        "sender_name": td_name,
                        "sender_user_id": td_id,
                        "project_name": project.project_name,
                        "project_id": project.project_id,
                        "assigned_pm_name": user.full_name,
                        "assigned_pm_user_id": user.user_id,
                        "assigned_pm_email": user.email
                    }

                    # Append new action
                    current_actions.append(new_action)
                    log.info(f"Appending PM assignment action to BOQ {boq.boq_id} history. Total actions: {len(current_actions)}")

                    if existing_history:
                        # Update existing history
                        existing_history.action = current_actions
                        # Mark JSONB field as modified for SQLAlchemy
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(existing_history, "action")

                        existing_history.action_by = td_name
                        existing_history.sender = td_name
                        existing_history.receiver = user.full_name
                        existing_history.comments = f"Project Manager {user.full_name} assigned to project"
                        existing_history.sender_role = 'technical_director'
                        existing_history.receiver_role = 'project_manager'
                        existing_history.action_date = datetime.utcnow()
                        existing_history.last_modified_by = td_name
                        existing_history.last_modified_at = datetime.utcnow()

                        log.info(f"Updated existing history for BOQ {boq.boq_id} with {len(current_actions)} actions")
                    else:
                        # Create new history entry
                        boq_history = BOQHistory(
                            boq_id=boq.boq_id,
                            action=current_actions,
                            action_by=td_name,
                            boq_status="approved",
                            sender=td_name,
                            receiver=user.full_name,
                            comments=f"Project Manager {user.full_name} assigned to project",
                            sender_role='technical_director',
                            receiver_role='project_manager',
                            action_date=datetime.utcnow(),
                            created_by=td_name
                        )
                        db.session.add(boq_history)
                        log.info(f"Created new history for BOQ {boq.boq_id} with {len(current_actions)} actions")

                    boq_histories_updated += 1

        db.session.commit()
        log.info(f"Successfully assigned PM to {len(assigned_projects)} projects and updated {boq_histories_updated} BOQ histories")

        # Send email notification to Project Manager
        email_sent = False
        # if user.email and projects_data_for_email:
            # try:
            #     email_service = BOQEmailService()
            #     email_sent = email_service.send_pm_assignment_notification(
            #         pm_email=user.email,
            #         pm_name=user.full_name,
            #         td_name=td_name,
            #         projects_data=projects_data_for_email
            #     )

            #     if email_sent:
            #         log.info(f"Assignment notification email sent successfully to {user.email}")
            #     else:
            #         log.warning(f"Failed to send assignment notification email to {user.email}")
            # except Exception as email_error:
            #     log.error(f"Error sending assignment notification email: {email_error}")
            #     # Don't fail the entire request if email fails
            #     import traceback
            #     log.error(f"Email error traceback: {traceback.format_exc()}")

        return jsonify({
            "success": True,
            "message": "Projects assigned to Project Manager successfully",
            "assigned_pm": {
                "user_id": user.user_id,
                "user_name": user.full_name,
                "email": user.email,
                "phone": user.phone
            },
            "assigned_projects": assigned_projects,
            "assigned_count": len(assigned_projects),
            "boq_histories_updated": boq_histories_updated,
            "email_sent": email_sent
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        log.error(f"Error assigning projects: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to assign projects: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def send_boq_to_estimator():
    """Send BOQ to a specific Estimator"""
    try:
        data = request.get_json()

        boq_id = data.get('boq_id')
        boq_status = data.get('boq_status', '').lower()  # "approved" or "rejected"
        rejection_reason = data.get('rejection_reason', '')
        comments = data.get('comments', '')

        if not boq_id:
            return jsonify({"error": "boq_id is required"}), 400

        if boq_status not in ['approved', 'rejected']:
            return jsonify({"error": "Invalid boq_status. Use 'approved' or 'rejected'."}), 400

        # Get current user (Project Manager)
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        current_user_name = current_user.get('full_name', 'Project Manager')
        current_user_id = current_user.get('user_id')
        current_user_role = current_user.get('role_name', 'project_manager')

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            log.error(f"BOQ {boq_id} not found or deleted")
            return jsonify({"error": f"BOQ {boq_id} not found"}), 404

        log.info(f"Found BOQ {boq_id} with project_id: {boq.project_id}")

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            log.error(f"BOQ details not found for BOQ {boq_id}")
            return jsonify({"error": f"BOQ details not found for BOQ {boq_id}"}), 404

        # Get project (allow soft-deleted projects for BOQ approval flow)
        project = Project.query.filter_by(project_id=boq.project_id).first()
        if not project:
            log.error(f"Project {boq.project_id} not found for BOQ {boq_id}")
            return jsonify({"error": f"Project not found (ID: {boq.project_id}) for BOQ {boq_id}"}), 404

        log.info(f"Found project {project.project_id}: {project.project_name}")

        # Get Estimator user
        estimator_role = Role.query.filter_by(role='estimator').first()
        if not estimator_role:
            return jsonify({"error": "Estimator role not found"}), 404

        estimator = User.query.filter_by(role_id=estimator_role.role_id, is_deleted=False).first()
        if not estimator:
            return jsonify({"error": "Estimator not found"}), 404

        if not estimator.email:
            return jsonify({"error": f"Estimator {estimator.full_name} has no email address"}), 400

        # Prepare email service and data
        boq_email_service = BOQEmailService()

        items_summary = boq_details.boq_details.get('summary', {})
        items_summary['items'] = boq_details.boq_details.get('items', [])

        projects_data = [{
            'project_id': project.project_id,
            'project_name': project.project_name,
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'client': getattr(project, 'client', 'N/A'),
            'location': getattr(project, 'location', 'N/A'),
            'total_cost': items_summary.get('total_cost', 0),
            'status': boq_status
        }]

        # Fallback: use existing email function (assuming it's general-purpose)
        # email_sent = boq_email_service.send_pm_assignment_notification(
        #     estimator.email, estimator.full_name, current_user_name, projects_data
        # )

        # if email_sent:
            # If PM approves, set to PM_Approved so estimator can send to TD
            # If PM rejects, set to rejected
        if boq_status == 'approved':
            boq.status = 'PM_Approved'
        else:
            boq.status = 'PM_Rejected'
        boq.last_modified_by = current_user_name
        boq.last_modified_at = datetime.utcnow()
        boq.email_sent = True

        # Add to BOQ history
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        new_action = {
            "role": current_user_role,
            "type": "sent_to_estimator",
            "sender": current_user_name,
            "receiver": estimator.full_name,
            "sender_role": current_user_role,
            "receiver_role": "estimator",
            "status": boq.status,
            "comments": comments or f"BOQ {boq_status} and sent to Estimator {estimator.full_name}",
            "rejection_reason": rejection_reason if boq_status == 'rejected' else '',
            "timestamp": datetime.utcnow().isoformat(),
            "decided_by": current_user_name,
            "decided_by_user_id": current_user_id,
            "recipient_email": estimator.email,
            "recipient_name": estimator.full_name,
            "recipient_user_id": estimator.user_id,
            "boq_name": boq.boq_name,
            "project_name": project.project_name
        }

        if existing_history:
            current_actions = []
            if isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]

            action_exists = any(
                a.get('type') == new_action['type'] and
                a.get('sender') == new_action['sender'] and
                a.get('receiver') == new_action['receiver']
                for a in current_actions
            )

            if not action_exists:
                current_actions.append(new_action)
                existing_history.action = current_actions
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(existing_history, "action")

            existing_history.action_by = current_user_name
            existing_history.boq_status = boq.status
            existing_history.sender = current_user_name
            existing_history.receiver = estimator.full_name
            existing_history.comments = new_action["comments"]
            existing_history.sender_role = current_user_role
            existing_history.receiver_role = 'estimator'
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = current_user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=[new_action],
                action_by=current_user_name,
                boq_status=boq.status,
                sender=current_user_name,
                receiver=estimator.full_name,
                comments=new_action["comments"],
                sender_role=current_user_role,
                receiver_role='estimator',
                action_date=datetime.utcnow(),
                created_by=current_user_name
            )
            db.session.add(boq_history)

        db.session.commit()

        return jsonify({
            "success": True,
            "message": f"BOQ {boq_status} and sent to Estimator {estimator.full_name}",
            "boq_id": boq_id,
            "estimator": {
                "id": estimator.user_id,
                "name": estimator.full_name,
                "email": estimator.email
            },
            "status": boq.status
        }), 200

        # else:
        #     return jsonify({
        #         "success": False,
        #         "message": "Failed to send BOQ email to Estimator",
        #         "boq_id": boq_id,
        #         "error": "Email service failed"
        #     }), 500

    except Exception as e:
        db.session.rollback()
        log.error(f"Error sending BOQ to Estimator: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to send BOQ to Estimator",
            "error": str(e)
        }), 500