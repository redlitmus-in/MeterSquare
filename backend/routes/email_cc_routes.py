from flask import Blueprint
from controllers.auth_controller import jwt_required
from controllers.email_cc_controller import (
    get_cc_defaults,
    add_cc_default,
    remove_cc_default,
    get_buyer_cc_recipients,
    add_buyer_cc_recipient,
    remove_buyer_cc_recipient,
    search_users_for_cc,
)

email_cc_routes = Blueprint('email_cc_routes', __name__)


# Admin: default CC management
@email_cc_routes.route('/api/email/cc-defaults', methods=['GET'])
@jwt_required
def get_defaults_route():
    return get_cc_defaults()


@email_cc_routes.route('/api/admin/email/cc-defaults', methods=['POST'])
@jwt_required
def add_default_route():
    return add_cc_default()


@email_cc_routes.route('/api/admin/email/cc-defaults/<int:default_id>', methods=['DELETE'])
@jwt_required
def remove_default_route(default_id):
    return remove_cc_default(default_id)


# Buyer: custom CC management
@email_cc_routes.route('/api/buyer/cc-recipients', methods=['GET'])
@jwt_required
def get_buyer_recipients_route():
    return get_buyer_cc_recipients()


@email_cc_routes.route('/api/buyer/cc-recipients', methods=['POST'])
@jwt_required
def add_buyer_recipient_route():
    return add_buyer_cc_recipient()


@email_cc_routes.route('/api/buyer/cc-recipients/<int:recipient_id>', methods=['DELETE'])
@jwt_required
def remove_buyer_recipient_route(recipient_id):
    return remove_buyer_cc_recipient(recipient_id)


# User search for typeahead
@email_cc_routes.route('/api/users/search', methods=['GET'])
@jwt_required
def search_users_route():
    return search_users_for_cc()
