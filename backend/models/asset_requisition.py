"""
Asset Requisition Model
Workflow: SE creates request → PM approves → Production Manager approves → Production Manager dispatches
Supports multiple items per requisition
"""

from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class AssetRequisition(db.Model):
    """
    Asset Requisition - Site Engineer requests assets with multi-level approval
    Now supports multiple items per requisition

    Status Flow:
    draft → pending_pm → pm_approved → pending_prod_mgr → prod_mgr_approved → dispatched → completed
          ↗             ↘ pm_rejected (SE can edit and resend)          ↘ prod_mgr_rejected
    """
    __tablename__ = "asset_requisitions"

    # Primary Key & Code
    requisition_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    requisition_code = db.Column(db.String(50), unique=True, nullable=False, index=True)  # ARQ-2025-0001

    # Project Reference (common for all items in requisition)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False, index=True)

    # Legacy single-item fields (kept for backward compatibility, nullable now)
    category_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_categories.category_id'), nullable=True)
    asset_item_id = db.Column(db.Integer, db.ForeignKey('returnable_asset_items.item_id'), nullable=True)
    quantity = db.Column(db.Integer, nullable=True, default=1)

    # Multi-item support: JSONB array of items
    # Format: [{"category_id": 1, "category_code": "CHA", "category_name": "Chair", "quantity": 5}, ...]
    items = db.Column(JSONB, nullable=True, default=list)

    # Request Details (common for all items)
    required_date = db.Column(db.Date, nullable=False, index=True)
    urgency = db.Column(db.String(20), default='normal')  # urgent, high, normal, low
    purpose = db.Column(db.Text, nullable=False)  # Why these assets are needed
    site_location = db.Column(db.String(255), nullable=True)  # Specific location within project

    # Status Tracking (Multi-stage workflow)
    status = db.Column(db.String(30), default='draft', nullable=False, index=True)
    # Values: draft, pending_pm, pm_approved, pm_rejected, pending_prod_mgr,
    #         prod_mgr_approved, prod_mgr_rejected, dispatched, completed, cancelled

    approval_required_from = db.Column(db.String(50), default='pm', nullable=True, index=True)  # 'pm' or 'production_manager' or None

    # Requester Info (Site Engineer)
    requested_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False, index=True)
    requested_by_name = db.Column(db.String(255), nullable=False)
    requested_at = db.Column(db.DateTime, default=datetime.utcnow)

    # PM Approval Stage
    pm_reviewed_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)
    pm_reviewed_by_name = db.Column(db.String(255), nullable=True)
    pm_reviewed_at = db.Column(db.DateTime, nullable=True)
    pm_notes = db.Column(db.Text, nullable=True)
    pm_decision = db.Column(db.String(20), nullable=True)  # approved, rejected
    pm_rejection_reason = db.Column(db.Text, nullable=True)

    # Production Manager Approval Stage
    prod_mgr_reviewed_by_user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)
    prod_mgr_reviewed_by_name = db.Column(db.String(255), nullable=True)
    prod_mgr_reviewed_at = db.Column(db.DateTime, nullable=True)
    prod_mgr_notes = db.Column(db.Text, nullable=True)
    prod_mgr_decision = db.Column(db.String(20), nullable=True)  # approved, rejected
    prod_mgr_rejection_reason = db.Column(db.Text, nullable=True)

    # Dispatch Details (Production Manager dispatches after approval)
    dispatched_by_user_id = db.Column(db.Integer, nullable=True)
    dispatched_by_name = db.Column(db.String(255), nullable=True)
    dispatched_at = db.Column(db.DateTime, nullable=True)
    dispatch_notes = db.Column(db.Text, nullable=True)
    adn_id = db.Column(db.Integer, db.ForeignKey('asset_delivery_notes.adn_id'), nullable=True)  # Link to ADN

    # Receipt Confirmation (SE confirms receipt)
    received_by_user_id = db.Column(db.Integer, nullable=True)
    received_by_name = db.Column(db.String(255), nullable=True)
    received_at = db.Column(db.DateTime, nullable=True)
    receipt_notes = db.Column(db.Text, nullable=True)

    # Standard Audit Fields
    is_deleted = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)

    # Composite Indexes for Performance
    __table_args__ = (
        db.Index('idx_arq_project_status', 'project_id', 'status'),
        db.Index('idx_arq_approval_from', 'approval_required_from', 'is_deleted'),
        db.Index('idx_arq_requester_status', 'requested_by_user_id', 'status'),
        db.Index('idx_arq_category', 'category_id', 'status'),
    )

    # Relationships
    project = db.relationship('Project', backref='asset_requisitions', lazy='joined')
    category = db.relationship('ReturnableAssetCategory', backref='requisitions', lazy='joined')
    asset_item = db.relationship('ReturnableAssetItem', backref='requisitions', lazy='joined')
    delivery_note = db.relationship('AssetDeliveryNote', backref='requisition', lazy='joined')

    def to_dict(self):
        """Convert model to dictionary for JSON response"""
        from models.returnable_assets import ReturnableAssetCategory

        # Build items list - use items JSONB if available, otherwise build from legacy fields
        items_list = self.items if self.items else []
        if not items_list and self.category_id:
            # Backward compatibility: build items from legacy single-item fields
            items_list = [{
                'category_id': self.category_id,
                'category_code': self.category.category_code if self.category else None,
                'category_name': self.category.category_name if self.category else None,
                'tracking_mode': self.category.tracking_mode if self.category else None,
                'quantity': self.quantity or 1,
                'asset_item_id': self.asset_item_id,
                'item_code': self.asset_item.item_code if self.asset_item else None,
                'serial_number': self.asset_item.serial_number if self.asset_item else None,
            }]
        elif items_list:
            # Enrich JSONB items with tracking_mode from category
            enriched_items = []
            for item in items_list:
                enriched_item = dict(item)  # Copy to avoid modifying original
                if 'tracking_mode' not in enriched_item and item.get('category_id'):
                    category = ReturnableAssetCategory.query.get(item['category_id'])
                    if category:
                        enriched_item['tracking_mode'] = category.tracking_mode
                enriched_items.append(enriched_item)
            items_list = enriched_items

        # Calculate total items count
        total_items = len(items_list)
        total_quantity = sum(item.get('quantity', 1) for item in items_list)

        return {
            'requisition_id': self.requisition_id,
            'requisition_code': self.requisition_code,
            'project_id': self.project_id,
            'project_name': self.project.project_name if self.project else None,
            'project_code': self.project.project_code if self.project else None,
            # Multi-item support
            'items': items_list,
            'total_items': total_items,
            'total_quantity': total_quantity,
            # Legacy single-item fields (for backward compatibility)
            'category_id': self.category_id,
            'category_code': self.category.category_code if self.category else None,
            'category_name': self.category.category_name if self.category else None,
            'tracking_mode': self.category.tracking_mode if self.category else None,
            'asset_item_id': self.asset_item_id,
            'item_code': self.asset_item.item_code if self.asset_item else None,
            'serial_number': self.asset_item.serial_number if self.asset_item else None,
            'quantity': self.quantity,
            # Common fields
            'required_date': self.required_date.isoformat() if self.required_date else None,
            'urgency': self.urgency,
            'purpose': self.purpose,
            'site_location': self.site_location,
            'status': self.status,
            'approval_required_from': self.approval_required_from,
            # Requester info
            'requested_by_user_id': self.requested_by_user_id,
            'requested_by_name': self.requested_by_name,
            'requested_at': self.requested_at.isoformat() if self.requested_at else None,
            # PM approval
            'pm_reviewed_by_user_id': self.pm_reviewed_by_user_id,
            'pm_reviewed_by_name': self.pm_reviewed_by_name,
            'pm_reviewed_at': self.pm_reviewed_at.isoformat() if self.pm_reviewed_at else None,
            'pm_notes': self.pm_notes,
            'pm_decision': self.pm_decision,
            'pm_rejection_reason': self.pm_rejection_reason,
            # Production Manager approval
            'prod_mgr_reviewed_by_user_id': self.prod_mgr_reviewed_by_user_id,
            'prod_mgr_reviewed_by_name': self.prod_mgr_reviewed_by_name,
            'prod_mgr_reviewed_at': self.prod_mgr_reviewed_at.isoformat() if self.prod_mgr_reviewed_at else None,
            'prod_mgr_notes': self.prod_mgr_notes,
            'prod_mgr_decision': self.prod_mgr_decision,
            'prod_mgr_rejection_reason': self.prod_mgr_rejection_reason,
            # Dispatch info
            'dispatched_by_user_id': self.dispatched_by_user_id,
            'dispatched_by_name': self.dispatched_by_name,
            'dispatched_at': self.dispatched_at.isoformat() if self.dispatched_at else None,
            'dispatch_notes': self.dispatch_notes,
            'adn_id': self.adn_id,
            'adn_number': self.delivery_note.adn_number if self.delivery_note else None,
            # Receipt info
            'received_by_user_id': self.received_by_user_id,
            'received_by_name': self.received_by_name,
            'received_at': self.received_at.isoformat() if self.received_at else None,
            'receipt_notes': self.receipt_notes,
            # Audit
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None,
            'last_modified_by': self.last_modified_by
        }

    @staticmethod
    def generate_requisition_code():
        """Generate unique requisition code: ARQ-YYYY-NNNN"""
        from sqlalchemy import func
        year = datetime.utcnow().year
        last_req = db.session.query(func.max(AssetRequisition.requisition_id)).scalar()
        next_id = (last_req or 0) + 1
        return f"ARQ-{year}-{next_id:04d}"


# Status constants for easy reference
class RequisitionStatus:
    DRAFT = 'draft'  # SE created but not yet sent to PM
    PENDING_PM = 'pending_pm'
    PM_APPROVED = 'pm_approved'
    PM_REJECTED = 'pm_rejected'
    PENDING_PROD_MGR = 'pending_prod_mgr'
    PROD_MGR_APPROVED = 'prod_mgr_approved'
    PROD_MGR_REJECTED = 'prod_mgr_rejected'
    DISPATCHED = 'dispatched'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'


# Urgency levels
class UrgencyLevel:
    URGENT = 'urgent'
    HIGH = 'high'
    NORMAL = 'normal'
    LOW = 'low'
