from flask import Blueprint, request, jsonify
from datetime import datetime
from controllers.send_boq_client import *
from controllers.estimator_controller import *
from utils.authentication import jwt_required

estimator_routes = Blueprint('estimator_routes', __name__, url_prefix='/api')

# Client confirmation endpoint
@estimator_routes.route('/send_boq_to_client', methods=['POST'])
@jwt_required
def send_boq_to_client_route():
    return send_boq_to_client()

@estimator_routes.route('/confirm_client_approval/<int:boq_id>', methods=['PUT'])
@jwt_required
def confirm_client_approval_route(boq_id):
    return confirm_client_approval(boq_id)

@estimator_routes.route('/reject_client_approval/<int:boq_id>', methods=['PUT'])
@jwt_required
def reject_client_approval_route(boq_id):
 return reject_client_approval(boq_id)

@estimator_routes.route('/cancel_boq/<int:boq_id>', methods=['PUT'])
@jwt_required
def cancel_boq_route(boq_id):
    return cancel_boq(boq_id)

# revision history view
@estimator_routes.route('/boq_details_history/<int:boq_id>', methods=['GET'])
@jwt_required
def get_boq_details_history_route(boq_id):
    return get_boq_details_history(boq_id)

# BOQ Email Notification to Project Manager
@estimator_routes.route('/boq/send_to_pm', methods=['POST'])
@jwt_required
def send_boq_to_pm_route():
    return send_boq_to_project_manager()