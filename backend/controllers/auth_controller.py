# controllers/auth_controller.py
"""
Authentication controller - handles authentication and authorization logic
"""

from flask import g, request, jsonify, current_app, make_response
from functools import wraps
from datetime import datetime, timedelta
import jwt
# Password hashing removed - using OTP-only authentication

from config.db import db
from models.user import User
from models.role import Role
from config.logging import get_logger
from utils.authentication import send_otp
from utils.async_email import send_otp_async
from utils.sms_service import send_sms_otp
import os

# Import security logging functions
try:
    from utils.advanced_security import on_login_success, on_login_failed
except ImportError:
    # Fallback if advanced_security not available
    def on_login_success(user_id): pass
    def on_login_failed(email): pass

ENVIRONMENT = os.environ.get("ENVIRONMENT")

log = get_logger()

# Frontend to Database role mapping
# Maps frontend role names to database role names
FRONTEND_TO_DB_ROLE_MAP = {
    'procurement': 'buyer',  # Frontend sends 'procurement', DB has 'buyer'
    'buyer': 'buyer',        # Also accept 'buyer' directly
}

def map_frontend_role_to_db(frontend_role):
    """
    Map frontend role name to database role name
    Returns the database role name or the original if no mapping exists
    """
    if not frontend_role:
        return frontend_role

    frontend_role_lower = frontend_role.lower().strip()
    return FRONTEND_TO_DB_ROLE_MAP.get(frontend_role_lower, frontend_role_lower)

# ✅ CONSOLIDATED: Import jwt_required from utils.authentication to avoid duplicates
# This ensures consistent token validation across all routes
from utils.authentication import jwt_required

def user_register():
    """
    Register a new user (OTP-based, no password needed)
    """
    try:
        data = request.get_json()

        email = data.get("email")
        full_name = data.get("full_name")
        phone = data.get("phone")
        role_name = data.get("role", "user").lower()
        department = data.get("department")

        if not email:
            return jsonify({"error": "Email is required"}), 400

        # Check if user exists
        if User.query.filter_by(email=email, is_deleted=False).first():
            return jsonify({"error": "User with this email already exists"}), 409

        # Map frontend role to database role (e.g., 'procurement' -> 'buyer')
        db_role_name = map_frontend_role_to_db(role_name)
        log.info(f"Registration: frontend_role={role_name}, db_role={db_role_name}")

        # Get or create role
        role = Role.query.filter(
            db.func.lower(db.func.trim(Role.role)) == db_role_name.lower(),
            Role.is_deleted == False
        ).first()
        if not role:
            return jsonify({"error": f"Role '{role_name}' not found. Please contact admin."}), 404

        # Get department from role if not provided
        if not department:
            from config.roles_config import get_role_department
            department = get_role_department(role_name)

        # Create user (no password needed)
        user = User(
            email=email,
            full_name=full_name,
            phone=phone,
            role_id=role.role_id,
            department=department,
            is_active=True,
            is_deleted=False,
            created_at=datetime.utcnow()
        )
        db.session.add(user)
        db.session.commit()

        # Send welcome OTP for first login (async)
        otp = send_otp_async(email)
        
        response_data = {
            "message": "User registered successfully. OTP sent to email for first login.",
            "user_id": user.user_id,
            "email": email
        }

        return jsonify(response_data), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Registration error: {str(e)}")
        return jsonify({"error": f"Registration failed: {str(e)}"}), 500

