# routes/auth_route.py

from flask import Blueprint, current_app, request
from controllers.auth_controller import *
from utils.authentication import *

auth_routes = Blueprint("auth_routes", __name__, url_prefix='/api')


def _apply_limit(limit_string, f, *args, **kwargs):
    """Apply rate limit to the current request. OPTIONS preflight passes through."""
    if request.method == 'OPTIONS':
        return current_app.make_default_options_response()
    limiter = current_app.limiter
    limited = limiter.limit(limit_string)(f)
    return limited(*args, **kwargs)


# Public routes (no authentication required)
@auth_routes.route('/register', methods=['POST', 'OPTIONS'])
def register_route():
    return _apply_limit("5 per hour", user_register)


@auth_routes.route('/login', methods=['POST', 'OPTIONS'])
def login_route():
    return _apply_limit("30 per 15 minutes", user_login)


@auth_routes.route('/send_otp', methods=['POST', 'OPTIONS'])
def send_otp_route():
    return _apply_limit("5 per 15 minutes", send_email)


@auth_routes.route('/verification_otp', methods=['POST', 'OPTIONS'])
def verification_otp_route():
    return _apply_limit("10 per 15 minutes", verification_otp)


@auth_routes.route('/logout', methods=['POST'])
def logout_route():
    return logout()


# Protected routes (authentication required)
@auth_routes.route('/self', methods=['GET'])
@jwt_required
def self_route():
    return handle_get_logged_in_user()


@auth_routes.route('/profile', methods=['PUT'])
@jwt_required
def update_profile_route():
    return update_user_profile()


@auth_routes.route('/user_status', methods=['POST'])
@jwt_required
def user_status_route():
    return user_status()


# Site Supervisor SMS OTP Login endpoints
@auth_routes.route('/site-supervisor/login', methods=['POST', 'OPTIONS'])
def site_supervisor_login_route():
    from controllers.auth_controller import site_supervisor_login_sms
    return _apply_limit("10 per 15 minutes", site_supervisor_login_sms)


@auth_routes.route('/site-supervisor/verify-otp', methods=['POST', 'OPTIONS'])
def site_supervisor_verify_otp_route():
    from controllers.auth_controller import verify_sms_otp_login
    return _apply_limit("10 per 15 minutes", verify_sms_otp_login)
