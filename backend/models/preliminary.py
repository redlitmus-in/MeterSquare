from datetime import datetime
from config.db import db
from sqlalchemy.dialects.postgresql import JSONB

class Preliminary(db.Model):
    __tablename__ = "preliminaries"

    preliminary_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    # JSON structure: {
    #   "items": [...],
    #   "notes": "...",
    #   "cost_analysis": {
    #     "quantity": 1, "unit": "Nos", "rate": 55555, "client_amount": 55555,
    #     "internal_cost": 22222, "misc_percentage": 10, "misc_amount": 5555.50,
    #     "overhead_profit_percentage": 25, "overhead_profit_amount": 13888.75,
    #     "transport_percentage": 5, "transport_amount": 2777.75,
    #     "planned_profit": 13888.75, "negotiable_margin": 33333.00
    #   }
    # }
    description = db.Column(db.JSON, nullable=False)
    quantity = db.Column(db.Float, default=1)
    unit = db.Column(db.String(50), nullable=True)
    rate = db.Column(db.Float, nullable=True)
    amount = db.Column(db.Float, nullable=True)
    project_id = db.Column(db.Integer, nullable=True)  # Keep for backward compatibility
    boq_id = db.Column(db.Integer, db.ForeignKey("boq.boq_id", ondelete="CASCADE"), nullable=True)  # Link to specific BOQ
    is_default = db.Column(db.Boolean, default=False)
    is_deleted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(255), nullable=False)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.String(255), nullable=True)

# BOQ Internal Revisions Table - Tracks internal approval cycles (PM edits, TD rejections)
class BOQInternalRevision(db.Model):
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