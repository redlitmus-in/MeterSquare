"""
Authentication Service - Runs on Port 5001
Handles all authentication-related endpoints

DEPRECATED: This is a legacy standalone entry point.
The main application (app.py) handles all authentication via the main Flask app.
This file should NOT be used as the primary entry point in production.
"""
import os
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '.env'))

def create_auth_app():
    app = Flask(__name__)

    # Get environment first — needed for secret key validation
    environment = os.getenv("ENVIRONMENT", "development")

    _secret_key = os.getenv("SECRET_KEY", "default-secret-key")
    if environment == 'production' and (not _secret_key or len(_secret_key) < 32 or _secret_key in ('default-secret-key', 'your-secret-key-here')):
        raise RuntimeError("SECRET_KEY is missing or too weak for production. Set a strong SECRET_KEY in .env.")
    app.config['SECRET_KEY'] = _secret_key

    # Database configuration
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    else:
        raise ValueError("DATABASE_URL environment variable not set")

    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_size": 10,
        "pool_recycle": 3600,
        "pool_pre_ping": True,
        "max_overflow": 20,
    }

    # CORS configuration - Allow requests from frontend
    frontend_origin = os.getenv("FRONTEND_URL", "http://localhost:3000")
    CORS(app, resources={
        r"/*": {
            "origins": [frontend_origin, "http://localhost:5173"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "expose_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True
        }
    })

    # Initialize database
    from config.database import db
    db.init_app(app)

    # Register authentication routes only
    from routes.authentication_routes import auth_bp
    app.register_blueprint(auth_bp)

    @app.route('/health', methods=['GET'])
    def health_check():
        return {"status": "healthy", "service": "auth", "port": 5001}, 200

    return app

if __name__ == "__main__":
    app = create_auth_app()
    environment = os.getenv("ENVIRONMENT", "development")
    port = 5001  # Auth service runs on port 5001
    debug = environment != "production"

    print(f"=" * 80)
    print(f"🔐 AUTH SERVICE STARTING")
    print(f"Environment: {environment}")
    print(f"Port: {port}")
    print(f"Debug Mode: {debug}")
    print(f"=" * 80)

    app.run(host="0.0.0.0", port=port, debug=debug)
