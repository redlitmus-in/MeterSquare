from flask import Blueprint
from controllers.admin_controller import *
from utils.authentication import *

admin_routes = Blueprint("admin_routes", __name__, url_prefix='/api')

# Public routes (no authentication required)
@admin_routes.route('/all_ss', methods=['GET'])
def get_all_sitesupervisor_route():
    return get_all_sitesupervisor()
