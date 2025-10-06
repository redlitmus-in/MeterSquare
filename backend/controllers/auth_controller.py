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
import os

ENVIRONMENT = os.environ.get("ENVIRONMENT")
print("ENVIRONMENT:",ENVIRONMENT)

log = get_logger()

def jwt_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        token = request.headers.get('Authorization')

        # Extract token from Bearer header or cookie
        if token and token.startswith("Bearer "):
            token = token.split(" ")[1]
        else:
            token = request.cookies.get('access_token')

        if not token:
            return jsonify({"error": "Authorization token is missing"}), 401

        try:
            secret_key = current_app.config.get('SECRET_KEY')
            if not secret_key:
                raise Exception("SECRET_KEY not set in app configuration")

            decoded = jwt.decode(token, secret_key, algorithms=["HS256"])
            email = decoded.get("username") or decoded.get("email")
            user = User.query.filter_by(email=email, is_deleted=False, is_active=True).first()
            if not user:
                return jsonify({"error": "User not found"}), 404

            # Manually create user dict since no to_dict method
            g.user = {
                "user_id": user.user_id,
                "email": user.email,
                "full_name": user.full_name,
                "phone": user.phone,
                "role_id": user.role_id,
                "department": user.department,
                "is_active": user.is_active
            }
            g.user_id = user.user_id

        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError as e:
            return jsonify({"error": f"Invalid token: {str(e)}"}), 401
        except Exception as e:
            log.error(f"Auth error: {str(e)}")
            return jsonify({"error": "Authentication failed"}), 401

        return func(*args, **kwargs)

    return wrapper

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

        # Get or create role
        role = Role.query.filter(db.func.lower(Role.role) == role_name, Role.is_deleted == False).first()
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

        # Build query to check user exists
        query = db.session.query(User).join(
            Role, User.role_id == Role.role_id
        ).filter(
            User.email == email,
            User.is_deleted == False,
            User.is_active == True
        )
        
        # If role specified, validate user has that role
        if role_name:
            query = query.filter(
                db.func.lower(Role.role) == role_name.lower()
            )
            
        user = query.first()

        if not user:
            if role_name:
                return jsonify({"error": f"User not found with role '{role_name}' or account inactive"}), 404
            else:
                return jsonify({"error": "User not found or inactive"}), 404
        
        # Send OTP to user's email ASYNCHRONOUSLY (instant return)
        otp = send_otp_async(email)

        if otp:
            # Store user_id and role for verification step
            from utils.authentication import otp_storage
            if email in otp_storage:
                otp_storage[email]['user_id'] = user.user_id
                if role_name:
                    otp_storage[email]['role'] = role_name
            
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
                "is_active": current_user.get("is_active")
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