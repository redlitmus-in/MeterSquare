"""
Utility for handling admin viewing context
Allows admin to view data as if they were a different role
"""

from flask import request, g

def get_effective_user_context():
    """
    Get the effective user context for API calls.
    If admin is viewing as another role, return that role's context.

    Returns:
        dict: User context with effective role and id
    """
    current_user = g.get('user', {})
    user_role = current_user.get('role', '').lower()
    user_id = current_user.get('user_id')

    # Check if admin is viewing as another role
    if user_role == 'admin':
        viewing_as_role = request.headers.get('X-Viewing-As-Role')
        viewing_as_role_id = request.headers.get('X-Viewing-As-Role-Id')

        if viewing_as_role and viewing_as_role != 'admin':
            # Admin is viewing as another role
            # Return context that indicates admin wants to see data for that role
            return {
                'actual_role': 'admin',
                'actual_user_id': user_id,
                'effective_role': viewing_as_role.lower(),
                'effective_role_id': int(viewing_as_role_id) if viewing_as_role_id else None,
                'is_admin_viewing': True
            }

    # Regular user or admin not viewing as another role
    return {
        'actual_role': user_role,
        'actual_user_id': user_id,
        'effective_role': user_role,
        'effective_role_id': current_user.get('role_id'),
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