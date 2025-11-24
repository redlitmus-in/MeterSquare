"""
Add this temporary test endpoint to app.py to verify notifications work
"""

# Add this to your app.py or create a test route:

from flask import Blueprint, jsonify
from utils.comprehensive_notification_service import notification_service

test_bp = Blueprint('test_notifications', __name__)

@test_bp.route('/api/test_notification/<int:user_id>', methods=['POST'])
def test_notification(user_id):
    """Test endpoint to manually trigger a notification"""
    try:
        # Create a test notification
        from utils.notification_utils import NotificationManager
        from socketio_server import send_notification_to_user

        notification = NotificationManager.create_notification(
            user_id=user_id,
            type='info',
            title='🔔 Test Notification',
            message='This is a test notification to verify the system is working!',
            priority='high',
            category='system',
            action_required=False
        )

        from config.db import db
        db.session.add(notification)
        db.session.commit()

        # Send via Socket.IO
        send_notification_to_user(user_id, notification.to_dict())

        return jsonify({
            "success": True,
            "message": f"Test notification sent to user {user_id}",
            "notification_id": notification.id
        }), 200

    except Exception as e:
        import traceback
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500

# Register in app.py:
# app.register_blueprint(test_bp)
