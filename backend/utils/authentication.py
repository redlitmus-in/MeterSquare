import os
import threading
from flask import g, jsonify, make_response, request, session, url_for
import smtplib
import secrets
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from email.header import Header
from email.utils import formataddr
from datetime import datetime, timedelta
from sqlalchemy import func
import jwt
import uuid as _uuid
from models.user import User

try:
    from .email_config import LOGO_URL, USE_BASE64_LOGO, USE_TEXT_ONLY
except ImportError:
    # Default values if config file doesn't exist
    LOGO_URL = "https://via.placeholder.com/140x70/243d8a/ffffff?text=Meter+Square"
    USE_BASE64_LOGO = False
    USE_TEXT_ONLY = False

from config.logging import get_logger

# Import audit logging hooks for security tracking
try:
    from utils.advanced_security import on_login_success, on_login_failed, audit_log
except ImportError:
    # Fallback if advanced_security not available
    def on_login_success(user_id): pass
    def on_login_failed(email): pass
    def audit_log(event_type, **kwargs): pass

log =  get_logger()

ENVIRONMENT = os.environ.get("ENVIRONMENT")
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_EMAIL_PASSWORD = os.getenv("SENDER_EMAIL_PASSWORD")
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "465"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True").lower() == "true"
SECRET_KEY = os.getenv('SECRET_KEY')

otp_storage = {}
_otp_lock = threading.Lock()

# Redis for shared OTP storage across multiple workers
_REDIS_URL = os.getenv('REDIS_URL')
try:
    import redis as _redis
    if _REDIS_URL:
        _redis_client = _redis.Redis.from_url(_REDIS_URL, decode_responses=True, socket_connect_timeout=2)
    else:
        _redis_client = None
        raise ConnectionError("REDIS_URL not configured")
    _redis_client.ping()
    _USE_REDIS = True
except Exception:
    _USE_REDIS = False
    _redis_client = None

def _otp_set(email_id, otp, role=None, user_id=None, email=None, ttl=300):
    """Store OTP data in Redis (shared across workers) or in-memory fallback."""
    expires_at = (datetime.utcnow() + timedelta(seconds=ttl)).timestamp()
    payload = {"otp": otp, "role": role, "expires_at": expires_at}
    if user_id is not None:
        payload["user_id"] = user_id
    if email is not None:
        payload["email"] = email
    if _USE_REDIS:
        import json
        _redis_client.setex(f"otp:{email_id}", ttl, json.dumps(payload))
    else:
        with _otp_lock:
            otp_storage[email_id] = payload

def _otp_pop(email_id):
    if _USE_REDIS:
        import json
        pipe = _redis_client.pipeline()
        pipe.get(f"otp:{email_id}")
        pipe.delete(f"otp:{email_id}")
        val, _ = pipe.execute()
        if not val:
            return None
        return json.loads(val)
    else:
        with _otp_lock:
            data = otp_storage.pop(email_id, None)
        if data and data.get("expires_at") and datetime.utcnow().timestamp() > data["expires_at"]:
            return None
        return data


def parse_user_agent(user_agent_string):
    """
    Parse user agent string to extract device type, browser, and OS
    Returns a dict with device_type, browser, os
    """
    if not user_agent_string:
        return {'device_type': 'unknown', 'browser': 'unknown', 'os': 'unknown'}

    ua = user_agent_string.lower()

    # Detect device type
    if 'mobile' in ua or 'android' in ua and 'mobile' in ua:
        device_type = 'mobile'
    elif 'tablet' in ua or 'ipad' in ua:
        device_type = 'tablet'
    else:
        device_type = 'desktop'

    # Detect browser
    if 'edg/' in ua or 'edge/' in ua:
        browser = 'Microsoft Edge'
    elif 'chrome/' in ua and 'safari/' in ua:
        browser = 'Chrome'
    elif 'firefox/' in ua:
        browser = 'Firefox'
    elif 'safari/' in ua and 'chrome/' not in ua:
        browser = 'Safari'
    elif 'opera/' in ua or 'opr/' in ua:
        browser = 'Opera'
    elif 'msie' in ua or 'trident/' in ua:
        browser = 'Internet Explorer'
    else:
        browser = 'Unknown Browser'

    # Detect OS
    if 'windows nt 10' in ua:
        os_name = 'Windows 10/11'
    elif 'windows nt' in ua:
        os_name = 'Windows'
    elif 'mac os x' in ua:
        os_name = 'macOS'
    elif 'linux' in ua and 'android' not in ua:
        os_name = 'Linux'
    elif 'android' in ua:
        os_name = 'Android'
    elif 'iphone' in ua or 'ipad' in ua:
        os_name = 'iOS'
    else:
        os_name = 'Unknown OS'

    return {
        'device_type': device_type,
        'browser': browser,
        'os': os_name
    }


