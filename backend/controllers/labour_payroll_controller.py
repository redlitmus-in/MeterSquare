"""
Labour Payroll Controller
Steps 7-8 + Dashboard/Reports: Lock Attendance + Payroll + Dashboard + PDF Reports
"""

__all__ = [
    'get_attendance_to_lock', 'lock_attendance', 'lock_day_attendance',
    'get_locked_for_payroll', 'get_payroll_summary',
    'get_labour_dashboard', 'get_user_projects',
    'download_assignment_pdf', 'download_daily_schedule_pdf',
]
from datetime import datetime, date, timedelta, timezone
from flask import request, jsonify, g, make_response, send_file
from config.db import db
from models.worker import Worker
from models.labour_requisition import LabourRequisition
from models.worker_assignment import WorkerAssignment
from models.daily_attendance import DailyAttendance, AttendanceApprovalHistory
from models.project import Project
from models.labour_arrival import LabourArrival
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import func, and_, or_
from utils.comprehensive_notification_service import notification_service
from controllers.labour_helpers import (
    log, normalize_role, get_user_assigned_project_ids,
    SUPER_ADMIN_ROLES, LABOUR_ADMIN_ROLES
)


# =============================================================================
# STEP 7: LOCK ATTENDANCE (PM)
# =============================================================================

