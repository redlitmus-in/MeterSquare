#!/usr/bin/env python3
"""
Script to thoroughly check labour-related database tables
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import json

# Database connection - Production DB (@ symbol in password must be URL-encoded as %40)
DATABASE_URL = "postgresql://postgres.wgddnoiakkoskbbkbygw:Rameshdev%2408@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()

print("=" * 80)
print("LABOUR DATABASE AUDIT")
print("=" * 80)

try:
    # 1. Check total labour requisitions
    print("\n1. LABOUR REQUISITIONS OVERVIEW")
    print("-" * 80)
    result = session.execute(text("""
        SELECT
            COUNT(*) as total_requisitions,
            COUNT(DISTINCT boq_id) as unique_boqs_with_labour,
            COUNT(CASE WHEN is_deleted = false THEN 1 END) as active_requisitions,
            COUNT(CASE WHEN is_deleted = true THEN 1 END) as deleted_requisitions
        FROM labour_requisitions;
    """)).fetchone()

    print(f"Total Requisitions: {result[0]}")
    print(f"Unique BOQs with Labour: {result[1]}")
    print(f"Active Requisitions: {result[2]}")
    print(f"Deleted Requisitions: {result[3]}")

    # 2. Check which BOQs have labour requisitions
    print("\n2. TOP 10 BOQs WITH LABOUR REQUISITIONS")
    print("-" * 80)
    results = session.execute(text("""
        SELECT
            lr.boq_id,
            b.boq_name,
            b.project_id,
            COUNT(*) as requisition_count,
            COUNT(DISTINCT lr.skill_required) as unique_skills,
            MAX(lr.request_date) as latest_request
        FROM labour_requisitions lr
        LEFT JOIN boq b ON lr.boq_id = b.boq_id
        WHERE lr.is_deleted = false
        GROUP BY lr.boq_id, b.boq_name, b.project_id
        ORDER BY requisition_count DESC
        LIMIT 10;
    """)).fetchall()

    if results:
        for row in results:
            print(f"\nBOQ ID: {row[0]}")
            print(f"  BOQ Name: {row[1]}")
            print(f"  Project ID: {row[2]}")
            print(f"  Requisitions: {row[3]}")
            print(f"  Unique Skills: {row[4]}")
            print(f"  Latest Request: {row[5]}")
    else:
        print("No active labour requisitions found!")

    # 3. Check BOQ 843 specifically
    print("\n3. BOQ 843 DETAILS")
    print("-" * 80)
    boq_843 = session.execute(text("""
        SELECT
            boq_id,
            boq_name,
            project_id,
            created_at,
            is_deleted
        FROM boq
        WHERE boq_id = 843;
    """)).fetchone()

    if boq_843:
        print(f"BOQ ID: {boq_843[0]}")
        print(f"BOQ Name: {boq_843[1]}")
        print(f"Project ID: {boq_843[2]}")
        print(f"Created At: {boq_843[3]}")
        print(f"Is Deleted: {boq_843[4]}")
    else:
        print("BOQ 843 not found in database!")

    # 4. Check if any requisitions reference BOQ 843 (including JSONB)
    print("\n4. CHECKING FOR BOQ 843 REFERENCES")
    print("-" * 80)

    # Check deprecated boq_id column
    req_count_old = session.execute(text("""
        SELECT COUNT(*) FROM labour_requisitions
        WHERE boq_id = 843 AND is_deleted = false;
    """)).scalar()
    print(f"Requisitions with boq_id = 843 (old column): {req_count_old}")

    # Check labour_items JSONB
    req_jsonb = session.execute(text("""
        SELECT COUNT(*) FROM labour_requisitions
        WHERE labour_items @> '[{"boq_id": 843}]'::jsonb
          AND is_deleted = false;
    """)).scalar()
    print(f"Requisitions with BOQ 843 in labour_items JSONB: {req_jsonb}")

    # 5. Check labour_items structure
    print("\n5. LABOUR_ITEMS JSONB STRUCTURE (Sample)")
    print("-" * 80)
    sample_jsonb = session.execute(text("""
        SELECT
            requisition_id,
            boq_id,
            labour_items,
            skill_required
        FROM labour_requisitions
        WHERE is_deleted = false
          AND labour_items IS NOT NULL
        LIMIT 3;
    """)).fetchall()

    if sample_jsonb:
        for row in sample_jsonb:
            print(f"\nRequisition ID: {row[0]}")
            print(f"  BOQ ID (old): {row[1]}")
            print(f"  Skill: {row[3]}")
            print(f"  Labour Items JSONB: {json.dumps(row[2], indent=2)}")
    else:
        print("No requisitions with labour_items JSONB found")

    # 6. Check worker assignments and attendance
    print("\n6. BOQs WITH LOCKED ATTENDANCE DATA")
    print("-" * 80)
    locked_data = session.execute(text("""
        SELECT
            lr.boq_id,
            b.boq_name,
            COUNT(DISTINCT lr.requisition_id) as total_requisitions,
            COUNT(DISTINCT wa.assignment_id) as total_assignments,
            COUNT(DISTINCT da.attendance_id) as total_attendance,
            COUNT(CASE WHEN da.approval_status = 'locked' THEN 1 END) as locked_attendance,
            SUM(CASE WHEN da.approval_status = 'locked' THEN da.total_hours ELSE 0 END) as total_locked_hours,
            SUM(CASE WHEN da.approval_status = 'locked' THEN da.total_cost ELSE 0 END) as total_locked_cost
        FROM labour_requisitions lr
        LEFT JOIN boq b ON lr.boq_id = b.boq_id
        LEFT JOIN worker_assignments wa ON lr.requisition_id = wa.requisition_id AND wa.is_deleted = false
        LEFT JOIN daily_attendance da ON wa.assignment_id = da.assignment_id AND da.is_deleted = false
        WHERE lr.is_deleted = false
        GROUP BY lr.boq_id, b.boq_name
        HAVING COUNT(CASE WHEN da.approval_status = 'locked' THEN 1 END) > 0
        ORDER BY locked_attendance DESC
        LIMIT 10;
    """)).fetchall()

    if locked_data:
        for row in locked_data:
            print(f"\nBOQ ID: {row[0]}")
            print(f"  BOQ Name: {row[1]}")
            print(f"  Requisitions: {row[2]}")
            print(f"  Assignments: {row[3]}")
            print(f"  Total Attendance: {row[4]}")
            print(f"  Locked Attendance: {row[5]}")
            print(f"  Total Locked Hours: {row[6]}")
            print(f"  Total Locked Cost: ${row[7]}")
    else:
        print("No BOQs with locked attendance found!")

    # 7. Check all BOQ IDs that exist
    print("\n7. ALL BOQ IDs IN SYSTEM (First 20)")
    print("-" * 80)
    all_boqs = session.execute(text("""
        SELECT boq_id, boq_name, project_id
        FROM boq
        WHERE is_deleted = false
        ORDER BY boq_id DESC
        LIMIT 20;
    """)).fetchall()

    for row in all_boqs:
        print(f"BOQ {row[0]}: {row[1]} (Project {row[2]})")

    # 8. Check if there are ANY labour requisitions for Project 592
    print("\n8. LABOUR REQUISITIONS FOR PROJECT 592")
    print("-" * 80)
    project_592_reqs = session.execute(text("""
        SELECT
            lr.requisition_id,
            lr.boq_id,
            lr.skill_required,
            lr.request_date,
            b.boq_name
        FROM labour_requisitions lr
        LEFT JOIN boq b ON lr.boq_id = b.boq_id
        WHERE b.project_id = 592
          AND lr.is_deleted = false
        ORDER BY lr.request_date DESC;
    """)).fetchall()

    if project_592_reqs:
        print(f"Found {len(project_592_reqs)} requisitions for Project 592:")
        for row in project_592_reqs:
            print(f"\n  Requisition ID: {row[0]}")
            print(f"  BOQ ID: {row[1]}")
            print(f"  BOQ Name: {row[4]}")
            print(f"  Skill: {row[2]}")
            print(f"  Request Date: {row[3]}")
    else:
        print("No labour requisitions found for Project 592!")

except Exception as e:
    print(f"\nERROR: {str(e)}")
    import traceback
    traceback.print_exc()
finally:
    session.close()

print("\n" + "=" * 80)
print("AUDIT COMPLETE")
print("=" * 80)
