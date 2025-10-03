from flask import Blueprint
from controllers.projectmanager_controller import *
from utils.authentication import *

pm_routes = Blueprint("pm_routes", __name__, url_prefix='/api')

@pm_routes.route('/craete_pm', methods=['POST'])
@jwt_required
def create_pm_route():
    return create_pm()

@pm_routes.route('/pm_boq', methods=['GET'])
@jwt_required
def get_all_PM_boqs_route():
    return get_all_pm_boqs()

@pm_routes.route('/all_pm', methods=['GET'])
@jwt_required
def get_all_pm_route():
    return get_all_pm()

@pm_routes.route('/get_pm/<int:user_id>', methods=['GET'])
@jwt_required
def get_pm_id_route(user_id):
    return get_pm_id(user_id)

@pm_routes.route('/update_pm/<int:user_id>', methods=['PUT'])
@jwt_required
def update_pm_route(user_id):
    return update_pm(user_id) 

@pm_routes.route('/delete_pm/<int:user_id>', methods=['DELETE'])
@jwt_required
def delete_pm_route(user_id):
    return delete_pm(user_id) 

@pm_routes.route('/assign_projects', methods=['POST'])
@jwt_required
def assign_projects_route():
    return assign_projects() 

