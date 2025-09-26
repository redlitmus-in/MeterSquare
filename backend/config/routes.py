import logging
from routes.auth_route import auth_routes
from routes.project_routes import project_routes

# Import and register the routes from the route blueprints

def initialize_routes(app):
    app.register_blueprint(auth_routes)
    app.register_blueprint(project_routes)
    
    
