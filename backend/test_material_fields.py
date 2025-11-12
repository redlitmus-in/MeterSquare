"""
Test script to check if material fields are being saved correctly
Run this from the backend directory: python test_material_fields.py
"""
from config.db import db
from models.boq import BOQDetails
from app import app
import json

with app.app_context():
    # Get the most recent BOQ
    boq_detail = BOQDetails.query.order_by(BOQDetails.created_at.desc()).first()

    if not boq_detail:
        print("No BOQ found in database")
    else:
        print(f"\n=== BOQ ID: {boq_detail.boq_id} ===")
        print(f"Created: {boq_detail.created_at}")
        print(f"Created by: {boq_detail.created_by}\n")

        items = boq_detail.boq_details.get('items', [])
        print(f"Total items: {len(items)}\n")

        # Check first item with materials
        for item in items:
            # Check sub-item materials
            if 'sub_items' in item and item['sub_items']:
                for si_idx, sub_item in enumerate(item['sub_items']):
                    if 'materials' in sub_item and sub_item['materials']:
                        print(f"Item: {item.get('item_name')}")
                        print(f"  Sub-item: {sub_item.get('sub_item_name')}")
                        print(f"  Materials in sub-item:\n")

                        for mat_idx, material in enumerate(sub_item['materials'][:2]):  # Show first 2 materials
                            print(f"    Material {mat_idx + 1}:")
                            print(f"      - material_name: {material.get('material_name')}")
                            print(f"      - description: {material.get('description', 'NOT PRESENT')}")
                            print(f"      - brand: {material.get('brand', 'NOT PRESENT')}")
                            print(f"      - size: {material.get('size', 'NOT PRESENT')}")
                            print(f"      - specification: {material.get('specification', 'NOT PRESENT')}")
                            print(f"      - unit: {material.get('unit')}")
                            print(f"      - unit_price: {material.get('unit_price')}")
                            print()

                        print("=" * 60)
                        break

            # Check item-level materials
            if 'materials' in item and item['materials']:
                print(f"Item: {item.get('item_name')}")
                print(f"  Materials at item level:\n")

                for mat_idx, material in enumerate(item['materials'][:2]):  # Show first 2 materials
                    print(f"    Material {mat_idx + 1}:")
                    print(f"      - material_name: {material.get('material_name')}")
                    print(f"      - description: {material.get('description', 'NOT PRESENT')}")
                    print(f"      - brand: {material.get('brand', 'NOT PRESENT')}")
                    print(f"      - size: {material.get('size', 'NOT PRESENT')}")
                    print(f"      - specification: {material.get('specification', 'NOT PRESENT')}")
                    print(f"      - unit: {material.get('unit')}")
                    print(f"      - unit_price: {material.get('unit_price')}")
                    print()

                print("=" * 60)
                break

        print("\n✅ If you see 'NOT PRESENT' for brand/size/specification,")
        print("   that BOQ was created BEFORE the fix.")
        print("\n✅ To fix it: Edit the BOQ, re-enter the fields, and save again.")
