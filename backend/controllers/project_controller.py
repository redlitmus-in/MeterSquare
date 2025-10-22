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
    Optional: description, location, client, work_type, start_date, duration_days, floor_name
    """
    try:
        data = request.get_json()
        current_user = g.get("user")

        # Validate required fields
        if not data.get('project_name'):
            return jsonify({
                "error": "Project name is required",
                "required_fields": ["project_name"],
                "optional_fields": ["description", "location", "client", "work_type", "start_date", "duration_days", "floor_name", "end_date", " area"]
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

        # Validate start_date if provided
        start_date = None
        if data.get('start_date'):
            try:
                start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
            except ValueError:
                return jsonify({"error": "Invalid start_date format. Use YYYY-MM-DD"}), 400

        # Validate duration_days if provided
        duration_days = None
        if data.get('duration_days'):
            try:
                duration_days = int(data['duration_days'])
                if duration_days <= 0:
                    return jsonify({"error": "Duration days must be greater than 0"}), 400
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid duration_days. Must be a positive integer"}), 400

        # Calculate end_date if start_date and duration_days are provided
        end_date = None
        if start_date and duration_days:
            from datetime import timedelta
            end_date = start_date + timedelta(days=duration_days)

        # Create new project
        new_project = Project(
            project_name=data['project_name'],
            description=data.get('description'),
            location=data.get('location'),
            client=data.get('client'),
            working_hours=data.get('working_hours'),
            work_type=data.get('work_type'),
            floor_name=data.get('floor_name'),
            area=data.get('area'),
            start_date=start_date,
            end_date=end_date,
            duration_days=duration_days,
            status=data.get('status', 'active'),
            completion_requested=False,
            user_id=None,  # PM will be assigned later by TD, not set on creation
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
            return jsonify({"project": []}), 200

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
            # Clear completion_requested flag when project is marked as completed
            if data['status'].lower() == 'completed':
                project.completion_requested = False

        # Handle dates
        if 'start_date' in data:
            if data['start_date']:
                try:
                    project.start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({"error": "Invalid start_date format. Use YYYY-MM-DD"}), 400
            else:
                project.start_date = None

        # Handle duration_days
        if 'duration_days' in data:
            if data['duration_days']:
                try:
                    duration_days = int(data['duration_days'])
                    if duration_days <= 0:
                        return jsonify({"error": "Duration days must be greater than 0"}), 400
                    project.duration_days = duration_days
                except (ValueError, TypeError):
                    return jsonify({"error": "Invalid duration_days. Must be a positive integer"}), 400
            else:
                project.duration_days = None

        # Recalculate end_date if start_date and duration_days are both present
        if project.start_date and project.duration_days:
            from datetime import timedelta
            project.end_date = project.start_date + timedelta(days=project.duration_days)
        elif not project.duration_days:
            project.end_date = None

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


def get_assigned_projects():
    """
    Get projects assigned to the current user with areas and BOQ structure (items + sub-items)
    Used for Change Requests dropdown flow
    """
    try:
        current_user = g.get("user")
        if not current_user:
            log.error("No user in g context")
            return jsonify({"error": "Authentication required"}), 401

        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')

        # Query projects based on role - Show active/assigned projects (not completed)
        if user_role in ['siteengineer', 'sitesupervisor', 'sitesupervisor']:
            # Get projects where user is assigned as site engineer/supervisor
            projects = Project.query.filter(
                Project.site_supervisor_id == user_id,
                Project.is_deleted == False,
                Project.status != 'completed'  # Exclude completed projects
            ).all()

        elif user_role in ['projectmanager']:
            # Get projects where user is assigned as project manager
            projects = Project.query.filter(
                Project.user_id == user_id,
                Project.is_deleted == False,
                Project.status != 'completed'  # Exclude completed projects
            ).all()
        else:
            return jsonify({"projects": []}), 200

        # Build response with BOQ structure
        projects_data = []
        for project in projects:
            project_info = {
                "project_id": project.project_id,
                "project_name": project.project_name,
                "project_status" : project.status,
                "areas": []
            }

            # Get areas for this project (using floor_name as area)
            # In a real implementation, you would have an Areas table
            # For now, using floor_name from project
            area_info = {
                "area_id": 1,  # Placeholder
                "area_name": project.floor_name or "Main Area",
                "boqs": []
            }

            # Get BOQs for this project
            from models.boq import BOQ, BOQDetails
            boqs = BOQ.query.filter_by(
                project_id=project.project_id,
                is_deleted=False
            ).all()

            for boq in boqs:
                boq_info = {
                    "boq_id": boq.boq_id,
                    "boq_name": boq.boq_name or f"BOQ-{boq.boq_id}",
                    "items": []
                }

                # Get BOQ details from related table
                boq_detail = BOQDetails.query.filter_by(
                    boq_id=boq.boq_id,
                    is_deleted=False
                ).first()

                # Parse BOQ details to get items and sub-items
                boq_details = boq_detail.boq_details if boq_detail else {}

                # Handle case where boq_details might be a string (JSON) instead of dict
                if isinstance(boq_details, str):
                    import json
                    try:
                        boq_details = json.loads(boq_details)
                    except json.JSONDecodeError:
                        log.warning(f"Failed to parse boq_details for BOQ {boq.boq_id}")
                        boq_details = {}

                items = boq_details.get('items', [])

                for idx, item in enumerate(items):
                    # Get item overhead amount
                    item_overhead = item.get('overhead_amount', 0)
                    if item_overhead == 0:
                        # Calculate from percentage if not stored
                        overhead_percentage = item.get('overhead_percentage', 10)
                        total_cost = item.get('total_cost', 0)
                        item_overhead = (total_cost * overhead_percentage) / 100

                    # Use master_item_id if available, otherwise use index
                    item_id = item.get('master_item_id', '')
                    if not item_id:
                        item_id = f"item_{boq.boq_id}_{idx + 1}"

                    # Calculate consumed overhead from approved change requests
                    from models.change_request import ChangeRequest
                    from sqlalchemy import or_
                    consumed_overhead = 0.0

                    # Special handling for items created by change requests
                    if 'Extra Materials - CR #' in item.get('item_name', ''):
                        # This is an item created by a change request
                        # For these items, consumed overhead should be 0 since the item itself represents the consumption
                        consumed_overhead = 0.0
                        print(f"Item '{item.get('item_name', '')}' is from a CR, consumed=0")

                    else:
                        # Get approved change requests for this specific item only
                        approved_crs = ChangeRequest.query.filter(
                            ChangeRequest.boq_id == boq.boq_id,
                            ChangeRequest.status == 'approved',
                            ChangeRequest.is_deleted == False
                        ).all()

                        print(f"Item {item_id} ({item.get('item_name', '')}): Found {len(approved_crs)} approved CRs")

                        for cr in approved_crs:
                            # Sum up the overhead consumed from each approved change request
                            cr_overhead = cr.overhead_consumed if cr.overhead_consumed else 0.0
                            consumed_overhead += cr_overhead
                            print(f"  CR#{cr.cr_id}: overhead={cr_overhead}, total={consumed_overhead}")
                    # Calculate available overhead
                    available_overhead = item_overhead - consumed_overhead

                    item_info = {
                        "item_id": str(item_id),
                        "item_name": item.get('item_name', ''),
                        "overhead_allocated": round(item_overhead, 2),
                        "overhead_consumed": round(consumed_overhead, 2),
                        "overhead_available": round(available_overhead, 2),
                        "sub_items": []
                    }

                    # Check if item has sub_items (newer BOQ structure with sub-items)
                    sub_items = item.get('sub_items', [])
                    if sub_items:
                        # Return sub-items as actual sub-items, each with their materials
                        print(f"DEBUG: Item '{item.get('item_name', '')}' has {len(sub_items)} sub-items")
                        for sub_item_idx, sub_item in enumerate(sub_items):
                            # Generate sub-item ID
                            sub_item_id = f"subitem_{boq.boq_id}_{idx + 1}_{sub_item_idx + 1}"

                            # Extract materials for this sub-item
                            materials = sub_item.get('materials', [])
                            materials_list = []

                            for mat_idx, material in enumerate(materials):
                                # Use master_material_id if available, otherwise generate one
                                material_id = material.get('master_material_id', '')
                                if not material_id:
                                    material_id = f"mat_{boq.boq_id}_{idx + 1}_{sub_item_idx + 1}_{mat_idx + 1}"

                                material_info = {
                                    "material_id": str(material_id),
                                    "material_name": material.get('material_name', ''),
                                    "unit": material.get('unit', ''),
                                    "unit_price": material.get('unit_price', 0),
                                    "quantity": material.get('quantity', 0)
                                }
                                materials_list.append(material_info)

                            sub_item_info = {
                                "sub_item_id": sub_item_id,
                                "sub_item_name": sub_item.get('sub_item_name', ''),
                                "materials": materials_list
                            }
                            print(f"DEBUG: Adding sub-item '{sub_item.get('sub_item_name', '')}' with {len(materials_list)} materials")
                            item_info["sub_items"].append(sub_item_info)
                    else:
                        # Fallback: for items without sub_items, treat materials as direct sub-items
                        materials = item.get('materials', [])
                        print(f"DEBUG: Item '{item.get('item_name', '')}' has {len(materials)} materials (no sub-items)")
                        for mat_idx, material in enumerate(materials):
                            # Use master_material_id if available, otherwise generate one
                            material_id = material.get('master_material_id', '')
                            if not material_id:
                                material_id = f"mat_{boq.boq_id}_{idx + 1}_{mat_idx + 1}"

                            # Create a pseudo sub-item for this material
                            sub_item_info = {
                                "sub_item_id": f"subitem_{boq.boq_id}_{idx + 1}_{mat_idx + 1}",
                                "sub_item_name": material.get('material_name', ''),
                                "materials": [{
                                    "material_id": str(material_id),
                                    "material_name": material.get('material_name', ''),
                                    "unit": material.get('unit', ''),
                                    "unit_price": material.get('unit_price', 0),
                                    "quantity": material.get('quantity', 0)
                                }]
                            }
                            item_info["sub_items"].append(sub_item_info)

                    boq_info["items"].append(item_info)

                area_info["boqs"].append(boq_info)

            if area_info["boqs"]:  # Only add area if it has BOQs
                project_info["areas"].append(area_info)

            if project_info["areas"]:  # Only add project if it has areas with BOQs
                projects_data.append(project_info)

        return jsonify({"projects": projects_data}), 200

    except AttributeError as e:
        log.error(f"Attribute error in get_assigned_projects: {str(e)}")
        if 'project_name' in str(e):
            return jsonify({
                "error": "Project reference configuration error. Please contact support.",
                "details": "BOQ model does not have direct project_name field"
            }), 500
        return jsonify({"error": f"Data access error: {str(e)}"}), 500
    except Exception as e:
        log.error(f"Error getting assigned projects: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": "Failed to get assigned projects",
            "details": str(e) if g.get('debug_mode') else "An internal error occurred"
        }), 500