from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB


class ChangeRequest(db.Model):
    """
    Change Request Model for tracking extra materials/items requested by PM/SE
    Includes overhead budget tracking and approval workflow
    """
    __tablename__ = "change_requests"

    cr_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id"), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey("project.project_id"), nullable=False)

    # Requester information
    requested_by_user_id = db.Column(db.Integer, nullable=False)
    requested_by_name = db.Column(db.String(255), nullable=False)
    requested_by_role = db.Column(db.String(100), nullable=False)  # 'project_manager' or 'site_supervisor'

    # Request details
    request_type = db.Column(db.String(50), default="EXTRA_MATERIALS")  # For future: MODIFY_ITEMS, etc.
    justification = db.Column(db.Text, nullable=False)  # Why these materials are needed
    status = db.Column(db.String(50), default="pending")  # pending, under_review, approved_by_pm, approved_by_td, approved, rejected
    current_approver_role = db.Column(db.String(50), nullable=True)  # Tracks who should act next

    # Materials requested (stored as JSONB array)
    materials_data = db.Column(JSONB, nullable=False)
    """
    Example structure:
    [
        {
            "material_name": "Cement",
            "quantity": 10,
            "unit": "bags",
            "unit_price": 400,
            "total_price": 4000,
            "master_material_id": 123  # Optional, for linking to master
        }
    ]
    """

    # Financial tracking - Request impact
    materials_total_cost = db.Column(db.Float, default=0.0)  # Sum of all materials
    overhead_consumed = db.Column(db.Float, default=0.0)  # Overhead used by these materials
    overhead_balance_impact = db.Column(db.Float, default=0.0)  # Impact on overhead (negative means exceeds)
    profit_impact = db.Column(db.Float, default=0.0)  # Impact on profit margin

    # Original BOQ financials (snapshot at request time)
    original_overhead_allocated = db.Column(db.Float, default=0.0)  # Total overhead from original BOQ
    original_overhead_used = db.Column(db.Float, default=0.0)  # Overhead already consumed
    original_overhead_remaining = db.Column(db.Float, default=0.0)  # Available overhead before this request
    original_overhead_percentage = db.Column(db.Float, default=0.0)  # Overhead % from BOQ
    original_profit_percentage = db.Column(db.Float, default=0.0)  # Profit % from BOQ

    # New totals after this request (if approved)
    new_overhead_remaining = db.Column(db.Float, default=0.0)  # Can be negative if over budget
    new_base_cost = db.Column(db.Float, default=0.0)  # Original + new materials
    new_total_cost = db.Column(db.Float, default=0.0)  # New BOQ total if approved
    is_over_budget = db.Column(db.Boolean, default=False)  # True if overhead_balance_impact is negative

    # Cost comparison
    cost_increase_amount = db.Column(db.Float, default=0.0)  # How much BOQ increases
    cost_increase_percentage = db.Column(db.Float, default=0.0)  # Percentage increase

    # Approval workflow - Multi-stage
    approval_required_from = db.Column(db.String(50), nullable=True)  # Current stage: 'project_manager', 'estimator', 'technical_director'

    # PM Approval
    pm_approved_by_user_id = db.Column(db.Integer, nullable=True)
    pm_approved_by_name = db.Column(db.String(255), nullable=True)
    pm_approval_date = db.Column(db.DateTime, nullable=True)

    # TD Approval
    td_approved_by_user_id = db.Column(db.Integer, nullable=True)
    td_approved_by_name = db.Column(db.String(255), nullable=True)
    td_approval_date = db.Column(db.DateTime, nullable=True)

    # Final Approval (Estimator) - keeping original fields for backward compatibility
    approved_by_user_id = db.Column(db.Integer, nullable=True)
    approved_by_name = db.Column(db.String(255), nullable=True)
    approval_date = db.Column(db.DateTime, nullable=True)

    # Rejection
    rejection_reason = db.Column(db.Text, nullable=True)
    rejected_by_user_id = db.Column(db.Integer, nullable=True)
    rejected_by_name = db.Column(db.String(255), nullable=True)
    rejected_at_stage = db.Column(db.String(50), nullable=True)  # Which stage it was rejected at

    # Notification tracking
    notification_sent = db.Column(db.Boolean, default=False)
    notification_sent_at = db.Column(db.DateTime, nullable=True)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)

    # Relationships
    boq = db.relationship("BOQ", backref=db.backref("change_requests", lazy=True))
    project = db.relationship("Project", backref=db.backref("change_requests", lazy=True))

    def to_dict(self):
        """Convert to dictionary for JSON response"""
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

            # Materials
            'materials_data': self.materials_data,
            'materials_total_cost': round(self.materials_total_cost, 2) if self.materials_total_cost else 0,

            # Overhead analysis
            'overhead_analysis': {
                'original_allocated': round(self.original_overhead_allocated, 2) if self.original_overhead_allocated else 0,
                'overhead_percentage': round(self.original_overhead_percentage, 2) if self.original_overhead_percentage else 0,
                'consumed_before_request': round(self.original_overhead_used, 2) if self.original_overhead_used else 0,
                'available_before_request': round(self.original_overhead_remaining, 2) if self.original_overhead_remaining else 0,
                'consumed_by_this_request': round(self.overhead_consumed, 2) if self.overhead_consumed else 0,
                'remaining_after_approval': round(self.new_overhead_remaining, 2) if self.new_overhead_remaining else 0,
                'is_within_budget': not self.is_over_budget,
                'balance_type': 'negative' if self.is_over_budget else 'positive',
                'balance_amount': abs(round(self.new_overhead_remaining, 2)) if self.new_overhead_remaining else 0
            },

            # Budget impact
            'budget_impact': {
                'original_total': round(self.new_total_cost - self.cost_increase_amount, 2) if self.new_total_cost and self.cost_increase_amount else 0,
                'new_total_if_approved': round(self.new_total_cost, 2) if self.new_total_cost else 0,
                'increase_amount': round(self.cost_increase_amount, 2) if self.cost_increase_amount else 0,
                'increase_percentage': round(self.cost_increase_percentage, 2) if self.cost_increase_percentage else 0
            },

            # Approval - Multi-stage
            'approval_required_from': self.approval_required_from,
            'current_approver_role': self.current_approver_role,

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

            # Rejection
            'rejection_reason': self.rejection_reason,
            'rejected_by_user_id': self.rejected_by_user_id,
            'rejected_by_name': self.rejected_by_name,
            'rejected_at_stage': self.rejected_at_stage,

            # Timestamps
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_deleted': self.is_deleted
        }

    def __repr__(self):
        return f"<ChangeRequest {self.cr_id} - BOQ:{self.boq_id} - Status:{self.status}>"
