"""
BOQ Terms Selection Model
Represents the junction table between BOQ and Terms & Conditions
Similar to the preliminaries selection model
"""

from config.db import db
from datetime import datetime


class BOQTermsSelection(db.Model):
    """
    Junction table linking BOQs with selected Terms & Conditions
    Stores which terms are checked/selected for each specific BOQ
    """
    __tablename__ = 'boq_terms_selections'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    boq_id = db.Column(db.Integer, db.ForeignKey('boq.boq_id', ondelete='CASCADE'), nullable=False, index=True)
    term_id = db.Column(db.Integer, db.ForeignKey('boq_terms.term_id', ondelete='CASCADE'), nullable=False, index=True)
    is_checked = db.Column(db.Boolean, default=False, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    boq = db.relationship('BOQ', backref=db.backref('term_selections', lazy='dynamic', cascade='all, delete-orphan'))
    term = db.relationship('BOQTerms', backref=db.backref('boq_selections', lazy='dynamic'))

    # Unique constraint to prevent duplicate selections
    __table_args__ = (
        db.UniqueConstraint('boq_id', 'term_id', name='unique_boq_term'),
    )

    def __repr__(self):
        return f'<BOQTermsSelection boq_id={self.boq_id} term_id={self.term_id} is_checked={self.is_checked}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'boq_id': self.boq_id,
            'term_id': self.term_id,
            'is_checked': self.is_checked,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @staticmethod
    def get_boq_selections(boq_id):
        """Get all term selections for a specific BOQ"""
        return BOQTermsSelection.query.filter_by(boq_id=boq_id).all()

    @staticmethod
    def get_checked_selections(boq_id):
        """Get only checked/selected terms for a specific BOQ"""
        return BOQTermsSelection.query.filter_by(boq_id=boq_id, is_checked=True).all()

    @staticmethod
    def delete_boq_selections(boq_id):
        """Delete all term selections for a BOQ"""
        BOQTermsSelection.query.filter_by(boq_id=boq_id).delete()
        db.session.commit()

    @staticmethod
    def bulk_create(boq_id, selections):
        """
        Bulk create term selections for a BOQ
        selections: list of dicts with {term_id, is_checked}
        """
        objects = []
        for selection in selections:
            obj = BOQTermsSelection(
                boq_id=boq_id,
                term_id=selection['term_id'],
                is_checked=selection.get('is_checked', False)
            )
            objects.append(obj)

        db.session.bulk_save_objects(objects)
        db.session.commit()
        return len(objects)
