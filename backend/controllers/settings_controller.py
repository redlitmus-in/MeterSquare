"""
Admin Settings Controller
Handles system-wide settings and configurations
"""

from flask import jsonify, request, g
from models import db
from models.system_settings import SystemSettings
from models.user import User
from utils.authentication import jwt_required
import logging
from datetime import datetime
import base64

log = logging.getLogger(__name__)


@jwt_required
def get_settings():
    """
    Get system settings (admin only)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get settings from database (single row table)
        settings = SystemSettings.query.first()

        # If no settings exist, create default settings
        if not settings:
            settings = SystemSettings(
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
                created_at=datetime.utcnow()
            )
            db.session.add(settings)
            db.session.commit()

        return jsonify({
            "settings": {
                # General
                "companyName": settings.company_name,
                "companyEmail": settings.company_email,
                "companyPhone": settings.company_phone,
                "companyAddress": settings.company_address,
                "timezone": settings.timezone,
                "currency": settings.currency,
                "dateFormat": settings.date_format,

                # Notifications
                "emailNotifications": settings.email_notifications,
                "smsNotifications": settings.sms_notifications,
                "pushNotifications": settings.push_notifications,
                "dailyReports": settings.daily_reports,
                "weeklyReports": settings.weekly_reports,

                # Security
                "sessionTimeout": settings.session_timeout,
                "passwordExpiry": settings.password_expiry,
                "twoFactorAuth": settings.two_factor_auth,
                "ipWhitelist": settings.ip_whitelist or "",

                # System
                "maintenanceMode": settings.maintenance_mode,
                "debugMode": settings.debug_mode,
                "autoBackup": settings.auto_backup,
                "backupFrequency": settings.backup_frequency,
                "dataRetention": settings.data_retention,

                # Projects
                "defaultProjectDuration": settings.default_project_duration,
                "autoAssignProjects": settings.auto_assign_projects,
                "requireApproval": settings.require_approval,
                "budgetAlertThreshold": settings.budget_alert_threshold,

                # Signature Settings
                "signatureImage": settings.signature_image if hasattr(settings, 'signature_image') else None,
                "signatureEnabled": settings.signature_enabled if hasattr(settings, 'signature_enabled') else False,

                # LPO Signature Settings
                "mdSignatureImage": getattr(settings, 'md_signature_image', None),
                "mdName": getattr(settings, 'md_name', 'Managing Director') or 'Managing Director',
                "tdSignatureImage": getattr(settings, 'td_signature_image', None),
                "tdName": getattr(settings, 'td_name', 'Technical Director') or 'Technical Director',
                "companyStampImage": getattr(settings, 'company_stamp_image', None),
                "companyTrn": getattr(settings, 'company_trn', '') or '',
                "companyFax": getattr(settings, 'company_fax', '') or '',
                "defaultPaymentTerms": getattr(settings, 'default_payment_terms', '100% after delivery') or '100% after delivery'
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching settings: {str(e)}")
        return jsonify({"error": f"Failed to fetch settings: {str(e)}"}), 500


@jwt_required
def update_settings():
    """
    Update system settings (admin only)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        data = request.get_json()

        # Get existing settings
        settings = SystemSettings.query.first()

        if not settings:
            return jsonify({"error": "Settings not found. Please initialize settings first."}), 404

        # Update settings (camelCase to snake_case conversion)
        if "companyName" in data:
            settings.company_name = data["companyName"]
        if "companyEmail" in data:
            settings.company_email = data["companyEmail"]
        if "companyPhone" in data:
            settings.company_phone = data["companyPhone"]
        if "companyAddress" in data:
            settings.company_address = data["companyAddress"]
        if "timezone" in data:
            settings.timezone = data["timezone"]
        if "currency" in data:
            settings.currency = data["currency"]
        if "dateFormat" in data:
            settings.date_format = data["dateFormat"]

        # Notifications
        if "emailNotifications" in data:
            settings.email_notifications = data["emailNotifications"]
        if "smsNotifications" in data:
            settings.sms_notifications = data["smsNotifications"]
        if "pushNotifications" in data:
            settings.push_notifications = data["pushNotifications"]
        if "dailyReports" in data:
            settings.daily_reports = data["dailyReports"]
        if "weeklyReports" in data:
            settings.weekly_reports = data["weeklyReports"]

        # Security
        if "sessionTimeout" in data:
            settings.session_timeout = data["sessionTimeout"]
        if "passwordExpiry" in data:
            settings.password_expiry = data["passwordExpiry"]
        if "twoFactorAuth" in data:
            settings.two_factor_auth = data["twoFactorAuth"]
        if "ipWhitelist" in data:
            settings.ip_whitelist = data["ipWhitelist"]

        # System
        if "maintenanceMode" in data:
            settings.maintenance_mode = data["maintenanceMode"]
        if "debugMode" in data:
            settings.debug_mode = data["debugMode"]
        if "autoBackup" in data:
            settings.auto_backup = data["autoBackup"]
        if "backupFrequency" in data:
            settings.backup_frequency = data["backupFrequency"]
        if "dataRetention" in data:
            settings.data_retention = data["dataRetention"]

        # Projects
        if "defaultProjectDuration" in data:
            settings.default_project_duration = data["defaultProjectDuration"]
        if "autoAssignProjects" in data:
            settings.auto_assign_projects = data["autoAssignProjects"]
        if "requireApproval" in data:
            settings.require_approval = data["requireApproval"]
        if "budgetAlertThreshold" in data:
            settings.budget_alert_threshold = data["budgetAlertThreshold"]

        # Signature Settings (for BOQ PDFs)
        if "signatureImage" in data:
            settings.signature_image = data["signatureImage"]
        if "signatureEnabled" in data:
            settings.signature_enabled = data["signatureEnabled"]

        # LPO Signature Settings
        if "mdSignatureImage" in data:
            settings.md_signature_image = data["mdSignatureImage"]
        if "mdName" in data:
            settings.md_name = data["mdName"]
        if "tdSignatureImage" in data:
            settings.td_signature_image = data["tdSignatureImage"]
        if "tdName" in data:
            settings.td_name = data["tdName"]
        if "companyStampImage" in data:
            settings.company_stamp_image = data["companyStampImage"]
        if "companyTrn" in data:
            settings.company_trn = data["companyTrn"]
        if "companyFax" in data:
            settings.company_fax = data["companyFax"]
        if "defaultPaymentTerms" in data:
            settings.default_payment_terms = data["defaultPaymentTerms"]

        settings.updated_at = datetime.utcnow()
        db.session.commit()

        log.info(f"Settings updated by admin user {current_user.get('user_id')}")

        return jsonify({
            "message": "Settings updated successfully",
            "settings": {
                # General
                "companyName": settings.company_name,
                "companyEmail": settings.company_email,
                "companyPhone": settings.company_phone,
                "companyAddress": settings.company_address,
                "timezone": settings.timezone,
                "currency": settings.currency,
                "dateFormat": settings.date_format,

                # Notifications
                "emailNotifications": settings.email_notifications,
                "smsNotifications": settings.sms_notifications,
                "pushNotifications": settings.push_notifications,
                "dailyReports": settings.daily_reports,
                "weeklyReports": settings.weekly_reports,

                # Security
                "sessionTimeout": settings.session_timeout,
                "passwordExpiry": settings.password_expiry,
                "twoFactorAuth": settings.two_factor_auth,
                "ipWhitelist": settings.ip_whitelist or "",

                # System
                "maintenanceMode": settings.maintenance_mode,
                "debugMode": settings.debug_mode,
                "autoBackup": settings.auto_backup,
                "backupFrequency": settings.backup_frequency,
                "dataRetention": settings.data_retention,

                # Projects
                "defaultProjectDuration": settings.default_project_duration,
                "autoAssignProjects": settings.auto_assign_projects,
                "requireApproval": settings.require_approval,
                "budgetAlertThreshold": settings.budget_alert_threshold,

                # Signature Settings
                "signatureImage": settings.signature_image if hasattr(settings, 'signature_image') else None,
                "signatureEnabled": settings.signature_enabled if hasattr(settings, 'signature_enabled') else False,

                # LPO Signature Settings
                "mdSignatureImage": getattr(settings, 'md_signature_image', None),
                "mdName": getattr(settings, 'md_name', 'Managing Director') or 'Managing Director',
                "tdSignatureImage": getattr(settings, 'td_signature_image', None),
                "tdName": getattr(settings, 'td_name', 'Technical Director') or 'Technical Director',
                "companyStampImage": getattr(settings, 'company_stamp_image', None),
                "companyTrn": getattr(settings, 'company_trn', '') or '',
                "companyFax": getattr(settings, 'company_fax', '') or '',
                "defaultPaymentTerms": getattr(settings, 'default_payment_terms', '100% after delivery') or '100% after delivery'
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating settings: {str(e)}")
        return jsonify({"error": f"Failed to update settings: {str(e)}"}), 500


@jwt_required
def upload_signature():
    """
    Upload signature image (admin only)
    Accepts base64 encoded image or file upload
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get settings
        settings = SystemSettings.query.first()
        if not settings:
            return jsonify({"error": "Settings not found. Please initialize settings first."}), 404

        # Check if it's a file upload or JSON with base64
        if request.content_type and 'multipart/form-data' in request.content_type:
            # File upload
            if 'signature' not in request.files:
                return jsonify({"error": "No signature file provided"}), 400

            file = request.files['signature']
            if file.filename == '':
                return jsonify({"error": "No file selected"}), 400

            # Validate file type
            allowed_extensions = {'png', 'jpg', 'jpeg', 'gif'}
            file_ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
            if file_ext not in allowed_extensions:
                return jsonify({"error": f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"}), 400

            # Read and convert to base64
            file_content = file.read()
            base64_image = base64.b64encode(file_content).decode('utf-8')
            mime_type = f"image/{file_ext}" if file_ext != 'jpg' else 'image/jpeg'
            signature_data = f"data:{mime_type};base64,{base64_image}"

        else:
            # JSON with base64 image
            data = request.get_json()
            if not data or 'signatureImage' not in data:
                return jsonify({"error": "No signature image provided"}), 400

            signature_data = data.get('signatureImage')

            # Validate base64 format
            if not signature_data or not signature_data.startswith('data:image/'):
                return jsonify({"error": "Invalid image format. Expected base64 data URL"}), 400

        # Save signature to database
        settings.signature_image = signature_data
        settings.signature_enabled = True  # Auto-enable when uploading
        settings.updated_at = datetime.utcnow()
        db.session.commit()

        log.info(f"Signature uploaded by admin user {current_user.get('user_id')}")

        return jsonify({
            "success": True,
            "message": "Signature uploaded successfully",
            "signatureEnabled": True
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error uploading signature: {str(e)}")
        return jsonify({"error": f"Failed to upload signature: {str(e)}"}), 500


@jwt_required
def delete_signature():
    """
    Delete signature image (admin only)
    """
    try:
        current_user = g.get("user")

        # Verify admin role
        if current_user.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        # Get settings
        settings = SystemSettings.query.first()
        if not settings:
            return jsonify({"error": "Settings not found"}), 404

        # Clear signature
        settings.signature_image = None
        settings.signature_enabled = False
        settings.updated_at = datetime.utcnow()
        db.session.commit()

        log.info(f"Signature deleted by admin user {current_user.get('user_id')}")

        return jsonify({
            "success": True,
            "message": "Signature deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting signature: {str(e)}")
        return jsonify({"error": f"Failed to delete signature: {str(e)}"}), 500


def get_signature_for_pdf():
    """
    Get signature image for PDF generation (internal use)
    Returns the signature image data if enabled, None otherwise
    """
    try:
        settings = SystemSettings.query.first()
        if not settings:
            return None

        if not getattr(settings, 'signature_enabled', False):
            return None

        return getattr(settings, 'signature_image', None)

    except Exception as e:
        log.error(f"Error getting signature for PDF: {str(e)}")
        return None


def get_signatures_for_pdf():
    """
    Get both MD and authorized signature images for PDF generation (internal use)
    Returns dict with md_signature and authorized_signature if enabled, None values otherwise
    """
    try:
        settings = SystemSettings.query.first()
        if not settings:
            return {'md_signature': None, 'authorized_signature': None}

        if not getattr(settings, 'signature_enabled', False):
            return {'md_signature': None, 'authorized_signature': None}

        return {
            'md_signature': getattr(settings, 'md_signature_image', None),
            'authorized_signature': getattr(settings, 'signature_image', None)
        }

    except Exception as e:
        log.error(f"Error getting signatures for PDF: {str(e)}")
        return {'md_signature': None, 'authorized_signature': None}
