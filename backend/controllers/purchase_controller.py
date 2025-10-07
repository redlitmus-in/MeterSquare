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

        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get existing BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get current user
        current_user = getattr(g, 'user', None)
        if current_user:
            created_by = current_user.get('full_name') or current_user.get('username') or 'User'
            user_id = current_user.get('user_id')
        else:
            created_by = data.get("created_by", "Admin")
            user_id = None

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
        # Get current user (Project Manager)
        current_user = getattr(g, 'user', None)
        if not current_user:
            return jsonify({"error": "User not authenticated"}), 401

        pm_name = current_user.get('full_name', 'Project Manager')
        pm_id = current_user.get('user_id')

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

        # Get BOQ history to find new purchases
        boq_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).all()

        # Find items added by this PM (from recent add_new_purchase actions)
        new_purchase_item_ids = set()
        new_purchase_item_names = set()

        for history in boq_history:
            if history.action:
                actions = history.action if isinstance(history.action, list) else [history.action]
                for action in actions:
                    if isinstance(action, dict):
                        action_type = action.get("type")
                        # Only get purchases added by current PM
                        if action_type == "add_new_purchase" and action.get("sender_user_id") == pm_id:
                            item_identifiers = action.get("item_identifiers", [])
                            for identifier in item_identifiers:
                                master_item_id = identifier.get("master_item_id")
                                item_name = identifier.get("item_name")
                                if master_item_id:
                                    new_purchase_item_ids.add(master_item_id)
                                if item_name:
                                    new_purchase_item_names.add(item_name)

        # Get all items from BOQ details
        all_items = []
        if boq_details.boq_details and "items" in boq_details.boq_details:
            all_items = boq_details.boq_details["items"]

        # Filter only new purchase items added by this PM
        new_items_data = []
        for item in all_items:
            master_item_id = item.get("master_item_id")
            item_name = item.get("item_name")

            if master_item_id in new_purchase_item_ids or item_name in new_purchase_item_names:
                new_items_data.append(item)

        if not new_items_data:
            return jsonify({"error": "No new purchase items found"}), 404

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

        # Send email notification
        email_sent = False
        try:
            from utils.boq_email_service import BOQEmailService
            email_service = BOQEmailService()
            email_sent = email_service.send_new_purchase_notification(
                estimator_email=estimator.email,
                estimator_name=estimator.full_name,
                pm_name=pm_name,
                boq_data=boq_data,
                project_data=project_data,
                new_items_data=new_items_data
            )

            if email_sent:
                log.info(f"New purchase notification sent successfully to {estimator.email}")
            else:
                log.warning(f"Failed to send new purchase notification to {estimator.email}")

        except Exception as email_error:
            log.error(f"Error sending new purchase notification email: {email_error}")
            import traceback
            log.error(f"Email error traceback: {traceback.format_exc()}")

        # Store this action in BOQ History
        try:
            # Get existing BOQ history
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

            # Calculate total value of new items
            total_value = sum(item.get('selling_price', 0) for item in new_items_data)

            # Create item identifiers for history
            item_identifiers = []
            for item in new_items_data:
                item_identifiers.append({
                    "master_item_id": item.get("master_item_id"),
                    "item_name": item.get("item_name")
                })

            # Prepare new action for email notification
            new_action = {
                "role": current_user.get('role_name', 'project_manager'),
                "type": "new_purchase_notification_sent",
                "sender": pm_name,
                "receiver": estimator.full_name,
                "sender_role": "project_manager",
                "receiver_role": "estimator",
                "status": boq.status,
                "boq_name": boq.boq_name,
                "comments": f"PM sent new purchase notification to Estimator ({len(new_items_data)} item(s))",
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

            # Append new action
            current_actions.append(new_action)
            log.info(f"Appending new_purchase_notification_sent action to BOQ {boq_id} history. Total actions: {len(current_actions)}")

            if existing_history:
                # Update existing history
                existing_history.action = current_actions
                # Mark JSONB field as modified for SQLAlchemy
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(existing_history, "action")

                existing_history.action_by = pm_name
                existing_history.sender = pm_name
                existing_history.receiver = estimator.full_name
                existing_history.comments = f"PM sent new purchase notification to Estimator"
                existing_history.sender_role = 'project_manager'
                existing_history.receiver_role = 'estimator'
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = pm_name
                existing_history.last_modified_at = datetime.utcnow()

                log.info(f"Updated existing history for BOQ {boq_id} with {len(current_actions)} actions")
            else:
                # Create new history entry
                boq_history_entry = BOQHistory(
                    boq_id=boq_id,
                    action=current_actions,
                    action_by=pm_name,
                    boq_status=boq.status,
                    sender=pm_name,
                    receiver=estimator.full_name,
                    comments=f"PM sent new purchase notification to Estimator",
                    sender_role='project_manager',
                    receiver_role='estimator',
                    action_date=datetime.utcnow(),
                    created_by=pm_name
                )
                db.session.add(boq_history_entry)
                log.info(f"Created new history for BOQ {boq_id} with {len(current_actions)} actions")

            db.session.commit()
            log.info(f"Successfully stored notification action in BOQ history for BOQ {boq_id}")

        except Exception as history_error:
            log.error(f"Error storing notification in BOQ history: {history_error}")
            import traceback
            log.error(f"History error traceback: {traceback.format_exc()}")
            # Don't fail the request if history fails
            db.session.rollback()

        return jsonify({
            "success": True,
            "message": "New purchase notification sent to Estimator",
            "email_sent": email_sent,
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

