"""
Comprehensive Notification Service
Handles notifications for ALL workflows: BOQ, CR, PR, Projects, Extensions, Vendors, etc.
"""

from utils.notification_utils import NotificationManager
from socketio_server import send_notification_to_user, send_notification_to_role
from models.user import User
from models.role import Role
from models.notification import Notification
from config.logging import get_logger
from config.db import db
from datetime import datetime, timedelta

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

        if existing and existing.meta_data:
            if existing.meta_data.get(metadata_key) == metadata_value:
                log.info(f"[DuplicateCheck] Found existing notification for user {user_id}, {metadata_key}={metadata_value}")
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
        """
        try:
            notification = NotificationManager.create_notification(
                user_id=pm_user_id,
                type='approval',
                title='BOQ Requires Your Approval',
                message=f'BOQ for {project_name} has been sent by {estimator_name} and requires your approval',
                priority='urgent',
                category='boq',
                action_required=True,
                action_url=f'/project-manager/my-projects?boq_id={boq_id}',
                action_label='Review BOQ',
                metadata={'boq_id': boq_id},
                sender_id=estimator_id,
                sender_name=estimator_name
            )

            send_notification_to_user(pm_user_id, notification.to_dict())
            log.info(f"Sent BOQ approval request to PM {pm_user_id} for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error sending BOQ approval notification: {e}")

    @staticmethod
    def notify_pm_boq_decision(boq_id, project_name, pm_id, pm_name, estimator_user_id, approved, rejection_reason=None):
        """
        Notify Estimator when PM approves/rejects BOQ
        Trigger: PM decision on BOQ
        Recipients: Estimator who created BOQ
        Priority: HIGH
        """
        try:
            if approved:
                notification = NotificationManager.create_notification(
                    user_id=estimator_user_id,
                    type='success',
                    title='BOQ Approved by PM',
                    message=f'Your BOQ for {project_name} has been approved by {pm_name}',
                    priority='high',
                    category='boq',
                    action_url=f'/estimator/projects?tab=approved&boq_id={boq_id}',
                    action_label='View BOQ',
                    metadata={'boq_id': boq_id, 'decision': 'approved'},
                    sender_id=pm_id,
                    sender_name=pm_name
                )
            else:
                notification = NotificationManager.create_notification(
                    user_id=estimator_user_id,
                    type='rejection',
                    title='BOQ Rejected by PM',
                    message=f'Your BOQ for {project_name} was rejected by {pm_name}. Reason: {rejection_reason or "No reason provided"}',
                    priority='high',
                    category='boq',
                    action_required=True,
                    action_url=f'/estimator/projects?tab=rejected&boq_id={boq_id}',
                    action_label='View Details',
                    metadata={'boq_id': boq_id, 'decision': 'rejected', 'reason': rejection_reason},
                    sender_id=pm_id,
                    sender_name=pm_name
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
        """
        try:
            # Check for duplicate notification (within 5 minutes)
            if check_duplicate_notification(td_user_id, 'BOQ', 'boq_id', boq_id, minutes=5):
                log.info(f"[notify_boq_sent_to_td] Skipping duplicate notification for TD {td_user_id}, BOQ {boq_id}")
                return

            notification = NotificationManager.create_notification(
                user_id=td_user_id,
                type='approval',
                title='New BOQ for Approval',
                message=f'BOQ for {project_name} requires your approval. Submitted by {estimator_name}',
                priority='urgent',
                category='boq',
                action_required=True,
                action_url=f'/technical-director/project-approvals?tab=pending&boq_id={boq_id}',
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
                    action_url=f'/technical-director/project-approvals?tab=sent&boq_id={boq_id}',
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
                    action_url=f'/technical-director/project-approvals?tab=sent&boq_id={boq_id}',
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
                    action_url=f'/technical-director/project-approvals?tab=sent&boq_id={boq_id}',
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
                        action_url=f'/estimator/projects?tab=approved&boq_id={boq_id}',
                        action_label='View BOQ',
                        metadata={'boq_id': boq_id, 'decision': 'approved'},
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
                        action_url=f'/estimator/projects?tab=rejected&boq_id={boq_id}',
                        action_label='View Details',
                        metadata={'boq_id': boq_id, 'decision': 'rejected', 'reason': rejection_reason},
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
                    action_url=f'/project-manager/my-projects?project_id={project_id}',
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
                action_url=f'/site-engineer/projects?boq_id={boq_id}',
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
                action_url=f'/project-manager/my-projects?boq_id={boq_id}',
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
                action_url=f'/site-engineer/projects?boq_id={boq_id}',
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
    def notify_cr_created(cr_id, project_name, creator_id, creator_name, creator_role, recipient_user_ids, recipient_role):
        """
        Notify PM/TD when change request is created
        Trigger: SE/PM creates CR
        Recipients: PM if SE created, TD if PM created
        Priority: URGENT
        """
        try:
            for user_id in recipient_user_ids:
                # Check for duplicate notification
                if check_duplicate_notification(user_id, 'Change Request', 'cr_id', cr_id, minutes=5):
                    log.info(f"Skipping duplicate CR created notification for CR {cr_id}")
                    continue

                notification = NotificationManager.create_notification(
                    user_id=user_id,
                    type='approval',
                    title='New Change Request',
                    message=f'{creator_name} ({creator_role}) created a change request for {project_name}',
                    priority='urgent',
                    category='change_request',
                    action_required=True,
                    action_url=f'/{recipient_role.lower().replace(" ", "-")}/change-requests?cr_id={cr_id}',
                    action_label='Review Request',
                    metadata={'cr_id': cr_id},
                    sender_id=creator_id,
                    sender_name=creator_name
                )

                send_notification_to_user(user_id, notification.to_dict())

            log.info(f"Sent CR created notification for CR {cr_id}")
        except Exception as e:
            log.error(f"Error sending CR created notification: {e}")

    @staticmethod
    def notify_cr_approved(cr_id, project_name, approver_id, approver_name, approver_role, next_user_ids, next_role):
        """
        Notify next approver when CR is approved
        Trigger: PM/TD/Estimator approves CR
        Recipients: Next approver in chain
        Priority: HIGH
        """
        try:
            for user_id in next_user_ids:
                # Check for duplicate notification
                if check_duplicate_notification(user_id, 'Request Approved', 'cr_id', cr_id, minutes=5):
                    log.info(f"Skipping duplicate CR approved notification for CR {cr_id}")
                    continue

                notification = NotificationManager.create_notification(
                    user_id=user_id,
                    type='approval',
                    title='Change Request Approved - Your Review Required',
                    message=f'Change request for {project_name} was approved by {approver_name} ({approver_role}) and requires your review',
                    priority='high',
                    category='change_request',
                    action_required=True,
                    action_url=f'/{next_role.lower().replace(" ", "-")}/change-requests?cr_id={cr_id}',
                    action_label='Review Request',
                    metadata={'cr_id': cr_id},
                    sender_id=approver_id,
                    sender_name=approver_name
                )

                send_notification_to_user(user_id, notification.to_dict())

            log.info(f"Sent CR approved notification for CR {cr_id}")
        except Exception as e:
            log.error(f"Error sending CR approved notification: {e}")

    @staticmethod
    def notify_cr_rejected(cr_id, project_name, rejector_id, rejector_name, rejector_role, creator_user_id, rejection_reason):
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

            notification = NotificationManager.create_notification(
                user_id=creator_user_id,
                type='rejection',
                title='Change Request Rejected',
                message=f'Your change request for {project_name} was rejected by {rejector_name} ({rejector_role}). Reason: {rejection_reason}',
                priority='high',
                category='change_request',
                action_required=True,
                action_url=f'/site-engineer/change-requests?cr_id={cr_id}',
                action_label='View Details',
                metadata={'cr_id': cr_id, 'reason': rejection_reason},
                sender_id=rejector_id,
                sender_name=rejector_name
            )

            send_notification_to_user(creator_user_id, notification.to_dict())
            log.info(f"Sent CR rejected notification for CR {cr_id}")
        except Exception as e:
            log.error(f"Error sending CR rejected notification: {e}")

    @staticmethod
    def notify_vendor_selected_for_cr(cr_id, project_name, buyer_id, buyer_name, td_user_id, vendor_name):
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

            notification = NotificationManager.create_notification(
                user_id=td_user_id,
                type='approval',
                title='Vendor Selection Requires Approval',
                message=f'{buyer_name} selected vendor "{vendor_name}" for change request in {project_name}',
                priority='urgent',
                category='change_request',
                action_required=True,
                action_url=f'/technical-director/vendor-approval?cr_id={cr_id}',
                action_label='Review Vendor',
                metadata={'cr_id': cr_id, 'vendor_name': vendor_name},
                sender_id=buyer_id,
                sender_name=buyer_name
            )

            send_notification_to_user(td_user_id, notification.to_dict())
            log.info(f"Sent vendor selection notification to TD for CR {cr_id}")
        except Exception as e:
            log.error(f"Error sending vendor selection notification: {e}")

    @staticmethod
    def notify_cr_purchase_completed(cr_id, project_name, buyer_id, buyer_name, requester_user_id):
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

            notification = NotificationManager.create_notification(
                user_id=requester_user_id,
                type='success',
                title='Change Request Purchase Completed',
                message=f'{buyer_name} completed the purchase for your change request in {project_name}',
                priority='medium',
                category='change_request',
                action_url=f'/site-engineer/change-requests?cr_id={cr_id}',
                action_label='View Details',
                metadata={'cr_id': cr_id},
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
                action_url=f'/technical-director/project-approvals?tab=assigned&boq_id={boq_id}',
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
                action_url=f'/project-manager/my-projects?boq_id={boq_id}',
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
                action_url=f'/project-manager/my-projects?boq_id={boq_id}',
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
                action_url=f'/buyer/vendors/{vendor_id}',
                action_label='View Vendor',
                metadata={'vendor_id': vendor_id},
                sender_id=td_id,
                sender_name=td_name
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
                    action_url=f'/technical-director/project-approvals?tab=revisions&boq_id={boq_id}',
                    action_label='Review Revision',
                    metadata={'boq_id': boq_id, 'internal_revision_number': revision_number},
                    sender_id=actor_id,
                    sender_name=actor_name
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
            notification = NotificationManager.create_notification(
                user_id=actor_user_id,
                type='success',
                title='Internal Revision Approved',
                message=f'Your internal revision #{revision_number} for {project_name} was approved by {td_name}',
                priority='high',
                category='boq',
                action_url=f'/estimator/projects?tab=revisions&boq_id={boq_id}',
                action_label='View BOQ',
                metadata={'boq_id': boq_id, 'internal_revision_number': revision_number, 'decision': 'approved'},
                sender_id=td_id,
                sender_name=td_name
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
            notification = NotificationManager.create_notification(
                user_id=actor_user_id,
                type='rejection',
                title='Internal Revision Rejected',
                message=f'Your internal revision #{revision_number} for {project_name} was rejected by {td_name}. Reason: {rejection_reason}',
                priority='high',
                category='boq',
                action_required=True,
                action_url=f'/estimator/projects?tab=revisions&boq_id={boq_id}',
                action_label='View Details',
                metadata={'boq_id': boq_id, 'internal_revision_number': revision_number, 'decision': 'rejected', 'reason': rejection_reason},
                sender_id=td_id,
                sender_name=td_name
            )

            send_notification_to_user(actor_user_id, notification.to_dict())
            log.info(f"Sent internal revision rejected notification for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error sending internal revision rejected notification: {e}")

    @staticmethod
    def notify_client_revision_approved(boq_id, project_name, td_id, td_name, estimator_user_id, estimator_name):
        """
        Notify estimator when TD approves client revision
        Trigger: TD approves client revision BOQ
        Recipients: Estimator who submitted revision
        Priority: HIGH
        """
        try:
            notification = NotificationManager.create_notification(
                user_id=estimator_user_id,
                type='success',
                title='Client Revision Approved',
                message=f'Client revision for {project_name} has been approved by {td_name}',
                priority='high',
                category='boq',
                action_url=f'/estimator/projects?tab=revisions&boq_id={boq_id}',
                action_label='View BOQ',
                metadata={'boq_id': boq_id, 'client_revision_approved': True},
                sender_id=td_id,
                sender_name=td_name
            )

            send_notification_to_user(estimator_user_id, notification.to_dict())
            log.info(f"Sent client revision approved notification to estimator {estimator_user_id} for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error sending client revision approved notification: {e}")

    @staticmethod
    def notify_client_revision_rejected(boq_id, project_name, td_id, td_name, estimator_user_id, estimator_name, rejection_reason):
        """
        Notify estimator when TD rejects client revision
        Trigger: TD rejects client revision BOQ
        Recipients: Estimator who submitted revision
        Priority: HIGH
        """
        try:
            notification = NotificationManager.create_notification(
                user_id=estimator_user_id,
                type='rejection',
                title='Client Revision Rejected',
                message=f'Client revision for {project_name} was rejected by {td_name}. Reason: {rejection_reason}',
                priority='high',
                category='boq',
                action_required=True,
                action_url=f'/estimator/projects?tab=revisions&boq_id={boq_id}',
                action_label='Make Changes',
                metadata={'boq_id': boq_id, 'client_revision_rejected': True, 'reason': rejection_reason},
                sender_id=td_id,
                sender_name=td_name
            )

            send_notification_to_user(estimator_user_id, notification.to_dict())
            log.info(f"Sent client revision rejected notification to estimator {estimator_user_id} for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error sending client revision rejected notification: {e}")


# Create singleton instance
notification_service = ComprehensiveNotificationService()
