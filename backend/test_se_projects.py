#!/usr/bin/env python3
"""
Test script to verify Site Engineer project fetching via PMAssignSS
"""
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.db import db
from models.user import User
from models.role import Role
from models.project import Project
from models.boq import BOQ
from models.pm_assign_ss import PMAssignSS
from flask import Flask
from sqlalchemy import distinct

# Create minimal Flask app for database context
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

def test_se_projects():
    """Test fetching Site Engineer projects via PMAssignSS"""

    with app.app_context():
        print("=" * 80)
        print("TESTING SITE ENGINEER PROJECT FETCHING VIA PMAssignSS")
        print("=" * 80)

        # Get Site Engineer role
        se_role = Role.query.filter_by(role='siteEngineer', is_deleted=False).first()

        if not se_role:
            print("❌ Site Engineer role 'siteEngineer' not found!")
            return

        print(f"\n✅ Found Site Engineer role (role_id={se_role.role_id})")

        # Get all Site Engineers
        site_engineers = User.query.filter_by(
            role_id=se_role.role_id,
            is_deleted=False,
            is_active=True
        ).all()

        print(f"✅ Found {len(site_engineers)} Site Engineers")

        for se in site_engineers:
            print(f"\n{'=' * 80}")
            print(f"Site Engineer: {se.full_name} (ID: {se.user_id})")
            print(f"Email: {se.email}")
            print(f"Phone: {se.phone}")
            print(f"{'=' * 80}")

            # Method 1: Count projects via PMAssignSS (NEW - CORRECT METHOD)
            project_count_pmassign = (
                db.session.query(Project.project_id)
                .join(BOQ, Project.project_id == BOQ.project_id)
                .join(PMAssignSS, BOQ.boq_id == PMAssignSS.boq_id)
                .filter(
                    PMAssignSS.assigned_to_se_id == se.user_id,
                    PMAssignSS.is_deleted == False,
                    Project.is_deleted == False
                )
                .distinct()
                .count()
            )

            print(f"\n📊 VIA PMAssignSS (CORRECT): {project_count_pmassign} projects")

            # Get detailed project list via PMAssignSS
            if project_count_pmassign > 0:
                projects_pmassign = (
                    db.session.query(
                        Project.project_id,
                        Project.project_name,
                        Project.project_code,
                        Project.location
                    )
                    .join(BOQ, Project.project_id == BOQ.project_id)
                    .join(PMAssignSS, BOQ.boq_id == PMAssignSS.boq_id)
                    .filter(
                        PMAssignSS.assigned_to_se_id == se.user_id,
                        PMAssignSS.is_deleted == False,
                        Project.is_deleted == False
                    )
                    .distinct()
                    .all()
                )

                print("   Projects assigned via PMAssignSS:")
                for idx, proj in enumerate(projects_pmassign, 1):
                    print(f"   {idx}. {proj.project_name} (ID: {proj.project_id}, Code: {proj.project_code or 'N/A'})")
                    print(f"      Location: {proj.location or 'N/A'}")

            # Method 2: Old method via site_supervisor_id (for comparison)
            project_count_old = Project.query.filter_by(
                site_supervisor_id=se.user_id,
                is_deleted=False
            ).count()

            print(f"\n📊 VIA site_supervisor_id (OLD): {project_count_old} projects")

            if project_count_old > 0:
                projects_old = Project.query.filter_by(
                    site_supervisor_id=se.user_id,
                    is_deleted=False
                ).all()

                print("   Projects assigned via site_supervisor_id:")
                for idx, proj in enumerate(projects_old, 1):
                    print(f"   {idx}. {proj.project_name} (ID: {proj.project_id})")

            print()

        print("\n" + "=" * 80)
        print("TEST COMPLETE")
        print("=" * 80)

if __name__ == "__main__":
    test_se_projects()
