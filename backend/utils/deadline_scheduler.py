"""
Deadline Scheduler
==================
Runs a daily job at 08:00 AM to check project deadlines and send
warnings to PM, TD, and SE users via in-app notifications + email.

Thresholds:
  <= 7 days  → "warning"   (medium priority)
  <= 3 days  → "critical"  (high priority)
  overdue    → "overdue"   (urgent priority)

Deduplication:
  last_deadline_notified_at is set to today after notifying.
  The job skips a project if it was already notified today.
  This field is reset to NULL when a deadline extension is approved.
"""

import logging
from datetime import date

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger(__name__)


def _get_deadline_level(end_date: date) -> dict | None:
    """
    Classify how urgent the deadline is.

    Returns a dict with level, priority, title, and email_subject,
    or None if the deadline is not yet within warning threshold.
    """
    today = date.today()
    days_remaining = (end_date - today).days

    if days_remaining > 7:
        return None  # Not yet in warning zone

    if days_remaining < 0:
        overdue_days = abs(days_remaining)
        return {
            'level': 'overdue',
            'days_remaining': days_remaining,
            'priority': 'urgent',
            'title': f'Project Overdue by {overdue_days} day{"s" if overdue_days != 1 else ""}',
            'short_label': f'{overdue_days} day{"s" if overdue_days != 1 else ""} overdue',
            'email_subject_prefix': '🚨 Project Overdue',
        }

    if days_remaining == 0:
        return {
            'level': 'critical',
            'days_remaining': 0,
            'priority': 'high',
            'title': 'Project Deadline Is Today',
            'short_label': 'Due today',
            'email_subject_prefix': '🔴 Deadline Today',
        }

    if days_remaining <= 3:
        return {
            'level': 'critical',
            'days_remaining': days_remaining,
            'priority': 'high',
            'title': f'Project Deadline in {days_remaining} Day{"s" if days_remaining != 1 else ""}',
            'short_label': f'{days_remaining} day{"s" if days_remaining != 1 else ""} left',
            'email_subject_prefix': '🔴 Urgent: Deadline Soon',
        }

    # 4–7 days
    return {
        'level': 'warning',
        'days_remaining': days_remaining,
        'priority': 'medium',
        'title': f'Project Deadline in {days_remaining} Days',
        'short_label': f'{days_remaining} days left',
        'email_subject_prefix': '⚠️ Deadline Warning',
    }


