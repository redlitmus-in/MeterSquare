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
from routes.preliminary_master_routes import preliminary_master_routes
from routes.preliminary_purchase_routes import preliminary_purchase_bp
from routes.vendor_routes import vendor_routes
from routes.terms_conditions_routes import terms_conditions_routes
from routes.upload_image_route import image_routes
from routes.inventory_routes import inventory_routes
from routes.asset_routes import asset_routes
from routes.asset_dn_routes import asset_dn_routes
from routes.asset_disposal_routes import asset_disposal_routes
from routes.support_routes import support_routes

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
    app.register_blueprint(preliminary_master_routes)
    app.register_blueprint(preliminary_purchase_bp)
    app.register_blueprint(vendor_routes)
    app.register_blueprint(terms_conditions_routes)
    app.register_blueprint(image_routes)
    app.register_blueprint(inventory_routes)
    app.register_blueprint(asset_routes)
    app.register_blueprint(asset_dn_routes)
    app.register_blueprint(asset_disposal_routes)
    app.register_blueprint(support_routes)