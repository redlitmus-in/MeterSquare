from flask import Blueprint
from controllers.site_supervisor_controller import *
from controllers.projectmanager_controller import *
from utils.authentication import *

pm_routes = Blueprint("pm_routes", __name__, url_prefix='/api')

#Role based listout a boq
@pm_routes.route('/pm_boq', methods=['GET'])
@jwt_required
def get_all_PM_boqs_route():
    return get_all_pm_boqs()

#Create site supervisor
@pm_routes.route('/create_sitesupervisor', methods=['POST'])
@jwt_required
def create_sitesupervisor_route():
    return create_sitesupervisor()

#All sitesupervisor list
@pm_routes.route('/all_sitesupervisor', methods=['GET'])
@jwt_required
def get_all_sitesupervisor_route():
    return get_all_sitesupervisor()

#Particular site supervisor view
@pm_routes.route('/get_sitesupervisor/<int:site_supervisor_id>', methods=['GET'])
@jwt_required
def get_sitesupervisor_id_route(site_supervisor_id):
    return get_sitesupervisor_id(site_supervisor_id)

#Edit site supervisor
@pm_routes.route('/update_sitesupervisor/<int:site_supervisor_id>', methods=['PUT'])
@jwt_required
def update_sitesupervisor_route(site_supervisor_id):
    return update_sitesupervisor(site_supervisor_id) 

#Delete site supervisor
@pm_routes.route('/delete_sitesupervisor/<int:site_supervisor_id>', methods=['DELETE'])
@jwt_required
def delete_sitesupervisor_route(site_supervisor_id):
    return delete_sitesupervisor(site_supervisor_id) 

#Assign site supervisor
@pm_routes.route('/ss_assign', methods=['POST'])
@jwt_required
def assign_projects_sitesupervisor_route():
    return assign_projects_sitesupervisor()

