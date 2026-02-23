"""
BOQ Email Service - Professional email templates for Technical Directors
"""
import smtplib
import os
import traceback
from html import escape
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

    def send_email(self, recipient_email, subject, email_html, attachments=None, cc_emails=None):
        """
        Send an email via SMTP.

        Args:
            recipient_email: Email address (string, comma-separated string, or list)
            subject: Email subject
            email_html: HTML email body
            attachments: Optional list of tuples (filename, file_data, mime_type)
            cc_emails: Optional list of CC email addresses

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            # Normalize recipient email(s)
            if isinstance(recipient_email, list):
                to_emails = [e.strip() for e in recipient_email if e and e.strip()]
            elif isinstance(recipient_email, str) and ',' in recipient_email:
                to_emails = [e.strip() for e in recipient_email.split(',') if e.strip()]
            else:
                to_emails = [recipient_email]

            # Build MIME structure:
            # multipart/mixed (top — holds attachments as visible files)
            #   ├── multipart/related (HTML body + inline images like logo)
            #   │     ├── multipart/alternative
            #   │     │     └── text/html
            #   │     └── image/png (inline logo)
            #   └── application/pdf (attachment — visible to user)
            message = MIMEMultipart('mixed')
            sender_name = "MeterSquare ERP"
            message["From"] = formataddr((str(Header(sender_name, 'utf-8')), self.sender_email))
            message["To"] = ", ".join(to_emails)
            message["Subject"] = subject
            cc_list = (cc_emails if isinstance(cc_emails, list) else [cc_emails]) if cc_emails else []
            if cc_list:
                message["Cc"] = ", ".join(cc_list)

            # Related part: holds HTML + inline images (logo)
            msg_related = MIMEMultipart('related')

            # Alternative part for HTML body
            msg_alternative = MIMEMultipart('alternative')
            msg_related.attach(msg_alternative)
            msg_alternative.attach(MIMEText(email_html, "html"))

            # Only attach logo if the email HTML actually references it (cid:logo)
            if 'cid:logo' in email_html:
                try:
                    possible_logo_paths = [
                        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logo.png'),
                        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'logo.png'),
                        os.path.join(os.getcwd(), 'logo.png'),
                    ]
                    logo_attached = False
                    for logo_path in possible_logo_paths:
                        if os.path.exists(logo_path):
                            with open(logo_path, 'rb') as f:
                                logo_data = f.read()
                            logo_image = MIMEImage(logo_data, _subtype='png')
                            logo_image.add_header('Content-ID', '<logo>')
                            logo_image.add_header('Content-Disposition', 'inline', filename='logo.png')
                            msg_related.attach(logo_image)
                            logo_attached = True
                            log.info(f"Logo attached from: {logo_path}")
                            break
                    if not logo_attached:
                        log.warning("Logo file not found, sending email without logo")
                except Exception as logo_err:
                    log.error(f"Error attaching logo: {logo_err}")

            # Attach the related part (HTML + logo) to the top-level mixed container
            message.attach(msg_related)

            # Attach additional files (e.g. LPO PDF, Excel) — these show as visible attachments
            if attachments:
                for filename, file_data, mime_type in attachments:
                    main_type, sub_type = mime_type.split('/', 1) if '/' in mime_type else ('application', 'octet-stream')
                    attachment_part = MIMEBase(main_type, sub_type)
                    attachment_part.set_payload(file_data)
                    encoders.encode_base64(attachment_part)
                    attachment_part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                    message.attach(attachment_part)

            # Build full recipient list (To + CC)
            all_recipients = list(to_emails)
            if cc_emails:
                all_recipients += cc_emails if isinstance(cc_emails, list) else [cc_emails]

            # Send via SMTP
            refused = {}
            if self.use_tls:
                with smtplib.SMTP(self.email_host, self.email_port) as server:
                    server.starttls()
                    server.login(self.sender_email, self.sender_password)
                    refused = server.sendmail(self.sender_email, all_recipients, message.as_string())
            else:
                with smtplib.SMTP_SSL(self.email_host, self.email_port) as server:
                    server.login(self.sender_email, self.sender_password)
                    refused = server.sendmail(self.sender_email, all_recipients, message.as_string())

            if refused:
                log.warning(f"SMTP refused recipients: {refused}")

            cc_list_str = ', '.join(cc_list) if cc_emails else ''
            cc_info = f" + CC: {cc_list_str}" if cc_emails else ""
            log.info(f"Email sent successfully to {', '.join(to_emails)}{cc_info} | Envelope: {all_recipients}")
            return True

        except Exception as e:
            log.error(f"Failed to send email to {recipient_email}: {e}")
            import traceback
            log.error(traceback.format_exc())
            return False

    def send_email_async(self, recipient_email, subject, email_html, attachments=None, cc_emails=None):
        """
        Send email asynchronously in a background thread (non-blocking).

        Returns:
            bool: True if the email thread was started successfully
        """
        try:
            import threading
            thread = threading.Thread(
                target=self.send_email,
                args=(recipient_email, subject, email_html, attachments, cc_emails),
                daemon=True
            )
            thread.start()
            log.info(f"Email queued for async sending to {recipient_email}")
            return True
        except Exception as e:
            log.error(f"Failed to start async email thread: {e}")
            return False

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
            specification = material.get('specification', '')
            quantity = material.get('quantity') or material.get('rejected_qty', 0)
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
            <div style="background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%); padding: 30px 30px 35px; text-align: center; border-radius: 12px 12px 0 0;">
                <div style="display: inline-block; background: #ffffff; border-radius: 10px; padding: 8px 18px; margin-bottom: 18px;">
                    <img src="cid:logo" alt="MeterSquare" style="max-width: 180px; height: auto; display: block;">
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

        return wrap_email_content(email_body, show_erp_button=False)

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
                    email_html = wrap_email_content(custom_email_body, show_erp_button=False)
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

    def send_se_items_assigned_notification(self, boq_name, project_name, pm_name, se_email, se_name, items_count, assigned_items):
        """
        Send email to Site Engineer when BOQ items are assigned to them by PM.

        Args:
            boq_name: Name of the BOQ
            project_name: Name of the project
            pm_name: Project Manager's name
            se_email: Site Engineer's email address
            se_name: Site Engineer's name
            items_count: Number of items assigned
            assigned_items: List of dicts with {index, item_code, description}

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            subject = f"BOQ Items Assigned - {project_name} ({items_count} item{'s' if items_count != 1 else ''})"

            email_body = f"""
<div class="email-container">
    <div class="header">
        <h2>BOQ Items Assigned</h2>
    </div>
    <div class="content">
        <p>Dear <strong>{se_name}</strong>,</p>
        <p><strong>{pm_name}</strong> has assigned <strong>{items_count} BOQ item{'s' if items_count != 1 else ''}</strong> to you for the following project:</p>

        <div class="info-box">
            <p><span class="label">Project:</span> <span class="value">{project_name}</span></p>
        </div>

        <p>Please log in to MeterSquare ERP to review your assigned BOQ items and begin site work.</p>

        <div class="signature">
            Regards,<br>
            <strong>{pm_name}</strong><br>
            MeterSquare ERP
        </div>
    </div>
</div>"""

            email_html = wrap_email_content(email_body)
            success = self.send_email(se_email, subject, email_html)
            if success:
                log.info(f"[send_se_items_assigned_notification] Email sent to {se_email} for {items_count} item(s)")
            else:
                log.error(f"[send_se_items_assigned_notification] Failed to send email to {se_email}")
            return success

        except Exception as e:
            log.error(f"[send_se_items_assigned_notification] Error: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_cr_review_notification(self, cr_id, project_name, project_code, item_name,
                                     sender_name, sender_role, recipient_email, recipient_name,
                                     recipient_role, context=None):
        """
        Send purchase/change request notification email to the next reviewer.

        Contexts:
            None      - SS/SE sent CR to PM for review
            'forwarded' - PM/MEP forwarded CR to Estimator or next role
            'purchase'  - Estimator approved, CR routed to Buyer for purchase

        Args:
            cr_id: Change request ID
            project_name: Project name
            project_code: Project code
            item_name: BOQ item name or CR reference
            sender_name: Name of the person who sent/routed
            sender_role: Role of the sender
            recipient_email: Recipient email address
            recipient_name: Recipient's full name
            recipient_role: Recipient's role
            context: Optional string ('forwarded', 'purchase', or None)

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            # --- Determine subject and action text based on context ---
            if context == 'purchase':
                subject = f"Purchase Request Assigned - {project_name} (CR #{cr_id})"
                heading = "Purchase Request Assigned"
                action_line = f"A purchase request has been approved and assigned to you by <strong>{sender_name}</strong>."
                action_label = "Action Required"
                action_text = "Please review the purchase request and proceed with procurement."
            elif context == 'forwarded':
                subject = f"Change Request Forwarded - {project_name} (CR #{cr_id})"
                heading = "Change Request Forwarded"
                action_line = f"A change request has been forwarded to you by <strong>{sender_name}</strong> for review."
                action_label = "Action Required"
                action_text = "Please review the change request and take the appropriate action."
            else:
                # Default: SS/SE → PM
                subject = f"New Purchase Request - {project_name} (CR #{cr_id})"
                heading = "New Purchase Request"
                action_line = f"<strong>{sender_name}</strong> has submitted a purchase request for your review."
                action_label = "Action Required"
                action_text = "Please review the request and approve or reject it."

            email_body = f"""
