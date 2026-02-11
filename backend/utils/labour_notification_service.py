"""
Labour Notification Service Mixin
Extracted from ComprehensiveNotificationService to keep file sizes manageable.
Contains all 6 notify_labour_* static methods.
"""

from utils.notification_utils import NotificationManager
from socketio_server import send_notification_to_user
from models.user import User
from models.role import Role
from config.logging import get_logger
from utils.role_route_mapper import build_notification_action_url
from utils.notification_dedup import check_duplicate_notification

log = get_logger()


class LabourNotificationMixin:
    """Mixin with all labour-related notification methods."""

    @staticmethod
    def notify_labour_requisition_created(requisition_id, requisition_code, project_name, site_name,
                                           se_user_id, se_name, pm_user_ids, workers_count):
        """
        Notify PM(s) when SE creates/sends a labour requisition
        Trigger: SE creates requisition with status send_to_pm
        Recipients: Project Manager(s)
        Priority: HIGH
        """
        try:
            for pm_id in pm_user_ids:
                if check_duplicate_notification(pm_id, 'Labour Requisition', 'requisition_id', requisition_id, minutes=5):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=pm_id,
                    type='alert',
                    title='Labour Requisition Received',
                    message=f'{se_name} submitted labour requisition {requisition_code} for {project_name} ({site_name}) - {workers_count} worker(s) requested',
                    priority='high',
                    category='labour',
                    action_required=True,
                    action_url=build_notification_action_url(pm_id, 'labour/approvals', {'requisition_id': requisition_id}, 'project-manager'),
                    action_label='Review Requisition',
                    metadata={'requisition_id': requisition_id, 'requisition_code': requisition_code, 'project_name': project_name},
                    sender_id=se_user_id,
                    sender_name=se_name
                )
                send_notification_to_user(pm_id, notification.to_dict())

            log.info(f"Sent labour requisition notification for {requisition_code}")
        except Exception as e:
            log.error(f"Error sending labour requisition notification: {e}")

    @staticmethod
    def notify_labour_requisition_approved(requisition_id, requisition_code, project_name,
                                            pm_user_id, pm_name, se_user_id):
        """
        Notify SE when PM approves their requisition
        Trigger: PM approves requisition
        Recipients: Site Engineer who created it
        Priority: MEDIUM
        """
        try:
            if check_duplicate_notification(se_user_id, 'Requisition Approved', 'requisition_id', requisition_id, minutes=5):
                return

            notification = NotificationManager.create_notification(
                user_id=se_user_id,
                type='success',
                title='Requisition Approved',
                message=f'{pm_name} approved your labour requisition {requisition_code} for {project_name}. Workers will be assigned by Production.',
                priority='medium',
                category='labour',
                action_url=build_notification_action_url(se_user_id, 'labour/requisitions', {'requisition_id': requisition_id}, 'site-engineer'),
                action_label='View Requisition',
                metadata={'requisition_id': requisition_id, 'requisition_code': requisition_code, 'project_name': project_name},
                sender_id=pm_user_id,
                sender_name=pm_name
            )
            send_notification_to_user(se_user_id, notification.to_dict())
            log.info(f"Sent labour requisition approved notification for {requisition_code}")
        except Exception as e:
            log.error(f"Error sending labour requisition approved notification: {e}")

    @staticmethod
    def notify_labour_requisition_rejected(requisition_id, requisition_code, project_name,
                                            pm_user_id, pm_name, se_user_id, reason):
        """
        Notify SE when PM rejects their requisition
        Trigger: PM rejects requisition
        Recipients: Site Engineer who created it
        Priority: HIGH
        """
        try:
            if check_duplicate_notification(se_user_id, 'Requisition Rejected', 'requisition_id', requisition_id, minutes=5):
                return

            notification = NotificationManager.create_notification(
                user_id=se_user_id,
                type='rejection',
                title='Requisition Rejected',
                message=f'{pm_name} rejected your labour requisition {requisition_code} for {project_name}. Reason: {reason}',
                priority='high',
                category='labour',
                action_required=True,
                action_url=build_notification_action_url(se_user_id, 'labour/requisitions', {'requisition_id': requisition_id}, 'site-engineer'),
                action_label='View & Resubmit',
                metadata={'requisition_id': requisition_id, 'requisition_code': requisition_code, 'project_name': project_name, 'reason': reason},
                sender_id=pm_user_id,
                sender_name=pm_name
            )
            send_notification_to_user(se_user_id, notification.to_dict())
            log.info(f"Sent labour requisition rejected notification for {requisition_code}")
        except Exception as e:
            log.error(f"Error sending labour requisition rejected notification: {e}")

    @staticmethod
    def notify_labour_sent_to_production(requisition_id, requisition_code, project_name,
                                          pm_user_id, pm_name, workers_count):
        """
        Notify Production Manager(s) when PM sends approved requisition to production
        Trigger: PM sends requisition to production
        Recipients: All Production Managers
        Priority: HIGH
        """
        try:
            prod_managers = User.query.join(Role, User.role_id == Role.role_id).filter(
                Role.role == 'production-manager',
                User.is_active == True,
                User.is_deleted == False
            ).all()

            for prod_mgr in prod_managers:
                if check_duplicate_notification(prod_mgr.user_id, 'Labour Assignment', 'requisition_id', requisition_id, minutes=5):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=prod_mgr.user_id,
                    type='alert',
                    title='Labour Assignment Pending',
                    message=f'{pm_name} approved requisition {requisition_code} for {project_name} - {workers_count} worker(s) need assignment',
                    priority='high',
                    category='labour',
                    action_required=True,
                    action_url=build_notification_action_url(prod_mgr.user_id, 'labour/assignments', {'requisition_id': requisition_id}, 'production-manager'),
                    action_label='Assign Workers',
                    metadata={'requisition_id': requisition_id, 'requisition_code': requisition_code, 'project_name': project_name},
                    sender_id=pm_user_id,
                    sender_name=pm_name
                )
                send_notification_to_user(prod_mgr.user_id, notification.to_dict())

            log.info(f"Sent labour sent-to-production notification for {requisition_code}")
        except Exception as e:
            log.error(f"Error sending labour sent-to-production notification: {e}")

    @staticmethod
    def notify_labour_workers_assigned(requisition_id, requisition_code, project_name, site_name,
                                        prod_mgr_id, prod_mgr_name, se_user_id, pm_user_ids,
                                        workers_count, required_date):
        """
        Notify SE and PM(s) when Production Manager assigns workers
        Trigger: Production Manager assigns workers to requisition
        Recipients: Site Engineer + Project Manager(s)
        Priority: HIGH
        """
        try:
            if isinstance(required_date, str):
                formatted_date = required_date
            elif required_date:
                formatted_date = required_date.strftime('%d %b %Y')
            else:
                formatted_date = 'N/A'
            recipients = set()

            # Notify SE
            if se_user_id:
                recipients.add(('se', se_user_id))

            # Notify PM(s)
            if pm_user_ids:
                for pm_id in pm_user_ids:
                    if pm_id != se_user_id:
                        recipients.add(('pm', pm_id))

            for role_tag, user_id in recipients:
                if check_duplicate_notification(user_id, 'Workers Assigned', 'requisition_id', requisition_id, minutes=5):
                    continue

                page = 'labour/arrivals' if role_tag == 'se' else 'labour/approvals'
                fallback = 'site-engineer' if role_tag == 'se' else 'project-manager'

                notification = NotificationManager.create_notification(
                    user_id=user_id,
                    type='success',
                    title='Workers Assigned',
                    message=f'{prod_mgr_name} assigned {workers_count} worker(s) to {requisition_code} for {project_name} ({site_name}) on {formatted_date}',
                    priority='high',
                    category='labour',
                    action_url=build_notification_action_url(user_id, page, {'requisition_id': requisition_id}, fallback),
                    action_label='View Assignment',
                    metadata={'requisition_id': requisition_id, 'requisition_code': requisition_code, 'project_name': project_name, 'required_date': str(required_date)},
                    sender_id=prod_mgr_id,
                    sender_name=prod_mgr_name
                )
                send_notification_to_user(user_id, notification.to_dict())

            log.info(f"Sent workers-assigned notifications for {requisition_code}")
        except Exception as e:
            log.error(f"Error sending workers-assigned notification: {e}")

    @staticmethod
    def notify_labour_attendance_locked(project_id, project_name, locked_count,
                                         pm_user_id, pm_name, lock_date=None):
        """
        Notify Admin/HR when PM locks attendance records for payroll
        Trigger: PM locks attendance (single or day batch)
        Recipients: All Admin users
        Priority: MEDIUM
        """
        try:
            from sqlalchemy import func
            admin_users = User.query.join(Role, User.role_id == Role.role_id).filter(
                func.lower(Role.role) == 'admin',
                User.is_active == True,
                User.is_deleted == False
            ).all()

            if not admin_users:
                log.warning("No active admin users found for attendance-locked notification. Check Role.role values in DB.")
                return

            date_str = ''
            if lock_date:
                if isinstance(lock_date, str):
                    date_str = f' for {lock_date}'
                else:
                    date_str = f' for {lock_date.strftime("%d %b %Y")}'

            dedup_key = f'{project_id}_{lock_date}' if lock_date else str(project_id)
            for admin in admin_users:
                if check_duplicate_notification(admin.user_id, 'Attendance Locked', 'project_id', dedup_key, minutes=5):
                    continue

                notification = NotificationManager.create_notification(
                    user_id=admin.user_id,
                    type='info',
                    title='Attendance Locked for Payroll',
                    message=f'{pm_name} locked {locked_count} attendance {"record" if locked_count == 1 else "records"} for {project_name}{date_str}. Ready for payroll processing.',
                    priority='medium',
                    category='labour',
                    action_url=build_notification_action_url(admin.user_id, 'labour/payroll', {'project_id': project_id}, 'admin'),
                    action_label='Process Payroll',
                    metadata={'project_id': project_id, 'project_name': project_name, 'locked_count': locked_count},
                    sender_id=pm_user_id,
                    sender_name=pm_name
                )
                send_notification_to_user(admin.user_id, notification.to_dict())

            log.info(f"Sent attendance-locked notification for project {project_name} ({locked_count} records)")
        except Exception as e:
            log.error(f"Error sending attendance-locked notification: {e}")
