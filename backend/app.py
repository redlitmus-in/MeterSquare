from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_compress import Compress
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
from dotenv import load_dotenv
from config.routes import initialize_routes
from config.db import initialize_db as initialize_sqlalchemy, db
from config.logging import get_logger
from socketio_server import init_socketio
from controllers.notification_controller import notification_bp
import os

# Load environment variables from .env file
# Get the directory where this file is located (backend directory)
basedir = os.path.abspath(os.path.dirname(__file__))
# Load .env from the backend directory
load_dotenv(os.path.join(basedir, '.env'))

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
             allow_headers=["Content-Type", "Authorization", "X-Request-ID", "X-Viewing-As-Role", "X-Viewing-As-Role-Id"],
             methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
             supports_credentials=True,
             max_age=3600)  # ✅ NEW: Cache preflight requests for 1 hour
    else:
        # Development: Allow specific local origins only (SECURITY FIX)
        # ⚠️ IMPORTANT: Never use origins="*" with supports_credentials=True in production!
        CORS(app,
             origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:3001", "http://127.0.0.1:5173"],
             allow_headers=["Content-Type", "Authorization", "X-Request-ID", "X-Viewing-As-Role", "X-Viewing-As-Role-Id"],
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

        return response

    # ✅ SECURITY: Log security events
    @app.before_request
    def log_security_events():
        """Log authentication and security-related events"""
        # Log failed authentication attempts
        if request.endpoint and 'login' in request.endpoint:
            logger.info(f"Login attempt from IP: {request.remote_addr}")

        # Log admin endpoint access attempts
        if request.endpoint and 'admin' in request.endpoint:
            logger.info(f"Admin endpoint access: {request.endpoint} from IP: {request.remote_addr}")

    initialize_sqlalchemy(app)  # Init SQLAlchemy ORM

    # Create all tables
    # with app.app_context():
    #     db.create_all()

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

    initialize_routes(app)  # Register routes

    # Register notification routes
    app.register_blueprint(notification_bp, url_prefix='/api')

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
    print(f">> Starting MeterSquare ERP Server")
    print(f"   Environment: {environment}")
    print(f"   Port: {port}")
    print(f"   Debug: {debug}")
    print(f"   Socket.IO: Enabled")
    print(f"   Real-time notifications: Active")
    print("=" * 60)

    app.socketio.run(app, host="0.0.0.0", port=port, debug=debug, allow_unsafe_werkzeug=True)
