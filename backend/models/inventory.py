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
    min_stock_level = db.Column(db.Float, default=0.0, nullable=True)
    unit_price = db.Column(db.Float, nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
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
            'min_stock_level': self.min_stock_level,
            'unit_price': self.unit_price,
            'description': self.description,
            'is_active': self.is_active,
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