def record_login_history(user_id, login_method='email_otp', jti=None):
    """
    Record a login event to the login_history table
    Extracts IP address and user agent from the current request
    """
    try:
        from models.login_history import LoginHistory
        from config.db import db

        # Get client info from request.
        # ProxyFix (applied in app.py) makes request.remote_addr the real IP when behind Nginx.
        # Explicit fallback chain handles edge cases: X-Forwarded-For → X-Real-IP → remote_addr
        ip_address = (
            request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
            or request.headers.get('X-Real-IP', '').strip()
            or request.remote_addr
        )

        user_agent = request.headers.get('User-Agent', '')
        ua_info = parse_user_agent(user_agent)

        # Create login history record
        login_record = LoginHistory(
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,  # Truncate if too long
            device_type=ua_info['device_type'],
            browser=ua_info['browser'],
            os=ua_info['os'],
            login_method=login_method,
            jti=jti
        )

        db.session.add(login_record)
        db.session.commit()

        # Run suspicious activity detection (non-blocking)
        try:
            from utils.suspicious_activity_detector import check_suspicious_activity
            check_suspicious_activity(
                user_id=user_id,
                ip_address=ip_address,
                login_at=login_record.login_at
            )
        except Exception as _det_err:
            import logging as _log
            _log.getLogger(__name__).error(f"Suspicious activity detector import failed: {_det_err}")

        log.debug(f"Recorded login for user {user_id} ({ua_info['browser']} on {ua_info['os']})")

        return login_record.id

    except Exception as e:
        log.error(f"Failed to record login history: {str(e)}")
        # Don't fail the login if history recording fails
        return None


def get_logo_base64():
    """Convert logo.png to base64 string for embedding in email"""
    try:
        # Try multiple possible paths for the logo
        possible_paths = [
            os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logo.png'),  # backend/logo.png
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'logo.png'),  # project root
            os.path.join(os.getcwd(), 'logo.png'),  # current working directory
        ]
        
        logo_path = None
        for path in possible_paths:
            if os.path.exists(path):
                logo_path = path
                break
        
        if not logo_path:
            log.warning("Logo file not found in any expected location, using text-only header")
            return None
            
        with open(logo_path, 'rb') as logo_file:
            logo_data = logo_file.read()
            # Ensure the image data is valid
            if len(logo_data) == 0:
                log.error("Logo file is empty")
                return None
            
            base64_logo = base64.b64encode(logo_data).decode('utf-8')
            
            # Validate base64 encoding
            try:
                base64.b64decode(base64_logo)
                return base64_logo
            except Exception as decode_error:
                log.error(f"Base64 validation failed: {decode_error}")
                return None
                
    except Exception as e:
        log.error(f"Error reading logo file: {e}")
        return None

