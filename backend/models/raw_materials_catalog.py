from datetime import datetime
from config.db import db


class RawMaterialsCatalog(db.Model):
    """
    Master catalog of raw materials maintained by Procurement/Buyer team.
    Estimators must select materials from this catalog when creating BOQs.
    """
    __tablename__ = "raw_materials_catalog"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    material_name = db.Column(db.String(255), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    brand = db.Column(db.String(255), nullable=True, index=True)
    size = db.Column(db.String(100), nullable=True)
    specification = db.Column(db.Text, nullable=True)
    unit = db.Column(db.String(50), nullable=True)  # kg, m, litre, pieces, etc.
    category = db.Column(db.String(100), nullable=True, index=True)  # Cement, Steel, Aggregates, etc.
    unit_price = db.Column(db.Numeric(15, 2), nullable=True, default=0.00)  # Current market price per unit

    # Audit fields
    created_by = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)

    # Soft delete
    is_active = db.Column(db.Boolean, default=True, index=True)

    # Relationships
    creator = db.relationship("User", foreign_keys=[created_by], backref=db.backref("raw_materials_created", lazy=True))

    # Composite indexes for common queries
    __table_args__ = (
        db.Index('idx_raw_material_active_name', 'is_active', 'material_name'),
        db.Index('idx_raw_material_category_active', 'category', 'is_active'),
    )

    def to_dict(self):
        """Serialize model to dictionary"""
        # Safely get unit_price (may not exist if migration hasn't run yet)
        unit_price_value = 0.0
        try:
            unit_price_value = float(self.unit_price) if self.unit_price else 0.0
        except AttributeError:
            # Column doesn't exist yet (migration not run)
            unit_price_value = 0.0

        return {
            'id': self.id,
            'material_name': self.material_name,
            'description': self.description,
            'brand': self.brand,
            'size': self.size,
            'specification': self.specification,
            'unit': self.unit,
            'category': self.category,
            'unit_price': unit_price_value,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_active': self.is_active,
            'creator_name': self.creator.full_name if self.creator else None
        }

    def __repr__(self):
        return f"<RawMaterialsCatalog {self.id}: {self.material_name} ({self.brand})>"
