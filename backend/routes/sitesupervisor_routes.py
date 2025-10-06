from flask import Blueprint
from controllers.site_supervisor_controller import *
from utils.authentication import *

sitesupervisor_routes = Blueprint("sitesupervisor_routes", __name__, url_prefix='/api')

#Role base view a site supervisor boq
@sitesupervisor_routes.route('/sitesupervisor_boq', methods=['GET'])
@jwt_required
def get_all_sitesupervisor_boqs_route():
    return get_all_sitesupervisor_boqs()