<div class="email-container">
    <div class="header">
        <h2>{heading}</h2>
    </div>
    <div class="content">
        <p>Dear <strong>{recipient_name}</strong>,</p>
        <p>{action_line}</p>

        <div class="info-box">
            <p><span class="label">Project:</span> <span class="value">{project_name}</span></p>
            <p><span class="label">CR Reference:</span> <span class="value">CR #{cr_id}</span></p>
        </div>

        <div class="alert alert-info">
            <strong>{action_label}:</strong> {action_text}
        </div>

        <p>Please log in to MeterSquare ERP to view and action this request.</p>

        <div class="signature">
            Regards,<br>
            <strong>{sender_name}</strong><br>
            MeterSquare ERP
        </div>
    </div>
</div>"""

            email_html = wrap_email_content(email_body)
            success = self.send_email(recipient_email, subject, email_html)
            if success:
                log.info(f"[send_cr_review_notification] Email sent to {recipient_email} for CR #{cr_id} (context={context})")
            else:
                log.error(f"[send_cr_review_notification] Failed to send email to {recipient_email}")
            return success

        except Exception as e:
            log.error(f"[send_cr_review_notification] Error: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_cr_rejection_notification(self, cr_id, project_name, item_name,
                                        rejection_reason, rejected_by_name, rejected_by_role,
                                        recipient_email, recipient_name):
        """
        Send purchase request rejection email to the CR creator (SS/SE).

        Args:
            cr_id: Change request ID
            project_name: Project name
            item_name: BOQ item name or CR reference
            rejection_reason: Reason provided by the rejector
            rejected_by_name: Name of the person who rejected
            rejected_by_role: Role of the rejector
            recipient_email: Creator's email address
            recipient_name: Creator's full name

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            subject = f"Purchase Request Rejected - {project_name} (CR #{cr_id})"

            email_body = f"""
<div class="email-container">
    <div class="header">
        <h2>Purchase Request Rejected</h2>
    </div>
    <div class="content">
        <p>Dear <strong>{recipient_name}</strong>,</p>
        <p>Your purchase request has been <strong>rejected</strong> by <strong>{rejected_by_name}</strong>.</p>

        <div class="info-box">
            <p><span class="label">Project:</span> <span class="value">{project_name}</span></p>
            <p><span class="label">CR Reference:</span> <span class="value">CR #{cr_id}</span></p>
        </div>

        <div class="alert alert-info">
            <strong>Rejection Reason:</strong> {rejection_reason}
        </div>

        <p>Please log in to MeterSquare ERP to review the rejection and resubmit if needed.</p>

        <div class="signature">
            Regards,<br>
            <strong>{rejected_by_name}</strong><br>
            MeterSquare ERP
        </div>
    </div>
</div>"""

            email_html = wrap_email_content(email_body)
            success = self.send_email(recipient_email, subject, email_html)
            if success:
                log.info(f"[send_cr_rejection_notification] Email sent to {recipient_email} for CR #{cr_id}")
            else:
                log.error(f"[send_cr_rejection_notification] Failed to send email to {recipient_email}")
            return success

        except Exception as e:
            log.error(f"[send_cr_rejection_notification] Error: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_cr_approved_notification(self, cr_id, project_name, project_code, item_name,
                                      approver_name, approver_role, recipient_email, recipient_name):
        """
        Send CR final approval email to the CR creator.

        Args:
            cr_id: Change request ID
            project_name: Project name
            project_code: Project code
            item_name: BOQ item name or CR reference
            approver_name: Name of the approver (TD)
            approver_role: Role of the approver
            recipient_email: CR creator's email address
            recipient_name: CR creator's full name

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            subject = f"Purchase Request Approved - {escape(project_name)} (CR #{cr_id})"

            email_body = f"""
