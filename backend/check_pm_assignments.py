"""
Diagnostic script to check pm_assign_ss table data
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from models.pm_assign_ss import PMAssignSS
from models.user import User

app = create_app()

with app.app_context():
    print("\n=== PM Assignment Data ===\n")

    # Get all PM assignments
    assignments = PMAssignSS.query.filter(
        PMAssignSS.is_deleted == False
    ).all()

    print(f"Total PM assignments found: {len(assignments)}\n")

    for assignment in assignments:
        print(f"Assignment ID: {assignment.pm_assign_id}")
        print(f"  Project ID: {assignment.project_id}")
        print(f"  PM ID: {assignment.pm_ids} (type: {type(assignment.pm_ids)})")
        print(f"  SS IDs: {assignment.ss_ids}")
        print(f"  Is Deleted: {assignment.is_deleted}")

        # Try to find the PM user
        if assignment.pm_ids:
            pm_user = User.query.filter(User.user_id == assignment.pm_ids).first()
            if pm_user:
                print(f"  PM User: {pm_user.name} ({pm_user.email}) - Role: {pm_user.role}")
            else:
                print(f"  PM User: NOT FOUND")
        print()

    # Also check all users with PM role
    print("\n=== Users with PM Role ===\n")
    pm_users = User.query.filter(
        User.role.ilike('%project%manager%'),
        User.is_deleted == False
    ).all()

    print(f"Total PM users found: {len(pm_users)}\n")

    for user in pm_users:
        print(f"User ID: {user.user_id} (type: {type(user.user_id)})")
        print(f"  Name: {user.name}")
        print(f"  Email: {user.email}")
        print(f"  Role: {user.role}")

        # Check if they have assignments
        user_assignments = PMAssignSS.query.filter(
            PMAssignSS.pm_ids == user.user_id,
            PMAssignSS.is_deleted == False
        ).all()
        print(f"  Assignments: {len(user_assignments)}")
        if user_assignments:
            for a in user_assignments:
                print(f"    - Project ID: {a.project_id}")
        print()
