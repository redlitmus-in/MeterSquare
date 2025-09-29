"""
BOQ Routes - API endpoints for Bill of Quantities management
"""
from flask import Blueprint
from utils.authentication import jwt_required
from controllers.boq_controller import *

boq_routes = Blueprint('boq_routes', __name__, url_prefix='/api')

# BOQ Management
@boq_routes.route('/create_boq', methods=['POST'])
@jwt_required
def create_boq_route():
    return create_boq()

@boq_routes.route('/boq/<int:boq_id>', methods=['GET'])
@jwt_required
def get_boq_route(boq_id):
    return get_boq(boq_id)
    