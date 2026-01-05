from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class ChangeRequest(db.Model):
    """
    Change Request Model for tracking extra materials/items requested by PM/SE
    CLEANED: Removed 26 unused columns on 2025-12-19
    """
    __tablename__ = "change_requests"

    cr_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False, index=True)  # ✅ PERFORMANCE: Added index
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False, index=True)  # ✅ PERFORMANCE: Added index

    # Requester information
    requested_by_user_id = db.Column(db.Integer, nullable=False, index=True)  # ✅ PERFORMANCE: Added index
    requested_by_name = db.Column(db.String(255), nullable=False)
    requested_by_role = db.Column(db.String(100), nullable=False)  # 'project_manager' or 'site_supervisor'

    # Request details
    request_type = db.Column(db.String(50), default="EXTRA_MATERIALS")  # For future: MODIFY_ITEMS, etc.
    justification = db.Column(db.Text, nullable=False)  # Why these materials are needed
    status = db.Column(db.String(50), default="pending", index=True)  # ✅ PERFORMANCE: Added index
    current_approver_role = db.Column(db.String(50), nullable=True)  # Tracks who should act next

    # BOQ Item Reference (which item these sub-items belong to)
    item_id = db.Column(db.String(255), nullable=True)  # e.g., "item_1"
    item_name = db.Column(db.String(255), nullable=True)  # e.g., "Concrete Work"
    sub_item_id = db.Column(db.Integer, nullable=True)  # Primary sub-item ID for easier querying

    # 🗑️ REMOVED 2025-12-19: Overhead tracking columns (18 columns) - Never implemented/populated
    # item_overhead_allocated, item_overhead_consumed_before, item_overhead_available,
    # overhead_consumed, overhead_balance_impact, original_overhead_allocated, etc.

    # Sub-Items requested (stored as JSONB array)
    sub_items_data = db.Column(JSONB, nullable=False)
    """
    Example structure:
    [
        {
            "sub_item_name": "Cement",
            "quantity": 10,
            "unit": "bags",
            "unit_price": 400,
            "total_price": 4000,
            "is_new": false,  # True if this is a new sub-item not in original BOQ
            "reason": "Required due to design change"  # Only if is_new=true
        }
    ]
    """

    # New Sub-Item Tracking
    has_new_sub_items = db.Column(db.Boolean, default=False)  # Flag if adding new sub-items
    # 🗑️ REMOVED: new_sub_item_reason (never used)

    # Legacy field for backward compatibility (renamed from materials_data)
    materials_data = db.Column(JSONB, nullable=True)  # Keep for old records

    # Financial tracking - Request impact
    materials_total_cost = db.Column(db.Float, default=0.0)  # Sum of all materials

    # Approval workflow - Multi-stage
    approval_required_from = db.Column(db.String(50), nullable=True, index=True)  # ✅ PERFORMANCE: Added index

    # PM Assignment (which specific PM should handle this request)
    assigned_to_pm_user_id = db.Column(db.Integer, nullable=True, index=True)
    assigned_to_pm_name = db.Column(db.String(255), nullable=True)
    assigned_to_pm_date = db.Column(db.DateTime, nullable=True)

    # PM Approval
    pm_approved_by_user_id = db.Column(db.Integer, nullable=True)
    pm_approved_by_name = db.Column(db.String(255), nullable=True)
    pm_approval_date = db.Column(db.DateTime, nullable=True)

    # TD Approval
    td_approved_by_user_id = db.Column(db.Integer, nullable=True)
    td_approved_by_name = db.Column(db.String(255), nullable=True)
    td_approval_date = db.Column(db.DateTime, nullable=True)

    # 🗑️ REMOVED 2025-12-19: MEP Approval columns (3 columns) - Never implemented
    # mep_approved_by_user_id, mep_approved_by_name, mep_approval_date

    # Final Approval (Estimator) - keeping original fields for backward compatibility
    approved_by_user_id = db.Column(db.Integer, nullable=True)
    approved_by_name = db.Column(db.String(255), nullable=True)
    approval_date = db.Column(db.DateTime, nullable=True)

    # Buyer Purchase Completion
    assigned_to_buyer_user_id = db.Column(db.Integer, nullable=True)
    assigned_to_buyer_name = db.Column(db.String(255), nullable=True)
    assigned_to_buyer_date = db.Column(db.DateTime, nullable=True)
    purchase_completed_by_user_id = db.Column(db.Integer, nullable=True)
    purchase_completed_by_name = db.Column(db.String(255), nullable=True)
    purchase_completion_date = db.Column(db.DateTime, nullable=True)
    purchase_notes = db.Column(db.Text, nullable=True)

    # File uploads for buyer
    file_path = db.Column(db.Text, nullable=True)  # Comma-separated list of uploaded file names

    # Vendor Selection (requires TD approval)
    selected_vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.vendor_id'), nullable=True)
    selected_vendor_name = db.Column(db.String(255), nullable=True)
    vendor_selected_by_buyer_id = db.Column(db.Integer, nullable=True)
    vendor_selected_by_buyer_name = db.Column(db.String(255), nullable=True)
    vendor_selection_date = db.Column(db.DateTime, nullable=True)
    vendor_selection_status = db.Column(db.String(50), nullable=True)  # 'pending_td_approval', 'approved', 'rejected'
    vendor_approved_by_td_id = db.Column(db.Integer, nullable=True)
    vendor_approved_by_td_name = db.Column(db.String(255), nullable=True)
    vendor_approval_date = db.Column(db.DateTime, nullable=True)
    vendor_rejection_reason = db.Column(db.Text, nullable=True)
    vendor_email_sent = db.Column(db.Boolean, default=False)  # Track if PO email sent to vendor
    vendor_email_sent_date = db.Column(db.DateTime, nullable=True)
    vendor_email_sent_by_user_id = db.Column(db.Integer, nullable=True)

    # WhatsApp tracking
    vendor_whatsapp_sent = db.Column(db.Boolean, default=False)  # Track if PO WhatsApp sent to vendor
    vendor_whatsapp_sent_at = db.Column(db.DateTime, nullable=True)

    # Rejection
    rejection_reason = db.Column(db.Text, nullable=True)
    rejected_by_user_id = db.Column(db.Integer, nullable=True)
    rejected_by_name = db.Column(db.String(255), nullable=True)
    rejected_at_stage = db.Column(db.String(50), nullable=True)  # Which stage it was rejected at

    # Notification tracking
    notification_sent = db.Column(db.Boolean, default=False)
    # 🗑️ REMOVED: notification_sent_at (notification_sent boolean is sufficient)

    # Per-Material Vendor Selection
    material_vendor_selections = db.Column(JSONB, nullable=True, default=dict)
    use_per_material_vendors = db.Column(db.Boolean, default=False)

    # 🗑️ REMOVED 2025-12-19: Deprecated parent-child CR columns (3 columns) - Replaced by po_children table
    # parent_cr_id, cr_number_suffix, submission_group_id
    # NOTE: Now use the po_children table and POChild model for parent-child relationships

    is_sub_cr = db.Column(db.Boolean, default=False)  # True if this is a sub-CR (kept for backward compatibility)

    # Vendor Delivery Routing (Complete & Send to Store feature - Added 2025-12-19)
    delivery_routing = db.Column(db.String(50), default='direct_to_site')  # 'direct_to_site' or 'via_production_manager'
    vendor_delivered_to_store = db.Column(db.Boolean, default=False)  # Vendor confirmed delivery to warehouse
    vendor_delivery_date = db.Column(db.DateTime, nullable=True)  # When vendor delivered to warehouse
    buyer_completion_notes = db.Column(db.Text, nullable=True)  # Buyer notes when completing
    store_request_status = db.Column(db.String(50), nullable=True)  # Workflow status: pending_vendor_delivery, delivered_to_store, pm_received, dispatched_to_site, delivered_to_site

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)  # ✅ PERFORMANCE: Added index
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, index=True)  # ✅ PERFORMANCE: Added index

    # ✅ PERFORMANCE: Composite indexes for common query patterns
    __table_args__ = (
        db.Index('idx_cr_boq_status', 'boq_id', 'status'),  # For BOQ change request queries
        db.Index('idx_cr_project_status', 'project_id', 'status'),  # For project change request queries
        db.Index('idx_cr_deleted_status', 'is_deleted', 'status'),  # For filtered queries
        db.Index('idx_cr_approval_from', 'approval_required_from', 'is_deleted'),  # For approval workflow
    )

    # Relationships
    boq = db.relationship("BOQ", backref=db.backref("change_requests", lazy=True))
    project = db.relationship("Project", backref=db.backref("change_requests", lazy=True))
    vendor = db.relationship("Vendor", backref=db.backref("change_requests", lazy=True))

    # ✅ PERFORMANCE: Add relationship for eager loading internal material requests
    store_requests = db.relationship(
        "InternalMaterialRequest",
        primaryjoin="ChangeRequest.cr_id == foreign(InternalMaterialRequest.cr_id)",
        backref=db.backref("change_request", lazy=True),
        lazy=True
    )

    # NOTE: po_children relationship is defined in POChild model with backref
    # Parent-child CR relationships now use the po_children table instead of deprecated columns

    def get_formatted_cr_id(self):
        """
        Get formatted PO ID
        Returns: "PO-{cr_id}"
        Note: Sub-PO formatting removed (used po_children table instead)
        """
        return f"PO-{self.cr_id}"

    def calculate_recommended_routing(self):
        """
        Calculate the recommended routing based on material type only
        Returns tuple: (route_to, routing_type)

        Routing logic (SIMPLIFIED - NO PERCENTAGE CALCULATIONS):
        1. Check if ALL materials are external buy (existing BOQ materials with master_material_id)
           - If yes: Route to 'buyer' (external procurement, prices already set)
        2. If ANY materials are NEW (no master_material_id):
           - Route to 'estimator' (needs pricing from estimator)
        """
        # Check material type from materials_data or sub_items_data
        materials = self.materials_data if self.materials_data else self.sub_items_data

        if materials and isinstance(materials, list) and len(materials) > 0:
            # Check if ALL materials have master_material_id (external buy)
            all_external = all(
                mat.get('master_material_id') is not None
                for mat in materials
            )

            # If all materials are existing BOQ materials, route to Buyer
            if all_external:
                return 'buyer', 'external_buy'

        # If there are NEW materials, route to Estimator for pricing
        return 'estimator', 'new_materials'

    def to_dict(self):
        """Convert to dictionary for JSON response"""
        # Calculate recommended routing (based on material type, NOT percentage)
        recommended_route, routing_type = self.calculate_recommended_routing()

        return {
            'cr_id': self.cr_id,
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

            # BOQ Item Reference
            'item_id': self.item_id,
            'item_name': self.item_name,
            'sub_item_id': self.sub_item_id,

            # Item Overhead (backward compatibility - always return zeros)
            'item_overhead': {
                'allocated': 0,
                'consumed_before': 0,
                'available': 0
            },

            # Sub-Items
            'sub_items_data': self.sub_items_data,
            'has_new_sub_items': self.has_new_sub_items,

            # Legacy Materials (backward compatibility)
            'materials_data': self.materials_data,
            'materials_total_cost': round(self.materials_total_cost, 2) if self.materials_total_cost else 0,

            # Overhead analysis (backward compatibility - always return zeros)
            'overhead_analysis': {
                'original_allocated': 0,
                'overhead_percentage': 0,
                'consumed_before_request': 0,
                'available_before_request': 0,
                'consumed_by_this_request': 0,
                'remaining_after_approval': 0,
                'is_within_budget': True,
                'balance_type': 'positive',
                'balance_amount': 0
            },

            # Budget impact (backward compatibility - always return zeros)
            'budget_impact': {
                'original_total': 0,
                'new_total_if_approved': 0,
                'increase_amount': 0,
                'increase_percentage': 0
            },

            # Approval - Multi-stage
            'approval_required_from': self.approval_required_from,
            'current_approver_role': self.current_approver_role,

            # Recommended routing (based on material type: 'buyer', 'estimator', or 'technical_director')
            'recommended_next_approver': recommended_route,
            'routing_type': routing_type,  # 'external_buy' or 'new_materials'

            # PM Assignment
            'assigned_to_pm_user_id': self.assigned_to_pm_user_id,
            'assigned_to_pm_name': self.assigned_to_pm_name,
            'assigned_to_pm_date': self.assigned_to_pm_date.isoformat() if self.assigned_to_pm_date else None,

            # PM Approval
            'pm_approved_by_user_id': self.pm_approved_by_user_id,
            'pm_approved_by_name': self.pm_approved_by_name,
            'pm_approval_date': self.pm_approval_date.isoformat() if self.pm_approval_date else None,

            # TD Approval
            'td_approved_by_user_id': self.td_approved_by_user_id,
            'td_approved_by_name': self.td_approved_by_name,
            'td_approval_date': self.td_approval_date.isoformat() if self.td_approval_date else None,

            # Final Approval (Estimator)
            'approved_by_user_id': self.approved_by_user_id,
            'approved_by_name': self.approved_by_name,
            'approval_date': self.approval_date.isoformat() if self.approval_date else None,

            # Buyer Purchase
            'assigned_to_buyer_user_id': self.assigned_to_buyer_user_id,
            'assigned_to_buyer_name': self.assigned_to_buyer_name,
            'assigned_to_buyer_date': self.assigned_to_buyer_date.isoformat() if self.assigned_to_buyer_date else None,
            'purchase_completed_by_user_id': self.purchase_completed_by_user_id,
            'purchase_completed_by_name': self.purchase_completed_by_name,
            'purchase_completion_date': self.purchase_completion_date.isoformat() if self.purchase_completion_date else None,
            'purchase_notes': self.purchase_notes,

            # File uploads
            'file_path': self.file_path,

            # Vendor Selection (Legacy - single vendor for all materials)
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

            # Per-Material Vendor Selection (New)
            'use_per_material_vendors': self.use_per_material_vendors,
            'material_vendor_selections': self.material_vendor_selections if self.material_vendor_selections else {},

            # Sub-CR Support (backward compatibility - return None/False for deprecated fields)
            'parent_cr_id': None,  # DEPRECATED - use po_children table
            'cr_number_suffix': None,  # DEPRECATED - use po_children table
            'is_sub_cr': self.is_sub_cr,
            'submission_group_id': None,  # DEPRECATED - use po_children table
            'formatted_cr_id': self.get_formatted_cr_id(),  # "PO-123"

            # Rejection
            'rejection_reason': self.rejection_reason,
            'rejected_by_user_id': self.rejected_by_user_id,
            'rejected_by_name': self.rejected_by_name,
            'rejected_at_stage': self.rejected_at_stage,

            # Vendor Email/WhatsApp tracking
            'vendor_email_sent': self.vendor_email_sent,
            'vendor_email_sent_date': self.vendor_email_sent_date.isoformat() if self.vendor_email_sent_date else None,
            'vendor_whatsapp_sent': self.vendor_whatsapp_sent,
            'vendor_whatsapp_sent_at': self.vendor_whatsapp_sent_at.isoformat() if self.vendor_whatsapp_sent_at else None,

            # Vendor Delivery Routing (Complete & Send to Store feature)
            'delivery_routing': self.delivery_routing,
            'vendor_delivered_to_store': self.vendor_delivered_to_store,
            'vendor_delivery_date': self.vendor_delivery_date.isoformat() if self.vendor_delivery_date else None,
            'buyer_completion_notes': self.buyer_completion_notes,
            'store_request_status': self.store_request_status,

            # Timestamps
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_deleted': self.is_deleted
        }

    def __repr__(self):
        return f"<ChangeRequest {self.cr_id} - BOQ:{self.boq_id} - Status:{self.status}>"
