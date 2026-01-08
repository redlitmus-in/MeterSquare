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
    project_id = db.Column(db.Integer, nullable=False, index=True)  # Index for project completion validation
    quantity = db.Column(db.Integer, default=1)  # For quantity mode

    # SE provides condition assessment
    se_condition_assessment = db.Column(db.String(20), default='good')  # good, fair, poor, damaged
    se_notes = db.Column(db.Text, nullable=True)  # SE's notes about the item
    se_damage_description = db.Column(db.Text, nullable=True)  # If damaged, description

    # Request status
    status = db.Column(db.String(30), default='pending', index=True)  # pending, approved, rejected, completed - Index for filtering

    # PM reviews and confirms
    pm_condition_assessment = db.Column(db.String(20), nullable=True)  # PM's actual condition check
    pm_notes = db.Column(db.Text, nullable=True)
    pm_action = db.Column(db.String(30), nullable=True)  # return_to_stock, send_to_maintenance, write_off

    # Tracking
    tracking_code = db.Column(db.String(50), nullable=True)  # Unique code for tracking: RR-2025-001
    requested_by = db.Column(db.String(255), nullable=True)
    requested_by_id = db.Column(db.Integer, nullable=True, index=True)  # Index for SE-specific queries
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


# ============================================================================
# ASSET DELIVERY NOTE (ADN) - Like Material Delivery Note (MDN)
# ============================================================================

class AssetDeliveryNote(db.Model):
    """Asset Delivery Notes - Track asset dispatches to project sites (like MDN for materials)"""
    __tablename__ = "asset_delivery_notes"

    adn_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    adn_number = db.Column(db.String(50), unique=True, nullable=False)  # ADN-2025-0001
    project_id = db.Column(db.Integer, nullable=False, index=True)
    site_location = db.Column(db.String(255), nullable=True)  # Specific site within project
    delivery_date = db.Column(db.DateTime, nullable=False)

    # Personnel
    attention_to = db.Column(db.String(255), nullable=True)  # Site engineer/supervisor name
    attention_to_id = db.Column(db.Integer, nullable=True)  # Site engineer user ID
    delivery_from = db.Column(db.String(255), default='M2 Store')
    prepared_by = db.Column(db.String(255), nullable=False)
    prepared_by_id = db.Column(db.Integer, nullable=True)
    checked_by = db.Column(db.String(255), nullable=True)

    # Transport details
    vehicle_number = db.Column(db.String(100), nullable=True)
    driver_name = db.Column(db.String(255), nullable=True)
    driver_contact = db.Column(db.String(50), nullable=True)

    # Status tracking
    status = db.Column(db.String(20), default='DRAFT')  # DRAFT, ISSUED, IN_TRANSIT, DELIVERED, PARTIAL, CANCELLED
    notes = db.Column(db.Text, nullable=True)

    # Delivery confirmation
    received_by = db.Column(db.String(255), nullable=True)
    received_by_id = db.Column(db.Integer, nullable=True)
    received_at = db.Column(db.DateTime, nullable=True)
    receiver_notes = db.Column(db.Text, nullable=True)

    # Audit fields
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)
    issued_at = db.Column(db.DateTime, nullable=True)
    issued_by = db.Column(db.String(255), nullable=True)
    dispatched_at = db.Column(db.DateTime, nullable=True)
    dispatched_by = db.Column(db.String(255), nullable=True)

    # Relationships
    items = db.relationship('AssetDeliveryNoteItem', backref='delivery_note', lazy=True, cascade='all, delete-orphan')

    def _format_datetime(self, dt):
        """Helper to format datetime consistently with UTC indicator"""
        return (dt.isoformat() + 'Z') if dt else None

    def to_dict(self):
        return {
            'adn_id': self.adn_id,
            'adn_number': self.adn_number,
            'project_id': self.project_id,
            'site_location': self.site_location,
            'delivery_date': self._format_datetime(self.delivery_date),
            'attention_to': self.attention_to,
            'attention_to_id': self.attention_to_id,
            'delivery_from': self.delivery_from,
            'prepared_by': self.prepared_by,
            'prepared_by_id': self.prepared_by_id,
            'checked_by': self.checked_by,
            'vehicle_number': self.vehicle_number,
            'driver_name': self.driver_name,
            'driver_contact': self.driver_contact,
            'status': self.status,
            'notes': self.notes,
            'received_by': self.received_by,
            'received_by_id': self.received_by_id,
            'received_at': self._format_datetime(self.received_at),
            'receiver_notes': self.receiver_notes,
            'created_at': self._format_datetime(self.created_at),
            'created_by': self.created_by,
            'last_modified_at': self._format_datetime(self.last_modified_at),
            'last_modified_by': self.last_modified_by,
            'issued_at': self._format_datetime(self.issued_at),
            'issued_by': self.issued_by,
            'dispatched_at': self._format_datetime(self.dispatched_at),
            'dispatched_by': self.dispatched_by,
            'items': [item.to_dict() for item in self.items] if self.items else [],
            'total_items': len(self.items) if self.items else 0
        }


