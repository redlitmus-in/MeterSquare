"""
Security Configuration for MeterSquare
Environment-based security settings - restrictions ONLY apply in production

Usage:
    from config.security_config import SecurityConfig, is_production

    if is_production():
        # Apply production security rules
"""

import os
from datetime import timedelta


def get_environment():
    """Get current environment from .env"""
    return os.getenv("ENVIRONMENT", "development").lower()


def is_production():
    """Check if running in production environment"""
    return get_environment() == "production"


def is_development():
    """Check if running in development environment"""
    return get_environment() == "development"


class SecurityConfig:
    """
    Security settings that vary by environment

    IMPORTANT: Security restrictions ONLY apply when ENVIRONMENT=production
    In development, all features work without restrictions for easier debugging
    """

    # ============================================
    # Authentication Settings
    # ============================================

    # JWT Token Expiry (in seconds)
    # Development: 24 hours for convenience
    # Production: 30 minutes for security
    JWT_ACCESS_TOKEN_EXPIRES = 1800 if is_production() else 86400  # 30 min vs 24 hours

    # OTP Expiry (in seconds)
    OTP_EXPIRES = 300  # 5 minutes (same for all environments)

    # ============================================
    # Rate Limiting (Production Only)
    # ============================================

    # Enable rate limiting only in production
    RATE_LIMIT_ENABLED = is_production()

    # Login rate limits
    LOGIN_RATE_LIMIT = "5 per minute" if is_production() else "1000 per minute"

    # API rate limits (increased to handle polling, auto-refresh, and multiple users)
    API_RATE_LIMIT_DEFAULT = "1000 per hour" if is_production() else "10000 per hour"

    # Sensitive endpoint rate limits (exports, reports, bulk operations)
    SENSITIVE_RATE_LIMIT = "10 per minute" if is_production() else "1000 per minute"

    # ============================================
    # Account Lockout (Production Only)
    # ============================================

    # Enable account lockout only in production
    ACCOUNT_LOCKOUT_ENABLED = is_production()

    # Max failed login attempts before lockout
    MAX_FAILED_LOGIN_ATTEMPTS = 5

    # Lockout duration
    LOCKOUT_DURATION = timedelta(minutes=30)

    # ============================================
    # Response Filtering (Production Only)
    # ============================================

    # Enable sensitive field filtering only in production
    FILTER_SENSITIVE_FIELDS = is_production()

    # ============================================
    # SECURITY FIELD CLASSIFICATIONS (Single Source of Truth)
    # ============================================

    # LEVEL 1: CRITICAL - Fields that should NEVER be in ANY response
    ALWAYS_HIDDEN_FIELDS = [
        # Authentication & Security
        'password', 'password_hash', 'reset_token', 'api_key', 'secret_key', 'otp',
        # Government/Financial IDs
        'id_number', 'ssn', 'bank_account', 'bank_details',
        # Internal tokens
        'refresh_token', 'session_token', 'auth_token'
    ]

    # LEVEL 2: PII - Sensitive fields visible ONLY to admin or data owner
    USER_SENSITIVE_FIELDS = [
        # Contact info
        'email', 'phone', 'phone_code',
        # Worker sensitive data
        'emergency_contact', 'emergency_phone',
        # Timestamps (less critical but owner/admin only)
        'last_login', 'created_at', 'last_modified_at'
    ]

    # LEVEL 3: Internal Business Data - Fields hidden from vendors
    VENDOR_HIDDEN_FIELDS = [
        'internal_cost', 'profit_margin', 'estimated_cost', 'internal_notes', 'admin_notes',
        'cost_breakdown', 'margin_percentage', 'hourly_rate'
    ]

    # LEVEL 4: Admin-Only Fields - Audit/tracking data
    ADMIN_ONLY_AUDIT_FIELDS = [
        'ip_address', 'user_agent', 'device_type', 'browser', 'os',
        'gst_number', 'fax'
    ]

    # Admin roles that can see all data
    ADMIN_ROLES = ['admin', 'pm', 'td', 'technical_director', 'project_manager']

    # ============================================
    # Error Handling
    # ============================================

    # Show detailed errors only in development
    SHOW_DETAILED_ERRORS = not is_production()

    # ============================================
    # CORS Settings
    # ============================================

    # Production CORS origins (from app.py)
    PRODUCTION_CORS_ORIGINS = [
        "https://msq.kol.tel",
        "http://msq.kol.tel",
        "https://msq.ath.cx",
        "http://msq.ath.cx",
        "https://148.72.174.7",
        "http://148.72.174.7"
    ]

    # Development CORS origins
    DEVELOPMENT_CORS_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173"
    ]

    @classmethod
    def get_cors_origins(cls):
        """Get CORS origins based on environment"""
        if is_production():
            return cls.PRODUCTION_CORS_ORIGINS
        return cls.DEVELOPMENT_CORS_ORIGINS

    # ============================================
    # Security Headers (Production Only)
    # ============================================

    # Enable strict security headers only in production
    STRICT_SECURITY_HEADERS = is_production()

    # ============================================
    # Audit Logging
    # ============================================

    # Log security events in both environments
    LOG_SECURITY_EVENTS = True

    # Log all API requests only in production (for compliance)
    LOG_ALL_REQUESTS = is_production()

    # ============================================
    # Performance Monitoring
    # ============================================

    # Slow request threshold (milliseconds)
    SLOW_REQUEST_THRESHOLD_MS = 500

    # Log slow requests in all environments
    LOG_SLOW_REQUESTS = True

    # ============================================
    # Input Validation
    # ============================================

    # Maximum input lengths
    MAX_STRING_LENGTH = 255
    MAX_TEXT_LENGTH = 5000
    MAX_EMAIL_LENGTH = 255

    # File upload limits
    MAX_FILE_SIZE_MB = 10
    ALLOWED_FILE_EXTENSIONS = {'xlsx', 'xls', 'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'}

    @classmethod
    def get_status(cls):
        """Get current security configuration status"""
        return {
            'environment': get_environment(),
            'is_production': is_production(),
            'rate_limiting_enabled': cls.RATE_LIMIT_ENABLED,
            'account_lockout_enabled': cls.ACCOUNT_LOCKOUT_ENABLED,
            'filter_sensitive_fields': cls.FILTER_SENSITIVE_FIELDS,
            'show_detailed_errors': cls.SHOW_DETAILED_ERRORS,
            'strict_security_headers': cls.STRICT_SECURITY_HEADERS,
            'jwt_token_expires_seconds': cls.JWT_ACCESS_TOKEN_EXPIRES,
            'login_rate_limit': cls.LOGIN_RATE_LIMIT
        }


# Convenience functions for use in other modules
def should_filter_field(field_name):
    """
    Check if a field should always be filtered from responses.

    Note: This checks only ALWAYS_HIDDEN_FIELDS (critical security fields).
    For context-aware filtering (user role, data ownership), use
    filter_response_data() from utils.security which handles all field levels.
    """
    # Always filter critical security fields
    if field_name.lower() in [f.lower() for f in SecurityConfig.ALWAYS_HIDDEN_FIELDS]:
        return True

    return False


def get_error_response(error, error_id=None):
    """
    Get appropriate error response based on environment

    Development: Full error details for debugging
    Production: Generic error with error ID for support
    """
    if SecurityConfig.SHOW_DETAILED_ERRORS:
        import traceback
        return {
            'success': False,
            'error': str(error),
            'type': type(error).__name__,
            'traceback': traceback.format_exc()
        }
    else:
        return {
            'success': False,
            'error': 'An error occurred. Please contact support.',
            'error_id': error_id,
            'support_email': 'support@metersquare.com'
        }
