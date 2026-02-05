from flask import Flask, jsonify, request, g
from flask_cors import CORS
from flask_compress import Compress
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
from dotenv import load_dotenv
from config.routes import initialize_routes
from config.db import initialize_db as initialize_sqlalchemy, db
from config.logging import get_logger, configure_quiet_logging
from config.security_config import SecurityConfig, is_production, is_development
from socketio_server import init_socketio
from utils.advanced_security import (
    init_advanced_security, register_security_routes,
    on_login_success, on_login_failed, audit_log
)
from controllers.notification_controller import notification_bp
import os
import time
import uuid
import traceback

# Load environment variables from .env file
# Get the directory where this file is located (backend directory)
basedir = os.path.abspath(os.path.dirname(__file__))
# Load .env from the backend directory
load_dotenv(os.path.join(basedir, '.env'))

# Suppress verbose logging from third-party libraries early
configure_quiet_logging()

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "default-secret-key")

    # Get environment (default to development)
    environment = os.getenv("ENVIRONMENT", "development")
    
    # ✅ OPTIMIZED CORS Configuration
    # Removed redundant after_request handler (was adding 5-10ms overhead to EVERY request)
    # Flask-CORS already handles all CORS headers properly
    if environment == "production":
        # Production: Allow specific origins
        allowed_origins = [
            "https://msq.kol.tel",
            "http://msq.kol.tel",
            "https://msq.ath.cx",
            "http://msq.ath.cx",
            "https://148.72.174.7",
            "http://148.72.174.7",
            "http://localhost:3000",  # For local development testing
            "http://localhost:5173"   # Vite dev server
        ]
        CORS(app,
             origins=allowed_origins,
             allow_headers=["Content-Type", "Authorization", "X-Request-ID", "X-Viewing-As-Role", "X-Viewing-As-Role-Id", "X-Viewing-As-User-Id", "X-User-Name", "X-User-Id", "Cache-Control", "Pragma", "X-Skip-Cache", "Expires"],
             methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
             supports_credentials=True,
             max_age=3600)  # ✅ NEW: Cache preflight requests for 1 hour
    else:
        # Development: Allow specific local origins only (SECURITY FIX)
        # ⚠️ IMPORTANT: Never use origins="*" with supports_credentials=True in production!
        CORS(app,
             origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:3001", "http://127.0.0.1:5173"],
             allow_headers=["Content-Type", "Authorization", "X-Request-ID", "X-Viewing-As-Role", "X-Viewing-As-Role-Id", "X-Viewing-As-User-Id", "X-User-Name", "X-User-Id", "Cache-Control", "Pragma", "X-Skip-Cache", "Expires"],
             methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
             supports_credentials=True,
             max_age=3600)  # ✅ Cache preflight requests for 1 hour

    # ❌ REMOVED: Redundant after_request handler
    # Flask-CORS extension already handles ALL CORS headers automatically
    # This was adding 5-10ms overhead to every single request
    # With 1,500 requests/minute, this was 2.5 minutes of wasted CPU time per minute!

    logger = get_logger()  # Setup logging (make sure this returns something usable)

    # Production configuration
    if environment == "production":
        app.config['SESSION_COOKIE_SECURE'] = True
        app.config['SESSION_COOKIE_HTTPONLY'] = True
        app.config['SESSION_COOKIE_SAMESITE'] = 'Strict'  # Changed from Lax to Strict for better security
        app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1 hour

    # ✅ PERFORMANCE: Response Compression (70-90% bandwidth reduction)
    app.config['COMPRESS_MIMETYPES'] = [
        'text/html', 'text/css', 'text/xml', 'text/plain',
        'application/json', 'application/javascript', 'application/xml'
    ]
    app.config['COMPRESS_LEVEL'] = 6  # Balance between speed and compression
    app.config['COMPRESS_MIN_SIZE'] = 500  # Only compress responses > 500 bytes
    Compress(app)

    # ✅ PERFORMANCE: Caching Layer (Redis or in-memory)
    redis_url = os.getenv('REDIS_URL', None)
    if redis_url:
        # Production: Use Redis for distributed caching
        app.config['CACHE_TYPE'] = 'redis'
        app.config['CACHE_REDIS_URL'] = redis_url
        app.config['CACHE_DEFAULT_TIMEOUT'] = 300  # 5 minutes
    else:
        # Development: Use simple in-memory cache
        app.config['CACHE_TYPE'] = 'simple'
        app.config['CACHE_DEFAULT_TIMEOUT'] = 300

    cache = Cache(app)
    app.cache = cache  # Make cache accessible to routes

    # ✅ SECURITY: Rate Limiting (prevents brute force, DoS)
    limiter = Limiter(
        app=app,
        key_func=get_remote_address,
        default_limits=["1000 per day", "200 per hour"] if environment == "production" else ["10000 per hour"],
        storage_uri=redis_url if redis_url else "memory://",
        strategy="fixed-window"
    )
    app.limiter = limiter  # Make limiter accessible to routes

    # ✅ SECURITY: Security Headers (prevents XSS, clickjacking, etc.)
    @app.after_request
    def set_security_headers(response):
        """Add security headers to all responses"""
        # Prevent MIME-type sniffing
        response.headers['X-Content-Type-Options'] = 'nosniff'

        # Prevent clickjacking
        response.headers['X-Frame-Options'] = 'DENY'

        # XSS Protection (legacy but still useful for old browsers)
        response.headers['X-XSS-Protection'] = '1; mode=block'

        # HSTS: Force HTTPS (only in production)
        if environment == "production":
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'

        # Content Security Policy
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https://msq.kol.tel wss://msq.kol.tel"
        )

        # Referrer Policy
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

        # Permissions Policy (disable unnecessary browser features)
        response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'

        # ✅ PERFORMANCE: Cache-Control headers for browser caching
        # Don't cache API responses (dynamic data) but allow caching of static assets
        content_type = response.headers.get('Content-Type', '')
        if 'application/json' in content_type:
            # API responses: no caching for dynamic data
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
        elif any(static_type in content_type for static_type in ['image/', 'font/', 'text/css', 'application/javascript']):
            # Static assets: cache for 1 hour, allow CDN caching
            response.headers['Cache-Control'] = 'public, max-age=3600, stale-while-revalidate=86400'

        return response

    # ✅ SECURITY: Log security events
    @app.before_request
    def log_security_events():
        """Log authentication and security-related events"""
        # Start performance tracking
        g.request_start_time = time.time()
        g.request_id = str(uuid.uuid4())[:8]

        # Log failed authentication attempts
        if request.endpoint and 'login' in request.endpoint:
            logger.info(f"Login attempt from IP: {request.remote_addr}")

        # Log admin endpoint access attempts
        if request.endpoint and 'admin' in request.endpoint:
            logger.info(f"Admin endpoint access: {request.endpoint} from IP: {request.remote_addr}")

    # ✅ PERFORMANCE: Track request execution time
    @app.after_request
    def add_performance_headers(response):
        """Add performance metrics to response headers"""
        if hasattr(g, 'request_start_time'):
            execution_time_ms = (time.time() - g.request_start_time) * 1000

            # Add timing header
            response.headers['X-Response-Time'] = f"{execution_time_ms:.2f}ms"

            # Add request ID header
            if hasattr(g, 'request_id'):
                response.headers['X-Request-ID'] = g.request_id

            # Log slow requests (>500ms) - ONLY in production for noise reduction
            if is_production() and execution_time_ms > SecurityConfig.SLOW_REQUEST_THRESHOLD_MS:
                logger.warning(
                    f"SLOW REQUEST: {request.method} {request.path} "
                    f"took {execution_time_ms:.2f}ms"
                )

        return response

    # ✅ SECURITY: Global Response Filter (Production Only)
    # Automatically filters sensitive data from ALL JSON responses
    @app.after_request
    def filter_sensitive_response_data(response):
        """
        Filter sensitive data from JSON responses in PRODUCTION ONLY

        This protects against accidental data leaks by:
        1. Filtering email/phone from non-admin responses
        2. Removing internal cost data from vendor responses
        3. Never exposing password/token fields

        IMPORTANT: This ONLY runs in production. Development returns full data.
        """
        # Skip if not production
        if not is_production():
            return response

        # Skip if not JSON response
        if response.content_type != 'application/json':
            return response

        # Skip if error response
        if response.status_code >= 400:
            return response

        try:
            import json

            # Get response data
            data = response.get_json()
            if not data:
                return response

            # Get current user context
            user_role = None
            user_id = None
            is_admin = False

            if hasattr(g, 'user') and g.user:
                user_role = (g.user.get('role') or '').lower()
                user_id = g.user.get('user_id')
                is_admin = user_role in ['admin', 'pm', 'td', 'technical_director', 'project_manager']

            # Filter the data
            filtered_data = _filter_response_recursive(data, user_id, user_role, is_admin)

            # Update response with filtered data
            response.set_data(json.dumps(filtered_data))

        except Exception as e:
            # Don't break response if filtering fails
            logger.error(f"Response filtering error: {str(e)}")

        return response

    def _filter_response_recursive(data, current_user_id, user_role, is_admin):
        """Recursively filter sensitive fields from response data"""

        # ============================================
        # LEVEL 1: CRITICAL - Fields to NEVER include in any response
        # ============================================
        never_include = [
            # Authentication & Security
            'password', 'password_hash', 'reset_token', 'api_key', 'secret_key', 'otp',
            # Government/Financial IDs
            'id_number', 'ssn', 'bank_account', 'bank_details',
            # Internal tokens
            'refresh_token', 'session_token', 'auth_token'
        ]

        # ============================================
        # LEVEL 2: PII - Only visible to admin or data owner
        # ============================================
        sensitive_pii_fields = [
            # Contact info (user)
            'email', 'phone',
            # Worker sensitive data
            'emergency_contact', 'emergency_phone',
            # Audit/tracking data (admin only)
            'ip_address', 'user_agent',
            # Phone codes (usually paired with phone)
            'phone_code'
        ]

        # ============================================
        # LEVEL 3: Internal Business Data - Hidden from vendors
        # ============================================
        vendor_hidden = [
            'internal_cost', 'profit_margin', 'internal_notes', 'admin_notes',
            'estimated_cost', 'cost_breakdown', 'margin_percentage',
            'hourly_rate'  # Worker rate is internal business data
        ]

        # ============================================
        # LEVEL 4: Admin-Only Fields - Visible only to PM/TD/Admin
        # ============================================
        admin_only_fields = [
            'ip_address', 'user_agent', 'device_type', 'browser', 'os',
            'gst_number', 'fax'
        ]

        if data is None:
            return None

        if isinstance(data, dict):
            filtered = {}

            # Check if this dict has a user_id (it's user data)
            data_user_id = data.get('user_id')
            # Also check for worker_id for worker data
            data_worker_id = data.get('worker_id')
            is_own_data = data_user_id and str(data_user_id) == str(current_user_id)

            for key, value in data.items():
                key_lower = key.lower()

                # LEVEL 1: Skip fields that should NEVER be included
                if key_lower in never_include:
                    continue

                # LEVEL 2: Skip PII fields if not admin and not own data
                if key_lower in sensitive_pii_fields:
                    if not is_admin and not is_own_data:
                        continue

                # LEVEL 3: Skip vendor-hidden fields if user is vendor
                if user_role == 'vendor' and key_lower in vendor_hidden:
                    continue

                # LEVEL 4: Skip admin-only fields if not admin
                if key_lower in admin_only_fields and not is_admin:
                    continue

                # Recursively filter nested data
                filtered[key] = _filter_response_recursive(value, current_user_id, user_role, is_admin)

            return filtered

        elif isinstance(data, list):
            return [_filter_response_recursive(item, current_user_id, user_role, is_admin) for item in data]

        else:
            return data

    initialize_sqlalchemy(app)  # Init SQLAlchemy ORM

    # Create all tables
    # with app.app_context():
    #     db.create_all()

    # ✅ CRITICAL: Database session cleanup after each request
    @app.teardown_appcontext
    def shutdown_session(exception=None):
        """
        Remove database session after each request to prevent session leaks
        This prevents "write() before start_response" errors caused by uncommitted transactions
        """
        try:
            db.session.remove()
        except Exception as e:
            logger.error(f"Error removing database session: {str(e)}")

    @app.teardown_request
    def teardown_request_handler(exception=None):
        """
        Ensure database session is properly closed after each request
        Handles both successful requests and exceptions
        """
        if exception:
            try:
                db.session.rollback()
            except Exception as e:
                logger.error(f"Error rolling back database session: {str(e)}")
        try:
            db.session.close()
        except Exception as e:
            logger.error(f"Error closing database session: {str(e)}")

    # ✅ CRITICAL: Global error handlers to prevent "write() before start_response" errors
    # These catch any unhandled exceptions and ensure a proper HTTP response is returned
    @app.errorhandler(Exception)
    def handle_exception(e):
        """Catch-all error handler for unhandled exceptions"""
        import traceback

        # Generate error ID for tracking
        error_id = str(uuid.uuid4())

        logger.error(f"Error ID {error_id}: Unhandled exception: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")

        # ✅ SECURITY: Show detailed errors only in development
        # Production gets generic message + error_id for support
        if SecurityConfig.SHOW_DETAILED_ERRORS:
            # Development: Show full details for debugging
            return jsonify({
                "success": False,
                "error": "Internal server error",
                "message": str(e),
                "type": type(e).__name__,
                "traceback": traceback.format_exc()
            }), 500
        else:
            # Production: Generic message + error_id
            return jsonify({
                "success": False,
                "error": "Internal server error",
                "message": "An unexpected error occurred",
                "error_id": error_id,
                "support": "Please contact support with this error_id"
            }), 500

    @app.errorhandler(404)
    def handle_not_found(e):
        """Handle 404 errors"""
        return jsonify({
            "success": False,
            "error": "Not found",
            "message": "The requested resource was not found"
        }), 404

    @app.errorhandler(500)
    def handle_internal_error(e):
        """Handle 500 errors"""
        logger.error(f"Internal server error: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Internal server error",
            "message": "An internal server error occurred"
        }), 500

    @app.errorhandler(AssertionError)
    def handle_assertion_error(e):
        """Handle assertion errors (including werkzeug WSGI issues)"""
        import traceback
        logger.error(f"Assertion error: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "success": False,
            "error": "Request processing error",
            "message": "The request could not be processed"
        }), 500

    # WhatsApp Webhook endpoint for Echt.im
    @app.route('/api/whatsapp/webhook', methods=['GET', 'POST'])
    def whatsapp_webhook():
        """Webhook endpoint for Echt.im WhatsApp callbacks"""
        if request.method == 'GET':
            # Verification request
            return jsonify({"status": "ok", "message": "Webhook verified"}), 200

        # POST - Incoming message or status update
        data = request.get_json() or {}
        logger.info(f"WhatsApp webhook received: {data}")
        return jsonify({"status": "ok"}), 200

    # ✅ Health Check Endpoint - Shows system and security status
    @app.route('/api/health', methods=['GET'])
    def health_check():
        """Health check endpoint - shows system status"""
        return jsonify({
            "status": "healthy",
            "environment": environment,
            "timestamp": time.time(),
            "security": {
                "rate_limiting_enabled": SecurityConfig.RATE_LIMIT_ENABLED,
                "strict_headers_enabled": SecurityConfig.STRICT_SECURITY_HEADERS,
                "detailed_errors_enabled": SecurityConfig.SHOW_DETAILED_ERRORS,
                "is_production": is_production()
            }
        }), 200

    initialize_routes(app)  # Register routes

    # Register notification routes
    app.register_blueprint(notification_bp, url_prefix='/api')

    # ✅ SECURITY: Initialize Advanced Security Features
    # Rate Limiting, IP Blocking, Token Fingerprinting, Audit Logging
    security_components = init_advanced_security(app)
    app.security = security_components  # Make accessible to routes

    # Register security admin endpoints (/api/security/*)
    register_security_routes(app)

    # Initialize Socket.IO for real-time notifications
    socketio = init_socketio(app)
    app.socketio = socketio  # Make socketio accessible to other modules

    return app

if __name__ == "__main__":
    app = create_app()
    environment = os.getenv("ENVIRONMENT", "development")
    port = int(os.getenv("PORT", 5000))
    debug = environment != "production"

    # Use socketio.run instead of app.run for WebSocket support
    logger = get_logger()
    logger.info(f"Starting MeterSquare ERP Server - Environment: {environment}, Port: {port}, Debug: {debug}")

    app.socketio.run(app, host="0.0.0.0", port=port, debug=debug, allow_unsafe_werkzeug=True)
