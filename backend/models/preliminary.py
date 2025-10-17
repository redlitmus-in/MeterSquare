from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB

class Preliminary(db.Model):
    __tablename__ = "preliminaries"

    preliminary_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    description = db.Column(db.JSON, nullable=False)      # JSON column
    quantity = db.Column(db.Float, default=1)
    unit = db.Column(db.String(50), nullable=True)
    rate = db.Column(db.Float, nullable=True)
    amount = db.Column(db.Float, nullable=True)
    project_id = db.Column(db.Integer, nullable=True)
    is_default = db.Column(db.Boolean, default=False)
    is_deleted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)