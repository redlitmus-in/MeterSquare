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
                for mat_name in uncovered:
                    pass
                for pc in po_children:
                    pass

                # Reset to sent_to_store so buyer can continue vendor selection
                old_status = cr.status
                cr.status = 'sent_to_store'
                cr.store_request_status = 'pending_store_approval'
                fixed.append((cr.cr_id, old_status))

        if fixed:
            db.session.commit()
            for cr_id, old_status in fixed:
                pass
        else:
            pass


def rollback():
    """If needed, revert the changes (run with --rollback)"""


if __name__ == '__main__':
    if '--rollback' in sys.argv:
        rollback()
    else:
        find_and_fix()