def _build_email_html(project_name: str, end_date: date, deadline_info: dict) -> str:
    """Build the inner HTML body for the deadline email (before wrap_email_content)."""
    formatted_date = end_date.strftime("%B %d, %Y")
    days_remaining = deadline_info["days_remaining"]
    if days_remaining < 0:
        days_line = f"<strong style='color:#dc2626'>{abs(days_remaining)} days overdue</strong>"
        header_color = "#dc2626"
        header_text = "🚨 Project Overdue"
    elif days_remaining == 0:
        days_line = "<strong style='color:#dc2626'>Due today</strong>"
        header_color = "#dc2626"
        header_text = "🔴 Deadline Is Today"
    elif days_remaining <= 3:
        days_line = f"<strong style='color:#dc2626'>{days_remaining} day{'s' if days_remaining != 1 else ''} remaining</strong>"
        header_color = "#dc2626"
        header_text = "🔴 Deadline Approaching"
    else:
        days_line = f"<strong style='color:#d97706'>{days_remaining} days remaining</strong>"
        header_color = "#d97706"
        header_text = "⚠️ Deadline Approaching"

    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: {header_color}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; font-size: 18px;">{header_text}</h2>
        </div>
        <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px 0; color: #6b7280; width: 40%;">Project</td>
                    <td style="padding: 10px 0; font-weight: 600; color: #111827;">{project_name}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 10px 0; color: #6b7280;">Deadline</td>
                    <td style="padding: 10px 0; font-weight: 600; color: #111827;">{formatted_date}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #6b7280;">Status</td>
                    <td style="padding: 10px 0;">{days_line}</td>
                </tr>
            </table>
            <p style="margin-top: 20px; color: #374151; font-size: 14px;">
                Please review the project timeline and take action if needed.
                If additional time is required, the Project Manager can submit a Day Extension Request.
            </p>
        </div>
    </div>
    """


def run_deadline_check(app):
    """
    Main job function. Runs daily at 08:00 AM.

    For each active project with a valid end_date:
      1. Calculate days_remaining
      2. Skip if already notified today
      3. Create in-app notifications for PM, TD, SE
      4. Send emails to offline users
      5. Mark project as notified today
    """
    with app.app_context():
        try:
            from models.project import Project
            from models.user import User
            from models.role import Role
            from config.db import db
            from utils.notification_utils import NotificationManager
            from utils.comprehensive_notification_service import ComprehensiveNotificationService

            today = date.today()
            log.info(f"[DeadlineCheck] Running for {today}")

            # Fetch all active projects with a valid end_date
            active_statuses = ["active", "in_progress", "in progress", "planning", "on_hold"]
            projects = Project.query.filter(
                Project.end_date.isnot(None),
                Project.is_deleted.is_(False),
                db.func.lower(Project.status).in_([s.lower() for s in active_statuses])
            ).all()

            log.info(f"[DeadlineCheck] Found {len(projects)} active projects with end dates")

            # Pre-fetch all TD users (role = 'technicalDirector')
            td_role = Role.query.filter_by(role="technicalDirector").first()
            td_users = User.query.filter_by(role_id=td_role.role_id).all() if td_role else []
            log.info(f"[DeadlineCheck] Found {len(td_users)} TD users")

            notified_count = 0

            for project in projects:
                try:
                    deadline_info = _get_deadline_level(project.end_date)
                    if deadline_info is None:
                        continue  # > 7 days away, skip

                    # Deduplication: skip if already notified today
                    if project.last_deadline_notified_at == today:
                        log.debug(f"[DeadlineCheck] Project {project.project_id} already notified today, skipping")
                        continue

                    project_name = project.project_name or f"Project #{project.project_id}"
                    log.info(f"[DeadlineCheck] Notifying for project '{project_name}' ({deadline_info['level']}, {deadline_info['days_remaining']} days)")

                    # --- Collect all users to notify ---
                    recipient_user_ids = set()

                    # PM(s): stored as JSONB array [1, 2, 3]
                    if project.user_id:
                        pm_ids = project.user_id if isinstance(project.user_id, list) else []
                        for pm_id in pm_ids:
                            if pm_id:
                                recipient_user_ids.add(int(pm_id))

                    # SE: single integer
                    if project.site_supervisor_id:
                        recipient_user_ids.add(int(project.site_supervisor_id))

                    # TD: all TD users system-wide
                    for td in td_users:
                        recipient_user_ids.add(td.user_id)

                    if not recipient_user_ids:
                        log.warning(f"[DeadlineCheck] No recipients found for project {project.project_id}")
                        continue

                    # Fetch recipient users
                    recipients = User.query.filter(User.user_id.in_(recipient_user_ids)).all()

                    # --- Build notification message ---
                    formatted_date = project.end_date.strftime("%B %d, %Y")
                    days_rem = deadline_info["days_remaining"]
                    if days_rem < 0:
                        message = (
                            f"Project '{project_name}' was due on {formatted_date}. "
                            f"It is now {abs(days_rem)} day{'s' if abs(days_rem) != 1 else ''} overdue."
                        )
                    elif days_rem == 0:
                        message = f"Project '{project_name}' deadline is today ({formatted_date})."
                    else:
                        message = (
                            f"Project '{project_name}' deadline is in {days_rem} day{'s' if days_rem != 1 else ''} "
                            f"({formatted_date})."
                        )

                    # --- Create in-app notifications (bulk) ---
                    notifications_data = [
                        {
                            'user_id': user.user_id,
                            'type': 'reminder',
                            'title': deadline_info['title'],
                            'message': message,
                            'priority': deadline_info['priority'],
                            'category': 'project',
                            'action_url': f'/projects/{project.project_id}',
                            'action_label': 'View Project',
                            'metadata': {
                                'project_id': project.project_id,
                                'deadline_level': deadline_info['level'],
                                'days_remaining': days_rem,
                                'end_date': project.end_date.isoformat(),
                            }
                        }
                        for user in recipients
                    ]
                    NotificationManager.create_bulk_notifications(notifications_data)

                    # --- Send emails to offline users only ---
                    email_html = _build_email_html(project_name, project.end_date, deadline_info)
                    email_subject = f"{deadline_info['email_subject_prefix']} — {project_name}"

                    for user in recipients:
                        if ComprehensiveNotificationService.is_user_offline(user.user_id):
                            ComprehensiveNotificationService.send_email_notification(
                                recipient=user.email,
                                subject=email_subject,
                                message=email_html,
                                notification_type='deadline_warning'
                            )

                    # --- Mark project as notified today ---
                    project.last_deadline_notified_at = today
                    db.session.commit()
                    notified_count += 1

                except Exception as proj_error:
                    log.error(f"[DeadlineCheck] Error processing project {project.project_id}: {proj_error}")
                    db.session.rollback()
                    continue

            log.info(f"[DeadlineCheck] Done. Notified for {notified_count} projects.")

        except Exception as e:
            log.error(f"[DeadlineCheck] Fatal error in deadline check job: {e}")
            import traceback
            traceback.print_exc()


def init_deadline_scheduler(app):
    """
    Initialize and start the APScheduler background scheduler.
    Call this once from app.py after the Flask app is created.

    The scheduler runs in a daemon background thread — it stops
    automatically when Flask exits.
    """
    scheduler = BackgroundScheduler(daemon=True)

    # Run every day at 08:00 AM server time
    scheduler.add_job(
        func=run_deadline_check,
        args=[app],
        trigger=CronTrigger(hour=8, minute=0),
        id='deadline_check',
        name='Daily Project Deadline Warning',
        replace_existing=True,
        misfire_grace_time=3600  # Allow up to 1 hour late start (server restart, etc.)
    )

    scheduler.start()
    log.info("[DeadlineScheduler] Started — daily deadline check at 08:00 AM")
    return scheduler
