# utils/role_access_notify.py
"""
Notifications for Role Access (temporary role grants).

Every event goes out on three channels, like the project deadline reminders:
  1. in-app notification (notifications table)
  2. real-time Socket.IO push (the frontend also shows it as a desktop notification)
  3. email

Events
  Immediate (from the Role Access API):
    granted   -> user who received the role
    revoked   -> user who lost the role
  Scheduled (hourly sweep, sent once per grant after NOTIFY_HOUR company time):
    started      -> user, when a scheduled grant becomes active
    ending_soon  -> user, the day before the access ends
    handover     -> Admin + TD, 3 days before a fresh grant ends while the user still holds work
                    (projects, open change requests, open item assignments)
    ended        -> user, after the end date; Admin + TD too if work is still assigned to them
"""

import html
from datetime import datetime, timedelta, timezone as dt_timezone

from config.db import db
from config.logging import get_logger

log = get_logger()

NOTIFY_HOUR = 10                 # company-local hour for scheduled notices (same as deadline reminders)
HANDOVER_DAYS_BEFORE_END = 3
ENDED_NOTICE_WINDOW_DAYS = 2     # don't announce endings older than this (e.g. after downtime)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _role_label(role_name):
    labels = {
        'projectmanager': 'Project Manager', 'technicaldirector': 'Technical Director',
        'siteengineer': 'Site Engineer', 'sitesupervisor': 'Site Supervisor', 'buyer': 'Procurement',
        'productionmanager': 'Production Manager', 'estimator': 'Estimator', 'mep': 'MEP Supervisor',
        'admin': 'Admin', 'inventory': 'Inventory',
    }
    key = (role_name or '').lower().replace(' ', '').replace('_', '').replace('-', '')
    return labels.get(key, role_name or 'role')


def _fmt(d):
    return d.strftime('%d %b %Y')


def _manager_users():
    """Active Admin and Technical Director users (by their own role)."""
    from models.user import User
    from models.role import Role
    return User.query.join(Role, User.role_id == Role.role_id).filter(
        User.is_deleted == False,
        User.is_active == True,
        db.func.lower(Role.role).in_(['admin', 'technicaldirector']),
    ).all()


def _role_access_url(user):
    role = (user.role.role if user.role else '').lower()
    return '/technical-director/role-access' if role == 'technicaldirector' else '/admin/role-access'


# End-date notices. When a grant's end date changes, an earlier notice for the old date no longer counts.
END_DATE_EVENTS = ('ending_soon', 'handover', 'ended', 'ended_projects_left')


def _last_sent_at(grant_id, event):
    from models.notification import Notification
    return db.session.query(db.func.max(Notification.created_at)).filter(
        Notification.meta_data['grant_id'].as_string() == str(grant_id),
        Notification.meta_data['role_access_event'].as_string() == event,
    ).scalar()


def already_sent(grant_id, event):
    """True if this grant event was already notified (dedupe via notification metadata)."""
    sent_at = _last_sent_at(grant_id, event)
    if sent_at is None:
        return False
    if event in END_DATE_EVENTS:
        changed_at = _last_sent_at(grant_id, 'changed')
        if changed_at is not None and changed_at > sent_at:
            return False
    return True


