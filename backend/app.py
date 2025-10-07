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
    
    # Configure CORS based on environment
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
             allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
             methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
             supports_credentials=True)
    else:
        # Development: Allow all origins
        CORS(app, 
             origins="*",
             allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
             methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
             supports_credentials=True)
    
    # Add after_request handler to ensure CORS headers are always sent
    @app.after_request
    def after_request(response):
        # Allow requests from any origin in development
        if environment == "production":
            # Production: Check origin against allowed list
            origin = request.headers.get('Origin')
            allowed_origins = [
                "https://msq.kol.tel",
                "http://msq.kol.tel",
                "https://148.72.174.7",
                "http://148.72.174.7",
                "http://localhost:3000",
                "http://localhost:5173"
            ]
            if origin in allowed_origins:
                response.headers['Access-Control-Allow-Origin'] = origin
        else:
            response.headers['Access-Control-Allow-Origin'] = '*'
            # Development: Allow any origin
            origin = request.headers.get('Origin')
            if origin:
                response.headers['Access-Control-Allow-Origin'] = origin
            else:
                response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-Request-ID'
        response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        return response

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
