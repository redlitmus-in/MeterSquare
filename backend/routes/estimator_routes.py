from flask import Blueprint, request, jsonify
from utils.authentication import jwt_required
from controllers.boq_controller import *

estimator_routes = Blueprint('estimator_routes', __name__, url_prefix='/api')

# Client confirmation endpoint
@estimator_routes.route('/confirm_client_approval/<int:boq_id>', methods=['PUT'])
@jwt_required
def confirm_client_approval(boq_id):
    """Estimator confirms that client has approved the BOQ"""
    from models.boq import BOQ
    from config.db import db
    from flask import g
    
    try:
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404
        
        # Check if BOQ is in correct status
        if boq.status != "Sent_for_Confirmation":
            return jsonify({
                "success": False, 
                "error": f"BOQ must be in 'Sent_for_Confirmation' status. Current status: {boq.status}"
            }), 400
        
        # Update status to Client_Confirmed
        boq.status = "Client_Confirmed"
        boq.last_modified_at = datetime.utcnow()
        
        current_user = getattr(g, 'user', None)
        if current_user:
            boq.last_modified_by = current_user.get('email', 'Unknown')
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Client approval confirmed successfully",
            "boq_id": boq_id,
            "status": boq.status
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
