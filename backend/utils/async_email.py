"""
Asynchronous email sending using threading to prevent blocking
"""
import threading
import queue
import time
from datetime import datetime, timedelta
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from email.header import Header
from email.utils import formataddr
import os
import random
from config.logging import get_logger

log = get_logger()

# Email configuration
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_EMAIL_PASSWORD = os.getenv("SENDER_EMAIL_PASSWORD")
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "465"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True").lower() == "true"
ENVIRONMENT = os.environ.get("ENVIRONMENT")

# Global email queue and worker thread
email_queue = queue.Queue()
email_worker = None

# OTP storage (shared with authentication.py)
from utils.authentication import otp_storage

def email_worker_thread():
    """Background thread that processes email queue"""
    while True:
        try:
            # Get email data from queue (blocks until available)
            email_data = email_queue.get(timeout=1)

            if email_data is None:  # Shutdown signal
                email_queue.task_done()
                break

            # Send the email (dispatch by type)
            try:
                email_type = email_data.get('type', 'otp')
                if email_type == 'account_blocked':
                    _send_account_blocked_sync(email_data)
                elif email_type == 'account_unblocked':
                    _send_account_unblocked_sync(email_data)
                elif email_type == 'account_deactivated':
                    _send_account_deactivated_sync(email_data)
                elif email_type == 'account_activated':
                    _send_account_activated_sync(email_data)
                elif email_type == 'generic_html':
                    _send_generic_html_sync(email_data)
                else:
                    send_email_sync(email_data)
            except Exception as e:
                log.error(f"Error sending email: {e}")
            finally:
                # Mark task as done only after processing
                email_queue.task_done()

        except queue.Empty:
            # No items in queue, continue waiting
            continue
        except Exception as e:
            log.error(f"Email worker error: {e}")

