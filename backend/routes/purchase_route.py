from flask import Blueprint, g, jsonify
from utils.authentication import jwt_required
from controllers.purchase_controller import *

purchase_routes = Blueprint('purchase_routes', __name__, url_prefix='/api')

# Helper function to check if user is PM or Admin (or Admin viewing as PM)
def check_pm_or_admin_access():
    """Check if current user is a Project Manager or Admin"""
    from utils.admin_viewing_context import get_effective_user_context

    current_user = g.user
    user_role = current_user.get('role', '').lower()

    # Allow admin directly
    if user_role == 'admin':
        return None

    # Check if admin is viewing as PM
    context = get_effective_user_context()
    effective_role = context.get('effective_role', user_role)

    if effective_role in ['projectmanager', 'project_manager']:
        return None

    return jsonify({"error": "Access denied. Project Manager or Admin role required."}), 403

# Helper function to check if user is Estimator or Admin (or Admin viewing as Estimator)
def check_estimator_or_admin_access():
    """Check if current user is an Estimator or Admin"""
    from utils.admin_viewing_context import get_effective_user_context

    current_user = g.user
    user_role = current_user.get('role', '').lower()

    # Allow admin directly
    if user_role == 'admin':
        return None

    # Check if admin is viewing as Estimator
    context = get_effective_user_context()
    effective_role = context.get('effective_role', user_role)

    if effective_role in ['estimator']:
        return None

    return jsonify({"error": "Access denied. Estimator or Admin role required."}), 403

# Add New Purchase to Existing BOQ
@purchase_routes.route('/new_purchase', methods=['POST'])
@jwt_required
def add_new_purchase_route():
    """PM or Admin adds new purchase to BOQ"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return add_new_purchase()

# Send New Purchase Notification to Estimator
@purchase_routes.route('/new_purchase/estimator/<int:boq_id>', methods=['POST'])
@jwt_required
def send_new_purchase_to_estimator(boq_id):
    """PM or Admin sends new purchase notification to Estimator"""
    access_check = check_pm_or_admin_access()
    if access_check:
        return access_check
    return new_purchase_send_estimator(boq_id)

# Estimator Approves or Rejects New Purchase (Single API)
@purchase_routes.route('/new_purchase/decision/<int:boq_id>', methods=['POST'])
@jwt_required
def process_purchase_decision(boq_id):
    """Estimator or Admin processes new purchase decision"""
    access_check = check_estimator_or_admin_access()
    if access_check:
        return access_check
    return process_new_purchase_decision(boq_id)