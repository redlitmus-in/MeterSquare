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
                break

            # Send the email
            send_email_sync(email_data)

        except queue.Empty:
            continue
        except Exception as e:
            log.error(f"Email worker error: {e}")
        finally:
            email_queue.task_done()

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
                                        <h1 style="color: #243d8a; margin: 0; font-size: 24px;">Meter Square</h1>
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
                                        <p style="font-size: 12px; color: #888; margin: 0;">© 2025 Meter Square. All rights reserved.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """

        # Create message
        message = MIMEMultipart('alternative')
        sender_name = "Meter Square"
        message["From"] = formataddr((str(Header(sender_name, 'utf-8')), SENDER_EMAIL))
        message["To"] = email_id
        message["Subject"] = subject

        # Attach HTML body
        message.attach(MIMEText(body, "html"))

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

def shutdown_email_worker():
    """Shutdown the email worker thread gracefully"""
    if email_worker and email_worker.is_alive():
        email_queue.put(None)  # Signal to stop
        email_worker.join(timeout=5)