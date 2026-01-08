"""
LPO Customization Model
Stores user customizations for LPO PDF generation per purchase order
"""
from config.db import db
from datetime import datetime


class LPOCustomization(db.Model):
    __tablename__ = 'lpo_customizations'

    id = db.Column(db.Integer, primary_key=True)
    cr_id = db.Column(db.Integer, db.ForeignKey('change_requests.cr_id'), nullable=False)
    po_child_id = db.Column(db.Integer, db.ForeignKey('po_child.id'), nullable=True)

    # Unique constraint: either (cr_id, po_child_id) pair is unique
    # This allows one customization per CR (when po_child_id is NULL) or per PO child
    __table_args__ = (
        db.UniqueConstraint('cr_id', 'po_child_id', name='uq_lpo_customization_cr_po_child'),
    )

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

    # VAT
    vat_percent = db.Column(db.Numeric(5, 2), default=5.0)  # VAT percentage (e.g., 5.0 for 5%)
    vat_amount = db.Column(db.Numeric(15, 2), default=0.0)   # Calculated VAT amount

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
            'po_child_id': self.po_child_id,
            'quotation_ref': self.quotation_ref or '',
            'custom_message': self.custom_message or '',
            'subject': self.subject or '',
            'payment_terms': self.payment_terms or '',
            'completion_terms': self.completion_terms or '',
            'custom_terms': json.loads(self.custom_terms) if self.custom_terms else [],
            'general_terms': json.loads(self.general_terms) if self.general_terms else [],
            'payment_terms_list': json.loads(self.payment_terms_list) if self.payment_terms_list else [],
            'include_signatures': self.include_signatures,
            'vat_percent': float(self.vat_percent) if self.vat_percent else 5.0,
            'vat_amount': float(self.vat_amount) if self.vat_amount else 0.0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
