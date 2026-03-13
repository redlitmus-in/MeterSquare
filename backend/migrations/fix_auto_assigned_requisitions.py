"""
Migration: Fix Auto-Assigned Requisitions
Purpose: Reset assignment_status for requisitions that were auto-assigned during PM approval
         This allows Production Manager to properly assign workers to these requisitions.

Background:
- Previously, when PM approved a requisition with preferred_worker_ids, workers were auto-assigned
- This bypassed the Production Manager assignment step
- This migration resets those auto-assignments so Production Manager can review and assign

Run this ONCE after deploying the removal of auto-assignment logic.

Usage: python3 migrations/fix_auto_assigned_requisitions.py
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
    Reset auto-assigned requisitions to unassigned status using raw SQL.
    """


    # Create database connection
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Find auto-assigned requisitions
        query = text("""
            SELECT
                requisition_id,
                requisition_code,
                approved_by_name,
                required_date,
                preferred_worker_ids,
                assigned_worker_ids
            FROM labour_requisitions
            WHERE status = 'approved'
              AND assignment_status = 'assigned'
              AND preferred_worker_ids IS NOT NULL
              AND preferred_worker_ids != '[]'::jsonb
              AND approved_by_user_id = assigned_by_user_id
              AND is_deleted = false
        """)

        result = session.execute(query)
        auto_assigned_reqs = result.fetchall()

        if not auto_assigned_reqs:
            session.close()
            return


        for req in auto_assigned_reqs:
            pass

        # Ask for confirmation
        confirm = input("Reset these requisitions to 'unassigned' status? (yes/no): ").strip().lower()

        if confirm != 'yes':
            session.close()
            return


        for req in auto_assigned_reqs:
            # Soft delete auto-created arrival records
            delete_arrivals = text("""
                UPDATE labour_arrivals
                SET is_deleted = true
                WHERE requisition_id = :req_id
                  AND arrival_status = 'assigned'
                  AND is_deleted = false
            """)
            session.execute(delete_arrivals, {"req_id": req.requisition_id})

            # Reset assignment fields
            reset_assignment = text("""
                UPDATE labour_requisitions
                SET assignment_status = 'unassigned',
                    assigned_worker_ids = NULL,
                    assigned_by_user_id = NULL,
                    assigned_by_name = NULL,
                    assignment_date = NULL
                WHERE requisition_id = :req_id
            """)
            session.execute(reset_assignment, {"req_id": req.requisition_id})


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
