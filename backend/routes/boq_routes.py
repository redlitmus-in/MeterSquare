"""
BOQ Routes - API endpoints for Bill of Quantities management
"""
from flask import Blueprint, g, jsonify, current_app
from utils.authentication import jwt_required

# Rate limit decorator helper for heavy endpoints
def rate_limit(limit_string):
    """Apply rate limiting to expensive endpoints like PDF generation"""
    def decorator(f):
        from functools import wraps
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get limiter from app context
            limiter = getattr(current_app, 'limiter', None)
            if limiter:
                # Apply limit dynamically
                limited_func = limiter.limit(limit_string)(f)
                return limited_func(*args, **kwargs)
            return f(*args, **kwargs)
        return decorated_function
    return decorator
from controllers.boq_controller import *
from controllers.boq_upload_controller import *
from controllers.boq_bulk_controller import bulk_upload_boq
from controllers.boq_revisions import *
from controllers.boq_internal_revisions_controller import *
from controllers.download_boq_pdf import *

boq_routes = Blueprint('boq_routes', __name__, url_prefix='/api')

# Helper function - BOQ routes accessible by Estimator, PM, MEP, SE, TD, or Admin
def check_boq_access():
    """Check if current user can access BOQ operations"""
    current_user = g.user
    user_role = current_user.get('role', '').lower()
    allowed_roles = ['estimator', 'projectmanager', 'mep', 'technicaldirector', 'admin', 'siteengineer', 'sitesupervisor']
    if user_role not in allowed_roles:
        return jsonify({"error": "Access denied. Estimator, PM, MEP, SE, TD, or Admin role required."}), 403
    return None

