from flask import request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError
from controllers.boq_controller import add_to_master_tables
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from datetime import datetime, date
from sqlalchemy import func
from models.user import User
from utils.boq_email_service import BOQEmailService


log = get_logger()
# ==================== PROCUREMENT/PURCHASE MANAGEMENT ====================

def add_new_purchase():
    """Add new items/materials/labour to existing BOQ and log in history"""
    try:
        data = request.get_json()

        # Validate required fields
        boq_id = data.get("boq_id")
        if not boq_id:
            return jsonify({"error": "boq_id is required"}), 400

        if not data.get("items") or len(data.get("items", [])) == 0:
            return jsonify({"error": "At least one item is required"}), 400

        # Get current user first
        current_user = getattr(g, 'user', None)
        if current_user:
            created_by = current_user.get('full_name') or current_user.get('username') or 'User'
            user_id = current_user.get('user_id')
        else:
            created_by = data.get("created_by", "Admin")
            user_id = None

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Update BOQ status to sent_for_review instead of hardcoded approval
        boq.status = 'sent_for_review'
        boq.last_modified_by = created_by
        boq.last_modified_at = datetime.utcnow()

        # Get existing BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get project for history logging
        project = Project.query.filter_by(project_id=boq.project_id).first()

        # Get existing items from JSON
        existing_json = boq_details.boq_details or {}
        existing_items = existing_json.get("items", [])

        # Process new items
        new_boq_items = []
        new_items_summary = []
        total_new_cost = 0
        total_new_materials = 0
        total_new_labour = 0

        for item_data in data.get("items", []):
            materials_data = item_data.get("materials", [])
            labour_data = item_data.get("labour", [])

            # Calculate costs first
            materials_cost = 0
            for mat_data in materials_data:
                quantity = mat_data.get("quantity", 1.0)
                unit_price = mat_data.get("unit_price", 0.0)
                materials_cost += quantity * unit_price

            labour_cost = 0
            for labour_item in labour_data:
                hours = labour_item.get("hours", 0.0)
                rate_per_hour = labour_item.get("rate_per_hour", 0.0)
                labour_cost += hours * rate_per_hour

            # Calculate item costs
            base_cost = materials_cost + labour_cost

            # Use provided percentages, default to 10% overhead and 15% profit
            overhead_percentage = item_data.get("overhead_percentage", 10.0)
            profit_margin_percentage = item_data.get("profit_margin_percentage", 15.0)

            # Calculate amounts
            overhead_amount = (base_cost * overhead_percentage) / 100
            profit_margin_amount = (base_cost * profit_margin_percentage) / 100
            total_cost = base_cost + overhead_amount
            selling_price = total_cost + profit_margin_amount

            # Add to master tables
            master_item_id, master_material_ids, master_labour_ids = add_to_master_tables(
                item_data.get("item_name"),
                item_data.get("description"),
                item_data.get("work_type", "contract"),
                materials_data,
                labour_data,
                created_by,
                overhead_percentage,
                overhead_amount,
                profit_margin_percentage,
                profit_margin_amount
            )

            # Process materials
            item_materials = []
            for i, mat_data in enumerate(materials_data):
                quantity = mat_data.get("quantity", 1.0)
                unit_price = mat_data.get("unit_price", 0.0)
                total_price = quantity * unit_price

                item_materials.append({
                    "master_material_id": master_material_ids[i] if i < len(master_material_ids) else None,
                    "material_name": mat_data.get("material_name"),
                    "quantity": quantity,
                    "unit": mat_data.get("unit", "nos"),
                    "unit_price": unit_price,
                    "total_price": total_price
                })

            # Process labour
            item_labour = []
            for i, labour_item in enumerate(labour_data):
                hours = labour_item.get("hours", 0.0)
                rate_per_hour = labour_item.get("rate_per_hour", 0.0)
                total_cost_labour = hours * rate_per_hour

                item_labour.append({
                    "master_labour_id": master_labour_ids[i] if i < len(master_labour_ids) else None,
                    "labour_role": labour_item.get("labour_role"),
                    "hours": hours,
                    "rate_per_hour": rate_per_hour,
                    "total_cost": total_cost_labour
                })

            # Create item JSON
            item_json = {
                "master_item_id": master_item_id,
                "item_name": item_data.get("item_name"),
                "description": item_data.get("description"),
                "work_type": item_data.get("work_type", "contract"),
                "base_cost": base_cost,
                "overhead_percentage": overhead_percentage,
                "overhead_amount": overhead_amount,
                "profit_margin_percentage": profit_margin_percentage,
                "profit_margin_amount": profit_margin_amount,
                "total_cost": total_cost,
                "selling_price": selling_price,
                "totalMaterialCost": materials_cost,
                "totalLabourCost": labour_cost,
                "actualItemCost": base_cost,
                "estimatedSellingPrice": selling_price,
                "materials": item_materials,
                "labour": item_labour
            }

            new_boq_items.append(item_json)
            total_new_cost += selling_price
            total_new_materials += len(item_materials)
            total_new_labour += len(item_labour)

            # Summary for history
            new_items_summary.append({
                "item_name": item_data.get("item_name"),
                "selling_price": selling_price,
                "materials_count": len(item_materials),
                "labour_count": len(item_labour)
            })

        # Append new items to existing items
        updated_items = existing_items + new_boq_items

        # Recalculate totals
        total_boq_cost = sum(item.get("selling_price", 0) for item in updated_items)
        total_materials = sum(len(item.get("materials", [])) for item in updated_items)
        total_labour = sum(len(item.get("labour", [])) for item in updated_items)
        total_material_cost = sum(item.get("totalMaterialCost", 0) for item in updated_items)
        total_labour_cost = sum(item.get("totalLabourCost", 0) for item in updated_items)

        # Update BOQ details JSON
        updated_json = {
            "boq_id": boq.boq_id,
            "items": updated_items,
            "summary": {
                "total_items": len(updated_items),
                "total_materials": total_materials,
                "total_labour": total_labour,
                "total_material_cost": total_material_cost,
                "total_labour_cost": total_labour_cost,
                "total_cost": total_boq_cost,
                "selling_price": total_boq_cost,
                "estimatedSellingPrice": total_boq_cost
            }
        }

        # Update BOQ details
        boq_details.boq_details = updated_json
        boq_details.total_cost = total_boq_cost
        boq_details.total_items = len(updated_items)
        boq_details.total_materials = total_materials
        boq_details.total_labour = total_labour
        boq_details.last_modified_by = created_by
        boq_details.last_modified_at = datetime.utcnow()

        # Mark JSONB field as modified
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(boq_details, "boq_details")

        # Update BOQ
        boq.last_modified_by = created_by
        boq.last_modified_at = datetime.utcnow()

        # Add to BOQ History
        existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

        # Handle existing actions - ensure it's always a list
        if existing_history:
            if existing_history.action is None:
                current_actions = []
            elif isinstance(existing_history.action, list):
                current_actions = existing_history.action
            elif isinstance(existing_history.action, dict):
                current_actions = [existing_history.action]
            else:
                current_actions = []
        else:
            current_actions = []

        # Prepare new action - Store only creator info and item identifiers
        # Extract only item identifiers (master_item_id and item_name) for tracking
        item_identifiers = []
        for item in new_boq_items:
            item_identifiers.append({
                "master_item_id": item.get("master_item_id"),
                "item_name": item.get("item_name")
            })

        new_action = {
            "role": current_user.get('role_name', 'user') if current_user else 'admin',
            "type": "add_new_purchase",
            "sender": created_by,
            "creater": "projectmanager",
            "status": boq.status,
            "boq_name": boq.boq_name,
            "comments": f"Added {len(new_boq_items)} new item(s) to BOQ",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": created_by,
            "sender_user_id": user_id,
            "project_name": project.project_name if project else None,
            "project_id": boq.project_id,
            "item_identifiers": item_identifiers  # Only store identifiers for tracking, not full details
        }

        # Append new action
        current_actions.append(new_action)
        log.info(f"Appending add_new_purchase action to BOQ {boq_id} history. Total actions: {len(current_actions)}")

        if existing_history:
            # Update existing history
            existing_history.action = current_actions
            flag_modified(existing_history, "action")

            existing_history.action_by = created_by
            existing_history.sender = created_by
            existing_history.receiver = "BOQ"
            existing_history.comments = f"Added {len(new_boq_items)} new item(s) to BOQ"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = created_by
            existing_history.last_modified_at = datetime.utcnow()

            log.info(f"Updated existing history for BOQ {boq_id} with {len(current_actions)} actions")
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=current_actions,
                action_by=created_by,
                boq_status=boq.status,
                sender=created_by,
                receiver="BOQ",
                comments=f"Added {len(new_boq_items)} new item(s) to BOQ",
                sender_role=current_user.get('role_name', 'user') if current_user else 'admin',
                receiver_role='boq',
                action_date=datetime.utcnow(),
                created_by=created_by
            )
            db.session.add(boq_history)
            log.info(f"Created new history for BOQ {boq_id} with {len(current_actions)} actions")

        db.session.commit()
        log.info(f"Successfully added {len(new_boq_items)} new items to BOQ {boq_id}")

        return jsonify({
            "success": True,
            "message": f"Successfully added {len(new_boq_items)} new item(s) to BOQ",
            "boq_id": boq_id,
            "items_added": len(new_boq_items),
            "new_total_items": len(updated_items),
            "new_total_cost": round(total_boq_cost, 2),
            "value_added": round(total_new_cost, 2),
            "new_items": new_items_summary
        }), 200

    except SQLAlchemyError as e:
        db.session.rollback()
        log.error(f"Database error adding new purchase to BOQ: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500

def new_purchase_send_estimator(boq_id):
    """
    Send email notification to Estimator about new purchases added by Project Manager
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401
        pm_name = current_user.get('full_name', 'Project Manager')
        pm_id = current_user.get('user_id')
        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404
        # Get project details
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404
        # Get BOQ history to find new purchases
        boq_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).all()

        # Find all new purchase items that haven't been sent to estimator yet
        new_purchase_item_ids = set()
        new_purchase_item_names = set()
        already_sent_item_ids = set()
        already_sent_item_names = set()

        for history in boq_history:
            if history.action:
                actions = history.action if isinstance(history.action, list) else [history.action]
                for action in actions:
                    if isinstance(action, dict):
                        action_type = action.get("type")

                        # Track items that were already sent to estimator
                        if action_type == "new_purchase_notification_sent":
                            item_identifiers = action.get("item_identifiers", [])
                            for identifier in item_identifiers:
                                master_item_id = identifier.get("master_item_id")
                                item_name = identifier.get("item_name")
                                if master_item_id:
                                    already_sent_item_ids.add(master_item_id)
                                if item_name:
                                    already_sent_item_names.add(item_name)

                        # Get all new purchase items (from add_new_purchase actions)
                        elif action_type == "add_new_purchase":
                            item_identifiers = action.get("item_identifiers", [])
                            for identifier in item_identifiers:
                                master_item_id = identifier.get("master_item_id")
                                item_name = identifier.get("item_name")
                                if master_item_id:
                                    new_purchase_item_ids.add(master_item_id)
                                if item_name:
                                    new_purchase_item_names.add(item_name)

        # Filter out items that were already sent
        unsent_item_ids = new_purchase_item_ids - already_sent_item_ids
        unsent_item_names = new_purchase_item_names - already_sent_item_names

        log.info(f"BOQ {boq_id} - Total new purchases: {len(new_purchase_item_ids)}, Already sent: {len(already_sent_item_ids)}, Unsent: {len(unsent_item_ids)}")
        # Get all items from BOQ details
        all_items = []
        if boq_details.boq_details and "items" in boq_details.boq_details:
            all_items = boq_details.boq_details["items"]

        # Filter only unsent new purchase items
        new_items_data = []
        for item in all_items:
            master_item_id = item.get("master_item_id")
            item_name = item.get("item_name")

            # Check if item is in unsent list
            if master_item_id in unsent_item_ids or item_name in unsent_item_names:
                new_items_data.append(item)

        if not new_items_data:
            log.warning(f"BOQ {boq_id} - No unsent new purchase items found")
            return jsonify({
                "error": "No new purchase items found",
                "details": "All new purchase items have already been sent to the estimator"
            }), 404

        # Find Estimator (who created the original BOQ)
        estimator_name = boq.created_by
        estimator = User.query.filter_by(full_name=estimator_name, is_deleted=False).first()

        if not estimator or not estimator.email:
            return jsonify({"error": "Estimator not found or email not available"}), 404

        # Prepare data for email
        boq_data = {
            "boq_id": boq.boq_id,
            "boq_name": boq.boq_name,
            "status": boq.status
        }

        project_data = {
            "project_name": project.project_name,
            "client": getattr(project, "client", "N/A"),
            "location": getattr(project, "location", "N/A")
        }
        email_sent = False
        email_service = BOQEmailService()
        email_sent = email_service.send_new_purchase_notification(
            estimator_email=estimator.email,
            estimator_name=estimator.full_name,
            pm_name=pm_name,
            boq_data=boq_data,
            project_data=project_data,
            new_items_data=new_items_data
        )

        # Update BOQ status to "new_purchase_request" if email sent successfully
        if email_sent:
            boq.status = "new_purchase_request"
            boq.last_modified_by = pm_name
            boq.last_modified_at = datetime.utcnow()
            log.info(f"BOQ {boq_id} status updated to 'new_purchase_request'")

        try:
            existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()
            # Handle existing actions - ensure it's always a list
            if existing_history:
                if existing_history.action is None:
                    current_actions = []
                elif isinstance(existing_history.action, list):
                    current_actions = existing_history.action
                elif isinstance(existing_history.action, dict):
                    current_actions = [existing_history.action]
                else:
                    current_actions = []
            else:
                current_actions = []
            total_value = sum(item.get('selling_price', 0) for item in new_items_data)
            item_identifiers = []
            for item in new_items_data:
                item_identifiers.append({
                    "master_item_id": item.get("master_item_id"),
                    "item_name": item.get("item_name")
                })
            new_action = {
                "role": current_user.get('role_name', 'project_manager'),
                "type": "new_purchase_notification_sent",
                "sender": pm_name,
                "receiver": estimator.full_name,
                "sender_role": "project_manager",
                "receiver_role": "estimator",
                "status": "new_purchase_request",
                "boq_status_changed_to": "new_purchase_request",
                "boq_name": boq.boq_name,
                "comments": f"PM sent new purchase notification to Estimator ({len(new_items_data)} item(s)). BOQ status changed to 'new_purchase_request'",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": pm_name,
                "sender_user_id": pm_id,
                "receiver_name": estimator.full_name,
                "receiver_user_id": estimator.user_id,
                "receiver_email": estimator.email,
                "project_name": project.project_name,
                "project_id": project.project_id,
                "item_identifiers": item_identifiers,
                "items_count": len(new_items_data),
                "total_value": total_value,
                "email_sent": email_sent
            }
            current_actions.append(new_action)
            if existing_history:
                existing_history.action = current_actions
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(existing_history, "action")
                existing_history.action_by = pm_name
                existing_history.sender = pm_name
                existing_history.receiver = estimator.full_name
                existing_history.boq_status = "new_purchase_request"
                existing_history.comments = f"PM sent new purchase notification to Estimator. BOQ status: new_purchase_request"
                existing_history.sender_role = 'project_manager'
                existing_history.receiver_role = 'estimator'
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = pm_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                boq_history_entry = BOQHistory(
                    boq_id=boq_id,
                    action=current_actions,
                    action_by=pm_name,
                    boq_status="new_purchase_request",
                    sender=pm_name,
                    receiver=estimator.full_name,
                    comments=f"PM sent new purchase notification to Estimator. BOQ status: new_purchase_request",
                    sender_role='project_manager',
                    receiver_role='estimator',
                    action_date=datetime.utcnow(),
                    created_by=pm_name
                )
                db.session.add(boq_history_entry)
            db.session.commit()
        except Exception as history_error:
            log.error(f"Error storing notification in BOQ history: {history_error}")
            db.session.rollback()

        return jsonify({
            "success": True,
            "message": "New purchase notification sent to Estimator. BOQ status updated to 'new_purchase_request'",
            "email_sent": email_sent,
            "boq_status": boq.status,
            "boq_status_changed": email_sent,
            "estimator": {
                "name": estimator.full_name,
                "email": estimator.email
            },
            "items_count": len(new_items_data),
            "project_manager": pm_name,
            "history_stored": True
        }), 200

    except Exception as e:
        log.error(f"Error sending new purchase notification: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to send notification: {str(e)}"}), 500


def process_new_purchase_decision(boq_id):
    """
    Estimator approves or rejects new purchase request in a single API
    - If total BOQ amount < 50000: Send email to Project Manager
    - If total BOQ amount >= 50000: Send email to Technical Director

    Request body:
    {
        "status": "approved" or "rejected",
        "comments": "Optional comments for approval",
        "rejection_reason": "Required for rejection"
    }
    """
    try:
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        estimator_name = current_user.get('full_name', 'Estimator')
        estimator_id = current_user.get('user_id')

        # Get request data
        data = request.get_json() or {}
        status = data.get('status', '').lower()
        comments = data.get('comments', '')
        rejection_reason = data.get('rejection_reason', '')

        # Validate status
        if status not in ['approved', 'rejected']:
            return jsonify({"error": "Invalid status. Must be 'approved' or 'rejected'"}), 400

        # Validate rejection reason
        if status == 'rejected' and not rejection_reason:
            return jsonify({"error": "Rejection reason is required when status is 'rejected'"}), 400

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get project details
        project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get BOQ history to find new purchases from PM
        boq_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).all()

        # Find the PM who sent the purchase request
        pm_id = None
        pm_name = None
        new_purchase_item_ids = set()
        new_purchase_item_names = set()

        for history in boq_history:
            if history.action:
                actions = history.action if isinstance(history.action, list) else [history.action]
                for action in actions:
                    if isinstance(action, dict):
                        action_type = action.get("type")
                        if action_type == "new_purchase_notification_sent":
                            pm_id = action.get("sender_user_id")
                            pm_name = action.get("sender_name")
                            # Get item identifiers from this notification
                            item_identifiers = action.get("item_identifiers", [])
                            for identifier in item_identifiers:
                                master_item_id = identifier.get("master_item_id")
                                item_name = identifier.get("item_name")
                                if master_item_id:
                                    new_purchase_item_ids.add(master_item_id)
                                if item_name:
                                    new_purchase_item_names.add(item_name)

        if not pm_id or not pm_name:
            return jsonify({"error": "Project Manager not found for this purchase request"}), 404

        # Get PM details
        pm = User.query.filter_by(user_id=pm_id, is_deleted=False).first()
        if not pm or not pm.email:
            return jsonify({"error": "Project Manager email not found"}), 404

        # Get all items from BOQ details
        all_items = []
        if boq_details.boq_details and "items" in boq_details.boq_details:
            all_items = boq_details.boq_details["items"]

        # Filter only new purchase items
        new_items_data = []
        for item in all_items:
            master_item_id = item.get("master_item_id")
            item_name = item.get("item_name")

            if master_item_id in new_purchase_item_ids or item_name in new_purchase_item_names:
                new_items_data.append(item)

        if not new_items_data:
            return jsonify({"error": "No new purchase items found"}), 404

        # Calculate total amount of new purchases
        total_amount = sum(item.get('selling_price', 0) for item in new_items_data)

        # Get original BOQ total cost
        original_boq_total = float(boq_details.total_cost) if boq_details.total_cost else 0.0

        # Determine recipient based on threshold (50000)
        THRESHOLD = 50000

        if original_boq_total < THRESHOLD:
            # Send to Project Manager
            recipient_email = pm.email
            recipient_name = pm_name
            recipient_role = "project_manager"
            recipient_user_id = pm_id
        else:
            # Send to Technical Director
            td = User.query.filter_by(role_id=1, is_deleted=False).first()  # Assuming role_id 1 is TD
            if not td or not td.email:
                return jsonify({"error": "Technical Director not found or email not available"}), 404

            recipient_email = td.email
            recipient_name = td.full_name
            recipient_role = "technical_director"
            recipient_user_id = td.user_id

        # Prepare data for email
        boq_data = {
            "boq_id": boq.boq_id,
            "boq_name": boq.boq_name,
            "status": boq.status
        }

        project_data = {
            "project_name": project.project_name,
            "client": getattr(project, "client", "N/A"),
            "location": getattr(project, "location", "N/A")
        }

        # Send email based on status
        email_service = BOQEmailService()
        email_sent = False

        if status == 'approved':
            email_sent = email_service.send_new_purchase_approval(
                recipient_email=recipient_email,
                recipient_name=recipient_name,
                recipient_role=recipient_role,
                estimator_name=estimator_name,
                boq_data=boq_data,
                project_data=project_data,
                new_items_data=new_items_data,
                total_amount=total_amount
            )
            # Update BOQ status to "approved" when Estimator approves
            if email_sent:
                boq.status = "approved"
                boq.last_modified_by = estimator_name
                boq.last_modified_at = datetime.utcnow()
                log.info(f"BOQ {boq_id} status updated to 'approved' after new purchase approval")

        else:  # rejected
            email_sent = email_service.send_new_purchase_rejection(
                recipient_email=recipient_email,
                recipient_name=recipient_name,
                recipient_role=recipient_role,
                estimator_name=estimator_name,
                boq_data=boq_data,
                project_data=project_data,
                new_items_data=new_items_data,
                rejection_reason=rejection_reason,
                total_amount=total_amount
            )
            # Update BOQ status to "rejected" when Estimator rejects
            if email_sent:
                boq.status = "rejected"
                boq.last_modified_by = estimator_name
                boq.last_modified_at = datetime.utcnow()
                log.info(f"BOQ {boq_id} status updated to 'rejected' after new purchase rejection")

        # Log decision in BOQ history
        try:
            existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

            if existing_history:
                if existing_history.action is None:
                    current_actions = []
                elif isinstance(existing_history.action, list):
                    current_actions = existing_history.action
                elif isinstance(existing_history.action, dict):
                    current_actions = [existing_history.action]
                else:
                    current_actions = []
            else:
                current_actions = []

            item_identifiers = []
            for item in new_items_data:
                item_identifiers.append({
                    "master_item_id": item.get("master_item_id"),
                    "item_name": item.get("item_name")
                })

            new_action = {
                "role": "estimator",
                "type": f"new_purchase_{status}",
                "sender": estimator_name,
                "receiver": recipient_name,
                "sender_role": "estimator",
                "receiver_role": recipient_role,
                "status": status,
                "boq_name": boq.boq_name,
                "comments": rejection_reason if status == 'rejected' else (comments or f"New purchase {status} by Estimator"),
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": estimator_name,
                "sender_user_id": estimator_id,
                "receiver_name": recipient_name,
                "receiver_user_id": recipient_user_id,
                "receiver_email": recipient_email,
                "project_name": project.project_name,
                "project_id": project.project_id,
                "item_identifiers": item_identifiers,
                "items_count": len(new_items_data),
                "total_amount": total_amount,
                "original_boq_total": original_boq_total,
                "threshold_used": THRESHOLD,
                "email_sent": email_sent
            }

            if status == 'rejected':
                new_action["rejection_reason"] = rejection_reason

            current_actions.append(new_action)

            if existing_history:
                existing_history.action = current_actions
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(existing_history, "action")
                existing_history.action_by = estimator_name
                existing_history.sender = estimator_name
                existing_history.receiver = recipient_name
                existing_history.comments = rejection_reason if status == 'rejected' else (comments or f"New purchase {status}")
                existing_history.sender_role = 'estimator'
                existing_history.receiver_role = recipient_role
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = estimator_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                boq_history_entry = BOQHistory(
                    boq_id=boq_id,
                    action=current_actions,
                    action_by=estimator_name,
                    boq_status=boq.status,
                    sender=estimator_name,
                    receiver=recipient_name,
                    comments=rejection_reason if status == 'rejected' else (comments or f"New purchase {status}"),
                    sender_role='estimator',
                    receiver_role=recipient_role,
                    action_date=datetime.utcnow(),
                    created_by=estimator_name
                )
                db.session.add(boq_history_entry)

            db.session.commit()
        except Exception as history_error:
            log.error(f"Error storing decision in BOQ history: {history_error}")
            db.session.rollback()

        response_data = {
            "success": True,
            "message": f"New purchase {status} and notification sent to {recipient_role.replace('_', ' ').title()}",
            "status": status,
            "email_sent": email_sent,
            "recipient": {
                "name": recipient_name,
                "email": recipient_email,
                "role": recipient_role
            },
            "items_count": len(new_items_data),
            "total_amount": round(total_amount, 2),
            "original_boq_total": round(original_boq_total, 2),
            "threshold": THRESHOLD,
            "sent_to": recipient_role,
            "estimator": estimator_name
        }

        if status == 'rejected':
            response_data["rejection_reason"] = rejection_reason

        return jsonify(response_data), 200

    except Exception as e:
        log.error(f"Error processing new purchase decision: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to process purchase decision: {str(e)}"}), 500

