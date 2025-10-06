from datetime import datetime
from config.db import db


class User(db.Model):
    __tablename__ = "users"
    
    # Updated schema - removed password, avatar_url, org_uuid, and columns not in DB
    user_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    full_name = db.Column(db.String(255), nullable=True)
    phone = db.Column(db.String(255), nullable=True)
    user_status = db.Column(db.String(255), nullable=True) 
    role_id = db.Column(db.Integer, nullable=False)
    department = db.Column(db.String(100), nullable=True)  # Added department field
    is_active = db.Column(db.Boolean, default=True, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    last_login = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=True)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    
    # Relationship with Role - use string reference to avoid circular imports
    role = db.relationship('Role', foreign_keys=[role_id], primaryjoin='User.role_id == Role.role_id', lazy=True)

    def __init__(self, user_id=None, email=None, full_name=None, phone=None, role_id=None, 
                 department=None, is_active=True, is_deleted=False, last_login=None, user_status=None,
                 created_at=None, last_modified_at=None):
        if user_id is not None:
            self.user_id = user_id
        if email is not None:
            self.email = email
        if full_name is not None:
            self.full_name = full_name
        if phone is not None:
            self.phone = phone
        if role_id is not None:
            self.role_id = role_id
        if user_status is not None:
            self.user_status = user_status
        if department is not None:
            self.department = department
        if is_active is not None:
            self.is_active = is_active
        if is_deleted is not None:
            self.is_deleted = is_deleted
        if last_login is not None:
            self.last_login = last_login
        if created_at is not None:
            self.created_at = created_at
        if last_modified_at is not None:
            self.last_modified_at = last_modified_at

    def to_dict(self):
        return {
            "user_id": str(self.user_id),
            "email": self.email,
            "full_name": self.full_name,
            "role_id": self.role_id,
            'user_status': self.user_status,
            "phone": self.phone,
            "department": self.department,
            "is_active": self.is_active,
            "is_deleted": self.is_deleted,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_modified_at": self.last_modified_at.isoformat() if self.last_modified_at else None
        }

    def __repr__(self):
        return f"<User {self.email}>"
