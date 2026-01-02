"""
Role-based Route Mapping Utility

Maps database role names to frontend route prefixes for notifications.
This ensures notification action URLs are generated dynamically based on
the recipient's actual role, preventing 403 errors when users click notifications.

Environment-agnostic: Works across development and production databases.
"""

from config.logging import get_logger
from typing import Optional

log = get_logger()


def get_role_route_prefix(role: Optional[str]) -> str:
    """
    Get the frontend route prefix for a given role.

    Args:
        role: The role name from the database (e.g., 'projectManager', 'estimator')

    Returns:
        The frontend route prefix (e.g., 'project-manager', 'estimator')

    Examples:
        >>> get_role_route_prefix('projectManager')
        'project-manager'
        >>> get_role_route_prefix('technicalDirector')
        'technical-director'
        >>> get_role_route_prefix('estimator')
        'estimator'
    """
    if not role:
        log.warning("get_role_route_prefix called with None/empty role, using 'dashboard'")
        return 'dashboard'

    role_lower = role.lower().strip()

    # Map database role names to frontend route prefixes
    role_route_map = {
        # Management roles
        'projectmanager': 'project-manager',
        'project_manager': 'project-manager',
        'project manager': 'project-manager',

        'technicaldirector': 'technical-director',
        'technical_director': 'technical-director',
        'technical director': 'technical-director',

        'productionmanager': 'production-manager',
        'production_manager': 'production-manager',
        'production manager': 'production-manager',

        # Staff roles
        'estimator': 'estimator',
        'estimation': 'estimator',

        'siteengineer': 'site-engineer',
        'site_engineer': 'site-engineer',
        'site engineer': 'site-engineer',
        'sitesupervisor': 'site-engineer',
        'site_supervisor': 'site-engineer',
        'site supervisor': 'site-engineer',

        'buyer': 'buyer',
        'procurement': 'buyer',

        'mep': 'mep',
        'mepsupervisor': 'mep',
        'mep_supervisor': 'mep',
        'mep supervisor': 'mep',
        'mepmanager': 'mep',
        'mep_manager': 'mep',
        'mep manager': 'mep',

        # System roles
        'admin': 'admin',
        'administrator': 'admin',

        'inventory': 'inventory',
        'inventorymanager': 'inventory',
        'inventory_manager': 'inventory',
        'inventory manager': 'inventory',
    }

    route = role_route_map.get(role_lower)

    if not route:
        log.warning(f"Unknown role '{role}', using 'dashboard' as fallback")
        return 'dashboard'

    return route


def get_user_role_route(user_id: int) -> str:
    """
    Get the frontend route prefix for a user by their user_id.

    Args:
        user_id: The user's database ID

    Returns:
        The frontend route prefix for that user's role

    Examples:
        >>> get_user_role_route(8)  # Production Manager
        'production-manager'
        >>> get_user_role_route(1)  # Estimator
        'estimator'
    """
    try:
        from models.user import User

        user = User.query.filter_by(user_id=user_id, is_deleted=False).first()

        if not user:
            log.error(f"User {user_id} not found, using 'dashboard' fallback")
            return 'dashboard'

        # Get role from relationship
        if user.role and hasattr(user.role, 'role'):
            role_name = user.role.role
            return get_role_route_prefix(role_name)
        else:
            log.warning(f"User {user_id} has no role, using 'dashboard' fallback")
            return 'dashboard'

    except Exception as e:
        log.error(f"Error getting role route for user {user_id}: {e}")
        return 'dashboard'


def build_notification_action_url(
    user_id: int,
    base_page: str,
    query_params: Optional[dict] = None,
    fallback_role_route: Optional[str] = None
) -> str:
    """
    Build a complete notification action URL based on user's role.

    Args:
        user_id: The recipient's user ID
        base_page: The page to navigate to (e.g., 'my-projects', 'project-approvals', 'projects')
        query_params: Optional query parameters (e.g., {'boq_id': 123, 'tab': 'pending'})
        fallback_role_route: Optional fallback route if user role cannot be determined

    Returns:
        Complete action URL (e.g., '/project-manager/my-projects?boq_id=123')

    Examples:
        >>> build_notification_action_url(8, 'my-projects', {'boq_id': 39})
        '/production-manager/my-projects?boq_id=39'
        >>> build_notification_action_url(1, 'projects', {'tab': 'approved', 'boq_id': 830})
        '/estimator/projects?tab=approved&boq_id=830'
    """
    # Get user's role route
    role_route = get_user_role_route(user_id)

    # Use fallback if provided and role route is 'dashboard'
    if role_route == 'dashboard' and fallback_role_route:
        role_route = fallback_role_route
        log.info(f"Using fallback route '{fallback_role_route}' for user {user_id}")

    # Build base URL
    url = f'/{role_route}/{base_page}'

    # Add query parameters if provided
    if query_params:
        query_string = '&'.join([f'{k}={v}' for k, v in query_params.items()])
        url = f'{url}?{query_string}'

    return url


# Convenience functions for common notification types

def get_boq_approval_url(user_id: int, boq_id: int) -> str:
    """Get BOQ approval URL for a specific user"""
    return build_notification_action_url(
        user_id=user_id,
        base_page='my-projects',
        query_params={'boq_id': boq_id},
        fallback_role_route='project-manager'
    )


def get_boq_view_url(user_id: int, boq_id: int, tab: Optional[str] = None) -> str:
    """Get BOQ view URL for a specific user (estimator)"""
    params = {'boq_id': boq_id}
    if tab:
        params['tab'] = tab

    return build_notification_action_url(
        user_id=user_id,
        base_page='projects',
        query_params=params,
        fallback_role_route='estimator'
    )


def get_td_approval_url(user_id: int, boq_id: int, tab: Optional[str] = 'pending', subtab: Optional[str] = None) -> str:
    """Get TD approval URL for a specific user

    Args:
        user_id: Target user ID
        boq_id: BOQ ID to navigate to
        tab: Main tab (pending, revisions, approved, etc.)
        subtab: Sub-tab within revisions (internal, client)
    """
    params = {'boq_id': boq_id}
    if tab:
        params['tab'] = tab
    if subtab:
        params['subtab'] = subtab

    return build_notification_action_url(
        user_id=user_id,
        base_page='project-approvals',
        query_params=params,
        fallback_role_route='technical-director'
    )


def get_change_request_url(user_id: int, cr_id: int) -> str:
    """Get change request URL for a specific user"""
    return build_notification_action_url(
        user_id=user_id,
        base_page='change-requests',
        query_params={'cr_id': cr_id},
        fallback_role_route='technical-director'
    )


def get_project_url(user_id: int, project_id: int) -> str:
    """Get project URL for a specific user"""
    return build_notification_action_url(
        user_id=user_id,
        base_page='my-projects',
        query_params={'project_id': project_id},
        fallback_role_route='project-manager'
    )
