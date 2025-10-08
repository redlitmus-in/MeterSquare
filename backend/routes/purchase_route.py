from flask import Blueprint
from utils.authentication import jwt_required
from controllers.purchase_controller import *

purchase_routes = Blueprint('purchase_routes', __name__, url_prefix='/api')

# Add New Purchase to Existing BOQ
@purchase_routes.route('/new_purchase', methods=['POST'])
@jwt_required
def add_new_purchase_route():
    return add_new_purchase()

# Send New Purchase Notification to Estimator
@purchase_routes.route('/new_purchase/estimator/<int:boq_id>', methods=['POST'])
@jwt_required
def send_new_purchase_to_estimator(boq_id):
    return new_purchase_send_estimator(boq_id)

# Estimator Approves or Rejects New Purchase (Single API)
@purchase_routes.route('/new_purchase/decision/<int:boq_id>', methods=['POST'])
@jwt_required
def process_purchase_decision(boq_id):
    return process_new_purchase_decision(boq_id)