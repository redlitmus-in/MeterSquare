"""
Quick script to check BOQ count and data size
"""
from config.db import db
from models.boq import BOQ, BOQDetails
from app import create_app

def check_boq_stats():
    """Check BOQ statistics"""
    app = create_app()

    with app.app_context():
        # Count total BOQs
        total_boqs = BOQ.query.filter_by(is_deleted=False).count()
        deleted_boqs = BOQ.query.filter_by(is_deleted=True).count()

        # Get BOQ details size info
        boq_details = BOQDetails.query.all()

        print("="*60)
        print("BOQ DATABASE STATISTICS")
        print("="*60)
        print(f"\nTotal Active BOQs: {total_boqs}")
        print(f"Deleted BOQs: {deleted_boqs}")
        print(f"Total BOQ Details Records: {len(boq_details)}")

        # Check largest BOQs by items
        largest_boqs = db.session.query(BOQ, BOQDetails).join(
            BOQDetails, BOQ.boq_id == BOQDetails.boq_id
        ).filter(
            BOQ.is_deleted == False
        ).order_by(BOQDetails.total_items.desc()).limit(5).all()

        print("\n" + "="*60)
        print("TOP 5 LARGEST BOQs (by item count)")
        print("="*60)
        for boq, details in largest_boqs:
            print(f"\nBOQ ID: {boq.boq_id} - {boq.boq_name}")
            print(f"  Items: {details.total_items}")
            print(f"  Materials: {details.total_materials}")
            print(f"  Labour: {details.total_labour}")
            print(f"  Created: {boq.created_at}")

        print("\n" + "="*60)
        print("RECOMMENDATIONS")
        print("="*60)

        if total_boqs < 50:
            print("✅ BOQ count is healthy (<50)")
            print("✅ 30s timeout should be fine")
            print("✅ No cleanup needed")
        elif total_boqs < 200:
            print("⚠️  Moderate BOQ count (50-200)")
            print("✅ 60s timeout recommended for safety")
            print("💡 Consider archiving old/rejected BOQs")
        else:
            print("⚠️  High BOQ count (200+)")
            print("✅ 60s timeout strongly recommended")
            print("💡 Consider implementing pagination")
            print("💡 Archive BOQs older than 6-12 months")

        print("\n" + "="*60)
        print("DATA CLEANUP OPTIONS")
        print("="*60)
        print("\n1. SOFT DELETE old rejected BOQs:")
        print("   - Marks is_deleted=True (keeps data)")
        print("   - Can be restored if needed")
        print("\n2. ARCHIVE old BOQs:")
        print("   - Move BOQs older than X months to archive table")
        print("   - Keeps database lean")
        print("\n3. PAGINATION:")
        print("   - Load 50 BOQs at a time")
        print("   - Better for 200+ BOQs")

if __name__ == "__main__":
    check_boq_stats()
