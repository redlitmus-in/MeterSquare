from config.db import db
from datetime import datetime


class Vendor(db.Model):
    """Vendor model for managing vendor/supplier information"""
    __tablename__ = 'vendors'

    vendor_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    company_name = db.Column(db.String(255), nullable=False)
    contact_person_name = db.Column(db.String(255), nullable=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    phone_code = db.Column(db.String(10), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    street_address = db.Column(db.Text, nullable=True)
    city = db.Column(db.String(100), nullable=True)
    state = db.Column(db.String(100), nullable=True)
    country = db.Column(db.String(100), nullable=True, default='UAE')
    pin_code = db.Column(db.String(20), nullable=True)
    gst_number = db.Column(db.String(50), nullable=True)
    category = db.Column(db.String(100), nullable=True)
    status = db.Column(db.Enum('active', 'inactive', name='vendor_status_enum'), default='active')
    is_deleted = db.Column(db.Boolean, default=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_modified_by = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    # Relationships
    products = db.relationship('VendorProduct', backref='vendor', lazy=True, cascade='all, delete-orphan')
    creator = db.relationship('User', foreign_keys=[created_by], backref='vendors_created')
    modifier = db.relationship('User', foreign_keys=[last_modified_by], backref='vendors_modified')

    def to_dict(self):
        """Convert vendor object to dictionary"""
        return {
            'vendor_id': self.vendor_id,
            'company_name': self.company_name,
            'contact_person_name': self.contact_person_name,
            'email': self.email,
            'phone_code': self.phone_code,
            'phone': self.phone,
            'street_address': self.street_address,
            'city': self.city,
            'state': self.state,
            'country': self.country,
            'pin_code': self.pin_code,
            'gst_number': self.gst_number,
            'category': self.category,
            'status': self.status,
            'is_deleted': self.is_deleted,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None,
            'last_modified_by': self.last_modified_by
        }

    def __repr__(self):
        return f'<Vendor {self.vendor_id}: {self.company_name}>'


class VendorProduct(db.Model):
    """Vendor products/services model"""
    __tablename__ = 'vendor_products'

    product_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.vendor_id', ondelete='CASCADE'), nullable=False)
    product_name = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(100), nullable=True)
    description = db.Column(db.Text, nullable=True)
    unit = db.Column(db.String(50), nullable=True)
    unit_price = db.Column(db.Numeric(15, 2), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_modified_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        """Convert product object to dictionary"""
        return {
            'product_id': self.product_id,
            'vendor_id': self.vendor_id,
            'product_name': self.product_name,
            'category': self.category,
            'description': self.description,
            'unit': self.unit,
            'unit_price': float(self.unit_price) if self.unit_price else None,
            'is_deleted': self.is_deleted,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_modified_at': self.last_modified_at.isoformat() if self.last_modified_at else None
        }

    def __repr__(self):
        return f'<VendorProduct {self.product_id}: {self.product_name}>'
