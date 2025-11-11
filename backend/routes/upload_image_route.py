from flask import Blueprint, g, jsonify
from controllers.upload_image_controller import *

image_routes = Blueprint('image_routes', __name__, url_prefix='/api')

# Image Management routes
@image_routes.route('/upload_image/<int:id>', methods=['POST'])
def item_upload_image_route(id):
    return item_upload_image(id)

@image_routes.route('/images/<int:id>', methods=['GET'])
def get_item_images_route(id):
    return get_item_images(id)

@image_routes.route('/images/<int:id>', methods=['DELETE'])
def delete_item_images_route(id):
    return delete_item_images(id)

@image_routes.route('/images/all/<int:id>', methods=['DELETE'])
def delete_all_item_images_route(id):
    return delete_all_item_images(id)