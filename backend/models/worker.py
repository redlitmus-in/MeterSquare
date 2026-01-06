"""
Worker Model for Labour Management System
Stores worker registry information including skills, rates, and contact details.
"""
from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class Worker(db.Model):
    """
    Worker model for labour management.
    Step 1 in the workflow: Production Manager adds workers to the registry.
    """
    __tablename__ = "workers"

    worker_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    worker_code = db.Column(db.String(50), unique=True, nullable=False, index=True)  # Auto: WRK-001
    full_name = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(50), nullable=True)
    email = db.Column(db.String(255), nullable=True)
    hourly_rate = db.Column(db.Float, nullable=False)
    skills = db.Column(JSONB, default=[])  # ["Mason", "Carpenter", "Helper"]
    worker_type = db.Column(db.String(50), default='regular')  # regular, contractor, daily
    emergency_contact = db.Column(db.String(255), nullable=True)
    emergency_phone = db.Column(db.String(50), nullable=True)
    id_number = db.Column(db.String(100), nullable=True)  # National ID, Passport, etc.
    id_type = db.Column(db.String(50), nullable=True)  # national_id, passport, work_permit
    photo_url = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), default='active', index=True)  # active, inactive, terminated
    notes = db.Column(db.Text, nullable=True)

    # Standard tracking fields
    is_deleted = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)

    # Relationships
    assignments = db.relationship('WorkerAssignment', backref='worker', lazy='dynamic')
    attendance_records = db.relationship('DailyAttendance', backref='worker', lazy='dynamic')
    arrivals = db.relationship('LabourArrival', backref='worker', lazy='dynamic')

    def to_dict(self):
        """Serialize worker to dictionary for JSON responses"""
        return {
            'worker_id': self.worker_id,
            'worker_code': self.worker_code,
            'full_name': self.full_name,
            'phone': self.phone,
            'email': self.email,
            'hourly_rate': float(self.hourly_rate) if self.hourly_rate else 0.0,
            'skills': self.skills or [],
            'worker_type': self.worker_type,
            'emergency_contact': self.emergency_contact,
            'emergency_phone': self.emergency_phone,
            'id_number': self.id_number,
            'id_type': self.id_type,
            'photo_url': self.photo_url,
            'status': self.status,
            'notes': self.notes,
            'is_deleted': self.is_deleted,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None,
            'last_modified_by': self.last_modified_by
        }

    def to_dict_minimal(self):
        """Minimal serialization for list views"""
        return {
            'worker_id': self.worker_id,
            'worker_code': self.worker_code,
            'full_name': self.full_name,
            'phone': self.phone,
            'hourly_rate': float(self.hourly_rate) if self.hourly_rate else 0.0,
            'skills': self.skills or [],
            'status': self.status
        }

    @staticmethod
    def generate_worker_code():
        """Generate the next worker code (WRK-001, WRK-002, etc.)"""
        from sqlalchemy import func
        last_worker = db.session.query(func.max(Worker.worker_id)).scalar()
        next_id = (last_worker or 0) + 1
        return f"WRK-{next_id:03d}"

    def __repr__(self):
        return f"<Worker {self.worker_code}: {self.full_name}>"
