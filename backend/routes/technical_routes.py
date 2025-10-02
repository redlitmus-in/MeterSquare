from flask import Blueprint
from utils.authentication import jwt_required
from controllers.techical_director_controller import *

technical_routes = Blueprint('technical_routes', __name__, url_prefix='/api')

# BOQ Management
@technical_routes.route('/td_boqs', methods=['GET'])
@jwt_required
def get_all_td_boqs_route():
    return get_all_td_boqs()


