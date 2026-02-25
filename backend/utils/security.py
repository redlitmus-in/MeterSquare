"""
Security Utilities for MeterSquare
Provides response filtering and data masking functions

IMPORTANT: Security restrictions ONLY apply when ENVIRONMENT=production
In development, these functions pass through without restrictions

Usage:
    from utils.security import filter_response_data, mask_email, mask_phone
"""

import logging
from flask import request, g
from typing import Any, Dict, List

from config.security_config import SecurityConfig, is_production

# Get logger
logger = logging.getLogger(__name__)

# Import field classifications from central config (Single Source of Truth)
ALWAYS_HIDDEN_FIELDS = SecurityConfig.ALWAYS_HIDDEN_FIELDS
USER_SENSITIVE_FIELDS = SecurityConfig.USER_SENSITIVE_FIELDS
VENDOR_HIDDEN_FIELDS = SecurityConfig.VENDOR_HIDDEN_FIELDS
ADMIN_ONLY_AUDIT_FIELDS = SecurityConfig.ADMIN_ONLY_AUDIT_FIELDS
ADMIN_ROLES = SecurityConfig.ADMIN_ROLES


def get_current_user_context() -> Dict:
    """
    Get current user context from Flask g object

    Returns:
        Dict with user_id, role, is_admin
    """
    if hasattr(g, 'user') and g.user:
        user_role = (g.user.get('role') or '').lower()
        return {
            'user_id': g.user.get('user_id'),
            'role': user_role,
            'is_admin': user_role in ADMIN_ROLES
        }
    return {'user_id': None, 'role': None, 'is_admin': False}


def secure_response(data: Any, status_code: int = 200) -> tuple:
    """
    Create a secure JSON response with automatic field filtering

    IMPORTANT: Only applies filtering in production. Development returns data as-is.

    Usage:
        from utils.security import secure_response

        @app.route('/api/users')
        def get_users():
            users = User.query.all()
            return secure_response({
                "users": [u.to_dict() for u in users]
            })

    Args:
        data: Response data (dict or list)
        status_code: HTTP status code

    Returns:
        Tuple of (jsonify response, status_code)
    """
    from flask import jsonify

    # In development, return data as-is for debugging
    if not SecurityConfig.FILTER_SENSITIVE_FIELDS:
        return jsonify(data), status_code

    # Get current user context
    context = get_current_user_context()

    # Filter the response data
    filtered_data = filter_response_data(data, context)

    return jsonify(filtered_data), status_code


def filter_response_data(data: Any, context: Dict = None) -> Any:
    """
    Filter sensitive fields from response data

    IMPORTANT: Only applies in production. In development, returns data as-is.

    Args:
        data: Data to filter (dict, list, or primitive)
        context: User context with user_id, role, is_admin

    Returns:
        Filtered data (production) or original data (development)
    """
    # In development, return data as-is for debugging
    if not SecurityConfig.FILTER_SENSITIVE_FIELDS:
        return data

    if context is None:
        context = get_current_user_context()

    return _recursive_filter(data, context)


def _recursive_filter(data: Any, context: Dict) -> Any:
    """Recursively filter sensitive fields from data"""
    if data is None:
        return None

    if isinstance(data, dict):
        filtered = {}
        for key, value in data.items():
            key_lower = key.lower()

            # Skip fields that should NEVER be in responses
            if key_lower in [f.lower() for f in ALWAYS_HIDDEN_FIELDS]:
                continue

            # Skip user-sensitive fields if not admin and not viewing own data
            if key_lower in [f.lower() for f in USER_SENSITIVE_FIELDS]:
                if not context.get('is_admin'):
                    # Check if this is the user's own data
                    data_user_id = data.get('user_id')
                    current_user_id = context.get('user_id')

                    if not (data_user_id and current_user_id and
                            str(data_user_id) == str(current_user_id)):
                        continue  # Skip this field

            # Skip vendor-hidden fields if user is vendor
            if context.get('role') == 'vendor':
                if key_lower in [f.lower() for f in VENDOR_HIDDEN_FIELDS]:
                    continue

            # Recursively filter nested data
            filtered[key] = _recursive_filter(value, context)

        return filtered

    elif isinstance(data, list):
        return [_recursive_filter(item, context) for item in data]

    else:
        # Primitive types - return as-is
        return data


def filter_user_data(user_data: Dict, current_user_id: int = None, is_admin: bool = False) -> Dict:
    """
    Filter user data based on who is requesting

    Args:
        user_data: User data dictionary
        current_user_id: ID of the user making the request
        is_admin: Whether the requester is an admin (PM/TD)

    Returns:
        Filtered user data
    """
    # In development, return all data for debugging
    if not SecurityConfig.FILTER_SENSITIVE_FIELDS:
        return user_data

    # Base fields visible to everyone
    safe_fields = ['user_id', 'full_name', 'role', 'role_id', 'role_name', 'department',
                   'is_active', 'user_status', 'name']

    # Additional fields for owner or admin
    owner_fields = ['email', 'phone', 'last_login', 'created_at', 'last_modified_at']

    filtered = {k: v for k, v in user_data.items() if k in safe_fields}

    # Add owner/admin fields
    user_id = user_data.get('user_id')
    if is_admin or (current_user_id and str(current_user_id) == str(user_id)):
        for field in owner_fields:
            if field in user_data:
                filtered[field] = user_data[field]

    return filtered


def filter_user_list(users_data: List[Dict], current_user_id: int = None, is_admin: bool = False) -> List[Dict]:
    """
    Filter a list of user data

    Args:
        users_data: List of user data dictionaries
        current_user_id: ID of the user making the request
        is_admin: Whether the requester is an admin

    Returns:
        List of filtered user data
    """
    # In development, return all data for debugging
    if not SecurityConfig.FILTER_SENSITIVE_FIELDS:
        return users_data

    return [
        filter_user_data(user, current_user_id, is_admin)
        for user in users_data
    ]


def mask_email(email: str) -> str:
    """
    Mask email address for privacy

    Example: john.doe@example.com -> j***@example.com
    """
    if not email or '@' not in email:
        return email

    local, domain = email.rsplit('@', 1)
    if len(local) <= 2:
        masked_local = local[0] + '***'
    else:
        masked_local = local[0] + '***' + local[-1]

    return f"{masked_local}@{domain}"


def mask_phone(phone: str) -> str:
    """
    Mask phone number for privacy

    Example: 9876543210 -> 98****3210
    """
    if not phone:
        return phone

    phone_str = str(phone).replace(' ', '').replace('-', '')
    if len(phone_str) <= 4:
        return '****'

    return phone_str[:2] + '****' + phone_str[-4:]


# ============================================
# Helper Functions
# ============================================

def get_client_ip() -> str:
    """
    Get client IP address, handling proxies

    Returns:
        Client IP address as string
    """
    if not request:
        return None

    # Check for forwarded IP (when behind proxy/load balancer)
    forwarded = request.headers.get('X-Forwarded-For')
    if forwarded:
        # X-Forwarded-For can contain multiple IPs, take the first
        return forwarded.split(',')[0].strip()

    return request.remote_addr


