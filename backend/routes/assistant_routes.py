# routes/assistant_routes.py
"""In-app Guide Assistant (answers questions from the user guide via Groq)."""

from flask import Blueprint, current_app, request

from utils.authentication import jwt_required
from controllers.assistant_controller import assistant_status, assistant_chat

assistant_routes = Blueprint('assistant_routes', __name__, url_prefix='/api/assistant')


@assistant_routes.route('/status', methods=['GET'])
@jwt_required
def assistant_status_route():
    return assistant_status()


@assistant_routes.route('/chat', methods=['POST', 'OPTIONS'])
@jwt_required
def assistant_chat_route():
    if request.method == 'OPTIONS':
        return current_app.make_default_options_response()
    # Per-client limit to protect the Groq quota
    limited = current_app.limiter.limit("20 per minute")(assistant_chat)
    return limited()
