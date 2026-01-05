"""
Asset Delivery Note (ADN) and Return Delivery Note (ARDN) Routes
Blueprint for the proper DN/RDN flow for returnable assets.
"""

from controllers.asset_dn_controller import asset_dn_bp

# Export the blueprint
asset_dn_routes = asset_dn_bp
