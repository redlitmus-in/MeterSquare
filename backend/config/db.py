import os
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

db = SQLAlchemy()

def initialize_db(app):
    """Initialize SQLAlchemy with app config."""
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "default-secret-key")
    # ✅ Add safe connection pool settings (to avoid Supabase pooler error)
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        "pool_size": 15,       # keep small, Supabase pooler is limited
        "max_overflow": 5,    # don't exceed pool_size
        "pool_timeout": 30,   # wait before raising error
        "pool_recycle": 1800  # refresh stale connections
    }

    db.init_app(app)
    # return db