"""
Catalog Item Models

Hierarchical catalog maintained by Buyer/Procurement team.
Structure: CatalogItem -> CatalogSubItem -> linked RawMaterialsCatalog entries.

Estimators can import these pre-built templates when creating BOQs.
"""

from datetime import datetime
from config.db import db


class CatalogItem(db.Model):
    """Buyer-managed work item (e.g., Foundation, Roofing) for BOQ templates."""
    __tablename__ = "catalog_items"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    item_name = db.Column(db.String(255), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=True, index=True)

    created_by = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    is_active = db.Column(db.Boolean, default=True, index=True)

    creator = db.relationship("User", foreign_keys=[created_by])
    sub_items = db.relationship(
        "CatalogSubItem",
        backref="catalog_item",
        lazy=True,
        order_by="CatalogSubItem.id"
    )

    __table_args__ = (
        db.Index('idx_catalog_item_active_name', 'is_active', 'item_name'),
    )

    def to_dict(self):
        active_sub_items = [si for si in self.sub_items if si.is_active]
        return {
            'id': self.id,
            'item_name': self.item_name,
            'description': self.description,
            'category': self.category,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_active': self.is_active,
            'creator_name': self.creator.full_name if self.creator else None,
            'sub_items_count': len(active_sub_items),
        }

    def to_dict_full(self):
        """Include full sub-items with their materials."""
        base = self.to_dict()
        active_sub_items = [si for si in self.sub_items if si.is_active]
        base['sub_items'] = [si.to_dict() for si in active_sub_items]
        return base

    def __repr__(self):
        return f"<CatalogItem {self.id}: {self.item_name}>"


class CatalogSubItem(db.Model):
    """Sub-item under a catalog item (e.g., Concrete Footings under Foundation)."""
    __tablename__ = "catalog_sub_items"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    catalog_item_id = db.Column(db.Integer, db.ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=False, index=True)
    sub_item_name = db.Column(db.String(255), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    size = db.Column(db.String(255), nullable=True)
    specification = db.Column(db.String(255), nullable=True)
    brand = db.Column(db.String(255), nullable=True)
    unit = db.Column(db.String(50), nullable=True)

    created_by = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True)
    is_active = db.Column(db.Boolean, default=True, index=True)

    creator = db.relationship("User", foreign_keys=[created_by])
    material_links = db.relationship(
        "CatalogSubItemMaterial",
        backref="catalog_sub_item",
        lazy=True,
        order_by="CatalogSubItemMaterial.id"
    )

    __table_args__ = (
        db.Index('idx_catalog_sub_item_parent_active', 'catalog_item_id', 'is_active'),
    )

    def to_dict(self):
        active_links = [ml for ml in self.material_links if ml.is_active]
        return {
            'id': self.id,
            'catalog_item_id': self.catalog_item_id,
            'sub_item_name': self.sub_item_name,
            'description': self.description,
            'size': self.size,
            'specification': self.specification,
            'brand': self.brand,
            'unit': self.unit,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_active': self.is_active,
            'creator_name': self.creator.full_name if self.creator else None,
            'materials_count': len(active_links),
            'materials': [ml.to_dict() for ml in active_links],
        }

    def __repr__(self):
        return f"<CatalogSubItem {self.id}: {self.sub_item_name}>"


class CatalogSubItemMaterial(db.Model):
    """Links a raw material to a catalog sub-item with a default quantity."""
    __tablename__ = "catalog_sub_item_materials"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    catalog_sub_item_id = db.Column(db.Integer, db.ForeignKey("catalog_sub_items.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_material_id = db.Column(db.Integer, db.ForeignKey("raw_materials_catalog.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = db.Column(db.Float, default=1.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    is_active = db.Column(db.Boolean, default=True)

    raw_material = db.relationship("RawMaterialsCatalog", foreign_keys=[raw_material_id])

    def to_dict(self):
        mat = self.raw_material
        return {
            'id': self.id,
            'catalog_sub_item_id': self.catalog_sub_item_id,
            'raw_material_id': self.raw_material_id,
            'quantity': self.quantity,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active': self.is_active,
            'material_name': mat.material_name if mat else None,
            'brand': mat.brand if mat else None,
            'size': mat.size if mat else None,
            'specification': mat.specification if mat else None,
            'unit': mat.unit if mat else None,
            'unit_price': float(mat.unit_price) if mat and mat.unit_price else 0.0,
            'category': mat.category if mat else None,
        }

    def __repr__(self):
        return f"<CatalogSubItemMaterial {self.id}: sub_item={self.catalog_sub_item_id}, material={self.raw_material_id}>"
