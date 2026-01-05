"""
Support Ticket Routes - Standalone Public API
All routes are public (no auth required)
"""

from flask import Blueprint
from controllers.support_ticket_controller import (
    public_create_ticket,
    public_get_all_tickets,
    public_update_ticket,
    public_submit_ticket,
    public_delete_ticket,
    public_confirm_resolution,
    admin_get_all_tickets,
    admin_approve_ticket,
    admin_reject_ticket,
    admin_resolve_ticket,
    admin_update_status,
    admin_add_files,
    admin_close_ticket,
    add_comment
)

# Create blueprint with URL prefix
support_routes = Blueprint('support_routes', __name__, url_prefix='/api/support')


# ============ PUBLIC ROUTES (No Auth Required) ============

@support_routes.route('/public/create', methods=['POST'])
def create_ticket_route():
    """Create a new support ticket"""
    return public_create_ticket()


@support_routes.route('/public/all', methods=['GET'])
def get_all_tickets_route():
    """Get all tickets"""
    return public_get_all_tickets()


@support_routes.route('/public/<int:ticket_id>', methods=['PUT'])
def update_ticket_route(ticket_id):
    """Update a ticket"""
    return public_update_ticket(ticket_id)


@support_routes.route('/public/<int:ticket_id>/submit', methods=['POST'])
def submit_ticket_route(ticket_id):
    """Submit a draft ticket"""
    return public_submit_ticket(ticket_id)


@support_routes.route('/public/<int:ticket_id>', methods=['DELETE'])
def delete_ticket_route(ticket_id):
    """Delete a ticket"""
    return public_delete_ticket(ticket_id)


@support_routes.route('/public/<int:ticket_id>/confirm', methods=['POST'])
def confirm_resolution_route(ticket_id):
    """Confirm resolution"""
    return public_confirm_resolution(ticket_id)


# ============ ADMIN/DEV TEAM ROUTES (No Auth - Internal Use) ============

@support_routes.route('/admin/all', methods=['GET'])
def admin_get_all_route():
    """Get all tickets for dev team"""
    return admin_get_all_tickets()


@support_routes.route('/admin/<int:ticket_id>/approve', methods=['POST'])
def admin_approve_route(ticket_id):
    """Approve a ticket"""
    return admin_approve_ticket(ticket_id)


@support_routes.route('/admin/<int:ticket_id>/reject', methods=['POST'])
def admin_reject_route(ticket_id):
    """Reject a ticket"""
    return admin_reject_ticket(ticket_id)


@support_routes.route('/admin/<int:ticket_id>/resolve', methods=['POST'])
def admin_resolve_route(ticket_id):
    """Mark as resolved"""
    return admin_resolve_ticket(ticket_id)


@support_routes.route('/admin/<int:ticket_id>/status', methods=['PUT'])
def admin_status_route(ticket_id):
    """Update ticket status"""
    return admin_update_status(ticket_id)


@support_routes.route('/admin/<int:ticket_id>/files', methods=['POST'])
def admin_files_route(ticket_id):
    """Add files to ticket"""
    return admin_add_files(ticket_id)


@support_routes.route('/admin/<int:ticket_id>/close', methods=['POST'])
def admin_close_route(ticket_id):
    """Close a ticket directly (if client forgets)"""
    return admin_close_ticket(ticket_id)


# ============ COMMENT ROUTES (Both Client and Dev Team) ============

@support_routes.route('/<int:ticket_id>/comment', methods=['POST'])
def add_comment_route(ticket_id):
    """Add a comment to a ticket"""
    return add_comment(ticket_id)
