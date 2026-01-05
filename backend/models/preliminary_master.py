"""
Preliminary Master Model - Master list of all available preliminary items
Also includes BOQInternalRevision model for tracking internal BOQ approval cycles
"""
from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class PreliminaryMaster(db.Model):
    """Master table for preliminary items that can be selected in BOQs"""
    __tablename__ = "preliminaries_master"

    prelim_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False)  # Short name
    description = db.Column(db.Text, nullable=False)  # Full description
    unit = db.Column(db.String(50), default='nos')
    rate = db.Column(db.Float, default=0)
    is_active = db.Column(db.Boolean, default=True)  # Can be deactivated without deletion
    display_order = db.Column(db.Integer, default=0)  # For custom ordering
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(255), nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(db.String(255), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'prelim_id': self.prelim_id,
            'name': self.name,
            'description': self.description,
            'unit': self.unit,
            'rate': self.rate,
            'is_active': self.is_active,
            'display_order': self.display_order
        }


class BOQPreliminary(db.Model):
    """Junction table linking BOQs with selected preliminary items"""
    __tablename__ = "boq_preliminaries"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id", ondelete="CASCADE"), nullable=False)
    prelim_id = db.Column(db.Integer, db.ForeignKey("preliminaries_master.prelim_id"), nullable=False)
    is_checked = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    boq = db.relationship("BOQ", backref=db.backref("boq_preliminaries", lazy=True, cascade="all, delete-orphan"))
    preliminary = db.relationship("PreliminaryMaster", backref=db.backref("boq_selections", lazy=True))

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'id': self.id,
            'boq_id': self.boq_id,
            'prelim_id': self.prelim_id,
            'is_checked': self.is_checked,
            'preliminary': self.preliminary.to_dict() if self.preliminary else None
        }


class BOQInternalRevision(db.Model):
    """Tracks internal BOQ approval cycles before sending to client"""
    __tablename__ = "boq_internal_revisions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id", ondelete="CASCADE"), nullable=False)
    internal_revision_number = db.Column(db.Integer, nullable=False)
    action_type = db.Column(db.String(50), nullable=False)  # PM_EDITED, TD_REJECTED, TD_APPROVED, SENT_TO_TD, SENT_TO_PM, ESTIMATOR_RESUBMIT, INTERNAL_REVISION_EDIT
    actor_role = db.Column(db.String(50), nullable=False)
    actor_name = db.Column(db.String(100), nullable=True)
    actor_user_id = db.Column(db.Integer, nullable=True)
    status_before = db.Column(db.String(50), nullable=True)
    status_after = db.Column(db.String(50), nullable=True)
    changes_summary = db.Column(JSONB, nullable=True)  # JSON with change details
    rejection_reason = db.Column(db.Text, nullable=True)
    approval_comments = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    is_deleted = db.Column(db.Boolean, default=False)

    # Relationship
    boq = db.relationship("BOQ", backref=db.backref("internal_revisions", lazy=True))