def send_email_sync(email_data):
    """Synchronously send an email (called by worker thread)"""
    try:
        email_id = email_data['email']
        otp = email_data['otp']
        subject = email_data.get('subject', 'Your OTP Code')

        # Create the HTML body
        body = f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>OTP Verification</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f6fb; color: #333;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f6fb; padding: 30px 0;">
                    <tr>
                        <td align="center">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08); border: 1px solid #e0e6f5; max-width: 600px; min-width: 340px;">
                                <!-- Header -->
                                <tr>
                                    <td style="background: linear-gradient(to right, rgb(255, 255, 255), rgb(255, 255, 255)); border-bottom: 2px solid rgb(254, 202, 202); padding: 25px; text-align: center;">
                                        <!-- Logo Image using CID reference -->
                                        <img src="cid:logo" alt="Meter Square Logo" style="display: block; max-width: 200px; height: auto; margin: 0 auto;">
                                    </td>
                                </tr>
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 35px 25px; text-align: center;">
                                        <h2 style="font-size: 22px; font-weight: bold; color: #243d8a; margin: 0 0 18px 0;">Welcome</h2>
                                        <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 28px 0;">
                                            We're excited to have you on board! To secure your account,
                                            please use the verification code below to complete your registration.
                                        </p>

                                        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 25px auto;">
                                            <tr>
                                                <td style="padding: 18px 28px; border: 2px solid #243d8a; border-radius: 8px; background-color: #f0f4ff;">
                                                    <div style="font-size: 30px; font-weight: bold; letter-spacing: 6px; color: #243d8a; margin-bottom: 12px;">{otp}</div>
                                                    <div style="font-size: 13px; color: #555;">
                                                        This code will expire in <strong>5 minutes</strong>
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="font-size: 13px; color: #777; margin: 25px 0 0 0; line-height: 1.5;">
                                            If you did not request this verification code, you can safely ignore this email.
                                            Your account security is our top priority.
                                        </p>

                                        <div style="text-align: left; margin-top: 35px; font-size: 14px; color: #444;">
                                            Best regards,<br>
                                            <strong style="color: #243d8a;">Meter Square Team</strong>
                                        </div>
                                    </td>
                                </tr>
                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #f4f6fb; text-align: center; padding: 18px; border-top: 1px solid #e0e6f5;">
                                        <p style="font-size: 12px; color: #888; margin: 0;">© 2026 Meter Square. All rights reserved.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """

        # Create message with related type for embedded images
        message = MIMEMultipart('related')
        sender_name = "Meter Square"
        message["From"] = formataddr((str(Header(sender_name, 'utf-8')), SENDER_EMAIL))
        message["To"] = email_id
        message["Subject"] = subject

        # Create alternative part for HTML
        msg_alternative = MIMEMultipart('alternative')
        message.attach(msg_alternative)

        # Attach HTML body
        msg_alternative.attach(MIMEText(body, "html"))

        # Attach the logo image from local file
        logo_attached = False
        try:
            possible_logo_paths = [
                os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logo.png'),  # backend/logo.png
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'logo.png'),  # Project root
                os.path.join(os.getcwd(), 'logo.png'),  # Current working directory
            ]

            for logo_path in possible_logo_paths:
                if os.path.exists(logo_path):
                    with open(logo_path, 'rb') as f:
                        logo_data = f.read()
                        logo_image = MIMEImage(logo_data, _subtype='png')
                        logo_image.add_header('Content-ID', '<logo>')
                        logo_image.add_header('Content-Disposition', 'inline', filename='logo.png')
                        message.attach(logo_image)
                        logo_attached = True
                        log.info(f"Logo attached successfully from: {logo_path}")
                        break

            if not logo_attached:
                log.warning("Logo file not found, sending email without logo")

        except Exception as e:
            log.error(f"Error attaching logo: {e}")

        # Send email
        if EMAIL_USE_TLS:
            # For TLS (like Office 365 on port 587)
            with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
                server.starttls()
                server.login(SENDER_EMAIL, SENDER_EMAIL_PASSWORD)
                server.sendmail(SENDER_EMAIL, email_id, message.as_string())
        else:
            # For SSL (like Gmail on port 465)
            with smtplib.SMTP_SSL(EMAIL_HOST, EMAIL_PORT) as server:
                server.login(SENDER_EMAIL, SENDER_EMAIL_PASSWORD)
                server.sendmail(SENDER_EMAIL, email_id, message.as_string())

        log.info(f"OTP email sent successfully to {email_id}")

    except Exception as e:
        log.error(f"Failed to send email to {email_data.get('email', 'unknown')}: {e}")

def send_otp_async(email_id):
    """
    Send OTP asynchronously - returns immediately without blocking
    """
    global email_worker

    try:
        # Generate OTP
        otp = random.randint(100000, 999999)

        # Store OTP in memory (immediate)
        otp_storage[email_id] = {
            "otp": otp,
            "expires_at": (datetime.utcnow() + timedelta(seconds=300)).timestamp()
        }

        # Start email worker thread if not running
        if email_worker is None or not email_worker.is_alive():
            email_worker = threading.Thread(target=email_worker_thread, daemon=True)
            email_worker.start()
            log.info("Started email worker thread")

        # Queue email for async sending
        email_queue.put({
            'email': email_id,
            'otp': otp,
            'subject': 'Your OTP Code'
        })

        log.info(f"OTP {otp} queued for async sending to {email_id}")
        return otp

    except Exception as e:
        log.error(f"Error queuing OTP email: {e}")
        return None

def send_account_blocked_email(email_id, full_name, reason=None):
    """
    Send a professional account-blocked notification email.
    Non-blocking — queued on the background email thread.
    """
    global email_worker

    try:
        if email_worker is None or not email_worker.is_alive():
            email_worker = threading.Thread(target=email_worker_thread, daemon=True)
            email_worker.start()

        email_queue.put({
            'email': email_id,
            'type': 'account_blocked',
            'full_name': full_name,
            'reason': reason or 'No reason provided',
        })
        log.info(f"Account-blocked email queued for {email_id}")
    except Exception as e:
        log.error(f"Error queuing account-blocked email: {e}")


def _send_account_blocked_sync(email_data):
    """Synchronously build and send the account-blocked email."""
    email_id   = email_data['email']
    full_name  = email_data.get('full_name', 'User')
    reason     = email_data.get('reason', 'No reason provided')

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Access Suspended</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222222;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border:1px solid #dcdcdc;border-radius:4px;max-width:600px;width:100%;">

          <!-- Logo header -->
          <tr>
            <td style="padding:28px 40px 20px 40px;border-bottom:1px solid #eeeeee;text-align:left;">
              <img src="cid:logo" alt="MeterSquare" style="height:36px;width:auto;display:block;">
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="font-size:13px;color:#888888;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.8px;">Account Notice</p>
              <h1 style="font-size:22px;font-weight:700;color:#111111;margin:0 0 24px 0;">Account Access Suspended</h1>

              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 16px 0;">
                Dear {full_name},
              </p>
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 24px 0;">
                We are writing to inform you that access to your MeterSquare account has been
                suspended by a system administrator. You will not be able to log in until the
                suspension is lifted.
              </p>

              <!-- Reason box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#f9f9f9;border-left:3px solid #111111;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="font-size:12px;font-weight:700;color:#888888;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.6px;">Reason</p>
                    <p style="font-size:14px;color:#222222;margin:0;">{reason}</p>
                  </td>
                </tr>
              </table>

              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 24px 0;">
                If you believe this action was taken in error, or if you require further
                clarification, please contact your system administrator or reach out to our
                support team directly.
              </p>

              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0;">
                Regards,<br>
                <strong style="color:#111111;">MeterSquare Administration</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eeeeee;background-color:#fafafa;">
              <p style="font-size:12px;color:#aaaaaa;margin:0;line-height:1.6;">
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

    message = MIMEMultipart('related')
    sender_name = "MeterSquare"
    message["From"]    = formataddr((str(Header(sender_name, 'utf-8')), SENDER_EMAIL))
    message["To"]      = email_id
    message["Subject"] = "Account Access Suspended – MeterSquare"

    msg_alternative = MIMEMultipart('alternative')
    message.attach(msg_alternative)
    msg_alternative.attach(MIMEText(body, "html"))

    # Attach logo
    logo_paths = [
        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logo.png'),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'logo.png'),
        os.path.join(os.getcwd(), 'logo.png'),
    ]
    for logo_path in logo_paths:
        if os.path.exists(logo_path):
            with open(logo_path, 'rb') as f:
                logo_img = MIMEImage(f.read(), _subtype='png')
                logo_img.add_header('Content-ID', '<logo>')
                logo_img.add_header('Content-Disposition', 'inline', filename='logo.png')
                message.attach(logo_img)
            break

    if EMAIL_USE_TLS:
        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_EMAIL_PASSWORD)
            server.sendmail(SENDER_EMAIL, email_id, message.as_string())
    else:
        with smtplib.SMTP_SSL(EMAIL_HOST, EMAIL_PORT) as server:
            server.login(SENDER_EMAIL, SENDER_EMAIL_PASSWORD)
            server.sendmail(SENDER_EMAIL, email_id, message.as_string())

    log.info(f"Account-blocked email sent to {email_id}")


def send_account_unblocked_email(email_id, full_name):
    """
    Send a professional account-unblocked notification email.
    Non-blocking — queued on the background email thread.
    """
    global email_worker

    try:
        if email_worker is None or not email_worker.is_alive():
            email_worker = threading.Thread(target=email_worker_thread, daemon=True)
            email_worker.start()

        email_queue.put({
            'email': email_id,
            'type': 'account_unblocked',
            'full_name': full_name,
        })
        log.info(f"Account-unblocked email queued for {email_id}")
    except Exception as e:
        log.error(f"Error queuing account-unblocked email: {e}")


def _send_account_unblocked_sync(email_data):
    """Synchronously build and send the account-unblocked email."""
    email_id  = email_data['email']
    full_name = email_data.get('full_name', 'User')

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Access Restored</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222222;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border:1px solid #dcdcdc;border-radius:4px;max-width:600px;width:100%;">

          <!-- Logo header -->
          <tr>
            <td style="padding:28px 40px 20px 40px;border-bottom:1px solid #eeeeee;text-align:left;">
              <img src="cid:logo" alt="MeterSquare" style="height:36px;width:auto;display:block;">
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="font-size:13px;color:#888888;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.8px;">Account Notice</p>
              <h1 style="font-size:22px;font-weight:700;color:#111111;margin:0 0 24px 0;">Account Access Restored</h1>

              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 16px 0;">
                Dear {full_name},
              </p>
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 24px 0;">
                We are pleased to inform you that the suspension on your MeterSquare account
                has been lifted. Your account is now active and you may log in as usual.
              </p>

              <!-- Status box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#f9f9f9;border-left:3px solid #111111;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="font-size:12px;font-weight:700;color:#888888;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.6px;">Status</p>
                    <p style="font-size:14px;color:#222222;margin:0;">Account access has been fully restored.</p>
                  </td>
                </tr>
              </table>

              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 24px 0;">
                If you experience any issues accessing your account, or if you have questions
                regarding this change, please contact your system administrator.
              </p>

              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0;">
                Regards,<br>
                <strong style="color:#111111;">MeterSquare Administration</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eeeeee;background-color:#fafafa;">
              <p style="font-size:12px;color:#aaaaaa;margin:0;line-height:1.6;">
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

    message = MIMEMultipart('related')
    sender_name = "MeterSquare"
    message["From"]    = formataddr((str(Header(sender_name, 'utf-8')), SENDER_EMAIL))
    message["To"]      = email_id
    message["Subject"] = "Account Access Restored – MeterSquare"

    msg_alternative = MIMEMultipart('alternative')
    message.attach(msg_alternative)
    msg_alternative.attach(MIMEText(body, "html"))

    logo_paths = [
        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logo.png'),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'logo.png'),
        os.path.join(os.getcwd(), 'logo.png'),
    ]
    for logo_path in logo_paths:
        if os.path.exists(logo_path):
            with open(logo_path, 'rb') as f:
                logo_img = MIMEImage(f.read(), _subtype='png')
                logo_img.add_header('Content-ID', '<logo>')
                logo_img.add_header('Content-Disposition', 'inline', filename='logo.png')
                message.attach(logo_img)
            break

    if EMAIL_USE_TLS:
        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_EMAIL_PASSWORD)
            server.sendmail(SENDER_EMAIL, email_id, message.as_string())
    else:
        with smtplib.SMTP_SSL(EMAIL_HOST, EMAIL_PORT) as server:
            server.login(SENDER_EMAIL, SENDER_EMAIL_PASSWORD)
            server.sendmail(SENDER_EMAIL, email_id, message.as_string())

    log.info(f"Account-unblocked email sent to {email_id}")


def send_account_deactivated_email(email_id, full_name):
    """Send a professional account-deactivated notification email. Non-blocking."""
    global email_worker
    try:
        if email_worker is None or not email_worker.is_alive():
            email_worker = threading.Thread(target=email_worker_thread, daemon=True)
            email_worker.start()
        email_queue.put({'email': email_id, 'type': 'account_deactivated', 'full_name': full_name})
        log.info(f"Account-deactivated email queued for {email_id}")
    except Exception as e:
        log.error(f"Error queuing account-deactivated email: {e}")


def _send_account_deactivated_sync(email_data):
    """Synchronously build and send the account-deactivated email."""
    email_id  = email_data['email']
    full_name = email_data.get('full_name', 'User')

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Deactivated</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222222;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border:1px solid #dcdcdc;border-radius:4px;max-width:600px;width:100%;">
          <tr>
            <td style="padding:28px 40px 20px 40px;border-bottom:1px solid #eeeeee;text-align:left;">
              <img src="cid:logo" alt="MeterSquare" style="height:36px;width:auto;display:block;">
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="font-size:13px;color:#888888;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.8px;">Account Notice</p>
              <h1 style="font-size:22px;font-weight:700;color:#111111;margin:0 0 24px 0;">Account Deactivated</h1>
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 16px 0;">Dear {full_name},</p>
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 24px 0;">
                We are writing to inform you that your MeterSquare account has been deactivated
                by a system administrator. You will no longer be able to access the platform.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#f9f9f9;border-left:3px solid #111111;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="font-size:12px;font-weight:700;color:#888888;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.6px;">Status</p>
                    <p style="font-size:14px;color:#222222;margin:0;">Account has been deactivated.</p>
                  </td>
                </tr>
              </table>
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 24px 0;">
                If you believe this was done in error, please contact your system administrator
                or reach out to our support team.
              </p>
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0;">
                Regards,<br>
                <strong style="color:#111111;">MeterSquare Administration</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eeeeee;background-color:#fafafa;">
              <p style="font-size:12px;color:#aaaaaa;margin:0;line-height:1.6;">
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

    _dispatch_simple_email(email_id, "Account Deactivated – MeterSquare", body)
    log.info(f"Account-deactivated email sent to {email_id}")


def send_account_activated_email(email_id, full_name):
    """Send a professional account-activated notification email. Non-blocking."""
    global email_worker
    try:
        if email_worker is None or not email_worker.is_alive():
            email_worker = threading.Thread(target=email_worker_thread, daemon=True)
            email_worker.start()
        email_queue.put({'email': email_id, 'type': 'account_activated', 'full_name': full_name})
        log.info(f"Account-activated email queued for {email_id}")
    except Exception as e:
        log.error(f"Error queuing account-activated email: {e}")


def _send_account_activated_sync(email_data):
    """Synchronously build and send the account-activated email."""
    email_id  = email_data['email']
    full_name = email_data.get('full_name', 'User')

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Activated</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222222;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border:1px solid #dcdcdc;border-radius:4px;max-width:600px;width:100%;">
          <tr>
            <td style="padding:28px 40px 20px 40px;border-bottom:1px solid #eeeeee;text-align:left;">
              <img src="cid:logo" alt="MeterSquare" style="height:36px;width:auto;display:block;">
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="font-size:13px;color:#888888;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.8px;">Account Notice</p>
              <h1 style="font-size:22px;font-weight:700;color:#111111;margin:0 0 24px 0;">Account Activated</h1>
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 16px 0;">Dear {full_name},</p>
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 24px 0;">
                We are pleased to inform you that your MeterSquare account has been activated
                by a system administrator. You may now log in and access the platform as usual.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#f9f9f9;border-left:3px solid #111111;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="font-size:12px;font-weight:700;color:#888888;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.6px;">Status</p>
                    <p style="font-size:14px;color:#222222;margin:0;">Account is now active and ready to use.</p>
                  </td>
                </tr>
              </table>
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0 0 24px 0;">
                If you have any questions or require assistance, please contact your system administrator.
              </p>
              <p style="font-size:15px;line-height:1.7;color:#444444;margin:0;">
                Regards,<br>
                <strong style="color:#111111;">MeterSquare Administration</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eeeeee;background-color:#fafafa;">
              <p style="font-size:12px;color:#aaaaaa;margin:0;line-height:1.6;">
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

    _dispatch_simple_email(email_id, "Account Activated – MeterSquare", body)
    log.info(f"Account-activated email sent to {email_id}")


def _dispatch_simple_email(email_id, subject, body):
    """Shared helper — builds MIME message, attaches logo, sends via SMTP."""
    message = MIMEMultipart('related')
    message["From"]    = formataddr((str(Header("MeterSquare", 'utf-8')), SENDER_EMAIL))
    message["To"]      = email_id
    message["Subject"] = subject

    msg_alternative = MIMEMultipart('alternative')
    message.attach(msg_alternative)
    msg_alternative.attach(MIMEText(body, "html"))

    logo_paths = [
        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logo.png'),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'logo.png'),
        os.path.join(os.getcwd(), 'logo.png'),
    ]
    for logo_path in logo_paths:
        if os.path.exists(logo_path):
            with open(logo_path, 'rb') as f:
                logo_img = MIMEImage(f.read(), _subtype='png')
                logo_img.add_header('Content-ID', '<logo>')
                logo_img.add_header('Content-Disposition', 'inline', filename='logo.png')
                message.attach(logo_img)
            break

    if EMAIL_USE_TLS:
        with smtplib.SMTP(EMAIL_HOST, EMAIL_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_EMAIL_PASSWORD)
            server.sendmail(SENDER_EMAIL, email_id, message.as_string())
    else:
        with smtplib.SMTP_SSL(EMAIL_HOST, EMAIL_PORT) as server:
            server.login(SENDER_EMAIL, SENDER_EMAIL_PASSWORD)
            server.sendmail(SENDER_EMAIL, email_id, message.as_string())


def _ensure_worker_running():
    """Start the background email worker thread if not already running."""
    global email_worker
    if email_worker is None or not email_worker.is_alive():
        email_worker = threading.Thread(target=email_worker_thread, daemon=True)
        email_worker.start()
        log.info("Started email worker thread")


def queue_generic_email(recipient_email, subject, email_html, attachments=None, cc_emails=None):
    """
    Queue an HTML notification email on the shared worker thread — non-blocking.
    Used by BOQEmailService.send_email_async() to avoid spawning a new thread per email.
    """
    try:
        _ensure_worker_running()
        email_queue.put({
            'type': 'generic_html',
            'email': recipient_email,
            'subject': subject,
            'html': email_html,
            'attachments': attachments,
            'cc_emails': cc_emails,
        })
        log.info(f"Generic email queued for {recipient_email}")
    except Exception as e:
        log.error(f"Error queuing generic email for {recipient_email}: {e}")


def _send_generic_html_sync(email_data):
    """Synchronously send a pre-built HTML email (called by the worker thread)."""
    from utils.boq_email_service import BOQEmailService
    email_id = email_data['email']
    subject = email_data['subject']
    email_html = email_data['html']
    attachments = email_data.get('attachments')
    cc_emails = email_data.get('cc_emails')
    try:
        service = BOQEmailService()
        service.send_email(email_id, subject, email_html, attachments, cc_emails)
    except Exception as e:
        log.error(f"Failed to send generic HTML email to {email_id}: {e}")


def shutdown_email_worker():
    """Shutdown the email worker thread gracefully"""
    if email_worker and email_worker.is_alive():
        email_queue.put(None)  # Signal to stop
        email_worker.join(timeout=5)