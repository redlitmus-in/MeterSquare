from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import ARRAY


class Project(db.Model):
    __tablename__ = 'project'
    # __table_args__ = {'schema': 'public'}  # Explicitly set schema

    project_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_name = db.Column(db.String(255), nullable=False)  # Required
    # user_id is a project manager id in a user table
    user_id = db.Column(db.Integer, nullable=True)
    site_supervisor_id = db.Column(db.Integer, nullable=True)
    location = db.Column(db.String(255), nullable=True) 
    area = db.Column(db.String(100), nullable=True)
    floor_name = db.Column(db.String(255), nullable=True)  # Optional
    working_hours = db.Column(db.String(255), nullable=True)
    client = db.Column(db.String(255), nullable=True)  # Optional
    work_type = db.Column(db.String(255), nullable=True)  # Optional
    start_date = db.Column(db.Date, nullable=True)  # Optional - changed from required
    duration_days = db.Column(db.Integer, nullable=True)  # Project duration in days
    status = db.Column(db.String(50), nullable=False, default='active')  # Default status
    description = db.Column(db.Text, nullable=True)  # Changed to Text for longer descriptions
    completion_requested = db.Column(db.Boolean, default=False)  # SE completion request flag
    is_deleted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)
     
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
    
    def to_dict(self):
        """Convert to dictionary for JSON response"""
        # Calculate end_date from start_date and duration_days for backward compatibility
        end_date = None
        if self.start_date and self.duration_days:
            from datetime import timedelta
            end_date = (self.start_date + timedelta(days=self.duration_days)).isoformat()

        return {
            'project_id': self.project_id,
            'project_name': self.project_name,
            'user_id': self.user_id,
            'site_supervisor_id': self.site_supervisor_id,
            'area': self.area,
            'location': self.location,
            'floor_name': self.floor_name,
            'working_hours':self.working_hours,
            'client': self.client,
            'work_type': self.work_type,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'duration_days': self.duration_days,
            'end_date': end_date,  # Calculated for backward compatibility
            'status': self.status,
            'description': self.description,
            'completion_requested': self.completion_requested,
            'is_deleted': self.is_deleted,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            "last_modified_at": self.last_modified_at.isoformat() if self.last_modified_at else None,
            'last_modified_by': self.last_modified_by
        }