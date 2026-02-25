"""
Migration: Fix "Multiple Skills" labour_role values
Updates attendance records that have "Multiple Skills" as labour_role
to use the actual labour role from requisitions
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


def fix_multiple_skills():
    """
    Fix attendance records with "Multiple Skills" labour_role
    """
    with app.app_context():
        try:
            print("Starting fix for 'Multiple Skills' labour_role...")

            # Get all attendance records with "Multiple Skills"
            attendance_records = DailyAttendance.query.filter(
                DailyAttendance.labour_role == 'Multiple Skills',
                DailyAttendance.is_deleted == False
            ).all()

            print(f"Found {len(attendance_records)} attendance records with 'Multiple Skills'")

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

                # Strategy 2: Check requisition's labour_items
                if not determined_role and attendance.requisition_id:
                    requisition = LabourRequisition.query.get(attendance.requisition_id)
                    if requisition:
                        # Try new JSONB labour_items first
                        if requisition.labour_items and isinstance(requisition.labour_items, list):
                            if len(requisition.labour_items) > 0:
                                # For single labour item, use it
                                if len(requisition.labour_items) == 1:
                                    first_item = requisition.labour_items[0]
                                    determined_role = first_item.get('skill_required') or first_item.get('work_description')
                                    source = "requisition.labour_items[0] (single)"
                                else:
                                    # For multiple labour items, try to match worker's skill
                                    worker = Worker.query.get(attendance.worker_id)
                                    if worker and worker.skills:
                                        for item in requisition.labour_items:
                                            item_skill = item.get('skill_required') or item.get('work_description')
                                            if item_skill:
                                                for worker_skill in worker.skills:
                                                    if worker_skill.lower().strip() == item_skill.lower().strip():
                                                        determined_role = item_skill
                                                        source = "matched worker skill to labour_items"
                                                        break
                                            if determined_role:
                                                break

                                    # If no match, use first labour item as fallback
                                    if not determined_role:
                                        first_item = requisition.labour_items[0]
                                        determined_role = first_item.get('skill_required') or first_item.get('work_description')
                                        source = "requisition.labour_items[0] (fallback)"
                        # Fallback to deprecated field
                        elif requisition.skill_required:
                            determined_role = requisition.skill_required
                            source = "requisition.skill_required"

                # Strategy 3: Check worker's primary skill
                if not determined_role:
                    worker = Worker.query.get(attendance.worker_id)
                    if worker and worker.skills and len(worker.skills) > 0:
                        determined_role = worker.skills[0]
                        source = "worker.skills[0]"

                # Apply the determined role
                if determined_role and determined_role != 'Multiple Skills':
                    # Sanitize the role
                    determined_role = str(determined_role).strip()[:100]
                    attendance.labour_role = determined_role
                    updated_count += 1

                    print(f"  ✓ Updated attendance_id={attendance.attendance_id}: "
                          f"'{attendance.labour_role}' → '{determined_role}' (source: {source})")
                else:
                    skipped_count += 1
                    print(f"  ⚠ Could not determine specific role for attendance_id={attendance.attendance_id} "
                          f"(keeping 'Multiple Skills')")

            # Commit all changes
            db.session.commit()

            print("\n" + "="*60)
            print(f"✓ Fix completed successfully!")
            print(f"  - Updated: {updated_count} records")
            print(f"  - Skipped: {skipped_count} records")
            print(f"  - Total processed: {len(attendance_records)} records")
            print("="*60)

            # Show updated distribution
            result = db.session.execute(text('''
                SELECT labour_role, COUNT(*) as count
                FROM daily_attendance
                WHERE is_deleted = false
                GROUP BY labour_role
                ORDER BY count DESC
            ''')).fetchall()

            print("\n📊 Updated Labour Role Distribution:")
            print("="*60)
            for row in result:
                role = row[0] if row[0] else '(NULL)'
                print(f"  {role}: {row[1]} records")
            print("="*60)

            return True

        except Exception as e:
            db.session.rollback()
            print(f"\n✗ Fix failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    success = fix_multiple_skills()
    sys.exit(0 if success else 1)
