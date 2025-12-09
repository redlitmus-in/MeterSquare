"""
LPO Customization Model
Stores user customizations for LPO PDF generation per purchase order
"""
from config.db import db
from datetime import datetime


class LPOCustomization(db.Model):
    __tablename__ = 'lpo_customizations'

    id = db.Column(db.Integer, primary_key=True)
    cr_id = db.Column(db.Integer, db.ForeignKey('change_requests.cr_id'), unique=True, nullable=False)

    # LPO Info
    quotation_ref = db.Column(db.String(255), default='')
    custom_message = db.Column(db.Text, default='')
    subject = db.Column(db.String(500), default='')

    # Terms
    payment_terms = db.Column(db.String(255), default='')
    completion_terms = db.Column(db.String(255), default='')
    custom_terms = db.Column(db.Text, default='[]')  # JSON array of {text: string, selected: boolean}
    general_terms = db.Column(db.Text, default='[]')  # JSON array (deprecated)
    payment_terms_list = db.Column(db.Text, default='[]')  # JSON array (deprecated)

    # Signatures
    include_signatures = db.Column(db.Boolean, default=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    def __repr__(self):
        return f'<LPOCustomization cr_id={self.cr_id}>'

    def to_dict(self):
        import json
        return {
            'id': self.id,
            'cr_id': self.cr_id,
            'quotation_ref': self.quotation_ref or '',
            'custom_message': self.custom_message or '',
            'subject': self.subject or '',
            'payment_terms': self.payment_terms or '',
            'completion_terms': self.completion_terms or '',
            'custom_terms': json.loads(self.custom_terms) if self.custom_terms else [],
            'general_terms': json.loads(self.general_terms) if self.general_terms else [],
            'payment_terms_list': json.loads(self.payment_terms_list) if self.payment_terms_list else [],
            'include_signatures': self.include_signatures,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