def _email_html(heading, lines, note=None, button_url=None, button_label=None):
    """
    Role access email in the standard MeterSquare layout (same as the account emails):
    logo header with the red rule, navy heading, grey body, navy button, grey footer.
    The logo is embedded as cid:logo by BOQEmailService.send_email.
    """
    body = ''.join(
        f'<p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 14px 0;">{line}</p>' for line in lines
    )
    note_html = (
        f'<table width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="background-color:#f0f4ff;border-left:3px solid #243d8a;margin:6px 0 22px 0;">'
        f'<tr><td style="padding:14px 18px;font-size:14px;line-height:1.6;color:#1f2a44;">{note}</td></tr></table>'
    ) if note else ''
    button_html = (
        f'<table cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px 0;"><tr>'
        f'<td style="background-color:#243d8a;border-radius:6px;">'
        f'<a href="{html.escape(button_url, quote=True)}" style="display:inline-block;padding:12px 26px;'
        f'font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">{html.escape(button_label)} &rarr;</a>'
        f'</td></tr></table>'
    ) if button_url and button_label else ''
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#333333;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border:1px solid #e0e6f5;border-radius:10px;max-width:600px;width:100%;">
          <tr>
            <td style="padding:24px 36px 18px 36px;border-bottom:2px solid #fecaca;text-align:left;">
              <img src="cid:logo" alt="MeterSquare" style="height:40px;width:auto;display:block;">
            </td>
          </tr>
          <tr>
            <td style="padding:30px 36px 10px 36px;">
              <p style="font-size:12px;font-weight:700;color:#dc2626;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.8px;">Role Access</p>
              <h1 style="font-size:22px;font-weight:700;color:#243d8a;margin:0 0 22px 0;">{heading}</h1>
              {body}
              {note_html}
              {button_html}
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 26px 0;">
                Regards,<br><strong style="color:#243d8a;">MeterSquare Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 36px;border-top:1px solid #e0e6f5;background-color:#f4f6fb;">
              <p style="font-size:12px;color:#888888;margin:0;line-height:1.6;">
                This is an automated notification from MeterSquare ERP. Please do not reply to this email.<br>
                &copy; 2026 MeterSquare Interiors LLC. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _send(recipients, *, event, grant, title, message, priority, email_subject, email_heading,
          email_lines, email_note=None, action_url=None, action_label=None,
          ntype='info', extra_meta=None):
    """Deliver one event to each recipient on all three channels. Never raises."""
    if not recipients:
        return
    from utils.notification_utils import NotificationManager

    meta = {'grant_id': grant.grant_id, 'role_access_event': event}
    if extra_meta:
        meta.update(extra_meta)

    rows = [{
        'user_id': u.user_id,
        'type': ntype,
        'title': title,
        'message': message,
        'priority': priority,
        'category': 'system',
        'action_url': action_url(u) if callable(action_url) else action_url,
        'action_label': action_label,
        'metadata': meta,
    } for u in recipients]

    # 1. In-app
    try:
        NotificationManager.create_bulk_notifications(rows)
    except Exception as e:
        log.error(f"[RoleAccessNotify] in-app failed ({event}, grant {grant.grant_id}): {e}")
        return

    # 2. Real-time (desktop popup on the client)
    try:
        from socketio_server import send_notification_to_user
        for row in rows:
            send_notification_to_user(row['user_id'], {
                'userId': row['user_id'],
                'targetUserId': row['user_id'],
                'title': row['title'],
                'message': row['message'],
                'type': row['type'],
                'priority': row['priority'],
                'category': row['category'],
                'actionUrl': row['action_url'],
                'actionLabel': row['action_label'],
                'metadata': row['metadata'],
            })
    except Exception as e:
        log.warning(f"[RoleAccessNotify] socket push failed ({event}): {e}")

    # 3. Email
    try:
        from utils.boq_email_service import BOQEmailService
        from utils.email_config import get_app_url
        svc = BOQEmailService()
        app_url = get_app_url().rstrip('/')
        for u in recipients:
            if u.email:
                path = action_url(u) if callable(action_url) else (action_url or '/')
                html_body = _email_html(email_heading, email_lines, note=email_note,
                                        button_url=f"{app_url}{path}", button_label=action_label or 'Open MeterSquare')
                svc.send_email_async(u.email, email_subject, html_body)
    except Exception as e:
        log.warning(f"[RoleAccessNotify] email failed ({event}): {e}")

    log.info(f"[RoleAccessNotify] {event} grant={grant.grant_id} -> {[u.user_id for u in recipients]}")


def _access_phrase(grant):
    if grant.access_type == 'existing' and grant.source_user:
        return f" with {grant.source_user.full_name}'s access"
    return ' (fresh role)'


# ---------------------------------------------------------------------------
# Immediate events
# ---------------------------------------------------------------------------

