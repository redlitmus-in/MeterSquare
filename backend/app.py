from flask import Flask, jsonify, request, g
from flask_cors import CORS
from flask_compress import Compress
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
from werkzeug.middleware.proxy_fix import ProxyFix
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
    _secret_key = os.getenv("SECRET_KEY", "default-secret-key")
    # In production, refuse to start with a weak or missing secret key
    if os.getenv("ENVIRONMENT") == "production":
        if not _secret_key or _secret_key == "default-secret-key" or len(_secret_key) < 32:
            raise RuntimeError("SECRET_KEY is not set or too short. Refusing to start in production.")
    app.config['SECRET_KEY'] = _secret_key

    # Trust the reverse proxy (Nginx) to forward the real client IP via X-Forwarded-For.
    # x_for=1 means trust 1 proxy hop — increase if you have multiple proxies.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    # Get environment (default to development)
    environment = os.getenv("ENVIRONMENT", "development")
    
    # ✅ OPTIMIZED CORS Configuration
    # Origins from environment, with sensible defaults per environment
    _cors_headers = ["Content-Type", "Authorization", "X-Request-ID", "X-Viewing-As-Role",
                     "X-Viewing-As-Role-Id", "X-Viewing-As-User-Id", "X-User-Name",
                     "X-User-Id", "Cache-Control", "Pragma", "X-Skip-Cache", "Expires"]
    _cors_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]

    if environment == "production":
        # Production origins from env — CORS_ALLOWED_ORIGINS or PRODUCTION_DOMAIN
        _prod_origins_env = os.getenv("CORS_ALLOWED_ORIGINS") or os.getenv("PRODUCTION_DOMAIN", "")
        allowed_origins = [o.strip() for o in _prod_origins_env.split(",") if o.strip()]
        # Also add http:// variants for any https:// origin
        _http_variants = []
        for o in allowed_origins:
            if o.startswith("https://"):
                _http_variants.append(o.replace("https://", "http://", 1))
        allowed_origins += _http_variants
        # Server IP from env
        _server_ip = os.getenv("SERVER_IP")
        if _server_ip:
            allowed_origins += [f"https://{_server_ip}", f"http://{_server_ip}"]
        # Dev origins (localhost) from env — always included so local production testing works
        _dev_port = os.getenv("DEV_FRONTEND_PORT", "5173")
        _dev_origins = os.getenv("DEV_CORS_ORIGINS", "")
        if _dev_origins:
            allowed_origins += [o.strip() for o in _dev_origins.split(",") if o.strip()]
        else:
            allowed_origins += [
                f"http://localhost:{_dev_port}", f"http://127.0.0.1:{_dev_port}",
                "http://localhost:3000", "http://127.0.0.1:3000",
            ]
        CORS(app, origins=allowed_origins, allow_headers=_cors_headers,
             methods=_cors_methods, supports_credentials=True, max_age=3600)
    else:
        # Development: local origins from env or defaults
        _dev_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
        if _dev_origins_env:
            dev_origins = [o.strip() for o in _dev_origins_env.split(",") if o.strip()]
        else:
            _dev_port = os.getenv("DEV_FRONTEND_PORT", "5173")
            dev_origins = [
                f"http://localhost:{_dev_port}", f"http://127.0.0.1:{_dev_port}",
                "http://localhost:3000", "http://127.0.0.1:3000",
            ]
        CORS(app, origins=dev_origins, allow_headers=_cors_headers,
             methods=_cors_methods, supports_credentials=True, max_age=3600)

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

    # ✅ PERFORMANCE: Caching Layer (Redis or in-memory fallback)
    redis_url = os.getenv('REDIS_URL', None)
    _redis_reachable = False
    if redis_url:
        try:
            import redis as _redis_test
            _r = _redis_test.Redis.from_url(redis_url, socket_connect_timeout=2)
            _r.ping()
            _r.close()
            _redis_reachable = True
            app.config['CACHE_TYPE'] = 'redis'
            app.config['CACHE_REDIS_URL'] = redis_url
            app.config['CACHE_DEFAULT_TIMEOUT'] = 300
        except Exception:
            # Redis not reachable — fall back to in-memory cache
            app.config['CACHE_TYPE'] = 'SimpleCache'
            app.config['CACHE_DEFAULT_TIMEOUT'] = 300
    else:
        app.config['CACHE_TYPE'] = 'SimpleCache'
        app.config['CACHE_DEFAULT_TIMEOUT'] = 300

    cache = Cache(app)
    app.cache = cache  # Make cache accessible to routes

    # ✅ SECURITY: Rate Limiting (prevents brute force, DoS)
    # Use Redis only if it's confirmed reachable — otherwise fall back to memory://
    # This prevents ConnectionError crashes on every request when Redis is unavailable
    limiter_storage = redis_url if _redis_reachable else "memory://"
    limiter = Limiter(
        app=app,
        key_func=get_remote_address,
        default_limits=["10000 per day", "1000 per hour"] if environment == "production" else ["10000 per hour"],
        storage_uri=limiter_storage,
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

        # Content Security Policy — environment-based (mirrors CORS config pattern)
        # CSP connect-src domains from environment
        _csp_connect_extra = os.getenv("CSP_CONNECT_EXTRA", "")  # e.g. "https://custom.api.com wss://custom.api.com"
        _supabase_url = os.getenv("SUPABASE_URL", "")

        if environment == "production":
            # Build production connect-src from allowed CORS origins
            _prod_connect = " ".join(allowed_origins) if allowed_origins else ""
            # Add wss:// variants for WebSocket
            _prod_ws = " ".join(o.replace("https://", "wss://").replace("http://", "ws://") for o in allowed_origins if "://" in o)
            # Detect localhost for local production testing
            _host = request.host.split(':')[0] if request else ''
            _is_local = _host in ('localhost', '127.0.0.1')
            _backend_port = os.getenv("PORT", "5000")
            _local_connect = (
                f" http://localhost:{_backend_port} http://127.0.0.1:{_backend_port}"
                f" ws://localhost:{_backend_port} ws://127.0.0.1:{_backend_port}"
            ) if _is_local else ""
            response.headers['Content-Security-Policy'] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self' data:; "
                "media-src 'self' https: blob:; "
                f"connect-src 'self' {_prod_connect} {_prod_ws} {_supabase_url} {_csp_connect_extra}{_local_connect}"
            )
        else:
            _backend_port = os.getenv("PORT", "5000")
            _frontend_port = os.getenv("DEV_FRONTEND_PORT", "5173")
            response.headers['Content-Security-Policy'] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self' data:; "
                "media-src 'self' https: blob:; "
                f"connect-src 'self' "
                f"http://localhost:{_backend_port} http://127.0.0.1:{_backend_port} "
                f"ws://localhost:{_backend_port} ws://127.0.0.1:{_backend_port} "
                f"http://localhost:{_frontend_port} ws://localhost:{_frontend_port} "
                f"http://127.0.0.1:{_frontend_port} ws://127.0.0.1:{_frontend_port} "
                f"{_supabase_url} {_csp_connect_extra}"
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

            # Check if this dict has a user_id (it's user account data)
            data_user_id = data.get('user_id')
            # Also check for worker_id for worker data
            data_worker_id = data.get('worker_id')
            is_own_data = data_user_id and str(data_user_id) == str(current_user_id)
            # Only user account data (has user_id) needs PII protection.
            # Vendor records, CC lists, and other business data expose email/phone freely.
            is_user_profile_data = data_user_id is not None
            # Vendor business data — for admin-only fields (gst_number, fax)
            is_vendor_data = bool(data.get('vendor_id')) and 'company_name' in data

            for key, value in data.items():
                key_lower = key.lower()

                # LEVEL 1: Skip fields that should NEVER be included
                if key_lower in never_include:
                    continue

                # LEVEL 2: Protect PII only on user account data (has user_id).
                # CC lists, vendor contacts, and other entity emails are business data — not filtered.
                if key_lower in sensitive_pii_fields:
                    if is_user_profile_data and not is_admin and not is_own_data:
                        continue

                # LEVEL 3: Skip vendor-hidden fields if user is vendor
                if user_role == 'vendor' and key_lower in vendor_hidden:
                    continue

                # LEVEL 4: Skip admin-only fields if not admin
                # Vendor gst_number/fax are business fields, visible to authorized roles
                if key_lower in admin_only_fields and not is_admin and not is_vendor_data:
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
        # In production, verify the shared webhook secret to reject forged requests
        if is_production():
            import hmac as _hmac
            webhook_secret = os.environ.get('WHATSAPP_WEBHOOK_SECRET', '')
            if webhook_secret:
                provided = request.headers.get('X-Webhook-Secret', '')
                if not _hmac.compare_digest(provided, webhook_secret):
                    logger.warning("WhatsApp webhook: invalid secret, request rejected")
                    return jsonify({"status": "unauthorized"}), 401

        data = request.get_json() or {}
        logger.info("WhatsApp webhook received")
        return jsonify({"status": "ok"}), 200

    # ✅ Health Check Endpoint
    @app.route('/api/health', methods=['GET'])
    def health_check():
        """Health check endpoint - liveness probe only in production"""
        if is_production():
            # Production: minimal response — no internal config exposed
            return jsonify({"status": "healthy", "timestamp": time.time()}), 200
        # Development: full details for debugging
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


    # Initialize deadline reminder scheduler (APScheduler)
    # Use a file-based lock so only ONE Gunicorn worker starts the scheduler.
    # Without this, all 5 workers start their own scheduler → 5x duplicate notifications.
    import fcntl
    scheduler_lock_path = '/tmp/msq_scheduler.lock'
    try:
        lock_file = open(scheduler_lock_path, 'w')
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Only the worker that acquired the lock reaches here
        from utils.deadline_scheduler import init_deadline_scheduler
        init_deadline_scheduler(app)
        app._scheduler_lock = lock_file  # Keep reference so lock is held for process lifetime
    except BlockingIOError:
        pass  # Another worker already holds the lock — skip scheduler in this worker

    return app

if __name__ == "__main__":
    app = create_app()
    environment = os.getenv("ENVIRONMENT", "development")
    port = int(os.getenv("PORT", 5000))
    debug = environment != "production"

    # Use socketio.run instead of app.run for WebSocket support
    logger = get_logger()
    logger.info(f"Starting MeterSquare ERP Server - Environment: {environment}, Port: {port}, Debug: {debug}")

    # allow_unsafe_werkzeug only in development — production should use gunicorn
    app.socketio.run(app, host="0.0.0.0", port=port, debug=debug,
                     allow_unsafe_werkzeug=(environment != "production"), use_reloader=False)