def user_login():
    """
    OTP-based login - Step 1: Send OTP to user's email
    Optional role parameter for role-based validation
    """
    try:
        data = request.get_json()
        email = data.get("email")
        role_name = data.get("role")  # Optional role parameter

        if not email:
            return jsonify({"error": "Email is required"}), 400

        # Map frontend role to database role (e.g., 'procurement' -> 'buyer')
        db_role_name = map_frontend_role_to_db(role_name) if role_name else None

        log.info(f"Login attempt: email={email}, frontend_role={role_name}, db_role={db_role_name}")

        # Build query to check user exists
        query = db.session.query(User).join(
            Role, User.role_id == Role.role_id
        ).filter(
            User.email == email,
            User.is_deleted == False,
            User.is_active == True
        )

        # If role specified, validate user has that role (using mapped DB role)
        if db_role_name:
            query = query.filter(
                db.func.lower(db.func.trim(Role.role)) == db_role_name.lower()
            )

        user = query.first()

        if not user:
            if role_name:
                return jsonify({"error": f"User not found with role '{role_name}' or account inactive"}), 404
            else:
                return jsonify({"error": "User not found or inactive"}), 404

        log.info(f"User found: user_id={user.user_id}, email={user.email}")
        
        # Send OTP to user's email ASYNCHRONOUSLY (instant return)
        otp = send_otp_async(email)

        if otp:
            # Store user_id and role for verification step
            from utils.authentication import otp_storage
            if email in otp_storage:
                otp_storage[email]['user_id'] = user.user_id
                if db_role_name:
                    # Store the DB role name for verification
                    otp_storage[email]['role'] = db_role_name
            
            response_data = {
                "message": "OTP sent successfully to your email",
                "email": email,
                "otp_expiry": "5 minutes"
            }
            # Only include OTP in non-production environments (for testing/debugging)
            if ENVIRONMENT != 'production':
                response_data["otp"] = otp
            
            return jsonify(response_data), 200
        else:
            return jsonify({"error": "Failed to send OTP. Please try again."}), 500

    except Exception as e:
        log.error(f"Login error: {str(e)}")
        return jsonify({"error": f"Login failed: {str(e)}"}), 500

def handle_get_logged_in_user():
    try:
        # Use getattr to avoid attribute errors when g.user doesn't exist
        current_user = getattr(g, "user", None)
        if not current_user:
            return jsonify({"error": "Not logged in"}), 401

        # Proceed to fetch role info from database
        role = Role.query.filter_by(role_id=current_user["role_id"], is_deleted=False).first()
        role_name = role.role if role else "user"

        # Prepare response
        user_data = {
            "user": {
                "user_id": current_user.get("user_id"),
                "email": current_user.get("email"),
                "full_name": current_user.get("full_name"),
                "phone": current_user.get("phone"),
                "role": role_name,
                "role_id": current_user.get("role_id"),  # Include numeric role_id
                "department": current_user.get("department"),
                "is_active": current_user.get("is_active"),
                "user_status": current_user.get("user_status", "offline")
            },
            "api_info": {
                "endpoint": "/self",
                "method": "GET",
                "authentication": "Required (Bearer token)"
            }
        }
        return jsonify(user_data), 200

    except Exception as e:
        log.error(f"Error in self_route: {str(e)}")
        return jsonify({"error": str(e)}), 500

def update_user_profile():
    """
    Update user profile information using query.filter_by
    """
    try:
        current_user = g.get("user")
        if not current_user:
            return jsonify({"error": "Not logged in"}), 401

        data = request.get_json()
        allowed_fields = ["full_name", "phone", "department"]
        update_data = {field: data[field] for field in allowed_fields if field in data}

        if not update_data:
            return jsonify({
                "error": "No data to update"}), 400

        # Find user from DB using SQLAlchemy
        user = User.query.filter_by(user_id=current_user["user_id"], is_deleted=False).first()

        if not user:
            return jsonify({"error": "User not found"}), 404

        # Apply updates
        for field, value in update_data.items():
            setattr(user, field, value)

        db.session.commit()

        return jsonify({
            "message": "Profile updated successfully"}), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Profile update error: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Password change removed - using OTP-based authentication only

def send_email():
    try:
        # Try to get JSON data first, fallback to form data if JSON is not present
        data = request.get_json(silent=True)
        if not data:
            data = request.form.to_dict()
 
        email = data.get("email")
        if not email:
            return jsonify({"error": "Email is required"}), 400
 
        # Find user by email only
        user = User.query.filter_by(email=email, is_deleted=False, is_active=True).first()
        if not user:
            return jsonify({"error": "User not found or inactive"}), 404
 
        otp = send_otp(email)
 
        if otp:
            response_data = {
                "message": "OTP sent successfully"
            }
 
            return jsonify(response_data), 200
        else:
            return jsonify({"error": "Failed to send OTP"}), 500
 
    except Exception as e:
        log.error(f"Error in send_email: {e}")
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500

# Password reset removed - using OTP-based authentication only
# Users can login with OTP sent to their email

def logout():
    response_data = {"message": "Successfully logged out"}
    response = make_response(jsonify(response_data), 200)
    response.delete_cookie('access_token')
    return response

