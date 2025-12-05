from config.db import db
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from datetime import datetime

class PMAssignSS(db.Model):
    __tablename__ = 'pm_assign_ss'

    pm_assign_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.project_id'), nullable=True)
    pm_ids = db.Column(db.SmallInteger, nullable=True)
    ss_ids = db.Column(ARRAY(db.Integer), nullable=True)

    # Item-level assignment fields
    boq_id = db.Column(db.Integer, db.ForeignKey('boq.boq_id'), nullable=True)
    item_indices = db.Column(ARRAY(db.Integer), nullable=True)
    item_details = db.Column(JSONB, nullable=True)
    assignment_status = db.Column(db.String(50), default='assigned')
    assigned_by_pm_id = db.Column(db.Integer, nullable=True)
    assigned_to_se_id = db.Column(db.Integer, nullable=True)
    assignment_date = db.Column(db.DateTime, default=datetime.utcnow)
    completion_date = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    # SE completion request tracking
    se_completion_requested = db.Column(db.Boolean, default=False)
    se_completion_request_date = db.Column(db.DateTime, nullable=True)

    # PM confirmation tracking
    pm_confirmed_completion = db.Column(db.Boolean, default=False)
    pm_confirmation_date = db.Column(db.DateTime, nullable=True)

    # Standard tracking fields
    is_deleted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(255), nullable=True)
    last_modified_at = db.Column(db.DateTime, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)

    def to_dict(self):
        return {
            'pm_assign_id': self.pm_assign_id,
            'project_id': self.project_id,
            'pm_ids': self.pm_ids,
            'ss_ids': self.ss_ids,
            'boq_id': self.boq_id,
            'item_indices': self.item_indices,
            'item_details': self.item_details,
            'assignment_status': self.assignment_status,
            'assigned_by_pm_id': self.assigned_by_pm_id,
            'assigned_to_se_id': self.assigned_to_se_id,
            'assignment_date': self.assignment_date.isoformat() if self.assignment_date else None,
            'completion_date': self.completion_date.isoformat() if self.completion_date else None,
            'notes': self.notes,
            'se_completion_requested': self.se_completion_requested,
            'se_completion_request_date': self.se_completion_request_date.isoformat() if self.se_completion_request_date else None,
            'pm_confirmed_completion': self.pm_confirmed_completion,
            'pm_confirmation_date': self.pm_confirmation_date.isoformat() if self.pm_confirmation_date else None,
            'is_deleted': self.is_deleted,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None,
            'last_modified_by': self.last_modified_by
        }
