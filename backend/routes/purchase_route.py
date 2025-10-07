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

# Estimator Approves New Purchase
@purchase_routes.route('/new_purchase/approve/<int:boq_id>', methods=['POST'])
@jwt_required
def approve_new_purchase_route(boq_id):
    return approve_new_purchase(boq_id)

# Estimator Rejects New Purchase
@purchase_routes.route('/new_purchase/reject/<int:boq_id>', methods=['POST'])
@jwt_required
def reject_new_purchase_route(boq_id):
    return reject_new_purchase(boq_id)