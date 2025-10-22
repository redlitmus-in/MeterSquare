from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails
from models.change_request import ChangeRequest
from models.user import User
from models.role import Role
from config.logging import get_logger
from datetime import datetime

log = get_logger()


def create_buyer():
    """Create a new buyer user"""
    try:
        data = request.get_json()

        # Validate role exists
        role = Role.query.filter_by(role='buyer').first()
        if not role:
            return jsonify({"error": "Buyer role not found"}), 404

        # Validate required fields
        if not data.get('email') or not data.get('full_name'):
            return jsonify({"error": "Email and full name are required"}), 400

        # Check for duplicate email
        existing_user = User.query.filter_by(email=data['email'], is_deleted=False).first()
        if existing_user:
            return jsonify({"error": f"User with email '{data['email']}' already exists"}), 409

        # Create new Buyer user
        new_buyer = User(
            email=data['email'],
            phone=data.get('phone'),
            role_id=role.role_id,
            full_name=data['full_name'],
            created_at=datetime.utcnow(),
            is_deleted=False,
            is_active=True,
            department='Operations - Procurement'
        )

        db.session.add(new_buyer)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Buyer created successfully",
            "user_id": new_buyer.user_id,
            "buyer": {
                "user_id": new_buyer.user_id,
                "full_name": new_buyer.full_name,
                "email": new_buyer.email,
                "phone": new_buyer.phone,
                "role": "buyer",
                "department": new_buyer.department
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating Buyer: {str(e)}")
        return jsonify({"error": f"Failed to create Buyer: {str(e)}"}), 500


def get_all_buyers():
    """Get all buyers (assigned and unassigned)"""
    try:
        role = Role.query.filter_by(role='buyer').first()
        if not role:
            return jsonify({"error": "Buyer role not found"}), 404

        buyers = User.query.filter_by(role_id=role.role_id, is_deleted=False).all()
        assigned_list = []
        unassigned_list = []

        for buyer in buyers:
            # Fetch all projects assigned to this buyer
            projects = Project.query.filter_by(buyer_id=buyer.user_id, is_deleted=False).all()

            if projects and len(projects) > 0:
                # Add each project under assigned list
                for project in projects:
                    assigned_list.append({
                        "user_id": buyer.user_id,
                        "buyer_name": buyer.full_name,
                        "full_name": buyer.full_name,
                        "email": buyer.email,
                        "phone": buyer.phone,
                        "project_id": project.project_id,
                        "project_name": project.project_name
                    })
            else:
                # Buyer without project assignment
                unassigned_list.append({
                    "user_id": buyer.user_id,
                    "buyer_name": buyer.full_name,
                    "full_name": buyer.full_name,
                    "email": buyer.email,
                    "phone": buyer.phone,
                    "project_id": None
                })

        return jsonify({
            "success": True,
            "assigned_count": len(assigned_list),
            "unassigned_count": len(unassigned_list),
            "assigned_buyers": assigned_list,
            "unassigned_buyers": unassigned_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching Buyers: {str(e)}")
        return jsonify({"error": f"Failed to fetch Buyers: {str(e)}"}), 500


def get_buyer_id(user_id):
    """Get buyer by user ID with assigned projects"""
    try:
        buyer = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        # Get assigned projects
        projects = Project.query.filter_by(buyer_id=user_id, is_deleted=False).all()

        buyer_data = {
            "user_id": buyer.user_id,
            "full_name": buyer.full_name,
            "email": buyer.email,
            "phone": buyer.phone,
            "department": buyer.department,
            "assigned_projects": [
                {
                    "project_id": p.project_id,
                    "project_name": p.project_name,
                    "client": p.client,
                    "location": p.location
                } for p in projects
            ]
        }

        return jsonify({
            "success": True,
            "buyer": buyer_data
        }), 200

    except Exception as e:
        log.error(f"Error fetching Buyer {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to fetch Buyer: {str(e)}"}), 500


def update_buyer(user_id):
    """Update buyer details"""
    try:
        buyer = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        data = request.get_json()

        # Update buyer details
        if "full_name" in data:
            buyer.full_name = data["full_name"]
        if "email" in data:
            # Check for duplicate email
            existing = User.query.filter(
                User.email == data["email"],
                User.user_id != user_id,
                User.is_deleted == False
            ).first()
            if existing:
                return jsonify({"error": f"Email '{data['email']}' is already in use"}), 409
            buyer.email = data["email"]
        if "phone" in data:
            buyer.phone = data["phone"]

        buyer.last_modified_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Buyer updated successfully",
            "buyer": {
                "user_id": buyer.user_id,
                "full_name": buyer.full_name,
                "email": buyer.email,
                "phone": buyer.phone
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating Buyer {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to update Buyer: {str(e)}"}), 500


def delete_buyer(user_id):
    """Soft delete a buyer"""
    try:
        buyer = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        # Check assigned projects
        assigned_projects = Project.query.filter_by(buyer_id=user_id, is_deleted=False).all()
        if assigned_projects and len(assigned_projects) > 0:
            projects_list = [
                {"project_id": p.project_id, "project_name": p.project_name}
                for p in assigned_projects
            ]
            return jsonify({
                "success": False,
                "message": "Cannot delete Buyer. They are assigned to one or more projects.",
                "assigned_projects": projects_list
            }), 400

        # Perform soft delete
        buyer.is_deleted = True
        buyer.is_active = False
        buyer.last_modified_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Buyer deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting Buyer {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to delete Buyer: {str(e)}"}), 500


def get_buyer_boq_materials():
    """Get BOQ materials from projects assigned to buyer AND site engineer by PM"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']

        # Get projects where BOTH buyer AND site_supervisor (SE) are assigned
        # Only show materials when both buyer and SE are assigned to the project
        projects = Project.query.filter(
            Project.buyer_id == buyer_id,
            Project.site_supervisor_id.isnot(None),  # SE must be assigned
            Project.is_deleted == False
        ).all()

        materials_list = []
        total_cost = 0

        for project in projects:
            # Get BOQs for this project
            boqs = BOQ.query.filter_by(project_id=project.project_id, is_deleted=False).all()

            for boq in boqs:
                # Get BOQ details
                boq_details = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()

                if boq_details and boq_details.boq_details:
                    items = boq_details.boq_details.get('items', [])

                    for item in items:
                        # Get sub-items
                        sub_items = item.get('sub_items', [])

                        for sub_item in sub_items:
                            materials = sub_item.get('materials', [])

                            for material in materials:
                                material_total = float(material.get('total_price', 0) or 0)
                                total_cost += material_total

                                materials_list.append({
                                    "project_id": project.project_id,
                                    "project_name": project.project_name,
                                    "client": project.client,
                                    "location": project.location,
                                    "boq_id": boq.boq_id,
                                    "boq_name": boq.boq_name,
                                    "item_name": item.get('item_name'),
                                    "sub_item_name": sub_item.get('sub_item_name'),
                                    "material_name": material.get('material_name'),
                                    "quantity": material.get('quantity'),
                                    "unit": material.get('unit'),
                                    "unit_price": material.get('unit_price'),
                                    "total_price": material_total,
                                    "master_material_id": material.get('master_material_id'),
                                    "material_type": "BOQ"
                                })

        return jsonify({
            "success": True,
            "materials_count": len(materials_list),
            "total_cost": round(total_cost, 2),
            "projects_count": len(projects),
            "materials": materials_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyer BOQ materials: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch BOQ materials: {str(e)}"}), 500


def get_buyer_dashboard():
    """Get buyer dashboard statistics"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']

        # Get projects where BOTH buyer AND site_supervisor (SE) are assigned
        projects = Project.query.filter(
            Project.buyer_id == buyer_id,
            Project.site_supervisor_id.isnot(None),
            Project.is_deleted == False
        ).all()

        pending_purchases = []
        total_cost = 0

        for project in projects:
            # Get BOQs for this project
            boqs = BOQ.query.filter_by(project_id=project.project_id, is_deleted=False).all()

            if not boqs:
                continue

            # Get change requests assigned to buyer for these BOQs
            change_requests = ChangeRequest.query.filter(
                ChangeRequest.boq_id.in_([boq.boq_id for boq in boqs]),
                ChangeRequest.status == 'assigned_to_buyer',
                ChangeRequest.is_deleted == False
            ).all()

            for cr in change_requests:
                sub_items_data = cr.sub_items_data or cr.materials_data or []
                cr_total = 0
                materials_count = 0

                # Count materials
                if cr.sub_items_data:
                    for sub_item in sub_items_data:
                        if isinstance(sub_item, dict):
                            sub_materials = sub_item.get('materials', [])
                            if sub_materials:
                                materials_count += len(sub_materials)
                                for material in sub_materials:
                                    cr_total += float(material.get('total_price', 0) or 0)
                            else:
                                materials_count += 1
                                cr_total += float(sub_item.get('total_price', 0) or 0)
                else:
                    materials_count = len(sub_items_data)
                    for material in sub_items_data:
                        cr_total += float(material.get('total_price', 0) or 0)

                total_cost += cr_total

                pending_purchases.append({
                    "cr_id": cr.cr_id,
                    "project_id": project.project_id,
                    "materials_count": materials_count,
                    "total_cost": round(cr_total, 2)
                })

        return jsonify({
            "success": True,
            "pending_purchases": pending_purchases,
            "total_cost": round(total_cost, 2)
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyer dashboard: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch dashboard: {str(e)}"}), 500


def get_buyer_pending_purchases():
    """Get approved change requests (extra materials) for buyer to purchase"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']

        # Get change requests DIRECTLY assigned to this buyer (via assigned_to_buyer_user_id)
        change_requests = ChangeRequest.query.filter(
            ChangeRequest.status == 'assigned_to_buyer',
            ChangeRequest.assigned_to_buyer_user_id == buyer_id,
            ChangeRequest.is_deleted == False
        ).all()

        pending_purchases = []
        total_cost = 0

        for cr in change_requests:
            # Get project details
            project = Project.query.get(cr.project_id)
            if not project:
                continue

            # Get BOQ details
            boq = BOQ.query.filter_by(boq_id=cr.boq_id).first()
            if not boq:
                continue

            # Use sub_items_data (new structure) or fallback to materials_data (legacy)
            sub_items_data = cr.sub_items_data or cr.materials_data or []
            cr_total = 0

            # Process sub-items to extract materials
            materials_list = []

            # Handle both new sub_items_data format and legacy materials_data format
            if cr.sub_items_data:
                # New format: sub_items_data contains sub-items with materials inside
                for sub_item in sub_items_data:
                    # Each sub-item can have materials array or be a material itself
                    if isinstance(sub_item, dict):
                        # Check if this sub_item has materials array
                        sub_materials = sub_item.get('materials', [])
                        if sub_materials:
                            # Sub-item contains materials array
                            for material in sub_materials:
                                material_total = float(material.get('total_price', 0) or 0)
                                cr_total += material_total
                                materials_list.append({
                                    "material_name": material.get('material_name', ''),
                                    "quantity": material.get('quantity', 0),
                                    "unit": material.get('unit', ''),
                                    "unit_price": material.get('unit_price', 0),
                                    "total_price": material_total
                                })
                        else:
                            # Sub-item is the material itself
                            sub_total = float(sub_item.get('total_price', 0) or 0)
                            cr_total += sub_total
                            materials_list.append({
                                "material_name": sub_item.get('sub_item_name', '') or sub_item.get('material_name', ''),
                                "quantity": sub_item.get('quantity', 0),
                                "unit": sub_item.get('unit', ''),
                                "unit_price": sub_item.get('unit_price', 0),
                                "total_price": sub_total
                            })
            else:
                # Legacy format: materials_data is direct array of materials
                for material in sub_items_data:
                    material_total = float(material.get('total_price', 0) or 0)
                    cr_total += material_total
                    materials_list.append({
                        "material_name": material.get('material_name', ''),
                        "quantity": material.get('quantity', 0),
                        "unit": material.get('unit', ''),
                        "unit_price": material.get('unit_price', 0),
                        "total_price": material_total
                    })

            total_cost += cr_total

            pending_purchases.append({
                "cr_id": cr.cr_id,
                "project_id": project.project_id,
                "project_name": project.project_name,
                "client": project.client or "Unknown Client",
                "location": project.location or "Unknown Location",
                "boq_id": cr.boq_id,
                "boq_name": boq.boq_name if boq else "Unknown",
                "item_name": cr.item_name or "N/A",
                "sub_item_name": "Extra Materials",
                "request_type": cr.request_type or "EXTRA_MATERIALS",
                "reason": cr.justification or "",
                "materials": materials_list,
                "materials_count": len(materials_list),
                "total_cost": round(cr_total, 2),
                "approved_by": cr.approved_by_user_id,
                "approved_at": cr.approval_date.isoformat() if cr.approval_date else None,
                "created_at": cr.created_at.isoformat() if cr.created_at else None
            })
        return jsonify({
            "success": True,
            "pending_purchases_count": len(pending_purchases),
            "total_cost": round(total_cost, 2),
            "pending_purchases": pending_purchases
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyer pending purchases: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch pending purchases: {str(e)}"}), 500


def get_buyer_completed_purchases():
    """Get completed purchases by buyer"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']

        # Get change requests completed by this buyer
        change_requests = ChangeRequest.query.filter(
            ChangeRequest.status == 'purchase_completed',
            ChangeRequest.purchase_completed_by_user_id == buyer_id,
            ChangeRequest.is_deleted == False
        ).all()

        completed_purchases = []
        total_cost = 0

        for cr in change_requests:
            # Get project details
            project = Project.query.get(cr.project_id)
            if not project:
                continue

            # Get BOQ details
            boq = BOQ.query.filter_by(boq_id=cr.boq_id).first()
            if not boq:
                continue

            # Process materials
            sub_items_data = cr.sub_items_data or cr.materials_data or []
            cr_total = 0
            materials_list = []

            if cr.sub_items_data:
                for sub_item in sub_items_data:
                    if isinstance(sub_item, dict):
                        sub_materials = sub_item.get('materials', [])
                        if sub_materials:
                            for material in sub_materials:
                                material_total = float(material.get('total_price', 0) or 0)
                                cr_total += material_total
                                materials_list.append({
                                    "material_name": material.get('material_name', ''),
                                    "quantity": material.get('quantity', 0),
                                    "unit": material.get('unit', ''),
                                    "unit_price": material.get('unit_price', 0),
                                    "total_price": material_total
                                })
                        else:
                            sub_total = float(sub_item.get('total_price', 0) or 0)
                            cr_total += sub_total
                            materials_list.append({
                                "material_name": sub_item.get('sub_item_name', '') or sub_item.get('material_name', ''),
                                "quantity": sub_item.get('quantity', 0),
                                "unit": sub_item.get('unit', ''),
                                "unit_price": sub_item.get('unit_price', 0),
                                "total_price": sub_total
                            })
            else:
                for material in sub_items_data:
                    material_total = float(material.get('total_price', 0) or 0)
                    cr_total += material_total
                    materials_list.append({
                        "material_name": material.get('material_name', ''),
                        "quantity": material.get('quantity', 0),
                        "unit": material.get('unit', ''),
                        "unit_price": material.get('unit_price', 0),
                        "total_price": material_total
                    })

            total_cost += cr_total

            completed_purchases.append({
                "cr_id": cr.cr_id,
                "project_id": project.project_id,
                "project_name": project.project_name,
                "client": project.client or "Unknown Client",
                "location": project.location or "Unknown Location",
                "boq_id": cr.boq_id,
                "boq_name": boq.boq_name if boq else "Unknown",
                "item_name": cr.item_name or "N/A",
                "sub_item_name": "Extra Materials",
                "request_type": cr.request_type or "EXTRA_MATERIALS",
                "reason": cr.justification or "",
                "materials": materials_list,
                "materials_count": len(materials_list),
                "total_cost": round(cr_total, 2),
                "approved_by": cr.approved_by_user_id,
                "approved_at": cr.approval_date.isoformat() if cr.approval_date else None,
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "status": "completed",
                "purchase_completed_by_user_id": cr.purchase_completed_by_user_id,
                "purchase_completed_by_name": cr.purchase_completed_by_name,
                "purchase_completion_date": cr.purchase_completion_date.isoformat() if cr.purchase_completion_date else None,
                "purchase_notes": cr.purchase_notes
            })

        return jsonify({
            "success": True,
            "completed_purchases_count": len(completed_purchases),
            "total_cost": round(total_cost, 2),
            "completed_purchases": completed_purchases
        }), 200

    except Exception as e:
        log.error(f"Error fetching completed purchases: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch completed purchases: {str(e)}"}), 500


def complete_purchase():
    """Mark a purchase as complete"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Unknown Buyer')

        data = request.get_json()
        cr_id = data.get('cr_id')
        notes = data.get('notes', '')

        if not cr_id:
            return jsonify({"error": "Change request ID is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify it's assigned to this buyer
        if cr.assigned_to_buyer_user_id != buyer_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        if cr.status != 'assigned_to_buyer':
            return jsonify({"error": f"Purchase cannot be completed. Current status: {cr.status}"}), 400

        # Update the change request
        cr.status = 'purchase_completed'
        cr.purchase_completed_by_user_id = buyer_id
        cr.purchase_completed_by_name = buyer_name
        cr.purchase_completion_date = datetime.utcnow()
        cr.purchase_notes = notes
        cr.updated_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Purchase CR-{cr_id} marked as complete by buyer {buyer_id}")

        return jsonify({
            "success": True,
            "message": "Purchase marked as complete successfully",
            "purchase": {
                "cr_id": cr.cr_id,
                "status": cr.status,
                "purchase_completed_by_user_id": cr.purchase_completed_by_user_id,
                "purchase_completed_by_name": cr.purchase_completed_by_name,
                "purchase_completion_date": cr.purchase_completion_date.isoformat(),
                "purchase_notes": cr.purchase_notes
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error completing purchase: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to complete purchase: {str(e)}"}), 500


def get_purchase_by_id(cr_id):
    """Get purchase details by change request ID"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify it's assigned to this buyer or completed by this buyer
        if cr.assigned_to_buyer_user_id != buyer_id and cr.purchase_completed_by_user_id != buyer_id:
            return jsonify({"error": "You don't have access to this purchase"}), 403

        # Get project details
        project = Project.query.get(cr.project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get BOQ details
        boq = BOQ.query.filter_by(boq_id=cr.boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Process materials
        sub_items_data = cr.sub_items_data or cr.materials_data or []
        cr_total = 0
        materials_list = []

        if cr.sub_items_data:
            for sub_item in sub_items_data:
                if isinstance(sub_item, dict):
                    sub_materials = sub_item.get('materials', [])
                    if sub_materials:
                        for material in sub_materials:
                            material_total = float(material.get('total_price', 0) or 0)
                            cr_total += material_total
                            materials_list.append({
                                "material_name": material.get('material_name', ''),
                                "quantity": material.get('quantity', 0),
                                "unit": material.get('unit', ''),
                                "unit_price": material.get('unit_price', 0),
                                "total_price": material_total
                            })
                    else:
                        sub_total = float(sub_item.get('total_price', 0) or 0)
                        cr_total += sub_total
                        materials_list.append({
                            "material_name": sub_item.get('sub_item_name', '') or sub_item.get('material_name', ''),
                            "quantity": sub_item.get('quantity', 0),
                            "unit": sub_item.get('unit', ''),
                            "unit_price": sub_item.get('unit_price', 0),
                            "total_price": sub_total
                        })
        else:
            for material in sub_items_data:
                material_total = float(material.get('total_price', 0) or 0)
                cr_total += material_total
                materials_list.append({
                    "material_name": material.get('material_name', ''),
                    "quantity": material.get('quantity', 0),
                    "unit": material.get('unit', ''),
                    "unit_price": material.get('unit_price', 0),
                    "total_price": material_total
                })

        purchase_status = 'completed' if cr.status == 'purchase_completed' else 'pending'

        purchase = {
            "cr_id": cr.cr_id,
            "project_id": project.project_id,
            "project_name": project.project_name,
            "client": project.client or "Unknown Client",
            "location": project.location or "Unknown Location",
            "boq_id": cr.boq_id,
            "boq_name": boq.boq_name,
            "item_name": cr.item_name or "N/A",
            "sub_item_name": "Extra Materials",
            "request_type": cr.request_type or "EXTRA_MATERIALS",
            "reason": cr.justification or "",
            "materials": materials_list,
            "materials_count": len(materials_list),
            "total_cost": round(cr_total, 2),
            "approved_by": cr.approved_by_user_id,
            "approved_at": cr.approval_date.isoformat() if cr.approval_date else None,
            "created_at": cr.created_at.isoformat() if cr.created_at else None,
            "status": purchase_status,
            "purchase_completed_by_user_id": cr.purchase_completed_by_user_id,
            "purchase_completed_by_name": cr.purchase_completed_by_name,
            "purchase_completion_date": cr.purchase_completion_date.isoformat() if cr.purchase_completion_date else None,
            "purchase_notes": cr.purchase_notes
        }

        return jsonify({
            "success": True,
            "purchase": purchase
        }), 200

    except Exception as e:
        log.error(f"Error fetching purchase {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch purchase: {str(e)}"}), 500
