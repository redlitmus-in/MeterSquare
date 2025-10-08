from flask import Blueprint
from controllers.site_supervisor_controller import *
from utils.authentication import *

sitesupervisor_routes = Blueprint("sitesupervisor_routes", __name__, url_prefix='/api')

#Role base view a site supervisor boq
@sitesupervisor_routes.route('/sitesupervisor_boq', methods=['GET'])
@jwt_required
def get_all_sitesupervisor_boqs_route():
    return get_all_sitesupervisor_boqs()

#Dashboard statistics for site engineer
@sitesupervisor_routes.route('/sitesupervisor_boq/dashboard', methods=['GET'])
@jwt_required
def get_sitesupervisor_dashboard_route():
    return get_sitesupervisor_dashboard()

#Site Engineer requests project completion
@sitesupervisor_routes.route('/request_completion/<int:project_id>', methods=['POST'])
@jwt_required
def request_project_completion_route(project_id):
    return request_project_completion(project_id)