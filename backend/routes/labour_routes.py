"""
Labour Routes for Labour Management System
API endpoints for 8-step SOP workflow:
1. Production Manager: Add Labour to Registry
2. Site Engineer: Raise Site Requisition
3. Project Manager: Approve/Reject Requisition
4. Production Manager: Allocate & Assign Personnel + WhatsApp Notify
5. Site Engineer: Confirm Site Arrival
6. Site Engineer: Daily Attendance Logs (IN/OUT)
7. Project Manager: Review & Lock Data
8. Admin (HR): Payroll Processing
"""
from flask import Blueprint, request, jsonify, g
from controllers.labour_controller import *
from utils.authentication import jwt_required


labour_routes = Blueprint('labour', __name__, url_prefix='/api/labour')


# ============================================================================
# STEP 1: Worker Registry (Production Manager)
# ============================================================================

@labour_routes.route('/workers', methods=['GET'])
@jwt_required
def list_workers():
    """Get all workers with optional filtering"""
    return get_workers()


@labour_routes.route('/workers/<int:worker_id>', methods=['GET'])
@jwt_required
def get_worker(worker_id):
    """Get single worker details"""
    return get_worker_by_id(worker_id)


@labour_routes.route('/workers', methods=['POST'])
@jwt_required
def add_worker():
    """Create new worker (Production Manager)"""
    return create_worker()


@labour_routes.route('/workers/<int:worker_id>', methods=['PUT'])
@jwt_required
def edit_worker(worker_id):
    """Update worker details"""
    return update_worker(worker_id)


@labour_routes.route('/workers/<int:worker_id>', methods=['DELETE'])
@jwt_required
def remove_worker(worker_id):
    """Soft delete worker"""
    return delete_worker(worker_id)


@labour_routes.route('/workers/by-skill/<string:skill>', methods=['GET'])
@jwt_required
def workers_by_skill(skill):
    """Get workers with specific skill"""
    return get_workers_by_skill(skill)


# ============================================================================
# STEP 2: Requisitions (Site Engineer)
# IMPORTANT: Static routes MUST be defined before dynamic routes for Flask routing
# ============================================================================

# --- STATIC REQUISITION ROUTES (must come first) ---

@labour_routes.route('/requisitions', methods=['POST'])
@jwt_required
def create_new_requisition():
    """Create labour requisition (Site Engineer)"""
    return create_requisition()


@labour_routes.route('/requisitions/my-requests', methods=['GET'])
@jwt_required
def my_requisitions():
    """Get requester's own requisitions"""
    return get_my_requisitions()


@labour_routes.route('/requisitions/pending', methods=['GET'])
@jwt_required
def pending_requisitions():
    """Get pending requisitions for approval (Project Manager)"""
    return get_pending_requisitions()


@labour_routes.route('/requisitions/approved', methods=['GET'])
@jwt_required
def approved_requisitions():
    """Get approved requisitions pending assignment (Production Manager)"""
    return get_approved_requisitions()


# --- DYNAMIC REQUISITION ROUTES (must come after static routes) ---

@labour_routes.route('/requisitions/<int:requisition_id>', methods=['GET'])
@jwt_required
def get_requisition(requisition_id):
    """Get requisition details"""
    return get_requisition_by_id(requisition_id)


@labour_routes.route('/requisitions/<int:requisition_id>', methods=['PUT'])
@jwt_required
def edit_requisition(requisition_id):
    """Update requisition (only pending status)"""
    return update_requisition(requisition_id)


@labour_routes.route('/requisitions/<int:requisition_id>/resubmit', methods=['POST', 'PUT'])
@jwt_required
def resubmit_req(requisition_id):
    """Resubmit/update requisition with edits (Site Engineer)"""
    return resubmit_requisition(requisition_id)


@labour_routes.route('/requisitions/<int:requisition_id>/send-to-production', methods=['POST'])
@jwt_required
def send_req_to_production(requisition_id):
    """Send PM's pending requisition to production for worker assignment (Project Manager only)"""
    return send_to_production(requisition_id)


@labour_routes.route('/requisitions/<int:requisition_id>', methods=['DELETE'])
@jwt_required
def delete_req(requisition_id):
    """Delete requisition (Site Engineer - only pending)"""
    return delete_requisition(requisition_id)


@labour_routes.route('/requisitions/<int:requisition_id>/resend', methods=['POST'])
@jwt_required
def resend_req(requisition_id):
    """Resend pending requisition to PM (Site Engineer)"""
    return resend_requisition(requisition_id)


@labour_routes.route('/requisitions/by-project/<int:project_id>', methods=['GET'])
@jwt_required
def requisitions_by_project(project_id):
    """Get all requisitions for a project (for labour item status tracking)"""
    return get_requisitions_by_project(project_id)


# ============================================================================
# STEP 3: Approve Requisitions (Project Manager)
# ============================================================================

@labour_routes.route('/requisitions/<int:requisition_id>/approve', methods=['POST'])
@jwt_required
def approve_req(requisition_id):
    """Approve requisition (Project Manager)"""
    return approve_requisition(requisition_id)


