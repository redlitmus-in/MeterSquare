"""
Labour Management Controller
Handles all business logic for the 8-step Labour/Attendance workflow:
1. Production Manager - Add Labour to Registry
2. Site Engineer - Raise Site Requisition
3. Project Manager - Approve/Reject Requisition
4. Production Manager - Allocate & Assign Personnel
5. Site Engineer - Confirm Site Arrival
6. Site Engineer - Daily Attendance Logs
7. Project Manager - Review & Lock Data
8. Admin (HR) - Payroll Processing
"""
from datetime import datetime, date, timedelta
from flask import request, jsonify, g
from config.db import db
from config.logging import get_logger
from models.worker import Worker
from models.labour_requisition import LabourRequisition
from models.labour_arrival import LabourArrival
from models.worker_assignment import WorkerAssignment
from models.daily_attendance import DailyAttendance, AttendanceApprovalHistory
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import func, and_, or_
from utils.whatsapp_service import WhatsAppService
from utils.skill_matcher import skill_matches

log = get_logger()

# Initialize WhatsApp service
whatsapp_service = WhatsAppService()

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Role sets for authorization (normalized without spaces/underscores)
SUPER_ADMIN_ROLES = frozenset(['admin', 'td', 'technicaldirector'])
LABOUR_ADMIN_ROLES = frozenset(['admin', 'td', 'technicaldirector', 'productionmanager'])


def normalize_role(role: str) -> str:
    """Normalize role string for consistent comparison."""
    if not role:
        return ''
    return role.lower().replace(' ', '').replace('_', '').replace('-', '')


def get_user_assigned_project_ids(user_id: int) -> list:
    """
    Get list of project IDs where user is assigned in any role.
    Returns empty list if user_id is None or invalid.
    """
    if not user_id:
        return []

    from models.project import Project

    assigned_projects = Project.query.filter(
        Project.is_deleted == False,
        or_(
            # PM: user_id is JSONB array, check if user_id is in the array
            Project.user_id.contains([user_id]),
            # Site Supervisor/SE
            Project.site_supervisor_id == user_id,
            # MEP Supervisor: mep_supervisor_id is JSONB array
            Project.mep_supervisor_id.contains([user_id]),
            # Estimator
            Project.estimator_id == user_id,
            # Buyer
            Project.buyer_id == user_id
        )
    ).with_entities(Project.project_id).all()

    return [p.project_id for p in assigned_projects]