class AssetDeliveryNoteItem(db.Model):
    """Asset Delivery Note Items - Individual assets in a delivery note"""
    __tablename__ = "asset_delivery_note_items"

    item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    adn_id = db.Column(db.Integer, db.ForeignKey('asset_delivery_notes.adn_id'), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_categories.category_id'), nullable=False)
    asset_item_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_items.item_id'), nullable=True)  # For individual tracking
    quantity = db.Column(db.Integer, default=1)  # For quantity-based tracking
    condition_at_dispatch = db.Column(db.String(20), default='good')  # good, fair, poor
    notes = db.Column(db.Text, nullable=True)

    # Item-level receipt tracking (for selective receive)
    is_received = db.Column(db.Boolean, default=False)
    received_at = db.Column(db.DateTime, nullable=True)
    received_by = db.Column(db.String(255), nullable=True)
    received_by_id = db.Column(db.Integer, nullable=True)

    # Return tracking
    quantity_returned = db.Column(db.Integer, default=0)  # How many have been returned
    status = db.Column(db.String(20), default='dispatched')  # dispatched, partial_return, fully_returned

    # Relationships
    category = db.relationship('ReturnableAssetCategory', backref='adn_items', lazy=True)
    asset_item = db.relationship('ReturnableAssetItem', backref='adn_items', lazy=True)

    def _format_datetime(self, dt):
        """Helper to format datetime consistently with UTC indicator"""
        return (dt.isoformat() + 'Z') if dt else None

    def to_dict(self):
        return {
            'item_id': self.item_id,
            'adn_id': self.adn_id,
            'category_id': self.category_id,
            'asset_item_id': self.asset_item_id,
            'quantity': self.quantity,
            'condition_at_dispatch': self.condition_at_dispatch,
            'notes': self.notes,
            'is_received': self.is_received,
            'received_at': self._format_datetime(self.received_at),
            'received_by': self.received_by,
            'received_by_id': self.received_by_id,
            'quantity_returned': self.quantity_returned,
            'status': self.status,
            # Include category/item details
            'category_code': self.category.category_code if self.category else None,
            'category_name': self.category.category_name if self.category else None,
            'tracking_mode': self.category.tracking_mode if self.category else None,
            'item_code': self.asset_item.item_code if self.asset_item else None,
            'serial_number': self.asset_item.serial_number if self.asset_item else None
        }


# ============================================================================
# ASSET RETURN DELIVERY NOTE (ARDN) - Like Return Delivery Note (RDN)
# ============================================================================

class AssetReturnDeliveryNote(db.Model):
    """Asset Return Delivery Notes - Track asset returns from sites to store (like RDN for materials)"""
    __tablename__ = "asset_return_delivery_notes"

    ardn_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    ardn_number = db.Column(db.String(50), unique=True, nullable=False)  # ARDN-2025-0001
    project_id = db.Column(db.Integer, nullable=False, index=True)
    site_location = db.Column(db.String(255), nullable=True)
    return_date = db.Column(db.DateTime, nullable=False)

    # Link to original delivery note (optional - for traceability)
    original_adn_id = db.Column(db.Integer, db.ForeignKey('asset_delivery_notes.adn_id'), nullable=True)

    # Personnel
    returned_by = db.Column(db.String(255), nullable=False)  # Site engineer name
    returned_by_id = db.Column(db.Integer, nullable=True)  # Site engineer user ID
    return_to = db.Column(db.String(255), default='M2 Store')
    prepared_by = db.Column(db.String(255), nullable=False)
    prepared_by_id = db.Column(db.Integer, nullable=True)
    checked_by = db.Column(db.String(255), nullable=True)

    # Transport details
    vehicle_number = db.Column(db.String(100), nullable=True)
    driver_name = db.Column(db.String(255), nullable=True)
    driver_contact = db.Column(db.String(50), nullable=True)

    # Status tracking
    status = db.Column(db.String(20), default='DRAFT')  # DRAFT, ISSUED, IN_TRANSIT, RECEIVED, PROCESSED, CANCELLED
    return_reason = db.Column(db.Text, nullable=True)  # project_complete, not_needed, damaged, etc.
    notes = db.Column(db.Text, nullable=True)

    # Store acceptance/processing
    accepted_by = db.Column(db.String(255), nullable=True)
    accepted_by_id = db.Column(db.Integer, nullable=True)
    accepted_at = db.Column(db.DateTime, nullable=True)
    acceptance_notes = db.Column(db.Text, nullable=True)

    # Processing (PM verifies and decides fate of each item)
    processed_by = db.Column(db.String(255), nullable=True)
    processed_by_id = db.Column(db.Integer, nullable=True)
    processed_at = db.Column(db.DateTime, nullable=True)

    # Audit fields
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)
    issued_at = db.Column(db.DateTime, nullable=True)
    issued_by = db.Column(db.String(255), nullable=True)
    dispatched_at = db.Column(db.DateTime, nullable=True)  # When sent from site
    dispatched_by = db.Column(db.String(255), nullable=True)

    # Relationships
    items = db.relationship('AssetReturnDeliveryNoteItem', backref='return_note', lazy=True, cascade='all, delete-orphan')
    original_adn = db.relationship('AssetDeliveryNote', backref='return_notes', lazy=True)

    def _format_datetime(self, dt):
        """Helper to format datetime consistently with UTC indicator"""
        return (dt.isoformat() + 'Z') if dt else None

    def to_dict(self):
        return {
            'ardn_id': self.ardn_id,
            'ardn_number': self.ardn_number,
            'project_id': self.project_id,
            'site_location': self.site_location,
            'return_date': self._format_datetime(self.return_date),
            'original_adn_id': self.original_adn_id,
            'returned_by': self.returned_by,
            'returned_by_id': self.returned_by_id,
            'return_to': self.return_to,
            'prepared_by': self.prepared_by,
            'prepared_by_id': self.prepared_by_id,
            'checked_by': self.checked_by,
            'vehicle_number': self.vehicle_number,
            'driver_name': self.driver_name,
            'driver_contact': self.driver_contact,
            'status': self.status,
            'return_reason': self.return_reason,
            'notes': self.notes,
            'accepted_by': self.accepted_by,
            'accepted_by_id': self.accepted_by_id,
            'accepted_at': self._format_datetime(self.accepted_at),
            'acceptance_notes': self.acceptance_notes,
            'processed_by': self.processed_by,
            'processed_by_id': self.processed_by_id,
            'processed_at': self._format_datetime(self.processed_at),
            'created_at': self._format_datetime(self.created_at),
            'created_by': self.created_by,
            'last_modified_at': self._format_datetime(self.last_modified_at),
            'last_modified_by': self.last_modified_by,
            'issued_at': self._format_datetime(self.issued_at),
            'issued_by': self.issued_by,
            'dispatched_at': self._format_datetime(self.dispatched_at),
            'dispatched_by': self.dispatched_by,
            'items': [item.to_dict() for item in self.items] if self.items else [],
            'total_items': len(self.items) if self.items else 0,
            # Include original ADN reference
            'original_adn_number': self.original_adn.adn_number if self.original_adn else None
        }


