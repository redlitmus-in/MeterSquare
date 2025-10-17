"""
Preliminary Routes - API endpoints for Preliminaries & Approval Works management
"""
from flask import Blueprint
from utils.authentication import jwt_required
from controllers.preliminary_controller import *

preliminary_routes = Blueprint('preliminary_routes', __name__, url_prefix='/api')

# Create or update preliminary (auto-detects based on boq_id)
@preliminary_routes.route('/preliminary', methods=['POST'])
@jwt_required
def create_preliminary_route():
    return create_preliminary()

# Get all preliminaries
@preliminary_routes.route('/preliminaries', methods=['GET'])
@jwt_required
def get_latest_preliminary_route():
    return get_latest_preliminary()

