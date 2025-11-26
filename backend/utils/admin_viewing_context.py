"""
Utility for handling admin viewing context
Allows admin to view data as if they were a different role
"""

from flask import request, g
from config.logging import get_logger

log = get_logger()

def get_effective_user_context():
    """
    Get the effective user context for API calls.
    If admin is viewing as another role, return that role's context.

    Returns:
        dict: User context with effective role and id
    """
    current_user = g.get('user', {})
    # Check both 'role' and 'role_name' fields as they may differ
    user_role = (current_user.get('role_name', '') or current_user.get('role', '')).lower()
    user_id = current_user.get('user_id')

    # Check if admin is viewing as another role
    if user_role == 'admin':
        viewing_as_role = request.headers.get('X-Viewing-As-Role')
        viewing_as_role_id = request.headers.get('X-Viewing-As-Role-Id')
        viewing_as_user_id = request.headers.get('X-Viewing-As-User-Id')

        log.info(f"Admin context check - viewing_as_role header: '{viewing_as_role}', viewing_as_role_id: '{viewing_as_role_id}'")

        if viewing_as_role and viewing_as_role != 'admin':
            # Admin is viewing as another role
            # Return context that indicates admin wants to see data for that role
            log.info(f"Admin IS viewing as another role: {viewing_as_role}")
            return {
                'actual_role': 'admin',
                'actual_user_id': user_id,
                'effective_role': viewing_as_role.lower(),
                'effective_role_id': int(viewing_as_role_id) if viewing_as_role_id else None,
                'effective_user_id': int(viewing_as_user_id) if viewing_as_user_id else None,
                'is_admin_viewing': True
            }
        else:
            log.info(f"Admin NOT viewing as another role (header missing or admin)")

    # Regular user or admin not viewing as another role
    return {
        'actual_role': user_role,
        'actual_user_id': user_id,
        'effective_role': user_role,
        'effective_role_id': current_user.get('role_id'),
        'effective_user_id': user_id,
        'is_admin_viewing': False
    }

def should_apply_role_filter(context):
    """
    Determine if role-specific filtering should be applied.
    Admin viewing as a role should see ALL data for that role type.

    Args:
        context: The user context from get_effective_user_context()

    Returns:
        bool: True if filtering should be applied, False if admin should see all
    """
    # If admin is viewing as another role, don't apply user-specific filters
    # but could apply role-type filters if needed
    if context['is_admin_viewing']:
        return False

    # Regular users get filtered data
    return True