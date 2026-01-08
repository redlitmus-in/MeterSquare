"""
LPO Terms Model
Master table for LPO payment/delivery/general terms (similar to BOQTerms)
"""

from config.db import db
from datetime import datetime


class LPOTerms(db.Model):
    """
    Master table for LPO Terms
    Stores reusable payment/delivery/general terms that can be selected for LPOs
    """
    __tablename__ = 'lpo_terms'

    term_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    term_text = db.Column(db.Text, nullable=False)
    term_type = db.Column(db.String(50), default='payment')  # 'payment', 'delivery', 'general'
    is_active = db.Column(db.Boolean, default=True, nullable=False, index=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False, index=True)
    display_order = db.Column(db.Integer, default=0, nullable=False, index=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    __table_args__ = (
        db.Index('idx_lpo_terms_is_active_deleted', 'is_active', 'is_deleted'),
        db.Index('idx_lpo_terms_type', 'term_type'),
    )

    def __repr__(self):
        return f'<LPOTerms term_id={self.term_id} type={self.term_type}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'term_id': self.term_id,
            'term_text': self.term_text,
            'term_type': self.term_type,
            'is_active': self.is_active,
            'is_deleted': self.is_deleted,
            'display_order': self.display_order,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'updated_by': self.updated_by
        }

    @staticmethod
    def get_active_terms(term_type=None):
        """
        Get all active (not deleted) terms
        Optionally filter by term_type ('payment', 'delivery', 'general')
        """
        query = LPOTerms.query.filter_by(is_active=True, is_deleted=False)
        
        if term_type:
            query = query.filter_by(term_type=term_type)
        
        return query.order_by(LPOTerms.display_order, LPOTerms.term_id).all()

    @staticmethod
    def get_by_id(term_id):
        """Get a specific term by ID"""
        return LPOTerms.query.filter_by(term_id=term_id).first()

    def soft_delete(self):
        """Soft delete the term"""
        self.is_deleted = True
        self.is_active = False
        db.session.commit()

    def activate(self):
        """Activate the term"""
        self.is_active = True
        self.is_deleted = False
        db.session.commit()
