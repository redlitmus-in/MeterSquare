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
        print('\n' + '='*80)
        print('📋 COMPREHENSIVE ATTENDANCE DATABASE AUDIT')
        print('='*80)

        # 1. Overall statistics
        print('\n1️⃣  OVERALL STATISTICS:')
        print('-'*80)
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

        print(f'Total Records: {result[0]}')
        print(f'With Labour Role: {result[1]}')
        print(f'Without Labour Role: {result[2]}')
        print(f'Deleted: {result[3]}')
        print(f'Locked: {result[4]}')
        print(f'Pending: {result[5]}')

        # 2. Labour role distribution
        print('\n2️⃣  LABOUR ROLE DISTRIBUTION:')
        print('-'*80)
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

        print(f"{'Role':<30} {'Count':<8} {'Hours':<10} {'Cost':<12} {'Projects':<10} {'Workers':<10}")
        print('-'*80)
        for row in result:
            role = str(row[0])[:28]
            print(f'{role:<30} {row[1]:<8} {float(row[2] or 0):<10.2f} {float(row[3] or 0):<12.2f} {row[4]:<10} {row[5]:<10}')

        # 3. Records without labour_role (if any)
        print('\n3️⃣  RECORDS WITHOUT LABOUR_ROLE:')
        print('-'*80)
        result = db.session.execute(text("""
            SELECT COUNT(*) FROM daily_attendance WHERE labour_role IS NULL AND is_deleted = false
        """)).fetchone()

        if result[0] > 0:
            print(f'⚠️  Found {result[0]} records without labour_role')

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

            print(f"\n{'ID':<6} {'Worker':<20} {'Project':<20} {'Date':<12} {'Req ID':<8}")
            print('-'*80)
            for row in details:
                print(f"{row[0]:<6} {str(row[1])[:18]:<20} {str(row[2])[:18]:<20} {str(row[3]):<12} {row[4] or 'N/A':<8}")
        else:
            print('✓ All records have labour_role set!')

        # 4. Project-wise breakdown
        print('\n4️⃣  PROJECT-WISE BREAKDOWN:')
        print('-'*80)
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

        print(f"{'Project':<40} {'Attendance':<12} {'Roles':<10} {'Hours':<10} {'Cost':<12}")
        print('-'*80)
        for row in result:
            project_name = str(row[1])[:38]
            print(f'{project_name:<40} {row[2]:<12} {row[3]:<10} {float(row[4] or 0):<10.2f} {float(row[5] or 0):<12.2f}')

        # 5. Detailed role breakdown per project
        print('\n5️⃣  ROLE BREAKDOWN BY PROJECT:')
        print('-'*80)
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
                print(f'\n📁 {current_project}:')
                print(f"  {'Role':<30} {'Count':<8} {'Hours':<10} {'Cost':<12}")
                print('  ' + '-'*70)
            role = str(row[1])[:28]
            print(f'  {role:<30} {row[2]:<8} {float(row[3] or 0):<10.2f} {float(row[4] or 0):<12.2f}')

        # 6. Check requisition linkage
        print('\n6️⃣  REQUISITION LINKAGE:')
        print('-'*80)
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

        print(f'Total Active Records: {total}')
        print(f'With Requisition Link: {with_req} ({with_req*100//total if total > 0 else 0}%)')
        print(f'Without Requisition Link: {without_req} ({without_req*100//total if total > 0 else 0}%)')

        print('\n' + '='*80)
        print('✓ AUDIT COMPLETE')
        print('='*80)


if __name__ == "__main__":
    audit_attendance()
