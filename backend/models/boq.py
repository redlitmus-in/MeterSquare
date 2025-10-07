from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class BOQ(db.Model):
    __tablename__ = "boq"

    boq_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False)
    boq_name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(50), default="Draft")
    client_rejection_reason = db.Column(db.Text, nullable=True)  # For client rejection/cancellation reasons
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)
    email_sent = db.Column(db.Boolean, default=False)

    project = db.relationship("Project", backref=db.backref("boqs", lazy=True))


# Master Tables - No duplicates, reusable across BOQs
class MasterItem(db.Model):
    __tablename__ = "boq_items"

    item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    item_name = db.Column(db.String(255), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    overhead_percentage = db.Column(db.Float, nullable=True)
    overhead_amount = db.Column(db.Float, nullable=True)
    profit_margin_percentage = db.Column(db.Float, nullable=True)
    profit_margin_amount = db.Column(db.Float, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    is_deleted = db.Column(db.Boolean, default=False)


class MasterMaterial(db.Model):
    __tablename__ = "boq_material"

    material_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    material_name = db.Column(db.String(255), nullable=False, unique=True)
    item_id = db.Column(db.Integer)
    default_unit = db.Column(db.String(50), nullable=False)
    current_market_price = db.Column(db.Float, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)


class MasterLabour(db.Model):
    __tablename__ = "boq_labours"

    labour_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    labour_role = db.Column(db.String(255), nullable=False, unique=True)
    item_id = db.Column(db.Integer)
    work_type = db.Column(db.String(100), nullable=True)  # Construction, Electrical, etc
    hours = db.Column(db.Float, nullable=True)  # Labour hours (changed to Float)
    rate_per_hour = db.Column(db.Float, nullable=True)  # Rate per hour (changed to Float)
    amount = db.Column(db.Float, nullable=True)  # Total amount (hours * rate_per_hour)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)


# BOQ Details Table - Stores JSON data for each BOQ
class BOQDetails(db.Model):
    __tablename__ = "boq_details"

    boq_detail_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False)

    # Complete BOQ structure stored as JSONB
    boq_details = db.Column(JSONB, nullable=False)  # Stores complete BOQ structure

    # Summary fields
    total_cost = db.Column(db.Float, default=0.0)
    total_items = db.Column(db.Integer, default=0)
    total_materials = db.Column(db.Integer, default=0)
    total_labour = db.Column(db.Integer, default=0)

    # File upload related fields
    file_name = db.Column(db.String(255), nullable=True)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)

    boq = db.relationship("BOQ", backref=db.backref("details", lazy=True))


# BOQ History Table - Stores all BOQ actions and changes
class BOQHistory(db.Model):
    __tablename__ = "boq_history"

    boq_history_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False)
    action = db.Column(JSONB, nullable=True)  # EMAIL_SENT, STATUS_CHANGED, CREATED, UPDATED, APPROVED, REJECTED
    action_by = db.Column(db.String(100), nullable=False)
    boq_status = db.Column(db.String(50), nullable=True)  # BOQ status at the time of action
    sender = db.Column(db.String(255), nullable=True)  # Email sender or action performer
    receiver = db.Column(db.String(255), nullable=True)  # Email receiver or affected user
    comments = db.Column(db.Text, nullable=True)  # Additional comments
    sender_role = db.Column(db.String(255), nullable=True)
    receiver_role = db.Column(db.String(255), nullable=True)
    action_date = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)
    
    boq = db.relationship("BOQ", backref=db.backref("history", lazy=True))