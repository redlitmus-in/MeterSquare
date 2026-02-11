from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class POChild(db.Model):
    """
    PO Child Model - Tracks vendor-specific purchase order splits

    When a parent CR has materials assigned to different vendors,
    each vendor gets a separate POChild record.

    Architecture:
    - Parent CR (change_requests) handles approval workflow
    - POChild handles vendor selection and purchase tracking
    """
    __tablename__ = "po_child"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    parent_cr_id = db.Column(db.Integer, db.ForeignKey("change_requests.cr_id"), nullable=False, index=True)
    suffix = db.Column(db.String(10), nullable=False)  # ".1", ".2", ".3"

    # Project context (copied from parent CR)
    boq_id = db.Column(db.Integer, nullable=True)
    project_id = db.Column(db.Integer, nullable=True)
    item_id = db.Column(db.String(255), nullable=True)
    item_name = db.Column(db.String(255), nullable=True)
    submission_group_id = db.Column(db.String(50), nullable=True, index=True)

    # Materials for this vendor
    materials_data = db.Column(JSONB, nullable=False)
    materials_total_cost = db.Column(db.Float, default=0.0)

    # Child notes - additional specifications/requirements for this PO child
    child_notes = db.Column(db.Text, nullable=True)

    # Routing Type: 'store' or 'vendor'
    routing_type = db.Column(db.String(20), default='vendor', nullable=False, index=True)
    # Values: 'store' (route via PM to store), 'vendor' (requires TD approval)

    # Vendor info (nullable for store-routed POChildren)
    vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.vendor_id'), nullable=True, index=True)
    vendor_name = db.Column(db.String(255), nullable=True)

    # Vendor selection tracking (only for routing_type='vendor')
    vendor_selected_by_buyer_id = db.Column(db.Integer, nullable=True)
    vendor_selected_by_buyer_name = db.Column(db.String(255), nullable=True)
    vendor_selection_date = db.Column(db.DateTime, nullable=True)
    vendor_selection_status = db.Column(db.String(50), default='pending_td_approval', index=True)
    # Values: 'pending_td_approval', 'approved', 'rejected'

    # TD Approval tracking
    vendor_approved_by_td_id = db.Column(db.Integer, nullable=True)
    vendor_approved_by_td_name = db.Column(db.String(255), nullable=True)
    vendor_approval_date = db.Column(db.DateTime, nullable=True)

    # Communication tracking
    vendor_email_sent = db.Column(db.Boolean, default=False)
    vendor_email_sent_date = db.Column(db.DateTime, nullable=True)
    vendor_whatsapp_sent = db.Column(db.Boolean, default=False)
    vendor_whatsapp_sent_at = db.Column(db.DateTime, nullable=True)

    # Purchase completion
    purchase_completed_by_user_id = db.Column(db.Integer, nullable=True)
    purchase_completed_by_name = db.Column(db.String(255), nullable=True)
    purchase_completion_date = db.Column(db.DateTime, nullable=True)

    # Status
    status = db.Column(db.String(50), default='pending_td_approval', index=True)
    # Values:
    #   Vendor routing: 'pending_td_approval', 'vendor_approved', 'purchase_completed', 'rejected'
    #   Store routing: 'routed_to_store', 'purchase_completed'

    rejection_reason = db.Column(db.Text, nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_deleted = db.Column(db.Boolean, default=False, index=True)

    # Composite indexes for common queries
    __table_args__ = (
        db.Index('idx_po_child_parent_status', 'parent_cr_id', 'status'),
        db.Index('idx_po_child_vendor_status', 'vendor_id', 'status'),
        db.Index('idx_po_child_deleted_status', 'is_deleted', 'status'),
        db.Index('idx_po_child_routing_status', 'routing_type', 'status', 'is_deleted'),  # For filtering by routing type
    )

    # Relationships
    parent_cr = db.relationship("ChangeRequest", backref=db.backref("po_children", lazy=True), foreign_keys=[parent_cr_id])
    vendor = db.relationship("Vendor", backref=db.backref("vendor_po_children", lazy=True))

    def get_formatted_id(self):
        """Get formatted PO ID: PO-{parent_cr_id}{suffix}"""
        return f"PO-{self.parent_cr_id}{self.suffix}"

    def to_dict(self):
        """Convert to dictionary for JSON response"""
        result = {
            'id': self.id,
            'parent_cr_id': self.parent_cr_id,
            'suffix': self.suffix,
            'formatted_id': self.get_formatted_id(),
            'boq_id': self.boq_id,
            'project_id': self.project_id,
            'item_id': self.item_id,
            'item_name': self.item_name,
            'submission_group_id': self.submission_group_id,
            'materials_data': self.materials_data,
            'materials': self.materials_data,  # Alias for frontend compatibility
            'materials_count': len(self.materials_data) if self.materials_data else 0,
            'materials_total_cost': round(self.materials_total_cost, 2) if self.materials_total_cost else 0,
            'child_notes': self.child_notes,
            'routing_type': self.routing_type,  # 'store' or 'vendor'
            'vendor_id': self.vendor_id,
            'vendor_name': self.vendor_name,
            'vendor_selected_by_buyer_id': self.vendor_selected_by_buyer_id,
            'vendor_selected_by_buyer_name': self.vendor_selected_by_buyer_name,
            'vendor_selection_date': self.vendor_selection_date.isoformat() if self.vendor_selection_date else None,
            'vendor_selection_status': self.vendor_selection_status,
            'vendor_approved_by_td_id': self.vendor_approved_by_td_id,
            'vendor_approved_by_td_name': self.vendor_approved_by_td_name,
            'vendor_approval_date': self.vendor_approval_date.isoformat() if self.vendor_approval_date else None,
            'vendor_email_sent': self.vendor_email_sent,
            'vendor_email_sent_date': self.vendor_email_sent_date.isoformat() if self.vendor_email_sent_date else None,
            'vendor_whatsapp_sent': self.vendor_whatsapp_sent,
            'vendor_whatsapp_sent_at': self.vendor_whatsapp_sent_at.isoformat() if self.vendor_whatsapp_sent_at else None,
            'purchase_completed_by_user_id': self.purchase_completed_by_user_id,
            'purchase_completed_by_name': self.purchase_completed_by_name,
            'purchase_completion_date': self.purchase_completion_date.isoformat() if self.purchase_completion_date else None,
            'status': self.status,
            'rejection_reason': self.rejection_reason,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_deleted': self.is_deleted
        }

        # Include requested_by fields from parent Change Request if available
        if self.parent_cr:
            result['requested_by_user_id'] = self.parent_cr.requested_by_user_id if self.parent_cr.requested_by_user_id else None
            result['requested_by_name'] = self.parent_cr.requested_by_name if self.parent_cr.requested_by_name else None
            result['requested_by_role'] = self.parent_cr.requested_by_role if self.parent_cr.requested_by_role else None
        else:
            result['requested_by_user_id'] = None
            result['requested_by_name'] = None
            result['requested_by_role'] = None

        # Include full vendor details if vendor relationship is loaded
        # This data is used by ChangeRequestDetailsModal.tsx to display vendor information
        if self.vendor:
            result['vendor_details'] = {
                'company_name': self.vendor.company_name,
                'contact_person_name': self.vendor.contact_person_name,
                'email': self.vendor.email,
                'phone_code': self.vendor.phone_code,
                'phone': self.vendor.phone,  # Frontend expects 'phone' (line 802)
                'category': self.vendor.category,
                'street_address': self.vendor.street_address,
                'city': self.vendor.city,
                'state': self.vendor.state,
                'pin_code': self.vendor.pin_code,  # Frontend expects 'pin_code' (line 835)
                'gst_number': self.vendor.gst_number,
                'country': self.vendor.country
            }

        return result

    def __repr__(self):
        return f'<POChild {self.id}: {self.get_formatted_id()}>'
