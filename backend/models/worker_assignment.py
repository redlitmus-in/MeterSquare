"""
Worker Assignment Model for Labour Management System
Links workers to projects with assignment details.
"""
from datetime import datetime
from config.db import db


class WorkerAssignment(db.Model):
    """
    Worker Assignment model for project-worker linking.
    Tracks which workers are assigned to which projects and for what duration.
    Also tracks Production Manager's factory resource allocations.
    """
    __tablename__ = "worker_assignments"

    assignment_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    worker_id = db.Column(db.Integer, db.ForeignKey("workers.worker_id"), nullable=False, index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False, index=True)
    requisition_id = db.Column(db.Integer, db.ForeignKey("labour_requisitions.requisition_id"), nullable=True, index=True)
    assigned_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False)
    assignment_type = db.Column(db.String(50), default='regular')  # regular, production_manager_allocation
    assignment_start_date = db.Column(db.Date, nullable=False, index=True)
    assignment_end_date = db.Column(db.Date, nullable=True)
    hourly_rate_override = db.Column(db.Float, nullable=True)  # Override worker's default rate
    role_at_site = db.Column(db.String(100), nullable=True)  # Worker's role for this project
    status = db.Column(db.String(50), default='active', index=True)  # active, completed, cancelled
    notes = db.Column(db.Text, nullable=True)

    # Production Manager specific fields
    is_factory_resource = db.Column(db.Boolean, default=False, index=True)
    allocated_by_production_manager_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)
    allocation_date = db.Column(db.DateTime, nullable=True)

    # Standard tracking fields
    is_deleted = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)

    # Relationships
    project = db.relationship('Project', backref='worker_assignments', lazy='joined')
    assigned_by = db.relationship('User', foreign_keys=[assigned_by_user_id], lazy='joined')
    allocated_by = db.relationship('User', foreign_keys=[allocated_by_production_manager_id], lazy='joined')
    attendance_records = db.relationship('DailyAttendance', backref='assignment', lazy='dynamic')

    def to_dict(self):
        """Serialize assignment to dictionary for JSON responses"""
        return {
            'assignment_id': self.assignment_id,
            'worker_id': self.worker_id,
            'worker_name': self.worker.full_name if self.worker else None,
            'worker_code': self.worker.worker_code if self.worker else None,
            'project_id': self.project_id,
            'project_name': self.project.project_name if self.project else None,
            'requisition_id': self.requisition_id,
            'assigned_by_user_id': self.assigned_by_user_id,
            'assignment_type': self.assignment_type,
            'assignment_start_date': self.assignment_start_date.isoformat() if self.assignment_start_date else None,
            'assignment_end_date': self.assignment_end_date.isoformat() if self.assignment_end_date else None,
            'hourly_rate_override': float(self.hourly_rate_override) if self.hourly_rate_override else None,
            'effective_hourly_rate': self.get_effective_hourly_rate(),
            'role_at_site': self.role_at_site,
            'status': self.status,
            'notes': self.notes,
            'is_factory_resource': self.is_factory_resource,
            'allocated_by_production_manager_id': self.allocated_by_production_manager_id,
            'allocation_date': self.allocation_date.isoformat() if self.allocation_date else None,
            'is_deleted': self.is_deleted,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by
        }

    def to_dict_minimal(self):
        """Minimal serialization for list views"""
        return {
            'assignment_id': self.assignment_id,
            'worker_id': self.worker_id,
            'worker_name': self.worker.full_name if self.worker else None,
            'project_id': self.project_id,
            'project_name': self.project.project_name if self.project else None,
            'assignment_start_date': self.assignment_start_date.isoformat() if self.assignment_start_date else None,
            'status': self.status,
            'is_factory_resource': self.is_factory_resource
        }

    def get_effective_hourly_rate(self):
        """Get the effective hourly rate (override or worker's default)"""
        if self.hourly_rate_override:
            return float(self.hourly_rate_override)
        if self.worker and self.worker.hourly_rate:
            return float(self.worker.hourly_rate)
        return 0.0

    def __repr__(self):
        return f"<WorkerAssignment {self.assignment_id}: Worker {self.worker_id} -> Project {self.project_id}>"
