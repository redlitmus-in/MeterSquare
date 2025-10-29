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
from utils.admin_viewing_context import get_effective_user_context, should_apply_role_filter

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

def get_all_sitesupervisor_boqs():
    """Get all projects with their BOQ IDs for the Site Engineer"""
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get effective user context (handles admin viewing as other roles)
        context = get_effective_user_context()

        # Get all projects assigned to this site engineer (admin sees all)
        if user_role == 'admin' or not should_apply_role_filter(context):
            projects = Project.query.filter(
                Project.is_deleted == False
            ).all()
        else:
            projects = Project.query.filter(
                Project.site_supervisor_id == user_id,
                Project.is_deleted == False
            ).all()

        projects_list = []
        for project in projects:
            # Get all BOQs for this project
            boqs = BOQ.query.filter(
                BOQ.project_id == project.project_id,
                BOQ.is_deleted == False,
                BOQ.email_sent == True
            ).all()

            # Collect BOQ IDs for this project
            boq_ids = [boq.boq_id for boq in boqs]

            # Determine project status from BOQ history
            project_status = project.status or 'assigned'

            # Check if any BOQs exist and have history
            if boqs:
                for boq in boqs:
                    history = BOQHistory.query.filter_by(
                        boq_id=boq.boq_id
                    ).order_by(BOQHistory.action_date.desc()).first()

                    if history and history.receiver_role == 'site_engineer':
                        # Site engineer is the receiver - show as assigned/pending
                        project_status = 'assigned'
                        break

            # Calculate end_date from start_date and duration_days
            end_date = None
            if project.start_date and project.duration_days:
                from datetime import timedelta
                end_date = (project.start_date + timedelta(days=project.duration_days)).isoformat()

            # Check if BOQ has been assigned to a buyer
            boq_assigned_to_buyer = False
            assigned_buyer_name = None
            if boq_ids:
                from models.boq_material_assignment import BOQMaterialAssignment
                assignment = BOQMaterialAssignment.query.filter(
                    BOQMaterialAssignment.boq_id.in_(boq_ids),
                    BOQMaterialAssignment.is_deleted == False
                ).first()

                if assignment:
                    boq_assigned_to_buyer = True
                    assigned_buyer_name = assignment.assigned_to_buyer_name

            projects_list.append({
                "project_id": project.project_id,
                "project_name": project.project_name,
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
                "boq_assigned_to_buyer": boq_assigned_to_buyer,
                "assigned_buyer_name": assigned_buyer_name
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

def get_sitesupervisor_dashboard():
    """Get dashboard statistics for Site Engineer"""
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get effective user context (handles admin viewing as other roles)
        context = get_effective_user_context()

        # Get all projects assigned to this site engineer (admin sees all)
        if user_role == 'admin' or not should_apply_role_filter(context):
            projects = Project.query.filter(
                Project.is_deleted == False
            ).all()
        else:
            projects = Project.query.filter(
                Project.site_supervisor_id == user_id,
                Project.is_deleted == False
            ).all()

        # Count projects by status
        total_projects = len(projects)
        assigned_projects = 0
        ongoing_projects = 0
        completed_projects = 0

        for project in projects:
            status = (project.status or '').lower()
            if status in ['assigned', 'pending']:
                assigned_projects += 1
            elif status in ['in_progress', 'active']:
                ongoing_projects += 1
            elif status == 'completed':
                completed_projects += 1
            else:
                assigned_projects += 1  # Default to assigned

        return jsonify({
            "success": True,
            "stats": {
                "total_projects": total_projects,
                "assigned_projects": assigned_projects,
                "ongoing_projects": ongoing_projects,
                "completed_projects": completed_projects
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching dashboard stats: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to fetch dashboard stats: {str(e)}"
        }), 500

def get_all_sitesupervisor():
    try:
        role = Role.query.filter_by(role='siteEngineer').first()
        if not role:
            return jsonify({"error": "Role 'siteEngineer' not found"}), 404

        get_sitesupervisors = User.query.filter_by(role_id=role.role_id,is_deleted=False).all()
        assigned_list = []
        unassigned_list = []

        for sitesupervisor in get_sitesupervisors:
            # Fetch all projects assigned to this sitesupervisor (exclude deleted)
            all_projects = Project.query.filter_by(site_supervisor_id=sitesupervisor.user_id, is_deleted=False).all()

            # Separate ongoing and completed projects
            ongoing_projects = []
            completed_projects = []

            for project in all_projects:
                project_status = (project.status or '').lower()
                project_data = {
                    "project_id": project.project_id,
                    "project_name": project.project_name if hasattr(project, "project_name") else None,
                    "status": project.status
                }

                if project_status == 'completed':
                    completed_projects.append(project_data)
                else:
                    ongoing_projects.append(project_data)

            # Combine all projects for display (ongoing first, then completed)
            all_project_list = ongoing_projects + completed_projects

            # Count only ongoing projects for assignment limit
            ongoing_count = len(ongoing_projects)

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
                    "completed_projects_count": len(completed_projects)
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
                    "completed_projects_count": 0
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

        for pid in project_ids:
            project = Project.query.filter_by(project_id=pid).first()
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

                # Find BOQs associated with this project
                boqs = BOQ.query.filter_by(project_id=pid, is_deleted=False).all()

                for boq in boqs:
                    # Get existing BOQ history
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

        # Send email notification to Buyer (if assigned)
        buyer_email_sent = False
        if buyer_user and buyer_user.email and projects_data_for_buyer_email:
            try:
                email_service = BOQEmailService()
                buyer_email_sent = email_service.send_buyer_assignment_notification(
                    buyer_email=buyer_user.email,
                    buyer_name=buyer_user.full_name,
                    pm_name=pm_name,
                    projects_data=projects_data_for_buyer_email
                )

                if buyer_email_sent:
                    log.info(f"Buyer assignment notification email sent successfully to {buyer_user.email}")
                else:
                    log.warning(f"Failed to send buyer assignment notification email to {buyer_user.email}")
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

def request_project_completion(project_id):
    """Site Engineer requests project completion - sends notification to PM"""
    try:
        current_user = g.user
        user_id = current_user['user_id']
        se_name = current_user.get('full_name', 'Site Engineer')

        # Get the project
        project = Project.query.filter_by(
            project_id=project_id,
            site_supervisor_id=user_id,
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

        # Get BOQ and BOQ history
        boq = BOQ.query.filter_by(project_id=project_id, is_deleted=False).first()
        boq = BOQ.query.filter_by(project_id=project_id, is_deleted=False).first()
        boq_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).first()

        if not boq:
            return jsonify({
                "error": "BOQ not found for this project"
            }), 404

        boq_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).order_by(BOQHistory.action_date.desc()).first()

        # Get Project Manager details
        pm_user = User.query.filter_by(user_id=project.user_id).first()
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

        # Set completion_requested flag
        project.completion_requested = True
        project.last_modified_at = datetime.utcnow()
        project.last_modified_by = se_name
        boq.status = "completed"
        boq_history.boq_status = "completed"

        db.session.commit()

        log.info(f"Site Engineer {user_id} requested completion for project {project_id}")

        return jsonify({
            "success": True,
            "message": "Completion request sent to Project Manager",
            "project_id": project_id,
            "completion_requested": True
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
