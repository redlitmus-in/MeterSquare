from operator import or_
from flask import request, jsonify, g
from models.boq import *
from config.logging import get_logger
from models.user import User
from models.role import Role

log = get_logger()

def get_all_sitesupervisor():
    try:
        # Get the siteEngineer role
        role = Role.query.filter_by(role='siteEngineer').first()

        if not role:
            return jsonify({"error": "Site Engineer role not found"}), 404

        # Get all users with siteEngineer role
        get_user = User.query.filter_by(role_id=role.role_id, is_deleted=False).all()

        # Build response
        sitesupervisor_details = []
        for user in get_user:
            if user:
                sitesupervisor_details.append({
                    "user_id": user.user_id,
                    "user_name": user.full_name,
                    "role": role.role,
                    "user_status": user.user_status,
                    "phone": user.phone,
                    "department": user.department,
                    "is_active": user.is_active,
                    "is_deleted": user.is_deleted,
                    "last_login": user.last_login.isoformat() if user.last_login else None,
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                    "last_modified_at": user.last_modified_at.isoformat() if user.last_modified_at else None
                })

        return jsonify({
            "sitesupervisor_details": sitesupervisor_details
        }), 200

    except Exception as e:
        log.error(f"Error fetching sitesupervisor: {str(e)}")
        return jsonify({"error": f"Failed to fetch sitesupervisor: {str(e)}"}), 500
