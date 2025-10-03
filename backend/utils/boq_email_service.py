"""
BOQ Email Service - Professional email templates for Technical Directors
"""
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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

    def send_email(self, recipient_email, subject, html_content):
        """
        Send email using SMTP

        Args:
            recipient_email: Email address of recipient
            subject: Email subject
            html_content: HTML formatted email content

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Validate email configuration
            if not self.sender_email or not self.sender_password:
                error_msg = "Email configuration missing: SENDER_EMAIL or SENDER_EMAIL_PASSWORD not set in environment"
                raise ValueError(error_msg)
            # Create message
            message = MIMEMultipart('alternative')
            sender_name = "MeterSquare ERP"
            message["From"] = formataddr((str(Header(sender_name, 'utf-8')), self.sender_email))
            message["To"] = recipient_email
            message["Subject"] = subject
            # Attach HTML body
            html_part = MIMEText(html_content, "html", "utf-8")
            message.attach(html_part)
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