from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class VendorDeliveryInspection(db.Model):
    """
    Vendor Delivery Inspection - PM inspects materials when vendor delivers to M2 Store.
    Decisions: fully_approved, partially_approved, fully_rejected
    """
    __tablename__ = "vendor_delivery_inspections"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    cr_id = db.Column(db.Integer, db.ForeignKey("change_requests.cr_id"), nullable=False, index=True)
    po_child_id = db.Column(db.Integer, db.ForeignKey("po_child.id"), nullable=True, index=True)
    imr_id = db.Column(db.Integer, db.ForeignKey("internal_inventory_material_requests.request_id"), nullable=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.vendor_id"), nullable=True, index=True)

    # Inspection Decision
    inspection_status = db.Column(db.String(30), nullable=False, default='pending', index=True)
    # Values: 'pending', 'fully_approved', 'partially_approved', 'fully_rejected'

    inspected_by_user_id = db.Column(db.Integer, nullable=False)
    inspected_by_name = db.Column(db.String(255), nullable=False)
    inspected_at = db.Column(db.DateTime, nullable=True)

    # Per-material inspection results (JSONB array)
    # Each entry: {material_name, brand, size, unit, ordered_qty, accepted_qty, rejected_qty,
    #              rejection_category, rejection_notes, photo_urls: []}
    materials_inspection = db.Column(JSONB, nullable=False, default=list)

    # Overall notes and rejection category
    overall_notes = db.Column(db.Text, nullable=True)
    overall_rejection_category = db.Column(db.String(50), nullable=True)
    # Values: 'quality_defect', 'wrong_specification', 'quantity_shortage',
    #         'damaged_in_transit', 'expired', 'other'

    # Evidence (photos/videos uploaded to Supabase Storage)
    # [{url, file_name, file_type, uploaded_at}]
    evidence_urls = db.Column(JSONB, default=list)

    # Iteration tracking (for replacement/re-purchase cycles)
    iteration_number = db.Column(db.Integer, default=0)  # 0=first delivery, 1=first replacement
    parent_inspection_id = db.Column(db.Integer, db.ForeignKey("vendor_delivery_inspections.id"), nullable=True)

    # Stock-in tracking (two-phase: inspection → manual stock-in)
    stock_in_completed = db.Column(db.Boolean, default=False)
    stock_in_completed_at = db.Column(db.DateTime, nullable=True)
    stock_in_completed_by = db.Column(db.Integer, nullable=True)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = db.Column(db.Integer, nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, index=True)

    __table_args__ = (
        db.Index('idx_vdi_deleted_status', 'is_deleted', 'inspection_status'),
    )

    # Relationships
    change_request = db.relationship("ChangeRequest", backref=db.backref("inspections", lazy=True))
    po_child = db.relationship("POChild", backref=db.backref("inspections", lazy=True))
    imr = db.relationship("InternalMaterialRequest", backref=db.backref("inspections", lazy=True))
    vendor = db.relationship("Vendor", backref=db.backref("delivery_inspections", lazy=True))
    parent_inspection = db.relationship("VendorDeliveryInspection", remote_side=[id], backref=db.backref("child_inspections", lazy=True))
    return_requests = db.relationship("VendorReturnRequest", backref=db.backref("inspection", lazy=True), foreign_keys="VendorReturnRequest.inspection_id")

    def to_dict(self):
        result = {
            'id': self.id,
            'cr_id': self.cr_id,
            'po_child_id': self.po_child_id,
            'imr_id': self.imr_id,
            'vendor_id': self.vendor_id,
            'inspection_status': self.inspection_status,
            'inspected_by_user_id': self.inspected_by_user_id,
            'inspected_by_name': self.inspected_by_name,
            'inspected_at': self.inspected_at.isoformat() if self.inspected_at else None,
            'materials_inspection': self.materials_inspection or [],
            'overall_notes': self.overall_notes,
            'overall_rejection_category': self.overall_rejection_category,
            'evidence_urls': self.evidence_urls or [],
            'iteration_number': self.iteration_number,
            'parent_inspection_id': self.parent_inspection_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'stock_in_completed': self.stock_in_completed or False,
            'stock_in_completed_at': self.stock_in_completed_at.isoformat() if self.stock_in_completed_at else None,
            'stock_in_completed_by': self.stock_in_completed_by,
            'created_by': self.created_by,
            'is_deleted': self.is_deleted,
        }

        # Include vendor details if loaded
        if self.vendor:
            result['vendor_name'] = self.vendor.company_name
            result['vendor_email'] = self.vendor.email
        else:
            result['vendor_name'] = None
            result['vendor_email'] = None

        # Include CR formatted ID if available
        if self.change_request:
            result['formatted_cr_id'] = self.change_request.get_formatted_cr_id()
            result['project_id'] = self.change_request.project_id
        else:
            result['formatted_cr_id'] = None
            result['project_id'] = None

        # Include POChild formatted ID if available
        if self.po_child:
            result['formatted_po_id'] = self.po_child.get_formatted_id()
        else:
            result['formatted_po_id'] = None

        return result

    def __repr__(self):
        return f"<VendorDeliveryInspection {self.id} CR:{self.cr_id} Status:{self.inspection_status}>"


class VendorReturnRequest(db.Model):
    """
    Vendor Return Request - Created by buyer when PM rejects materials.
    Resolution types: refund, replacement, new_vendor
    Requires TD approval before proceeding.
    """
    __tablename__ = "vendor_return_requests"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    inspection_id = db.Column(db.Integer, db.ForeignKey("vendor_delivery_inspections.id"), nullable=False, index=True)
    cr_id = db.Column(db.Integer, db.ForeignKey("change_requests.cr_id"), nullable=False, index=True)
    po_child_id = db.Column(db.Integer, db.ForeignKey("po_child.id"), nullable=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.vendor_id"), nullable=False, index=True)
    vendor_name = db.Column(db.String(255), nullable=True)

    # Return request details
    return_request_number = db.Column(db.String(50), unique=True, nullable=False)
    # Format: VRR-2026-001
    resolution_type = db.Column(db.String(30), nullable=False)
    # Values: 'refund', 'replacement', 'new_vendor'
    status = db.Column(db.String(30), nullable=False, default='pending_td_approval', index=True)
    # Values: 'pending_td_approval', 'td_approved', 'td_rejected',
    #         'return_in_progress', 'returned_to_vendor',
    #         'refund_pending', 'refund_received',
    #         'replacement_pending', 'replacement_delivered',
    #         'new_vendor_pending', 'new_vendor_approved',
    #         'completed', 'cancelled'

    # Rejected materials data
    rejected_materials = db.Column(JSONB, nullable=False, default=list)
    # [{material_name, brand, size, unit, rejected_qty, unit_price, total_value, rejection_category, rejection_notes}]
    total_rejected_value = db.Column(db.Float, default=0.0)

    # SLA / Deadline (optional)
    sla_deadline = db.Column(db.DateTime, nullable=True)
    sla_notes = db.Column(db.Text, nullable=True)

    # Buyer info
    created_by_buyer_id = db.Column(db.Integer, nullable=False)
    created_by_buyer_name = db.Column(db.String(255), nullable=True)
    buyer_notes = db.Column(db.Text, nullable=True)

    # TD Approval
    td_approved_by_id = db.Column(db.Integer, nullable=True)
    td_approved_by_name = db.Column(db.String(255), nullable=True)
    td_approval_date = db.Column(db.DateTime, nullable=True)
    td_rejection_reason = db.Column(db.Text, nullable=True)

    # Return tracking
    return_initiated_at = db.Column(db.DateTime, nullable=True)
    return_confirmed_at = db.Column(db.DateTime, nullable=True)
    vendor_return_reference = db.Column(db.String(100), nullable=True)

    # Financial tracking
    credit_note_number = db.Column(db.String(100), nullable=True)
    credit_note_amount = db.Column(db.Float, default=0.0)
    credit_note_date = db.Column(db.DateTime, nullable=True)
    lpo_adjustment_amount = db.Column(db.Float, default=0.0)
    refund_evidence = db.Column(db.JSON, nullable=True)  # [{url, file_name, file_type}]

    # New vendor fields (only for resolution_type='new_vendor')
    new_vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.vendor_id"), nullable=True)
    new_vendor_name = db.Column(db.String(255), nullable=True)
    new_vendor_status = db.Column(db.String(30), nullable=True)
    # Values: 'pending_td_approval', 'approved', 'rejected'
    new_lpo_id = db.Column(db.Integer, nullable=True)

    # Replacement tracking (only for resolution_type='replacement')
    replacement_expected_date = db.Column(db.DateTime, nullable=True)
    replacement_inspection_id = db.Column(db.Integer, db.ForeignKey("vendor_delivery_inspections.id"), nullable=True)
    replacement_imr_id = db.Column(db.Integer, db.ForeignKey("internal_inventory_material_requests.request_id"), nullable=True)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, index=True)

    __table_args__ = (
        db.Index('idx_vrr_resolution_status', 'resolution_type', 'status'),
        db.Index('idx_vrr_deleted_status', 'is_deleted', 'status'),
        db.Index('idx_vrr_buyer', 'created_by_buyer_id'),
    )

    # Relationships
    change_request = db.relationship("ChangeRequest", backref=db.backref("return_requests", lazy=True))
    po_child = db.relationship("POChild", backref=db.backref("return_requests", lazy=True))
    vendor = db.relationship("Vendor", foreign_keys=[vendor_id], backref=db.backref("return_requests_as_vendor", lazy=True))
    new_vendor = db.relationship("Vendor", foreign_keys=[new_vendor_id], backref=db.backref("return_requests_as_new_vendor", lazy=True))
    replacement_inspection = db.relationship("VendorDeliveryInspection", foreign_keys=[replacement_inspection_id])
    replacement_imr = db.relationship("InternalMaterialRequest", foreign_keys=[replacement_imr_id])

    def to_dict(self):
        result = {
            'id': self.id,
            'inspection_id': self.inspection_id,
            'cr_id': self.cr_id,
            'po_child_id': self.po_child_id,
            'vendor_id': self.vendor_id,
            'vendor_name': self.vendor_name,
            'return_request_number': self.return_request_number,
            'resolution_type': self.resolution_type,
            'status': self.status,
            'rejected_materials': self.rejected_materials or [],
            'total_rejected_value': round(self.total_rejected_value, 2) if self.total_rejected_value else 0,
            'sla_deadline': self.sla_deadline.isoformat() if self.sla_deadline else None,
            'sla_notes': self.sla_notes,
            'created_by_buyer_id': self.created_by_buyer_id,
            'created_by_buyer_name': self.created_by_buyer_name,
            'buyer_notes': self.buyer_notes,
            'td_approved_by_id': self.td_approved_by_id,
            'td_approved_by_name': self.td_approved_by_name,
            'td_approval_date': self.td_approval_date.isoformat() if self.td_approval_date else None,
            'td_rejection_reason': self.td_rejection_reason,
            'return_initiated_at': self.return_initiated_at.isoformat() if self.return_initiated_at else None,
            'return_confirmed_at': self.return_confirmed_at.isoformat() if self.return_confirmed_at else None,
            'vendor_return_reference': self.vendor_return_reference,
            'credit_note_number': self.credit_note_number,
            'credit_note_amount': round(self.credit_note_amount, 2) if self.credit_note_amount else 0,
            'credit_note_date': self.credit_note_date.isoformat() if self.credit_note_date else None,
            'lpo_adjustment_amount': round(self.lpo_adjustment_amount, 2) if self.lpo_adjustment_amount else 0,
            'refund_evidence': self.refund_evidence or [],
            'new_vendor_id': self.new_vendor_id,
            'new_vendor_name': self.new_vendor_name,
            'new_vendor_status': self.new_vendor_status,
            'new_lpo_id': self.new_lpo_id,
            'replacement_expected_date': self.replacement_expected_date.isoformat() if self.replacement_expected_date else None,
            'replacement_inspection_id': self.replacement_inspection_id,
            'replacement_imr_id': self.replacement_imr_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_deleted': self.is_deleted,
        }

        # Include CR formatted ID if available
        if self.change_request:
            result['formatted_cr_id'] = self.change_request.get_formatted_cr_id()
            result['project_id'] = self.change_request.project_id

        # Include inspection details if available
        if self.inspection:
            result['inspection_status'] = self.inspection.inspection_status
            result['inspected_at'] = self.inspection.inspected_at.isoformat() if self.inspection.inspected_at else None

        return result

    def __repr__(self):
        return f"<VendorReturnRequest {self.id} VRR:{self.return_request_number} Status:{self.status}>"


class InspectionIterationTracker(db.Model):
    """
    Tracks parent-child numbering for purchase iterations.
    e.g., CR-123 (original) -> CR-123.1 (first return/re-purchase) -> CR-123.1.1 (second rejection)
    """
    __tablename__ = "inspection_iteration_tracker"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    cr_id = db.Column(db.Integer, db.ForeignKey("change_requests.cr_id"), nullable=False, index=True)
    po_child_id = db.Column(db.Integer, db.ForeignKey("po_child.id"), nullable=True)
    iteration_suffix = db.Column(db.String(20), nullable=False)
    # Values: '.1', '.1.1', '.2', '.2.1', etc.

    parent_iteration_id = db.Column(db.Integer, db.ForeignKey("inspection_iteration_tracker.id"), nullable=True)

    # Context links
    inspection_id = db.Column(db.Integer, db.ForeignKey("vendor_delivery_inspections.id"), nullable=True)
    return_request_id = db.Column(db.Integer, db.ForeignKey("vendor_return_requests.id"), nullable=True)
    resolution_type = db.Column(db.String(30), nullable=True)
    # Values: 'replacement', 'new_vendor'

    # New vendor/LPO tracking
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.vendor_id"), nullable=True)
    vendor_name = db.Column(db.String(255), nullable=True)
    new_po_child_id = db.Column(db.Integer, db.ForeignKey("po_child.id"), nullable=True)

    # Status
    status = db.Column(db.String(30), default='active')
    # Values: 'active', 'completed', 'cancelled'

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = db.Column(db.Integer, nullable=False)
    is_deleted = db.Column(db.Boolean, default=False)

    __table_args__ = (
        db.Index('idx_iit_cr_suffix', 'cr_id', 'iteration_suffix'),
    )

    # Relationships
    change_request = db.relationship("ChangeRequest", backref=db.backref("iterations", lazy=True))
    parent_iteration = db.relationship("InspectionIterationTracker", remote_side=[id], backref=db.backref("child_iterations", lazy=True))
    inspection = db.relationship("VendorDeliveryInspection", backref=db.backref("iteration", lazy=True))
    return_request = db.relationship("VendorReturnRequest", backref=db.backref("iteration", lazy=True))
    vendor = db.relationship("Vendor", backref=db.backref("inspection_iterations", lazy=True))

    def get_formatted_iteration_id(self):
        """Get formatted iteration ID: PO-{cr_id}{suffix}"""
        return f"PO-{self.cr_id}{self.iteration_suffix}"

    def to_dict(self):
        return {
            'id': self.id,
            'cr_id': self.cr_id,
            'po_child_id': self.po_child_id,
            'iteration_suffix': self.iteration_suffix,
            'formatted_iteration_id': self.get_formatted_iteration_id(),
            'parent_iteration_id': self.parent_iteration_id,
            'inspection_id': self.inspection_id,
            'return_request_id': self.return_request_id,
            'resolution_type': self.resolution_type,
            'vendor_id': self.vendor_id,
            'vendor_name': self.vendor_name,
            'new_po_child_id': self.new_po_child_id,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by,
            'is_deleted': self.is_deleted,
        }

    def __repr__(self):
        return f"<InspectionIterationTracker {self.id} CR:{self.cr_id} Suffix:{self.iteration_suffix}>"