def send_otp(email_id):
    try:
        otp = 100000 + secrets.randbelow(900000)
        _otp_set(email_id, otp)
        
        sender_email = SENDER_EMAIL
        password = SENDER_EMAIL_PASSWORD
        smtp_server = EMAIL_HOST
        smtp_port = EMAIL_PORT
        subject = "Your OTP Code"
        
        # Create the HTML body
        body = f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>OTP Verification</title>
                <style>
                    @media only screen and (max-width: 600px) {{
                        .email-container {{
                            width: 100% !important;
                            min-width: 340px !important;
                            margin: 0 10px !important;
                        }}
                        .content-padding {{
                            padding: 20px 15px !important;
                        }}
                        .header-padding {{
                            padding: 20px 15px !important;
                        }}
                        .otp-code {{
                            font-size: 24px !important;
                            padding: 15px 20px !important;
                        }}
                        .logo-img {{
                            max-width: 150px !important;
                        }}
                    }}
                    @media only screen and (max-width: 480px) {{
                        .email-container {{
                            min-width: 340px !important;
                        }}
                        .content-padding {{
                            padding: 15px 12px !important;
                        }}
                        .otp-code {{
                            font-size: 22px !important;
                            padding: 12px 18px !important;
                        }}
                        .main-heading {{
                            font-size: 20px !important;
                        }}
                    }}
                    @media only screen and (max-width: 340px) {{
                        .email-container {{
                            min-width: 340px !important;
                        }}
                        .content-padding {{
                            padding: 12px 10px !important;
                        }}
                        .otp-code {{
                            font-size: 20px !important;
                            padding: 10px 15px !important;
                        }}
                    }}
                </style>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f6fb; color: #333;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f6fb; padding: 30px 0;">
                    <tr>
                        <td align="center">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" class="email-container" style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08); border: 1px solid #e0e6f5; max-width: 600px; min-width: 340px;">
                                <!-- Header -->
                                <tr>
                                    <td class="header-padding" style="background: linear-gradient(to right, rgb(255, 255, 255), rgb(255, 255, 255)); border-bottom: 2px solid rgb(254, 202, 202); padding: 25px; text-align: center;">
                                        <!-- Logo Image using CID reference -->
                                        <img src="cid:logo" alt="Meter Square Logo" class="logo-img" style="display: block; max-width: 200px; height: auto; margin: 0 auto;">
                                    </td>
                                </tr>
                                <!-- Content -->
                                <tr>
                                    <td class="content-padding" style="padding: 35px 25px; text-align: center;">
                                        <h2 class="main-heading" style="font-size: 22px; font-weight: bold; color: #243d8a; margin: 0 0 18px 0;">Welcome</h2>
                                        <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 28px 0;">
                                            We're excited to have you on board! To secure your account,
                                            please use the verification code below to complete your registration.
                                        </p>
                                        
                                        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 25px auto;">
                                            <tr>
                                                <td style="padding: 18px 28px; border: 2px solid #243d8a; border-radius: 8px; background-color: #f0f4ff;">
                                                    <div class="otp-code" style="font-size: 30px; font-weight: bold; letter-spacing: 6px; color: #243d8a; margin-bottom: 12px;">{otp}</div>
                                                    <div style="font-size: 13px; color: #555;">
                                                        This code will expire in <strong>5 minutes</strong>
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="font-size: 13px; color: #777; margin: 25px 0 0 0; line-height: 1.5;">
                                            If you did not request this verification code, you can safely ignore this email.
                                            Your account security is our top priority.
                                        </p>
                                        
                                        <div style="text-align: left; margin-top: 35px; font-size: 14px; color: #444;">
                                            Best regards,<br>
                                            <strong style="color: #243d8a;">Meter Square Team</strong>
                                        </div>
                                    </td>
                                </tr>
                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #f4f6fb; text-align: center; padding: 18px; border-top: 1px solid #e0e6f5;">
                                        <p style="font-size: 12px; color: #888; margin: 0;">© 2026 Meter Square. All rights reserved.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """

        # Create message with related type for embedded images
        message = MIMEMultipart('related')
        # Include display name "Meter Square" in From header
        sender_name = os.getenv("EMAIL_SENDER_NAME") or os.getenv("SENDER_NAME") or "Meter Square"
        message["From"] = formataddr((str(Header(sender_name, 'utf-8')), sender_email))
        message["To"] = email_id
        message["Subject"] = subject
        
        # Create alternative part for HTML
        msg_alternative = MIMEMultipart('alternative')
        message.attach(msg_alternative)
        
        # Attach HTML body
        msg_alternative.attach(MIMEText(body, "html"))
        
        # Attach the logo image from your local file
        logo_attached = False
        try:
            # Try to find and attach the logo
            possible_logo_paths = [
                os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logo.png'),  # backend/logo.png
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'logo.png'),  # Project root
                os.path.join(os.getcwd(), 'logo.png'),  # Current working directory
            ]
            
            for logo_path in possible_logo_paths:
                if os.path.exists(logo_path):
                    with open(logo_path, 'rb') as f:
                        logo_data = f.read()
                        logo_image = MIMEImage(logo_data, _subtype='png')
                        logo_image.add_header('Content-ID', '<logo>')
                        logo_image.add_header('Content-Disposition', 'inline', filename='logo.png')
                        message.attach(logo_image)
                        logo_attached = True
                        break
            
            if not logo_attached:
                log.warning("Logo file not found, sending email without logo")
        
        except Exception as e:
            log.error(f"Error attaching logo: {e}")

        # Use appropriate SMTP connection based on configuration
        if EMAIL_USE_TLS:
            # For TLS (like Office 365 on port 587)
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(sender_email, password)
                server.sendmail(sender_email, email_id, message.as_string())
        else:
            # For SSL (like Gmail on port 465)
            with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
                server.login(sender_email, password)
                server.sendmail(sender_email, email_id, message.as_string())

        return otp

    except smtplib.SMTPException as e:
        log.error(f"SMTP error occurred: {str(e)}")
        return None
    except Exception as e:
        log.error(f"An error occurred: {str(e)}")
        return None

def verification_otp():
    """
    OTP-based login - Step 2: Verify OTP and complete login
    Validates role if it was specified during OTP request
    """
    from models.role import Role
    
    data = request.get_json()
    otp_input = data.get('otp')
    email_id = data.get('email') or data.get('email_id')  # support both keys
    
    if not otp_input:
        return jsonify({"error": "OTP is required"}), 400
    if not email_id:
        return jsonify({"error": "Email is required"}), 400
    
    # Assuming OTP is stored as int, convert input accordingly
    try:
        otp_input = int(otp_input)
    except ValueError:
        return jsonify({"error": "OTP must be a number"}), 400
    
    # Atomically pop OTP data so only one request can ever consume it.
    otp_data = _otp_pop(email_id)
    if not otp_data:
        on_login_failed(email_id)  # Audit log - potential brute force attempt
        return jsonify({"error": "OTP not found or expired"}), 400
    
    # Check if a specific role was required during login
    required_role = otp_data.get('role')
    
    # Fetch user by email with role information
    from config.db import db
    query = db.session.query(User).join(Role, User.role_id == Role.role_id).filter(
        User.email == email_id,
        User.is_deleted == False,
        User.is_active == True
    )
    
    # If role was specified during login, validate it
    if required_role:
        query = query.filter(
            db.func.lower(Role.role) == required_role.lower()
        )
    
    user = query.first()
    
    if not user:
        if required_role:
            return jsonify({"error": f"User not found with role '{required_role}' or account inactive"}), 404
        else:
            return jsonify({"error": "User not found or inactive"}), 404
    
    if user.is_blocked:
        return jsonify({
            'error': 'Account blocked',
            'message': 'Your account has been blocked by an administrator. Please contact support.'
        }), 403

    # OTP data already retrieved above
    stored_otp = otp_data.get("otp")
    raw_expires = otp_data.get("expires_at")
    # If expires_at missing (old OTP before fix), trust Redis TTL — treat as valid
    expires_at = datetime.fromtimestamp(raw_expires) if raw_expires else (datetime.utcnow() + timedelta(minutes=5))
    
    # OTP values are never logged — prevents credential exposure in log aggregators

    # Check expiry first (before value comparison to avoid timing oracle)
    current_time = datetime.utcnow()
    if current_time > expires_at:
        on_login_failed(email_id)  # Audit log expired OTP attempt
        return jsonify({"error": "OTP expired"}), 400

    # Constant-time comparison prevents timing-based enumeration of OTP values
    import hmac
    if not hmac.compare_digest(str(otp_input), str(stored_otp)):
        on_login_failed(email_id)  # Audit log failed attempt
        return jsonify({"error": "Invalid OTP"}), 400
    
    # Update last login, status, and timezone
    user.last_login = current_time
    user.user_status = 'online'  # Auto-set online on login

    # Save user's browser timezone (IANA string e.g. 'Asia/Dubai') if provided
    tz = data.get('timezone')
    if tz and isinstance(tz, str) and len(tz) <= 100:
        user.timezone = tz

    db.session.commit()

    # Audit log successful login for security tracking
    on_login_success(user.user_id)

    # Get role information safely
    role_permissions = []
    role_name = "user"

    # Get role from database if role_id exists
    if user.role_id:
        role = Role.query.filter_by(role_id=user.role_id, is_deleted=False).first()
        if role:
            role_name = role.role
            # Get permissions if they exist
            if hasattr(role, 'permissions') and role.permissions:
                role_permissions = role.permissions if isinstance(role.permissions, list) else []

    # Create JWT token with role information
    expiration_time = current_time + timedelta(hours=10)
    payload = {
        'user_id': user.user_id,
        'email': user.email,
        'username': user.email,  # Add username for compatibility
        'role': role_name,
        'role_id': user.role_id,
        'permissions': role_permissions,
        'full_name': user.full_name,
        'creation_time': current_time.isoformat(),
        'jti': str(_uuid.uuid4()),
        'exp': expiration_time
    }
    session_token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    # jwt.encode returns bytes in PyJWT < 2.0, decode to str if needed
    if isinstance(session_token, bytes):
        session_token = session_token.decode('utf-8')

    # Record login history for audit trail (after payload is created)
    record_login_history(user.user_id, login_method='email_otp', jti=payload.get('jti'))

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
            "permissions": role_permissions,
            "user_status": "online"  # Auto-set online on login
        }
    }
    
    response = make_response(jsonify(response_data), 200)
    response.set_cookie(
        'access_token',
        session_token,
        expires=expiration_time,
        httponly=True,
        secure=True,
        samesite='Strict' if ENVIRONMENT == 'production' else 'Lax'
    )
    return response

# JWT Required Decorator
from functools import wraps

def jwt_required(f):
    """Decorator to require valid JWT token for protected routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Skip JWT validation for CORS preflight requests
        if request.method == 'OPTIONS':
            return '', 200

        from models.role import Role  # Import Role model here
        token = None

        # Check for token in Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header:
            try:
                token = auth_header.split(' ')[1]  # Bearer <token>
            except IndexError:
                return jsonify({'message': 'Invalid token format'}), 401
        
        # Check for token in cookies if not in header
        if not token:
            token = request.cookies.get('access_token')
        
        # Check for token in request args — development only (tokens in URLs leak into logs/history)
        if not token and ENVIRONMENT != 'production':
            token = request.args.get('token')
        
        if not token:
            return jsonify({'message': 'Token is missing'}), 401
        
        try:
            # Log token for debugging (first/last 10 chars only for security)
            if token:
                log.debug(f"Token received: {token[:10]}...{token[-10:]} (length: {len(token)})")

            # Check if SECRET_KEY is set
            if not SECRET_KEY:
                log.error("SECRET_KEY is not set in environment variables!")
                return jsonify({'message': 'Server configuration error'}), 500

            # Decode the token
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            # Check token blacklist (for force-logout support)
            try:
                from models.token_blacklist import TokenBlacklist
                jti = data.get('jti')
                if jti and TokenBlacklist.is_blacklisted(jti):
                    return jsonify({'error': 'Session has been terminated', 'message': 'Your session was ended by an administrator'}), 401
            except Exception as _bl_err:
                pass  # Never fail auth due to blacklist check errors
            log.debug(f"Token decoded successfully for user_id: {data.get('user_id')}")

            # Get the user from the database
            current_user = User.query.filter_by(
                user_id=data['user_id'],
                is_deleted=False,
                is_active=True
            ).first()

            if not current_user:
                log.warning(f"User not found or inactive for user_id: {data.get('user_id')}")
                return jsonify({'message': 'User not found or inactive'}), 401

            # Check if user has been blocked by an administrator
            if getattr(current_user, 'is_blocked', False):
                log.warning(f"Blocked user attempted access: user_id={current_user.user_id}")
                return jsonify({'error': 'Account blocked', 'message': 'Your account has been blocked by an administrator.'}), 403

            # Get role name safely
            role_name = "user"
            if current_user.role_id:
                role = Role.query.filter_by(role_id=current_user.role_id, is_deleted=False).first()
                if role:
                    role_name = role.role

            # Store user in g object for access in route
            g.current_user = current_user
            g.user_id = current_user.user_id
            g.user = {
                'user_id': current_user.user_id,
                'email': current_user.email,
                'full_name': current_user.full_name,
                'role_id': current_user.role_id,
                'role': role_name,
                'role_name': role_name,  # Add role_name for consistency
                'department': current_user.department,
                'phone': current_user.phone,
                'is_active': current_user.is_active,
                'user_status': getattr(current_user, 'user_status', None)
            }

        except jwt.ExpiredSignatureError:
            log.warning(f"Token has expired for token ending with: ...{token[-10:] if token else 'N/A'}")
            # ✅ Consistent error format with 'error' key (matches auth_controller)
            return jsonify({'error': 'Token expired', 'message': 'Token has expired'}), 401
        except jwt.InvalidTokenError as e:
            log.error(f"Invalid token error: {str(e)} - Token: {token[:20] if token else 'N/A'}...{token[-10:] if token and len(token) > 30 else ''}")
            return jsonify({'error': 'Invalid token', 'message': 'Invalid token'}), 401
        except Exception as e:
            log.error(f"JWT verification error: {str(e)}")
            import traceback
            log.error(f"Traceback: {traceback.format_exc()}")
            return jsonify({'error': 'Authentication failed', 'message': 'Token verification failed'}), 401
        
        return f(*args, **kwargs)
    
    return decorated_function