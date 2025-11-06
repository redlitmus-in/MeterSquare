import os
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

db = SQLAlchemy()

def initialize_db(app):
    """
    Initialize SQLAlchemy with OPTIMIZED app config for production.

    OPTIMIZATIONS:
    - Increased pool size from 15 to 50 (to handle concurrent requests)
    - Increased max_overflow from 5 to 20 (70 total connections max)
    - Added pool_pre_ping to validate connections before use
    - Added echo_pool for debugging (disable in production)
    - Optimized pool_recycle to 1 hour (was 30 minutes)
    """
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "default-secret-key")

    # Get environment
    environment = os.getenv("ENVIRONMENT", "development")

    # ✅ OPTIMIZED connection pool settings
    pool_config = {
        "pool_size": 50,           # ✅ Increased from 15 to 50 (3.3x more connections)
        "max_overflow": 20,        # ✅ Increased from 5 to 20 (max 70 total connections)
        "pool_timeout": 30,        # Wait 30 seconds before raising error
        "pool_recycle": 3600,      # ✅ Recycle connections after 1 hour (was 30 min)
        "pool_pre_ping": True,     # ✅ NEW: Test connections before using (prevents stale connections)
        "echo_pool": environment == "development",  # ✅ Debug pool in dev only
    }

    # For Supabase or connection-limited databases, use smaller pool
    database_url = os.getenv('DATABASE_URL', '')
    if 'supabase' in database_url.lower() or os.getenv('USE_SMALL_POOL') == 'true':
        print("⚠️ Using small pool for Supabase/limited connection database")
        pool_config["pool_size"] = 20
        pool_config["max_overflow"] = 10

    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = pool_config

    print(f"✅ Database pool configured: {pool_config['pool_size']} connections + {pool_config['max_overflow']} overflow")

    db.init_app(app)
    # return db