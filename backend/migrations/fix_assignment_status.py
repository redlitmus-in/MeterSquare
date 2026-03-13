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
    exit(1)

def run_migration():
    """
    Fix assignment_status from 'pending' to 'unassigned' using raw SQL.
    """


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
            session.close()
            return


        for req in pending_reqs:
            if req.approved_by_name:
                pass

        # Ask for confirmation
        confirm = input("Update these requisitions to 'unassigned' status? (yes/no): ").strip().lower()

        if confirm != 'yes':
            session.close()
            return


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


        session.close()

    except Exception as e:
        session.rollback()
        session.close()
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    run_migration()
