"""
Daily Attendance Model for Labour Management System
Tracks clock-in/out times and attendance records.
"""
from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class DailyAttendance(db.Model):
    """
    Daily Attendance model for tracking worker clock-in/out.
    Step 6 in the workflow: Site Engineer logs attendance.
    Step 7: Project Manager reviews and locks data.
    """
    __tablename__ = "daily_attendance"

    attendance_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    worker_id = db.Column(db.Integer, db.ForeignKey("workers.worker_id"), nullable=False, index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False, index=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey("worker_assignments.assignment_id"), nullable=True, index=True)
    requisition_id = db.Column(db.Integer, db.ForeignKey("labour_requisitions.requisition_id"), nullable=True, index=True)
    attendance_date = db.Column(db.Date, nullable=False, index=True)

    # Labour role tracking - which labour type/skill the worker performed this day
    # This links attendance to specific labour items in BOQ for accurate cost tracking
    labour_role = db.Column(db.String(100), nullable=True, index=True)

    # Clock times
    clock_in_time = db.Column(db.DateTime, nullable=True)
    clock_out_time = db.Column(db.DateTime, nullable=True)
    total_hours = db.Column(db.Float, nullable=True)
    break_duration_minutes = db.Column(db.Integer, default=0)
    regular_hours = db.Column(db.Float, nullable=True)
    overtime_hours = db.Column(db.Float, default=0)

    # Cost calculation
    hourly_rate = db.Column(db.Float, nullable=False)
    overtime_rate_multiplier = db.Column(db.Float, default=1.5)
    total_cost = db.Column(db.Float, nullable=True)

    # Status
    attendance_status = db.Column(db.String(50), default='present', index=True)  # present, absent, half_day, sick, leave
    is_absent = db.Column(db.Boolean, default=False)
    absent_reason = db.Column(db.Text, nullable=True)

    # Entry tracking
    entered_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False, index=True)
    entered_by_role = db.Column(db.String(50), nullable=False)  # SE, PM
    entry_notes = db.Column(db.Text, nullable=True)

    # Approval workflow (Step 7 - Lock)
    approval_status = db.Column(db.String(50), default='pending', index=True)  # pending, locked, rejected
    approved_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)
    approved_by_name = db.Column(db.String(255), nullable=True)
    approval_date = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)

    # Correction tracking
    original_clock_in = db.Column(db.DateTime, nullable=True)
    original_clock_out = db.Column(db.DateTime, nullable=True)
    correction_reason = db.Column(db.Text, nullable=True)
    corrected_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)
    corrected_at = db.Column(db.DateTime, nullable=True)

    # Standard tracking fields
    is_deleted = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)

    # Unique constraint
    __table_args__ = (
        db.UniqueConstraint('worker_id', 'project_id', 'attendance_date', name='unique_worker_project_date'),
    )

    # Relationships
    project = db.relationship('Project', backref='daily_attendance_records', lazy='joined')
    requisition = db.relationship('LabourRequisition', foreign_keys=[requisition_id], lazy='joined')
    entered_by = db.relationship('User', foreign_keys=[entered_by_user_id], lazy='joined')
    approved_by = db.relationship('User', foreign_keys=[approved_by_user_id], lazy='joined')
    corrected_by = db.relationship('User', foreign_keys=[corrected_by_user_id], lazy='joined')
    approval_history = db.relationship('AttendanceApprovalHistory', backref='attendance', lazy='dynamic')

    def calculate_hours_and_cost(self):
        """
        Calculate total hours and cost based on clock times and shift schedule.
        Overtime is calculated ONLY after the shift end_time, not after 8 hours.
        """
        if self.clock_in_time and self.clock_out_time:
            duration = self.clock_out_time - self.clock_in_time
            total_minutes = duration.total_seconds() / 60

            # Subtract break time
            total_minutes -= (self.break_duration_minutes or 0)

            self.total_hours = round(total_minutes / 60, 2) if total_minutes >= 0 else 0.0

            # Calculate regular and overtime based on shift schedule
            # If requisition has start/end times, use those for overtime calculation
            if self.requisition and self.requisition.start_time and self.requisition.end_time:
                # Get shift end time for this date
                shift_end_datetime = datetime.combine(
                    self.attendance_date,
                    self.requisition.end_time
                )

                # Handle overnight shifts (end_time < start_time)
                if self.requisition.end_time < self.requisition.start_time:
                    # Shift ends next day
                    from datetime import timedelta
                    shift_end_datetime += timedelta(days=1)

                # Calculate overtime: hours worked AFTER shift end time
                if self.clock_out_time > shift_end_datetime:
                    overtime_duration = self.clock_out_time - shift_end_datetime
                    overtime_minutes = overtime_duration.total_seconds() / 60
                    self.overtime_hours = round(overtime_minutes / 60, 2)
                    self.regular_hours = round(self.total_hours - self.overtime_hours, 2)
                else:
                    # Clocked out before or at shift end - no overtime
                    self.regular_hours = self.total_hours
                    self.overtime_hours = 0.0
            else:
                # Fallback: Use 8-hour threshold if no shift times defined
                if self.total_hours > 8:
                    self.regular_hours = 8.0
                    self.overtime_hours = round(self.total_hours - 8, 2)
                else:
                    self.regular_hours = self.total_hours
                    self.overtime_hours = 0.0

            # Calculate cost (with null safety)
            hourly_rate = float(self.hourly_rate) if self.hourly_rate is not None else 0.0
            overtime_multiplier = float(self.overtime_rate_multiplier) if self.overtime_rate_multiplier is not None else 1.5

            regular_cost = (self.regular_hours or 0.0) * hourly_rate
            overtime_cost = (self.overtime_hours or 0.0) * hourly_rate * overtime_multiplier
            self.total_cost = round(regular_cost + overtime_cost, 2)
        elif self.is_absent:
            self.total_hours = 0.0
            self.regular_hours = 0.0
            self.overtime_hours = 0.0
            self.total_cost = 0.0

    def to_dict(self):
        """Serialize attendance to dictionary for JSON responses"""
        return {
            'attendance_id': self.attendance_id,
            'worker_id': self.worker_id,
            'worker_name': self.worker.full_name if self.worker else None,
            'worker_code': self.worker.worker_code if self.worker else None,
            'project_id': self.project_id,
            'project_name': self.project.project_name if self.project else None,
            'assignment_id': self.assignment_id,
            'requisition_id': self.requisition_id,
            'labour_role': self.labour_role,
            'attendance_date': self.attendance_date.isoformat() if self.attendance_date else None,
            'clock_in_time': self.clock_in_time.isoformat() if self.clock_in_time else None,
            'clock_out_time': self.clock_out_time.isoformat() if self.clock_out_time else None,
            'clock_in_display': self.clock_in_time.strftime('%H:%M') if self.clock_in_time else '--',
            'clock_out_display': self.clock_out_time.strftime('%H:%M') if self.clock_out_time else '--',
            'total_hours': float(self.total_hours) if self.total_hours else 0.0,
            'break_duration_minutes': self.break_duration_minutes or 0,
            'regular_hours': float(self.regular_hours) if self.regular_hours else 0.0,
            'overtime_hours': float(self.overtime_hours) if self.overtime_hours else 0.0,
            'hourly_rate': float(self.hourly_rate) if self.hourly_rate else 0.0,
            'overtime_rate_multiplier': float(self.overtime_rate_multiplier) if self.overtime_rate_multiplier else 1.5,
            'total_cost': float(self.total_cost) if self.total_cost else 0.0,
            'attendance_status': self.attendance_status,
            'is_absent': self.is_absent,
            'absent_reason': self.absent_reason,
            'entered_by_user_id': self.entered_by_user_id,
            'entered_by_role': self.entered_by_role,
            'entry_notes': self.entry_notes,
            'approval_status': self.approval_status,
            'approved_by_user_id': self.approved_by_user_id,
            'approved_by_name': self.approved_by_name,
            'approval_date': self.approval_date.isoformat() if self.approval_date else None,
            'rejection_reason': self.rejection_reason,
            'correction_reason': self.correction_reason,
            'is_deleted': self.is_deleted,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by
        }

    def to_dict_for_lock(self):
        """Serialization for PM lock view"""
        return {
            'attendance_id': self.attendance_id,
            'worker_id': self.worker_id,
            'worker_name': self.worker.full_name if self.worker else None,
            'worker_code': self.worker.worker_code if self.worker else None,
            'project_id': self.project_id,
            'project_name': self.project.project_name if self.project else None,
            'attendance_date': self.attendance_date.isoformat() if self.attendance_date else None,
            'clock_in_time': self.clock_in_time.isoformat() if self.clock_in_time else None,
            'clock_out_time': self.clock_out_time.isoformat() if self.clock_out_time else None,
            'clock_in_display': self.clock_in_time.strftime('%H:%M') if self.clock_in_time else '--',
            'clock_out_display': self.clock_out_time.strftime('%H:%M') if self.clock_out_time else '--',
            'total_hours': float(self.total_hours) if self.total_hours else 0.0,
            'regular_hours': float(self.regular_hours) if self.regular_hours else 0.0,
            'overtime_hours': float(self.overtime_hours) if self.overtime_hours else 0.0,
            'hourly_rate': float(self.hourly_rate) if self.hourly_rate else 0.0,
            'overtime_rate_multiplier': float(self.overtime_rate_multiplier) if self.overtime_rate_multiplier else 1.5,
            'break_duration_minutes': self.break_duration_minutes or 0,
            'total_cost': float(self.total_cost) if self.total_cost else 0.0,
            'attendance_status': self.attendance_status,
            'approval_status': self.approval_status,
            'entered_by_role': self.entered_by_role,
            'approved_by_name': self.approved_by_name,
            'approval_date': self.approval_date.isoformat() if self.approval_date else None
        }

    def __repr__(self):
        return f"<DailyAttendance {self.attendance_id}: Worker {self.worker_id} on {self.attendance_date}>"


