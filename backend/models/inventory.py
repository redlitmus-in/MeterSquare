from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB

class InventoryMaterial(db.Model):
    """MSQ Inventory Materials - Material storage and maintenance"""
    __tablename__ = "inventory_materials"

    inventory_material_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    material_code = db.Column(db.String(50), unique=True, nullable=False)
    material_name = db.Column(db.Text, nullable=False)
    brand = db.Column(db.Text, nullable=True)
    size = db.Column(db.Text, nullable=True)
    category = db.Column(db.Text, nullable=True)
    unit = db.Column(db.Text, nullable=False)
    current_stock = db.Column(db.Float, default=0.0, nullable=False)
    backup_stock = db.Column(db.Float, default=0.0, nullable=False)  # Partially usable/damaged stock
    backup_condition_notes = db.Column(db.Text, nullable=True)  # Description of backup stock condition
    min_stock_level = db.Column(db.Float, default=0.0, nullable=True)
    unit_price = db.Column(db.Float, nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    is_returnable = db.Column(db.Boolean, default=False)  # Whether material can be returned/reused
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_modified_by = db.Column(db.String(255), nullable=False)

    transactions = db.relationship('InventoryTransaction', backref='material', lazy=True)

    def to_dict(self):
        return {
            'inventory_material_id': self.inventory_material_id,
            'material_code': self.material_code,
            'material_name': self.material_name,
            'brand': self.brand,
            'size': self.size,
            'category': self.category,
            'unit': self.unit,
            'current_stock': self.current_stock,
            'backup_stock': self.backup_stock,
            'backup_condition_notes': self.backup_condition_notes,
            'min_stock_level': self.min_stock_level,
            'unit_price': self.unit_price,
            'description': self.description,
            'is_active': self.is_active,
            'is_returnable': self.is_returnable,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None,
            'last_modified_by': self.last_modified_by
        }


class InventoryTransaction(db.Model):
    """Inventory Transactions - Purchase and Withdrawal records for materials"""
    __tablename__ = "inventory_transactions"

    inventory_transaction_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    inventory_material_id = db.Column(db.Integer, db.ForeignKey('inventory_materials.inventory_material_id'), nullable=False)
    transaction_type = db.Column(db.Text, nullable=False)  # PURCHASE or WITHDRAWAL
    quantity = db.Column(db.Float, nullable=False)
    unit_price = db.Column(db.Float, nullable=False)
    total_amount = db.Column(db.Float, nullable=False)
    reference_number = db.Column(db.Text, nullable=True)
    project_id = db.Column(db.Integer, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)

    def to_dict(self):
        return {
            'inventory_transaction_id': self.inventory_transaction_id,
            'inventory_material_id': self.inventory_material_id,
            'transaction_type': self.transaction_type,
            'quantity': self.quantity,
            'unit_price': self.unit_price,
            'total_amount': self.total_amount,
            'reference_number': self.reference_number,
            'project_id': self.project_id,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by
        }


class InternalMaterialRequest(db.Model):
    """Internal Material Purchase Requests from projects"""
    __tablename__ = "internal_inventory_material_requests"

    request_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    request_number = db.Column(db.Integer, nullable=True)  # Sequential request number (1, 2, 3...)
    project_id = db.Column(db.Integer, nullable=False)
    cr_id = db.Column(db.Integer, nullable=True)  # Change Request ID
    request_buyer_id = db.Column(db.Integer, nullable=False)
    material_name = db.Column(db.Text, nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    brand = db.Column(db.Text, nullable=True)
    size = db.Column(db.Text, nullable=True)
    status = db.Column(db.Text, default='PENDING', nullable=False)  # PENDING, APPROVED, REJECTED, DISPATCHED, FULFILLED, PROCUREMENT_INITIATED
    inventory_material_id = db.Column(db.Integer, db.ForeignKey('inventory_materials.inventory_material_id'), nullable=True)  # If found in inventory
    inventory_transaction_id = db.Column(db.Integer, nullable=True)  # Link to withdrawal transaction if fulfilled from inventory
    approved_by = db.Column(db.String(255), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    expected_delivery_date = db.Column(db.DateTime, nullable=True)  # Expected delivery date when approved
    dispatch_date = db.Column(db.DateTime, nullable=True)  # Dispatch date when material is dispatched
    actual_delivery_date = db.Column(db.DateTime, nullable=True)  # Actual delivery date when fulfilled
    rejected_by = db.Column(db.String(255), nullable=True)
    rejected_at = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    request_send = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_modified_by = db.Column(db.String(255), nullable=False)

    # Relationships
    inventory_material = db.relationship('InventoryMaterial', backref='internal_requests', lazy=True)

    def to_dict(self):
        return {
            'request_id': self.request_id,
            'request_number': self.request_number,
            'project_id': self.project_id,
            'cr_id': self.cr_id,
            'request_buyer_id': self.request_buyer_id,
            'material_name': self.material_name,
            'quantity': self.quantity,
            'brand': self.brand,
            'size': self.size,
            'status': self.status,
            'inventory_material_id': self.inventory_material_id,
            'inventory_transaction_id': self.inventory_transaction_id,
            'approved_by': self.approved_by,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'expected_delivery_date': self.expected_delivery_date.isoformat() if self.expected_delivery_date else None,
            'dispatch_date': self.dispatch_date.isoformat() if self.dispatch_date else None,
            'actual_delivery_date': self.actual_delivery_date.isoformat() if self.actual_delivery_date else None,
            'rejected_by': self.rejected_by,
            'rejected_at': self.rejected_at.isoformat() if self.rejected_at else None,
            'rejection_reason': self.rejection_reason,
            'notes': self.notes,
            'request_send': self.request_send,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None,
            'last_modified_by': self.last_modified_by
        }


class MaterialReturn(db.Model):
    """Material Returns - Track returned materials with condition and disposal workflow"""
    __tablename__ = "material_returns"

    return_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    inventory_material_id = db.Column(db.Integer, db.ForeignKey('inventory_materials.inventory_material_id'), nullable=False)
    project_id = db.Column(db.Integer, nullable=False)  # Required - project material is returned from
    delivery_note_item_id = db.Column(db.Integer, db.ForeignKey('delivery_note_items.item_id'), nullable=True)  # Link to specific delivery
    quantity = db.Column(db.Float, nullable=False)
    condition = db.Column(db.String(20), nullable=False)  # Good, Damaged, Defective
    add_to_stock = db.Column(db.Boolean, default=False)  # Only applicable for 'Good' condition
    return_reason = db.Column(db.Text, nullable=True)
    reference_number = db.Column(db.String(100), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    # Disposal workflow fields (for Damaged/Defective items)
    disposal_status = db.Column(db.String(30), nullable=True)  # pending_approval, approved, pending_review, approved_disposal, disposed, repaired, rejected
    disposal_reviewed_by = db.Column(db.String(255), nullable=True)
    disposal_reviewed_at = db.Column(db.DateTime, nullable=True)
    disposal_notes = db.Column(db.Text, nullable=True)
    disposal_value = db.Column(db.Float, default=0.0)  # Write-off value

    # Audit fields
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)

    # Link to transaction if stock was updated
    inventory_transaction_id = db.Column(db.Integer, nullable=True)

    # Relationships
    inventory_material = db.relationship('InventoryMaterial', backref='returns', lazy=True)
    delivery_note_item = db.relationship('DeliveryNoteItem', backref='returns', lazy=True)

    def to_dict(self):
        return {
            'return_id': self.return_id,
            'inventory_material_id': self.inventory_material_id,
            'project_id': self.project_id,
            'delivery_note_item_id': self.delivery_note_item_id,
            'quantity': self.quantity,
            'condition': self.condition,
            'add_to_stock': self.add_to_stock,
            'return_reason': self.return_reason,
            'reference_number': self.reference_number,
            'notes': self.notes,
            'disposal_status': self.disposal_status,
            'disposal_reviewed_by': self.disposal_reviewed_by,
            'disposal_reviewed_at': self.disposal_reviewed_at.isoformat() if self.disposal_reviewed_at else None,
            'disposal_notes': self.disposal_notes,
            'disposal_value': self.disposal_value,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'inventory_transaction_id': self.inventory_transaction_id,
            # Include material details for convenience
            'material_name': self.inventory_material.material_name if self.inventory_material else None,
            'material_code': self.inventory_material.material_code if self.inventory_material else None,
            'unit': self.inventory_material.unit if self.inventory_material else None
        }


class MaterialDeliveryNote(db.Model):
    """Material Delivery Notes - Track material dispatches to project sites"""
    __tablename__ = "material_delivery_notes"

    delivery_note_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    delivery_note_number = db.Column(db.String(50), unique=True, nullable=False)  # MDN-2025-001
    project_id = db.Column(db.Integer, nullable=False)
    delivery_date = db.Column(db.DateTime, nullable=False)
    attention_to = db.Column(db.String(255), nullable=True)  # Site engineer/supervisor name
    delivery_from = db.Column(db.String(255), default='M2 Store')  # Store location
    requested_by = db.Column(db.String(255), nullable=True)
    request_date = db.Column(db.DateTime, nullable=True)
    vehicle_number = db.Column(db.String(100), nullable=True)
    driver_name = db.Column(db.String(255), nullable=True)
    driver_contact = db.Column(db.String(50), nullable=True)
    prepared_by = db.Column(db.String(255), nullable=False)
    checked_by = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), default='DRAFT')  # DRAFT, ISSUED, IN_TRANSIT, DELIVERED, PARTIAL, CANCELLED
    notes = db.Column(db.Text, nullable=True)

    # Delivery confirmation fields
    received_by = db.Column(db.String(255), nullable=True)
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
    items = db.relationship('DeliveryNoteItem', backref='delivery_note', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'delivery_note_id': self.delivery_note_id,
            'delivery_note_number': self.delivery_note_number,
            'project_id': self.project_id,
            'delivery_date': self.delivery_date.isoformat() if self.delivery_date else None,
            'attention_to': self.attention_to,
            'delivery_from': self.delivery_from,
            'requested_by': self.requested_by,
            'request_date': self.request_date.isoformat() if self.request_date else None,
            'vehicle_number': self.vehicle_number,
            'driver_name': self.driver_name,
            'driver_contact': self.driver_contact,
            'prepared_by': self.prepared_by,
            'checked_by': self.checked_by,
            'status': self.status,
            'notes': self.notes,
            'received_by': self.received_by,
            'received_at': self.received_at.isoformat() if self.received_at else None,
            'receiver_notes': self.receiver_notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None,
            'last_modified_by': self.last_modified_by,
            'issued_at': self.issued_at.isoformat() if self.issued_at else None,
            'issued_by': self.issued_by,
            'dispatched_at': (self.dispatched_at.isoformat() + 'Z') if self.dispatched_at else None,
            'dispatched_by': self.dispatched_by,
            'items': [item.to_dict() for item in self.items] if self.items else [],
            'total_items': len(self.items) if self.items else 0
        }


class DeliveryNoteItem(db.Model):
    """Delivery Note Items - Individual materials in a delivery note"""
    __tablename__ = "delivery_note_items"

    item_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    delivery_note_id = db.Column(db.Integer, db.ForeignKey('material_delivery_notes.delivery_note_id'), nullable=False)
    inventory_material_id = db.Column(db.Integer, db.ForeignKey('inventory_materials.inventory_material_id'), nullable=False)
    internal_request_id = db.Column(db.Integer, db.ForeignKey('internal_inventory_material_requests.request_id'), nullable=True)
    quantity = db.Column(db.Float, nullable=False)
    unit_price = db.Column(db.Float, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    use_backup = db.Column(db.Boolean, default=False)  # Whether to use backup stock

    # Received quantity tracking (for partial deliveries)
    quantity_received = db.Column(db.Float, nullable=True)

    # Link to transaction when stock is deducted
    inventory_transaction_id = db.Column(db.Integer, nullable=True)

    # Relationships
    inventory_material = db.relationship('InventoryMaterial', backref='delivery_note_items', lazy=True)
    internal_request = db.relationship('InternalMaterialRequest', backref='delivery_note_items', lazy=True)

    def to_dict(self):
        return {
            'item_id': self.item_id,
            'delivery_note_id': self.delivery_note_id,
            'inventory_material_id': self.inventory_material_id,
            'internal_request_id': self.internal_request_id,
            'quantity': self.quantity,
            'unit_price': self.unit_price,
            'notes': self.notes,
            'use_backup': self.use_backup,
            'quantity_received': self.quantity_received,
            'inventory_transaction_id': self.inventory_transaction_id,
            # Include material details
            'material_code': self.inventory_material.material_code if self.inventory_material else None,
            'material_name': self.inventory_material.material_name if self.inventory_material else None,
            'brand': self.inventory_material.brand if self.inventory_material else None,
            'unit': self.inventory_material.unit if self.inventory_material else None
        }