# =============================================================================
# STEP 1: WORKER REGISTRY (Production Manager)
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
    """Site Engineer creates a labour requisition with multiple labour items"""
    try:
        current_user = g.user
        data = request.get_json()

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
                requisition = LabourRequisition(
                    requisition_code=requisition_code,
                    project_id=data['project_id'],
                    site_name=data['site_name'],
                    required_date=datetime.strptime(data['required_date'], '%Y-%m-%d').date(),
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
                    status='pending',
                    created_by=current_user.get('full_name', 'System')
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

        # TODO: Send notification to PM

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
    """Get requisitions created by the current user"""
    try:
        current_user = g.user
        user_id = current_user.get('user_id')

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 15, type=int), 100)
        status = request.args.get('status')

        query = LabourRequisition.query.filter(
            LabourRequisition.requested_by_user_id == user_id,
            LabourRequisition.is_deleted == False
        )

        if status:
            # Support comma-separated status values (e.g., 'pending,send_to_pm')
            if ',' in status:
                status_list = [s.strip() for s in status.split(',')]
                query = query.filter(LabourRequisition.status.in_(status_list))
            else:
                query = query.filter(LabourRequisition.status == status)

        query = query.order_by(LabourRequisition.created_at.desc())
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

        # TODO: Send notification to PM

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
    """Get requisitions for PM with optional status filter, filtered by user's assigned projects"""
    try:
        current_user = g.user
        user_id = current_user.get('user_id')
        user_role = normalize_role(current_user.get('role', ''))

        # Log the current user details for debugging
        print(f"\n=== get_pending_requisitions called ===")
        print(f"Current User: {current_user.get('full_name')} (ID: {user_id})")
        print(f"Role: {current_user.get('role')} -> Normalized: {user_role}")
        log.info(f"=== get_pending_requisitions called ===")
        log.info(f"Current User: {current_user.get('full_name')} (ID: {user_id})")
        log.info(f"Role: {current_user.get('role')} -> Normalized: {user_role}")

        # Validate user_id
        if not user_id:
            return jsonify({"error": "User ID not found in session"}), 401

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 15, type=int), 100)
        project_id = request.args.get('project_id', type=int)
        status = request.args.get('status', 'pending')  # Default to pending

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
        if user_role not in SUPER_ADMIN_ROLES:
            if user_role == 'pm' or user_role == 'projectmanager':
                # For PENDING tab: filter by project_id (PM's assigned projects)
                # For APPROVED/REJECTED tabs: filter by approved_by_user_id
                if status == 'pending':
                    log.info(f"PM user_id {user_id} - filtering PENDING by project_id")

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

                    log.info(f"PM {user_id} assigned to projects: {assigned_project_ids}")

                    if assigned_project_ids:
                        query = query.filter(LabourRequisition.project_id.in_(assigned_project_ids))
                    else:
                        log.warning(f"No assigned projects found for PM user_id: {user_id}")
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
                    log.info(f"PM user_id {user_id} - filtering {status.upper()} by approved_by_user_id")
                    query = query.filter(LabourRequisition.approved_by_user_id == user_id)
            else:
                # For other roles (SE, etc), use project assignment filtering
                assigned_project_ids = get_user_assigned_project_ids(user_id)
                if assigned_project_ids:
                    query = query.filter(LabourRequisition.project_id.in_(assigned_project_ids))
                else:
                    log.warning(f"No assigned projects found for user_id: {user_id}, role: {user_role}")
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

        log.info(f"Returning {len(paginated.items)} requisitions (Total: {paginated.total})")

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
    """PM approves a requisition"""
    try:
        current_user = g.user

        requisition = LabourRequisition.query.filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        # Allow approving both 'pending' and 'send_to_pm' status
        if requisition.status not in ['pending', 'send_to_pm']:
            return jsonify({"error": "Requisition is not pending or already processed"}), 400

        requisition.status = 'approved'
        requisition.approved_by_user_id = current_user.get('user_id')
        requisition.approved_by_name = current_user.get('full_name', 'Unknown')
        requisition.approval_date = datetime.utcnow()
        requisition.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        log.info(f"Requisition approved: {requisition.requisition_code} by {current_user.get('full_name')}")

        # TODO: Send notification to Production Manager and SE

        return jsonify({
            "success": True,
            "message": "Requisition approved successfully",
            "requisition": requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving requisition: {str(e)}")
        return jsonify({"error": str(e)}), 500


def reject_requisition(requisition_id):
    """PM rejects a requisition"""
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

        # Allow rejecting both 'pending' and 'send_to_pm' status
        if requisition.status not in ['pending', 'send_to_pm']:
            return jsonify({"error": "Requisition is not pending or already processed"}), 400

        requisition.status = 'rejected'
        requisition.approved_by_user_id = current_user.get('user_id')
        requisition.approved_by_name = current_user.get('full_name', 'Unknown')
        requisition.approval_date = datetime.utcnow()
        requisition.rejection_reason = reason
        requisition.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        log.info(f"Requisition rejected: {requisition.requisition_code} by {current_user.get('full_name')}")

        # TODO: Send notification to SE

        return jsonify({
            "success": True,
            "message": "Requisition rejected",
            "requisition": requisition.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting requisition: {str(e)}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# STEP 4: ASSIGN PERSONNEL (Production Manager)
# =============================================================================

def get_approved_requisitions():
    """Get approved requisitions with optional assignment status filter, filtered by user's assigned projects"""
    try:
        current_user = g.user
        user_id = current_user.get('user_id')
        user_role = normalize_role(current_user.get('role', ''))

        # Validate user_id
        if not user_id:
            return jsonify({"error": "User ID not found in session"}), 401

        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 20, type=int), 100)
        assignment_status = request.args.get('assignment_status')  # 'unassigned' or 'assigned'

        query = LabourRequisition.query.options(
            joinedload(LabourRequisition.project)
        ).filter(
            LabourRequisition.status == 'approved',
            LabourRequisition.is_deleted == False
        )

        # Filter by assignment status if provided
        if assignment_status in ['unassigned', 'assigned']:
            query = query.filter(LabourRequisition.assignment_status == assignment_status)

        # Role-based project filtering
        # Admin, TD, and Production Manager can see all approved requisitions
        if user_role not in LABOUR_ADMIN_ROLES:
            assigned_project_ids = get_user_assigned_project_ids(user_id)

            if assigned_project_ids:
                query = query.filter(LabourRequisition.project_id.in_(assigned_project_ids))
            else:
                # User has no assigned projects, return empty result
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
        log.error(f"Error getting approved requisitions: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_available_workers():
    """Get workers available for assignment on a specific date"""
    try:
        skill = request.args.get('skill')
        date_str = request.args.get('date', date.today().isoformat())
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        # Get all active workers
        query = Worker.query.filter(
            Worker.is_deleted == False,
            Worker.status == 'active'
        )

        all_workers = query.all()

        # Filter by skill using flexible matching
        workers = []
        if skill:
            for worker in all_workers:
                if skill_matches(skill, worker.skills or []):
                    workers.append(worker)
        else:
            workers = all_workers

        # Check which workers have active assignments on the date
        # Get assignment details for each worker
        assignments_query = db.session.query(
            WorkerAssignment.worker_id,
            WorkerAssignment.project_id,
            WorkerAssignment.assignment_start_date,
            WorkerAssignment.assignment_end_date
        ).filter(
            WorkerAssignment.is_deleted == False,
            WorkerAssignment.status == 'active',
            WorkerAssignment.assignment_start_date <= target_date,
            or_(
                WorkerAssignment.assignment_end_date.is_(None),
                WorkerAssignment.assignment_end_date >= target_date
            )
        ).all()

        # Create assignment lookup dict
        assigned_workers = {}
        for assignment in assignments_query:
            # Only expose availability date, not project details (security)
            assigned_workers[assignment[0]] = {
                'available_from': assignment[3].isoformat() if assignment[3] else None
            }

        # Build response with ALL workers, marking assignment status
        workers_response = []
        available_count = 0

        for worker in workers:
            worker_dict = worker.to_dict_minimal()
            is_assigned = worker.worker_id in assigned_workers

            if is_assigned:
                worker_dict['is_assigned'] = True
                worker_dict['assignment'] = assigned_workers[worker.worker_id]
            else:
                worker_dict['is_assigned'] = False
                available_count += 1

            workers_response.append(worker_dict)

        return jsonify({
            "success": True,
            "workers": workers_response,
            "total_available": available_count,
            "total_matching": len(workers_response)
        }), 200

    except Exception as e:
        log.error(f"Error getting available workers: {str(e)}")
        return jsonify({"error": str(e)}), 500


def assign_workers_to_requisition(requisition_id):
    """Production Manager assigns workers to an approved requisition"""
    try:
        current_user = g.user
        data = request.get_json()

        worker_ids = data.get('worker_ids', [])
        if not worker_ids:
            return jsonify({"error": "worker_ids is required"}), 400

        requisition = LabourRequisition.query.filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        if requisition.status != 'approved':
            return jsonify({"error": "Requisition is not approved"}), 400

        if requisition.assignment_status == 'assigned':
            return jsonify({"error": "Requisition already has assigned workers"}), 400

        # Verify all workers exist and are active
        workers = Worker.query.filter(
            Worker.worker_id.in_(worker_ids),
            Worker.is_deleted == False,
            Worker.status == 'active'
        ).all()

        if len(workers) != len(worker_ids):
            return jsonify({"error": "Some workers are invalid or inactive"}), 400

        # CRITICAL: Verify no workers are already assigned on the target date (server-side validation)
        target_date = requisition.required_date
        already_assigned = db.session.query(WorkerAssignment.worker_id).filter(
            WorkerAssignment.worker_id.in_(worker_ids),
            WorkerAssignment.status == 'active',
            WorkerAssignment.is_deleted == False,
            WorkerAssignment.assignment_start_date <= target_date,
            or_(
                WorkerAssignment.assignment_end_date.is_(None),
                WorkerAssignment.assignment_end_date >= target_date
            )
        ).all()

        if already_assigned:
            assigned_ids = [a[0] for a in already_assigned]
            assigned_workers_info = [w for w in workers if w.worker_id in assigned_ids]
            worker_names = ', '.join([w.full_name for w in assigned_workers_info])
            return jsonify({
                "error": f"Cannot assign: {worker_names} already assigned to other projects on {target_date.strftime('%Y-%m-%d')}"
            }), 400

        # Create worker assignments
        for worker in workers:
            assignment = WorkerAssignment(
                worker_id=worker.worker_id,
                project_id=requisition.project_id,
                requisition_id=requisition.requisition_id,
                assigned_by_user_id=current_user.get('user_id'),
                assignment_type='regular',
                assignment_start_date=requisition.required_date,
                hourly_rate_override=None,
                role_at_site=requisition.skill_required,
                status='active',
                created_by=current_user.get('full_name', 'System')
            )
            db.session.add(assignment)

            # Create arrival record
            arrival = LabourArrival(
                requisition_id=requisition.requisition_id,
                worker_id=worker.worker_id,
                project_id=requisition.project_id,
                arrival_date=requisition.required_date,
                arrival_status='assigned',
                created_by=current_user.get('full_name', 'System')
            )
            db.session.add(arrival)

        # Update requisition
        requisition.assignment_status = 'assigned'
        requisition.work_status = 'assigned'  # Update work status when workers are assigned
        requisition.assigned_worker_ids = worker_ids
        requisition.assigned_by_user_id = current_user.get('user_id')
        requisition.assigned_by_name = current_user.get('full_name', 'Unknown')
        requisition.assignment_date = datetime.utcnow()
        requisition.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        log.info(f"Workers assigned to requisition: {requisition.requisition_code} by {current_user.get('full_name')}")

        # Send WhatsApp notification to workers
        whatsapp_results = []
        notification_sent_count = 0

        # Get project name for the message
        project_name = requisition.project.project_name if requisition.project else f"Project #{requisition.project_id}"
        formatted_date = requisition.required_date.strftime('%d %b %Y') if requisition.required_date else 'N/A'

        for worker in workers:
            if worker.phone:
                # Create assignment notification message
                message = f"""🔔 *Work Assignment Notification*

Hello *{worker.full_name}*,

You have been assigned to a new work order:

📋 *Assignment Details:*
• Requisition: {requisition.requisition_code}
• Project: {project_name}
• Site: {requisition.site_name}
• Work: {requisition.work_description}
• Role: {requisition.skill_required}
• Date: {formatted_date}

Please report to the site on time. Contact your supervisor for any queries.

_MeterSquare Interiors LLC_"""

                # Mask phone number for response (PII protection)
                masked_phone = f"{worker.phone[:4]}****{worker.phone[-4:]}" if len(worker.phone) > 8 else "****"

                try:
                    result = whatsapp_service.send_message(worker.phone, message)
                    if result.get('success'):
                        notification_sent_count += 1
                        log.info(f"WhatsApp sent to worker {worker.worker_code}")
                    else:
                        log.warning(f"WhatsApp failed for worker {worker.worker_code}: {result.get('message')}")
                    whatsapp_results.append({
                        'worker_id': worker.worker_id,
                        'worker_code': worker.worker_code,
                        'phone': masked_phone,
                        'success': result.get('success')
                    })
                except Exception as wa_error:
                    log.error(f"WhatsApp error for worker {worker.worker_code}: {str(wa_error)}")
                    whatsapp_results.append({
                        'worker_id': worker.worker_id,
                        'worker_code': worker.worker_code,
                        'phone': masked_phone,
                        'success': False
                    })
            else:
                log.warning(f"No phone number for worker {worker.worker_code}")
                whatsapp_results.append({
                    'worker_id': worker.worker_id,
                    'worker_code': worker.worker_code,
                    'phone': None,
                    'success': False
                })

        # Update whatsapp_notified flag if at least one notification was sent
        if notification_sent_count > 0:
            requisition.whatsapp_notified = True
            db.session.commit()

        return jsonify({
            "success": True,
            "message": f"{len(workers)} workers assigned successfully. WhatsApp sent to {notification_sent_count} workers.",
            "requisition": requisition.to_dict(),
            "whatsapp_notifications": whatsapp_results
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error assigning workers: {str(e)}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# STEP 5: ARRIVAL CONFIRMATION (Site Engineer)
# =============================================================================

def get_arrivals_for_date(project_id, date_str):
    """Get assigned workers for arrival confirmation"""
    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        arrivals = LabourArrival.query.options(
            joinedload(LabourArrival.worker)
        ).filter(
            LabourArrival.project_id == project_id,
            LabourArrival.arrival_date == target_date,
            LabourArrival.is_deleted == False
        ).all()

        return jsonify({
            "success": True,
            "arrivals": [a.to_dict_with_worker() for a in arrivals],
            "date": date_str
        }), 200

    except Exception as e:
        log.error(f"Error getting arrivals: {str(e)}")
        return jsonify({"error": str(e)}), 500


def confirm_arrival():
    """Site Engineer confirms worker arrival"""
    try:
        current_user = g.user
        data = request.get_json()

        arrival_id = data.get('arrival_id')
        arrival_time = data.get('arrival_time')  # HH:MM format

        if not arrival_id:
            return jsonify({"error": "arrival_id is required"}), 400

        arrival = LabourArrival.query.filter_by(
            arrival_id=arrival_id,
            is_deleted=False
        ).first()

        if not arrival:
            return jsonify({"error": "Arrival record not found"}), 404

        if arrival.arrival_status == 'confirmed':
            return jsonify({"error": "Arrival already confirmed"}), 400

        arrival.arrival_status = 'confirmed'
        arrival.arrival_time = arrival_time or datetime.now().strftime('%H:%M')
        arrival.confirmed_at = datetime.utcnow()
        arrival.confirmed_by_user_id = current_user.get('user_id')

        db.session.commit()

        log.info(f"Arrival confirmed: {arrival_id} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Arrival confirmed",
            "arrival": arrival.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error confirming arrival: {str(e)}")
        return jsonify({"error": str(e)}), 500


def mark_no_show():
    """Site Engineer marks worker as no-show"""
    try:
        current_user = g.user
        data = request.get_json()

        arrival_id = data.get('arrival_id')

        if not arrival_id:
            return jsonify({"error": "arrival_id is required"}), 400

        arrival = LabourArrival.query.filter_by(
            arrival_id=arrival_id,
            is_deleted=False
        ).first()

        if not arrival:
            return jsonify({"error": "Arrival record not found"}), 404

        arrival.arrival_status = 'no_show'
        arrival.confirmed_at = datetime.utcnow()
        arrival.confirmed_by_user_id = current_user.get('user_id')

        db.session.commit()

        log.info(f"Worker marked as no-show: {arrival_id} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Worker marked as no-show",
            "arrival": arrival.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error marking no-show: {str(e)}")
        return jsonify({"error": str(e)}), 500


def mark_departure():
    """Site Engineer marks worker departure (clock out)"""
    import re
    try:
        current_user = g.user
        data = request.get_json()

        # Role-based authorization
        user_role = current_user.get('role', '').lower().replace(' ', '').replace('_', '')
        allowed_roles = ['se', 'siteengineer', 'pm', 'projectmanager', 'admin', 'productionmanager', 'td', 'technicaldirector']
        if user_role not in allowed_roles:
            return jsonify({"error": "Unauthorized. Only Site Engineers, Project Managers, or Admins can mark departures."}), 403

        arrival_id = data.get('arrival_id')
        departure_time = data.get('departure_time')  # HH:MM format

        if not arrival_id:
            return jsonify({"error": "arrival_id is required"}), 400

        # Validate time format if provided
        if departure_time:
            if not re.match(r'^([01]?[0-9]|2[0-3]):[0-5][0-9]$', departure_time):
                return jsonify({"error": "Invalid departure_time format. Use HH:MM (e.g., 17:30)"}), 400

        arrival = LabourArrival.query.filter_by(
            arrival_id=arrival_id,
            is_deleted=False
        ).first()

        if not arrival:
            return jsonify({"error": "Arrival record not found"}), 404

        if arrival.arrival_status != 'confirmed':
            return jsonify({"error": "Worker must be confirmed as arrived before marking departure"}), 400

        if arrival.departure_time:
            return jsonify({"error": "Departure already recorded"}), 400

        # Calculate departure time
        final_departure_time = departure_time or datetime.now().strftime('%H:%M')

        # Validate departure time is after arrival time
        if arrival.arrival_time and final_departure_time:
            try:
                arr_parts = arrival.arrival_time.split(':')
                dep_parts = final_departure_time.split(':')
                arrival_minutes = int(arr_parts[0]) * 60 + int(arr_parts[1])
                departure_minutes = int(dep_parts[0]) * 60 + int(dep_parts[1])
                if departure_minutes < arrival_minutes:
                    return jsonify({"error": f"Departure time ({final_departure_time}) cannot be before arrival time ({arrival.arrival_time})"}), 400
            except (ValueError, IndexError):
                pass  # If parsing fails, allow the time through

        arrival.arrival_status = 'departed'
        arrival.departure_time = final_departure_time
        arrival.departed_at = datetime.utcnow()

        # Auto-create DailyAttendance record for payroll processing
        # Check if attendance record already exists
        existing_attendance = DailyAttendance.query.filter_by(
            worker_id=arrival.worker_id,
            project_id=arrival.project_id,
            attendance_date=arrival.arrival_date,
            is_deleted=False
        ).first()

        if not existing_attendance:
            # Get worker's hourly rate
            worker = Worker.query.get(arrival.worker_id)
            if worker:
                # Parse arrival and departure times to datetime
                clock_in_dt = datetime.combine(
                    arrival.arrival_date,
                    datetime.strptime(arrival.arrival_time, '%H:%M').time()
                )
                clock_out_dt = datetime.combine(
                    arrival.arrival_date,
                    datetime.strptime(final_departure_time, '%H:%M').time()
                )

                attendance = DailyAttendance(
                    worker_id=arrival.worker_id,
                    project_id=arrival.project_id,
                    attendance_date=arrival.arrival_date,
                    clock_in_time=clock_in_dt,
                    clock_out_time=clock_out_dt,
                    hourly_rate=worker.hourly_rate,
                    attendance_status='completed',
                    entered_by_user_id=current_user.get('user_id'),
                    entered_by_role=current_user.get('role', 'SE'),
                    created_by=current_user.get('full_name', 'System')
                )
                # Calculate hours and cost
                attendance.calculate_hours_and_cost()
                db.session.add(attendance)
                log.info(f"Auto-created attendance record for worker {arrival.worker_id}")

        db.session.commit()

        log.info(f"Worker departure marked: {arrival_id} at {arrival.departure_time} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": f"Worker clocked out at {arrival.departure_time}",
            "arrival": arrival.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error marking departure: {str(e)}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# STEP 6: ATTENDANCE LOGS (Site Engineer)
# =============================================================================

def clock_in_worker():
    """Site Engineer clocks in a worker"""
    try:
        current_user = g.user
        data = request.get_json()

        worker_id = data.get('worker_id')
        project_id = data.get('project_id')
        attendance_date = data.get('attendance_date', date.today().isoformat())
        clock_in_time = data.get('clock_in_time')  # ISO format or HH:MM

        if not worker_id or not project_id:
            return jsonify({"error": "worker_id and project_id are required"}), 400

        target_date = datetime.strptime(attendance_date, '%Y-%m-%d').date()

        # Check if attendance record already exists
        existing = DailyAttendance.query.filter_by(
            worker_id=worker_id,
            project_id=project_id,
            attendance_date=target_date,
            is_deleted=False
        ).first()

        if existing:
            if existing.clock_in_time:
                return jsonify({"error": "Worker already clocked in for this day"}), 400
            attendance = existing
        else:
            # Get worker's hourly rate
            worker = Worker.query.get(worker_id)
            if not worker:
                return jsonify({"error": "Worker not found"}), 404

            attendance = DailyAttendance(
                worker_id=worker_id,
                project_id=project_id,
                attendance_date=target_date,
                hourly_rate=worker.hourly_rate,
                entered_by_user_id=current_user.get('user_id'),
                entered_by_role=current_user.get('role', 'SE'),
                created_by=current_user.get('full_name', 'System')
            )
            db.session.add(attendance)

        # Parse clock in time
        if clock_in_time:
            if 'T' in clock_in_time:
                attendance.clock_in_time = datetime.fromisoformat(clock_in_time)
            else:
                # HH:MM format
                time_parts = clock_in_time.split(':')
                attendance.clock_in_time = datetime.combine(
                    target_date,
                    datetime.strptime(clock_in_time, '%H:%M').time()
                )
        else:
            attendance.clock_in_time = datetime.now()

        attendance.attendance_status = 'present'
        attendance.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        log.info(f"Worker clocked in: {worker_id} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Worker clocked in successfully",
            "attendance": attendance.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error clocking in worker: {str(e)}")
        return jsonify({"error": str(e)}), 500


def clock_out_worker():
    """Site Engineer clocks out a worker"""
    try:
        current_user = g.user
        data = request.get_json()

        worker_id = data.get('worker_id')
        project_id = data.get('project_id')
        attendance_date = data.get('attendance_date', date.today().isoformat())
        clock_out_time = data.get('clock_out_time')
        break_minutes = data.get('break_duration_minutes', 0)

        if not worker_id or not project_id:
            return jsonify({"error": "worker_id and project_id are required"}), 400

        target_date = datetime.strptime(attendance_date, '%Y-%m-%d').date()

        attendance = DailyAttendance.query.filter_by(
            worker_id=worker_id,
            project_id=project_id,
            attendance_date=target_date,
            is_deleted=False
        ).first()

        if not attendance:
            return jsonify({"error": "No clock-in record found for this worker"}), 404

        if not attendance.clock_in_time:
            return jsonify({"error": "Worker has not clocked in"}), 400

        if attendance.clock_out_time:
            return jsonify({"error": "Worker already clocked out"}), 400

        # Parse clock out time
        if clock_out_time:
            if 'T' in clock_out_time:
                attendance.clock_out_time = datetime.fromisoformat(clock_out_time)
            else:
                attendance.clock_out_time = datetime.combine(
                    target_date,
                    datetime.strptime(clock_out_time, '%H:%M').time()
                )
        else:
            attendance.clock_out_time = datetime.now()

        attendance.break_duration_minutes = break_minutes
        attendance.attendance_status = 'completed'

        # Calculate hours and cost
        attendance.calculate_hours_and_cost()

        attendance.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        log.info(f"Worker clocked out: {worker_id} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Worker clocked out successfully",
            "attendance": attendance.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error clocking out worker: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_daily_attendance(project_id, date_str):
    """Get daily attendance records for a project"""
    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        records = DailyAttendance.query.options(
            joinedload(DailyAttendance.worker)
        ).filter(
            DailyAttendance.project_id == project_id,
            DailyAttendance.attendance_date == target_date,
            DailyAttendance.is_deleted == False
        ).all()

        return jsonify({
            "success": True,
            "attendance": [r.to_dict() for r in records],
            "date": date_str,
            "total_records": len(records)
        }), 200

    except Exception as e:
        log.error(f"Error getting daily attendance: {str(e)}")
        return jsonify({"error": str(e)}), 500


def update_attendance(attendance_id):
    """Update an attendance record (before lock)"""
    try:
        current_user = g.user
        data = request.get_json()

        attendance = DailyAttendance.query.filter_by(
            attendance_id=attendance_id,
            is_deleted=False
        ).first()

        if not attendance:
            return jsonify({"error": "Attendance record not found"}), 404

        if attendance.approval_status == 'locked':
            return jsonify({"error": "Cannot modify locked attendance"}), 400

        # Update fields
        if 'clock_in_time' in data and data['clock_in_time']:
            attendance.original_clock_in = attendance.clock_in_time
            if 'T' in data['clock_in_time']:
                attendance.clock_in_time = datetime.fromisoformat(data['clock_in_time'])
            else:
                attendance.clock_in_time = datetime.combine(
                    attendance.attendance_date,
                    datetime.strptime(data['clock_in_time'], '%H:%M').time()
                )

        if 'clock_out_time' in data and data['clock_out_time']:
            attendance.original_clock_out = attendance.clock_out_time
            if 'T' in data['clock_out_time']:
                attendance.clock_out_time = datetime.fromisoformat(data['clock_out_time'])
            else:
                attendance.clock_out_time = datetime.combine(
                    attendance.attendance_date,
                    datetime.strptime(data['clock_out_time'], '%H:%M').time()
                )

        if 'break_duration_minutes' in data:
            attendance.break_duration_minutes = int(data['break_duration_minutes'])

        if 'correction_reason' in data:
            attendance.correction_reason = data['correction_reason']
            attendance.corrected_by_user_id = current_user.get('user_id')
            attendance.corrected_at = datetime.utcnow()

        if 'entry_notes' in data:
            attendance.entry_notes = data['entry_notes']

        # Recalculate hours and cost
        attendance.calculate_hours_and_cost()
        attendance.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Attendance updated successfully",
            "attendance": attendance.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating attendance: {str(e)}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# STEP 7: REVIEW & LOCK (Project Manager)
# =============================================================================

def get_attendance_to_lock():
    """Get attendance records with optional status filter"""
    try:
        project_id = request.args.get('project_id', type=int)
        date_str = request.args.get('date')
        approval_status = request.args.get('approval_status', 'pending')  # 'pending' or 'locked'

        query = DailyAttendance.query.options(
            joinedload(DailyAttendance.worker),
            joinedload(DailyAttendance.project)
        ).filter(
            DailyAttendance.is_deleted == False
        )

        # Filter by approval status
        if approval_status in ['pending', 'locked']:
            query = query.filter(DailyAttendance.approval_status == approval_status)

        if project_id:
            query = query.filter(DailyAttendance.project_id == project_id)

        if date_str:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            query = query.filter(DailyAttendance.attendance_date == target_date)

        query = query.order_by(DailyAttendance.attendance_date.desc())
        records = query.all()

        return jsonify({
            "success": True,
            "attendance": [r.to_dict_for_lock() for r in records],
            "total_records": len(records)
        }), 200

    except Exception as e:
        log.error(f"Error getting attendance: {str(e)}")
        return jsonify({"error": str(e)}), 500


def lock_attendance(attendance_id):
    """PM locks a single attendance record"""
    try:
        current_user = g.user
        data = request.get_json() or {}

        attendance = DailyAttendance.query.filter_by(
            attendance_id=attendance_id,
            is_deleted=False
        ).first()

        if not attendance:
            return jsonify({"error": "Attendance record not found"}), 404

        if attendance.approval_status == 'locked':
            return jsonify({"error": "Attendance already locked"}), 400

        # Lock the record
        attendance.approval_status = 'locked'
        attendance.approved_by_user_id = current_user.get('user_id')
        attendance.approved_by_name = current_user.get('full_name', 'Unknown')
        attendance.approval_date = datetime.utcnow()
        attendance.last_modified_by = current_user.get('full_name', 'System')

        # Create history record
        history = AttendanceApprovalHistory(
            attendance_id=attendance_id,
            action='locked',
            action_by_user_id=current_user.get('user_id'),
            action_by_name=current_user.get('full_name', 'Unknown'),
            action_by_role='PM',
            comments=data.get('comments'),
            previous_status='pending',
            new_status='locked',
            data_snapshot={
                'total_hours': attendance.total_hours,
                'total_cost': attendance.total_cost,
                'clock_in': attendance.clock_in_time.isoformat() if attendance.clock_in_time else None,
                'clock_out': attendance.clock_out_time.isoformat() if attendance.clock_out_time else None
            }
        )
        db.session.add(history)

        db.session.commit()

        log.info(f"Attendance locked: {attendance_id} by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": "Attendance locked for payroll",
            "attendance": attendance.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error locking attendance: {str(e)}")
        return jsonify({"error": str(e)}), 500


def lock_day_attendance():
    """PM locks all attendance records for a specific day"""
    try:
        current_user = g.user
        data = request.get_json()

        project_id = data.get('project_id')
        date_str = data.get('date')

        if not project_id or not date_str:
            return jsonify({"error": "project_id and date are required"}), 400

        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        records = DailyAttendance.query.filter(
            DailyAttendance.project_id == project_id,
            DailyAttendance.attendance_date == target_date,
            DailyAttendance.approval_status == 'pending',
            DailyAttendance.is_deleted == False
        ).all()

        locked_count = 0
        for attendance in records:
            attendance.approval_status = 'locked'
            attendance.approved_by_user_id = current_user.get('user_id')
            attendance.approved_by_name = current_user.get('full_name', 'Unknown')
            attendance.approval_date = datetime.utcnow()
            attendance.last_modified_by = current_user.get('full_name', 'System')

            # Create history record
            history = AttendanceApprovalHistory(
                attendance_id=attendance.attendance_id,
                action='locked',
                action_by_user_id=current_user.get('user_id'),
                action_by_name=current_user.get('full_name', 'Unknown'),
                action_by_role='PM',
                previous_status='pending',
                new_status='locked'
            )
            db.session.add(history)
            locked_count += 1

        db.session.commit()

        log.info(f"Day locked: {date_str} ({locked_count} records) by {current_user.get('full_name')}")

        return jsonify({
            "success": True,
            "message": f"{locked_count} attendance records locked for payroll",
            "locked_count": locked_count
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error locking day attendance: {str(e)}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# STEP 8: PAYROLL (Admin/HR)
# =============================================================================

def get_locked_for_payroll():
    """Get locked attendance records for payroll processing"""
    try:
        project_id = request.args.get('project_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        query = DailyAttendance.query.options(
            joinedload(DailyAttendance.worker)
        ).filter(
            DailyAttendance.approval_status == 'locked',
            DailyAttendance.is_deleted == False
        )

        if project_id:
            query = query.filter(DailyAttendance.project_id == project_id)

        if start_date:
            query = query.filter(DailyAttendance.attendance_date >= datetime.strptime(start_date, '%Y-%m-%d').date())

        if end_date:
            query = query.filter(DailyAttendance.attendance_date <= datetime.strptime(end_date, '%Y-%m-%d').date())

        query = query.order_by(DailyAttendance.attendance_date.desc())
        records = query.all()

        # Calculate totals
        total_hours = sum(r.total_hours or 0 for r in records)
        total_cost = sum(r.total_cost or 0 for r in records)

        return jsonify({
            "success": True,
            "attendance": [r.to_dict() for r in records],
            "summary": {
                "total_records": len(records),
                "total_hours": round(total_hours, 2),
                "total_cost": round(total_cost, 2)
            }
        }), 200

    except Exception as e:
        log.error(f"Error getting locked attendance: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_payroll_summary():
    """Get payroll summary grouped by project and worker (nested structure)"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        project_id = request.args.get('project_id', type=int)

        if not start_date or not end_date:
            return jsonify({"error": "start_date and end_date are required"}), 400

        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()

        # Import Project model
        from models.project import Project
        from models.labour_requisition import LabourRequisition

        # Aggregate by project, requisition, and worker
        query = db.session.query(
            DailyAttendance.project_id,
            Project.project_name,
            Project.project_code,
            DailyAttendance.requisition_id,
            LabourRequisition.requisition_code,
            LabourRequisition.work_description,
            LabourRequisition.skill_required,
            LabourRequisition.site_name,
            LabourRequisition.workers_count,
            DailyAttendance.worker_id,
            Worker.worker_code,
            Worker.full_name,
            Worker.hourly_rate,
            func.count(DailyAttendance.attendance_id).label('days_worked'),
            func.sum(DailyAttendance.total_hours).label('total_hours'),
            func.sum(DailyAttendance.regular_hours).label('regular_hours'),
            func.sum(DailyAttendance.overtime_hours).label('overtime_hours'),
            func.sum(DailyAttendance.total_cost).label('total_cost')
        ).join(Worker).join(Project).outerjoin(
            LabourRequisition,
            DailyAttendance.requisition_id == LabourRequisition.requisition_id
        ).filter(
            DailyAttendance.approval_status == 'locked',
            DailyAttendance.is_deleted == False,
            DailyAttendance.attendance_date >= start,
            DailyAttendance.attendance_date <= end
        )

        # Filter by project if specified
        if project_id:
            query = query.filter(DailyAttendance.project_id == project_id)

        results = query.group_by(
            DailyAttendance.project_id,
            Project.project_name,
            Project.project_code,
            DailyAttendance.requisition_id,
            LabourRequisition.requisition_code,
            LabourRequisition.work_description,
            LabourRequisition.skill_required,
            LabourRequisition.site_name,
            LabourRequisition.workers_count,
            DailyAttendance.worker_id,
            Worker.worker_code,
            Worker.full_name,
            Worker.hourly_rate
        ).order_by(Project.project_name, LabourRequisition.requisition_code, Worker.full_name).all()

        # Group by project -> requisition -> workers (nested structure)
        projects_dict = {}
        flat_summary = []  # Keep flat list for backwards compatibility

        for r in results:
            # Build flat summary (backwards compatible)
            flat_summary.append({
                'worker_id': r.worker_id,
                'worker_code': r.worker_code,
                'worker_name': r.full_name,
                'project_id': r.project_id,
                'project_name': r.project_name,
                'requisition_id': r.requisition_id,
                'average_hourly_rate': float(r.hourly_rate) if r.hourly_rate else 0,
                'total_days': r.days_worked,
                'total_hours': round(float(r.total_hours or 0), 2),
                'total_regular_hours': round(float(r.regular_hours or 0), 2),
                'total_overtime_hours': round(float(r.overtime_hours or 0), 2),
                'total_cost': round(float(r.total_cost or 0), 2)
            })

            # Build nested structure: Project -> Requisition -> Workers
            if r.project_id not in projects_dict:
                projects_dict[r.project_id] = {
                    'project_id': r.project_id,
                    'project_name': r.project_name,
                    'project_code': r.project_code,
                    'total_hours': 0,
                    'total_regular_hours': 0,
                    'total_overtime_hours': 0,
                    'total_cost': 0,
                    'total_days': 0,
                    'worker_count': 0,
                    'requisitions': {}
                }

            proj = projects_dict[r.project_id]

            # Group by requisition within project
            req_key = r.requisition_id if r.requisition_id else 'no_requisition'
            if req_key not in proj['requisitions']:
                proj['requisitions'][req_key] = {
                    'requisition_id': r.requisition_id,
                    'requisition_code': r.requisition_code if r.requisition_id else 'General Work',
                    'work_description': r.work_description if r.requisition_id else 'No Requisition',
                    'skill_required': r.skill_required if r.requisition_id else 'General',
                    'site_name': r.site_name if r.requisition_id else None,
                    'workers_count': r.workers_count if r.requisition_id else None,
                    'total_hours': 0,
                    'total_regular_hours': 0,
                    'total_overtime_hours': 0,
                    'total_cost': 0,
                    'total_days': 0,
                    'workers': []
                }

            req = proj['requisitions'][req_key]
            req['workers'].append({
                'worker_id': r.worker_id,
                'worker_code': r.worker_code,
                'worker_name': r.full_name,
                'average_hourly_rate': float(r.hourly_rate) if r.hourly_rate else 0,
                'total_days': r.days_worked,
                'total_hours': round(float(r.total_hours or 0), 2),
                'total_regular_hours': round(float(r.regular_hours or 0), 2),
                'total_overtime_hours': round(float(r.overtime_hours or 0), 2),
                'total_cost': round(float(r.total_cost or 0), 2)
            })

            # Update requisition totals
            req['total_hours'] += float(r.total_hours or 0)
            req['total_regular_hours'] += float(r.regular_hours or 0)
            req['total_overtime_hours'] += float(r.overtime_hours or 0)
            req['total_cost'] += float(r.total_cost or 0)
            req['total_days'] += r.days_worked

            # Update project totals
            proj['total_hours'] += float(r.total_hours or 0)
            proj['total_regular_hours'] += float(r.regular_hours or 0)
            proj['total_overtime_hours'] += float(r.overtime_hours or 0)
            proj['total_cost'] += float(r.total_cost or 0)
            proj['total_days'] += r.days_worked

        # Round project and requisition totals, convert requisitions dict to list
        grouped_data = []
        for proj in projects_dict.values():
            proj['total_hours'] = round(proj['total_hours'], 2)
            proj['total_regular_hours'] = round(proj['total_regular_hours'], 2)
            proj['total_overtime_hours'] = round(proj['total_overtime_hours'], 2)
            proj['total_cost'] = round(proj['total_cost'], 2)

            # Convert requisitions dict to list and round totals
            requisitions_list = []
            total_workers_in_project = 0
            for req in proj['requisitions'].values():
                req['total_hours'] = round(req['total_hours'], 2)
                req['total_regular_hours'] = round(req['total_regular_hours'], 2)
                req['total_overtime_hours'] = round(req['total_overtime_hours'], 2)
                req['total_cost'] = round(req['total_cost'], 2)
                total_workers_in_project += len(req['workers'])
                requisitions_list.append(req)

            proj['requisitions'] = requisitions_list
            proj['worker_count'] = total_workers_in_project
            grouped_data.append(proj)

        grand_total = sum(p['total_cost'] for p in grouped_data)
        total_hours = sum(p['total_hours'] for p in grouped_data)

        return jsonify({
            "success": True,
            "payroll_summary": flat_summary,  # Backwards compatible flat list
            "grouped_by_project": grouped_data,  # New nested structure
            "period": {
                "start_date": start_date,
                "end_date": end_date
            },
            "grand_total": round(grand_total, 2),
            "total_hours": round(total_hours, 2),
            "total_workers": len(flat_summary),
            "total_projects": len(grouped_data)
        }), 200

    except Exception as e:
        log.error(f"Error getting payroll summary: {str(e)}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# DASHBOARD & REPORTS
# =============================================================================

def get_labour_dashboard():
    """Get dashboard statistics for labour management, filtered by user's assigned projects"""
    try:
        current_user = g.user
        user_id = current_user.get('user_id')
        user_role = normalize_role(current_user.get('role', ''))

        # Validate user_id
        if not user_id:
            return jsonify({"error": "User ID not found in session"}), 401

        today = date.today()

        # Role-based project filtering
        # Admin, TD, and Production Manager can see all stats
        assigned_project_ids = None

        if user_role not in LABOUR_ADMIN_ROLES:
            assigned_project_ids = get_user_assigned_project_ids(user_id)

        # Build queries with optional project filtering
        pending_req_query = LabourRequisition.query.filter(
            LabourRequisition.status == 'pending',
            LabourRequisition.is_deleted == False
        )
        approved_unassigned_query = LabourRequisition.query.filter(
            LabourRequisition.status == 'approved',
            LabourRequisition.assignment_status == 'unassigned',
            LabourRequisition.is_deleted == False
        )
        arrivals_pending_query = LabourArrival.query.filter(
            LabourArrival.arrival_date == today,
            LabourArrival.arrival_status == 'assigned',
            LabourArrival.is_deleted == False
        )
        arrivals_confirmed_query = LabourArrival.query.filter(
            LabourArrival.arrival_date == today,
            LabourArrival.arrival_status == 'confirmed',
            LabourArrival.is_deleted == False
        )
        pending_lock_query = DailyAttendance.query.filter(
            DailyAttendance.approval_status == 'pending',
            DailyAttendance.is_deleted == False
        )

        # Apply project filter if user has restricted access
        if assigned_project_ids is not None:
            if assigned_project_ids:
                pending_req_query = pending_req_query.filter(
                    LabourRequisition.project_id.in_(assigned_project_ids)
                )
                approved_unassigned_query = approved_unassigned_query.filter(
                    LabourRequisition.project_id.in_(assigned_project_ids)
                )
                arrivals_pending_query = arrivals_pending_query.filter(
                    LabourArrival.project_id.in_(assigned_project_ids)
                )
                arrivals_confirmed_query = arrivals_confirmed_query.filter(
                    LabourArrival.project_id.in_(assigned_project_ids)
                )
                pending_lock_query = pending_lock_query.filter(
                    DailyAttendance.project_id.in_(assigned_project_ids)
                )
            else:
                # User has no assigned projects, return zero stats
                return jsonify({
                    "success": True,
                    "dashboard": {
                        'total_workers': 0,
                        'pending_requisitions': 0,
                        'approved_unassigned': 0,
                        'today_arrivals_pending': 0,
                        'today_arrivals_confirmed': 0,
                        'pending_lock': 0
                    },
                    "date": today.isoformat()
                }), 200

        stats = {
            'total_workers': Worker.query.filter(Worker.is_deleted == False, Worker.status == 'active').count(),
            'pending_requisitions': pending_req_query.count(),
            'approved_unassigned': approved_unassigned_query.count(),
            'today_arrivals_pending': arrivals_pending_query.count(),
            'today_arrivals_confirmed': arrivals_confirmed_query.count(),
            'pending_lock': pending_lock_query.count()
        }

        return jsonify({
            "success": True,
            "dashboard": stats,
            "date": today.isoformat()
        }), 200

    except Exception as e:
        log.error(f"Error getting dashboard: {str(e)}")
        return jsonify({"error": str(e)}), 500
