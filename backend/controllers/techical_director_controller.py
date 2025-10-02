from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role

log = get_logger()

def get_all_td_boqs():
    try:
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 10, type=int), 100)

        # Build query - get all BOQs
        query = db.session.query(BOQ).filter(
            BOQ.is_deleted == False,
            BOQ.email_sent == True,
        ).order_by(BOQ.created_at.desc())

        # Paginate
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        # Build response with BOQ details and history
        boqs_list = []
        for boq in paginated.items:
            # Get BOQ history (will be empty array if no history)
            history = BOQHistory.query.filter_by(boq_id=boq.boq_id).order_by(BOQHistory.action_date.desc()).all()

            # Get BOQ details
            boq_details = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()

            # Serialize history data
            history_list = []
            for h in history:
                history_list.append({
                    "boq_history_id": h.boq_history_id,
                    "action": h.action,
                    "action_by": h.action_by,
                    "boq_status": h.boq_status,
                    "sender": h.sender,
                    "receiver": h.receiver,
                    "comments": h.comments,
                    "sender_role": h.sender_role,
                    "receiver_role": h.receiver_role,
                    "action_date": h.action_date.isoformat() if h.action_date else None,
                    "created_at": h.created_at.isoformat() if h.created_at else None
                })

            boq_data = {
                "boq_id": boq.boq_id,
                "project_id": boq.project_id,
                "boq_name": boq.boq_name,
                "status": boq.status,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "created_by": boq.created_by,
                "last_modified_at": boq.last_modified_at.isoformat() if boq.last_modified_at else None,
                "last_modified_by": boq.last_modified_by,
                "email_sent": boq.email_sent,
                "project_name": boq.project.project_name if boq.project else None,
                "total_cost": float(boq_details.total_cost) if boq_details and boq_details.total_cost else 0.0,
                "total_items": int(boq_details.total_items) if boq_details and boq_details.total_items else 0,
                "history": history_list  # Will be [] if no history exists
            }
            boqs_list.append(boq_data)

        return jsonify({
            "boqs": boqs_list,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated.total,
                "pages": paginated.pages,
                "has_prev": paginated.has_prev,
                "has_next": paginated.has_next
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching BOQs: {str(e)}")
        return jsonify({"error": f"Failed to fetch BOQs: {str(e)}"}), 500
