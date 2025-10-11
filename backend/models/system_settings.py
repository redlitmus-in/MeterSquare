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

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<SystemSettings {self.company_name}>'
