"""
Direct Notification Test Script
Tests the notification system step by step to find the exact issue
"""

import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from flask import Flask
from config.db import db

# Create a minimal Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "test-secret-key")
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("DATABASE_URL")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

def test_notification_system():
    """Test the notification system step by step"""

    with app.app_context():
        print("\n" + "="*60)
        print("NOTIFICATION SYSTEM TEST")
        print("="*60)

        # Test 1: Check if Notification model works
        print("\n[TEST 1] Importing Notification model...")
        try:
            from models.notification import Notification
            print("  OK - Notification model imported")
        except Exception as e:
            print(f"  FAILED - {e}")
            return

        # Test 2: Check if NotificationManager works
        print("\n[TEST 2] Importing NotificationManager...")
        try:
            from utils.notification_utils import NotificationManager
            print("  OK - NotificationManager imported")
        except Exception as e:
            print(f"  FAILED - {e}")
            return

        # Test 3: Check if notification_service works
        print("\n[TEST 3] Importing notification_service...")
        try:
            from utils.comprehensive_notification_service import notification_service
            print("  OK - notification_service imported")
        except Exception as e:
            print(f"  FAILED - {e}")
            return

        # Test 4: Check if socketio_server works
        print("\n[TEST 4] Importing socketio_server...")
        try:
            from socketio_server import send_notification_to_user
            print("  OK - send_notification_to_user imported")
        except Exception as e:
            print(f"  FAILED - {e}")
            return

        # Test 5: Create a test notification in DB
        print("\n[TEST 5] Creating test notification in database...")
        try:
            # Find a user to send notification to
            from models.user import User
            test_user = User.query.first()

            if not test_user:
                print("  FAILED - No users found in database")
                return

            print(f"  Found test user: {test_user.full_name} (ID: {test_user.user_id})")

            notification = NotificationManager.create_notification(
                user_id=test_user.user_id,
                type='info',
                title='Test Notification',
                message='This is a test notification from the test script',
                priority='medium',
                category='test',
                sender_id=test_user.user_id,
                sender_name='Test Script'
            )

            print(f"  OK - Notification created with ID: {notification.id}")
            print(f"       Title: {notification.title}")
            print(f"       User ID: {notification.user_id}")

        except Exception as e:
            print(f"  FAILED - {e}")
            import traceback
            traceback.print_exc()
            return

        # Test 6: Check if notification exists in DB
        print("\n[TEST 6] Verifying notification in database...")
        try:
            found = Notification.query.filter_by(id=notification.id).first()
            if found:
                print(f"  OK - Notification found in database")
                print(f"       ID: {found.id}")
                print(f"       Title: {found.title}")
                print(f"       User ID: {found.user_id}")
            else:
                print("  FAILED - Notification not found in database")
                return
        except Exception as e:
            print(f"  FAILED - {e}")
            return

        # Test 7: Check all notifications for user
        print("\n[TEST 7] Checking all notifications in database...")
        try:
            all_notifications = Notification.query.all()
            print(f"  Total notifications in DB: {len(all_notifications)}")

            for n in all_notifications[-5:]:  # Show last 5
                print(f"    - [{n.created_at}] {n.title} (user_id: {n.user_id}, type: {n.type})")

        except Exception as e:
            print(f"  FAILED - {e}")

        # Test 8: Test notify_boq_sent_to_td function
        print("\n[TEST 8] Testing notify_boq_sent_to_td...")
        try:
            # Get TD user
            from models.role import Role
            td_role = Role.query.filter_by(role_name='Technical Director').first()

            if td_role:
                td_user = User.query.filter_by(role_id=td_role.role_id).first()
                if td_user:
                    print(f"  Found TD: {td_user.full_name} (ID: {td_user.user_id})")

                    # Test creating notification for TD
                    notification_service.notify_boq_sent_to_td(
                        boq_id=999,
                        project_name="Test Project",
                        estimator_id=1,
                        estimator_name="Test Estimator",
                        td_user_id=td_user.user_id
                    )
                    print("  OK - notify_boq_sent_to_td called successfully")

                    # Verify notification was created
                    td_notif = Notification.query.filter_by(
                        user_id=td_user.user_id,
                        category='boq'
                    ).order_by(Notification.created_at.desc()).first()

                    if td_notif:
                        print(f"  OK - Notification created for TD:")
                        print(f"       ID: {td_notif.id}")
                        print(f"       Title: {td_notif.title}")
                    else:
                        print("  WARNING - Notification not found for TD")
                else:
                    print("  WARNING - No TD user found")
            else:
                print("  WARNING - Technical Director role not found")

        except Exception as e:
            print(f"  FAILED - {e}")
            import traceback
            traceback.print_exc()

        print("\n" + "="*60)
        print("TEST COMPLETE")
        print("="*60 + "\n")

if __name__ == "__main__":
    test_notification_system()
