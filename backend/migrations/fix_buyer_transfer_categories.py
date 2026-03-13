"""
Migration Script: Fix Buyer Transfer Material Categories

This script updates materials with generic "Buyer Transfer - New Material"
and "Custom - Buyer Transfer" categories to proper category names.

Author: MeterSquare Team
Created: 2026-01-28
"""

import os
import sys
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from config.db import db
from models.inventory import InventoryMaterial

# Create Flask app instance
app = create_app()


def fix_buyer_transfer_categories():
    """Update materials with generic buyer transfer categories"""


    # Find all materials with generic buyer transfer categories
    generic_categories = [
        'Buyer Transfer - New Material',
        'Custom - Buyer Transfer',
        'Custom - Direct to Site'
    ]

    materials_to_fix = InventoryMaterial.query.filter(
        InventoryMaterial.category.in_(generic_categories),
        InventoryMaterial.is_active == True
    ).all()


    if not materials_to_fix:
        return

    # Update each material
    updated_count = 0
    for material in materials_to_fix:
        old_category = material.category

        # Set to 'General' category as default
        material.category = 'General'
        material.last_modified_at = datetime.utcnow()
        material.last_modified_by = 'System Migration'


        updated_count += 1

    # Ask for confirmation
    confirm = input("Proceed with update? (yes/no): ").strip().lower()

    if confirm != 'yes':
        return

    # Commit changes
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise


def show_category_distribution():
    """Show distribution of categories after fix"""

    from sqlalchemy import func

    category_counts = db.session.query(
        InventoryMaterial.category,
        func.count(InventoryMaterial.inventory_material_id).label('count')
    ).filter(
        InventoryMaterial.is_active == True
    ).group_by(
        InventoryMaterial.category
    ).order_by(
        func.count(InventoryMaterial.inventory_material_id).desc()
    ).all()

    for category, count in category_counts:
        pass



if __name__ == '__main__':

    # Run within Flask application context
    with app.app_context():
        fix_buyer_transfer_categories()
        show_category_distribution()

