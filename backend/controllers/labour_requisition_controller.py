"""
Labour Requisition Controller
Steps 1-3: Worker Registry + Requisitions + Approvals
"""

__all__ = [
    'get_workers', 'create_worker', 'get_worker_by_id', 'update_worker',
    'delete_worker', 'get_workers_by_skill',
    'create_requisition', 'get_my_requisitions', 'get_requisitions_by_project',
    'get_requisition_by_id', 'update_requisition', 'resubmit_requisition',
    'send_to_production', 'delete_requisition', 'resend_requisition',
    'get_pending_requisitions', 'approve_requisition', 'reject_requisition',
]
from datetime import datetime, date, timedelta
from flask import request, jsonify, g
from config.db import db
from models.worker import Worker
from models.labour_requisition import LabourRequisition
from models.worker_assignment import WorkerAssignment
from models.project import Project
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import func, and_, or_
from utils.skill_matcher import skill_matches
from utils.comprehensive_notification_service import notification_service
from controllers.labour_helpers import (
    log, normalize_role, get_user_assigned_project_ids,
    SUPER_ADMIN_ROLES, LABOUR_ADMIN_ROLES
)


# =============================================================================
# STEP 1: WORKER REGISTRY
# =============================================================================

def get_workers():
    """Get all workers with optional filters"""
    try:
        current_user = g.user

        # Query params
        status = request.args.get('status', 'active')
        skill = request.args.get('skill')
        search = request.args.get('search')
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)

        query = Worker.query.filter(Worker.is_deleted == False)

        if status and status != 'all':
            query = query.filter(Worker.status == status)

        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    Worker.full_name.ilike(search_term),
                    Worker.worker_code.ilike(search_term),
                    Worker.phone.ilike(search_term)
                )
            )

        query = query.order_by(Worker.created_at.desc())

        # Apply skill filter with flexible matching
        if skill:
            all_results = query.all()
            skill_filtered = [w for w in all_results if skill_matches(skill, w.skills or [])]

            # Manual pagination after filtering
            total = len(skill_filtered)
            start = (page - 1) * per_page
            end = start + per_page
            items = skill_filtered[start:end]

            return jsonify({
                "success": True,
                "workers": [w.to_dict() for w in items],
                "pagination": {
                    "page": page,
                    "per_page": per_page,
                    "total": total,
                    "pages": (total + per_page - 1) // per_page,
                    "has_prev": page > 1,
                    "has_next": end < total
                }
            }), 200
        else:
            paginated = query.paginate(page=page, per_page=per_page, error_out=False)
            return jsonify({
                "success": True,
                "workers": [w.to_dict() for w in paginated.items],
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
        log.error(f"Error getting workers: {str(e)}")
        return jsonify({"error": str(e)}), 500


def create_worker():
    """Create a new worker in the registry"""
    try:
        current_user = g.user
        data = request.get_json()

        # Validate required fields
        if not data.get('full_name'):
            return jsonify({"error": "full_name is required"}), 400
        if not data.get('hourly_rate'):
            return jsonify({"error": "hourly_rate is required"}), 400

        # Generate worker code
        worker_code = Worker.generate_worker_code()

        worker = Worker(
            worker_code=worker_code,
            full_name=data['full_name'],
            phone=data.get('phone'),
            email=data.get('email'),
            hourly_rate=float(data['hourly_rate']),
            skills=data.get('skills', []),
            worker_type=data.get('worker_type', 'regular'),
            emergency_contact=data.get('emergency_contact'),
            emergency_phone=data.get('emergency_phone'),
            id_number=data.get('id_number'),
            id_type=data.get('id_type'),
            photo_url=data.get('photo_url'),
            status='active',
            notes=data.get('notes'),
            created_by=current_user.get('full_name', 'System')
        )

        db.session.add(worker)
        db.session.commit()

        log.info(f"Worker created: {worker_code} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Worker created successfully",
            "worker": worker.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating worker: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_worker_by_id(worker_id):
    """Get a single worker by ID"""
    try:
        worker = Worker.query.filter_by(
            worker_id=worker_id,
            is_deleted=False
        ).first()

        if not worker:
            return jsonify({"error": "Worker not found"}), 404

        return jsonify({
            "success": True,
            "worker": worker.to_dict()
        }), 200

    except Exception as e:
        log.error(f"Error getting worker: {str(e)}")
        return jsonify({"error": str(e)}), 500


def update_worker(worker_id):
    """Update worker information"""
    try:
        current_user = g.user
        data = request.get_json()

        worker = Worker.query.filter_by(
            worker_id=worker_id,
            is_deleted=False
        ).first()

        if not worker:
            return jsonify({"error": "Worker not found"}), 404

        # Update fields
        if 'full_name' in data:
            worker.full_name = data['full_name']
        if 'phone' in data:
            worker.phone = data['phone']
        if 'email' in data:
            worker.email = data['email']
        if 'hourly_rate' in data:
            worker.hourly_rate = float(data['hourly_rate'])
        if 'skills' in data:
            worker.skills = data['skills']
        if 'worker_type' in data:
            worker.worker_type = data['worker_type']
        if 'emergency_contact' in data:
            worker.emergency_contact = data['emergency_contact']
        if 'emergency_phone' in data:
            worker.emergency_phone = data['emergency_phone']
        if 'id_number' in data:
            worker.id_number = data['id_number']
        if 'id_type' in data:
            worker.id_type = data['id_type']
        if 'photo_url' in data:
            worker.photo_url = data['photo_url']
        if 'status' in data:
            worker.status = data['status']
        if 'notes' in data:
            worker.notes = data['notes']

        worker.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        log.info(f"Worker updated: {worker.worker_code} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Worker updated successfully",
            "worker": worker.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating worker: {str(e)}")
        return jsonify({"error": str(e)}), 500


def delete_worker(worker_id):
    """Soft delete a worker"""
    try:
        current_user = g.user

        worker = Worker.query.filter_by(
            worker_id=worker_id,
            is_deleted=False
        ).first()

        if not worker:
            return jsonify({"error": "Worker not found"}), 404

        worker.is_deleted = True
        worker.status = 'terminated'
        worker.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        log.info(f"Worker deleted: {worker.worker_code} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Worker deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting worker: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_workers_by_skill(skill):
    """Get workers with a specific skill"""
    try:
        # Get all active workers
        all_workers = Worker.query.filter(
            Worker.is_deleted == False,
            Worker.status == 'active'
        ).all()

        # Filter using flexible skill matching
        matching_workers = []
        for worker in all_workers:
            if skill_matches(skill, worker.skills or []):
                matching_workers.append(worker)

        return jsonify({
            "success": True,
            "workers": [w.to_dict_minimal() for w in matching_workers]
        }), 200

    except Exception as e:
        log.error(f"Error getting workers by skill: {str(e)}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# STEP 2: REQUISITIONS (Site Engineer)
# =============================================================================

def create_requisition():
    """Site Engineer or Project Manager creates a labour requisition with multiple labour items"""
    try:
        current_user = g.user
        data = request.get_json()

        # Detect if requester is PM or SE - ALWAYS use session role, NEVER trust request body
        # This is critical for security - malicious SE could send requester_role='PM' to bypass approval
        user_role = normalize_role(current_user.get('role', ''))
        requester_role = 'PM' if user_role in ['pm', 'projectmanager'] else 'SE'

        # Ignore any requester_role from request body for security
        if data.get('requester_role'):
            log.warning(f"Ignoring requester_role from request body. Using session role: {requester_role}")

        # Validate required fields
        required = ['project_id', 'site_name', 'required_date', 'labour_items']
        for field in required:
            if not data.get(field):
                return jsonify({"error": f"{field} is required"}), 400

        # Validate labour_items array
        labour_items = data.get('labour_items', [])
        if not isinstance(labour_items, list) or len(labour_items) == 0:
            return jsonify({"error": "labour_items must be a non-empty array"}), 400

        # Validate each labour item
        for idx, item in enumerate(labour_items):
            required_item_fields = ['work_description', 'skill_required', 'workers_count']
            for field in required_item_fields:
                if not item.get(field):
                    return jsonify({"error": f"labour_items[{idx}].{field} is required"}), 400

        # Generate requisition code with retry logic for race conditions
        max_retries = 5
        requisition = None

        for attempt in range(max_retries):
            try:
                # Generate unique requisition code
                requisition_code = LabourRequisition.generate_requisition_code()

                # Get first labour item for backward compatibility fields
                first_item = labour_items[0]
                total_workers = sum(item.get('workers_count', 0) for item in labour_items)

                # Create single requisition with multiple labour items
                # Status Flow:
                # - Both PM and SE requisitions: 'pending' (draft, must be manually sent)
                # - PM must manually send to Production Manager (no auto-approval)
                # - SE must send to PM first, then PM sends to Production Manager
                initial_status = 'pending'

                # Parse time fields if provided
                start_time = None
                end_time = None

                if data.get('start_time'):
                    try:
                        start_time = datetime.strptime(data['start_time'], '%H:%M').time()
                    except ValueError:
                        return jsonify({"error": "Invalid time format for start_time. Use HH:MM"}), 400

                if data.get('end_time'):
                    try:
                        end_time = datetime.strptime(data['end_time'], '%H:%M').time()
                    except ValueError:
                        return jsonify({"error": "Invalid time format for end_time. Use HH:MM"}), 400

                # Validate times: End time must be after start time
                if start_time and end_time:
                    # Convert to minutes for comparison
                    start_minutes = start_time.hour * 60 + start_time.minute
                    end_minutes = end_time.hour * 60 + end_time.minute
                    if end_minutes <= start_minutes:
                        return jsonify({"error": "End time must be after start time"}), 400

                requisition = LabourRequisition(
                    requisition_code=requisition_code,
                    project_id=data['project_id'],
                    site_name=data['site_name'],
                    required_date=datetime.strptime(data['required_date'], '%Y-%m-%d').date(),
                    start_time=start_time,
                    end_time=end_time,
                    preferred_worker_ids=data.get('preferred_worker_ids', []),
                    preferred_workers_notes=data.get('preferred_workers_notes'),
                    labour_items=labour_items,  # Store all labour items in JSONB
                    # Backward compatibility: populate old fields with first item or summary
                    work_description=first_item.get('work_description') if len(labour_items) == 1 else f"Multiple Labour Items ({len(labour_items)} items)",
                    skill_required=first_item.get('skill_required') if len(labour_items) == 1 else "Multiple Skills",
                    workers_count=total_workers,  # Total workers across all items
                    boq_id=first_item.get('boq_id'),
                    item_id=first_item.get('item_id'),
                    labour_id=first_item.get('labour_id'),
                    work_status='pending_assignment',
                    requested_by_user_id=current_user.get('user_id'),
                    requested_by_name=current_user.get('full_name', 'Unknown'),
                    requester_role=requester_role,  # Track if PM or SE created this
                    status=initial_status,
                    created_by=current_user.get('full_name', 'System')
                    # Note: transport_fee will be set by Production Manager during worker assignment
                )

                db.session.add(requisition)
                db.session.commit()

                log.info(f"Requisition created: {requisition_code} with {len(labour_items)} labour items, {total_workers} total workers by {current_user.get('full_name')}")
                break  # Success, exit retry loop

            except Exception as commit_error:
                db.session.rollback()

                # Check if it's a unique constraint violation on requisition_code
                if 'labour_requisitions_requisition_code_key' in str(commit_error):
                    if attempt < max_retries - 1:
                        log.warning(f"Requisition code collision on attempt {attempt + 1}, retrying...")
                        import time
                        time.sleep(0.1)  # Wait 100ms before retry
                        continue  # Retry with new code
                    else:
                        log.error(f"Failed to generate unique requisition code after {max_retries} attempts")
                        return jsonify({"error": "Failed to generate unique requisition code. Please try again."}), 500
                else:
                    # Different error, raise it
                    raise commit_error

        # Notification will be sent when SE explicitly sends to PM via "Send to PM" action
        # (see resend_requisition). Requisition starts as draft ('pending') status.

        return jsonify({
            "success": True,
            "message": f"Requisition submitted successfully with {len(labour_items)} labour item(s)",
            "requisition": requisition.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating requisition: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_my_requisitions():
    """Get requisitions created by the current user
    Admin viewing as a role sees ALL requisitions created by users of that role"""
    try:
        current_user = g.user
        user_id = current_user.get('user_id')
        user_role = normalize_role(current_user.get('role', ''))

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 15, type=int), 100)
        status = request.args.get('status')
        assignment_status = request.args.get('assignment_status')  # New parameter for filtering by assignment_status

        query = LabourRequisition.query.filter(
            LabourRequisition.is_deleted == False
        )

        # Admin sees ALL requisitions (for oversight when viewing as another role)
        if user_role in SUPER_ADMIN_ROLES:
            log.info(f"Admin {user_id} viewing all requisitions")
            # No user filtering - admin sees everything
        else:
            # Regular users only see their own requisitions
            query = query.filter(LabourRequisition.requested_by_user_id == user_id)

        if status:
            # Support comma-separated status values (e.g., 'pending,send_to_pm')
            if ',' in status:
                status_list = [s.strip() for s in status.split(',')]
                query = query.filter(LabourRequisition.status.in_(status_list))
            else:
                query = query.filter(LabourRequisition.status == status)

        if assignment_status:
            # Filter by assignment_status (e.g., 'assigned' or 'unassigned')
            query = query.filter(LabourRequisition.assignment_status == assignment_status)

        query = query.order_by(LabourRequisition.created_at.desc())
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        # Fix N+1 query: Batch load workers for assigned and preferred worker IDs
        all_worker_ids = set()
        for req in paginated.items:
            if req.assigned_worker_ids:
                all_worker_ids.update(req.assigned_worker_ids)
            if req.preferred_worker_ids:
                all_worker_ids.update(req.preferred_worker_ids)

        workers_map = {}
        if all_worker_ids:
            workers = Worker.query.filter(
                Worker.worker_id.in_(list(all_worker_ids)),
                Worker.is_deleted == False
            ).all()
            workers_map = {w.worker_id: w for w in workers}

        # Add workers_map to each requisition's to_dict context
        requisitions_data = []
        for req in paginated.items:
            req_dict = req.to_dict()
            # Enrich with pre-loaded worker data to avoid N+1
            if req.assigned_worker_ids and workers_map:
                req_dict['assigned_workers'] = [
                    {'worker_id': wid, 'full_name': workers_map[wid].full_name, 'worker_code': workers_map[wid].worker_code}
                    for wid in req.assigned_worker_ids if wid in workers_map
                ]
            if req.preferred_worker_ids and workers_map:
                req_dict['preferred_workers'] = [
                    {'worker_id': wid, 'full_name': workers_map[wid].full_name, 'worker_code': workers_map[wid].worker_code}
                    for wid in req.preferred_worker_ids if wid in workers_map
                ]
            requisitions_data.append(req_dict)

        return jsonify({
            "success": True,
            "requisitions": requisitions_data,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated.total,
                "pages": paginated.pages
            }
        }), 200

    except Exception as e:
        log.error(f"Error getting my requisitions: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_requisitions_by_project(project_id):
    """Get all requisitions for a specific project (for status tracking on labour items)"""
    try:
        current_user = g.user

        # Validate project_id
        if not project_id or project_id <= 0:
            return jsonify({"error": "Invalid project_id"}), 400

        # Authorization: User must be assigned to this project or have admin/PM role
        # For now, we allow the requester to see requisitions they created OR
        # if they have PM/Admin/Production Manager roles
        user_id = current_user.get('user_id')
        user_role = current_user.get('role', '').lower()

        # Allow access for PM, Admin, Production Manager, or if user has requisitions for this project
        privileged_roles = ['pm', 'admin', 'production_manager', 'td', 'project_manager']
        is_privileged = user_role in privileged_roles

        if not is_privileged:
            # Check if user has created any requisitions for this project (Site Engineer use case)
            user_has_access = LabourRequisition.query.filter(
                LabourRequisition.project_id == project_id,
                LabourRequisition.requested_by_user_id == user_id,
                LabourRequisition.is_deleted == False
            ).first() is not None

            if not user_has_access:
                # Also check if user is assigned to this project (via some other mechanism)
                # For now, allow access if we can't verify - the SE needs to see status for items they may create
                pass

        requisitions = LabourRequisition.query.filter(
            LabourRequisition.project_id == project_id,
            LabourRequisition.is_deleted == False
        ).all()

        # Fix N+1 query: Batch load workers for all requisitions
        all_worker_ids = set()
        for req in requisitions:
            if req.assigned_worker_ids:
                all_worker_ids.update(req.assigned_worker_ids)
            if req.preferred_worker_ids:
                all_worker_ids.update(req.preferred_worker_ids)

        workers_map = {}
        if all_worker_ids:
            workers = Worker.query.filter(
                Worker.worker_id.in_(list(all_worker_ids)),
                Worker.is_deleted == False
            ).all()
            workers_map = {w.worker_id: w for w in workers}

        # Build a lookup map by labour_id for quick status checking
        labour_status_map = {}
        for req in requisitions:
            # Handle both old single labour_id and new labour_items array
            if req.labour_items and isinstance(req.labour_items, list):
                # Modern requisitions with multiple labour items
                for item in req.labour_items:
                    labour_id = item.get('labour_id')
                    if labour_id:
                        labour_status_map[str(labour_id)] = {
                            'requisition_id': req.requisition_id,
                            'requisition_code': req.requisition_code,
                            'status': req.status,
                            'work_status': req.work_status,
                            'assignment_status': req.assignment_status
                        }
            elif req.labour_id:
                # Legacy single labour item (backward compatibility)
                labour_status_map[req.labour_id] = {
                    'requisition_id': req.requisition_id,
                    'requisition_code': req.requisition_code,
                    'status': req.status,
                    'work_status': req.work_status,
                    'assignment_status': req.assignment_status
                }

        return jsonify({
            "success": True,
            "requisitions": [r.to_dict() for r in requisitions],
            "labour_status_map": labour_status_map
        }), 200

    except Exception as e:
        log.error(f"Error getting requisitions by project: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_requisition_by_id(requisition_id):
    """Get a single requisition by ID"""
    try:
        requisition = LabourRequisition.query.options(
            joinedload(LabourRequisition.project)
        ).filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        return jsonify({
            "success": True,
            "requisition": requisition.to_dict()
        }), 200

    except Exception as e:
        log.error(f"Error getting requisition: {str(e)}")
        return jsonify({"error": str(e)}), 500


def update_requisition(requisition_id):
    """Update a requisition (only if pending)"""
    try:
        current_user = g.user
        data = request.get_json()

        requisition = LabourRequisition.query.filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        if requisition.status != 'pending':
            return jsonify({"error": "Can only update pending requisitions"}), 400

        # Update fields
        if 'site_name' in data:
            requisition.site_name = data['site_name']
        if 'work_description' in data:
            requisition.work_description = data['work_description']
        if 'skill_required' in data:
            requisition.skill_required = data['skill_required']
        if 'workers_count' in data:
            requisition.workers_count = int(data['workers_count'])
        if 'required_date' in data:
            requisition.required_date = datetime.strptime(data['required_date'], '%Y-%m-%d').date()
        if 'start_time' in data:
            if data['start_time']:
                # Parse time string (HH:MM) to time object
                time_parts = data['start_time'].split(':')
                requisition.start_time = datetime.strptime(data['start_time'], '%H:%M').time()
            else:
                requisition.start_time = None
        if 'end_time' in data:
            if data['end_time']:
                requisition.end_time = datetime.strptime(data['end_time'], '%H:%M').time()
            else:
                requisition.end_time = None
        if 'preferred_workers_notes' in data:
            requisition.preferred_workers_notes = data['preferred_workers_notes']
        if 'preferred_worker_ids' in data:
            requisition.preferred_worker_ids = data['preferred_worker_ids']

        # Update labour items if provided
        if 'labour_items' in data and data['labour_items']:
            # Create a new list to ensure SQLAlchemy detects the change
            # This forces a copy of the data structure
            requisition.labour_items = [dict(item) for item in data['labour_items']]

            # Mark the labour_items JSON field as modified so SQLAlchemy detects the change
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(requisition, 'labour_items')

            # Force flush to ensure the change is written
            db.session.flush()

        # Validate time: end_time must be after start_time
        if requisition.start_time and requisition.end_time:
            start_minutes = requisition.start_time.hour * 60 + requisition.start_time.minute
            end_minutes = requisition.end_time.hour * 60 + requisition.end_time.minute
            if end_minutes <= start_minutes:
                return jsonify({"error": "End time must be after start time"}), 400

        requisition.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Requisition updated successfully",
            "requisition": requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating requisition: {str(e)}")
        return jsonify({"error": str(e)}), 500


def resubmit_requisition(requisition_id):
    """Resubmit a rejected or pending requisition with optional edits (Site Engineer)"""
    try:
        current_user = g.user
        data = request.get_json()

        requisition = LabourRequisition.query.filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        # Allow resubmit for rejected or pending requisitions
        if requisition.status not in ['rejected', 'pending']:
            return jsonify({"error": "Can only resubmit rejected or pending requisitions"}), 400

        # Verify the requester is the original creator
        if requisition.requested_by_user_id != current_user.get('user_id'):
            user_role = current_user.get('role', '').lower()
            if user_role not in ['admin', 'pm', 'project_manager']:
                return jsonify({"error": "Only the original requester can resubmit"}), 403

        # Update site_name if provided
        if 'site_name' in data:
            if not data['site_name'] or not str(data['site_name']).strip():
                return jsonify({"error": "site_name cannot be empty"}), 400
            requisition.site_name = str(data['site_name']).strip()

        # Update required_date if provided
        if 'required_date' in data:
            new_date = datetime.strptime(data['required_date'], '%Y-%m-%d').date()
            if new_date < date.today():
                return jsonify({"error": "required_date cannot be in the past"}), 400
            requisition.required_date = new_date

        # Update start_time if provided
        if 'start_time' in data:
            if data['start_time']:
                try:
                    requisition.start_time = datetime.strptime(data['start_time'], '%H:%M').time()
                except ValueError:
                    return jsonify({"error": "Invalid time format for start_time. Use HH:MM"}), 400
            else:
                requisition.start_time = None

        # Update end_time if provided
        if 'end_time' in data:
            if data['end_time']:
                try:
                    requisition.end_time = datetime.strptime(data['end_time'], '%H:%M').time()
                except ValueError:
                    return jsonify({"error": "Invalid time format for end_time. Use HH:MM"}), 400
            else:
                requisition.end_time = None

        # Validate times: End time must be after start time
        if requisition.start_time and requisition.end_time:
            # Convert to minutes for comparison
            start_minutes = requisition.start_time.hour * 60 + requisition.start_time.minute
            end_minutes = requisition.end_time.hour * 60 + requisition.end_time.minute
            if end_minutes <= start_minutes:
                return jsonify({"error": "End time must be after start time"}), 400

        # Update preferred_workers_notes if provided
        # Update preferred_worker_ids if provided
        if 'preferred_worker_ids' in data:
            requisition.preferred_worker_ids = data.get('preferred_worker_ids', [])

        if 'preferred_workers_notes' in data:
            requisition.preferred_workers_notes = data.get('preferred_workers_notes')

        # Update labour_items if provided
        if 'labour_items' in data:
            labour_items = data.get('labour_items', [])

            # Validate labour_items array
            if not isinstance(labour_items, list) or len(labour_items) == 0:
                return jsonify({"error": "labour_items must be a non-empty array"}), 400

            # Validate each labour item
            for idx, item in enumerate(labour_items):
                if not item.get('work_description', '').strip():
                    return jsonify({"error": f"work_description is required for labour item {idx + 1}"}), 400
                if not item.get('skill_required', '').strip():
                    return jsonify({"error": f"skill_required is required for labour item {idx + 1}"}), 400
                if not item.get('workers_count') or int(item.get('workers_count', 0)) < 1:
                    return jsonify({"error": f"workers_count must be at least 1 for labour item {idx + 1}"}), 400

            # Update labour_items
            requisition.labour_items = labour_items

            # Update backward compatibility fields
            total_workers = sum(item.get('workers_count', 0) for item in labour_items)
            first_item = labour_items[0]

            if len(labour_items) == 1:
                requisition.work_description = first_item.get('work_description')
                requisition.skill_required = first_item.get('skill_required')
                requisition.workers_count = first_item.get('workers_count')
            else:
                requisition.work_description = f"Multiple Labour Items ({len(labour_items)} items)"
                requisition.skill_required = "Multiple Skills"
                requisition.workers_count = total_workers

        # Legacy fields support (if labour_items not provided)
        else:
            if 'work_description' in data:
                if not data['work_description'] or not str(data['work_description']).strip():
                    return jsonify({"error": "work_description cannot be empty"}), 400
                requisition.work_description = str(data['work_description']).strip()
            if 'skill_required' in data:
                if not data['skill_required'] or not str(data['skill_required']).strip():
                    return jsonify({"error": "skill_required cannot be empty"}), 400
                requisition.skill_required = str(data['skill_required']).strip()
            if 'workers_count' in data:
                count = int(data['workers_count'])
                if count < 1 or count > 500:
                    return jsonify({"error": "workers_count must be between 1 and 500"}), 400
                requisition.workers_count = count

        # Keep status unchanged - just update the data
        # User must manually click "Resend to PM" to send
        requisition.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        log.info(f"Requisition updated: {requisition.requisition_code} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Requisition updated successfully. Click 'Resend to PM' to send for approval.",
            "requisition": requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error resubmitting requisition: {str(e)}")
        return jsonify({"error": str(e)}), 500


def send_to_production(requisition_id):
    """PM sends a requisition to production for worker assignment.
    Handles both PM-created drafts (status='pending') and SE-created requests (status='send_to_pm').
    """
    try:
        current_user = g.user
        user_role = normalize_role(current_user.get('role', ''))

        # Only PMs can send to production
        if user_role not in ['pm', 'projectmanager']:
            return jsonify({"error": "Only Project Managers can send requisitions to production"}), 403

        requisition = LabourRequisition.query.filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        # Accept both PM drafts ('pending') and SE requests sent to PM ('send_to_pm')
        allowed_statuses = ['pending', 'send_to_pm']
        if requisition.status not in allowed_statuses:
            return jsonify({"error": f"Can only send pending requisitions to production. Current status: {requisition.status}"}), 400

        # For PM-created requisitions, verify PM owns it
        if requisition.requester_role == 'PM' and requisition.requested_by_user_id != current_user.get('user_id'):
            return jsonify({"error": "You can only send your own requisitions to production"}), 403

        # Update status to 'approved' - ready for production manager to assign workers
        requisition.status = 'approved'
        requisition.approved_by_user_id = current_user.get('user_id')
        requisition.approved_by_name = current_user.get('full_name', 'Unknown')
        requisition.approval_date = datetime.utcnow()
        requisition.last_modified_by = current_user.get('full_name', 'System')

        # CRITICAL: Always set assignment_status to 'unassigned' when PM approves
        # This ensures the requisition appears in Production Manager's "Pending Assignment" queue
        requisition.assignment_status = 'unassigned'

        db.session.commit()

        log.info(f"Requisition sent to production: {requisition.requisition_code} (created by {requisition.requester_role}) approved by {current_user.get('full_name')}")

        # Notify Production Manager(s) about pending assignment
        project = Project.query.get(requisition.project_id)
        project_name = project.project_name if project else f'Project #{requisition.project_id}'
        try:
            notification_service.notify_labour_sent_to_production(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_name=project_name,
                pm_user_id=current_user.get('user_id'),
                pm_name=current_user.get('full_name', 'Unknown'),
                workers_count=requisition.workers_count or 0
            )
        except Exception as notif_err:
            log.error(f"Failed to send production notification: {notif_err}")

        return jsonify({
            "success": True,
            "message": "Requisition sent to production for worker assignment",
            "requisition": requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error sending requisition to production: {str(e)}")
        return jsonify({"error": str(e)}), 500


def delete_requisition(requisition_id):
    """Delete a requisition (soft delete) - Site Engineer can only delete pending requisitions"""
    try:
        current_user = g.user

        requisition = LabourRequisition.query.filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        # Only allow deletion of pending requisitions
        if requisition.status != 'pending':
            return jsonify({"error": "Can only delete pending requisitions"}), 400

        # Verify the requester is the original creator
        if requisition.requested_by_user_id != current_user.get('user_id'):
            user_role = current_user.get('role', '').lower()
            if user_role not in ['admin', 'pm', 'project_manager']:
                return jsonify({"error": "Only the original requester can delete"}), 403

        # Check if workers have been assigned
        if requisition.assignment_status == 'assigned':
            return jsonify({"error": "Cannot delete requisition with assigned workers"}), 400

        # Soft delete
        requisition.is_deleted = True
        requisition.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        log.info(f"Requisition deleted: {requisition.requisition_code} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Requisition deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting requisition: {str(e)}")
        return jsonify({"error": str(e)}), 500


def resend_requisition(requisition_id):
    """Resend/notify PM about a pending or rejected requisition"""
    try:
        current_user = g.user

        requisition = LabourRequisition.query.filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        # Only allow resending pending or rejected requisitions
        if requisition.status not in ['pending', 'rejected']:
            return jsonify({"error": "Can only send pending or rejected requisitions"}), 400

        # Verify the requester is the original creator
        if requisition.requested_by_user_id != current_user.get('user_id'):
            user_role = current_user.get('role', '').lower()
            if user_role not in ['admin', 'pm', 'project_manager']:
                return jsonify({"error": "Only the original requester can resend"}), 403

        # Update request date to show it was resent
        requisition.request_date = datetime.utcnow()
        requisition.last_modified_by = current_user.get('full_name', 'System')

        # Change status to send_to_pm to indicate it's been sent to PM
        requisition.status = 'send_to_pm'

        # Clear rejection reason if it was previously rejected
        if requisition.rejection_reason:
            requisition.rejection_reason = None
            requisition.approved_by_user_id = None
            requisition.approved_by_name = None
            requisition.approval_date = None

        db.session.commit()

        # Notify PM(s) about the requisition
        project = Project.query.get(requisition.project_id)
        project_name = project.project_name if project else f'Project #{requisition.project_id}'
        pm_ids = []
        if project and project.user_id:
            if isinstance(project.user_id, list):
                pm_ids = [int(uid) for uid in project.user_id if uid]
            else:
                pm_ids = [int(project.user_id)]
        try:
            notification_service.notify_labour_requisition_created(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_name=project_name,
                site_name=requisition.site_name,
                se_user_id=current_user.get('user_id'),
                se_name=current_user.get('full_name', 'Unknown'),
                pm_user_ids=pm_ids,
                workers_count=requisition.workers_count or 0
            )
        except Exception as notif_err:
            log.error(f"Failed to send resend notification: {notif_err}")

        log.info(f"Requisition resent: {requisition.requisition_code} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Requisition resent to Project Manager"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error resending requisition: {str(e)}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# STEP 3: APPROVE REQUISITIONS (Project Manager)
# =============================================================================

def get_pending_requisitions():
    """
    Get requisitions for PM with optional status filter, filtered by user's assigned projects.

    Status Flow:
    1. SE creates requisition -> status: 'pending' (draft on SE side)
    2. SE sends to PM -> status: 'send_to_pm' (visible in PM's "SE Pending" tab)
    3. PM approves -> status: 'approved'
    4. PM rejects -> status: 'rejected'
    5. PM creates requisition -> status: 'pending' (draft in PM's "My Pending" tab)
    6. PM manually sends to Production Manager -> status changes appropriately

    Query Parameters:
    - status: 'pending' (for send_to_pm), 'approved', 'rejected'
    - project_id: Filter by specific project
    - page: Page number for pagination
    - per_page: Items per page (max 100)
    """
    try:
        current_user = g.user
        user_id = current_user.get('user_id')
        user_role = normalize_role(current_user.get('role', ''))

        # Validate user_id
        if not user_id:
            return jsonify({"error": "User ID not found in session"}), 401

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 15, type=int), 100)
        project_id = request.args.get('project_id', type=int)
        status = request.args.get('status', 'pending')  # Default to pending
        view_as_role = request.args.get('view_as_role', '').lower()  # For admin viewing as other roles

        # Track if original user is admin (for viewing as other roles)
        is_admin_viewing_as_role = user_role in SUPER_ADMIN_ROLES and view_as_role

        # If admin is viewing as another role, use that role for filtering
        if is_admin_viewing_as_role:
            user_role = view_as_role

        # Query labour requisitions
        query = LabourRequisition.query.options(
            joinedload(LabourRequisition.project)
        ).filter(
            LabourRequisition.is_deleted == False
        )

        # Filter by status
        # For 'pending' tab on PM side, only show requisitions that have been sent to PM (send_to_pm status)
        # This excludes draft requisitions that are still 'pending' on SE side
        if status == 'pending':
            query = query.filter(LabourRequisition.status == 'send_to_pm')
        elif status in ['approved', 'rejected']:
            query = query.filter(LabourRequisition.status == status)

        if project_id:
            query = query.filter(LabourRequisition.project_id == project_id)

        # Role-based filtering - different logic for pending vs approved/rejected tabs
        # Admin viewing as role sees ALL data for that role (no user-specific filtering)
        if is_admin_viewing_as_role:
            log.info(f"Admin viewing as {view_as_role} - skipping user-specific filtering")
            # No additional filtering - admin sees all data for the role
        elif user_role not in SUPER_ADMIN_ROLES:
            if user_role == 'pm' or user_role == 'projectmanager':
                # For PENDING tab: filter by project_id (PM's assigned projects)
                # For APPROVED/REJECTED tabs: filter by approved_by_user_id
                if status == 'pending':
                    # Get all projects and find which ones this PM is assigned to
                    from models.project import Project
                    all_projects = Project.query.filter(
                        Project.is_deleted == False,
                        Project.user_id.isnot(None)
                    ).all()

                    assigned_project_ids = []
                    for proj in all_projects:
                        if proj.user_id and isinstance(proj.user_id, list) and user_id in proj.user_id:
                            assigned_project_ids.append(proj.project_id)

                    if assigned_project_ids:
                        query = query.filter(LabourRequisition.project_id.in_(assigned_project_ids))
                    else:
                        return jsonify({
                            "success": True,
                            "requisitions": [],
                            "pagination": {
                                "page": page,
                                "per_page": per_page,
                                "total": 0,
                                "pages": 0
                            }
                        }), 200
                else:
                    # For approved/rejected tabs: filter by approved_by_user_id
                    query = query.filter(LabourRequisition.approved_by_user_id == user_id)

            elif user_role in ['mep', 'mepsupervisor', 'mep_supervisor']:
                # MEP Supervisor: filter by projects where mep_supervisor_id contains this user
                # For PENDING tab: filter by MEP's assigned projects
                # For APPROVED/REJECTED tabs: filter by approved_by_user_id
                if status == 'pending':

                    from models.project import Project
                    all_projects = Project.query.filter(
                        Project.is_deleted == False,
                        Project.mep_supervisor_id.isnot(None)
                    ).all()

                    assigned_project_ids = []
                    for proj in all_projects:
                        if proj.mep_supervisor_id and isinstance(proj.mep_supervisor_id, list) and user_id in proj.mep_supervisor_id:
                            assigned_project_ids.append(proj.project_id)

                    if assigned_project_ids:
                        query = query.filter(LabourRequisition.project_id.in_(assigned_project_ids))
                    else:
                        return jsonify({
                            "success": True,
                            "requisitions": [],
                            "pagination": {
                                "page": page,
                                "per_page": per_page,
                                "total": 0,
                                "pages": 0
                            }
                        }), 200
                else:
                    # For approved/rejected tabs: filter by approved_by_user_id
                    query = query.filter(LabourRequisition.approved_by_user_id == user_id)

            else:
                # For other roles (SE, etc), use project assignment filtering
                assigned_project_ids = get_user_assigned_project_ids(user_id)
                if assigned_project_ids:
                    query = query.filter(LabourRequisition.project_id.in_(assigned_project_ids))
                else:
                    return jsonify({
                        "success": True,
                        "requisitions": [],
                        "pagination": {
                            "page": page,
                            "per_page": per_page,
                            "total": 0,
                            "pages": 0
                        }
                    }), 200

        query = query.order_by(LabourRequisition.required_date.desc())
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        return jsonify({
            "success": True,
            "requisitions": [r.to_dict() for r in paginated.items],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated.total,
                "pages": paginated.pages
            }
        }), 200

    except Exception as e:
        log.error(f"Error getting requisitions: {str(e)}")
        return jsonify({"error": str(e)}), 500


def approve_requisition(requisition_id):
    """
    PM approves a requisition.

    Only requisitions with status='send_to_pm' can be approved.
    This ensures SE has explicitly sent the requisition for PM approval.
    """
    try:
        current_user = g.user

        requisition = LabourRequisition.query.filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        # Only approve requisitions that have been sent to PM
        if requisition.status != 'send_to_pm':
            error_msg = "Requisition cannot be approved"
            if requisition.status == 'pending':
                error_msg = "This requisition is still in draft state and hasn't been sent to PM for approval"
            elif requisition.status == 'approved':
                error_msg = "This requisition has already been approved"
            elif requisition.status == 'rejected':
                error_msg = "This requisition has already been rejected"

            return jsonify({"error": error_msg}), 400

        requisition.status = 'approved'
        requisition.approved_by_user_id = current_user.get('user_id')
        requisition.approved_by_name = current_user.get('full_name', 'Unknown')
        requisition.approval_date = datetime.utcnow()
        requisition.last_modified_by = current_user.get('full_name', 'System')

        # CRITICAL: Always set assignment_status to 'unassigned' when PM approves
        # This ensures the requisition appears in Production Manager's "Pending Assignment" queue
        # regardless of what status it had before (fixes old 'pending' status from legacy code)
        requisition.assignment_status = 'unassigned'

        db.session.commit()

        # Notify SE that requisition was approved
        project = Project.query.get(requisition.project_id)
        project_name = project.project_name if project else f'Project #{requisition.project_id}'
        try:
            notification_service.notify_labour_requisition_approved(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_name=project_name,
                pm_user_id=current_user.get('user_id'),
                pm_name=current_user.get('full_name', 'Unknown'),
                se_user_id=requisition.requested_by_user_id
            )
        except Exception as notif_err:
            log.error(f"Failed to send approval notification: {notif_err}")

        return jsonify({
            "success": True,
            "message": "Requisition approved successfully and sent to Production Manager for worker assignment",
            "requisition": requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving requisition: {str(e)}")
        return jsonify({"error": str(e)}), 500


def reject_requisition(requisition_id):
    """
    PM rejects a requisition.

    Only requisitions with status='send_to_pm' can be rejected.
    This ensures SE has explicitly sent the requisition for PM review.
    """
    try:
        current_user = g.user
        data = request.get_json()

        reason = data.get('reason', '')
        if not reason:
            return jsonify({"error": "Rejection reason is required"}), 400

        requisition = LabourRequisition.query.filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        # Only reject requisitions that have been sent to PM
        if requisition.status != 'send_to_pm':
            error_msg = "Requisition cannot be rejected"
            if requisition.status == 'pending':
                error_msg = "This requisition is still in draft state and hasn't been sent to PM for review"
            elif requisition.status == 'approved':
                error_msg = "This requisition has already been approved"
            elif requisition.status == 'rejected':
                error_msg = "This requisition has already been rejected"

            return jsonify({"error": error_msg}), 400

        requisition.status = 'rejected'
        requisition.approved_by_user_id = current_user.get('user_id')
        requisition.approved_by_name = current_user.get('full_name', 'Unknown')
        requisition.approval_date = datetime.utcnow()
        requisition.rejection_reason = reason
        requisition.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        # Notify SE that requisition was rejected
        project = Project.query.get(requisition.project_id)
        project_name = project.project_name if project else f'Project #{requisition.project_id}'
        try:
            notification_service.notify_labour_requisition_rejected(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_name=project_name,
                pm_user_id=current_user.get('user_id'),
                pm_name=current_user.get('full_name', 'Unknown'),
                se_user_id=requisition.requested_by_user_id,
                reason=reason
            )
        except Exception as notif_err:
            log.error(f"Failed to send rejection notification: {notif_err}")

        return jsonify({
            "success": True,
            "message": "Requisition rejected",
            "requisition": requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting requisition: {str(e)}")
        return jsonify({"error": str(e)}), 500
