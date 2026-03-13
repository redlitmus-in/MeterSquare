"""
Preliminary Master Controller - CRUD operations for master preliminary items
"""
from flask import jsonify, request, g
from models.preliminary_master import PreliminaryMaster, BOQPreliminary
from config.db import db
from datetime import datetime
import logging

log = logging.getLogger(__name__)


def get_all_preliminary_masters():
    """
    Get all active preliminary master items
    Returns the complete list of available preliminaries that can be selected in BOQs
    """
    try:
        # Fetch all active preliminary items, ordered by display_order
        preliminaries = PreliminaryMaster.query.filter_by(
            is_deleted=False,
            is_active=True
        ).order_by(PreliminaryMaster.display_order.asc()).all()

        return jsonify({
            "success": True,
            "data": [prelim.to_dict() for prelim in preliminaries],
            "count": len(preliminaries)
        }), 200

    except Exception as e:
        log.error(f"Error fetching preliminary masters: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch preliminary masters: {str(e)}"
        }), 500


def get_boq_preliminaries_with_selections(boq_id):
    """
    Get all preliminary masters with their selection status for a specific BOQ.
    Returns ALL available preliminaries with is_checked=true/false based on
    whether their prelim_id exists in the BOQ's JSONB array.
    """
    try:
        # Fetch all active preliminary masters
        all_preliminaries = PreliminaryMaster.query.filter_by(
            is_deleted=False,
            is_active=True
        ).order_by(PreliminaryMaster.display_order.asc()).all()

        # Fetch the selected prelim_ids from the single JSONB row
        selected_ids = set()
        if boq_id:
            boq_prelim = BOQPreliminary.query.filter_by(boq_id=boq_id).first()
            if boq_prelim and boq_prelim.prelim_id:
                selected_ids = set(boq_prelim.prelim_id)

        # Build response with all preliminaries and their selection status
        result = []
        for prelim in all_preliminaries:
            result.append({
                'prelim_id': prelim.prelim_id,
                'name': prelim.name,
                'description': prelim.description,
                'unit': prelim.unit,
                'rate': prelim.rate,
                'display_order': prelim.display_order,
                'is_checked': prelim.prelim_id in selected_ids
            })

        return jsonify({
            "success": True,
            "boq_id": boq_id,
            "data": result,
            "count": len(result),
            "selected_count": len(selected_ids)
        }), 200

    except Exception as e:
        log.error(f"Error fetching BOQ preliminaries: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch BOQ preliminaries: {str(e)}"
        }), 500


def save_boq_preliminary_selections(boq_id):
    """
    Save preliminary selections for a BOQ as a single JSONB row.
    Stores only the prelim_ids of checked items: [1, 3, 6]

    Expected JSON:
    {
        "selections": [
            {"prelim_id": 1, "is_checked": true},
            {"prelim_id": 2, "is_checked": false},
            ...
        ]
    }
    """
    try:
        data = request.get_json()
        selections = data.get('selections', [])

        if not selections:
            return jsonify({
                "success": False,
                "error": "No selections provided"
            }), 400

        # Filter to only checked items and collect their prelim_ids
        checked_prelim_ids = [
            s['prelim_id'] for s in selections
            if s.get('is_checked', False) and s.get('prelim_id')
        ]

        # Upsert: find existing row or create new one
        boq_prelim = BOQPreliminary.query.filter_by(boq_id=boq_id).first()

        if boq_prelim:
            boq_prelim.prelim_id = checked_prelim_ids
            boq_prelim.updated_at = datetime.utcnow()
        else:
            boq_prelim = BOQPreliminary(
                boq_id=boq_id,
                prelim_id=checked_prelim_ids
            )
            db.session.add(boq_prelim)

        db.session.commit()


        return jsonify({
            "success": True,
            "message": "Preliminary selections saved successfully",
            "boq_id": boq_id,
            "total_items": len(selections),
            "selected_items": len(checked_prelim_ids)
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error saving BOQ preliminary selections: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to save preliminary selections: {str(e)}"
        }), 500


def get_selected_boq_preliminaries(boq_id):
    """
    Get only the SELECTED preliminaries for a BOQ.
    Reads prelim_ids from JSONB, then fetches full details from master table.
    """
    try:
        boq_prelim = BOQPreliminary.query.filter_by(boq_id=boq_id).first()
        selected_ids = (boq_prelim.prelim_id or []) if boq_prelim else []

        result = []
        if selected_ids:
            masters = PreliminaryMaster.query.filter(
                PreliminaryMaster.prelim_id.in_(selected_ids),
                PreliminaryMaster.is_deleted == False
            ).order_by(PreliminaryMaster.display_order.asc()).all()

            result = [
                {
                    'prelim_id': m.prelim_id,
                    'name': m.name,
                    'description': m.description,
                    'unit': m.unit,
                    'rate': m.rate,
                    'is_checked': True
                }
                for m in masters
            ]

        return jsonify({
            "success": True,
            "boq_id": boq_id,
            "data": result,
            "count": len(result)
        }), 200

    except Exception as e:
        log.error(f"Error fetching selected preliminaries: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch selected preliminaries: {str(e)}"
        }), 500


def create_preliminary_master():
    """
    Create a new preliminary master item
    This is called when a user adds a custom preliminary that should be available for future BOQs

    Expected JSON:
    {
        "description": "Item description",
        "unit": "nos",
        "rate": 0.0
    }
    """
    try:
        data = request.get_json()
        description = data.get('description', '').strip()

        if not description:
            return jsonify({
                "success": False,
                "error": "Description is required"
            }), 400

        # Check if this preliminary already exists
        existing = PreliminaryMaster.query.filter_by(
            description=description,
            is_deleted=False
        ).first()

        if existing:
            return jsonify({
                "success": True,
                "message": "Preliminary already exists",
                "data": existing.to_dict()
            }), 200

        # Get the max display order to add new item at the end
        max_order = db.session.query(db.func.max(PreliminaryMaster.display_order)).scalar() or 0

        # Create new preliminary master
        new_prelim = PreliminaryMaster(
            name=description[:100],  # Use first 100 chars as name
            description=description,
            unit=data.get('unit', 'nos'),
            rate=data.get('rate', 0.0),
            display_order=max_order + 1,
            is_active=True,
            is_deleted=False,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        db.session.add(new_prelim)
        db.session.commit()


        return jsonify({
            "success": True,
            "message": "Preliminary master created successfully",
            "data": new_prelim.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating preliminary master: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to create preliminary master: {str(e)}"
        }), 500


def delete_preliminary_master(prelim_id):
    """
    Delete (soft delete) a preliminary master item
    Sets is_deleted=True instead of actually removing from database
    """
    try:
        # Find the preliminary master
        prelim = PreliminaryMaster.query.get(prelim_id)

        if not prelim:
            return jsonify({
                "success": False,
                "error": "Preliminary not found"
            }), 404

        if prelim.is_deleted:
            return jsonify({
                "success": False,
                "error": "Preliminary already deleted"
            }), 400

        # Soft delete - set is_deleted flag
        prelim.is_deleted = True
        prelim.is_active = False
        prelim.updated_at = datetime.now()

        # Get current user if available
        current_user = getattr(g, 'user', None)
        if current_user:
            prelim.updated_by = current_user.get('username', 'unknown')

        db.session.commit()


        return jsonify({
            "success": True,
            "message": "Preliminary deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting preliminary master: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to delete preliminary: {str(e)}"
        }), 500
