from flask import Blueprint
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

