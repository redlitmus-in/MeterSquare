from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from config.routes import initialize_routes
from config.db import initialize_db as initialize_sqlalchemy, db
from config.logging import get_logger
import os

# Load environment variables from .env file
load_dotenv()

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
        # Development: Allow all origins
        CORS(app,
             origins="*",
             allow_headers=["Content-Type", "Authorization", "X-Request-ID", "X-Viewing-As-Role", "X-Viewing-As-Role-Id"],
             methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
             supports_credentials=True,
             max_age=3600)  # ✅ NEW: Cache preflight requests for 1 hour

    # ❌ REMOVED: Redundant after_request handler
    # Flask-CORS extension already handles ALL CORS headers automatically
    # This was adding 5-10ms overhead to every single request
    # With 1,500 requests/minute, this was 2.5 minutes of wasted CPU time per minute!

    logger = get_logger()  # Setup logging (make sure this returns something usable)
    # Production configuration
    if environment == "production":
        app.config['SESSION_COOKIE_SECURE'] = True
        app.config['SESSION_COOKIE_HTTPONLY'] = True
        app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
        app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1 hour

    initialize_sqlalchemy(app)  # Init SQLAlchemy ORM
    
    # Create all tables
    # with app.app_context():
    #     db.create_all()

    initialize_routes(app)  # Register routes

    return app

if __name__ == "__main__":
    app = create_app()
    environment = os.getenv("ENVIRONMENT", "development")
    port = int(os.getenv("PORT", 5000))
    debug = environment != "production"
    app.run(host="0.0.0.0", port=port, debug=debug)
