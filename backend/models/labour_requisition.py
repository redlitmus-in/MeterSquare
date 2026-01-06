"""
Labour Requisition Model for Labour Management System
Handles site requisition requests from Site Engineers.
"""
from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class LabourRequisition(db.Model):
    """
    Labour Requisition model for managing worker requests.
    Step 2 & 3 in the workflow:
    - Site Engineer raises requisition (Step 2)
    - Project Manager approves/rejects (Step 3)
    Step 4: Production Manager assigns workers
    """
    __tablename__ = "labour_requisitions"

    requisition_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    requisition_code = db.Column(db.String(50), unique=True, nullable=False, index=True)  # Auto: REQ-001
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False, index=True)
    site_name = db.Column(db.String(255), nullable=False)
    work_description = db.Column(db.Text, nullable=False)
    skill_required = db.Column(db.String(100), nullable=False)  # Mason, Helper, Carpenter, etc.
    workers_count = db.Column(db.Integer, nullable=False)
    required_date = db.Column(db.Date, nullable=False, index=True)

    # BOQ Labour Item Reference (for tracking which labour items have requisitions)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=True, index=True)
    item_id = db.Column(db.String(100), nullable=True, index=True)  # BOQ item ID (e.g., 'item_1_1')
    labour_id = db.Column(db.String(100), nullable=True, index=True)  # Labour item ID (e.g., 'lab_1_1_1')

    # Work completion status (tracks labour work progress)
    work_status = db.Column(db.String(50), default='pending_assignment', index=True)  # pending_assignment, assigned, in_progress, completed

    # Requester info (Site Engineer)
    requested_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False, index=True)
    requested_by_name = db.Column(db.String(255), nullable=False)
    request_date = db.Column(db.DateTime, default=datetime.utcnow)

    # Approval workflow (Step 3 - Project Manager)
    status = db.Column(db.String(50), default='pending', index=True)  # pending, approved, rejected
    approved_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)
    approved_by_name = db.Column(db.String(255), nullable=True)
    approval_date = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)

    # Assignment tracking (Step 4 - Production Manager)
    assignment_status = db.Column(db.String(50), default='unassigned', index=True)  # unassigned, assigned
    assigned_worker_ids = db.Column(JSONB, nullable=True)  # Array of worker IDs: [1, 2, 3]
    assigned_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)
    assigned_by_name = db.Column(db.String(255), nullable=True)
    assignment_date = db.Column(db.DateTime, nullable=True)
    whatsapp_notified = db.Column(db.Boolean, default=False)

    # Standard tracking fields
    is_deleted = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)

    # Relationships
    project = db.relationship('Project', backref='labour_requisitions', lazy='joined')
    requested_by = db.relationship('User', foreign_keys=[requested_by_user_id], lazy='joined')
    arrivals = db.relationship('LabourArrival', backref='requisition', lazy='dynamic')
    assignments = db.relationship('WorkerAssignment', backref='requisition', lazy='dynamic')

    def to_dict(self):
        """Serialize requisition to dictionary for JSON responses"""
        return {
            'requisition_id': self.requisition_id,
            'requisition_code': self.requisition_code,
            'project_id': self.project_id,
            'project_name': self.project.project_name if self.project else None,
            'site_name': self.site_name,
            'work_description': self.work_description,
            'skill_required': self.skill_required,
            'workers_count': self.workers_count,
            'required_date': self.required_date.isoformat() if self.required_date else None,
            'boq_id': self.boq_id,
            'item_id': self.item_id,
            'labour_id': self.labour_id,
            'work_status': self.work_status,
            'requested_by_user_id': self.requested_by_user_id,
            'requested_by_name': self.requested_by_name,
            'request_date': self.request_date.isoformat() if self.request_date else None,
            'status': self.status,
            'approved_by_user_id': self.approved_by_user_id,
            'approved_by_name': self.approved_by_name,
            'approval_date': self.approval_date.isoformat() if self.approval_date else None,
            'rejection_reason': self.rejection_reason,
            'assignment_status': self.assignment_status,
            'assigned_worker_ids': self.assigned_worker_ids or [],
            'assigned_by_user_id': self.assigned_by_user_id,
            'assigned_by_name': self.assigned_by_name,
            'assignment_date': self.assignment_date.isoformat() if self.assignment_date else None,
            'whatsapp_notified': self.whatsapp_notified,
            'is_deleted': self.is_deleted,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None
        }

    def to_dict_minimal(self):
        """Minimal serialization for list views"""
        return {
            'requisition_id': self.requisition_id,
            'requisition_code': self.requisition_code,
            'project_name': self.project.project_name if self.project else None,
            'site_name': self.site_name,
            'skill_required': self.skill_required,
            'workers_count': self.workers_count,
            'required_date': self.required_date.isoformat() if self.required_date else None,
            'status': self.status,
            'assignment_status': self.assignment_status
        }

    @staticmethod
    def generate_requisition_code():
        """Generate the next requisition code (REQ-001, REQ-002, etc.)"""
        from sqlalchemy import func
        last_req = db.session.query(func.max(LabourRequisition.requisition_id)).scalar()
        next_id = (last_req or 0) + 1
        return f"REQ-{next_id:03d}"

    def __repr__(self):
        return f"<LabourRequisition {self.requisition_code}: {self.skill_required} x{self.workers_count}>"
