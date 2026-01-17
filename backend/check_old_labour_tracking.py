#!/usr/bin/env python3
"""
Check the old LabourTracking table for BOQ 843
"""
from app import create_app, db
from models.boq import LabourTracking
from sqlalchemy import func

app = create_app()

with app.app_context():
    boq_id = 843

    print("=" * 80)
    print(f"CHECKING OLD LABOUR_TRACKING TABLE FOR BOQ {boq_id}")
    print("=" * 80)

    # Check labour_tracking table
    old_labour = LabourTracking.query.filter_by(
        boq_id=boq_id,
        is_deleted=False
    ).all()

    print(f"\nFound {len(old_labour)} records in labour_tracking table")

    if old_labour:
        print("\nOLD LABOUR TRACKING DATA:")
        for labour in old_labour:
            print(f"\n  Labour Role: {labour.labour_role}")
            print(f"    Total Hours: {labour.total_hours}")
            print(f"    Total Cost: ${labour.total_cost}")
            print(f"    Created: {labour.created_at}")
            if hasattr(labour, 'labour_history') and labour.labour_history:
                print(f"    Labour History Entries: {len(labour.labour_history)}")
    else:
        print("\n❌ No old labour tracking data found for BOQ 843")

    # Check total across all BOQs
    print("\n" + "=" * 80)
    print("OLD LABOUR_TRACKING SUMMARY (ALL BOQs)")
    print("=" * 80)

    total_count = LabourTracking.query.filter_by(is_deleted=False).count()
    boqs_with_labour = db.session.query(
        func.count(func.distinct(LabourTracking.boq_id))
    ).filter(LabourTracking.is_deleted == False).scalar()

    print(f"Total active labour_tracking records: {total_count}")
    print(f"BOQs with old labour data: {boqs_with_labour}")

    if total_count > 0:
        # Show sample
        sample = LabourTracking.query.filter_by(is_deleted=False).limit(5).all()
        print(f"\nSample records (first 5):")
        for labour in sample:
            print(f"\n  BOQ {labour.boq_id} - {labour.labour_role}")
            print(f"    Hours: {labour.total_hours}, Cost: ${labour.total_cost}")
