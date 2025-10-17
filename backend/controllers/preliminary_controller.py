"""
Preliminary Controller - CRUD operations for Preliminaries & Approval Works
"""
from flask import jsonify, request, g
from models.preliminary import Preliminary
from config.db import db
from datetime import datetime
import logging

log = logging.getLogger(__name__)


def create_preliminary():
    """
    Create or update preliminary items for a BOQ
    - If project_id exists in database: Update existing preliminary
    - If project_id does NOT exist: Create new preliminary

    Expected JSON payload:
    {
        "items": [
            {"id": "1", "description": "...", "selected": true},
            {"id": "2", "description": "...", "selected": false}
        ],
        "quantity": 1,
        "unit": "item",
        "rate": 100.0,
        "amount": 100.0,
        "project_id": 305,  // Optional
        "is_default": true
    }
    """
    try:
        data = request.get_json()
        # Validate required fields
        if not data.get('items'):
            return jsonify({"error": "Items array is required"}), 400

        items = data.get('items')
        if not isinstance(items, list) or len(items) == 0:
            return jsonify({"error": "Items must be a non-empty array"}), 400

        # Get current user from JWT
        current_user = getattr(g, 'user', None)
        user_name = current_user.get('full_name') if current_user else 'system'

        project_id = data.get('project_id')
        is_default = data.get('is_default', False)

        # Check if preliminary exists for this project_id
        existing_preliminary = None
        if project_id:
            existing_preliminary = Preliminary.query.filter_by(
                project_id=project_id,
                is_deleted=False
            ).first()

        # Prepare description data with all items (including selected=false)
        description_data = {
            "items": [
                {
                    "id": item.get("id", str(idx + 1)),
                    "description": item.get("description", ""),
                    "selected": item.get("selected", False)
                }
                for idx, item in enumerate(items)
            ]
        }

        # UPDATE existing preliminary
        if existing_preliminary:
            existing_preliminary.description = description_data
            existing_preliminary.quantity = data.get('quantity', existing_preliminary.quantity)
            existing_preliminary.unit = data.get('unit', existing_preliminary.unit)
            existing_preliminary.rate = data.get('rate', existing_preliminary.rate)
            existing_preliminary.amount = data.get('amount', existing_preliminary.amount)
            existing_preliminary.is_default = is_default
            existing_preliminary.last_modified_by = user_name
            existing_preliminary.last_modified_at = datetime.utcnow()

            db.session.commit()

            log.info(f"Updated preliminary {existing_preliminary.preliminary_id} for BOQ {project_id}")

            return jsonify({
                "message": "Preliminary updated successfully",
                "preliminary_id": existing_preliminary.preliminary_id,
                "total_items": len(items),
                "preliminary": {
                    "preliminary_id": existing_preliminary.preliminary_id,
                    "description": existing_preliminary.description,
                    "quantity": existing_preliminary.quantity,
                    "unit": existing_preliminary.unit,
                    "rate": existing_preliminary.rate,
                    "amount": existing_preliminary.amount,
                    "project_id": existing_preliminary.project_id,
                    "is_default": existing_preliminary.is_default,
                    "last_modified_at": existing_preliminary.last_modified_at.isoformat() if existing_preliminary.last_modified_at else None,
                    "last_modified_by": existing_preliminary.last_modified_by
                }
            }), 200

        # CREATE new preliminary
        new_preliminary = Preliminary(
            description=description_data,
            quantity=data.get('quantity', 1),
            unit=data.get('unit'),
            rate=data.get('rate'),
            amount=data.get('amount'),
            project_id=project_id,
            is_default=is_default,
            created_by=user_name,
            created_at=datetime.utcnow()
        )

        db.session.add(new_preliminary)
        db.session.commit()

        log.info(f"Preliminary created successfully: ID {new_preliminary.preliminary_id}")

        return jsonify({
            "message": "Preliminary created successfully",
            "preliminary_id": new_preliminary.preliminary_id,
            "total_items": len(items),
            "preliminary": {
                "preliminary_id": new_preliminary.preliminary_id,
                "description": new_preliminary.description,
                "quantity": new_preliminary.quantity,
                "unit": new_preliminary.unit,
                "rate": new_preliminary.rate,
                "amount": new_preliminary.amount,
                "project_id": new_preliminary.project_id,
                "is_default": new_preliminary.is_default,
                "created_at": new_preliminary.created_at.isoformat() if new_preliminary.created_at else None,
                "created_by": new_preliminary.created_by
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating/updating preliminary: {str(e)}")
        return jsonify({"error": f"Failed to create/update preliminary: {str(e)}"}), 500

def get_latest_preliminary():
    """
    Get the latest updated preliminary item
    Query parameters:
    - is_default: Filter by default status (optional)
    """
    try:
        # Get query parameters
        is_default = request.args.get('is_default')

        # Build query
        query = Preliminary.query.filter_by(is_deleted=False)

        if is_default is not None:
            is_default_bool = is_default.lower() in ['true', '1', 'yes']
            query = query.filter_by(is_default=is_default_bool)

        # Get the latest updated record
        latest_prelim = query.order_by(Preliminary.last_modified_at.desc()).first()

        if not latest_prelim:
            return jsonify({"message": "No preliminary records found"}), 404

        # Format response
        prelim_data = {
            "preliminary_id": latest_prelim.preliminary_id,
            "description": latest_prelim.description,
            "quantity": latest_prelim.quantity,
            "unit": latest_prelim.unit,
            "rate": latest_prelim.rate,
            "amount": latest_prelim.amount,
            "is_default": latest_prelim.is_default,
            "created_at": latest_prelim.created_at.isoformat() if latest_prelim.created_at else None,
            "created_by": latest_prelim.created_by,
            "last_modified_at": latest_prelim.last_modified_at.isoformat() if latest_prelim.last_modified_at else None,
            "last_modified_by": latest_prelim.last_modified_by
        }

        return jsonify({"preliminary": prelim_data}), 200

    except Exception as e:
        log.error(f"Error fetching latest preliminary: {str(e)}")
        return jsonify({"error": f"Failed to fetch latest preliminary: {str(e)}"}), 500
