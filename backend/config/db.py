import os
import time
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from sqlalchemy import event
from sqlalchemy.engine import Engine

# Load environment variables from .env file
load_dotenv()

db = SQLAlchemy()

# ✅ PERFORMANCE: Query timing for development
# Logs slow queries (>100ms) to help identify bottlenecks
_query_start_time = {}

@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Record query start time"""
    if os.getenv("ENVIRONMENT", "development") == "development":
        conn.info.setdefault('query_start_time', []).append(time.time())

@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Log slow queries (>100ms) in development"""
    if os.getenv("ENVIRONMENT", "development") == "development":
        start_times = conn.info.get('query_start_time', [])
        if start_times:
            total_time = time.time() - start_times.pop()
            # Log queries that take more than 100ms
            if total_time > 0.1:
                import logging
                logging.getLogger('slow_queries').warning(
                    f"SLOW QUERY ({total_time*1000:.1f}ms): {statement[:200]}..."
                )

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
    # Get environment
    environment = os.getenv("ENVIRONMENT", "development")
    print("Environment: ", environment)

    # Set DATABASE_URL based on ENVIRONMENT
    if environment == "production":
        database_url = os.getenv("DATABASE_URL")
    else:
        database_url = os.getenv("DEV_DATABASE_URL")

    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    print("app.config['SQLALCHEMY_DATABASE_URI']:",app.config['SQLALCHEMY_DATABASE_URI'])
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "default-secret-key")

    # ✅ OPTIMIZED connection pool settings
    pool_config = {
        "pool_size": 50,           # ✅ Increased from 15 to 50 (3.3x more connections)
        "max_overflow": 20,        # ✅ Increased from 5 to 20 (max 70 total connections)
        "pool_timeout": 30,        # Wait 30 seconds before raising error
        "pool_recycle": 3600,      # ✅ Recycle connections after 1 hour (was 30 min)
        "pool_pre_ping": True,     # ✅ NEW: Test connections before using (prevents stale connections)
        "echo_pool": environment == "development",  # ✅ Debug pool in dev only
        # ✅ PERFORMANCE: Query timeout to prevent long-running queries from blocking
        "connect_args": {
            "options": "-c statement_timeout=30000"  # 30 second query timeout
        }
    }

    # For Supabase or connection-limited databases, use smaller pool
    if 'supabase' in database_url.lower() or os.getenv('USE_SMALL_POOL') == 'true':
        pool_config["pool_size"] = 20
        pool_config["max_overflow"] = 10

    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = pool_config

    db.init_app(app)
    # return db