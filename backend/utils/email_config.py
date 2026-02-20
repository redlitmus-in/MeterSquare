# Email configuration for logo display
import os
import base64

# Get the absolute path to the logo file
LOGO_PATH = os.path.join(os.path.dirname(__file__), '..', 'static', 'logo.png')

# App URL based on environment
def get_app_url():
    """
    Returns the frontend app URL based on ENVIRONMENT variable.
    development -> http://localhost:3000 (or DEV_FRONTEND_URL)
    production  -> https://msq.kol.tel  (or PROD_FRONTEND_URL)
    """
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment == "production":
        return os.getenv("PROD_FRONTEND_URL", "https://msq.kol.tel")
    return os.getenv("DEV_FRONTEND_URL", "http://localhost:3000")

APP_URL = get_app_url()

# For production: Use your domain URL
# For development: Use base64 embedding
def get_logo_url():
    """
    Get logo URL based on environment.
    In production, this should return your hosted URL.
    In development, returns base64 embedded image.
    """
    # Check if running in production with a domain
    domain = os.getenv('FRONTEND_URL', '')
    if domain and not domain.startswith('http://localhost'):
        # Production: Use hosted logo from your domain
        return f"{domain}/assets/logo.png"

    # Development: Use base64 embedding
    try:
        if os.path.exists(LOGO_PATH):
            with open(LOGO_PATH, 'rb') as f:
                logo_data = base64.b64encode(f.read()).decode('utf-8')
                return f"data:image/png;base64,{logo_data}"
    except Exception as e:
        print(f"Error loading logo: {e}")

    # Fallback: Use a generic logo URL
    return "https://via.placeholder.com/200x80/ef4444/ffffff?text=MeterSquare"

LOGO_URL = get_logo_url()

# Option for embedding logo as attachment
USE_LOGO_ATTACHMENT = False