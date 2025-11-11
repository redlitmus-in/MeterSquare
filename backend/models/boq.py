from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class BOQ(db.Model):
    __tablename__ = "boq"

    boq_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False, index=True)  # ✅ Added index
    boq_name = db.Column(db.String(500), nullable=False)
    status = db.Column(db.String(50), default="Draft", index=True)  # ✅ Added index (frequently filtered)
    revision_number = db.Column(db.Integer, default=0, nullable=False)
    internal_revision_number = db.Column(db.Integer, default=0, nullable=True)
    has_internal_revisions = db.Column(db.Boolean, default=False)
    client_rejection_reason = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)  # ✅ Added index
    created_by = db.Column(db.String(255), nullable=False, index=True)  # ✅ Added index
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, index=True)  # ✅ Added index (frequently filtered)
    email_sent = db.Column(db.Boolean, default=False)
    client_status = db.Column(db.Boolean, default=False)

    project = db.relationship("Project", backref=db.backref("boqs", lazy=True))

    # ✅ Composite indexes for common query patterns
    __table_args__ = (
        db.Index('idx_boq_project_status', 'project_id', 'status'),  # For queries like: WHERE project_id=X AND status=Y
        db.Index('idx_boq_deleted_status', 'is_deleted', 'status'),  # For queries like: WHERE is_deleted=false AND status=Y
        db.Index('idx_boq_created_at_desc', created_at.desc()),  # For ORDER BY created_at DESC
    )


# Master Tables - No duplicates, reusable across BOQs
class MasterItem(db.Model):
    __tablename__ = "boq_items"

    item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    item_name = db.Column(db.String(255), nullable=False, unique=True, index=True)  # ✅ Added index
    description = db.Column(db.Text, nullable=True)
    unit = db.Column(db.String(50), nullable=True)
    quantity = db.Column(db.Float, nullable=True)
    per_unit_cost = db.Column(db.Float, nullable=True)
    total_amount = db.Column(db.Float, nullable=True)
    item_total_cost = db.Column(db.Float, nullable=True)
    miscellaneous_percentage = db.Column(db.Float, nullable=True)
    miscellaneous_amount = db.Column(db.Float, nullable=True)
    overhead_percentage = db.Column(db.Float, nullable=True)
    overhead_amount = db.Column(db.Float, nullable=True)
    profit_margin_percentage = db.Column(db.Float, nullable=True)
    profit_margin_amount = db.Column(db.Float, nullable=True)
    discount_percentage = db.Column(db.Float, nullable=True)
    discount_amount = db.Column(db.Float, nullable=True)
    vat_percentage = db.Column(db.Float, nullable=True)
    vat_amount = db.Column(db.Float, nullable=True)
    is_active = db.Column(db.Boolean, default=True, index=True)  # ✅ Added index
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)  # ✅ Added index
    created_by = db.Column(db.String(255), nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, index=True)  # ✅ Added index

    # ✅ Composite index for active, non-deleted items
    __table_args__ = (
        db.Index('idx_item_active_deleted', 'is_active', 'is_deleted'),
    )


