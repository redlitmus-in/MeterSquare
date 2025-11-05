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