class PreliminaryPurchaseRequest(db.Model):
    """
    Preliminary Purchase Request Model for tracking preliminary items requested by PM
    Uses simplified workflow: PM → Buyer (skip TD and Estimator approval)
    """
    __tablename__ = "preliminary_purchase_requests"

    ppr_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False, index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False, index=True)

    # Requester information
    requested_by_user_id = db.Column(db.Integer, nullable=False, index=True)
    requested_by_name = db.Column(db.String(255), nullable=False)
    requested_by_role = db.Column(db.String(100), nullable=False)  # 'project_manager'

    # Request details
    request_type = db.Column(db.String(50), default="PRELIMINARY_PURCHASE")
    justification = db.Column(db.Text, nullable=True)  # Optional remarks
    status = db.Column(db.String(50), default="pending", index=True)  # pending, approved, purchased, rejected

    # Preliminary items data (stored as JSONB array)
    preliminaries_data = db.Column(JSONB, nullable=False)
    """
    Example structure:
    [
        {
            "prelim_id": 1,
            "name": "Site Mobilization",
            "description": "Site setup and mobilization costs",
            "unit": "nos",
            "quantity": 1,
            "rate": 50000,
            "total_amount": 50000,
            "justification": "Required for project setup"
        }
    ]
    """

    # Financial tracking
    total_amount = db.Column(db.Float, default=0.0)  # Sum of all preliminary items

    # Simplified Approval workflow (PM → Buyer)
    # PM creates request, it goes directly to assigned buyer

    # Buyer Assignment
    assigned_to_buyer_user_id = db.Column(db.Integer, nullable=True, index=True)
    assigned_to_buyer_name = db.Column(db.String(255), nullable=True)
    assigned_to_buyer_date = db.Column(db.DateTime, nullable=True)

    # Buyer Purchase Completion
    purchase_completed_by_user_id = db.Column(db.Integer, nullable=True)
    purchase_completed_by_name = db.Column(db.String(255), nullable=True)
    purchase_completion_date = db.Column(db.DateTime, nullable=True)
    purchase_notes = db.Column(db.Text, nullable=True)

    # File uploads for buyer
    file_path = db.Column(db.Text, nullable=True)  # Comma-separated list of uploaded file names

    # Vendor Selection
    selected_vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.vendor_id'), nullable=True)
    selected_vendor_name = db.Column(db.String(255), nullable=True)
    vendor_selection_date = db.Column(db.DateTime, nullable=True)

    # Rejection
    rejection_reason = db.Column(db.Text, nullable=True)
    rejected_by_user_id = db.Column(db.Integer, nullable=True)
    rejected_by_name = db.Column(db.String(255), nullable=True)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, index=True)

    # Composite indexes for common query patterns
    __table_args__ = (
        db.Index('idx_ppr_boq_status', 'boq_id', 'status'),
        db.Index('idx_ppr_project_status', 'project_id', 'status'),
        db.Index('idx_ppr_deleted_status', 'is_deleted', 'status'),
    )

    # Relationships
    boq = db.relationship("BOQ", backref=db.backref("preliminary_purchase_requests", lazy=True))
    project = db.relationship("Project", backref=db.backref("preliminary_purchase_requests", lazy=True))
    vendor = db.relationship("Vendor", backref=db.backref("preliminary_purchase_requests", lazy=True))

    def to_dict(self):
        """Convert to dictionary for JSON response"""
        return {
            'ppr_id': self.ppr_id,
            'boq_id': self.boq_id,
            'project_id': self.project_id,

            # Requester
            'requested_by_user_id': self.requested_by_user_id,
            'requested_by_name': self.requested_by_name,
            'requested_by_role': self.requested_by_role,

            # Request details
            'request_type': self.request_type,
            'justification': self.justification,
            'status': self.status,

            # Preliminary items
            'preliminaries_data': self.preliminaries_data,
            'total_amount': round(self.total_amount, 2) if self.total_amount else 0,

            # Buyer Assignment
            'assigned_to_buyer_user_id': self.assigned_to_buyer_user_id,
            'assigned_to_buyer_name': self.assigned_to_buyer_name,
            'assigned_to_buyer_date': self.assigned_to_buyer_date.isoformat() if self.assigned_to_buyer_date else None,

            # Purchase Completion
            'purchase_completed_by_user_id': self.purchase_completed_by_user_id,
            'purchase_completed_by_name': self.purchase_completed_by_name,
            'purchase_completion_date': self.purchase_completion_date.isoformat() if self.purchase_completion_date else None,
            'purchase_notes': self.purchase_notes,

            # File uploads
            'file_path': self.file_path,

            # Vendor
            'selected_vendor_id': self.selected_vendor_id,
            'selected_vendor_name': self.selected_vendor_name,
            'vendor_selection_date': self.vendor_selection_date.isoformat() if self.vendor_selection_date else None,

            # Rejection
            'rejection_reason': self.rejection_reason,
            'rejected_by_user_id': self.rejected_by_user_id,
            'rejected_by_name': self.rejected_by_name,

            # Timestamps
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_deleted': self.is_deleted
        }

    def __repr__(self):
        return f"<PreliminaryPurchaseRequest {self.ppr_id} - BOQ:{self.boq_id} - Status:{self.status}>"
