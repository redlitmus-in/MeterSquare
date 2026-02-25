"""
Migration: Backfill labour_role for existing attendance records
This assigns labour roles to attendance records that don't have them yet
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db
from models.daily_attendance import DailyAttendance
from models.worker_assignment import WorkerAssignment
from models.labour_requisition import LabourRequisition
from models.worker import Worker
from sqlalchemy import text

app = create_app()


def backfill_labour_roles():
    """
    Backfill labour_role for existing attendance records using:
    1. assignment.role_at_site if available
    2. worker.skills[0] if available
    3. requisition.skill_required from the project/date
    4. Default to worker_type as fallback
    """
    with app.app_context():
        try:
            print("Starting labour_role backfill for existing attendance records...")

            # Get all attendance records without labour_role
            attendance_records = DailyAttendance.query.filter(
                DailyAttendance.labour_role.is_(None),
                DailyAttendance.is_deleted == False
            ).all()

            print(f"Found {len(attendance_records)} attendance records without labour_role")

            updated_count = 0
            skipped_count = 0

            for attendance in attendance_records:
                determined_role = None
                source = "unknown"

                # Strategy 1: Check assignment's role_at_site
                if attendance.assignment_id:
                    assignment = WorkerAssignment.query.get(attendance.assignment_id)
                    if assignment and assignment.role_at_site:
                        determined_role = assignment.role_at_site
                        source = "assignment.role_at_site"

                # Strategy 2: Check worker's primary skill
                if not determined_role:
                    worker = Worker.query.get(attendance.worker_id)
                    if worker:
                        if worker.skills and len(worker.skills) > 0:
                            determined_role = worker.skills[0]
                            source = "worker.skills[0]"
                        elif worker.worker_type:
                            determined_role = worker.worker_type
                            source = "worker.worker_type"

                # Strategy 3: Find requisition for this project/date and use skill_required
                if not determined_role and attendance.requisition_id:
                    requisition = LabourRequisition.query.get(attendance.requisition_id)
                    if requisition:
                        # Try new JSONB labour_items first
                        if requisition.labour_items and isinstance(requisition.labour_items, list):
                            if len(requisition.labour_items) > 0:
                                first_item = requisition.labour_items[0]
                                determined_role = first_item.get('skill_required') or first_item.get('work_description')
                                source = "requisition.labour_items[0]"
                        # Fallback to deprecated field
                        elif requisition.skill_required:
                            determined_role = requisition.skill_required
                            source = "requisition.skill_required"

                # Strategy 4: Find ANY approved requisition for this project around this date
                if not determined_role:
                    nearby_req = LabourRequisition.query.filter(
                        LabourRequisition.project_id == attendance.project_id,
                        LabourRequisition.status == 'approved',
                        LabourRequisition.is_deleted == False
                    ).order_by(LabourRequisition.required_date.desc()).first()

                    if nearby_req:
                        # Try JSONB labour_items
                        if nearby_req.labour_items and isinstance(nearby_req.labour_items, list):
                            if len(nearby_req.labour_items) > 0:
                                first_item = nearby_req.labour_items[0]
                                determined_role = first_item.get('skill_required') or first_item.get('work_description')
                                source = "nearby_requisition.labour_items[0]"
                        # Fallback to deprecated field
                        elif nearby_req.skill_required:
                            determined_role = nearby_req.skill_required
                            source = "nearby_requisition.skill_required"

                # Apply the determined role
                if determined_role:
                    # Sanitize the role
                    determined_role = str(determined_role).strip()[:100]
                    attendance.labour_role = determined_role
                    updated_count += 1

                    if updated_count % 10 == 0:
                        print(f"  Updated {updated_count} records... (last: {source})")
                else:
                    skipped_count += 1
                    print(f"  ⚠ Could not determine role for attendance_id={attendance.attendance_id} "
                          f"(worker_id={attendance.worker_id}, project_id={attendance.project_id}, "
                          f"date={attendance.attendance_date})")

            # Commit all changes
            db.session.commit()

            print("\n" + "="*60)
            print(f"✓ Backfill completed successfully!")
            print(f"  - Updated: {updated_count} records")
            print(f"  - Skipped: {skipped_count} records (could not determine role)")
            print(f"  - Total processed: {len(attendance_records)} records")
            print("="*60)

            return True

        except Exception as e:
            db.session.rollback()
            print(f"\n✗ Backfill failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    success = backfill_labour_roles()
    sys.exit(0 if success else 1)
