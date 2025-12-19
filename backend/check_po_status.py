import os
from dotenv import load_dotenv
load_dotenv()

from app import create_app, db
from models.po_child import POChild

app = create_app()
with app.app_context():
    # Check PO children with suffix .1, .2, .3
    po_children = POChild.query.filter(
        POChild.suffix.in_(['.1', '.2', '.3']),
        POChild.is_deleted == False
    ).order_by(POChild.id.desc()).limit(10).all()
    
    print("\n=== POChild Status Check ===")
    for po in po_children:
        print(f"\nPO-{po.parent_cr_id}{po.suffix}:")
        print(f"  - vendor_selection_status: {po.vendor_selection_status}")
        print(f"  - status: {po.status}")
        print(f"  - vendor_name: {po.vendor_name}")
        print(f"  - created_at: {po.created_at}")
        print(f"  - updated_at: {po.updated_at}")
