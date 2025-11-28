"""
System Settings Model
Single-row table for system-wide configuration
"""

from config.db import db
from datetime import datetime


class SystemSettings(db.Model):
    __tablename__ = 'system_settings'

    id = db.Column(db.Integer, primary_key=True)  # Always 1 (single row table)

    # General Settings
    company_name = db.Column(db.String(255), nullable=False, default='MeterSquare ERP')
    company_email = db.Column(db.String(255))
    company_phone = db.Column(db.String(50))
    company_address = db.Column(db.Text)
    timezone = db.Column(db.String(100), default='Asia/Dubai')
    currency = db.Column(db.String(10), default='AED')
    date_format = db.Column(db.String(50), default='DD/MM/YYYY')

    # Notification Settings
    email_notifications = db.Column(db.Boolean, default=True)
    sms_notifications = db.Column(db.Boolean, default=False)
    push_notifications = db.Column(db.Boolean, default=True)
    daily_reports = db.Column(db.Boolean, default=True)
    weekly_reports = db.Column(db.Boolean, default=True)

    # Security Settings
    session_timeout = db.Column(db.Integer, default=30)  # minutes
    password_expiry = db.Column(db.Integer, default=90)  # days
    two_factor_auth = db.Column(db.Boolean, default=False)
    ip_whitelist = db.Column(db.Text)  # comma-separated IPs

    # System Settings
    maintenance_mode = db.Column(db.Boolean, default=False)
    debug_mode = db.Column(db.Boolean, default=False)
    auto_backup = db.Column(db.Boolean, default=True)
    backup_frequency = db.Column(db.String(50), default='daily')  # hourly, daily, weekly, monthly
    data_retention = db.Column(db.Integer, default=365)  # days

    # Project Settings
    default_project_duration = db.Column(db.Integer, default=90)  # days
    auto_assign_projects = db.Column(db.Boolean, default=False)
    require_approval = db.Column(db.Boolean, default=True)
    budget_alert_threshold = db.Column(db.Integer, default=80)  # percentage

    # PDF Signature Settings (Admin uploads, Estimator selects to include)
    signature_image = db.Column(db.Text)  # Base64 encoded signature image
    signature_enabled = db.Column(db.Boolean, default=False)  # Whether signature is available

    # LPO PDF Settings - Signatures (for Purchase Orders)
    md_signature_image = db.Column(db.Text)  # Managing Director signature (base64)
    md_name = db.Column(db.String(255), default='Managing Director')
    td_signature_image = db.Column(db.Text)  # Technical Director signature (base64)
    td_name = db.Column(db.String(255), default='Technical Director')
    company_stamp_image = db.Column(db.Text)  # Company stamp/seal image (base64)

    # LPO PDF Settings - Company Info
    company_trn = db.Column(db.String(50))  # Company TRN number
    company_fax = db.Column(db.String(50))  # Company fax number
    default_payment_terms = db.Column(db.Text, default='100% after delivery')
    lpo_header_image = db.Column(db.Text)  # Custom LPO header image (base64)

    # LPO Terms and Conditions (stored as JSON)
    lpo_general_terms = db.Column(db.Text)  # JSON array of general terms
    lpo_payment_terms_list = db.Column(db.Text)  # JSON array of payment terms like "50% Advance"

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<SystemSettings {self.company_name}>'
