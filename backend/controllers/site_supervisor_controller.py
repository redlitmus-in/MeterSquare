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

        # Get all projects assigned to this site engineer
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

            projects_list.append({
                "project_id": project.project_id,
                "project_name": project.project_name,
                "client": project.client,
                "location": project.location,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "end_date": project.end_date.isoformat() if project.end_date else None,
                "status": project_status,
                "description": project.description,
                "created_at": project.created_at.isoformat() if project.created_at else None,
                "priority": getattr(project, 'priority', 'medium'),
                "boq_ids": boq_ids  # List of BOQ IDs for reference
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

        # Get all projects assigned to this site engineer
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
            # Fetch all projects assigned to this sitesupervisor
            projects = Project.query.filter_by(site_supervisor_id=sitesupervisor.user_id).all()

            if projects and len(projects) > 0:
                # Add each project under assigned list
                for project in projects:
                    assigned_list.append({
                        "user_id": sitesupervisor.user_id,
                        "sitesupervisor_name": sitesupervisor.full_name,
                        "email": sitesupervisor.email,
                        "phone": sitesupervisor.phone,
                        "project_id": project.project_id,
                        "project_name": project.project_name if hasattr(project, "project_name") else None
                    })
            else:
                # sitesupervisor without project assignment
                unassigned_list.append({
                    "user_id": sitesupervisor.user_id,
                    "sitesupervisor_name": sitesupervisor.full_name,
                    "email": sitesupervisor.email,
                    "phone": sitesupervisor.phone,
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
        project_ids = data.get("project_ids")  # list of project IDs

        if not site_supervisor_id or not project_ids:
            return jsonify({"error": "site_supervisor_id and project_ids are required"}), 400

        # Validate user
        user = User.query.filter_by(user_id=site_supervisor_id).first()
        if not user:
            return jsonify({"error": "siteEngineer not found"}), 404

        # Get current user (Project Manager)
        current_user = getattr(g, 'user', None)
        pm_name = current_user.get('full_name', 'Project Manager') if current_user else 'Project Manager'
        pm_id = current_user.get('user_id') if current_user else None

        assigned_projects = []
        projects_data_for_email = []
        boq_histories_updated = 0

        for pid in project_ids:
            project = Project.query.filter_by(project_id=pid).first()
            if project:
                project.site_supervisor_id = site_supervisor_id
                project.last_modified_at = datetime.utcnow()
                project.last_modified_by = pm_name

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
                    new_action = {
                        "role": "project_manager",
                        "type": "assigned_site_engineer",
                        "sender": "project_manager",
                        "receiver": "site_engineer",
                        "status": "SE_Assigned",
                        "boq_name": boq.boq_name,
                        "comments": f"Site Engineer {user.full_name} assigned to project",
                        "timestamp": datetime.utcnow().isoformat(),
                        "sender_name": pm_name,
                        "sender_user_id": pm_id,
                        "project_name": project.project_name,
                        "project_id": project.project_id,
                        "assigned_se_name": user.full_name,
                        "assigned_se_user_id": user.user_id,
                        "assigned_se_email": user.email
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
                        existing_history.comments = f"Site Engineer {user.full_name} assigned to project"
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
                            comments=f"Site Engineer {user.full_name} assigned to project",
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
        email_sent = False
        if user.email and projects_data_for_email:
            try:
                email_service = BOQEmailService()
                email_sent = email_service.send_se_assignment_notification(
                    se_email=user.email,
                    se_name=user.full_name,
                    pm_name=pm_name,
                    projects_data=projects_data_for_email
                )

                if email_sent:
                    log.info(f"Assignment notification email sent successfully to {user.email}")
                else:
                    log.warning(f"Failed to send assignment notification email to {user.email}")
            except Exception as email_error:
                log.error(f"Error sending assignment notification email: {email_error}")
                # Don't fail the entire request if email fails
                import traceback
                log.error(f"Email error traceback: {traceback.format_exc()}")

        return jsonify({
            "success": True,
            "message": "Projects assigned to Site Engineer successfully",
            "assigned_sitesupervisor": {
                "site_supervisor_id": user.user_id,
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
