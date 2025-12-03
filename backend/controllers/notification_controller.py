"""
Notification Controller
Handles all notification-related API endpoints
"""

from flask import Blueprint, jsonify, request
from functools import wraps
import jwt
from datetime import datetime
from sqlalchemy import and_
from models.notification import Notification
from config.db import db
from config.logging import get_logger
import os

log = get_logger()

notification_bp = Blueprint('notifications', __name__)

# JWT Secret Key
SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-here')

def token_required(f):
    """Decorator to require JWT token for protected routes"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Get token from Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(' ')[1]  # Bearer <token>
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401

        if not token:
            return jsonify({'error': 'Token is missing'}), 401

        try:
            # Decode token
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            current_user_id = data.get('user_id')
            current_user_role = data.get('role')

            if not current_user_id:
                return jsonify({'error': 'Invalid token'}), 401

        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401

        return f(current_user_id, current_user_role, *args, **kwargs)

    return decorated


@notification_bp.route('/notifications', methods=['GET'])
@token_required
def get_notifications(current_user_id, current_user_role):
    """
    Get all notifications for the current user
    Query params:
        - unread_only: boolean (default: false)
        - category: string (filter by category)
        - limit: integer (default: 100)
        - offset: integer (default: 0)
    """
    try:
        unread_only = request.args.get('unread_only', 'false').lower() == 'true'
        category = request.args.get('category')
        limit = min(int(request.args.get('limit', 100)), 500)  # Max 500
        offset = int(request.args.get('offset', 0))

        # Build query - only show notifications for this specific user
        query = Notification.query.filter(
            and_(
                Notification.user_id == current_user_id,
                Notification.deleted_at.is_(None)
            )
        )

        # Apply filters
        if unread_only:
            query = query.filter(Notification.read == False)

        if category:
            query = query.filter(Notification.category == category)

        # Order by created_at descending
        query = query.order_by(Notification.created_at.desc())

        # Get total count before pagination
        total_count = query.count()

        # Apply pagination
        notifications = query.limit(limit).offset(offset).all()

        # Get unread count - only for this specific user
        unread_count = Notification.query.filter(
            and_(
                Notification.user_id == current_user_id,
                Notification.read == False,
                Notification.deleted_at.is_(None)
            )
        ).count()

        return jsonify({
            'success': True,
            'notifications': [n.to_dict() for n in notifications],
            'total': total_count,
            'unread_count': unread_count,
            'limit': limit,
            'offset': offset
        }), 200

    except ValueError as e:
        return jsonify({'error': f'Invalid parameter: {str(e)}'}), 400
    except Exception as e:
        log.error(f"Error fetching notifications: {e}")
        return jsonify({'error': 'Failed to fetch notifications'}), 500


@notification_bp.route('/notifications/<notification_id>', methods=['GET'])
@token_required
def get_notification(current_user_id, current_user_role, notification_id):
    """Get a specific notification by ID"""
    try:
        notification = Notification.query.filter(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user_id,
                Notification.deleted_at.is_(None)
            )
        ).first()

        if not notification:
            return jsonify({'error': 'Notification not found'}), 404

        return jsonify({
            'success': True,
            'notification': notification.to_dict()
        }), 200

    except Exception as e:
        log.error(f"Error fetching notification: {e}")
        return jsonify({'error': 'Failed to fetch notification'}), 500


@notification_bp.route('/notifications/read', methods=['POST'])
@token_required
def mark_as_read(current_user_id, current_user_role):
    """
    Mark notification(s) as read
    Body: { "notification_ids": ["id1", "id2", ...] }
    """
    try:
        data = request.get_json()
        notification_ids = data.get('notification_ids', [])

        if not notification_ids:
            return jsonify({'error': 'notification_ids is required'}), 400

        # Update notifications - only for this specific user
        notifications = Notification.query.filter(
            and_(
                Notification.id.in_(notification_ids),
                Notification.user_id == current_user_id,
                Notification.deleted_at.is_(None)
            )
        ).all()

        for notification in notifications:
            notification.mark_as_read()

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Marked {len(notifications)} notification(s) as read',
            'updated_count': len(notifications)
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error marking notifications as read: {e}")
        return jsonify({'error': 'Failed to mark notifications as read'}), 500


@notification_bp.route('/notifications/read-all', methods=['POST'])
@token_required
def mark_all_as_read(current_user_id, current_user_role):
    """Mark all notifications as read for the current user"""
    try:
        # Update all unread notifications - only for this specific user
        notifications = Notification.query.filter(
            and_(
                Notification.user_id == current_user_id,
                Notification.read == False,
                Notification.deleted_at.is_(None)
            )
        ).all()

        for notification in notifications:
            notification.mark_as_read()

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Marked {len(notifications)} notification(s) as read',
            'updated_count': len(notifications)
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error marking all notifications as read: {e}")
        return jsonify({'error': 'Failed to mark all notifications as read'}), 500


@notification_bp.route('/notifications/<notification_id>', methods=['DELETE'])
@token_required
def delete_notification(current_user_id, current_user_role, notification_id):
    """Soft delete a notification"""
    try:
        notification = Notification.query.filter(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user_id,
                Notification.deleted_at.is_(None)
            )
        ).first()

        if not notification:
            return jsonify({'error': 'Notification not found'}), 404

        notification.mark_as_deleted()
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Notification deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting notification: {e}")
        return jsonify({'error': 'Failed to delete notification'}), 500


@notification_bp.route('/notifications/delete-all', methods=['POST'])
@token_required
def delete_all_notifications(current_user_id, current_user_role):
    """Soft delete all notifications for the current user"""
    try:
        notifications = Notification.query.filter(
            and_(
                Notification.user_id == current_user_id,
                Notification.deleted_at.is_(None)
            )
        ).all()

        for notification in notifications:
            notification.mark_as_deleted()

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Deleted {len(notifications)} notification(s)',
            'deleted_count': len(notifications)
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting all notifications: {e}")
        return jsonify({'error': 'Failed to delete all notifications'}), 500


@notification_bp.route('/notifications/subscribe', methods=['POST'])
@token_required
def subscribe_to_push(current_user_id, current_user_role):
    """
    Subscribe to push notifications (for future use with Web Push)
    Body: { "subscription": {...} }
    """
    try:
        data = request.get_json()
        subscription = data.get('subscription')

        if not subscription:
            return jsonify({'error': 'subscription is required'}), 400

        # TODO: Store push subscription in database
        # For now, just return success

        return jsonify({
            'success': True,
            'message': 'Subscribed to push notifications'
        }), 200

    except Exception as e:
        log.error(f"Error subscribing to push notifications: {e}")
        return jsonify({'error': 'Failed to subscribe to push notifications'}), 500


@notification_bp.route('/notifications/unsubscribe', methods=['POST'])
@token_required
def unsubscribe_from_push(current_user_id, current_user_role):
    """
    Unsubscribe from push notifications
    Body: { "subscription": {...} }
    """
    try:
        # TODO: Remove push subscription from database
        # For now, just return success

        return jsonify({
            'success': True,
            'message': 'Unsubscribed from push notifications'
        }), 200

    except Exception as e:
        log.error(f"Error unsubscribing from push notifications: {e}")
        return jsonify({'error': 'Failed to unsubscribe from push notifications'}), 500


@notification_bp.route('/notifications/count', methods=['GET'])
@token_required
def get_notification_count(current_user_id, current_user_role):
    """Get unread notification count"""
    try:
        unread_count = Notification.query.filter(
            and_(
                Notification.user_id == current_user_id,
                Notification.read == False,
                Notification.deleted_at.is_(None)
            )
        ).count()

        return jsonify({
            'success': True,
            'unread_count': unread_count
        }), 200

    except Exception as e:
        log.error(f"Error fetching notification count: {e}")
        return jsonify({'error': 'Failed to fetch notification count'}), 500


@notification_bp.route('/notifications/socketio/status', methods=['GET'])
@token_required
def get_socketio_status(current_user_id, current_user_role):
    """Get Socket.IO connection status for debugging"""
    try:
        from socketio_server import get_active_users_count, active_connections

        total_connections = get_active_users_count()

        # Get user's specific room info
        user_room = f'user_{current_user_id}'
        role_room = f'role_{current_user_role}'

        # Check if current user is connected
        user_connected = any(
            user_room in conn.get('rooms', [])
            for conn in active_connections.values()
        )

        # Get all active user rooms
        active_user_ids = set()
        active_role_rooms = set()
        for conn in active_connections.values():
            for room in conn.get('rooms', []):
                if room.startswith('user_'):
                    active_user_ids.add(room.replace('user_', ''))
                elif room.startswith('role_'):
                    active_role_rooms.add(room.replace('role_', ''))

        return jsonify({
            'success': True,
            'socketio_status': {
                'total_connections': total_connections,
                'current_user': {
                    'user_id': current_user_id,
                    'role': current_user_role,
                    'connected': user_connected,
                    'expected_rooms': [user_room, role_room]
                },
                'active_user_ids': list(active_user_ids),
                'active_role_rooms': list(active_role_rooms)
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching Socket.IO status: {e}")
        return jsonify({'error': str(e)}), 500


