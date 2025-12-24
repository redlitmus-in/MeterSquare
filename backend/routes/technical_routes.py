from flask import Blueprint, g, jsonify
from controllers.projectmanager_controller import (
    create_pm,
    get_all_pm,
    get_pm_id,
    update_pm,
    delete_pm,
    assign_projects
)
from utils.authentication import jwt_required
from controllers.techical_director_controller import (
    get_all_td_boqs,
    td_mail_send,
    get_td_se_boq_vendor_requests,
    get_td_dashboard_stats,
    get_td_purchase_orders,
    get_td_purchase_order_by_id
)
from utils.response_cache import cached_response, cache_dashboard_data

technical_routes = Blueprint('technical_routes', __name__, url_prefix='/api')

# Helper function to check if user is TD or Admin
def check_td_or_admin_access():
    """Check if current user is a Technical Director or Admin"""
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    if user_role not in ['technicaldirector', 'admin', 'estimator']:
        return jsonify({"error": "Access denied. Technical Director or Admin role required."}), 403
    return None

# Helper function to check if user is Estimator, TD or Admin
def check_estimator_td_or_admin_access():
    """Check if current user is an Estimator, Technical Director or Admin"""
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    if user_role not in ['estimator', 'technicaldirector', 'admin']:
        return jsonify({"error": "Access denied. Estimator, Technical Director or Admin role required."}), 403
    return None

# BOQ Management
@technical_routes.route('/td_boqs', methods=['GET'])
@jwt_required
@cached_response(timeout=30, key_prefix='td_boqs')  # Cache for 30 seconds
def get_all_td_boqs_route():
    """TD or Admin views all BOQs"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return get_all_td_boqs()

@technical_routes.route('/td_approval', methods=['POST'])
@jwt_required
def td_mail_send_route():
    """Estimator, TD or Admin sends BOQ to PM"""
    access_check = check_estimator_td_or_admin_access()
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
@cached_response(timeout=60, key_prefix='all_pm')  # Cache for 60 seconds (rarely changes)
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

# Get all MEP Supervisors (for TD to assign to projects)
@technical_routes.route('/all_meps', methods=['GET'])
@jwt_required
def get_all_meps_route():
    """TD or Admin gets all MEP Supervisors"""
    from flask import jsonify, g
    from models.user import User
    from models.role import Role
    from app import db

    access_check = check_td_or_admin_access()
    if access_check:
        return access_check

    try:
        # Get all users with MEP role
        meps = db.session.query(User).join(
            Role, User.role_id == Role.role_id
        ).filter(
            Role.role.in_(['mep', 'MEP', 'mep_supervisor', 'MEP Supervisor']),
            User.is_deleted == False
        ).all()

        mep_list = [{
            'user_id': mep.user_id,
            'full_name': mep.full_name,
            'email': mep.email,
            'phone': mep.phone,
            'is_active': mep.is_active,
            'role': mep.role.role if mep.role else 'Unknown'
        } for mep in meps]

        return jsonify({
            "users": mep_list,
            "count": len(mep_list)
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

#Assign MEP Supervisor to projects
@technical_routes.route('/assign_mep_projects', methods=['POST'])
@jwt_required
def assign_mep_projects_route():
    """TD or Admin assigns MEP Supervisors to projects"""
    from flask import request, jsonify, g
    from models.project import Project
    from app import db

    access_check = check_td_or_admin_access()
    if access_check:
        return access_check

    try:
        data = request.get_json()
        mep_ids = data.get('mep_ids', [])
        project_ids = data.get('project_ids', [])

        if not mep_ids or not project_ids:
            return jsonify({"error": "MEP IDs and Project IDs are required"}), 400

        assigned_count = 0
        for project_id in project_ids:
            project = Project.query.filter_by(project_id=project_id).first()
            if project:
                # Update mep_supervisor_id as JSONB array
                project.mep_supervisor_id = mep_ids
                assigned_count += 1

        db.session.commit()

        return jsonify({
            "message": f"Successfully assigned {len(mep_ids)} MEP(s) to {assigned_count} project(s)",
            "assigned_projects": assigned_count
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

# SE BOQ Vendor Approval routes
@technical_routes.route('/se-boq-vendor-requests', methods=['GET'])
@jwt_required
def get_td_se_boq_vendor_requests_route():
    """Get all SE BOQ vendor approval requests for TD"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return get_td_se_boq_vendor_requests()

# Dashboard Statistics
@technical_routes.route('/td-dashboard-stats', methods=['GET'])
@jwt_required
@cache_dashboard_data(timeout=30)  # Cache dashboard for 30 seconds
def get_td_dashboard_stats_route():
    """Get comprehensive dashboard statistics for Technical Director"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return get_td_dashboard_stats()

# TD Purchase Orders - View-only access to purchase orders
@technical_routes.route('/td-purchase-orders', methods=['GET'])
@jwt_required
@cached_response(timeout=15, key_prefix='td_purchases')
def get_td_purchase_orders_route():
    """Get all purchase orders for TD view (read-only)"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return get_td_purchase_orders()

@technical_routes.route('/td-purchase-order/<int:cr_id>', methods=['GET'])
@jwt_required
def get_td_purchase_order_by_id_route(cr_id):
    """Get specific purchase order details for TD view"""
    access_check = check_td_or_admin_access()
    if access_check:
        return access_check
    return get_td_purchase_order_by_id(cr_id) 

