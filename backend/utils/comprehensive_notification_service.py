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
from utils.role_route_mapper import (
    get_boq_approval_url,
    get_boq_view_url,
    get_td_approval_url,
    get_change_request_url,
    get_project_url,
    build_notification_action_url
)

log = get_logger()


def check_duplicate_notification(user_id, title_pattern, metadata_key, metadata_value, minutes=5):
    """
    Check if a similar notification was already sent recently
    Returns True if duplicate exists, False otherwise
    """
    try:
        cutoff_time = datetime.utcnow() - timedelta(minutes=minutes)
        existing = Notification.query.filter(
            Notification.user_id == user_id,
            Notification.title.ilike(f'%{title_pattern}%'),
            Notification.created_at >= cutoff_time,
            Notification.deleted_at.is_(None)
        ).first()

        if existing:
            # Check metadata if both notification has metadata and we have a key to check
            if existing.meta_data and metadata_key and metadata_value is not None:
                stored_value = existing.meta_data.get(metadata_key)
                # Compare as strings to handle type mismatches (int vs str)
                if str(stored_value) == str(metadata_value):
                    log.info(f"[DuplicateCheck] Found duplicate notification for user {user_id}, {metadata_key}={metadata_value}")
                    return True
            else:
                # If no metadata to compare, just check title match is enough
                log.info(f"[DuplicateCheck] Found duplicate notification by title for user {user_id}, title pattern: {title_pattern}")
                return True
        return False
    except Exception as e:
        log.error(f"[DuplicateCheck] Error checking duplicate: {e}")
        return False


