"""
BOQ Email Service - Professional email templates for Technical Directors
"""
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
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


class BOQEmailService:
    """Service for sending BOQ-related emails to Technical Directors"""

    def __init__(self):
        self.sender_email = SENDER_EMAIL
        self.sender_password = SENDER_EMAIL_PASSWORD
        self.email_host = EMAIL_HOST
        self.email_port = EMAIL_PORT
        self.use_tls = EMAIL_USE_TLS

    def send_email(self, recipient_email, subject, html_content, attachments=None):
        """
        Send email using SMTP

        Args:
            recipient_email: Email address of recipient
            subject: Email subject
            html_content: HTML formatted email content
            attachments: List of tuples (filename, file_data, mime_type)

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Validate email configuration
            if not self.sender_email or not self.sender_password:
                error_msg = "Email configuration missing: SENDER_EMAIL or SENDER_EMAIL_PASSWORD not set in environment"
                raise ValueError(error_msg)
            # Create message
            message = MIMEMultipart('mixed')
            sender_name = "MeterSquare ERP"
            message["From"] = formataddr((str(Header(sender_name, 'utf-8')), self.sender_email))
            message["To"] = recipient_email
            message["Subject"] = subject

            # Attach HTML body
            html_part = MIMEText(html_content, "html", "utf-8")
            message.attach(html_part)

            # Attach files if provided
            if attachments:
                for filename, file_data, mime_type in attachments:
                    part = MIMEBase(*mime_type.split('/'))
                    part.set_payload(file_data)
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                    message.attach(part)
            # Send email
            try:
                if self.use_tls:
                    with smtplib.SMTP(self.email_host, self.email_port, timeout=30) as server:
                        server.starttls()
                        server.login(self.sender_email, self.sender_password)
                        server.sendmail(self.sender_email, recipient_email, message.as_string())
                else:
                    # For SSL (like Gmail on port 465)
                    with smtplib.SMTP_SSL(self.email_host, self.email_port, timeout=30) as server:
                        server.login(self.sender_email, self.sender_password)
                        server.sendmail(self.sender_email, recipient_email, message.as_string())

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

        total_items = items_summary.get('total_items', 0)
        total_materials = items_summary.get('total_materials', 0)
        total_labour = items_summary.get('total_labour', 0)
        total_material_cost = items_summary.get('total_material_cost', 0)
        total_labour_cost = items_summary.get('total_labour_cost', 0)
        total_cost = items_summary.get('total_cost', 0)
        estimated_selling_price = items_summary.get('estimatedSellingPrice', 0)

        # Generate items table
        items = items_summary.get('items', [])
        items_table_rows = ""
        for idx, item in enumerate(items, 1):
            item_name = item.get('item_name', 'N/A')
            base_cost = item.get('base_cost', 0)
            overhead_percentage = item.get('overhead_percentage', 0)
            overhead_amount = item.get('overhead_amount', 0)
            profit_margin_percentage = item.get('profit_margin_percentage', 0)
            profit_margin_amount = item.get('profit_margin_amount', 0)
            selling_price = item.get('selling_price', 0)

            items_table_rows += f"""
                <tr>
                    <td>{idx}</td>
                    <td>{item_name}</td>
                    <td>₹ {base_cost:,.2f}</td>
                    <td>{overhead_percentage}%</td>
                    <td>₹ {overhead_amount:,.2f}</td>
                    <td>{profit_margin_percentage}%</td>
                    <td>₹ {profit_margin_amount:,.2f}</td>
                    <td><strong>₹ {selling_price:,.2f}</strong></td>
                </tr>
            """

        # Build email HTML
        email_body = f"""
        <div class="email-container">
            <!-- Header -->
            <div class="header">
                <h1>BILL OF QUANTITIES (BOQ)</h1>
                <h2>Review Request</h2>
            </div>

            <!-- Content -->
            <div class="content">
                <p>Dear Technical Director,</p>

                <p>
                    A new Bill of Quantities (BOQ) has been prepared and is ready for your review and approval.
                    Please find the detailed cost estimation and breakdown below.
                </p>

                <div class="divider"></div>

                <!-- BOQ Information -->
                <h2>BOQ Information</h2>
                <div class="info-box">
                    <p><span class="label">BOQ ID:</span> <span class="value">#{boq_id}</span></p>
                    <p><span class="label">BOQ Name:</span> <span class="value">{boq_name}</span></p>
                    <p><span class="label">Status:</span> <span class="status-badge status-pending">{status}</span></p>
                    <p><span class="label">Created By:</span> <span class="value">{created_by}</span></p>
                    <p><span class="label">Created Date:</span> <span class="value">{created_at}</span></p>
                </div>

                <!-- Project Information -->
                <h2>Project Details</h2>
                <div class="info-box">
                    <p><span class="label">Project Name:</span> <span class="value">{project_name}</span></p>
                    <p><span class="label">Client:</span> <span class="value">{client}</span></p>
                    <p><span class="label">Location:</span> <span class="value">{location}</span></p>
                </div>

                <!-- Cost Summary -->
                <h2>Cost Summary</h2>
                <div class="info-box">
                    <p><span class="label">Total Items:</span> <span class="value">{total_items}</span></p>
                    <p><span class="label">Total Materials:</span> <span class="value">{total_materials}</span></p>
                    <p><span class="label">Total Labour:</span> <span class="value">{total_labour}</span></p>
                    <p><span class="label">Material Cost:</span> <span class="value">₹ {total_material_cost:,.2f}</span></p>
                    <p><span class="label">Labour Cost:</span> <span class="value">₹ {total_labour_cost:,.2f}</span></p>
                    <p><span class="label">Base Cost:</span> <span class="value">₹ {(total_material_cost + total_labour_cost):,.2f}</span></p>
                </div>

                <div class="total-cost">
                    <span class="label">Estimated Selling Price:</span>
                    <span class="amount">₹ {estimated_selling_price:,.2f}</span>
                </div>

                <!-- Items Breakdown -->
                <h2>Items Breakdown</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Item Name</th>
                                <th>Base Cost</th>
                                <th>Overhead %</th>
                                <th>Overhead Amt</th>
                                <th>Profit %</th>
                                <th>Profit Amt</th>
                                <th>Selling Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items_table_rows}
                        </tbody>
                    </table>
                </div>

                <div class="divider"></div>

                <!-- Action Required -->
                <div class="alert alert-info">
                    <strong>Action Required:</strong> Please review the BOQ details and approve or provide feedback
                    for necessary revisions. Your timely review will help us proceed with the project planning.
                </div>

                <!-- Signature -->
                <div class="signature">
                    <p><strong>Warm Regards,</strong></p>
                    <p>{created_by}</p>
                    <p>MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>MeterSquare ERP - Construction Management System</strong></p>
                <p>This is an automated email notification. Please do not reply to this email.</p>
                <p>© 2025 MeterSquare. All rights reserved.</p>
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

    def generate_boq_approval_email(self, boq_data, project_data, items_summary, comments):
        """
        Generate BOQ approval email for Project Manager

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            comments: Approval comments from TD

        Returns:
            str: HTML formatted email content
        """
        boq_id = boq_data.get('boq_id', 'N/A')
        boq_name = boq_data.get('boq_name', 'N/A')
        created_by = boq_data.get('created_by', 'System')

        project_name = project_data.get('project_name', 'N/A')
        client = project_data.get('client', 'N/A')
        location = project_data.get('location', 'N/A')

        total_cost = items_summary.get('total_cost', 0)
        estimated_selling_price = items_summary.get('estimatedSellingPrice', 0)

        email_body = f"""
        <div class="email-container">
            <!-- Header -->
            <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                <h1>BOQ APPROVED ✓</h1>
                <h2>Ready for Project Execution</h2>
            </div>

            <!-- Content -->
            <div class="content">
                <p>Dear Project Manager,</p>

                <p>
                    Great news! The Bill of Quantities (BOQ) for <strong>{project_name}</strong> has been
                    <span style="color: #10b981; font-weight: bold;">APPROVED</span> by the Technical Director.
                    You can now proceed with project planning and execution.
                </p>

                <div class="divider"></div>

                <!-- BOQ Information -->
                <h2>BOQ Information</h2>
                <div class="info-box">
                    <p><span class="label">BOQ ID:</span> <span class="value">#{boq_id}</span></p>
                    <p><span class="label">BOQ Name:</span> <span class="value">{boq_name}</span></p>
                    <p><span class="label">Status:</span> <span class="status-badge" style="background-color: #d1fae5; color: #065f46; border: 1px solid #10b981;">APPROVED</span></p>
                    <p><span class="label">Prepared By:</span> <span class="value">{created_by}</span></p>
                </div>

                <!-- Project Information -->
                <h2>Project Details</h2>
                <div class="info-box">
                    <p><span class="label">Project Name:</span> <span class="value">{project_name}</span></p>
                    <p><span class="label">Client:</span> <span class="value">{client}</span></p>
                    <p><span class="label">Location:</span> <span class="value">{location}</span></p>
                </div>

                <!-- Cost Summary -->
                <div class="total-cost" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-left: 4px solid #10b981;">
                    <span class="label">Approved Budget:</span>
                    <span class="amount" style="color: #065f46;">₹ {estimated_selling_price:,.2f}</span>
                </div>

                <!-- TD Comments -->
                {f'''
                <h2>Technical Director's Comments</h2>
                <div class="alert" style="background-color: #d1fae5; border-left: 4px solid #10b981;">
                    <p style="color: #065f46; margin: 0;">{comments}</p>
                </div>
                ''' if comments else ''}

                <div class="divider"></div>

                <!-- Next Steps -->
                <div class="alert alert-info">
                    <strong>Next Steps:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Review the approved BOQ in the system</li>
                        <li>Assign Site Engineers to the project</li>
                        <li>Begin procurement planning</li>
                        <li>Set up project timeline and milestones</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div class="signature">
                    <p><strong>Warm Regards,</strong></p>
                    <p>Technical Director</p>
                    <p>MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>MeterSquare ERP - Construction Management System</strong></p>
                <p>This is an automated email notification. Please do not reply to this email.</p>
                <p>© 2025 MeterSquare. All rights reserved.</p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def generate_boq_rejection_email(self, boq_data, project_data, items_summary, rejection_reason):
        """
        Generate BOQ rejection email for Estimator

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            rejection_reason: Reason for rejection from TD

        Returns:
            str: HTML formatted email content
        """
        boq_id = boq_data.get('boq_id', 'N/A')
        boq_name = boq_data.get('boq_name', 'N/A')
        created_by = boq_data.get('created_by', 'System')

        project_name = project_data.get('project_name', 'N/A')
        client = project_data.get('client', 'N/A')
        location = project_data.get('location', 'N/A')

        total_cost = items_summary.get('total_cost', 0)

        email_body = f"""
        <div class="email-container">
            <!-- Header -->
            <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
                <h1>BOQ REVISION REQUIRED</h1>
                <h2>Review & Resubmit</h2>
            </div>

            <!-- Content -->
            <div class="content">
                <p>Dear Estimator,</p>

                <p>
                    The Bill of Quantities (BOQ) for <strong>{project_name}</strong> requires revision.
                    The Technical Director has reviewed the BOQ and has requested changes before approval.
                </p>

                <div class="divider"></div>

                <!-- BOQ Information -->
                <h2>BOQ Information</h2>
                <div class="info-box">
                    <p><span class="label">BOQ ID:</span> <span class="value">#{boq_id}</span></p>
                    <p><span class="label">BOQ Name:</span> <span class="value">{boq_name}</span></p>
                    <p><span class="label">Status:</span> <span class="status-badge" style="background-color: #fee2e2; color: #991b1b; border: 1px solid #ef4444;">REJECTED</span></p>
                    <p><span class="label">Prepared By:</span> <span class="value">{created_by}</span></p>
                </div>

                <!-- Project Information -->
                <h2>Project Details</h2>
                <div class="info-box">
                    <p><span class="label">Project Name:</span> <span class="value">{project_name}</span></p>
                    <p><span class="label">Client:</span> <span class="value">{client}</span></p>
                    <p><span class="label">Location:</span> <span class="value">{location}</span></p>
                </div>

                <!-- Rejection Reason -->
                <h2>Reason for Revision</h2>
                <div class="alert" style="background-color: #fee2e2; border-left: 4px solid #ef4444;">
                    <p style="color: #991b1b; margin: 0; font-weight: 500;">{rejection_reason if rejection_reason else 'Please review and revise the BOQ as per Technical Director feedback.'}</p>
                </div>

                <div class="divider"></div>

                <!-- Action Required -->
                <div class="alert alert-info">
                    <strong>Action Required:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Review the feedback provided above</li>
                        <li>Make necessary revisions to the BOQ</li>
                        <li>Update cost estimates and calculations</li>
                        <li>Resubmit the BOQ for approval</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div class="signature">
                    <p><strong>Warm Regards,</strong></p>
                    <p>Technical Director</p>
                    <p>MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>MeterSquare ERP - Construction Management System</strong></p>
                <p>This is an automated email notification. Please do not reply to this email.</p>
                <p>© 2025 MeterSquare. All rights reserved.</p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_boq_approval_to_pm(self, boq_data, project_data, items_summary, pm_email, comments=None):
        """
        Send BOQ approval email to Project Manager

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            pm_email: Project Manager's email address
            comments: Optional approval comments

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            email_html = self.generate_boq_approval_email(boq_data, project_data, items_summary, comments)

            # Create subject
            boq_name = boq_data.get('boq_name', 'BOQ')
            project_name = project_data.get('project_name', 'Project')
            subject = f"✓ BOQ Approved - {boq_name} ({project_name})"

            # Send email
            return self.send_email(pm_email, subject, email_html)

        except Exception as e:
            log.error(f"Error sending BOQ approval to PM: {e}")
            return False

    def send_boq_rejection_to_estimator(self, boq_data, project_data, items_summary, estimator_email, rejection_reason=None):
        """
        Send BOQ rejection email to Estimator

        Args:
            boq_data: Dictionary containing BOQ information
            project_data: Dictionary containing project information
            items_summary: Dictionary containing items summary
            estimator_email: Estimator's email address
            rejection_reason: Reason for rejection

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            email_html = self.generate_boq_rejection_email(boq_data, project_data, items_summary, rejection_reason)

            # Create subject
            boq_name = boq_data.get('boq_name', 'BOQ')
            project_name = project_data.get('project_name', 'Project')
            subject = f"⚠ BOQ Revision Required - {boq_name} ({project_name})"

            # Send email
            return self.send_email(estimator_email, subject, email_html)

        except Exception as e:
            log.error(f"Error sending BOQ rejection to Estimator: {e}")
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
                <img src="{LOGO_URL}" alt="MeterSquare Logo" style="max-width: 200px; height: auto; margin: 0 auto 20px; display: block;">
                <h1>Bill of Quantities</h1>
                <h2>{project_name}</h2>
            </div>

            <!-- Content -->
            <div class="content">
                <p>Dear {client},</p>

                <p>{message}</p>

                <div class="divider"></div>

                <!-- Project Information -->
                <h2>Project Details</h2>
                <div class="info-box">
                    <p><span class="label">Project Name:</span> <span class="value">{project_name}</span></p>
                    <p><span class="label">Location:</span> <span class="value">{location}</span></p>
                    <p><span class="label">Total Items:</span> <span class="value">{item_count}</span></p>
                </div>

                <!-- Cost Summary -->
                <div class="total-cost" style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-left: 4px solid #3b82f6;">
                    <span class="label">Total Project Value:</span>
                    <span class="amount" style="color: #1e40af;">AED {total_value:,.2f}</span>
                </div>

                <div class="divider"></div>

                <!-- Attachments Info -->
                <div class="alert" style="background-color: #dbeafe; border-left: 4px solid #3b82f6;">
                    <strong>Attached Documents:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>BOQ Excel File (Detailed Breakdown with all materials and labor costs)</li>
                    </ul>
                    <p style="margin: 10px 0 0 0; color: #1e40af; font-size: 14px;">
                        Please review the attached Excel document for complete project details including materials, labor, and pricing breakdown.
                    </p>
                </div>

                <div class="divider"></div>

                <!-- Action Required -->
                <div class="alert alert-info">
                    <strong>Next Steps:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Review the attached BOQ documents carefully</li>
                        <li>Verify all items and quantities match your requirements</li>
                        <li>Contact us if you have any questions or need clarifications</li>
                        <li>Provide your approval to proceed with the project</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div class="signature">
                    <p><strong>Best Regards,</strong></p>
                    <p>Technical Director</p>
                    <p>MeterSquare ERP System</p>
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

    def send_boq_to_client(self, boq_data, project_data, client_email, message, total_value, item_count, excel_file=None, pdf_file=None):
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

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
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

    def generate_pm_assignment_email(self, pm_name, td_name, projects_data):
        """
        Generate email for Project Manager assignment notification

        Args:
            pm_name: Project Manager name
            td_name: Technical Director name
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
        <div class="email-container">
            <!-- Header -->
            <div class="header" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
                <h1>PROJECT ASSIGNMENT</h1>
                <h2>You Have Been Assigned as Project Manager</h2>
            </div>

            <!-- Content -->
            <div class="content">
                <p>Dear <strong>{pm_name}</strong>,</p>

                <p>
                    You have been assigned as the <strong>Project Manager</strong> for the following project(s) by
                    <strong>{td_name}</strong>. Please review the project details and begin planning for execution.
                </p>

                <div class="divider"></div>

                <!-- Assignment Details -->
                <h2>Assignment Details</h2>
                <div class="info-box">
                    <p><span class="label">Assigned By:</span> <span class="value">{td_name}</span></p>
                    <p><span class="label">Role:</span> <span class="value">Technical Director</span></p>
                    <p><span class="label">Total Projects:</span> <span class="value">{len(projects_data)}</span></p>
                    <p><span class="label">Assignment Status:</span> <span class="status-badge status-approved">ACTIVE</span></p>
                </div>

                <!-- Projects Table -->
                <h2>Assigned Projects</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Project Name</th>
                                <th>Client</th>
                                <th>Location</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projects_table_rows}
                        </tbody>
                    </table>
                </div>

                <div class="divider"></div>

                <!-- Next Steps -->
                <div class="alert alert-success">
                    <strong>Your Responsibilities:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Review the BOQ and project requirements</li>
                        <li>Assign Site Engineers to the project(s)</li>
                        <li>Create project timeline and milestones</li>
                        <li>Coordinate with procurement team for materials</li>
                        <li>Monitor project progress and update reports</li>
                        <li>Ensure quality standards and compliance</li>
                    </ul>
                </div>

                <!-- Action Required -->
                <div class="alert alert-info">
                    <strong>Action Required:</strong> Please log in to the MeterSquare ERP system to access
                    detailed project information, BOQ documents, and begin your project planning activities.
                </div>

                <!-- Signature -->
                <div class="signature">
                    <p><strong>Best Regards,</strong></p>
                    <p>{td_name}</p>
                    <p>Technical Director</p>
                    <p>MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>MeterSquare ERP - Construction Management System</strong></p>
                <p>This is an automated email notification. Please do not reply to this email.</p>
                <p>© 2025 MeterSquare. All rights reserved.</p>
            </div>
        </div>
        """

        return wrap_email_content(email_body)

    def send_pm_assignment_notification(self, pm_email, pm_name, td_name, projects_data):
        """
        Send Project Manager assignment notification email

        Args:
            pm_email: Project Manager's email address
            pm_name: Project Manager's name
            td_name: Technical Director's name
            projects_data: List of project dictionaries with details

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Generate email content
            email_html = self.generate_pm_assignment_email(pm_name, td_name, projects_data)

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
        <div class="email-container">
            <!-- Header -->
            <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                <h1>SITE ASSIGNMENT</h1>
                <h2>You Have Been Assigned as Site Engineer</h2>
            </div>

            <!-- Content -->
            <div class="content">
                <p>Dear <strong>{se_name}</strong>,</p>

                <p>
                    You have been assigned as the <strong>Site Engineer</strong> for the following project(s) by
                    <strong>{pm_name}</strong>. Please review the project details and prepare for on-site execution.
                </p>

                <div class="divider"></div>

                <!-- Assignment Details -->
                <h2>Assignment Details</h2>
                <div class="info-box">
                    <p><span class="label">Assigned By:</span> <span class="value">{pm_name}</span></p>
                    <p><span class="label">Role:</span> <span class="value">Project Manager</span></p>
                    <p><span class="label">Total Projects:</span> <span class="value">{len(projects_data)}</span></p>
                    <p><span class="label">Assignment Status:</span> <span class="status-badge" style="background-color: #d1fae5; color: #065f46;">ACTIVE</span></p>
                </div>

                <!-- Projects Table -->
                <h2>Assigned Projects</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Project Name</th>
                                <th>Client</th>
                                <th>Location</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projects_table_rows}
                        </tbody>
                    </table>
                </div>

                <div class="divider"></div>

                <!-- Next Steps -->
                <div class="alert" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-left: 4px solid #10b981;">
                    <strong>Your Responsibilities:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Review project BOQ and technical specifications</li>
                        <li>Coordinate with Project Manager for site requirements</li>
                        <li>Ensure on-site safety protocols are followed</li>
                        <li>Monitor daily progress and workforce management</li>
                        <li>Submit daily progress reports and updates</li>
                        <li>Manage material inventory and quality checks</li>
                        <li>Report any issues or delays immediately</li>
                    </ul>
                </div>

                <!-- Action Required -->
                <div class="alert alert-info">
                    <strong>Action Required:</strong> Please log in to the MeterSquare ERP system to access
                    detailed project information, BOQ documents, and begin your site preparation activities.
                </div>

                <!-- Signature -->
                <div class="signature">
                    <p><strong>Best Regards,</strong></p>
                    <p>{pm_name}</p>
                    <p>Project Manager</p>
                    <p>MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>MeterSquare ERP - Construction Management System</strong></p>
                <p>This is an automated email notification. Please do not reply to this email.</p>
                <p>© 2025 MeterSquare. All rights reserved.</p>
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
                    <td><strong>₹ {selling_price:,.2f}</strong></td>
                </tr>
            """

        email_body = f"""
        <div class="email-container">
            <!-- Header -->
            <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                <h1>NEW PURCHASE ADDED</h1>
                <h2>Additional Items Required for Project</h2>
            </div>

            <!-- Content -->
            <div class="content">
                <p>Dear <strong>{estimator_name}</strong>,</p>

                <p>
                    The Project Manager <strong>{pm_name}</strong> has added new purchase items to the BOQ.
                    These additional items are required for the project execution. Please review the details below.
                </p>

                <div class="divider"></div>

                <!-- BOQ Information -->
                <h2>BOQ Details</h2>
                <div class="info-box">
                    <p><span class="label">BOQ ID:</span> <span class="value">#{boq_id}</span></p>
                    <p><span class="label">BOQ Name:</span> <span class="value">{boq_name}</span></p>
                    <p><span class="label">Project Name:</span> <span class="value">{project_name}</span></p>
                    <p><span class="label">Client:</span> <span class="value">{client}</span></p>
                    <p><span class="label">Location:</span> <span class="value">{location}</span></p>
                </div>

                <!-- Purchase Details -->
                <h2>New Purchase Details</h2>
                <div class="info-box">
                    <p><span class="label">Added By:</span> <span class="value">{pm_name}</span></p>
                    <p><span class="label">Role:</span> <span class="value">Project Manager</span></p>
                    <p><span class="label">Total New Items:</span> <span class="value">{len(new_items_data)}</span></p>
                </div>

                <!-- Items Table -->
                <h2>New Items Added</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Item Name</th>
                                <th>Materials</th>
                                <th>Labour</th>
                                <th>Selling Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items_table_rows}
                        </tbody>
                    </table>
                </div>

                <!-- Total Value -->
                <div class="total-cost">
                    <span class="label">Total Value Added:</span>
                    <span class="amount">₹ {total_value_added:,.2f}</span>
                </div>

                <div class="divider"></div>

                <!-- Action Required -->
                <div class="alert" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b;">
                    <strong>Action Required:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Review the newly added items and their costs</li>
                        <li>Verify material specifications and quantities</li>
                        <li>Confirm labour requirements are accurate</li>
                        <li>Update project budget calculations if needed</li>
                        <li>Coordinate with procurement for material availability</li>
                    </ul>
                </div>

                <!-- Info Note -->
                <div class="alert alert-info">
                    <strong>Note:</strong> These items have been added to meet additional project requirements
                    identified during execution. Please log in to the MeterSquare ERP system to view complete
                    details including material specifications and labour breakdowns.
                </div>

                <!-- Signature -->
                <div class="signature">
                    <p><strong>Best Regards,</strong></p>
                    <p>{pm_name}</p>
                    <p>Project Manager</p>
                    <p>MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>MeterSquare ERP - Construction Management System</strong></p>
                <p>This is an automated email notification. Please do not reply to this email.</p>
                <p>© 2025 MeterSquare. All rights reserved.</p>
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
                    <td><strong>₹ {selling_price:,.2f}</strong></td>
                </tr>
            """

        email_body = f"""
        <div class="email-container">
            <!-- Header -->
            <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                <h1>NEW PURCHASE APPROVED ✓</h1>
                <h2>Ready for Procurement</h2>
            </div>

            <!-- Content -->
            <div class="content">
                <p>Dear <strong>{recipient_name}</strong>,</p>

                <p>
                    Great news! The new purchase items you requested have been <span style="color: #10b981; font-weight: bold;">APPROVED</span>
                    by <strong>{estimator_name}</strong> (Estimator). You can now proceed with procurement and project execution.
                </p>

                <div class="divider"></div>

                <!-- BOQ Information -->
                <h2>BOQ Details</h2>
                <div class="info-box">
                    <p><span class="label">BOQ ID:</span> <span class="value">#{boq_id}</span></p>
                    <p><span class="label">BOQ Name:</span> <span class="value">{boq_name}</span></p>
                    <p><span class="label">Project Name:</span> <span class="value">{project_name}</span></p>
                    <p><span class="label">Client:</span> <span class="value">{client}</span></p>
                    <p><span class="label">Status:</span> <span class="status-badge" style="background-color: #d1fae5; color: #065f46; border: 1px solid #10b981;">APPROVED</span></p>
                </div>

                <!-- Approval Details -->
                <h2>Approval Details</h2>
                <div class="info-box">
                    <p><span class="label">Approved By:</span> <span class="value">{estimator_name}</span></p>
                    <p><span class="label">Role:</span> <span class="value">Estimator</span></p>
                    <p><span class="label">Total Items Approved:</span> <span class="value">{len(new_items_data)}</span></p>
                </div>

                <!-- Items Table -->
                <h2>Approved Items</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Item Name</th>
                                <th>Materials</th>
                                <th>Labour</th>
                                <th>Selling Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items_table_rows}
                        </tbody>
                    </table>
                </div>

                <!-- Total Amount -->
                <div class="total-cost" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-left: 4px solid #10b981;">
                    <span class="label">Total Approved Amount:</span>
                    <span class="amount" style="color: #065f46;">₹ {total_amount:,.2f}</span>
                </div>

                <div class="divider"></div>

                <!-- Next Steps -->
                <div class="alert" style="background-color: #d1fae5; border-left: 4px solid #10b981;">
                    <strong>Next Steps:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Review the approved items in the system</li>
                        <li>Initiate procurement process for materials</li>
                        <li>Coordinate with procurement team</li>
                        <li>Update project timeline if needed</li>
                        <li>Monitor budget allocation</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div class="signature">
                    <p><strong>Best Regards,</strong></p>
                    <p>{estimator_name}</p>
                    <p>Estimator</p>
                    <p>MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>MeterSquare ERP - Construction Management System</strong></p>
                <p>This is an automated email notification. Please do not reply to this email.</p>
                <p>© 2025 MeterSquare. All rights reserved.</p>
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
                    <td><strong>₹ {selling_price:,.2f}</strong></td>
                </tr>
            """

        email_body = f"""
        <div class="email-container">
            <!-- Header -->
            <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
                <h1>NEW PURCHASE REJECTED</h1>
                <h2>Revision Required</h2>
            </div>

            <!-- Content -->
            <div class="content">
                <p>Dear <strong>{recipient_name}</strong>,</p>

                <p>
                    The new purchase items you requested have been <span style="color: #ef4444; font-weight: bold;">REJECTED</span>
                    by <strong>{estimator_name}</strong> (Estimator). Please review the feedback and make necessary revisions.
                </p>

                <div class="divider"></div>

                <!-- BOQ Information -->
                <h2>BOQ Details</h2>
                <div class="info-box">
                    <p><span class="label">BOQ ID:</span> <span class="value">#{boq_id}</span></p>
                    <p><span class="label">BOQ Name:</span> <span class="value">{boq_name}</span></p>
                    <p><span class="label">Project Name:</span> <span class="value">{project_name}</span></p>
                    <p><span class="label">Client:</span> <span class="value">{client}</span></p>
                    <p><span class="label">Status:</span> <span class="status-badge" style="background-color: #fee2e2; color: #991b1b; border: 1px solid #ef4444;">REJECTED</span></p>
                </div>

                <!-- Rejection Details -->
                <h2>Rejection Details</h2>
                <div class="info-box">
                    <p><span class="label">Rejected By:</span> <span class="value">{estimator_name}</span></p>
                    <p><span class="label">Role:</span> <span class="value">Estimator</span></p>
                    <p><span class="label">Total Items Rejected:</span> <span class="value">{len(new_items_data)}</span></p>
                </div>

                <!-- Rejection Reason -->
                <h2>Reason for Rejection</h2>
                <div class="alert" style="background-color: #fee2e2; border-left: 4px solid #ef4444;">
                    <p style="color: #991b1b; margin: 0; font-weight: 500;">{rejection_reason if rejection_reason else 'Please review and revise the purchase items as per Estimator feedback.'}</p>
                </div>

                <!-- Items Table -->
                <h2>Rejected Items</h2>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Item Name</th>
                                <th>Materials</th>
                                <th>Labour</th>
                                <th>Selling Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items_table_rows}
                        </tbody>
                    </table>
                </div>

                <!-- Total Amount -->
                <div class="total-cost" style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-left: 4px solid #ef4444;">
                    <span class="label">Total Rejected Amount:</span>
                    <span class="amount" style="color: #991b1b;">₹ {total_amount:,.2f}</span>
                </div>

                <div class="divider"></div>

                <!-- Action Required -->
                <div class="alert alert-info">
                    <strong>Action Required:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Review the rejection feedback carefully</li>
                        <li>Revise item specifications and costs</li>
                        <li>Consult with Estimator if needed</li>
                        <li>Resubmit the purchase request after revision</li>
                    </ul>
                </div>

                <!-- Signature -->
                <div class="signature">
                    <p><strong>Best Regards,</strong></p>
                    <p>{estimator_name}</p>
                    <p>Estimator</p>
                    <p>MeterSquare ERP System</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>MeterSquare ERP - Construction Management System</strong></p>
                <p>This is an automated email notification. Please do not reply to this email.</p>
                <p>© 2025 MeterSquare. All rights reserved.</p>
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