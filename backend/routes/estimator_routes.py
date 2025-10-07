from flask import Blueprint, request, jsonify
from controllers.send_boq_client import send_boq_to_client
from controllers.estimator_controller import confirm_client_approval
from utils.authentication import jwt_required

estimator_routes = Blueprint('estimator_routes', __name__, url_prefix='/api')

# Client confirmation endpoint
@estimator_routes.route('/send_boq_to_client', methods=['POST'])
@jwt_required
def send_boq_to_client_route():
    return send_boq_to_client()

@estimator_routes.route('/confirm_client_approval/<int:boq_id>', methods=['PUT'])
@jwt_required
def confirm_client_approval_route(boq_id):
    return confirm_client_approval(boq_id)

@estimator_routes.route('/reject_client_approval/<int:boq_id>', methods=['PUT'])
@jwt_required
def reject_client_approval(boq_id):
    """Estimator confirms that client has rejected the BOQ"""
    from models.boq import BOQ
    from config.db import db
    from flask import g

    try:
        data = request.get_json()
        rejection_reason = data.get('rejection_reason', '')

        if not rejection_reason:
            return jsonify({"success": False, "error": "Rejection reason is required"}), 400

        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()

        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Check if BOQ is in correct status
        if boq.status != "Sent_for_Confirmation":
            return jsonify({
                "success": False,
                "error": f"BOQ must be in 'Sent_for_Confirmation' status. Current status: {boq.status}"
            }), 400

        # Update status to Client_Rejected
        boq.status = "Client_Rejected"
        boq.notes = rejection_reason  # Store rejection reason in notes
        boq.last_modified_at = datetime.utcnow()

        current_user = getattr(g, 'user', None)
        if current_user:
            boq.last_modified_by = current_user.get('email', 'Unknown')

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Client rejection recorded successfully",
            "boq_id": boq_id,
            "status": boq.status,
            "rejection_reason": rejection_reason
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@estimator_routes.route('/cancel_boq/<int:boq_id>', methods=['PUT'])
@jwt_required
def cancel_boq(boq_id):
    """Estimator cancels BOQ because client doesn't want to proceed"""
    from models.boq import BOQ
    from config.db import db
    from flask import g

    try:
        data = request.get_json()
        cancellation_reason = data.get('cancellation_reason', '')

        if not cancellation_reason:
            return jsonify({"success": False, "error": "Cancellation reason is required"}), 400

        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()

        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # BOQ can be cancelled from any status (except completed)
        if boq.status == "Completed":
            return jsonify({
                "success": False,
                "error": "Cannot cancel a completed BOQ"
            }), 400

        # Update status to Cancelled
        boq.status = "Cancelled"
        boq.notes = cancellation_reason  # Store cancellation reason
        boq.last_modified_at = datetime.utcnow()

        current_user = getattr(g, 'user', None)
        if current_user:
            boq.last_modified_by = current_user.get('email', 'Unknown')

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "BOQ cancelled successfully",
            "boq_id": boq_id,
            "status": boq.status,
            "cancellation_reason": cancellation_reason
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