def notify_granted(grant, user, role, today):
    role_label = _role_label(role.role)
    scheduled = grant.start_date > today
    period = f"{_fmt(grant.start_date)} to {_fmt(grant.end_date)}"
    if scheduled:
        title = f'{role_label} access scheduled'
        message = (f"You'll have {role_label} access{_access_phrase(grant)} from {period}. "
                   f"It ends at 11:59 PM on {_fmt(grant.end_date)}.")
    else:
        title = f'New {role_label} access'
        message = (f"You now have {role_label} access{_access_phrase(grant)} until 11:59 PM on "
                   f"{_fmt(grant.end_date)}. Switch roles from your account menu.")
    by = html.escape(grant.granted_by_name or 'Admin')
    _send(
        [user], event='granted', grant=grant, title=title, message=message, priority='medium',
        email_subject=f'MeterSquare: {title}',
        email_heading=html.escape(title),
        email_lines=[
            f"Hello {html.escape(user.full_name or '')},",
            f"{by} has given you <strong>{html.escape(role_label)}</strong> access"
            f"{html.escape(_access_phrase(grant))}.",
            f"<strong>Period:</strong> {html.escape(period)} (ends 11:59 PM on the end date).",
            f"Sign in with your usual email and choose <strong>{html.escape(role_label)}</strong>, "
            f"or switch roles from your account menu at any time.",
        ],
        email_note='Your own role does not change. The extra access ends automatically.',
        action_url='/', action_label='Open MeterSquare', ntype='success',
    )


def notify_revoked(grant, user, role, revoked_by_name):
    role_label = _role_label(role.role)
    title = f'{role_label} access removed'
    message = f"{revoked_by_name or 'An administrator'} removed your {role_label} access. Your own role is unchanged."
    _send(
        [user], event='revoked', grant=grant, title=title, message=message, priority='high',
        email_subject=f'MeterSquare: {title}',
        email_heading=html.escape(title),
        email_lines=[
            f"Hello {html.escape(user.full_name or '')},",
            f"{html.escape(revoked_by_name or 'An administrator')} removed your "
            f"<strong>{html.escape(role_label)}</strong> access. It is no longer available at sign-in or in the role switcher.",
            'Your own role and its access are unchanged.',
        ],
        action_url='/', action_label='Open MeterSquare', ntype='alert',
    )


def notify_paused(grant, user, role, paused_by_name):
    role_label = _role_label(role.role)
    by = paused_by_name or 'An administrator'
    title = f'{role_label} access paused'
    message = (f"{by} paused your {role_label} access. It is not available until it is resumed. "
               f"Your own role is unchanged.")
    _send(
        [user], event='paused', grant=grant, title=title, message=message, priority='high',
        email_subject=f'MeterSquare: {title}',
        email_heading=html.escape(title),
        email_lines=[
            f"Hello {html.escape(user.full_name or '')},",
            f"{html.escape(by)} paused your <strong>{html.escape(role_label)}</strong> access"
            f"{html.escape(_access_phrase(grant))}. It does not appear at sign-in or in the role switcher until it is resumed.",
            'Your own role and its access are unchanged.',
        ],
        action_url='/', action_label='Open MeterSquare', ntype='alert',
    )


def notify_resumed(grant, user, role, resumed_by_name, today):
    role_label = _role_label(role.role)
    by = resumed_by_name or 'An administrator'
    title = f'{role_label} access resumed'
    when = (f"from {_fmt(grant.start_date)}" if grant.start_date > today else 'now')
    message = (f"{by} resumed your {role_label} access{_access_phrase(grant)}. It is available {when} "
               f"until 11:59 PM on {_fmt(grant.end_date)}.")
    _send(
        [user], event='resumed', grant=grant, title=title, message=message, priority='medium',
        email_subject=f'MeterSquare: {title}',
        email_heading=html.escape(title),
        email_lines=[
            f"Hello {html.escape(user.full_name or '')},",
            f"{html.escape(by)} resumed your <strong>{html.escape(role_label)}</strong> access"
            f"{html.escape(_access_phrase(grant))}.",
            f"It is available {html.escape(when)} until 11:59 PM on <strong>{_fmt(grant.end_date)}</strong>. "
            f"Switch to it from your account menu.",
        ],
        action_url='/', action_label='Open MeterSquare', ntype='success',
    )