<div class="email-container">
    <div class="header">
        <h2>Purchase Request Approved</h2>
    </div>
    <div class="content">
        <p>Dear <strong>{escape(recipient_name)}</strong>,</p>
        <p>Your purchase request has been <strong>approved</strong> by <strong>{escape(approver_name)}</strong>.</p>

        <div class="info-box">
            <p><span class="label">Project:</span> <span class="value">{escape(project_name)}</span></p>
            <p><span class="label">Project Code:</span> <span class="value">{escape(project_code)}</span></p>
            <p><span class="label">CR Reference:</span> <span class="value">CR #{cr_id}</span></p>
            <p><span class="label">Item:</span> <span class="value">{escape(item_name)}</span></p>
        </div>

        <div class="alert alert-info">
            <strong>Status:</strong> Your request has been approved and is now proceeding to the next stage.
        </div>

        <p>Please log in to MeterSquare ERP to view the updated status.</p>

        <div class="signature">
            Regards,<br>
            <strong>{escape(approver_name)}</strong><br>
            MeterSquare ERP
        </div>
    </div>
</div>"""

            email_html = wrap_email_content(email_body)
            success = self.send_email(recipient_email, subject, email_html)
            if success:
                log.info(f"[send_cr_approved_notification] Email sent to {recipient_email} for CR #{cr_id}")
            else:
                log.error(f"[send_cr_approved_notification] Failed to send email to {recipient_email}")
            return success

        except Exception as e:
            log.error(f"[send_cr_approved_notification] Error: {e}")
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_boq_buyer_assignment_notification(self, buyer_email, buyer_name, se_name,
                                                boq_name, project_name):
        """
        Send email to Buyer when Site Engineer assigns a BOQ for purchasing.

        Args:
            buyer_email: Buyer's email address
            buyer_name: Buyer's full name
            se_name: Site Engineer's name who assigned
            boq_name: Name of the BOQ
            project_name: Project name

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            subject = f"BOQ Assigned for Purchase - {escape(project_name)}"

            email_body = f"""
<div class="email-container">
    <div class="header">
        <h2>BOQ Assigned for Purchase</h2>
    </div>
    <div class="content">
        <p>Dear <strong>{escape(buyer_name)}</strong>,</p>
        <p><strong>{escape(se_name)}</strong> has assigned a BOQ to you for procurement.</p>

        <div class="info-box">
            <p><span class="label">Project:</span> <span class="value">{escape(project_name)}</span></p>
            <p><span class="label">BOQ:</span> <span class="value">{escape(boq_name)}</span></p>
        </div>

        <div class="alert alert-info">
            <strong>Action Required:</strong> Please log in to review the materials and proceed with purchasing.
        </div>

        <div class="signature">
            Regards,<br>
            <strong>{escape(se_name)}</strong><br>
            MeterSquare ERP
        </div>
    </div>
</div>"""

            email_html = wrap_email_content(email_body)
            success = self.send_email(buyer_email, subject, email_html)
            if success:
                log.info(f"[send_boq_buyer_assignment_notification] Email sent to {buyer_email} for BOQ '{boq_name}'")
            else:
                log.error(f"[send_boq_buyer_assignment_notification] Failed to send email to {buyer_email}")
            return success

        except Exception as e:
            log.error(f"[send_boq_buyer_assignment_notification] Error: {e}")
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_vendor_selection_notification(self, cr_id, project_name, buyer_name, buyer_role,
                                            recipient_email, recipient_name, materials_count,
                                            material_names, vendor_name, all_submitted):
        """
        Send vendor selection notification email to Technical Director when buyer selects vendor(s).

        Args:
            cr_id: Change request ID
            project_name: Project name
            buyer_name: Name of the buyer who selected the vendor
            buyer_role: Role of the buyer
            recipient_email: TD's email address
            recipient_name: TD's full name
            materials_count: Number of materials with vendor selected
            material_names: Comma-separated material names string
            vendor_name: Primary selected vendor name
            all_submitted: True if all materials have vendor selected (ready for approval)

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            if all_submitted:
                subject = f"Vendor Selected - {project_name} (CR #{cr_id})"
                heading = "Vendor Selected"
                status_line = f"<strong>{buyer_name}</strong> has completed vendor selection for all materials in this purchase order. It is now ready for your approval."
                action_text = "Please review the vendor selections and approve or reject the purchase order."
            else:
                subject = f"Vendor Selected - {project_name} (CR #{cr_id})"
                heading = "Vendor Selected"
                status_line = f"<strong>{buyer_name}</strong> has selected vendor(s) for <strong>{materials_count}</strong> material(s) in this purchase order."
                action_text = "Please review the vendor selections when all materials have been submitted."

            email_body = f"""
