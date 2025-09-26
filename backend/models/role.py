# models/role.py

from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class Role(db.Model):
    __tablename__ = "roles"
    
    # Match actual database schema exactly
    role_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    role = db.Column(db.String(255), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    permissions = db.Column(JSONB, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=True)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
    
    def to_dict(self):
        return {
            "role_id": self.role_id,
            "role": self.role,
            "description": self.description,
            "permissions": self.permissions,
            "is_active": self.is_active,
            "is_deleted": self.is_deleted,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_modified_at": self.last_modified_at.isoformat() if self.last_modified_at else None
        }

    def __repr__(self):
        return f"<Role {self.role}>"