from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError

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
        # Calculate the amount (rate_per_hour * hours)
        rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
        hours = labour_data_item.get("hours", 0.0)
        labour_amount = rate_per_hour * hours

        master_labour = MasterLabour.query.filter_by(labour_role=labour_role).first()

        if not master_labour:
            master_labour = MasterLabour(
                labour_role=labour_role,
                item_id=master_item_id,  # Set the item_id reference
                work_type=work_type,  # Set the work_type
                amount=labour_amount,  # Set the calculated amount
                created_by=created_by
            )
            db.session.add(master_labour)
            db.session.flush()
        else:
            # Update existing labour: always update item_id, work_type, and amount
            if master_labour.item_id is None:
                master_labour.item_id = master_item_id
            if master_labour.work_type is None and work_type:
                master_labour.work_type = work_type

            # Always update the amount with the latest calculation
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
            profit_margin_amount = (base_cost * profit_margin_percentage) / 100
            total_cost = base_cost + overhead_amount
            selling_price = total_cost + profit_margin_amount

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
                "total_cost": total_cost,
                "selling_price": selling_price,
                "totalMaterialCost": materials_cost,
                "totalLabourCost": labour_cost,
                "actualItemCost": base_cost,
                "estimatedSellingPrice": selling_price,
                "materials": item_materials,
                "labour": item_labour
            }

            boq_items.append(item_json)
            total_boq_cost += selling_price
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
    """Get BOQ details from JSON storage"""
    try:
        boq = BOQ.query.filter_by(boq_id=boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get BOQ details from JSON
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Fetch project details
        project = Project.query.filter_by(project_id=boq.project_id).first()

        # Build response with project details
        response_data = {
            "boq_id": boq.boq_id,
            "boq_name": boq.boq_name,
            "project_id": boq.project_id,
            "status": boq.status,
            "created_at": boq.created_at.isoformat() if boq.created_at else None,
            "created_by": boq.created_by,
            "project_details": {
                "project_name": project.project_name if project else None,
                "location": project.location if project else None,
                "floor": project.floor_name if project else None,
                "hours": project.working_hours if project else None,
                "status": project.status if project else None
            }
        }

        # Add BOQ details from JSON
        response_data.update(boq_details.boq_details)

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

            boq_summary = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "project_id": boq.project_id,
                "project_name": project.project_name if project else None,
                "client": project.client if project else None,
                "location": project.location if project else None,
                "status": boq.status,
                "items_count": boq_detail.total_items,
                "material_count": boq_detail.total_materials,
                "labour_count": boq_detail.total_labour,
                "total_cost": boq_detail.total_cost,
                "selling_price": boq_detail.total_cost,
                "estimatedSellingPrice": boq_detail.total_cost,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "created_by": boq.created_by
            }

            # Add summary from JSON if available
            if boq_detail.boq_details and "summary" in boq_detail.boq_details:
                summary = boq_detail.boq_details["summary"]
                boq_summary.update({
                    "total_material_cost": summary.get("total_material_cost", 0),
                    "total_labour_cost": summary.get("total_labour_cost", 0)
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

        # Automatically set status to In_Review when BOQ is updated
        boq.status = "In_Review"

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
                    "total_cost": total_cost,
                    "selling_price": selling_price,
                    "totalMaterialCost": materials_cost,
                    "totalLabourCost": labour_cost,
                    "actualItemCost": base_cost,
                    "estimatedSellingPrice": selling_price,
                    "materials": processed_materials,
                    "labour": processed_labour
                }

                boq_items.append(item_json)
                total_boq_cost += selling_price
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

        db.session.commit()

        # Return updated BOQ
        return jsonify({"message": "BOQ Updated successfully"}), 200
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

# # SEND EMAIL - Separate API to send BOQ email notification
# def send_boq_email(boq_id):
#     """
#     Separate API endpoint to send BOQ email notification
#     Can be called independently after BOQ creation or update
#     GET /api/send_boq_email/<boq_id>
#     Optional query parameters:
#         - email_type: 'created' or 'updated' (defaults to 'created')
#     """
#     try:
#         current_user = g.user

#         # Get complete BOQ data
#         complete_boq_data = get_boq_id(boq_id)
#         if not complete_boq_data:
#             return jsonify({
#                 "error": "BOQ not found",
#                 "message": f"No BOQ found with ID {boq_id}"
#             }), 404

#         # Initialize email service
#         boq_email_service = BOQEmailService()

#         # Prepare BOQ data for email
#         boq_data = {
#             'boq_id': complete_boq_data.get('boq_id'),
#             'title': complete_boq_data.get('title'),
#             'status': complete_boq_data.get('status'),
#             'total_amount': complete_boq_data.get('total_amount', 0)
#         }

#         # Prepare items data for email
#         items_data = []
#         for item in complete_boq_data.get('items', []):
#             item_data = {
#                 'item_no': item.get('item_no'),
#                 'category': item.get('category'),
#                 'section_name': item.get('section_details', {}).get('section_name', 'Unknown') if item.get('section_details') else 'Unknown',
#                 'description': item.get('description'),
#                 'quantity': item.get('quantity'),
#                 'unit': item.get('unit'),
#                 'rate': item.get('rate'),
#                 'amount': item.get('amount')
#             }
#             items_data.append(item_data)

#         # Prepare project info
#         project_info = {
#             'project_id': complete_boq_data.get('project_id'),
#             'project_name': f"Project {complete_boq_data.get('project_id')}" if complete_boq_data.get('project_id') else "Not specified"
#         }

#         # Prepare sender info (current user or BOQ creator)
#         sender_info = {
#             'full_name': current_user.get('full_name', complete_boq_data.get('raised_by', 'Unknown User')),
#             'department': current_user.get('department', 'N/A')
#         }

#         # Get email type from query parameters (for GET request)
#         email_type = request.args.get('email_type', 'created')  # 'created' or 'updated'

#         if email_type == 'updated':
#             # For update notification, use default changes summary
#             # Since GET request can't pass complex objects, use defaults
#             changes_summary = {
#                 'added': 0,
#                 'modified': 0,
#                 'removed': 0
#             }

#             email_sent = boq_email_service.send_boq_updated_notification(
#                 boq_data, items_data, project_info, sender_info, changes_summary
#             )
#             notification_type = "update"
#         else:
#             # For creation notification
#             email_sent = boq_email_service.send_boq_created_notification(
#                 boq_data, items_data, project_info, sender_info
#             )
#             notification_type = "creation"

#         if email_sent:
#             log.info(f"BOQ {notification_type} notification sent successfully for BOQ #{boq_id}")
#             return jsonify({
#                 "success": True,
#                 "message": f"BOQ {notification_type} notification sent successfully",
#                 "boq_id": boq_id,
#                 "email_type": email_type,
#                 "recipients": "Procurement team members"
#             }), 200
#         else:
#             log.warning(f"Failed to send BOQ {notification_type} notification for BOQ #{boq_id}")
#             return jsonify({
#                 "success": False,
#                 "message": f"Failed to send BOQ {notification_type} notification",
#                 "boq_id": boq_id,
#                 "error": "Email service failed to send notification"
#             }), 500

#     except Exception as e:
#         log.error(f"Error sending BOQ email for BOQ {boq_id}: {str(e)}")
#         return jsonify({
#             "success": False,
#             "message": "Failed to send BOQ email notification",
#             "error": str(e)
#         }), 500