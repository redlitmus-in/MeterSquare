from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role

log = get_logger()

def add_to_master_tables(item_name, description, work_type, materials_data, labour_data, created_by, overhead_percentage=None, overhead_amount=None, profit_margin_percentage=None, profit_margin_amount=None):
    """Add items, materials, and labour to master tables if they don't exist"""
    master_item_id = None
    master_material_ids = []
    master_labour_ids = []

    # Add to master items (prevent duplicates)
    master_item = MasterItem.query.filter_by(item_name=item_name).first()
    if not master_item:
        master_item = MasterItem(
            item_name=item_name,
            description=description,
            overhead_percentage=overhead_percentage,
            overhead_amount=overhead_amount,
            profit_margin_percentage=profit_margin_percentage,
            profit_margin_amount=profit_margin_amount,
            created_by=created_by
        )
        db.session.add(master_item)
        db.session.flush()
    else:
        # If item exists, update description and overhead/profit values
        if description:
            master_item.description = description

        # Always update overhead and profit values with latest calculations
        master_item.overhead_percentage = overhead_percentage
        master_item.overhead_amount = overhead_amount
        master_item.profit_margin_percentage = profit_margin_percentage
        master_item.profit_margin_amount = profit_margin_amount

        db.session.flush()
    master_item_id = master_item.item_id

    # Add to master materials (prevent duplicates) with item_id reference
    for mat_data in materials_data:
        material_name = mat_data.get("material_name")
        unit_price = mat_data.get("unit_price", 0.0)
        master_material = MasterMaterial.query.filter_by(material_name=material_name).first()
        if not master_material:
            master_material = MasterMaterial(
                material_name=material_name,
                item_id=master_item_id,  # Set the item_id reference
                default_unit=mat_data.get("unit", "nos"),
                current_market_price=unit_price,
                created_by=created_by
            )
            db.session.add(master_material)
            db.session.flush()
        else:
            # Update existing material: always update current_market_price and item_id if needed
            if master_material.item_id is None:
                master_material.item_id = master_item_id

            # Always update current_market_price with the new unit_price from BOQ
            master_material.current_market_price = unit_price

            # Update unit if different
            new_unit = mat_data.get("unit", "nos")
            if master_material.default_unit != new_unit:
                master_material.default_unit = new_unit

            db.session.flush()
        master_material_ids.append(master_material.material_id)

    # Add to master labour (prevent duplicates) with item_id reference
    for i, labour_data_item in enumerate(labour_data):
        labour_role = labour_data_item.get("labour_role")
        # Get hours and rate_per_hour
        rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
        hours = labour_data_item.get("hours", 0.0)
        labour_amount = float(rate_per_hour) * float(hours)

        master_labour = MasterLabour.query.filter_by(labour_role=labour_role).first()

        if not master_labour:
            master_labour = MasterLabour(
                labour_role=labour_role,
                item_id=master_item_id,  # Set the item_id reference
                work_type=work_type,  # Set the work_type
                hours=float(hours),  # Store hours as float
                rate_per_hour=float(rate_per_hour),  # Store rate per hour as float
                amount=labour_amount,  # Set the calculated amount
                created_by=created_by
            )
            db.session.add(master_labour)
            db.session.flush()
        else:
            # Update existing labour: always update item_id, work_type, hours, rate_per_hour, and amount
            if master_labour.item_id is None:
                master_labour.item_id = master_item_id
            if master_labour.work_type is None and work_type:
                master_labour.work_type = work_type

            # Always update hours, rate_per_hour, and amount with the latest values
            master_labour.hours = float(hours)
            master_labour.rate_per_hour = float(rate_per_hour)
            master_labour.amount = labour_amount

            db.session.flush()
        master_labour_ids.append(master_labour.labour_id)

    return master_item_id, master_material_ids, master_labour_ids


def create_boq():
    """Create a new BOQ using master tables and JSON storage"""
    try:
        data = request.get_json()
        project_id = data.get("project_id")

        # Validate required fields
        if not project_id:
            return jsonify({"error": "Project ID is required"}), 400

        if not data.get("boq_name"):
            return jsonify({"error": "BOQ name is required"}), 400

        # Check if project exists
        project = Project.query.filter_by(project_id=project_id).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        created_by = data.get("created_by", "Admin")

        # Create BOQ
        boq = BOQ(
            project_id=project_id,
            boq_name=data.get("boq_name"),
            status=data.get("status", "Draft"),
            created_by=created_by,
        )
        db.session.add(boq)
        db.session.flush()  # Get boq_id

        # Process items and create JSON structure
        boq_items = []
        total_boq_cost = 0
        total_materials = 0
        total_labour = 0

        for item_data in data.get("items", []):
            materials_data = item_data.get("materials", [])
            labour_data = item_data.get("labour", [])

            # First calculate costs to get overhead and profit amounts
            materials_cost = 0
            for mat_data in materials_data:
                quantity = mat_data.get("quantity", 1.0)
                unit_price = mat_data.get("unit_price", 0.0)
                materials_cost += quantity * unit_price

            labour_cost = 0
            for labour_data_item in labour_data:
                hours = labour_data_item.get("hours", 0.0)
                rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
                labour_cost += hours * rate_per_hour

            # Calculate item costs
            base_cost = materials_cost + labour_cost

            # Use provided percentages, default to 10% overhead and 15% profit if not provided
            overhead_percentage = item_data.get("overhead_percentage", 10.0)
            profit_margin_percentage = item_data.get("profit_margin_percentage", 15.0)

            # Calculate amounts based on percentages
            overhead_amount = (base_cost * overhead_percentage) / 100
            total_cost = base_cost + overhead_amount

            # Profit margin should be calculated on cost AFTER overhead
            profit_margin_amount = (total_cost * profit_margin_percentage) / 100
            selling_price_before_discount = total_cost + profit_margin_amount

            # Handle discount (can be null or a value)
            discount_percentage = item_data.get("discount_percentage")
            discount_amount = 0.0
            final_selling_price = selling_price_before_discount

            if discount_percentage is not None and discount_percentage > 0:
                discount_amount = (selling_price_before_discount * float(discount_percentage)) / 100
                final_selling_price = selling_price_before_discount - discount_amount

            # Now add to master tables with calculated values
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

            # Process materials for BOQ details
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

            # Process labour for BOQ details
            item_labour = []
            for i, labour_data_item in enumerate(labour_data):
                hours = labour_data_item.get("hours", 0.0)
                rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
                total_cost_labour = hours * rate_per_hour

                item_labour.append({
                    "master_labour_id": master_labour_ids[i] if i < len(master_labour_ids) else None,
                    "labour_role": labour_data_item.get("labour_role"),
                    "hours": hours,
                    "rate_per_hour": rate_per_hour,
                    "total_cost": total_cost_labour
                })

            # Create item JSON structure
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
                "discount_percentage": discount_percentage if discount_percentage is not None else 0.0,
                "discount_amount": discount_amount,
                "total_cost": total_cost,
                "selling_price": final_selling_price,  # Use final_selling_price after discount
                "selling_price_before_discount": selling_price_before_discount,  # Selling price before discount
                "totalMaterialCost": materials_cost,
                "totalLabourCost": labour_cost,
                "actualItemCost": base_cost,
                "estimatedSellingPrice": final_selling_price,  # Use final_selling_price after discount
                "materials": item_materials,
                "labour": item_labour
            }

            boq_items.append(item_json)
            total_boq_cost += final_selling_price  # Add final price after discount to total
            total_materials += len(item_materials)
            total_labour += len(item_labour)

        # Create BOQ details JSON
        boq_details_json = {
            "boq_id": boq.boq_id,
            "items": boq_items,
            "summary": {
                "total_items": len(boq_items),
                "total_materials": total_materials,
                "total_labour": total_labour,
                "total_material_cost": sum(item["totalMaterialCost"] for item in boq_items),
                "total_labour_cost": sum(item["totalLabourCost"] for item in boq_items),
                "total_cost": total_boq_cost,
                "selling_price": total_boq_cost,
                "estimatedSellingPrice": total_boq_cost
            }
        }

        # Save BOQ details
        boq_details = BOQDetails(
            boq_id=boq.boq_id,
            boq_details=boq_details_json,
            total_cost=total_boq_cost,
            total_items=len(boq_items),
            total_materials=total_materials,
            total_labour=total_labour,
            created_by=created_by
        )
        db.session.add(boq_details)

        db.session.commit()

        return jsonify({
            "message": "BOQ created successfully",
            "boq": {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "project_id": boq.project_id,
                "status": boq.status,
                "total_cost": total_boq_cost,
                "items_count": len(boq_items),
                "materials_count": total_materials,
                "labour_count": total_labour,
                "selling_price": total_boq_cost,
                "estimatedSellingPrice": total_boq_cost
            }
        }), 201

    except SQLAlchemyError as e:
        db.session.rollback()
        log.error(f"Database error creating BOQ: {str(e)}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating BOQ: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Error: {str(e)}"}), 500

