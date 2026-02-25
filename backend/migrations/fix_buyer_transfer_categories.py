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

    print("=" * 80)
    print("FIXING BUYER TRANSFER MATERIAL CATEGORIES")
    print("=" * 80)
    print()

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

    print(f"Found {len(materials_to_fix)} materials with generic categories")
    print()

    if not materials_to_fix:
        print("✓ No materials to fix. All materials have proper categories.")
        return

    # Update each material
    updated_count = 0
    for material in materials_to_fix:
        old_category = material.category

        # Set to 'General' category as default
        material.category = 'General'
        material.last_modified_at = datetime.utcnow()
        material.last_modified_by = 'System Migration'

        print(f"Material: {material.material_name} ({material.material_code})")
        print(f"  Old Category: {old_category}")
        print(f"  New Category: General")
        print()

        updated_count += 1

    # Ask for confirmation
    print("-" * 80)
    print(f"Ready to update {updated_count} materials")
    confirm = input("Proceed with update? (yes/no): ").strip().lower()

    if confirm != 'yes':
        print("❌ Migration cancelled by user")
        return

    # Commit changes
    try:
        db.session.commit()
        print()
        print("=" * 80)
        print(f"✓ SUCCESS: Updated {updated_count} materials to 'General' category")
        print("=" * 80)
        print()
        print("NEXT STEPS:")
        print("1. Review the materials in the Materials Catalog")
        print("2. Manually update categories to appropriate values (e.g., 'Cement', 'Steel', etc.)")
        print("3. Consider adding category selection to buyer transfer form")
    except Exception as e:
        db.session.rollback()
        print()
        print("=" * 80)
        print(f"❌ ERROR: Failed to update materials: {e}")
        print("=" * 80)
        raise


def show_category_distribution():
    """Show distribution of categories after fix"""
    print()
    print("=" * 80)
    print("CATEGORY DISTRIBUTION")
    print("=" * 80)

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
        print(f"  {category}: {count} materials")

    print("=" * 80)


if __name__ == '__main__':
    print()
    print("Starting migration...")
    print()

    # Run within Flask application context
    with app.app_context():
        fix_buyer_transfer_categories()
        show_category_distribution()

    print()
    print("Migration completed!")
    print()
