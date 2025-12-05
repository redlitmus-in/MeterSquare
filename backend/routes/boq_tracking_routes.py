from flask import Blueprint, jsonify
from controllers.boq_tracking_controller import get_boq_planned_vs_actual
from utils.authentication import jwt_required
from models.boq import MaterialPurchaseTracking, LabourTracking
import json

boq_tracking_routes = Blueprint("boq_tracking_routes", __name__, url_prefix='/api')

# Get BOQ planned vs actual comparison
@boq_tracking_routes.route('/planned-vs-actual/<int:boq_id>', methods=['GET'])
@jwt_required
def get_planned_vs_actual_route(boq_id):
    return get_boq_planned_vs_actual(boq_id)