class AttendanceApprovalHistory(db.Model):
    """
    Audit trail for attendance approvals and changes.
    """
    __tablename__ = "attendance_approval_history"

    history_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    attendance_id = db.Column(db.Integer, db.ForeignKey("daily_attendance.attendance_id"), nullable=False, index=True)
    action = db.Column(db.String(50), nullable=False, index=True)  # submitted, locked, rejected, corrected, resubmitted
    action_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False)
    action_by_name = db.Column(db.String(255), nullable=False)
    action_by_role = db.Column(db.String(50), nullable=False)
    action_date = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    comments = db.Column(db.Text, nullable=True)
    previous_status = db.Column(db.String(50), nullable=True)
    new_status = db.Column(db.String(50), nullable=True)
    data_snapshot = db.Column(JSONB, nullable=True)  # Store state at time of action
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    action_by = db.relationship('User', foreign_keys=[action_by_user_id], lazy='joined')

    def to_dict(self):
        """Serialize history entry to dictionary"""
        return {
            'history_id': self.history_id,
            'attendance_id': self.attendance_id,
            'action': self.action,
            'action_by_user_id': self.action_by_user_id,
            'action_by_name': self.action_by_name,
            'action_by_role': self.action_by_role,
            'action_date': self.action_date.isoformat() if self.action_date else None,
            'comments': self.comments,
            'previous_status': self.previous_status,
            'new_status': self.new_status,
            'data_snapshot': self.data_snapshot
        }

    def __repr__(self):
        return f"<AttendanceApprovalHistory {self.history_id}: {self.action} on {self.attendance_id}>"
