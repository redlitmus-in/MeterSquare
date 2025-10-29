"""
BOQ Routes - API endpoints for Bill of Quantities management
"""
from flask import Blueprint
from utils.authentication import jwt_required
from controllers.boq_controller import *
from controllers.boq_upload_controller import *
from controllers.boq_bulk_controller import bulk_upload_boq
from controllers.boq_revisions import *
from controllers.boq_internal_revisions_controller import *
from controllers.download_boq_pdf import *

boq_routes = Blueprint('boq_routes', __name__, url_prefix='/api')

# BOQ Management
@boq_routes.route('/create_boq', methods=['POST'])
@jwt_required
def create_boq_route():
    return create_boq()

@boq_routes.route('/all_boq', methods=['GET'])
@jwt_required
def get_all_boq_route():
    return get_all_boq()

@boq_routes.route('/boq/<int:boq_id>', methods=['GET'])
@jwt_required
def get_boq_route(boq_id):
    return get_boq(boq_id)

@boq_routes.route('/boq/update_boq/<int:boq_id>', methods=['PUT'])
@jwt_required
def update_boq_route(boq_id):
    return update_boq(boq_id)

@boq_routes.route('/revision_boq/<int:boq_id>', methods=['PUT'])
@jwt_required
def revision_boq_route(boq_id):
    return revision_boq(boq_id)

@boq_routes.route('/delete_boq/<int:boq_id>', methods=['DELETE'])
@jwt_required
def delete_boq_route(boq_id):
    return delete_boq(boq_id)

@boq_routes.route('/sub_item/<int:item_id>', methods=['GET'])
@jwt_required
def get_sub_item_route(item_id):
    return get_sub_item(item_id)

@boq_routes.route('/item_labour/<int:item_id>', methods=['GET'])
@jwt_required
def get_sub_item_labours_route(item_id):
    return get_sub_item_labours(item_id)

@boq_routes.route('/all_item', methods=['GET'])
@jwt_required
def get_all_item_route():
    return get_all_item()

# BOQ Email Notification technical director
@boq_routes.route('/boq_email/<int:boq_id>', methods=['GET'])
@jwt_required
def send_boq_email_route(boq_id):
    return send_boq_email(boq_id)

#  BOQ Upload and Extraction Routes
@boq_routes.route('/boq/upload', methods=['POST'])
@jwt_required
def upload_boq_route():
    return upload_boq_file()

@boq_routes.route('/boq_history/<int:boq_id>', methods=['GET'])
@jwt_required
def get_boq_history_route(boq_id):
    return get_boq_history(boq_id)

@boq_routes.route('/estimator_dashboard', methods=['GET'])
@jwt_required
def get_estimator_dashboard_route():
    return get_estimator_dashboard()

# BOQ Bulk Upload
@boq_routes.route('/boq/bulk_upload', methods=['POST'])
@jwt_required
def bulk_upload_boq_route():
    return bulk_upload_boq()

# BOQ Revisions - Dynamic Tabs
@boq_routes.route('/boq/revision-tabs', methods=['GET'])
@jwt_required
def get_revision_tabs_route():
    return get_revision_tabs()

@boq_routes.route('/boq/revisions/<revision_number>', methods=['GET'])
@jwt_required
def get_projects_by_revision_route(revision_number):
    return get_projects_by_revision(revision_number)

@boq_routes.route('/boq/revision-statistics', methods=['GET'])
@jwt_required
def get_revision_statistics_route():
    return get_revision_statistics()

@boq_routes.route('/boq/<int:boq_id>/internal_revisions', methods=['GET'])
@jwt_required
def get_internal_revisions_route(boq_id):
    return get_internal_revisions(boq_id)

@boq_routes.route('/material/<int:sub_item_id>', methods=['GET'])
@jwt_required
def  get_sub_item_material_route(sub_item_id):
    return  get_sub_item_material(sub_item_id)

@boq_routes.route('/update_internal_boq/<int:boq_id>', methods=['PUT'])
@jwt_required
def update_internal_revision_boq_route(boq_id):
    return update_internal_revision_boq(boq_id)

@boq_routes.route('/boqs/internal_revisions', methods=['GET'])
@jwt_required
def get_all_internal_revision_route():
    return get_all_internal_revision()

# PDF Download Routes
@boq_routes.route('/boq/download/internal/<int:boq_id>', methods=['GET'])
@jwt_required
def download_internal_pdf_route(boq_id):
    return download_internal_pdf()

@boq_routes.route('/boq/download/client/<int:boq_id>', methods=['GET'])
@jwt_required
def download_client_pdf_route(boq_id):
    return download_client_pdf()

@boq_routes.route('/boq/download/internal-excel/<int:boq_id>', methods=['GET'])
@jwt_required
def download_internal_excel_route(boq_id):
    return download_internal_excel()

@boq_routes.route('/boq/download/client-excel/<int:boq_id>', methods=['GET'])
@jwt_required
def download_client_excel_route(boq_id):
    return download_client_excel()

@boq_routes.route('/client_td_approval', methods=['POST'])
@jwt_required
def client_revision_td_mail_send_route():
    return client_revision_td_mail_send()