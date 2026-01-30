"""
Admin Routes - Comprehensive system administration endpoints
"""

from flask import Blueprint
from controllers.admin_controller import *
from controllers.settings_controller import get_settings, update_settings, upload_signature, delete_signature
from controllers.auth_controller import jwt_required
from controllers.admin_controller import (
    get_all_boqs_admin,
    approve_boq_admin,
    get_all_project_managers,
    get_all_site_engineers,
    get_user_login_history,
    get_all_login_history
)

admin_routes = Blueprint("admin_routes", __name__, url_prefix='/api/admin')

# ============================================
# USER MANAGEMENT ROUTES
# ============================================

@admin_routes.route('/users', methods=['GET'])
@jwt_required
def get_users_route():
    """Get all users with filtering and pagination"""
    return get_all_users()

@admin_routes.route('/users', methods=['POST'])
@jwt_required
def create_user_route():
    """Create a new user"""
    return create_user()

@admin_routes.route('/users/<int:user_id>', methods=['PUT'])
@jwt_required
def update_user_route(user_id):
    """Update user information"""
    return update_user(user_id)

@admin_routes.route('/users/<int:user_id>', methods=['DELETE'])
@jwt_required
def delete_user_route(user_id):
    """Delete user (soft delete)"""
    return delete_user(user_id)

@admin_routes.route('/users/<int:user_id>/status', methods=['POST'])
@jwt_required
def toggle_user_status_route(user_id):
    """Activate/Deactivate user"""
    return toggle_user_status(user_id)

# ============================================
# ROLE MANAGEMENT ROUTES
# ============================================

@admin_routes.route('/roles', methods=['GET'])
@jwt_required
def get_roles_route():
    """Get all roles"""
    return get_all_roles()

# ============================================
# PROJECT MANAGEMENT ROUTES (Admin Override)
# ============================================

@admin_routes.route('/projects', methods=['GET'])
@jwt_required
def get_projects_admin_route():
    """Get all projects (admin view - no restrictions)"""
    return get_all_projects_admin()

@admin_routes.route('/projects/<int:project_id>/assign-pm', methods=['POST'])
@jwt_required
def assign_pm_route(project_id):
    """Assign/reassign project manager"""
    return assign_project_manager(project_id)

# ============================================
# RECENT ACTIVITY ROUTES
# ============================================

@admin_routes.route('/activity', methods=['GET'])
@jwt_required
def get_activity_route():
    """Get recent system activity"""
    return get_recent_activity()

# ============================================
# SETTINGS MANAGEMENT ROUTES
# ============================================

@admin_routes.route('/settings', methods=['GET'])
@jwt_required
def get_settings_route():
    """Get system settings"""
    return get_settings()

@admin_routes.route('/settings', methods=['PUT'])
@jwt_required
def update_settings_route():
    """Update system settings"""
    return update_settings()

@admin_routes.route('/settings/signature', methods=['POST'])
@jwt_required
def upload_signature_route():
    """Upload signature image for PDF generation"""
    return upload_signature()

@admin_routes.route('/settings/signature', methods=['DELETE'])
@jwt_required
def delete_signature_route():
    """Delete signature image"""
    return delete_signature()

# ============================================
# BOQ MANAGEMENT ROUTES
# ============================================

@admin_routes.route('/boqs', methods=['GET'])
@jwt_required
def get_boqs_route():
    """Get all BOQs with filtering"""
    return get_all_boqs_admin()

@admin_routes.route('/boqs/<int:boq_id>/approve', methods=['POST'])
@jwt_required
def approve_boq_route(boq_id):
    """Approve/Reject BOQ"""
    return approve_boq_admin(boq_id)

# ============================================
# PROJECT MANAGER & SITE ENGINEER ROUTES
# ============================================

@admin_routes.route('/project-managers', methods=['GET'])
@jwt_required
def get_project_managers_route():
    """Get all project managers with project counts"""
    return get_all_project_managers()

@admin_routes.route('/site-engineers', methods=['GET'])
@jwt_required
def get_site_engineers_route():
    """Get all site engineers with project counts"""
    return get_all_site_engineers()


# ============================================
# LOGIN HISTORY ROUTES
# ============================================

@admin_routes.route('/users/<int:user_id>/login-history', methods=['GET'])
@jwt_required
def get_user_login_history_route(user_id):
    """Get login history for a specific user"""
    return get_user_login_history(user_id)


@admin_routes.route('/login-history', methods=['GET'])
@jwt_required
def get_all_login_history_route():
    """Get login history for all users (recent overview)"""
    return get_all_login_history()


# ============================================
# COMPREHENSIVE DASHBOARD ANALYTICS ROUTES
# ============================================

@admin_routes.route('/dashboard/analytics', methods=['GET'])
@jwt_required
def get_dashboard_analytics_route():
    """Get comprehensive dashboard analytics"""
    from controllers.admin_controller import get_dashboard_analytics
    return get_dashboard_analytics()


@admin_routes.route('/dashboard/top-performers', methods=['GET'])
@jwt_required
def get_top_performers_route():
    """Get top performing users"""
    from controllers.admin_controller import get_top_performers
    return get_top_performers()


@admin_routes.route('/dashboard/financial-summary', methods=['GET'])
@jwt_required
def get_financial_summary_route():
    """Get financial summary for dashboard"""
    from controllers.admin_controller import get_financial_summary
    return get_financial_summary()
