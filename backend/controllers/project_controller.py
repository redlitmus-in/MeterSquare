"""
Project controller - handles CRUD operations for projects
"""

from flask import request, jsonify, g
from datetime import datetime, timedelta
from sqlalchemy import or_, func
from models.role import Role
from models.boq import *
from config.db import db
from models.project import Project
from models.user import User
from controllers.auth_controller import jwt_required
from config.logging import get_logger
from sqlalchemy.orm.attributes import flag_modified

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
            estimator_id=current_user.get('user_id'),
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
        current_user = getattr(g, 'user', None)
        user_id = current_user.get('user_id') if current_user else None
        user_role = current_user.get('role', '').lower() if current_user else ''
        user_name = current_user.get('full_name') or current_user.get('username') or 'Unknown' if current_user else 'Unknown'
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 10, type=int), 100)
        search = request.args.get('search', '')
        status = request.args.get('status', '')
        work_type = request.args.get('work_type', '')

        # Build query
        query = Project.query.filter_by(is_deleted=False,estimator_id=user_id)

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

def request_day_extension(boq_id):
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username') or 'User'
        user_role = current_user.get('role_name', 'user').lower()

        # Only PM can request day extension
        if user_role not in ['projectmanager', 'project_manager']:
            return jsonify({"error": "Only Project Managers can request day extensions"}), 403
        role=Role.query.filter_by(role='technicalDirector').first()
        user=User.query.filter_by(role_id=role.role_id).first()
        # Get request data
        data = request.get_json()
        additional_days = data.get('additional_days')
        reason = data.get('reason', '').strip()

        # Validation
        if not additional_days or additional_days <= 0:
            return jsonify({"error": "Additional days must be greater than 0"}), 400

        if not reason:
            return jsonify({"error": "Reason is required"}), 400

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get Project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Calculate dates
        original_duration = project.duration_days or 0
        new_duration = original_duration + additional_days

        original_end_date = project.end_date
        new_end_date = None

        if project.start_date:
            new_end_date = project.start_date + timedelta(days=new_duration)

        # Create action for BOQ history
        day_extension_action = {
            "type": "day_extension_requested",
            "role": "project_manager",
            "sender": user_name,
            "sender_role": "project_manager",
            "sender_user_id": user_id,
            "receiver": user.full_name,
            "receiver_role": "technical_director",
            "timestamp": datetime.utcnow().isoformat(),
            "project_id": project.project_id,
            "project_name": project.project_name,
            "boq_id": boq_id,
            "boq_name": boq.boq_name,
            "original_duration_days": original_duration,
            "requested_additional_days": additional_days,
            "new_duration_days": new_duration,
            "original_end_date": original_end_date.isoformat() if original_end_date else None,
            "new_end_date": new_end_date.isoformat() if new_end_date else None,
            "reason": reason,
            "status": "day_request_send_td"
        }
        # Save day extension request to BOQ (NOT history!)
        project.extension_days = additional_days
        project.extension_reason = reason
        project.extension_status = 'day_request_send_td'

        # Create history entry for audit purposes only
        boq_history = BOQHistory(
            boq_id=boq_id,
            action=[day_extension_action],
            action_by=user_name,
            boq_status=boq.status,
            sender=user_name,
            receiver="Technical Director",
            comments=f"Day extension requested: +{additional_days} days",
            sender_role=user_role,
            receiver_role='technical_director',
            action_date=datetime.utcnow(),
            created_by=user_name
        )
        db.session.add(boq_history)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": f"Day extension request sent to Technical Director for approval",
            "original_duration": original_duration,
            "requested_additional_days": additional_days,
            "new_duration": new_duration,
            "original_end_date": original_end_date.isoformat() if original_end_date else None,
            "new_end_date": new_end_date.isoformat() if new_end_date else None,
            "status": "day_request_send_td"
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error requesting day extension: {str(e)}")
        return jsonify({"error": str(e)}), 500

