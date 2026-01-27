"""
Migration: Fix Assignment Status Issues
Purpose: Fix requisitions with assignment_status='pending' to 'unassigned'
         so they appear in Production Manager's "Pending Assignment" queue

Background:
- Some requisitions were created with assignment_status='pending'
- Production Manager filter only looks for 'unassigned' or 'assigned'
- This causes approved requisitions to not appear in the assignment queue

Run this ONCE after deploying the reassignment fix.

Usage: python3 migrations/fix_assignment_status.py
"""

import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Get database URL from environment
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("\n❌ ERROR: DATABASE_URL environment variable not set")
    print("Please set it before running this migration:")
    print('export DATABASE_URL="postgresql://user:password@host:port/database"')
    exit(1)

def run_migration():
    """
    Fix assignment_status from 'pending' to 'unassigned' using raw SQL.
    """

    print("=" * 70)
    print("MIGRATION: Fix Assignment Status 'pending' → 'unassigned'")
    print("=" * 70)

    # Create database connection
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Find requisitions with assignment_status='pending'
        query = text("""
            SELECT
                requisition_id,
                requisition_code,
                status,
                assignment_status,
                approved_by_name,
                approval_date,
                required_date
            FROM labour_requisitions
            WHERE status = 'approved'
              AND assignment_status = 'pending'
              AND is_deleted = false
        """)

        result = session.execute(query)
        pending_reqs = result.fetchall()

        if not pending_reqs:
            print("\n✓ No requisitions with 'pending' assignment status found.")
            print("=" * 70)
            session.close()
            return

        print(f"\n📋 Found {len(pending_reqs)} requisition(s) with assignment_status='pending'")
        print("-" * 70)

        for req in pending_reqs:
            print(f"\n  Requisition: {req.requisition_code}")
            print(f"  Status: {req.status}")
            print(f"  Assignment Status: {req.assignment_status} → will change to 'unassigned'")
            print(f"  Required Date: {req.required_date}")
            if req.approved_by_name:
                print(f"  Approved By: {req.approved_by_name}")

        # Ask for confirmation
        print("\n" + "=" * 70)
        confirm = input("Update these requisitions to 'unassigned' status? (yes/no): ").strip().lower()

        if confirm != 'yes':
            print("\n❌ Migration cancelled by user.")
            print("=" * 70)
            session.close()
            return

        print("\n🔄 Processing requisitions...")
        print("-" * 70)

        # Update assignment_status from 'pending' to 'unassigned'
        update_query = text("""
            UPDATE labour_requisitions
            SET assignment_status = 'unassigned'
            WHERE status = 'approved'
              AND assignment_status = 'pending'
              AND is_deleted = false
        """)

        result = session.execute(update_query)
        updated_count = result.rowcount

        # Commit changes
        session.commit()

        print("\n" + "=" * 70)
        print("✅ MIGRATION COMPLETED SUCCESSFULLY")
        print("=" * 70)
        print(f"  Requisitions Updated: {updated_count}")
        print("\nNext Steps:")
        print("  1. These requisitions will now appear in Production Manager's queue")
        print("  2. Production Manager can assign workers to them")
        print("  3. Preferred workers (if any) are still available as suggestions")
        print("=" * 70)

        session.close()

    except Exception as e:
        session.rollback()
        session.close()
        print(f"\n❌ ERROR: {str(e)}")
        print("=" * 70)
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    run_migration()
