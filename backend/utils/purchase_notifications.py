"""
Purchase Notification Helper
Integrates purchase workflow with notification system
"""

from utils.notification_utils import NotificationManager
from socketio_server import send_notification_to_user, send_notification_to_role
from models.user import User
from models.role import Role
from config.logging import get_logger

log = get_logger()

def notify_purchase_created(boq_id, project_name, created_by_id, created_by_name, target_users=None):
    """
    Notify relevant users when a new purchase is created

    Args:
        boq_id: BOQ ID
        project_name: Project name
        created_by_id: User ID of creator
        created_by_name: Name of creator
        target_users: List of user IDs to notify (if None, notifies all estimators)
    """
    try:
        # Get target users (default to all estimators if not specified)
        if not target_users:
            estimator_role = Role.query.filter_by(role_name='Estimator').first()
            if estimator_role:
                users = User.query.filter_by(role_id=estimator_role.role_id).all()
                target_users = [user.user_id for user in users]
            else:
                log.warning("Estimator role not found, cannot send notifications")
                return

        if not target_users:
            log.warning("No target users found for purchase notification")
            return

        # Create notifications for each target user
        notifications = NotificationManager.notify_pr_action(
            action='submitted',
            pr_id=str(boq_id),
            document_id=f"BOQ-{boq_id}",
            project_name=project_name,
            target_user_ids=target_users,
            sender_id=created_by_id,
            sender_name=created_by_name,
            target_role='estimator',
            additional_info='Please review and approve the new purchase request',
            metadata={
                'boq_id': boq_id,
                'project_name': project_name
            }
        )

        # Send real-time notifications via Socket.IO
        for notification in notifications:
            notification_data = notification.to_dict()

            # Send to specific user
            if notification.user_id:
                send_notification_to_user(notification.user_id, notification_data)

            # Also broadcast to role
            if notification.target_role:
                send_notification_to_role(notification.target_role, notification_data)

        log.info(f"Sent {len(notifications)} purchase created notifications for BOQ {boq_id}")

    except Exception as e:
        log.error(f"Error sending purchase created notifications: {e}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")


def notify_purchase_approved(boq_id, project_name, approved_by_id, approved_by_name, target_user_id):
    """
    Notify PM when their purchase request is approved

    Args:
        boq_id: BOQ ID
        project_name: Project name
        approved_by_id: User ID of approver
        approved_by_name: Name of approver
        target_user_id: User ID of PM who created the purchase
    """
    try:
        notifications = NotificationManager.notify_pr_action(
            action='approved',
            pr_id=str(boq_id),
            document_id=f"BOQ-{boq_id}",
            project_name=project_name,
            target_user_ids=[target_user_id],
            sender_id=approved_by_id,
            sender_name=approved_by_name,
            additional_info='Your purchase request has been approved',
            metadata={
                'boq_id': boq_id,
                'project_name': project_name
            }
        )

        # Send real-time notification
        for notification in notifications:
            send_notification_to_user(notification.user_id, notification.to_dict())

        log.info(f"Sent purchase approved notification for BOQ {boq_id} to user {target_user_id}")

    except Exception as e:
        log.error(f"Error sending purchase approved notification: {e}")


def notify_purchase_rejected(boq_id, project_name, rejected_by_id, rejected_by_name, target_user_id, rejection_reason):
    """
    Notify PM when their purchase request is rejected

    Args:
        boq_id: BOQ ID
        project_name: Project name
        rejected_by_id: User ID of rejector
        rejected_by_name: Name of rejector
        target_user_id: User ID of PM who created the purchase
        rejection_reason: Reason for rejection
    """
    try:
        notifications = NotificationManager.notify_pr_action(
            action='rejected',
            pr_id=str(boq_id),
            document_id=f"BOQ-{boq_id}",
            project_name=project_name,
            target_user_ids=[target_user_id],
            sender_id=rejected_by_id,
            sender_name=rejected_by_name,
            additional_info=f'Reason: {rejection_reason}',
            metadata={
                'boq_id': boq_id,
                'project_name': project_name,
                'rejection_reason': rejection_reason
            }
        )

        # Send real-time notification
        for notification in notifications:
            send_notification_to_user(notification.user_id, notification.to_dict())

        log.info(f"Sent purchase rejected notification for BOQ {boq_id} to user {target_user_id}")

    except Exception as e:
        log.error(f"Error sending purchase rejected notification: {e}")


def notify_purchase_forwarded(boq_id, project_name, forwarded_by_id, forwarded_by_name, target_role, additional_info=None):
    """
    Notify when purchase is forwarded to another role (e.g., TD for approval)

    Args:
        boq_id: BOQ ID
        project_name: Project name
        forwarded_by_id: User ID of forwarder
        forwarded_by_name: Name of forwarder
        target_role: Target role (e.g., 'technical_director')
        additional_info: Additional information
    """
    try:
        # Get users in target role
        role_map = {
            'technical_director': 'Technical Director',
            'technicaldirector': 'Technical Director',
            'estimator': 'Estimator',
            'project_manager': 'Project Manager',
            'buyer': 'Buyer'
        }

        role_name = role_map.get(target_role.lower(), target_role)
        target_role_obj = Role.query.filter_by(role_name=role_name).first()

        if not target_role_obj:
            log.warning(f"Role {role_name} not found")
            return

        users = User.query.filter_by(role_id=target_role_obj.role_id).all()
        target_user_ids = [user.user_id for user in users]

        if not target_user_ids:
            log.warning(f"No users found in role {role_name}")
            return

        notifications = NotificationManager.notify_pr_action(
            action='forwarded',
            pr_id=str(boq_id),
            document_id=f"BOQ-{boq_id}",
            project_name=project_name,
            target_user_ids=target_user_ids,
            sender_id=forwarded_by_id,
            sender_name=forwarded_by_name,
            target_role=target_role.lower(),
            additional_info=additional_info or 'Purchase request requires your review',
            metadata={
                'boq_id': boq_id,
                'project_name': project_name
            }
        )

        # Send real-time notifications
        for notification in notifications:
            notification_data = notification.to_dict()
            send_notification_to_user(notification.user_id, notification_data)
            send_notification_to_role(target_role.lower(), notification_data)

        log.info(f"Sent purchase forwarded notification for BOQ {boq_id} to {len(notifications)} users in role {role_name}")

    except Exception as e:
        log.error(f"Error sending purchase forwarded notification: {e}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")


def notify_project_action(project_id, project_name, action, actor_id, actor_name, target_user_ids, additional_info=None):
    """
    Generic project action notification

    Args:
        project_id: Project ID
        project_name: Project name
        action: Action type (created, submitted, approved, rejected, updated, forwarded)
        actor_id: User ID performing the action
        actor_name: Name of user performing the action
        target_user_ids: List of user IDs to notify
        additional_info: Additional information
    """
    try:
        notifications = NotificationManager.notify_project_action(
            action=action,
            project_id=project_id,
            project_name=project_name,
            target_user_ids=target_user_ids,
            sender_id=actor_id,
            sender_name=actor_name,
            additional_info=additional_info,
            metadata={
                'project_id': project_id,
                'project_name': project_name,
                'action': action
            }
        )

        # Send real-time notifications
        for notification in notifications:
            send_notification_to_user(notification.user_id, notification.to_dict())

        log.info(f"Sent project {action} notification for project {project_id} to {len(notifications)} users")

    except Exception as e:
        log.error(f"Error sending project {action} notification: {e}")
