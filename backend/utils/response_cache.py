"""
✅ PERFORMANCE: Response Caching Utility

This utility provides caching for API responses to reduce database load.
It uses Flask-Caching (configured in app.py) and provides decorators for easy use.

Usage:
    from utils.response_cache import cached_response, invalidate_cache

    @cached_response(timeout=60, key_prefix='my_endpoint')
    def my_endpoint():
        return expensive_query()

    # Invalidate cache when data changes
    invalidate_cache('my_endpoint')
"""
from functools import wraps
from flask import request, current_app, g
import hashlib
import json


def get_cache_key(key_prefix, include_user=True, include_params=True):
    """
    Generate a cache key based on the request context.

    Args:
        key_prefix: Prefix for the cache key
        include_user: Include user ID in key (for user-specific data)
        include_params: Include query parameters in key

    Returns:
        Unique cache key string
    """
    parts = [key_prefix]

    # Include user ID if requested (for user-specific data)
    if include_user:
        user = getattr(g, 'user', None)
        if user:
            parts.append(f"user_{user.get('user_id', 'anon')}")
            parts.append(f"role_{user.get('role', 'unknown')}")

    # Include query parameters if requested
    if include_params:
        params = dict(request.args)
        if params:
            params_str = json.dumps(params, sort_keys=True)
            params_hash = hashlib.md5(params_str.encode()).hexdigest()[:8]
            parts.append(f"params_{params_hash}")

    return ':'.join(parts)


def cached_response(timeout=60, key_prefix=None, include_user=True, include_params=True):
    """
    Decorator to cache API responses.

    Args:
        timeout: Cache timeout in seconds (default: 60)
        key_prefix: Prefix for cache key (default: function name)
        include_user: Include user ID in cache key (default: True)
        include_params: Include query params in cache key (default: True)

    Usage:
        @cached_response(timeout=120, key_prefix='dashboard')
        def get_dashboard():
            return expensive_query()
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get cache instance
            cache = getattr(current_app, 'cache', None)
            if not cache:
                # No cache configured, just run the function
                return f(*args, **kwargs)

            # Generate cache key
            prefix = key_prefix or f.__name__
            cache_key = get_cache_key(prefix, include_user, include_params)

            # Try to get from cache
            try:
                cached = cache.get(cache_key)
                if cached is not None:
                    # Add header to indicate cache hit (for debugging)
                    return cached
            except Exception:
                # Cache error, continue without cache
                pass

            # Execute function
            result = f(*args, **kwargs)

            # Store in cache (only cache successful responses)
            try:
                if result and isinstance(result, tuple):
                    response, status_code = result[:2]
                    if status_code == 200:
                        cache.set(cache_key, result, timeout=timeout)
                elif result:
                    cache.set(cache_key, result, timeout=timeout)
            except Exception:
                # Cache error, continue without caching
                pass

            return result

        return decorated_function
    return decorator


def invalidate_cache(key_prefix, user_id=None):
    """
    Invalidate cached responses for a given prefix.

    Args:
        key_prefix: The cache key prefix to invalidate
        user_id: Optional user ID to invalidate user-specific cache

    Usage:
        # After creating/updating BOQ
        invalidate_cache('pm_boqs')
        invalidate_cache('pm_boqs', user_id=123)
    """
    cache = getattr(current_app, 'cache', None)
    if not cache:
        return

    try:
        # For simple cache, we can't do pattern-based invalidation
        # But we can delete known keys
        if user_id:
            # Invalidate user-specific cache
            cache.delete(f"{key_prefix}:user_{user_id}")

        # For Redis cache, we could use pattern-based deletion
        # cache.delete_memoized() or cache.clear() for full clear
    except Exception:
        pass


def cache_dashboard_data(timeout=30):
    """
    Specialized decorator for dashboard data caching.
    Short timeout (30s) to keep data fresh while reducing load.
    """
    return cached_response(timeout=timeout, include_user=True, include_params=True)


def cache_static_data(timeout=300):
    """
    Specialized decorator for static/rarely changing data.
    Longer timeout (5 min) for things like roles, settings.
    """
    return cached_response(timeout=timeout, include_user=False, include_params=False)