@labour_routes.route('/requisitions/<int:requisition_id>/reject', methods=['POST'])
@jwt_required
def reject_req(requisition_id):
    """Reject requisition with reason (Project Manager)"""
    return reject_requisition(requisition_id)


# ============================================================================
# STEP 4: Assign Personnel (Production Manager)
# ============================================================================

@labour_routes.route('/workers/available', methods=['GET'])
@jwt_required
def available_workers():
    """Get available workers for a skill and date"""
    return get_available_workers()


@labour_routes.route('/requisitions/<int:requisition_id>/assign', methods=['POST'])
@jwt_required
def assign_workers(requisition_id):
    """Assign workers to requisition (Production Manager)"""
    return assign_workers_to_requisition(requisition_id)


@labour_routes.route('/requisitions/<int:requisition_id>/retain', methods=['POST'])
@labour_routes.route('/requisitions/<int:requisition_id>/reassign', methods=['POST'])
@jwt_required
def retain_workers(requisition_id):
    """Reassign/duplicate requisition with same workers for a new date. Sends to PM for approval."""
    return retain_workers_for_next_day(requisition_id)


@labour_routes.route('/requisitions/<int:requisition_id>/download_pdf', methods=['GET'])
@jwt_required
def download_pdf(requisition_id):
    """Download PDF report for requisition assignment (Production Manager)"""
    return download_assignment_pdf(requisition_id)


@labour_routes.route('/daily-schedule/download_pdf', methods=['GET'])
@jwt_required
def download_daily_schedule():
    """Download daily worker assignment schedule poster PDF (Production Manager)"""
    return download_daily_schedule_pdf()


# ============================================================================
# STEP 5: Arrival Confirmation (Site Engineer)
# ============================================================================

@labour_routes.route('/arrivals/<int:project_id>/<string:date>', methods=['GET'])
@jwt_required
def arrivals_for_date(project_id, date):
    """Get assigned workers for a project on a date"""
    return get_arrivals_for_date(project_id, date)


@labour_routes.route('/arrivals/confirm', methods=['POST'])
@jwt_required
def confirm_worker_arrival():
    """Confirm worker arrival at site (Site Engineer)"""
    return confirm_arrival()


@labour_routes.route('/arrivals/no-show', methods=['POST'])
@jwt_required
def mark_worker_no_show():
    """Mark worker as no-show (Site Engineer)"""
    return mark_no_show()


@labour_routes.route('/arrivals/departure', methods=['POST'])
@jwt_required
def mark_worker_departure():
    """Mark worker departure/clock out (Site Engineer)"""
    return mark_departure()


# ============================================================================
# STEP 6: Attendance Logs (Site Engineer)
# ============================================================================

@labour_routes.route('/attendance/clock-in', methods=['POST'])
@jwt_required
def clock_in():
    """Clock in worker (Site Engineer)"""
    return clock_in_worker()


@labour_routes.route('/attendance/clock-out', methods=['POST'])
@jwt_required
def clock_out():
    """Clock out worker (Site Engineer)"""
    return clock_out_worker()


@labour_routes.route('/attendance/<int:project_id>/<string:date>', methods=['GET'])
@jwt_required
def daily_attendance(project_id, date):
    """Get daily attendance for project"""
    return get_daily_attendance(project_id, date)


@labour_routes.route('/attendance/<int:attendance_id>', methods=['PUT'])
@jwt_required
def edit_attendance(attendance_id):
    """Update attendance record (corrections)"""
    return update_attendance(attendance_id)


# ============================================================================
# STEP 7: Review & Lock (Project Manager)
# ============================================================================

@labour_routes.route('/attendance/to-lock', methods=['GET'])
@jwt_required
def attendance_to_lock():
    """Get attendance records pending lock (Project Manager)"""
    return get_attendance_to_lock()


@labour_routes.route('/attendance/<int:attendance_id>/lock', methods=['POST'])
@jwt_required
def lock_single_attendance(attendance_id):
    """Lock single attendance record (Project Manager)"""
    return lock_attendance(attendance_id)


@labour_routes.route('/attendance/lock-day', methods=['POST'])
@jwt_required
def lock_day():
    """Lock all attendance for a project/date (Project Manager)"""
    return lock_day_attendance()


# ============================================================================
# STEP 8: Payroll (Admin/HR)
# ============================================================================

@labour_routes.route('/payroll/locked', methods=['GET'])
@jwt_required
def locked_for_payroll():
    """Get locked attendance records for payroll (Admin/HR)"""
    return get_locked_for_payroll()


@labour_routes.route('/payroll/summary', methods=['GET'])
@jwt_required
def payroll_summary():
    """Get payroll summary grouped by worker (Admin/HR)"""
    return get_payroll_summary()


# ============================================================================
# Dashboard & Reports
# ============================================================================

@labour_routes.route('/dashboard', methods=['GET'])
@jwt_required
def dashboard():
    """Get labour dashboard statistics"""
    return get_labour_dashboard()


# ============================================================================
# Utility Routes
# ============================================================================

@labour_routes.route('/projects', methods=['GET'])
@jwt_required
def list_projects():
    """Get projects accessible to current user (for dropdowns/filters)"""
    return get_user_projects()