class MasterSubItem(db.Model):
    __tablename__ = "boq_sub_items"

    sub_item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    item_id = db.Column(db.Integer, db.ForeignKey("boq_items.item_id"), nullable=False, index=True)  # ✅ Added index
    sub_item_name = db.Column(db.String(255), nullable=False, index=True)  # ✅ Added index
    description = db.Column(db.Text, nullable=True)
    size = db.Column(db.String(255), nullable=True)
    location = db.Column(db.String(255), nullable=True)
    brand = db.Column(db.String(255), nullable=True)
    unit = db.Column(db.String(50), nullable=True)
    quantity = db.Column(db.Float, nullable=True)
    per_unit_cost = db.Column(db.Float, nullable=True)
    sub_item_total_cost = db.Column(db.Float, nullable=True)

    # Per-sub-item percentages (calculated from client rate)
    misc_percentage = db.Column(db.Float, default=10.0)
    misc_amount = db.Column(db.Float, default=0.0)
    overhead_profit_percentage = db.Column(db.Float, default=25.0)
    overhead_profit_amount = db.Column(db.Float, default=0.0)
    transport_percentage = db.Column(db.Float, default=5.0)
    transport_amount = db.Column(db.Float, default=0.0)

    # Cost breakdown
    material_cost = db.Column(db.Float, default=0.0)
    labour_cost = db.Column(db.Float, default=0.0)
    internal_cost = db.Column(db.Float, default=0.0)
    planned_profit = db.Column(db.Float, default=0.0)
    # Map database column 'actual_profit' to Python property 'negotiable_margin'
    negotiable_margin = db.Column('actual_profit', db.Float, default=0.0)

    is_active = db.Column(db.Boolean, default=True, index=True)  # ✅ Added index
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, index=True)  # ✅ Added index
    # Map Python attribute 'sub_item_image' to database column 'Sub_item_image'
    sub_item_image = db.Column(JSONB, nullable=True)
    item = db.relationship("MasterItem", backref=db.backref("sub_items", lazy=True))

    # ✅ Composite indexes
    __table_args__ = (
        db.Index('idx_subitem_item_id', 'item_id', 'is_deleted'),  # For queries by item_id
        db.Index('idx_subitem_active', 'is_active', 'is_deleted'),
    )


class MasterMaterial(db.Model):
    __tablename__ = "boq_material"

    material_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    material_name = db.Column(db.String(255), nullable=False, unique=True, index=True)  # ✅ Added index
    item_id = db.Column(db.Integer)
    sub_item_id = db.Column(db.Integer, db.ForeignKey("boq_sub_items.sub_item_id"), nullable=True)
    description = db.Column(db.Text, nullable=True)
    brand = db.Column(db.String(255), nullable=True)  # Material brand
    size = db.Column(db.String(255), nullable=True)  # Material size
    specification = db.Column(db.Text, nullable=True)  # Material specification
    quantity = db.Column(db.Float, nullable=True)
    default_unit = db.Column(db.String(50), nullable=False)
    current_market_price = db.Column(db.Float, nullable=True)
    total_price = db.Column(db.Float, nullable=True)
    vat_percentage = db.Column(db.Float, nullable=True)
    vat_amount = db.Column(db.Float, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    last_modified_by = db.Column(db.String(255), nullable=False)

    sub_item = db.relationship("MasterSubItem", backref=db.backref("materials", lazy=True))


class MasterLabour(db.Model):
    __tablename__ = "boq_labours"

    labour_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    labour_role = db.Column(db.String(255), nullable=False, unique=True)
    item_id = db.Column(db.Integer)
    sub_item_id = db.Column(db.Integer, db.ForeignKey("boq_sub_items.sub_item_id"), nullable=True)
    work_type = db.Column(db.String(100), nullable=True)  # Construction, Electrical, etc
    hours = db.Column(db.Float, nullable=True)  # Labour hours (changed to Float)
    rate_per_hour = db.Column(db.Float, nullable=True)  # Rate per hour (changed to Float)
    amount = db.Column(db.Float, nullable=True)  # Total amount (hours * rate_per_hour)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)

    sub_item = db.relationship("MasterSubItem", backref=db.backref("labour", lazy=True))


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


# BOQ Details History Table - Stores version history of BOQ details
class BOQDetailsHistory(db.Model):
    __tablename__ = "boq_details_history"

    boq_detail_history_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_detail_id = db.Column(db.Integer, db.ForeignKey("boq_details.boq_detail_id"), nullable=False)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False)
    version = db.Column(db.Integer, nullable=False)  # Version number (1, 2, 3...)

    # Complete BOQ structure stored as JSONB (snapshot of that version)
    boq_details = db.Column(JSONB, nullable=False)

    # Summary fields
    total_cost = db.Column(db.Float, default=0.0)
    total_items = db.Column(db.Integer, default=0)
    total_materials = db.Column(db.Integer, default=0)
    total_labour = db.Column(db.Integer, default=0)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)

    boq = db.relationship("BOQ", backref=db.backref("details_history", lazy=True))
    boq_detail = db.relationship("BOQDetails", backref=db.backref("history", lazy=True))


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


