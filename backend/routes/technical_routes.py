from flask import Blueprint, g, jsonify
from controllers.projectmanager_controller import *
from utils.authentication import jwt_required
from controllers.techical_director_controller import *

technical_routes = Blueprint('technical_routes', __name__, url_prefix='/api')

# Helper function to check if user is TD or Admin
def check_td_or_admin_access():
    """Check if current user is a Technical Director or Admin"""
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    if user_role not in ['technicaldirector', 'admin']:
        return jsonify({"error": "Access denied. Technical Director or Admin role required."}), 403
    return None

# BOQ Management
@technical_routes.route('/td_boqs', methods=['GET'])
@jwt_required
def get_all_td_boqs_route():
    """TD or Admin views all BOQs"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return get_all_td_boqs()

@technical_routes.route('/td_approval', methods=['POST'])
@jwt_required
def td_mail_send_route():
    """TD or Admin approves/rejects BOQ"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return td_mail_send()

@technical_routes.route('/craete_pm', methods=['POST'])
@jwt_required
def create_pm_route():
    """TD or Admin creates Project Manager"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return create_pm()

#All project manager listout assign and unassign project
@technical_routes.route('/all_pm', methods=['GET'])
@jwt_required
def get_all_pm_route():
    """TD or Admin views all PMs"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return get_all_pm()

#Particular Project manager view
@technical_routes.route('/get_pm/<int:user_id>', methods=['GET'])
@jwt_required
def get_pm_id_route(user_id):
    """TD or Admin views specific PM"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return get_pm_id(user_id)

#Edit project manager
@technical_routes.route('/update_pm/<int:user_id>', methods=['PUT'])
@jwt_required
def update_pm_route(user_id):
    """TD or Admin updates PM"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return update_pm(user_id)

#Delete Project manager
@technical_routes.route('/delete_pm/<int:user_id>', methods=['DELETE'])
@jwt_required
def delete_pm_route(user_id):
    """TD or Admin deletes PM"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return delete_pm(user_id)

#Assign project manager
@technical_routes.route('/assign_projects', methods=['POST'])
@jwt_required
def assign_projects_route():
    """TD or Admin assigns PM to projects"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return assign_projects()

# SE BOQ Vendor Approval routes
@technical_routes.route('/se-boq-vendor-requests', methods=['GET'])
@jwt_required
def get_td_se_boq_vendor_requests_route():
    """Get all SE BOQ vendor approval requests for TD"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return get_td_se_boq_vendor_requests() 

