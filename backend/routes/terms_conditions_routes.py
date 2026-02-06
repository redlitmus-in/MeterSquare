"""
Terms & Conditions Routes - API endpoints for managing BOQ Terms & Conditions templates
"""
from controllers.terms_conditions_controller import *
from flask import Blueprint
from utils.authentication import jwt_required

terms_conditions_routes = Blueprint('terms', __name__, url_prefix='/api')

@terms_conditions_routes.route('/terms', methods=['GET'])
@jwt_required
def get_all_terms_route():
    return get_all_terms()

@terms_conditions_routes.route('/terms/default', methods=['GET'])
@jwt_required
def get_default_terms_route():
    return get_default_terms()

@terms_conditions_routes.route('/terms/<int:term_id>', methods=['GET'])
@jwt_required
def get_term_by_id_route(term_id):
    return get_term_by_id_(term_id)

@terms_conditions_routes.route('/terms', methods=['POST'])
@jwt_required
def create_term_route():
    return create_term()

@terms_conditions_routes.route('/terms/<int:term_id>', methods=['PUT'])
@jwt_required
def update_term_route(term_id):
    return update_term(term_id)

@terms_conditions_routes.route('/terms/<int:term_id>', methods=['DELETE'])
@jwt_required
def delete_term_route(term_id):
    return delete_term(term_id)

# ===== BOQ-SPECIFIC TERMS ENDPOINTS _route(Similar to Preliminaries) =====

@terms_conditions_routes.route('/boq/<int:boq_id>/terms', methods=['GET'])
@jwt_required
def get_boq_terms_route(boq_id):
    return get_boq_terms(boq_id)

@terms_conditions_routes.route('/boq/<int:boq_id>/terms', methods=['POST'])
@jwt_required
def save_boq_terms_route(boq_id):
    return save_boq_terms(boq_id)

@terms_conditions_routes.route('/boq/<int:boq_id>/terms/selected', methods=['GET'])
@jwt_required
def get_boq_selected_terms_route(boq_id):
    return get_boq_selected_terms(boq_id)

@terms_conditions_routes.route('/terms-master', methods=['GET'])
@jwt_required
def get_all_terms_master_route():
    return get_all_terms_master()


@terms_conditions_routes.route('/terms-master', methods=['POST'])
@jwt_required
def create_term_master_route():
    return create_term_master()

@terms_conditions_routes.route('/terms-master/<int:term_id>', methods=['PUT'])
@jwt_required
def update_term_master_route(term_id):
    return update_term_master(term_id)


@terms_conditions_routes.route('/terms-master/<int:term_id>', methods=['DELETE'])
@jwt_required
def delete_term_master_route(term_id):
    return delete_term_master(term_id)