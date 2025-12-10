from datetime import datetime
from config.db import db


class ReturnableAssetCategory(db.Model):
    """Returnable Asset Categories - Track asset types like Ladder, Table, Scaffold"""
    __tablename__ = "returnable_asset_categories"

    category_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    category_code = db.Column(db.String(50), unique=True, nullable=False)  # LAD, TBL, SCF
    category_name = db.Column(db.String(255), nullable=False)  # Ladder, Table, Scaffold
    description = db.Column(db.Text, nullable=True)
    tracking_mode = db.Column(db.String(20), default='quantity')  # 'individual' or 'quantity'
    total_quantity = db.Column(db.Integer, default=0)  # Total owned (for quantity mode)
    available_quantity = db.Column(db.Integer, default=0)  # Currently in store (for quantity mode)
    unit_price = db.Column(db.Float, default=0.0)  # Purchase price per unit
    image_url = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=True)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)

    # Relationships
    items = db.relationship('ReturnableAssetItem', backref='category', lazy=True)
    movements = db.relationship('AssetMovement', backref='category', lazy=True)
    maintenance_records = db.relationship('AssetMaintenance', backref='category', lazy=True)

    def to_dict(self):
        return {
            'category_id': self.category_id,
            'category_code': self.category_code,
            'category_name': self.category_name,
            'description': self.description,
            'tracking_mode': self.tracking_mode,
            'total_quantity': self.total_quantity,
            'available_quantity': self.available_quantity,
            'dispatched_quantity': (self.total_quantity or 0) - (self.available_quantity or 0),
            'unit_price': self.unit_price,
            'image_url': self.image_url,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None,
            'last_modified_by': self.last_modified_by,
            'items_count': len(self.items) if self.items else 0
        }


class ReturnableAssetItem(db.Model):
    """Individual Asset Items - For 'individual' tracking mode"""
    __tablename__ = "returnable_asset_items"

    item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    category_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_categories.category_id'), nullable=False)
    item_code = db.Column(db.String(50), unique=True, nullable=False)  # LAD-001, LAD-002
    serial_number = db.Column(db.String(100), nullable=True)  # Manufacturer serial
    purchase_date = db.Column(db.Date, nullable=True)
    purchase_price = db.Column(db.Float, nullable=True)
    current_condition = db.Column(db.String(20), default='good')  # good, fair, poor, damaged
    current_status = db.Column(db.String(20), default='available')  # available, dispatched, maintenance, retired
    current_project_id = db.Column(db.Integer, nullable=True)  # Which project has it (null = in store)
    notes = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=True)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)

    # Relationships
    movements = db.relationship('AssetMovement', backref='item', lazy=True)
    maintenance_records = db.relationship('AssetMaintenance', backref='item', lazy=True)

    def to_dict(self):
        return {
            'item_id': self.item_id,
            'category_id': self.category_id,
            'item_code': self.item_code,
            'serial_number': self.serial_number,
            'purchase_date': self.purchase_date.isoformat() if self.purchase_date else None,
            'purchase_price': self.purchase_price,
            'current_condition': self.current_condition,
            'current_status': self.current_status,
            'current_project_id': self.current_project_id,
            'notes': self.notes,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None,
            'last_modified_by': self.last_modified_by,
            # Include category details
            'category_code': self.category.category_code if self.category else None,
            'category_name': self.category.category_name if self.category else None
        }


class AssetMovement(db.Model):
    """Asset Movements - Track dispatch and return of assets"""
    __tablename__ = "asset_movements"

    movement_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    category_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_categories.category_id'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_items.item_id'), nullable=True)  # NULL for quantity mode
    movement_type = db.Column(db.String(20), nullable=False)  # DISPATCH, RETURN
    project_id = db.Column(db.Integer, nullable=False)
    quantity = db.Column(db.Integer, default=1)  # For quantity mode
    condition_before = db.Column(db.String(20), nullable=True)  # Condition when dispatched
    condition_after = db.Column(db.String(20), nullable=True)  # Condition when returned
    dispatched_by = db.Column(db.String(255), nullable=True)
    dispatched_at = db.Column(db.DateTime, nullable=True)
    received_by = db.Column(db.String(255), nullable=True)
    received_by_id = db.Column(db.Integer, nullable=True)
    received_at = db.Column(db.DateTime, nullable=True)
    returned_by = db.Column(db.String(255), nullable=True)
    returned_at = db.Column(db.DateTime, nullable=True)
    reference_number = db.Column(db.String(100), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=True)

    def to_dict(self):
        return {
            'movement_id': self.movement_id,
            'category_id': self.category_id,
            'item_id': self.item_id,
            'movement_type': self.movement_type,
            'project_id': self.project_id,
            'quantity': self.quantity,
            'condition_before': self.condition_before,
            'condition_after': self.condition_after,
            'dispatched_by': self.dispatched_by,
            'dispatched_at': self.dispatched_at.isoformat() if self.dispatched_at else None,
            'received_by': self.received_by,
            'received_by_id': self.received_by_id,
            'received_at': self.received_at.isoformat() if self.received_at else None,
            'returned_by': self.returned_by,
            'returned_at': self.returned_at.isoformat() if self.returned_at else None,
            'reference_number': self.reference_number,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            # Include category/item details
            'category_code': self.category.category_code if self.category else None,
            'category_name': self.category.category_name if self.category else None,
            'item_code': self.item.item_code if self.item else None
        }


