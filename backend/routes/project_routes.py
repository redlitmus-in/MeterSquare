from flask import Blueprint
from controllers.project_controller import *
from utils.authentication import *

project_routes = Blueprint("project_routes", __name__, url_prefix='/api')

# Public routes (no authentication required)
@project_routes.route('/create_project', methods=['POST'])
@jwt_required
def create_project_route():
    return create_project()

@project_routes.route('/all_project', methods=['GET'])
@jwt_required
def get_all_projects_route():
    return get_all_projects()

@project_routes.route('/project/<int:project_id>', methods=['GET'])
@jwt_required
def get_project_by_id_route(project_id):
    return get_project_by_id(project_id)

@project_routes.route('/update_project/<int:project_id>', methods=['PUT'])
@jwt_required
def update_project_route(project_id):
    return update_project(project_id)

@project_routes.route('/delete_project/<int:project_id>', methods=['DELETE'])
@jwt_required
def delete_project_route(project_id):
    return delete_project(project_id)

@project_routes.route('/projects/assigned-to-me', methods=['GET'])
@jwt_required
def get_assigned_projects_route():
    """Get projects assigned to the current user with BOQ structure"""
    return get_assigned_projects()

# Day Extension Routes
@project_routes.route('/boq/<int:boq_id>/request-day-extension', methods=['POST'])
@jwt_required
def request_day_extension_route(boq_id):
    return request_day_extension(boq_id)

@project_routes.route('/boq/<int:boq_id>/pending-day-extensions', methods=['GET'])
@jwt_required
def get_pending_day_extensions_route(boq_id):
    return get_pending_day_extensions(boq_id)

@project_routes.route('/boq/<int:boq_id>/edit_day_extension', methods=['POST'])
@jwt_required
def edit_day_extension_route(boq_id):
    return edit_day_extension(boq_id)

@project_routes.route('/boq/<int:boq_id>/approve_day_extension', methods=['POST'])
@jwt_required
def approve_day_extension_route(boq_id):
    return approve_day_extension(boq_id)

@project_routes.route('/boq/<int:boq_id>/reject_day_extension', methods=['POST'])
@jwt_required
def reject_day_extension_route(boq_id):
    return reject_day_extension(boq_id)

