"""
BOQ Internal Revisions Controller
Handles tracking and retrieval of internal approval cycles (PM edits, TD rejections)
before sending to client for the first time
"""

from flask import request, jsonify, g
from models.preliminary import *
from config.db import db
from config.logging import get_logger
from models.boq import *
from controllers.boq_controller import *
from sqlalchemy import text
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime
import json

log = get_logger()

def get_all_internal_revision():
    """
    Get all BOQs with their internal revisions
    Returns complete BOQ details with all internal revision history

    GET /api/boqs/all-internal-revisions
    """
    try:
        # Get all BOQ IDs that have internal revision records
        boq_ids_with_revisions = db.session.query(BOQInternalRevision.boq_id).filter(
            BOQInternalRevision.is_deleted == False
        ).distinct().all()

        boq_ids = [row[0] for row in boq_ids_with_revisions]

        # Get all BOQs that either have the flag set OR have internal revision records
        boqs = BOQ.query.filter(
            BOQ.is_deleted == False,
            db.or_(
                BOQ.has_internal_revisions == True,
                BOQ.boq_id.in_(boq_ids)
            )
        ).all()

        result = []

        for boq in boqs:
            # Get BOQ details
            boq_details = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()

            # Get project details
            project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first() if boq.project_id else None

            # Get all internal revisions for this BOQ
            internal_revisions = BOQInternalRevision.query.filter_by(
                boq_id=boq.boq_id,
                is_deleted=False
            ).order_by(BOQInternalRevision.internal_revision_number.desc()).all()

            # Format internal revisions
            revisions_list = []
            for revision in internal_revisions:
                revisions_list.append({
                    "id": revision.id,
                    "internal_revision_number": revision.internal_revision_number,
                    "created_at": revision.created_at.isoformat() if revision.created_at else None
                })

            # Skip BOQs with no actual internal revision records
            if len(revisions_list) == 0:
                continue

            # Build BOQ data with complete information
            boq_data = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "title": boq.boq_name,
                "project_name": project.project_name if project else boq.boq_name,
                "client": project.client if project else "Unknown",
                "status": boq.status,
                "revision_number": boq.revision_number,
                "internal_revision_number": boq.internal_revision_number,
                "total_cost": boq_details.total_cost if boq_details else 0,
                "selling_price": boq_details.total_cost if boq_details else 0,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "internal_revisions": revisions_list,
                "revision_count": len(revisions_list),
                "project": {
                    "name": project.project_name if project else boq.boq_name,
                    "client": project.client if project else "Unknown"
                } if project else None,
                "project_details": {
                    "project_name": project.project_name if project else boq.boq_name,
                    "client": project.client if project else "Unknown"
                } if project else None
            }

            result.append(boq_data)

        response = jsonify({
            "success": True,
            "count": len(result),
            "message": f"Found {len(result)} BOQ(s) with internal revisions",
            "data": result
        })
        # Prevent caching
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response, 200

    except Exception as e:
        log.error(f"Error fetching internal revisions: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def get_internal_revisions(boq_id):
    """
    Get all internal revisions for a BOQ (excluding the current one)

    GET /api/boq/<boq_id>/internal_revisions
    """
    try:
        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        current_internal_revision = boq.internal_revision_number or 0

        # Get all internal revisions for this BOQ (excluding current)
        # Only show truly "previous" revisions
        revisions = BOQInternalRevision.query.filter(
            BOQInternalRevision.boq_id == boq_id,
            BOQInternalRevision.is_deleted == False,
            BOQInternalRevision.internal_revision_number < current_internal_revision
        ).order_by(BOQInternalRevision.internal_revision_number.asc()).all()

        # Format data
        internal_revisions = []
        for rev in revisions:
            internal_revisions.append({
                "id": rev.id,
                "boq_id": rev.boq_id,
                "internal_revision_number": rev.internal_revision_number,
                "action_type": rev.action_type,
                "actor_role": rev.actor_role,
                "actor_name": rev.actor_name,
                "actor_user_id": rev.actor_user_id,
                "status_before": rev.status_before,
                "status_after": rev.status_after,
                "changes_summary": rev.changes_summary,
                "rejection_reason": rev.rejection_reason,
                "approval_comments": rev.approval_comments,
                "created_at": rev.created_at.isoformat() if rev.created_at else None
            })

        return jsonify({
            "success": True,
            "data": {
                "boq_id": boq_id,
                "boq_name": boq.boq_name,
                "current_internal_revision": current_internal_revision,
                "has_internal_revisions": boq.has_internal_revisions or False,
                "internal_revisions": internal_revisions,
                "total_count": len(internal_revisions)
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching internal revisions: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def update_internal_revision_boq(boq_id):
    """
    Store BOQ edits in internal revision table WITHOUT updating main BOQ data
    This allows tracking internal changes before TD approval
    """
    try:
        data = request.get_json()

        # Get current logged-in user
        current_user = getattr(g, 'user', None)
        user_id = current_user.get('user_id') if current_user else None
        user_role = current_user.get('role', '').lower() if current_user else ''
        user_name = current_user.get('full_name') or current_user.get('username') or 'Unknown' if current_user else 'Unknown'

        boq = BOQ.query.filter_by(boq_id=boq_id).first()

        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get existing BOQ details (for reference only, not updating)
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Store current status for history
        current_status = boq.status

        # Update BOQ status to Internal_Revision_Pending
        boq.status = "Internal_Revision_Pending"
        boq.last_modified_by = user_name
        boq.last_modified_at = datetime.utcnow()

        # Extract summary values from incoming payload (do NOT recalculate)
        # The frontend has already calculated everything, just use those values
        combined_summary = data.get("combined_summary", {})

        # Use values from combined_summary if available, otherwise extract from items
        total_boq_cost = float(combined_summary.get("total_cost", 0) or combined_summary.get("selling_price", 0) or combined_summary.get("estimatedSellingPrice", 0))
        total_items = int(combined_summary.get("total_items", len(data.get("items", []))))
        total_materials = int(combined_summary.get("total_materials", 0))
        total_labour = int(combined_summary.get("total_labour", 0))
        total_material_cost = float(combined_summary.get("total_material_cost", 0))
        total_labour_cost = float(combined_summary.get("total_labour_cost", 0))

        # Get preliminaries from payload
        preliminaries = data.get("preliminaries", {})

        # Get other cost breakdowns if available in the payload
        base_cost = total_material_cost + total_labour_cost
        miscellaneous_cost = 0
        overhead_profit_cost = 0
        discount_amount = float(data.get("discount_amount", 0))
        discount_percentage = float(data.get("discount_percentage", 0))
        vat_amount = 0
        vat_percentage = float(preliminaries.get("vat", 0)) if isinstance(preliminaries, dict) else 0

        # Store internal revision in BOQInternalRevision table
        # Check if there are any existing internal revisions for this BOQ
        existing_internal_revisions_count = BOQInternalRevision.query.filter_by(boq_id=boq_id).count()

        # Set internal revision number based on existing count
        new_internal_rev = existing_internal_revisions_count + 1
        boq.internal_revision_number = new_internal_rev
        boq.has_internal_revisions = True

        # Create complete BOQ snapshot with incoming data AS-IS
        complete_boq_snapshot = {
            "boq_id": boq.boq_id,
            "boq_name": data.get("boq_name", boq.boq_name),
            "status": boq.status,
            "revision_number": boq.revision_number,
            "internal_revision_number": new_internal_rev,
            "total_cost": total_boq_cost,
            "total_items": total_items,
            "total_materials": total_materials,
            "total_labour": total_labour,
            "preliminaries": data.get("preliminaries", {}),
            "items": data.get("items", []),  # Store items AS-IS from payload
            "combined_summary": combined_summary,  # Store the complete summary as-is
            "existing_purchase": data.get("existing_purchase", {}),
            "new_purchase": data.get("new_purchase", {}),
            "created_by": boq.created_by,
            "created_at": boq.created_at.isoformat() if boq.created_at else None,
            "last_modified_by": user_name,
            "last_modified_at": datetime.utcnow().isoformat()
        }

        # ALSO update BOQDetails table with the new data
        # This ensures the main BOQ data is updated, not just the internal revision history
        # Store everything AS-IS from the incoming payload

        boq_details_json = {
            "items": data.get("items", []),  # Store items at root level for get_boq compatibility
            "preliminaries": data.get("preliminaries", {}),
            "combined_summary": combined_summary,  # Store complete summary as-is
            "existing_purchase": data.get("existing_purchase", {}),
            "new_purchase": data.get("new_purchase", {})
        }

        boq_details.boq_details = boq_details_json
        boq_details.total_cost = total_boq_cost
        boq_details.total_items = total_items
        boq_details.total_materials = total_materials
        boq_details.total_labour = total_labour
        boq_details.last_modified_by = user_name
        flag_modified(boq_details, 'boq_details')

        # Create internal revision record using SQLAlchemy ORM
        internal_revision = BOQInternalRevision(
            boq_id=boq_id,
            internal_revision_number=new_internal_rev,
            action_type='INTERNAL_REVISION_EDIT',
            actor_role=user_role,
            actor_name=user_name,
            actor_user_id=user_id,
            status_before=current_status,
            status_after=boq.status,
            changes_summary=complete_boq_snapshot
        )
        db.session.add(internal_revision)

        # Add history record to BOQHistory table
        history_action = {
            "type": "internal_revision_edit",
            "role": user_role,
            "user_name": user_name,
            "user_id": user_id,
            "status": boq.status,
            "timestamp": datetime.utcnow().isoformat(),
            "internal_revision_number": new_internal_rev,
            "boq_name": data.get("boq_name", boq.boq_name),
            "total_items": total_items,
            "total_cost": total_boq_cost,
            "changes": {
                "status_changed": current_status != boq.status,
                "old_status": current_status,
                "new_status": boq.status,
                "items_updated": True,
                "items_count": total_items
            }
        }

        # Check if history entry exists for this BOQ
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        if existing_history:
            # Append to existing action array
            if existing_history.action is None:
                current_actions = []
            elif isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]
            else:
                current_actions = []

            current_actions.append(history_action)
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = user_name
            existing_history.boq_status = boq.status
            existing_history.comments = f"Internal Revision {new_internal_rev} - BOQ updated by {user_name}"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=[history_action],
                action_by=user_name,
                boq_status=boq.status,
                comments=f"Internal Revision {new_internal_rev} - BOQ updated by {user_name}",
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(boq_history)

        log.info(f"✅ Internal revision {new_internal_rev} stored in BOQInternalRevision table for BOQ {boq_id}")
        log.info(f"✅ BOQDetails table also updated with the new data")
        log.info(f"✅ BOQHistory table updated with action by {user_name}")
        log.info(f"📊 Total cost: {total_boq_cost}, Items: {total_items}, Materials: {total_materials}, Labour: {total_labour}")

        db.session.commit()

        # Return success response
        return jsonify({
            "message": "BOQ internal revision stored successfully",
            "success": True,
            "boq_id": boq_id,
            "internal_revision_number": new_internal_rev,
            "status": boq.status,
            "total_cost": total_boq_cost,
            "updated_by": user_name
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error storing internal revision: {str(e)}")
        return jsonify({"error": str(e)}), 500