def get_boq(boq_id):
    """Get BOQ details from JSON storage with existing and new purchases separated"""
    try:
        boq = BOQ.query.filter_by(boq_id=boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get BOQ details from JSON
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get current user for role-based access control
        current_user = getattr(g, 'user', None)
        user_role = ''
        user_role_id = None

        if current_user:
            # Try 'role' first (set by jwt_required), then 'role_name' as fallback
            role_name = current_user.get('role') or current_user.get('role_name', '')
            user_role = role_name.lower().replace(' ', '').replace('_', '') if isinstance(role_name, str) else ''
            user_role_id = current_user.get('role_id')
        # Fetch project details
        project = Project.query.filter_by(project_id=boq.project_id).first()
        # Get BOQ history to track which items were added via new_purchase
        boq_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.asc()).all()
        # Track newly added items using master_item_id and item_name from history
        new_purchase_item_ids = set()  # Track by master_item_id
        new_purchase_item_names = set()  # Track by item_name as fallback
        original_item_count = 0

        for history in boq_history:
            if history.action:
                actions = history.action if isinstance(history.action, list) else [history.action]
                for action in actions:
                    if isinstance(action, dict):
                        action_type = action.get("type")
                        if action_type == "add_new_purchase":
                            # Get item identifiers from history (new minimal format)
                            item_identifiers = action.get("item_identifiers", [])

                            # If item_identifiers exists (new minimal format), use it
                            if item_identifiers:
                                for identifier in item_identifiers:
                                    master_item_id = identifier.get("master_item_id")
                                    item_name = identifier.get("item_name")

                                    if master_item_id:
                                        new_purchase_item_ids.add(master_item_id)
                                    if item_name:
                                        new_purchase_item_names.add(item_name)
                            else:
                                # Fallback to old formats for backward compatibility
                                # Try items_details first (medium format)
                                items_details = action.get("items_details", [])
                                if items_details:
                                    for item_detail in items_details:
                                        master_item_id = item_detail.get("master_item_id")
                                        item_name = item_detail.get("item_name")

                                        if master_item_id:
                                            new_purchase_item_ids.add(master_item_id)
                                        if item_name:
                                            new_purchase_item_names.add(item_name)
                                else:
                                    # Fallback to items_added (old format)
                                    items_added = action.get("items_added", [])
                                    for item_info in items_added:
                                        item_name = item_info.get("item_name")
                                        if item_name:
                                            new_purchase_item_names.add(item_name)

        # Get all items from BOQ details
        all_items = []
        if boq_details.boq_details and "items" in boq_details.boq_details:
            all_items = boq_details.boq_details["items"]
        # If no history of new purchases, determine original items count from first creation
        if not new_purchase_item_ids and not new_purchase_item_names and boq_history:
            # Find the creation action to determine original item count
            for history in boq_history:
                if history.action:
                    actions = history.action if isinstance(history.action, list) else [history.action]
                    for action in actions:
                        if isinstance(action, dict) and action.get("type") in ["boq_created", "created"]:
                            original_item_count = action.get("items_count", len(all_items))
                            break
                if original_item_count > 0:
                    break

        # Separate existing and new purchases
        existing_purchase_items = []
        new_add_purchase_items = []

        for idx, item in enumerate(all_items):
            master_item_id = item.get("master_item_id")
            item_name = item.get("item_name")
            is_new_purchase = False

            # Check if item is a new purchase
            # Priority 1: Match by master_item_id (most reliable)
            if master_item_id and master_item_id in new_purchase_item_ids:
                is_new_purchase = True
            # Priority 2: Match by item_name (fallback)
            elif item_name and item_name in new_purchase_item_names:
                is_new_purchase = True
            # Priority 3: Use original item count position
            elif not new_purchase_item_ids and not new_purchase_item_names and original_item_count > 0:
                if idx >= original_item_count:
                    is_new_purchase = True

            # Ensure purchase_tracking exists in item
            if "purchase_tracking" not in item:
                item["purchase_tracking"] = {
                    "total_purchased_amount": 0.0,
                    "purchased_materials": []
                }

            # Add to appropriate list
            if is_new_purchase:
                new_add_purchase_items.append(item)
            else:
                existing_purchase_items.append(item)

        # Calculate summary for existing purchases
        existing_material_cost = 0
        existing_labour_cost = 0
        existing_materials_count = 0
        existing_labour_count = 0
        existing_total_cost = 0

        for item in existing_purchase_items:
            existing_total_cost += item.get("selling_price", 0)
            existing_material_cost += item.get("totalMaterialCost", 0)
            existing_labour_cost += item.get("totalLabourCost", 0)
            existing_materials_count += len(item.get("materials", []))
            existing_labour_count += len(item.get("labour", []))
        # Calculate summary for new purchases
        new_material_cost = 0
        new_labour_cost = 0
        new_materials_count = 0
        new_labour_count = 0
        new_total_cost = 0

        for item in new_add_purchase_items:
            new_total_cost += item.get("selling_price", 0)
            new_material_cost += item.get("totalMaterialCost", 0)
            new_labour_cost += item.get("totalLabourCost", 0)
            new_materials_count += len(item.get("materials", []))
            new_labour_count += len(item.get("labour", []))
        # Role-based access control for new purchase items
        # Determine if user can view new purchase details based on status and role
        can_view_new_purchase = False
        boq_status = boq.status.lower() if boq.status else ''

        if boq_status == 'new_purchase_create':
            # Only Project Manager can view
            if user_role in ['projectmanager', 'project_manager']:
                can_view_new_purchase = True
            else:
                log.info(f"BOQ {boq_id} - Access DENIED: Only PM can view 'new_purchase_create', current role: '{user_role}'")
        elif boq_status in ['add_new_purchase', 'new_purchase_request']:
            # Estimator and Project Manager can view
            if user_role in ['estimator', 'projectmanager', 'project_manager']:
                can_view_new_purchase = True
            else:
                log.info(f"BOQ {boq_id} - Access DENIED: Only Estimator/PM can view '{boq_status}', current role: '{user_role}'")
        elif boq_status == 'new_purchase_approved':
            # All roles can view when new purchase is approved
            can_view_new_purchase = True
            log.info(f"BOQ {boq_id} - Access GRANTED: All roles can view 'new_purchase_approved'")
        elif boq_status == 'new_purchase_rejected':
            # Only Project Manager can view when new purchase is rejected
            if user_role in ['projectmanager', 'project_manager']:
                can_view_new_purchase = True
                log.info(f"BOQ {boq_id} - Access GRANTED: PM can view 'new_purchase_rejected'")
            else:
                log.info(f"BOQ {boq_id} - Access DENIED: Only PM can view 'new_purchase_rejected', current role: '{user_role}'")
        else:
            log.info(f"BOQ {boq_id} - Access DENIED: Unknown status '{boq_status}'")

        # Filter new purchase items based on access control
        filtered_new_purchase_items = []
        filtered_new_total_cost = 0
        filtered_new_material_cost = 0
        filtered_new_labour_cost = 0
        filtered_new_materials_count = 0
        filtered_new_labour_count = 0

        if can_view_new_purchase:
            # User has permission to view new purchases
            filtered_new_purchase_items = new_add_purchase_items
            filtered_new_total_cost = new_total_cost
            filtered_new_material_cost = new_material_cost
            filtered_new_labour_cost = new_labour_cost
            filtered_new_materials_count = new_materials_count
            filtered_new_labour_count = new_labour_count

        # Process items with purchase_tracking and add them to new_purchase.items
        # BUT only if user has permission to view (can_view_new_purchase)
        new_purchase_items_with_tracking = []
        new_purchase_total_materials_count = 0
        new_purchase_total_labour_count = 0
        new_purchase_total_material_cost = 0.0
        new_purchase_total_labour_cost = 0.0
        new_purchase_total_cost = 0.0

        # Calculate total purchased amounts (all purchases, not just latest)
        total_all_purchased_amount = 0.0
        existing_purchased_amount = 0.0

        for item in all_items:
            purchase_tracking = item.get("purchase_tracking", {})
            total_all_purchased_amount += purchase_tracking.get("total_purchased_amount", 0.0)

        if can_view_new_purchase:
            # Get the LATEST add_new_purchase action timestamp from BOQ history
            latest_purchase_action_date = None
            for history in boq_history:
                if history.action:
                    actions = history.action if isinstance(history.action, list) else [history.action]
                    for action in actions:
                        if isinstance(action, dict) and action.get("type") == "add_new_purchase":
                            action_timestamp = action.get("timestamp")
                            if action_timestamp:
                                try:
                                    action_date = datetime.fromisoformat(action_timestamp)
                                    if latest_purchase_action_date is None or action_date > latest_purchase_action_date:
                                        latest_purchase_action_date = action_date
                                except:
                                    pass

            # Process items with purchase_tracking and add them to new purchase items
            if latest_purchase_action_date:
                for item in all_items:
                    purchase_tracking = item.get("purchase_tracking", {})
                    purchased_materials = purchase_tracking.get("purchased_materials", [])

                    if purchased_materials:
                        # Collect only the LATEST purchased materials (from most recent add_new_purchase)
                        latest_materials = []
                        earlier_materials = []

                        for material in purchased_materials:
                            purchase_date_str = material.get("purchase_date")
                            if purchase_date_str:
                                try:
                                    purchase_date = datetime.fromisoformat(purchase_date_str)
                                    # Check if this material was purchased during the latest add_new_purchase action
                                    time_diff = abs((purchase_date - latest_purchase_action_date).total_seconds())
                                    if time_diff <= 60:  # Within 1 minute
                                        latest_materials.append(material)
                                    else:
                                        earlier_materials.append(material)
                                except:
                                    earlier_materials.append(material)

                        # Calculate existing purchase amount (purchased before latest action)
                        existing_purchased_amount += sum(mat.get("total_price", 0) for mat in earlier_materials)

                        # If there are latest materials, create a simple purchase entry
                        if latest_materials:
                            # Calculate totals for this purchase
                            new_materials_total = sum(mat.get("total_price", 0) for mat in latest_materials)

                            new_purchase_items_with_tracking.append({
                                "master_item_id": item.get("master_item_id"),
                                "item_name": item.get("item_name"),
                                "description": item.get("description"),
                                "materials": latest_materials,
                                "total_purchased_amount": new_materials_total
                            })

                            new_purchase_total_materials_count += len(latest_materials)
                            new_purchase_total_material_cost += new_materials_total
                            new_purchase_total_cost += new_materials_total

        # Remove purchase_tracking from existing_purchase items (keep all items)
        for item in existing_purchase_items:
            # Remove purchase_tracking completely from existing purchase items
            if "purchase_tracking" in item:
                del item["purchase_tracking"]

        # Calculate combined totals (with filtered new purchases)
        total_material_cost = existing_material_cost + filtered_new_material_cost
        total_labour_cost = existing_labour_cost + filtered_new_labour_cost
        total_cost = existing_total_cost + filtered_new_total_cost
        overhead_percentage = 0
        profit_margin = 0

        # Get overhead and profit from summary or first item
        if boq_details.boq_details and "summary" in boq_details.boq_details:
            summary = boq_details.boq_details["summary"]
            overhead_percentage = summary.get("overhead_percentage", 0) or summary.get("overhead", 0)
            profit_margin = summary.get("profit_margin_percentage", 0) or summary.get("profit_margin", 0)

        # Fallback: Get from first item if not in summary
        if (overhead_percentage == 0 or profit_margin == 0) and all_items:
            for item in all_items:
                if overhead_percentage == 0:
                    overhead_percentage = item.get("overhead_percentage", 0)
                if profit_margin == 0:
                    profit_margin = item.get("profit_margin_percentage", 0) or item.get("profit_margin", 0)
                if overhead_percentage > 0 and profit_margin > 0:
                    break

        # Determine display status for Technical Director
        display_status = boq.status
        if boq.status == "new_purchase_approved" and user_role in ['technicaldirector', 'technical_director']:
            display_status = "approved"

        # Build response with project details
        response_data = {
            "boq_id": boq.boq_id,
            "boq_name": boq.boq_name,
            "project_id": boq.project_id,
            "status": display_status,
            "email_sent": boq.email_sent,
            "created_at": boq.created_at.isoformat() if boq.created_at else None,
            "created_by": boq.created_by,
            "user_id": project.user_id if project else None,
            "project_details": {
                "project_name": project.project_name if project else None,
                "location": project.location if project else None,
                "floor": project.floor_name if project else None,
                "hours": project.working_hours if project else None,
                "status": project.status if project else None
            },
            "existing_purchase": {
                "items": existing_purchase_items,
                "summary": {
                    "total_items": len(existing_purchase_items),
                    "total_materials": existing_materials_count,
                    "total_labour": existing_labour_count,
                    "total_material_cost": existing_material_cost,
                    "total_labour_cost": existing_labour_cost,
                    "total_cost": existing_total_cost,
                    "selling_price": existing_total_cost,
                    "estimatedSellingPrice": existing_total_cost
                }
            },
            "new_purchase": {
                "items": new_purchase_items_with_tracking,
                "summary": {
                    "total_items": len(new_purchase_items_with_tracking),
                    "total_materials": new_purchase_total_materials_count,
                    "total_material_cost": new_purchase_total_material_cost,
                    "total_cost": new_purchase_total_cost,
                    "selling_price": new_purchase_total_cost,
                    "estimatedSellingPrice": new_purchase_total_cost
                },
                "access_info": {
                    "can_view": can_view_new_purchase,
                    "user_role": user_role,
                    "boq_status": boq.status
                }
            },
            "combined_summary": {
                "total_items": len(existing_purchase_items),
                "total_materials": existing_materials_count + new_purchase_total_materials_count,
                "total_labour": existing_labour_count,
                "total_item_amount": existing_total_cost,  # Total amount from existing BOQ items
                "total_material_cost": existing_material_cost,
                "total_labour_cost": existing_labour_cost,
                "existing_purchase_amount": existing_purchased_amount,  # Materials purchased before latest action
                "new_purchase_amount": new_purchase_total_cost,  # Materials from latest purchase
                "total_purchased_amount": total_all_purchased_amount,  # Sum of all purchases
                "balance_amount": existing_total_cost - total_all_purchased_amount,  # Remaining to be purchased
                "total_cost": existing_total_cost,
                "selling_price": existing_total_cost,
                "estimatedSellingPrice": existing_total_cost
            },
            "total_material_cost": total_material_cost,
            "total_labour_cost": total_labour_cost,
            "overhead_percentage": overhead_percentage,
            "profit_margin": profit_margin,
            "profit_margin_percentage": profit_margin
        }

        return jsonify(response_data), 200

    except Exception as e:
        log.error(f"Error fetching BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_all_boq():
    """Get all BOQs with their details from JSON storage"""
    try:
        # Get all BOQs with their details
        boqs = (
            db.session.query(BOQ, BOQDetails)
            .join(BOQDetails, BOQ.boq_id == BOQDetails.boq_id)
            .filter(BOQ.is_deleted == False)
            .all()
        )
        complete_boqs = []
        for boq, boq_detail in boqs:
            # Fetch project details
            project = Project.query.filter_by(project_id=boq.project_id).first()

            # Check BOQ history for sender and receiver roles
            display_status = boq.status
            boq_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).order_by(BOQHistory.created_at.desc()).first()

            if boq_history and boq_history.sender_role and boq_history.receiver_role:
                sender_role = boq_history.sender_role.lower().replace('_', '').replace(' ', '')
                receiver_role = boq_history.receiver_role.lower().replace('_', '').replace(' ', '')

                if sender_role == 'technicaldirector' and receiver_role == 'projectmanager':
                    display_status = 'Client_Confirmed'
            elif boq.status in ['new_purchase_create', 'new_purchase_approved', 'new_purchase_rejected', 'approved']:
                display_status = 'Client_Confirmed'

            boq_summary = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "project_id": boq.project_id,
                "project_name": project.project_name if project else None,
                "client": project.client if project else None,
                "location": project.location if project else None,
                "floor": project.floor_name if project else None,
                "hours": project.working_hours if project else None,
                "status": display_status,
                "client_rejection_reason": boq.client_rejection_reason,
                "email_sent" : boq.email_sent,
                "user_id": project.user_id if project else None,  # PM assignment indicator
                "items_count": boq_detail.total_items,
                "material_count": boq_detail.total_materials,
                "labour_count": boq_detail.total_labour,
                "total_cost": boq_detail.total_cost,
                "selling_price": boq_detail.total_cost,
                "estimatedSellingPrice": boq_detail.total_cost,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "created_by": boq.created_by
            }

            # Add items from JSON
            items_list = []
            total_material_cost = 0
            total_labour_cost = 0
            overhead_percentage = 0
            profit_margin = 0

            if boq_detail.boq_details and "items" in boq_detail.boq_details:
                items = boq_detail.boq_details["items"]
                items_list = items

                # Calculate totals from items
                for item in items:
                    # Calculate material cost
                    materials = item.get("materials", [])
                    for mat in materials:
                        total_material_cost += mat.get("total_price", 0)

                    # Calculate labour cost
                    labour = item.get("labour", [])
                    for lab in labour:
                        total_labour_cost += lab.get("total_cost", 0)

                    # Get overhead and profit from first item
                    if overhead_percentage == 0:
                        overhead_percentage = item.get("overhead_percentage", 0)
                    if profit_margin == 0:
                        profit_margin = item.get("profit_margin", 0)

            # Add summary from JSON if available (this will override calculated values if present)
            if boq_detail.boq_details and "summary" in boq_detail.boq_details:
                summary = boq_detail.boq_details["summary"]
                if summary.get("total_material_cost", 0) > 0:
                    total_material_cost = summary.get("total_material_cost", 0)
                if summary.get("total_labour_cost", 0) > 0:
                    total_labour_cost = summary.get("total_labour_cost", 0)
                if summary.get("overhead_percentage", 0) > 0:
                    overhead_percentage = summary.get("overhead_percentage", 0)
                if summary.get("profit_margin", 0) > 0:
                    profit_margin = summary.get("profit_margin", 0)

            boq_summary.update({
                "items": items_list,
                "total_material_cost": total_material_cost,
                "total_labour_cost": total_labour_cost,
                "overhead_percentage": overhead_percentage,
                "profit_margin": profit_margin
            })

            complete_boqs.append(boq_summary)

        return jsonify({
            "message": "BOQs retrieved successfully",
            "count": len(complete_boqs),
            "data": complete_boqs
        }), 200

    except Exception as e:
        log.error(f"Error retrieving BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve BOQs',
            'details': str(e)
        }), 500


