"""
Shared helpers for the Labour Management Controllers.
Contains constants, role helpers, service instances, and common utilities
used across all labour controller modules.
"""

__all__ = [
    'log', 'whatsapp_service',
    'SUPER_ADMIN_ROLES', 'LABOUR_ADMIN_ROLES',
    'normalize_role', 'get_user_assigned_project_ids',
]
from config.logging import get_logger
from utils.whatsapp_service import WhatsAppService
from sqlalchemy import or_

log = get_logger()

# Initialize WhatsApp service
whatsapp_service = WhatsAppService()

# Role sets for authorization (normalized without spaces/underscores)
SUPER_ADMIN_ROLES = frozenset(['admin', 'td', 'technicaldirector'])
LABOUR_ADMIN_ROLES = frozenset(['admin', 'td', 'technicaldirector', 'productionmanager'])


def normalize_role(role: str) -> str:
    """Normalize role string for consistent comparison."""
    if not role:
        return ''
    return role.lower().replace(' ', '').replace('_', '').replace('-', '')


def get_user_assigned_project_ids(user_id: int) -> list:
    """
    Get list of project IDs where user is assigned in any role.
    Returns empty list if user_id is None or invalid.
    """
    if not user_id:
        return []

    from models.project import Project

    assigned_projects = Project.query.filter(
        Project.is_deleted == False,
        or_(
            # PM: user_id is JSONB array, check if user_id is in the array
            Project.user_id.contains([user_id]),
            # Site Supervisor/SE
            Project.site_supervisor_id == user_id,
            # MEP Supervisor: mep_supervisor_id is JSONB array
            Project.mep_supervisor_id.contains([user_id]),
            # Estimator
            Project.estimator_id == user_id,
            # Buyer
            Project.buyer_id == user_id
        )
    ).with_entities(Project.project_id).all()

    return [p.project_id for p in assigned_projects]
