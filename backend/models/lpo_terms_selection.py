"""
LPO Terms Selection Model
Stores selected term IDs for each LPO (similar to BOQTermsSelection)
"""

from config.db import db
from datetime import datetime
from sqlalchemy.dialects.postgresql import ARRAY


class LPOTermsSelection(db.Model):
    """
    Stores selected term IDs for each LPO as a single row
    Uses PostgreSQL ARRAY type to store multiple term IDs
    """
    __tablename__ = 'lpo_terms_selections'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    cr_id = db.Column(db.Integer, db.ForeignKey('change_requests.cr_id', ondelete='CASCADE'), nullable=False, index=True)
    po_child_id = db.Column(db.Integer, db.ForeignKey('po_child.id', ondelete='CASCADE'), nullable=True, index=True)
    term_ids = db.Column(ARRAY(db.Integer), nullable=False, default=[])
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('cr_id', 'po_child_id', name='uq_lpo_terms_cr_po_child'),
    )

    def __repr__(self):
        return f'<LPOTermsSelection cr_id={self.cr_id} po_child_id={self.po_child_id} term_ids={self.term_ids}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'cr_id': self.cr_id,
            'po_child_id': self.po_child_id,
            'term_ids': self.term_ids or [],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @staticmethod
    def get_lpo_selection(cr_id, po_child_id=None):
        """Get term selection for a specific LPO"""
        return LPOTermsSelection.query.filter_by(cr_id=cr_id, po_child_id=po_child_id).first()

    @staticmethod
    def get_selected_term_ids(cr_id, po_child_id=None):
        """Get the list of selected term IDs for a specific LPO"""
        selection = LPOTermsSelection.query.filter_by(cr_id=cr_id, po_child_id=po_child_id).first()
        return selection.term_ids if selection else []

    @staticmethod
    def save_selection(cr_id, term_ids, po_child_id=None):
        """
        Save or update term selection for an LPO
        term_ids: list of selected term IDs
        """
        selection = LPOTermsSelection.query.filter_by(cr_id=cr_id, po_child_id=po_child_id).first()

        if selection:
            selection.term_ids = term_ids
            selection.updated_at = datetime.utcnow()
        else:
            selection = LPOTermsSelection(
                cr_id=cr_id,
                po_child_id=po_child_id,
                term_ids=term_ids
            )
            db.session.add(selection)

        db.session.commit()
        return selection

    @staticmethod
    def delete_selection(cr_id, po_child_id=None):
        """Delete term selection for an LPO"""
        LPOTermsSelection.query.filter_by(cr_id=cr_id, po_child_id=po_child_id).delete()
        db.session.commit()