# BOQ Management
@boq_routes.route('/create_boq', methods=['POST'])
@jwt_required
def create_boq_route():
    """Create BOQ (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return create_boq()

@boq_routes.route('/all_boq', methods=['GET'])
@jwt_required
def get_all_boq_route():
    """View all BOQs (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_all_boq()

@boq_routes.route('/boq/<int:boq_id>', methods=['GET'])
@jwt_required
def get_boq_route(boq_id):
    """View single BOQ (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_boq(boq_id)

@boq_routes.route('/boq/update_boq/<int:boq_id>', methods=['PUT'])
@jwt_required
def update_boq_route(boq_id):
    """Update BOQ (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return update_boq(boq_id)

@boq_routes.route('/revision_boq/<int:boq_id>', methods=['PUT'])
@jwt_required
def revision_boq_route(boq_id):
    """Create BOQ revision (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return revision_boq(boq_id)

@boq_routes.route('/delete_boq/<int:boq_id>', methods=['DELETE'])
@jwt_required
def delete_boq_route(boq_id):
    """Delete BOQ (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return delete_boq(boq_id)

@boq_routes.route('/sub_item/<int:item_id>', methods=['GET'])
@jwt_required
def get_sub_item_route(item_id):
    """Get sub-items (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_sub_item(item_id)

@boq_routes.route('/item_labour/<int:item_id>', methods=['GET'])
@jwt_required
def get_sub_item_labours_route(item_id):
    """Get item labours (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_sub_item_labours(item_id)

@boq_routes.route('/all_item', methods=['GET'])
@jwt_required
def get_all_item_route():
    """Get all items (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_all_item()

# BOQ Email Notification technical director
@boq_routes.route('/boq_email/<int:boq_id>', methods=['GET'])
@jwt_required
def send_boq_email_route(boq_id):
    """Send BOQ email to TD (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return send_boq_email(boq_id)

#  BOQ Upload and Extraction Routes
@boq_routes.route('/boq/upload', methods=['POST'])
@jwt_required
def upload_boq_route():
    """Upload BOQ file (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return upload_boq_file()

@boq_routes.route('/boq_history/<int:boq_id>', methods=['GET'])
@jwt_required
def get_boq_history_route(boq_id):
    """Get BOQ history (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_boq_history(boq_id)

@boq_routes.route('/estimator_dashboard', methods=['GET'])
@jwt_required
def get_estimator_dashboard_route():
    """Get estimator dashboard (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_estimator_dashboard()

# BOQ Bulk Upload
@boq_routes.route('/boq/bulk_upload', methods=['POST'])
@jwt_required
def bulk_upload_boq_route():
    """Bulk upload BOQ (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return bulk_upload_boq()

# BOQ Revisions - Dynamic Tabs
@boq_routes.route('/boq/revision-tabs', methods=['GET'])
@jwt_required
def get_revision_tabs_route():
    """Get revision tabs (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_revision_tabs()

@boq_routes.route('/boq/revisions/<revision_number>', methods=['GET'])
@jwt_required
def get_projects_by_revision_route(revision_number):
    """Get projects by revision (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_projects_by_revision(revision_number)

@boq_routes.route('/boq/revision-statistics', methods=['GET'])
@jwt_required
def get_revision_statistics_route():
    """Get revision statistics (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_revision_statistics()

@boq_routes.route('/boq/<int:boq_id>/internal_revisions', methods=['GET'])
@jwt_required
def get_internal_revisions_route(boq_id):
    """Get internal revisions (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_internal_revisions(boq_id)

@boq_routes.route('/material/<int:sub_item_id>', methods=['GET'])
@jwt_required
def  get_sub_item_material_route(sub_item_id):
    """Get sub-item materials (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return  get_sub_item_material(sub_item_id)

@boq_routes.route('/update_internal_boq/<int:boq_id>', methods=['PUT'])
@jwt_required
def update_internal_revision_boq_route(boq_id):
    """Update internal BOQ revision (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return update_internal_revision_boq(boq_id)

@boq_routes.route('/boqs/internal_revisions', methods=['GET'])
@jwt_required
def get_all_internal_revision_route():
    """Get all internal revisions (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_all_internal_revision()

# PDF Download Routes - Rate limited to prevent abuse (CPU-intensive operations)
@boq_routes.route('/boq/download/internal/<int:boq_id>', methods=['GET'])
@jwt_required
@rate_limit("15 per hour")  # PDF generation is CPU-intensive
def download_internal_pdf_route(boq_id):
    """Download internal BOQ PDF (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return download_internal_pdf()

@boq_routes.route('/boq/download/client/<int:boq_id>', methods=['GET', 'POST'])
@jwt_required
@rate_limit("15 per hour")  # PDF generation is CPU-intensive
def download_client_pdf_route(boq_id):
    """Download client BOQ PDF (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return download_client_pdf()

@boq_routes.route('/boq/preview/client/<int:boq_id>', methods=['POST'])
@jwt_required
@rate_limit("20 per hour")  # Preview is slightly less intensive than download
def preview_client_pdf_route(boq_id):
    """Preview client BOQ PDF with cover page (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return preview_client_pdf()

@boq_routes.route('/boq/download/internal-excel/<int:boq_id>', methods=['GET'])
@jwt_required
@rate_limit("30 per hour")  # Excel generation is less intensive than PDF
def download_internal_excel_route(boq_id):
    return download_internal_excel()

@boq_routes.route('/boq/download/client-excel/<int:boq_id>', methods=['GET'])
@jwt_required
@rate_limit("30 per hour")  # Excel generation is less intensive than PDF
def download_client_excel_route(boq_id):
    return download_client_excel()

@boq_routes.route('/client_td_approval', methods=['POST'])
@jwt_required
def client_revision_td_mail_send_route():
    """Send client revision to TD for approval (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return client_revision_td_mail_send()

# Custom Units Management
@boq_routes.route('/custom-units', methods=['GET'])
@jwt_required
def get_custom_units_route():
    """Get all custom units (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return get_custom_units()

@boq_routes.route('/custom-units', methods=['POST'])
@jwt_required
def create_custom_unit_route():
    """Create a new custom unit (Estimator, PM, SE, TD, or Admin)"""
    access_check = check_boq_access()
    if access_check:
        return access_check
    return create_custom_unit()