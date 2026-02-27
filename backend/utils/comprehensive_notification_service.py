"""
Comprehensive Notification Service
Handles notifications for ALL workflows: BOQ, CR, PR, Projects, Extensions, Vendors, etc.

✅ DYNAMIC ROUTES: All action URLs are now generated dynamically based on recipient's role
   This ensures notifications work across different environments (dev/prod) and for all roles.
"""

from utils.notification_utils import NotificationManager
from socketio_server import send_notification_to_user, send_notification_to_role
from models.user import User
from models.role import Role
from models.notification import Notification
from config.logging import get_logger
from config.db import db
from datetime import datetime, timedelta

# ✅ NEW: Import dynamic route mapping utilities
from utils.role_route_mapper import *
from utils.notification_dedup import check_duplicate_notification  # noqa: F401 - re-exported
from utils.labour_notification_service import LabourNotificationMixin

log = get_logger()


class ComprehensiveNotificationService(LabourNotificationMixin):
    """Unified notification service for all ERP workflows"""

    # ==================== OFFLINE DETECTION ====================

    @staticmethod
    def is_user_offline(user_id: int, threshold_minutes: int = 30) -> bool:
        """
        Determine if a user should receive an email fallback notification.

        Logic (BOTH must be true to consider user offline):
          1. No active Socket.IO connection right now
          2. last_login > threshold_minutes ago (or user never logged in)

        Returns True  -> user is offline, send email
        Returns False -> user is online, skip email (they will see the bell notification)
        """
        try:
            from socketio_server import is_user_connected, active_connections
            # Check 1: real-time Socket.IO presence
            if is_user_connected(user_id):
                return False  # Online right now

            # If no connections are tracked at all, Socket.IO tracking may be
            # broken (server restart, etc). Fall through to last_login check
            # but log a warning so the issue is visible.
            if len(active_connections) == 0:
                log.debug(f"is_user_offline: no active Socket.IO connections tracked — relying on last_login for user {user_id}")

            # Check 2: recent login fallback
            user = User.query.get(user_id)
            if not user or not user.last_login:
                return True  # No record -> treat as offline

            threshold = datetime.utcnow() - timedelta(minutes=threshold_minutes)
            return user.last_login < threshold

        except Exception as e:
            log.warning(f"is_user_offline check failed for user {user_id}: {e}")
            return False  # Default to NOT sending email if check fails

    # ==================== BOQ WORKFLOW NOTIFICATIONS ====================

    @staticmethod
    def notify_boq_created(boq_id, project_name, estimator_id, estimator_name, pm_user_id):
        """
        Notify PM when new BOQ is created
        Trigger: BOQ creation
        Recipients: Assigned PM
        Priority: URGENT
        """
        try:
            notifications = NotificationManager.notify_project_action(
                action='created',
                project_id=boq_id,
                project_name=project_name,
                target_user_ids=[pm_user_id],
                sender_id=estimator_id,
                sender_name=estimator_name,
                additional_info='New BOQ created and requires your review',
                metadata={'boq_id': boq_id, 'workflow': 'boq'}
            )

            for notification in notifications:
                send_notification_to_user(notification.user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending BOQ created notification: {e}")

    @staticmethod
    def notify_boq_sent_to_pm(boq_id, project_name, estimator_id, estimator_name, pm_user_id):
        """
        Notify PM when BOQ is sent for approval
        Trigger: Estimator sends BOQ to PM
        Recipients: PM
        Priority: URGENT
        ✅ FIXED: Dynamic URL based on recipient's actual role
        """
        try:
            # ✅ Generate dynamic URL based on recipient's role (fixes dev/prod user ID mismatch)
            action_url = get_boq_approval_url(pm_user_id, boq_id)

            notification = NotificationManager.create_notification(
                user_id=pm_user_id,
                type='approval',
                title='BOQ Requires Your Approval',
                message=f'BOQ for {project_name} has been sent by {estimator_name} and requires your approval',
                priority='urgent',
                category='boq',
                action_required=True,
                action_url=action_url,  # ✅ Now dynamic!
                action_label='Review BOQ',
                metadata={'boq_id': boq_id},
                sender_id=estimator_id,
                sender_name=estimator_name
            )

            send_notification_to_user(pm_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending BOQ approval notification: {e}")

    @staticmethod
    def notify_pm_boq_decision(boq_id, project_name, pm_id, pm_name, estimator_user_id, approved, rejection_reason=None):
        """
        Notify Estimator when PM approves/rejects BOQ
        Trigger: PM decision on BOQ
        Recipients: Estimator who created BOQ
        Priority: HIGH
        ✅ FIXED: Dynamic URL based on recipient's actual role
        """
        try:
            # ✅ Generate dynamic URL based on recipient's role
            if approved:
                action_url = get_boq_view_url(estimator_user_id, boq_id, tab='approved')
                notification = NotificationManager.create_notification(
                    user_id=estimator_user_id,
                    type='success',
                    title='BOQ Approved by PM',
                    message=f'Your BOQ for {project_name} has been approved by {pm_name}',
                    priority='high',
                    category='boq',
                    action_url=action_url,  # ✅ Now dynamic!
                    action_label='View BOQ',
                    metadata={'boq_id': boq_id, 'decision': 'approved', 'target_role': 'estimator'},
                    sender_id=pm_id,
                    sender_name=pm_name,
                    target_role='estimator'
                )
            else:
                action_url = get_boq_view_url(estimator_user_id, boq_id, tab='rejected')
                notification = NotificationManager.create_notification(
                    user_id=estimator_user_id,
                    type='rejection',
                    title='BOQ Rejected by PM',
                    message=f'Your BOQ for {project_name} was rejected by {pm_name}. Reason: {rejection_reason or "No reason provided"}',
                    priority='high',
                    category='boq',
                    action_required=True,
                    action_url=action_url,  # ✅ Now dynamic!
                    action_label='View Details',
                    metadata={'boq_id': boq_id, 'decision': 'rejected', 'reason': rejection_reason, 'target_role': 'estimator'},
                    sender_id=pm_id,
                    sender_name=pm_name,
                    target_role='estimator'
                )

            send_notification_to_user(estimator_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending PM decision notification: {e}")

    @staticmethod
    def notify_boq_sent_to_td(boq_id, project_name, estimator_id, estimator_name, td_user_id):
        """
        Notify TD when BOQ sent for approval
        Trigger: Estimator forwards BOQ to TD
        Recipients: Technical Director
        Priority: URGENT
        ✅ FIXED: Dynamic URL based on recipient's actual role
        """
        try:
            # Check for duplicate notification (within 2 minutes - reduced from 5 for reliability)
            # Use specific title pattern to avoid blocking other BOQ notification types
            if check_duplicate_notification(td_user_id, 'New BOQ for Approval', 'boq_id', boq_id, minutes=2):
                return

            # ✅ Generate dynamic URL based on recipient's role
            action_url = get_td_approval_url(td_user_id, boq_id, tab='pending')

            notification = NotificationManager.create_notification(
                user_id=td_user_id,
                type='approval',
                title='New BOQ for Approval',
                message=f'BOQ for {project_name} requires your approval. Submitted by {estimator_name}',
                priority='urgent',
                category='boq',
                action_required=True,
                action_url=action_url,  # ✅ Now dynamic!
                action_label='Review BOQ',
                metadata={'boq_id': boq_id},
                sender_id=estimator_id,
                sender_name=estimator_name,
                target_role='technical_director'
            )
            # Send via Socket.IO - send to BOTH user room AND role room for reliability
            notification_data = notification.to_dict()
            delivered = send_notification_to_user(td_user_id, notification_data)
            send_notification_to_role('technicalDirector', notification_data)
        except Exception as e:
            log.error(f"[notify_boq_sent_to_td] ERROR: {e}")
            import traceback
            log.error(traceback.format_exc())

    @staticmethod
    def notify_boq_sent_to_client(boq_id, project_name, estimator_id, estimator_name, td_user_ids, client_email):
        """
        Notify TD when BOQ is sent to client
        Trigger: Estimator sends BOQ to client for approval
        Recipients: Technical Director(s)
        Priority: HIGH
        """
        try:
            for td_user_id in td_user_ids:
                notification = NotificationManager.create_notification(
                    user_id=td_user_id,
                    type='info',
                    title='BOQ Sent to Client',
                    message=f'BOQ for {project_name} has been sent to client ({client_email}) by {estimator_name}',
                    priority='high',
                    category='boq',
                    action_url=build_notification_action_url(td_user_id, 'project-approvals', {'tab': 'sent', 'boq_id': boq_id}, 'technical-director'),
                    action_label='View BOQ',
                    metadata={'boq_id': boq_id, 'client_email': client_email},
                    sender_id=estimator_id,
                    sender_name=estimator_name
                )
                send_notification_to_user(td_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending BOQ to client notification: {e}")

    @staticmethod
    def notify_client_confirmed(boq_id, project_name, estimator_id, estimator_name, client_name=None):
        """
        Notify TD when client confirms/approves BOQ
        Trigger: Estimator marks BOQ as client confirmed
        Recipients: All Technical Directors
        Priority: HIGH
        """
        try:
            # Get all TD users - use 'role' column not 'role_name'
            td_role = Role.query.filter(Role.role.ilike('%technical%director%')).first()
            if not td_role:
                log.warning("No Technical Director role found in database")
                return

            td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
            if not td_users:
                log.warning("No active Technical Director users found")
                return

            client_info = f" by {client_name}" if client_name else ""

            for td_user in td_users:
                # Check for duplicate notification (reduced to 2 minutes)
                if check_duplicate_notification(td_user.user_id, 'Client Approved', 'boq_id', boq_id, minutes=2):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=td_user.user_id,
                    type='success',
                    title='BOQ Approved by Client',
                    message=f'BOQ for {project_name} has been approved by client{client_info}. Confirmed by {estimator_name}',
                    priority='high',
                    category='boq',
                    action_url=build_notification_action_url(td_user.user_id, 'project-approvals', {'tab': 'client_response', 'boq_id': boq_id}, 'technical-director'),
                    action_label='View BOQ',
                    metadata={'boq_id': boq_id, 'client_confirmed': True},
                    sender_id=estimator_id,
                    sender_name=estimator_name
                )

                send_notification_to_user(td_user.user_id, notification.to_dict())

        except Exception as e:
            log.error(f"[notify_client_confirmed] Error: {e}")
            import traceback
            log.error(traceback.format_exc())

    @staticmethod
    def notify_client_rejected(boq_id, project_name, estimator_id, estimator_name, rejection_reason):
        """
        Notify TD when client rejects BOQ
        Trigger: Estimator marks BOQ as client rejected
        Recipients: All Technical Directors
        Priority: HIGH
        """
        try:
            td_role = Role.query.filter(Role.role.ilike('%technical%director%')).first()
            if not td_role:
                log.warning("No Technical Director role found in database")
                return

            td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
            if not td_users:
                log.warning("No active Technical Director users found")
                return

            for td_user in td_users:
                # Check for duplicate notification (reduced to 2 minutes)
                if check_duplicate_notification(td_user.user_id, 'Client Rejected', 'boq_id', boq_id, minutes=2):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=td_user.user_id,
                    type='rejection',
                    title='Client Rejected BOQ',
                    message=f'BOQ for {project_name} was rejected by client. Reason: {rejection_reason}',
                    priority='high',
                    category='boq',
                    action_required=True,
                    action_url=build_notification_action_url(td_user.user_id, 'project-approvals', {'tab': 'client_response', 'boq_id': boq_id}, 'technical-director'),
                    action_label='View Details',
                    metadata={'boq_id': boq_id, 'client_rejected': True, 'reason': rejection_reason},
                    sender_id=estimator_id,
                    sender_name=estimator_name
                )

                send_notification_to_user(td_user.user_id, notification.to_dict())

        except Exception as e:
            log.error(f"[notify_client_rejected] Error: {e}")
            import traceback
            log.error(traceback.format_exc())

    @staticmethod
    def notify_td_boq_decision(boq_id, project_name, td_id, td_name, recipient_user_ids, approved, rejection_reason=None):
        """
        Notify PM/Estimator when TD approves/rejects BOQ
        Trigger: TD final decision
        Recipients: PM if approved, Estimator if rejected
        Priority: HIGH
        """
        try:
            decision = 'approved' if approved else 'rejected'
            # Use specific title pattern for dedup to avoid blocking different BOQ notification types
            dedup_title = 'BOQ Approved by Technical Director' if approved else 'BOQ Rejected by Technical Director'
            sent_count = 0
            for user_id in recipient_user_ids:
                # Check for duplicate notification (specific to this decision type)
                if check_duplicate_notification(user_id, dedup_title, 'boq_id', boq_id, minutes=2):
                    sent_count += 1  # Count as sent since a recent notification already exists
                    continue

                if approved:
                    notification = NotificationManager.create_notification(
                        user_id=user_id,
                        type='success',
                        title='BOQ Approved by Technical Director',
                        message=f'BOQ for {project_name} has been approved by {td_name}',
                        priority='high',
                        category='boq',
                        action_url=get_boq_view_url(user_id, boq_id, tab='approved'),
                        action_label='View BOQ',
                        metadata={'boq_id': boq_id, 'decision': 'approved', 'target_role': 'estimator'},
                        sender_id=td_id,
                        sender_name=td_name,
                        target_role='estimator'
                    )
                else:
                    notification = NotificationManager.create_notification(
                        user_id=user_id,
                        type='rejection',
                        title='BOQ Rejected by Technical Director',
                        message=f'BOQ for {project_name} was rejected by {td_name}. Reason: {rejection_reason or "No reason provided"}',
                        priority='high',
                        category='boq',
                        action_required=True,
                        action_url=get_boq_view_url(user_id, boq_id, tab='rejected'),
                        action_label='View Details',
                        metadata={'boq_id': boq_id, 'decision': 'rejected', 'reason': rejection_reason, 'target_role': 'estimator'},
                        sender_id=td_id,
                        sender_name=td_name,
                        target_role='estimator'
                    )

                send_notification_to_user(user_id, notification.to_dict())
                sent_count += 1

        except Exception as e:
            log.error(f"[notify_td_boq_decision] Error for BOQ {boq_id}: {e}")
            import traceback
            log.error(traceback.format_exc())
            raise  # Re-raise so caller can use fallback

    @staticmethod
    def notify_pm_assigned_to_project(project_id, project_name, td_id, td_name, pm_user_ids):
        """
        Notify PM(s) when assigned to project
        Trigger: TD assigns PM to project
        Recipients: Assigned PM(s)
        Priority: URGENT
        """
        try:
            for pm_user_id in pm_user_ids:
                # Check for duplicate notification
                if check_duplicate_notification(pm_user_id, 'Project Assigned', 'project_id', project_id, minutes=5):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=pm_user_id,
                    type='assignment',
                    title='New Project Assigned',
                    message=f'You have been assigned to project: {project_name} by {td_name}',
                    priority='urgent',
                    category='project',
                    action_required=True,
                    action_url=get_project_url(pm_user_id, project_id),
                    action_label='View Project',
                    metadata={'project_id': project_id},
                    sender_id=td_id,
                    sender_name=td_name
                )

                send_notification_to_user(pm_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending PM assignment notification: {e}")

    @staticmethod
    def notify_se_items_assigned(boq_id, project_name, pm_id, pm_name, se_user_id, items_count):
        """
        Notify Site Engineer when items are assigned
        Trigger: PM assigns items to SE
        Recipients: Assigned SE
        Priority: HIGH
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(se_user_id, 'Items Assigned', 'boq_id', boq_id, minutes=5):
                return

            notification = NotificationManager.create_notification(
                user_id=se_user_id,
                type='assignment',
                title='New Items Assigned',
                message=f'{pm_name} assigned {items_count} item(s) to you from project {project_name}',
                priority='high',
                category='assignment',
                action_required=True,
                action_url=build_notification_action_url(se_user_id, 'projects', {'boq_id': boq_id}, 'site-engineer'),
                action_label='View Items',
                metadata={'boq_id': boq_id, 'items_count': items_count},
                sender_id=pm_id,
                sender_name=pm_name
            )

            send_notification_to_user(se_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending item assignment notification: {e}")

    @staticmethod
    def notify_se_completion_request(boq_id, project_name, se_id, se_name, pm_user_id):
        """
        Notify PM when SE requests completion confirmation
        Trigger: SE completes items and requests PM confirmation
        Recipients: PM
        Priority: MEDIUM
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(pm_user_id, 'Completion Request', 'boq_id', boq_id, minutes=5):
                return

            notification = NotificationManager.create_notification(
                user_id=pm_user_id,
                type='update',
                title='Completion Request from Site Engineer',
                message=f'{se_name} has completed assigned items for {project_name} and requests confirmation',
                priority='medium',
                category='project',
                action_required=True,
                action_url=get_boq_approval_url(pm_user_id, boq_id),
                action_label='Confirm Completion',
                metadata={'boq_id': boq_id},
                sender_id=se_id,
                sender_name=se_name
            )

            send_notification_to_user(pm_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending completion request notification: {e}")

    @staticmethod
    def notify_pm_confirms_completion(boq_id, project_name, pm_id, pm_name, se_user_id):
        """
        Notify SE when PM confirms completion
        Trigger: PM confirms SE's completed items
        Recipients: SE
        Priority: MEDIUM
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(se_user_id, 'Completion Confirmed', 'boq_id', boq_id, minutes=5):
                return

            notification = NotificationManager.create_notification(
                user_id=se_user_id,
                type='success',
                title='Completion Confirmed',
                message=f'{pm_name} has confirmed completion of your items for {project_name}',
                priority='medium',
                category='project',
                action_url=build_notification_action_url(se_user_id, 'projects', {'boq_id': boq_id}, 'site-engineer'),
                action_label='View Project',
                metadata={'boq_id': boq_id},
                sender_id=pm_id,
                sender_name=pm_name
            )

            send_notification_to_user(se_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending completion confirmation: {e}")

    # ==================== CHANGE REQUEST WORKFLOW NOTIFICATIONS ====================

    @staticmethod
    def notify_cr_created(cr_id, project_name, creator_id, creator_name, creator_role, recipient_user_ids, recipient_role, request_type=None, has_new_materials=False):
        """
        Notify PM/TD when change request is created
        Trigger: SE/PM creates CR
        Recipients: PM if SE created, TD if PM created
        Priority: URGENT

        Args:
            has_new_materials: True if request contains new materials (master_material_id is None),
                             False if all materials are existing BOQ items
        """
        try:
            for user_id in recipient_user_ids:
                # Check for duplicate notification
                if check_duplicate_notification(user_id, 'Materials Purchase', 'cr_id', cr_id, minutes=5):
                    continue

                # Determine correct route based on recipient_role and request_type
                # Buyer uses 'purchase-orders' page for all CR/PO work
                # Estimator uses 'change-requests' page (they don't have /extra-material route)
                recipient_role_lower = (recipient_role or '').lower().replace(' ', '-').replace('_', '-')

                if recipient_role_lower == 'buyer':
                    # Buyer views purchase requests on purchase-orders page
                    route = 'purchase-orders'
                elif recipient_role_lower == 'estimator':
                    # Estimator ALWAYS goes to change-requests (they don't have /extra-material route)
                    route = 'change-requests'
                elif recipient_role_lower == 'project-manager':
                    # Project Manager ALWAYS goes to extra-material for material purchases
                    route = 'extra-material'
                elif recipient_role_lower == 'technical-director':
                    # Technical Director uses change-requests for approvals
                    route = 'change-requests'
                else:
                    # Fallback: use extra-material or change-requests based on request_type
                    route = 'extra-material' if request_type == 'EXTRA_MATERIALS' else 'change-requests'

                action_url = f'/{recipient_role_lower}/{route}?cr_id={cr_id}'

                # Determine notification title based on whether materials are new or existing BOQ items
                if has_new_materials:
                    title = 'New Materials Purchase Request'
                    message = f'{creator_name} ({creator_role}) created a new materials purchase request for {project_name}'
                else:
                    title = 'Existing BOQ Materials Purchase Request'
                    message = f'{creator_name} ({creator_role}) created an existing BOQ materials purchase request for {project_name}'

                notification = NotificationManager.create_notification(
                    user_id=user_id,
                    type='approval',
                    title=title,
                    message=message,
                    priority='urgent',
                    category='change_request',
                    action_required=True,
                    action_url=action_url,
                    action_label='Review Request',
                    metadata={'cr_id': cr_id, 'action_url': action_url, 'request_type': request_type, 'target_role': recipient_role_lower},
                    sender_id=creator_id,
                    sender_name=creator_name,
                    target_role=recipient_role_lower
                )

                send_notification_to_user(user_id, notification.to_dict())
        except Exception as e:
            log.error(f"[notify_cr_created] Error sending CR created notification for CR {cr_id}: {e}")
            import traceback
            log.error(f"[notify_cr_created] Traceback: {traceback.format_exc()}")

    @staticmethod
    def notify_cr_approved(cr_id, project_name, approver_id, approver_name, approver_role, next_user_ids, next_role, request_type=None):
        """
        Notify next approver when CR is approved
        Trigger: PM/TD/Estimator approves CR
        Recipients: Next approver in chain
        Priority: HIGH
        """
        try:
            # Determine correct route based on next_role and request_type
            # Buyer/Procurement uses 'purchase-orders' page for all CR/PO work
            # Estimator uses 'change-requests' page (they don't have /extra-material route)
            # Site Engineer/Supervisor ALWAYS use 'extra-material' page (they don't have /change-requests route)
            next_role_lower = (next_role or '').lower().replace(' ', '-').replace('_', '-')

            if next_role_lower in ['buyer', 'procurement']:
                # Buyer/Procurement views purchase requests on purchase-orders page
                route = 'purchase-orders'
            elif next_role_lower == 'estimator':
                # Estimator ALWAYS goes to change-requests (they don't have /extra-material route)
                route = 'change-requests'
            elif next_role_lower in ['site-engineer', 'site-supervisor']:
                # Site Engineers ALWAYS use extra-material page (they don't have access to change-requests)
                route = 'extra-material'
            elif next_role_lower == 'project-manager':
                # Project Manager ALWAYS goes to extra-material for material purchases
                route = 'extra-material'
            elif next_role_lower == 'technical-director':
                # Technical Director uses change-requests for approvals
                route = 'change-requests'
            else:
                # Fallback: use extra-material or change-requests based on request_type
                route = 'extra-material' if request_type == 'EXTRA_MATERIALS' else 'change-requests'

            for user_id in next_user_ids:
                # Check for duplicate notification
                if check_duplicate_notification(user_id, 'Request Approved', 'cr_id', cr_id, minutes=5):
                    continue

                # ✅ Set correct tab/subtab parameters based on role
                # Buyer/Procurement → Ongoing tab with Pending Purchase subtab
                # Others → Pending tab (default)
                if next_role_lower in ['buyer', 'procurement']:
                    query_params = {'cr_id': cr_id, 'tab': 'ongoing', 'subtab': 'pending_purchase'}
                else:
                    query_params = {'cr_id': cr_id, 'tab': 'pending'}

                # Use build_notification_action_url to properly map role to route prefix
                # (e.g., 'procurement' role maps to '/buyer' route)
                action_url = build_notification_action_url(
                    user_id=user_id,
                    base_page=route,
                    query_params=query_params,
                    fallback_role_route=next_role_lower
                )
                notification = NotificationManager.create_notification(
                    user_id=user_id,
                    type='approval',
                    title='New Purchase Request Assigned',
                    message=f'Materials purchase request for {project_name} was approved by {approver_name} ({approver_role}) and assigned to you for vendor selection',
                    priority='high',
                    category='change_request',
                    action_required=True,
                    action_url=action_url,
                    action_label='Select Vendor',
                    metadata={'cr_id': cr_id, 'request_type': request_type, 'target_role': next_role_lower},
                    sender_id=approver_id,
                    sender_name=approver_name,
                    target_role=next_role_lower
                )

                send_notification_to_user(user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending CR approved notification: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")

    @staticmethod
    def notify_cr_rejected(cr_id, project_name, rejector_id, rejector_name, rejector_role, creator_user_id, rejection_reason, request_type=None, creator_role=None, item_name=None):
        """
        Notify creator when CR is rejected
        Trigger: Any approver rejects CR
        Recipients: Original creator
        Priority: HIGH

        Email behaviour:
          - Creator is OFFLINE  → send email notification (user won't see real-time alert)
          - Creator is ONLINE   → skip email (real-time WebSocket notification is sufficient)
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(creator_user_id, 'Request Rejected', 'cr_id', cr_id, minutes=5):
                return

            # ✅ Generate dynamic URL based on recipient's actual role from database
            # Site Engineers ALWAYS use extra-material page (they don't have access to change-requests)
            from utils.role_route_mapper import get_user_role_route
            creator_role_route = get_user_role_route(creator_user_id)

            if creator_role_route in ['site-engineer', 'site-supervisor']:
                route = 'extra-material'
            else:
                route = 'extra-material' if request_type == 'EXTRA_MATERIALS' else 'change-requests'

            action_url = build_notification_action_url(
                user_id=creator_user_id,
                base_page=route,
                query_params={'cr_id': cr_id, 'tab': 'rejected'},
                fallback_role_route='site-engineer'  # Fallback if user role not found
            )
            notification = NotificationManager.create_notification(
                user_id=creator_user_id,
                type='rejection',
                title='Materials Purchase Rejected',
                message=f'Your materials purchase request for {project_name} was rejected by {rejector_name} ({rejector_role}). Reason: {rejection_reason}',
                priority='high',
                category='change_request',
                action_required=True,
                action_url=action_url,  # ✅ Now dynamic based on actual user role!
                action_label='View Details',
                metadata={'cr_id': cr_id, 'reason': rejection_reason, 'request_type': request_type},
                sender_id=rejector_id,
                sender_name=rejector_name
            )

            send_notification_to_user(creator_user_id, notification.to_dict())
            # ── Email: only send when the creator is OFFLINE ──────────────────
            try:
                creator_user = User.query.filter_by(user_id=creator_user_id, is_deleted=False).first()
                if creator_user:
                    is_online = creator_user.user_status == 'online'
                    if not is_online:
                        # User is offline – send email so they don't miss the rejection
                        from utils.boq_email_service import BOQEmailService
                        email_service = BOQEmailService()
                        sent = email_service.send_cr_rejection_notification(
                            cr_id=cr_id,
                            project_name=project_name,
                            rejector_name=rejector_name,
                            rejector_role=rejector_role,
                            recipient_email=creator_user.email,
                            recipient_name=creator_user.full_name or creator_user.email,
                            rejection_reason=rejection_reason,
                            item_name=item_name
                        )
                        if sent:
                            log.info(
                                f"[CR REJECT EMAIL] Email sent to offline user {creator_user.email} for CR {cr_id}"
                            )
                        else:
                            log.warning(
                                f"[CR REJECT EMAIL] Email sending failed for user {creator_user.email}, CR {cr_id}"
                            )
                    else:
                        log.info(
                            f"[CR REJECT EMAIL] Skipping email – creator (user_id={creator_user_id}) is ONLINE"
                        )
                else:
                    log.warning(f"[CR REJECT EMAIL] Creator user_id={creator_user_id} not found, skipping email")
            except Exception as email_err:
                log.error(f"[CR REJECT EMAIL] Failed to process email for CR {cr_id}: {email_err}")

        except Exception as e:
            log.error(f"Error sending CR rejected notification: {e}")

    @staticmethod
    def notify_vendor_selected_for_cr(cr_id, project_name, buyer_id, buyer_name, td_user_id, vendor_name, request_type=None):
        """
        Notify TD when buyer selects vendor for CR
        Trigger: Buyer selects vendor
        Recipients: TD
        Priority: URGENT
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(td_user_id, 'Vendor Selection', 'cr_id', cr_id, minutes=5):
                return

            notification = NotificationManager.create_notification(
                user_id=td_user_id,
                type='approval',
                title='Vendor Selection Requires Approval',
                message=f'{buyer_name} selected vendor "{vendor_name}" for materials purchase in {project_name}',
                priority='urgent',
                category='change_request',
                action_required=True,
                action_url=get_change_request_url(td_user_id, cr_id),
                action_label='Review Vendor',
                metadata={'cr_id': cr_id, 'vendor_name': vendor_name, 'request_type': request_type, 'target_role': 'technical-director'},
                sender_id=buyer_id,
                sender_name=buyer_name,
                target_role='technical-director'
            )

            send_notification_to_user(td_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending vendor selection notification: {e}")

    @staticmethod
    def notify_cr_purchase_completed(cr_id, project_name, buyer_id, buyer_name, requester_user_id, request_type=None, requester_role=None):
        """
        Notify requester when CR purchase is completed
        Trigger: Buyer completes purchase
        Recipients: Original CR creator
        Priority: MEDIUM
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(requester_user_id, 'Purchase Completed', 'cr_id', cr_id, minutes=5):
                return

            # ✅ Generate dynamic URL based on recipient's actual role from database
            # Site Engineers ALWAYS use extra-material page (they don't have access to change-requests)
            from utils.role_route_mapper import get_user_role_route
            requester_role_route = get_user_role_route(requester_user_id)

            if requester_role_route in ['site-engineer', 'site-supervisor']:
                route = 'extra-material'
            else:
                route = 'extra-material' if request_type == 'EXTRA_MATERIALS' else 'change-requests'

            action_url = build_notification_action_url(
                user_id=requester_user_id,
                base_page=route,
                query_params={'cr_id': cr_id, 'tab': 'completed'},
                fallback_role_route='site-engineer'  # Fallback if user role not found
            )

            notification = NotificationManager.create_notification(
                user_id=requester_user_id,
                type='success',
                title='Materials Purchase Completed',
                message=f'{buyer_name} completed the purchase for your materials request in {project_name}',
                priority='medium',
                category='change_request',
                action_url=action_url,  # ✅ Now dynamic based on actual user role!
                action_label='View Details',
                metadata={'cr_id': cr_id, 'request_type': request_type},
                sender_id=buyer_id,
                sender_name=buyer_name
            )

            send_notification_to_user(requester_user_id, notification.to_dict())
            # Email fallback for offline users (action_required -> must receive it)
            if ComprehensiveNotificationService.is_user_offline(requester_user_id):
                requester = User.query.get(requester_user_id)
                if requester and requester.email:
                    ComprehensiveNotificationService.send_email_notification(
                        recipient=requester.email,
                        subject=f'Materials Purchase Completed - {project_name}',
                        message=f'''
                        <h2>Materials Purchase Completed</h2>
                        <p>{buyer_name} has completed the purchase for your materials request in
                        <strong>{project_name}</strong>.</p>
                        <p>Materials have been routed to the M2 Store. The Production Manager will
                        receive them from the vendor and dispatch to your site.</p>
                        ''',
                        notification_type='cr_purchase_completed'
                    )
        except Exception as e:
            log.error(f"Error sending CR purchase completed notification: {e}")

    # ==================== DAY EXTENSION WORKFLOW NOTIFICATIONS ====================

    @staticmethod
    def notify_day_extension_requested(boq_id, project_name, pm_id, pm_name, td_user_id, days_requested, reason):
        """
        Notify TD when PM requests day extension
        Trigger: PM requests extension
        Recipients: TD
        Priority: URGENT
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(td_user_id, 'Extension Request', 'boq_id', boq_id, minutes=5):
                return

            notification = NotificationManager.create_notification(
                user_id=td_user_id,
                type='alert',
                title='Day Extension Request',
                message=f'{pm_name} requested {days_requested} day(s) extension for {project_name}. Reason: {reason}',
                priority='urgent',
                category='extension',
                action_required=True,
                action_url=get_td_approval_url(td_user_id, boq_id, tab='assigned', view_extension=True),
                action_label='Review Request',
                metadata={'boq_id': boq_id, 'days_requested': days_requested, 'reason': reason, 'view_extension': True},
                sender_id=pm_id,
                sender_name=pm_name
            )

            send_notification_to_user(td_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending day extension request notification: {e}")

    @staticmethod
    def notify_day_extension_approved(boq_id, project_name, td_id, td_name, pm_user_id, days_approved):
        """
        Notify PM when day extension is approved
        Trigger: TD approves extension
        Recipients: PM
        Priority: HIGH
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(pm_user_id, 'Extension Approved', 'boq_id', boq_id, minutes=5):
                return

            notification = NotificationManager.create_notification(
                user_id=pm_user_id,
                type='success',
                title='Day Extension Approved',
                message=f'{td_name} approved {days_approved} day(s) extension for {project_name}',
                priority='high',
                category='extension',
                action_url=get_boq_approval_url(pm_user_id, boq_id),
                action_label='View Project',
                metadata={'boq_id': boq_id, 'days_approved': days_approved},
                sender_id=td_id,
                sender_name=td_name
            )

            send_notification_to_user(pm_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending day extension approved notification: {e}")

    @staticmethod
    def notify_day_extension_rejected(boq_id, project_name, td_id, td_name, pm_user_id, rejection_reason):
        """
        Notify PM when day extension is rejected
        Trigger: TD rejects extension
        Recipients: PM
        Priority: HIGH
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(pm_user_id, 'Extension Rejected', 'boq_id', boq_id, minutes=5):
                return

            notification = NotificationManager.create_notification(
                user_id=pm_user_id,
                type='rejection',
                title='Day Extension Rejected',
                message=f'{td_name} rejected your day extension request for {project_name}. Reason: {rejection_reason}',
                priority='high',
                category='extension',
                action_required=True,
                action_url=get_boq_approval_url(pm_user_id, boq_id),
                action_label='View Details',
                metadata={'boq_id': boq_id, 'reason': rejection_reason},
                sender_id=td_id,
                sender_name=td_name
            )

            send_notification_to_user(pm_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending day extension rejected notification: {e}")

    # Labour notification methods are inherited from LabourNotificationMixin

    # ==================== VENDOR WORKFLOW NOTIFICATIONS ====================

    @staticmethod
    def notify_vendor_approved(vendor_id, vendor_name, td_id, td_name, buyer_user_id):
        """
        Notify buyer when vendor is approved
        Trigger: TD approves vendor
        Recipients: Buyer who created vendor
        Priority: MEDIUM
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(buyer_user_id, 'Vendor Approved', 'vendor_id', vendor_id, minutes=5):
                return

            notification = NotificationManager.create_notification(
                user_id=buyer_user_id,
                type='success',
                title='Vendor Approved',
                message=f'{td_name} approved vendor "{vendor_name}"',
                priority='medium',
                category='vendor',
                action_url=build_notification_action_url(buyer_user_id, 'vendors', {'vendor_id': vendor_id}, 'buyer'),
                action_label='View Vendor',
                metadata={'vendor_id': vendor_id},
                sender_id=td_id,
                sender_name=td_name,
                target_role='buyer'
            )

            send_notification_to_user(buyer_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending vendor approved notification: {e}")

    # ==================== REVISION WORKFLOW NOTIFICATIONS ====================

    @staticmethod
    def notify_internal_revision_created(boq_id, project_name, revision_number, actor_id, actor_name, actor_role):
        """
        Notify TD when an internal revision is created
        Trigger: Estimator/PM makes changes to BOQ (internal revision)
        Recipients: All Technical Directors
        Priority: HIGH
        """
        try:
            td_role = Role.query.filter(Role.role.ilike('%technical%director%')).first()
            if not td_role:
                log.warning("No Technical Director role found in database")
                return

            td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
            if not td_users:
                log.warning("No active Technical Director users found")
                return

            for td_user in td_users:
                try:
                    # CRITICAL FIX: Check duplicate by revision_number instead of boq_id
                    # This allows multiple revisions of the same BOQ to send notifications
                    # Only prevents accidental double-clicks (same revision sent twice)
                    if check_duplicate_notification(td_user.user_id, 'Internal Revision BOQ for Approval', 'internal_revision_number', revision_number, minutes=1):
                        log.warning(f"[notify_internal_revision_created] Duplicate notification detected for TD {td_user.user_id}, BOQ {boq_id}, Revision #{revision_number} - skipping to prevent spam")
                        continue

                    notification = NotificationManager.create_notification(
                        user_id=td_user.user_id,
                        type='approval',
                        title='Internal Revision BOQ for Approval',
                        message=f'Internal Revision BOQ for {project_name} (Revision #{revision_number}) requires your review. Submitted by {actor_name}',
                        priority='high',
                        category='boq',
                        action_required=True,
                        action_url=get_td_approval_url(td_user.user_id, boq_id, tab='revisions', subtab='internal'),
                        action_label='Review Revision',
                        metadata={'boq_id': boq_id, 'internal_revision_number': revision_number, 'target_role': 'technical_director'},
                        sender_id=actor_id,
                        sender_name=actor_name,
                        target_role='technical_director'
                    )

                    send_notification_to_user(td_user.user_id, notification.to_dict())

                except Exception as e:
                    log.error(f"[notify_internal_revision_created] Failed to send notification to TD {td_user.user_id} for BOQ {boq_id}: {e}")
                    import traceback
                    log.error(traceback.format_exc())
                    # Continue to next TD even if this one fails

        except Exception as e:
            log.error(f"Error sending internal revision notification: {e}")
            import traceback
            log.error(traceback.format_exc())

    @staticmethod
    def notify_internal_revision_approved(boq_id, project_name, revision_number, td_id, td_name, actor_user_id, actor_name):
        """
        Notify the person who created the revision when TD approves it
        Trigger: TD approves internal revision
        Recipients: User who made the revision
        Priority: HIGH
        """
        try:
            # Check for duplicate notification (reduced window to 2 minutes)
            if check_duplicate_notification(actor_user_id, 'Internal Revision Approved', 'boq_id', boq_id, minutes=2):
                return

            # Build URL to navigate to Internal Revisions tab
            from utils.role_route_mapper import build_notification_action_url
            action_url = build_notification_action_url(
                user_id=actor_user_id,
                base_page='projects',
                query_params={'boq_id': boq_id, 'tab': 'revisions', 'subtab': 'internal'},
                fallback_role_route='estimator'
            )

            notification = NotificationManager.create_notification(
                user_id=actor_user_id,
                type='success',
                title='Internal Revision Approved',
                message=f'Your internal revision #{revision_number} for {project_name} was approved by {td_name}',
                priority='high',
                category='boq',
                action_url=action_url,
                action_label='View BOQ',
                metadata={'boq_id': boq_id, 'internal_revision_number': revision_number, 'decision': 'approved', 'target_role': 'estimator'},
                sender_id=td_id,
                sender_name=td_name,
                target_role='estimator'
            )
            send_notification_to_user(actor_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"[notify_internal_revision_approved] Error for BOQ {boq_id}, user {actor_user_id}: {e}")
            import traceback
            log.error(traceback.format_exc())
            raise  # Re-raise so caller can use fallback

    @staticmethod
    def notify_internal_revision_rejected(boq_id, project_name, revision_number, td_id, td_name, actor_user_id, actor_name, rejection_reason):
        """
        Notify the person who created the revision when TD rejects it
        Trigger: TD rejects internal revision
        Recipients: User who made the revision
        Priority: HIGH
        """
        try:
            # Check for duplicate notification (reduced window to 2 minutes)
            if check_duplicate_notification(actor_user_id, 'Internal Revision Rejected', 'boq_id', boq_id, minutes=2):
                return  # Recent notification exists, caller should count as sent

            # Build URL to navigate to Internal Revisions tab
            from utils.role_route_mapper import build_notification_action_url
            action_url = build_notification_action_url(
                user_id=actor_user_id,
                base_page='projects',
                query_params={'boq_id': boq_id, 'tab': 'revisions', 'subtab': 'internal'},
                fallback_role_route='estimator'
            )

            notification = NotificationManager.create_notification(
                user_id=actor_user_id,
                type='rejection',
                title='Internal Revision Rejected',
                message=f'Your internal revision #{revision_number} for {project_name} was rejected by {td_name}. Reason: {rejection_reason}',
                priority='high',
                category='boq',
                action_required=True,
                action_url=action_url,
                action_label='View Details',
                metadata={'boq_id': boq_id, 'internal_revision_number': revision_number, 'decision': 'rejected', 'reason': rejection_reason, 'target_role': 'estimator'},
                sender_id=td_id,
                sender_name=td_name,
                target_role='estimator'
            )

            send_notification_to_user(actor_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"[notify_internal_revision_rejected] Error for BOQ {boq_id}, user {actor_user_id}: {e}")
            import traceback
            log.error(traceback.format_exc())
            raise  # Re-raise so caller can use fallback

    @staticmethod
    def notify_client_revision_created(boq_id, project_name, revision_number, actor_id, actor_name, actor_role):
        """
        Notify TD when estimator sends client revision BOQ for approval
        Trigger: Estimator sends client revision to TD after client rejection
        Recipients: All Technical Directors
        Priority: HIGH
        """
        try:
            # Find all Technical Directors
            from models.role import Role
            from models.user import User
            td_role = Role.query.filter_by(role='technicalDirector').first()
            if not td_role:
                log.warning("No Technical Director role found in database")
                return

            td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
            if not td_users:
                log.warning("No active Technical Director users found")
                return

            for td_user in td_users:
                try:
                    # CRITICAL FIX: Check duplicate by client_revision_number instead of boq_id
                    # This allows multiple revisions of the same BOQ to send notifications
                    # Only prevents accidental double-clicks (same revision sent twice)
                    if check_duplicate_notification(td_user.user_id, 'Client Revision BOQ for Approval', 'client_revision_number', revision_number, minutes=1):
                        log.warning(f"[notify_client_revision_created] Duplicate notification detected for TD {td_user.user_id}, BOQ {boq_id}, Revision R{revision_number} - skipping to prevent spam")
                        continue

                    notification = NotificationManager.create_notification(
                        user_id=td_user.user_id,
                        type='approval',
                        title='Client Revision BOQ for Approval',
                        message=f'Client Revision BOQ for {project_name} (Revision R{revision_number}) requires your review. Submitted by {actor_name}',
                        priority='high',
                        category='boq',
                        action_required=True,
                        action_url=get_td_approval_url(td_user.user_id, boq_id, tab='revisions', subtab='client'),
                        action_label='Review Revision',
                        metadata={'boq_id': boq_id, 'client_revision_number': revision_number, 'target_role': 'technical_director'},
                        sender_id=actor_id,
                        sender_name=actor_name,
                        target_role='technical_director'
                    )
                    send_notification_to_user(td_user.user_id, notification.to_dict())

                except Exception as e:
                    log.error(f"[notify_client_revision_created] Failed to send notification to TD {td_user.user_id} for BOQ {boq_id}: {e}")
                    import traceback
                    log.error(traceback.format_exc())
                    # Continue to next TD even if this one fails

        except Exception as e:
            log.error(f"Error sending client revision notification: {e}")
            import traceback
            log.error(traceback.format_exc())
            raise  # Re-raise so caller can use fallback

    @staticmethod
    def notify_client_revision_approved(boq_id, project_name, td_id, td_name, estimator_user_id, estimator_name, revision_number=None):
        """
        Notify estimator when TD approves client revision
        Trigger: TD approves client revision BOQ
        Recipients: Estimator who submitted revision
        Priority: HIGH
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(estimator_user_id, 'Client Revision Approved', 'boq_id', boq_id, minutes=5):
                return

            # Build message with revision number if available
            if revision_number and revision_number > 0:
                message = f'Client revision R{revision_number} for {project_name} has been approved by {td_name}'
            else:
                message = f'Client revision for {project_name} has been approved by {td_name}'

            notification = NotificationManager.create_notification(
                user_id=estimator_user_id,
                type='success',
                title='Client Revision Approved',
                message=message,
                priority='high',
                category='boq',
                action_url=get_boq_view_url(estimator_user_id, boq_id, tab='revisions'),
                action_label='View BOQ',
                metadata={'boq_id': boq_id, 'client_revision_approved': True, 'revision_number': revision_number, 'target_role': 'estimator'},
                sender_id=td_id,
                sender_name=td_name,
                target_role='estimator'
            )

            send_notification_to_user(estimator_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"[notify_client_revision_approved] Error for BOQ {boq_id}, estimator {estimator_user_id}: {e}")
            import traceback
            log.error(traceback.format_exc())
            raise  # Re-raise so caller can use fallback

    @staticmethod
    def notify_client_revision_rejected(boq_id, project_name, td_id, td_name, estimator_user_id, estimator_name, rejection_reason, revision_number=None):
        """
        Notify estimator when TD rejects client revision
        Trigger: TD rejects client revision BOQ
        Recipients: Estimator who submitted revision
        Priority: HIGH
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(estimator_user_id, 'Client Revision Rejected', 'boq_id', boq_id, minutes=5):
                return

            # Build message with revision number if available
            if revision_number and revision_number > 0:
                message = f'Client revision R{revision_number} for {project_name} was rejected by {td_name}. Reason: {rejection_reason}'
            else:
                message = f'Client revision for {project_name} was rejected by {td_name}. Reason: {rejection_reason}'

            notification = NotificationManager.create_notification(
                user_id=estimator_user_id,
                type='rejection',
                title='Client Revision Rejected',
                message=message,
                priority='high',
                category='boq',
                action_required=True,
                action_url=get_boq_view_url(estimator_user_id, boq_id, tab='revisions'),
                action_label='Make Changes',
                metadata={'boq_id': boq_id, 'client_revision_rejected': True, 'reason': rejection_reason, 'revision_number': revision_number, 'target_role': 'estimator'},
                sender_id=td_id,
                sender_name=td_name,
                target_role='estimator'
            )
            send_notification_to_user(estimator_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"[notify_client_revision_rejected] Error for BOQ {boq_id}, estimator {estimator_user_id}: {e}")
            import traceback
            log.error(traceback.format_exc())
            raise  # Re-raise so caller can use fallback

    # ==================== RETURNABLE ASSETS NOTIFICATIONS ====================

    @staticmethod
    def notify_adn_dispatched_to_se(adn_id, adn_number, project_id, project_name,
                                     item_count, total_quantity, category_summary,
                                     dispatched_by_name, se_user_ids):
        """
        Notify Site Engineer(s) when PM dispatches an Asset Delivery Note (ADN) to their site.
        Trigger: asset_dn_controller.py — dispatch_delivery_note() when status → IN_TRANSIT
        Recipients: SE assigned to the project (attention_to_id + site_supervisor_id)
        """
        try:
            for se_user_id in se_user_ids:
                if check_duplicate_notification(se_user_id, 'Assets Dispatched to Site', 'adn_id', adn_id, minutes=5):
                    continue

                action_url = build_notification_action_url(
                    user_id=se_user_id,
                    base_page='site-assets',
                    query_params={},
                    fallback_role_route='site-engineer'
                )

                notification = NotificationManager.create_notification(
                    user_id=se_user_id,
                    type='info',
                    title=f'Assets Dispatched to Site — {project_name}',
                    message=f'{dispatched_by_name} dispatched {adn_number} ({total_quantity} item(s): {category_summary}) to {project_name}. Assets are on the way.',
                    priority='normal',
                    category='assets',
                    action_required=True,
                    action_url=action_url,
                    action_label='View Deliveries',
                    metadata={
                        'adn_id': adn_id,
                        'adn_number': adn_number,
                        'project_id': project_id,
                        'project_name': project_name,
                        'item_count': item_count,
                        'total_quantity': total_quantity,
                        'workflow': 'adn_dispatched'
                    },
                    sender_name=dispatched_by_name
                )
                send_notification_to_user(se_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending ADN dispatched notification to SE: {e}")

    @staticmethod
    def notify_asset_dispatched(project_id, project_name, category_name, category_code, quantity,
                                 dispatched_by_name, se_user_ids, notes=None, item_codes=None):
        """
        Notify Site Engineer(s) when assets are dispatched to their project
        Trigger: Production Manager dispatches assets
        Recipients: Site Engineers assigned to the project
        Priority: NORMAL
        """
        try:
            # Build item details message
            if item_codes:
                items_text = f"Items: {', '.join(item_codes)}"
            else:
                items_text = f"Quantity: {quantity}"

            for se_user_id in se_user_ids:
                # Check for duplicate
                if check_duplicate_notification(se_user_id, f'Assets Dispatched', 'category_code', category_code, minutes=2):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=se_user_id,
                    type='info',
                    title=f'Assets Dispatched to Your Site',
                    message=f'{quantity} x {category_name} ({category_code}) dispatched to {project_name} by {dispatched_by_name}. {items_text}' + (f' Notes: {notes}' if notes else ''),
                    priority='normal',
                    category='assets',
                    action_required=False,
                    action_url=build_notification_action_url(se_user_id, 'site-assets', None, 'site-engineer'),
                    action_label='View Assets',
                    metadata={
                        'project_id': project_id,
                        'category_code': category_code,
                        'category_name': category_name,
                        'quantity': quantity,
                        'workflow': 'returnable_assets',
                        'action': 'dispatch'
                    },
                    sender_name=dispatched_by_name
                )

                send_notification_to_user(se_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending asset dispatch notification: {e}")

    @staticmethod
    def send_asset_received_notification(project_id, project_name, category_name, quantity,
                                          received_by, received_by_id):
        """
        Notify Production Manager when SE acknowledges receipt of dispatched assets
        Trigger: Site Engineer marks asset as received
        Recipients: Production Managers
        Priority: NORMAL
        """
        try:
            from models.user import User
            from models.role import Role

            # Get all Production Managers (join User with Role to query by role name)
            pm_users = User.query.join(Role, User.role_id == Role.role_id).filter(
                Role.role == 'productionManager',
                User.is_active == True,
                User.is_deleted == False
            ).all()
            pm_user_ids = [pm.user_id for pm in pm_users]

            for pm_user_id in pm_user_ids:
                notification = NotificationManager.create_notification(
                    user_id=pm_user_id,
                    type='success',
                    title=f'Asset Received at Site',
                    message=f'{received_by} confirmed receipt of {quantity} x {category_name} at {project_name}',
                    priority='normal',
                    category='assets',
                    action_required=False,
                    action_url=build_notification_action_url(pm_user_id, 'returnable-assets', None, 'production-manager'),
                    action_label='View Assets',
                    metadata={
                        'project_id': project_id,
                        'category_name': category_name,
                        'quantity': quantity,
                        'workflow': 'returnable_assets',
                        'action': 'received'
                    },
                    sender_name=received_by
                )

                send_notification_to_user(pm_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending asset received notification: {e}")

    @staticmethod
    def notify_asset_return_requested(project_id, project_name, category_name, category_code, quantity,
                                       condition, pm_user_ids, returned_by_name, damage_description=None):
        """
        Notify Production Manager when assets are returned from site
        Trigger: Site Engineer/PM initiates return
        Recipients: Production Managers
        Priority: NORMAL (HIGH if damaged)
        """
        try:
            priority = 'high' if condition in ['damaged', 'poor'] else 'normal'
            condition_text = f" (Condition: {condition})" if condition != 'good' else ''
            damage_text = f" Damage: {damage_description}" if damage_description else ''

            for pm_user_id in pm_user_ids:
                notification = NotificationManager.create_notification(
                    user_id=pm_user_id,
                    type='info' if condition == 'good' else 'warning',
                    title=f'Assets Returned from Site' if condition == 'good' else f'Damaged Assets Returned',
                    message=f'{quantity} x {category_name} ({category_code}) returned from {project_name} by {returned_by_name}.{condition_text}{damage_text}',
                    priority=priority,
                    category='assets',
                    action_required=condition in ['damaged', 'poor'],
                    action_url=build_notification_action_url(pm_user_id, 'returnable-assets', None, 'production-manager'),
                    action_label='Review Assets',
                    metadata={
                        'project_id': project_id,
                        'category_code': category_code,
                        'quantity': quantity,
                        'condition': condition,
                        'workflow': 'returnable_assets',
                        'action': 'return'
                    },
                    sender_name=returned_by_name
                )

                send_notification_to_user(pm_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending asset return notification: {e}")

    @staticmethod
    def notify_ardn_dispatched(ardn_id, ardn_number, project_id, project_name,
                               item_count, dispatched_by_name, dispatched_by_user_id=None):
        """
        Notify all Production Managers when SE dispatches an Asset Return Delivery Note (ARDN).
        Trigger: asset_dn_controller.py — dispatch_return_note() when status → IN_TRANSIT
        Recipients: All active Production Managers
        Priority: NORMAL
        """
        try:
            from models.role import Role
            pm_role = Role.query.filter_by(role='productionManager').first()
            if not pm_role:
                log.warning("productionManager role not found for ARDN dispatch notification")
                return

            pm_users = User.query.filter_by(
                role_id=pm_role.role_id,
                is_active=True,
                is_deleted=False
            ).all()

            for pm in pm_users:
                if check_duplicate_notification(pm.user_id, 'Asset Return In Transit', 'ardn_id', ardn_id, minutes=5):
                    continue

                action_url = build_notification_action_url(
                    user_id=pm.user_id,
                    base_page='returnable-assets/receive-returns',
                    query_params={},
                    fallback_role_route='production-manager'
                )

                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='info',
                    title=f'Asset Return In Transit — {project_name}',
                    message=f'{dispatched_by_name} dispatched {ardn_number} ({item_count} item(s)) returning from {project_name}. Please receive at store.',
                    priority='normal',
                    category='assets',
                    action_required=True,
                    action_url=action_url,
                    action_label='Receive Assets',
                    metadata={
                        'ardn_id': ardn_id,
                        'ardn_number': ardn_number,
                        'project_id': project_id,
                        'project_name': project_name,
                        'item_count': item_count,
                        'workflow': 'ardn_dispatched'
                    },
                    sender_name=dispatched_by_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending ARDN dispatched notification: {e}")

    @staticmethod
    def notify_ardn_created(ardn_id, ardn_number, project_id, project_name,
                            item_count, created_by_name):
        """
        Notify Production Managers when SE creates an Asset Return Delivery Note.
        Trigger: asset_dn_controller.py — create_return_note()
        Recipients: All active Production Managers
        """
        try:
            pm_role = Role.query.filter_by(role='productionManager').first()
            if not pm_role:
                log.warning("productionManager role not found for ARDN created notification")
                return

            pm_users = User.query.filter_by(
                role_id=pm_role.role_id,
                is_active=True,
                is_deleted=False
            ).all()

            for pm in pm_users:
                if check_duplicate_notification(pm.user_id, 'Asset Return Note Created', 'ardn_id', ardn_id, minutes=5):
                    continue

                action_url = build_notification_action_url(
                    user_id=pm.user_id,
                    base_page='returnable-assets/receive-returns',
                    query_params={},
                    fallback_role_route='production-manager'
                )

                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='info',
                    title=f'Asset Return Note Created — {project_name}',
                    message=f'{created_by_name} created return note {ardn_number} with {item_count} item(s) from {project_name}.',
                    priority='normal',
                    category='assets',
                    action_url=action_url,
                    action_label='View Returns',
                    metadata={
                        'ardn_id': ardn_id,
                        'ardn_number': ardn_number,
                        'project_id': project_id,
                        'project_name': project_name,
                        'item_count': item_count,
                        'workflow': 'ardn_created'
                    },
                    sender_name=created_by_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending ARDN created notification: {e}")

    @staticmethod
    def notify_ardn_issued(ardn_id, ardn_number, project_id, project_name,
                           item_count, issued_by_name):
        """
        Notify Production Managers when SE issues an Asset Return Delivery Note.
        Trigger: asset_dn_controller.py — issue_return_note()
        Recipients: All active Production Managers
        """
        try:
            pm_role = Role.query.filter_by(role='productionManager').first()
            if not pm_role:
                log.warning("productionManager role not found for ARDN issued notification")
                return

            pm_users = User.query.filter_by(
                role_id=pm_role.role_id,
                is_active=True,
                is_deleted=False
            ).all()

            for pm in pm_users:
                if check_duplicate_notification(pm.user_id, 'Asset Return Note Issued', 'ardn_id', ardn_id, minutes=5):
                    continue

                action_url = build_notification_action_url(
                    user_id=pm.user_id,
                    base_page='returnable-assets/receive-returns',
                    query_params={},
                    fallback_role_route='production-manager'
                )

                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='info',
                    title=f'Asset Return Note Issued — {project_name}',
                    message=f'{issued_by_name} issued return note {ardn_number} ({item_count} item(s)) from {project_name}. Pending dispatch.',
                    priority='normal',
                    category='assets',
                    action_url=action_url,
                    action_label='View Returns',
                    metadata={
                        'ardn_id': ardn_id,
                        'ardn_number': ardn_number,
                        'project_id': project_id,
                        'project_name': project_name,
                        'item_count': item_count,
                        'workflow': 'ardn_issued'
                    },
                    sender_name=issued_by_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending ARDN issued notification: {e}")

    @staticmethod
    def notify_asset_maintenance_complete(category_name, category_code, item_code, action,
                                           pm_user_ids, completed_by_name):
        """
        Notify when maintenance is completed (repaired or written off)
        Trigger: Maintenance action completed
        Recipients: Production Managers
        Priority: NORMAL
        """
        try:
            action_text = 'repaired and returned to stock' if action == 'repair' else 'written off'

            for pm_user_id in pm_user_ids:
                notification = NotificationManager.create_notification(
                    user_id=pm_user_id,
                    type='success' if action == 'repair' else 'warning',
                    title=f'Asset {action.title()} Complete',
                    message=f'{category_name} ({item_code or category_code}) has been {action_text} by {completed_by_name}',
                    priority='normal',
                    category='assets',
                    action_required=False,
                    action_url=build_notification_action_url(pm_user_id, 'returnable-assets', None, 'production-manager'),
                    action_label='View Assets',
                    metadata={
                        'category_code': category_code,
                        'item_code': item_code,
                        'action': action,
                        'workflow': 'returnable_assets'
                    },
                    sender_name=completed_by_name
                )

                send_notification_to_user(pm_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending maintenance complete notification: {e}")

    # ==================== ASSET DISPOSAL NOTIFICATIONS ====================

    @staticmethod
    def notify_asset_disposal_requested(disposal_id, category_name, quantity, disposal_reason,
                                         requested_by_name):
        """
        Notify Technical Directors when PM requests asset disposal approval.
        Trigger: asset_disposal_controller.py — create_disposal_request() / request_catalog_disposal()
        Recipients: All active Technical Directors
        """
        try:
            td_role = Role.query.filter_by(role='technicalDirector').first()
            if not td_role:
                log.warning("technicalDirector role not found for disposal request notification")
                return

            td_users = User.query.filter_by(
                role_id=td_role.role_id,
                is_active=True,
                is_deleted=False
            ).all()

            for td in td_users:
                if check_duplicate_notification(td.user_id, 'Asset Disposal Request', 'disposal_id', disposal_id, minutes=5):
                    continue

                action_url = build_notification_action_url(
                    user_id=td.user_id,
                    base_page='asset-disposal-approvals',
                    query_params={},
                    fallback_role_route='technical-director'
                )

                notification = NotificationManager.create_notification(
                    user_id=td.user_id,
                    type='approval',
                    title='Asset Disposal Request — Approval Needed',
                    message=f'{requested_by_name} requests disposal of {quantity}x {category_name}. Reason: {disposal_reason}',
                    priority='high',
                    category='assets',
                    action_required=True,
                    action_url=action_url,
                    action_label='Review Disposal',
                    metadata={
                        'disposal_id': disposal_id,
                        'category_name': category_name,
                        'quantity': quantity,
                        'workflow': 'asset_disposal_request'
                    },
                    sender_name=requested_by_name
                )
                send_notification_to_user(td.user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending asset disposal request notification: {e}")

    @staticmethod
    def notify_asset_disposal_approved(disposal_id, category_name, quantity,
                                        approved_by_name, pm_user_id):
        """
        Notify Production Manager when TD approves asset disposal.
        Trigger: asset_disposal_controller.py — approve_disposal()
        Recipients: The PM who requested the disposal
        """
        try:
            if check_duplicate_notification(pm_user_id, 'Asset Disposal Approved', 'disposal_id', disposal_id, minutes=5):
                return

            action_url = build_notification_action_url(
                user_id=pm_user_id,
                base_page='returnable-assets',
                query_params={},
                fallback_role_route='production-manager'
            )

            notification = NotificationManager.create_notification(
                user_id=pm_user_id,
                type='success',
                title='Asset Disposal Approved',
                message=f'{approved_by_name} approved disposal of {quantity}x {category_name}. Inventory has been reduced.',
                priority='normal',
                category='assets',
                action_url=action_url,
                action_label='View Assets',
                metadata={
                    'disposal_id': disposal_id,
                    'category_name': category_name,
                    'quantity': quantity,
                    'workflow': 'asset_disposal_approved'
                },
                sender_name=approved_by_name
            )
            send_notification_to_user(pm_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending asset disposal approved notification: {e}")

    @staticmethod
    def notify_asset_disposal_rejected(disposal_id, category_name, quantity, action,
                                        rejected_by_name, review_notes, pm_user_id):
        """
        Notify Production Manager when TD rejects asset disposal.
        Trigger: asset_disposal_controller.py — reject_disposal()
        Recipients: The PM who requested the disposal
        """
        try:
            if check_duplicate_notification(pm_user_id, 'Asset Disposal Rejected', 'disposal_id', disposal_id, minutes=5):
                return

            action_text = 'returned to stock' if action == 'return_to_stock' else 'sent back for repair'

            action_url = build_notification_action_url(
                user_id=pm_user_id,
                base_page='returnable-assets',
                query_params={},
                fallback_role_route='production-manager'
            )

            notification = NotificationManager.create_notification(
                user_id=pm_user_id,
                type='rejection',
                title='Asset Disposal Rejected',
                message=f'{rejected_by_name} rejected disposal of {quantity}x {category_name}. Asset {action_text}.' + (f' Notes: {review_notes}' if review_notes else ''),
                priority='high',
                category='assets',
                action_required=True,
                action_url=action_url,
                action_label='View Assets',
                metadata={
                    'disposal_id': disposal_id,
                    'category_name': category_name,
                    'quantity': quantity,
                    'action': action,
                    'workflow': 'asset_disposal_rejected'
                },
                sender_name=rejected_by_name
            )
            send_notification_to_user(pm_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending asset disposal rejected notification: {e}")

    # ==================== ASSET REQUISITION NOTIFICATIONS ====================

    @staticmethod
    def notify_asset_requisition_created(requisition_id, requisition_code, project_id, project_name,
                                          asset_name, quantity, se_user_id, se_name, pm_user_ids):
        """
        Notify PM when SE creates an asset requisition
        Trigger: Site Engineer creates asset requisition
        Recipients: Project Managers assigned to the project
        Priority: HIGH
        """
        try:
            for pm_user_id in pm_user_ids:
                # Check for duplicate
                if check_duplicate_notification(pm_user_id, 'New Asset Requisition', 'requisition_id', requisition_id, minutes=5):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=pm_user_id,
                    type='approval',
                    title='New Asset Requisition',
                    message=f'{se_name} requested {quantity}x {asset_name} for {project_name}',
                    priority='high',
                    category='asset_requisition',
                    action_required=True,
                    action_url=build_notification_action_url(pm_user_id, 'asset-requisition-approvals', {'tab': 'pending'}, 'project-manager'),
                    action_label='Review Request',
                    metadata={
                        'requisition_id': requisition_id,
                        'requisition_code': requisition_code,
                        'project_id': project_id,
                        'asset_name': asset_name,
                        'workflow': 'asset_requisition'
                    },
                    sender_id=se_user_id,
                    sender_name=se_name
                )

                send_notification_to_user(pm_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending asset requisition created notification: {e}")

    @staticmethod
    def notify_asset_requisition_pm_approved(requisition_id, requisition_code, project_name,
                                              asset_name, pm_user_id, pm_name, prod_mgr_user_ids):
        """
        Notify Production Manager when PM approves requisition
        Trigger: Project Manager approves asset requisition
        Recipients: Production Managers
        Priority: HIGH
        """
        try:
            for prod_mgr_id in prod_mgr_user_ids:
                # Check for duplicate
                if check_duplicate_notification(prod_mgr_id, 'Asset Requisition Needs Approval', 'requisition_id', requisition_id, minutes=5):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=prod_mgr_id,
                    type='approval',
                    title='Asset Requisition Needs Approval',
                    message=f'PM {pm_name} approved requisition for {asset_name} ({project_name}). Please review.',
                    priority='high',
                    category='asset_requisition',
                    action_required=True,
                    action_url=build_notification_action_url(prod_mgr_id, 'returnable-assets/dispatch', {}, 'production-manager'),
                    action_label='Review Request',
                    metadata={
                        'requisition_id': requisition_id,
                        'requisition_code': requisition_code,
                        'workflow': 'asset_requisition'
                    },
                    sender_id=pm_user_id,
                    sender_name=pm_name
                )

                send_notification_to_user(prod_mgr_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending PM approved notification: {e}")

    @staticmethod
    def notify_asset_requisition_pm_rejected(requisition_id, requisition_code, project_name,
                                              asset_name, pm_user_id, pm_name, se_user_id, rejection_reason):
        """
        Notify SE when PM rejects their requisition
        Trigger: Project Manager rejects asset requisition
        Recipients: Site Engineer who created the requisition
        Priority: HIGH
        """
        try:
            notification = NotificationManager.create_notification(
                user_id=se_user_id,
                type='error',
                title='Asset Requisition Rejected',
                message=f'Your request for {asset_name} was rejected by PM {pm_name}. Reason: {rejection_reason}',
                priority='high',
                category='asset_requisition',
                action_required=False,
                action_url=build_notification_action_url(se_user_id, 'site-assets', {'status': 'rejected'}, 'site-engineer'),
                action_label='View Details',
                metadata={
                    'requisition_id': requisition_id,
                    'requisition_code': requisition_code,
                    'rejection_reason': rejection_reason,
                    'workflow': 'asset_requisition'
                },
                sender_id=pm_user_id,
                sender_name=pm_name
            )

            send_notification_to_user(se_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending PM rejected notification: {e}")

    @staticmethod
    def notify_asset_requisition_prod_mgr_approved(requisition_id, requisition_code, project_name,
                                                    asset_name, prod_mgr_user_id, prod_mgr_name, se_user_id):
        """
        Notify SE when Production Manager approves their requisition (ready for dispatch)
        Trigger: Production Manager approves asset requisition
        Recipients: Site Engineer who created the requisition
        Priority: HIGH
        """
        try:
            notification = NotificationManager.create_notification(
                user_id=se_user_id,
                type='success',
                title='Asset Requisition Approved',
                message=f'Your request for {asset_name} has been approved and is ready for dispatch!',
                priority='high',
                category='asset_requisition',
                action_required=False,
                action_url=build_notification_action_url(se_user_id, 'site-assets', {'status': 'approved'}, 'site-engineer'),
                action_label='View Status',
                metadata={
                    'requisition_id': requisition_id,
                    'requisition_code': requisition_code,
                    'workflow': 'asset_requisition'
                },
                sender_id=prod_mgr_user_id,
                sender_name=prod_mgr_name
            )

            send_notification_to_user(se_user_id, notification.to_dict())

        except Exception as e:
            log.error(f"Error sending Prod Mgr approved notification: {e}")

    @staticmethod
    def notify_asset_requisition_prod_mgr_rejected(requisition_id, requisition_code, project_name,
                                                    asset_name, prod_mgr_user_id, prod_mgr_name,
                                                    se_user_id, rejection_reason):
        """
        Notify SE when Production Manager rejects their requisition
        Trigger: Production Manager rejects asset requisition
        Recipients: Site Engineer who created the requisition
        Priority: HIGH
        """
        try:
            notification = NotificationManager.create_notification(
                user_id=se_user_id,
                type='error',
                title='Asset Requisition Rejected',
                message=f'Your request for {asset_name} was rejected by Production Manager. Reason: {rejection_reason}',
                priority='high',
                category='asset_requisition',
                action_required=False,
                action_url=build_notification_action_url(se_user_id, 'site-assets', {'status': 'rejected'}, 'site-engineer'),
                action_label='View Details',
                metadata={
                    'requisition_id': requisition_id,
                    'requisition_code': requisition_code,
                    'rejection_reason': rejection_reason,
                    'workflow': 'asset_requisition'
                },
                sender_id=prod_mgr_user_id,
                sender_name=prod_mgr_name
            )

            send_notification_to_user(se_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending Prod Mgr rejected notification: {e}")

    @staticmethod
    def notify_asset_requisition_dispatched(requisition_id, requisition_code, project_name,
                                             asset_name, quantity, prod_mgr_user_id, prod_mgr_name, se_user_id):
        """
        Notify SE when Production Manager dispatches the asset
        Trigger: Production Manager dispatches approved asset requisition
        Recipients: Site Engineer who created the requisition
        Priority: HIGH
        """
        try:
            notification = NotificationManager.create_notification(
                user_id=se_user_id,
                type='info',
                title='Asset Dispatched',
                message=f'{quantity}x {asset_name} has been dispatched to {project_name}. Please confirm upon receipt.',
                priority='high',
                category='asset_requisition',
                action_required=True,
                action_url=build_notification_action_url(se_user_id, 'site-assets', {'status': 'dispatched'}, 'site-engineer'),
                action_label='Confirm Receipt',
                metadata={
                    'requisition_id': requisition_id,
                    'requisition_code': requisition_code,
                    'quantity': quantity,
                    'workflow': 'asset_requisition'
                },
                sender_id=prod_mgr_user_id,
                sender_name=prod_mgr_name
            )

            send_notification_to_user(se_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending dispatched notification: {e}")

    # ==================== INVENTORY BACKUP STOCK NOTIFICATIONS ====================

    @staticmethod
    def notify_material_added_to_backup(
        material_name, material_code, quantity, unit, condition_notes,
        return_id, reviewed_by_name, site_engineer_id=None
    ):
        """
        Notify relevant users when material is added to backup stock
        Trigger: PM reviews damaged return and adds to backup stock
        Recipients: Site Engineer who returned it (if available), Production Manager role
        """
        try:
            # Get all Production Managers
            pm_role = Role.query.filter_by(role='productionManager').first()
            pm_users = []
            if pm_role:
                pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True, is_deleted=False).all()

            # Notify Production Managers
            for pm in pm_users:
                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='info',
                    title='Material Added to Backup Stock',
                    message=f'{quantity} {unit} of {material_name} ({material_code}) added to backup stock by {reviewed_by_name}. Condition: {condition_notes[:50] if condition_notes else "N/A"}...',
                    priority='normal',
                    category='inventory',
                    action_required=False,
                    action_url='/production-manager/stock-management?tab=stock-in&subtab=backup',
                    action_label='View Backup Stock',
                    metadata={
                        'return_id': return_id,
                        'material_code': material_code,
                        'quantity': quantity,
                        'unit': unit,
                        'workflow': 'backup_stock'
                    },
                    sender_name=reviewed_by_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())

            # Also notify the Site Engineer who returned it (if available)
            if site_engineer_id:
                notification = NotificationManager.create_notification(
                    user_id=site_engineer_id,
                    type='success',
                    title='Returned Material Added to Backup',
                    message=f'Your returned material {material_name} ({quantity} {unit}) has been added to backup stock. It can still be used for non-critical applications.',
                    priority='normal',
                    category='inventory',
                    action_required=False,
                    action_url='/site-engineer/material-receipts',
                    action_label='View Materials',
                    metadata={
                        'return_id': return_id,
                        'material_code': material_code,
                        'workflow': 'backup_stock'
                    },
                    sender_name=reviewed_by_name
                )
                send_notification_to_user(site_engineer_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending backup stock notification: {e}")

    @staticmethod
    def notify_material_disposal_approved(
        material_name, material_code, quantity, unit, disposal_value,
        return_id, reviewed_by_name, site_engineer_id=None
    ):
        """
        Notify relevant users when material is approved for disposal
        Trigger: PM reviews damaged return and approves disposal
        Recipients: Site Engineer who returned it (if available), Production Manager role
        """
        try:
            # Get all Production Managers
            pm_role = Role.query.filter_by(role='productionManager').first()
            pm_users = []
            if pm_role:
                pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True, is_deleted=False).all()

            # Notify Production Managers
            for pm in pm_users:
                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='warning',
                    title='Material Approved for Disposal',
                    message=f'{quantity} {unit} of {material_name} ({material_code}) approved for disposal. Write-off value: {disposal_value}',
                    priority='normal',
                    category='inventory',
                    action_required=False,
                    action_url='/production-manager/stock-management?tab=stock-in&subtab=returns',
                    action_label='View Returns',
                    metadata={
                        'return_id': return_id,
                        'material_code': material_code,
                        'quantity': quantity,
                        'disposal_value': disposal_value,
                        'workflow': 'material_disposal'
                    },
                    sender_name=reviewed_by_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())

            # Notify Site Engineer
            if site_engineer_id:
                notification = NotificationManager.create_notification(
                    user_id=site_engineer_id,
                    type='warning',
                    title='Returned Material Marked for Disposal',
                    message=f'Your returned material {material_name} ({quantity} {unit}) has been approved for disposal due to damage.',
                    priority='normal',
                    category='inventory',
                    action_required=False,
                    action_url='/site-engineer/material-receipts',
                    action_label='View Materials',
                    metadata={
                        'return_id': return_id,
                        'material_code': material_code,
                        'workflow': 'material_disposal'
                    },
                    sender_name=reviewed_by_name
                )
                send_notification_to_user(site_engineer_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending disposal notification: {e}")

    @staticmethod
    def notify_damaged_return_needs_review(
        material_name, material_code, quantity, unit, condition,
        return_id, project_name, returned_by_name
    ):
        """
        Notify Production Managers when a damaged/defective material return needs review
        Trigger: Site Engineer returns damaged material
        Recipients: All Production Managers
        """
        try:
            # Get all Production Managers
            pm_role = Role.query.filter_by(role='productionManager').first()
            if not pm_role:
                log.warning("Production Manager role not found")
                return

            pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True, is_deleted=False).all()

            for pm in pm_users:
                # Check for duplicate
                if check_duplicate_notification(pm.user_id, 'Damaged Material Return', 'return_id', return_id):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='warning',
                    title='Damaged Material Return - Review Required',
                    message=f'{quantity} {unit} of {material_name} ({material_code}) returned as {condition} from {project_name}. Please review and decide: dispose or add to backup stock.',
                    priority='urgent',
                    category='inventory',
                    action_required=True,
                    action_url='/production-manager/stock-management?tab=stock-in&subtab=returns',
                    action_label='Review Return',
                    metadata={
                        'return_id': return_id,
                        'material_code': material_code,
                        'quantity': quantity,
                        'condition': condition,
                        'project_name': project_name,
                        'workflow': 'material_return_review'
                    },
                    sender_name=returned_by_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())
                # Email fallback -- PM must review damaged material (urgent action required)
                if ComprehensiveNotificationService.is_user_offline(pm.user_id):
                    if pm.email:
                        from utils.email_styles import build_material_email
                        email_body = build_material_email(
                            header_title='Damaged Material Return',
                            status_label='Review Required',
                            status_variant='urgent',
                            project_name=project_name,
                            detail_rows=[
                                ('Material', f'{material_name} ({material_code})'),
                                ('Quantity', f'{quantity} {unit}'),
                                ('Condition', condition),
                                ('Returned By', returned_by_name),
                            ],
                            detail_title='Return Details',
                            action_message='Please log in and go to <strong>M2 Store &rarr; Stock In &rarr; Returns</strong> '
                                           'to decide: dispose or add to backup stock.',
                            action_variant='urgent',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=pm.email,
                            subject=f'Damaged Material Return - Review Required [{project_name}]',
                            message=email_body,
                            notification_type='damaged_return_review'
                        )
        except Exception as e:
            log.error(f"Error sending damaged return notification: {e}")

    @staticmethod
    def notify_return_approved_to_stock(
        material_name, material_code, quantity, unit,
        return_id, approved_by_name, site_engineer_id
    ):
        """
        Notify Site Engineer when their material return is approved and added to stock
        Trigger: PM approves good condition return
        Recipients: Site Engineer who created the return
        """
        try:
            if not site_engineer_id:
                return

            notification = NotificationManager.create_notification(
                user_id=site_engineer_id,
                type='success',
                title='Material Return Approved',
                message=f'Your return of {quantity} {unit} of {material_name} ({material_code}) has been approved and added back to stock.',
                priority='normal',
                category='inventory',
                action_required=False,
                action_url='/site-engineer/material-receipts',
                action_label='View Materials',
                metadata={
                    'return_id': return_id,
                    'material_code': material_code,
                    'workflow': 'material_return'
                },
                sender_name=approved_by_name
            )
            send_notification_to_user(site_engineer_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending return approved notification: {e}")

    @staticmethod
    def notify_return_rejected(
        material_name, material_code, quantity, unit,
        return_id, rejected_by_name, rejection_reason, site_engineer_id
    ):
        """
        Notify Site Engineer when their material return is rejected
        Trigger: PM rejects a return
        Recipients: Site Engineer who created the return
        """
        try:
            if not site_engineer_id:
                return

            notification = NotificationManager.create_notification(
                user_id=site_engineer_id,
                type='error',
                title='Material Return Rejected',
                message=f'Your return of {quantity} {unit} of {material_name} ({material_code}) was rejected. Reason: {rejection_reason or "Not specified"}',
                priority='normal',
                category='inventory',
                action_required=False,
                action_url='/site-engineer/material-receipts',
                action_label='View Materials',
                metadata={
                    'return_id': return_id,
                    'material_code': material_code,
                    'rejection_reason': rejection_reason,
                    'workflow': 'material_return'
                },
                sender_name=rejected_by_name
            )
            send_notification_to_user(site_engineer_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending return rejected notification: {e}")

    @staticmethod
    def notify_delivery_note_dispatched(
        delivery_note_number, project_name, materials_summary,
        dispatched_by_name, site_engineer_ids, buyer_user_id=None,
        vehicle_number=None, driver_name=None, driver_contact=None,
        cr_id=None, materials_items=None
    ):
        """
        Notify Site Engineers + Buyer when materials are dispatched (IN_TRANSIT)
        Trigger: PM dispatches delivery note in dispatch_delivery_note()
        Recipients: Site Engineers assigned to project, Buyer who purchased

        Args:
            materials_items: Optional list of dicts with material_name, quantity, unit, brand, size
                             for rendering a full materials table in the email.
        """
        try:
            transport_info = ''
            if vehicle_number:
                transport_info += f' Vehicle: {vehicle_number}.'
            if driver_name:
                transport_info += f' Driver: {driver_name}'
            if driver_contact:
                transport_info += f' ({driver_contact})'

            # Notify all Site Engineers
            for se_id in (site_engineer_ids or []):
                # Guard: skip if SE was already notified about this delivery note within 10 minutes
                if check_duplicate_notification(se_id, 'Materials In Transit to Your Site', 'delivery_note_number', delivery_note_number, minutes=10):
                    log.info(f"Skipping duplicate dispatch notification for SE {se_id}, DN {delivery_note_number}")
                    continue
                notification = NotificationManager.create_notification(
                    user_id=se_id,
                    type='delivery_note_dispatched',
                    title=f'Materials In Transit to Your Site - {project_name}',
                    message=f'Delivery Note {delivery_note_number} dispatched to {project_name}.{transport_info} Materials: {str(materials_summary)[:100]}.',
                    priority='high',
                    category='inventory',
                    action_required=True,
                    action_url=f'/site-engineer/material-receipts?tab=pending',
                    action_label='View Incoming Deliveries',
                    metadata={
                        'delivery_note_number': delivery_note_number,
                        'project_name': project_name,
                        'vehicle_number': vehicle_number,
                        'driver_name': driver_name,
                        'driver_contact': driver_contact,
                        'cr_id': cr_id,
                        'workflow': 'delivery_note_dispatched',
                        'target_role': 'site-engineer'
                    },
                    sender_name=dispatched_by_name
                )
                send_notification_to_user(se_id, notification.to_dict())

            # Notify Buyer
            if buyer_user_id and not check_duplicate_notification(buyer_user_id, 'Materials Dispatched to Site', 'delivery_note_number', delivery_note_number, minutes=10):
                buyer_notification = NotificationManager.create_notification(
                    user_id=buyer_user_id,
                    type='delivery_note_dispatched',
                    title=f'Materials Dispatched to Site - {project_name}',
                    message=f'Delivery Note {delivery_note_number} is in transit to {project_name}.{transport_info}',
                    priority='normal',
                    category='inventory',
                    action_required=False,
                    action_url=f'/buyer/purchase-orders?tab=ongoing&subtab=store_approved',
                    action_label='View Purchase Orders',
                    metadata={
                        'delivery_note_number': delivery_note_number,
                        'project_name': project_name,
                        'cr_id': cr_id,
                        'workflow': 'delivery_note_dispatched',
                        'target_role': 'buyer'
                    },
                    sender_name=dispatched_by_name
                )
                send_notification_to_user(buyer_user_id, buyer_notification.to_dict())

            # Send professional emails to SE(s) and Buyer
            try:
                from utils.email_styles import build_material_email
                from datetime import datetime

                transport_rows = []
                if vehicle_number:
                    transport_rows.append(('Vehicle', vehicle_number))
                if driver_name:
                    transport_rows.append(('Driver', driver_name))
                if driver_contact:
                    transport_rows.append(('Driver Contact', driver_contact))
                transport_rows.append(('Dispatched By', dispatched_by_name))

                date_str = datetime.utcnow().strftime('%d %b %Y, %I:%M %p')

                for se_id in (site_engineer_ids or []):
                    se = User.query.get(se_id)
                    if se and se.email:
                        email_body = build_material_email(
                            header_title='Materials Dispatched to Your Site',
                            status_label='In Transit',
                            status_variant='info',
                            reference_number=delivery_note_number,
                            reference_label='Delivery Note',
                            project_name=project_name,
                            date_str=date_str,
                            detail_rows=transport_rows,
                            detail_title='Transport Details',
                            materials=materials_items,
                            materials_summary=str(materials_summary)[:300] if not materials_items else None,
                            action_message='Please confirm receipt once the delivery arrives at your site.',
                            action_variant='info',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=se.email,
                            subject=f'Materials In Transit - {project_name}',
                            message=email_body,
                            notification_type='delivery_note_dispatched'
                        )

                if buyer_user_id:
                    buyer = User.query.get(buyer_user_id)
                    if buyer and buyer.email:
                        email_body = build_material_email(
                            header_title='Materials In Transit',
                            status_label='Dispatched',
                            status_variant='info',
                            reference_number=delivery_note_number,
                            reference_label='Delivery Note',
                            project_name=project_name,
                            date_str=date_str,
                            detail_rows=transport_rows,
                            detail_title='Transport Details',
                            materials=materials_items,
                            materials_summary=str(materials_summary)[:300] if not materials_items else None,
                            action_message='You will be notified once the delivery is confirmed at site.',
                            action_variant='info',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=buyer.email,
                            subject=f'Materials Dispatched to Site - {project_name}',
                            message=email_body,
                            notification_type='delivery_note_dispatched'
                        )
            except Exception as email_err:
                log.error(f"Failed to send dispatch email: {email_err}")

        except Exception as e:
            log.error(f"Error sending dispatch notification: {e}")

    @staticmethod
    def notify_imr_approved(
        request_number, project_name, materials_summary,
        approved_by_name, buyer_user_id, cr_id=None
    ):
        """
        Notify Buyer when PM approves their Internal Material Request
        Trigger: PM approves IMR in approve_internal_request()
        Recipients: Buyer who routed the materials
        """
        try:
            notification = NotificationManager.create_notification(
                user_id=buyer_user_id,
                type='imr_approved',
                title=f'Material Request Approved - {project_name}',
                message=f'{approved_by_name} approved material request #{request_number} for {project_name}. Materials: {str(materials_summary)[:100]}. Being prepared for dispatch to site.',
                priority='normal',
                category='inventory',
                action_required=False,
                action_url=f'/buyer/purchase-orders?tab=ongoing&subtab=store_approved',
                action_label='View Purchase Orders',
                metadata={
                    'request_number': request_number,
                    'project_name': project_name,
                    'cr_id': cr_id,
                    'workflow': 'imr_approval',
                    'target_role': 'buyer'
                },
                sender_name=approved_by_name
            )
            send_notification_to_user(buyer_user_id, notification.to_dict())

            # Send professional email (catches offline users)
            try:
                from utils.email_styles import build_material_email
                from datetime import datetime

                buyer = User.query.get(buyer_user_id)
                if buyer and buyer.email:
                    email_body = build_material_email(
                        header_title='Material Request Approved',
                        status_label='Approved',
                        status_variant='success',
                        reference_number=f'#{request_number}',
                        reference_label='Request',
                        project_name=project_name,
                        date_str=datetime.utcnow().strftime('%d %b %Y, %I:%M %p'),
                        detail_rows=[('Approved By', approved_by_name)],
                        detail_title='Approval Details',
                        materials_summary=str(materials_summary)[:300],
                        action_message='Materials are being prepared for dispatch to site. '
                                       'You can track progress in your Purchase Orders.',
                        action_variant='info',
                    )
                    ComprehensiveNotificationService.send_email_notification(
                        recipient=buyer.email,
                        subject=f'Material Request Approved - {project_name}',
                        message=email_body,
                        notification_type='imr_approved'
                    )
            except Exception as email_err:
                log.error(f"Failed to send IMR approved email: {email_err}")
        except Exception as e:
            log.error(f"Error sending IMR approved notification: {e}")

    @staticmethod
    def notify_imr_dispatched(
        request_number, project_name, materials_summary,
        dispatched_by_name, site_engineer_ids, buyer_user_id=None,
        dispatch_date=None, expected_delivery_date=None, request_id=None
    ):
        """
        Notify Site Engineers (and optionally Buyer) when PM dispatches material to site.
        Trigger: dispatch_material() in inventory_controller.py
        Recipients: Site Engineers assigned to the project, Buyer who raised the request
        """
        try:
            dispatch_date_str = dispatch_date.strftime('%d %b %Y') if dispatch_date else 'Today'
            delivery_str = expected_delivery_date.strftime('%d %b %Y') if expected_delivery_date else 'N/A'

            # Notify each Site Engineer
            for se_id in (site_engineer_ids or []):
                try:
                    notification = NotificationManager.create_notification(
                        user_id=se_id,
                        type='imr_dispatched',
                        title=f'Materials Dispatched - {project_name}',
                        message=(
                            f'{dispatched_by_name} has dispatched material request #{request_number} '
                            f'for {project_name}. Materials: {str(materials_summary)[:100]}. '
                            f'Dispatched on {dispatch_date_str}. Expected delivery: {delivery_str}.'
                        ),
                        priority='high',
                        category='inventory',
                        action_required=True,
                        action_url=f'/site-engineer/stock-in',
                        action_label='View Incoming Materials',
                        metadata={
                            'request_number': request_number,
                            'project_name': project_name,
                            'request_id': request_id,
                            'dispatch_date': dispatch_date_str,
                            'expected_delivery_date': delivery_str,
                            'workflow': 'imr_dispatch',
                            'target_role': 'site_engineer'
                        },
                        sender_name=dispatched_by_name
                    )
                    send_notification_to_user(se_id, notification.to_dict())
                except Exception as se_err:
                    log.error(f"Failed to notify site engineer {se_id}: {se_err}")

            # Notify Buyer (FYI — materials are on their way)
            if buyer_user_id:
                try:
                    notification = NotificationManager.create_notification(
                        user_id=buyer_user_id,
                        type='imr_dispatched',
                        title=f'Materials Dispatched to Site - {project_name}',
                        message=(
                            f'Material request #{request_number} for {project_name} has been dispatched to site. '
                            f'Materials: {str(materials_summary)[:100]}. Dispatched on {dispatch_date_str}.'
                        ),
                        priority='normal',
                        category='inventory',
                        action_required=False,
                        action_url=f'/buyer/purchase-orders?tab=ongoing&subtab=store_approved',
                        action_label='View Purchase Orders',
                        metadata={
                            'request_number': request_number,
                            'project_name': project_name,
                            'request_id': request_id,
                            'workflow': 'imr_dispatch',
                            'target_role': 'buyer'
                        },
                        sender_name=dispatched_by_name
                    )
                    send_notification_to_user(buyer_user_id, notification.to_dict())
                except Exception as buyer_err:
                    log.error(f"Failed to notify buyer {buyer_user_id}: {buyer_err}")

        except Exception as e:
            log.error(f"Error sending IMR dispatched notification: {e}")

    @staticmethod
    def notify_delivery_note_confirmed(
        delivery_note_number, project_name, received_by_name,
        buyer_user_id, pm_user_ids, cr_id=None
    ):
        """
        Notify Buyer + PM when Site Engineer confirms delivery receipt
        Trigger: SE confirms delivery in confirm_delivery()
        Recipients: Buyer who purchased materials, all Production Managers
        """
        try:
            # Notify Buyer
            if buyer_user_id:
                notification = NotificationManager.create_notification(
                    user_id=buyer_user_id,
                    type='delivery_note_confirmed',
                    title=f'Materials Delivered to Site - {project_name}',
                    message=f'Delivery Note {delivery_note_number} confirmed received at {project_name} by {received_by_name}. Purchase cycle complete.',
                    priority='normal',
                    category='inventory',
                    action_required=False,
                    action_url=f'/buyer/purchase-orders?tab=completed',
                    action_label='View Completed Orders',
                    metadata={
                        'delivery_note_number': delivery_note_number,
                        'project_name': project_name,
                        'cr_id': cr_id,
                        'workflow': 'delivery_confirmed',
                        'target_role': 'buyer'
                    },
                    sender_name=received_by_name
                )
                send_notification_to_user(buyer_user_id, notification.to_dict())

            # Notify all PMs
            for pm_id in (pm_user_ids or []):
                pm_notification = NotificationManager.create_notification(
                    user_id=pm_id,
                    type='delivery_note_confirmed',
                    title=f'Delivery Confirmed at Site - {project_name}',
                    message=f'{received_by_name} confirmed receipt of Delivery Note {delivery_note_number} at {project_name}.',
                    priority='low',
                    category='inventory',
                    action_required=False,
                    action_url=f'/production-manager/m2-store/stock-out?tab=delivered_dn',
                    action_label='View Delivered Notes',
                    metadata={
                        'delivery_note_number': delivery_note_number,
                        'project_name': project_name,
                        'workflow': 'delivery_confirmed',
                        'target_role': 'production-manager'
                    },
                    sender_name=received_by_name
                )
                send_notification_to_user(pm_id, pm_notification.to_dict())

            # Send professional emails
            try:
                from utils.email_styles import build_material_email
                from datetime import datetime

                if buyer_user_id:
                    buyer = User.query.get(buyer_user_id)
                    if buyer and buyer.email:
                        email_body = build_material_email(
                            header_title='Delivery Confirmed',
                            status_label='Delivered',
                            status_variant='success',
                            reference_number=delivery_note_number,
                            reference_label='Delivery Note',
                            project_name=project_name,
                            date_str=datetime.utcnow().strftime('%d %b %Y, %I:%M %p'),
                            detail_rows=[('Confirmed By', received_by_name)],
                            detail_title='Confirmation Details',
                            action_message='The purchase cycle for this material request is now complete. '
                                           'You can view completed orders in your Purchase Orders section.',
                            action_variant='success',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=buyer.email,
                            subject=f'Materials Delivered to Site - {project_name}',
                            message=email_body,
                            notification_type='delivery_note_confirmed'
                        )
            except Exception as email_err:
                log.error(f"Failed to send delivery confirmed email: {email_err}")

        except Exception as e:
            log.error(f"Error sending delivery confirmed notification: {e}")

    @staticmethod
    def notify_return_received_at_store(
        return_note_number, project_name, materials_summary,
        received_by_name, se_user_id
    ):
        """
        Notify Site Engineer when PM confirms return received at M2 Store
        Trigger: PM confirms return receipt in confirm_return_delivery_receipt()
        Recipients: Site Engineer who created the return
        """
        try:
            notification = NotificationManager.create_notification(
                user_id=se_user_id,
                type='return_received_at_store',
                title=f'Return Received at M2 Store - {project_name}',
                message=f'{received_by_name} confirmed receipt of Return Note {return_note_number} at M2 Store. Materials: {str(materials_summary)[:100]}.',
                priority='normal',
                category='inventory',
                action_required=False,
                action_url=f'/site-engineer/material-receipts?tab=history',
                action_label='View Return History',
                metadata={
                    'return_note_number': return_note_number,
                    'project_name': project_name,
                    'workflow': 'return_confirmed',
                    'target_role': 'site-engineer'
                },
                sender_name=received_by_name
            )
            send_notification_to_user(se_user_id, notification.to_dict())

            # Send professional email
            try:
                from utils.email_styles import build_material_email
                from datetime import datetime

                se = User.query.get(se_user_id)
                if se and se.email:
                    email_body = build_material_email(
                        header_title='Return Received at M2 Store',
                        status_label='Received',
                        status_variant='success',
                        reference_number=return_note_number,
                        reference_label='Return Note',
                        project_name=project_name,
                        date_str=datetime.utcnow().strftime('%d %b %Y, %I:%M %p'),
                        detail_rows=[('Received By', received_by_name)],
                        detail_title='Receipt Confirmation',
                        materials_summary=str(materials_summary)[:300],
                        action_message='The returned materials are now being processed at the warehouse.',
                        action_variant='success',
                    )
                    ComprehensiveNotificationService.send_email_notification(
                        recipient=se.email,
                        subject=f'Return Received at M2 Store - {project_name}',
                        message=email_body,
                        notification_type='return_received_at_store'
                    )
            except Exception as email_err:
                log.error(f"Failed to send return received email: {email_err}")
        except Exception as e:
            log.error(f"Error sending return received notification: {e}")

    @staticmethod
    def notify_delivery_confirmed(
        delivery_note_number, project_name, confirmed_by_name
    ):
        """
        Notify Production Managers when delivery is confirmed at site
        Trigger: SE confirms delivery receipt
        Recipients: All Production Managers
        """
        try:
            pm_role = Role.query.filter_by(role='productionManager').first()
            if not pm_role:
                return

            pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True, is_deleted=False).all()

            for pm in pm_users:
                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='success',
                    title='Delivery Confirmed at Site',
                    message=f'Delivery Note {delivery_note_number} has been received and confirmed at {project_name} by {confirmed_by_name}.',
                    priority='normal',
                    category='inventory',
                    action_required=False,
                    action_url='/production-manager/stock-management?tab=stock-out&subtab=delivery-notes',
                    action_label='View Delivery Notes',
                    metadata={
                        'delivery_note_number': delivery_note_number,
                        'project_name': project_name,
                        'workflow': 'delivery_note'
                    },
                    sender_name=confirmed_by_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending delivery confirmed notification: {e}")

    # ==================== SUPPORT TICKET NOTIFICATIONS ====================

    @staticmethod
    def notify_ticket_submitted(ticket_id, ticket_number, client_name, client_email, subject, priority):
        """
        Notify dev team when a new support ticket is submitted
        Trigger: Client submits new support ticket
        Recipients: Broadcast notification for support-management page (public, no login required)
        """
        try:
            # Create a broadcast notification for support-management page (user_id=None)
            # This allows the public support-management page to fetch notifications without auth
            notification = NotificationManager.create_notification(
                user_id=None,  # Broadcast notification - no specific user
                type='warning' if priority in ['urgent', 'critical', 'high'] else 'info',
                title=f'New Support Ticket #{ticket_number}',
                message=f'{client_name} submitted a {priority} priority ticket: {subject[:80]}...',
                priority='urgent' if priority in ['urgent', 'critical'] else 'normal',
                category='support',
                action_required=True,
                action_url=f'/support-management?ticket_id={ticket_id}',
                action_label='View Ticket',
                metadata={
                    'ticket_id': ticket_id,
                    'ticket_number': ticket_number,
                    'client_email': client_email,
                    'client_name': client_name,
                    'priority': priority,
                    'workflow': 'support_ticket',
                    'event_type': 'ticket_submitted',
                    'target_role': 'support-management'
                },
                sender_name=client_name,
                target_role='support-management'
            )
        except Exception as e:
            log.error(f"Error sending ticket submission notification: {e}")
            import traceback
            log.error(traceback.format_exc())

    @staticmethod
    def notify_ticket_approved(ticket_id, ticket_number, client_user_id, client_email, subject, approved_by_name):
        """
        Notify client when their support ticket is approved by dev team
        Trigger: Admin approves ticket
        Recipients: Client (if has user account) + email log
        """
        try:
            # Try to find user_id by email if not provided
            actual_user_id = client_user_id
            if not actual_user_id and client_email:
                user = User.query.filter_by(email=client_email, is_active=True, is_deleted=False).first()
                if user:
                    actual_user_id = user.user_id
            if actual_user_id:
                # Check for duplicate
                if not check_duplicate_notification(actual_user_id, f'Ticket #{ticket_number} Approved', 'ticket_id', ticket_id):
                    notification = NotificationManager.create_notification(
                        user_id=actual_user_id,
                        type='success',
                        title=f'Your Ticket #{ticket_number} is Approved',
                        message=f'Your support ticket "{subject[:60]}..." has been approved and our team is working on it.',
                        priority='normal',
                        category='support',
                        action_required=False,
                        action_url=build_notification_action_url(actual_user_id, 'support', {'ticket_id': ticket_id}, 'dashboard'),
                        action_label='View Ticket',
                        metadata={
                            'ticket_id': ticket_id,
                            'ticket_number': ticket_number,
                            'status': 'approved',
                            'workflow': 'support_ticket',
                            'target_role': 'client'
                        },
                        sender_name=approved_by_name,
                        target_role='client'
                    )
                    send_notification_to_user(actual_user_id, notification.to_dict())
            else:
                log.warning(f"Cannot send approval notification for ticket #{ticket_number}: No user_id found (email: {client_email})")
        except Exception as e:
            log.error(f"Error sending ticket approval notification: {e}")

    @staticmethod
    def notify_ticket_rejected(ticket_id, ticket_number, client_user_id, client_email, subject, rejection_reason, rejected_by_name):
        """
        Notify client when their support ticket is rejected
        Trigger: Admin rejects ticket
        Recipients: Client (if has user account) + email log
        """
        try:
            # Notify client if they have a user account
            if client_user_id:
                # Check for duplicate
                if not check_duplicate_notification(client_user_id, f'Ticket #{ticket_number} Rejected', 'ticket_id', ticket_id):
                    notification = NotificationManager.create_notification(
                        user_id=client_user_id,
                        type='error',
                        title=f'Your Ticket #{ticket_number} was Rejected',
                        message=f'Your support ticket was not approved. Reason: {rejection_reason[:80] if rejection_reason else "No reason provided"}...',
                        priority='normal',
                        category='support',
                        action_required=False,
                        action_url=build_notification_action_url(client_user_id, 'support', {'ticket_id': ticket_id}, 'dashboard'),
                        action_label='View Ticket',
                        metadata={
                            'ticket_id': ticket_id,
                            'ticket_number': ticket_number,
                            'status': 'rejected',
                            'rejection_reason': rejection_reason,
                            'workflow': 'support_ticket',
                            'target_role': 'client'
                        },
                        sender_name=rejected_by_name,
                        target_role='client'
                    )
                    send_notification_to_user(client_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending ticket rejection notification: {e}")

    @staticmethod
    def notify_ticket_status_updated(ticket_id, ticket_number, client_user_id, client_email, subject, new_status, updated_by_name):
        """
        Notify client when ticket status is updated (in_review, in_progress, pending_deployment)
        Trigger: Admin updates ticket status
        Recipients: Client (if has user account) + email log
        """
        try:
            status_messages = {
                'in_review': 'is under review by our team',
                'in_progress': 'is actively being worked on',
                'pending_deployment': 'is ready and pending deployment'
            }

            status_message = status_messages.get(new_status, f'status updated to {new_status}')

            # Notify client if they have a user account
            if client_user_id:
                # Check for duplicate
                if not check_duplicate_notification(client_user_id, f'Ticket #{ticket_number} Status Update', 'ticket_id', ticket_id):
                    notification = NotificationManager.create_notification(
                        user_id=client_user_id,
                        type='info',
                        title=f'Ticket #{ticket_number} Status Update',
                        message=f'Your support ticket "{subject[:60]}..." {status_message}.',
                        priority='normal',
                        category='support',
                        action_required=False,
                        action_url=build_notification_action_url(client_user_id, 'support', {'ticket_id': ticket_id}, 'dashboard'),
                        action_label='View Ticket',
                        metadata={
                            'ticket_id': ticket_id,
                            'ticket_number': ticket_number,
                            'status': new_status,
                            'workflow': 'support_ticket',
                            'target_role': 'client'
                        },
                        sender_name=updated_by_name,
                        target_role='client'
                    )
                    send_notification_to_user(client_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending ticket status update notification: {e}")

    @staticmethod
    def notify_ticket_resolved(ticket_id, ticket_number, client_user_id, client_email, subject, resolution_notes, resolved_by_name):
        """
        Notify client when their ticket is marked as resolved
        Trigger: Admin marks ticket as resolved
        Recipients: Client (if has user account) + email log
        """
        try:
            # Notify client if they have a user account
            if client_user_id:
                # Check for duplicate
                if not check_duplicate_notification(client_user_id, f'Ticket #{ticket_number} Resolved', 'ticket_id', ticket_id):
                    notification = NotificationManager.create_notification(
                        user_id=client_user_id,
                        type='success',
                        title=f'Your Ticket #{ticket_number} is Resolved',
                        message=f'Your support ticket "{subject[:60]}..." has been resolved. Please confirm if the issue is fixed.',
                        priority='normal',
                        category='support',
                        action_required=True,
                        action_url=build_notification_action_url(client_user_id, 'support', {'ticket_id': ticket_id}, 'dashboard'),
                        action_label='Confirm Resolution',
                        metadata={
                            'ticket_id': ticket_id,
                            'ticket_number': ticket_number,
                            'status': 'resolved',
                            'resolution_notes': resolution_notes,
                            'workflow': 'support_ticket',
                            'target_role': 'client'
                        },
                        sender_name=resolved_by_name,
                        target_role='client'
                    )
                    send_notification_to_user(client_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending ticket resolution notification: {e}")

    @staticmethod
    def notify_ticket_closed_by_client(ticket_id, ticket_number, subject, client_name, client_feedback):
        """
        Notify dev team when client confirms resolution and closes ticket
        Trigger: Client confirms resolution
        Recipients: Broadcast for support-management page
        """
        try:
            # Create a broadcast notification for support-management page
            notification = NotificationManager.create_notification(
                user_id=None,  # Broadcast notification
                type='success',
                title=f'Ticket #{ticket_number} Closed by Client',
                message=f'{client_name} confirmed resolution. Feedback: {client_feedback[:80] if client_feedback else "None"}',
                priority='normal',
                category='support',
                action_required=False,
                action_url=f'/support-management?ticket_id={ticket_id}',
                action_label='View Ticket',
                metadata={
                    'ticket_id': ticket_id,
                    'ticket_number': ticket_number,
                    'status': 'closed',
                    'client_name': client_name,
                    'client_feedback': client_feedback,
                    'event_type': 'client_closed',
                    'workflow': 'support_ticket',
                    'target_role': 'support-management'
                },
                sender_name=client_name,
                target_role='support-management'
            )
        except Exception as e:
            log.error(f"Error sending ticket closure notification: {e}")

    @staticmethod
    def notify_ticket_closed_by_admin(ticket_id, ticket_number, client_user_id, client_email, subject, closed_by_name, closing_notes=None):
        """
        Notify client when admin/dev team closes their ticket
        Trigger: Admin closes ticket
        Recipients: Client (ticket reporter)
        """
        try:
            # Try to find user_id by email if not provided
            actual_user_id = client_user_id
            if not actual_user_id and client_email:
                user = User.query.filter_by(email=client_email, is_active=True, is_deleted=False).first()
                if user:
                    actual_user_id = user.user_id

            if not actual_user_id:
                log.warning(f"Cannot send ticket closed notification - no user found for ticket #{ticket_number}")
                return

            # Check for duplicate
            if check_duplicate_notification(actual_user_id, f'Ticket #{ticket_number} Closed', 'ticket_id', ticket_id):
                return

            message = f'Your ticket "{subject[:60]}..." has been closed by the development team.'
            if closing_notes:
                message += f' Notes: {closing_notes[:50]}...'

            notification = NotificationManager.create_notification(
                user_id=actual_user_id,
                type='success',
                title=f'Your Ticket #{ticket_number} is Closed',
                message=message,
                priority='normal',
                category='support',
                action_required=False,
                action_url=f'/support?ticket_id={ticket_id}',
                action_label='View Ticket',
                metadata={
                    'ticket_id': ticket_id,
                    'ticket_number': ticket_number,
                    'status': 'closed',
                    'closing_notes': closing_notes,
                    'workflow': 'support_ticket',
                    'target_role': 'client'
                },
                sender_name=closed_by_name,
                target_role='client'
            )
            send_notification_to_user(actual_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending ticket closed notification: {e}")

    @staticmethod
    def notify_ticket_comment(ticket_id, ticket_number, client_user_id, client_email, subject, comment_by):
        """
        Notify client when dev team adds a comment to their ticket
        Trigger: Dev team adds comment
        Recipients: Client (ticket reporter)
        """
        try:
            # Try to find user_id by email if not provided
            actual_user_id = client_user_id
            if not actual_user_id and client_email:
                user = User.query.filter_by(email=client_email, is_active=True, is_deleted=False).first()
                if user:
                    actual_user_id = user.user_id

            if actual_user_id:
                # Check for duplicate (within 2 minutes for comments)
                if not check_duplicate_notification(actual_user_id, f'New Comment on Ticket #{ticket_number}', 'ticket_id', ticket_id, minutes=2):
                    notification = NotificationManager.create_notification(
                        user_id=actual_user_id,
                        type='info',
                        title=f'New Comment on Ticket #{ticket_number}',
                        message=f'{comment_by} added a comment to your support ticket "{subject[:60]}..."',
                        priority='normal',
                        category='support',
                        action_required=False,
                        action_url=build_notification_action_url(actual_user_id, 'support', {'ticket_id': ticket_id}, 'dashboard'),
                        action_label='View Comment',
                        metadata={
                            'ticket_id': ticket_id,
                            'ticket_number': ticket_number,
                            'event_type': 'new_comment',
                            'workflow': 'support_ticket',
                            'target_role': 'client'
                        },
                        sender_name=comment_by,
                        target_role='client'
                    )
                    send_notification_to_user(actual_user_id, notification.to_dict())
                else:
                    log.info(f"Skipped duplicate comment notification for ticket #{ticket_number}")
            else:
                log.warning(f"Cannot send comment notification for ticket #{ticket_number}: No user_id found (email: {client_email})")
        except Exception as e:
            log.error(f"Error sending comment notification: {e}")

    @staticmethod
    def notify_ticket_comment_from_client(ticket_id, ticket_number, client_name, client_email, subject):
        """
        Notify dev team when client adds a comment to their ticket
        Trigger: Client adds comment
        Recipients: Broadcast for support-management page
        """
        try:
            # Create a broadcast notification for support-management page
            notification = NotificationManager.create_notification(
                user_id=None,  # Broadcast notification
                type='info',
                title=f'New Comment on Ticket #{ticket_number}',
                message=f'{client_name} commented on their ticket "{subject[:60]}..."',
                priority='normal',
                category='support',
                action_required=False,
                action_url=f'/support-management?ticket_id={ticket_id}',
                action_label='View Comment',
                metadata={
                    'ticket_id': ticket_id,
                    'ticket_number': ticket_number,
                    'client_email': client_email,
                    'client_name': client_name,
                    'event_type': 'client_comment',
                    'workflow': 'support_ticket',
                    'target_role': 'support-management'
                },
                sender_name=client_name,
                target_role='support-management'
            )
        except Exception as e:
            log.error(f"Error sending client comment notification: {e}")


    # ==================== GENERIC SIMPLE NOTIFICATION ====================

    @staticmethod
    def send_simple_notification(user_id, title, message, type='info', action_url=None, metadata=None):
        """
        Send a simple notification to a specific user.
        Used by vendor inspection workflow and other features that need
        a lightweight notification without complex workflow logic.

        Args:
            user_id: Target user ID
            title: Notification title
            message: Notification body
            type: Notification type (info, warning, success, error, approval)
            action_url: Optional frontend URL to navigate to
            metadata: Optional dict of additional data
        """
        try:
            notification = NotificationManager.create_notification(
                user_id=user_id,
                type=type,
                title=title,
                message=message,
                priority='normal' if type in ('info', 'success') else 'urgent',
                category='vendor_inspection',
                action_required=type in ('warning', 'approval'),
                action_url=action_url,
                metadata=metadata or {}
            )

            send_notification_to_user(user_id, notification.to_dict())
            log.info(f"Sent simple notification to user {user_id}: {title}")
        except Exception as e:
            log.error(f"Error sending simple notification to user {user_id}: {e}")


    # ==================== PROCUREMENT ASSIGNMENT NOTIFICATIONS ====================

    @staticmethod
    def notify_buyer_cr_assigned(
        cr_id, cr_number, project_name,
        assigned_by_name,
        buyer_user_id,
        notes=None
    ):
        """
        Notify Buyer when PM assigns a CR to procurement for purchasing.
        Trigger: change_request_controller.py — when PM sets assigned_to_buyer_user_id
        Recipients: The specific buyer assigned
        Priority: HIGH (action required — buyer must act)
        """
        try:
            if check_duplicate_notification(buyer_user_id, 'CR Assigned', 'cr_id', cr_id, minutes=5):
                return

            action_url = build_notification_action_url(
                user_id=buyer_user_id,
                base_page='change-requests',
                query_params={'cr_id': cr_id, 'tab': 'assigned'},
                fallback_role_route='buyer'
            )

            notification = NotificationManager.create_notification(
                user_id=buyer_user_id,
                type='approval',
                title=f'CR Assigned to You — {project_name}',
                message=f'{assigned_by_name} assigned change request {cr_number} to you for procurement. '
                        f'Project: {project_name}.'
                        + (f' Notes: {notes}' if notes else ''),
                priority='high',
                category='change_request',
                action_required=True,
                action_url=action_url,
                action_label='View CR',
                metadata={
                    'cr_id': cr_id,
                    'cr_number': cr_number,
                    'project_name': project_name,
                    'workflow': 'cr_buyer_assignment'
                },
                sender_name=assigned_by_name
            )
            send_notification_to_user(buyer_user_id, notification.to_dict())

            # Email fallback — buyer must act on this
            if ComprehensiveNotificationService.is_user_offline(buyer_user_id):
                buyer = User.query.get(buyer_user_id)
                if buyer and buyer.email:
                    ComprehensiveNotificationService.send_email_notification(
                        recipient=buyer.email,
                        subject=f'Change Request Assigned to You — {project_name}',
                        message=f'''
                        <h2>Change Request Assigned to You</h2>
                        <p><strong>{assigned_by_name}</strong> has assigned change request
                        <strong>{cr_number}</strong> to you for procurement in
                        <strong>{project_name}</strong>.</p>
                        ''' + ('<p>Notes: ' + str(notes) + '</p>' if notes else '') + '''
                        <p>Please log in and go to <strong>Change Requests → Assigned</strong>
                        to review and proceed with purchasing.</p>
                        ''',
                        notification_type='cr_buyer_assignment'
                    )
        except Exception as e:
            log.error(f"Error sending buyer CR assignment notification: {e}")

    @staticmethod
    def notify_td_inventory_escalation(
        item_name,
        item_type,
        condition,
        project_name,
        escalated_by_name,
        return_id=None,
        disposal_reason=None
    ):
        """
        Notify all Technical Directors when PM escalates a damaged/defective item for disposal approval.
        Trigger: inventory_controller.py — review_disposal() when action='approve' (full disposal)
        Recipients: All Technical Directors
        Priority: HIGH (TD must approve disposal)
        """
        try:
            td_role = Role.query.filter_by(role='technicalDirector').first()
            if not td_role:
                log.warning("Technical Director role not found for inventory escalation")
                return

            td_users = User.query.filter_by(
                role_id=td_role.role_id,
                is_active=True,
                is_deleted=False
            ).all()

            for td in td_users:
                if check_duplicate_notification(td.user_id, 'Disposal Escalation', 'return_id', return_id or item_name, minutes=5):
                    continue

                action_url = build_notification_action_url(
                    user_id=td.user_id,
                    base_page='disposal-approvals',
                    query_params={},
                    fallback_role_route='technical-director'
                )

                notification = NotificationManager.create_notification(
                    user_id=td.user_id,
                    type='warning',
                    title=f'Disposal Approval Required — {project_name}',
                    message=f'{escalated_by_name} has requested disposal approval for {item_type} '
                            f'"{item_name}" (condition: {condition}) from {project_name}.'
                            + (f' Reason: {disposal_reason}' if disposal_reason else ''),
                    priority='high',
                    category='inventory',
                    action_required=True,
                    action_url=action_url,
                    action_label='Review Disposal',
                    metadata={
                        'return_id': return_id,
                        'item_name': item_name,
                        'item_type': item_type,
                        'condition': condition,
                        'project_name': project_name,
                        'workflow': 'td_inventory_escalation'
                    },
                    sender_name=escalated_by_name
                )
                send_notification_to_user(td.user_id, notification.to_dict())

                # Email fallback — TD must approve (action required)
                if ComprehensiveNotificationService.is_user_offline(td.user_id):
                    if td.email:
                        from utils.email_styles import build_material_email
                        detail_rows = [
                            ('Item', item_name),
                            ('Type', item_type),
                            ('Condition', condition),
                            ('Escalated By', escalated_by_name),
                        ]
                        if disposal_reason:
                            detail_rows.append(('Reason', disposal_reason))

                        email_body = build_material_email(
                            header_title='Disposal Approval Required',
                            status_label='Approval Needed',
                            status_variant='urgent',
                            project_name=project_name,
                            detail_rows=detail_rows,
                            detail_title='Disposal Details',
                            action_message='Please log in and go to <strong>Inventory Approvals &rarr; Pending</strong> '
                                           'to review and approve this disposal request.',
                            action_variant='urgent',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=td.email,
                            subject=f'Disposal Approval Required — {project_name}',
                            message=email_body,
                            notification_type='td_inventory_escalation'
                        )

        except Exception as e:
            log.error(f"Error sending TD inventory escalation notification: {e}")



    @staticmethod
    def notify_rdn_created(
        rdn_number,
        project_name,
        materials_count,
        returned_by_name,
        returned_by_user_id
    ):
        """
        Notify all Production Managers when SE creates a Return Delivery Note.
        Trigger: create_return_delivery_note() in inventory_controller.py
        Recipients: All Production Managers
        """
        try:
            pm_role = Role.query.filter_by(role='productionManager').first()
            if not pm_role:
                return
            pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True, is_deleted=False).all()
            for pm in pm_users:
                if check_duplicate_notification(pm.user_id, 'Return Delivery Note Created', 'rdn_number', rdn_number, minutes=5):
                    continue
                action_url = build_notification_action_url(
                    user_id=pm.user_id,
                    base_page='m2-store/receive-returns',
                    query_params={'tab': 'pending'},
                    fallback_role_route='production-manager'
                )
                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='info',
                    title=f'Return Incoming — {project_name}',
                    message=f'{returned_by_name} has created return note {rdn_number} with {materials_count} material(s) from {project_name}. Awaiting dispatch.',
                    priority='normal',
                    category='inventory',
                    action_required=True,
                    action_url=action_url,
                    action_label='View Returns',
                    metadata={
                        'rdn_number': rdn_number,
                        'project_name': project_name,
                        'workflow': 'rdn_created'
                    },
                    sender_name=returned_by_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())
                if ComprehensiveNotificationService.is_user_offline(pm.user_id):
                    if pm.email:
                        from utils.email_styles import build_material_email
                        email_body = build_material_email(
                            header_title='Material Return Incoming',
                            status_label='Awaiting Dispatch',
                            status_variant='neutral',
                            reference_number=rdn_number,
                            reference_label='Return Note',
                            project_name=project_name,
                            detail_rows=[
                                ('Created By', returned_by_name),
                                ('Materials Count', f'{materials_count} material(s)'),
                            ],
                            detail_title='Return Details',
                            action_message='Please log in to review once the return is dispatched from site.',
                            action_variant='info',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=pm.email,
                            subject=f'Return Incoming — {project_name}',
                            message=email_body,
                            notification_type='rdn_created'
                        )
        except Exception as e:
            log.error(f"Error sending RDN created notification: {e}")

    @staticmethod
    def notify_rdn_dispatched(
        rdn_number,
        project_name,
        driver_name,
        returned_by_name,
        pm_user_ids
    ):
        """
        Notify Production Managers when RDN is dispatched (in transit to store).
        Trigger: dispatch_return_delivery_note() in inventory_controller.py
        Recipients: All Production Managers
        """
        try:
            for pm_id in pm_user_ids:
                if check_duplicate_notification(pm_id, 'Return In Transit', 'rdn_number', rdn_number, minutes=5):
                    continue
                action_url = build_notification_action_url(
                    user_id=pm_id,
                    base_page='m2-store/receive-returns',
                    query_params={'tab': 'pending'},
                    fallback_role_route='production-manager'
                )
                notification = NotificationManager.create_notification(
                    user_id=pm_id,
                    type='info',
                    title=f'Return In Transit — {project_name}',
                    message=f'Return note {rdn_number} from {project_name} is now in transit. Driver: {driver_name}. Prepare to receive.',
                    priority='normal',
                    category='inventory',
                    action_required=True,
                    action_url=action_url,
                    action_label='Track Return',
                    metadata={
                        'rdn_number': rdn_number,
                        'project_name': project_name,
                        'workflow': 'rdn_dispatched'
                    },
                    sender_name=returned_by_name
                )
                send_notification_to_user(pm_id, notification.to_dict())
                pm_user = User.query.get(pm_id)
                if pm_user and ComprehensiveNotificationService.is_user_offline(pm_id):
                    if pm_user.email:
                        from utils.email_styles import build_material_email
                        email_body = build_material_email(
                            header_title='Material Return In Transit',
                            status_label='In Transit',
                            status_variant='warning',
                            reference_number=rdn_number,
                            reference_label='Return Note',
                            project_name=project_name,
                            detail_rows=[
                                ('Driver', driver_name),
                                ('Returned By', returned_by_name),
                            ],
                            detail_title='Transport Details',
                            action_message='Please be ready to receive and inspect at M2 Store warehouse.',
                            action_variant='warning',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=pm_user.email,
                            subject=f'Return In Transit — {project_name}',
                            message=email_body,
                            notification_type='rdn_dispatched'
                        )
        except Exception as e:
            log.error(f"Error sending RDN dispatched notification: {e}")

    @staticmethod
    def notify_material_repaired(
        material_name,
        quantity,
        project_name,
        repaired_by_name,
        se_user_id=None,
        pm_user_ids=None
    ):
        """
        Notify SE + PMs when repaired material is moved back to main stock.
        Trigger: add_repaired_to_stock() in inventory_controller.py
        Recipients: SE who returned it + all Production Managers
        """
        try:
            recipients = []
            if se_user_id:
                recipients.append(('se', se_user_id))
            if pm_user_ids:
                for pm_id in pm_user_ids:
                    recipients.append(('pm', pm_id))

            for role_type, user_id in recipients:
                if check_duplicate_notification(user_id, 'Material Repaired', 'material_name', material_name, minutes=5):
                    continue
                if role_type == 'se':
                    action_url = build_notification_action_url(
                        user_id=user_id,
                        base_page='material-receipts',
                        query_params={'tab': 'history'},
                        fallback_role_route='site-engineer'
                    )
                else:
                    action_url = build_notification_action_url(
                        user_id=user_id,
                        base_page='m2-store/stock-in',
                        fallback_role_route='production-manager'
                    )
                notification = NotificationManager.create_notification(
                    user_id=user_id,
                    type='success',
                    title=f'Material Repaired — {material_name}',
                    message=f'{quantity} unit(s) of "{material_name}" have been repaired and returned to main stock. Project: {project_name}.',
                    priority='normal',
                    category='inventory',
                    action_required=False,
                    action_url=action_url,
                    action_label='View Stock',
                    metadata={
                        'material_name': material_name,
                        'project_name': project_name,
                        'workflow': 'material_repaired'
                    },
                    sender_name=repaired_by_name
                )
                send_notification_to_user(user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending material repaired notification: {e}")

    @staticmethod
    def notify_material_disposed(
        material_name,
        project_name,
        disposed_by_name,
        se_user_id=None,
        pm_user_ids=None
    ):
        """
        Notify SE + PMs when material is physically disposed.
        Trigger: mark_as_disposed() in inventory_controller.py
        Recipients: SE who returned it + all Production Managers
        """
        try:
            recipients = []
            if se_user_id:
                recipients.append(('se', se_user_id))
            if pm_user_ids:
                for pm_id in pm_user_ids:
                    recipients.append(('pm', pm_id))

            for role_type, user_id in recipients:
                if check_duplicate_notification(user_id, 'Material Disposed', 'material_name', material_name, minutes=5):
                    continue
                if role_type == 'se':
                    action_url = build_notification_action_url(
                        user_id=user_id,
                        base_page='material-receipts',
                        query_params={'tab': 'history'},
                        fallback_role_route='site-engineer'
                    )
                else:
                    action_url = build_notification_action_url(
                        user_id=user_id,
                        base_page='m2-store/disposal',
                        fallback_role_route='production-manager'
                    )
                notification = NotificationManager.create_notification(
                    user_id=user_id,
                    type='warning',
                    title=f'Material Disposed — {material_name}',
                    message=f'"{material_name}" from {project_name} has been physically disposed by {disposed_by_name}.',
                    priority='normal',
                    category='inventory',
                    action_required=False,
                    action_url=action_url,
                    action_label='View Disposal Log',
                    metadata={
                        'material_name': material_name,
                        'project_name': project_name,
                        'workflow': 'material_disposed'
                    },
                    sender_name=disposed_by_name
                )
                send_notification_to_user(user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending material disposed notification: {e}")

    @staticmethod
    def notify_asset_returned_good(
        category_name,
        quantity,
        project_name,
        returned_by_name,
        pm_user_ids
    ):
        """
        Notify Production Managers when asset returned in good condition.
        Trigger: return_asset() in asset_controller.py (good condition path)
        Recipients: All Production Managers
        """
        try:
            for pm_id in pm_user_ids:
                if check_duplicate_notification(pm_id, 'Asset Returned', 'category_name', category_name, minutes=5):
                    continue
                action_url = build_notification_action_url(
                    user_id=pm_id,
                    base_page='returnable-assets/stock-in',
                    fallback_role_route='production-manager'
                )
                notification = NotificationManager.create_notification(
                    user_id=pm_id,
                    type='success',
                    title=f'Asset Returned — {category_name}',
                    message=f'{returned_by_name} returned {quantity} unit(s) of "{category_name}" in good condition from {project_name}.',
                    priority='normal',
                    category='assets',
                    action_required=False,
                    action_url=action_url,
                    action_label='View Assets',
                    metadata={
                        'category_name': category_name,
                        'project_name': project_name,
                        'workflow': 'asset_returned_good'
                    },
                    sender_name=returned_by_name
                )
                send_notification_to_user(pm_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending asset returned good notification: {e}")

    @staticmethod
    def notify_store_routing(
        cr_id,
        cr_number,
        project_name,
        buyer_name,
        buyer_user_id,
        materials_count,
        routing_type='store'
    ):
        """
        Notify all Production Managers when buyer routes materials to M2 Store.
        Trigger: complete_from_store() or route_all_to_store() in store_controller.py
        Recipients: All Production Managers
        Priority: NORMAL (PM must process the incoming store request)
        """
        try:
            pm_role = Role.query.filter_by(role='productionManager').first()
            if not pm_role:
                log.warning("Production Manager role not found for store routing notification")
                return

            pm_users = User.query.filter_by(
                role_id=pm_role.role_id,
                is_active=True,
                is_deleted=False
            ).all()

            label = 'from inventory' if routing_type == 'store' else 'to M2 Store'

            for pm in pm_users:
                if check_duplicate_notification(pm.user_id, 'Store Request', 'cr_id', cr_id, minutes=5):
                    continue

                action_url = build_notification_action_url(
                    user_id=pm.user_id,
                    base_page='m2-store/stock-in',
                    query_params={'view': 'store_requests'},
                    fallback_role_route='production-manager'
                )

                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='info',
                    title=f'Store Request — {project_name}',
                    message=f'{buyer_name} has sent {materials_count} material(s) {label} for '
                            f'CR-{cr_number or cr_id} ({project_name}). Please review and process.',
                    priority='normal',
                    category='inventory',
                    action_required=True,
                    action_url=action_url,
                    action_label='View Store Requests',
                    metadata={
                        'cr_id': cr_id,
                        'cr_number': cr_number,
                        'project_name': project_name,
                        'materials_count': materials_count,
                        'workflow': 'store_routing',
                        'target_role': 'productionManager'
                    },
                    sender_name=buyer_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())

                # Email fallback — PM must act on this
                if ComprehensiveNotificationService.is_user_offline(pm.user_id):
                    if pm.email:
                        from utils.email_styles import build_material_email
                        email_body = build_material_email(
                            header_title='Store Material Request',
                            status_label='Action Required',
                            status_variant='warning',
                            reference_number=f'CR-{cr_number or cr_id}',
                            reference_label='Change Request',
                            project_name=project_name,
                            detail_rows=[
                                ('Requested By', buyer_name),
                                ('Materials', f'{materials_count} material(s) {label}'),
                            ],
                            detail_title='Request Details',
                            action_message='Please log in and go to <strong>M2 Store &rarr; Stock In &rarr; Store Requests</strong> '
                                           'to review and process this request.',
                            action_variant='warning',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=pm.email,
                            subject=f'Store Request — {project_name}',
                            message=email_body,
                            notification_type='store_routing'
                        )

        except Exception as e:
            log.error(f"Error sending store routing notification: {e}")

    @staticmethod
    def send_email_notification(recipient, subject, message, notification_type=None, action_url=None):
        """
        Send an HTML email notification via SMTP (async, non-blocking).
        Used alongside in-app notifications for users who may be offline.

        Args:
            recipient: Email address string
            subject: Email subject line
            message: HTML content for the email body (can include <p>, <ul>, <table> etc.)
            notification_type: Optional string label for logging
            action_url: Optional URL (unused in email body, kept for API compatibility)
        """
        try:
            from utils.boq_email_service import BOQEmailService
            from utils.email_styles import wrap_email_content

            if not recipient:
                return

            email_html = wrap_email_content(message)
            email_service = BOQEmailService()
            email_service.send_email_async(recipient, subject, email_html)
            log.info(f"📧 Email queued: {notification_type or subject} → {recipient}")
        except Exception as e:
            log.error(f"Failed to send email notification to {recipient}: {e}")

    # ==================== INVENTORY MATERIAL REQUEST NOTIFICATIONS ====================

    @staticmethod
    def notify_imr_sent_for_approval(
        request_id, request_number, project_name,
        material_name, quantity, unit, sent_by_name, sent_by_user_id
    ):
        """
        Notify all Production Managers when SE sends Internal Material Request.
        Trigger: send_internal_material_request() in inventory_controller.py
        Recipients: All Production Managers
        """
        try:
            pm_role = Role.query.filter_by(role='productionManager').first()
            if not pm_role:
                log.warning("productionManager role not found for IMR sent notification")
                return
            pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True, is_deleted=False).all()
            for pm in pm_users:
                if check_duplicate_notification(pm.user_id, 'Material Request Sent', 'request_number', request_number, minutes=5):
                    continue
                action_url = build_notification_action_url(
                    user_id=pm.user_id,
                    base_page='m2-store/internal-requests',
                    query_params={'tab': 'pending'},
                    fallback_role_route='production-manager'
                )
                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='info',
                    title=f'Material Request #{request_number} — {project_name}',
                    message=f'{sent_by_name} sent material request #{request_number} for {quantity} {unit or "units"} of {material_name} from {project_name}. Awaiting your approval.',
                    priority='high',
                    category='inventory',
                    action_required=True,
                    action_url=action_url,
                    action_label='Review Request',
                    metadata={
                        'request_id': request_id,
                        'request_number': request_number,
                        'project_name': project_name,
                        'workflow': 'imr_sent_for_approval'
                    },
                    sender_name=sent_by_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())
                if ComprehensiveNotificationService.is_user_offline(pm.user_id):
                    if pm.email:
                        from utils.email_styles import build_material_email
                        email_body = build_material_email(
                            header_title='Material Request Awaiting Approval',
                            status_label='Pending Approval',
                            status_variant='warning',
                            reference_number=f'#{request_number}',
                            reference_label='Request',
                            project_name=project_name,
                            detail_rows=[
                                ('Material', material_name),
                                ('Quantity', f'{quantity} {unit or "units"}'),
                                ('Requested By', sent_by_name),
                            ],
                            detail_title='Request Details',
                            action_message='Please log in to review and approve this material request.',
                            action_variant='warning',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=pm.email,
                            subject=f'Material Request #{request_number} — {project_name}',
                            message=email_body,
                            notification_type='imr_sent_for_approval'
                        )
        except Exception as e:
            log.error(f"Error sending IMR sent-for-approval notification: {e}")

    @staticmethod
    def notify_material_issued_from_inventory(
        request_number, material_name, quantity, unit,
        project_name, issued_by_name, requester_user_id
    ):
        """
        Notify the requester when PM issues material from inventory.
        Trigger: issue_material_from_inventory() in inventory_controller.py
        Recipients: The user who created the IMR (SE or Buyer)
        """
        try:
            if not requester_user_id:
                return
            if check_duplicate_notification(requester_user_id, 'Material Issued', 'request_number', request_number, minutes=5):
                return
            action_url = build_notification_action_url(
                user_id=requester_user_id,
                base_page='material-receipts',
                query_params={'tab': 'fulfilled'},
                fallback_role_route='site-engineer'
            )
            notification = NotificationManager.create_notification(
                user_id=requester_user_id,
                type='success',
                title=f'Material Issued — {project_name}',
                message=f'{issued_by_name} issued {quantity} {unit or "units"} of {material_name} for request #{request_number} from {project_name}.',
                priority='normal',
                category='inventory',
                action_required=False,
                action_url=action_url,
                action_label='View Materials',
                metadata={
                    'request_number': request_number,
                    'material_name': material_name,
                    'project_name': project_name,
                    'workflow': 'material_issued_from_inventory'
                },
                sender_name=issued_by_name
            )
            send_notification_to_user(requester_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending material issued notification: {e}")

    @staticmethod
    def notify_rdn_issued(
        rdn_number, project_name, materials_count,
        issued_by_name, issued_by_user_id
    ):
        """
        Notify all Production Managers when SE issues (finalizes) a Return Delivery Note.
        Trigger: issue_return_delivery_note() in inventory_controller.py
        Recipients: All Production Managers
        """
        try:
            pm_role = Role.query.filter_by(role='productionManager').first()
            if not pm_role:
                log.warning("productionManager role not found for RDN issued notification")
                return
            pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True, is_deleted=False).all()
            for pm in pm_users:
                if check_duplicate_notification(pm.user_id, 'Return Note Issued', 'rdn_number', rdn_number, minutes=5):
                    continue
                action_url = build_notification_action_url(
                    user_id=pm.user_id,
                    base_page='m2-store/receive-returns',
                    query_params={'tab': 'issued'},
                    fallback_role_route='production-manager'
                )
                notification = NotificationManager.create_notification(
                    user_id=pm.user_id,
                    type='info',
                    title=f'Return Note Issued — {project_name}',
                    message=f'{issued_by_name} issued return note {rdn_number} with {materials_count} material(s) from {project_name}. Ready for dispatch.',
                    priority='high',
                    category='inventory',
                    action_required=True,
                    action_url=action_url,
                    action_label='View Returns',
                    metadata={
                        'rdn_number': rdn_number,
                        'project_name': project_name,
                        'workflow': 'rdn_issued'
                    },
                    sender_name=issued_by_name
                )
                send_notification_to_user(pm.user_id, notification.to_dict())
                if ComprehensiveNotificationService.is_user_offline(pm.user_id):
                    if pm.email:
                        from utils.email_styles import build_material_email
                        email_body = build_material_email(
                            header_title='Return Delivery Note Issued',
                            status_label='Ready for Dispatch',
                            status_variant='warning',
                            reference_number=rdn_number,
                            reference_label='Return Note',
                            project_name=project_name,
                            detail_rows=[
                                ('Issued By', issued_by_name),
                                ('Materials Count', f'{materials_count} material(s)'),
                            ],
                            detail_title='Return Details',
                            action_message='Please log in to review and dispatch this return.',
                            action_variant='warning',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=pm.email,
                            subject=f'Return Note Issued — {project_name}',
                            message=email_body,
                            notification_type='rdn_issued'
                        )
        except Exception as e:
            log.error(f"Error sending RDN issued notification: {e}")

    # ==================== MATERIAL DISPOSAL NOTIFICATIONS ====================

    @staticmethod
    def notify_material_disposal_requested(
        return_id, material_name, material_code, quantity, unit,
        disposal_reason, notes, estimated_value,
        requested_by_name, pm_user_id
    ):
        """
        Notify all Technical Directors when PM requests material disposal.
        Trigger: request_material_disposal() or request_disposal_from_repair() in inventory_controller.py
        Recipients: All Technical Directors (bell + email)
        """
        try:
            td_role = Role.query.filter_by(role='technicalDirector').first()
            if not td_role:
                log.warning("technicalDirector role not found for material disposal notification")
                return
            td_users = User.query.filter_by(role_id=td_role.role_id, is_active=True, is_deleted=False).all()
            reason_display = disposal_reason.replace('_', ' ').title() if disposal_reason else 'Damaged'

            for td in td_users:
                if check_duplicate_notification(td.user_id, 'Material Disposal Request', 'return_id', return_id, minutes=5):
                    continue
                action_url = build_notification_action_url(
                    user_id=td.user_id,
                    base_page='disposal-approvals',
                    query_params={'tab': 'pending'},
                    fallback_role_route='technical-director'
                )
                notification = NotificationManager.create_notification(
                    user_id=td.user_id,
                    type='warning',
                    title=f'Material Disposal Request — {material_name}',
                    message=f'{requested_by_name} requests disposal of {quantity} {unit or "units"} of {material_name} ({material_code}). Reason: {reason_display}. Est. value: AED {estimated_value:.2f}',
                    priority='high',
                    category='inventory',
                    action_required=True,
                    action_url=action_url,
                    action_label='Review Disposal',
                    metadata={
                        'return_id': return_id,
                        'material_name': material_name,
                        'material_code': material_code,
                        'workflow': 'material_disposal_request'
                    },
                    sender_name=requested_by_name
                )
                send_notification_to_user(td.user_id, notification.to_dict())
                if ComprehensiveNotificationService.is_user_offline(td.user_id):
                    if td.email:
                        from utils.email_styles import build_material_email
                        email_body = build_material_email(
                            header_title='Material Disposal Request',
                            status_label='Awaiting Approval',
                            status_variant='warning',
                            reference_number=material_code,
                            reference_label='Material',
                            project_name='Materials Catalog',
                            detail_rows=[
                                ('Material', material_name),
                                ('Quantity', f'{quantity} {unit or "units"}'),
                                ('Reason', reason_display),
                                ('Est. Value', f'AED {estimated_value:.2f}'),
                                ('Requested By', requested_by_name),
                            ],
                            detail_title='Disposal Details',
                            action_message='Please log in to review and approve/reject this disposal request.',
                            action_variant='warning',
                        )
                        ComprehensiveNotificationService.send_email_notification(
                            recipient=td.email,
                            subject=f'Material Disposal Request — {material_name}',
                            message=email_body,
                            notification_type='material_disposal_request'
                        )
        except Exception as e:
            log.error(f"Error sending material disposal request notification: {e}")

    @staticmethod
    def notify_material_disposal_reviewed(
        return_id, material_name, quantity, unit,
        action, reviewed_by_name, pm_user_id
    ):
        """
        Notify Production Manager when TD reviews (approves/rejects/backup) their disposal request.
        Trigger: review_disposal() in inventory_controller.py
        Recipients: The PM who requested the disposal
        """
        try:
            if not pm_user_id:
                return
            if check_duplicate_notification(pm_user_id, 'Disposal Review', 'return_id', return_id, minutes=5):
                return

            if action == 'approved':
                title = f'Disposal Approved — {material_name}'
                message = f'{reviewed_by_name} approved disposal of {quantity} {unit or "units"} of {material_name}. Proceed with disposal.'
                notif_type = 'success'
                priority = 'normal'
            elif action == 'backup':
                title = f'Material Sent to Backup — {material_name}'
                message = f'{reviewed_by_name} moved {quantity} {unit or "units"} of {material_name} to backup stock.'
                notif_type = 'info'
                priority = 'normal'
            else:
                title = f'Disposal Rejected — {material_name}'
                message = f'{reviewed_by_name} rejected disposal of {quantity} {unit or "units"} of {material_name}.'
                notif_type = 'rejection'
                priority = 'high'

            action_url = build_notification_action_url(
                user_id=pm_user_id,
                base_page='m2-store/disposal',
                query_params={},
                fallback_role_route='production-manager'
            )
            notification = NotificationManager.create_notification(
                user_id=pm_user_id,
                type=notif_type,
                title=title,
                message=message,
                priority=priority,
                category='inventory',
                action_required=False,
                action_url=action_url,
                action_label='View Disposal',
                metadata={
                    'return_id': return_id,
                    'material_name': material_name,
                    'action': action,
                    'workflow': 'material_disposal_reviewed'
                },
                sender_name=reviewed_by_name
            )
            send_notification_to_user(pm_user_id, notification.to_dict())
        except Exception as e:
            log.error(f"Error sending material disposal reviewed notification: {e}")


# Create singleton instance
notification_service = ComprehensiveNotificationService()
