"""
BOQ Terms Selection Model
Stores selected terms for each BOQ as a single row with term_ids array
"""

from config.db import db
from datetime import datetime
from sqlalchemy.dialects.postgresql import ARRAY


class BOQTermsSelection(db.Model):
    """
    Stores selected term IDs for each BOQ as a single row
    Uses PostgreSQL ARRAY type to store multiple term IDs
    """
    __tablename__ = 'boq_terms_selections'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey('boq.boq_id', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    term_ids = db.Column(ARRAY(db.Integer), nullable=False, default=[])
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationship
    boq = db.relationship('BOQ', backref=db.backref('terms_selection', uselist=False, cascade='all, delete-orphan'))

    def __repr__(self):
        return f'<BOQTermsSelection boq_id={self.boq_id} term_ids={self.term_ids}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'boq_id': self.boq_id,
            'term_ids': self.term_ids or [],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @staticmethod
    def get_boq_selection(boq_id):
        """Get term selection for a specific BOQ"""
        return BOQTermsSelection.query.filter_by(boq_id=boq_id).first()

    @staticmethod
    def get_selected_term_ids(boq_id):
        """Get the list of selected term IDs for a specific BOQ"""
        selection = BOQTermsSelection.query.filter_by(boq_id=boq_id).first()
        return selection.term_ids if selection else []

    @staticmethod
    def save_selection(boq_id, term_ids):
        """
        Save or update term selection for a BOQ
        term_ids: list of selected term IDs
        """
        selection = BOQTermsSelection.query.filter_by(boq_id=boq_id).first()

        if selection:
            selection.term_ids = term_ids
            selection.updated_at = datetime.utcnow()
        else:
            selection = BOQTermsSelection(
                boq_id=boq_id,
                term_ids=term_ids
            )
            db.session.add(selection)

        db.session.commit()
        return selection

    @staticmethod
    def delete_selection(boq_id):
        """Delete term selection for a BOQ"""
        BOQTermsSelection.query.filter_by(boq_id=boq_id).delete()
        db.session.commit()
