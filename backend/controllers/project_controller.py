"""
Project controller - handles CRUD operations for projects
"""

from flask import request, jsonify, g
from datetime import datetime, timedelta
from sqlalchemy import or_, func
from sqlalchemy.orm import selectinload, joinedload
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

        # Generate unique project_code
        last_project = Project.query.filter(
            Project.project_code.like('MSQ%')
        ).order_by(Project.project_code.desc()).first()

        if last_project and last_project.project_code:
            try:
                last_number = int(last_project.project_code.replace('MSQ', ''))
                new_number = last_number + 1
            except ValueError:
                new_number = 1
        else:
            new_number = 1

        project_code = f"MSQ{new_number:02d}"

        # Ensure uniqueness
        while Project.query.filter_by(project_code=project_code).first():
            new_number += 1
            project_code = f"MSQ{new_number:02d}"

        # Create new project
        new_project = Project(
            project_code=project_code,
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
        project_code = request.args.get('project_code', '')

        # Build query - Admin sees all projects, Estimators see only their assigned projects
        query = Project.query.filter(Project.is_deleted == False)

        # Apply role-based filtering
        if user_role != 'admin':
            # Non-admin users only see projects assigned to them OR projects with no estimator
            query = query.filter(
                or_(
                    Project.estimator_id == user_id,
                    Project.estimator_id == None
                )
            )

        # Apply filters
        if search:
            search_filter = f"%{search}%"
            query = query.filter(
                or_(
                    Project.project_name.ilike(search_filter),
                    Project.client.ilike(search_filter),
                    Project.location.ilike(search_filter),
                    Project.description.ilike(search_filter),
                    Project.project_code.ilike(search_filter)
                )
            )

        if status:
            query = query.filter(func.lower(Project.status) == status.lower())

        if work_type:
            query = query.filter(func.lower(Project.work_type) == work_type.lower())

        if project_code:
            query = query.filter(Project.project_code.ilike(f"%{project_code}%"))

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

        # ✅ PERFORMANCE OPTIMIZATION: Eager load BOQs and BOQDetails to eliminate N+1 queries
        # This changes query count from O(N²) to O(1)
        # Before: 1 + N (projects) + N×M (BOQs per project) = 100+ queries
        # After: 1-3 queries total (90-95% faster!)

        from models.boq import BOQ, BOQDetails
        from models.change_request import ChangeRequest

        eager_load_options = [
            selectinload(Project.boqs).selectinload(BOQ.details),
            selectinload(Project.boqs).selectinload(BOQ.change_requests)
        ]

        # Query projects based on role - Show active/assigned projects (not completed)
        if user_role == 'admin':
            # Admin sees all projects where site supervisor is assigned
            projects = Project.query.options(*eager_load_options).filter(
                Project.site_supervisor_id.isnot(None),
                Project.is_deleted == False,
                Project.status != 'completed'  # Exclude completed projects
            ).all()

        elif user_role in ['siteengineer', 'sitesupervisor', 'sitesupervisor']:
            # Get projects where user is assigned as site engineer/supervisor
            projects = Project.query.options(*eager_load_options).filter(
                Project.site_supervisor_id == user_id,
                Project.is_deleted == False,
                Project.status != 'completed'  # Exclude completed projects
            ).all()

        elif user_role in ['projectmanager']:
            # Get projects where user is assigned as project manager
            # user_id is JSONB array, so use .contains() to check if user_id is in array
            projects = Project.query.options(*eager_load_options).filter(
                Project.user_id.contains([user_id]),
                Project.is_deleted == False,
                Project.status != 'completed'  # Exclude completed projects
            ).all()

        elif user_role in ['mep', 'mepsupervisor']:
            # Get projects where user is assigned as MEP supervisor
            # mep_supervisor_id is JSONB array, so use .contains() to check if user_id is in array
            projects = Project.query.options(*eager_load_options).filter(
                Project.mep_supervisor_id.contains([user_id]),
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

            # ✅ PERFORMANCE: Use pre-loaded BOQs (already eager loaded above)
            # Before: N queries (one per project)
            # After: 0 additional queries (data already in memory)
            boqs = [boq for boq in project.boqs if not boq.is_deleted]

            for boq in boqs:
                boq_info = {
                    "boq_id": boq.boq_id,
                    "boq_name": boq.boq_name or f"BOQ-{boq.boq_id}",
                    "items": []
                }

                # ✅ PERFORMANCE: Use pre-loaded BOQ details (already eager loaded)
                # Before: M queries (one per BOQ)
                # After: 0 additional queries (data already in memory)
                boq_detail = None
                if hasattr(boq, 'details') and boq.details:
                    boq_detail = next((d for d in boq.details if not d.is_deleted), None)

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
                    # Get item overhead amount - calculate from base_total of sub-items
                    item_overhead = item.get('overhead_amount', 0)
                    overhead_percentage = item.get('overhead_percentage', 0)

                    # Always recalculate from sub-items to ensure accuracy
                    base_total_for_overhead = 0.0

                    if item.get('has_sub_items') and item.get('sub_items'):
                        # Sum up base_total from all sub-items
                        for sub_item in item['sub_items']:
                            base_total = float(sub_item.get('base_total', 0))
                            # base_total is already calculated per quantity in BOQ structure
                            base_total_for_overhead += base_total
                    else:
                        # Fallback: If no sub-items, use old calculation method
                        base_total_for_overhead = (
                            item.get('base_cost', 0) or
                            item.get('actualItemCost', 0) or
                            item.get('sub_items_cost', 0) or
                            item.get('total_cost', 0) or
                            item.get('selling_price', 0)
                        )

                    # Calculate overhead from base_total
                    if overhead_percentage > 0 and base_total_for_overhead > 0:
                        item_overhead = (base_total_for_overhead * overhead_percentage) / 100
                        log.info(f"Calculated overhead for item {item.get('item_name', '')}: {item_overhead} " +
                               f"from {overhead_percentage}% of base_total {base_total_for_overhead}")
                    elif item_overhead == 0 or item_overhead is None:
                        # Log warning if we can't calculate
                        log.warning(f"Cannot calculate overhead for item {item.get('item_name', 'unknown')}: " +
                                  f"percentage={overhead_percentage}, base_total={base_total_for_overhead}")

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
                        # ✅ PERFORMANCE: Use pre-loaded change requests (already eager loaded)
                        # Before: O(N×M) queries (one per item per BOQ)
                        # After: 0 additional queries (data already in memory)
                        approved_crs = [
                            cr for cr in boq.change_requests
                            if cr.status == 'approved' and not cr.is_deleted
                        ] if hasattr(boq, 'change_requests') else []

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

        # Only PM and MEP can request day extension
        if user_role not in ['projectmanager', 'project_manager', 'mep', 'mepsupervisor']:
            return jsonify({"error": "Only Project Managers and MEP Supervisors can request day extensions"}), 403
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

def get_day_extension_history(boq_id):
    """Get all day extension requests history for a BOQ (for PM to view)"""
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        user_role = current_user.get('role_name', 'user').lower()

        # Only PM, MEP, and TD can view history
        if user_role not in ['projectmanager', 'project_manager', 'mep', 'mepsupervisor', 'technicaldirector', 'technical_director']:
            return jsonify({"error": "Access denied"}), 403

        # Get the BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get associated project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get all BOQ history entries with day extension actions
        history_entries = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).all()

        # Process each history entry to consolidate request + approval/rejection
        extension_requests = []
        for hist in history_entries:
            if hist.action and isinstance(hist.action, list):
                # Collect all day extension actions from this history entry
                request_action = None
                approval_action = None
                rejection_action = None
                edit_action = None

                for action in hist.action:
                    action_type = action.get('type', '').lower()
                    if action_type == 'day_extension_requested':
                        request_action = action
                    elif action_type == 'day_extension_approved':
                        approval_action = action
                    elif action_type == 'day_extension_rejected':
                        rejection_action = action
                    elif action_type == 'day_extension_edited':
                        edit_action = action

                # Build consolidated request entry
                if request_action or approval_action or rejection_action:
                    # Start with request data (or fallback to approval/rejection data)
                    base_action = request_action or approval_action or rejection_action

                    consolidated_entry = {
                        "request_date": base_action.get('timestamp') or hist.action_date.isoformat() if hist.action_date else None,
                        "requested_by": (request_action.get('sender') if request_action else base_action.get('sender')) or hist.action_by,
                        "requested_days": (request_action.get('requested_additional_days') or request_action.get('requested_days') if request_action else 0) or (approval_action.get('original_request_days') if approval_action else 0),
                        "approved_days": approval_action.get('approved_days') if approval_action else None,
                        "new_duration": base_action.get('new_duration_days') or base_action.get('new_duration'),
                        "reason": (request_action.get('reason') if request_action else base_action.get('reason')) or hist.comments or 'No reason provided',
                        "rejection_reason": rejection_action.get('rejection_reason') if rejection_action else None,
                        "status": (approval_action.get('status') or 'approved') if approval_action else ((rejection_action.get('status') or 'rejected') if rejection_action else (request_action.get('status') if request_action else 'unknown')),
                        "original_end_date": base_action.get('original_end_date'),
                        "new_end_date": base_action.get('new_end_date')
                    }

                    extension_requests.append(consolidated_entry)

        # Count pending requests (only those awaiting TD action)
        pending_count = sum(1 for req in extension_requests if req['status'] in ['day_request_send_td', 'edited_by_td'])

        return jsonify({
            "success": True,
            "count": len(extension_requests),
            "pending_count": pending_count,
            "has_pending": pending_count > 0,
            "requests": extension_requests,
            "project_info": {
                "project_id": project.project_id,
                "project_name": project.project_name,
                "current_duration": project.duration_days,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "end_date": project.end_date.isoformat() if project.end_date else None
            }
        }), 200

    except Exception as e:
        log.error(f"Error getting day extension history for BOQ {boq_id}: {str(e)}")
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