def get_attendance_to_lock():
    """Get attendance records with optional status filter - only for PM/MEP's assigned projects"""
    try:
        user_id = g.user.get('user_id')
        user_role = normalize_role(g.user.get('role', ''))
        if not user_id:
            return jsonify({'success': False, 'error': 'User not authenticated'}), 401

        project_id = request.args.get('project_id', type=int)
        date_str = request.args.get('date')
        approval_status = request.args.get('approval_status', 'pending')  # 'pending' or 'locked'
        view_as_role = request.args.get('view_as_role', '').lower()  # For admin viewing as other roles

        # Valid roles for view_as_role parameter
        VALID_VIEW_AS_ROLES = frozenset(['pm', 'projectmanager', 'mep', 'mepsupervisor', 'mep_supervisor', 'se', 'siteengineer'])

        # Validate view_as_role if provided
        if view_as_role and view_as_role not in VALID_VIEW_AS_ROLES:
            return jsonify({'success': False, 'error': f'Invalid view_as_role: {view_as_role}'}), 400

        # If admin is viewing as another role, use that role for filtering
        is_admin_viewing_as_role = False
        original_role = user_role
        if user_role in SUPER_ADMIN_ROLES and view_as_role:
            is_admin_viewing_as_role = True
            user_role = view_as_role

        from models.project import Project
        from models.labour_arrival import LabourArrival
        from models.worker import Worker

        pm_project_ids = []

        # Admin viewing as role gets ALL projects (no user-specific filtering)
        if is_admin_viewing_as_role or original_role in SUPER_ADMIN_ROLES:
            all_projects = Project.query.filter(
                Project.is_deleted == False
            ).all()
            pm_project_ids = [proj.project_id for proj in all_projects]
        # Role-based project filtering for regular users
        elif user_role in ['mep', 'mepsupervisor', 'mep_supervisor']:
            # MEP: Get projects where mep_supervisor_id contains this user
            all_projects = Project.query.filter(
                Project.is_deleted == False,
                Project.mep_supervisor_id.isnot(None)
            ).all()

            for proj in all_projects:
                if proj.mep_supervisor_id and isinstance(proj.mep_supervisor_id, list) and user_id in proj.mep_supervisor_id:
                    pm_project_ids.append(proj.project_id)
        else:
            # PM: Get projects where user_id contains this user
            all_projects = Project.query.filter(
                Project.is_deleted == False,
                Project.user_id.isnot(None)
            ).all()

            for proj in all_projects:
                if proj.user_id and isinstance(proj.user_id, list) and user_id in proj.user_id:
                    pm_project_ids.append(proj.project_id)
        # If no projects assigned, return empty list
        if not pm_project_ids:
            return jsonify({
                "success": True,
                "attendance": [],
                "total_records": 0
            }), 200

        # STEP 1: Check for departed arrivals that need attendance records created
        # Auto-create missing attendance records for departed arrivals (works for all queries)

        # Build query for departed arrivals
        departed_query = LabourArrival.query.filter(
            LabourArrival.arrival_status == 'departed',
            LabourArrival.project_id.in_(pm_project_ids),
            LabourArrival.is_deleted == False
        )

        # Add date filter if provided
        if date_str:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            departed_query = departed_query.filter(LabourArrival.arrival_date == target_date)

        departed_arrivals = departed_query.all()

        # Auto-create missing attendance records for departed workers
        if departed_arrivals:
            for arrival in departed_arrivals:
                # Check if attendance already exists
                existing = DailyAttendance.query.filter_by(
                    worker_id=arrival.worker_id,
                    project_id=arrival.project_id,
                    attendance_date=arrival.arrival_date,
                    is_deleted=False
                ).first()

                if not existing and arrival.arrival_time and arrival.departure_time:
                    # Create attendance record
                    worker = Worker.query.get(arrival.worker_id)
                    if worker:
                        clock_in_dt = datetime.combine(
                            arrival.arrival_date,
                            datetime.strptime(arrival.arrival_time, '%H:%M').time()
                        )
                        clock_out_dt = datetime.combine(
                            arrival.arrival_date,
                            datetime.strptime(arrival.departure_time, '%H:%M').time()
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
                            approval_status='pending',
                            entered_by_user_id=user_id,
                            entered_by_role='System',
                            created_by='System Auto-Create'
                        )
                        attendance.calculate_hours_and_cost()
                        db.session.add(attendance)

            db.session.commit()

        # STEP 2: Query attendance records
        # Join with requisition to filter by PM who approved the requisition
        # This ensures each PM only sees attendance from their approved requisitions
        query = DailyAttendance.query.options(
            joinedload(DailyAttendance.worker),
            joinedload(DailyAttendance.project)
        ).join(
            LabourRequisition,
            DailyAttendance.requisition_id == LabourRequisition.requisition_id
        ).filter(
            DailyAttendance.is_deleted == False,
            DailyAttendance.project_id.in_(pm_project_ids)  # Filter by projects
        )

        # Admin viewing as role sees ALL attendance records (no approver filter)
        if not is_admin_viewing_as_role and original_role not in SUPER_ADMIN_ROLES:
            # Regular PM only sees requisitions they approved
            query = query.filter(LabourRequisition.approved_by_user_id == user_id)
        else:
            log.info(f"Admin viewing all attendance records (no approver filter)")

        # Filter by approval status
        if approval_status == 'pending':
            # Include records with approval_status='pending' OR (approval_status is NULL and attendance is completed)
            query = query.filter(
                or_(
                    DailyAttendance.approval_status == 'pending',
                    and_(
                        DailyAttendance.approval_status.is_(None),
                        DailyAttendance.attendance_status == 'completed',
                        DailyAttendance.clock_out_time.isnot(None)
                    )
                )
            )
        elif approval_status == 'locked':
            query = query.filter(DailyAttendance.approval_status == 'locked')

        if project_id:
            # Additional filter if specific project requested
            if project_id in pm_project_ids:
                query = query.filter(DailyAttendance.project_id == project_id)
            else:
                # Requested project not assigned to this PM
                return jsonify({
                    "success": True,
                    "attendance": [],
                    "total_records": 0
                }), 200

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

        # --- Notification: Attendance locked → Admin/HR ---
        project = Project.query.get(attendance.project_id)
        project_name = project.project_name if project else f'Project #{attendance.project_id}'
        try:
            notification_service.notify_labour_attendance_locked(
                project_id=attendance.project_id,
                project_name=project_name,
                locked_count=1,
                pm_user_id=current_user.get('user_id'),
                pm_name=current_user.get('full_name', 'Unknown'),
                lock_date=attendance.attendance_date
            )
        except Exception as notif_err:
            log.error(f"Failed to send attendance-locked notification: {notif_err}")

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
        user_id = current_user.get('user_id')

        # Join with requisition to only lock attendance from requisitions approved by this PM
        records = DailyAttendance.query.join(
            LabourRequisition,
            DailyAttendance.requisition_id == LabourRequisition.requisition_id
        ).filter(
            DailyAttendance.project_id == project_id,
            DailyAttendance.attendance_date == target_date,
            DailyAttendance.approval_status == 'pending',
            DailyAttendance.is_deleted == False,
            LabourRequisition.approved_by_user_id == user_id  # CRITICAL: Only lock attendance from this PM's requisitions
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

        # --- Notification: Day attendance locked → Admin/HR ---
        if locked_count > 0:
            project = Project.query.get(project_id)
            project_name = project.project_name if project else f'Project #{project_id}'
            try:
                notification_service.notify_labour_attendance_locked(
                    project_id=project_id,
                    project_name=project_name,
                    locked_count=locked_count,
                    pm_user_id=current_user.get('user_id'),
                    pm_name=current_user.get('full_name', 'Unknown'),
                    lock_date=target_date
                )
            except Exception as notif_err:
                log.error(f"Failed to send day attendance-locked notification: {notif_err}")

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
            LabourRequisition.transport_fee,
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
            LabourRequisition.transport_fee,
            DailyAttendance.worker_id,
            Worker.worker_code,
            Worker.full_name,
            Worker.hourly_rate
        ).order_by(Project.project_name, LabourRequisition.requisition_code, Worker.full_name).all()

        # Group by project -> requisition -> workers (nested structure)
        projects_dict = {}
        flat_summary = []  # Keep flat list for backwards compatibility
        requisition_transport_added = set()  # Track which requisitions already have transport fee added

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
                    'transport_fee': float(r.transport_fee or 0) if r.requisition_id else 0,
                    'total_hours': 0,
                    'total_regular_hours': 0,
                    'total_overtime_hours': 0,
                    'total_cost': 0,
                    'total_days': 0,
                    'workers': []
                }

                # Add transport fee once per requisition (not per worker)
                if r.requisition_id and r.requisition_id not in requisition_transport_added:
                    transport_fee_value = float(r.transport_fee or 0)
                    proj['requisitions'][req_key]['total_cost'] += transport_fee_value
                    proj['total_cost'] += transport_fee_value
                    requisition_transport_added.add(r.requisition_id)

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


