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
        current_user = g.user
        user_id = current_user['user_id']

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 10, type=int), 100)

        # Get all projects assigned to this project manager
        assigned_projects = db.session.query(Project.project_id).filter(
            Project.user_id == user_id,
            Project.is_deleted == False
        ).all()
        # Extract project IDs
        project_ids = [p.project_id for p in assigned_projects]
        # Build query - get all BOQs for assigned projects
        query = db.session.query(BOQ).filter(
            BOQ.is_deleted == False,
            BOQ.email_sent == True,
            BOQ.project_id.in_(project_ids)
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
                project_details = {
                    "project_id": boq.project.project_id,
                    "project_name": boq.project.project_name,
                    "user_id": boq.project.user_id,
                    "user_name": pm_name,
                    "site_supervisor_id": boq.project.site_supervisor_id,
                    "location": boq.project.location,
                    "area": boq.project.area,
                    "floor_name": boq.project.floor_name,
                    "working_hours": boq.project.working_hours,
                    "client": boq.project.client,
                    "site_supervisor_id": boq.project.site_supervisor_id if boq.project else None,
                    "work_type": boq.project.work_type,
                    "start_date": boq.project.start_date.isoformat() if boq.project.start_date else None,
                    "end_date": boq.project.end_date.isoformat() if boq.project.end_date else None,
                    "project_status": boq.project.status,
                    "project_manager_status": pm_status,
                    "description": boq.project.description,
                    "created_at": boq.project.created_at.isoformat() if boq.project.created_at else None,
                    "created_by": boq.project.created_by,
                    "last_modified_at": boq.project.last_modified_at.isoformat() if boq.project.last_modified_at else None,
                    "last_modified_by": boq.project.last_modified_by
                }

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
                "project_details": project_details  # Complete project information
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
        role = Role.query.filter_by(role='projectManager').first()
        if not role:
            return jsonify({"error": "Role 'projectManager' not found"}), 404

        get_pms = User.query.filter_by(role_id=role.role_id,is_deleted=False).all()
        assigned_list = []
        unassigned_list = []

        for pm in get_pms:
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

        assigned_projects = []
        for pid in project_ids:
            project = Project.query.filter_by(project_id=pid).first()
            if project:
                project.user_id = user_id
                assigned_projects.append({
                    "project_id": project.project_id,
                    "project_name": getattr(project, "project_name", None)
                })

        db.session.commit()

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
            "assigned_count": len(assigned_projects)
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        log.error(f"Error assigning projects: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            "error": f"Failed to assign projects: {str(e)}",
            "error_type": type(e).__name__
        }), 500