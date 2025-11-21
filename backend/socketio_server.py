"""
Socket.IO Server for Real-time Notifications
Handles WebSocket connections and real-time notification delivery
"""

from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
from flask import request
import jwt
import os
from functools import wraps

# Initialize Socket.IO
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode='threading',
    logger=True,
    engineio_logger=False,
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

    print(f"✓ User {username} (ID: {user_id}, Role: {role}) connected [SID: {sid}]")
    print(f"  Joined rooms: {user_room}, {role_room}")

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
        print(f"✗ User {user_info['username']} (ID: {user_info['user_id']}) disconnected [SID: {sid}]")

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

        print(f"✓ User {username} joined room: {room}")
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

        print(f"✗ User {username} left room: {room}")
        emit('left_room', {'room': room, 'message': f'Left room {room}'})


@socketio.on('ping')
def handle_ping():
    """Handle ping from client"""
    emit('pong', {'timestamp': request.args.get('timestamp', '')})


# Notification event handlers

def send_notification_to_user(user_id, notification_data):
    """
    Send notification to a specific user

    Args:
        user_id: Target user ID
        notification_data: Notification data dictionary
    """
    room = f'user_{user_id}'
    socketio.emit('notification', notification_data, room=room)
    print(f"→ Sent notification to user {user_id} in room {room}")


def send_notification_to_role(role, notification_data):
    """
    Send notification to all users with a specific role

    Args:
        role: Target role
        notification_data: Notification data dictionary
    """
    room = f'role_{role}'
    socketio.emit('notification', notification_data, room=room)
    print(f"→ Sent notification to role {role} in room {room}")


def send_notification_to_room(room, notification_data):
    """
    Send notification to a specific room

    Args:
        room: Room name
        notification_data: Notification data dictionary
    """
    socketio.emit('notification', notification_data, room=room)
    print(f"→ Sent notification to room {room}")


def broadcast_notification(notification_data):
    """
    Broadcast notification to all connected users

    Args:
        notification_data: Notification data dictionary
    """
    socketio.emit('notification', notification_data, broadcast=True)
    print(f"→ Broadcast notification to all users")


# Project-specific events

@socketio.on('pr:submitted')
@authenticate_socket
def handle_pr_submitted(data, user_id, role, username):
    """Handle PR submitted event"""
    print(f"PR submitted by {username}: {data}")

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
    print(f"PR approved by {username}: {data}")

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
    print(f"PR rejected by {username}: {data}")

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
    print(f"PR forwarded by {username}: {data}")

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
    print(f"Project created by {username}: {data}")

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
    print(f"Project updated by {username}: {data}")

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
    print(f"Project approved by {username}: {data}")

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
    print(f"Project rejected by {username}: {data}")

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
    print("✓ Socket.IO server initialized")
    return socketio
