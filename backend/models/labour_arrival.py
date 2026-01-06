"""
Labour Arrival Model for Labour Management System
Tracks worker arrival confirmations at site.
"""
from datetime import datetime
from config.db import db


class LabourArrival(db.Model):
    """
    Labour Arrival model for tracking worker arrivals at site.
    Step 5 in the workflow: Site Engineer confirms worker arrivals.
    """
    __tablename__ = "labour_arrivals"

    arrival_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    requisition_id = db.Column(db.Integer, db.ForeignKey("labour_requisitions.requisition_id"), nullable=False, index=True)
    worker_id = db.Column(db.Integer, db.ForeignKey("workers.worker_id"), nullable=False, index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False, index=True)
    arrival_date = db.Column(db.Date, nullable=False, index=True)

    # Arrival confirmation
    arrival_status = db.Column(db.String(50), default='assigned', index=True)  # assigned, confirmed, no_show, departed
    arrival_time = db.Column(db.String(10), nullable=True)  # Time confirmed (HH:MM format)
    confirmed_at = db.Column(db.DateTime, nullable=True)
    confirmed_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)

    # Departure tracking
    departure_time = db.Column(db.String(10), nullable=True)  # Time departed (HH:MM format)
    departed_at = db.Column(db.DateTime, nullable=True)

    # Standard tracking fields
    is_deleted = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)

    # Unique constraint
    __table_args__ = (
        db.UniqueConstraint('requisition_id', 'worker_id', 'arrival_date', name='unique_req_worker_date'),
    )

    # Relationships
    project = db.relationship('Project', backref='labour_arrivals', lazy='joined')
    confirmed_by = db.relationship('User', foreign_keys=[confirmed_by_user_id], lazy='joined')

    def to_dict(self):
        """Serialize arrival to dictionary for JSON responses"""
        return {
            'arrival_id': self.arrival_id,
            'requisition_id': self.requisition_id,
            'worker_id': self.worker_id,
            'worker_name': self.worker.full_name if self.worker else None,
            'worker_code': self.worker.worker_code if self.worker else None,
            'project_id': self.project_id,
            'project_name': self.project.project_name if self.project else None,
            'arrival_date': self.arrival_date.isoformat() if self.arrival_date else None,
            'arrival_status': self.arrival_status,
            'arrival_time': self.arrival_time,
            'departure_time': self.departure_time,
            'departed_at': self.departed_at.isoformat() if self.departed_at else None,
            'confirmed_at': self.confirmed_at.isoformat() if self.confirmed_at else None,
            'confirmed_by_user_id': self.confirmed_by_user_id,
            'is_deleted': self.is_deleted,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by
        }

    def to_dict_with_worker(self):
        """Include worker details for arrival confirmation UI"""
        worker_data = {
            'worker_id': self.worker.worker_id,
            'worker_code': self.worker.worker_code,
            'full_name': self.worker.full_name,
            'phone': self.worker.phone,
            'skills': self.worker.skills or [],
            'hourly_rate': float(self.worker.hourly_rate) if self.worker.hourly_rate else 0.0
        } if self.worker else None

        return {
            'arrival_id': self.arrival_id,
            'requisition_id': self.requisition_id,
            'project_id': self.project_id,
            'arrival_date': self.arrival_date.isoformat() if self.arrival_date else None,
            'arrival_status': self.arrival_status,
            'arrival_time': self.arrival_time,
            'departure_time': self.departure_time,
            'departed_at': self.departed_at.isoformat() if self.departed_at else None,
            'confirmed_at': self.confirmed_at.isoformat() if self.confirmed_at else None,
            'worker': worker_data
        }

    def __repr__(self):
        return f"<LabourArrival {self.arrival_id}: Worker {self.worker_id} on {self.arrival_date}>"