def notify_changed(grant, user, role, old_end, changed_by_name):
    """Grant edited (extended, shortened, or a scheduled grant changed)."""
    role_label = _role_label(role.role)
    by = changed_by_name or 'An administrator'
    if grant.end_date > old_end:
        title = f'{role_label} access extended'
    elif grant.end_date < old_end:
        title = f'{role_label} access end date changed'
    else:
        title = f'{role_label} access updated'
    period = f"{_fmt(grant.start_date)} to {_fmt(grant.end_date)}"
    message = (f"{by} updated your {role_label} access{_access_phrase(grant)}. "
               f"It now runs {period} and ends at 11:59 PM on {_fmt(grant.end_date)}.")
    _send(
        [user], event='changed', grant=grant, title=title, message=message, priority='medium',
        email_subject=f'MeterSquare: {title}',
        email_heading=html.escape(title),
        email_lines=[
            f"Hello {html.escape(user.full_name or '')},",
            f"{html.escape(by)} updated your <strong>{html.escape(role_label)}</strong> access"
            f"{html.escape(_access_phrase(grant))}.",
            f"<strong>New period:</strong> {html.escape(period)} (ends 11:59 PM on the end date).",
        ],
        email_note='Your own role does not change.',
        action_url='/', action_label='Open MeterSquare', ntype='info',
        extra_meta={'previous_end_date': old_end.isoformat(), 'end_date': grant.end_date.isoformat()},
    )


# ---------------------------------------------------------------------------
# Scheduled sweep
# ---------------------------------------------------------------------------

def _company_now():
    from utils.role_access import company_timezone
    return datetime.now(dt_timezone.utc).astimezone(company_timezone())


def run_role_access_notifications(app):
    """Hourly job. Sends each scheduled notice once per grant, at/after NOTIFY_HOUR company time."""
    with app.app_context():
        try:
            now = _company_now()
            if now.hour < NOTIFY_HOUR:
                return
            sweep_role_access_notifications(now.date())
        except Exception as e:
            db.session.rollback()
            log.error(f"[RoleAccessNotify] sweep failed: {e}")


