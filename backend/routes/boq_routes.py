"""
BOQ Routes - API endpoints for Bill of Quantities management
"""
from flask import Blueprint
from utils.authentication import jwt_required
from controllers.boq_controller import *
from controllers.boq_upload_controller import *
from controllers.boq_bulk_controller import bulk_upload_boq
from controllers.boq_revisions import get_revision_tabs, get_projects_by_revision, get_revision_statistics
from controllers.boq_internal_revisions_controller import (
    track_internal_revision,
    get_internal_revisions,
    get_all_boqs_with_internal_revisions
)

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

@boq_routes.route('/update_boq/<int:boq_id>', methods=['PUT'])
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

@boq_routes.route('/item_material/<int:item_id>', methods=['GET'])
@jwt_required
def get_item_material_route(item_id):
    return get_item_material(item_id)

@boq_routes.route('/item_labour/<int:item_id>', methods=['GET'])
@jwt_required
def get_item_labours_route(item_id):
    return get_item_labours(item_id)

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

# BOQ Internal Revisions (PM edits, TD rejections before client)
@boq_routes.route('/boq/<int:boq_id>/track_internal_revision', methods=['POST'])
@jwt_required
def track_internal_revision_route(boq_id):
    return track_internal_revision()

@boq_routes.route('/boq/<int:boq_id>/internal_revisions', methods=['GET'])
@jwt_required
def get_internal_revisions_route(boq_id):
    return get_internal_revisions(boq_id)

@boq_routes.route('/boqs/internal_revisions', methods=['GET'])
@jwt_required
def get_all_boqs_with_internal_revisions_route():
    return get_all_boqs_with_internal_revisions()

