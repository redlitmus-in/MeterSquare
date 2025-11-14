# routes/auth_route.py

from flask import Blueprint, current_app
from controllers.auth_controller import *
from utils.authentication import *

auth_routes = Blueprint("auth_routes", __name__, url_prefix='/api')

# ✅ SECURITY: Rate limiting decorators for authentication endpoints
def get_limiter():
    """Get the limiter instance from the current app"""
    return current_app.limiter

# Public routes (no authentication required)
@auth_routes.route('/register', methods=['POST'])
def register_route():
    """Register a new user - Rate limited to prevent spam account creation"""
    limiter = get_limiter()
    # 5 registrations per hour per IP
    @limiter.limit("5 per hour")
    def _register():
        return user_register()
    return _register()

@auth_routes.route('/login', methods=['POST'])
def login_route():
    """User login - Rate limited to prevent brute force attacks"""
    limiter = get_limiter()
    # 5 login attempts per 15 minutes per IP
    @limiter.limit("5 per 15 minutes")
    def _login():
        return user_login()
    return _login()

@auth_routes.route('/send_otp', methods=['POST'])
def send_otp_route():
    """Send OTP for password reset - Rate limited to prevent OTP flooding"""
    limiter = get_limiter()
    # 3 OTP requests per 10 minutes per IP
    @limiter.limit("3 per 10 minutes")
    def _send_otp():
        return send_email()
    return _send_otp()

@auth_routes.route('/verification_otp', methods=['POST'])
def verification_otp_route():
    """Verify OTP - Rate limited to prevent brute force"""
    limiter = get_limiter()
    # 5 verification attempts per 10 minutes per IP
    @limiter.limit("5 per 10 minutes")
    def _verify_otp():
        return verification_otp()
    return _verify_otp()

@auth_routes.route('/logout', methods=['POST'])
def logout_route():
    """Logout user"""
    return logout()

# Protected routes (authentication required)
@auth_routes.route('/self', methods=['GET'])
@jwt_required
def self_route():
    """Get current logged-in user"""
    return handle_get_logged_in_user()

@auth_routes.route('/profile', methods=['PUT'])
@jwt_required
def update_profile_route():
    """Update user profile"""
    return update_user_profile()

#User status changes
@auth_routes.route('/user_status', methods=['POST'])
@jwt_required
def user_status_route():
    return user_status()

# Note: Password-related endpoints removed - using OTP-only authentication