"""
Socket.IO Server for Real-time Notifications
Handles WebSocket connections and real-time notification delivery
"""

from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
from flask import request
import jwt
import os
from datetime import datetime
from functools import wraps
from config.logging import get_logger

log = get_logger()

# Initialize Socket.IO with explicit CORS origins for development
# Must match the origins allowed by Flask CORS
SOCKET_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5173",
    "https://msq.kol.tel",
    "http://msq.kol.tel"
]

socketio = SocketIO(
    cors_allowed_origins=SOCKET_CORS_ORIGINS,
    async_mode='threading',
    logger=True,
    engineio_logger=True,  # Enable engine.io logging to debug connection issues
    ping_timeout=60,
    ping_interval=25
)

# JWT Secret Key
SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-here')

# Store active connections
active_connections = {}

def authenticate_socket(f):
    """Decorator to authenticate socket connections"""
    @wraps(f)
    def decorated(*args, **kwargs):
        # Get token from handshake query
        token = request.args.get('token')

        if not token:
            disconnect()
            return {'error': 'Authentication required'}

        try:
            # Decode token
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            user_id = data.get('user_id')
            role = data.get('role')
            username = data.get('username', 'Unknown')

            if not user_id:
                disconnect()
                return {'error': 'Invalid token'}

            # Store user info in kwargs
            kwargs['user_id'] = user_id
            kwargs['role'] = role
            kwargs['username'] = username

        except jwt.ExpiredSignatureError:
            disconnect()
            return {'error': 'Token has expired'}
        except jwt.InvalidTokenError:
            disconnect()
            return {'error': 'Invalid token'}

        return f(*args, **kwargs)

    return decorated


@socketio.on('connect')
@authenticate_socket
def handle_connect(user_id, role, username):
    """Handle client connection"""
    sid = request.sid

    # Store connection info
    active_connections[sid] = {
        'user_id': user_id,
        'role': role,
        'username': username,
        'rooms': []
    }

    # Join user-specific room
    user_room = f'user_{user_id}'
    join_room(user_room)
    active_connections[sid]['rooms'].append(user_room)

    # Join role-specific room
    role_room = f'role_{role}'
    join_room(role_room)
    active_connections[sid]['rooms'].append(role_room)

    log.info(f"User {username} (ID: {user_id}, Role: {role}) connected [SID: {sid}]")

    # Send connection success message
    emit('connected', {
        'message': 'Connected to notification server',
        'user_id': user_id,
        'role': role,
        'username': username
    })

    # Broadcast to other users (optional)
    emit('user_connected', {
        'user_id': user_id,
        'username': username,
        'role': role
    }, broadcast=True, include_self=False)


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    sid = request.sid

    if sid in active_connections:
        user_info = active_connections[sid]
        log.info(f"User {user_info['username']} (ID: {user_info['user_id']}) disconnected [SID: {sid}]")

        # Leave all rooms
        for room in user_info['rooms']:
            leave_room(room)

        # Broadcast to other users (optional)
        emit('user_disconnected', {
            'user_id': user_info['user_id'],
            'username': user_info['username']
        }, broadcast=True, include_self=False)

        # Remove from active connections
        del active_connections[sid]


@socketio.on('join_room')
@authenticate_socket
def handle_join_room(data, user_id, role, username):
    """Allow client to join custom rooms"""
    room = data.get('room')

    if room:
        join_room(room)
        sid = request.sid

        if sid in active_connections:
            active_connections[sid]['rooms'].append(room)

        log.debug(f"User {username} joined room: {room}")
        emit('joined_room', {'room': room, 'message': f'Joined room {room}'})


@socketio.on('leave_room')
@authenticate_socket
def handle_leave_room(data, user_id, role, username):
    """Allow client to leave custom rooms"""
    room = data.get('room')

    if room:
        leave_room(room)
        sid = request.sid

        if sid in active_connections and room in active_connections[sid]['rooms']:
            active_connections[sid]['rooms'].remove(room)

        log.debug(f"User {username} left room: {room}")
        emit('left_room', {'room': room, 'message': f'Left room {room}'})


@socketio.on('ping')
def handle_ping():
    """Handle ping from client"""
    emit('pong', {'timestamp': request.args.get('timestamp', '')})


