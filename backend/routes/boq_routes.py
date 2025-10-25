"""
BOQ Routes - API endpoints for Bill of Quantities management
"""
from flask import Blueprint
from utils.authentication import jwt_required
from controllers.boq_controller import *
from controllers.boq_upload_controller import *
from controllers.boq_bulk_controller import bulk_upload_boq
from controllers.boq_revisions import get_revision_tabs, get_projects_by_revision, get_revision_statistics
from controllers.boq_internal_revisions_controller import *

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

# Day Extension Routes
@boq_routes.route('/boq/<int:boq_id>/request-day-extension', methods=['POST'])
@jwt_required
def request_day_extension_route(boq_id):
    return request_day_extension(boq_id)

@boq_routes.route('/boq/<int:boq_id>/approve-day-extension/<int:history_id>', methods=['POST'])
@jwt_required
def approve_day_extension_route(boq_id, history_id):
    return approve_day_extension(boq_id, history_id)

@boq_routes.route('/boq/<int:boq_id>/reject-day-extension/<int:history_id>', methods=['POST'])
@jwt_required
def reject_day_extension_route(boq_id, history_id):
    return reject_day_extension(boq_id, history_id)

