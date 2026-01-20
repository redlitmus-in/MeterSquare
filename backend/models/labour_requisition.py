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
    required_date = db.Column(db.Date, nullable=False, index=True)
    start_time = db.Column(db.Time, nullable=True)  # Work shift start time
    end_time = db.Column(db.Time, nullable=True)  # Work shift end time
    preferred_worker_ids = db.Column(JSONB, nullable=True)  # Array of preferred worker IDs: [1, 2, 3]
    preferred_workers_notes = db.Column(db.Text, nullable=True)  # Additional notes

    # Labour items as JSONB array - stores multiple labours in single requisition
    # Format: [{"work_description": "...", "skill_required": "...", "workers_count": 5, "boq_id": 1, "item_id": "...", "labour_id": "..."}]
    labour_items = db.Column(JSONB, nullable=False)

    # DEPRECATED: These fields kept for backward compatibility, but use labour_items for new requisitions
    work_description = db.Column(db.Text, nullable=True)
    skill_required = db.Column(db.String(100), nullable=True)
    workers_count = db.Column(db.Integer, nullable=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=True, index=True)
    item_id = db.Column(db.String(100), nullable=True, index=True)
    labour_id = db.Column(db.String(100), nullable=True, index=True)

    # Work completion status (tracks labour work progress)
    work_status = db.Column(db.String(50), default='pending_assignment', index=True)  # pending_assignment, assigned, in_progress, completed

    # Requester info (Site Engineer or Project Manager)
    requested_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False, index=True)
    requested_by_name = db.Column(db.String(255), nullable=False)
    requester_role = db.Column(db.String(10), default='SE', index=True)  # 'SE' or 'PM'
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
    arrivals = db.relationship('LabourArrival', back_populates='requisition', lazy='dynamic')
    assignments = db.relationship('WorkerAssignment', backref='requisition', lazy='dynamic')

    def to_dict(self):
        """Serialize requisition to dictionary for JSON responses"""
        # Calculate total workers count from labour_items
        total_workers = sum(item.get('workers_count', 0) for item in (self.labour_items or []))

        # Get assigned worker names from Worker model
        assigned_workers = []
        if self.assigned_worker_ids:
            from models.worker import Worker
            worker_ids = self.assigned_worker_ids if isinstance(self.assigned_worker_ids, list) else []
            if worker_ids:
                workers = Worker.query.filter(
                    Worker.worker_id.in_(worker_ids),
                    Worker.is_deleted == False
                ).all()
                assigned_workers = [{'worker_id': w.worker_id, 'full_name': w.full_name, 'worker_code': w.worker_code} for w in workers]

        # Get preferred worker details
        preferred_workers = []
        if self.preferred_worker_ids:
            from models.worker import Worker
            pref_worker_ids = self.preferred_worker_ids if isinstance(self.preferred_worker_ids, list) else []
            if pref_worker_ids:
                pref_workers = Worker.query.filter(
                    Worker.worker_id.in_(pref_worker_ids),
                    Worker.is_deleted == False
                ).all()
                preferred_workers = [{'worker_id': w.worker_id, 'full_name': w.full_name, 'worker_code': w.worker_code} for w in pref_workers]

        return {
            'requisition_id': self.requisition_id,
            'requisition_code': self.requisition_code,
            'project_id': self.project_id,
            'project_name': self.project.project_name if self.project else None,
            'site_name': self.site_name,
            'required_date': self.required_date.isoformat() if self.required_date else None,
            'start_time': self.start_time.strftime('%H:%M') if self.start_time else None,
            'end_time': self.end_time.strftime('%H:%M') if self.end_time else None,
            'preferred_worker_ids': self.preferred_worker_ids or [],
            'preferred_workers': preferred_workers,
            'preferred_workers_notes': self.preferred_workers_notes,
            'labour_items': self.labour_items or [],
            'total_workers_count': total_workers,
            # Backward compatibility fields (deprecated, use labour_items instead)
            'work_description': self.work_description,
            'skill_required': self.skill_required,
            'workers_count': self.workers_count,
            'boq_id': self.boq_id,
            'item_id': self.item_id,
            'labour_id': self.labour_id,
            'work_status': self.work_status,
            'requested_by_user_id': self.requested_by_user_id,
            'requested_by_name': self.requested_by_name,
            'requester_role': self.requester_role,
            'request_date': self.request_date.isoformat() if self.request_date else None,
            'status': self.status,
            'approved_by_user_id': self.approved_by_user_id,
            'approved_by_name': self.approved_by_name,
            'approval_date': self.approval_date.isoformat() if self.approval_date else None,
            'rejection_reason': self.rejection_reason,
            'assignment_status': self.assignment_status,
            'assigned_worker_ids': self.assigned_worker_ids or [],
            'assigned_workers': assigned_workers,  # NEW: Include worker names
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
        from sqlalchemy import text

        # Use PostgreSQL advisory lock to serialize code generation across sessions
        # Lock ID: 123456 (arbitrary number for labour requisition codes)
        lock_id = 123456

        try:
            # Acquire advisory lock (waits if another session holds it)
            db.session.execute(text("SELECT pg_advisory_lock(:lock_id)"), {"lock_id": lock_id})

            # Now safely query for the next number
            result = db.session.execute(
                text("""
                    SELECT COALESCE(
                        MAX(
                            CAST(
                                SUBSTRING(requisition_code FROM 'REQ-([0-9]+)')
                                AS INTEGER
                            )
                        ),
                        0
                    ) + 1 AS next_number
                    FROM labour_requisitions
                    WHERE requisition_code ~ '^REQ-[0-9]+$'
                """)
            ).fetchone()

            if result and result[0]:
                next_number = result[0]
            else:
                next_number = 1

            code = f"REQ-{next_number:03d}"
            return code

        finally:
            # Always release the advisory lock
            db.session.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": lock_id})

    def __repr__(self):
        return f"<LabourRequisition {self.requisition_code}: {self.skill_required} x{self.workers_count}>"
