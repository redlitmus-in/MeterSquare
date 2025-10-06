"""
Fix email_sent flag for existing BOQs
This script corrects BOQs where email_sent=True but status is still 'Pending' or 'Approved'
According to new workflow:
- email_sent should be FALSE when sent to TD (status=Pending)
- email_sent should be TRUE only when sent to CLIENT (by estimator after TD approval)
"""

from app import create_app
from config.db import db
from models.boq import BOQ

def fix_email_sent_flags():
    app = create_app()
    with app.app_context():
        # Find all BOQs where email_sent=True but status is NOT 'approved' with confirmed client send
        # These are BOQs that were "sent to TD" (old workflow) but incorrectly marked as email_sent=True

        boqs_to_fix = BOQ.query.filter(
            BOQ.email_sent == True,
            BOQ.status.in_(['Pending', 'pending', 'Draft', 'draft'])
        ).all()

        print(f"Found {len(boqs_to_fix)} BOQs to fix")

        for boq in boqs_to_fix:
            print(f"Fixing BOQ {boq.boq_id} - {boq.boq_name} (Status: {boq.status})")
            boq.email_sent = False

        db.session.commit()
        print("[SUCCESS] All BOQs fixed successfully!")

        # Show summary
        print("\n=== Summary ===")
        pending_count = BOQ.query.filter(BOQ.status.in_(['Pending', 'pending']), BOQ.email_sent == False).count()
        approved_count = BOQ.query.filter(BOQ.status.in_(['Approved', 'approved']), BOQ.email_sent == False).count()
        sent_count = BOQ.query.filter(BOQ.status.in_(['Approved', 'approved']), BOQ.email_sent == True).count()

        print(f"Pending (not sent to client): {pending_count}")
        print(f"Approved (not sent to client): {approved_count}")
        print(f"Approved (sent to client): {sent_count}")

if __name__ == "__main__":
    fix_email_sent_flags()
