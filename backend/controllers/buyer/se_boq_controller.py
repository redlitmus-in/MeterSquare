from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails
from models.change_request import ChangeRequest
from models.user import User
from models.vendor import Vendor
from config.logging import get_logger
from datetime import datetime
import json

log = get_logger()

__all__ = [
    'get_se_boq_assignments', 'select_vendor_for_se_boq',
    'td_approve_vendor_for_se_boq', 'td_reject_vendor_for_se_boq',
    'complete_se_boq_purchase', 'send_se_boq_vendor_email',
]


def get_se_boq_assignments():
    """Get all BOQ material assignments from Site Engineer for current buyer"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment

        current_user = g.user
        buyer_id = current_user['user_id']

        # Get all assignments for this buyer
        assignments = BOQMaterialAssignment.query.filter(
            BOQMaterialAssignment.assigned_to_buyer_user_id == buyer_id,
            BOQMaterialAssignment.is_deleted == False
        ).order_by(BOQMaterialAssignment.created_at.desc()).all()

        assignments_list = []
        for assignment in assignments:
            # Get BOQ and project details
            boq = BOQ.query.filter_by(boq_id=assignment.boq_id, is_deleted=False).first()
            project = Project.query.filter_by(project_id=assignment.project_id, is_deleted=False).first()

            if not boq or not project:
                continue

            # Get BOQ details for overhead calculation
            boq_detail = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()

            # Calculate overhead/miscellaneous from BOQ details
            overhead_allocated = 0.0
            overhead_percentage = 0.0
            base_total_for_overhead = 0.0

            if boq_detail and boq_detail.boq_details:
                boq_details_json = boq_detail.boq_details
                items = boq_details_json.get('items', [])

                # Calculate total base from all items
                for item in items:
                    sub_items = item.get('sub_items', [])

                    # Support both old and new BOQ structures
                    if (item.get('has_sub_items') and sub_items) or (sub_items and len(sub_items) > 0):
                        # Sum up base_total from all sub-items
                        for sub_item in sub_items:
                            # Try different fields for base total
                            base_total = float(sub_item.get('base_total', 0) or sub_item.get('internal_cost', 0) or 0)
                            quantity = float(sub_item.get('quantity', 1))
                            # base_total is already calculated per quantity in BOQ structure
                            base_total_for_overhead += base_total

                    # Get overhead percentage from item
                    if overhead_percentage == 0:
                        overhead_percentage = float(item.get('overhead_percentage', 0) or item.get('miscellaneous_percentage', 0) or item.get('misc_percentage', 0) or 0)

                # Calculate overhead amount
                if overhead_percentage > 0 and base_total_for_overhead > 0:
                    overhead_allocated = (base_total_for_overhead * overhead_percentage) / 100

            # Get BOQ materials from BOQ details JSONB
            materials_list = []
            total_cost = 0

            if boq_detail and boq_detail.boq_details:
                boq_details_json = boq_detail.boq_details
                items = boq_details_json.get('items', [])

                # Extract materials from all items and sub-items
                for item in items:
                    # Check both has_sub_items flag AND if sub_items array exists and has items
                    sub_items = item.get('sub_items', [])

                    # Support both old and new BOQ structures
                    if (item.get('has_sub_items') and sub_items) or (sub_items and len(sub_items) > 0):
                        for sub_item in sub_items:
                            # Get materials from sub-item
                            materials = sub_item.get('materials', [])
                            for material in materials:
                                material_total = float(material.get('total_price', 0) or 0)
                                total_cost += material_total
                                materials_list.append({
                                    'material_name': material.get('material_name', ''),
                                    'sub_item_name': sub_item.get('sub_item_name', ''),
                                    'item_name': item.get('item_name', ''),
                                    'quantity': float(material.get('quantity', 0) or 0),
                                    'unit': material.get('unit', ''),
                                    'unit_price': float(material.get('unit_price', 0) or 0),
                                    'total_price': material_total
                                })

            # Get vendor info if selected
            vendor_info = None
            if assignment.selected_vendor_id:
                vendor = Vendor.query.filter_by(vendor_id=assignment.selected_vendor_id).first()
                if vendor:
                    vendor_info = {
                        'vendor_id': vendor.vendor_id,
                        'company_name': vendor.company_name,
                        'email': vendor.email,
                        'phone': vendor.phone
                    }

            assignment_data = assignment.to_dict()
            assignment_data.update({
                'boq': {
                    'boq_id': boq.boq_id,
                    'boq_name': boq.boq_name
                },
                'project': {
                    'project_id': project.project_id,
                    'project_name': project.project_name,
                    'client': project.client,
                    'location': project.location
                },
                'materials': materials_list,
                'total_cost': round(total_cost, 2),
                'overhead_allocated': round(overhead_allocated, 2),
                'overhead_percentage': round(overhead_percentage, 2),
                'base_total': round(base_total_for_overhead, 2),
                'vendor': vendor_info
            })
            assignments_list.append(assignment_data)

        return jsonify({
            "success": True,
            "assignments": assignments_list,
            "count": len(assignments_list)
        }), 200

    except Exception as e:
        log.error(f"Error fetching SE BOQ assignments: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch assignments: {str(e)}"}), 500


def select_vendor_for_se_boq(assignment_id):
    """Buyer selects vendor for SE BOQ assignment"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQHistory, BOQ
        from models.project import Project

        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_id = data.get('vendor_id')

        if not vendor_id:
            return jsonify({"error": "vendor_id is required"}), 400

        # Get assignment - TD/Admin can select for any assignment, Buyer only for their own
        if user_role in ['technicaldirector', 'admin']:
            assignment = BOQMaterialAssignment.query.filter_by(
                assignment_id=assignment_id,
                is_deleted=False
            ).first()
        else:
            assignment = BOQMaterialAssignment.query.filter_by(
                assignment_id=assignment_id,
                assigned_to_buyer_user_id=user_id,
                is_deleted=False
            ).first()

        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        # Verify vendor exists
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Update assignment with vendor selection
        assignment.selected_vendor_id = vendor_id
        assignment.selected_vendor_name = vendor.company_name
        assignment.vendor_selected_by_buyer_id = user_id
        assignment.vendor_selected_by_buyer_name = user_name
        assignment.vendor_selection_date = datetime.utcnow()
        assignment.vendor_selection_status = 'pending_td_approval'
        assignment.updated_at = datetime.utcnow()

        # Create BOQ history entry
        boq_history = BOQHistory.query.filter_by(boq_id=assignment.boq_id).first()
        boq = BOQ.query.filter_by(boq_id=assignment.boq_id).first()
        project = Project.query.filter_by(project_id=assignment.project_id).first()

        # Handle existing actions
        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        # Create new action
        action_role = user_role if user_role in ['buyer', 'technicaldirector', 'admin'] else 'buyer'
        new_action = {
            "role": action_role,
            "type": "vendor_selected_for_se_boq" if user_role == 'buyer' else "vendor_changed_for_se_boq",
            "sender": action_role,
            "receiver": "technical_director",
            "status": "pending_td_approval",
            "boq_name": boq.boq_name if boq else '',
            "project_name": project.project_name if project else '',
            "vendor_name": vendor.company_name,
            "comments": f"{user_name} selected vendor {vendor.company_name} for SE BOQ assignment",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": user_name,
            "sender_user_id": user_id,
            "assignment_id": assignment_id
        }

        current_actions.append(new_action)

        if boq_history:
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=assignment.boq_id,
                action=current_actions,
                action_by=user_name,
                boq_status=boq.status if boq else '',
                sender=user_name,
                receiver='Technical Director',
                comments=f"Vendor {vendor.company_name} selected, pending TD approval",
                sender_role=action_role,
                receiver_role='technical_director',
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(boq_history)

        db.session.commit()

        return jsonify({
            "success": True,
            "message": f"Vendor {vendor.company_name} selected. Awaiting TD approval.",
            "vendor_selection_status": "pending_td_approval"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error selecting vendor for SE BOQ: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to select vendor: {str(e)}"}), 500


def td_approve_vendor_for_se_boq(assignment_id):
    """Technical Director approves vendor selection for SE BOQ assignment"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQHistory, BOQ

        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Technical Director')

        # Get assignment
        assignment = BOQMaterialAssignment.query.filter_by(
            assignment_id=assignment_id,
            is_deleted=False
        ).first()

        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        if assignment.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": "No pending vendor approval"}), 400

        # Approve vendor selection
        assignment.vendor_selection_status = 'approved'
        assignment.vendor_approved_by_td_id = td_id
        assignment.vendor_approved_by_td_name = td_name
        assignment.vendor_approval_date = datetime.utcnow()
        assignment.vendor_rejection_reason = None
        assignment.updated_at = datetime.utcnow()

        # Create BOQ history entry
        boq_history = BOQHistory.query.filter_by(boq_id=assignment.boq_id).first()
        boq = BOQ.query.filter_by(boq_id=assignment.boq_id).first()

        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        new_action = {
            "role": "technical_director",
            "type": "vendor_approved_for_se_boq",
            "sender": "technical_director",
            "receiver": "buyer",
            "status": "approved",
            "boq_name": boq.boq_name if boq else '',
            "vendor_name": assignment.selected_vendor_name,
            "comments": f"TD approved vendor {assignment.selected_vendor_name}",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": td_name,
            "sender_user_id": td_id,
            "assignment_id": assignment_id
        }

        current_actions.append(new_action)

        if boq_history:
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=assignment.boq_id,
                action=current_actions,
                action_by=td_name,
                boq_status=boq.status if boq else '',
                sender=td_name,
                receiver=assignment.assigned_to_buyer_name,
                comments=f"Vendor {assignment.selected_vendor_name} approved",
                sender_role='technical_director',
                receiver_role='buyer',
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Send notifications to buyer and site engineer about vendor approval
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            # Notify buyer
            if assignment.assigned_to_buyer_id:
                buyer_notification = NotificationManager.create_notification(
                    user_id=assignment.assigned_to_buyer_id,
                    type='approval',
                    title='SE BOQ Vendor Approved',
                    message=f'TD approved vendor "{assignment.selected_vendor_name}" for SE BOQ materials',
                    priority='high',
                    category='vendor',
                    action_url=f'/buyer/purchase-orders?assignment_id={assignment_id}',
                    action_label='Proceed with Purchase',
                    metadata={
                        'assignment_id': str(assignment_id),
                        'vendor_name': assignment.selected_vendor_name,
                        'boq_id': str(assignment.boq_id) if assignment.boq_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(assignment.assigned_to_buyer_id, buyer_notification.to_dict())

            # Notify site engineer
            if assignment.site_engineer_id:
                se_notification = NotificationManager.create_notification(
                    user_id=assignment.site_engineer_id,
                    type='info',
                    title='BOQ Vendor Approved',
                    message=f'TD approved vendor "{assignment.selected_vendor_name}" for your BOQ materials',
                    priority='medium',
                    category='vendor',
                    action_url=f'/site-engineer/boq/{assignment.boq_id}',
                    action_label='View BOQ',
                    metadata={
                        'assignment_id': str(assignment_id),
                        'vendor_name': assignment.selected_vendor_name,
                        'boq_id': str(assignment.boq_id) if assignment.boq_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name
                )
                send_notification_to_user(assignment.site_engineer_id, se_notification.to_dict())

        except Exception as notif_error:
            log.error(f"Failed to send SE BOQ vendor approval notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection approved successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving vendor for SE BOQ: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to approve vendor: {str(e)}"}), 500


def td_reject_vendor_for_se_boq(assignment_id):
    """Technical Director rejects vendor selection for SE BOQ assignment"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQHistory, BOQ

        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Technical Director')

        data = request.get_json()
        rejection_reason = data.get('rejection_reason', '')

        # Get assignment
        assignment = BOQMaterialAssignment.query.filter_by(
            assignment_id=assignment_id,
            is_deleted=False
        ).first()

        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        if assignment.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": "No pending vendor approval"}), 400

        # Store rejected vendor name for history
        rejected_vendor_name = assignment.selected_vendor_name

        # Reject vendor selection - clear vendor data
        assignment.vendor_selection_status = 'rejected'
        assignment.vendor_approved_by_td_id = td_id
        assignment.vendor_approved_by_td_name = td_name
        assignment.vendor_approval_date = datetime.utcnow()
        assignment.vendor_rejection_reason = rejection_reason
        # Clear vendor selection so buyer can select again
        assignment.selected_vendor_id = None
        assignment.selected_vendor_name = None
        assignment.vendor_selected_by_buyer_id = None
        assignment.vendor_selected_by_buyer_name = None
        assignment.vendor_selection_date = None
        assignment.updated_at = datetime.utcnow()

        # Create BOQ history entry
        boq_history = BOQHistory.query.filter_by(boq_id=assignment.boq_id).first()
        boq = BOQ.query.filter_by(boq_id=assignment.boq_id).first()

        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        new_action = {
            "role": "technical_director",
            "type": "vendor_rejected_for_se_boq",
            "sender": "technical_director",
            "receiver": "buyer",
            "status": "rejected",
            "boq_name": boq.boq_name if boq else '',
            "vendor_name": rejected_vendor_name,
            "rejection_reason": rejection_reason,
            "comments": f"TD rejected vendor {rejected_vendor_name}: {rejection_reason}",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": td_name,
            "sender_user_id": td_id,
            "assignment_id": assignment_id
        }

        current_actions.append(new_action)

        if boq_history:
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=assignment.boq_id,
                action=current_actions,
                action_by=td_name,
                boq_status=boq.status if boq else '',
                sender=td_name,
                receiver=assignment.assigned_to_buyer_name,
                comments=f"Vendor {rejected_vendor_name} rejected: {rejection_reason}",
                sender_role='technical_director',
                receiver_role='buyer',
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Send notifications to buyer and site engineer about vendor rejection
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            # Notify buyer
            if assignment.assigned_to_buyer_id:
                buyer_notification = NotificationManager.create_notification(
                    user_id=assignment.assigned_to_buyer_id,
                    type='rejection',
                    title='SE BOQ Vendor Rejected',
                    message=f'TD rejected vendor "{rejected_vendor_name}" for SE BOQ materials. Reason: {rejection_reason}',
                    priority='high',
                    category='vendor',
                    action_required=True,
                    action_url=f'/buyer/purchase-orders?assignment_id={assignment_id}',
                    action_label='Select New Vendor',
                    metadata={
                        'assignment_id': str(assignment_id),
                        'rejected_vendor_name': rejected_vendor_name,
                        'rejection_reason': rejection_reason,
                        'boq_id': str(assignment.boq_id) if assignment.boq_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name,
                    target_role='buyer'
                )
                send_notification_to_user(assignment.assigned_to_buyer_id, buyer_notification.to_dict())

            # Notify site engineer
            if assignment.site_engineer_id:
                se_notification = NotificationManager.create_notification(
                    user_id=assignment.site_engineer_id,
                    type='info',
                    title='BOQ Vendor Rejected',
                    message=f'TD rejected vendor "{rejected_vendor_name}" for your BOQ materials. Buyer will select a new vendor.',
                    priority='medium',
                    category='vendor',
                    action_url=f'/site-engineer/boq/{assignment.boq_id}',
                    action_label='View BOQ',
                    metadata={
                        'assignment_id': str(assignment_id),
                        'rejected_vendor_name': rejected_vendor_name,
                        'rejection_reason': rejection_reason,
                        'boq_id': str(assignment.boq_id) if assignment.boq_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name
                )
                send_notification_to_user(assignment.site_engineer_id, se_notification.to_dict())

        except Exception as notif_error:
            log.error(f"Failed to send SE BOQ vendor rejection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection rejected. Buyer can select a new vendor."
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting vendor for SE BOQ: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to reject vendor: {str(e)}"}), 500


def complete_se_boq_purchase(assignment_id):
    """Buyer completes purchase for SE BOQ assignment"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQHistory, BOQ

        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Buyer')

        data = request.get_json()
        notes = data.get('notes', '')

        # Get assignment
        assignment = BOQMaterialAssignment.query.filter_by(
            assignment_id=assignment_id,
            assigned_to_buyer_user_id=buyer_id,
            is_deleted=False
        ).first()

        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        if assignment.vendor_selection_status != 'approved':
            return jsonify({"error": "Vendor selection must be approved by TD first"}), 400

        if assignment.status == 'purchase_completed':
            return jsonify({"error": "Purchase already completed"}), 400

        # Complete purchase
        assignment.status = 'purchase_completed'
        assignment.purchase_completed_by_user_id = buyer_id
        assignment.purchase_completed_by_name = buyer_name
        assignment.purchase_completion_date = datetime.utcnow()
        assignment.purchase_notes = notes
        assignment.updated_at = datetime.utcnow()

        # Create BOQ history entry
        boq_history = BOQHistory.query.filter_by(boq_id=assignment.boq_id).first()
        boq = BOQ.query.filter_by(boq_id=assignment.boq_id).first()

        if boq_history:
            if boq_history.action is None:
                current_actions = []
            elif isinstance(boq_history.action, list):
                current_actions = boq_history.action
            elif isinstance(boq_history.action, dict):
                current_actions = [boq_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        new_action = {
            "role": "buyer",
            "type": "se_boq_purchase_completed",
            "sender": "buyer",
            "receiver": "site_engineer",
            "status": "purchase_completed",
            "boq_name": boq.boq_name if boq else '',
            "vendor_name": assignment.selected_vendor_name,
            "comments": f"Purchase completed by {buyer_name}",
            "notes": notes,
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": buyer_name,
            "sender_user_id": buyer_id,
            "assignment_id": assignment_id
        }

        current_actions.append(new_action)

        if boq_history:
            boq_history.action = current_actions
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(boq_history, "action")
            boq_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=assignment.boq_id,
                action=current_actions,
                action_by=buyer_name,
                boq_status=boq.status if boq else '',
                sender=buyer_name,
                receiver=assignment.assigned_by_name,
                comments=f"SE BOQ purchase completed",
                sender_role='buyer',
                receiver_role='site_engineer',
                action_date=datetime.utcnow(),
                created_by=buyer_name
            )
            db.session.add(boq_history)

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Purchase completed successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error completing SE BOQ purchase: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to complete purchase: {str(e)}"}), 500


def send_se_boq_vendor_email(assignment_id):
    """Send purchase order email to vendor for SE BOQ assignment"""
    try:
        from models.boq_material_assignment import BOQMaterialAssignment
        from models.boq import BOQ, BOQDetails
        from models.project import Project

        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Buyer')

        data = request.get_json()
        vendor_email = data.get('vendor_email')

        if not vendor_email:
            return jsonify({"error": "Vendor email is required"}), 400

        # Get assignment
        assignment = BOQMaterialAssignment.query.filter_by(
            assignment_id=assignment_id,
            assigned_to_buyer_user_id=buyer_id,
            is_deleted=False
        ).first()

        if not assignment:
            return jsonify({"error": "Assignment not found"}), 404

        if assignment.vendor_selection_status != 'approved':
            return jsonify({"error": "Vendor must be approved by TD before sending email"}), 400

        # Get vendor
        vendor = Vendor.query.filter_by(vendor_id=assignment.selected_vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Get BOQ and project
        boq = BOQ.query.filter_by(boq_id=assignment.boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        project = Project.query.filter_by(project_id=assignment.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get BOQ details for materials
        boq_detail = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()
        materials_list = []

        if boq_detail and boq_detail.boq_details:
            items = boq_detail.boq_details.get('items', [])
            for item in items:
                item_name = item.get('description', '')
                sub_items = item.get('sub_items', [])
                for sub_item in sub_items:
                    sub_item_name = sub_item.get('sub_item_name', '')
                    materials = sub_item.get('materials', [])
                    for material in materials:
                        materials_list.append({
                            'item_name': item_name,
                            'sub_item_name': sub_item_name,
                            'material_name': material.get('material_name', ''),
                            'quantity': float(material.get('quantity', 0)),
                            'unit': material.get('unit', ''),
                            'unit_price': float(material.get('unit_price', 0)),
                            'total_price': float(material.get('total_price', 0))
                        })

        # Calculate totals from actual material data
        base_total = sum(mat['total_price'] for mat in materials_list)
        overhead_percentage = float(assignment.overhead_percentage or 0)
        overhead_amount = base_total * overhead_percentage / 100
        total_cost = base_total + overhead_amount

        # Prepare data for email
        vendor_data = {
            'vendor_id': vendor.vendor_id,
            'company_name': vendor.company_name,
            'contact_person_name': vendor.contact_person_name,
            'email': vendor_email
        }

        purchase_data = {
            'assignment_id': assignment.assignment_id,
            'materials': materials_list,
            'base_total': base_total,
            'overhead_percentage': overhead_percentage,
            'overhead_amount': overhead_amount,
            'total_cost': total_cost
        }

        buyer_data = {
            'buyer_id': buyer_id,
            'buyer_name': buyer_name,
            'buyer_email': current_user.get('email', '')
        }

        project_data = {
            'project_id': project.project_id,
            'project_name': project.project_name,
            'client': project.client,
            'location': project.location,
            'boq_name': boq.boq_name
        }

        # Send email to vendor
        # PERFORMANCE FIX: Use async email sending (15s -> 0.1s response time)
        from utils.boq_email_service import BOQEmailService
        email_service = BOQEmailService()
        email_sent = email_service.send_vendor_purchase_order_async(
            vendor_email, vendor_data, purchase_data, buyer_data, project_data
        )

        if email_sent:
            # Mark email as sent
            assignment.vendor_email_sent = True
            assignment.vendor_email_sent_date = datetime.utcnow()
            assignment.vendor_email_sent_by_user_id = buyer_id
            assignment.updated_at = datetime.utcnow()
            db.session.commit()

            return jsonify({
                "success": True,
                "message": "Purchase order email sent to vendor successfully"
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": "Failed to send email to vendor"
            }), 500

    except Exception as e:
        log.error(f"Error sending SE BOQ vendor email: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to send vendor email: {str(e)}"}), 500
