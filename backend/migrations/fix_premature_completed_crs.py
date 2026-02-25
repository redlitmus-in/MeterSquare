"""
Fix CRs prematurely marked as purchase_completed while still having uncovered materials.

Bug: When a store-routed PO child was completed, the parent CR was marked as
purchase_completed even though other materials still needed vendor selection.

This script finds affected CRs and resets them to 'sent_to_store' so buyers
can continue assigning vendors to the remaining materials.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app
from config.db import db
from models.change_request import ChangeRequest
from models.po_child import POChild
from utils.po_helpers import are_all_cr_materials_covered


def find_and_fix():
    app = create_app()
    with app.app_context():
        # Find all CRs marked as purchase_completed or routed_to_store that have PO children
        affected_crs = ChangeRequest.query.filter(
            ChangeRequest.status.in_(['purchase_completed', 'routed_to_store']),
            ChangeRequest.is_deleted == False
        ).all()

        print(f"Found {len(affected_crs)} CRs with completed/routed status")
        fixed = []

        for cr in affected_crs:
            po_children = POChild.query.filter_by(
                parent_cr_id=cr.cr_id, is_deleted=False
            ).all()

            if not po_children:
                # No PO children — parent was completed directly, this is fine
                continue

            all_covered, uncovered = are_all_cr_materials_covered(cr, po_children)

            if not all_covered:
                print(f"\n  CR-{cr.cr_id} (PO-{cr.cr_id}): status='{cr.status}' — {len(uncovered)} UNCOVERED materials:")
                for mat_name in uncovered:
                    print(f"    - {mat_name}")
                print(f"  PO children: {len(po_children)}")
                for pc in po_children:
                    print(f"    - {pc.get_formatted_id()}: status={pc.status}, routing={pc.routing_type}")

                # Reset to sent_to_store so buyer can continue vendor selection
                old_status = cr.status
                cr.status = 'sent_to_store'
                cr.store_request_status = 'pending_store_approval'
                fixed.append((cr.cr_id, old_status))
                print(f"  >> FIXED: {old_status} → sent_to_store")

        if fixed:
            db.session.commit()
            print(f"\nFixed {len(fixed)} CR(s):")
            for cr_id, old_status in fixed:
                print(f"  CR-{cr_id}: {old_status} → sent_to_store")
        else:
            print("\nNo affected CRs found — all completed CRs have full material coverage.")


def rollback():
    """If needed, revert the changes (run with --rollback)"""
    print("Rollback: Manual DB update needed. Set affected CRs back to 'purchase_completed'.")


if __name__ == '__main__':
    if '--rollback' in sys.argv:
        rollback()
    else:
        find_and_fix()