class AssetReturnRequest(db.Model):
    """Asset Return Requests - SE requests return, PM processes"""
    __tablename__ = "asset_return_requests"

    request_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    category_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_categories.category_id'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_items.item_id'), nullable=True)  # NULL for quantity mode
    project_id = db.Column(db.Integer, nullable=False)
    quantity = db.Column(db.Integer, default=1)  # For quantity mode

    # SE provides condition assessment
    se_condition_assessment = db.Column(db.String(20), default='good')  # good, fair, poor, damaged
    se_notes = db.Column(db.Text, nullable=True)  # SE's notes about the item
    se_damage_description = db.Column(db.Text, nullable=True)  # If damaged, description

    # Request status
    status = db.Column(db.String(30), default='pending')  # pending, approved, rejected, completed

    # PM reviews and confirms
    pm_condition_assessment = db.Column(db.String(20), nullable=True)  # PM's actual condition check
    pm_notes = db.Column(db.Text, nullable=True)
    pm_action = db.Column(db.String(30), nullable=True)  # return_to_stock, send_to_maintenance, write_off

    # Tracking
    tracking_code = db.Column(db.String(50), nullable=True)  # Unique code for tracking: RR-2025-001
    requested_by = db.Column(db.String(255), nullable=True)
    requested_by_id = db.Column(db.Integer, nullable=True)
    requested_at = db.Column(db.DateTime, default=datetime.utcnow)
    processed_by = db.Column(db.String(255), nullable=True)
    processed_by_id = db.Column(db.Integer, nullable=True)
    processed_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=True)

    # Relationships
    category = db.relationship('ReturnableAssetCategory', backref='return_requests')
    item = db.relationship('ReturnableAssetItem', backref='return_requests')

    def to_dict(self):
        return {
            'request_id': self.request_id,
            'category_id': self.category_id,
            'item_id': self.item_id,
            'project_id': self.project_id,
            'quantity': self.quantity,
            'se_condition_assessment': self.se_condition_assessment,
            'se_notes': self.se_notes,
            'se_damage_description': self.se_damage_description,
            'status': self.status,
            'pm_condition_assessment': self.pm_condition_assessment,
            'pm_notes': self.pm_notes,
            'pm_action': self.pm_action,
            'tracking_code': self.tracking_code,
            'requested_by': self.requested_by,
            'requested_by_id': self.requested_by_id,
            'requested_at': self.requested_at.isoformat() if self.requested_at else None,
            'processed_by': self.processed_by,
            'processed_by_id': self.processed_by_id,
            'processed_at': self.processed_at.isoformat() if self.processed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            # Include category/item details
            'category_code': self.category.category_code if self.category else None,
            'category_name': self.category.category_name if self.category else None,
            'item_code': self.item.item_code if self.item else None
        }


class AssetMaintenance(db.Model):
    """Asset Maintenance - Track repairs and write-offs"""
    __tablename__ = "asset_maintenance"

    maintenance_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    category_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_categories.category_id'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_items.item_id'), nullable=True)  # NULL for quantity mode
    quantity = db.Column(db.Integer, default=1)  # For quantity mode
    issue_description = db.Column(db.Text, nullable=False)
    reported_by = db.Column(db.String(255), nullable=True)
    reported_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default='pending')  # pending, in_progress, completed, written_off
    repair_notes = db.Column(db.Text, nullable=True)
    repair_cost = db.Column(db.Float, default=0.0)
    repaired_by = db.Column(db.String(255), nullable=True)
    repaired_at = db.Column(db.DateTime, nullable=True)
    returned_to_stock = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=True)

    def to_dict(self):
        return {
            'maintenance_id': self.maintenance_id,
            'category_id': self.category_id,
            'item_id': self.item_id,
            'quantity': self.quantity,
            'issue_description': self.issue_description,
            'reported_by': self.reported_by,
            'reported_at': self.reported_at.isoformat() if self.reported_at else None,
            'status': self.status,
            'repair_notes': self.repair_notes,
            'repair_cost': self.repair_cost,
            'repaired_by': self.repaired_by,
            'repaired_at': self.repaired_at.isoformat() if self.repaired_at else None,
            'returned_to_stock': self.returned_to_stock,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            # Include category/item details
            'category_code': self.category.category_code if self.category else None,
            'category_name': self.category.category_name if self.category else None,
            'item_code': self.item.item_code if self.item else None
        }
