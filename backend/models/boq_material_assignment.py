from datetime import datetime
from config.db import db


class BOQMaterialAssignment(db.Model):
    """
    BOQ Material Assignment Model for tracking when Site Engineer assigns BOQ materials to Buyer
    Includes vendor selection and TD approval workflow (similar to change requests)
    """
    __tablename__ = "boq_material_assignments"

    assignment_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False)

    # Site Engineer who assigned
    assigned_by_user_id = db.Column(db.Integer, nullable=False)
    assigned_by_name = db.Column(db.String(255), nullable=False)

    # Buyer who receives the assignment
    assigned_to_buyer_user_id = db.Column(db.Integer, nullable=False)
    assigned_to_buyer_name = db.Column(db.String(255), nullable=False)
    assigned_to_buyer_date = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Assignment status
    status = db.Column(db.String(50), default="assigned_to_buyer")  # assigned_to_buyer, purchase_completed

    # Vendor Selection (requires TD approval)
    selected_vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.vendor_id'), nullable=True)
    selected_vendor_name = db.Column(db.String(255), nullable=True)
    vendor_selected_by_buyer_id = db.Column(db.Integer, nullable=True)
    vendor_selected_by_buyer_name = db.Column(db.String(255), nullable=True)
    vendor_selection_date = db.Column(db.DateTime, nullable=True)
    vendor_selection_status = db.Column(db.String(50), nullable=True)  # 'pending_td_approval', 'approved', 'rejected'

    # TD Approval for Vendor Selection
    vendor_approved_by_td_id = db.Column(db.Integer, nullable=True)
    vendor_approved_by_td_name = db.Column(db.String(255), nullable=True)
    vendor_approval_date = db.Column(db.DateTime, nullable=True)
    vendor_rejection_reason = db.Column(db.Text, nullable=True)

    # Vendor Email Tracking
    vendor_email_sent = db.Column(db.Boolean, default=False)  # Track if PO email sent to vendor
    vendor_email_sent_date = db.Column(db.DateTime, nullable=True)
    vendor_email_sent_by_user_id = db.Column(db.Integer, nullable=True)

    # Purchase Completion
    purchase_completed_by_user_id = db.Column(db.Integer, nullable=True)
    purchase_completed_by_name = db.Column(db.String(255), nullable=True)
    purchase_completion_date = db.Column(db.DateTime, nullable=True)
    purchase_notes = db.Column(db.Text, nullable=True)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)

    # Relationships
    boq = db.relationship("BOQ", backref=db.backref("material_assignments", lazy=True))
    project = db.relationship("Project", backref=db.backref("material_assignments", lazy=True))
    vendor = db.relationship("Vendor", backref=db.backref("material_assignments", lazy=True))

    def to_dict(self):
        """Convert to dictionary for JSON response"""
        return {
            'assignment_id': self.assignment_id,
            'boq_id': self.boq_id,
            'project_id': self.project_id,

            # Assigned by (Site Engineer)
            'assigned_by_user_id': self.assigned_by_user_id,
            'assigned_by_name': self.assigned_by_name,

            # Assigned to (Buyer)
            'assigned_to_buyer_user_id': self.assigned_to_buyer_user_id,
            'assigned_to_buyer_name': self.assigned_to_buyer_name,
            'assigned_to_buyer_date': self.assigned_to_buyer_date.isoformat() if self.assigned_to_buyer_date else None,

            # Status
            'status': self.status,

            # Vendor Selection
            'selected_vendor_id': self.selected_vendor_id,
            'selected_vendor_name': self.selected_vendor_name,
            'vendor_selected_by_buyer_id': self.vendor_selected_by_buyer_id,
            'vendor_selected_by_buyer_name': self.vendor_selected_by_buyer_name,
            'vendor_selection_date': self.vendor_selection_date.isoformat() if self.vendor_selection_date else None,
            'vendor_selection_status': self.vendor_selection_status,
            'vendor_approved_by_td_id': self.vendor_approved_by_td_id,
            'vendor_approved_by_td_name': self.vendor_approved_by_td_name,
            'vendor_approval_date': self.vendor_approval_date.isoformat() if self.vendor_approval_date else None,
            'vendor_rejection_reason': self.vendor_rejection_reason,

            # Vendor Email
            'vendor_email_sent': self.vendor_email_sent,
            'vendor_email_sent_date': self.vendor_email_sent_date.isoformat() if self.vendor_email_sent_date else None,
            'vendor_email_sent_by_user_id': self.vendor_email_sent_by_user_id,

            # Purchase Completion
            'purchase_completed_by_user_id': self.purchase_completed_by_user_id,
            'purchase_completed_by_name': self.purchase_completed_by_name,
            'purchase_completion_date': self.purchase_completion_date.isoformat() if self.purchase_completion_date else None,
            'purchase_notes': self.purchase_notes,

            # Timestamps
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_deleted': self.is_deleted
        }

    def __repr__(self):
        return f"<BOQMaterialAssignment {self.assignment_id} - BOQ:{self.boq_id} - Status:{self.status}>"