@socketio.on('join:user')
def handle_join_user(user_id):
    """Handle join:user event from frontend"""
    try:
        sid = request.sid
        room = f'user_{user_id}'
        join_room(room)

        # Update tracking if connection exists
        if sid in active_connections:
            if room not in active_connections[sid]['rooms']:
                active_connections[sid]['rooms'].append(room)
        else:
            # Create new tracking entry for this connection
            active_connections[sid] = {
                'user_id': user_id,
                'role': 'unknown',
                'username': f'user_{user_id}',
                'rooms': [room]
            }

        log.info(f"[Socket.IO] User {user_id} joined room: {room} [SID: {sid}]")
        emit('room_joined', {'room': room, 'type': 'user'})
    except Exception as e:
        log.error(f"Error joining user room: {e}")


@socketio.on('join:role')
def handle_join_role(role):
    """Handle join:role event from frontend"""
    try:
        room = f'role_{role}'
        join_room(room)
        log.debug(f"Role {role} manually joined room: {room}")
        emit('room_joined', {'room': room, 'type': 'role'})
    except Exception as e:
        log.error(f"Error joining role room: {e}")


# Notification event handlers

def send_notification_to_user(user_id, notification_data):
    """
    Send notification to a specific user

    Args:
        user_id: Target user ID
        notification_data: Notification data dictionary
    """
    room = f'user_{user_id}'

    # Check if anyone is in the room (from our tracking)
    active_users = [conn for conn in active_connections.values() if room in conn.get('rooms', [])]

    # Log with INFO level for better visibility
    log.info(f"[Socket.IO] Emitting 'notification' to room '{room}' - Title: {notification_data.get('title', 'N/A')}, Tracked connections: {len(active_users)}, Total active: {len(active_connections)}")

    # Log detailed connection info for debugging
    if len(active_connections) > 0:
        all_rooms = set()
        for sid, conn in active_connections.items():
            all_rooms.update(conn.get('rooms', []))
            if room in conn.get('rooms', []):
                log.info(f"[Socket.IO] Target user {user_id} found in connection SID: {sid}, rooms: {conn.get('rooms', [])}")
        log.info(f"[Socket.IO] All active rooms: {all_rooms}")
    else:
        log.warning(f"[Socket.IO] No active connections tracked! User {user_id} may still receive via direct room join.")

    # Always emit - even if we don't track the user, they might be in the room via join:user
    socketio.emit('notification', notification_data, room=room)

    return len(active_users) > 0


def send_notification_to_role(role, notification_data):
    """
    Send notification to all users with a specific role

    Args:
        role: Target role
        notification_data: Notification data dictionary
    """
    room = f'role_{role}'

    # Check if anyone is in the room
    active_users = [conn for conn in active_connections.values() if room in conn.get('rooms', [])]

    log.debug(f"Emitting notification to role {role} - Room: {room}, Title: {notification_data.get('title', 'N/A')}, Active connections: {len(active_users)}")

    socketio.emit('notification', notification_data, room=room)
    return len(active_users) > 0


def send_notification_to_room(room, notification_data):
    """
    Send notification to a specific room

    Args:
        room: Room name
        notification_data: Notification data dictionary
    """
    socketio.emit('notification', notification_data, room=room)
    log.debug(f"Sent notification to room {room}")


def broadcast_notification(notification_data):
    """
    Broadcast notification to all connected users

    Args:
        notification_data: Notification data dictionary
    """
    socketio.emit('notification', notification_data, broadcast=True)
    log.debug(f"Broadcast notification to all users")


# Project-specific events

@socketio.on('pr:submitted')
@authenticate_socket
def handle_pr_submitted(data, user_id, role, username):
    """Handle PR submitted event"""
    log.info(f"PR submitted by {username}")

    # Broadcast to procurement role
    emit('pr:submitted', {
        **data,
        'submitted_by': username,
        'submitted_by_id': user_id
    }, room='role_procurement')


@socketio.on('pr:approved')
@authenticate_socket
def handle_pr_approved(data, user_id, role, username):
    """Handle PR approved event"""
    log.info(f"PR approved by {username}")

    # Notify the PR creator
    creator_id = data.get('creator_id')
    if creator_id:
        emit('pr:approved', {
            **data,
            'approved_by': username,
            'approved_by_id': user_id
        }, room=f'user_{creator_id}')


@socketio.on('pr:rejected')
@authenticate_socket
def handle_pr_rejected(data, user_id, role, username):
    """Handle PR rejected event"""
    log.info(f"PR rejected by {username}")

    # Notify the PR creator
    creator_id = data.get('creator_id')
    if creator_id:
        emit('pr:rejected', {
            **data,
            'rejected_by': username,
            'rejected_by_id': user_id
        }, room=f'user_{creator_id}')