def user_status():
    try:
        data = request.get_json(silent=True)

        user_id = data.get("user_id")
        status = data.get("status")  # list of project IDs
        # Validate user
        user = User.query.filter_by(user_id=user_id).first()
        if user:
            user.user_status = status
            db.session.commit()
        else:
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "success": True,
            "message": "User status updated"
            }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error user status update: {str(e)}")
        return jsonify({
            "error": f"Failed to user status update: {str(e)}",
            "error_type": type(e).__name__
        }), 500


def site_supervisor_login_sms():
    """
    SMS OTP-based login for Site Supervisor/Site Engineer
    Step 1: Send OTP to user's phone number
    Also supports email fallback
    """
    try:
        data = request.get_json()
        phone = data.get("phone")
        email = data.get("email")
        login_method = data.get("login_method", "phone")  # 'phone' or 'email'

        if login_method == "phone" and not phone:
            return jsonify({"error": "Phone number is required"}), 400
        if login_method == "email" and not email:
            return jsonify({"error": "Email is required"}), 400

        # Clean phone number - remove all non-digits
        clean_phone = None
        phone_suffix = None
        if phone:
            clean_phone = ''.join(filter(str.isdigit, str(phone)))
            # Get last 10 digits for matching (ignore country code variations)
            phone_suffix = clean_phone[-10:] if len(clean_phone) >= 10 else clean_phone
            log.info(f"Phone login attempt: original={phone}, cleaned={clean_phone}, suffix={phone_suffix}")

        # Build query for site supervisor/site engineer roles only
        query = db.session.query(User).join(
            Role, User.role_id == Role.role_id
        ).filter(
            User.is_deleted == False,
            User.is_active == True,
            db.func.lower(Role.role).in_(['sitesupervisor', 'siteengineer'])
        )

        # Filter by phone or email based on login method
        if login_method == "phone":
            # Try multiple matching strategies for phone
            # 1. Exact match
            # 2. Match by last 10 digits (handles country code variations)
            user = query.filter(User.phone == phone).first()
            if not user and clean_phone:
                user = query.filter(User.phone == clean_phone).first()
            if not user and phone_suffix:
                # Match by phone ending with the suffix (last 10 digits)
                user = query.filter(User.phone.like(f'%{phone_suffix}')).first()
        else:
            query = query.filter(User.email == email)
            user = query.first()

        if not user:
            if login_method == "phone":
                return jsonify({"error": "No Site Supervisor/Engineer found with this phone number"}), 404
            else:
                return jsonify({"error": "No Site Supervisor/Engineer found with this email"}), 404

        # Send OTP based on login method
        if login_method == "phone":
            otp = send_sms_otp(phone)
            if otp:
                # Store user_id and role for verification step
                from utils.authentication import otp_storage
                # Use clean_phone for consistent storage key
                storage_key = f"phone:{clean_phone}"
                if storage_key in otp_storage:
                    otp_storage[storage_key]['user_id'] = user.user_id
                    otp_storage[storage_key]['email'] = user.email

                response_data = {
                    "message": "OTP sent successfully to your phone",
                    "phone": phone,
                    "login_method": "phone",
                    "otp_expiry": "5 minutes"
                }
                if ENVIRONMENT != 'production':
                    response_data["otp"] = otp

                return jsonify(response_data), 200
            else:
                return jsonify({"error": "Failed to send SMS OTP. Please try again."}), 500
        else:
            # Email fallback
            otp = send_otp_async(email)
            if otp:
                from utils.authentication import otp_storage
                if email in otp_storage:
                    otp_storage[email]['user_id'] = user.user_id
                    otp_storage[email]['role'] = 'siteengineer'

                response_data = {
                    "message": "OTP sent successfully to your email",
                    "email": email,
                    "login_method": "email",
                    "otp_expiry": "5 minutes"
                }
                if ENVIRONMENT != 'production':
                    response_data["otp"] = otp

                return jsonify(response_data), 200
            else:
                return jsonify({"error": "Failed to send OTP. Please try again."}), 500

    except Exception as e:
        log.error(f"Site supervisor SMS login error: {str(e)}")
        return jsonify({"error": f"Login failed: {str(e)}"}), 500


