from flask import Blueprint, g, jsonify, current_app
from controllers.upload_image_controller import *

image_routes = Blueprint('image_routes', __name__, url_prefix='/api')

# Rate limit decorator helper for heavy endpoints
def rate_limit(limit_string):
    """Apply rate limiting to expensive endpoints like file uploads"""
    def decorator(f):
        from functools import wraps
        @wraps(f)
        def decorated_function(*args, **kwargs):
            limiter = getattr(current_app, 'limiter', None)
            if limiter:
                limited_func = limiter.limit(limit_string)(f)
                return limited_func(*args, **kwargs)
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Image Management routes - Rate limited to prevent abuse
@image_routes.route('/upload_image/<int:id>', methods=['POST'])
@rate_limit("50 per hour")  # Image upload with compression is resource-intensive
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