from routes.admin_route import admin_routes
from routes.auth_route import auth_routes
from routes.project_routes import project_routes
from routes.boq_routes import boq_routes
from routes.technical_routes import technical_routes
from routes.projectmanager_routes import pm_routes
from routes.sitesupervisor_routes import sitesupervisor_routes
from routes.estimator_routes import estimator_routes
from routes.purchase_route import purchase_routes
from routes.change_request_routes import change_request_routes
from routes.boq_tracking_routes import boq_tracking_routes
from routes.buyer_routes import buyer_routes
from routes.preliminary_routes import preliminary_routes

# Import and register the routes from the route blueprints

def initialize_routes(app):
    app.register_blueprint(auth_routes)
    app.register_blueprint(project_routes)
    app.register_blueprint(boq_routes)
    app.register_blueprint(technical_routes)
    app.register_blueprint(pm_routes)
    app.register_blueprint(sitesupervisor_routes)
    app.register_blueprint(estimator_routes)
    app.register_blueprint(purchase_routes)
    app.register_blueprint(change_request_routes)
    app.register_blueprint(admin_routes)
    app.register_blueprint(boq_tracking_routes)
    app.register_blueprint(buyer_routes)
    app.register_blueprint(preliminary_routes)