def verify_sms_otp_login():
    """
    SMS OTP-based login - Step 2: Verify OTP and complete login for Site Supervisor
    Supports both phone and email verification
    """
    try:
        data = request.get_json()
        otp_input = data.get('otp')
        phone = data.get('phone')
        email = data.get('email')
        login_method = data.get('login_method', 'phone')

        if not otp_input:
            return jsonify({"error": "OTP is required"}), 400

        if login_method == "phone" and not phone:
            return jsonify({"error": "Phone number is required"}), 400
        if login_method == "email" and not email:
            return jsonify({"error": "Email is required"}), 400

        try:
            otp_input = int(otp_input)
        except ValueError:
            return jsonify({"error": "OTP must be a number"}), 400

        from utils.authentication import otp_storage

        # Get OTP data based on login method
        otp_data = None
        storage_key = None
        if login_method == "phone":
            # Try multiple storage key formats (handle phone with/without country code)
            clean_phone = ''.join(filter(str.isdigit, str(phone)))
            possible_keys = [
                f"phone:{phone}",
                f"phone:{clean_phone}",
            ]
            for key in possible_keys:
                if key in otp_storage:
                    storage_key = key
                    otp_data = otp_storage.get(key)
                    break
        else:
            storage_key = email
            otp_data = otp_storage.get(storage_key)
        if not otp_data:
            on_login_failed(email or phone)  # Security audit log
            return jsonify({"error": "OTP not found or expired"}), 400

        stored_otp = otp_data.get("otp")
        expires_at = datetime.fromtimestamp(otp_data.get("expires_at"))

        # Check OTP expiry
        current_time = datetime.utcnow()
        if current_time > expires_at:
            del otp_storage[storage_key]
            on_login_failed(email or phone)  # Security audit log
            return jsonify({"error": "OTP expired"}), 400

        # Check if OTP matches
        if otp_input != stored_otp:
            on_login_failed(email or phone)  # Security audit log
            return jsonify({"error": "Invalid OTP"}), 400

        # Find user - for phone login, get email from storage or query
        if login_method == "phone":
            user_email = otp_data.get('email')
            if not user_email:
                # Query user by phone
                user = User.query.filter_by(phone=phone, is_deleted=False, is_active=True).first()
                if user:
                    user_email = user.email
                else:
                    del otp_storage[storage_key]
                    return jsonify({"error": "User not found"}), 404
        else:
            user_email = email

        # Get user with role info
        user = db.session.query(User).join(
            Role, User.role_id == Role.role_id
        ).filter(
            User.email == user_email,
            User.is_deleted == False,
            User.is_active == True
        ).first()

        if not user:
            del otp_storage[storage_key]
            on_login_failed(user_email)  # Security audit log
            return jsonify({"error": "User not found or inactive"}), 404

        # Update last login
        user.last_login = current_time
        db.session.commit()

        # Record login history for SMS OTP login
        from utils.authentication import record_login_history
        record_login_history(user.user_id, login_method='sms_otp')

        # Security audit log - successful login
        on_login_success(user.user_id)

        # Remove OTP from storage
        del otp_storage[storage_key]

        # Get role information
        role_permissions = []
        role_name = "user"
        if user.role_id:
            role = Role.query.filter_by(role_id=user.role_id, is_deleted=False).first()
            if role:
                role_name = role.role
                if hasattr(role, 'permissions') and role.permissions:
                    role_permissions = role.permissions if isinstance(role.permissions, list) else []

        # Create JWT token
        import os
        SECRET_KEY = os.getenv('SECRET_KEY')
        expiration_time = current_time + timedelta(hours=10)
        payload = {
            'user_id': user.user_id,
            'email': user.email,
            'username': user.email,
            'role': role_name,
            'role_id': user.role_id,
            'permissions': role_permissions,
            'full_name': user.full_name,
            'creation_time': current_time.isoformat(),
            'exp': expiration_time
        }
        session_token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
        if isinstance(session_token, bytes):
            session_token = session_token.decode('utf-8')

        response_data = {
            "message": "Login successful",
            "access_token": session_token,
            "expires_at": expiration_time.isoformat(),
            "user": {
                "user_id": user.user_id,
                "email": user.email,
                "full_name": user.full_name,
                "phone": user.phone,
                "role": role_name,
                "role_id": user.role_id,
                "department": user.department,
                "permissions": role_permissions
            }
        }

        response = make_response(jsonify(response_data), 200)
        response.set_cookie(
            'access_token',
            session_token,
            expires=expiration_time,
            httponly=True,
            secure=True,
            samesite='Lax'
        )
        return response

    except Exception as e:
        log.error(f"SMS OTP verification error: {str(e)}")
        return jsonify({"error": f"Verification failed: {str(e)}"}), 500