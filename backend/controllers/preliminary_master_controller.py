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
    Get all preliminary masters with their selection status for a specific BOQ
    This returns ALL available preliminaries with is_checked=true/false based on BOQ selections

    Used when:
    - Creating new BOQ: All items returned with is_checked=false
    - Editing existing BOQ: Items returned with their saved is_checked status
    """
    try:
        # Fetch all active preliminary masters
        all_preliminaries = PreliminaryMaster.query.filter_by(
            is_deleted=False,
            is_active=True
        ).order_by(PreliminaryMaster.display_order.asc()).all()

        # Fetch existing selections for this BOQ
        boq_selections = {}
        if boq_id:
            selections = BOQPreliminary.query.filter_by(boq_id=boq_id).all()
            boq_selections = {sel.prelim_id: sel.is_checked for sel in selections}

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
                'is_checked': boq_selections.get(prelim.prelim_id, False)  # Default to False if not found
            })

        return jsonify({
            "success": True,
            "boq_id": boq_id,
            "data": result,
            "count": len(result),
            "selected_count": sum(1 for item in result if item['is_checked'])
        }), 200

    except Exception as e:
        log.error(f"Error fetching BOQ preliminaries: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to fetch BOQ preliminaries: {str(e)}"
        }), 500


def save_boq_preliminary_selections(boq_id):
    """
    Save preliminary selections for a BOQ
    This updates the boq_preliminaries junction table with user selections

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

        # Get current user
        current_user = getattr(g, 'user', None)
        user_id = current_user.get('user_id') if current_user else None

        # Delete existing selections for this BOQ
        BOQPreliminary.query.filter_by(boq_id=boq_id).delete()

        # Insert new selections (store ALL items with their checked status)
        for selection in selections:
            prelim_id = selection.get('prelim_id')
            is_checked = selection.get('is_checked', False)

            if not prelim_id:
                continue

            boq_prelim = BOQPreliminary(
                boq_id=boq_id,
                prelim_id=prelim_id,
                is_checked=is_checked
            )
            db.session.add(boq_prelim)

        db.session.commit()

        log.info(f"Saved {len(selections)} preliminary selections for BOQ {boq_id}")

        return jsonify({
            "success": True,
            "message": "Preliminary selections saved successfully",
            "boq_id": boq_id,
            "total_items": len(selections),
            "selected_items": sum(1 for s in selections if s.get('is_checked'))
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
    Get only the SELECTED (is_checked=true) preliminaries for a BOQ
    Used for displaying in BOQ views/reports
    """
    try:
        # Join boq_preliminaries with preliminaries_master to get full details
        selected = db.session.query(
            BOQPreliminary, PreliminaryMaster
        ).join(
            PreliminaryMaster, BOQPreliminary.prelim_id == PreliminaryMaster.prelim_id
        ).filter(
            BOQPreliminary.boq_id == boq_id,
            BOQPreliminary.is_checked == True
        ).order_by(PreliminaryMaster.display_order.asc()).all()

        result = []
        for boq_prelim, prelim_master in selected:
            result.append({
                'prelim_id': prelim_master.prelim_id,
                'name': prelim_master.name,
                'description': prelim_master.description,
                'unit': prelim_master.unit,
                'rate': prelim_master.rate,
                'is_checked': True
            })

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

        log.info(f"Created new preliminary master: {new_prelim.prelim_id} - {description}")

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
