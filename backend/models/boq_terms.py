"""
BOQ Terms Model
Represents the master terms & conditions templates
"""

from config.db import db
from datetime import datetime


class BOQTerms(db.Model):
    """
    Master table for Terms & Conditions templates
    Stores reusable terms that can be selected for BOQs
    """
    __tablename__ = 'boq_terms'

    term_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    template_name = db.Column(db.String(255), nullable=True)  # Optional, focusing on terms_text
    terms_text = db.Column(db.Text, nullable=False)  # Main content - the actual term
    is_default = db.Column(db.Boolean, default=False, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=True, index=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False, index=True)
    display_order = db.Column(db.Integer, default=0, nullable=True, index=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.client_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    updated_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    # Unique constraint on template_name (when not null)
    __table_args__ = (
        db.Index('idx_boq_terms_is_active_deleted', 'is_active', 'is_deleted'),
    )

    def __repr__(self):
        return f'<BOQTerms term_id={self.term_id} active={self.is_active}>'

    def to_dict(self, include_text=True):
        """
        Convert model to dictionary for JSON serialization
        :param include_text: Whether to include the full terms_text (can be large)
        """
        data = {
            'term_id': self.term_id,
            'template_name': self.template_name,
            'is_default': self.is_default,
            'is_active': self.is_active,
            'is_deleted': self.is_deleted,
            'display_order': self.display_order,
            'created_by': self.created_by,
            'client_id': self.client_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'updated_by': self.updated_by
        }

        if include_text:
            data['terms_text'] = self.terms_text

        return data

    @staticmethod
    def get_active_terms(client_id=None):
        """
        Get all active (not deleted) terms
        Optionally filter by client_id
        """
        query = BOQTerms.query.filter_by(is_active=True, is_deleted=False)

        if client_id:
            # Get client-specific terms or general terms (client_id is null)
            query = query.filter(
                (BOQTerms.client_id == client_id) | (BOQTerms.client_id == None)
            )

        return query.order_by(BOQTerms.display_order, BOQTerms.term_id).all()

    @staticmethod
    def get_default_term():
        """Get the default terms template"""
        return BOQTerms.query.filter_by(is_default=True, is_active=True, is_deleted=False).first()

    @staticmethod
    def get_by_id(term_id):
        """Get a specific term by ID"""
        return BOQTerms.query.filter_by(term_id=term_id).first()

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
