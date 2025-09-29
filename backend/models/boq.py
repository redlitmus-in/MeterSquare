from datetime import datetime
from config.db import db


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

    project = db.relationship("Project", backref=db.backref("boqs", lazy=True))


class BOQItem(db.Model):
    __tablename__ = "boq_items"

    item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False)
    item_name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)

    # cost components
    base_cost = db.Column(db.Float, default=0.0)
    overhead_amount = db.Column(db.Float, default=0.0)
    profit_margin_percentage = db.Column(db.Float, default=0.0)
    profit_margin_amount = db.Column(db.Float, default=0.0)
    total_cost = db.Column(db.Float, default=0.0)
    selling_price = db.Column(db.Float, default=0.0)
    status = db.Column(db.String(50), default="Active")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)

    boq = db.relationship("BOQ", backref=db.backref("items", lazy=True))


class BOQMaterial(db.Model):
    __tablename__ = "boq_materials"

    material_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    item_id = db.Column(db.Integer, db.ForeignKey("boq_items.item_id"), nullable=False)
    material_name = db.Column(db.String(255), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    unit = db.Column(db.String(50), nullable=False)
    unit_price = db.Column(db.Float, nullable=False)
    total_price = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)

    item = db.relationship("BOQItem", backref=db.backref("materials", lazy=True))


class BOQLabour(db.Model):
    __tablename__ = "boq_labour"

    labour_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    item_id = db.Column(db.Integer, db.ForeignKey("boq_items.item_id"), nullable=False)
    labour_role = db.Column(db.String(255), nullable=False)  # e.g., Fabricator, Installer
    hours = db.Column(db.Float, nullable=False)
    rate_per_hour = db.Column(db.Float, nullable=False)
    total_cost = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)

    item = db.relationship("BOQItem", backref=db.backref("labours", lazy=True))