# Material Purchase Tracking Table - Tracks all material purchases with history
class MaterialPurchaseTracking(db.Model):
    __tablename__ = "material_purchase_tracking"

    purchase_tracking_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False)
    master_item_id = db.Column(db.Integer, nullable=True)
    item_name = db.Column(db.String(255), nullable=False)
    master_material_id = db.Column(db.Integer, db.ForeignKey("boq_material.material_id"), nullable=True)
    material_name = db.Column(db.String(255), nullable=False)

    # Purchase history stored as JSONB array
    # Each entry: {purchase_date, quantity, unit, unit_price, total_price, purchased_by, remaining_quantity}
    purchase_history = db.Column(JSONB, nullable=False, default=[])

    # Current totals (aggregated from history)
    total_quantity_purchased = db.Column(db.Float, default=0.0)
    total_quantity_used = db.Column(db.Float, default=0.0)
    remaining_quantity = db.Column(db.Float, default=0.0)
    unit = db.Column(db.String(50), nullable=False)

    # Latest purchase info
    latest_unit_price = db.Column(db.Float, nullable=True)
    latest_purchase_date = db.Column(db.DateTime, nullable=True)

    # Change Request Tracking - marks materials from approved change requests
    is_from_change_request = db.Column(db.Boolean, default=False)
    change_request_id = db.Column(db.Integer, db.ForeignKey("change_requests.cr_id"), nullable=True)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)

    boq = db.relationship("BOQ", backref=db.backref("material_tracking", lazy=True))
    material = db.relationship("MasterMaterial", backref=db.backref("purchase_tracking", lazy=True))
    change_request = db.relationship("ChangeRequest", backref=db.backref("material_purchases", lazy=True), foreign_keys=[change_request_id])

# Labour Tracking Table - Tracks labour hours with history
class LabourTracking(db.Model):
    __tablename__ = "labour_tracking"

    labour_tracking_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False)
    master_item_id = db.Column(db.Integer, nullable=True)
    item_name = db.Column(db.String(255), nullable=False)
    master_labour_id = db.Column(db.Integer, db.ForeignKey("boq_labours.labour_id"), nullable=True)
    labour_role = db.Column(db.String(255), nullable=False)

    # Labour history stored as JSONB array
    # Each entry: {work_date, hours, rate_per_hour, total_cost, worker_name, notes}
    labour_history = db.Column(JSONB, nullable=False, default=[])

    # Current totals (aggregated from history)
    total_hours_worked = db.Column(db.Float, default=0.0)
    total_cost = db.Column(db.Float, default=0.0)

    # Latest info
    latest_rate_per_hour = db.Column(db.Float, nullable=True)
    latest_work_date = db.Column(db.DateTime, nullable=True)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    last_modified_by = db.Column(db.String(255), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)

    boq = db.relationship("BOQ", backref=db.backref("labour_tracking", lazy=True))
    labour = db.relationship("MasterLabour", backref=db.backref("labour_tracking", lazy=True))


# Custom Units Table - Stores user-defined units
class CustomUnit(db.Model):
    __tablename__ = "custom_units"

    unit_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    unit_value = db.Column(db.String(50), nullable=False, unique=True, index=True)  # e.g., 'sqft', 'cbm'
    unit_label = db.Column(db.String(100), nullable=False)  # e.g., 'Square Feet', 'Cubic Meter'
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, index=True)

    # Index for frequently queried active units
    __table_args__ = (
        db.Index('idx_custom_unit_active', 'is_deleted'),
    )