class AssetReturnDeliveryNoteItem(db.Model):
    """Asset Return Delivery Note Items - Individual assets being returned"""
    __tablename__ = "asset_return_delivery_note_items"

    return_item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    ardn_id = db.Column(db.Integer, db.ForeignKey('asset_return_delivery_notes.ardn_id'), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_categories.category_id'), nullable=False)
    asset_item_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_items.item_id'), nullable=True)  # For individual tracking
    original_adn_item_id = db.Column(db.Integer, db.ForeignKey('asset_delivery_note_items.item_id'), nullable=True)  # Link to original dispatch
    quantity = db.Column(db.Integer, default=1)  # For quantity-based tracking

    # SE reports condition at return
    reported_condition = db.Column(db.String(20), nullable=False)  # ok, damaged, lost, needs_repair
    damage_description = db.Column(db.Text, nullable=True)
    photo_url = db.Column(db.Text, nullable=True)  # Photo evidence for damaged items
    return_notes = db.Column(db.Text, nullable=True)

    # PM verifies and decides action
    verified_condition = db.Column(db.String(20), nullable=True)  # ok, damaged, lost, needs_repair
    pm_notes = db.Column(db.Text, nullable=True)
    action_taken = db.Column(db.String(30), nullable=True)  # return_to_stock, send_to_repair, dispose, write_off

    # Acceptance tracking
    quantity_accepted = db.Column(db.Integer, nullable=True)
    acceptance_status = db.Column(db.String(20), nullable=True)  # PENDING, ACCEPTED, REJECTED, PARTIAL

    # Link to maintenance if sent for repair
    maintenance_id = db.Column(db.Integer, db.ForeignKey('asset_maintenance.maintenance_id'), nullable=True)

    # Relationships
    category = db.relationship('ReturnableAssetCategory', backref='ardn_items', lazy=True)
    asset_item = db.relationship('ReturnableAssetItem', backref='ardn_items', lazy=True)
    original_adn_item = db.relationship('AssetDeliveryNoteItem', backref='return_items', lazy=True)
    maintenance_record = db.relationship('AssetMaintenance', backref='return_items', lazy=True)

    def to_dict(self):
        return {
            'return_item_id': self.return_item_id,
            'ardn_id': self.ardn_id,
            'category_id': self.category_id,
            'asset_item_id': self.asset_item_id,
            'original_adn_item_id': self.original_adn_item_id,
            'quantity': self.quantity,
            'reported_condition': self.reported_condition,
            'damage_description': self.damage_description,
            'photo_url': self.photo_url,
            'return_notes': self.return_notes,
            'verified_condition': self.verified_condition,
            'pm_notes': self.pm_notes,
            'action_taken': self.action_taken,
            'quantity_accepted': self.quantity_accepted,
            'acceptance_status': self.acceptance_status,
            'maintenance_id': self.maintenance_id,
            # Include category/item details
            'category_code': self.category.category_code if self.category else None,
            'category_name': self.category.category_name if self.category else None,
            'tracking_mode': self.category.tracking_mode if self.category else None,
            'item_code': self.asset_item.item_code if self.asset_item else None,
            'serial_number': self.asset_item.serial_number if self.asset_item else None
        }


# ============================================================================
# ASSET STOCK IN - Track when new assets are added to inventory
# ============================================================================

class AssetStockIn(db.Model):
    """Asset Stock In - Track when new assets are added to inventory"""
    __tablename__ = "asset_stock_in"

    stock_in_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    stock_in_number = db.Column(db.String(50), unique=True, nullable=False)  # ASI-2025-0001
    category_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_categories.category_id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)

    # Purchase details
    purchase_date = db.Column(db.Date, nullable=True)
    vendor_name = db.Column(db.String(255), nullable=True)
    vendor_id = db.Column(db.Integer, nullable=True)
    invoice_number = db.Column(db.String(100), nullable=True)
    unit_cost = db.Column(db.Float, default=0.0)
    total_cost = db.Column(db.Float, default=0.0)

    # Condition
    condition = db.Column(db.String(20), default='new')  # new, good, fair, refurbished
    notes = db.Column(db.Text, nullable=True)

    # Document attachment (DN/invoice/receipt)
    document_url = db.Column(db.Text, nullable=True)  # URL to uploaded document

    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    created_by_id = db.Column(db.Integer, nullable=True)

    # Relationships
    category = db.relationship('ReturnableAssetCategory', backref='stock_ins', lazy=True)
    items = db.relationship('AssetStockInItem', backref='stock_in', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'stock_in_id': self.stock_in_id,
            'stock_in_number': self.stock_in_number,
            'category_id': self.category_id,
            'quantity': self.quantity,
            'purchase_date': self.purchase_date.isoformat() if self.purchase_date else None,
            'vendor_name': self.vendor_name,
            'vendor_id': self.vendor_id,
            'invoice_number': self.invoice_number,
            'unit_cost': self.unit_cost,
            'total_cost': self.total_cost,
            'condition': self.condition,
            'notes': self.notes,
            'document_url': self.document_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'created_by_id': self.created_by_id,
            # Category details
            'category_code': self.category.category_code if self.category else None,
            'category_name': self.category.category_name if self.category else None,
            'tracking_mode': self.category.tracking_mode if self.category else None,
            'items': [item.to_dict() for item in self.items] if self.items else []
        }


