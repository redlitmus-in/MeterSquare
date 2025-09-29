from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class BOQ(db.Model):
    __tablename__ = "boq"

    boq_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False)
    boq_name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(50), default="Draft")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)

    project = db.relationship("Project", backref=db.backref("boqs", lazy=True))


# Master Tables - No duplicates, reusable across BOQs
class MasterItem(db.Model):
    __tablename__ = "boq_items"

    item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    item_name = db.Column(db.String(255), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    default_overhead_percentage = db.Column(db.Float, default=10.0)
    default_profit_percentage = db.Column(db.Float, default=15.0)
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
    # supplier = db.Column(db.String(255), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)


class MasterLabour(db.Model):
    __tablename__ = "boq_labours"

    labour_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    labour_role = db.Column(db.String(255), nullable=False, unique=True)
    item_id = db.Column(db.Integer)
    work_type = db.Column(db.String(100), nullable=True)  # Construction, Electrical, etc
    amount = db.Column(db.Float, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)


# BOQ Details Table - Stores JSON data for each BOQ
class BOQDetails(db.Model):
    __tablename__ = "boq_details"

    boq_detail_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False)
    boq_details = db.Column(JSONB, nullable=False)  # Stores complete BOQ structure
    total_cost = db.Column(db.Float, default=0.0)
    total_items = db.Column(db.Integer, default=0)
    total_materials = db.Column(db.Integer, default=0)
    total_labour = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False) 
    
    boq = db.relationship("BOQ", backref=db.backref("details", lazy=True))