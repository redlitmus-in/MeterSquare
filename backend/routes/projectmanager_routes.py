from flask import Blueprint
from controllers.site_supervisor_controller import *
from controllers.projectmanager_controller import *
from controllers.buyer_controller import (
    create_buyer,
    get_all_buyers,
    get_buyer_id,
    update_buyer,
    delete_buyer
)
from utils.authentication import *

pm_routes = Blueprint("pm_routes", __name__, url_prefix='/api')

# ============================================================================
# BOQ ROUTES - Project Manager BOQ Management
# ============================================================================

#Role based listout a boq
@pm_routes.route('/pm_boq', methods=['GET'])
@jwt_required
def get_all_PM_boqs_route():
    return get_all_pm_boqs()

@pm_routes.route('/boq/send_estimator', methods=['POST'])
@jwt_required
def send_boq_to_estimator_route():
    return send_boq_to_estimator()


# ============================================================================
# SITE ENGINEER (SE) ROUTES - PM manages Site Engineers
# ============================================================================

# Create site engineer/supervisor
@pm_routes.route('/create_sitesupervisor', methods=['POST'])
@jwt_required
def create_sitesupervisor_route():
    """PM creates a new Site Engineer"""
    return create_sitesupervisor()

# Get all site engineers/supervisors
@pm_routes.route('/all_sitesupervisor', methods=['GET'])
@jwt_required
def get_all_sitesupervisor_route():
    """PM views all Site Engineers"""
    return get_all_sitesupervisor()

# Get specific site engineer by ID
@pm_routes.route('/get_sitesupervisor/<int:site_supervisor_id>', methods=['GET'])
@jwt_required
def get_sitesupervisor_id_route(site_supervisor_id):
    """PM views a specific Site Engineer"""
    return get_sitesupervisor_id(site_supervisor_id)

# Update site engineer
@pm_routes.route('/update_sitesupervisor/<int:site_supervisor_id>', methods=['PUT'])
@jwt_required
def update_sitesupervisor_route(site_supervisor_id):
    """PM updates Site Engineer details"""
    return update_sitesupervisor(site_supervisor_id)

# Delete site engineer
@pm_routes.route('/delete_sitesupervisor/<int:site_supervisor_id>', methods=['DELETE'])
@jwt_required
def delete_sitesupervisor_route(site_supervisor_id):
    """PM deletes a Site Engineer"""
    return delete_sitesupervisor(site_supervisor_id)

# Assign site engineer to project
@pm_routes.route('/ss_assign', methods=['POST'])
@jwt_required
def assign_projects_sitesupervisor_route():
    """PM assigns Site Engineer to projects"""
    return assign_projects_sitesupervisor()


# ============================================================================
# BUYER ROUTES - PM manages Buyers
# ============================================================================

# Create buyer
@pm_routes.route('/create_buyer', methods=['POST'])
@jwt_required
def create_buyer_route():
    """PM creates a new Buyer"""
    return create_buyer()

# Get all buyers
@pm_routes.route('/all_buyers', methods=['GET'])
@jwt_required
def get_all_buyers_route():
    """PM views all Buyers (assigned and unassigned)"""
    return get_all_buyers()

# Get specific buyer by ID
@pm_routes.route('/get_buyer/<int:user_id>', methods=['GET'])
@jwt_required
def get_buyer_id_route(user_id):
    """PM views a specific Buyer with assigned projects"""
    return get_buyer_id(user_id)

# Update buyer
@pm_routes.route('/update_buyer/<int:user_id>', methods=['PUT'])
@jwt_required
def update_buyer_route(user_id):
    """PM updates Buyer details"""
    return update_buyer(user_id)

# Delete buyer
@pm_routes.route('/delete_buyer/<int:user_id>', methods=['DELETE'])
@jwt_required
def delete_buyer_route(user_id):
    """PM deletes a Buyer"""
    return delete_buyer(user_id) 
