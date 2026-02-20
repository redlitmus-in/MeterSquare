from flask import request, jsonify, g
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import func
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role
from datetime import datetime
from utils.admin_viewing_context import get_effective_user_context, should_apply_role_filter
from utils.comprehensive_notification_service import notification_service
import copy

log = get_logger()

def create_sitesupervisor():
    try:
        data = request.get_json()

        # Validate role exists
        role = Role.query.filter_by(role='siteEngineer').first()
        if not role:
            return jsonify({"error": "siteEngineer role not found"}), 404

        # Create new Project Manager user
        new_sitesupervisor = User(
            email=data['email'],
            phone=data['phone'],
            role_id=role.role_id,
            full_name=data['full_name'],
            created_at=datetime.utcnow(),
            is_deleted=False,
            is_active=True,
            department='Site Management'
        )

        db.session.add(new_sitesupervisor)
        db.session.commit()
        new_user_id = new_sitesupervisor.user_id

        # Assign sitesupervisor to multiple projects (accept both 'project_id' and 'project_ids')
        project_ids = data.get('project_ids', data.get('project_id', []))
        assigned_count = 0
        if project_ids:
            for proj_id in project_ids:
                project = Project.query.filter_by(project_id=proj_id, is_deleted=False).first()
                if project:
                    # Assign this sitesupervisor to the project (one sitesupervisor per project, but sitesupervisor can have multiple projects)
                    project.site_supervisor_id = new_user_id
                    project.last_modified_at = datetime.utcnow()
                    db.session.add(project)
                    assigned_count += 1

            db.session.commit()

        return jsonify({
            "message": "Project Manager created successfully",
            "site_supervisor_id": new_user_id,
            "assigned_projects": project_ids
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating siteEngineer: {str(e)}")
        return jsonify({
            "error": f"Failed to create siteEngineer: {str(e)}"
        }), 500


def get_all_sitesupervisor():
    try:
        from models.pm_assign_ss import PMAssignSS

        role = Role.query.filter_by(role='siteEngineer').first()
        if not role:
            return jsonify({"error": "Role 'siteEngineer' not found"}), 404

        get_sitesupervisors = User.query.filter_by(role_id=role.role_id,is_deleted=False).all()
        assigned_list = []
        unassigned_list = []

        # ✅ PERFORMANCE FIX: Load ALL projects for ALL supervisors in ONE query (N+1 → 1)
        # Get all supervisor IDs
        supervisor_ids = [s.user_id for s in get_sitesupervisors]

        # Query all projects for all supervisors at once
        all_projects_query = Project.query.filter(
            Project.site_supervisor_id.in_(supervisor_ids),
            Project.is_deleted == False
        ).all()

        # ✅ Query ongoing item assignments for all SEs in ONE query
        # Ongoing items = assigned but NOT yet confirmed completed by PM
        # Fetch item_indices count and item_details in a single query
        ongoing_assignments_query = db.session.query(
            PMAssignSS.assigned_to_se_id,
            PMAssignSS.item_indices,
            PMAssignSS.item_details
        ).filter(
            PMAssignSS.assigned_to_se_id.in_(supervisor_ids),
            PMAssignSS.is_deleted == False,
            PMAssignSS.pm_confirmed_completion == False  # Not yet completed
        ).all()

        # Calculate ongoing items count and amount per SE in memory
        ongoing_items_by_se = {}
        ongoing_amount_by_se = {}
        for row in ongoing_assignments_query:
            se_id = row.assigned_to_se_id
            if se_id not in ongoing_items_by_se:
                ongoing_items_by_se[se_id] = 0
                ongoing_amount_by_se[se_id] = 0

            # Count items from item_indices array
            if row.item_indices and isinstance(row.item_indices, list):
                ongoing_items_by_se[se_id] += len(row.item_indices)

            # Sum amounts from item_details JSONB with type safety
            if row.item_details and isinstance(row.item_details, list):
                for item in row.item_details:
                    if isinstance(item, dict):
                        amount = item.get('amount') or item.get('totalAmount') or 0
                        try:
                            ongoing_amount_by_se[se_id] += float(amount)
                        except (ValueError, TypeError):
                            pass  # Skip invalid amount values

        # Group projects by supervisor_id in memory
        projects_by_supervisor = {}
        for project in all_projects_query:
            if project.site_supervisor_id not in projects_by_supervisor:
                projects_by_supervisor[project.site_supervisor_id] = []
            projects_by_supervisor[project.site_supervisor_id].append(project)

        for sitesupervisor in get_sitesupervisors:
            # Use pre-loaded projects (no query - data already in memory!)
            all_projects = projects_by_supervisor.get(sitesupervisor.user_id, [])

            # Separate ongoing and completed projects
            ongoing_projects = []
            completed_projects = []

            for project in all_projects:
                project_status = (project.status or '').lower()
                project_data = {
                    "project_id": project.project_id,
                    "project_name": project.project_name if hasattr(project, "project_name") else None,
                    "status": project.status,
                    "project_code": project.project_code if project else None,
                }

                if project_status == 'completed':
                    completed_projects.append(project_data)
                else:
                    ongoing_projects.append(project_data)

            # Combine all projects for display (ongoing first, then completed)
            all_project_list = ongoing_projects + completed_projects

            # Count only ongoing projects for assignment limit
            ongoing_count = len(ongoing_projects)

            # Get ongoing items count and amount for this SE
            se_ongoing_items = ongoing_items_by_se.get(sitesupervisor.user_id, 0)
            se_ongoing_amount = ongoing_amount_by_se.get(sitesupervisor.user_id, 0)

            if all_projects and len(all_projects) > 0:
                # Add single entry for this sitesupervisor with all their projects
                assigned_list.append({
                    "user_id": sitesupervisor.user_id,
                    "sitesupervisor_name": sitesupervisor.full_name,
                    "email": sitesupervisor.email,
                    "phone": sitesupervisor.phone,
                    "user_status": getattr(sitesupervisor, 'user_status', 'offline'),
                    "projects": all_project_list,
                    "project_count": ongoing_count,  # Only count ongoing projects
                    "total_projects": len(all_projects),
                    "completed_projects_count": len(completed_projects),
                    "ongoing_items_count": se_ongoing_items,  # Count of assigned items not yet completed
                    "ongoing_items_amount": se_ongoing_amount  # Total amount of ongoing items
                })
            else:
                # sitesupervisor without project assignment
                unassigned_list.append({
                    "user_id": sitesupervisor.user_id,
                    "sitesupervisor_name": sitesupervisor.full_name,
                    "email": sitesupervisor.email,
                    "phone": sitesupervisor.phone,
                    "user_status": getattr(sitesupervisor, 'user_status', 'offline'),
                    "projects": [],
                    "project_count": 0,
                    "total_projects": 0,
                    "completed_projects_count": 0,
                    "ongoing_items_count": se_ongoing_items,  # May have items from other projects
                    "ongoing_items_amount": se_ongoing_amount
                })

        return jsonify({
            "success": True,
            "assigned_count": len(assigned_list),
            "unassigned_count": len(unassigned_list),
            "assigned_project_managers": assigned_list,
            "unassigned_project_managers": unassigned_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching sitesupervisors: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch sitesupervisors: {str(e)}"
        }), 500

def get_sitesupervisor_id(site_supervisor_id):
    try:
        user_list = []
        projects = Project.query.filter_by(site_supervisor_id=site_supervisor_id).all()

        # If no projects found for this user
        if not projects:
            return jsonify({
                "success": True,
                "count": 0,
                "user_list": []
            }), 200

        # Fetch user only once (no need to query inside loop)
        user = User.query.filter_by(user_id=site_supervisor_id).first()

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
        log.error(f"Error fetching sitesupervisors: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch sitesupervisors: {str(e)}"
        }), 500

def update_sitesupervisor(site_supervisor_id):
    try:
        # Fetch the site supervisor
        user = User.query.filter_by(user_id=site_supervisor_id).first()
        if not user:
            return jsonify({"error": "Site Supervisor not found"}), 404

        data = request.get_json()

        # Update site supervisor details
        if "full_name" in data:
            user.full_name = data["full_name"]
        if "email" in data:
            user.email = data["email"]
        if "phone" in data:
            user.phone = data["phone"]

        # Reassign projects if provided
        if "assigned_projects" in data:
            # Remove current supervisor assignments from all projects
            Project.query.filter_by(site_supervisor_id=site_supervisor_id).update({"site_supervisor_id": None})
            db.session.commit()  # commit after unassigning to ensure DB update

            # Assign new projects
            for project_id in data["assigned_projects"]:
                project = Project.query.filter_by(project_id=project_id, is_deleted=False).first()
                if project:
                    project.site_supervisor_id = site_supervisor_id

        db.session.commit()

        # Build response with updated project assignments
        updated_projects = Project.query.filter_by(site_supervisor_id=site_supervisor_id).all()
        projects_list = [
            {"project_id": p.project_id, "project_name": getattr(p, "project_name", None)}
            for p in updated_projects
        ]

        return jsonify({
            "success": True,
            "message": "Site Supervisor updated successfully",
            "sitesupervisor": {
                "site_supervisor_id": user.user_id,
                "full_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "assigned_projects": projects_list
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating site supervisor: {str(e)}")
        return jsonify({
            "error": f"Failed to update site supervisor: {str(e)}"
        }), 500


def delete_sitesupervisor(site_supervisor_id):
    try:
        user = User.query.filter_by(user_id=site_supervisor_id).first()
        if not user:
            return jsonify({"error": "siteEngineer not found"}), 404

        # Check assigned projects
        assigned_projects = Project.query.filter_by(site_supervisor_id=site_supervisor_id).all()
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
                "message": "Cannot delete siteEngineer. They are assigned to one or more projects.",
                "assigned_projects": projects_list
            }), 400

        # Perform soft delete
        user.is_deleted = True
        user.is_active = False
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "siteEngineer deleted successfully",
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting sitesupervisor: {str(e)}")
        return jsonify({
            "error": f"Failed to delete siteEngineer: {str(e)}"
        }), 500

def assign_projects_sitesupervisor():
    try:
        data = request.get_json(silent=True)

        site_supervisor_id = data.get("site_supervisor_id")
        buyer_id = data.get("buyer_id")  # Optional: Buyer assignment
        project_ids = data.get("project_ids")  # list of project IDs

        if not site_supervisor_id or not project_ids:
            return jsonify({"error": "site_supervisor_id and project_ids are required"}), 400

        # Validate Site Engineer
        user = User.query.filter_by(user_id=site_supervisor_id).first()
        if not user:
            return jsonify({"error": "siteEngineer not found"}), 404

        # Validate Buyer if provided
        buyer_user = None
        if buyer_id:
            buyer_user = User.query.filter_by(user_id=buyer_id).first()
            if not buyer_user:
                return jsonify({"error": "Buyer not found"}), 404

        # Get current user (Project Manager)
        current_user = getattr(g, 'user', None)
        pm_name = current_user.get('full_name', 'Project Manager') if current_user else 'Project Manager'
        pm_id = current_user.get('user_id') if current_user else None

        assigned_projects = []
        projects_data_for_email = []
        projects_data_for_buyer_email = []
        boq_histories_updated = 0

        # ✅ PERFORMANCE FIX: Query all projects at once with eager-loaded BOQs (N+1 → 2 queries)
        # Before: 10 projects × (1 project query + 1 BOQ query + M history queries) = 70+ queries
        # After: 2 queries (1 for projects with BOQs, 1 for all histories)
        projects = Project.query.options(
            selectinload(Project.boqs)
        ).filter(
            Project.project_id.in_(project_ids)
        ).all()

        # Create lookup map for fast access
        projects_map = {p.project_id: p for p in projects}

        # Pre-load ALL BOQHistory records for all BOQs at once
        all_boq_ids = []
        for project in projects:
            for boq in project.boqs:
                if not boq.is_deleted:
                    all_boq_ids.append(boq.boq_id)

        # Query all histories at once
        if all_boq_ids:
            from sqlalchemy import distinct
            # Get the latest history for each BOQ
            boq_histories = BOQHistory.query.filter(
                BOQHistory.boq_id.in_(all_boq_ids)
            ).order_by(BOQHistory.boq_id, BOQHistory.action_date.desc()).all()

            # Group by boq_id, keep only the latest
            history_map = {}
            for history in boq_histories:
                if history.boq_id not in history_map:
                    history_map[history.boq_id] = history
        else:
            history_map = {}

        for pid in project_ids:
            project = projects_map.get(pid)  # No query - use pre-loaded data!
            if project:
                project.site_supervisor_id = site_supervisor_id
                # Assign buyer if provided
                if buyer_id:
                    project.buyer_id = buyer_id
                project.last_modified_at = datetime.utcnow()
                project.last_modified_by = pm_name

                assigned_projects.append({
                    "project_id": project.project_id,
                    "project_name": getattr(project, "project_name", None)
                })

                # Collect project data for SE email
                projects_data_for_email.append({
                    "project_name": getattr(project, "project_name", "N/A"),
                    "client": getattr(project, "client", "N/A"),
                    "location": getattr(project, "location", "N/A"),
                    "status": getattr(project, "status", "Active")
                })

                # Collect project data for buyer email (if buyer assigned)
                if buyer_id:
                    projects_data_for_buyer_email.append({
                        "project_name": getattr(project, "project_name", "N/A"),
                        "client": getattr(project, "client", "N/A"),
                        "location": getattr(project, "location", "N/A"),
                        "status": getattr(project, "status", "Active")
                    })

                # Use pre-loaded BOQs (no query!)
                boqs = [boq for boq in project.boqs if not boq.is_deleted]

                for boq in boqs:
                    # Get existing BOQ history from pre-loaded map (no query!)
                    existing_history = history_map.get(boq.boq_id)

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

                    # Prepare new action for Site Engineer assignment
                    comments = f"Site Engineer {user.full_name} assigned to project"
                    if buyer_user:
                        comments = f"Site Engineer {user.full_name} and Buyer {buyer_user.full_name} assigned to project"

                    new_action = {
                        "role": "project_manager",
                        "type": "assigned_site_engineer",
                        "sender": "project_manager",
                        "receiver": "site_engineer",
                        "status": "SE_Assigned",
                        "boq_name": boq.boq_name,
                        "comments": comments,
                        "timestamp": datetime.utcnow().isoformat(),
                        "sender_name": pm_name,
                        "sender_user_id": pm_id,
                        "project_name": project.project_name,
                        "project_id": project.project_id,
                        "assigned_se_name": user.full_name,
                        "assigned_se_user_id": user.user_id,
                        "assigned_se_email": user.email,
                        "assigned_buyer_name": buyer_user.full_name if buyer_user else None,
                        "assigned_buyer_user_id": buyer_user.user_id if buyer_user else None,
                        "assigned_buyer_email": buyer_user.email if buyer_user else None
                    }

                    # Append new action
                    current_actions.append(new_action)
                    log.info(f"Appending SE assignment action to BOQ {boq.boq_id} history. Total actions: {len(current_actions)}")

                    if existing_history:
                        # Update existing history
                        existing_history.action = current_actions
                        # Mark JSONB field as modified for SQLAlchemy
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(existing_history, "action")

                        existing_history.action_by = pm_name
                        existing_history.sender = pm_name
                        existing_history.receiver = user.full_name
                        existing_history.comments = comments
                        existing_history.sender_role = 'project_manager'
                        existing_history.receiver_role = 'site_engineer'
                        existing_history.action_date = datetime.utcnow()
                        existing_history.last_modified_by = pm_name
                        existing_history.last_modified_at = datetime.utcnow()

                        log.info(f"Updated existing history for BOQ {boq.boq_id} with {len(current_actions)} actions")
                    else:
                        # Create new history entry
                        boq_history = BOQHistory(
                            boq_id=boq.boq_id,
                            action=current_actions,
                            action_by=pm_name,
                            boq_status="approved",
                            # boq.status,
                            sender=pm_name,
                            receiver=user.full_name,
                            comments=comments,
                            sender_role='project_manager',
                            receiver_role='site_engineer',
                            action_date=datetime.utcnow(),
                            created_by=pm_name
                        )
                        db.session.add(boq_history)
                        log.info(f"Created new history for BOQ {boq.boq_id} with {len(current_actions)} actions")

                    boq_histories_updated += 1

        db.session.commit()
        log.info(f"Successfully assigned Site Engineer to {len(assigned_projects)} projects and updated {boq_histories_updated} BOQ histories")

        # Send notification to Site Engineer about project assignment
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            project_names = ", ".join([p.get('project_name', 'Unknown') for p in assigned_projects[:3]])
            if len(assigned_projects) > 3:
                project_names += f" and {len(assigned_projects) - 3} more"

            notification = NotificationManager.create_notification(
                user_id=site_supervisor_id,
                type='assignment',
                title='New Projects Assigned',
                message=f'You have been assigned to {len(assigned_projects)} project(s): {project_names}',
                priority='high',
                category='assignment',
                action_required=True,
                action_url='/site-engineer/projects',
                action_label='View Projects',
                metadata={
                    'project_ids': project_ids,
                    'assigned_count': len(assigned_projects)
                },
                sender_id=pm_id if pm_id else None,
                sender_name=pm_name
            )
            send_notification_to_user(site_supervisor_id, notification.to_dict())
            log.info(f"Sent project assignment notification to site engineer {site_supervisor_id}")
        except Exception as notif_error:
            log.error(f"Failed to send project assignment notification: {notif_error}")

        # Send email notification to Site Engineer
        # se_email_sent = False
        # if user.email and projects_data_for_email:
        #     try:
        #         email_service = BOQEmailService()
        #         se_email_sent = email_service.send_se_assignment_notification(
        #             se_email=user.email,
        #             se_name=user.full_name,
        #             pm_name=pm_name,
        #             projects_data=projects_data_for_email
        #         )

        #         if se_email_sent:
        #             log.info(f"Assignment notification email sent successfully to {user.email}")
        #         else:
        #             log.warning(f"Failed to send assignment notification email to {user.email}")
        #     except Exception as email_error:
        #         log.error(f"Error sending assignment notification email: {email_error}")
        #         # Don't fail the entire request if email fails
        #         import traceback
        #         log.error(f"Email error traceback: {traceback.format_exc()}")

        # Send email notification to Buyer (if assigned and offline)
        buyer_email_sent = False
        if buyer_user and buyer_user.email and projects_data_for_buyer_email:
            try:
                buyer_status = (buyer_user.user_status or "").lower().strip()
                log.info(f"Buyer {buyer_user.full_name} user_status={repr(buyer_user.user_status)} → normalized='{buyer_status}'")
                if buyer_status == "offline":
                    email_service = BOQEmailService()
                    buyer_email_sent = email_service.send_buyer_assignment_notification(
                        buyer_email=buyer_user.email,
                        buyer_name=buyer_user.full_name,
                        pm_name=pm_name,
                        projects_data=projects_data_for_buyer_email
                    )
                    if buyer_email_sent:
                        log.info(f"Buyer assignment notification email sent successfully to offline buyer {buyer_user.email}")
                    else:
                        log.warning(f"Failed to send buyer assignment notification email to {buyer_user.email}")
                else:
                    log.info(f"Buyer {buyer_user.full_name} is '{buyer_user.user_status}' - skipping email, in-app notification only")
            except Exception as email_error:
                log.error(f"Error sending buyer assignment notification email: {email_error}")
                # Don't fail the entire request if email fails
                import traceback
                log.error(f"Email error traceback: {traceback.format_exc()}")

        response_data = {
            "success": True,
            "message": "Projects assigned successfully",
            "assigned_sitesupervisor": {
                "site_supervisor_id": user.user_id,
                "user_name": user.full_name,
                "email": user.email,
                "phone": user.phone
            },
            "assigned_projects": assigned_projects,
            "assigned_count": len(assigned_projects),
            "boq_histories_updated": boq_histories_updated,
            # "se_email_sent": se_email_sent
        }

        # Add buyer info to response if buyer was assigned
        if buyer_user:
            response_data["assigned_buyer"] = {
                "buyer_id": buyer_user.user_id,
                "buyer_name": buyer_user.full_name,
                "email": buyer_user.email,
                "phone": buyer_user.phone
            }
            response_data["buyer_email_sent"] = buyer_email_sent

        return jsonify(response_data), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        log.error(f"Error assigning projects: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to assign projects: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def validate_completion_request(project_id):
    """
    Validate if SE can request project completion WITHOUT actually submitting.
    This is a read-only check for the frontend to show blocking items.
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']

        # Get the project - check both traditional and item-level assignments
        project = Project.query.filter_by(
            project_id=project_id,
            site_supervisor_id=user_id,
            is_deleted=False
        ).first()

        # If not found via traditional assignment, check for item-level assignment
        if not project:
            from models.pm_assign_ss import PMAssignSS

            item_assignment = PMAssignSS.query.filter_by(
                project_id=project_id,
                assigned_to_se_id=user_id,
                is_deleted=False
            ).first()

            if item_assignment:
                project = Project.query.filter_by(
                    project_id=project_id,
                    is_deleted=False
                ).first()

        if not project:
            return jsonify({
                "success": False,
                "error": "Project not found or not assigned to you"
            }), 404

        # Check if already completed
        if project.status and project.status.lower() == 'completed':
            return jsonify({
                "success": False,
                "error": "Project is already completed"
            }), 400

        # Get BOQ
        boq = BOQ.query.filter_by(project_id=project_id, is_deleted=False).first()
        if not boq:
            return jsonify({
                "success": False,
                "error": "BOQ not found for this project"
            }), 404

        # Check for incomplete CRs (only this SE's)
        from models.change_request import ChangeRequest
        from models.returnable_assets import AssetReturnRequest
        from models.pm_assign_ss import PMAssignSS
        from config.change_request_config import CR_CONFIG

        incomplete_crs = ChangeRequest.query.filter(
            ChangeRequest.project_id == project_id,
            ChangeRequest.requested_by_user_id == user_id,
            ChangeRequest.is_deleted == False,
            ~ChangeRequest.status.in_(CR_CONFIG.COMPLETION_STATUSES)
        ).all()

        blocking_purchases = [{
            "cr_id": cr.cr_id,
            "item_name": cr.item_name or f"Item {cr.item_id}",
            "status": cr.status,
            "requested_by": cr.requested_by_name,
            "reason": "Purchase not completed"
        } for cr in incomplete_crs]

        # Check for incomplete asset returns (only this SE's)
        from sqlalchemy.orm import joinedload
        incomplete_returns = AssetReturnRequest.query.options(
            joinedload(AssetReturnRequest.category)
        ).filter(
            AssetReturnRequest.project_id == project_id,
            AssetReturnRequest.requested_by_id == user_id,
            AssetReturnRequest.status.in_(CR_CONFIG.ASSET_RETURN_INCOMPLETE_STATUSES)
        ).all()

        blocking_returns = [{
            "request_id": req.request_id,
            "category": req.category.category_name if req.category else "Asset",
            "quantity": req.quantity,
            "status": req.status
        } for req in incomplete_returns]

        # Check if SE has any assignments
        se_assignments = PMAssignSS.query.filter(
            PMAssignSS.project_id == project_id,
            PMAssignSS.assigned_to_se_id == user_id,
            PMAssignSS.is_deleted == False,
            PMAssignSS.assigned_by_pm_id.isnot(None)
        ).all()

        is_project_level_se = project.site_supervisor_id == user_id

        if not se_assignments:
            if is_project_level_se:
                return jsonify({
                    "success": False,
                    "can_proceed": False,
                    "error": "No items have been assigned to you for this project yet",
                    "details": "The Project Manager needs to assign specific BOQ items to you before you can request completion."
                }), 400
            else:
                return jsonify({
                    "success": False,
                    "can_proceed": False,
                    "error": "No items have been assigned to you for this project yet"
                }), 400

        # Return validation result
        if blocking_purchases or blocking_returns:
            return jsonify({
                "success": True,
                "can_proceed": False,
                "message": "Please complete all purchases and asset returns before requesting project completion",
                "incomplete_purchases_count": len(blocking_purchases),
                "incomplete_returns_count": len(blocking_returns),
                "blocking_items": {
                    "purchases": blocking_purchases,
                    "returns": blocking_returns
                }
            }), 200

        # All clear - can proceed
        return jsonify({
            "success": True,
            "can_proceed": True,
            "message": "Ready to request completion",
            "project_name": project.project_name
        }), 200

    except Exception as e:
        log.error(f"Error validating completion request: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": f"Failed to validate: {str(e)}"
        }), 500


def request_project_completion(project_id):
    """Site Engineer requests project completion - sends notification to PM"""
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()
        se_name = current_user.get('full_name', 'Site Engineer')

        # Check if Admin is viewing as SS role
        is_admin = user_role == 'admin'

        # Get the project - check both traditional and item-level assignments
        if is_admin:
            # Admin can access any project
            project = Project.query.filter_by(
                project_id=project_id,
                is_deleted=False
            ).first()
        else:
            project = Project.query.filter_by(
                project_id=project_id,
                site_supervisor_id=user_id,
                is_deleted=False
            ).first()

        # If not found via traditional assignment, check for item-level assignment
        if not project and not is_admin:
            from models.pm_assign_ss import PMAssignSS

            # Check if user has any items assigned in this project
            item_assignment = PMAssignSS.query.filter_by(
                project_id=project_id,
                assigned_to_se_id=user_id,
                is_deleted=False
            ).first()

            if item_assignment:
                # Get the project without site_supervisor_id check
                project = Project.query.filter_by(
                    project_id=project_id,
                    is_deleted=False
                ).first()

        if not project:
            return jsonify({
                "error": "Project not found or not assigned to you"
            }), 404

        # Check if already completed
        if project.status and project.status.lower() == 'completed':
            return jsonify({
                "error": "Project is already completed"
            }), 400

        # Get BOQ
        boq = BOQ.query.filter_by(project_id=project_id, is_deleted=False).first()
        if not boq:
            return jsonify({
                "error": "BOQ not found for this project"
            }), 404

        # ============ VALIDATION: Check Incomplete Purchases & Returns ============
        from models.change_request import ChangeRequest
        from models.returnable_assets import AssetReturnRequest
        from models.pm_assign_ss import PMAssignSS
        from config.change_request_config import CR_CONFIG

        # Get SE's assigned items (Admin gets all assignments for the project)
        if is_admin:
            se_assignments = PMAssignSS.query.filter_by(
                project_id=project_id,
                is_deleted=False
            ).all()
        else:
            se_assignments = PMAssignSS.query.filter_by(
                project_id=project_id,
                assigned_to_se_id=user_id,
                is_deleted=False
            ).all()

        # Extract item indices assigned to this SE
        se_item_indices = set()
        se_boq_ids = set()
        for assignment in se_assignments:
            if assignment.boq_id:
                se_boq_ids.add(assignment.boq_id)
            if assignment.item_indices:
                se_item_indices.update(assignment.item_indices)

        # Get incomplete change requests
        # Use centralized completion statuses from config
        # Only check CRs created by THIS SE (not other SEs)
        incomplete_crs = ChangeRequest.query.filter(
            ChangeRequest.project_id == project_id,
            ChangeRequest.requested_by_user_id == user_id,  # Filter by current SE
            ChangeRequest.is_deleted == False,
            ~ChangeRequest.status.in_(CR_CONFIG.COMPLETION_STATUSES)
        ).all()

        log.info(f"Validation for SE {user_id} on project {project_id}: Found {len(incomplete_crs)} incomplete CRs for this SE")

        # Block only THIS SE's incomplete purchases
        blocking_purchases = []
        for cr in incomplete_crs:
            blocking_purchases.append({
                "cr_id": cr.cr_id,
                "item_name": cr.item_name or f"Item {cr.item_id}",
                "status": cr.status,
                "requested_by": cr.requested_by_name,
                "reason": "Purchase not completed"
            })

        # Get incomplete asset returns (Admin gets all returns for the project)
        from sqlalchemy.orm import joinedload
        if is_admin:
            incomplete_returns = AssetReturnRequest.query.options(
                joinedload(AssetReturnRequest.category)
            ).filter(
                AssetReturnRequest.project_id == project_id,
                AssetReturnRequest.status.in_(CR_CONFIG.ASSET_RETURN_INCOMPLETE_STATUSES)
            ).all()
        else:
            incomplete_returns = AssetReturnRequest.query.options(
                joinedload(AssetReturnRequest.category)
            ).filter(
                AssetReturnRequest.project_id == project_id,
                AssetReturnRequest.requested_by_id == user_id,
                AssetReturnRequest.status.in_(CR_CONFIG.ASSET_RETURN_INCOMPLETE_STATUSES)
            ).all()

        blocking_returns = [{
            "request_id": req.request_id,
            "category": req.category.category_name if req.category else "Asset",
            "quantity": req.quantity,
            "status": req.status
        } for req in incomplete_returns]

        # Block if incomplete items exist
        if blocking_purchases or blocking_returns:
            log.warning(f"SE {user_id} completion blocked: {len(blocking_purchases)} purchases, {len(blocking_returns)} returns incomplete")

            return jsonify({
                "success": False,
                "error": "Cannot request completion - incomplete purchases or returns exist",
                "message": f"Please complete all purchases and asset returns before requesting project completion",
                "incomplete_purchases_count": len(blocking_purchases),
                "incomplete_returns_count": len(blocking_returns),
                "blocking_items": {
                    "purchases": blocking_purchases,
                    "returns": blocking_returns
                }
            }), 400
        # ============ END VALIDATION ============

        # Get latest BOQ history
        boq_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).order_by(BOQHistory.action_date.desc()).first()

        # Get Project Manager details (user_id is now JSONB array)
        pm_ids = project.user_id if isinstance(project.user_id, list) else ([project.user_id] if project.user_id else [])
        pm_user = User.query.filter_by(user_id=pm_ids[0]).first() if pm_ids else None
        pm_name = pm_user.full_name if pm_user else "Project Manager"
        pm_email = pm_user.email if pm_user else None

        # Handle existing actions - ensure it's always a list
        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        # Create new action for completion request
        new_action = {
            "role": "site_engineer",
            "type": "completion_requested",
            "sender": "site_engineer",
            "receiver": "project_manager",
            "status": "pending_approval",
            "boq_name": boq.boq_name,
            "project_name": project.project_name,
            "comments": f"Site Engineer {se_name} requested project completion",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": se_name,
            "sender_user_id": user_id,
            "recipient_name": pm_name,
            "recipient_email": pm_email,
            "project_id": project_id
        }

        # Append new action
        current_actions.append(new_action)

        if boq_history:
            # Update existing history
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.action_by = se_name
            boq_history.sender = se_name
            boq_history.receiver = pm_name
            boq_history.comments = f"Completion request sent to {pm_name}"
            boq_history.sender_role = 'site_engineer'
            boq_history.receiver_role = 'project_manager'
            boq_history.action_date = datetime.utcnow()
            boq_history.last_modified_by = se_name
            boq_history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq.boq_id,
                action=current_actions,
                action_by=se_name,
                boq_status=boq.status,
                sender=se_name,
                receiver=pm_name,
                comments=f"Completion request sent to {pm_name}",
                sender_role='site_engineer',
                receiver_role='project_manager',
                action_date=datetime.utcnow(),
                created_by=se_name
            )
            db.session.add(boq_history)

        # Update SE completion request in pm_assign_ss table
        from models.pm_assign_ss import PMAssignSS

        # Find all assignments for this SE in this project
        # Only include records with valid assigned_by_pm_id (these are the ones PM can confirm)
        # Admin gets all assignments for the project
        if is_admin:
            se_assignments = PMAssignSS.query.filter(
                PMAssignSS.project_id == project_id,
                PMAssignSS.is_deleted == False,
                PMAssignSS.assigned_by_pm_id.isnot(None)
            ).all()
        else:
            se_assignments = PMAssignSS.query.filter(
                PMAssignSS.project_id == project_id,
                PMAssignSS.assigned_to_se_id == user_id,
                PMAssignSS.is_deleted == False,
                PMAssignSS.assigned_by_pm_id.isnot(None)
            ).all()

        # Check if SE is assigned at project level but has no item assignments
        is_project_level_se = is_admin or project.site_supervisor_id == user_id

        if not se_assignments:
            if is_project_level_se:
                # SE is assigned to project but no specific items assigned yet
                return jsonify({
                    "error": "No items have been assigned to you for this project yet",
                    "details": "The Project Manager needs to assign specific BOQ items to you before you can request completion. Please contact your PM.",
                    "assignment_type": "project_level_only"
                }), 400
            else:
                return jsonify({
                    "error": "No items have been assigned to you for this project yet"
                }), 400

        # Mark all SE assignments as completion requested
        log.info(f"SE {user_id} requesting completion for project {project_id}. Found {len(se_assignments)} assignments to update.")
        for assignment in se_assignments:
            log.info(f"  - Updating assignment {assignment.pm_assign_id}: PM {assignment.assigned_by_pm_id} -> SE {assignment.assigned_to_se_id}, "
                    f"was se_completion_requested={assignment.se_completion_requested}, setting to True")
            assignment.se_completion_requested = True
            assignment.se_completion_request_date = datetime.utcnow()
            assignment.last_modified_by = se_name
            assignment.last_modified_at = datetime.utcnow()

        # Always recalculate project total_se_assignments to ensure accuracy
        # Count unique PM-SE pairs for this project
        from sqlalchemy import func
        unique_pairs_query = db.session.query(
            func.count(func.distinct(func.concat(
                PMAssignSS.assigned_by_pm_id, '-', PMAssignSS.assigned_to_se_id
            )))
        ).filter(
            PMAssignSS.project_id == project_id,
            PMAssignSS.is_deleted == False,
            PMAssignSS.assigned_by_pm_id.isnot(None),
            PMAssignSS.assigned_to_se_id.isnot(None)
        ).scalar()

        project.total_se_assignments = unique_pairs_query or 0

        # Log for debugging
        log.info(f"Project {project_id}: total_se_assignments = {project.total_se_assignments}, SE assignments found: {len(se_assignments)}")

        # Set completion_requested flag
        project.completion_requested = True
        project.last_modified_at = datetime.utcnow()
        project.last_modified_by = se_name
        # DO NOT set status to completed here - wait for PM approval
        # The project should remain in 'items_assigned' status until PM approves
        # boq.status = "completed"  # REMOVED - premature completion
        # boq_history.boq_status = "completed"  # REMOVED - premature completion

        db.session.commit()

        # Verify the update was successful
        if is_admin:
            verification = PMAssignSS.query.filter(
                PMAssignSS.project_id == project_id,
                PMAssignSS.is_deleted == False,
                PMAssignSS.assigned_by_pm_id.isnot(None)
            ).all()
        else:
            verification = PMAssignSS.query.filter(
                PMAssignSS.project_id == project_id,
                PMAssignSS.assigned_to_se_id == user_id,
                PMAssignSS.is_deleted == False,
                PMAssignSS.assigned_by_pm_id.isnot(None)
            ).all()
        for v in verification:
            log.info(f"  VERIFICATION: Assignment {v.pm_assign_id} - se_completion_requested = {v.se_completion_requested}")

        # Send notification to PM about completion request
        try:
            if pm_ids and len(pm_ids) > 0:
                notification_service.notify_se_completion_request(
                    boq_id=boq.boq_id,
                    project_name=project.project_name,
                    se_id=user_id,
                    se_name=se_name,
                    pm_user_id=pm_ids[0]
                )
        except Exception as notif_error:
            log.error(f"Failed to send completion request notification: {notif_error}")

        log.info(f"Site Engineer {user_id} requested completion for project {project_id}")

        return jsonify({
            "success": True,
            "message": "Completion request sent to Project Manager",
            "project_id": project_id,
            "completion_requested": True,
            "confirmation_status": f"{project.confirmed_completions}/{project.total_se_assignments} confirmations"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error requesting project completion: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to request completion: {str(e)}"
        }), 500


def get_available_buyers():
    """Get list of all active buyers for site engineer to select from"""
    try:
        # Get buyer role
        buyer_role = Role.query.filter_by(role='buyer').first()
        if not buyer_role:
            return jsonify({"error": "Buyer role not found"}), 404

        # Get all active buyers
        buyers = User.query.filter(
            User.role_id == buyer_role.role_id,
            User.is_deleted == False,
            User.is_active == True
        ).all()

        buyers_list = [{
            'user_id': buyer.user_id,
            'full_name': buyer.full_name,
            'email': buyer.email,
            'phone': buyer.phone
        } for buyer in buyers]

        return jsonify({
            "success": True,
            "buyers": buyers_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyers: {str(e)}")
        return jsonify({
            "error": f"Failed to fetch buyers: {str(e)}"
        }), 500

def get_my_assigned_items():
    """SE gets all BOQ items assigned to them across all projects"""
    try:
        from models.pm_assign_ss import PMAssignSS

        # Get current user
        user_id = g.user_id
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        role_name = user.role.role if user.role else 'unknown'

        if role_name != 'siteEngineer' and role_name != 'admin':
            return jsonify({"error": "Only Site Engineers can access this endpoint"}), 403

        # Get all assignments from pm_assign_ss table for this SE
        assignments = PMAssignSS.query.filter_by(
            assigned_to_se_id=user_id,
            is_deleted=False
        ).all()

        my_items = []
        grouped_by_pm = {}
        grouped_by_project = {}
        total_items_count = 0

        for assignment in assignments:
            # Get BOQ
            boq = BOQ.query.filter_by(boq_id=assignment.boq_id, is_deleted=False).first()
            if not boq:
                continue

            # Get project
            project = Project.query.filter_by(project_id=assignment.project_id, is_deleted=False).first()
            if not project:
                continue

            # Get PM details
            pm_user = User.query.get(assignment.assigned_by_pm_id)
            pm_name = pm_user.full_name if pm_user else 'Unknown'

            # Get BOQ details to fetch full item information
            boq_details = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()
            items = boq_details.boq_details.get('items', []) if boq_details and boq_details.boq_details else []

            # Process each assigned item index
            for item_index in (assignment.item_indices or []):
                if item_index >= len(items):
                    continue

                item = items[item_index]
                total_items_count += 1

                item_data = {
                    "boq_id": boq.boq_id,
                    "boq_name": boq.boq_name,
                    "project_id": project.project_id,
                    "project_name": project.project_name,
                    "project_code": project.project_code if hasattr(project, 'project_code') else None,
                    "item_index": item_index,
                    "item_code": item.get('item_code') or item.get('item_number') or item.get('item_name') or item.get('sr_no') or f"Item-{item_index+1}",
                    "description": item.get('description') or item.get('item_name') or item.get('name') or 'N/A',
                    "quantity": item.get('quantity') or item.get('qty'),
                    "unit": item.get('unit') or item.get('uom') or '',
                    "rate": item.get('rate') or item.get('unitRate'),
                    "amount": item.get('amount') or item.get('totalAmount'),
                    "assigned_by_pm_user_id": assignment.assigned_by_pm_id,
                    "assigned_by_pm_name": pm_name,
                    "assignment_date": assignment.assignment_date.isoformat() if assignment.assignment_date else None,
                    "assignment_status": assignment.assignment_status or 'assigned',
                    "notes": assignment.notes
                }

                my_items.append(item_data)

                # Group by PM
                if pm_name not in grouped_by_pm:
                    grouped_by_pm[pm_name] = {
                        "pm_user_id": assignment.assigned_by_pm_id,
                        "pm_name": pm_name,
                        "items_count": 0,
                        "projects": {}
                    }

                pm_group = grouped_by_pm[pm_name]
                pm_group["items_count"] += 1

                # Group by project within PM
                if project.project_name not in pm_group["projects"]:
                    pm_group["projects"][project.project_name] = {
                        "project_id": project.project_id,
                        "project_name": project.project_name,
                        "project_code": project.project_code if hasattr(project, 'project_code') else None,
                        "items_count": 0,
                        "boqs": {}
                    }

                pm_group["projects"][project.project_name]["items_count"] += 1

                # Group by BOQ within project
                if boq.boq_name not in pm_group["projects"][project.project_name]["boqs"]:
                    pm_group["projects"][project.project_name]["boqs"][boq.boq_name] = {
                        "boq_id": boq.boq_id,
                        "boq_name": boq.boq_name,
                        "items_count": 0
                    }

                pm_group["projects"][project.project_name]["boqs"][boq.boq_name]["items_count"] += 1

                # Group by project (for top-level summary)
                if project.project_id not in grouped_by_project:
                    grouped_by_project[project.project_id] = {
                        "project_id": project.project_id,
                        "project_name": project.project_name,
                        "project_code": project.project_code if hasattr(project, 'project_code') else None,
                        "items_count": 0,
                        "boqs": {}
                    }

                grouped_by_project[project.project_id]["items_count"] += 1

                if boq.boq_id not in grouped_by_project[project.project_id]["boqs"]:
                    grouped_by_project[project.project_id]["boqs"][boq.boq_id] = {
                        "boq_id": boq.boq_id,
                        "boq_name": boq.boq_name,
                        "items_count": 0
                    }

                grouped_by_project[project.project_id]["boqs"][boq.boq_id]["items_count"] += 1

        # Convert grouped_by_pm dict to list
        pm_list = []
        for pm_name, pm_data in grouped_by_pm.items():
            # Convert projects dict to list and convert BOQs dict to list within each project
            for proj_name, proj_data in pm_data["projects"].items():
                proj_data["boqs"] = list(proj_data["boqs"].values())
            pm_data["projects"] = list(pm_data["projects"].values())
            pm_list.append(pm_data)

        # Convert grouped_by_project dict to list
        project_list = []
        for proj_id, proj_data in grouped_by_project.items():
            proj_data["boqs"] = list(proj_data["boqs"].values())
            project_list.append(proj_data)

        # Sort by PM name
        pm_list.sort(key=lambda x: x['pm_name'])
        project_list.sort(key=lambda x: x['project_name'])

        return jsonify({
            "success": True,
            "my_items": my_items,
            "grouped_by_pm": pm_list,
            "grouped_by_project": project_list,
            "total_items_assigned": total_items_count,
            "unique_pms_count": len(pm_list),
            "unique_projects_count": len(grouped_by_project),
            "total_assignments": len(assignments)
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error getting assigned items: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to get assigned items: {str(e)}",
            "error_type": type(e).__name__
        }), 500

def assign_boq_to_buyer(boq_id):
    """Site Engineer assigns BOQ materials to a buyer"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment

        current_user = g.user
        se_user_id = current_user['user_id']
        se_name = current_user.get('full_name', 'Site Engineer')

        data = request.get_json()
        buyer_id = data.get('buyer_id')

        if not buyer_id:
            return jsonify({"error": "buyer_id is required"}), 400

        # Verify BOQ exists
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Verify BOQ is assigned to this SE
        project = Project.query.filter_by(
            project_id=boq.project_id,
            is_deleted=False
        ).first()

        if not project:
            return jsonify({"error": "Project not found"}), 404

        if project.site_supervisor_id != se_user_id:
            return jsonify({"error": "You are not assigned to this BOQ"}), 403

        # Verify BOQ has materials before allowing assignment
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details or not boq_details.boq_details:
            return jsonify({"error": "Cannot assign empty BOQ. Please add items and materials to the BOQ first."}), 400

        # Count materials in BOQ
        items = boq_details.boq_details.get('items', [])
        total_materials = 0
        for item in items:
            # Support both old and new BOQ structures
            sub_items = item.get('sub_items', [])
            if (item.get('has_sub_items') and sub_items) or (sub_items and len(sub_items) > 0):
                for sub_item in sub_items:
                    materials = sub_item.get('materials', [])
                    total_materials += len(materials)

        if total_materials == 0:
            return jsonify({
                "error": "Cannot assign BOQ with no materials. Please add materials to the BOQ before assigning to buyer.",
                "boq_name": boq.boq_name,
                "materials_count": 0
            }), 400

        # Verify buyer exists
        buyer_role = Role.query.filter_by(role='buyer').first()
        buyer = User.query.filter(
            User.user_id == buyer_id,
            User.role_id == buyer_role.role_id,
            User.is_deleted == False,
            User.is_active == True
        ).first()

        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        # Check if already assigned
        existing_assignment = BOQMaterialAssignment.query.filter_by(
            boq_id=boq_id,
            assigned_to_buyer_user_id=buyer_id,
            is_deleted=False
        ).first()

        if existing_assignment:
            return jsonify({"error": "BOQ already assigned to this buyer"}), 400

        # Create assignment
        assignment = BOQMaterialAssignment(
            boq_id=boq_id,
            project_id=project.project_id,
            assigned_by_user_id=se_user_id,
            assigned_by_name=se_name,
            assigned_to_buyer_user_id=buyer_id,
            assigned_to_buyer_name=buyer.full_name,
            assigned_to_buyer_date=datetime.utcnow(),
            status='assigned_to_buyer'
        )

        db.session.add(assignment)

        # Create BOQ history entry
        boq_history = BOQHistory.query.filter_by(boq_id=boq_id).first()

        # Handle existing actions
        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        # Create new action
        new_action = {
            "role": "site_engineer",
            "type": "boq_assigned_to_buyer",
            "sender": "site_engineer",
            "receiver": "buyer",
            "status": "assigned_to_buyer",
            "boq_name": boq.boq_name,
            "project_name": project.project_name,
            "comments": f"Site Engineer assigned BOQ materials to {buyer.full_name}",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": se_name,
            "sender_user_id": se_user_id,
            "recipient_name": buyer.full_name,
            "recipient_email": buyer.email,
            "assignment_id": assignment.assignment_id
        }

        current_actions.append(new_action)

        if boq_history:
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=current_actions,
                action_by=se_name,
                boq_status=boq.status,
                sender=se_name,
                receiver=buyer.full_name,
                comments=f"BOQ assigned to buyer {buyer.full_name}",
                sender_role='site_engineer',
                receiver_role='buyer',
                action_date=datetime.utcnow(),
                created_by=se_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Send notification to buyer about BOQ assignment
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            notification = NotificationManager.create_notification(
                user_id=buyer_id,
                type='assignment',
                title='BOQ Assigned for Purchase',
                message=f'Site Engineer assigned BOQ "{boq.boq_name}" to you for purchasing ({total_materials} materials)',
                priority='high',
                category='assignment',
                action_required=True,
                action_url=f'/buyer/boq/{boq_id}',
                action_label='View BOQ',
                metadata={
                    'boq_id': str(boq_id),
                    'boq_name': boq.boq_name,
                    'project_id': str(project.project_id) if project.project_id else None,
                    'project_name': project.project_name,
                    'materials_count': total_materials,
                    'assignment_id': str(assignment.assignment_id)
                },
                sender_id=se_user_id,
                sender_name=se_name
            )
            send_notification_to_user(buyer_id, notification.to_dict())
            log.info(f"Sent BOQ assignment notification to buyer {buyer_id}")
        except Exception as notif_error:
            log.error(f"Failed to send BOQ assignment notification: {notif_error}")

        # Send email notification to buyer
        try:
            email_service = BOQEmailService()
            email_service.send_assignment_notification(
                buyer_email=buyer.email,
                buyer_name=buyer.full_name,
                se_name=se_name,
                boq_name=boq.boq_name,
                project_name=project.project_name
            )
        except Exception as email_error:
            log.warning(f"Failed to send email notification: {str(email_error)}")

        log.info(f"Site Engineer {se_user_id} assigned BOQ {boq_id} to buyer {buyer_id}")

        return jsonify({
            "success": True,
            "message": f"BOQ materials assigned to {buyer.full_name}",
            "assignment_id": assignment.assignment_id,
            "buyer_name": buyer.full_name
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error assigning BOQ to buyer: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to assign BOQ: {str(e)}"
        }), 500

def get_se_ongoing_projects():
    """
    Get ONGOING projects for Site Engineer (projects with status != 'completed')
    Shows projects assigned to the current SE where project status is not completed
    """
    try:
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import func

        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401

        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower()

        # Get effective user context (handles admin viewing as other roles)
        context = get_effective_user_context()
        effective_role = context.get('effective_role', user_role)
        is_admin_viewing = context.get('is_admin_viewing', False)
        effective_user_id = context.get('effective_user_id')  # Specific user ID when viewing as a user

        # Determine target SE ID for filtering
        # - Regular SE: use their user_id
        # - Admin viewing as specific SE: use effective_user_id
        # - Admin viewing as SE role (no specific user): show ALL SE projects (target_se_id = None)
        target_se_id = None  # None means show all SE projects
        show_all_se_projects = False

        if is_admin_viewing and effective_role in ['siteengineer', 'sitesupervisor']:
            if effective_user_id:
                target_se_id = effective_user_id
                log.info(f"Admin viewing as SE user {effective_user_id} - filtering by that SE")
            else:
                # Admin viewing as SE role without specific user - show ALL SE projects
                show_all_se_projects = True
                log.info(f"Admin viewing as SE role without specific user - showing ALL SE projects")
        elif user_role == 'admin' and not is_admin_viewing:
            # Pure admin (not viewing as SE) - show ALL SE projects
            show_all_se_projects = True
            log.info(f"Pure admin view - showing ALL SE projects")
        else:
            target_se_id = user_id

        # Query projects assigned to this SE with ongoing status
        query = (
            db.session.query(
                Project.project_id,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.area,
                Project.work_type,
                Project.start_date,
                Project.end_date,
                Project.duration_days,
                Project.description,
                Project.status.label('project_status'),
                Project.user_id,
                Project.created_at,
                Project.created_by,
                BOQ.boq_id,
                BOQ.boq_name,
                BOQ.status.label('boq_status')
            )
            .outerjoin(BOQ, Project.project_id == BOQ.project_id)
            .filter(
                Project.is_deleted == False,
                ~Project.status.in_(['completed', 'Completed'])  # Only ongoing projects
            )
        )

        # Filter by Site Engineer assignment
        if show_all_se_projects:
            # Admin viewing as SE role - show ALL projects with SE assignments
            query = query.join(
                PMAssignSS,
                BOQ.boq_id == PMAssignSS.boq_id
            ).filter(
                PMAssignSS.is_deleted == False
            )
        else:
            # Specific SE - filter by target_se_id
            query = query.join(
                PMAssignSS,
                BOQ.boq_id == PMAssignSS.boq_id
            ).filter(
                PMAssignSS.is_deleted == False,
                PMAssignSS.assigned_to_se_id == target_se_id
            )

        # Add distinct to prevent duplicate projects when multiple SE assignments exist
        # PostgreSQL DISTINCT ON requires ORDER BY to start with the same columns
        query = query.distinct(Project.project_id, BOQ.boq_id)
        query = query.order_by(Project.project_id, BOQ.boq_id, Project.created_at.desc())

        # Pagination
        if page is not None:
            # Use subquery for accurate count with distinct
            subquery = query.subquery()
            total_count = db.session.query(func.count()).select_from(subquery).scalar()

            if total_count == 0:
                return jsonify({
                    "message": "SE ongoing projects retrieved successfully",
                    "count": 0,
                    "data": [],
                    "pagination": {"page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}
                }), 200

            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

            if total_count == 0:
                return jsonify({"message": "SE ongoing projects retrieved successfully", "count": 0, "data": []}), 200

        # Get BOQ IDs for additional data lookup
        boq_ids = [row.boq_id for row in rows if row.boq_id]

        # Batch load PM assign SS records
        pm_assign_records = {}
        if boq_ids:
            if show_all_se_projects:
                # Admin - get ALL SE assignments for these BOQs
                pm_assigns = PMAssignSS.query.filter(
                    PMAssignSS.boq_id.in_(boq_ids),
                    PMAssignSS.is_deleted == False
                ).all()
            else:
                # Specific SE - filter by target_se_id
                pm_assigns = PMAssignSS.query.filter(
                    PMAssignSS.boq_id.in_(boq_ids),
                    PMAssignSS.assigned_to_se_id == target_se_id,
                    PMAssignSS.is_deleted == False
                ).all()

            for pa in pm_assigns:
                if pa.boq_id not in pm_assign_records:
                    pm_assign_records[pa.boq_id] = []
                pm_assign_records[pa.boq_id].append(pa)

        # Batch load BOQ details for assigned items
        boq_details_map = {}
        if boq_ids:
            from models.boq import BOQDetails
            boq_details_list = BOQDetails.query.filter(
                BOQDetails.boq_id.in_(boq_ids),
                BOQDetails.is_deleted == False
            ).all()
            for bd in boq_details_list:
                boq_details_map[bd.boq_id] = bd

        # Batch load PM user names
        pm_ids = set()
        for assignments in pm_assign_records.values():
            for assignment in assignments:
                if assignment.assigned_by_pm_id:
                    pm_ids.add(assignment.assigned_by_pm_id)

        pm_names_map = {}
        if pm_ids:
            from models.user import User
            pm_users = User.query.filter(User.user_id.in_(pm_ids)).all()
            pm_names_map = {u.user_id: u.full_name for u in pm_users}

        # Get SE names for admin view
        se_names_map = {}
        if show_all_se_projects:
            se_ids = set()
            for assignments in pm_assign_records.values():
                for assignment in assignments:
                    if assignment.assigned_to_se_id:
                        se_ids.add(assignment.assigned_to_se_id)
            if se_ids:
                from models.user import User
                se_users = User.query.filter(User.user_id.in_(se_ids)).all()
                se_names_map = {u.user_id: u.full_name for u in se_users}

        # Helper function to build assigned items list
        def build_assigned_items(boq_id, assignments, boq_details_map, pm_names_map, se_id):
            assigned_items_list = []
            boq_details = boq_details_map.get(boq_id)
            if not boq_details or not boq_details.boq_details:
                return assigned_items_list

            items = boq_details.boq_details.get('items', [])
            assigned_indices = set()
            index_to_assignment = {}

            for assignment in assignments:
                if assignment.item_indices:
                    for idx in assignment.item_indices:
                        assigned_indices.add(idx)
                        index_to_assignment[idx] = assignment

            price_fields = ['rate', 'amount', 'unitRate', 'totalAmount', 'selling_price',
                          'base_price', 'profit', 'overhead', 'gst', 'total_cost']

            for idx in assigned_indices:
                if idx < len(items):
                    item = items[idx]
                    assignment_for_idx = index_to_assignment.get(idx)
                    pm_user_id = assignment_for_idx.assigned_by_pm_id if assignment_for_idx else None
                    pm_name = pm_names_map.get(pm_user_id, 'Unknown') if pm_user_id else 'Unknown'
                    assignment_date = assignment_for_idx.assignment_date if assignment_for_idx else None
                    assignment_status = assignment_for_idx.assignment_status if assignment_for_idx else 'assigned'

                    item_detail = copy.deepcopy(item)
                    for field in price_fields:
                        item_detail.pop(field, None)

                    if 'sub_items' in item_detail and isinstance(item_detail['sub_items'], list):
                        # Filter sub_items to only include those with materials or labour
                        filtered_sub_items = []
                        for sub_item in item_detail['sub_items']:
                            if isinstance(sub_item, dict):
                                for field in price_fields:
                                    sub_item.pop(field, None)

                                has_materials = False
                                has_labour = False

                                if 'materials' in sub_item and isinstance(sub_item['materials'], list):
                                    # Filter out empty materials and check if any valid materials exist
                                    sub_item['materials'] = [m for m in sub_item['materials'] if m and isinstance(m, dict)]
                                    has_materials = len(sub_item['materials']) > 0
                                    for material in sub_item['materials']:
                                        if isinstance(material, dict):
                                            for field in price_fields + ['unit_price', 'total_price']:
                                                material.pop(field, None)

                                if 'labour' in sub_item and isinstance(sub_item['labour'], list):
                                    # Filter out empty labour and check if any valid labour exist
                                    sub_item['labour'] = [l for l in sub_item['labour'] if l and isinstance(l, dict)]
                                    has_labour = len(sub_item['labour']) > 0
                                    for labour in sub_item['labour']:
                                        if isinstance(labour, dict):
                                            for field in price_fields + ['wage_per_day', 'total_wage']:
                                                labour.pop(field, None)

                                # Only include sub_item if it has materials or labour
                                if has_materials or has_labour:
                                    filtered_sub_items.append(sub_item)

                        item_detail['sub_items'] = filtered_sub_items

                    item_detail["item_index"] = idx
                    item_detail["assigned_by_pm_name"] = pm_name
                    item_detail["assigned_by_pm_user_id"] = pm_user_id
                    item_detail["assigned_to_se_user_id"] = se_id
                    item_detail["assigned_by_role"] = 'projectManager'
                    item_detail["assignment_date"] = assignment_date.isoformat() if assignment_date else None
                    item_detail["assignment_status"] = assignment_status or 'assigned'

                    assigned_items_list.append(item_detail)

            return assigned_items_list

        # Map to response - Group by (project_id, se_id) for admin view, or just project_id for specific SE
        projects_map = {}  # key -> project data

        for row in rows:
            boq_assignments = pm_assign_records.get(row.boq_id, [])
            if not boq_assignments:
                continue

            # Group assignments by SE for processing
            if show_all_se_projects:
                # Admin view - group by SE
                se_assignments = {}
                for assignment in boq_assignments:
                    se_id = assignment.assigned_to_se_id
                    if se_id not in se_assignments:
                        se_assignments[se_id] = []
                    se_assignments[se_id].append(assignment)
            else:
                # Specific SE view - all assignments belong to target_se_id
                se_assignments = {target_se_id: boq_assignments}

            # Process each SE's assignments
            for se_id, assignments in se_assignments.items():
                # Calculate items count for this SE
                items_assigned_count = 0
                for assignment in assignments:
                    if assignment.item_indices:
                        items_assigned_count += len(assignment.item_indices)

                my_completion_requested = any(a.se_completion_requested for a in assignments)
                my_work_confirmed = all(a.pm_confirmed_completion for a in assignments) if assignments else False

                # Build assigned items for this SE
                assigned_items_list = build_assigned_items(row.boq_id, assignments, boq_details_map, pm_names_map, se_id)

                # Key: (project_id, se_id) for admin, just project_id for specific SE
                map_key = (row.project_id, se_id) if show_all_se_projects else row.project_id

                if map_key in projects_map:
                    # Project exists - add/merge BOQ data
                    existing_project = projects_map[map_key]
                    existing_project["items_assigned_to_me"] += items_assigned_count
                    existing_project["my_completion_requested"] = existing_project["my_completion_requested"] or my_completion_requested
                    existing_project["my_work_confirmed"] = existing_project["my_work_confirmed"] and my_work_confirmed

                    if row.boq_id:
                        existing_boq_ids = [b["boq_id"] for b in existing_project["boqs_with_items"]]
                        if row.boq_id not in existing_boq_ids:
                            existing_project["boqs_with_items"].append({
                                "boq_id": row.boq_id,
                                "boq_name": row.boq_name,
                                "items_count": items_assigned_count,
                                "assigned_items": assigned_items_list
                            })
                        else:
                            for boq_item in existing_project["boqs_with_items"]:
                                if boq_item["boq_id"] == row.boq_id:
                                    existing_indices = {item.get("item_index") for item in boq_item["assigned_items"]}
                                    for new_item in assigned_items_list:
                                        if new_item.get("item_index") not in existing_indices:
                                            boq_item["assigned_items"].append(new_item)
                                            boq_item["items_count"] += 1
                                    break
                else:
                    # New project entry
                    project_entry = {
                        "project_id": row.project_id,
                        "project_name": row.project_name,
                        "project_code": row.project_code,
                        "client": row.client,
                        "location": row.location,
                        "floor_name": row.floor_name,
                        "working_hours": row.working_hours,
                        "area": row.area,
                        "work_type": row.work_type,
                        "start_date": row.start_date.isoformat() if row.start_date else None,
                        "end_date": row.end_date.isoformat() if row.end_date else None,
                        "duration_days": row.duration_days,
                        "description": row.description,
                        "project_status": row.project_status,
                        "status": row.project_status,
                        "user_id": row.user_id,
                        "created_at": row.created_at.isoformat() if row.created_at else None,
                        "created_by": row.created_by,
                        "boq_id": row.boq_id,
                        "boq_name": row.boq_name,
                        "boq_status": row.boq_status,
                        "items_assigned_to_me": items_assigned_count,
                        "my_completion_requested": my_completion_requested,
                        "my_work_confirmed": my_work_confirmed,
                        "boqs_with_items": [
                            {
                                "boq_id": row.boq_id,
                                "boq_name": row.boq_name,
                                "items_count": items_assigned_count,
                                "assigned_items": assigned_items_list
                            }
                        ] if row.boq_id else []
                    }

                    # Add SE info for admin view
                    if show_all_se_projects:
                        project_entry["assigned_se_id"] = se_id
                        project_entry["assigned_se_name"] = se_names_map.get(se_id, 'Unknown')

                    projects_map[map_key] = project_entry

        # Convert map to list and sort by project_id descending
        projects = sorted(projects_map.values(), key=lambda x: x["project_id"], reverse=True)

        response = {
            "message": "SE ongoing projects retrieved successfully",
            "count": len(projects),
            "data": projects
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
        log.error(f"Error retrieving SE ongoing projects: {str(e)}")
        return jsonify({'error': 'Failed to retrieve SE ongoing projects', 'details': str(e)}), 500


def get_se_completed_projects():
    """
    Get COMPLETED projects for Site Engineer (projects with status = 'completed')
    Shows projects assigned to the current SE where project status is completed
    """
    try:
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy import func

        page = request.args.get('page', type=int)
        page_size = request.args.get('page_size', default=20, type=int)
        page_size = min(page_size, 100)

        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401

        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower()

        # Get effective user context (handles admin viewing as other roles)
        context = get_effective_user_context()
        effective_role = context.get('effective_role', user_role)
        is_admin_viewing = context.get('is_admin_viewing', False)
        effective_user_id = context.get('effective_user_id')  # Specific user ID when viewing as a user

        # Determine target SE ID for filtering
        # - Regular SE: use their user_id
        # - Admin viewing as specific SE: use effective_user_id
        # - Admin viewing as SE role (no specific user): show ALL SE projects (target_se_id = None)
        target_se_id = None  # None means show all SE projects
        show_all_se_projects = False

        if is_admin_viewing and effective_role in ['siteengineer', 'sitesupervisor']:
            if effective_user_id:
                target_se_id = effective_user_id
                log.info(f"Admin viewing as SE user {effective_user_id} - filtering by that SE (completed)")
            else:
                # Admin viewing as SE role without specific user - show ALL SE projects
                show_all_se_projects = True
                log.info(f"Admin viewing as SE role without specific user - showing ALL SE completed projects")
        elif user_role == 'admin' and not is_admin_viewing:
            # Pure admin (not viewing as SE) - show ALL SE projects
            show_all_se_projects = True
            log.info(f"Pure admin view - showing ALL SE completed projects")
        else:
            target_se_id = user_id

        # Query projects assigned to this SE with completed status
        query = (
            db.session.query(
                Project.project_id,
                Project.project_name,
                Project.project_code,
                Project.client,
                Project.location,
                Project.floor_name,
                Project.working_hours,
                Project.area,
                Project.work_type,
                Project.start_date,
                Project.end_date,
                Project.duration_days,
                Project.description,
                Project.status.label('project_status'),
                Project.user_id,
                Project.created_at,
                Project.created_by,
                BOQ.boq_id,
                BOQ.boq_name,
                BOQ.status.label('boq_status')
            )
            .outerjoin(BOQ, Project.project_id == BOQ.project_id)
            .filter(
                Project.is_deleted == False,
                Project.status.in_(['completed', 'Completed'])  # Only completed projects
            )
        )

        # Filter by Site Engineer assignment
        if show_all_se_projects:
            # Admin viewing as SE role - show ALL projects with SE assignments
            query = query.join(
                PMAssignSS,
                BOQ.boq_id == PMAssignSS.boq_id
            ).filter(
                PMAssignSS.is_deleted == False
            )
        else:
            # Specific SE - filter by target_se_id
            query = query.join(
                PMAssignSS,
                BOQ.boq_id == PMAssignSS.boq_id
            ).filter(
                PMAssignSS.is_deleted == False,
                PMAssignSS.assigned_to_se_id == target_se_id
            )

        # Add distinct to prevent duplicate projects when multiple SE assignments exist
        # PostgreSQL DISTINCT ON requires ORDER BY to start with the same columns
        query = query.distinct(Project.project_id, BOQ.boq_id)
        query = query.order_by(Project.project_id, BOQ.boq_id, Project.created_at.desc())

        # Pagination
        if page is not None:
            # Use subquery for accurate count with distinct
            subquery = query.subquery()
            total_count = db.session.query(func.count()).select_from(subquery).scalar()

            if total_count == 0:
                return jsonify({
                    "message": "SE completed projects retrieved successfully",
                    "count": 0,
                    "data": [],
                    "pagination": {"page": page, "page_size": page_size, "total_count": 0, "total_pages": 0, "has_next": False, "has_prev": False}
                }), 200

            offset = (page - 1) * page_size
            rows = query.offset(offset).limit(page_size).all()
        else:
            rows = query.all()
            total_count = len(rows)

            if total_count == 0:
                return jsonify({"message": "SE completed projects retrieved successfully", "count": 0, "data": []}), 200

        # Get BOQ IDs for additional data lookup
        boq_ids = [row.boq_id for row in rows if row.boq_id]

        # Batch load PM assign SS records
        pm_assign_records = {}
        if boq_ids:
            if show_all_se_projects:
                # Admin - get ALL SE assignments for these BOQs
                pm_assigns = PMAssignSS.query.filter(
                    PMAssignSS.boq_id.in_(boq_ids),
                    PMAssignSS.is_deleted == False
                ).all()
            else:
                # Specific SE - filter by target_se_id
                pm_assigns = PMAssignSS.query.filter(
                    PMAssignSS.boq_id.in_(boq_ids),
                    PMAssignSS.assigned_to_se_id == target_se_id,
                    PMAssignSS.is_deleted == False
                ).all()

            for pa in pm_assigns:
                if pa.boq_id not in pm_assign_records:
                    pm_assign_records[pa.boq_id] = []
                pm_assign_records[pa.boq_id].append(pa)

        # Batch load BOQ details for assigned items
        boq_details_map = {}
        if boq_ids:
            from models.boq import BOQDetails
            boq_details_list = BOQDetails.query.filter(
                BOQDetails.boq_id.in_(boq_ids),
                BOQDetails.is_deleted == False
            ).all()
            for bd in boq_details_list:
                boq_details_map[bd.boq_id] = bd

        # Batch load PM user names
        pm_ids = set()
        for assignments in pm_assign_records.values():
            for assignment in assignments:
                if assignment.assigned_by_pm_id:
                    pm_ids.add(assignment.assigned_by_pm_id)

        pm_names_map = {}
        if pm_ids:
            from models.user import User
            pm_users = User.query.filter(User.user_id.in_(pm_ids)).all()
            pm_names_map = {u.user_id: u.full_name for u in pm_users}

        # Get SE names for admin view
        se_names_map = {}
        if show_all_se_projects:
            se_ids = set()
            for assignments in pm_assign_records.values():
                for assignment in assignments:
                    if assignment.assigned_to_se_id:
                        se_ids.add(assignment.assigned_to_se_id)
            if se_ids:
                from models.user import User
                se_users = User.query.filter(User.user_id.in_(se_ids)).all()
                se_names_map = {u.user_id: u.full_name for u in se_users}

        # Helper function to build assigned items list
        def build_assigned_items(boq_id, assignments, boq_details_map, pm_names_map, se_id):
            assigned_items_list = []
            boq_details = boq_details_map.get(boq_id)
            if not boq_details or not boq_details.boq_details:
                return assigned_items_list

            items = boq_details.boq_details.get('items', [])
            assigned_indices = set()
            index_to_assignment = {}

            for assignment in assignments:
                if assignment.item_indices:
                    for idx in assignment.item_indices:
                        assigned_indices.add(idx)
                        index_to_assignment[idx] = assignment

            price_fields = ['rate', 'amount', 'unitRate', 'totalAmount', 'selling_price',
                          'base_price', 'profit', 'overhead', 'gst', 'total_cost']

            for idx in assigned_indices:
                if idx < len(items):
                    item = items[idx]
                    assignment_for_idx = index_to_assignment.get(idx)
                    pm_user_id = assignment_for_idx.assigned_by_pm_id if assignment_for_idx else None
                    pm_name = pm_names_map.get(pm_user_id, 'Unknown') if pm_user_id else 'Unknown'
                    assignment_date = assignment_for_idx.assignment_date if assignment_for_idx else None
                    assignment_status = assignment_for_idx.assignment_status if assignment_for_idx else 'assigned'

                    item_detail = copy.deepcopy(item)
                    for field in price_fields:
                        item_detail.pop(field, None)

                    if 'sub_items' in item_detail and isinstance(item_detail['sub_items'], list):
                        # Filter sub_items to only include those with materials or labour
                        filtered_sub_items = []
                        for sub_item in item_detail['sub_items']:
                            if isinstance(sub_item, dict):
                                for field in price_fields:
                                    sub_item.pop(field, None)

                                has_materials = False
                                has_labour = False

                                if 'materials' in sub_item and isinstance(sub_item['materials'], list):
                                    # Filter out empty materials and check if any valid materials exist
                                    sub_item['materials'] = [m for m in sub_item['materials'] if m and isinstance(m, dict)]
                                    has_materials = len(sub_item['materials']) > 0
                                    for material in sub_item['materials']:
                                        if isinstance(material, dict):
                                            for field in price_fields + ['unit_price', 'total_price']:
                                                material.pop(field, None)

                                if 'labour' in sub_item and isinstance(sub_item['labour'], list):
                                    # Filter out empty labour and check if any valid labour exist
                                    sub_item['labour'] = [l for l in sub_item['labour'] if l and isinstance(l, dict)]
                                    has_labour = len(sub_item['labour']) > 0
                                    for labour in sub_item['labour']:
                                        if isinstance(labour, dict):
                                            for field in price_fields + ['wage_per_day', 'total_wage']:
                                                labour.pop(field, None)

                                # Only include sub_item if it has materials or labour
                                if has_materials or has_labour:
                                    filtered_sub_items.append(sub_item)

                        item_detail['sub_items'] = filtered_sub_items

                    item_detail["item_index"] = idx
                    item_detail["assigned_by_pm_name"] = pm_name
                    item_detail["assigned_by_pm_user_id"] = pm_user_id
                    item_detail["assigned_to_se_user_id"] = se_id
                    item_detail["assigned_by_role"] = 'projectManager'
                    item_detail["assignment_date"] = assignment_date.isoformat() if assignment_date else None
                    item_detail["assignment_status"] = assignment_status or 'assigned'

                    assigned_items_list.append(item_detail)

            return assigned_items_list

        # Map to response - Group by (project_id, se_id) for admin view, or just project_id for specific SE
        projects_map = {}  # key -> project data

        for row in rows:
            boq_assignments = pm_assign_records.get(row.boq_id, [])
            if not boq_assignments:
                continue

            # Group assignments by SE for processing
            if show_all_se_projects:
                # Admin view - group by SE
                se_assignments = {}
                for assignment in boq_assignments:
                    se_id = assignment.assigned_to_se_id
                    if se_id not in se_assignments:
                        se_assignments[se_id] = []
                    se_assignments[se_id].append(assignment)
            else:
                # Specific SE view - all assignments belong to target_se_id
                se_assignments = {target_se_id: boq_assignments}

            # Process each SE's assignments
            for se_id, assignments in se_assignments.items():
                # Calculate items count for this SE
                items_assigned_count = 0
                for assignment in assignments:
                    if assignment.item_indices:
                        items_assigned_count += len(assignment.item_indices)

                my_completion_requested = any(a.se_completion_requested for a in assignments)
                my_work_confirmed = all(a.pm_confirmed_completion for a in assignments) if assignments else False

                # Build assigned items for this SE
                assigned_items_list = build_assigned_items(row.boq_id, assignments, boq_details_map, pm_names_map, se_id)

                # Key: (project_id, se_id) for admin, just project_id for specific SE
                map_key = (row.project_id, se_id) if show_all_se_projects else row.project_id

                if map_key in projects_map:
                    # Project exists - add/merge BOQ data
                    existing_project = projects_map[map_key]
                    existing_project["items_assigned_to_me"] += items_assigned_count
                    existing_project["my_completion_requested"] = existing_project["my_completion_requested"] or my_completion_requested
                    existing_project["my_work_confirmed"] = existing_project["my_work_confirmed"] and my_work_confirmed

                    if row.boq_id:
                        existing_boq_ids = [b["boq_id"] for b in existing_project["boqs_with_items"]]
                        if row.boq_id not in existing_boq_ids:
                            existing_project["boqs_with_items"].append({
                                "boq_id": row.boq_id,
                                "boq_name": row.boq_name,
                                "items_count": items_assigned_count,
                                "assigned_items": assigned_items_list
                            })
                        else:
                            for boq_item in existing_project["boqs_with_items"]:
                                if boq_item["boq_id"] == row.boq_id:
                                    existing_indices = {item.get("item_index") for item in boq_item["assigned_items"]}
                                    for new_item in assigned_items_list:
                                        if new_item.get("item_index") not in existing_indices:
                                            boq_item["assigned_items"].append(new_item)
                                            boq_item["items_count"] += 1
                                    break
                else:
                    # New project entry
                    project_entry = {
                        "project_id": row.project_id,
                        "project_name": row.project_name,
                        "project_code": row.project_code,
                        "client": row.client,
                        "location": row.location,
                        "floor_name": row.floor_name,
                        "working_hours": row.working_hours,
                        "area": row.area,
                        "work_type": row.work_type,
                        "start_date": row.start_date.isoformat() if row.start_date else None,
                        "end_date": row.end_date.isoformat() if row.end_date else None,
                        "duration_days": row.duration_days,
                        "description": row.description,
                        "project_status": row.project_status,
                        "status": row.project_status,
                        "user_id": row.user_id,
                        "created_at": row.created_at.isoformat() if row.created_at else None,
                        "created_by": row.created_by,
                        "boq_id": row.boq_id,
                        "boq_name": row.boq_name,
                        "boq_status": row.boq_status,
                        "items_assigned_to_me": items_assigned_count,
                        "my_completion_requested": my_completion_requested,
                        "my_work_confirmed": my_work_confirmed,
                        "boqs_with_items": [
                            {
                                "boq_id": row.boq_id,
                                "boq_name": row.boq_name,
                                "items_count": items_assigned_count,
                                "assigned_items": assigned_items_list
                            }
                        ] if row.boq_id else []
                    }

                    # Add SE info for admin view
                    if show_all_se_projects:
                        project_entry["assigned_se_id"] = se_id
                        project_entry["assigned_se_name"] = se_names_map.get(se_id, 'Unknown')

                    projects_map[map_key] = project_entry

        # Convert map to list and sort by project_id descending
        projects = sorted(projects_map.values(), key=lambda x: x["project_id"], reverse=True)

        response = {
            "message": "SE completed projects retrieved successfully",
            "count": len(projects),
            "data": projects
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
        log.error(f"Error retrieving SE completed projects: {str(e)}")
        return jsonify({'error': 'Failed to retrieve SE completed projects', 'details': str(e)}), 500

def get_all_sitesupervisor_boqs():
    """
    Get all projects and assigned items for the Site Engineer.
    NEW FLOW: Uses pm_assign_ss as the single source of truth for item assignments.
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        log.info(f"=== SE BOQ API called by user_id={user_id}, role={user_role} ===")

        # Import PMAssignSS model for item-level assignments
        from models.pm_assign_ss import PMAssignSS
        from sqlalchemy.orm import joinedload

        # Get effective user context (handles admin viewing as other roles)
        context = get_effective_user_context()
        effective_role = context.get('effective_role', user_role)
        is_admin_viewing = context.get('is_admin_viewing', False)
        effective_user_id = context.get('effective_user_id')  # Specific user ID when viewing as a user

        # NEW FLOW: Query pm_assign_ss first to get all item assignments
        if effective_role == 'admin' and not is_admin_viewing:
            # Pure admin (not viewing as SE) - sees all assignments
            item_assignments = PMAssignSS.query.filter(
                PMAssignSS.is_deleted == False
            ).all()
            log.info(f"=== Admin viewing all assignments ===")
        elif is_admin_viewing and effective_role in ['siteengineer', 'sitesupervisor'] and effective_user_id:
            # Admin viewing as specific SE user - sees only that SE's assignments
            item_assignments = PMAssignSS.query.filter(
                PMAssignSS.assigned_to_se_id == effective_user_id,
                PMAssignSS.is_deleted == False
            ).all()
            log.info(f"=== Admin viewing as SE user {effective_user_id} - filtering by that SE ===")
        elif is_admin_viewing and effective_role in ['siteengineer', 'sitesupervisor']:
            # Admin viewing as SE role (no specific user) - sees all SE assignments
            item_assignments = PMAssignSS.query.filter(
                PMAssignSS.is_deleted == False
            ).all()
            log.info(f"=== Admin viewing as SE role (all SEs) ===")
        else:
            # Regular SE sees only their assignments
            item_assignments = PMAssignSS.query.filter(
                PMAssignSS.assigned_to_se_id == user_id,
                PMAssignSS.is_deleted == False
            ).all()

        log.info(f"=== Found {len(item_assignments)} item assignments for SE {effective_user_id if is_admin_viewing else user_id} ===")

        # DEBUG: Log all SE assignments to help troubleshoot
        if len(item_assignments) == 0:
            all_assignments = PMAssignSS.query.filter(PMAssignSS.is_deleted == False).limit(20).all()
            log.info(f"=== DEBUG: No assignments found for user_id={user_id}. Sample of all assignments: ===")
            for a in all_assignments:
                log.info(f"    Assignment {a.pm_assign_id}: project={a.project_id}, boq={a.boq_id}, assigned_to_se_id={a.assigned_to_se_id}, assigned_by_pm_id={a.assigned_by_pm_id}")

        # Get unique project IDs from assignments
        project_ids_from_assignments = list(set([a.project_id for a in item_assignments if a.project_id]))

        # Also include projects where SE is assigned at project level
        if effective_role == 'admin' and not is_admin_viewing:
            # Pure admin - don't add project-level filter
            all_project_ids = project_ids_from_assignments
        elif is_admin_viewing and effective_role in ['siteengineer', 'sitesupervisor'] and effective_user_id:
            # Admin viewing as specific SE user - include that SE's project-level assignments
            projects_from_project_table = Project.query.filter(
                Project.site_supervisor_id == effective_user_id,
                Project.is_deleted == False
            ).all()
            project_ids_from_project_level = [p.project_id for p in projects_from_project_table]
            all_project_ids = list(set(project_ids_from_assignments + project_ids_from_project_level))
        elif is_admin_viewing and effective_role in ['siteengineer', 'sitesupervisor']:
            # Admin viewing as SE role (no specific user) - show all SE projects
            all_project_ids = project_ids_from_assignments
        else:
            # Regular SE - include their project-level assignments
            projects_from_project_table = Project.query.filter(
                Project.site_supervisor_id == user_id,
                Project.is_deleted == False
            ).all()
            project_ids_from_project_level = [p.project_id for p in projects_from_project_table]
            all_project_ids = list(set(project_ids_from_assignments + project_ids_from_project_level))

        log.info(f"=== Total unique project IDs: {len(all_project_ids)} - {all_project_ids} ===")

        # Fetch all projects in one query
        if not all_project_ids:
            return jsonify({
                "message": "No projects assigned to this Site Engineer",
                "projects": []
            }), 200

        # PERFORMANCE FIX: Use eager loading to prevent N+1 queries
        from sqlalchemy.orm import selectinload

        projects = Project.query.options(
            selectinload(Project.boqs).selectinload(BOQ.details),  # Fixed: use 'details' not 'boq_details'
            selectinload(Project.boqs).selectinload(BOQ.history)
        ).filter(
            Project.project_id.in_(all_project_ids),
            Project.is_deleted == False
        ).all()

        # ✅ PERFORMANCE OPTIMIZATION: Batch load all related data before the loop
        # Collect all BOQ IDs from all projects for batch queries
        # FIX: Include BOQs with item assignments regardless of email_sent status
        boq_ids_with_assignments = set([a.boq_id for a in item_assignments if a.boq_id])
        all_boq_ids = []
        all_project_ids = [p.project_id for p in projects]
        for project in projects:
            # Include BOQs that are either email_sent OR have item assignments to this SE
            boqs = [boq for boq in project.boqs if not boq.is_deleted and (boq.email_sent or boq.boq_id in boq_ids_with_assignments)] if hasattr(project, 'boqs') and project.boqs else []
            all_boq_ids.extend([boq.boq_id for boq in boqs])

        # Batch load BOQ History (was: N queries per project, now: 1 query total)
        all_boq_history = {}
        if all_boq_ids:
            history_records = BOQHistory.query.filter(
                BOQHistory.boq_id.in_(all_boq_ids)
            ).order_by(BOQHistory.action_date.desc()).all()
            for h in history_records:
                if h.boq_id not in all_boq_history:
                    all_boq_history[h.boq_id] = h  # Keep only the most recent

        # Batch load BOQ Material Assignments (was: 1 query per project, now: 1 query total)
        from models.boq_material_assignment import BOQMaterialAssignment
        all_material_assignments = {}
        if all_boq_ids:
            assignments = BOQMaterialAssignment.query.filter(
                BOQMaterialAssignment.boq_id.in_(all_boq_ids),
                BOQMaterialAssignment.is_deleted == False
            ).all()
            for a in assignments:
                if a.boq_id not in all_material_assignments:
                    all_material_assignments[a.boq_id] = a

        # Batch load all PM Assign SS records (was: multiple queries per project, now: 1 query total)
        all_pm_assign_ss = {}
        all_pm_assign_ss_by_project = {}
        if all_boq_ids:
            pm_assigns = PMAssignSS.query.filter(
                PMAssignSS.boq_id.in_(all_boq_ids),
                PMAssignSS.is_deleted == False
            ).all()
            for pa in pm_assigns:
                # Group by boq_id
                if pa.boq_id not in all_pm_assign_ss:
                    all_pm_assign_ss[pa.boq_id] = []
                all_pm_assign_ss[pa.boq_id].append(pa)
                # Group by project_id
                if pa.project_id not in all_pm_assign_ss_by_project:
                    all_pm_assign_ss_by_project[pa.project_id] = []
                all_pm_assign_ss_by_project[pa.project_id].append(pa)

        projects_list = []
        for project in projects:
            # Use pre-loaded relationship instead of querying
            # FIX: Include BOQs that are either email_sent OR have item assignments to this SE
            boqs = [boq for boq in project.boqs if not boq.is_deleted and (boq.email_sent or boq.boq_id in boq_ids_with_assignments)] if hasattr(project, 'boqs') and project.boqs else []

            # Collect BOQ IDs for this project
            boq_ids = [boq.boq_id for boq in boqs]

            # Determine project status from BOQ history using pre-loaded data (NO QUERY)
            project_status = project.status or 'assigned'

            # Check if any BOQs exist and have history
            if boqs:
                for boq in boqs:
                    history = all_boq_history.get(boq.boq_id)  # ✅ Uses pre-loaded dict instead of query

                    if history and history.receiver_role == 'site_engineer':
                        # Site engineer is the receiver - show as assigned/pending
                        project_status = 'assigned'
                        break

            # Calculate end_date from start_date and duration_days
            end_date = None
            if project.start_date and project.duration_days:
                from datetime import timedelta
                end_date = (project.start_date + timedelta(days=project.duration_days)).isoformat()

            # Check if BOQ has been assigned to a buyer using pre-loaded data (NO QUERY)
            boq_assigned_to_buyer = False
            assigned_buyer_name = None
            if boq_ids:
                for bid in boq_ids:
                    assignment = all_material_assignments.get(bid)  # ✅ Uses pre-loaded dict
                    if assignment:
                        boq_assigned_to_buyer = True
                        assigned_buyer_name = assignment.assigned_to_buyer_name
                        break

            # Calculate item assignment counts and collect assigned items details
            items_assigned_to_me = 0
            total_items = 0
            items_by_pm = {}
            assigned_items_details = []
            boqs_with_items = []

            # FIX: Define target_se_id at project loop level for consistency
            # Use effective_user_id when admin is viewing as SE, otherwise use user_id
            target_se_id = effective_user_id if is_admin_viewing and effective_user_id else user_id

            if boq_ids:
                # Get ALL assignments for these BOQs from pre-loaded data (NO QUERY)
                boq_assignments_list = []
                for bid in boq_ids:
                    boq_assignments_list.extend(all_pm_assign_ss.get(bid, []))

                for boq_id in boq_ids:
                    boq = next((b for b in boqs if b.boq_id == boq_id), None)
                    # Use pre-loaded relationship instead of querying (relationship name is 'details')
                    boq_details = boq.details[0] if boq and hasattr(boq, 'details') and boq.details and len(boq.details) > 0 else None
                    if boq_details and not boq_details.is_deleted and boq_details.boq_details:
                        items = boq_details.boq_details.get('items', [])
                        total_items += len(items)

                        # Get assignments from pre-loaded data (NO QUERY)
                        assignments = [pa for pa in all_pm_assign_ss.get(boq_id, [])
                                      if pa.assigned_to_se_id == target_se_id]  # Filter from pre-loaded data

                        # Collect items assigned to this SE for this BOQ
                        boq_assigned_items = []

                        # Get all assigned item indices for this SE from pm_assign_ss
                        # Build a map of index -> assignment for PM info lookup
                        assigned_indices = set()
                        index_to_assignment = {}
                        for assignment in assignments:
                            if assignment.item_indices:
                                for idx in assignment.item_indices:
                                    assigned_indices.add(idx)
                                    index_to_assignment[idx] = assignment

                        # Pre-load PM names for assignments
                        pm_ids = set(a.assigned_by_pm_id for a in assignments if a.assigned_by_pm_id)
                        pm_names_map = {}
                        if pm_ids:
                            pm_users = User.query.filter(User.user_id.in_(pm_ids)).all()
                            pm_names_map = {u.user_id: u.full_name for u in pm_users}

                        # Process assigned items
                        for idx in assigned_indices:
                            if idx < len(items):
                                item = items[idx]
                                items_assigned_to_me += 1

                                # Get PM info from the assignment record, not the item
                                assignment_for_idx = index_to_assignment.get(idx)
                                pm_user_id = assignment_for_idx.assigned_by_pm_id if assignment_for_idx else None
                                pm_name = pm_names_map.get(pm_user_id, 'Unknown') if pm_user_id else 'Unknown'
                                assignment_date = assignment_for_idx.assignment_date if assignment_for_idx else None
                                assignment_status = assignment_for_idx.assignment_status if assignment_for_idx else 'assigned'

                                # Group by PM
                                if pm_name not in items_by_pm:
                                    items_by_pm[pm_name] = {
                                        "pm_name": pm_name,
                                        "pm_user_id": pm_user_id,
                                        "items_count": 0
                                    }
                                items_by_pm[pm_name]["items_count"] += 1

                                # Add item details with full structure (excluding prices)
                                # Deep copy the item to avoid modifying the original
                                item_detail = copy.deepcopy(item)

                                # Remove price-related fields from main item
                                price_fields = ['rate', 'amount', 'unitRate', 'totalAmount', 'selling_price',
                                              'base_price', 'profit', 'overhead', 'gst', 'total_cost']
                                for field in price_fields:
                                    item_detail.pop(field, None)

                                # Remove price fields from sub_items if they exist
                                if 'sub_items' in item_detail and isinstance(item_detail['sub_items'], list):
                                    for sub_item in item_detail['sub_items']:
                                        if isinstance(sub_item, dict):
                                            for field in price_fields:
                                                sub_item.pop(field, None)

                                            # Remove price fields from materials in sub_items
                                            if 'materials' in sub_item and isinstance(sub_item['materials'], list):
                                                for material in sub_item['materials']:
                                                    if isinstance(material, dict):
                                                        for field in price_fields + ['unit_price', 'total_price']:
                                                            material.pop(field, None)

                                            # Remove price fields from labour in sub_items
                                            if 'labour' in sub_item and isinstance(sub_item['labour'], list):
                                                for labour in sub_item['labour']:
                                                    if isinstance(labour, dict):
                                                        for field in price_fields + ['wage_per_day', 'total_wage']:
                                                            labour.pop(field, None)

                                # Add assignment metadata from pm_assign_ss record
                                item_detail["item_index"] = idx
                                item_detail["assigned_by_pm_name"] = pm_name
                                item_detail["assigned_by_pm_user_id"] = pm_user_id
                                item_detail["assigned_to_se_name"] = current_user.get('full_name', 'Site Engineer')
                                item_detail["assigned_to_se_user_id"] = target_se_id
                                item_detail["assigned_by_role"] = 'projectManager'
                                item_detail["assignment_date"] = assignment_date.isoformat() if assignment_date else None
                                item_detail["assignment_status"] = assignment_status or 'assigned'

                                assigned_items_details.append(item_detail)
                                boq_assigned_items.append(item_detail)

                        # Add BOQ with its assigned items if any items are assigned
                        if boq_assigned_items:
                            boqs_with_items.append({
                                "boq_id": boq_id,
                                "boq_name": boq.boq_name if boq else f"BOQ-{boq_id}",
                                "items_count": len(boq_assigned_items),
                                "assigned_items": boq_assigned_items
                            })

            # Convert items_by_pm dict to list
            items_by_pm_list = list(items_by_pm.values())

            # Build areas structure for ExtraMaterialForm compatibility
            # Using floor_name as area (same structure as /api/projects/assigned-to-me)
            area_info = {
                "area_id": 1,  # Placeholder
                "area_name": project.floor_name or "Main Area",
                "boqs": []
            }

            # Add all BOQs to the area's boqs array using pre-loaded data (NO QUERY)
            for boq_id in boq_ids:
                boq = next((b for b in boqs if b.boq_id == boq_id), None)  # ✅ Uses pre-loaded list
                if boq:
                    area_info["boqs"].append({
                        "boq_id": boq.boq_id,
                        "boq_name": boq.boq_name or f"BOQ-{boq.boq_id}",
                        "items": []  # Items will be populated by ExtraMaterialForm if needed
                    })

            # Check if all SE's work has been PM-confirmed using pre-loaded data (NO QUERY)
            # Filter from pre-loaded data instead of querying
            # FIX: Use target_se_id for consistency with admin-viewing-as-SE feature
            project_assignments = all_pm_assign_ss_by_project.get(project.project_id, [])
            se_assignments = [a for a in project_assignments
                            if a.assigned_to_se_id == target_se_id and a.se_completion_requested]

            # SE's work is confirmed if ALL their requested assignments are PM-confirmed
            all_my_work_confirmed = all(a.pm_confirmed_completion for a in se_assignments) if se_assignments else False

            # Check if THIS SE has requested completion using pre-loaded data (NO QUERY)
            # Filter from pre-loaded data instead of querying
            my_se_assignments = [a for a in project_assignments if a.assigned_to_se_id == target_se_id]
            my_completion_requested = any(a.se_completion_requested for a in my_se_assignments)

            projects_list.append({
                "project_id": project.project_id,
                "project_name": project.project_name,
                "project_code": project.project_code if hasattr(project, 'project_code') else None,
                "client": project.client,
                "location": project.location,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "end_date": end_date,
                "duration_days": project.duration_days,
                "status": project_status,
                "description": project.description,
                "created_at": project.created_at.isoformat() if project.created_at else None,
                "priority": getattr(project, 'priority', 'medium'),
                "boq_ids": boq_ids,  # List of BOQ IDs for reference
                "completion_requested": project.completion_requested if project.completion_requested is not None else False,
                "my_completion_requested": my_completion_requested,  # SE-specific: did THIS SE request completion?
                "my_work_confirmed": all_my_work_confirmed,  # SE-specific confirmation status
                "boq_assigned_to_buyer": boq_assigned_to_buyer,
                "assigned_buyer_name": assigned_buyer_name,
                # Item assignment counts
                "items_assigned_to_me": items_assigned_to_me,
                "total_items": total_items,
                "items_by_pm": items_by_pm_list,
                # Detailed item information
                "assigned_items_details": assigned_items_details,  # All assigned items with full details
                "boqs_with_items": boqs_with_items,  # BOQs grouped with their assigned items
                # Areas structure for ExtraMaterialForm compatibility
                "areas": [area_info]
            })

        return jsonify({
            "success": True,
            "projects": projects_list,
            "total": len(projects_list)
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error fetching site engineer projects: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to fetch projects: {str(e)}",
            "error_type": type(e).__name__
        }), 500


def get_se_dashboard_analytics():
    """Get comprehensive dashboard analytics for Site Engineer

    Similar to admin analytics but filtered to SE's assigned projects/items only.
    Includes:
    - Project statistics with trends
    - BOQ item statistics with completion trends
    - Change request statistics with approval pipeline
    - Material delivery tracking
    - Performance metrics
    """
    try:
        from models.pm_assign_ss import PMAssignSS
        from models.change_request import ChangeRequest
        from models.boq import BOQ, BOQDetails
        from models.inventory import MaterialDeliveryNote
        from datetime import timedelta
        from sqlalchemy import func, case, desc, and_

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get period from query params (default 30 days) with input validation
        try:
            days = int(request.args.get('days', 30))
            days = max(1, min(days, 365))  # Clamp between 1 and 365
        except (ValueError, TypeError):
            days = 30
        period_start = datetime.utcnow() - timedelta(days=days)

        # Get effective user context (handles admin viewing as other roles)
        context = get_effective_user_context()
        effective_role = context.get('effective_role', user_role)
        is_admin_viewing = context.get('is_admin_viewing', False)
        effective_user_id = context.get('effective_user_id')

        # Determine target user ID for queries
        target_user_id = effective_user_id if (is_admin_viewing and effective_user_id) else user_id

        # ========== GET SE'S PROJECT IDS ==========
        all_project_ids = set()
        item_assignments = []

        if user_role == 'admin' and not is_admin_viewing:
            # Admin mode - sees all SE data
            item_assignments = PMAssignSS.query.filter(PMAssignSS.is_deleted == False).all()
            all_project_ids = {a.project_id for a in item_assignments if a.project_id}
            projects_from_table = Project.query.filter(
                Project.site_supervisor_id.isnot(None),
                Project.is_deleted == False
            ).all()
            all_project_ids.update(p.project_id for p in projects_from_table)
        else:
            # Regular SE - targeted queries for their assignments
            item_assignments = PMAssignSS.query.filter(
                PMAssignSS.assigned_to_se_id == target_user_id,
                PMAssignSS.is_deleted == False
            ).all()
            all_project_ids = {a.project_id for a in item_assignments if a.project_id}
            projects_from_table = Project.query.filter(
                Project.site_supervisor_id == target_user_id,
                Project.is_deleted == False
            ).all()
            all_project_ids.update(p.project_id for p in projects_from_table)

        project_ids_list = list(all_project_ids)

        # ========== PROJECT STATISTICS ==========
        projects = Project.query.filter(
            Project.project_id.in_(project_ids_list),
            Project.is_deleted == False
        ).all() if project_ids_list else []

        today = datetime.utcnow().date()
        week_from_now = today + timedelta(days=7)
        month_from_now = today + timedelta(days=30)

        project_stats = {
            'total': len(projects),
            'active': 0,
            'in_progress': 0,
            'completed': 0,
            'on_hold': 0,
            'new_in_period': 0,
            'status_breakdown': [],
            'deadline_breakdown': {
                'overdue': 0,
                'due_this_week': 0,
                'due_this_month': 0,
                'on_track': 0
            }
        }

        status_counts = {}
        for project in projects:
            status = (project.status or 'active').lower()
            status_counts[status] = status_counts.get(status, 0) + 1

            if status in ['active', 'assigned', 'pending', 'items_assigned', 'new']:
                project_stats['active'] += 1
            elif status in ['in_progress', 'ongoing', 'started', 'working']:
                project_stats['in_progress'] += 1
            elif status in ['completed', 'done', 'finished', 'closed']:
                project_stats['completed'] += 1
            elif status in ['on_hold', 'paused']:
                project_stats['on_hold'] += 1
            else:
                project_stats['active'] += 1

            # Count new projects in period
            if project.created_at and project.created_at >= period_start:
                project_stats['new_in_period'] += 1

            # Deadline analysis
            if project.start_date and project.duration_days:
                start = project.start_date if isinstance(project.start_date, datetime) else datetime.combine(project.start_date, datetime.min.time())
                end_date = (start + timedelta(days=project.duration_days)).date()
                if status not in ['completed', 'done', 'finished', 'closed']:
                    if end_date < today:
                        project_stats['deadline_breakdown']['overdue'] += 1
                    elif end_date <= week_from_now:
                        project_stats['deadline_breakdown']['due_this_week'] += 1
                    elif end_date <= month_from_now:
                        project_stats['deadline_breakdown']['due_this_month'] += 1
                    else:
                        project_stats['deadline_breakdown']['on_track'] += 1

        project_stats['status_breakdown'] = [{'status': k, 'count': v} for k, v in status_counts.items()]

        # ========== BOQ ITEM STATISTICS ==========
        item_stats = {
            'total_assigned': len(item_assignments),
            'pending': 0,
            'in_progress': 0,
            'completed': 0,
            'unique_boqs': len({a.boq_id for a in item_assignments if a.boq_id}),
            'status_breakdown': [],
            'completion_rate': 0
        }

        item_status_counts = {}
        for assignment in item_assignments:
            status = (assignment.assignment_status or 'assigned').lower()
            item_status_counts[status] = item_status_counts.get(status, 0) + 1

            if status in ['assigned', 'pending', 'not_started']:
                item_stats['pending'] += 1
            elif status in ['in_progress', 'started', 'working']:
                item_stats['in_progress'] += 1
            elif status in ['completed', 'done', 'finished']:
                item_stats['completed'] += 1

        item_stats['status_breakdown'] = [{'status': k, 'count': v} for k, v in item_status_counts.items()]
        if item_stats['total_assigned'] > 0:
            item_stats['completion_rate'] = round((item_stats['completed'] / item_stats['total_assigned']) * 100, 1)

        # ========== CHANGE REQUEST STATISTICS ==========
        cr_query = ChangeRequest.query.filter(
            ChangeRequest.requested_by_user_id == target_user_id,
            ChangeRequest.is_deleted == False
        ) if not (user_role == 'admin' and not is_admin_viewing) else ChangeRequest.query.filter(
            ChangeRequest.project_id.in_(project_ids_list),
            ChangeRequest.is_deleted == False
        )

        change_requests = cr_query.all()

        cr_stats = {
            'total': len(change_requests),
            'pending_pm_approval': 0,
            'pending_td_approval': 0,
            'approved': 0,
            'rejected': 0,
            'vendor_approved': 0,
            'purchase_completed': 0,
            'new_in_period': 0,
            'status_breakdown': [],
            'total_cost': 0,
            'avg_cost': 0
        }

        cr_status_counts = {}
        total_cost = 0
        cost_count = 0

        for cr in change_requests:
            status = (cr.status or 'pending').lower()
            cr_status_counts[status] = cr_status_counts.get(status, 0) + 1

            # Map to dashboard categories based on actual CR status values
            # Pending PM: pending, under_review, send_to_pm
            if status in ['pending', 'under_review', 'send_to_pm', 'send_to_mep']:
                cr_stats['pending_pm_approval'] += 1
            # Pending TD: pending_td_approval
            elif status in ['pending_td_approval']:
                cr_stats['pending_td_approval'] += 1
            # Approved: approved_by_pm, approved_by_td, send_to_est, send_to_buyer, assigned_to_buyer
            elif status in ['approved', 'approved_by_pm', 'approved_by_td', 'send_to_est', 'send_to_buyer', 'assigned_to_buyer']:
                cr_stats['approved'] += 1
            # Rejected
            elif status == 'rejected':
                cr_stats['rejected'] += 1
            # Vendor approved
            elif status == 'vendor_approved':
                cr_stats['vendor_approved'] += 1
            # Purchase completed / routed to store
            elif status in ['purchase_completed', 'routed_to_store']:
                cr_stats['purchase_completed'] += 1

            if cr.created_at and cr.created_at >= period_start:
                cr_stats['new_in_period'] += 1

            # Cost tracking - use materials_total_cost field
            if cr.materials_total_cost:
                total_cost += float(cr.materials_total_cost)
                cost_count += 1

        cr_stats['status_breakdown'] = [{'status': k, 'count': v} for k, v in cr_status_counts.items()]
        cr_stats['total_cost'] = round(total_cost, 2)
        cr_stats['avg_cost'] = round(total_cost / cost_count, 2) if cost_count > 0 else 0

        # ========== MATERIAL RECEIPT STATISTICS ==========
        # Tracks material delivery notes sent TO Site Engineer's projects
        delivery_stats = {
            'total': 0,
            'draft': 0,
            'issued': 0,
            'in_transit': 0,
            'delivered': 0,
            'received_in_period': 0,  # Receipts confirmed within the selected period
            'pending_receipt': 0,  # Awaiting SE confirmation (issued + in_transit)
            'status_breakdown': []
        }

        try:
            delivery_query = MaterialDeliveryNote.query.filter(
                MaterialDeliveryNote.project_id.in_(project_ids_list)
            ) if project_ids_list else None

            if delivery_query:
                deliveries = delivery_query.all()
                delivery_stats['total'] = len(deliveries)

                dn_status_counts = {}
                for dn in deliveries:
                    status = (dn.status or 'draft').upper()
                    dn_status_counts[status] = dn_status_counts.get(status, 0) + 1

                    if status == 'DRAFT':
                        delivery_stats['draft'] += 1
                    elif status == 'ISSUED':
                        delivery_stats['issued'] += 1
                        delivery_stats['pending_receipt'] += 1
                    elif status == 'IN_TRANSIT':
                        delivery_stats['in_transit'] += 1
                        delivery_stats['pending_receipt'] += 1
                    elif status in ['DELIVERED', 'PARTIAL']:
                        delivery_stats['delivered'] += 1
                        # Check if received within period
                        if dn.received_at and dn.received_at >= start_date:
                            delivery_stats['received_in_period'] += 1

                delivery_stats['status_breakdown'] = [{'status': k, 'count': v} for k, v in dn_status_counts.items()]
        except Exception as e:
            log.warning(f"Could not fetch delivery stats: {e}")

        # ========== TREND DATA (Last N days) - OPTIMIZED: Single query with GROUP BY ==========
        cr_trend = []

        try:
            from sqlalchemy import cast, Date as SQLDate

            # Calculate trend period (max 30 days for trend chart)
            trend_days = min(days, 30)
            trend_start = datetime.utcnow() - timedelta(days=trend_days)

            # Use same filter as CR stats - project-based for SE's assigned projects
            if project_ids_list:
                trend_query = db.session.query(
                    cast(ChangeRequest.created_at, SQLDate).label('date'),
                    func.count(ChangeRequest.cr_id).label('count')
                ).filter(
                    ChangeRequest.project_id.in_(project_ids_list),
                    ChangeRequest.created_at >= trend_start,
                    ChangeRequest.is_deleted == False
                ).group_by(cast(ChangeRequest.created_at, SQLDate)).all()

                # Convert to dict for O(1) lookups
                cr_trend_dict = {str(row.date): row.count for row in trend_query}

                # Build trend array with all days (fill missing days with 0)
                for i in range(trend_days - 1, -1, -1):
                    day = (datetime.utcnow() - timedelta(days=i)).date()
                    cr_trend.append({
                        'date': str(day),
                        'count': cr_trend_dict.get(str(day), 0)
                    })
        except Exception as e:
            log.warning(f"Could not build CR trend: {e}")

        # ========== PERFORMANCE METRICS ==========
        performance = {
            'project_completion_rate': 0,
            'item_completion_rate': item_stats['completion_rate'],
            'cr_approval_rate': 0,
            'avg_cr_processing_days': 0,
            'efficiency_score': 0
        }

        if project_stats['total'] > 0:
            performance['project_completion_rate'] = round(
                (project_stats['completed'] / project_stats['total']) * 100, 1
            )

        if cr_stats['total'] > 0:
            approved_count = cr_stats['approved'] + cr_stats['vendor_approved'] + cr_stats['purchase_completed']
            performance['cr_approval_rate'] = round(
                (approved_count / cr_stats['total']) * 100, 1
            )

        # Calculate efficiency score (weighted average)
        efficiency = (
            performance['project_completion_rate'] * 0.3 +
            performance['item_completion_rate'] * 0.4 +
            performance['cr_approval_rate'] * 0.3
        )
        performance['efficiency_score'] = round(efficiency, 1)

        # ========== LABOUR REQUISITION STATISTICS ==========
        labour_stats = {
            'total': 0,
            'pending': 0,
            'approved': 0,
            'rejected': 0,
            'assigned': 0,
            'total_workers_requested': 0,
            'status_breakdown': []
        }

        try:
            from models.labour_requisition import LabourRequisition
            from models.labour_arrival import LabourArrival

            labour_query = LabourRequisition.query.filter(
                LabourRequisition.project_id.in_(project_ids_list),
                LabourRequisition.is_deleted == False
            ) if project_ids_list else None

            if labour_query:
                labour_reqs = labour_query.all()
                labour_stats['total'] = len(labour_reqs)

                labour_status_counts = {}
                for req in labour_reqs:
                    status = (req.status or 'pending').lower()
                    labour_status_counts[status] = labour_status_counts.get(status, 0) + 1

                    if status == 'pending':
                        labour_stats['pending'] += 1
                    elif status == 'approved':
                        labour_stats['approved'] += 1
                    elif status == 'rejected':
                        labour_stats['rejected'] += 1

                    # Check assignment status
                    if req.assignment_status == 'assigned':
                        labour_stats['assigned'] += 1

                    # Count total workers requested
                    if req.labour_items:
                        for item in req.labour_items:
                            labour_stats['total_workers_requested'] += item.get('workers_count', 0)
                    elif req.workers_count:
                        labour_stats['total_workers_requested'] += req.workers_count

                labour_stats['status_breakdown'] = [{'status': k, 'count': v} for k, v in labour_status_counts.items()]

                # Get arrival stats for SE's projects
                arrivals = LabourArrival.query.filter(
                    LabourArrival.project_id.in_(project_ids_list),
                    LabourArrival.is_deleted == False
                ).all() if project_ids_list else []

                arrival_status_counts = {}
                for arrival in arrivals:
                    status = (arrival.arrival_status or 'assigned').lower()
                    arrival_status_counts[status] = arrival_status_counts.get(status, 0) + 1

                labour_stats['arrivals'] = {
                    'total': len(arrivals),
                    'confirmed': arrival_status_counts.get('confirmed', 0),
                    'no_show': arrival_status_counts.get('no_show', 0),
                    'departed': arrival_status_counts.get('departed', 0)
                }
        except Exception as e:
            log.warning(f"Could not fetch labour stats: {e}")
            labour_stats['arrivals'] = {'total': 0, 'confirmed': 0, 'no_show': 0, 'departed': 0}

        # ========== ASSET STATISTICS ==========
        asset_stats = {
            'total_dispatched': 0,
            'total_returned': 0,
            'pending_returns': 0,
            'at_site': 0,
            'delivery_notes': {'total': 0, 'draft': 0, 'issued': 0, 'in_transit': 0, 'delivered': 0},
            'return_notes': {'total': 0, 'draft': 0, 'issued': 0, 'in_transit': 0, 'received': 0}
        }

        try:
            from models.returnable_assets import AssetDeliveryNote, AssetReturnDeliveryNote, AssetReturnRequest

            # Asset Delivery Notes to SE's projects
            adn_query = AssetDeliveryNote.query.filter(
                AssetDeliveryNote.project_id.in_(project_ids_list)
            ) if project_ids_list else None

            if adn_query:
                adns = adn_query.all()
                asset_stats['delivery_notes']['total'] = len(adns)

                for adn in adns:
                    status = (adn.status or 'DRAFT').upper()
                    if status == 'DRAFT':
                        asset_stats['delivery_notes']['draft'] += 1
                    elif status == 'ISSUED':
                        asset_stats['delivery_notes']['issued'] += 1
                    elif status == 'IN_TRANSIT':
                        asset_stats['delivery_notes']['in_transit'] += 1
                    elif status in ['DELIVERED', 'PARTIAL']:
                        asset_stats['delivery_notes']['delivered'] += 1

                    # Count total items dispatched
                    if adn.items:
                        for item in adn.items:
                            asset_stats['total_dispatched'] += item.quantity or 1

            # Asset Return Delivery Notes from SE's projects
            ardn_query = AssetReturnDeliveryNote.query.filter(
                AssetReturnDeliveryNote.project_id.in_(project_ids_list)
            ) if project_ids_list else None

            if ardn_query:
                ardns = ardn_query.all()
                asset_stats['return_notes']['total'] = len(ardns)

                for ardn in ardns:
                    status = (ardn.status or 'DRAFT').upper()
                    if status == 'DRAFT':
                        asset_stats['return_notes']['draft'] += 1
                    elif status == 'ISSUED':
                        asset_stats['return_notes']['issued'] += 1
                    elif status == 'IN_TRANSIT':
                        asset_stats['return_notes']['in_transit'] += 1
                    elif status in ['RECEIVED', 'PROCESSED']:
                        asset_stats['return_notes']['received'] += 1

                    # Count total items returned
                    if ardn.items:
                        for item in ardn.items:
                            asset_stats['total_returned'] += item.quantity or 1

            # Pending return requests
            pending_returns = AssetReturnRequest.query.filter(
                AssetReturnRequest.project_id.in_(project_ids_list),
                AssetReturnRequest.status == 'pending'
            ).count() if project_ids_list else 0
            asset_stats['pending_returns'] = pending_returns

            # Calculate assets at site (dispatched - returned)
            asset_stats['at_site'] = max(0, asset_stats['total_dispatched'] - asset_stats['total_returned'])

        except Exception as e:
            log.warning(f"Could not fetch asset stats: {e}")

        # ========== WORKLOAD ANALYSIS ==========
        workload = {
            'pending_items': item_stats['pending'],
            'pending_crs': cr_stats['pending_pm_approval'] + cr_stats['pending_td_approval'],
            'overdue_projects': project_stats['deadline_breakdown']['overdue'],
            'urgent_items': project_stats['deadline_breakdown']['due_this_week'],
            'pending_labour': labour_stats['pending'],
            'pending_asset_returns': asset_stats['pending_returns'],
            'status': 'normal'
        }

        # Determine workload status
        if workload['overdue_projects'] > 0 or workload['pending_items'] > 20:
            workload['status'] = 'high'
        elif workload['urgent_items'] > 5 or workload['pending_items'] > 10:
            workload['status'] = 'moderate'

        return jsonify({
            'success': True,
            'period_days': days,
            'generated_at': datetime.utcnow().isoformat(),
            'projects': project_stats,
            'boq_items': item_stats,
            'change_requests': cr_stats,
            'deliveries': delivery_stats,
            'labour': labour_stats,
            'assets': asset_stats,
            'trends': {
                'cr_creation': cr_trend
            },
            'performance': performance,
            'workload': workload
        }), 200

    except Exception as e:
        import traceback
        log.error(f"Error fetching SE dashboard analytics: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': f"Failed to fetch analytics: {str(e)}"
        }), 500


def get_se_recent_activity():
    """Get recent activity for Site Engineer's projects

    Returns recent CRs, deliveries, and project updates
    """
    try:
        from models.pm_assign_ss import PMAssignSS
        from models.change_request import ChangeRequest
        from datetime import timedelta

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Input validation for limit parameter
        try:
            limit = int(request.args.get('limit', 20))
            limit = max(1, min(limit, 50))  # Clamp between 1 and 50
        except (ValueError, TypeError):
            limit = 20

        # Get effective user context
        context = get_effective_user_context()
        target_user_id = context.get('effective_user_id') or user_id

        activities = []

        # Get recent CRs created by this SE
        recent_crs = ChangeRequest.query.filter(
            ChangeRequest.requested_by_user_id == target_user_id,
            ChangeRequest.is_deleted == False
        ).order_by(ChangeRequest.created_at.desc()).limit(limit).all()

        for cr in recent_crs:
            activities.append({
                'id': f'cr_{cr.cr_id}',
                'type': 'change_request',
                'action': f"CR-{cr.cr_id} - {cr.status}",
                'details': cr.justification[:100] if cr.justification else 'Change Request',
                'timestamp': cr.created_at.isoformat() if cr.created_at else None,
                'status': cr.status,
                'project_id': cr.project_id
            })

        # Sort by timestamp
        activities.sort(key=lambda x: x['timestamp'] or '', reverse=True)

        return jsonify({
            'success': True,
            'activities': activities[:limit]
        }), 200

    except Exception as e:
        log.error(f"Error fetching SE recent activity: {str(e)}")
        return jsonify({
            'success': False,
            'error': f"Failed to fetch activity: {str(e)}"
        }), 500