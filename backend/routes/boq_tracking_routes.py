from flask import Blueprint, jsonify
from controllers.boq_tracking_controller import *
from utils.authentication import jwt_required
from models.boq import MaterialPurchaseTracking, LabourTracking
import json

boq_tracking_routes = Blueprint("boq_tracking_routes", __name__, url_prefix='/api')

# Get BOQ planned vs actual comparison
@boq_tracking_routes.route('/planned-vs-actual/<int:boq_id>', methods=['GET'])
@jwt_required
def get_planned_vs_actual_route(boq_id):
    return get_boq_planned_vs_actual(boq_id)


# Get material purchase comparison for a specific project
@boq_tracking_routes.route('/purchase_comparison/<int:project_id>', methods=['GET'])
@jwt_required
def get_purchase_comparison_route(project_id):
    return get_purchase_comparision(project_id)


# Get all projects that have purchase data (CR with valid statuses)
@boq_tracking_routes.route('/purchase_comparison_projects', methods=['GET'])
@jwt_required
def get_all_purchase_boq_route():
    return get_all_purchase_comparision_projects()


# Get comprehensive labour workflow details for a BOQ
@boq_tracking_routes.route('/labour_workflow/<int:boq_id>', methods=['GET'])
@jwt_required
def get_labour_workflow_details_route(boq_id):
    return get_labour_workflow_details(boq_id)