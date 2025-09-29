from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQItem, BOQMaterial, BOQLabour
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError

log = get_logger()

def create_boq():
    """Create a new BOQ with items, materials, and labour"""
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

        # Create BOQ
        boq = BOQ(
            project_id=project_id,
            boq_name=data.get("boq_name"),
            status=data.get("status", "Draft"),
            created_by=data.get("created_by", "Admin"),
        )
        db.session.add(boq)
        db.session.flush()  # Get boq_id

        created_items = []
        total_boq_cost = 0

        for item_data in data.get("items", []):
            # Calculate base cost from materials and labour
            materials_cost = 0
            labour_cost = 0

            # Create BOQ Item
            item = BOQItem(
                boq_id=boq.boq_id,
                item_name=item_data.get("item_name"),
                description=item_data.get("description"),
                profit_margin_percentage=item_data.get("profit_margin_percentage", 15.0),
                status=item_data.get("status", "Active"),
                created_by=data.get("created_by", "Admin"),
            )
            db.session.add(item)
            db.session.flush()  # Get item_id

            # Add Materials
            for mat_data in item_data.get("materials", []):
                quantity = mat_data.get("quantity", 1.0)
                unit_price = mat_data.get("unit_price", 0.0)
                total_price = quantity * unit_price
                materials_cost += total_price

                material = BOQMaterial(
                    item_id=item.item_id,
                    material_name=mat_data.get("material_name"),
                    quantity=quantity,
                    unit=mat_data.get("unit", "nos"),
                    unit_price=unit_price,
                    total_price=total_price,
                    created_by=data.get("created_by", "Admin"),
                )
                db.session.add(material)

            # Add Labour
            for labour_data in item_data.get("labour", []):
                hours = labour_data.get("hours", 0.0)
                rate_per_hour = labour_data.get("rate_per_hour", 0.0)
                total_cost = hours * rate_per_hour
                labour_cost += total_cost

                labour = BOQLabour(
                    item_id=item.item_id,
                    labour_role=labour_data.get("labour_role"),
                    hours=hours,
                    rate_per_hour=rate_per_hour,
                    total_cost=total_cost,
                    created_by=data.get("created_by", "Admin"),
                )
                db.session.add(labour)

            # Calculate costs for the item
            item.base_cost = materials_cost + labour_cost

            # Calculate overhead (optional, can be percentage of base cost)
            overhead_percentage = item_data.get("overhead_percentage", 10.0)
            item.overhead_amount = (item.base_cost * overhead_percentage) / 100

            # Calculate profit margin
            item.profit_margin_amount = (item.base_cost * item.profit_margin_percentage) / 100

            # Calculate total cost and selling price
            item.total_cost = item.base_cost + item.overhead_amount
            item.selling_price = item.total_cost + item.profit_margin_amount

            total_boq_cost += item.selling_price
            created_items.append({
                "item_name": item.item_name,
                "base_cost": item.base_cost,
                "selling_price": item.selling_price
            })

        db.session.commit()

        return jsonify({
            "message": "BOQ created successfully",
            "boq": {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "project_id": boq.project_id,
                "status": boq.status,
                "total_cost": total_boq_cost,
                "items_count": len(created_items),
                "items": created_items
            }
        }), 201

    except SQLAlchemyError as e:
        db.session.rollback()
        log.error(f"Database error creating BOQ: {str(e)}")
        log.error(f"SQL Error Type: {type(e).__name__}")
        log.error(f"Request data: {data}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating BOQ: {str(e)}")
        log.error(f"Error Type: {type(e).__name__}")
        log.error(f"Request data: {data}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Error: {str(e)}"}), 500


def get_boq(boq_id):
    """Get BOQ details with all items, materials and labour"""
    try:
        boq = BOQ.query.filter_by(boq_id=boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Fetch project details
        project = Project.query.filter_by(project_id=boq.project_id).first()

        boq_data = {
            "boq_id": boq.boq_id,
            "project_id": boq.project_id,
            "boq_name": boq.boq_name,
            "status": boq.status,
            "created_at": boq.created_at.isoformat() if boq.created_at else None,
            "created_by": boq.created_by,
            "project_details": {
                "project_name": project.project_name if project else None,
                "location": project.location if project else None,
                "floor": project.floor_name if project else None,
                "hours": project.working_hours if project else None,
                "status": project.status if project else None
            },
            "items": []
        }

        total_boq_cost = 0

        for item in boq.items:
            # Calculate total material and labour costs
            total_material_cost = sum(material.total_price for material in item.materials)
            total_labour_cost = sum(labour.total_cost for labour in item.labours)

            # Calculate overhead percentage (reverse calculation from overhead_amount)
            overhead_percentage = (item.overhead_amount / item.base_cost * 100) if item.base_cost > 0 else 10.0

            item_data = {
                "item_id": item.item_id,
                "item_name": item.item_name,
                "description": item.description,
                "base_cost": item.base_cost,
                "totalMaterialCost": total_material_cost,
                "totalLabourCost": total_labour_cost,
                "actualItemCost": item.base_cost,  # base_cost is the actual item cost (materials + labour)
                "overhead_percentage": round(overhead_percentage, 2),
                "overhead_amount": item.overhead_amount,
                "profit_margin_percentage": item.profit_margin_percentage,
                "profit_margin_amount": item.profit_margin_amount,
                "total_cost": item.total_cost,
                "selling_price": item.selling_price,
                "estimatedSellingPrice": item.selling_price,  # selling_price is the estimated selling price
                "status": item.status,
                "materials": [],
                "labour": []
            }

            # Add materials
            for material in item.materials:
                item_data["materials"].append({
                    "material_id": material.material_id,
                    "material_name": material.material_name,
                    "quantity": material.quantity,
                    "unit": material.unit,
                    "unit_price": material.unit_price,
                    "total_price": material.total_price
                })

            # Add labour
            for labour in item.labours:
                item_data["labour"].append({
                    "labour_id": labour.labour_id,
                    "labour_role": labour.labour_role,
                    "hours": labour.hours,
                    "rate_per_hour": labour.rate_per_hour,
                    "total_cost": labour.total_cost
                })

            total_boq_cost += item.selling_price
            boq_data["items"].append(item_data)

        boq_data["total_cost"] = total_boq_cost

        return jsonify(boq_data), 200

    except Exception as e:
        log.error(f"Error fetching BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500


def update_boq(boq_id):
    """Update BOQ status"""
    try:
        data = request.get_json()
        boq = BOQ.query.filter_by(boq_id=boq_id).first()

        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        if "status" in data:
            boq.status = data["status"]

        if "boq_name" in data:
            boq.boq_name = data["boq_name"]

        boq.last_modified_by = data.get("modified_by", "Admin")

        db.session.commit()

        return jsonify({"message": "BOQ updated successfully"}), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500


def delete_boq(boq_id):
    """Delete BOQ and all related items"""
    try:
        boq = BOQ.query.filter_by(boq_id=boq_id).first()

        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Delete all related items (cascading should handle materials and labour)
        for item in boq.items:
            # Delete materials
            for material in item.materials:
                db.session.delete(material)
            # Delete labour
            for labour in item.labours:
                db.session.delete(labour)
            db.session.delete(item)

        db.session.delete(boq)
        db.session.commit()

        return jsonify({"message": "BOQ deleted successfully"}), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500