"""
Change Request Workflow Service
Centralized approval routing and workflow logic
Determines next approver based on business rules
"""
from typing import Dict, Tuple, Optional
from config.change_request_config import CR_CONFIG
from config.logging import get_logger

log = get_logger()


class ChangeRequestWorkflow:
    """Service for managing change request approval workflow"""

    @staticmethod
    def normalize_role(role_name: str) -> str:
        """
        Normalize role name for consistent comparison

        Args:
            role_name: Raw role name from user object

        Returns:
            str: Normalized role name (lowercase, no spaces/underscores/hyphens)
        """
        if not role_name:
            return ''
        return role_name.replace(' ', '').replace('_', '').replace('-', '').lower()

    @staticmethod
    def check_budget_threshold(change_request) -> str:
        """
        DEPRECATED: Simplified workflow - always routes to Estimator
        Kept for backward compatibility

        Args:
            change_request: ChangeRequest model instance

        Returns:
            str: Always returns 'estimator'
        """
        # Simplified workflow: always route to Estimator
        return CR_CONFIG.ROLE_ESTIMATOR

    @staticmethod
    def determine_initial_approver(requester_role: str, change_request) -> Tuple[str, str]:
        """
        Determine initial approver when request is sent for review

        Workflow:
        - SE → PM (always)
        - PM → Estimator (for NEW materials with master_material_id = None)
        - PM → Buyer (for existing materials - NOT IMPLEMENTED YET, defaults to Estimator)

        Args:
            requester_role: Role of the person creating the request
            change_request: ChangeRequest model instance

        Returns:
            tuple: (approval_required_from, next_approver_display_name)
        """
        normalized_role = ChangeRequestWorkflow.normalize_role(requester_role)

        # Site Engineer / Site Supervisor → Project Manager
        # Handle both database formats: camelCase (siteEngineer) and snake_case (site_engineer)
        if normalized_role in ['siteengineer', 'sitesupervisor', 'site_engineer', 'site_supervisor']:
            log.info(f"Site Engineer/Supervisor request - routing to Project Manager")
            return CR_CONFIG.ROLE_PROJECT_MANAGER, "Project Manager"

        # Project Manager routing logic
        # Handle both database formats: camelCase (projectManager) and snake_case (project_manager)
        elif normalized_role in ['projectmanager', 'project_manager']:
            # Check if request has NEW materials (master_material_id is None)
            has_new_materials = any(
                mat.get('master_material_id') is None
                for mat in (change_request.materials_data or [])
            )

            if has_new_materials:
                log.info(f"PM request with NEW materials - routing to Estimator for pricing")
                return CR_CONFIG.ROLE_ESTIMATOR, "Estimator"
            else:
                # All existing materials - should go to Buyer, but for now route to Estimator
                log.info(f"PM request with existing materials only - routing to Estimator")
                return CR_CONFIG.ROLE_ESTIMATOR, "Estimator"

        else:
            log.error(f"Invalid role '{requester_role}' (normalized: '{normalized_role}') attempting to send change request")
            raise ValueError(f"Invalid role for sending request: {requester_role}. Only Site Engineers and Project Managers can create change requests.")

    @staticmethod
    def determine_approval_route_by_percentage(change_request) -> Tuple[str, str]:
        """
        DEPRECATED: Simplified workflow - always routes to Estimator
        Kept for backward compatibility

        Args:
            change_request: ChangeRequest model instance

        Returns:
            tuple: (approval_required_from, next_approver_display_name)
        """
        log.info(f"CR {change_request.cr_id}: Simplified workflow → Routing to Estimator")
        return CR_CONFIG.ROLE_ESTIMATOR, "Estimator"

    @staticmethod
    def determine_next_approver_after_pm(change_request) -> Tuple[str, str]:
        """
        Determine next approver after PM approval

        NEW FLOW:
        - NEW materials (master_material_id = None) → Estimator (for pricing)
        - Existing materials only → Buyer (NOT IMPLEMENTED YET, defaults to Estimator)

        Args:
            change_request: ChangeRequest model instance

        Returns:
            tuple: (approval_required_from, next_approver_display_name)
        """
        # Check if request has NEW materials (master_material_id is None)
        has_new_materials = any(
            mat.get('master_material_id') is None
            for mat in (change_request.materials_data or [])
        )

        if has_new_materials:
            log.info(f"CR {change_request.cr_id}: Has NEW materials - routing to Estimator for pricing")
            return CR_CONFIG.ROLE_ESTIMATOR, "Estimator"
        else:
            # All existing materials - should go to Buyer, but for now route to Estimator
            log.info(f"CR {change_request.cr_id}: Existing materials only - routing to Estimator")
            return CR_CONFIG.ROLE_ESTIMATOR, "Estimator"

    @staticmethod
    def determine_next_approver_after_td() -> Tuple[str, str]:
        """
        Determine next approver after TD approval (always Estimator)

        Returns:
            tuple: (approval_required_from, next_approver_display_name)
        """
        return CR_CONFIG.ROLE_ESTIMATOR, "Estimator"

    @staticmethod
    def can_approve(user_role: str, required_approver: str) -> bool:
        """
        Check if user role can approve request at current stage

        Args:
            user_role: Current user's role
            required_approver: Required approver role from change request

        Returns:
            bool: True if user can approve
        """
        normalized_user_role = ChangeRequestWorkflow.normalize_role(user_role)
        normalized_required = ChangeRequestWorkflow.normalize_role(required_approver) if required_approver else ''

        # Map normalized roles - handle both camelCase and snake_case
        role_mapping = {
            'projectmanager': CR_CONFIG.ROLE_PROJECT_MANAGER,
            'project_manager': CR_CONFIG.ROLE_PROJECT_MANAGER,
            'estimator': CR_CONFIG.ROLE_ESTIMATOR,
            'technicaldirector': CR_CONFIG.ROLE_TECHNICAL_DIRECTOR,
            'technical_director': CR_CONFIG.ROLE_TECHNICAL_DIRECTOR,
            'siteengineer': CR_CONFIG.ROLE_SITE_ENGINEER,
            'sitesupervisor': CR_CONFIG.ROLE_SITE_ENGINEER,
            'site_engineer': CR_CONFIG.ROLE_SITE_ENGINEER,
            'site_supervisor': CR_CONFIG.ROLE_SITE_ENGINEER
        }

        user_mapped = role_mapping.get(normalized_user_role, normalized_user_role)
        required_mapped = role_mapping.get(normalized_required, normalized_required)

        # Admin can approve anything
        if normalized_user_role == 'admin':
            return True

        return user_mapped == required_mapped

    @staticmethod
    def get_workflow_status_label(status: str) -> str:
        """
        Get user-friendly status label

        Args:
            status: Internal status value

        Returns:
            str: Display label
        """
        labels = {
            CR_CONFIG.STATUS_PENDING: 'Pending',
            CR_CONFIG.STATUS_UNDER_REVIEW: 'Under Review',
            CR_CONFIG.STATUS_APPROVED_BY_PM: 'Approved by PM',
            CR_CONFIG.STATUS_APPROVED_BY_TD: 'Approved by TD',
            CR_CONFIG.STATUS_PENDING_TD_APPROVAL: 'Pending TD Approval',
            CR_CONFIG.STATUS_APPROVED: 'Approved & Merged',
            CR_CONFIG.STATUS_REJECTED: 'Rejected'
        }
        return labels.get(status, status.title())

    @staticmethod
    def validate_workflow_state(change_request, action: str) -> Tuple[bool, Optional[str]]:
        """
        Validate if action can be performed on change request

        Args:
            change_request: ChangeRequest model instance
            action: Action to perform ('send', 'approve', 'reject')

        Returns:
            tuple: (is_valid, error_message)
        """
        status = change_request.status

        if action == 'send':
            if status != CR_CONFIG.STATUS_PENDING:
                return False, f"Request must be in pending state to send. Current status: {status}"
            if change_request.approval_required_from is not None:
                return False, "Request has already been sent for review"
            return True, None

        elif action in ['approve', 'reject']:
            if status in [CR_CONFIG.STATUS_APPROVED, CR_CONFIG.STATUS_REJECTED]:
                return False, f"Request already {status}"
            if status not in [CR_CONFIG.STATUS_UNDER_REVIEW, CR_CONFIG.STATUS_APPROVED_BY_PM, CR_CONFIG.STATUS_APPROVED_BY_TD, CR_CONFIG.STATUS_SEND_TO_EST, CR_CONFIG.STATUS_SEND_TO_BUYER, CR_CONFIG.STATUS_PENDING_TD_APPROVAL]:
                return False, f"Request must be under review to {action}. Current status: {status}"
            return True, None

        return False, f"Unknown action: {action}"


# Create singleton instance
workflow_service = ChangeRequestWorkflow()
