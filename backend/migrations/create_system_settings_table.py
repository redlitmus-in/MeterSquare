"""
Migration: Create system_settings table
Run this to create the system settings table
"""

import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.db import db
from models.system_settings import SystemSettings
from app import create_app
from datetime import datetime

def create_system_settings_table():
    """Create system_settings table and initialize with default values"""

    app = create_app()

    with app.app_context():
        try:
            print("Creating system_settings table...")

            # Create table
            db.create_all()

            # Check if settings already exist
            existing_settings = SystemSettings.query.first()

            if existing_settings:
                print("✓ System settings already exist")
                return

            # Create default settings
            default_settings = SystemSettings(
                id=1,  # Single row table
                company_name="MeterSquare ERP",
                company_email="admin@metersquare.com",
                company_phone="+971 50 123 4567",
                company_address="Dubai, United Arab Emirates",
                timezone="Asia/Dubai",
                currency="AED",
                date_format="DD/MM/YYYY",
                email_notifications=True,
                sms_notifications=False,
                push_notifications=True,
                daily_reports=True,
                weekly_reports=True,
                session_timeout=30,
                password_expiry=90,
                two_factor_auth=False,
                ip_whitelist="",
                maintenance_mode=False,
                debug_mode=False,
                auto_backup=True,
                backup_frequency="daily",
                data_retention=365,
                default_project_duration=90,
                auto_assign_projects=False,
                require_approval=True,
                budget_alert_threshold=80,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            db.session.add(default_settings)
            db.session.commit()

            print("✓ System settings table created successfully")
            print("✓ Default settings initialized")

        except Exception as e:
            print(f"✗ Error creating system_settings table: {str(e)}")
            db.session.rollback()
            raise

if __name__ == "__main__":
    create_system_settings_table()