<div class="email-container">
    <div class="header">
        <h2>{heading}</h2>
    </div>
    <div class="content">
        <p>Dear <strong>{recipient_name}</strong>,</p>
        <p>{status_line}</p>

        <div class="info-box">
            <p><span class="label">Project:</span> <span class="value">{project_name}</span></p>
            <p><span class="label">CR Reference:</span> <span class="value">CR #{cr_id}</span></p>
        </div>

        <div class="alert alert-info">
            <strong>Action Required:</strong> {action_text}
        </div>

        <p>Please log in to MeterSquare ERP to review and approve the vendor selection.</p>

        <div class="signature">
            Regards,<br>
            <strong>{buyer_name}</strong><br>
            MeterSquare ERP
        </div>
    </div>
</div>"""

            email_html = wrap_email_content(email_body)
            success = self.send_email(recipient_email, subject, email_html)
            if success:
                log.info(f"[send_vendor_selection_notification] Email sent to {recipient_email} for CR #{cr_id}")
            else:
                log.error(f"[send_vendor_selection_notification] Failed to send email to {recipient_email}")
            return success

        except Exception as e:
            log.error(f"[send_vendor_selection_notification] Error: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_td_vendor_rejection_notification(self, cr_id, project_name, td_name,
                                               recipient_email, recipient_name,
                                               vendor_name, item_name, rejection_reason):
        """
        Send vendor rejection email to Buyer when TD rejects vendor selection.

        Args:
            cr_id: Change request ID
            project_name: Project name
            td_name: Technical Director's name
            recipient_email: Buyer's email address
            recipient_name: Buyer's full name
            vendor_name: The vendor that was rejected
            item_name: BOQ item or materials request name
            rejection_reason: Reason provided by TD

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            subject = f"Vendor Selection Rejected - {project_name} (CR #{cr_id})"

            email_body = f"""
<div class="email-container">
    <div class="header">
        <h2>Vendor Selection Rejected</h2>
    </div>
    <div class="content">
        <p>Dear <strong>{recipient_name}</strong>,</p>
        <p><strong>{td_name}</strong> has rejected the vendor selection for the following purchase order. Please select a new vendor and resubmit.</p>

        <div class="info-box">
            <p><span class="label">Project:</span> <span class="value">{project_name}</span></p>
            <p><span class="label">CR Reference:</span> <span class="value">CR #{cr_id}</span></p>
        </div>

        <div class="alert alert-info">
            <strong>Rejection Reason:</strong> {rejection_reason}
        </div>

        <p>Please log in to MeterSquare ERP to select a new vendor and resubmit for approval.</p>

        <div class="signature">
            Regards,<br>
            <strong>{td_name}</strong><br>
            MeterSquare ERP
        </div>
    </div>
</div>"""

            email_html = wrap_email_content(email_body)
            success = self.send_email(recipient_email, subject, email_html)
            if success:
                log.info(f"[send_td_vendor_rejection_notification] Email sent to {recipient_email} for CR #{cr_id}")
            else:
                log.error(f"[send_td_vendor_rejection_notification] Failed to send email to {recipient_email}")
            return success

        except Exception as e:
            log.error(f"[send_td_vendor_rejection_notification] Error: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False

    def send_td_vendor_approval_notification(self, cr_id, project_name, td_name,
                                              recipient_email, recipient_name,
                                              vendor_name, item_name):
        """
        Send vendor approval email to Buyer when TD approves vendor selection.

        Args:
            cr_id: Change request ID
            project_name: Project name
            td_name: Technical Director's name
            recipient_email: Buyer's email address
            recipient_name: Buyer's full name
            vendor_name: The approved vendor name
            item_name: BOQ item or materials request name

        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            subject = f"Vendor Selection Approved - {project_name} (CR #{cr_id})"

            email_body = f"""
<div class="email-container">
    <div class="header">
        <h2>Vendor Selection Approved</h2>
    </div>
    <div class="content">
        <p>Dear <strong>{recipient_name}</strong>,</p>
        <p><strong>{td_name}</strong> has approved the vendor selection for the following purchase order. You may now proceed with the purchase.</p>

        <div class="info-box">
            <p><span class="label">Project:</span> <span class="value">{project_name}</span></p>
            <p><span class="label">CR Reference:</span> <span class="value">CR #{cr_id}</span></p>
        </div>

        <div class="alert alert-success">
            <strong>Approved:</strong> Please proceed with completing the purchase on MeterSquare ERP.
        </div>

        <div class="signature">
            Regards,<br>
            <strong>{td_name}</strong><br>
            MeterSquare ERP
        </div>
    </div>
</div>"""

            email_html = wrap_email_content(email_body)
            success = self.send_email(recipient_email, subject, email_html)
            if success:
                log.info(f"[send_td_vendor_approval_notification] Email sent to {recipient_email} for CR #{cr_id}")
            else:
                log.error(f"[send_td_vendor_approval_notification] Failed to send email to {recipient_email}")
            return success

        except Exception as e:
            log.error(f"[send_td_vendor_approval_notification] Error: {e}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return False