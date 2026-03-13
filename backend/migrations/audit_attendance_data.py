"""
Audit attendance data thoroughly
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config.db import db
from sqlalchemy import text

app = create_app()


def audit_attendance():
    """Comprehensive audit of attendance data"""
    with app.app_context():

        # 1. Overall statistics
        result = db.session.execute(text("""
            SELECT
                COUNT(*) as total_records,
                COUNT(CASE WHEN labour_role IS NOT NULL THEN 1 END) as with_role,
                COUNT(CASE WHEN labour_role IS NULL THEN 1 END) as without_role,
                COUNT(CASE WHEN is_deleted = true THEN 1 END) as deleted,
                COUNT(CASE WHEN approval_status = 'locked' THEN 1 END) as locked,
                COUNT(CASE WHEN approval_status = 'pending' THEN 1 END) as pending
            FROM daily_attendance
        """)).fetchone()


        # 2. Labour role distribution
        result = db.session.execute(text("""
            SELECT
                COALESCE(labour_role, '(NULL)') as role,
                COUNT(*) as count,
                SUM(total_hours) as total_hours,
                SUM(total_cost) as total_cost,
                COUNT(DISTINCT project_id) as projects,
                COUNT(DISTINCT worker_id) as workers
            FROM daily_attendance
            WHERE is_deleted = false
            GROUP BY labour_role
            ORDER BY count DESC
        """)).fetchall()

        for row in result:
            role = str(row[0])[:28]

        # 3. Records without labour_role (if any)
        result = db.session.execute(text("""
            SELECT COUNT(*) FROM daily_attendance WHERE labour_role IS NULL AND is_deleted = false
        """)).fetchone()

        if result[0] > 0:

            # Show details
            details = db.session.execute(text("""
                SELECT
                    da.attendance_id,
                    w.full_name as worker_name,
                    p.project_name,
                    da.attendance_date,
                    da.requisition_id
                FROM daily_attendance da
                LEFT JOIN workers w ON da.worker_id = w.worker_id
                LEFT JOIN project p ON da.project_id = p.project_id
                WHERE da.labour_role IS NULL AND da.is_deleted = false
                ORDER BY da.attendance_date DESC
                LIMIT 10
            """)).fetchall()

            for row in details:
                pass
        else:
            pass

        # 4. Project-wise breakdown
        result = db.session.execute(text("""
            SELECT
                p.project_id,
                p.project_name,
                COUNT(da.attendance_id) as total_attendance,
                COUNT(DISTINCT da.labour_role) as unique_roles,
                SUM(da.total_hours) as total_hours,
                SUM(da.total_cost) as total_cost
            FROM daily_attendance da
            JOIN project p ON da.project_id = p.project_id
            WHERE da.is_deleted = false
            GROUP BY p.project_id, p.project_name
            ORDER BY total_attendance DESC
        """)).fetchall()

        for row in result:
            project_name = str(row[1])[:38]

        # 5. Detailed role breakdown per project
        result = db.session.execute(text("""
            SELECT
                p.project_name,
                da.labour_role,
                COUNT(*) as count,
                SUM(da.total_hours) as hours,
                SUM(da.total_cost) as cost
            FROM daily_attendance da
            JOIN project p ON da.project_id = p.project_id
            WHERE da.is_deleted = false AND da.labour_role IS NOT NULL
            GROUP BY p.project_name, da.labour_role
            ORDER BY p.project_name, count DESC
        """)).fetchall()

        current_project = None
        for row in result:
            if current_project != row[0]:
                current_project = row[0]
            role = str(row[1])[:28]

        # 6. Check requisition linkage
        result = db.session.execute(text("""
            SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN requisition_id IS NOT NULL THEN 1 END) as with_req,
                COUNT(CASE WHEN requisition_id IS NULL THEN 1 END) as without_req
            FROM daily_attendance
            WHERE is_deleted = false
        """)).fetchone()

        total = result[0]
        with_req = result[1]
        without_req = result[2]




if __name__ == "__main__":
    audit_attendance()
