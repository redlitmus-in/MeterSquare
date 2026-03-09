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
from sqlalchemy import update as sql_update

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
    """Build a clean, professional deadline warning email."""
    days_remaining = deadline_info["days_remaining"]
    formatted_date = end_date.strftime("%d %B %Y")

    if days_remaining < 0:
        n = abs(days_remaining)
        status_text = f"{n} Day{'s' if n != 1 else ''} Overdue"
        status_color = "#dc2626"
        status_bg = "#fef2f2"
        urgency_note = "This project has passed its deadline. Please take immediate action."
    elif days_remaining == 0:
        status_text = "Due Today"
        status_color = "#dc2626"
        status_bg = "#fef2f2"
        urgency_note = "This project's deadline is today. Ensure all work is finalised."
    elif days_remaining <= 3:
        status_text = f"{days_remaining} Day{'s' if days_remaining != 1 else ''} Remaining"
        status_color = "#dc2626"
        status_bg = "#fef2f2"
        urgency_note = "The deadline is very close. Please review the project timeline immediately."
    else:
        status_text = f"{days_remaining} Days Remaining"
        status_color = "#b45309"
        status_bg = "#fffbeb"
        urgency_note = "Please review the project timeline and ensure work is progressing on schedule."

    return f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">

      <!-- Header -->
      <div style="background:#111827;padding:28px 32px;">
        <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">MeterSquare ERP</p>
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Project Deadline Alert</h1>
      </div>

      <!-- Status Banner -->
      <div style="background:{status_bg};border-bottom:1px solid {status_color}33;padding:14px 32px;display:flex;align-items:center;gap:12px;">
        <span style="display:inline-block;background:{status_color};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.5px;padding:4px 14px;border-radius:20px;text-transform:uppercase;">{status_text}</span>
        <span style="color:{status_color};font-size:13px;">{urgency_note}</span>
      </div>

      <!-- Body -->
      <div style="padding:28px 32px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:12px 0;color:#6b7280;width:38%;font-weight:500;">Project</td>
            <td style="padding:12px 0;font-weight:600;">{project_name}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:12px 0;color:#6b7280;font-weight:500;">Deadline</td>
            <td style="padding:12px 0;font-weight:600;">{formatted_date}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;color:#6b7280;font-weight:500;">Status</td>
            <td style="padding:12px 0;">
              <span style="color:{status_color};font-weight:700;">{status_text}</span>
            </td>
          </tr>
        </table>

        <div style="margin-top:24px;padding:16px;background:#f9fafb;border-left:3px solid #111827;border-radius:0 4px 4px 0;">
          <p style="margin:0;font-size:13px;color:#374151;">
            If additional time is required, the Project Manager can submit a
            <strong>Day Extension Request</strong> through MeterSquare ERP.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;border-top:1px solid #f3f4f6;background:#f9fafb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
          This is an automated notification from MeterSquare ERP &mdash; please do not reply to this email.
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

                    # Atomic deduplication: attempt to claim this project for today's notification.
                    # The UPDATE only succeeds (rowcount > 0) if no other process has already
                    # set last_deadline_notified_at = today, eliminating the race condition when
                    # multiple workers/scheduler instances run simultaneously.
                    
                    claimed = db.session.execute(
                        sql_update(Project)
                        .where(Project.project_id == project.project_id)
                        .where(
                            db.or_(
                                Project.last_deadline_notified_at.is_(None),
                                Project.last_deadline_notified_at < today,
                            )
                        )
                        .values(last_deadline_notified_at=today)
                    )
                    db.session.flush()
                    if claimed.rowcount == 0:
                        log.debug(f"[DeadlineCheck] Project {project.project_id} already notified today, skipping")
                        continue

                    project_name = project.project_name or f"Project #{project.project_id}"
                    log.info(f"[DeadlineCheck] Notifying for project '{project_name}' ({deadline_info['level']}, {deadline_info['days_remaining']} days)")

                    # --- Collect all users to notify ---
                    recipient_user_ids = set()

                    # PM(s): stored as JSONB array [1, 2, 3] or single int
                    if project.user_id:
                        raw = project.user_id
                        if isinstance(raw, list):
                            pm_ids = raw
                        elif isinstance(raw, (int, float)):
                            pm_ids = [int(raw)]
                        else:
                            pm_ids = []
                        for pm_id in pm_ids:
                            if pm_id:
                                recipient_user_ids.add(int(pm_id))

                    # SE (site supervisor): fetch from pm_assign_ss table
                    from models.pm_assign_ss import PMAssignSS
                    ss_assignments = PMAssignSS.query.filter_by(
                        project_id=project.project_id,
                        is_deleted=False
                    ).all()
                    for assignment in ss_assignments:
                        if assignment.assigned_to_se_id:
                            recipient_user_ids.add(int(assignment.assigned_to_se_id))
                        if assignment.ss_ids:
                            for ss_id in assignment.ss_ids:
                                if ss_id:
                                    recipient_user_ids.add(int(ss_id))

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
                    def _action_url_for_user(u):
                        """Return role-appropriate URL for this deadline notification."""
                        role = (u.role.role if u.role else '').lower().replace(' ', '').replace('_', '')
                        if role in ('technicaldirector', 'td'):
                            return f'/technical-director/project-approvals?tab=assigned&projectId={project.project_id}'
                        if role in ('projectmanager', 'pm'):
                            return f'/project-manager/my-projects?projectId={project.project_id}'
                        return f'/projects/{project.project_id}'

                    notifications_data = [
                        {
                            'user_id': user.user_id,
                            'type': 'reminder',
                            'title': deadline_info['title'],
                            'message': message,
                            'priority': deadline_info['priority'],
                            'category': 'project',
                            'action_url': _action_url_for_user(user),
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
                    created_notifications = NotificationManager.create_bulk_notifications(notifications_data)

                    # Push real-time bell + desktop notification via Socket.IO for each recipient
                    from socketio_server import send_notification_to_user
                    for notif_data in notifications_data:
                        try:
                            send_notification_to_user(notif_data['user_id'], {
                                'userId': notif_data['user_id'],
                                'targetUserId': notif_data['user_id'],
                                'title': notif_data['title'],
                                'message': notif_data['message'],
                                'type': notif_data['type'],
                                'priority': notif_data['priority'],
                                'category': notif_data['category'],
                                'actionUrl': notif_data.get('action_url'),
                                'actionLabel': notif_data.get('action_label'),
                                'metadata': notif_data.get('metadata'),
                            })
                            log.info(f"[DeadlineCheck] Socket.IO pushed to user {notif_data['user_id']}")
                        except Exception as sio_err:
                            log.warning(f"[DeadlineCheck] Socket.IO push failed for user {notif_data['user_id']}: {sio_err}")

                    # --- Send emails to offline users only ---
                    email_html = _build_email_html(project_name, project.end_date, deadline_info)
                    email_subject = f"{deadline_info['email_subject_prefix']} — {project_name}"

                    # Send email to ALL recipients (PM, SE, TD) regardless of online/offline status.
                    from utils.boq_email_service import BOQEmailService
                    email_svc = BOQEmailService()
                    for user in recipients:
                        if user.email:
                            email_svc.send_email_async(user.email, email_subject, email_html)
                            log.info(f"[DeadlineCheck] Email queued for {user.email} (role: {user.role.role if user.role else 'unknown'})")
                        else:
                            log.warning(f"[DeadlineCheck] Skipping email for user_id={user.user_id} — email is NULL")

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
    # from apscheduler.triggers.interval import IntervalTrigger

    # Run every day at 08:00 AM server time
    scheduler.add_job(
        func=run_deadline_check,
        args=[app],
        # trigger=IntervalTrigger(minutes=5),
        trigger=CronTrigger(hour=10, minute=0),
        id='deadline_check',
        name='Daily Project Deadline Warning',
        replace_existing=True,
        misfire_grace_time=3600  # Allow up to 1 hour late start (server restart, etc.)
    )

    scheduler.start()
    log.info("[DeadlineScheduler] Started — daily deadline check at 10:00 AM")
    return scheduler