class ComprehensiveNotificationService:
    """Unified notification service for all ERP workflows"""

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

            log.info(f"Sent BOQ created notification for BOQ {boq_id} to PM {pm_user_id}")
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
            log.info(f"Sent BOQ approval request to user {pm_user_id} for BOQ {boq_id}")
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
            log.info(f"Sent PM decision notification for BOQ {boq_id}")
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
            # Check for duplicate notification (within 5 minutes)
            if check_duplicate_notification(td_user_id, 'BOQ', 'boq_id', boq_id, minutes=5):
                log.info(f"[notify_boq_sent_to_td] Skipping duplicate notification for TD {td_user_id}, BOQ {boq_id}")
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

            send_notification_to_user(td_user_id, notification.to_dict())
            log.info(f"[notify_boq_sent_to_td] Notification sent to TD {td_user_id} for BOQ {boq_id}")
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
            log.info(f"Sent BOQ to client notification for BOQ {boq_id}")
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
                # Check for duplicate notification
                if check_duplicate_notification(td_user.user_id, 'Client Approved', 'boq_id', boq_id, minutes=5):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=td_user.user_id,
                    type='success',
                    title='Client Approved BOQ',
                    message=f'BOQ for {project_name} has been approved{client_info}. Confirmed by {estimator_name}',
                    priority='high',
                    category='boq',
                    action_url=build_notification_action_url(td_user_id, 'project-approvals', {'tab': 'sent', 'boq_id': boq_id}, 'technical-director'),
                    action_label='View BOQ',
                    metadata={'boq_id': boq_id, 'client_confirmed': True},
                    sender_id=estimator_id,
                    sender_name=estimator_name
                )

                send_notification_to_user(td_user.user_id, notification.to_dict())
                log.info(f"Sent client confirmation notification to TD {td_user.user_id} for BOQ {boq_id}")

        except Exception as e:
            log.error(f"Error sending client confirmation notification: {e}")
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
                # Check for duplicate notification
                if check_duplicate_notification(td_user.user_id, 'Client Rejected', 'boq_id', boq_id, minutes=5):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=td_user.user_id,
                    type='rejection',
                    title='Client Rejected BOQ',
                    message=f'BOQ for {project_name} was rejected by client. Reason: {rejection_reason}',
                    priority='high',
                    category='boq',
                    action_required=True,
                    action_url=build_notification_action_url(td_user_id, 'project-approvals', {'tab': 'sent', 'boq_id': boq_id}, 'technical-director'),
                    action_label='View Details',
                    metadata={'boq_id': boq_id, 'client_rejected': True, 'reason': rejection_reason},
                    sender_id=estimator_id,
                    sender_name=estimator_name
                )

                send_notification_to_user(td_user.user_id, notification.to_dict())
                log.info(f"Sent client rejection notification to TD {td_user.user_id} for BOQ {boq_id}")

        except Exception as e:
            log.error(f"Error sending client rejection notification: {e}")
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
            for user_id in recipient_user_ids:
                # Check for duplicate notification
                if check_duplicate_notification(user_id, 'BOQ', 'boq_id', boq_id, minutes=5):
                    log.info(f"[notify_td_boq_decision] Skipping duplicate for user {user_id}, BOQ {boq_id}")
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
                log.info(f"[notify_td_boq_decision] Sent {decision} notification to user {user_id} for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error sending TD decision notification: {e}")

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
                    log.info(f"Skipping duplicate PM assignment notification for project {project_id} to user {pm_user_id}")
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

            log.info(f"Sent PM assignment notification for project {project_id}")
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
                log.info(f"Skipping duplicate SE item assignment notification for BOQ {boq_id}")
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
            log.info(f"Sent item assignment notification to SE {se_user_id}")
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
                log.info(f"Skipping duplicate completion request notification for BOQ {boq_id}")
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
            log.info(f"Sent completion request notification to PM {pm_user_id}")
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
                log.info(f"Skipping duplicate completion confirmation for BOQ {boq_id}")
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
            log.info(f"Sent completion confirmation to SE {se_user_id}")
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
            log.info(f"[notify_cr_created] CR {cr_id} - Sending to {len(recipient_user_ids)} recipients: {recipient_user_ids}, role: {recipient_role}, request_type: {request_type}, has_new_materials: {has_new_materials}")

            for user_id in recipient_user_ids:
                # Check for duplicate notification
                if check_duplicate_notification(user_id, 'Materials Purchase', 'cr_id', cr_id, minutes=5):
                    log.info(f"[notify_cr_created] Skipping duplicate CR created notification for CR {cr_id} to user {user_id}")
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
                else:
                    # Other roles (PM/TD) use extra-material or change-requests based on request_type
                    route = 'extra-material' if request_type == 'EXTRA_MATERIALS' else 'change-requests'

                action_url = f'/{recipient_role_lower}/{route}?cr_id={cr_id}'
                log.info(f"[notify_cr_created] Creating notification for user {user_id}, action_url: {action_url}")

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

                log.info(f"[notify_cr_created] Notification created with ID: {notification.id}, sending to user {user_id}")
                send_notification_to_user(user_id, notification.to_dict())
                log.info(f"[notify_cr_created] Notification sent successfully to user {user_id}")

            log.info(f"[notify_cr_created] Completed sending CR created notification for CR {cr_id}")
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
            # Buyer uses 'purchase-orders' page for all CR/PO work
            # Estimator uses 'change-requests' page (they don't have /extra-material route)
            next_role_lower = (next_role or '').lower().replace(' ', '-').replace('_', '-')

            if next_role_lower == 'buyer':
                # Buyer views purchase requests on purchase-orders page
                route = 'purchase-orders'
            elif next_role_lower == 'estimator':
                # Estimator ALWAYS goes to change-requests (they don't have /extra-material route)
                route = 'change-requests'
            else:
                # Other roles (PM/TD) use extra-material or change-requests
                route = 'extra-material' if request_type == 'EXTRA_MATERIALS' else 'change-requests'

            for user_id in next_user_ids:
                # Check for duplicate notification
                if check_duplicate_notification(user_id, 'Request Approved', 'cr_id', cr_id, minutes=5):
                    log.info(f"Skipping duplicate CR approved notification for CR {cr_id}")
                    continue

                action_url = f'/{next_role_lower}/{route}?cr_id={cr_id}'
                log.info(f"[notify_cr_approved] Creating notification for user {user_id}, action_url: {action_url}")

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
                log.info(f"[notify_cr_approved] Notification sent to user {user_id}")

            log.info(f"Sent CR approved notification for CR {cr_id}")
        except Exception as e:
            log.error(f"Error sending CR approved notification: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")

    @staticmethod
    def notify_cr_rejected(cr_id, project_name, rejector_id, rejector_name, rejector_role, creator_user_id, rejection_reason, request_type=None, creator_role=None):
        """
        Notify creator when CR is rejected
        Trigger: Any approver rejects CR
        Recipients: Original creator
        Priority: HIGH
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(creator_user_id, 'Request Rejected', 'cr_id', cr_id, minutes=5):
                log.info(f"Skipping duplicate CR rejected notification for CR {cr_id}")
                return

            # ✅ Generate dynamic URL based on recipient's actual role from database
            route = 'extra-material' if request_type == 'EXTRA_MATERIALS' else 'change-requests'
            action_url = build_notification_action_url(
                user_id=creator_user_id,
                base_page=route,
                query_params={'cr_id': cr_id},
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
            log.info(f"Sent CR rejected notification for CR {cr_id}")
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
                log.info(f"Skipping duplicate vendor selection notification for CR {cr_id}")
                return

            log.info(f"[notify_vendor_selected_for_cr] Creating notification for TD user {td_user_id}, CR {cr_id}, vendor {vendor_name}")

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
            log.info(f"[notify_vendor_selected_for_cr] Sent vendor selection notification to TD {td_user_id} for CR {cr_id}")
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
                log.info(f"Skipping duplicate CR purchase completed notification for CR {cr_id}")
                return

            # ✅ Generate dynamic URL based on recipient's actual role from database
            route = 'extra-material' if request_type == 'EXTRA_MATERIALS' else 'change-requests'
            action_url = build_notification_action_url(
                user_id=requester_user_id,
                base_page=route,
                query_params={'cr_id': cr_id},
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
            log.info(f"Sent CR purchase completed notification for CR {cr_id}")
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
                log.info(f"Skipping duplicate day extension request notification for BOQ {boq_id}")
                return

            notification = NotificationManager.create_notification(
                user_id=td_user_id,
                type='alert',
                title='Day Extension Request',
                message=f'{pm_name} requested {days_requested} day(s) extension for {project_name}. Reason: {reason}',
                priority='urgent',
                category='extension',
                action_required=True,
                action_url=get_td_approval_url(td_user_id, boq_id, tab='assigned'),
                action_label='Review Request',
                metadata={'boq_id': boq_id, 'days_requested': days_requested, 'reason': reason},
                sender_id=pm_id,
                sender_name=pm_name
            )

            send_notification_to_user(td_user_id, notification.to_dict())
            log.info(f"Sent day extension request notification for BOQ {boq_id}")
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
                log.info(f"Skipping duplicate day extension approved notification for BOQ {boq_id}")
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
            log.info(f"Sent day extension approved notification for BOQ {boq_id}")
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
                log.info(f"Skipping duplicate day extension rejected notification for BOQ {boq_id}")
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
            log.info(f"Sent day extension rejected notification for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error sending day extension rejected notification: {e}")

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
                log.info(f"Skipping duplicate vendor approved notification for vendor {vendor_id}")
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
            log.info(f"Sent vendor approved notification for vendor {vendor_id}")
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
                # Check for duplicate notification
                if check_duplicate_notification(td_user.user_id, 'Internal Revision', 'boq_id', boq_id, minutes=5):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=td_user.user_id,
                    type='approval',
                    title='Internal Revision Pending Review',
                    message=f'BOQ for {project_name} has internal revision #{revision_number} by {actor_name} ({actor_role})',
                    priority='high',
                    category='boq',
                    action_required=True,
                    action_url=get_td_approval_url(td_user.user_id, boq_id, tab='revisions'),
                    action_label='Review Revision',
                    metadata={'boq_id': boq_id, 'internal_revision_number': revision_number, 'target_role': 'technical_director'},
                    sender_id=actor_id,
                    sender_name=actor_name,
                    target_role='technical_director'
                )

                send_notification_to_user(td_user.user_id, notification.to_dict())
                log.info(f"Sent internal revision notification to TD {td_user.user_id} for BOQ {boq_id}")

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
            # Check for duplicate notification
            if check_duplicate_notification(actor_user_id, 'Internal Revision Approved', 'boq_id', boq_id, minutes=5):
                log.info(f"[notify_internal_revision_approved] Skipping duplicate for BOQ {boq_id}, user {actor_user_id}")
                return

            notification = NotificationManager.create_notification(
                user_id=actor_user_id,
                type='success',
                title='Internal Revision Approved',
                message=f'Your internal revision #{revision_number} for {project_name} was approved by {td_name}',
                priority='high',
                category='boq',
                action_url=get_boq_view_url(actor_user_id, boq_id, tab='revisions'),
                action_label='View BOQ',
                metadata={'boq_id': boq_id, 'internal_revision_number': revision_number, 'decision': 'approved', 'target_role': 'estimator'},
                sender_id=td_id,
                sender_name=td_name,
                target_role='estimator'
            )

            send_notification_to_user(actor_user_id, notification.to_dict())
            log.info(f"Sent internal revision approved notification for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error sending internal revision approved notification: {e}")

    @staticmethod
    def notify_internal_revision_rejected(boq_id, project_name, revision_number, td_id, td_name, actor_user_id, actor_name, rejection_reason):
        """
        Notify the person who created the revision when TD rejects it
        Trigger: TD rejects internal revision
        Recipients: User who made the revision
        Priority: HIGH
        """
        try:
            # Check for duplicate notification
            if check_duplicate_notification(actor_user_id, 'Internal Revision Rejected', 'boq_id', boq_id, minutes=5):
                log.info(f"[notify_internal_revision_rejected] Skipping duplicate for BOQ {boq_id}, user {actor_user_id}")
                return

            notification = NotificationManager.create_notification(
                user_id=actor_user_id,
                type='rejection',
                title='Internal Revision Rejected',
                message=f'Your internal revision #{revision_number} for {project_name} was rejected by {td_name}. Reason: {rejection_reason}',
                priority='high',
                category='boq',
                action_required=True,
                action_url=get_boq_view_url(actor_user_id, boq_id, tab='revisions'),
                action_label='View Details',
                metadata={'boq_id': boq_id, 'internal_revision_number': revision_number, 'decision': 'rejected', 'reason': rejection_reason, 'target_role': 'estimator'},
                sender_id=td_id,
                sender_name=td_name,
                target_role='estimator'
            )

            send_notification_to_user(actor_user_id, notification.to_dict())
            log.info(f"Sent internal revision rejected notification for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error sending internal revision rejected notification: {e}")

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
                log.info(f"[notify_client_revision_approved] Skipping duplicate for BOQ {boq_id}, user {estimator_user_id}")
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
            log.info(f"Sent client revision approved notification to estimator {estimator_user_id} for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error sending client revision approved notification: {e}")

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
                log.info(f"[notify_client_revision_rejected] Skipping duplicate for BOQ {boq_id}, user {estimator_user_id}")
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
            log.info(f"Sent client revision rejected notification to estimator {estimator_user_id} for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error sending client revision rejected notification: {e}")

    # ==================== RETURNABLE ASSETS NOTIFICATIONS ====================

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
                log.info(f"Sent asset dispatch notification to SE {se_user_id} for project {project_id}")

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
                Role.role == 'production-manager',
                User.is_active == True
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
                log.info(f"Sent asset received notification to PM {pm_user_id}")

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
                log.info(f"Sent asset return notification to PM {pm_user_id}")

        except Exception as e:
            log.error(f"Error sending asset return notification: {e}")

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
            pm_role = Role.query.filter_by(role='Production Manager').first()
            pm_users = []
            if pm_role:
                pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True).all()

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

            log.info(f"Sent backup stock notification for {material_name} ({quantity} {unit})")
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
            pm_role = Role.query.filter_by(role='Production Manager').first()
            pm_users = []
            if pm_role:
                pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True).all()

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

            log.info(f"Sent disposal approval notification for {material_name} ({quantity} {unit})")
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
            pm_role = Role.query.filter_by(role='Production Manager').first()
            if not pm_role:
                log.warning("Production Manager role not found")
                return

            pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True).all()

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

            log.info(f"Sent damaged return review notification for {material_name} to {len(pm_users)} PMs")
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
            log.info(f"Sent return approved notification to SE {site_engineer_id}")
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
            log.info(f"Sent return rejected notification to SE {site_engineer_id}")
        except Exception as e:
            log.error(f"Error sending return rejected notification: {e}")

    @staticmethod
    def notify_delivery_note_dispatched(
        delivery_note_number, project_name, materials_summary,
        dispatched_by_name, site_engineer_ids
    ):
        """
        Notify Site Engineers when materials are dispatched to their project
        Trigger: PM dispatches delivery note
        Recipients: Site Engineers assigned to the project
        """
        try:
            for se_id in site_engineer_ids:
                notification = NotificationManager.create_notification(
                    user_id=se_id,
                    type='info',
                    title='Materials Dispatched to Your Site',
                    message=f'Delivery Note {delivery_note_number} dispatched to {project_name}. Materials: {materials_summary[:100]}...',
                    priority='normal',
                    category='inventory',
                    action_required=False,
                    action_url='/site-engineer/material-receipts',
                    action_label='View Deliveries',
                    metadata={
                        'delivery_note_number': delivery_note_number,
                        'project_name': project_name,
                        'workflow': 'delivery_note'
                    },
                    sender_name=dispatched_by_name
                )
                send_notification_to_user(se_id, notification.to_dict())

            log.info(f"Sent dispatch notification to {len(site_engineer_ids)} SEs for DN {delivery_note_number}")
        except Exception as e:
            log.error(f"Error sending dispatch notification: {e}")

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
            pm_role = Role.query.filter_by(role='Production Manager').first()
            if not pm_role:
                return

            pm_users = User.query.filter_by(role_id=pm_role.role_id, is_active=True).all()

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

            log.info(f"Sent delivery confirmed notification for DN {delivery_note_number}")
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

            log.info(f"Created support ticket notification for #{ticket_number}")
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
            # Notify client if they have a user account
            if client_user_id:
                # Check for duplicate
                if not check_duplicate_notification(client_user_id, f'Ticket #{ticket_number} Approved', 'ticket_id', ticket_id):
                    notification = NotificationManager.create_notification(
                        user_id=client_user_id,
                        type='success',
                        title=f'Your Ticket #{ticket_number} is Approved',
                        message=f'Your support ticket "{subject[:60]}..." has been approved and our team is working on it.',
                        priority='normal',
                        category='support',
                        action_required=False,
                        action_url=build_notification_action_url(client_user_id, 'support', {'ticket_id': ticket_id}, 'dashboard'),
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
                    send_notification_to_user(client_user_id, notification.to_dict())

            log.info(f"Sent ticket approval notification for ticket #{ticket_number} to client")
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

            log.info(f"Sent ticket rejection notification for ticket #{ticket_number} to client")
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

            log.info(f"Sent ticket status update notification for ticket #{ticket_number} to client (status: {new_status})")
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

            log.info(f"Sent ticket resolution notification for ticket #{ticket_number} to client")
        except Exception as e:
            log.error(f"Error sending ticket resolution notification: {e}")

    @staticmethod
    def notify_ticket_closed_by_client(ticket_id, ticket_number, subject, client_name, client_feedback):
        """
        Notify dev team when client confirms resolution and closes ticket
        Trigger: Client confirms resolution
        Recipients: All admin/dev team users
        """
        try:
            # Get admin users (dev team)
            admin_role = Role.query.filter_by(role='admin').first()
            dev_users = []
            if admin_role:
                dev_users = User.query.filter_by(role_id=admin_role.role_id, is_active=True, is_deleted=False).all()

            for dev_user in dev_users:
                # Check for duplicate
                if check_duplicate_notification(dev_user.user_id, f'Ticket #{ticket_number} Closed', 'ticket_id', ticket_id):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=dev_user.user_id,
                    type='success',
                    title=f'Ticket #{ticket_number} Closed by Client',
                    message=f'{client_name} confirmed resolution and closed ticket "{subject[:60]}...". Feedback: {client_feedback[:50] if client_feedback else "None"}...',
                    priority='normal',
                    category='support',
                    action_required=False,
                    action_url=build_notification_action_url(dev_user.user_id, 'support-management', {'ticket_id': ticket_id}, 'admin'),
                    action_label='View Ticket',
                    metadata={
                        'ticket_id': ticket_id,
                        'ticket_number': ticket_number,
                        'status': 'closed',
                        'client_feedback': client_feedback,
                        'workflow': 'support_ticket',
                        'target_role': 'admin'
                    },
                    sender_name=client_name,
                    target_role='admin'
                )
                send_notification_to_user(dev_user.user_id, notification.to_dict())

            log.info(f"Sent ticket closure notification to {len(dev_users)} dev team members for ticket #{ticket_number}")
        except Exception as e:
            log.error(f"Error sending ticket closure notification: {e}")


# Create singleton instance
notification_service = ComprehensiveNotificationService()
