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

@boq_routes.route('/all_boq', methods=['GET'])
@jwt_required
def get_all_boq_route():
    return get_all_boq()

@boq_routes.route('/boq/<int:boq_id>', methods=['GET'])
@jwt_required
def get_boq_route(boq_id):
    return get_boq(boq_id)

@boq_routes.route('/update_boq/<int:boq_id>', methods=['PUT'])
@jwt_required
def update_boq_route(boq_id):
    return update_boq(boq_id)

@boq_routes.route('/delete_boq/<int:boq_id>', methods=['DELETE'])
@jwt_required
def delete_boq_route(boq_id):
    return delete_boq(boq_id)

@boq_routes.route('/item_material/<int:item_id>', methods=['GET'])
@jwt_required
def get_item_material_route(item_id):
    return get_item_material(item_id)

@boq_routes.route('/item_labour/<int:item_id>', methods=['GET'])
@jwt_required
def get_item_labours_route(item_id):
    return get_item_labours(item_id)

@boq_routes.route('/all_item', methods=['GET'])
@jwt_required
def get_all_item_route():
    return get_all_item()
    