"""
BOQ Internal Revisions Controller
Handles tracking and retrieval of internal approval cycles (PM edits, TD rejections)
before sending to client for the first time
"""

from flask import request, jsonify, g
from config.db import db
from config.logging import get_logger
from models.boq import BOQ
from sqlalchemy import text
from datetime import datetime
import json

log = get_logger()

def track_internal_revision():
    """
    Track an internal revision action (PM edit, TD reject/approve, estimator resubmit)

    POST /api/boq/<boq_id>/track_internal_revision
    Body: {
        "action_type": "PM_EDITED" | "TD_REJECTED" | "TD_APPROVED" | "SENT_TO_TD" | "SENT_TO_PM" | "ESTIMATOR_RESUBMIT",
        "rejection_reason": "...",  # Optional, for TD_REJECTED
        "approval_comments": "...",  # Optional, for TD_APPROVED
        "changes_summary": {...}    # Optional, what changed
    }
    """
    try:
        boq_id = request.view_args.get('boq_id')
        data = request.get_json()

        if not boq_id or not data:
            return jsonify({"success": False, "error": "Missing BOQ ID or data"}), 400

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Get current user
        current_user = getattr(g, 'user', None)
        actor_name = current_user.get('full_name', 'Unknown') if current_user else 'Unknown'
        actor_role = current_user.get('role_name', '').lower() if current_user else 'unknown'
        actor_user_id = current_user.get('user_id') if current_user else None

        # Get action details
        action_type = data.get('action_type')
        rejection_reason = data.get('rejection_reason')
        approval_comments = data.get('approval_comments')
        changes_summary = data.get('changes_summary', {})

        # Validate action_type
        valid_actions = ['PM_EDITED', 'TD_REJECTED', 'TD_APPROVED', 'SENT_TO_TD', 'SENT_TO_PM', 'ESTIMATOR_RESUBMIT', 'CREATED']
        if action_type not in valid_actions:
            return jsonify({"success": False, "error": f"Invalid action_type. Must be one of: {', '.join(valid_actions)}"}), 400

        # Increment internal revision number for BOQ
        current_internal_rev = boq.internal_revision_number or 0
        new_internal_rev = current_internal_rev + 1
        boq.internal_revision_number = new_internal_rev
        boq.has_internal_revisions = True

        # Get current status
        status_before = boq.status
        status_after = boq.status  # Will be updated based on action

        # Create BOQ snapshot (store current state)
        boq_snapshot = {
            "boq_name": boq.boq_name,
            "total_cost": float(boq.total_cost) if boq.total_cost else 0,
            "status": boq.status,
            "revision_number": boq.revision_number,
            "internal_revision_number": new_internal_rev
        }

        # Insert into boq_internal_revisions table
        insert_query = text("""
            INSERT INTO boq_internal_revisions (
                boq_id, internal_revision_number, action_type, actor_role, actor_name, actor_user_id,
                status_before, status_after, changes_summary, rejection_reason, approval_comments,
                boq_snapshot, created_at
            ) VALUES (
                :boq_id, :internal_revision_number, :action_type, :actor_role, :actor_name, :actor_user_id,
                :status_before, :status_after, :changes_summary, :rejection_reason, :approval_comments,
                :boq_snapshot, :created_at
            )
        """)

        db.session.execute(insert_query, {
            'boq_id': boq_id,
            'internal_revision_number': new_internal_rev,
            'action_type': action_type,
            'actor_role': actor_role,
            'actor_name': actor_name,
            'actor_user_id': actor_user_id,
            'status_before': status_before,
            'status_after': status_after,
            'changes_summary': json.dumps(changes_summary) if changes_summary else None,
            'rejection_reason': rejection_reason,
            'approval_comments': approval_comments,
            'boq_snapshot': json.dumps(boq_snapshot),
            'created_at': datetime.utcnow()
        })

        db.session.commit()

        log.info(f"✅ Tracked internal revision {new_internal_rev} for BOQ {boq_id}: {action_type} by {actor_name}")

        return jsonify({
            "success": True,
            "message": f"Internal revision {new_internal_rev} tracked successfully",
            "data": {
                "internal_revision_number": new_internal_rev,
                "action_type": action_type,
                "actor_name": actor_name
            }
        }), 200

    except Exception as e:
        log.error(f"Error tracking internal revision: {str(e)}")
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


def get_internal_revisions(boq_id):
    """
    Get all internal revisions for a BOQ

    GET /api/boq/<boq_id>/internal_revisions
    """
    try:
        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Query internal revisions
        query = text("""
            SELECT
                id, boq_id, internal_revision_number, action_type, actor_role, actor_name, actor_user_id,
                status_before, status_after, changes_summary, rejection_reason, approval_comments,
                boq_snapshot, created_at
            FROM boq_internal_revisions
            WHERE boq_id = :boq_id AND is_deleted = FALSE
            ORDER BY internal_revision_number DESC
        """)

        result = db.session.execute(query, {'boq_id': boq_id})
        rows = result.fetchall()

        # Format data
        internal_revisions = []
        for row in rows:
            internal_revisions.append({
                "id": row[0],
                "boq_id": row[1],
                "internal_revision_number": row[2],
                "action_type": row[3],
                "actor_role": row[4],
                "actor_name": row[5],
                "actor_user_id": row[6],
                "status_before": row[7],
                "status_after": row[8],
                "changes_summary": row[9],
                "rejection_reason": row[10],
                "approval_comments": row[11],
                "boq_snapshot": row[12],
                "created_at": row[13].isoformat() if row[13] else None
            })

        return jsonify({
            "success": True,
            "data": {
                "boq_id": boq_id,
                "boq_name": boq.boq_name,
                "current_internal_revision": boq.internal_revision_number or 0,
                "has_internal_revisions": boq.has_internal_revisions or False,
                "internal_revisions": internal_revisions,
                "total_count": len(internal_revisions)
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching internal revisions: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


def get_all_boqs_with_internal_revisions():
    """
    Get all BOQs that have internal revisions
    For the Internal Revisions tab

    GET /api/boqs/internal_revisions
    """
    try:
        # Query BOQs with internal revisions
        query = text("""
            SELECT
                b.boq_id, b.boq_name, b.status, b.internal_revision_number,
                b.revision_number, b.total_cost, b.created_at, b.created_by,
                p.project_name, p.client, p.location
            FROM boq b
            LEFT JOIN projects p ON b.project_id = p.project_id
            WHERE b.has_internal_revisions = TRUE
            AND b.is_deleted = FALSE
            ORDER BY b.internal_revision_number DESC, b.created_at DESC
        """)

        result = db.session.execute(query)
        rows = result.fetchall()

        # Format data
        boqs = []
        for row in rows:
            boqs.append({
                "boq_id": row[0],
                "boq_name": row[1],
                "title": row[1],  # Alias for consistency
                "status": row[2],
                "internal_revision_number": row[3],
                "revision_number": row[4],
                "total_cost": float(row[5]) if row[5] else 0,
                "created_at": row[6].isoformat() if row[6] else None,
                "created_by": row[7],
                "project": {
                    "name": row[8],
                    "client": row[9],
                    "location": row[10]
                }
            })

        return jsonify({
            "success": True,
            "data": boqs,
            "count": len(boqs)
        }), 200

    except Exception as e:
        log.error(f"Error fetching BOQs with internal revisions: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
