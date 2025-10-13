from flask import Blueprint, jsonify
from controllers.boq_tracking_controller import get_boq_planned_vs_actual
from utils.authentication import jwt_required
from models.boq import MaterialPurchaseTracking, LabourTracking
import json

boq_tracking_routes = Blueprint("boq_tracking_routes", __name__, url_prefix='/api')

# Get BOQ planned vs actual comparison
@boq_tracking_routes.route('/planned-vs-actual/<int:boq_id>', methods=['GET'])
@jwt_required
def get_planned_vs_actual_route(boq_id):
    return get_boq_planned_vs_actual(boq_id)

# Debug endpoint to check tracking data
@boq_tracking_routes.route('/debug/tracking-data/<int:boq_id>', methods=['GET'])
@jwt_required
def debug_tracking_data(boq_id):
    """Debug endpoint to see raw tracking data"""
    materials = MaterialPurchaseTracking.query.filter_by(
        boq_id=boq_id, is_deleted=False
    ).all()

    labour = LabourTracking.query.filter_by(
        boq_id=boq_id, is_deleted=False
    ).all()

    materials_data = []
    for m in materials:
        materials_data.append({
            "purchase_tracking_id": m.purchase_tracking_id,
            "master_item_id": m.master_item_id,
            "item_name": m.item_name,
            "master_material_id": m.master_material_id,
            "material_name": m.material_name,
            "total_quantity_purchased": m.total_quantity_purchased,
            "unit": m.unit,
            "latest_unit_price": float(m.latest_unit_price) if m.latest_unit_price else None,
            "purchase_history": m.purchase_history,
            "purchase_history_type": str(type(m.purchase_history)),
            "created_by": m.created_by,
            "created_at": m.created_at.isoformat() if m.created_at else None
        })

    labour_data = []
    for l in labour:
        labour_data.append({
            "labour_tracking_id": l.labour_tracking_id,
            "master_item_id": l.master_item_id,
            "master_labour_id": l.master_labour_id,
            "total_hours_worked": l.total_hours_worked,
            "total_cost": float(l.total_cost) if l.total_cost else None,
            "labour_history": l.labour_history
        })

    return jsonify({
        "boq_id": boq_id,
        "materials_count": len(materials_data),
        "materials": materials_data,
        "labour_count": len(labour_data),
        "labour": labour_data
    }), 200