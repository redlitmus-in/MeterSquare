from config.db import db
from datetime import datetime


class EmailCcDefault(db.Model):
    """Admin-managed default CC recipients for vendor purchase order emails."""
    __tablename__ = 'email_cc_defaults'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    name = db.Column(db.String(255))
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_by = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'is_active': self.is_active,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class BuyerCcRecipient(db.Model):
    """Per-buyer custom CC recipients for vendor purchase order emails."""
    __tablename__ = 'buyer_cc_recipients'

    id = db.Column(db.Integer, primary_key=True)
    buyer_user_id = db.Column(db.Integer, nullable=False)
    email = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255))
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('buyer_user_id', 'email', name='uq_buyer_cc_email'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'buyer_user_id': self.buyer_user_id,
            'email': self.email,
            'name': self.name,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