@socketio.on('pr:forwarded')
@authenticate_socket
def handle_pr_forwarded(data, user_id, role, username):
    """Handle PR forwarded event"""
    log.info(f"PR forwarded by {username}")

    # Notify the target user or role
    target_user_id = data.get('target_user_id')
    target_role = data.get('target_role')

    if target_user_id:
        emit('pr:forwarded', {
            **data,
            'forwarded_by': username,
            'forwarded_by_id': user_id
        }, room=f'user_{target_user_id}')
    elif target_role:
        emit('pr:forwarded', {
            **data,
            'forwarded_by': username,
            'forwarded_by_id': user_id
        }, room=f'role_{target_role}')


@socketio.on('project:created')
@authenticate_socket
def handle_project_created(data, user_id, role, username):
    """Handle project created event"""
    log.info(f"Project created by {username}")

    # Notify relevant users or roles
    target_users = data.get('target_users', [])
    for target_user_id in target_users:
        emit('project:created', {
            **data,
            'created_by': username,
            'created_by_id': user_id
        }, room=f'user_{target_user_id}')


@socketio.on('project:updated')
@authenticate_socket
def handle_project_updated(data, user_id, role, username):
    """Handle project updated event"""
    log.info(f"Project updated by {username}")

    # Notify project members
    project_id = data.get('project_id')
    if project_id:
        emit('project:updated', {
            **data,
            'updated_by': username,
            'updated_by_id': user_id
        }, room=f'project_{project_id}')


@socketio.on('project:approved')
@authenticate_socket
def handle_project_approved(data, user_id, role, username):
    """Handle project approved event"""
    log.info(f"Project approved by {username}")

    # Notify the project creator
    creator_id = data.get('creator_id')
    if creator_id:
        emit('project:approved', {
            **data,
            'approved_by': username,
            'approved_by_id': user_id
        }, room=f'user_{creator_id}')


@socketio.on('project:rejected')
@authenticate_socket
def handle_project_rejected(data, user_id, role, username):
    """Handle project rejected event"""
    log.info(f"Project rejected by {username}")

    # Notify the project creator
    creator_id = data.get('creator_id')
    if creator_id:
        emit('project:rejected', {
            **data,
            'rejected_by': username,
            'rejected_by_id': user_id
        }, room=f'user_{creator_id}')


# Admin functions

@socketio.on('get_active_users')
@authenticate_socket
def handle_get_active_users(user_id, role, username):
    """Get list of active users (admin only)"""
    if role not in ['admin', 'superadmin']:
        emit('error', {'message': 'Unauthorized'})
        return

    active_users = [
        {
            'user_id': conn['user_id'],
            'username': conn['username'],
            'role': conn['role'],
            'rooms': conn['rooms']
        }
        for conn in active_connections.values()
    ]

    emit('active_users', {'users': active_users, 'count': len(active_users)})


def get_active_users_count():
    """Get count of active connections"""
    return len(active_connections)


def init_socketio(app):
    """
    Initialize Socket.IO with Flask app

    Args:
        app: Flask application instance
    """
    socketio.init_app(app)
    log.info("Socket.IO server initialized")
    return socketio


# ============ SUPPORT TICKET EVENTS ============

@socketio.on('join:support')
def handle_join_support():
    """Handle support management page joining support room - NO AUTH REQUIRED"""
    try:
        room = 'support_tickets'
        join_room(room)
        log.info(f"Client joined support_tickets room [SID: {request.sid}]")
        emit('room_joined', {'room': room, 'type': 'support'})
    except Exception as e:
        log.error(f"Error joining support room: {e}")


def emit_support_ticket_event(event_type, ticket_data):
    """
    Emit support ticket event to support-management page

    Args:
        event_type: 'ticket_created', 'ticket_updated', 'ticket_comment', etc.
        ticket_data: Ticket data dictionary
    """
    room = 'support_tickets'
    event_data = {
        'type': event_type,
        'ticket': ticket_data,
        'timestamp': datetime.utcnow().isoformat()
    }

    socketio.emit('support_ticket', event_data, room=room)
    socketio.emit('support_ticket', event_data, broadcast=True)  # Also broadcast
    log.info(f"Emitted support ticket event: {event_type} for ticket {ticket_data.get('ticket_number', 'N/A')}")
