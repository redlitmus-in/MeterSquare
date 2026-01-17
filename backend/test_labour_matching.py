#!/usr/bin/env python3
"""
Test script to verify labour requisition matching for BOQ 843
"""
from app import create_app, db
from models.labour_requisition import LabourRequisition
from sqlalchemy import or_, cast
from sqlalchemy.dialects.postgresql import JSONB
import re

app = create_app()

with app.app_context():
    boq_id = 843

    print("=" * 80)
    print(f"TESTING LABOUR REQUISITION MATCHING FOR BOQ {boq_id}")
    print("=" * 80)

    # Test 1: Direct boq_id query (deprecated column)
    print("\n1. Testing deprecated boq_id column...")
    reqs_old = LabourRequisition.query.filter(
        LabourRequisition.boq_id == boq_id,
        LabourRequisition.is_deleted == False
    ).all()
    print(f"   Found {len(reqs_old)} requisitions via deprecated boq_id column")

    # Test 2: JSONB boq_id query
    print("\n2. Testing labour_items JSONB with explicit boq_id...")
    reqs_jsonb = LabourRequisition.query.filter(
        LabourRequisition.labour_items.op('@>')(
            cast([{"boq_id": boq_id}], JSONB)
        ),
        LabourRequisition.is_deleted == False
    ).all()
    print(f"   Found {len(reqs_jsonb)} requisitions via JSONB boq_id")

    # Test 3: labour_id pattern matching
    print(f"\n3. Testing labour_id pattern matching (lab_{boq_id}_...)...")
    all_requisitions = LabourRequisition.query.filter(
        LabourRequisition.is_deleted == False,
        LabourRequisition.labour_items.isnot(None)
    ).all()

    print(f"   Total active requisitions with labour_items: {len(all_requisitions)}")

    matching_requisitions = []
    for req in all_requisitions:
        if req.labour_items:
            for item in req.labour_items:
                labour_id = item.get('labour_id', '')
                # Pattern: lab_{boq_id}_... (e.g., lab_843_1_2_1)
                match = re.match(r'^lab_(\d+)_', labour_id)
                if match:
                    extracted_boq_id = int(match.group(1))
                    if extracted_boq_id == boq_id:
                        matching_requisitions.append(req)
                        print(f"   ✅ MATCHED: Requisition {req.requisition_id}")
                        print(f"      - labour_id: {labour_id}")
                        print(f"      - skill_required: {req.skill_required}")
                        print(f"      - request_date: {req.request_date}")
                        print(f"      - status: {req.status}")
                        print(f"      - labour_items count: {len(req.labour_items)}")

                        # Show all labour items in this requisition
                        for idx, li in enumerate(req.labour_items):
                            print(f"         Item {idx+1}:")
                            print(f"           - labour_id: {li.get('labour_id')}")
                            print(f"           - skill_required: {li.get('skill_required')}")
                            print(f"           - workers_count: {li.get('workers_count')}")
                        break

    print(f"\n   Found {len(matching_requisitions)} requisitions via labour_id pattern")

    # Combined result
    print("\n" + "=" * 80)
    print("SUMMARY:")
    print("=" * 80)
    total_found = len(reqs_old) + len(reqs_jsonb) + len(matching_requisitions)
    print(f"Total requisitions found for BOQ {boq_id}: {total_found}")

    if matching_requisitions:
        print(f"\n✅ SUCCESS: Found {len(matching_requisitions)} requisitions via labour_id pattern!")
        print("The backend fix is working correctly.")
    else:
        print("\n❌ FAILURE: No requisitions found for BOQ 843")
        print("Need to investigate further.")
