"""
Check BOQ structure to see where prices are stored
"""

import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from models.boq import BOQ, BOQDetails

app = create_app()

with app.app_context():
    # Get BOQ 359
    boq = BOQ.query.filter_by(boq_id=359, is_deleted=False).first()

    if boq:
        print(f"BOQ: {boq.boq_name}")

        boq_detail = BOQDetails.query.filter_by(boq_id=359, is_deleted=False).first()

        if boq_detail and boq_detail.boq_details:
            items = boq_detail.boq_details.get('items', [])

            print(f"\nTotal items: {len(items)}")

            for item in items[:1]:  # Just check first item
                print(f"\nItem: {item.get('description', 'N/A')}")
                print(f"Item keys: {item.keys()}")

                sub_items = item.get('sub_items', [])
                print(f"Sub-items count: {len(sub_items)}")

                for sub_item in sub_items[:1]:  # Just check first sub-item
                    print(f"\n  Sub-item: {sub_item.get('sub_item_name', 'N/A')}")
                    print(f"  Sub-item keys: {sub_item.keys()}")

                    materials = sub_item.get('materials', [])
                    print(f"  Materials count: {len(materials)}")

                    for material in materials[:2]:  # Check first 2 materials
                        print(f"\n    Material: {material.get('name', 'N/A')}")
                        print(f"    Material structure:")
                        print(json.dumps(material, indent=6))
        else:
            print("No BOQ details found")
    else:
        print("BOQ not found")
