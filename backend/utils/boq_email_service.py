"""
BOQ Email Service - Professional email templates for Technical Directors
"""
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email import encoders
from email.header import Header
from email.utils import formataddr
from config.logging import get_logger
from utils.email_styles import wrap_email_content
from utils.email_config import LOGO_URL

log = get_logger()

# Email configuration
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_EMAIL_PASSWORD = os.getenv("SENDER_EMAIL_PASSWORD")
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "465"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True").lower() == "true"

# Frontend URL (environment-specific)
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
if ENVIRONMENT == "production":
    FRONTEND_URL = os.getenv("PROD_FRONTEND_URL", "https://msq.kol.tel")
else:
    FRONTEND_URL = os.getenv("DEV_FRONTEND_URL", "http://localhost:3000")


class BOQEmailService:
    """Service for sending BOQ-related emails to Technical Directors"""

    def __init__(self):
        self.sender_email = SENDER_EMAIL
        self.sender_password = SENDER_EMAIL_PASSWORD
        self.email_host = EMAIL_HOST
        self.email_port = EMAIL_PORT
        self.use_tls = EMAIL_USE_TLS

    def send_email(self, recipient_email, subject, html_content, attachments=None, cc_emails=None):
        """
        Send email using SMTP

        Args:
            recipient_email: Email address of recipient (string) or list of emails
            subject: Email subject
            html_content: HTML formatted email content
            attachments: List of tuples (filename, file_data, mime_type)
            cc_emails: List of CC email addresses (optional)

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Validate email configuration
            if not self.sender_email or not self.sender_password:
                error_msg = "Email configuration missing: SENDER_EMAIL or SENDER_EMAIL_PASSWORD not set in environment"
                raise ValueError(error_msg)

            # Handle multiple recipients - convert string to list if needed
            if isinstance(recipient_email, str):
                # Split comma-separated emails and clean them
                recipient_list = [email.strip() for email in recipient_email.split(',') if email.strip()]
            elif isinstance(recipient_email, list):
                recipient_list = [email.strip() for email in recipient_email if email.strip()]
            else:
                recipient_list = [str(recipient_email).strip()]

            if not recipient_list:
                raise ValueError("No valid recipient email addresses provided")

            # Handle CC emails
            cc_list = []
            if cc_emails:
                if isinstance(cc_emails, str):
                    cc_list = [email.strip() for email in cc_emails.split(',') if email.strip()]
                elif isinstance(cc_emails, list):
                    cc_list = [email.strip() for email in cc_emails if email.strip()]

            # Create message
            message = MIMEMultipart('mixed')
            sender_name = "MeterSquare ERP"
            message["From"] = formataddr((str(Header(sender_name, 'utf-8')), self.sender_email))
            # For multiple recipients, join with comma for the To header
            message["To"] = ", ".join(recipient_list)
            message["Subject"] = subject

            # Add CC header if CC emails exist
            if cc_list:
                message["Cc"] = ", ".join(cc_list)

            # Attach HTML body
            html_part = MIMEText(html_content, "html", "utf-8")
            message.attach(html_part)

            # Attach logo as CID embedded image for better email client compatibility
            try:
                logo_paths = [
                    os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logo.png'),  # backend/logo.png
                    os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'logo.png'),  # backend/static/logo.png
                ]

                logo_attached = False
                for logo_path in logo_paths:
                    if os.path.exists(logo_path):
                        with open(logo_path, 'rb') as f:
                            logo_data = f.read()
                            logo_image = MIMEImage(logo_data, _subtype='png')
                            logo_image.add_header('Content-ID', '<logo>')
                            logo_image.add_header('Content-Disposition', 'inline', filename='logo.png')
                            message.attach(logo_image)
                            logo_attached = True
                            break

                if not logo_attached:
                    log.warning("Logo file not found, email will display without embedded logo")
            except Exception as e:
                log.warning(f"Could not attach logo as CID: {e}")

            # Attach files if provided
            if attachments:
                for filename, file_data, mime_type in attachments:
                    part = MIMEBase(*mime_type.split('/'))
                    part.set_payload(file_data)
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                    message.attach(part)

            # Combine all recipients (To + CC) for actual sending
            all_recipients = recipient_list + cc_list

            # Send email
            try:
                if self.use_tls:
                    with smtplib.SMTP(self.email_host, self.email_port, timeout=30) as server:
                        server.starttls()
                        server.login(self.sender_email, self.sender_password)
                        # Send to all recipients (To + CC) in one call
                        server.sendmail(self.sender_email, all_recipients, message.as_string())
                else:
                    # For SSL (like Gmail on port 465)
                    with smtplib.SMTP_SSL(self.email_host, self.email_port, timeout=30) as server:
                        server.login(self.sender_email, self.sender_password)
                        # Send to all recipients (To + CC) in one call
                        server.sendmail(self.sender_email, all_recipients, message.as_string())

                cc_info = f" + {len(cc_list)} CC" if cc_list else ""
                if cc_list:
                    log.info(f"CC recipients: {', '.join(cc_list)}")
                return True

            except smtplib.SMTPAuthenticationError as e:
                log.error(f"SMTP Authentication failed: {e}")
                raise
            except smtplib.SMTPException as e:
                log.error(f"SMTP error occurred: {e}")
                raise
            except Exception as e:
                log.error(f"Unexpected error during email send: {e}")
                raise

        except Exception as e:
            log.error(f"Failed to send BOQ email to {recipient_email}: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_email_async(self, recipient_email, subject, html_content, attachments=None, cc_emails=None):
        """
        Send email asynchronously using background thread queue
        ✅ PERFORMANCE FIX: Non-blocking email sending (15s → 0.1s response time)

        Args:
            recipient_email: Email address of recipient (string) or list of emails
            subject: Email subject
            html_content: HTML formatted email content
            attachments: List of tuples (filename, file_data, mime_type)
            cc_emails: List of CC email addresses (optional)

        Returns:
            bool: True if email queued successfully (doesn't wait for send)
        """
        try:
            import threading
            import queue

            # Create email data package
            email_data = {
                'recipient_email': recipient_email,
                'subject': subject,
                'html_content': html_content,
                'attachments': attachments,
                'cc_emails': cc_emails,
                'sender_email': self.sender_email,
                'sender_password': self.sender_password,
                'email_host': self.email_host,
                'email_port': self.email_port,
                'use_tls': self.use_tls
            }

            # Send to background thread for processing
            def send_in_background():
                try:
                    self.send_email(
                        recipient_email=email_data['recipient_email'],
                        subject=email_data['subject'],
                        html_content=email_data['html_content'],
                        attachments=email_data['attachments'],
                        cc_emails=email_data['cc_emails']
                    )
                except Exception as e:
                    log.error(f"Background email send failed: {e}")

            # Start background thread
            thread = threading.Thread(target=send_in_background, daemon=True)
            thread.start()

            return True

        except Exception as e:
            log.error(f"Failed to queue email: {e}")
            return False

    def generate_boq_review_email(self, boq_data, project_data, items_summary):
        """
        Generate professional BOQ review request email for Technical Director

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary

        Returns:
            str: HTML formatted email content
        """
        boq_id = boq_data.get('boq_id', 'N/A')
        boq_name = boq_data.get('boq_name', 'N/A')
        status = boq_data.get('status', 'Draft')
        created_by = boq_data.get('created_by', 'System')
        created_at = boq_data.get('created_at', 'N/A')

        project_name = project_data.get('project_name', 'N/A')
        client = project_data.get('client', 'N/A')
        location = project_data.get('location', 'N/A')
        project_code = project_data.get('project_code', 'N/A')

        estimated_selling_price = items_summary.get('estimatedSellingPrice', 0)

        # Build email HTML
        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Logo Header with Blue (Review) -->
            <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 28px; margin: 15px 0 5px 0; font-weight: 600;">BOQ Review Required</h1>
                <p style="color: #bfdbfe; font-size: 14px; margin: 0;">Action Required: Please Review and Approve</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <!-- Greeting -->
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                    Dear <strong style="color: #1e293b;">Technical Director</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                    A Bill of Quantities (BOQ) for project <strong style="color: #1e293b;">{project_name}</strong> has been submitted by <strong style="color: #1e293b;">{created_by}</strong> and is awaiting your review and approval.
                </p>

                <!-- Review Badge -->
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <div style="display: flex; align-items: center;">
                        <span style="background: #3b82f6; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                            📋 Pending Review
                        </span>
                        <span style="margin-left: 12px; color: #1e40af; font-size: 13px; font-weight: 500;">
                            Your approval is required to proceed
                        </span>
                    </div>
                </div>

                <!-- Project Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        🏗️ Project Details
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">Project Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Location:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{location}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">BOQ Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 8px 0; color: #3b82f6; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Estimated Value:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">AED {estimated_selling_price:,.2f}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Submitted By:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{created_by}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Submitted On:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{created_at}</td>
                        </tr>
                    </table>
                </div>

                <!-- Action Required -->
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #93c5fd; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                    <h3 style="color: #1e40af; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">
                        📝 Action Required
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #1e40af; font-size: 13px; line-height: 1.8;">
                        <li style="margin-bottom: 6px;">Review the BOQ details and cost estimations</li>
                        <li style="margin-bottom: 6px;">Approve the BOQ to proceed to the client</li>
                        <li style="margin-bottom: 6px;">Or provide feedback for necessary revisions</li>
                    </ul>
                </div>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{FRONTEND_URL}" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.2);">
                        Review BOQ →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 8px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 15px; font-weight: 700; margin: 0 0 4px 0;">{created_by}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Estimator</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 25px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">
                    MeterSquare ERP
                </p>
                <p style="color: #64748b; font-size: 11px; margin: 0 0 8px 0;">
                    Construction Management System
                </p>
                <p style="color: #94a3b8; font-size: 10px; margin: 0;">
                    This is an automated email notification. Please do not reply to this email.
                </p>
                <p style="color: #475569; font-size: 11px; margin: 8px 0 0 0; font-weight: 500;">
                    © 2025 MeterSquare. All rights reserved.
                </p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_boq_to_technical_director(self, boq_data, project_data, items_summary, td_email):
        """
        Send BOQ review email to Technical Director

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            td_email: Technical Director's email address

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            email_html = self.generate_boq_review_email(boq_data, project_data, items_summary)

            # Create subject
            boq_name = boq_data.get('boq_name', 'BOQ')
            project_name = project_data.get('project_name', 'Project')
            subject = f"BOQ Review Required - {boq_name} ({project_name})"

            # Send email
            return self.send_email(td_email, subject, email_html)

        except Exception as e:
            log.error(f"Error sending BOQ to Technical Director: {e}")
            return False

    def send_client_confirmed_to_td(self, boq_id, boq_name, project_name, estimator_name, client_name, td_email, td_name=None):
        """Send a simple notification email to TD when client confirms BOQ approval"""
        try:
            td_display = td_name if td_name else "Technical Director"
            client_display = client_name if client_name else "Client"
            subject = f"✅ Client Approved BOQ - {boq_name} ({project_name})"

            email_body = f"""
        <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 35px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 16px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 220px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 24px; margin: 12px 0 4px 0; font-weight: 600;">Client Approved the BOQ</h1>
            </div>

            <!-- Content -->
            <div style="background: #ffffff; padding: 30px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 18px 0;">
                    Dear <strong style="color: #1e293b;">{td_display}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 22px 0;">
                    This is to inform you that <strong style="color: #1e293b;">{client_display}</strong> has approved the BOQ for project <strong style="color: #1e293b;">{project_name}</strong>. The confirmation was recorded by <strong style="color: #1e293b;">{estimator_name}</strong>.
                </p>

                <!-- Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 7px 0; color: #64748b; font-size: 13px; width: 40%;">BOQ Name:</td>
                            <td style="padding: 7px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 7px 0; color: #64748b; font-size: 13px;">Project:</td>
                            <td style="padding: 7px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 7px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 7px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client_display}</td>
                        </tr>
                        <tr>
                            <td style="padding: 7px 0; color: #64748b; font-size: 13px;">Confirmed By:</td>
                            <td style="padding: 7px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{estimator_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 7px 0; color: #64748b; font-size: 13px;">Status:</td>
                            <td style="padding: 7px 0; font-size: 13px;">
                                <span style="background: #d1fae5; color: #065f46; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700;">✓ Client Confirmed</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Signature -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 10px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 2px 0;">{estimator_name}</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #94a3b8; font-size: 11px; margin: 0;">This is an automated notification. Please do not reply to this email.</p>
                <p style="color: #475569; font-size: 11px; margin: 6px 0 0 0;">© 2025 MeterSquare. All rights reserved.</p>
            </div>
        </div>
            """

            return self.send_email(td_email, subject, wrap_email_content(email_body))

        except Exception as e:
            log.error(f"Error sending client confirmed notification to TD: {e}")
            return False

    def send_se_items_assigned_notification(self, boq_name, project_name, pm_name, se_email, se_name, items_count, assigned_items):
        """Send notification email to SE when BOQ items are assigned to them"""
        try:
            subject = f"📋 BOQ Items Assigned to You - {project_name}"

            # Build items rows
            items_rows = ""
            for idx, item in enumerate(assigned_items[:10], 1):  # show max 10 items
                item_name = item.get('description', item.get('item_code', f'Item-{idx}'))
                row_bg = '#f9fafb' if idx % 2 == 0 else '#ffffff'
                items_rows += f"""
                <tr style="background: {row_bg};">
                    <td style="padding: 9px 12px; color: #64748b; font-size: 13px; border-bottom: 1px solid #e2e8f0;">{idx}</td>
                    <td style="padding: 9px 12px; color: #1e293b; font-size: 13px; font-weight: 500; border-bottom: 1px solid #e2e8f0;">{item_name}</td>
                </tr>
                """
            more_note = f'<p style="color:#64748b;font-size:12px;margin:8px 0 0 12px;">...and {items_count - 10} more item(s)</p>' if items_count > 10 else ''

            email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 26px; margin: 12px 0 5px 0; font-weight: 600;">BOQ Items Assigned</h1>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                    Dear <strong style="color: #1e293b;">{se_name}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 22px 0;">
                    <strong style="color: #1e293b;">{pm_name}</strong> has assigned <strong style="color: #1e293b;">{items_count} item(s)</strong> from the BOQ for project <strong style="color: #1e293b;">{project_name}</strong> to you for execution.
                </p>

                <!-- Assignment Badge -->
                <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-left: 4px solid #8b5cf6; padding: 14px 18px; border-radius: 8px; margin-bottom: 25px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px; width: 40%;">BOQ Name:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Project:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Assigned By:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{pm_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Total Items:</td>
                            <td style="padding: 5px 0; font-size: 13px;">
                                <span style="background: #8b5cf6; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">{items_count} Items</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Assigned Items Table -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 20px;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #f1f5f9;">
                        <h3 style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0;">📦 Assigned Items</h3>
                    </div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 9px 12px; color: #64748b; font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid #e2e8f0;">#</th>
                                <th style="padding: 9px 12px; color: #64748b; font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid #e2e8f0;">Item Name</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items_rows}
                        </tbody>
                    </table>
                    {more_note}
                </div>

                <!-- Action Required -->
                <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border: 1px solid #c4b5fd; border-radius: 10px; padding: 16px 20px; margin-bottom: 25px;">
                    <h3 style="color: #5b21b6; font-size: 14px; font-weight: 700; margin: 0 0 8px 0;">📝 Action Required</h3>
                    <p style="color: #5b21b6; font-size: 13px; margin: 0; line-height: 1.6;">Please log in to MeterSquare ERP to view the full item details and begin execution planning.</p>
                </div>

                <!-- CTA -->
                <div style="text-align: center; margin: 25px 0;">
                    <a href="{FRONTEND_URL}" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; padding: 13px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                        Open MeterSquare ERP →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 10px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 2px 0;">{pm_name}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 2px 0;">Project Manager</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #94a3b8; font-size: 11px; margin: 0;">This is an automated notification. Please do not reply to this email.</p>
                <p style="color: #475569; font-size: 11px; margin: 6px 0 0 0;">© 2025 MeterSquare. All rights reserved.</p>
            </div>
        </div>
            """

            return self.send_email(se_email, subject, wrap_email_content(email_body))

        except Exception as e:
            log.error(f"Error sending SE items assigned notification: {e}")
            return False

    def send_cr_review_notification(self, cr_id, project_name, project_code, item_name, sender_name, sender_role,
                                     recipient_email, recipient_name, recipient_role, context='review'):
        """Send notification email to receiver when a change request is sent for review or purchase action.

        context='review'    - Standard review notification (default) — SE/Estimator submits to PM/TD
        context='forwarded' - PM approved and forwarded to Estimator for new material approval
        context='purchase'  - CR approved by Estimator, Buyer must now proceed with purchase
        """
        try:
            role_display = recipient_role.replace('_', ' ').title() if recipient_role else "Reviewer"
            sender_role_display = sender_role.replace('_', ' ').title() if sender_role else "User"

            if context == 'purchase':
                subject = f"✅ Change Request Approved - Purchase Action Required - {project_name}"
                email_heading = "Purchase Action Required"
                body_text = f"<strong style=\"color: #1e293b;\">{sender_name}</strong> ({sender_role_display}) has approved this change request. Please proceed with vendor selection and complete the purchase."
                status_badge = '<span style="background: #10b981; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">Approved – Pending Purchase</span>'
                action_text = "Please log in to MeterSquare ERP to select a vendor and complete the purchase for this change request."
                cta_label = "Proceed to Purchase →"
                approved_by_label = "Approved By:"
            elif context == 'forwarded':
                subject = f"📋 New Material Approval Required - {project_name}"
                email_heading = "New Material Approval Required"
                body_text = f"<strong style=\"color: #1e293b;\">{sender_name}</strong> ({sender_role_display}) has approved this change request and forwarded it to you for new material approval."
                status_badge = '<span style="background: #f59e0b; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">Forwarded – Pending Approval</span>'
                action_text = "Please log in to MeterSquare ERP to review and approve the new material request in this change request."
                cta_label = "Review & Approve →"
                approved_by_label = "Forwarded By:"
            else:
                subject = f"📋 Change Request Approval Required - {project_name}"
                email_heading = "Change Request Approval Required"
                body_text = f"<strong style=\"color: #1e293b;\">{sender_name}</strong> ({sender_role_display}) has submitted a change request and is requesting your approval."
                status_badge = '<span style="background: #f59e0b; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">Pending Approval</span>'
                action_text = "Please log in to MeterSquare ERP to review and approve or reject this change request."
                cta_label = "Review & Approve →"
                approved_by_label = "Submitted By:"

            email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 26px; margin: 12px 0 5px 0; font-weight: 600;">{email_heading}</h1>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                    Dear <strong style="color: #1e293b;">{recipient_name}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 22px 0;">
                    {body_text}
                </p>

                <!-- CR Details Card -->
                <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 8px; margin-bottom: 25px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px; width: 40%;">CR Reference:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">CR-{cr_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Project:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Item:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{item_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">{approved_by_label}</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{sender_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Status:</td>
                            <td style="padding: 5px 0; font-size: 13px;">
                                {status_badge}
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Action Required -->
                <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 1px solid #fcd34d; border-radius: 10px; padding: 16px 20px; margin-bottom: 25px;">
                    <h3 style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 8px 0;">⚠️ Action Required</h3>
                    <p style="color: #92400e; font-size: 13px; margin: 0; line-height: 1.6;">{action_text}</p>
                </div>

                <!-- CTA -->
                <div style="text-align: center; margin: 25px 0;">
                    <a href="{FRONTEND_URL}" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 13px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                        {cta_label}
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 10px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 2px 0;">{sender_name}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 2px 0;">{sender_role_display}</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #94a3b8; font-size: 11px; margin: 0;">This is an automated notification. Please do not reply to this email.</p>
                <p style="color: #475569; font-size: 11px; margin: 6px 0 0 0;">© 2025 MeterSquare. All rights reserved.</p>
            </div>
        </div>
            """

            return self.send_email(recipient_email, subject, wrap_email_content(email_body))

        except Exception as e:
            log.error(f"Error sending CR review notification: {e}")
            return False

    def send_cr_approved_notification(self, cr_id, project_name, project_code, item_name,
                                       approver_name, approver_role, recipient_email, recipient_name):
        """Send notification email to CR creator when change request is fully approved by TD"""
        try:
            subject = f"✅ Change Request Approved - {project_name}"

            approver_role_display = approver_role.replace('_', ' ').title() if approver_role else "Approver"

            email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 26px; margin: 12px 0 5px 0; font-weight: 600;">Change Request Approved</h1>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                    Dear <strong style="color: #1e293b;">{recipient_name}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 22px 0;">
                    Your change request has been <strong style="color: #059669;">approved</strong> by <strong style="color: #1e293b;">{approver_name}</strong> ({approver_role_display}).
                </p>

                <!-- CR Details Card -->
                <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 8px; margin-bottom: 25px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px; width: 40%;">CR Reference:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">CR-{cr_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Project:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Item:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{item_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Approved By:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{approver_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Status:</td>
                            <td style="padding: 5px 0; font-size: 13px;">
                                <span style="background: #10b981; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">Approved</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- CTA -->
                <div style="text-align: center; margin: 25px 0;">
                    <a href="{FRONTEND_URL}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 13px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                        View Change Request →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 10px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 2px 0;">{approver_name}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 2px 0;">{approver_role_display}</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #94a3b8; font-size: 11px; margin: 0;">This is an automated notification. Please do not reply to this email.</p>
                <p style="color: #475569; font-size: 11px; margin: 6px 0 0 0;">© 2025 MeterSquare. All rights reserved.</p>
            </div>
        </div>
            """

            return self.send_email(recipient_email, subject, wrap_email_content(email_body))

        except Exception as e:
            log.error(f"Error sending CR approved notification: {e}")
            return False

    def send_cr_rejection_notification(self, cr_id, project_name, rejector_name, rejector_role,
                                       recipient_email, recipient_name, rejection_reason, item_name=None):
        """
        Send email notification to CR creator when their change request is rejected.
        This email is only sent when the recipient is OFFLINE (no real-time notification available).

        Args:
            cr_id: Change request ID
            project_name: Name of the project
            rejector_name: Name of person who rejected
            rejector_role: Role of person who rejected
            recipient_email: Email address of CR creator
            recipient_name: Full name of CR creator
            rejection_reason: Reason for rejection
            item_name: Item/material name (optional)

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            subject = f"❌ Change Request Rejected - CR-{cr_id} | {project_name}"
            rejector_role_display = rejector_role.replace('_', ' ').title() if rejector_role else "Approver"
            item_display = item_name if item_name else f"CR-{cr_id}"

            email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 26px; margin: 12px 0 5px 0; font-weight: 600;">Change Request Rejected</h1>
                <p style="color: #fecaca; font-size: 14px; margin: 6px 0 0 0;">CR-{cr_id} &bull; {project_name}</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                    Dear <strong style="color: #1e293b;">{recipient_name}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 22px 0;">
                    Your change request has been <strong style="color: #ef4444;">rejected</strong> by
                    <strong style="color: #1e293b;">{rejector_name}</strong> ({rejector_role_display}).
                    Please review the reason below and resubmit if necessary.
                </p>

                <!-- CR Details Card -->
                <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-left: 4px solid #f87171; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px; width: 40%;">CR Reference:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">CR-{cr_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Project:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Item / Request:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{item_display}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Rejected By:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{rejector_name} ({rejector_role_display})</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Status:</td>
                            <td style="padding: 5px 0; font-size: 13px;">
                                <span style="background: #f87171; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">Rejected</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Rejection Reason Box -->
                <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 14px 18px; border-radius: 8px; margin-bottom: 25px;">
                    <p style="color: #9a3412; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px 0;">Rejection Reason</p>
                    <p style="color: #1e293b; font-size: 14px; line-height: 1.6; margin: 0;">{rejection_reason}</p>
                </div>

                <!-- CTA -->
                <div style="text-align: center; margin: 25px 0;">
                    <a href="{FRONTEND_URL}" style="background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); color: white; padding: 13px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                        View Change Request →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 10px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 2px 0;">{rejector_name}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 2px 0;">{rejector_role_display}</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #94a3b8; font-size: 11px; margin: 0;">This is an automated notification. Please do not reply to this email.</p>
                <p style="color: #475569; font-size: 11px; margin: 6px 0 0 0;">© 2026 MeterSquare. All rights reserved.</p>
            </div>
        </div>
            """

            return self.send_email(recipient_email, subject, wrap_email_content(email_body))

        except Exception as e:
            log.error(f"Error sending CR rejection notification email: {e}")
            return False

    def send_vendor_selection_notification(self, cr_id, project_name, buyer_name, buyer_role,
                                           recipient_email, recipient_name, materials_count,
                                           material_names, vendor_name, all_submitted):
        """
        Send email notification to TD when buyer selects a vendor for materials.
        Only sent when the TD recipient is OFFLINE (no real-time notification available).

        Args:
            cr_id: Change request / Purchase order ID
            project_name: Name of the project
            buyer_name: Name of the buyer who selected the vendor
            buyer_role: Role of the buyer
            recipient_email: TD's email address
            recipient_name: TD's full name
            materials_count: Number of materials with vendor selected
            material_names: Comma-separated material names (first 3)
            vendor_name: Primary vendor selected
            all_submitted: True if all materials now have vendors (ready for final approval)

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            if all_submitted:
                subject = f"✅ Vendor Selected for Approval - CR-{cr_id} | {project_name}"
                action_title = "Vendor Selected for Approval"
                action_message = (
                    f"<strong>{buyer_name}</strong> has completed vendor selection for all materials "
                    f"in <strong>CR-{cr_id}</strong>. The purchase order is now ready for your approval."
                )
                status_badge_bg = "#10b981"
                status_badge_text = "Ready for Approval"
                header_gradient = "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                header_sub_color = "#d1fae5"
            else:
                subject = f"⏳ Vendor Selected — Awaiting Approval - CR-{cr_id} | {project_name}"
                action_title = "Vendor Selected — Awaiting Approval"
                action_message = (
                    f"<strong>{buyer_name}</strong> has selected vendor(s) for "
                    f"<strong>{materials_count}</strong> material(s) in <strong>CR-{cr_id}</strong>. "
                    f"Please review and approve the vendor selections."
                )
                status_badge_bg = "#f59e0b"
                status_badge_text = "Pending Approval"
                header_gradient = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                header_sub_color = "#fef3c7"

            buyer_role_display = buyer_role.replace('_', ' ').title() if buyer_role else "Buyer"

            email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Header -->
            <div style="background: {header_gradient}; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 26px; margin: 12px 0 0 0; font-weight: 600;">{action_title}</h1>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                    Dear <strong style="color: #1e293b;">{recipient_name}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 22px 0;">
                    {action_message}
                </p>

                <!-- Details Card -->
                <div style="background: #f8fafc; border-left: 4px solid #64748b; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px; width: 40%;">CR Reference:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">CR-{cr_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Project:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Selected By:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{buyer_name} ({buyer_role_display})</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Vendor:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{vendor_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Materials:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{material_names} ({materials_count} item(s))</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Status:</td>
                            <td style="padding: 5px 0; font-size: 13px;">
                                <span style="background: {status_badge_bg}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">{status_badge_text}</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- CTA -->
                <div style="text-align: center; margin: 25px 0;">
                    <a href="{FRONTEND_URL}" style="background: {header_gradient}; color: white; padding: 13px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                        Review Vendor Selection →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 10px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 2px 0;">{buyer_name}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 2px 0;">{buyer_role_display}</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #94a3b8; font-size: 11px; margin: 0;">This is an automated notification. Please do not reply to this email.</p>
                <p style="color: #475569; font-size: 11px; margin: 6px 0 0 0;">© 2026 MeterSquare. All rights reserved.</p>
            </div>
        </div>
            """

            return self.send_email(recipient_email, subject, wrap_email_content(email_body))

        except Exception as e:
            log.error(f"Error sending vendor selection notification email: {e}")
            return False

    def send_td_vendor_approval_notification(self, cr_id, project_name, td_name,
                                             recipient_email, recipient_name,
                                             vendor_name, item_name):
        """
        Send email notification to buyer when TD approves their vendor selection.
        Only sent when the buyer recipient is OFFLINE (no real-time notification available).

        Args:
            cr_id: Change request / Purchase order ID
            project_name: Name of the project
            td_name: Name of the Technical Director who approved
            recipient_email: Buyer's email address
            recipient_name: Buyer's full name
            vendor_name: Approved vendor name
            item_name: Item / materials description

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            subject = f"✅ Vendor Approved — Proceed with Purchase - CR-{cr_id} | {project_name}"

            email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 26px; margin: 12px 0 0 0; font-weight: 600;">Vendor Approved</h1>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                    Dear <strong style="color: #1e293b;">{recipient_name}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 22px 0;">
                    <strong style="color: #1e293b;">{td_name}</strong> (Technical Director) has
                    <strong style="color: #059669;">approved</strong> your vendor selection for
                    <strong style="color: #1e293b;">CR-{cr_id}</strong>.
                    You can now proceed with the purchase.
                </p>

                <!-- Details Card -->
                <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px; width: 40%;">CR Reference:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">CR-{cr_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Project:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Item / Request:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{item_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Approved Vendor:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{vendor_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Approved By:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{td_name} (Technical Director)</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Status:</td>
                            <td style="padding: 5px 0; font-size: 13px;">
                                <span style="background: #10b981; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">Vendor Approved</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- CTA -->
                <div style="text-align: center; margin: 25px 0;">
                    <a href="{FRONTEND_URL}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 13px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                        Proceed with Purchase →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 10px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 2px 0;">{td_name}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 2px 0;">Technical Director</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #94a3b8; font-size: 11px; margin: 0;">This is an automated notification. Please do not reply to this email.</p>
                <p style="color: #475569; font-size: 11px; margin: 6px 0 0 0;">© 2026 MeterSquare. All rights reserved.</p>
            </div>
        </div>
            """

            return self.send_email(recipient_email, subject, wrap_email_content(email_body))

        except Exception as e:
            log.error(f"Error sending TD vendor approval notification email: {e}")
            return False

    def send_td_vendor_rejection_notification(self, cr_id, project_name, td_name,
                                              recipient_email, recipient_name,
                                              vendor_name, item_name, rejection_reason):
        """
        Send email notification to buyer when TD rejects their vendor selection.
        Only sent when the buyer recipient is OFFLINE (no real-time notification available).

        Args:
            cr_id: Change request / Purchase order ID
            project_name: Name of the project
            td_name: Name of the Technical Director who rejected
            recipient_email: Buyer's email address
            recipient_name: Buyer's full name
            vendor_name: Rejected vendor name
            item_name: Item / materials description
            rejection_reason: Reason provided by TD for rejection

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            subject = f"❌ Vendor Selection Rejected — Action Required - CR-{cr_id} | {project_name}"

            email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 26px; margin: 12px 0 0 0; font-weight: 600;">Vendor Selection Rejected</h1>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                    Dear <strong style="color: #1e293b;">{recipient_name}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 22px 0;">
                    <strong style="color: #1e293b;">{td_name}</strong> (Technical Director) has
                    <strong style="color: #ef4444;">rejected</strong> your vendor selection for
                    <strong style="color: #1e293b;">CR-{cr_id}</strong>.
                    Please review the reason below and select a new vendor.
                </p>

                <!-- Details Card -->
                <div style="background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%); border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px; width: 40%;">CR Reference:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">CR-{cr_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Project:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Item / Request:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{item_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Rejected Vendor:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{vendor_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Rejected By:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{td_name} (Technical Director)</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Status:</td>
                            <td style="padding: 5px 0; font-size: 13px;">
                                <span style="background: #ef4444; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">Vendor Rejected</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Rejection Reason Box -->
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px 18px; margin-bottom: 22px;">
                    <p style="color: #991b1b; font-size: 13px; font-weight: 700; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em;">Rejection Reason</p>
                    <p style="color: #7f1d1d; font-size: 14px; line-height: 1.6; margin: 0;">{rejection_reason}</p>
                </div>

                <!-- Next Steps -->
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                    Please log in to MeterSquare and select an alternative vendor for this purchase to continue the procurement process.
                </p>

                <!-- CTA -->
                <div style="text-align: center; margin: 25px 0;">
                    <a href="{FRONTEND_URL}" style="background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); color: white; padding: 13px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                        Select New Vendor →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 10px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 2px 0;">{td_name}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 2px 0;">Technical Director</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #94a3b8; font-size: 11px; margin: 0;">This is an automated notification. Please do not reply to this email.</p>
                <p style="color: #475569; font-size: 11px; margin: 6px 0 0 0;">© 2026 MeterSquare. All rights reserved.</p>
            </div>
        </div>
            """

            return self.send_email(recipient_email, subject, wrap_email_content(email_body))

        except Exception as e:
            log.error(f"Error sending TD vendor rejection notification email: {e}")
            return False

    def generate_boq_approval_email(self, boq_data, project_data, items_summary, comments, estimator_name=None, pm_name=None):
        """
        Generate PROFESSIONAL BOQ approval email for Project Manager

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            comments: Approval comments from Estimator
            estimator_name: Estimator's full name (optional)
            pm_name: Project Manager's full name (optional)

        Returns:
            str: HTML formatted email content
        """
        boq_id = boq_data.get('boq_id', 'N/A')
        boq_name = boq_data.get('boq_name', 'N/A')
        created_by = boq_data.get('created_by', 'System')

        project_name = project_data.get('project_name', 'N/A')
        client = project_data.get('client', 'N/A')
        location = project_data.get('location', 'N/A')
        project_code = project_data.get('project_code', 'N/A')

        total_cost = items_summary.get('total_cost', 0)
        formatted_cost = f"₹{total_cost:,.2f}" if total_cost else "₹0.00"

        # Use actual names or fallback
        estimator_display = estimator_name if estimator_name else "Estimator"
        pm_display = pm_name if pm_name else "Project Manager"

        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Logo Header with Light Blue -->
            <div style="background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <!-- MeterSquare Logo -->
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 28px; margin: 15px 0 5px 0; font-weight: 600;">BOQ Submitted for Approval</h1>
                <p style="color: #dbeafe; font-size: 14px; margin: 0;">Please Review and Approve</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <!-- Greeting -->
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                    Dear <strong style="color: #1e293b;">{pm_display}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                    A Bill of Quantities (BOQ) for project <strong style="color: #1e293b;">{project_name}</strong> has been submitted for your review and approval.
                    Please review the details below and take appropriate action.
                </p>

                <!-- Status Badge -->
                <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-left: 4px solid #22c55e; padding: 16px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <div style="display: flex; align-items: center;">
                        <span style="background: #22c55e; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                            Pending Review
                        </span>
                        <span style="margin-left: 12px; color: #166534; font-size: 13px; font-weight: 500;">
                            Awaiting your approval
                        </span>
                    </div>
                </div>

                <!-- Project Details Card (Combined BOQ + Project Info) -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        🏗️ Project Details
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">Project Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Location:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{location}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">BOQ Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 8px 0; color: #3b82f6; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                    </table>
                </div>

                <!-- Comments Section (if provided) -->
                {f'''
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #3b82f6; padding: 18px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <h3 style="color: #1e40af; font-size: 14px; font-weight: 700; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                        💬 Comments from Estimator
                    </h3>
                    <p style="color: #1e40af; font-size: 14px; line-height: 1.6; margin: 0; font-weight: 500;">
                        {comments}
                    </p>
                </div>
                ''' if comments and comments.strip() else ''}

                <!-- Action Required -->
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #93c5fd; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                    <h3 style="color: #1e40af; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">
                        📝 Next Steps
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #1e40af; font-size: 13px; line-height: 1.8;">
                        <li style="margin-bottom: 6px;">Review the BOQ details and cost estimates</li>
                        <li style="margin-bottom: 6px;">Verify all line items and calculations</li>
                        <li style="margin-bottom: 6px;">Approve or request revisions as needed</li>
                        <li style="margin-bottom: 6px;">Log in to MeterSquare ERP to take action</li>
                    </ul>
                </div>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{FRONTEND_URL}/boq-management" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);">
                        Open MeterSquare ERP →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 8px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 15px; font-weight: 700; margin: 0 0 4px 0;">{estimator_display}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Estimator</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 25px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">
                    MeterSquare ERP
                </p>
                <p style="color: #64748b; font-size: 11px; margin: 0 0 8px 0;">
                    Construction Management System
                </p>
                <p style="color: #94a3b8; font-size: 10px; margin: 0;">
                    This is an automated email notification. Please do not reply to this email.
                </p>
                <p style="color: #475569; font-size: 11px; margin: 8px 0 0 0; font-weight: 500;">
                    © 2025 MeterSquare. All rights reserved.
                </p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def generate_boq_rejection_email(self, boq_data, project_data, items_summary, rejection_reason, estimator_name=None, pm_name=None, approver_role=None):
        """
        Generate PROFESSIONAL BOQ rejection email for Estimator

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            rejection_reason: Reason for rejection from PM/TD
            estimator_name: Estimator's full name (optional)
            pm_name: Project Manager/Technical Director's full name (optional)
            approver_role: Role of approver - "Project Manager" or "Technical Director" (default: "Project Manager")

        Returns:
            str: HTML formatted email content
        """
        boq_id = boq_data.get('boq_id', 'N/A')
        boq_name = boq_data.get('boq_name', 'N/A')
        created_by = boq_data.get('created_by', 'System')

        project_name = project_data.get('project_name', 'N/A')
        client = project_data.get('client', 'N/A')
        location = project_data.get('location', 'N/A')
        project_code = project_data.get('project_code', 'N/A')

        total_cost = items_summary.get('total_cost', 0)
        formatted_cost = f"₹{total_cost:,.2f}" if total_cost else "₹0.00"

        # Use actual names or fallback
        estimator_display = estimator_name if estimator_name else "Estimator"
        pm_display = pm_name if pm_name else "Project Manager"
        role_display = approver_role if approver_role else "Project Manager"

        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Logo Header with Lighter Red -->
            <div style="background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <!-- MeterSquare Logo -->
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 28px; margin: 15px 0 5px 0; font-weight: 600;">BOQ Rejected by {role_display}</h1>
                <p style="color: #fee2e2; font-size: 14px; margin: 0;">Please Review and Resubmit</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <!-- Greeting -->
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                    Dear <strong style="color: #1e293b;">{estimator_display}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                    Your Bill of Quantities (BOQ) for project <strong style="color: #1e293b;">{project_name}</strong> has been reviewed by the {role_display}.
                    Please review the feedback below and make the necessary revisions before resubmitting.
                </p>

                <!-- Project Details Card (Combined BOQ + Project Info) -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        🏗️ Project Details
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">Project Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Location:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{location}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">BOQ Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 8px 0; color: #dc2626; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                    </table>
                </div>

                <!-- Rejection Reason -->
                <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 4px solid #f59e0b; padding: 18px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <h3 style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                        ⚠️ Reason for Revision
                    </h3>
                    <p style="color: #78350f; font-size: 14px; line-height: 1.6; margin: 0; font-weight: 500;">
                        {rejection_reason if rejection_reason and rejection_reason.strip() else 'Please review and revise the BOQ as per Project Manager feedback.'}
                    </p>
                </div>

                <!-- Action Required -->
                <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fca5a5; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                    <h3 style="color: #dc2626; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">
                        📝 Next Steps
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 13px; line-height: 1.8;">
                        <li style="margin-bottom: 6px;">Make necessary revisions to the BOQ items</li>
                        <li style="margin-bottom: 6px;">Update cost estimates and calculations accordingly</li>
                        <li style="margin-bottom: 6px;">Resubmit the revised BOQ for approval</li>
                    </ul>
                </div>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{FRONTEND_URL}/boq-management" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.2);">
                        Open MeterSquare ERP →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 8px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 15px; font-weight: 700; margin: 0 0 4px 0;">{pm_display}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Project Manager</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 25px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">
                    MeterSquare ERP
                </p>
                <p style="color: #64748b; font-size: 11px; margin: 0 0 8px 0;">
                    Construction Management System
                </p>
                <p style="color: #94a3b8; font-size: 10px; margin: 0;">
                    This is an automated email notification. Please do not reply to this email.
                </p>
                <p style="color: #475569; font-size: 11px; margin: 8px 0 0 0; font-weight: 500;">
                    © 2025 MeterSquare. All rights reserved.
                </p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_boq_approval_to_pm(self, boq_data, project_data, items_summary, pm_email, comments=None, estimator_name=None, pm_name=None):
        """
        Send BOQ approval email to Project Manager

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            pm_email: Project Manager's email address
            comments: Optional approval comments
            estimator_name: Estimator's full name (optional)
            pm_name: Project Manager's full name (optional)

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content with names
            email_html = self.generate_boq_approval_email(boq_data, project_data, items_summary, comments, estimator_name, pm_name)

            # Create subject
            boq_name = boq_data.get('boq_name', 'BOQ')
            project_name = project_data.get('project_name', 'Project')
            subject = f"📋 BOQ Submitted for Approval - {boq_name} ({project_name})"

            # Send email
            return self.send_email(pm_email, subject, email_html)

        except Exception as e:
            log.error(f"Error sending BOQ approval to PM: {e}")
            return False

    def send_boq_rejection_to_estimator(self, boq_data, project_data, items_summary, estimator_email, rejection_reason=None, estimator_name=None, pm_name=None, approver_role=None):
        """
        Send BOQ rejection email to Estimator

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            estimator_email: Estimator's email address
            rejection_reason: Reason for rejection
            estimator_name: Estimator's full name (optional)
            pm_name: Project Manager/Technical Director's full name (optional)
            approver_role: Role of approver - "Project Manager" or "Technical Director" (default: "Project Manager")

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content with names and role
            email_html = self.generate_boq_rejection_email(boq_data, project_data, items_summary, rejection_reason, estimator_name, pm_name, approver_role)

            # Create subject
            boq_name = boq_data.get('boq_name', 'BOQ')
            project_name = project_data.get('project_name', 'Project')
            role_label = "TD" if approver_role == "Technical Director" else "PM"
            subject = f"⚠️ BOQ Rejected by {role_label} - {boq_name} ({project_name})"

            # Send email
            return self.send_email(estimator_email, subject, email_html)

        except Exception as e:
            log.error(f"Error sending BOQ rejection to Estimator: {e}")
            return False

    def generate_boq_approval_confirmation_to_estimator(self, boq_data, project_data, items_summary, comments, estimator_name=None, pm_name=None, approver_role=None):
        """
        Generate BOQ APPROVAL CONFIRMATION email for Estimator (PM/TD approved the BOQ)

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            comments: Optional comments from PM/TD
            estimator_name: Estimator's full name (optional)
            pm_name: Project Manager/Technical Director's full name (optional)
            approver_role: Role of approver - "Project Manager" or "Technical Director" (default: "Project Manager")

        Returns:
            str: HTML formatted email content
        """
        boq_id = boq_data.get('boq_id', 'N/A')
        boq_name = boq_data.get('boq_name', 'N/A')

        project_name = project_data.get('project_name', 'N/A')
        client = project_data.get('client', 'N/A')
        location = project_data.get('location', 'N/A')
        project_code = project_data.get('project_code', 'N/A')

        # Use actual names or fallback
        estimator_display = estimator_name if estimator_name else "Estimator"
        pm_display = pm_name if pm_name else "Project Manager"
        role_display = approver_role if approver_role else "Project Manager"

        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Logo Header with Green (Success) -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <!-- MeterSquare Logo -->
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 28px; margin: 15px 0 5px 0; font-weight: 600;">BOQ Approved by {role_display}</h1>
                <p style="color: #d1fae5; font-size: 14px; margin: 0;">Your BOQ has been approved!</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <!-- Greeting -->
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                    Dear <strong style="color: #1e293b;">{estimator_display}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                    Great news! Your Bill of Quantities (BOQ) for project <strong style="color: #1e293b;">{project_name}</strong> has been reviewed and <strong style="color: #059669;">approved</strong> by the {role_display}.
                </p>

                <!-- Success Badge -->
                <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-left: 4px solid #10b981; padding: 16px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <div style="display: flex; align-items: center;">
                        <span style="background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                            ✓ Approved
                        </span>
                        <span style="margin-left: 12px; color: #065f46; font-size: 13px; font-weight: 500;">
                            Ready to proceed to next phase
                        </span>
                    </div>
                </div>

                <!-- Project Details Card (Combined BOQ + Project Info) -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        🏗️ Project Details
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">Project Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Location:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{location}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">BOQ Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 8px 0; color: #10b981; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                    </table>
                </div>

                {f'''
                <!-- PM Comments Section (if provided) -->
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #3b82f6; padding: 18px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <h3 style="color: #1e40af; font-size: 14px; font-weight: 700; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                        💬 Comments
                    </h3>
                    <p style="color: #1e40af; font-size: 14px; line-height: 1.6; margin: 0; font-weight: 500;">
                        {comments}
                    </p>
                </div>
                ''' if comments and comments.strip() else ''}

                <!-- Next Steps -->
                <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #86efac; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                    <h3 style="color: #065f46; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">
                        📝 What's Next
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #065f46; font-size: 13px; line-height: 1.8;">
                        <li style="margin-bottom: 6px;">Your BOQ has been approved and is moving forward</li>
                        <li style="margin-bottom: 6px;">No further action required from your end</li>
                        <li style="margin-bottom: 6px;">You'll be notified of any updates</li>
                    </ul>
                </div>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{FRONTEND_URL}/boq-management" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2);">
                        Open MeterSquare ERP →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 8px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 15px; font-weight: 700; margin: 0 0 4px 0;">{pm_display}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Project Manager</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 25px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">
                    MeterSquare ERP
                </p>
                <p style="color: #64748b; font-size: 11px; margin: 0 0 8px 0;">
                    Construction Management System
                </p>
                <p style="color: #94a3b8; font-size: 10px; margin: 0;">
                    This is an automated email notification. Please do not reply to this email.
                </p>
                <p style="color: #475569; font-size: 11px; margin: 8px 0 0 0; font-weight: 500;">
                    © 2025 MeterSquare. All rights reserved.
                </p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_boq_approval_confirmation_to_estimator(self, boq_data, project_data, items_summary, estimator_email, comments=None, estimator_name=None, pm_name=None, approver_role=None):
        """
        Send BOQ approval confirmation email to Estimator

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            estimator_email: Estimator's email address
            comments: Optional comments from PM/TD
            estimator_name: Estimator's full name (optional)
            pm_name: Project Manager/Technical Director's full name (optional)
            approver_role: Role of approver - "Project Manager" or "Technical Director" (default: "Project Manager")

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content with names and role
            email_html = self.generate_boq_approval_confirmation_to_estimator(boq_data, project_data, items_summary, comments, estimator_name, pm_name, approver_role)

            # Create subject
            boq_name = boq_data.get('boq_name', 'BOQ')
            project_name = project_data.get('project_name', 'Project')
            subject = f"✅ BOQ Approved by PM - {boq_name} ({project_name})"

            # Send email
            return self.send_email(estimator_email, subject, email_html)

        except Exception as e:
            log.error(f"Error sending BOQ approval confirmation to Estimator: {e}")
            return False

    def generate_boq_client_email(self, boq_data, project_data, message, total_value, item_count):
        """
        Generate professional BOQ email for Client

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            message: Custom message from TD
            total_value: Total project value
            item_count: Number of items

        Returns:
            str: HTML formatted email content
        """
        boq_name = boq_data.get('boq_name', 'BOQ')
        project_name = project_data.get('project_name', 'Your Project')
        client = project_data.get('client', 'Valued Client')
        location = project_data.get('location', 'N/A')

        email_body = f"""
        <div class="email-container">
            <!-- Header with Logo -->
            <div class="header" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); text-align: center;">
                <img src="cid:logo" alt="MeterSquare Logo" style="max-width: 200px; height: auto; margin: 0 auto 20px; display: block;">
                <h1>Bill of Quantities</h1>
                <h2>{project_name}</h2>
            </div>

            <!-- Content -->
            <div class="content">
                <p>Dear {client},</p>

                <p>{message}</p>

                <!-- Project Information -->
                <div class="info-box" style="margin: 20px 0;">
                    <p><span class="label">Project Name:</span> <span class="value">{project_name}</span></p>
                    <p><span class="label">Location:</span> <span class="value">{location}</span></p>
                </div>

                <!-- Attachments Info -->
                <div class="alert" style="background-color: #dbeafe; border-left: 4px solid #3b82f6; margin: 20px 0; padding: 12px;">
                    <strong>Attached Documents:</strong>
                    <p style="margin: 5px 0 0 0; color: #1e40af; font-size: 13px;">
                        Please review the attached Excel document for complete project details.
                    </p>
                </div>

                <!-- Action Required -->
                <div class="alert alert-info" style="margin: 20px 0; padding: 12px;">
                    <strong>Next Steps:</strong>
                    <ul style="margin: 8px 0; padding-left: 20px; line-height: 1.6;">
                        <li>Review the attached BOQ documents carefully</li>
                        <li>Verify all items and quantities match your requirements</li>
                        <li>Contact us if you have any questions or need clarifications</li>
                        <li>Provide your approval to proceed with the project</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div class="signature" style="margin-top: 30px;">
                    <p><strong>Best Regards,</strong></p>
                    <p>Technical Director</p>
                    <p>MeterSquare Interiors LLC</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>MeterSquare ERP - Construction Management System</strong></p>
                <p>For any queries, please contact our team.</p>
                <p>© 2025 MeterSquare. All rights reserved.</p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def generate_custom_client_email(self, boq_data, project_data, custom_body):
        """
        Generate custom email for Client using estimator's custom template

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            custom_body: Custom email body text from estimator

        Returns:
            str: HTML formatted email content
        """
        project_name = project_data.get('project_name', 'Your Project')

        # Convert plain text line breaks to HTML breaks and preserve formatting
        formatted_body = custom_body.replace('\n', '<br>')

        email_body = f"""
        <div class="email-container" style="background: #ffffff;">
            <!-- Header with Logo -->
            <div style="background: #ffffff; text-align: center; padding: 25px; border-bottom: 2px solid #e5e7eb;">
                <img src="cid:logo" alt="MeterSquare Logo" style="max-width: 200px; height: auto; margin: 0 auto 20px; display: block;">
            </div>

            <!-- Content -->
            <div class="content" style="padding: 30px; background: #ffffff; color: #000000;">
                <div style="color: #000000; font-size: 14px; line-height: 1.8;">
                    {formatted_body}
                </div>
            </div>

            <!-- Footer -->
            <div class="footer" style="background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 20px; text-align: center;">
                <p style="color: #000000; margin: 5px 0;"><strong>MeterSquare ERP - Construction Management System</strong></p>
                <p style="color: #000000; margin: 5px 0;">For any queries, please contact our team.</p>
                <p style="color: #000000; margin: 5px 0;">© 2025 MeterSquare. All rights reserved.</p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_boq_to_client(self, boq_data, project_data, client_email, message, total_value, item_count, excel_file=None, pdf_file=None, custom_email_body=None):
        """
        Send BOQ to Client with Excel and PDF attachments

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            client_email: Client's email address
            message: Custom message from TD
            total_value: Total project value
            item_count: Number of items
            excel_file: Tuple (filename, file_data) for Excel
            pdf_file: Tuple (filename, file_data) for PDF
            custom_email_body: Optional custom email body text from estimator

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            # If custom_email_body is provided, use it; otherwise use default template
            if custom_email_body:
                email_html = self.generate_custom_client_email(boq_data, project_data, custom_email_body)
            else:
                email_html = self.generate_boq_client_email(boq_data, project_data, message, total_value, item_count)

            # Create subject
            project_name = project_data.get('project_name', 'Project')
            subject = f"BOQ for {project_name} - Review & Approval"

            # Prepare attachments
            attachments = []
            if excel_file:
                filename, file_data = excel_file
                attachments.append((filename, file_data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))

            if pdf_file:
                filename, file_data = pdf_file
                attachments.append((filename, file_data, 'application/pdf'))

            # Send email with attachments
            return self.send_email(client_email, subject, email_html, attachments if attachments else None)

        except Exception as e:
            log.error(f"Error sending BOQ to Client: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def generate_pm_assignment_email(self, pm_name, td_name, projects_data, sender_role=None):
        """
        Generate email for Project Manager assignment notification

        Args:
            pm_name: Project Manager name
            td_name: Sender's name (Technical Director or Estimator)
            projects_data: List of dictionaries containing project information
            sender_role: Sender's actual role (e.g., "Technical Director", "Estimator")

        Returns:
            str: HTML formatted email content
        """
        # Format sender role for display
        if not sender_role:
            sender_role = "Technical Director"  # Default for backward compatibility

        # Convert role to title case for display (e.g., "estimator" -> "Estimator")
        sender_role_display = sender_role.replace('_', ' ').title()
        # Build projects table with clean styling
        projects_table_rows = ""
        for idx, project in enumerate(projects_data, 1):
            project_name = project.get('project_name', 'N/A')
            client = project.get('client', 'N/A')
            location = project.get('location', 'N/A')
            row_bg = '#f9fafb' if idx % 2 == 0 else '#ffffff'
            projects_table_rows += f"""
                <tr style="background: {row_bg};">
                    <td style="padding: 10px 12px; color: #64748b; font-size: 13px; border-bottom: 1px solid #e2e8f0;">{idx}</td>
                    <td style="padding: 10px 12px; color: #1e293b; font-size: 13px; font-weight: 600; border-bottom: 1px solid #e2e8f0;">{project_name}</td>
                    <td style="padding: 10px 12px; color: #475569; font-size: 13px; border-bottom: 1px solid #e2e8f0;">{client}</td>
                    <td style="padding: 10px 12px; color: #475569; font-size: 13px; border-bottom: 1px solid #e2e8f0;">{location}</td>
                </tr>
            """

        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 26px; margin: 12px 0 5px 0; font-weight: 600;">Project Assignment</h1>
                <p style="color: #bfdbfe; font-size: 14px; margin: 0;">You have been assigned as Project Manager</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                    Dear <strong style="color: #1e293b;">{pm_name}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                    You have been assigned as <strong style="color: #1e293b;">Project Manager</strong> for the following project(s) by <strong style="color: #1e293b;">{td_name}</strong> ({sender_role_display}). Please review the project details and begin planning for execution.
                </p>

                <!-- Assignment Badge -->
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 8px; margin-bottom: 25px;">
                    <span style="background: #3b82f6; color: white; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                        ✓ Assigned — {len(projects_data)} Project(s)
                    </span>
                </div>

                <!-- Assigned Projects Table -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 20px;">
                    <div style="padding: 14px 16px; border-bottom: 1px solid #e2e8f0;">
                        <h3 style="color: #1e293b; font-size: 15px; font-weight: 600; margin: 0;">🏗️ Assigned Projects</h3>
                    </div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f1f5f9;">
                                <th style="padding: 10px 12px; color: #64748b; font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid #e2e8f0;">#</th>
                                <th style="padding: 10px 12px; color: #64748b; font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid #e2e8f0;">Project Name</th>
                                <th style="padding: 10px 12px; color: #64748b; font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid #e2e8f0;">Client</th>
                                <th style="padding: 10px 12px; color: #64748b; font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid #e2e8f0;">Location</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projects_table_rows}
                        </tbody>
                    </table>
                </div>

                <!-- Responsibilities -->
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #93c5fd; border-radius: 10px; padding: 18px 20px; margin-bottom: 25px;">
                    <h3 style="color: #1e40af; font-size: 14px; font-weight: 700; margin: 0 0 10px 0;">📋 Your Responsibilities</h3>
                    <ul style="margin: 0; padding-left: 18px; color: #1e40af; font-size: 13px; line-height: 1.9;">
                        <li>Review the BOQ and project requirements</li>
                        <li>Assign Site Engineers to the project(s)</li>
                        <li>Create project timeline and milestones</li>
                        <li>Coordinate with procurement team for materials</li>
                        <li>Monitor project progress and update reports</li>
                    </ul>
                </div>

                <!-- CTA Button -->
                <div style="text-align: center; margin: 28px 0;">
                    <a href="{FRONTEND_URL}" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 13px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.2);">
                        Open MeterSquare ERP →
                    </a>
                </div>

                <!-- Signature -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 10px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 700; margin: 0 0 2px 0;">{td_name}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 2px 0;">{sender_role_display}</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 22px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #94a3b8; font-size: 11px; margin: 0;">This is an automated email notification. Please do not reply to this email.</p>
                <p style="color: #475569; font-size: 11px; margin: 6px 0 0 0;">© 2025 MeterSquare. All rights reserved.</p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_pm_assignment_notification(self, pm_email, pm_name, td_name, projects_data, sender_role=None):
        """
        Send Project Manager assignment notification email

        Args:
            pm_email: Project Manager's email address
            pm_name: Project Manager's name
            td_name: Sender's name (Technical Director or Estimator)
            projects_data: List of project dictionaries with details
            sender_role: Sender's actual role (e.g., "Technical Director", "Estimator")

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            email_html = self.generate_pm_assignment_email(pm_name, td_name, projects_data, sender_role)

            # Create subject
            project_count = len(projects_data)
            project_names = ", ".join([p.get('project_name', 'Project') for p in projects_data[:2]])
            if project_count > 2:
                project_names += f" and {project_count - 2} more"

            subject = f"🎯 Project Assignment - You are now PM for {project_names}"

            # Send email
            success = self.send_email(pm_email, subject, email_html)

            if success:
                log.info(f"PM assignment email sent successfully to {pm_email}")
            else:
                log.error(f"Failed to send PM assignment email to {pm_email}")

            return success

        except Exception as e:
            log.error(f"Error sending PM assignment email: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_pm_assignment_notification_async(self, pm_email, pm_name, td_name, projects_data, sender_role=None):
        """
        Send Project Manager assignment notification email asynchronously (non-blocking)
        ✅ PERFORMANCE FIX: Non-blocking email sending (15s → 0.1s response time)

        Args:
            pm_email: Project Manager's email address
            pm_name: Project Manager's name
            td_name: Sender's name (Technical Director or Estimator)
            projects_data: List of project dictionaries with details
            sender_role: Sender's actual role (e.g., "Technical Director", "Estimator")

        Returns:
            bool: True if email queued successfully (doesn't wait for send)
        """
        try:
            # Generate email content
            email_html = self.generate_pm_assignment_email(pm_name, td_name, projects_data, sender_role)

            # Create subject
            project_count = len(projects_data)
            project_names = ", ".join([p.get('project_name', 'Project') for p in projects_data[:2]])
            if project_count > 2:
                project_names += f" and {project_count - 2} more"

            subject = f"🎯 Project Assignment - You are now PM for {project_names}"

            # Send email asynchronously (non-blocking)
            success = self.send_email_async(pm_email, subject, email_html)

            if success:
                log.info(f"PM assignment email queued for async sending to {pm_email}")
            else:
                log.error(f"Failed to queue PM assignment email to {pm_email}")

            return success

        except Exception as e:
            log.error(f"Error queuing PM assignment email: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def generate_se_assignment_email(self, se_name, pm_name, projects_data):
        """
        Generate email for Site Engineer assignment notification

        Args:
            se_name: Site Engineer name
            pm_name: Project Manager name
            projects_data: List of dictionaries containing project information

        Returns:
            str: HTML formatted email content
        """
        # Build projects table
        projects_table_rows = ""
        for idx, project in enumerate(projects_data, 1):
            project_name = project.get('project_name', 'N/A')
            client = project.get('client', 'N/A')
            location = project.get('location', 'N/A')
            status = project.get('status', 'Active')

            projects_table_rows += f"""
                <tr>
                    <td>{idx}</td>
                    <td><strong>{project_name}</strong></td>
                    <td>{client}</td>
                    <td>{location}</td>
                    <td><span class="status-badge status-approved">{status}</span></td>
                </tr>
            """

        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Logo Header with Lighter Red -->
            <div style="background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <!-- MeterSquare Logo -->
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 28px; margin: 15px 0 5px 0; font-weight: 600;">BOQ Rejected by Project Manager</h1>
                <p style="color: #fee2e2; font-size: 14px; margin: 0;">Please Review and Resubmit</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <!-- Greeting -->
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                    Dear <strong style="color: #1e293b;">{estimator_display}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                    Your Bill of Quantities (BOQ) for project <strong style="color: #1e293b;">{project_name}</strong> has been reviewed by the Project Manager.
                    Please review the feedback below and make the necessary revisions before resubmitting.
                </p>

                <!-- BOQ Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        📋 BOQ Information
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">BOQ ID:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">#{boq_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">BOQ Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 8px 0; color: #dc2626; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                    </table>
                </div>

                <!-- Project Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        🏗️ Project Details
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">Project Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Location:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{location}</td>
                        </tr>
                    </table>
                </div>

                <!-- Rejection Reason -->
                <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 4px solid #f59e0b; padding: 18px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <h3 style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                        ⚠️ Reason for Revision
                    </h3>
                    <p style="color: #78350f; font-size: 14px; line-height: 1.6; margin: 0; font-weight: 500;">
                        {rejection_reason if rejection_reason and rejection_reason.strip() else 'Please review and revise the BOQ as per Project Manager feedback.'}
                    </p>
                </div>

                <!-- Action Required -->
                <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fca5a5; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                    <h3 style="color: #dc2626; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">
                        📝 Next Steps
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 13px; line-height: 1.8;">
                        <li style="margin-bottom: 6px;">Make necessary revisions to the BOQ items</li>
                        <li style="margin-bottom: 6px;">Update cost estimates and calculations accordingly</li>
                        <li style="margin-bottom: 6px;">Resubmit the revised BOQ for approval</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div style="border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 8px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 15px; font-weight: 700; margin: 0 0 4px 0;">{pm_display}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Project Manager</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 25px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">
                    MeterSquare ERP
                </p>
                <p style="color: #64748b; font-size: 11px; margin: 0 0 8px 0;">
                    Construction Management System
                </p>
                <p style="color: #94a3b8; font-size: 10px; margin: 0;">
                    This is an automated email notification. Please do not reply to this email.
                </p>
                <p style="color: #475569; font-size: 11px; margin: 8px 0 0 0; font-weight: 500;">
                    © 2025 MeterSquare. All rights reserved.
                </p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_se_assignment_notification(self, se_email, se_name, pm_name, projects_data):
        """
        Send Site Engineer assignment notification email

        Args:
            se_email: Site Engineer's email address
            se_name: Site Engineer's name
            pm_name: Project Manager's name
            projects_data: List of project dictionaries with details

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            email_html = self.generate_se_assignment_email(se_name, pm_name, projects_data)

            # Create subject
            project_count = len(projects_data)
            project_names = ", ".join([p.get('project_name', 'Project') for p in projects_data[:2]])
            if project_count > 2:
                project_names += f" and {project_count - 2} more"

            subject = f"🏗️ Site Assignment - You are now Site Engineer for {project_names}"

            # Send email
            success = self.send_email(se_email, subject, email_html)

            if success:
                log.info(f"SE assignment email sent successfully to {se_email}")
            else:
                log.error(f"Failed to send SE assignment email to {se_email}")

            return success

        except Exception as e:
            log.error(f"Error sending SE assignment email: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def generate_new_purchase_notification_email(self, estimator_name, pm_name, boq_data, project_data, new_items_data):
        """
        Generate email for new purchase notification to Estimator

        Args:
            estimator_name: Estimator name
            pm_name: Project Manager name
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            new_items_data: List of newly added items with details

        Returns:
            str: HTML formatted email content
        """
        boq_id = boq_data.get('boq_id', 'N/A')
        boq_name = boq_data.get('boq_name', 'N/A')
        project_name = project_data.get('project_name', 'N/A')
        client = project_data.get('client', 'N/A')
        location = project_data.get('location', 'N/A')

        # Build items table
        items_table_rows = ""
        total_value_added = 0

        for idx, item in enumerate(new_items_data, 1):
            item_name = item.get('item_name', 'N/A')
            selling_price = item.get('selling_price', 0)
            materials_count = len(item.get('materials', []))
            labour_count = len(item.get('labour', []))
            total_value_added += selling_price

            items_table_rows += f"""
                <tr>
                    <td>{idx}</td>
                    <td><strong>{item_name}</strong></td>
                    <td>{materials_count}</td>
                    <td>{labour_count}</td>
                    <td><strong>AED {selling_price:,.2f}</strong></td>
                </tr>
            """

        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Logo Header with Lighter Red -->
            <div style="background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <!-- MeterSquare Logo -->
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 28px; margin: 15px 0 5px 0; font-weight: 600;">BOQ Rejected by Project Manager</h1>
                <p style="color: #fee2e2; font-size: 14px; margin: 0;">Please Review and Resubmit</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <!-- Greeting -->
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                    Dear <strong style="color: #1e293b;">{estimator_display}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                    Your Bill of Quantities (BOQ) for project <strong style="color: #1e293b;">{project_name}</strong> has been reviewed by the Project Manager.
                    Please review the feedback below and make the necessary revisions before resubmitting.
                </p>

                <!-- BOQ Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        📋 BOQ Information
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">BOQ ID:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">#{boq_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">BOQ Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 8px 0; color: #dc2626; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                    </table>
                </div>

                <!-- Project Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        🏗️ Project Details
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">Project Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Location:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{location}</td>
                        </tr>
                    </table>
                </div>

                <!-- Rejection Reason -->
                <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 4px solid #f59e0b; padding: 18px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <h3 style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                        ⚠️ Reason for Revision
                    </h3>
                    <p style="color: #78350f; font-size: 14px; line-height: 1.6; margin: 0; font-weight: 500;">
                        {rejection_reason if rejection_reason and rejection_reason.strip() else 'Please review and revise the BOQ as per Project Manager feedback.'}
                    </p>
                </div>

                <!-- Action Required -->
                <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fca5a5; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                    <h3 style="color: #dc2626; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">
                        📝 Next Steps
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 13px; line-height: 1.8;">
                        <li style="margin-bottom: 6px;">Make necessary revisions to the BOQ items</li>
                        <li style="margin-bottom: 6px;">Update cost estimates and calculations accordingly</li>
                        <li style="margin-bottom: 6px;">Resubmit the revised BOQ for approval</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div style="border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 8px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 15px; font-weight: 700; margin: 0 0 4px 0;">{pm_display}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Project Manager</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 25px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">
                    MeterSquare ERP
                </p>
                <p style="color: #64748b; font-size: 11px; margin: 0 0 8px 0;">
                    Construction Management System
                </p>
                <p style="color: #94a3b8; font-size: 10px; margin: 0;">
                    This is an automated email notification. Please do not reply to this email.
                </p>
                <p style="color: #475569; font-size: 11px; margin: 8px 0 0 0; font-weight: 500;">
                    © 2025 MeterSquare. All rights reserved.
                </p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_new_purchase_notification(self, estimator_email, estimator_name, pm_name, boq_data, project_data, new_items_data):
        """
        Send new purchase notification email to Estimator

        Args:
            estimator_email: Estimator's email address
            estimator_name: Estimator's name
            pm_name: Project Manager's name
            boq_data: Dictionary with BOQ information
            project_data: Dictionary with project information
            new_items_data: List of newly added items

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            email_html = self.generate_new_purchase_notification_email(
                estimator_name, pm_name, boq_data, project_data, new_items_data
            )

            # Create subject
            project_name = project_data.get('project_name', 'Project')
            items_count = len(new_items_data)
            subject = f"🛒 New Purchase Added - {items_count} item(s) added to {project_name}"

            # Send email
            success = self.send_email(estimator_email, subject, email_html)

            if success:
                log.info(f"New purchase notification email sent successfully to {estimator_email}")
            else:
                log.error(f"Failed to send new purchase notification email to {estimator_email}")

            return success

        except Exception as e:
            log.error(f"Error sending new purchase notification email: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def generate_new_purchase_approval_email(self, recipient_name, recipient_role, estimator_name, boq_data, project_data, new_items_data, total_amount):
        """
        Generate email for new purchase approval notification to PM or TD

        Args:
            recipient_name: PM or TD name
            recipient_role: 'project_manager' or 'technical_director'
            estimator_name: Estimator name who approved
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            new_items_data: List of approved items
            total_amount: Total amount of approved purchases

        Returns:
            str: HTML formatted email content
        """
        boq_id = boq_data.get('boq_id', 'N/A')
        boq_name = boq_data.get('boq_name', 'N/A')
        project_name = project_data.get('project_name', 'N/A')
        client = project_data.get('client', 'N/A')

        role_display = "Project Manager" if recipient_role == "project_manager" else "Technical Director"

        # Build items table
        items_table_rows = ""
        for idx, item in enumerate(new_items_data, 1):
            item_name = item.get('item_name', 'N/A')
            selling_price = item.get('selling_price', 0)
            materials_count = len(item.get('materials', []))
            labour_count = len(item.get('labour', []))

            items_table_rows += f"""
                <tr>
                    <td>{idx}</td>
                    <td><strong>{item_name}</strong></td>
                    <td>{materials_count}</td>
                    <td>{labour_count}</td>
                    <td><strong>AED {selling_price:,.2f}</strong></td>
                </tr>
            """

        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Logo Header with Lighter Red -->
            <div style="background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <!-- MeterSquare Logo -->
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 28px; margin: 15px 0 5px 0; font-weight: 600;">BOQ Rejected by Project Manager</h1>
                <p style="color: #fee2e2; font-size: 14px; margin: 0;">Please Review and Resubmit</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <!-- Greeting -->
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                    Dear <strong style="color: #1e293b;">{estimator_display}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                    Your Bill of Quantities (BOQ) for project <strong style="color: #1e293b;">{project_name}</strong> has been reviewed by the Project Manager.
                    Please review the feedback below and make the necessary revisions before resubmitting.
                </p>

                <!-- BOQ Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        📋 BOQ Information
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">BOQ ID:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">#{boq_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">BOQ Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 8px 0; color: #dc2626; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                    </table>
                </div>

                <!-- Project Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        🏗️ Project Details
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">Project Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Location:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{location}</td>
                        </tr>
                    </table>
                </div>

                <!-- Rejection Reason -->
                <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 4px solid #f59e0b; padding: 18px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <h3 style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                        ⚠️ Reason for Revision
                    </h3>
                    <p style="color: #78350f; font-size: 14px; line-height: 1.6; margin: 0; font-weight: 500;">
                        {rejection_reason if rejection_reason and rejection_reason.strip() else 'Please review and revise the BOQ as per Project Manager feedback.'}
                    </p>
                </div>

                <!-- Action Required -->
                <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fca5a5; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                    <h3 style="color: #dc2626; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">
                        📝 Next Steps
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 13px; line-height: 1.8;">
                        <li style="margin-bottom: 6px;">Make necessary revisions to the BOQ items</li>
                        <li style="margin-bottom: 6px;">Update cost estimates and calculations accordingly</li>
                        <li style="margin-bottom: 6px;">Resubmit the revised BOQ for approval</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div style="border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 8px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 15px; font-weight: 700; margin: 0 0 4px 0;">{pm_display}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Project Manager</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 25px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">
                    MeterSquare ERP
                </p>
                <p style="color: #64748b; font-size: 11px; margin: 0 0 8px 0;">
                    Construction Management System
                </p>
                <p style="color: #94a3b8; font-size: 10px; margin: 0;">
                    This is an automated email notification. Please do not reply to this email.
                </p>
                <p style="color: #475569; font-size: 11px; margin: 8px 0 0 0; font-weight: 500;">
                    © 2025 MeterSquare. All rights reserved.
                </p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def generate_new_purchase_rejection_email(self, recipient_name, recipient_role, estimator_name, boq_data, project_data, new_items_data, rejection_reason, total_amount):
        """
        Generate email for new purchase rejection notification to PM or TD

        Args:
            recipient_name: PM or TD name
            recipient_role: 'project_manager' or 'technical_director'
            estimator_name: Estimator name who rejected
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            new_items_data: List of rejected items
            rejection_reason: Reason for rejection
            total_amount: Total amount of rejected purchases

        Returns:
            str: HTML formatted email content
        """
        boq_id = boq_data.get('boq_id', 'N/A')
        boq_name = boq_data.get('boq_name', 'N/A')
        project_name = project_data.get('project_name', 'N/A')
        client = project_data.get('client', 'N/A')

        role_display = "Project Manager" if recipient_role == "project_manager" else "Technical Director"

        # Build items table
        items_table_rows = ""
        for idx, item in enumerate(new_items_data, 1):
            item_name = item.get('item_name', 'N/A')
            selling_price = item.get('selling_price', 0)
            materials_count = len(item.get('materials', []))
            labour_count = len(item.get('labour', []))

            items_table_rows += f"""
                <tr>
                    <td>{idx}</td>
                    <td><strong>{item_name}</strong></td>
                    <td>{materials_count}</td>
                    <td>{labour_count}</td>
                    <td><strong>AED {selling_price:,.2f}</strong></td>
                </tr>
            """

        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Logo Header with Lighter Red -->
            <div style="background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <!-- MeterSquare Logo -->
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 28px; margin: 15px 0 5px 0; font-weight: 600;">BOQ Rejected by Project Manager</h1>
                <p style="color: #fee2e2; font-size: 14px; margin: 0;">Please Review and Resubmit</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <!-- Greeting -->
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                    Dear <strong style="color: #1e293b;">{estimator_display}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                    Your Bill of Quantities (BOQ) for project <strong style="color: #1e293b;">{project_name}</strong> has been reviewed by the Project Manager.
                    Please review the feedback below and make the necessary revisions before resubmitting.
                </p>

                <!-- BOQ Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        📋 BOQ Information
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">BOQ ID:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">#{boq_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">BOQ Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 8px 0; color: #dc2626; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                    </table>
                </div>

                <!-- Project Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        🏗️ Project Details
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">Project Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Location:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{location}</td>
                        </tr>
                    </table>
                </div>

                <!-- Rejection Reason -->
                <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 4px solid #f59e0b; padding: 18px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <h3 style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                        ⚠️ Reason for Revision
                    </h3>
                    <p style="color: #78350f; font-size: 14px; line-height: 1.6; margin: 0; font-weight: 500;">
                        {rejection_reason if rejection_reason and rejection_reason.strip() else 'Please review and revise the BOQ as per Project Manager feedback.'}
                    </p>
                </div>

                <!-- Action Required -->
                <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fca5a5; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                    <h3 style="color: #dc2626; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">
                        📝 Next Steps
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 13px; line-height: 1.8;">
                        <li style="margin-bottom: 6px;">Make necessary revisions to the BOQ items</li>
                        <li style="margin-bottom: 6px;">Update cost estimates and calculations accordingly</li>
                        <li style="margin-bottom: 6px;">Resubmit the revised BOQ for approval</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div style="border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 8px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 15px; font-weight: 700; margin: 0 0 4px 0;">{pm_display}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Project Manager</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 25px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">
                    MeterSquare ERP
                </p>
                <p style="color: #64748b; font-size: 11px; margin: 0 0 8px 0;">
                    Construction Management System
                </p>
                <p style="color: #94a3b8; font-size: 10px; margin: 0;">
                    This is an automated email notification. Please do not reply to this email.
                </p>
                <p style="color: #475569; font-size: 11px; margin: 8px 0 0 0; font-weight: 500;">
                    © 2025 MeterSquare. All rights reserved.
                </p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_new_purchase_approval(self, recipient_email, recipient_name, recipient_role, estimator_name, boq_data, project_data, new_items_data, total_amount):
        """
        Send new purchase approval email to PM or TD

        Args:
            recipient_email: PM or TD email address
            recipient_name: PM or TD name
            recipient_role: 'project_manager' or 'technical_director'
            estimator_name: Estimator's name
            boq_data: Dictionary with BOQ information
            project_data: Dictionary with project information
            new_items_data: List of approved items
            total_amount: Total approved amount

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            email_html = self.generate_new_purchase_approval_email(
                recipient_name, recipient_role, estimator_name, boq_data, project_data, new_items_data, total_amount
            )

            # Create subject
            project_name = project_data.get('project_name', 'Project')
            items_count = len(new_items_data)
            subject = f"✓ New Purchase Approved - {items_count} item(s) for {project_name}"

            # Send email
            success = self.send_email(recipient_email, subject, email_html)

            if success:
                log.info(f"New purchase approval email sent successfully to {recipient_email}")
            else:
                log.error(f"Failed to send new purchase approval email to {recipient_email}")

            return success

        except Exception as e:
            log.error(f"Error sending new purchase approval email: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_new_purchase_rejection(self, recipient_email, recipient_name, recipient_role, estimator_name, boq_data, project_data, new_items_data, rejection_reason, total_amount):
        """
        Send new purchase rejection email to PM or TD

        Args:
            recipient_email: PM or TD email address
            recipient_name: PM or TD name
            recipient_role: 'project_manager' or 'technical_director'
            estimator_name: Estimator's name
            boq_data: Dictionary with BOQ information
            project_data: Dictionary with project information
            new_items_data: List of rejected items
            rejection_reason: Reason for rejection
            total_amount: Total rejected amount

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            email_html = self.generate_new_purchase_rejection_email(
                recipient_name, recipient_role, estimator_name, boq_data, project_data, new_items_data, rejection_reason, total_amount
            )

            # Create subject
            project_name = project_data.get('project_name', 'Project')
            items_count = len(new_items_data)
            subject = f"⚠ New Purchase Rejected - {items_count} item(s) for {project_name}"

            # Send email
            success = self.send_email(recipient_email, subject, email_html)

            if success:
                log.info(f"New purchase rejection email sent successfully to {recipient_email}")
            else:
                log.error(f"Failed to send new purchase rejection email to {recipient_email}")

            return success

        except Exception as e:
            log.error(f"Error sending new purchase rejection email: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def generate_buyer_assignment_email(self, buyer_name, pm_name, projects_data):
        """
        Generate email for Buyer assignment notification

        Args:
            buyer_name: Buyer name
            pm_name: Project Manager name
            projects_data: List of dictionaries containing project information

        Returns:
            str: HTML formatted email content
        """
        # Build projects table
        projects_table_rows = ""
        for idx, project in enumerate(projects_data, 1):
            project_name = project.get('project_name', 'N/A')
            client = project.get('client', 'N/A')
            location = project.get('location', 'N/A')
            status = project.get('status', 'Active')

            projects_table_rows += f"""
                <tr>
                    <td>{idx}</td>
                    <td><strong>{project_name}</strong></td>
                    <td>{client}</td>
                    <td>{location}</td>
                    <td><span class="status-badge status-approved">{status}</span></td>
                </tr>
            """

        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Logo Header with Lighter Red -->
            <div style="background: linear-gradient(135deg, #f87171 0%, #ef4444 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <!-- MeterSquare Logo -->
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 28px; margin: 15px 0 5px 0; font-weight: 600;">BOQ Rejected by Project Manager</h1>
                <p style="color: #fee2e2; font-size: 14px; margin: 0;">Please Review and Resubmit</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <!-- Greeting -->
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                    Dear <strong style="color: #1e293b;">{estimator_display}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 25px 0;">
                    Your Bill of Quantities (BOQ) for project <strong style="color: #1e293b;">{project_name}</strong> has been reviewed by the Project Manager.
                    Please review the feedback below and make the necessary revisions before resubmitting.
                </p>

                <!-- BOQ Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        📋 BOQ Information
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">BOQ ID:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">#{boq_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">BOQ Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{boq_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Project Code:</td>
                            <td style="padding: 8px 0; color: #dc2626; font-size: 13px; font-weight: 600;">{project_code}</td>
                        </tr>
                    </table>
                </div>

                <!-- Project Details Card -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
                    <h3 style="color: #1e293b; font-size: 16px; font-weight: 600; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        🏗️ Project Details
                    </h3>

                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 35%;">Project Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Location:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{location}</td>
                        </tr>
                    </table>
                </div>

                <!-- Rejection Reason -->
                <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 4px solid #f59e0b; padding: 18px 20px; border-radius: 8px; margin-bottom: 25px;">
                    <h3 style="color: #92400e; font-size: 14px; font-weight: 700; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                        ⚠️ Reason for Revision
                    </h3>
                    <p style="color: #78350f; font-size: 14px; line-height: 1.6; margin: 0; font-weight: 500;">
                        {rejection_reason if rejection_reason and rejection_reason.strip() else 'Please review and revise the BOQ as per Project Manager feedback.'}
                    </p>
                </div>

                <!-- Action Required -->
                <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fca5a5; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                    <h3 style="color: #dc2626; font-size: 15px; font-weight: 700; margin: 0 0 12px 0;">
                        📝 Next Steps
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 13px; line-height: 1.8;">
                        <li style="margin-bottom: 6px;">Make necessary revisions to the BOQ items</li>
                        <li style="margin-bottom: 6px;">Update cost estimates and calculations accordingly</li>
                        <li style="margin-bottom: 6px;">Resubmit the revised BOQ for approval</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div style="border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 8px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 15px; font-weight: 700; margin: 0 0 4px 0;">{pm_display}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0;">Project Manager</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 25px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">
                    MeterSquare ERP
                </p>
                <p style="color: #64748b; font-size: 11px; margin: 0 0 8px 0;">
                    Construction Management System
                </p>
                <p style="color: #94a3b8; font-size: 10px; margin: 0;">
                    This is an automated email notification. Please do not reply to this email.
                </p>
                <p style="color: #475569; font-size: 11px; margin: 8px 0 0 0; font-weight: 500;">
                    © 2025 MeterSquare. All rights reserved.
                </p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_buyer_assignment_notification(self, buyer_email, buyer_name, pm_name, projects_data):
        """
        Send Buyer assignment notification email

        Args:
            buyer_email: Buyer's email address
            buyer_name: Buyer's name
            pm_name: Project Manager's name
            projects_data: List of project dictionaries with details

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            email_html = self.generate_buyer_assignment_email(buyer_name, pm_name, projects_data)

            # Create subject
            project_count = len(projects_data)
            project_names = ", ".join([p.get('project_name', 'Project') for p in projects_data[:2]])
            if project_count > 2:
                project_names += f" and {project_count - 2} more"

            subject = f"🛒 Procurement Assignment - You are now Buyer for {project_names}"

            # Send email
            success = self.send_email(buyer_email, subject, email_html)

            if success:
                log.info(f"Buyer assignment email sent successfully to {buyer_email}")
            else:
                log.error(f"Failed to send Buyer assignment email to {buyer_email}")

            return success

        except Exception as e:
            log.error(f"Error sending Buyer assignment email: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_estimator_assignment_notification(self, to_email, to_name, from_name, projects_data):
        subject = f"New BOQ Assigned for Estimation"
        body = f"""
        Dear {to_name},

        You have been assigned a BOQ for estimation by {from_name}.

        Project Details:
        {projects_data}

        Please log in to the system to proceed.

        Regards,
        BOQ Management System
        """
        return self.send_email(to_email, subject, body)

    def generate_vendor_purchase_order_email(self, vendor_data, purchase_data, buyer_data, project_data):
        """
        Generate professional purchase order email for Vendor

        Args:
            vendor_data: Dictionary containing vendor information
            purchase_data: Dictionary containing purchase order details
            buyer_data: Dictionary containing buyer contact information
            project_data: Dictionary containing project information

        Returns:
            str: HTML formatted email content
        """
        vendor_name = vendor_data.get('company_name', 'Valued Vendor')
        vendor_contact = vendor_data.get('contact_person_name', '')

        cr_id = purchase_data.get('cr_id', 'N/A')
        project_name = project_data.get('project_name', 'N/A')
        client = project_data.get('client', 'N/A')
        location = project_data.get('location', 'N/A')

        buyer_name = buyer_data.get('buyer_name', 'Procurement Team')
        buyer_email = buyer_data.get('buyer_email', 'N/A')
        buyer_phone = buyer_data.get('buyer_phone', 'N/A')

        materials = purchase_data.get('materials', [])
        total_cost = purchase_data.get('total_cost') or 0

        # Use CID reference for logo (attached in send_email method)
        logo_src = "cid:logo"

        # Build materials table
        materials_table_rows = ""
        for idx, material in enumerate(materials, 1):
            material_name = material.get('material_name', 'N/A')
            brand = material.get('brand', '-')
            specification = material.get('specification', '-')
            quantity = material.get('quantity') or 0
            unit = material.get('unit', 'unit')
            supplier_notes = material.get('supplier_notes', '').strip()

            # Alternate row background color
            bg_color = '#f0f9ff' if idx % 2 == 0 else '#ffffff'

            materials_table_rows += f"""
                <tr style="background-color: {bg_color}; border-bottom: 1px solid #3b82f6;">
                    <td style="padding: 12px 10px; color: #000000; font-size: 13px;">{idx}</td>
                    <td style="padding: 12px 10px; color: #000000; font-size: 13px;"><strong>{material_name}</strong></td>
                    <td style="padding: 12px 10px; color: #000000; font-size: 13px;">{brand}</td>
                    <td style="padding: 12px 10px; color: #000000; font-size: 13px;">{specification}</td>
                    <td style="padding: 12px 10px; color: #000000; font-size: 13px;">{quantity} {unit}</td>
                </tr>
            """

            # Add supplier notes sub-row if notes exist
            if supplier_notes:
                materials_table_rows += f"""
                <tr style="background-color: {bg_color};">
                    <td colspan="5" style="padding: 8px 10px 12px 30px; color: #1e40af; font-size: 12px; font-style: italic; border-bottom: 1px solid #3b82f6;">
                        📝 <strong>Note:</strong> {supplier_notes}
                    </td>
                </tr>
                """

        # Format greeting — use contact person if available, else company name
        greeting_name = vendor_contact if vendor_contact else vendor_name

        email_body = f"""
        <div style="max-width: 650px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="margin-bottom: 20px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 240px; height: auto;">
                </div>
                <h1 style="color: #ffffff; font-size: 26px; margin: 12px 0 5px 0; font-weight: 600;">Purchase Order — PO-{cr_id}</h1>
                <p style="color: #bfdbfe; font-size: 14px; margin: 0;">{project_name}</p>
            </div>

            <!-- Main Content -->
            <div style="background: #ffffff; padding: 35px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">

                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                    Dear <strong style="color: #1e293b;">{greeting_name}</strong>,
                </p>

                <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 22px 0;">
                    We are pleased to issue this Purchase Order to <strong style="color: #1e293b;">{vendor_name}</strong>
                    for the project <strong style="color: #1e293b;">{project_name}</strong>.
                    Please review the order details below and arrange delivery accordingly.
                </p>

                <!-- Order Details Card -->
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #1d4ed8; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px; width: 40%;">PO Reference:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">PO-{cr_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Project:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{project_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Client:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Site Location:</td>
                            <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{location}</td>
                        </tr>
                    </table>
                </div>

                <!-- Materials Table -->
                <h3 style="color: #1e293b; font-size: 15px; font-weight: 600; margin: 0 0 12px 0;">Order Items</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #3b82f6; border-radius: 8px; overflow: hidden;">
                    <thead>
                        <tr style="background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%);">
                            <th style="padding: 10px; color: #ffffff; font-size: 12px; text-align: left; font-weight: 600;">#</th>
                            <th style="padding: 10px; color: #ffffff; font-size: 12px; text-align: left; font-weight: 600;">Material</th>
                            <th style="padding: 10px; color: #ffffff; font-size: 12px; text-align: left; font-weight: 600;">Brand</th>
                            <th style="padding: 10px; color: #ffffff; font-size: 12px; text-align: left; font-weight: 600;">Specification</th>
                            <th style="padding: 10px; color: #ffffff; font-size: 12px; text-align: left; font-weight: 600;">Quantity</th>
                        </tr>
                    </thead>
                    <tbody>
                        {materials_table_rows}
                    </tbody>
                </table>

                <!-- Contact -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; margin-bottom: 22px;">
                    <p style="color: #64748b; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">Procurement Contact</p>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 3px 0; color: #64748b; font-size: 13px; width: 30%;">Name:</td>
                            <td style="padding: 3px 0; color: #1e293b; font-size: 13px; font-weight: 600;">{buyer_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 3px 0; color: #64748b; font-size: 13px;">Email:</td>
                            <td style="padding: 3px 0; color: #1e293b; font-size: 13px;">{buyer_email}</td>
                        </tr>
                        <tr>
                            <td style="padding: 3px 0; color: #64748b; font-size: 13px;">Phone:</td>
                            <td style="padding: 3px 0; color: #1e293b; font-size: 13px;">{buyer_phone}</td>
                        </tr>
                    </table>
                </div>

                <!-- Signature -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 10px;">
                    <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Best regards,</p>
                    <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 2px 0;">{buyer_name}</p>
                    <p style="color: #64748b; font-size: 12px; margin: 0 0 2px 0;">Procurement Team</p>
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
                <p style="color: #94a3b8; font-size: 11px; margin: 0;">This is an automated notification. Please do not reply to this email.</p>
                <p style="color: #475569; font-size: 11px; margin: 6px 0 0 0;">© 2026 MeterSquare. All rights reserved.</p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_vendor_purchase_order(self, vendor_email, vendor_data, purchase_data, buyer_data, project_data, custom_email_body=None, attachments=None):
        """
        Send purchase order email to Vendor with embedded logo and attachments

        Args:
            vendor_email: Vendor's email address (string with comma-separated emails or list)
            vendor_data: Dictionary containing vendor information
            purchase_data: Dictionary containing purchase order details
            buyer_data: Dictionary containing buyer contact information
            project_data: Dictionary containing project information
            custom_email_body: Optional custom HTML body for the email (complete HTML document)
            attachments: Optional list of tuples (filename, file_data, mime_type)

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Use custom body if provided, otherwise generate default template
            if custom_email_body:
                # Custom body is already a complete HTML document from frontend
                # Check if it's already wrapped (has <!DOCTYPE or <html> tag)
                if '<!DOCTYPE' in custom_email_body or '<html' in custom_email_body:
                    email_html = custom_email_body
                else:
                    # If not wrapped, wrap it
                    email_html = wrap_email_content(custom_email_body)
            else:
                # Generate email content with embedded logo
                email_html = self.generate_vendor_purchase_order_email(
                    vendor_data, purchase_data, buyer_data, project_data
                )

            # Create subject
            project_name = project_data.get('project_name', 'Project')
            cr_id = purchase_data.get('cr_id', 'N/A')
            subject = f"Purchase Order PO-{cr_id} - {project_name}"

            # Log attachment info if present
            if attachments:
                log.info(f"Sending email with {len(attachments)} attachment(s)")

            # Send email with attachments
            success = self.send_email(vendor_email, subject, email_html, attachments)

            if success:
                return True
            return False

        except Exception as e:
            log.error(f"Failed to send purchase order email: {e}")
            return False

    def send_vendor_purchase_order_async(self, vendor_email, vendor_data, purchase_data, buyer_data, project_data, custom_email_body=None, attachments=None, cc_emails=None):
        """
        Send purchase order email to Vendor asynchronously (non-blocking)
        ✅ PERFORMANCE FIX: Non-blocking email sending (15s → 0.1s response time)

        Args:
            vendor_email: Vendor's email address (string with comma-separated emails or list)
            vendor_data: Dictionary containing vendor information
            purchase_data: Dictionary containing purchase order details
            buyer_data: Dictionary containing buyer contact information
            project_data: Dictionary containing project information
            custom_email_body: Optional custom HTML body for the email
            attachments: Optional list of tuples (filename, file_data, mime_type)
            cc_emails: Optional list of CC email addresses

        Returns:
            bool: True if email queued successfully (doesn't wait for send)
        """
        try:
            # Use custom body if provided, otherwise generate default template
            if custom_email_body:
                if '<!DOCTYPE' in custom_email_body or '<html' in custom_email_body:
                    email_html = custom_email_body
                else:
                    email_html = wrap_email_content(custom_email_body)
            else:
                email_html = self.generate_vendor_purchase_order_email(
                    vendor_data, purchase_data, buyer_data, project_data
                )

            # Create subject
            project_name = project_data.get('project_name', 'Project')
            cr_id = purchase_data.get('cr_id', 'N/A')
            subject = f"Purchase Order PO-{cr_id} - {project_name}"

            # Log attachment info if present
            if attachments:
                log.info(f"Queuing email with {len(attachments)} attachment(s)")

            # Send email asynchronously (non-blocking)
            success = self.send_email_async(vendor_email, subject, email_html, attachments, cc_emails)

            if success:
                log.info(f"Purchase order email queued for async sending to vendor(s)")
                if attachments:
                    log.info(f"Email included {len(attachments)} attachment(s)")
                if cc_emails:
                    log.info(f"Email CC'd to {len(cc_emails)} recipient(s)")
            else:
                log.error(f"Failed to send purchase order email to vendor(s)")

            return success

        except Exception as e:
            log.error(f"Error sending purchase order to vendor: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False