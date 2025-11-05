"""
Preliminary Master Routes - API endpoints for preliminary master management
"""
from flask import Blueprint
from utils.authentication import jwt_required
from controllers.preliminary_master_controller import (
    get_all_preliminary_masters,
    get_boq_preliminaries_with_selections,
    save_boq_preliminary_selections,
    get_selected_boq_preliminaries,
    create_preliminary_master
)

preliminary_master_routes = Blueprint('preliminary_master_routes', __name__, url_prefix='/api')

# Get all preliminary master items (for creating new BOQ)
@preliminary_master_routes.route('/preliminary-masters', methods=['GET'])
@jwt_required
def get_preliminary_masters_route():
    """Get all active preliminary master items"""
    return get_all_preliminary_masters()

# Get all preliminaries with selection status for a specific BOQ
@preliminary_master_routes.route('/boq/<int:boq_id>/preliminaries', methods=['GET'])
@jwt_required
def get_boq_preliminaries_route(boq_id):
    """Get all preliminaries with their selection status for editing BOQ"""
    return get_boq_preliminaries_with_selections(boq_id)

# Save preliminary selections for a BOQ
@preliminary_master_routes.route('/boq/<int:boq_id>/preliminaries', methods=['POST'])
@jwt_required
def save_boq_preliminaries_route(boq_id):
    """Save preliminary selections for a BOQ"""
    return save_boq_preliminary_selections(boq_id)

# Get only selected preliminaries for a BOQ (for display/reports)
@preliminary_master_routes.route('/boq/<int:boq_id>/preliminaries/selected', methods=['GET'])
@jwt_required
def get_selected_preliminaries_route(boq_id):
    """Get only selected preliminaries for BOQ display"""
    return get_selected_boq_preliminaries(boq_id)

# Create a new preliminary master item
@preliminary_master_routes.route('/preliminary-masters', methods=['POST'])
@jwt_required
def create_preliminary_master_route():
    """Create a new preliminary master item"""
    return create_preliminary_master()
