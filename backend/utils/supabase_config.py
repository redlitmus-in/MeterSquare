"""
Centralized Supabase configuration.
Returns the correct Supabase URL and key based on ENVIRONMENT.
"""

import os


def get_supabase_config() -> tuple[str, str]:
    """
    Returns (supabase_url, supabase_key) for the current environment.
    Supports: development, production, ath
    """
    environment = os.environ.get("ENVIRONMENT", "production")

    if environment == "development":
        url = os.getenv("DEV_SUPABASE_URL", "")
        key = os.getenv("DEV_SUPABASE_KEY", "") or os.getenv("DEV_SUPABASE_ANON_KEY", "")
    elif environment == "ath":
        url = os.getenv("ATH_SUPABASE_URL", "")
        key = os.getenv("ATH_SUPABASE_KEY", "") or os.getenv("ATH_SUPABASE_ANON_KEY", "")
    else:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_ANON_KEY", "") or os.getenv("SUPABASE_KEY", "")

    return url, key