def update_boq(boq_id):
    """Update BOQ using JSON storage approach"""
    try:
        data = request.get_json()
        boq = BOQ.query.filter_by(boq_id=boq_id).first()

        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Update BOQ basic details
        if "boq_name" in data:
            boq.boq_name = data["boq_name"]

        # Check if this is a revision edit (from Revisions button)
        is_revision = data.get("is_revision", False)

        # Set status based on current status and revision mode
        current_status = boq.status
        if is_revision:
            # If this is a revision edit, always set to Under_Revision
            boq.status = "Under_Revision"
        elif current_status == "Client_Rejected":
            boq.status = "Under_Revision"
        elif current_status == "Rejected":
            # If TD rejected, keep as Under_Revision when editing
            boq.status = "Under_Revision"
        elif current_status in ["Sent_for_Confirmation", "Pending_Revision", "Pending", "Approved", "Client_Confirmed", "Under_Revision"]:
            # Keep the current status (don't change workflow statuses)
            pass
        else:
            boq.status = "draft"

        # Get current logged-in user from Flask-Login or session
        current_user = getattr(g, 'user', None)
        if current_user:
            boq.last_modified_by = current_user.get('username') or current_user.get('name') or current_user.get('user_id', 'Unknown')
        else:
            boq.last_modified_by = data.get("modified_by", "Admin")

        # Get existing BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Save current BOQ details to history before updating
        # Get the latest version number for this BOQ detail
        latest_history = BOQDetailsHistory.query.filter_by(
            boq_detail_id=boq_details.boq_detail_id
        ).order_by(BOQDetailsHistory.version.desc()).first()

        next_version = 1 if not latest_history else latest_history.version + 1

        # Create history entry with current BOQ details
        boq_detail_history = BOQDetailsHistory(
            boq_detail_id=boq_details.boq_detail_id,
            boq_id=boq_id,
            version=next_version,
            boq_details=boq_details.boq_details,  # Save current state
            total_cost=boq_details.total_cost,
            total_items=boq_details.total_items,
            total_materials=boq_details.total_materials,
            total_labour=boq_details.total_labour,
            created_by=boq_details.last_modified_by or boq_details.created_by
        )
        db.session.add(boq_detail_history)

        # If items are provided, update the JSON structure
        if "items" in data:
            # Use the same current user logic for BOQ details
            current_user = getattr(g, 'user', None)
            if current_user:
                created_by = current_user.get('username') or current_user.get('full_name') or current_user.get('user_id', 'Admin')
            else:
                created_by = data.get("modified_by", "Admin")

            # Process updated items
            boq_items = []
            total_boq_cost = 0
            total_materials = 0
            total_labour = 0

            for item_data in data["items"]:
                materials_data = item_data.get("materials", [])
                labour_data = item_data.get("labour", [])

                # Calculate costs first to get overhead and profit amounts
                materials_cost = 0
                labour_cost = 0

                # Calculate material and labour costs
                for mat_data in materials_data:
                    quantity = mat_data.get("quantity", 1.0)
                    unit_price = mat_data.get("unit_price", 0.0)
                    materials_cost += quantity * unit_price

                for labour_data_item in labour_data:
                    hours = labour_data_item.get("hours", 0.0)
                    rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
                    labour_cost += hours * rate_per_hour

                # Calculate item costs
                base_cost = materials_cost + labour_cost

                # Use provided percentages, default to 10% overhead and 15% profit if not provided
                overhead_percentage = item_data.get("overhead_percentage", 10.0)
                profit_margin_percentage = item_data.get("profit_margin_percentage", 15.0)

                # Calculate amounts based on percentages
                overhead_amount = (base_cost * overhead_percentage) / 100
                profit_margin_amount = (base_cost * profit_margin_percentage) / 100
                total_cost = base_cost + overhead_amount
                selling_price = total_cost + profit_margin_amount

                # Handle discount (can be null or a value)
                discount_percentage = item_data.get("discount_percentage")
                discount_amount = 0.0
                final_selling_price = selling_price

                if discount_percentage is not None and discount_percentage > 0:
                    discount_amount = (selling_price * float(discount_percentage)) / 100
                    final_selling_price = selling_price - discount_amount

                # Add new items/materials/labour to master tables with calculated values
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

                # Process materials with master IDs
                processed_materials = []
                for i, mat_data in enumerate(materials_data):
                    quantity = mat_data.get("quantity", 1.0)
                    unit_price = mat_data.get("unit_price", 0.0)
                    total_price = quantity * unit_price

                    processed_materials.append({
                        "master_material_id": master_material_ids[i] if i < len(master_material_ids) else None,
                        "material_name": mat_data.get("material_name"),
                        "quantity": quantity,
                        "unit": mat_data.get("unit", "nos"),
                        "unit_price": unit_price,
                        "total_price": total_price
                    })

                # Process labour with master IDs
                processed_labour = []
                for i, labour_data_item in enumerate(labour_data):
                    hours = labour_data_item.get("hours", 0.0)
                    rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
                    total_cost_labour = hours * rate_per_hour

                    processed_labour.append({
                        "master_labour_id": master_labour_ids[i] if i < len(master_labour_ids) else None,
                        "labour_role": labour_data_item.get("labour_role"),
                        "hours": hours,
                        "rate_per_hour": rate_per_hour,
                        "total_cost": total_cost_labour
                    })

                # Build updated item JSON
                item_json = {
                    "master_item_id": master_item_id,
                    "item_name": item_data.get("item_name"),
                    "description": item_data.get("description"),
                    "work_type": item_data.get("work_type"),
                    "base_cost": base_cost,
                    "overhead_percentage": overhead_percentage,
                    "overhead_amount": overhead_amount,
                    "profit_margin_percentage": profit_margin_percentage,
                    "profit_margin_amount": profit_margin_amount,
                    "discount_percentage": discount_percentage if discount_percentage is not None else 0.0,
                    "discount_amount": discount_amount,
                    "total_cost": total_cost,
                    "selling_price": final_selling_price,  # Use final_selling_price after discount
                    "selling_price_before_discount": selling_price,  # Original selling price
                    "totalMaterialCost": materials_cost,
                    "totalLabourCost": labour_cost,
                    "actualItemCost": base_cost,
                    "estimatedSellingPrice": final_selling_price,  # Use final_selling_price after discount
                    "materials": processed_materials,
                    "labour": processed_labour
                }

                boq_items.append(item_json)
                total_boq_cost += final_selling_price  # Add final price after discount to total
                total_materials += len(materials_data)
                total_labour += len(labour_data)

            # Update JSON structure
            updated_json = {
                "boq_id": boq.boq_id,
                "items": boq_items,
                "summary": {
                    "total_items": len(boq_items),
                    "total_materials": total_materials,
                    "total_labour": total_labour,
                    "total_material_cost": sum(item["totalMaterialCost"] for item in boq_items),
                    "total_labour_cost": sum(item["totalLabourCost"] for item in boq_items),
                    "total_cost": total_boq_cost,
                    "selling_price": total_boq_cost,
                    "estimatedSellingPrice": total_boq_cost
                }
            }

            # Update BOQ details
            boq_details.boq_details = updated_json
            boq_details.total_cost = total_boq_cost
            boq_details.total_items = len(boq_items)
            boq_details.total_materials = total_materials
            boq_details.total_labour = total_labour
            boq_details.last_modified_by = created_by

        # Log the update action in BOQ history
        current_user = getattr(g, 'user', None)
        user_name = "Admin"
        user_id = None

        if current_user:
            user_name = current_user.get('username') or current_user.get('full_name') or current_user.get('user_id', 'Admin')
            user_id = current_user.get('user_id')

        # Create action for BOQ history
        update_action = {
            "type": "boq_updated",
            "role": current_user.get('role', 'unknown') if current_user else 'unknown',
            "status": boq.status,
            "version": next_version,
            "timestamp": datetime.utcnow().isoformat(),
            "updated_by": user_name,
            "updated_by_user_id": user_id,
            "boq_name": boq.boq_name,
            "total_items": len(boq_items) if "items" in data else boq_details.total_items,
            "total_cost": total_boq_cost if "items" in data else boq_details.total_cost,
            "changes": {
                "boq_name_changed": "boq_name" in data,
                "items_updated": "items" in data
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

            current_actions.append(update_action)
            existing_history.action = current_actions

            # Mark JSONB field as modified for SQLAlchemy
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(existing_history, "action")

            existing_history.action_by = user_name
            existing_history.boq_status = boq.status
            existing_history.comments = f"BOQ updated - Version {next_version}"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=[update_action],
                action_by=user_name,
                boq_status=boq.status,
                comments=f"BOQ updated - Version {next_version}",
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Return updated BOQ
        return jsonify({
            "message": "BOQ Updated successfully",
            "version": next_version,
            "boq_id": boq_id
        }), 200
        # return get_boq(boq_id)

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500


def delete_boq(boq_id):
    """Delete BOQ and its details (soft delete could be implemented)"""
    try:
        boq = BOQ.query.filter_by(boq_id=boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Delete BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if boq_details:
            boq_details.is_deleted = True
            db.session.commit()
            # db.session.delete(boq_details)

        # Delete BOQ (master tables remain untouched)
        # db.session.delete(boq)
        boq.is_deleted = True
        db.session.commit()

        return jsonify({"message": "BOQ deleted successfully"}), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_item_material(item_id):
    try:
        boq_item = MasterItem.query.filter_by(item_id=item_id).first()
        if not boq_item:
            return jsonify({"error": "BOQ Item not found"}), 404

        material_details = []
        boq_materials = MasterMaterial.query.filter_by(item_id=boq_item.item_id).all()
        for material in boq_materials:
            material_details.append({
                "material_id": material.material_id,
                "item_id" : material.item_id,
                "item_name" : boq_item.item_name,
                "material_name": material.material_name if hasattr(material, "material_name") else None,
                "current_market_price": material.current_market_price if hasattr(material, "current_market_price") else None,
                "default_unit": material.default_unit if material else None
            })

        return jsonify({
            "materials": material_details
        }), 200

    except Exception as e:
        log.error(f"Error fetching material: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_item_labours(item_id):
    try:
        boq_item = MasterItem.query.filter_by(item_id=item_id).first()
        if not boq_item:
            return jsonify({"error": "BOQ Item not found"}), 404

        labour_details = []
        boq_labours = MasterLabour.query.filter_by(item_id=boq_item.item_id).all()
        for labour in boq_labours:
            labour_details.append({
                "labour_id": labour.labour_id,
                "item_id" : labour.item_id,
                "item_name" : boq_item.item_name,
                "labour_role" : labour.labour_role,
                "amount" : labour.amount,
                "work_type": labour.work_type if labour else None,
            })

        return jsonify({
            "labours": labour_details
        }), 200

    except Exception as e:
        log.error(f"Error fetching material: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_all_item():
    try:
        boq_items = MasterItem.query.filter_by(is_deleted=False).all()
        item_details = []
        for item in boq_items:
            item_details.append({
                "item_id": item.item_id,
                "item_name": item.item_name,
                "description": item.description,
                "overhead_percentage": item.overhead_percentage,
                "overhead_amount": item.overhead_amount,
                "profit_margin_percentage": item.profit_margin_percentage,
                "profit_margin_amount": item.profit_margin_amount
            })

        return jsonify({
            "item_list": item_details
        }), 200

    except Exception as e:
        log.error(f"Error fetching item: {str(e)}")
        return jsonify({"error": str(e)}), 500

# SEND EMAIL - Send BOQ to Technical Director
def send_boq_email(boq_id):
    try:
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
        boq_email_service = BOQEmailService()

        # Get TD email from request or fetch all Technical Directors
        # Handle GET request with optional JSON body (non-standard but supported)
        try:
            data = request.get_json(silent=True) or {}
        except Exception as e:
            log.warning(f"Failed to parse JSON body: {e}")
            data = {}

        td_email = data.get('td_email')
        td_name = data.get('full_name')
        comments = data.get('comments')  # Get comments from request

        if td_email:
            # Send to specific TD
            email_sent = boq_email_service.send_boq_to_technical_director(
                boq_data, project_data, items_summary, td_email
            )

            if email_sent:
                # Update BOQ status and mark email as sent to TD
                # Check if this is a revision (was Rejected, Client_Rejected, Under_Revision, Pending_Revision, or Revision_Approved) or a new submission
                is_revision = boq.status in ["Rejected", "Client_Rejected", "Under_Revision", "Pending_Revision", "Revision_Approved"]
                new_status = "Pending_Revision" if is_revision else "Pending"

                boq.email_sent = True
                # boq.status = new_status
                boq.status = "Pending"
                boq.last_modified_by = boq.created_by
                boq.last_modified_at = datetime.utcnow()

                # Check if history entry already exists for this BOQ
                existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

                # Prepare action data in the new format
                new_action = {
                    "role": "estimator",
                    "type": "revision_sent" if is_revision else "email_sent",
                    "sender": "estimator",
                    "receiver": "technicalDirector",
                    "status": new_status.lower(),
                    # "pending",
                    "comments": comments if comments else ("BOQ revision sent for review" if is_revision else "BOQ sent for review and approval"),
                    "timestamp": datetime.utcnow().isoformat(),
                    "decided_by": boq.created_by,
                    "decided_by_user_id": g.user.get('user_id') if hasattr(g, 'user') and g.user else None,
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
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(existing_history, "action")

                    existing_history.action_by = boq.created_by
                    existing_history.boq_status = "Pending"
                    existing_history.sender = boq.created_by
                    existing_history.receiver = td_name if td_name else td_email
                    existing_history.comments = comments if comments else "BOQ sent for review and approval"
                    existing_history.sender_role = 'estimator'
                    existing_history.receiver_role = 'technicalDirector'
                    existing_history.action_date = datetime.utcnow()
                    existing_history.last_modified_by = boq.created_by
                    existing_history.last_modified_at = datetime.utcnow()
                else:
                    # Create new history entry with action as array
                    boq_history = BOQHistory(
                        boq_id=boq_id,
                        action=[new_action],  # Store as array
                        action_by=boq.created_by,
                        boq_status="Pending",
                        sender=boq.created_by,
                        receiver=td_name if td_name else td_email,
                        comments=comments if comments else "BOQ sent for review and approval",
                        sender_role='estimator',
                        receiver_role='technicalDirector',
                        action_date=datetime.utcnow(),
                        created_by=boq.created_by
                    )
                    db.session.add(boq_history)

                db.session.commit()

                return jsonify({
                    "success": True,
                    "message": "BOQ review email sent successfully to Technical Director",
                    "boq_id": boq_id,
                    "recipient": td_email
                }), 200
            else:
                return jsonify({
                    "success": False,
                    "message": "Failed to send BOQ review email",
                    "boq_id": boq_id,
                    "error": "Email service failed"
                }), 500
        else:
            # Send to the Technical Director (auto-detect)
            td_role = Role.query.filter_by(role='technicalDirector').first()

            if not td_role:
                return jsonify({
                    "error": "Technical Director role not found",
                    "message": "Technical Director role not configured in the system"
                }), 404

            technical_director = User.query.filter_by(
                role_id=td_role.role_id,
                is_active=True,
                is_deleted=False
            ).first()

            if not technical_director:
                return jsonify({
                    "error": "No Technical Director found",
                    "message": "No active Technical Director found in the system"
                }), 404

            if not technical_director.email:
                return jsonify({
                    "error": "Technical Director has no email",
                    "message": f"Technical Director {technical_director.full_name} does not have an email address"
                }), 400

            # Send email to the Technical Director
            email_sent = boq_email_service.send_boq_to_technical_director(
                boq_data, project_data, items_summary, technical_director.email
            )

            if email_sent:
                # Update BOQ status and mark email as sent to TD
                # Check if this is a revision (was Rejected, Client_Rejected, Under_Revision, Pending_Revision, or Revision_Approved) or a new submission
                is_revision = boq.status in ["Rejected", "Client_Rejected", "Under_Revision", "Pending_Revision", "Revision_Approved"]
                new_status = "Pending_Revision" if is_revision else "Pending"
                boq.email_sent = True
                boq.status = "Pending"
                boq.last_modified_by = boq.created_by
                boq.last_modified_at = datetime.utcnow()

                # Check if history entry already exists for this BOQ
                existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

                # Prepare action data in the new format
                new_action = {
                    "role": "estimator",
                    "type": "revision_sent" if is_revision else "email_sent",
                    "sender": "estimator",
                    "receiver": "technicalDirector",
                    "status": new_status.lower(),
                    "status": "pending",
                    "comments": comments if comments else "BOQ sent for review and approval",
                    "timestamp": datetime.utcnow().isoformat(),
                    "decided_by": boq.created_by,
                    "decided_by_user_id": g.user.get('user_id') if hasattr(g, 'user') and g.user else None,
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
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(existing_history, "action")

                    existing_history.action_by = boq.created_by
                    existing_history.boq_status = "Pending"
                    existing_history.sender = boq.created_by
                    existing_history.receiver = technical_director.full_name if technical_director.full_name else technical_director.email
                    existing_history.comments = comments if comments else "BOQ sent for review and approval"
                    existing_history.sender_role = 'estimator'
                    existing_history.receiver_role = 'technicalDirector'
                    existing_history.action_date = datetime.utcnow()
                    existing_history.last_modified_by = boq.created_by
                    existing_history.last_modified_at = datetime.utcnow()
                else:
                    # Create new history entry with action as array
                    boq_history = BOQHistory(
                        boq_id=boq_id,
                        action=[new_action],  # Store as array
                        action_by=boq.created_by,
                        boq_status="Pending",
                        sender=boq.created_by,
                        receiver=technical_director.full_name if technical_director.full_name else technical_director.email,
                        comments=comments if comments else "BOQ sent for review and approval",
                        sender_role='estimator',
                        receiver_role='technicalDirector',
                        action_date=datetime.utcnow(),
                        created_by=boq.created_by
                    )
                    db.session.add(boq_history)

                db.session.commit()

                return jsonify({
                    "success": True,
                    "message": "BOQ review email sent successfully to Technical Director",
                    "boq_id": boq_id,
                    "email": technical_director.email,
                }), 200
            else:
                return jsonify({
                    "success": False,
                    "message": "Failed to send BOQ review email to Technical Director",
                    "boq_id": boq_id,
                    "error": "Email service failed"
                }), 500

    except Exception as e:
        log.error(f"Error sending BOQ email for BOQ {boq_id}: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to send BOQ email notification",
            "error": str(e)
        }), 500

def get_boq_history(boq_id):
    try:
        boq_history_records = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).all()

        history_list = []
        for h in boq_history_records:
            history_list.append({
                "boq_history_id": h.boq_history_id,
                "boq_id": h.boq_id,
                "action": h.action,
                "action_by": h.action_by,
                "boq_status": h.boq_status,
                "sender": h.sender,
                "receiver": h.receiver,
                "comments": h.comments,
                "sender_role": h.sender_role,
                "receiver_role": h.receiver_role,
                "action_date": h.action_date.isoformat() if h.action_date else None,
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "created_by": h.created_by
            })

        return jsonify({
            "boq_history": history_list
        }), 200
    except Exception as e:
        log.error(f"Error fetching BOQ history: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_estimator_dashboard():
    try:
        from datetime import datetime, timedelta
        from collections import defaultdict

        # Get all BOQs and Projects
        all_boqs = BOQ.query.filter_by(is_deleted=False).all()
        projects = Project.query.filter_by(is_deleted=False).all()

        # Initialize lists BEFORE using them
        monthly_trend = []
        top_projects = []
        recent_activities = []

        # Get current month start date
        now = datetime.utcnow()
        current_month_start = datetime(now.year, now.month, 1)

        # Initialize totals
        total_selling_amount = 0
        total_profit_amount = 0
        total_material_cost = 0
        total_labor_cost = 0
        total_item_count = 0
        total_material_count = 0
        total_labor_count = 0

        # Monthly trend tracking
        monthly_data = defaultdict(lambda: {"count": 0, "value": 0})

        # Calculate metrics for each project
        for project in projects:
            project_boqs = BOQ.query.filter_by(project_id=project.project_id, is_deleted=False).all()
            if not project_boqs:
                continue

            project_total_value = 0
            project_total_material = 0
            project_total_labor = 0
            project_total_items = 0
            project_material_count = 0
            project_labor_count = 0

            for boq in project_boqs:
                boq_details = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()

                if boq_details:
                    selling_price = float(boq_details.total_cost) if boq_details.total_cost else 0.0
                    project_total_value += selling_price
                    total_selling_amount += selling_price

                    items_count = int(boq_details.total_items) if boq_details.total_items else 0
                    project_total_items += items_count
                    total_item_count += items_count

                    # Get material and labor costs from JSON
                    if boq_details.boq_details and 'summary' in boq_details.boq_details:
                        summary = boq_details.boq_details['summary']
                        material_cost = float(summary.get('total_material_cost', 0))
                        labor_cost = float(summary.get('total_labor_cost', 0))

                        project_total_material += material_cost
                        total_material_cost += material_cost

                        project_total_labor += labor_cost
                        total_labor_cost += labor_cost

                        # Count items with material/labor
                        items = boq_details.boq_details.get('items', [])
                        for item in items:
                            if item.get('material_cost', 0) > 0:
                                project_material_count += 1
                                total_material_count += 1
                            if item.get('labor_cost', 0) > 0:
                                project_labor_count += 1
                                total_labor_count += 1

                            base_cost = float(item.get('base_cost', 0))
                            item_selling_price = float(item.get('selling_price', 0))
                            profit = item_selling_price - base_cost
                            total_profit_amount += profit

                    # Monthly trend data
                    if boq.created_at:
                        month_key = boq.created_at.strftime('%B %Y')
                        monthly_data[month_key]["count"] += 1
                        monthly_data[month_key]["value"] += selling_price

            # Store project details with all metrics
            top_projects.append({
                "project_id": project.project_id,
                "project_name": project.project_name,
                "boq_count": len(project_boqs),
                "total_value": round(project_total_value, 2),
                "total_items": project_total_items,
                "material_count": project_material_count,
                "labor_count": project_labor_count,
                "material_cost": round(project_total_material, 2),
                "labor_cost": round(project_total_labor, 2)
            })

            recent_activities.append({
                "project_id": project.project_id,
                "project_name": project.project_name,
                "boq_count": len(project_boqs),
                "value": round(project_total_value, 2)
            })

        # Monthly trend (last 6 months)
        for i in range(5, -1, -1):
            month_date = now - timedelta(days=30*i)
            month_key = month_date.strftime('%B %Y')
            monthly_trend.append({
                "month": month_key,
                "count": monthly_data[month_key]["count"],
                "value": round(monthly_data[month_key]["value"], 2)
            })

        # Sort top projects by value
        top_projects = sorted(top_projects, key=lambda x: x['total_value'], reverse=True)[:5]

        # Calculate average approval time
        approved_boqs = [boq for boq in all_boqs if boq.status == 'Approved' and boq.last_modified_at and boq.created_at]
        average_approval_time = 0
        if approved_boqs:
            total_days = sum([(boq.last_modified_at - boq.created_at).days for boq in approved_boqs])
            average_approval_time = round(total_days / len(approved_boqs), 1)

        return jsonify({
            # Summary metrics
            "total_projects": len(projects),
            "total_boqs": len(all_boqs),
            "total_selling_amount": round(total_selling_amount, 2),
            "total_profit_amount": round(total_profit_amount, 2),
            "total_material_cost": round(total_material_cost, 2),
            "total_labor_cost": round(total_labor_cost, 2),
            "total_items": total_item_count,
            "total_material_count": total_material_count,
            "total_labor_count": total_labor_count,

            # Status breakdown
            "pending_boqs": len([boq for boq in all_boqs if boq.status == 'Pending']),
            "approved_boqs": len([boq for boq in all_boqs if boq.status == 'Approved']),
            "rejected_boqs": len([boq for boq in all_boqs if boq.status == 'Rejected']),
            "draft_boqs": len([boq for boq in all_boqs if boq.status == 'Draft']),
            "sent_for_confirmation_boqs": len([boq for boq in all_boqs if boq.status == 'Sent_for_Confirmation']),

            # Additional metrics
            "average_approval_time": average_approval_time,

            # Detailed data
            "monthly_trend": monthly_trend,
            "top_projects": top_projects,
            "recent_activities": recent_activities
        }), 200
    except Exception as e:
        log.error(f"Error fetching Estimator dashboard: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
