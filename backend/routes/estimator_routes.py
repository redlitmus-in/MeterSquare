from flask import Blueprint, request, jsonify
from controllers.send_boq_client import send_boq_to_client
from controllers.estimator_controller import confirm_client_approval
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