def sweep_role_access_notifications(today):
    from models.user import User
    from models.role import Role
    from models.user_role_grant import UserRoleGrant, ACCESS_TYPE_FRESH
    from controllers.role_access_controller import open_work_for, describe_open_work
    from utils.role_access import normalize_role

    window_start = today - timedelta(days=ENDED_NOTICE_WINDOW_DAYS)
    grants = UserRoleGrant.query.filter(
        UserRoleGrant.is_revoked == False,
        UserRoleGrant.end_date >= window_start,
        UserRoleGrant.start_date <= today,
    ).all()
    if not grants:
        return

    managers = None
    for grant in grants:
        try:
            user = User.query.get(grant.user_id)
            role = Role.query.get(grant.role_id)
            if not user or not role or user.is_deleted:
                continue
            role_label = _role_label(role.role)
            days_left = (grant.end_date - today).days
            # Paused access gets no start / ending reminders; the "ended" notice still goes out
            if days_left >= 0 and grant.is_paused():
                continue

            # Work still assigned to a fresh grantee in the granted role
            # (projects, open change requests, open item assignments)
            held, held_text, work = 0, '', {}
            if grant.access_type == ACCESS_TYPE_FRESH and not (
                user.role and normalize_role(user.role.role) == normalize_role(role.role)
            ):
                work = open_work_for(grant.user_id, role.role)
                held = work['total']
                held_text = describe_open_work(work)

            # started: a grant created before its start date has now begun
            if (days_left >= 0 and grant.start_date == today and grant.created_at
                    and grant.created_at.date() < grant.start_date and not already_sent(grant.grant_id, 'started')):
                _send(
                    [user], event='started', grant=grant, title=f'{role_label} access is now active',
                    message=f"Your {role_label} access{_access_phrase(grant)} starts today and ends at 11:59 PM on {_fmt(grant.end_date)}.",
                    priority='medium', email_subject=f'MeterSquare: your {role_label} access starts today',
                    email_heading=html.escape(f'{role_label} access is now active'),
                    email_lines=[
                        f"Hello {html.escape(user.full_name or '')},",
                        f"Your <strong>{html.escape(role_label)}</strong> access{html.escape(_access_phrase(grant))} "
                        f"is active from today until 11:59 PM on {_fmt(grant.end_date)}.",
                        'Switch to it from your account menu, or choose it when you sign in.',
                    ],
                    action_url='/', action_label='Open MeterSquare', ntype='info',
                )

            # ending_soon: the day before the last day (only for grants longer than one day)
            if (days_left == 1 and grant.end_date > grant.start_date
                    and not already_sent(grant.grant_id, 'ending_soon')):
                _send(
                    [user], event='ending_soon', grant=grant, title=f'{role_label} access ends tomorrow',
                    message=f"Your {role_label} access ends at 11:59 PM on {_fmt(grant.end_date)}. Finish or hand over any open work.",
                    priority='high', email_subject=f'MeterSquare: your {role_label} access ends tomorrow',
                    email_heading=html.escape(f'{role_label} access ends tomorrow'),
                    email_lines=[
                        f"Hello {html.escape(user.full_name or '')},",
                        f"Your <strong>{html.escape(role_label)}</strong> access ends at 11:59 PM on "
                        f"<strong>{_fmt(grant.end_date)}</strong>.",
                        'Please finish or hand over any open work in that role before then.',
                    ],
                    action_url='/', action_label='Open MeterSquare', ntype='reminder',
                )

            # handover: Admin + TD, 3 days before a fresh grant ends while projects are still assigned
            if (0 <= days_left <= HANDOVER_DAYS_BEFORE_END and held > 0
                    and grant.reminder_sent_at is None and not already_sent(grant.grant_id, 'handover')):
                managers = managers if managers is not None else _manager_users()
                when = 'today' if days_left == 0 else f"in {days_left} day{'s' if days_left != 1 else ''}"
                _send(
                    managers, event='handover', grant=grant,
                    title='Hand over projects before role access ends',
                    message=(f"{user.full_name}'s {role_label} access ends {when} ({_fmt(grant.end_date)}). "
                             f"They still hold {held_text} as {role_label}. "
                             f"Reassign them before the end date."),
                    priority='high', email_subject=f'MeterSquare: hand over {user.full_name}\'s projects',
                    email_heading='Hand over projects before access ends',
                    email_lines=[
                        f"<strong>{html.escape(user.full_name or '')}</strong>'s "
                        f"<strong>{html.escape(role_label)}</strong> access ends {when} "
                        f"(<strong>{_fmt(grant.end_date)}</strong>).",
                        f"They still hold <strong>{html.escape(held_text)}</strong> as {html.escape(role_label)}. "
                        f"Please reassign them so nothing is left without an owner.",
                    ],
                    action_url=_role_access_url, action_label='Open Role Access', ntype='reminder',
                    extra_meta={'projects_still_assigned': held, 'open_work': work},
                )
                grant.reminder_sent_at = datetime.utcnow()
                db.session.commit()

            # ended: after the last day
            if days_left < 0 and not already_sent(grant.grant_id, 'ended'):
                _send(
                    [user], event='ended', grant=grant, title=f'{role_label} access has ended',
                    message=f"Your {role_label} access ended on {_fmt(grant.end_date)}. You're back in your own role.",
                    priority='medium', email_subject=f'MeterSquare: your {role_label} access has ended',
                    email_heading=html.escape(f'{role_label} access has ended'),
                    email_lines=[
                        f"Hello {html.escape(user.full_name or '')},",
                        f"Your <strong>{html.escape(role_label)}</strong> access ended at 11:59 PM on "
                        f"{_fmt(grant.end_date)}. It no longer appears at sign-in or in the role switcher.",
                        'Your own role and its access are unchanged.',
                    ],
                    action_url='/', action_label='Open MeterSquare', ntype='info',
                )
                if held > 0:
                    managers = managers if managers is not None else _manager_users()
                    _send(
                        managers, event='ended_projects_left', grant=grant,
                        title=f'Work left without an active {role_label}',
                        message=(f"{user.full_name}'s {role_label} access ended on {_fmt(grant.end_date)} but they still "
                                 f"hold {held_text} as {role_label}. Reassign them."),
                        priority='urgent', email_subject=f'MeterSquare: projects need a new {role_label}',
                        email_heading=html.escape(f'Projects need a new {role_label}'),
                        email_lines=[
                            f"<strong>{html.escape(user.full_name or '')}</strong>'s "
                            f"<strong>{html.escape(role_label)}</strong> access ended on {_fmt(grant.end_date)}.",
                            f"They still hold <strong>{html.escape(held_text)}</strong> as "
                            f"{html.escape(role_label)}. Please reassign them.",
                        ],
                        action_url=_role_access_url, action_label='Open Role Access', ntype='alert',
                        extra_meta={'projects_still_assigned': held, 'open_work': work},
                    )
        except Exception as e:
            db.session.rollback()
            log.error(f"[RoleAccessNotify] grant {grant.grant_id} failed: {e}")
