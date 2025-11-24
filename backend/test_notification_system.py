"""
Quick Diagnostic Script for Notification System
Run this to check if notifications are being created properly
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.db import db
from flask import Flask
from models.notification import Notification
from models.user import User
from models.role import Role

# Create Flask app
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

with app.app_context():
    print("=" * 60)
    print("NOTIFICATION SYSTEM DIAGNOSTIC")
    print("=" * 60)

    # Check notifications table
    notifications = Notification.query.all()
    print(f"\n✓ Total Notifications in Database: {len(notifications)}")

    if notifications:
        print("\nNotifications:")
        for notif in notifications:
            print(f"  - ID: {notif.id}")
            print(f"    User ID: {notif.user_id}")
            print(f"    Type: {notif.type}")
            print(f"    Title: {notif.title}")
            print(f"    Message: {notif.message[:50]}...")
            print(f"    Read: {notif.read}")
            print(f"    Created: {notif.created_at}")
            print()

    # Check users
    users = User.query.filter_by(is_deleted=False, is_active=True).all()
    print(f"✓ Active Users: {len(users)}")

    # Check roles
    print("\nUser Roles:")
    for user in users[:5]:  # Show first 5
        role = Role.query.filter_by(role_id=user.role_id).first()
        print(f"  - {user.full_name} (ID: {user.user_id}) - {role.role if role else 'No Role'}")

    # Find TD users
    td_role = Role.query.filter_by(role_name='Technical Director').first()
    if not td_role:
        td_role = Role.query.filter(Role.role.ilike('%technical%director%')).first()

    if td_role:
        td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
        print(f"\n✓ Technical Directors: {len(td_users)}")
        for td in td_users:
            print(f"  - {td.full_name} (ID: {td.user_id}, Email: {td.email})")
    else:
        print("\n✗ WARNING: No Technical Director role found!")

    print("\n" + "=" * 60)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 60)
