"""
Project controller - handles CRUD operations for projects
"""

from flask import request, jsonify, g
from datetime import datetime
from sqlalchemy import or_, func
from config.db import db
from models.project import Project
from models.user import User
from controllers.auth_controller import jwt_required
from config.logging import get_logger

log = get_logger()


def create_project():
    """
    Create a new project with validation for required and optional fields
    Required: project_name
    Optional: description, location, client, work_type, start_date, end_date, floor_name
    """
    try:
        data = request.get_json()
        current_user = g.get("user")

        # Validate required fields
        if not data.get('project_name'):
            return jsonify({
                "error": "Project name is required",
                "required_fields": ["project_name"],
                "optional_fields": ["description", "location", "client", "work_type", "start_date", "end_date", "floor_name"]
            }), 400

        # Validate project name length
        if len(data.get('project_name', '')) > 255:
            return jsonify({"error": "Project name must be less than 255 characters"}), 400

        # Check for duplicate project name
        existing_project = Project.query.filter_by(
            project_name=data['project_name'],
            is_deleted=False
        ).first()

        if existing_project:
            return jsonify({"error": f"Project with name '{data['project_name']}' already exists"}), 409

        # Validate dates if provided
        start_date = None
        end_date = None

        if data.get('start_date'):
            try:
                start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({"error": "Invalid start_date format. Use YYYY-MM-DD"}), 400

        if data.get('end_date'):
            try:
                end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({"error": "Invalid end_date format. Use YYYY-MM-DD"}), 400

        # Validate date range if both dates provided
        if start_date and end_date:
            if start_date > end_date:
                return jsonify({"error": "Start date cannot be after end date"}), 400

        # Create new project
        new_project = Project(
            project_name=data['project_name'],
            description=data.get('description'),
            location=data.get('location'),
            client=data.get('client'),
            working_hours=data.get('working_hours'),
            work_type=data.get('work_type'),
            floor_name=data.get('floor_name'),
            start_date=start_date,
            end_date=end_date,
            status=data.get('status', 'active'),
            user_id=current_user.get('user_id'),
            created_by=current_user.get('email'),
            created_at=datetime.utcnow(),
            is_deleted=False
        )

        db.session.add(new_project)
        db.session.commit()

        return jsonify({
            "message": "Project created successfully",
            "project": new_project.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating project: {str(e)}")
        return jsonify({"error": f"Failed to create project: {str(e)}"}), 500

def get_all_projects():
    """
    Get all projects with optional filtering and pagination
    Query params:
    - page: page number (default 1)
    - per_page: items per page (default 10, max 100)
    - search: search term for project name, client, or location
    - status: filter by status
    - work_type: filter by work type
    """
    try:
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 10, type=int), 100)
        search = request.args.get('search', '')
        status = request.args.get('status', '')
        work_type = request.args.get('work_type', '')

        # Build query
        query = Project.query.filter_by(is_deleted=False)

        # Apply filters
        if search:
            search_filter = f"%{search}%"
            query = query.filter(
                or_(
                    Project.project_name.ilike(search_filter),
                    Project.client.ilike(search_filter),
                    Project.location.ilike(search_filter),
                    Project.description.ilike(search_filter)
                )
            )

        if status:
            query = query.filter(func.lower(Project.status) == status.lower())

        if work_type:
            query = query.filter(func.lower(Project.work_type) == work_type.lower())

        # Order by most recent first
        query = query.order_by(Project.created_at.desc())

        # Paginate
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        projects = [project.to_dict() for project in paginated.items]

        return jsonify({
            "projects": projects,
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
        log.error(f"Error fetching projects: {str(e)}")
        return jsonify({"error": f"Failed to fetch projects: {str(e)}"}), 500

def get_project_by_id(project_id):
    """
    Get a single project by ID
    """
    try:
        project = Project.query.filter_by(
            project_id=project_id,
            is_deleted=False
        ).first()

        if not project:
            return jsonify({"error": "Project not found"}), 404

        return jsonify({
            "project": project.to_dict()
        }), 200

    except Exception as e:
        log.error(f"Error fetching project {project_id}: {str(e)}")
        return jsonify({"error": f"Failed to fetch project: {str(e)}"}), 500

def update_project(project_id):
    """
    Update an existing project
    All fields are optional for update
    """
    try:
        data = request.get_json()
        current_user = g.get("user")

        # Find project
        project = Project.query.filter_by(
            project_id=project_id,
            is_deleted=False
        ).first()

        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Update fields if provided
        if 'project_name' in data:
            if not data['project_name']:
                return jsonify({"error": "Project name cannot be empty"}), 400

            # Check for duplicate name (excluding current project)
            duplicate = Project.query.filter(
                Project.project_name == data['project_name'],
                Project.project_id != project_id,
                Project.is_deleted == False
            ).first()

            if duplicate:
                return jsonify({"error": f"Project with name '{data['project_name']}' already exists"}), 409

            project.project_name = data['project_name']

        if 'description' in data:
            project.description = data['description']

        if 'location' in data:
            project.location = data['location']

        if 'client' in data:
            project.client = data['client']

        if 'work_type' in data:
            project.work_type = data['work_type']

        if 'floor_name' in data:
            project.floor_name = data['floor_name']

        if 'status' in data:
            project.status = data['status']

        # Handle dates
        if 'start_date' in data:
            if data['start_date']:
                try:
                    project.start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({"error": "Invalid start_date format. Use YYYY-MM-DD"}), 400
            else:
                project.start_date = None

        if 'end_date' in data:
            if data['end_date']:
                try:
                    project.end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({"error": "Invalid end_date format. Use YYYY-MM-DD"}), 400
            else:
                project.end_date = None

        # Validate date range if both dates exist
        if project.start_date and project.end_date:
            if project.start_date > project.end_date:
                return jsonify({"error": "Start date cannot be after end date"}), 400

        # Update modification info
        project.last_modified_at = datetime.utcnow()
        project.last_modified_by = current_user.get('email')

        db.session.commit()

        return jsonify({
            "message": "Project updated successfully",
            "project": project.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating project {project_id}: {str(e)}")
        return jsonify({"error": f"Failed to update project: {str(e)}"}), 500

def delete_project(project_id):
    """
    Soft delete a project (mark as deleted)
    """
    try:
        current_user = g.get("user")

        # Find project
        project = Project.query.filter_by(
            project_id=project_id,
            is_deleted=False
        ).first()

        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Soft delete
        project.is_deleted = True
        project.last_modified_at = datetime.utcnow()
        project.last_modified_by = current_user.get('email')

        db.session.commit()

        return jsonify({
            "message": "Project deleted successfully",
            "project_id": project_id
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting project {project_id}: {str(e)}")
        return jsonify({"error": f"Failed to delete project: {str(e)}"}), 500

def restore_project(project_id):
    """
    Restore a soft-deleted project
    """
    try:
        current_user = g.get("user")

        # Find deleted project
        project = Project.query.filter_by(
            project_id=project_id,
            is_deleted=True
        ).first()

        if not project:
            return jsonify({"error": "Deleted project not found"}), 404

        # Restore project
        project.is_deleted = False
        project.last_modified_at = datetime.utcnow()
        project.last_modified_by = current_user.get('email')

        db.session.commit()

        return jsonify({
            "message": "Project restored successfully",
            "project": project.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error restoring project {project_id}: {str(e)}")
        return jsonify({"error": f"Failed to restore project: {str(e)}"}), 500

def get_project_statistics():
    """
    Get project statistics and summary
    """
    try:
        # Get total projects
        total_projects = Project.query.filter_by(is_deleted=False).count()

        # Get projects by status
        status_stats = db.session.query(
            Project.status,
            func.count(Project.project_id).label('count')
        ).filter_by(
            is_deleted=False
        ).group_by(
            Project.status
        ).all()

        # Get projects by work type
        work_type_stats = db.session.query(
            Project.work_type,
            func.count(Project.project_id).label('count')
        ).filter(
            Project.is_deleted == False,
            Project.work_type.isnot(None)
        ).group_by(
            Project.work_type
        ).all()

        # Get active projects (with dates)
        active_projects = Project.query.filter(
            Project.is_deleted == False,
            Project.start_date <= datetime.now().date(),
            Project.end_date >= datetime.now().date()
        ).count()

        # Get upcoming projects
        upcoming_projects = Project.query.filter(
            Project.is_deleted == False,
            Project.start_date > datetime.now().date()
        ).count()

        # Get completed projects
        completed_projects = Project.query.filter(
            Project.is_deleted == False,
            Project.end_date < datetime.now().date()
        ).count()

        return jsonify({
            "statistics": {
                "total_projects": total_projects,
                "active_projects": active_projects,
                "upcoming_projects": upcoming_projects,
                "completed_projects": completed_projects,
                "by_status": {stat.status: stat.count for stat in status_stats},
                "by_work_type": {stat.work_type: stat.count for stat in work_type_stats}
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching project statistics: {str(e)}")
        return jsonify({"error": f"Failed to fetch statistics: {str(e)}"}), 500