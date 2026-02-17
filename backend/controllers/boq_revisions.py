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
from sqlalchemy.orm.attributes import flag_modified
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
                item_count = boq_details.total_items or 0

                # 🔥 Calculate total_cost from items with discount applied
                if boq_details.boq_details and boq_details.boq_details.get('items'):
                    items = boq_details.boq_details.get('items', [])
                    subtotal = 0

                    # Calculate subtotal from all items using selling_price
                    for item in items:
                        # Use selling_price if available (this is the client-facing price with overhead/profit)
                        item_selling_price = item.get('selling_price', 0) or item.get('total_selling_price', 0) or item.get('estimatedSellingPrice', 0)

                        # If selling_price not available, calculate from quantity * rate
                        if not item_selling_price or item_selling_price == 0:
                            item_selling_price = (item.get('quantity', 0) or 0) * (item.get('rate', 0) or 0)
                            # If rate is 0, calculate from sub_items
                            if item_selling_price == 0 and item.get('sub_items'):
                                for sub_item in item.get('sub_items', []):
                                    item_selling_price += (sub_item.get('quantity', 0) or 0) * (sub_item.get('rate', 0) or 0)

                        subtotal += item_selling_price

                    # Apply discount
                    discount_amount = boq_details.boq_details.get('discount_amount', 0) or 0
                    discount_percentage = boq_details.boq_details.get('discount_percentage', 0) or 0

                    if discount_percentage > 0 and discount_amount == 0:
                        discount_amount = (subtotal * discount_percentage) / 100

                    total_cost = subtotal - discount_amount
                else:
                    # No items, use stored total_cost
                    total_cost = boq_details.total_cost or 0

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

        # Find Estimator from project.estimator_id
        estimator = None
        estimator_user_id = None

        # Method 1: Try project.estimator_id
        if project.estimator_id:
            estimator = User.query.filter_by(
                user_id=project.estimator_id,
                is_active=True,
                is_deleted=False
            ).first()
            if estimator:
                estimator_user_id = estimator.user_id

        # Method 2: Try to find by created_by if estimator_id not set
        if not estimator:
            estimator_role = Role.query.filter(
                Role.role.in_(['estimator', 'Estimator']),
                Role.is_deleted == False
            ).first()

            if estimator_role:
                estimator = User.query.filter_by(
                    role_id=estimator_role.role_id,
                    is_active=True,
                    is_deleted=False
                ).filter(
                    db.or_(
                        User.full_name == boq.created_by,
                        User.email == boq.created_by,
                        User.username == boq.created_by
                    )
                ).first()

                if estimator:
                    estimator_user_id = estimator.user_id

        # Method 3: If still not found, get ANY active estimator as last resort
        if not estimator:
            log.warning(f"BOQ {boq_id} - Estimator not found via project or created_by, trying to find any active estimator")
            estimator_role = Role.query.filter(
                Role.role.in_(['estimator', 'Estimator']),
                Role.is_deleted == False
            ).first()

            if estimator_role:
                estimator = User.query.filter_by(
                    role_id=estimator_role.role_id,
                    is_active=True,
                    is_deleted=False
                ).first()

                if estimator:
                    estimator_user_id = estimator.user_id
                    log.warning(f"BOQ {boq_id} - Using fallback estimator: {estimator_user_id}")

        estimator_email = estimator.email if estimator and estimator.email else boq.created_by
        estimator_name = estimator.full_name if estimator else boq.created_by

        # Log final result
        if not estimator or not estimator_user_id:
            log.error(f"BOQ {boq_id} - CRITICAL: Could not find estimator. project.estimator_id={project.estimator_id}, boq.created_by={boq.created_by}")
        else:
            log.info(f"BOQ {boq_id} - Estimator resolved: user_id={estimator_user_id}, name={estimator_name}, email={estimator_email}")

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

        new_status = None
        email_sent = False
        recipient_email = None
        recipient_name = None
        recipient_role = None

        # ==================== DETECT REVISION TYPE ====================
        # CRITICAL FIX: Determine if this is an internal revision or client revision
        # Internal Revision: revision_number is 0/None AND has internal revisions
        # Client Revision: revision_number > 0
        is_internal_revision = (
            (boq.revision_number == 0 or boq.revision_number is None) and
            boq.has_internal_revisions == True
        )
        is_client_revision = boq.revision_number and boq.revision_number > 0

        # ==================== APPROVED STATUS ====================
        if technical_director_status.lower() == 'approved':
            # Set status based on revision type
            if is_internal_revision:
                new_status = "Internal_Revision_Approved"
            else:
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
            email_sent = False
            # Normalize status to lowercase for comparison
            estimator_status = str(estimator.user_status).lower().strip() if estimator.user_status else "unknown"
            if estimator_status == "offline":
                # Add project_code to project_data
                project_data['project_code'] = project.project_code or 'N/A'

                # Send professional GREEN-themed approval confirmation email to Estimator
                email_sent = boq_email_service.send_boq_approval_confirmation_to_estimator(
                    boq_data=boq_data,
                    project_data=project_data,
                    items_summary=items_summary,
                    estimator_email=estimator_email,
                    comments=comments,
                    estimator_name=estimator_name,
                    pm_name=td_name,  # TD acts as approver
                    approver_role="Technical Director"  # Show TD role in heading
                )

                if email_sent:
                    log.info(f"📧 ✅ TD approval email sent successfully to {estimator_name} ({estimator_email})")
                else:
                    log.error(f"📧 ❌ Failed to send TD approval email to {estimator_name}")
            else:
                log.info(f"📧 ⏭️  Estimator is ONLINE (status='{estimator_status}') - Email skipped (in-app notification only)")

            # Prepare new action for APPROVED
            action_type = "internal_revision_approved" if is_internal_revision else "client_revision_approved"
            default_comment = "Internal revision approved by Technical Director" if is_internal_revision else "Client revision approved by Technical Director"

            new_action = {
                "role": "technicalDirector",
                "type": action_type,
                "sender": "technicalDirector",
                "receiver": "estimator",
                "status": new_status,
                "boq_name": boq.boq_name,
                "comments": comments or default_comment,
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": td_name,
                "decided_by_user_id": td_user_id,
                "total_cost": items_summary.get("total_cost"),
                "project_name": project_data.get("project_name"),
                "recipient_email": recipient_email,
                "recipient_name": recipient_name,
                "is_revision": True,
                "is_internal_revision": is_internal_revision
            }

        # ==================== REJECTED STATUS ====================
        else:  # rejected
            if is_internal_revision:
                new_status = "Internal_Revision_Pending"
            else:
                new_status = "client_revision_rejected"

            if not estimator or not estimator_email:
                return jsonify({
                    "success": False,
                    "message": "Cannot send rejection email - Estimator email not found"
                }), 400

            recipient_email = estimator_email
            recipient_name = estimator_name
            recipient_role = "estimator"

            email_sent = False
            # Normalize status to lowercase for comparison
            estimator_status = str(estimator.user_status).lower().strip() if estimator.user_status else "unknown"
            if estimator_status == "offline":
                # Add project_code to project_data
                project_data['project_code'] = project.project_code or 'N/A'

                # Send professional RED-themed rejection email to Estimator
                email_sent = boq_email_service.send_boq_rejection_to_estimator(
                    boq_data=boq_data,
                    project_data=project_data,
                    items_summary=items_summary,
                    estimator_email=estimator_email,
                    rejection_reason=rejection_reason or comments or "No reason provided",
                    estimator_name=estimator_name,
                    pm_name=td_name,  # TD acts as rejector
                    approver_role="Technical Director"  # Show TD role in heading
                )

                if email_sent:
                    log.info(f"📧 ✅ TD rejection email sent successfully to {estimator_name} ({estimator_email})")
                else:
                    log.error(f"📧 ❌ Failed to send TD rejection email to {estimator_name}")
            else:
                log.info(f"📧 ⏭️  Estimator is ONLINE (status='{estimator_status}') - Email skipped (in-app notification only)")

            # Prepare new action for REJECTED
            action_type = "internal_revision_rejected" if is_internal_revision else "status_change"
            default_comment = "Internal revision rejected" if is_internal_revision else "BOQ rejected"

            new_action = {
                "role": "technicalDirector",
                "type": action_type,
                "sender": "technicalDirector",
                "receiver": "estimator",
                "status": "rejected",
                "boq_name": boq.boq_name,
                "comments": comments or rejection_reason or default_comment,
                "rejection_reason": rejection_reason if rejection_reason else None,
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": td_name,
                "decided_by_user_id": td_user_id,
                "total_cost": items_summary.get("total_cost"),
                "project_name": project_data.get("project_name"),
                "recipient_email": recipient_email,
                "recipient_name": recipient_name,
                "is_internal_revision": is_internal_revision
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

        # ==================== UPDATE BOQ & HISTORY ====================
        # Update BOQ status
        boq.status = new_status
        boq.email_sent = True
        boq.last_modified_by = td_name
        boq.last_modified_at = datetime.utcnow()

        # Append new action to existing actions array
        current_actions.append(new_action)

        if existing_history:
            # Update existing history
            existing_history.action = current_actions
            # Mark the JSONB field as modified for SQLAlchemy to detect changes
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

        db.session.commit()

        # Send real-time notification to estimator
        notification_sent = False
        notification_error_msg = None
        try:
            from utils.comprehensive_notification_service import ComprehensiveNotificationService
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            decision = 'approved' if technical_director_status.lower() == 'approved' else 'rejected'
            revision_type = 'internal' if is_internal_revision else 'client'

            # CRITICAL: Always attempt to send notification, even if estimator_user_id is None
            # The notification service will handle fallback mechanisms
            if estimator_user_id or estimator:
                # Use estimator_user_id if available, otherwise use estimator object to find user_id
                final_estimator_id = estimator_user_id if estimator_user_id else (estimator.user_id if estimator else None)

                if final_estimator_id:
                    try:
                        # CRITICAL FIX: Call appropriate notification based on revision type
                        if technical_director_status.lower() == 'approved':
                            if is_internal_revision:
                                ComprehensiveNotificationService.notify_internal_revision_approved(
                                    boq_id=boq_id,
                                    project_name=project_data.get('project_name', boq.boq_name),
                                    td_id=td_user_id,
                                    td_name=td_name,
                                    actor_user_id=final_estimator_id,
                                    actor_name=estimator_name,
                                    revision_number=boq.internal_revision_number or 1
                                )
                            else:
                                ComprehensiveNotificationService.notify_client_revision_approved(
                                    boq_id=boq_id,
                                    project_name=project_data.get('project_name', boq.boq_name),
                                    td_id=td_user_id,
                                    td_name=td_name,
                                    estimator_user_id=final_estimator_id,
                                    estimator_name=estimator_name,
                                    revision_number=boq.revision_number
                                )
                        else:
                            if is_internal_revision:
                                ComprehensiveNotificationService.notify_internal_revision_rejected(
                                    boq_id=boq_id,
                                    project_name=project_data.get('project_name', boq.boq_name),
                                    td_id=td_user_id,
                                    td_name=td_name,
                                    actor_user_id=final_estimator_id,
                                    actor_name=estimator_name,
                                    rejection_reason=rejection_reason or comments or "No reason provided",
                                    revision_number=boq.internal_revision_number or 1
                                )
                            else:
                                ComprehensiveNotificationService.notify_client_revision_rejected(
                                    boq_id=boq_id,
                                    project_name=project_data.get('project_name', boq.boq_name),
                                    td_id=td_user_id,
                                    td_name=td_name,
                                    estimator_user_id=final_estimator_id,
                                    estimator_name=estimator_name,
                                    rejection_reason=rejection_reason or comments or "No reason provided",
                                    revision_number=boq.revision_number
                                )
                        notification_sent = True
                    except Exception as svc_err:
                        log.error(f"BOQ {boq_id} - {revision_type.capitalize()} revision notification service failed: {svc_err}")
                        # Fallback: create notification directly in DB
                        try:
                            from utils.role_route_mapper import get_boq_view_url
                            # CRITICAL FIX: Use correct revision number and title based on type
                            if is_internal_revision:
                                rev_info = f' #{boq.internal_revision_number or 1}' if boq.internal_revision_number else ''
                                fallback_title = f'Internal Revision {"Approved" if decision == "approved" else "Rejected"}'
                                fallback_msg = (
                                    f'Internal revision{rev_info} for {project_data.get("project_name", boq.boq_name)} '
                                    f'was {decision} by {td_name}'
                                )
                            else:
                                rev_info = f' R{boq.revision_number}' if boq.revision_number and boq.revision_number > 0 else ''
                                fallback_title = f'Client Revision {"Approved" if decision == "approved" else "Rejected"}'
                                fallback_msg = (
                                    f'Client revision{rev_info} for {project_data.get("project_name", boq.boq_name)} '
                                    f'was {decision} by {td_name}'
                                )
                            if decision == 'rejected':
                                fallback_msg += f'. Reason: {rejection_reason or comments or "No reason provided"}'
                            fallback_notif = NotificationManager.create_notification(
                                user_id=final_estimator_id,
                                type='success' if decision == 'approved' else 'rejection',
                                title=fallback_title,
                                message=fallback_msg,
                                priority='high',
                                category='boq',
                                action_url=get_boq_view_url(final_estimator_id, boq_id, tab='revisions'),
                                action_label='View BOQ',
                                metadata={'boq_id': boq_id, 'decision': decision, 'revision_number': boq.revision_number, 'is_internal_revision': is_internal_revision},
                                sender_id=td_user_id,
                                sender_name=td_name,
                                target_role='estimator'
                            )
                            send_notification_to_user(final_estimator_id, fallback_notif.to_dict())
                            notification_sent = True
                        except Exception as fallback_err:
                            log.error(f"BOQ {boq_id} - Fallback client revision notification also failed: {fallback_err}")
                            notification_error_msg = str(fallback_err)
                else:
                    log.error(f"BOQ {boq_id} - CRITICAL: Cannot send {revision_type} revision notification - final_estimator_id is None")
                    notification_error_msg = "Estimator user_id not found - checked project.estimator_id, boq.created_by, and fallback estimator"

                # Also notify PM/forwarder if exists
                try:
                    forwarder_user_id = None
                    if current_actions:
                        for action in reversed(current_actions):
                            if action.get('type') == 'sent_to_td' and action.get('decided_by_user_id'):
                                fwd_id = action.get('decided_by_user_id')
                                if fwd_id and fwd_id != estimator_user_id:
                                    forwarder_user_id = fwd_id
                                break
                    if forwarder_user_id:
                        from utils.role_route_mapper import get_boq_view_url
                        # CRITICAL FIX: Use correct revision type in PM notification
                        pm_title = f'{revision_type.capitalize()} Revision {"Approved" if decision == "approved" else "Rejected"}'
                        pm_msg = (
                            f'{revision_type.capitalize()} revision for {project_data.get("project_name", boq.boq_name)} '
                            f'was {decision} by {td_name}'
                        )
                        pm_notif = NotificationManager.create_notification(
                            user_id=forwarder_user_id,
                            type='success' if decision == 'approved' else 'rejection',
                            title=pm_title,
                            message=pm_msg,
                            priority='high',
                            category='boq',
                            action_url=get_boq_view_url(forwarder_user_id, boq_id, tab='revisions'),
                            action_label='View BOQ',
                            metadata={'boq_id': boq_id, 'decision': decision, 'is_internal_revision': is_internal_revision},
                            sender_id=td_user_id,
                            sender_name=td_name
                        )
                        send_notification_to_user(forwarder_user_id, pm_notif.to_dict())
                except Exception as pm_err:
                    log.error(f"BOQ {boq_id} - PM/forwarder notification failed (non-critical): {pm_err}")
            else:
                log.error(f"BOQ {boq_id} - CRITICAL: No estimator found for {revision_type} revision notification. estimator={estimator}, estimator_user_id={estimator_user_id}, project.estimator_id={project.estimator_id}, boq.created_by={boq.created_by}")
                notification_error_msg = "Estimator not found - notification cannot be sent"
        except Exception as notif_error:
            log.error(f"BOQ {boq_id} - Critical: Failed to send {revision_type} revision notification: {notif_error}")
            import traceback
            log.error(traceback.format_exc())
            notification_error_msg = str(notif_error)


        return jsonify({
            "success": True,
            "message": f"BOQ {new_status.lower()} successfully",
            "boq_id": boq_id,
            "status": new_status,
            "recipient": recipient_email,
            "recipient_role": recipient_role,
            "recipient_name": recipient_name,
            "notification_sent": notification_sent,
            "notification_error": notification_error_msg
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

# SEND EMAIL - Send client_revision BOQ to Technical Director
def send_td_client_boq_email(boq_id):
    try:
        current_user = getattr(g, 'user', None)
        user_id = current_user.get('user_id') if current_user else None
        user_role = current_user.get('role', '').lower() if current_user else ''
        user_name = current_user.get('full_name') or current_user.get('username') or 'Unknown' if current_user else 'Unknown'
        # Get BOQ data
        boq = BOQ.query.filter_by(boq_id=boq_id).first()
        if not boq:
            return jsonify({
                "error": "BOQ not found",
                "message": f"No BOQ found with ID {boq_id}"
            }), 404

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({
                "error": "BOQ details not found",
                "message": f"No BOQ details found for BOQ ID {boq_id}"
            }), 404

        # Get project data
        project = Project.query.filter_by(project_id=boq.project_id).first()
        if not project:
            return jsonify({
                "error": "Project not found",
                "message": f"No project found with ID {boq.project_id}"
            }), 404

        # Prepare BOQ data
        boq_data = {
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'status': boq.status,
            'created_by': boq.created_by,
            'created_at': boq.created_at.strftime('%d-%b-%Y %I:%M %p') if boq.created_at else 'N/A'
        }

        # Prepare project data
        project_data = {
            'project_name': project.project_name,
            'client': project.client if hasattr(project, 'client') else 'N/A',
            'location': project.location if hasattr(project, 'location') else 'N/A'
        }

        # Prepare items summary from BOQ details JSON
        items_summary = boq_details.boq_details.get('summary', {})
        items_summary['items'] = boq_details.boq_details.get('items', [])

        # Initialize email service
        # boq_email_service = BOQEmailService()

        # Get TD email from request - support both JSON body and query params (GET request)
        try:
            data = request.get_json(silent=True) or {}
        except Exception as e:
            log.warning(f"Failed to parse JSON body: {e}")
            data = {}

        # Read from JSON body first, fallback to query params for GET requests
        td_email = data.get('td_email') or request.args.get('td_email')
        td_name = data.get('full_name') or request.args.get('full_name')
        comments = data.get('comments') or request.args.get('comments')

        if td_email:
            # Send to specific TD
            # email_sent = boq_email_service.send_boq_to_technical_director(
            #     boq_data, project_data, items_summary, td_email
            # )

            # if email_sent:
                # Update BOQ status and mark email as sent to TD
            # This is the Client Revision send to TD API - always set status to Client_Pending_Revision
            # CRITICAL FIX: Removed "Internal_Revision_Pending" from this check
            # Internal revisions should be sent via send_boq_email(), not this function
            is_revision = boq.status in ["Rejected", "Client_Rejected", "Under_Revision", "Pending_Revision", "Revision_Approved", "client_revision_rejected"]
            # Client Revisions sent to TD get status "Client_Pending_Revision"
            new_status = "Client_Pending_Revision" if is_revision else "Pending"
            boq.email_sent = True
            boq.status = new_status
            boq.last_modified_by = user_name
            boq.last_modified_at = datetime.utcnow()

            # Check if history entry already exists for this BOQ
            existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

            # Prepare action data in the new format
            new_action = {
                "role": user_role,
                "type": "client_revision_sent" if is_revision else "email_sent",
                "sender": user_role,
                "receiver": "technicalDirector",
                "status": new_status.lower(),
                "comments": comments if comments else ("Client revision sent to TD for review" if is_revision else "BOQ sent for review and approval"),
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": user_name,
                "decided_by_user_id": user_id,
                "recipient_email": td_email,
                "recipient_name": td_name if td_name else None,
                "boq_name": boq.boq_name,
                "project_name": project_data.get("project_name"),
                "total_cost": items_summary.get("total_cost"),
                "is_revision": is_revision
            }

            if existing_history:
                # Append to existing action array (avoid duplicates)
                # Handle existing actions - ensure it's always a list
                if existing_history.action is None:
                    current_actions = []
                elif isinstance(existing_history.action, list):
                    current_actions = existing_history.action
                elif isinstance(existing_history.action, dict):
                    current_actions = [existing_history.action]
                else:
                    current_actions = []

                # Check if similar action already exists (same type, sender, receiver, timestamp within 1 minute)
                action_exists = False
                for existing_action in current_actions:
                    if (existing_action.get('type') == new_action['type'] and
                        existing_action.get('sender') == new_action['sender'] and
                        existing_action.get('receiver') == new_action['receiver']):
                        # Check if timestamps are within 1 minute (to avoid duplicate on retry)
                        existing_ts = existing_action.get('timestamp', '')
                        new_ts = new_action['timestamp']
                        if existing_ts and new_ts:
                            try:
                                existing_dt = datetime.fromisoformat(existing_ts)
                                new_dt = datetime.fromisoformat(new_ts)
                                if abs((new_dt - existing_dt).total_seconds()) < 60:
                                    action_exists = True
                                    break
                            except:
                                pass

                if not action_exists:
                    current_actions.append(new_action)
                    existing_history.action = current_actions
                    # Mark JSONB field as modified for SQLAlchemy
                    flag_modified(existing_history, "action")

                existing_history.action_by = user_name
                existing_history.boq_status = "Pending"
                existing_history.sender = user_name
                existing_history.receiver = td_name if td_name else td_email
                existing_history.comments = comments if comments else "BOQ sent for review and approval"
                existing_history.sender_role = user_role
                existing_history.receiver_role = 'technicalDirector'
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = user_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                # Create new history entry with action as array
                boq_history = BOQHistory(
                    boq_id=boq_id,
                    action=[new_action],  # Store as array
                    action_by=user_name,
                    boq_status="Pending",
                    sender=user_name,
                    receiver=td_name if td_name else td_email,
                    comments=comments if comments else "BOQ sent for review and approval",
                    sender_role=user_role,
                    receiver_role='technicalDirector',
                    action_date=datetime.utcnow(),
                    created_by=user_name
                )
                db.session.add(boq_history)

            # Cache fields BEFORE commit to avoid SQLAlchemy lazy-loading issues
            cached_project_name = project.project_name

            db.session.commit()

            # Send notification to TD
            notification_sent = False
            try:
                from utils.comprehensive_notification_service import notification_service
                from utils.notification_utils import NotificationManager
                from socketio_server import send_notification_to_user, send_notification_to_role
                from models.user import User as UserModel
                # Find TD user by email
                td_user = UserModel.query.filter_by(email=td_email).first()
                if td_user:
                    cached_td_user_id = td_user.user_id
                    # Get revision number for notification
                    revision_num = boq.revision_number if boq and boq.revision_number else 0
                    try:
                        notification_service.notify_client_revision_created(
                            boq_id=boq_id,
                            project_name=cached_project_name,
                            revision_number=revision_num,
                            actor_id=user_id,
                            actor_name=user_name,
                            actor_role=user_role
                        )
                        notification_sent = True
                    except Exception as svc_err:
                        log.error(f"[send_client_revision] Service notification failed: {svc_err}")
                        import traceback
                        log.error(traceback.format_exc())

                    # Fallback: create notification directly if service failed
                    if not notification_sent:
                        try:
                            from utils.role_route_mapper import get_td_approval_url
                            action_url = get_td_approval_url(cached_td_user_id, boq_id, tab='revisions', subtab='client')
                            fallback_notif = NotificationManager.create_notification(
                                user_id=cached_td_user_id,
                                type='approval',
                                title='Client Revision BOQ for Approval',
                                message=f'Client Revision BOQ for {cached_project_name} (Revision R{revision_num}) requires your review. Submitted by {user_name}',
                                priority='high',
                                category='boq',
                                action_required=True,
                                action_url=action_url,
                                action_label='Review Revision',
                                metadata={'boq_id': boq_id, 'client_revision_number': revision_num, 'target_role': 'technical_director'},
                                sender_id=user_id,
                                sender_name=user_name,
                                target_role='technical_director'
                            )
                            send_notification_to_user(cached_td_user_id, fallback_notif.to_dict())
                            send_notification_to_role('technicalDirector', fallback_notif.to_dict())
                            notification_sent = True
                        except Exception as fallback_err:
                            log.error(f"[send_client_revision] Fallback also failed: {fallback_err}")
                else:
                    log.warning(f"[send_client_revision] TD user not found by email: {td_email}")
            except Exception as notif_err:
                log.error(f"[send_client_revision] Failed to send notification: {notif_err}")
                import traceback
                log.error(traceback.format_exc())

            # Send email only if TD is offline
            try:
                from models.user import User as UserModel
                td_user_for_email = UserModel.query.filter_by(email=td_email).first()
                if td_user_for_email:
                    td_status = str(td_user_for_email.user_status).lower().strip() if td_user_for_email.user_status else "unknown"
                    if td_status == "offline":
                        boq_email_service = BOQEmailService()
                        email_sent = boq_email_service.send_boq_to_technical_director(
                            boq_data, project_data, items_summary, td_email
                        )
                    else:
                        log.info(f"[send_client_revision] TD is ONLINE - Email skipped (in-app notification only)")
                else:
                    log.warning(f"[send_client_revision] TD user not found by email for status check: {td_email}")
            except Exception as email_err:
                log.error(f"[send_client_revision] Failed to send email to TD: {email_err}")

            return jsonify({
                "success": True,
                "message": "BOQ review email sent successfully to Technical Director",
                "boq_id": boq_id,
                "recipient": td_email,
                "notification_sent": notification_sent
            }), 200
            # else:
            #     return jsonify({
            #         "success": False,
            #         "message": "Failed to send BOQ review email",
            #         "boq_id": boq_id,
            #         "error": "Email service failed"
            #     }), 500
        else:
            # Send to ALL Technical Directors (support multiple TDs)
            td_role = Role.query.filter_by(role='technicalDirector').first()

            if not td_role:
                return jsonify({
                    "error": "Technical Director role not found",
                    "message": "Technical Director role not configured in the system"
                }), 404

            # Get ALL active TDs instead of just first()
            technical_directors = User.query.filter_by(
                role_id=td_role.role_id,
                is_active=True,
                is_deleted=False
            ).all()

            if not technical_directors:
                return jsonify({
                    "error": "No Technical Director found",
                    "message": "No active Technical Director found in the system"
                }), 404

            # Use first TD for compatibility with single-TD logic below
            technical_director = technical_directors[0]

            if not technical_director.email:
                return jsonify({
                    "error": "Technical Director has no email",
                    "message": f"Technical Director {technical_director.full_name} does not have an email address"
                }), 400

            # Send email to the Technical Director
            # email_sent = boq_email_service.send_boq_to_technical_director(
            #     boq_data, project_data, items_summary, technical_director.email
            # )

            # if email_sent:
                # Update BOQ status and mark email as sent to TD
            # This is the Client Revision send to TD API - always set status to Client_Pending_Revision
            # CRITICAL FIX: Removed "Internal_Revision_Pending" from this check
            # Internal revisions should be sent via send_boq_email(), not this function
            is_revision = boq.status in ["Rejected", "Client_Rejected", "Under_Revision", "Pending_Revision", "Revision_Approved", "client_revision_rejected"]
            # Client Revisions sent to TD get status "Client_Pending_Revision"
            new_status = "Client_Pending_Revision" if is_revision else "Pending"

            boq.email_sent = True
            boq.status = new_status
            boq.last_modified_by = boq.created_by
            boq.last_modified_at = datetime.utcnow()

            # Check if history entry already exists for this BOQ
            existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

            # Prepare action data in the new format
            new_action = {
                "role": user_role,
                "type": "client_revision_sent" if is_revision else "email_sent",
                "sender": user_name,
                "receiver": "technicalDirector",
                "status": new_status.lower(),
                "comments": comments if comments else ("Client revision sent to TD for review" if is_revision else "BOQ sent for review and approval"),
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": user_name,
                "decided_by_user_id": user_id,
                "recipient_email": technical_director.email if technical_director.email else None,
                "recipient_name": technical_director.full_name if technical_director.full_name else None,
                "boq_name": boq.boq_name,
                "project_name": project_data.get("project_name"),
                "total_cost": items_summary.get("total_cost")
            }

            if existing_history:
                # Append to existing action array (avoid duplicates)
                # Handle existing actions - ensure it's always a list
                if existing_history.action is None:
                    current_actions = []
                elif isinstance(existing_history.action, list):
                    current_actions = existing_history.action
                elif isinstance(existing_history.action, dict):
                    current_actions = [existing_history.action]
                else:
                    current_actions = []

                # Check if similar action already exists (same type, sender, receiver, timestamp within 1 minute)
                action_exists = False
                for existing_action in current_actions:
                    if (existing_action.get('type') == new_action['type'] and
                        existing_action.get('sender') == new_action['sender'] and
                        existing_action.get('receiver') == new_action['receiver']):
                        # Check if timestamps are within 1 minute (to avoid duplicate on retry)
                        existing_ts = existing_action.get('timestamp', '')
                        new_ts = new_action['timestamp']
                        if existing_ts and new_ts:
                            try:
                                existing_dt = datetime.fromisoformat(existing_ts)
                                new_dt = datetime.fromisoformat(new_ts)
                                if abs((new_dt - existing_dt).total_seconds()) < 60:
                                    action_exists = True
                                    break
                            except:
                                pass

                if not action_exists:
                    current_actions.append(new_action)
                    existing_history.action = current_actions
                    # Mark JSONB field as modified for SQLAlchemy
                    flag_modified(existing_history, "action")

                existing_history.action_by = user_name
                existing_history.boq_status = "Pending"
                existing_history.sender = user_name
                existing_history.receiver = technical_director.full_name if technical_director.full_name else technical_director.email
                existing_history.comments = comments if comments else "BOQ sent for review and approval"
                existing_history.sender_role = user_role
                existing_history.receiver_role = 'technicalDirector'
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = user_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                # Create new history entry with action as array
                boq_history = BOQHistory(
                    boq_id=boq_id,
                    action=[new_action],  # Store as array
                    action_by=user_name,
                    boq_status="Pending",
                    sender=user_name,
                    receiver=technical_director.full_name if technical_director.full_name else technical_director.email,
                    comments=comments if comments else "BOQ sent for review and approval",
                    sender_role=user_role,
                    receiver_role='technicalDirector',
                    action_date=datetime.utcnow(),
                    created_by=user_name
                )
                db.session.add(boq_history)

            # Cache fields BEFORE commit to avoid SQLAlchemy lazy-loading issues
            cached_project_name = project.project_name
            cached_td_list = [(td.user_id, td.full_name, td.email) for td in technical_directors]
            cached_td_email = technical_director.email

            db.session.commit()

            # Send notification to ALL TDs
            notification_sent = False
            try:
                from utils.comprehensive_notification_service import notification_service
                from utils.notification_utils import NotificationManager
                from socketio_server import send_notification_to_user, send_notification_to_role
                # Get revision number from boq object (already loaded above)
                boq_for_notification = BOQ.query.get(boq_id)
                revision_num = boq_for_notification.revision_number if boq_for_notification else 0

                for td_user_id, td_full_name, td_email_addr in cached_td_list:
                    td_notif_sent = False
                    try:
                        # Call notify_client_revision_created for client revisions
                        notification_service.notify_client_revision_created(
                            boq_id=boq_id,
                            project_name=cached_project_name,
                            revision_number=revision_num,
                            actor_id=user_id,
                            actor_name=user_name,
                            actor_role=user_role
                        )
                        td_notif_sent = True
                        notification_sent = True
                    except Exception as td_notif_err:
                        log.error(f"[send_client_revision] Failed to send notification to TD {td_user_id}: {td_notif_err}")
                        import traceback
                        log.error(traceback.format_exc())

                    # Fallback: create notification directly in DB if service failed
                    if not td_notif_sent:
                        try:
                            from utils.role_route_mapper import get_td_approval_url
                            action_url = get_td_approval_url(td_user_id, boq_id, tab='revisions', subtab='client')
                            fallback_notif = NotificationManager.create_notification(
                                user_id=td_user_id,
                                type='approval',
                                title='Client Revision BOQ for Approval',
                                message=f'Client Revision BOQ for {cached_project_name} (Revision R{revision_num}) requires your review. Submitted by {user_name}',
                                priority='high',
                                category='boq',
                                action_required=True,
                                action_url=action_url,
                                action_label='Review Revision',
                                metadata={'boq_id': boq_id, 'client_revision_number': revision_num, 'target_role': 'technical_director'},
                                sender_id=user_id,
                                sender_name=user_name,
                                target_role='technical_director'
                            )
                            send_notification_to_user(td_user_id, fallback_notif.to_dict())
                            send_notification_to_role('technicalDirector', fallback_notif.to_dict())
                            notification_sent = True
                        except Exception as fallback_err:
                            log.error(f"[send_client_revision] Fallback also failed for TD {td_user_id}: {fallback_err}")

                    # Send email only if this TD is offline
                    try:
                        from models.user import User as UserModel
                        td_user_obj = UserModel.query.filter_by(user_id=td_user_id).first()
                        if td_user_obj:
                            td_status = str(td_user_obj.user_status).lower().strip() if td_user_obj.user_status else "unknown"
                            if td_status == "offline":
                                boq_email_service = BOQEmailService()
                                email_sent = boq_email_service.send_boq_to_technical_director(
                                    boq_data, project_data, items_summary, td_email_addr
                                )
                            else:
                                log.info(f"[send_client_revision] TD {td_user_id} is ONLINE - Email skipped (in-app notification only)")
                        else:
                            log.warning(f"[send_client_revision] TD user {td_user_id} not found for email status check")
                    except Exception as email_err:
                        log.error(f"[send_client_revision] Failed to send email to TD {td_user_id}: {email_err}")

            except Exception as notif_err:
                log.error(f"[send_client_revision] Failed to send notifications to TDs: {notif_err}")
                import traceback
                log.error(traceback.format_exc())

            return jsonify({
                "success": True,
                "message": "BOQ review email sent successfully to Technical Director",
                "boq_id": boq_id,
                "email": cached_td_email,
                "notification_sent": notification_sent
            }), 200
            # else:
            #     return jsonify({
            #         "success": False,
            #         "message": "Failed to send BOQ review email to Technical Director",
            #         "boq_id": boq_id,
            #         "error": "Email service failed"
            #     }), 500

    except Exception as e:
        log.error(f"Error sending BOQ email for BOQ {boq_id}: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to send BOQ email notification",
            "error": str(e)
        }), 500