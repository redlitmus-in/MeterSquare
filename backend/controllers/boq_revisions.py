"""
BOQ Revisions Controller

Handles dynamic revision tabs and revision-specific queries
"""

import datetime
from flask import g, jsonify, request
from models.project import Project
from models.role import Role
from models.user import User
from utils.boq_email_service import *
from config.db import db
from models.boq import *
from sqlalchemy import func, and_, or_
from config.logging import get_logger

log = get_logger()


def get_revision_tabs():
    """
    Get all active revision numbers with project counts
    Returns dynamic tabs based on actual data
    """
    try:
        # Query to get unique revision numbers with counts
        # Include BOQs in revision states (match frontend filtering logic)
        # Note: sent_for_confirmation is NOT included - those BOQs move to different tabs
        # Use LOWER() for case-insensitive comparison (database has mixed case statuses)
        result = db.session.query(
            BOQ.revision_number,
            func.count(BOQ.boq_id).label('project_count')
        ).filter(
            # ONLY include revision_number > 0 (exclude 0 and NULL)
            BOQ.revision_number > 0,
            # Show ALL statuses (don't filter by status - show all BOQs with client revisions)
            BOQ.is_deleted == False
        ).group_by(
            BOQ.revision_number
        ).order_by(
            BOQ.revision_number
        ).all()

        tabs = []
        for row in result:
            revision_num = row.revision_number

            # Determine alert level based on revision number
            alert_level = 'normal'
            if revision_num >= 7:
                alert_level = 'critical'
            elif revision_num >= 4:
                alert_level = 'warning'

            tabs.append({
                'revision_number': revision_num,
                'project_count': row.project_count,
                'alert_level': alert_level
            })

        log.info(f"Found {len(tabs)} active revision tabs")
        return jsonify(tabs), 200

    except Exception as e:
        log.error(f"Error getting revision tabs: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_projects_by_revision(revision_number):
    """
    Get all projects for a specific revision number
    """
    try:
        if revision_number == 'all':
            # Get all projects with revision_number > 0 (ALL statuses)
            boqs = BOQ.query.filter(
                BOQ.revision_number > 0,
                # Show ALL statuses - don't filter by status
                BOQ.is_deleted == False
            ).order_by(
                BOQ.revision_number.desc(),
                BOQ.last_modified_at.desc()
            ).all()
        else:
            # Get projects for specific revision number (ALL statuses)
            revision_num = int(revision_number)
            if revision_num <= 0:
                # Don't show any BOQs for revision_number <= 0
                boqs = []
            else:
                # For revisions > 0, show ALL statuses
                boqs = BOQ.query.filter(
                    BOQ.revision_number == revision_num,
                    # Show ALL statuses - don't filter by status
                    BOQ.is_deleted == False
                ).order_by(
                    BOQ.last_modified_at.desc()
                ).all()

        # Transform BOQ data for frontend
        boq_list = []
        for boq in boqs:
            # Get project details
            project = boq.project
            if not project:
                continue

            # Get BOQ details
            boq_details = BOQDetails.query.filter_by(
                boq_id=boq.boq_id,
                is_deleted=False
            ).first()

            total_cost = 0
            item_count = 0
            if boq_details:
                total_cost = boq_details.total_cost or 0
                item_count = boq_details.total_items or 0

            boq_data = {
                'boq_id': boq.boq_id,
                'boq_name': boq.boq_name,
                'project_id': boq.project_id,
                'project_name': project.project_name,
                'client': project.client,
                'location': project.location,
                'status': boq.status,
                'revision_number': boq.revision_number,
                'total_cost': total_cost,
                'item_count': item_count,
                'created_at': boq.created_at.isoformat() if boq.created_at else None,
                'created_by': boq.created_by,
                'last_modified_at': boq.last_modified_at.isoformat() if boq.last_modified_at else None,
                'last_modified_by': boq.last_modified_by,
                'email_sent': boq.email_sent
            }

            boq_list.append(boq_data)

        log.info(f"Found {len(boq_list)} projects for revision {revision_number}")
        return jsonify(boq_list), 200

    except Exception as e:
        log.error(f"Error getting projects for revision {revision_number}: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_revision_statistics():
    """
    Get statistics about revisions
    Returns overview data for dashboard
    """
    try:
        # Total projects in revision
        total_in_revision = db.session.query(func.count(BOQ.boq_id)).filter(
            BOQ.revision_number > 0,
            BOQ.is_deleted == False
        ).scalar()

        # Projects by revision level
        by_level = db.session.query(
            func.case(
                (BOQ.revision_number.between(1, 3), '1-3'),
                (BOQ.revision_number.between(4, 6), '4-6'),
                (BOQ.revision_number >= 7, '7+'),
                else_='0'
            ).label('level'),
            func.count(BOQ.boq_id).label('count')
        ).filter(
            BOQ.revision_number > 0,
            BOQ.is_deleted == False
        ).group_by('level').all()

        level_stats = {row.level: row.count for row in by_level}

        # Average days in revision (approximate based on last_modified_at)
        # This is a simplified calculation

        stats = {
            'total_in_revision': total_in_revision,
            'by_level': level_stats,
            'critical_count': level_stats.get('7+', 0)
        }

        return jsonify(stats), 200

    except Exception as e:
        log.error(f"Error getting revision statistics: {str(e)}")
        return jsonify({"error": str(e)}), 500

def client_revision_td_mail_send():
    """
    Technical Director approves/rejects BOQ
    - If approved: Send email to assigned Project Manager (from project.user_id)
    - If rejected: Send email back to Estimator
    - Appends action to BOQ history
    """
    try:
        current_user = g.user
        td_name = current_user['full_name']
        td_email = current_user['email']
        td_user_id = current_user['user_id']

        # Get request data
        data = request.get_json(silent=True)
        if not data:
            return jsonify({
                "error": "Invalid request",
                "message": "Request body must be valid JSON"
            }), 400

        boq_id = data.get("boq_id")
        comments = data.get("comments", "")
        rejection_reason = data.get("rejection_reason", "")
        technical_director_status = data.get("technical_director_status")

        # Validate required fields
        if not boq_id:
            return jsonify({"error": "boq_id is required"}), 400

        if not technical_director_status:
            return jsonify({"error": "technical_director_status is required (approved/rejected)"}), 400

        if technical_director_status.lower() not in ['approved', 'rejected']:
            return jsonify({"error": "technical_director_status must be 'approved' or 'rejected'"}), 400

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get project
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Prepare BOQ data for email
        boq_data = {
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'status': technical_director_status.capitalize(),
            'created_by': boq.created_by,
            'created_at': boq.created_at.strftime('%d-%b-%Y %I:%M %p') if boq.created_at else 'N/A'
        }

        project_data = {
            'project_name': project.project_name,
            'client': project.client or 'N/A',
            'location': project.location or 'N/A'
        }

        items_summary = boq_details.boq_details.get('summary', {}) if boq_details.boq_details else {}
        items_summary['items'] = boq_details.boq_details.get('items', []) if boq_details.boq_details else []

        # Initialize email service
        boq_email_service = BOQEmailService()

        # Find Estimator (sender of original BOQ)
        estimator_role = Role.query.filter(
            Role.role.in_(['estimator', 'Estimator']),
            Role.is_deleted == False
        ).first()

        estimator = None
        if estimator_role:
            estimator = User.query.filter_by(
                role_id=estimator_role.role_id,
                is_active=True,
                is_deleted=False
            ).filter(
                db.or_(
                    User.full_name == boq.created_by,
                    User.email == boq.created_by
                )
            ).first()

            if not estimator:
                estimator = User.query.filter_by(
                    role_id=estimator_role.role_id,
                    is_active=True,
                    is_deleted=False
                ).first()

        estimator_email = estimator.email if estimator and estimator.email else boq.created_by
        estimator_name = estimator.full_name if estimator else boq.created_by

        # Get existing BOQ history
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        # Handle existing actions - ensure it's always a list
        if existing_history:
            if existing_history.action is None:
                current_actions = []
            elif isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]  # Convert dict to list
            else:
                current_actions = []
        else:
            current_actions = []

        log.info(f"BOQ {boq_id} - Existing history found: {existing_history is not None}")
        log.info(f"BOQ {boq_id} - Current actions before append: {current_actions}")

        new_status = None
        email_sent = False
        recipient_email = None
        recipient_name = None
        recipient_role = None

        # ==================== APPROVED STATUS ====================
        if technical_director_status.lower() == 'approved':
            log.info(f"BOQ {boq_id} approved by TD, sending to Estimator")

            # Set status to Approved
            new_status = "Approved"

            # DO NOT increment revision_number here!
            # Revision number is already incremented when estimator clicks "Make Revision" and saves
            # (see boq_controller.py revision_boq function line 1436-1438)
            # TD approval should only change status, not increment revision number

            if not estimator or not estimator_email:
                return jsonify({
                    "success": False,
                    "message": "Cannot send approval email - Estimator email not found"
                }), 400

            recipient_email = estimator_email
            recipient_name = estimator_name
            recipient_role = "estimator"

            # Send approval email to Estimator
            email_sent = boq_email_service.send_boq_approval_to_pm(
                boq_data, project_data, items_summary, recipient_email, comments
            )

            if not email_sent:
                return jsonify({
                    "success": False,
                    "message": "Failed to send approval email to Estimator",
                    "error": "Email service failed"
                }), 500

            # Prepare new action for APPROVED
            new_action = {
                "role": "technicalDirector",
                "type": "client_revision_approved",
                "sender": "technicalDirector",
                "receiver": "estimator",
                "status": "Approved",
                "boq_name": boq.boq_name,
                "comments": comments or "Client revision approved by Technical Director",
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": td_name,
                "decided_by_user_id": td_user_id,
                "total_cost": items_summary.get("total_cost"),
                "project_name": project_data.get("project_name"),
                "recipient_email": recipient_email,
                "recipient_name": recipient_name,
                "is_revision": True
            }

        # ==================== REJECTED STATUS ====================
        else:  # rejected
            log.info(f"BOQ {boq_id} rejected by TD, sending back to Estimator")
            new_status = "client_revision_rejected"

            if not estimator or not estimator_email:
                return jsonify({
                    "success": False,
                    "message": "Cannot send rejection email - Estimator email not found"
                }), 400

            recipient_email = estimator_email
            recipient_name = estimator_name
            recipient_role = "estimator"

            # Send rejection email to Estimator
            email_sent = boq_email_service.send_boq_rejection_to_estimator(
                boq_data, project_data, items_summary, recipient_email,
                rejection_reason or comments
            )

            if not email_sent:
                return jsonify({
                    "success": False,
                    "message": "Failed to send rejection email to Estimator",
                    "error": "Email service failed"
                }), 500

            # Prepare new action for REJECTED
            new_action = {
                "role": "technicalDirector",
                "type": "status_change",
                "sender": "technicalDirector",
                "receiver": "estimator",
                "status": "rejected",
                "boq_name": boq.boq_name,
                "comments": comments or rejection_reason or "BOQ rejected",
                "rejection_reason": rejection_reason if rejection_reason else None,
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": td_name,
                "decided_by_user_id": td_user_id,
                "total_cost": items_summary.get("total_cost"),
                "project_name": project_data.get("project_name"),
                "recipient_email": recipient_email,
                "recipient_name": recipient_name
            }

            # ==================== CREATE INTERNAL REVISION FOR TD REJECTION ====================
            # Increment internal revision number and create snapshot
            current_internal_rev = boq.internal_revision_number or 0
            new_internal_rev = current_internal_rev + 1
            boq.internal_revision_number = new_internal_rev
            boq.has_internal_revisions = True

            # Create complete BOQ snapshot for internal revision tracking
            complete_boq_snapshot = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "status": boq.status,
                "revision_number": boq.revision_number or 0,
                "internal_revision_number": new_internal_rev,
                "total_cost": float(boq_details.total_cost) if boq_details.total_cost else 0,
                "total_items": boq_details.total_items or 0,
                "total_materials": boq_details.total_materials or 0,
                "total_labour": boq_details.total_labour or 0,
                "preliminaries": boq_details.boq_details.get("preliminaries", {}) if boq_details.boq_details else {},
                "items": items_summary.get('items', []),
                "summary": items_summary if items_summary else {},
                "created_by": boq.created_by,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "last_modified_by": td_name,
                "last_modified_at": datetime.utcnow().isoformat()
            }

            # # Create internal revision record for TD rejection
            # internal_revision = BOQInternalRevision(
            #     boq_id=boq_id,
            #     internal_revision_number=new_internal_rev,
            #     action_type='TD_REJECTED',
            #     actor_role='technicalDirector',
            #     actor_name=td_name,
            #     actor_user_id=td_user_id,
            #     status_before=boq.status,
            #     status_after=new_status,
            #     rejection_reason=rejection_reason or comments,
            #     changes_summary=complete_boq_snapshot
            # )
            # db.session.add(internal_revision)
            # log.info(f"✅ Internal revision {new_internal_rev} created for TD rejection of BOQ {boq_id}")

        # ==================== UPDATE BOQ & HISTORY ====================
        # Update BOQ status
        boq.status = new_status
        boq.email_sent = True
        boq.last_modified_by = td_name
        boq.last_modified_at = datetime.utcnow()

        # Append new action to existing actions array
        current_actions.append(new_action)

        log.info(f"BOQ {boq_id} - New action created: {new_action}")
        log.info(f"BOQ {boq_id} - Current actions after append: {current_actions}")

        if existing_history:
            # Update existing history
            existing_history.action = current_actions
            # Mark the JSONB field as modified for SQLAlchemy to detect changes
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(existing_history, "action")

            existing_history.action_by = td_name
            existing_history.boq_status = new_status
            existing_history.sender = td_name
            existing_history.receiver = recipient_name
            existing_history.comments = comments or rejection_reason or f"BOQ {new_status.lower()}"
            existing_history.sender_role = 'technicalDirector'
            existing_history.receiver_role = recipient_role
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = td_name
            existing_history.last_modified_at = datetime.utcnow()

            log.info(f"BOQ {boq_id} - Updated existing history with {len(current_actions)} actions")
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=current_actions,
                action_by=td_name,
                boq_status=new_status,
                sender=td_name,
                receiver=recipient_name,
                comments=comments or rejection_reason or f"BOQ {new_status.lower()}",
                sender_role='technicalDirector',
                receiver_role=recipient_role,
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)
            log.info(f"BOQ {boq_id} - Created new history with {len(current_actions)} actions")

        db.session.commit()
        log.info(f"BOQ {boq_id} - Database committed successfully")

        log.info(f"BOQ {boq_id} {new_status.lower()} by TD, email sent to {recipient_email}")

        return jsonify({
            "success": True,
            "message": f"BOQ {new_status.lower()} successfully and email sent to {recipient_role}",
            "boq_id": boq_id,
            "status": new_status,
            "recipient": recipient_email,
            "recipient_role": recipient_role,
            "recipient_name": recipient_name
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        log.error(f"Error in td_mail_send: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": str(e),
            "error_type": type(e).__name__
        }), 500