def edit_day_extension(boq_id):
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username') or 'User'
        user_role = current_user.get('role_name', 'user').lower()

        # Only TD can edit
        if user_role not in ['technicaldirector', 'technical_director']:
            return jsonify({"error": "Only Technical Director can edit day extensions"}), 403

        # Get request data
        data = request.get_json()
        edited_days = data.get('edited_days')
        td_comments = data.get('reason', '').strip()

        # Validation
        if not edited_days or edited_days <= 0:
            return jsonify({"error": "Edited days must be greater than 0"}), 400

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get Project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Check if already approved or rejected
        if project.extension_status not in ['day_request_send_td', 'day_edit_td']:
            return jsonify({"error": f"Request already {boq.pending_extension_status}"}), 400

        # Get original request data from BOQ
        original_requested_days = project.extension_days or 0
        original_duration = project.duration_days or 0

        # Calculate what the new duration would be (for preview only, not saved yet)
        preview_duration = original_duration + edited_days
        preview_end_date = None

        if project.start_date:
            preview_end_date = project.start_date + timedelta(days=preview_duration)

        # Update BOQ with edited days
        project.extension_days = edited_days
        project.extension_status = 'day_edit_td'

        db.session.commit()

        return jsonify({
            "success": True,
            "message": f"Day extension edited to {edited_days} days. Please review and approve.",
            "original_requested_days": original_requested_days,
            "edited_days": edited_days,
            "original_duration": original_duration,
            "preview_duration": preview_duration,
            "preview_end_date": preview_end_date.isoformat() if preview_end_date else None,
            "td_comments": td_comments,
            "status": "day_edit_td"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error editing day extension: {str(e)}")
        return jsonify({"error": str(e)}), 500

def approve_day_extension(boq_id):
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username') or 'User'
        user_role = current_user.get('role_name', 'user').lower()

        # Only TD can approve
        if user_role not in ['technicaldirector', 'technical_director']:
            return jsonify({"error": "Only Technical Director can approve day extensions"}), 403

        # Get request data
        data = request.get_json()
        approved_days = data.get('approved_days')
        td_comments = data.get('comments', '').strip()

        # Validation
        if not approved_days or approved_days <= 0:
            return jsonify({"error": "Approved days must be greater than 0"}), 400

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get Project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404
        # Check if already approved or rejected
        if project.extension_status not in ['day_request_send_td', 'day_edit_td']:
            return jsonify({"error": f"Request already {boq.pending_extension_status}"}), 400

        # Get original request data from BOQ
        original_requested_days = project.extension_days or 0
        original_duration = project.duration_days or 0

        # If request was edited, use edited days; otherwise use provided approved_days
        if project.extension_status == 'day_edit_td' and not approved_days:
            approved_days = project.extension_edited_days or original_requested_days

        # Calculate new totals
        final_duration = original_duration + approved_days

        original_end_date = project.end_date
        final_end_date = None

        if project.start_date:
            final_end_date = project.start_date + timedelta(days=final_duration)

        # Update BOQ to mark as approved and clear pending status
        boq.has_pending_day_extension = False
        boq.pending_extension_status = 'approved'

        # Update Project with approved days
        project.duration_days = final_duration
        if final_end_date:
            project.end_date = final_end_date
        project.extension_status = 'approved'
        project.last_modified_by = user_name
        project.last_modified_at = datetime.utcnow()

        # Create approval action
        approval_action = {
            "type": "day_extension_approved",
            "role": "technical_director",
            "sender": user_name,
            "sender_role": "technical_director",
            "sender_user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "project_id": project.project_id,
            "project_name": project.project_name,
            "boq_id": boq_id,
            "boq_name": boq.boq_name,
            "original_request_days": original_requested_days,
            "approved_days": approved_days,
            "td_modified": approved_days != original_requested_days,
            "td_comments": td_comments,
            "original_duration": original_duration,
            "final_duration_days": final_duration,
            "final_end_date": final_end_date.isoformat() if final_end_date else None,
            "status": "approved"
        }

        # Get or create BOQHistory entry
        history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        if history:
            # Update existing history with approval action
            if history.action is None:
                current_actions = []
            elif isinstance(history.action, list):
                current_actions = history.action
            elif isinstance(history.action, dict):
                current_actions = [history.action]
            else:
                current_actions = []

            current_actions.append(approval_action)
            history.action = current_actions
            flag_modified(history, "action")
            history.action_by = user_name
            history.boq_status = boq.status
            history.comments = f"Day extension approved: +{approved_days} days"
            history.action_date = datetime.utcnow()
            history.last_modified_by = user_name
            history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            history = BOQHistory(
                boq_id=boq_id,
                action=[approval_action],
                action_by=user_name,
                boq_status=boq.status,
                comments=f"Day extension approved: +{approved_days} days",
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(history)

        db.session.commit()

        return jsonify({
            "success": True,
            "message": f"Day extension approved: +{approved_days} days",
            "original_requested_days": original_requested_days,
            "approved_days": approved_days,
            "td_modified": approved_days != original_requested_days,
            "original_duration": original_duration,
            "final_duration": final_duration,
            "final_end_date": final_end_date.isoformat() if final_end_date else None,
            "td_comments": td_comments,
            "status": "approved"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving day extension: {str(e)}")
        return jsonify({"error": str(e)}), 500

def reject_day_extension(boq_id):
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_id = current_user.get('user_id')
        user_name = current_user.get('full_name') or current_user.get('username') or 'User'
        user_role = current_user.get('role_name', 'user').lower()

        # Only TD can reject
        if user_role not in ['technicaldirector', 'technical_director']:
            return jsonify({"error": "Only Technical Director can reject day extensions"}), 403

        # Get request data
        data = request.get_json()
        rejection_reason = data.get('rejection_reason', '').strip()

        # Validation
        if not rejection_reason:
            return jsonify({"error": "Rejection reason is required"}), 400

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get Project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Check if already approved or rejected
        if project.extension_status not in ['day_request_send_td', 'day_edit_td']:
            return jsonify({"error": f"Request already {project.extension_status}"}), 400

        # Get original request data from Project
        requested_days = project.extension_days or 0

        # Update BOQ to mark as rejected
        boq.has_pending_day_extension = False
        boq.pending_extension_status = 'rejected'

        # Update Project extension status
        project.extension_status = 'rejected'
        project.last_modified_by = user_name
        project.last_modified_at = datetime.utcnow()

        # Create rejection action
        rejection_action = {
            "type": "day_extension_rejected",
            "role": "technical_director",
            "sender": user_name,
            "sender_role": "technical_director",
            "sender_user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "project_id": project.project_id,
            "project_name": project.project_name,
            "boq_id": boq_id,
            "boq_name": boq.boq_name,
            "requested_days": requested_days,
            "rejection_reason": rejection_reason,
            "status": "rejected"
        }

        # Get or create BOQHistory entry
        history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        if history:
            # Update existing history with rejection action
            if history.action is None:
                current_actions = []
            elif isinstance(history.action, list):
                current_actions = history.action
            elif isinstance(history.action, dict):
                current_actions = [history.action]
            else:
                current_actions = []

            current_actions.append(rejection_action)
            history.action = current_actions
            flag_modified(history, "action")
            history.action_by = user_name
            history.boq_status = boq.status
            history.comments = f"Day extension rejected: {rejection_reason[:100]}"
            history.action_date = datetime.utcnow()
            history.last_modified_by = user_name
            history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            history = BOQHistory(
                boq_id=boq_id,
                action=[rejection_action],
                action_by=user_name,
                boq_status=boq.status,
                comments=f"Day extension rejected: {rejection_reason[:100]}",
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(history)

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Day extension request rejected",
            "requested_days": requested_days,
            "rejection_reason": rejection_reason,
            "status": "rejected"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting day extension: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_pending_day_extensions(boq_id):
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_role = current_user.get('role_name', 'user').lower()

        # Only Technical Director can view
        if user_role not in ['technicaldirector', 'technical_director']:
            return jsonify({"error": "Only Technical Director can view pending day extensions"}), 403

        # Get the base BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get associated project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # ✅ Get all projects with pending extension statuses
        pending_projects = Project.query.filter(
            Project.is_deleted == False,
            Project.extension_status.in_(['day_request_send_td', 'day_edit_td'])
        ).all()

        pending_extensions = []
        for proj in pending_projects:
            # Get all BOQs under this project
            project_boqs = BOQ.query.filter_by(project_id=proj.project_id, is_deleted=False).all()

            original_duration = proj.duration_days or 0
            requested_days = proj.extension_days or 0
            actual_days = requested_days

            new_duration = original_duration + actual_days

            # Calculate new end date
            new_end_date = None
            if proj.start_date:
                new_end_date = proj.start_date + timedelta(days=new_duration)

            # Get the first BOQ ID for the edit endpoint
            first_boq_id = project_boqs[0].boq_id if project_boqs else None

            extension_data = {
                "boq_id": first_boq_id,  # Add boq_id for frontend modal
                "project_id": proj.project_id,
                "project_name": proj.project_name,
                "boqs": [
                    {"boq_id": b.boq_id, "boq_name": b.boq_name} for b in project_boqs
                ],
                "original_duration": original_duration,
                "requested_days": requested_days,
                "edited_days": actual_days,
                "actual_days": actual_days,
                "new_duration": new_duration,
                "request_date": proj.last_modified_at,
                "requested_by": proj.last_modified_by,
                "original_end_date": proj.end_date.isoformat() if proj.end_date else None,
                "new_end_date": new_end_date.isoformat() if new_end_date else None,
                "reason": proj.extension_reason or 'No reason provided',
                "status": proj.extension_status,
                "is_edited": proj.extension_status == 'day_edit_td'
            }

            pending_extensions.append(extension_data)

        return jsonify({
            "success": True,
            "count": len(pending_extensions),
            "data": pending_extensions
        }), 200

    except Exception as e:
        log.error(f"Error getting pending day extensions for BOQ {boq_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500