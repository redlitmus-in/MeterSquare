from flask import Blueprint, request, jsonify, g
from datetime import datetime
from controllers.send_boq_client import *
from controllers.estimator_controller import *
from utils.authentication import jwt_required

estimator_routes = Blueprint('estimator_routes', __name__, url_prefix='/api')

# Helper function to check if user is Estimator or Admin
def check_estimator_or_admin_access():
    """Check if current user is an Estimator or Admin"""
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    if user_role not in ['estimator', 'admin']:
        return jsonify({"error": "Access denied. Estimator or Admin role required."}), 403
    return None

# Client confirmation endpoint
@estimator_routes.route('/send_boq_to_client', methods=['POST'])
@jwt_required
def send_boq_to_client_route():
    """Estimator or Admin sends BOQ to client"""
    access_check = check_estimator_or_admin_access()
    if access_check:
        return access_check
    return send_boq_to_client()

@estimator_routes.route('/confirm_client_approval/<int:boq_id>', methods=['PUT'])
@jwt_required
def confirm_client_approval_route(boq_id):
    """Estimator or Admin confirms client approval"""
    access_check = check_estimator_or_admin_access()
    if access_check:
        return access_check
    return confirm_client_approval(boq_id)

@estimator_routes.route('/reject_client_approval/<int:boq_id>', methods=['PUT'])
@jwt_required
def reject_client_approval_route(boq_id):
    """Estimator or Admin rejects client approval"""
    access_check = check_estimator_or_admin_access()
    if access_check:
        return access_check
    return reject_client_approval(boq_id)

@estimator_routes.route('/cancel_boq/<int:boq_id>', methods=['PUT'])
@jwt_required
def cancel_boq_route(boq_id):
    """Estimator or Admin cancels BOQ"""
    access_check = check_estimator_or_admin_access()
    if access_check:
        return access_check
    return cancel_boq(boq_id)

# revision history view
@estimator_routes.route('/boq_details_history/<int:boq_id>', methods=['GET'])
@jwt_required
def get_boq_details_history_route(boq_id):
    """Estimator, TD, or Admin views BOQ history"""
    # Allow Estimator, TechnicalDirector, and Admin
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    if user_role not in ['estimator', 'technicaldirector', 'admin']:
        return jsonify({"error": "Access denied. Estimator, Technical Director, or Admin role required."}), 403
    return get_boq_details_history(boq_id)

# BOQ Email Notification to Project Manager
@estimator_routes.route('/boq/send_to_pm', methods=['POST'])
@jwt_required
def send_boq_to_pm_route():
    """Estimator or Admin sends BOQ to PM"""
    access_check = check_estimator_or_admin_access()
    if access_check:
        return access_check
    return send_boq_to_project_manager()

# BOQ Email Notification to Technical Director (after PM approval)
@estimator_routes.route('/boq/send_to_td', methods=['POST'])
@jwt_required
def send_boq_to_td_route():
    """Estimator or Admin sends BOQ to TD"""
    access_check = check_estimator_or_admin_access()
    if access_check:
        return access_check
    return send_boq_to_technical_director()