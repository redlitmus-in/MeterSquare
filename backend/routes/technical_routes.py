from flask import Blueprint
from controllers.projectmanager_controller import *
from utils.authentication import jwt_required
from controllers.techical_director_controller import *
from controllers.send_boq_client import send_boq_to_client

technical_routes = Blueprint('technical_routes', __name__, url_prefix='/api')

# BOQ Management
@technical_routes.route('/td_boqs', methods=['GET'])
@jwt_required
def get_all_td_boqs_route():
    return get_all_td_boqs()

@technical_routes.route('/td_approval', methods=['POST'])
@jwt_required
def td_mail_send_route():
    return td_mail_send()

@technical_routes.route('/send_boq_to_client', methods=['POST'])
@jwt_required
def send_boq_to_client_route():
    return send_boq_to_client()

@technical_routes.route('/craete_pm', methods=['POST'])
@jwt_required
def create_pm_route():
    return create_pm()

#All project manager listout assign and unassign project
@technical_routes.route('/all_pm', methods=['GET'])
@jwt_required
def get_all_pm_route():
    return get_all_pm()

#Particular Project manager view
@technical_routes.route('/get_pm/<int:user_id>', methods=['GET'])
@jwt_required
def get_pm_id_route(user_id):
    return get_pm_id(user_id)

#Edit project manager
@technical_routes.route('/update_pm/<int:user_id>', methods=['PUT'])
@jwt_required
def update_pm_route(user_id):
    return update_pm(user_id) 

#Delete Project manager
@technical_routes.route('/delete_pm/<int:user_id>', methods=['DELETE'])
@jwt_required
def delete_pm_route(user_id):
    return delete_pm(user_id) 

#Assign project manager
@technical_routes.route('/assign_projects', methods=['POST'])
@jwt_required
def assign_projects_route():
    return assign_projects() 