class AssetStockInItem(db.Model):
    """Asset Stock In Items - For individual tracking mode, each serial number"""
    __tablename__ = "asset_stock_in_items"

    stock_in_item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    stock_in_id = db.Column(db.Integer, db.ForeignKey('asset_stock_in.stock_in_id'), nullable=False)
    asset_item_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_items.item_id'), nullable=True)  # Link to created item
    serial_number = db.Column(db.String(100), nullable=True)
    condition = db.Column(db.String(20), default='new')
    notes = db.Column(db.Text, nullable=True)

    # Relationships
    asset_item = db.relationship('ReturnableAssetItem', backref='stock_in_items', lazy=True)

    def to_dict(self):
        return {
            'stock_in_item_id': self.stock_in_item_id,
            'stock_in_id': self.stock_in_id,
            'asset_item_id': self.asset_item_id,
            'serial_number': self.serial_number,
            'condition': self.condition,
            'notes': self.notes,
            'item_code': self.asset_item.item_code if self.asset_item else None
        }


# ============================================================================
# ASSET DISPOSAL - Track disposal requests requiring TD approval
# ============================================================================

class AssetDisposal(db.Model):
    """Asset Disposal Requests - Track disposal requests requiring TD approval"""
    __tablename__ = "asset_disposal"

    disposal_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # Source reference
    return_item_id = db.Column(db.Integer, db.ForeignKey('asset_return_delivery_note_items.return_item_id'), nullable=True)
    category_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_categories.category_id'), nullable=True)
    asset_item_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_items.item_id'), nullable=True)

    # Disposal details
    quantity = db.Column(db.Integer, default=1)
    disposal_reason = db.Column(db.String(100), nullable=False)  # damaged, unrepairable, obsolete, lost, expired, other
    justification = db.Column(db.Text, nullable=True)
    estimated_value = db.Column(db.Float, default=0.0)

    # Image documentation
    image_url = db.Column(db.Text, nullable=True)
    image_filename = db.Column(db.String(255), nullable=True)

    # Request info
    requested_by = db.Column(db.String(255), nullable=False)
    requested_by_id = db.Column(db.Integer, nullable=True)
    requested_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Approval workflow
    status = db.Column(db.String(30), default='pending_review')  # pending_review, approved, rejected
    reviewed_by = db.Column(db.String(255), nullable=True)
    reviewed_by_id = db.Column(db.Integer, nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    review_notes = db.Column(db.Text, nullable=True)

    # Source tracking
    source_type = db.Column(db.String(30), default='repair')  # repair, catalog, return
    source_ardn_id = db.Column(db.Integer, db.ForeignKey('asset_return_delivery_notes.ardn_id'), nullable=True)
    project_id = db.Column(db.Integer, nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    return_item = db.relationship('AssetReturnDeliveryNoteItem', backref='disposal_requests', lazy=True)
    category = db.relationship('ReturnableAssetCategory', backref='disposal_requests', lazy=True)
    asset_item = db.relationship('ReturnableAssetItem', backref='disposal_requests', lazy=True)
    source_ardn = db.relationship('AssetReturnDeliveryNote', backref='disposal_requests', lazy=True)

    def to_dict(self):
        return {
            'disposal_id': self.disposal_id,
            'return_item_id': self.return_item_id,
            'category_id': self.category_id,
            'asset_item_id': self.asset_item_id,
            'quantity': self.quantity,
            'disposal_reason': self.disposal_reason,
            'justification': self.justification,
            'estimated_value': self.estimated_value,
            'image_url': self.image_url,
            'image_filename': self.image_filename,
            'requested_by': self.requested_by,
            'requested_by_id': self.requested_by_id,
            'requested_at': self.requested_at.isoformat() if self.requested_at else None,
            'status': self.status,
            'reviewed_by': self.reviewed_by,
            'reviewed_by_id': self.reviewed_by_id,
            'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None,
            'review_notes': self.review_notes,
            'source_type': self.source_type,
            'source_ardn_id': self.source_ardn_id,
            'project_id': self.project_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            # Include related data
            'category_code': self.category.category_code if self.category else None,
            'category_name': self.category.category_name if self.category else None,
            'item_code': self.asset_item.item_code if self.asset_item else None,
            'serial_number': self.asset_item.serial_number if self.asset_item else None,
            'ardn_number': self.source_ardn.ardn_number if self.source_ardn else None
        }
