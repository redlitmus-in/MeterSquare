"""
Notification Utility Functions
Helper functions to create and send notifications
"""

from models.notification import Notification
from config.db import db
from typing import List, Dict, Optional

class NotificationManager:
    """Manager class for creating and sending notifications"""

    @staticmethod
    def create_notification(
        user_id: int,
        type: str,
        title: str,
        message: str,
        priority: str = 'medium',
        category: str = 'system',
        target_role: Optional[str] = None,
        action_required: bool = False,
        action_url: Optional[str] = None,
        action_label: Optional[str] = None,
        metadata: Optional[Dict] = None,
        sender_id: Optional[int] = None,
        sender_name: Optional[str] = None
    ) -> Notification:
        """
        Create a notification and save to database

        Args:
            user_id: Target user ID
            type: Notification type (email, approval, rejection, alert, info, success, error, update, reminder)
            title: Notification title
            message: Notification message
            priority: Priority level (urgent, high, medium, low)
            category: Category (system, pr, project, email, etc.)
            target_role: Target role (optional, for role-based notifications)
            action_required: Whether action is required
            action_url: URL for the action button
            action_label: Label for the action button
            metadata: Additional metadata as dictionary
            sender_id: ID of the user who triggered the notification
            sender_name: Name of the user who triggered the notification

        Returns:
            Created Notification object
        """
        try:
            notification = Notification.create_notification(
                user_id=user_id,
                type=type,
                title=title,
                message=message,
                priority=priority,
                category=category,
                target_role=target_role,
                action_required=action_required,
                action_url=action_url,
                action_label=action_label,
                metadata=metadata,
                sender_id=sender_id,
                sender_name=sender_name
            )

            db.session.add(notification)
            db.session.commit()

            return notification

        except Exception as e:
            db.session.rollback()
            print(f"Error creating notification: {e}")
            raise

    @staticmethod
    def create_bulk_notifications(notifications_data: List[Dict]) -> List[Notification]:
        """
        Create multiple notifications at once

        Args:
            notifications_data: List of notification data dictionaries

        Returns:
            List of created Notification objects
        """
        try:
            notifications = []

            for data in notifications_data:
                notification = Notification.create_notification(
                    user_id=data['user_id'],
                    type=data['type'],
                    title=data['title'],
                    message=data['message'],
                    priority=data.get('priority', 'medium'),
                    category=data.get('category', 'system'),
                    target_role=data.get('target_role'),
                    action_required=data.get('action_required', False),
                    action_url=data.get('action_url'),
                    action_label=data.get('action_label'),
                    metadata=data.get('metadata'),
                    sender_id=data.get('sender_id'),
                    sender_name=data.get('sender_name')
                )
                notifications.append(notification)

            db.session.bulk_save_objects(notifications)
            db.session.commit()

            return notifications

        except Exception as e:
            db.session.rollback()
            print(f"Error creating bulk notifications: {e}")
            raise

    @staticmethod
    def notify_project_action(
        action: str,
        project_id: int,
        project_name: str,
        target_user_ids: List[int],
        sender_id: int,
        sender_name: str,
        additional_info: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> List[Notification]:
        """
        Create notifications for project-related actions

        Args:
            action: Action type (created, submitted, approved, rejected, updated, forwarded)
            project_id: Project ID
            project_name: Project name
            target_user_ids: List of user IDs to notify
            sender_id: ID of user who performed the action
            sender_name: Name of user who performed the action
            additional_info: Additional information to include in message
            metadata: Additional metadata

        Returns:
            List of created notifications
        """
        action_configs = {
            'created': {
                'type': 'info',
                'title': 'New Project Created',
                'message': f'Project "{project_name}" has been created by {sender_name}',
                'priority': 'medium',
                'category': 'project'
            },
            'submitted': {
                'type': 'approval',
                'title': 'Project Submitted for Approval',
                'message': f'Project "{project_name}" has been submitted by {sender_name} and requires your approval',
                'priority': 'high',
                'category': 'project',
                'action_required': True,
                'action_label': 'Review Project'
            },
            'approved': {
                'type': 'success',
                'title': 'Project Approved',
                'message': f'Project "{project_name}" has been approved by {sender_name}',
                'priority': 'high',
                'category': 'project'
            },
            'rejected': {
                'type': 'rejection',
                'title': 'Project Rejected',
                'message': f'Project "{project_name}" has been rejected by {sender_name}',
                'priority': 'high',
                'category': 'project'
            },
            'updated': {
                'type': 'update',
                'title': 'Project Updated',
                'message': f'Project "{project_name}" has been updated by {sender_name}',
                'priority': 'medium',
                'category': 'project'
            },
            'forwarded': {
                'type': 'info',
                'title': 'Project Forwarded',
                'message': f'Project "{project_name}" has been forwarded to you by {sender_name}',
                'priority': 'high',
                'category': 'project',
                'action_required': True,
                'action_label': 'View Project'
            }
        }

        config = action_configs.get(action)
        if not config:
            raise ValueError(f"Unknown action: {action}")

        # Add additional info to message if provided
        if additional_info:
            config['message'] += f'. {additional_info}'

        # Merge metadata
        base_metadata = {
            'project_id': project_id,
            'project_name': project_name,
            'action': action
        }
        if metadata:
            base_metadata.update(metadata)

        # Create notifications for all target users
        notifications_data = []
        for user_id in target_user_ids:
            notifications_data.append({
                'user_id': user_id,
                'type': config['type'],
                'title': config['title'],
                'message': config['message'],
                'priority': config['priority'],
                'category': config['category'],
                'action_required': config.get('action_required', False),
                'action_url': f'/projects/{project_id}',
                'action_label': config.get('action_label', 'View'),
                'metadata': base_metadata,
                'sender_id': sender_id,
                'sender_name': sender_name
            })

        return NotificationManager.create_bulk_notifications(notifications_data)

    @staticmethod
    def notify_pr_action(
        action: str,
        pr_id: str,
        document_id: str,
        project_name: str,
        target_user_ids: List[int],
        sender_id: int,
        sender_name: str,
        target_role: Optional[str] = None,
        additional_info: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> List[Notification]:
        """
        Create notifications for Purchase Requisition actions

        Args:
            action: Action type (submitted, approved, rejected, reapproved, forwarded)
            pr_id: Purchase requisition ID
            document_id: Document ID
            project_name: Project name
            target_user_ids: List of user IDs to notify
            sender_id: ID of user who performed the action
            sender_name: Name of user who performed the action
            target_role: Target role for role-based notifications
            additional_info: Additional information
            metadata: Additional metadata

        Returns:
            List of created notifications
        """
        action_configs = {
            'submitted': {
                'type': 'approval',
                'title': 'New Purchase Request',
                'message': f'PR {document_id} for {project_name} submitted by {sender_name}',
                'priority': 'high',
                'category': 'pr',
                'action_required': True,
                'action_label': 'Review PR'
            },
            'approved': {
                'type': 'success',
                'title': 'PR Approved',
                'message': f'PR {document_id} for {project_name} approved by {sender_name}',
                'priority': 'high',
                'category': 'pr'
            },
            'rejected': {
                'type': 'rejection',
                'title': 'PR Rejected',
                'message': f'PR {document_id} for {project_name} rejected by {sender_name}',
                'priority': 'high',
                'category': 'pr',
                'action_required': True,
                'action_label': 'View Reason'
            },
            'reapproved': {
                'type': 'approval',
                'title': 'PR Requires Re-approval',
                'message': f'PR {document_id} for {project_name} requires your approval',
                'priority': 'high',
                'category': 'pr',
                'action_required': True,
                'action_label': 'Review PR'
            },
            'forwarded': {
                'type': 'info',
                'title': 'PR Forwarded',
                'message': f'PR {document_id} for {project_name} forwarded to you by {sender_name}',
                'priority': 'high',
                'category': 'pr',
                'action_required': True,
                'action_label': 'Review PR'
            }
        }

        config = action_configs.get(action)
        if not config:
            raise ValueError(f"Unknown action: {action}")

        # Add additional info to message if provided
        if additional_info:
            config['message'] += f'. {additional_info}'

        # Merge metadata
        base_metadata = {
            'pr_id': pr_id,
            'document_id': document_id,
            'project_name': project_name,
            'action': action
        }
        if metadata:
            base_metadata.update(metadata)

        # Create notifications for all target users
        notifications_data = []
        for user_id in target_user_ids:
            notifications_data.append({
                'user_id': user_id,
                'type': config['type'],
                'title': config['title'],
                'message': config['message'],
                'priority': config['priority'],
                'category': config['category'],
                'target_role': target_role,
                'action_required': config.get('action_required', False),
                'action_url': f'/purchase/{pr_id}',
                'action_label': config.get('action_label', 'View'),
                'metadata': base_metadata,
                'sender_id': sender_id,
                'sender_name': sender_name
            })

        return NotificationManager.create_bulk_notifications(notifications_data)

    @staticmethod
    def notify_role(
        role: str,
        type: str,
        title: str,
        message: str,
        priority: str = 'medium',
        category: str = 'system',
        action_url: Optional[str] = None,
        action_label: Optional[str] = None,
        metadata: Optional[Dict] = None,
        sender_id: Optional[int] = None,
        sender_name: Optional[str] = None
    ) -> Notification:
        """
        Create a role-based notification (will be sent to all users with that role)

        Args:
            role: Target role
            type: Notification type
            title: Notification title
            message: Notification message
            priority: Priority level
            category: Category
            action_url: URL for action
            action_label: Label for action
            metadata: Additional metadata
            sender_id: Sender user ID
            sender_name: Sender name

        Returns:
            Created notification
        """
        # For role-based notifications, we use user_id = 0 as a placeholder
        # The frontend will filter these based on target_role
        return NotificationManager.create_notification(
            user_id=0,  # Placeholder for role-based notification
            type=type,
            title=title,
            message=message,
            priority=priority,
            category=category,
            target_role=role,
            action_required=bool(action_url),
            action_url=action_url,
            action_label=action_label,
            metadata=metadata,
            sender_id=sender_id,
            sender_name=sender_name
        )