# =============================================================================
# UTILITY: Get Projects for User
# =============================================================================

def get_user_projects():
    """
    Get projects accessible to current user for dropdowns/filters.
    Used by Attendance Lock and other labour features.
    Returns projects based on user's primary role:
    - Admin/TD: All non-completed projects
    - PM: Projects where they are PM (user_id contains their ID)
    - SE: Projects where they are SE (site_supervisor_id)
    - Other roles: Their specific role assignment
    """
    try:
        current_user = g.get('user')
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401

        user_id = current_user.get('user_id')
        user_role = normalize_role(current_user.get('role', ''))

        from models.project import Project

        # Admin/TD can see all non-completed projects
        if user_role in SUPER_ADMIN_ROLES:
            projects_query = Project.query.filter(
                Project.is_deleted == False,
                func.lower(Project.status) != 'completed'
            ).order_by(Project.project_name)
        # Project Manager - only projects where they are PM AND (has approved BOQ OR has SE assignments)
        # This matches the "My Projects" page logic (Pending + Assigned tabs)
        elif user_role == 'projectmanager':
            from models.boq import BOQ
            from models.pm_assign_ss import PMAssignSS

            # Get projects with approved BOQs OR with SE assignments
            projects_query = db.session.query(Project).filter(
                Project.is_deleted == False,
                func.lower(Project.status) != 'completed',
                Project.user_id.contains([user_id])
            ).join(
                BOQ, Project.project_id == BOQ.project_id
            ).filter(
                BOQ.is_deleted == False,
                or_(
                    # Has approved BOQ (Pending tab)
                    BOQ.status.in_(['approved', 'Approved']),
                    # Has SE assignments (Assigned tab)
                    # Must be assignments made BY this PM
                    BOQ.boq_id.in_(
                        db.session.query(PMAssignSS.boq_id).filter(
                            PMAssignSS.is_deleted == False,
                            PMAssignSS.assigned_by_pm_id == user_id
                        )
                    )
                )
            ).distinct().order_by(Project.project_name)
        # Site Engineer/Supervisor - only projects where they are SE
        elif user_role in ['siteengineer', 'sitesupervisor', 'ss']:
            projects_query = Project.query.filter(
                Project.is_deleted == False,
                func.lower(Project.status) != 'completed',
                Project.site_supervisor_id == user_id
            ).order_by(Project.project_name)
        # MEP Supervisor - only projects where they are MEP
        elif user_role in ['mepsupervisor', 'mep']:
            projects_query = Project.query.filter(
                Project.is_deleted == False,
                func.lower(Project.status) != 'completed',
                Project.mep_supervisor_id.contains([user_id])
            ).order_by(Project.project_name)
        # Other roles: Check all possible assignments
        else:
            projects_query = Project.query.filter(
                Project.is_deleted == False,
                func.lower(Project.status) != 'completed',
                or_(
                    Project.user_id.contains([user_id]),
                    Project.site_supervisor_id == user_id,
                    Project.mep_supervisor_id.contains([user_id]),
                    Project.estimator_id == user_id,
                    Project.buyer_id == user_id
                )
            ).order_by(Project.project_name)

        projects = projects_query.all()

        projects_list = [{
            'project_id': p.project_id,
            'project_code': p.project_code or f'P{p.project_id}',
            'project_name': p.project_name,
            'client': p.client,
            'location': p.location,
            'status': p.status
        } for p in projects]

        return jsonify({
            'success': True,
            'projects': projects_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching user projects: {str(e)}")
        return jsonify({'error': str(e)}), 500


def download_assignment_pdf(requisition_id):
    """Download PDF report for a specific requisition assignment"""
    try:
        from flask import send_file
        from utils.labour_assignment_pdf_generator import generate_assignment_pdf
        from datetime import timezone

        # Helper function to convert UTC to local timezone
        def utc_to_local(utc_dt):
            """Convert UTC datetime to local system timezone"""
            if utc_dt.tzinfo is None:
                # Assume UTC if timezone-naive
                utc_dt = utc_dt.replace(tzinfo=timezone.utc)
            # Convert to local time using timestamp
            timestamp = utc_dt.timestamp()
            local_dt = datetime.fromtimestamp(timestamp)
            return local_dt

        # Fetch requisition with all details
        requisition = LabourRequisition.query.filter_by(
            requisition_id=requisition_id,
            is_deleted=False
        ).first()

        if not requisition:
            return jsonify({"error": "Requisition not found"}), 404

        # Prepare data for PDF
        requisition_dict = requisition.to_dict()

        # Get assigned workers with full details
        if requisition.assigned_worker_ids:
            workers = Worker.query.filter(
                Worker.worker_id.in_(requisition.assigned_worker_ids),
                Worker.is_deleted == False
            ).all()

            requisition_dict['assigned_workers'] = [{
                'worker_id': w.worker_id,
                'worker_code': w.worker_code,
                'full_name': w.full_name,
                'skills': w.skills or [],
                'phone': w.phone,
                'hourly_rate': float(w.hourly_rate) if w.hourly_rate else 0
            } for w in workers]
        else:
            requisition_dict['assigned_workers'] = []

        # Format dates and times for display (convert UTC to local timezone)
        # Note: required_date is a DATE field (no time component), so no timezone conversion needed
        if requisition_dict.get('required_date'):
            # Parse as date string (YYYY-MM-DD format)
            date_str = requisition_dict['required_date']
            if isinstance(date_str, str):
                try:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                    requisition_dict['required_date'] = date_obj.strftime('%B %d, %Y')
                except:
                    pass

        # Format time fields to 12-hour format with AM/PM
        # These are local work shift times, no timezone conversion needed
        if requisition_dict.get('start_time'):
            time_str = requisition_dict['start_time']
            if isinstance(time_str, str):
                try:
                    # Try parsing HH:MM format first (from to_dict)
                    try:
                        time_obj = datetime.strptime(time_str, '%H:%M').time()
                    except:
                        # Fallback to HH:MM:SS format
                        time_obj = datetime.strptime(time_str, '%H:%M:%S').time()

                    # Format as 12-hour time
                    requisition_dict['start_time'] = datetime.combine(datetime.today(), time_obj).strftime('%I:%M %p')
                except:
                    pass

        if requisition_dict.get('end_time'):
            time_str = requisition_dict['end_time']
            if isinstance(time_str, str):
                try:
                    # Try parsing HH:MM format first (from to_dict)
                    try:
                        time_obj = datetime.strptime(time_str, '%H:%M').time()
                    except:
                        # Fallback to HH:MM:SS format
                        time_obj = datetime.strptime(time_str, '%H:%M:%S').time()

                    # Format as 12-hour time
                    requisition_dict['end_time'] = datetime.combine(datetime.today(), time_obj).strftime('%I:%M %p')
                except:
                    pass

        if requisition_dict.get('request_date'):
            date_obj = datetime.fromisoformat(requisition_dict['request_date'])
            local_date = utc_to_local(date_obj)
            requisition_dict['request_date'] = local_date.strftime('%B %d, %Y %I:%M %p')

        if requisition_dict.get('approval_date'):
            date_obj = datetime.fromisoformat(requisition_dict['approval_date'])
            local_date = utc_to_local(date_obj)
            requisition_dict['approval_date'] = local_date.strftime('%B %d, %Y %I:%M %p')

        if requisition_dict.get('assignment_date'):
            date_obj = datetime.fromisoformat(requisition_dict['assignment_date'])
            local_date = utc_to_local(date_obj)
            requisition_dict['assignment_date'] = local_date.strftime('%B %d, %Y %I:%M %p')

        # Generate PDF
        pdf_buffer = generate_assignment_pdf(requisition_dict)

        # Create filename with current date
        filename = f"Assignment_{requisition.requisition_code}_{datetime.now().strftime('%Y%m%d')}.pdf"

        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        log.error(f"Error generating assignment PDF: {str(e)}")
        return jsonify({"error": f"Failed to generate PDF: {str(e)}"}), 500


def download_daily_schedule_pdf():
    """Download daily worker assignment schedule PDF (poster format for hostel wall)"""
    try:
        from flask import send_file
        from utils.daily_schedule_pdf_generator import generate_daily_schedule_pdf
        from datetime import timezone

        # Helper function to convert UTC to local timezone
        def utc_to_local(utc_dt):
            """Convert UTC datetime to local system timezone"""
            if utc_dt.tzinfo is None:
                utc_dt = utc_dt.replace(tzinfo=timezone.utc)
            timestamp = utc_dt.timestamp()
            local_dt = datetime.fromtimestamp(timestamp)
            return local_dt

        # Get date from query parameter
        date_str = request.args.get('date')
        if not date_str:
            return jsonify({"error": "Date parameter is required"}), 400

        try:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

        # Fetch all assigned requisitions for this date (not rejected, with assigned workers)
        requisitions = LabourRequisition.query.filter(
            LabourRequisition.required_date == target_date,
            LabourRequisition.assignment_status == 'assigned',
            LabourRequisition.status != 'rejected',
            LabourRequisition.is_deleted == False
        ).options(
            joinedload(LabourRequisition.project)
        ).all()

        # Group requisitions by project
        projects_data = {}

        for req in requisitions:
            project_id = req.project_id
            project_name = req.project.project_name if req.project else 'Unknown Project'

            if project_id not in projects_data:
                projects_data[project_id] = {
                    'project_id': project_id,
                    'project_name': project_name,
                    'site_name': req.site_name,
                    'requisitions': []
                }

            # Get assigned workers with full details
            assigned_workers = []
            if req.assigned_worker_ids:
                workers = Worker.query.filter(
                    Worker.worker_id.in_(req.assigned_worker_ids),
                    Worker.is_deleted == False
                ).all()

                assigned_workers = [{
                    'worker_id': w.worker_id,
                    'worker_code': w.worker_code,
                    'full_name': w.full_name,
                    'skills': w.skills or [],
                    'phone': w.phone
                } for w in workers]

            # Format time fields to 12-hour format
            start_time_formatted = 'N/A'
            end_time_formatted = 'N/A'

            if req.start_time:
                time_obj = req.start_time
                start_time_formatted = datetime.combine(datetime.today(), time_obj).strftime('%I:%M %p')

            if req.end_time:
                time_obj = req.end_time
                end_time_formatted = datetime.combine(datetime.today(), time_obj).strftime('%I:%M %p')

            # Add requisition data to project
            projects_data[project_id]['requisitions'].append({
                'requisition_code': req.requisition_code,
                'site_name': req.site_name,
                'start_time': start_time_formatted,
                'end_time': end_time_formatted,
                'driver_name': req.driver_name or 'N/A',
                'vehicle_number': req.vehicle_number or 'N/A',
                'driver_contact': req.driver_contact or 'N/A',
                'transport_fee': float(req.transport_fee) if req.transport_fee else 0.0,
                'assigned_workers': assigned_workers
            })

        # Convert to list and sort by project name
        projects_list = sorted(projects_data.values(), key=lambda x: x['project_name'])

        # Prepare data for PDF generator
        schedule_data = {
            'date': target_date.strftime('%B %d, %Y'),  # Format: January 15, 2026
            'date_short': target_date.strftime('%d-%b-%Y'),  # Format: 15-Jan-2026
            'projects': projects_list,
            'total_projects': len(projects_list),
            'total_workers': sum(
                len(req['assigned_workers'])
                for project in projects_list
                for req in project['requisitions']
            )
        }

        # Generate PDF
        pdf_buffer = generate_daily_schedule_pdf(schedule_data)

        # Create filename
        filename = f"Daily_Worker_Schedule_{target_date.strftime('%Y%m%d')}.pdf"

        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        log.error(f"Error generating daily schedule PDF: {str(e)}")
        return jsonify({"error": f"Failed to generate PDF: {str(e)}"}), 500
