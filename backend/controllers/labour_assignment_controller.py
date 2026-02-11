"""
Labour Assignment Controller
Steps 4-6: Assign Personnel + Arrivals + Attendance Logs
"""

__all__ = [
    'get_approved_requisitions', 'get_available_workers',
    'assign_workers_to_requisition', 'retain_workers_for_next_day',
    'get_arrivals_for_date', 'confirm_arrival', 'mark_no_show', 'mark_departure',
    'clock_in_worker', 'clock_out_worker', 'get_daily_attendance', 'update_attendance',
]
from datetime import datetime, date, timedelta
from flask import request, jsonify, g
from config.db import db
from models.worker import Worker
from models.labour_requisition import LabourRequisition
from models.labour_arrival import LabourArrival
from models.worker_assignment import WorkerAssignment
from models.daily_attendance import DailyAttendance
from models.project import Project
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import func, and_, or_
from utils.skill_matcher import skill_matches
from utils.comprehensive_notification_service import notification_service
from controllers.labour_helpers import (
    log, whatsapp_service, normalize_role, get_user_assigned_project_ids,
    SUPER_ADMIN_ROLES, LABOUR_ADMIN_ROLES
)


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
        requisition_id = request.args.get('requisition_id', type=int)

        # Get requisition to check time range if provided
        target_requisition = None
        if requisition_id:
            target_requisition = LabourRequisition.query.get(requisition_id)

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

        # Check which workers have active assignments on the target date
        # We need to check both WorkerAssignment AND LabourArrival tables
        # to determine if worker is truly unavailable

        today = datetime.utcnow().date()
        assigned_workers = {}

        # Only check for assignments on today or past dates
        # Future dates don't need conflict checking
        if target_date <= today:
            # Find requisitions assigned for the target date
            requisitions_on_date = db.session.query(LabourRequisition).filter(
                LabourRequisition.required_date == target_date,
                LabourRequisition.is_deleted == False,
                LabourRequisition.assignment_status == 'assigned'
            ).all()

            for req in requisitions_on_date:
                if req.assigned_worker_ids:
                    for worker_id in req.assigned_worker_ids:
                        # Check if worker has departed from this assignment
                        arrival = LabourArrival.query.filter_by(
                            requisition_id=req.requisition_id,
                            worker_id=worker_id,
                            arrival_date=target_date,
                            is_deleted=False
                        ).first()

                        # If target requisition has time range, check for time overlap
                        is_unavailable = False
                        if target_requisition and target_requisition.start_time and target_requisition.end_time and req.start_time and req.end_time:
                            # Check time overlap: new_start < existing_end AND new_end > existing_start
                            if (target_requisition.start_time < req.end_time and
                                target_requisition.end_time > req.start_time):
                                is_unavailable = True
                        else:
                            # No time info available, use departure status
                            # Worker is unavailable if:
                            # 1. No arrival record exists yet (assigned but not processed)
                            # 2. Arrival exists but status is not 'departed'
                            if not arrival or (arrival and arrival.arrival_status != 'departed'):
                                is_unavailable = True

                        if is_unavailable:
                            # Worker is currently assigned and hasn't departed (or has time conflict)
                            assigned_workers[worker_id] = {
                                'requisition_code': req.requisition_code,
                                'status': arrival.arrival_status if arrival else 'assigned'
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
        today = datetime.utcnow().date()

        # Only check for conflicts if assignment is for today
        # Future dates are allowed without restriction
        if target_date <= today:
            # Check for existing assignments on the target date
            conflicting_workers = []

            for worker_id in worker_ids:
                # Find all requisitions this worker is assigned to on the target date
                existing_requisitions = db.session.query(LabourRequisition).filter(
                    LabourRequisition.assigned_worker_ids.contains([worker_id]),
                    LabourRequisition.required_date == target_date,
                    LabourRequisition.is_deleted == False,
                    LabourRequisition.assignment_status == 'assigned',
                    LabourRequisition.requisition_id != requisition_id  # Exclude current requisition
                ).all()

                if existing_requisitions:
                    # For each existing assignment, check if worker has departed
                    has_active_assignment = False

                    for existing_req in existing_requisitions:
                        # Check arrival record to see if worker has departed
                        arrival = LabourArrival.query.filter_by(
                            requisition_id=existing_req.requisition_id,
                            worker_id=worker_id,
                            arrival_date=target_date,
                            is_deleted=False
                        ).first()

                        # Check if times overlap when both requisitions have start/end times
                        if requisition.start_time and requisition.end_time and existing_req.start_time and existing_req.end_time:
                            # Time overlap exists if: new_start < existing_end AND new_end > existing_start
                            # Example: 11AM-6PM vs 6PM-10PM -> 6PM < 6PM (FALSE) -> NO OVERLAP ✓
                            # Example: 11AM-6PM vs 5PM-10PM -> 5PM < 6PM (TRUE) AND 10PM > 11AM (TRUE) -> OVERLAP ✗
                            if (requisition.start_time < existing_req.end_time and
                                requisition.end_time > existing_req.start_time):
                                has_active_assignment = True
                                break
                            # No time overlap, worker is available for non-overlapping shift
                        else:
                            # If times not specified, check departure status
                            if arrival and arrival.arrival_status != 'departed':
                                # No departure recorded and no time info, assume full day conflict
                                has_active_assignment = True
                                break

                    if has_active_assignment:
                        worker = next((w for w in workers if w.worker_id == worker_id), None)
                        if worker:
                            # Get the conflicting requisition code for better error message
                            conflict_req_code = existing_req.requisition_code if existing_req else 'unknown'
                            conflicting_workers.append(f"{worker.full_name} (currently on {conflict_req_code})")

            if conflicting_workers:
                worker_details = '\n• '.join(conflicting_workers)
                return jsonify({
                    "error": f"Cannot assign workers - they are already working on another requisition:\n\n• {worker_details}\n\nThey must clock out first before being assigned to a new requisition."
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

            # Create arrival record only if it doesn't already exist
            existing_arrival = LabourArrival.query.filter_by(
                requisition_id=requisition.requisition_id,
                worker_id=worker.worker_id,
                arrival_date=requisition.required_date
            ).first()

            if not existing_arrival:
                arrival = LabourArrival(
                    requisition_id=requisition.requisition_id,
                    worker_id=worker.worker_id,
                    project_id=requisition.project_id,
                    arrival_date=requisition.required_date,
                    arrival_status='assigned',
                    created_by=current_user.get('full_name', 'System')
                )
                db.session.add(arrival)
            else:
                log.info(f"Arrival record already exists for worker {worker.worker_id} on {requisition.required_date}, skipping creation")

        # Update requisition
        requisition.assignment_status = 'assigned'
        requisition.work_status = 'assigned'  # Update work status when workers are assigned
        requisition.assigned_worker_ids = worker_ids
        requisition.assigned_by_user_id = current_user.get('user_id')
        requisition.assigned_by_name = current_user.get('full_name', 'Unknown')
        requisition.assignment_date = datetime.utcnow()
        requisition.last_modified_by = current_user.get('full_name', 'System')

        # Update transport fee (PM sets transport cost during worker assignment)
        transport_fee = data.get('transport_fee', 0)
        if transport_fee is not None:
            requisition.transport_fee = float(transport_fee)

        # Update transport logistics details (driver and vehicle information)
        driver_name = data.get('driver_name')
        if driver_name:
            requisition.driver_name = driver_name

        vehicle_number = data.get('vehicle_number')
        if vehicle_number:
            requisition.vehicle_number = vehicle_number

        driver_contact = data.get('driver_contact')
        if driver_contact:
            requisition.driver_contact = driver_contact

        db.session.commit()

        # Send WhatsApp notification to workers
        whatsapp_results = []
        notification_sent_count = 0

        # Get project name for the message
        project_name = requisition.project.project_name if requisition.project else f"Project #{requisition.project_id}"
        formatted_date = requisition.required_date.strftime('%d %b %Y') if requisition.required_date else 'N/A'

        # Format time shift details
        time_shift = "Not specified"
        if requisition.start_time and requisition.end_time:
            time_shift = f"{requisition.start_time.strftime('%I:%M %p')} - {requisition.end_time.strftime('%I:%M %p')}"
        elif requisition.start_time:
            time_shift = f"From {requisition.start_time.strftime('%I:%M %p')}"
        elif requisition.end_time:
            time_shift = f"Until {requisition.end_time.strftime('%I:%M %p')}"

        for worker in workers:
            if worker.phone:
                # Create assignment notification message
                message = f"""🔔 *Work Assignment Notification*

Hello *{worker.full_name}*,

You have been assigned to a new work order:

📋 *Assignment Details:*
• Requisition: {requisition.requisition_code}
• Project: {project_name}
• Location: {requisition.site_name}
• Work: {requisition.work_description}
• Role: {requisition.skill_required}
• Date: {formatted_date}
• Time: {time_shift}

Please report to the site on time. Contact your supervisor for any queries.

_MeterSquare Interiors LLC_"""

                # Mask phone number for response (PII protection)
                masked_phone = f"{worker.phone[:4]}****{worker.phone[-4:]}" if len(worker.phone) > 8 else "****"

                try:
                    result = whatsapp_service.send_message(worker.phone, message)
                    if result.get('success'):
                        notification_sent_count += 1
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

        # --- Notification: Workers assigned → SE + PM(s) ---
        project = Project.query.get(requisition.project_id)
        project_name = project.project_name if project else f'Project #{requisition.project_id}'
        site_name = requisition.site_name or 'Site'
        pm_user_ids = []
        if project and project.user_id:
            if isinstance(project.user_id, list):
                pm_user_ids = [int(uid) for uid in project.user_id if uid]
            else:
                pm_user_ids = [int(project.user_id)]
        try:
            notification_service.notify_labour_workers_assigned(
                requisition_id=requisition.requisition_id,
                requisition_code=requisition.requisition_code,
                project_name=project_name,
                site_name=site_name,
                prod_mgr_id=current_user.get('user_id'),
                prod_mgr_name=current_user.get('full_name', 'Unknown'),
                se_user_id=requisition.requested_by_user_id,
                pm_user_ids=pm_user_ids,
                workers_count=len(workers),
                required_date=requisition.required_date
            )
        except Exception as notif_err:
            log.error(f"Failed to send workers-assigned notification: {notif_err}")

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


def retain_workers_for_next_day(requisition_id):
    """
    Reassign/duplicate a requisition with same workers for a new date.
    Validates worker availability and time conflicts before creating new requisition.
    Creates requisition with status 'send_to_pm' for PM approval (not auto-approved).
    """
    try:
        # g.user is a dictionary, not a User object
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', current_user.get('email', 'Unknown'))

        # Normalize role to 'SE' or 'PM' (max 10 chars for DB column)
        raw_role = current_user.get('role', 'SE')
        if 'pm' in raw_role.lower() or 'project' in raw_role.lower():
            user_role = 'PM'
        else:
            user_role = 'SE'

        data = request.get_json()

        # Validate required fields
        required_date = data.get('required_date')
        start_time_str = data.get('start_time')
        end_time_str = data.get('end_time')

        if not required_date:
            return jsonify({"error": "Required date is mandatory"}), 400

        # Get original requisition
        original_req = LabourRequisition.query.get(requisition_id)
        if not original_req:
            return jsonify({"error": "Original requisition not found"}), 404

        # Check if original requisition has assigned workers
        if not original_req.assigned_worker_ids or len(original_req.assigned_worker_ids) == 0:
            return jsonify({"error": "Original requisition has no assigned workers"}), 400

        # Parse date and times
        target_date = datetime.strptime(required_date, '%Y-%m-%d').date()
        start_time = datetime.strptime(start_time_str, '%H:%M').time() if start_time_str else None
        end_time = datetime.strptime(end_time_str, '%H:%M').time() if end_time_str else None

        # Validate times (allow overnight shifts where end_time < start_time, e.g., 22:00 to 06:00)
        # Only reject if times are exactly the same
        if start_time and end_time and start_time == end_time:
            return jsonify({"error": "End time must be different from start time"}), 400

        # Check worker availability and conflicts
        today = datetime.utcnow().date()
        unavailable_workers = []
        available_workers = []

        if target_date <= today and start_time and end_time:
            # Only check conflicts for today/past dates with time specified
            for worker_id in original_req.assigned_worker_ids:
                # Find existing assignments on target date
                existing_reqs = db.session.query(LabourRequisition).filter(
                    LabourRequisition.assigned_worker_ids.contains([worker_id]),
                    LabourRequisition.required_date == target_date,
                    LabourRequisition.is_deleted == False,
                    LabourRequisition.assignment_status == 'assigned'
                ).all()

                has_conflict = False
                conflict_details = None

                for existing_req in existing_reqs:
                    if existing_req.start_time and existing_req.end_time:
                        # Check time overlap (handle overnight shifts)
                        # Overnight shift: start_time > end_time (e.g., 22:00 to 06:00)
                        new_is_overnight = start_time > end_time
                        existing_is_overnight = existing_req.start_time > existing_req.end_time

                        # Check for overlap based on shift types
                        has_overlap = False
                        if new_is_overnight and existing_is_overnight:
                            # Both overnight: always overlap
                            has_overlap = True
                        elif new_is_overnight:
                            # New shift is overnight: overlaps if existing starts before new ends or ends after new starts
                            has_overlap = (existing_req.start_time <= end_time or existing_req.end_time >= start_time)
                        elif existing_is_overnight:
                            # Existing shift is overnight: overlaps if new starts before existing ends or ends after existing starts
                            has_overlap = (start_time <= existing_req.end_time or end_time >= existing_req.start_time)
                        else:
                            # Both same-day shifts: standard overlap check
                            has_overlap = (start_time < existing_req.end_time and end_time > existing_req.start_time)

                        if has_overlap:
                            has_conflict = True
                            conflict_details = {
                                'requisition_code': existing_req.requisition_code,
                                'time_range': f"{existing_req.start_time.strftime('%H:%M')} - {existing_req.end_time.strftime('%H:%M')}"
                            }
                            break

                worker = Worker.query.get(worker_id)
                if has_conflict:
                    unavailable_workers.append({
                        'worker_id': worker_id,
                        'worker_name': worker.full_name if worker else 'Unknown',
                        'worker_code': worker.worker_code if worker else 'N/A',
                        'conflict': conflict_details
                    })
                else:
                    available_workers.append(worker_id)
        else:
            # Future date or no time specified - all workers available
            available_workers = original_req.assigned_worker_ids.copy()

        # If check_only flag is set, return availability without creating
        if data.get('check_only'):
            return jsonify({
                "success": True,
                "check_only": True,
                "available_workers": available_workers,
                "unavailable_workers": unavailable_workers,
                "total_workers": len(original_req.assigned_worker_ids),
                "available_count": len(available_workers),
                "conflict_count": len(unavailable_workers)
            }), 200

        # Create new requisition with available workers only
        if len(available_workers) == 0:
            return jsonify({"error": "No workers available for the selected date and time. All have conflicts."}), 400

        # Generate new requisition code
        new_req_code = LabourRequisition.generate_requisition_code()

        # Build preferred workers notes with available workers
        worker_names = []
        for worker_id in available_workers:
            worker = Worker.query.get(worker_id)
            if worker:
                worker_names.append(f"{worker.full_name} ({worker.worker_code})")

        preferred_notes = f"Reassigning from {original_req.requisition_code}: " + ", ".join(worker_names)

        # Create new requisition - send to PM for approval
        new_requisition = LabourRequisition(
            requisition_code=new_req_code,
            project_id=original_req.project_id,
            site_name=original_req.site_name,
            required_date=target_date,
            start_time=start_time,
            end_time=end_time,
            labour_items=original_req.labour_items,  # Copy labour items
            work_description=original_req.work_description,
            skill_required=original_req.skill_required,
            workers_count=len(available_workers),  # Update count
            boq_id=original_req.boq_id,
            item_id=original_req.item_id,
            labour_id=original_req.labour_id,
            requested_by_user_id=user_id,
            requested_by_name=user_name,
            requester_role=user_role,
            status='send_to_pm',  # Send to PM for approval (not auto-approved)
            assignment_status='unassigned',  # Not yet assigned (use 'unassigned' not 'pending')
            preferred_worker_ids=available_workers,  # Store as preferred workers
            preferred_workers_notes=preferred_notes,
            created_by=user_name
        )

        db.session.add(new_requisition)
        db.session.flush()  # Get requisition_id

        # No labour arrivals created yet - PM will assign workers after approval

        db.session.commit()

        return jsonify({
            "success": True,
            "message": f"Reassignment requisition created with {len(available_workers)} preferred worker(s). Sent to PM for approval.",
            "new_requisition": new_requisition.to_dict(),
            "unavailable_workers": unavailable_workers,
            "preferred_workers_count": len(available_workers),
            "conflict_count": len(unavailable_workers)
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error reassigning workers: {str(e)}")
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
                    requisition_id=arrival.requisition_id,  # CRITICAL: Link to requisition for PM filtering
                    attendance_date=arrival.arrival_date,
                    clock_in_time=clock_in_dt,
                    clock_out_time=clock_out_dt,
                    hourly_rate=worker.hourly_rate,
                    attendance_status='completed',
                    approval_status='pending',  # Ready for PM review
                    entered_by_user_id=current_user.get('user_id'),
                    entered_by_role=current_user.get('role', 'SE'),
                    created_by=current_user.get('full_name', 'System')
                )
                # Calculate hours and cost
                attendance.calculate_hours_and_cost()
                db.session.add(attendance)

        db.session.commit()
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
        labour_role = data.get('labour_role')  # Labour role/skill for BOQ cost tracking

        # Sanitize labour_role if provided
        if labour_role:
            labour_role = str(labour_role).strip()[:100]

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
            # Update labour_role if provided and not already set
            if labour_role and not attendance.labour_role:
                attendance.labour_role = labour_role
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
                labour_role=labour_role,  # Link to BOQ labour item for cost tracking
                approval_status='pending',  # Will be reviewed by PM after completion
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
        attendance.approval_status = 'pending'  # Ready for PM review

        # Calculate hours and cost
        attendance.calculate_hours_and_cost()

        attendance.last_modified_by = current_user.get('full_name', 'System')

        db.session.commit()
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
