from flask import request, jsonify, g
from sqlalchemy.orm import selectinload
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails, MasterItem, MasterSubItem, MasterMaterial
from models.change_request import ChangeRequest
from models.user import User
from models.role import Role
from models.vendor import Vendor
from models.inventory import InventoryMaterial, InternalMaterialRequest
from config.logging import get_logger
from datetime import datetime
import os
from supabase import create_client, Client
from utils.comprehensive_notification_service import notification_service

log = get_logger()

# Configuration constants
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_KEY')
SUPABASE_BUCKET = "file_upload"
# Pre-build base URL for public files
PUBLIC_URL_BASE = f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/"
# Initialize Supabase client
supabase: Client = create_client(supabase_url, supabase_key) if supabase_url and supabase_key else None

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
            "message": "Procurement created successfully",
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
        # PERFORMANCE FIX: Use JOIN instead of N+1 queries (no User.buyer_projects relationship exists)
        from sqlalchemy import and_

        role = Role.query.filter_by(role='buyer').first()
        if not role:
            return jsonify({"error": "Buyer role not found"}), 404

        # Get buyers
        buyers = User.query.filter_by(role_id=role.role_id, is_deleted=False).all()

        # Pre-fetch ALL projects for all buyers in ONE query
        buyer_ids = [b.user_id for b in buyers]
        projects_by_buyer = {}
        if buyer_ids:
            projects = Project.query.filter(
                Project.buyer_id.in_(buyer_ids),
                Project.is_deleted == False
            ).all()

            # Group projects by buyer_id
            for project in projects:
                if project.buyer_id not in projects_by_buyer:
                    projects_by_buyer[project.buyer_id] = []
                projects_by_buyer[project.buyer_id].append(project)

        assigned_list = []
        unassigned_list = []

        for buyer in buyers:
            # Use pre-fetched projects instead of querying
            projects = projects_by_buyer.get(buyer.user_id, [])

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
        log.error(f"Error fetching Procurement: {str(e)}")
        return jsonify({"error": f"Failed to fetch Procurement: {str(e)}"}), 500


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
        log.error(f"Error fetching Procurement {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to fetch Procurement: {str(e)}"}), 500


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
            "message": "Procurement updated successfully",
            "buyer": {
                "user_id": buyer.user_id,
                "full_name": buyer.full_name,
                "email": buyer.email,
                "phone": buyer.phone
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating Procurement {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to update Procurement: {str(e)}"}), 500


def delete_buyer(user_id):
    """Soft delete a buyer"""
    try:
        buyer = User.query.filter_by(user_id=user_id, is_deleted=False).first()
        if not buyer:
            return jsonify({"error": "Procurement not found"}), 404

        # Check assigned projects
        assigned_projects = Project.query.filter_by(buyer_id=user_id, is_deleted=False).all()
        if assigned_projects and len(assigned_projects) > 0:
            projects_list = [
                {"project_id": p.project_id, "project_name": p.project_name}
                for p in assigned_projects
            ]
            return jsonify({
                "success": False,
                "message": "Cannot delete Procurement. They are assigned to one or more projects.",
                "assigned_projects": projects_list
            }), 400

        # Perform soft delete
        buyer.is_deleted = True
        buyer.is_active = False
        buyer.last_modified_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Procurement deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting Procurement {user_id}: {str(e)}")
        return jsonify({"error": f"Failed to delete Procurement: {str(e)}"}), 500


def get_buyer_boq_materials():
    """Get BOQ materials from projects assigned to buyer AND site engineer by PM"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get projects where BOTH buyer AND site_supervisor (SE) are assigned
        # Only show materials when both buyer and SE are assigned to the project
        # Admin sees all projects
        # ✅ PERFORMANCE FIX: Eager load BOQs and BOQDetails (100+ queries → 2)
        if user_role == 'admin':
            projects = Project.query.options(
                selectinload(Project.boqs).selectinload(BOQ.details)
            ).filter(
                Project.site_supervisor_id.isnot(None),  # SE must be assigned
                Project.is_deleted == False
            ).all()
        else:
            projects = Project.query.options(
                selectinload(Project.boqs).selectinload(BOQ.details)
            ).filter(
                Project.buyer_id == buyer_id,
                Project.site_supervisor_id.isnot(None),  # SE must be assigned
                Project.is_deleted == False
            ).all()

        materials_list = []
        total_cost = 0

        for project in projects:
            # Get BOQs for this project (no query - already loaded via selectinload)
            boqs = [boq for boq in project.boqs if not boq.is_deleted]

            for boq in boqs:
                # Get BOQ details (no query - already loaded via selectinload)
                boq_details_list = [bd for bd in boq.details if not bd.is_deleted]
                boq_details = boq_details_list[0] if boq_details_list else None

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
                                    "material_type": "BOQ",
                                    "brand": material.get('brand'),
                                    "specification": material.get('specification')
                                })

        return jsonify({
            "success": True,
            "materials_count": len(materials_list),
            "total_cost": round(total_cost, 2),
            "projects_count": len(projects),
            "materials": materials_list
        }), 200

    except Exception as e:
        log.error(f"Error fetching Procurement BOQ materials: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch BOQ materials: {str(e)}"}), 500


def get_buyer_dashboard():
    """Get buyer dashboard statistics"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get projects where BOTH buyer AND site_supervisor (SE) are assigned
        # Admin sees all projects
        # ✅ PERFORMANCE FIX: Eager load BOQs (N+1 queries → 2)
        if user_role == 'admin':
            projects = Project.query.options(
                selectinload(Project.boqs)
            ).filter(
                Project.site_supervisor_id.isnot(None),
                Project.is_deleted == False
            ).all()
        else:
            projects = Project.query.options(
                selectinload(Project.boqs)
            ).filter(
                Project.buyer_id == buyer_id,
                Project.site_supervisor_id.isnot(None),
                Project.is_deleted == False
            ).all()

        pending_purchases = []
        total_cost = 0

        for project in projects:
            # Get BOQs for this project (no query - already loaded via selectinload)
            boqs = [boq for boq in project.boqs if not boq.is_deleted]

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
        log.error(f"Error fetching Procurement dashboard: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch dashboard: {str(e)}"}), 500


def get_buyer_pending_purchases():
    """Get approved change requests (extra materials) for buyer to purchase"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']

        # Get change requests for buyer:
        # 1. Under review AND approval_required_from='buyer' (pending buyer's review/acceptance)
        # 2. Assigned to this buyer (via assigned_to_buyer_user_id) - actively being worked on
        from sqlalchemy import or_, and_
        change_requests = ChangeRequest.query.filter(
            or_(
                and_(
                    ChangeRequest.status == 'under_review',
                    ChangeRequest.approval_required_from == 'buyer'
                ),
                and_(
                    ChangeRequest.status == 'assigned_to_buyer',
                    ChangeRequest.assigned_to_buyer_user_id == buyer_id
                )
            ),
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
                                    "total_price": material_total,
                                    "brand": material.get('brand'),
                                    "specification": material.get('specification')
                                })
                        else:
                            # Sub-item is the material itself
                            sub_total = float(sub_item.get('total_price', 0) or 0)
                            cr_total += sub_total
                            materials_list.append({
                                "material_name": sub_item.get('material_name', ''),
                                "sub_item_name": sub_item.get('sub_item_name', ''),
                                "quantity": sub_item.get('quantity', 0),
                                "unit": sub_item.get('unit', ''),
                                "unit_price": sub_item.get('unit_price', 0),
                                "total_price": sub_total,
                                "brand": sub_item.get('brand'),
                                "specification": sub_item.get('specification')
                            })
            else:
                # Legacy format: materials_data is direct array of materials
                for material in sub_items_data:
                    material_total = float(material.get('total_price', 0) or 0)
                    cr_total += material_total
                    materials_list.append({
                        "material_name": material.get('material_name', ''),
                        "sub_item_name": material.get('sub_item_name', ''),
                        "quantity": material.get('quantity', 0),
                        "unit": material.get('unit', ''),
                        "unit_price": material.get('unit_price', 0),
                        "total_price": material_total,
                        "brand": material.get('brand'),
                        "specification": material.get('specification')
                    })

            total_cost += cr_total

            # Get the first sub-item's sub_item_name for display (since all materials in a CR should be from same sub-item)
            first_sub_item_name = materials_list[0].get('sub_item_name', 'N/A') if materials_list else 'N/A'

            # Check if vendor selection is pending TD approval
            vendor_selection_pending_td_approval = (
                cr.vendor_selection_status == 'pending_td_approval'
            )

            # Get vendor phone from Vendor table if vendor is selected
            vendor_phone = None
            vendor_contact_person = None
            if cr.selected_vendor_id:
                from models.vendor import Vendor
                vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
                if vendor:
                    # Combine phone_code and phone if both exist
                    if vendor.phone_code and vendor.phone:
                        vendor_phone = f"{vendor.phone_code} {vendor.phone}"
                    elif vendor.phone:
                        vendor_phone = vendor.phone
                    vendor_contact_person = vendor.contact_person_name

            # Check if materials have been requested from store
            store_requests = InternalMaterialRequest.query.filter_by(cr_id=cr.cr_id).all()
            has_store_requests = len(store_requests) > 0

            # Check store request statuses
            all_store_requests_approved = False
            any_store_request_rejected = False
            store_requests_pending = False

            if has_store_requests:
                approved_count = sum(1 for r in store_requests if r.status == 'approved')
                rejected_count = sum(1 for r in store_requests if r.status == 'rejected')
                pending_count = sum(1 for r in store_requests if r.status in ['PENDING', 'send_request'])

                all_store_requests_approved = approved_count == len(store_requests)
                any_store_request_rejected = rejected_count > 0
                store_requests_pending = pending_count > 0

            pending_purchases.append({
                "cr_id": cr.cr_id,
                "project_id": project.project_id,
                "project_name": project.project_name,
                "project_code": project.project_code,
                "client": project.client or "Unknown Client",
                "location": project.location or "Unknown Location",
                "boq_id": cr.boq_id,
                "boq_name": boq.boq_name if boq else "Unknown",
                "item_name": cr.item_name or "N/A",
                "sub_item_name": first_sub_item_name,
                "request_type": cr.request_type or "EXTRA_MATERIALS",
                "reason": cr.justification or "",
                "materials": materials_list,
                "materials_count": len(materials_list),
                "total_cost": round(cr_total, 2),
                "approved_by": cr.approved_by_user_id,
                "approved_at": cr.approval_date.isoformat() if cr.approval_date else None,
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "vendor_id": cr.selected_vendor_id,
                "vendor_name": cr.selected_vendor_name,
                "vendor_phone": vendor_phone,
                "vendor_contact_person": vendor_contact_person,
                "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval,
                "vendor_email_sent": cr.vendor_email_sent or False,
                "has_store_requests": has_store_requests,
                "store_request_count": len(store_requests),
                "all_store_requests_approved": all_store_requests_approved,
                "any_store_request_rejected": any_store_request_rejected,
                "store_requests_pending": store_requests_pending
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
                                    "total_price": material_total,
                                    "brand": material.get('brand'),
                                    "specification": material.get('specification')
                                })
                        else:
                            sub_total = float(sub_item.get('total_price', 0) or 0)
                            cr_total += sub_total
                            materials_list.append({
                                "material_name": sub_item.get('material_name', ''),
                                "sub_item_name": sub_item.get('sub_item_name', ''),
                                "quantity": sub_item.get('quantity', 0),
                                "unit": sub_item.get('unit', ''),
                                "unit_price": sub_item.get('unit_price', 0),
                                "total_price": sub_total,
                                "brand": sub_item.get('brand'),
                                "specification": sub_item.get('specification')
                            })
            else:
                for material in sub_items_data:
                    material_total = float(material.get('total_price', 0) or 0)
                    cr_total += material_total
                    materials_list.append({
                        "material_name": material.get('material_name', ''),
                        "sub_item_name": material.get('sub_item_name', ''),
                        "quantity": material.get('quantity', 0),
                        "unit": material.get('unit', ''),
                        "unit_price": material.get('unit_price', 0),
                        "total_price": material_total,
                        "brand": material.get('brand'),
                        "specification": material.get('specification')
                    })

            total_cost += cr_total

            # Get the first sub-item's sub_item_name for display (since all materials in a CR should be from same sub-item)
            first_sub_item_name = materials_list[0].get('sub_item_name', 'N/A') if materials_list else 'N/A'

            # Check if vendor selection is pending TD approval
            vendor_selection_pending_td_approval = (
                cr.vendor_selection_status == 'pending_td_approval'
            )

            # Get vendor phone from Vendor table if vendor is selected
            vendor_phone = None
            vendor_contact_person = None
            if cr.selected_vendor_id:
                from models.vendor import Vendor
                vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
                if vendor:
                    # Combine phone_code and phone if both exist
                    if vendor.phone_code and vendor.phone:
                        vendor_phone = f"{vendor.phone_code} {vendor.phone}"
                    elif vendor.phone:
                        vendor_phone = vendor.phone
                    vendor_contact_person = vendor.contact_person_name

            completed_purchases.append({
                "cr_id": cr.cr_id,
                "project_id": project.project_id,
                "project_name": project.project_name,
                "project_code": project.project_code,
                "client": project.client or "Unknown Client",
                "location": project.location or "Unknown Location",
                "boq_id": cr.boq_id,
                "boq_name": boq.boq_name if boq else "Unknown",
                "item_name": cr.item_name or "N/A",
                "sub_item_name": first_sub_item_name,
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
                "purchase_notes": cr.purchase_notes,
                "vendor_id": cr.selected_vendor_id,
                "vendor_name": cr.selected_vendor_name,
                "vendor_phone": vendor_phone,
                "vendor_contact_person": vendor_contact_person,
                "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval
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

        # Get the actual database item_id (master_item_id) from item_name
        # cr.item_id contains BOQ-specific identifier like "item_587_2"
        # We need to find the master_item_id using the item_name from the change request
        database_item_id = None
        if cr.item_name:
            try:
                # Look up the master item by name in boq_items table
                from models.boq import MasterItem
                master_item = MasterItem.query.filter(
                    MasterItem.item_name == cr.item_name,
                    MasterItem.is_deleted == False
                ).first()

                if master_item:
                    database_item_id = master_item.item_id
                    log.info(f"Found database item_id {database_item_id} for item '{cr.item_name}'")
                else:
                    log.warning(f"Could not find master_item for item_name '{cr.item_name}'")
            except Exception as e:
                log.warning(f"Error looking up master_item: {e}")

        # Fallback: if item_id is already numeric, use it directly
        if not database_item_id and cr.item_id:
            try:
                database_item_id = int(cr.item_id) if isinstance(cr.item_id, str) and cr.item_id.isdigit() else cr.item_id
            except:
                pass

        # Save newly purchased materials to MasterMaterial table
        new_materials_added = []
        sub_items_data = cr.sub_items_data or cr.materials_data or []

        log.info(f"🔍 DEBUG: Processing {len(sub_items_data)} sub_items for CR-{cr_id}")
        log.info(f"🔍 DEBUG: cr.item_id = {cr.item_id}, database_item_id = {database_item_id}")

        for sub_item in sub_items_data:
            if isinstance(sub_item, dict):
                # Check if this sub-item has materials
                materials_list = sub_item.get('materials', [])

                # If no materials array, treat the sub_item itself as a material
                if not materials_list:
                    materials_list = [sub_item]

                for material in materials_list:
                    material_name = material.get('material_name', '').strip()

                    # Skip if no material name
                    if not material_name:
                        continue

                    # Check if material already exists in MasterMaterial
                    existing_material = MasterMaterial.query.filter_by(
                        material_name=material_name,
                        is_active=True
                    ).first()

                    # Only add if it's a NEW material
                    if not existing_material:
                        # Get sub_item_id and ensure it's an integer
                        # Priority: material data > sub_item data > change request column
                        raw_sub_item_id = material.get('sub_item_id') or sub_item.get('sub_item_id') or cr.sub_item_id
                        sub_item_id_int = None
                        if raw_sub_item_id:
                            try:
                                # If it's already an int, use it (sub_item_id is INTEGER in database)
                                if isinstance(raw_sub_item_id, int):
                                    sub_item_id_int = raw_sub_item_id
                                # If it's a string like "123", convert it
                                elif isinstance(raw_sub_item_id, str) and raw_sub_item_id.isdigit():
                                    sub_item_id_int = int(raw_sub_item_id)
                                else:
                                    log.warning(f"⚠️ sub_item_id has unexpected format: {raw_sub_item_id} (type: {type(raw_sub_item_id)})")
                            except Exception as e:
                                log.warning(f"❌ Could not parse sub_item_id '{raw_sub_item_id}': {e}")

                        # Fallback to change request sub_item_id if still None
                        if sub_item_id_int is None and cr.sub_item_id:
                            sub_item_id_int = cr.sub_item_id
                            log.info(f"   - Using cr.sub_item_id as fallback: {sub_item_id_int}")

                        # Log warning if sub_item_id is still None
                        if sub_item_id_int is None:
                            log.warning(f"⚠️ No valid sub_item_id found for material '{material_name}' in CR-{cr_id}")

                        log.info(f"🟢 Creating new material '{material_name}' with:")
                        log.info(f"   - item_id (database_item_id): {database_item_id}")
                        log.info(f"   - sub_item_id (parsed): {sub_item_id_int}")
                        log.info(f"   - raw_sub_item_id from payload: {raw_sub_item_id}")
                        log.info(f"   - brand: {material.get('brand', '')}")
                        log.info(f"   - specification: {material.get('specification', '')}")

                        new_material = MasterMaterial(
                            material_name=material_name,
                            item_id=database_item_id,  # Use the actual database item_id, not BOQ identifier
                            sub_item_id=sub_item_id_int,  # Ensure it's an integer or None
                            description=material.get('description', ''),
                            brand=material.get('brand', ''),
                            size=material.get('size', ''),
                            specification=material.get('specification', ''),
                            quantity=material.get('quantity', 0),
                            default_unit=material.get('unit', 'unit'),
                            current_market_price=material.get('unit_price', 0),
                            total_price=material.get('total_price', 0),
                            is_active=True,
                            created_at=datetime.utcnow(),
                            created_by=buyer_name,
                            last_modified_at=datetime.utcnow(),
                            last_modified_by=buyer_name
                        )
                        db.session.add(new_material)
                        new_materials_added.append(material_name)
                        log.info(f"✅ New material '{material_name}' added to MasterMaterial with item_id={database_item_id}, sub_item_id={sub_item_id_int} by buyer {buyer_id}")

        db.session.commit()

        # Send notification to CR creator about purchase completion
        try:
            if cr.requested_by_user_id:
                project_name = cr.project.project_name if cr.project else 'Unknown Project'
                notification_service.notify_cr_purchase_completed(
                    cr_id=cr_id,
                    project_name=project_name,
                    buyer_id=buyer_id,
                    buyer_name=buyer_name,
                    requester_user_id=cr.requested_by_user_id
                )
        except Exception as notif_error:
            log.error(f"Failed to send CR purchase completion notification: {notif_error}")

        if new_materials_added:
            log.info(f"Purchase CR-{cr_id} completed. Added {len(new_materials_added)} new materials: {', '.join(new_materials_added)}")
        else:
            log.info(f"Purchase CR-{cr_id} marked as complete by buyer {buyer_id}. No new materials added.")

        success_message = "Purchase marked as complete successfully"
        if new_materials_added:
            success_message += f". {len(new_materials_added)} new material(s) added to system"

        return jsonify({
            "success": True,
            "message": success_message,
            "purchase": {
                "cr_id": cr.cr_id,
                "status": cr.status,
                "purchase_completed_by_user_id": cr.purchase_completed_by_user_id,
                "purchase_completed_by_name": cr.purchase_completed_by_name,
                "purchase_completion_date": cr.purchase_completion_date.isoformat(),
                "purchase_notes": cr.purchase_notes,
                "new_materials_added": new_materials_added
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
                                "quantity": material.get('quantity') or 0,
                                "unit": material.get('unit', ''),
                                "unit_price": material.get('unit_price') or 0,
                                "total_price": material_total
                            })
                    else:
                        sub_total = float(sub_item.get('total_price', 0) or 0)
                        cr_total += sub_total
                        materials_list.append({
                            "material_name": sub_item.get('material_name', ''),
                            "sub_item_name": sub_item.get('sub_item_name', ''),
                            "quantity": sub_item.get('quantity') or 0,
                            "unit": sub_item.get('unit', ''),
                            "unit_price": sub_item.get('unit_price') or 0,
                            "total_price": sub_total
                        })
        else:
            for material in sub_items_data:
                material_total = float(material.get('total_price', 0) or 0)
                cr_total += material_total
                materials_list.append({
                    "material_name": material.get('material_name', ''),
                    "sub_item_name": material.get('sub_item_name', ''),
                    "quantity": material.get('quantity', 0),
                    "unit": material.get('unit', ''),
                    "unit_price": material.get('unit_price', 0),
                    "total_price": material_total
                })

        purchase_status = 'completed' if cr.status == 'purchase_completed' else 'pending'

        # Check if vendor selection is pending TD approval
        vendor_selection_pending_td_approval = (
            cr.vendor_selection_status == 'pending_td_approval'
        )

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
            "purchase_notes": cr.purchase_notes,
            "vendor_id": cr.selected_vendor_id,
            "vendor_name": cr.selected_vendor_name,
            "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval,
            "vendor_email_sent": cr.vendor_email_sent or False
        }

        # If vendor is selected, add vendor contact details (with overrides)
        if cr.selected_vendor_id:
            from models.vendor import Vendor
            vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
            if vendor:
                # Use vendor table values
                purchase["vendor_contact_person"] = vendor.contact_person_name
                purchase["vendor_phone"] = vendor.phone
                purchase["vendor_email"] = vendor.email
            else:
                # Fallback if vendor not found
                purchase["vendor_contact_person"] = None
                purchase["vendor_phone"] = None
                purchase["vendor_email"] = None
        

        return jsonify({
            "success": True,
            "purchase": purchase
        }), 200

    except Exception as e:
        log.error(f"Error fetching purchase {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch purchase: {str(e)}"}), 500


def select_vendor_for_purchase(cr_id):
    """Select vendor for purchase (requires TD approval)"""
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_id = data.get('vendor_id')

        if not vendor_id:
            return jsonify({"error": "Vendor ID is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']

        # Verify it's assigned to this buyer (skip check for TD)
        if not is_td and cr.assigned_to_buyer_user_id != user_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        if cr.status != 'assigned_to_buyer':
            return jsonify({"error": f"Cannot select vendor. Current status: {cr.status}"}), 400

        # Verify vendor exists
        from models.vendor import Vendor
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Verify vendor is active
        if vendor.status != 'active':
            return jsonify({"error": "Selected vendor is not active"}), 400

        # Update the change request with vendor selection
        cr.selected_vendor_id = vendor_id
        cr.selected_vendor_name = vendor.company_name
        cr.updated_at = datetime.utcnow()

        # Set status and fields based on user role
        if is_td:
            # TD is selecting/editing vendor - automatically approved
            cr.vendor_selection_status = 'approved'
            cr.vendor_approved_by_td_id = user_id
            cr.vendor_approved_by_td_name = user_name
            cr.vendor_approval_date = datetime.utcnow()
            # Keep buyer info if it exists
            if not cr.vendor_selected_by_buyer_id:
                cr.vendor_selected_by_buyer_id = user_id
                cr.vendor_selected_by_buyer_name = user_name
                cr.vendor_selection_date = datetime.utcnow()
        else:
            # Buyer is selecting vendor - needs TD approval
            cr.vendor_selected_by_buyer_id = user_id
            cr.vendor_selected_by_buyer_name = user_name
            cr.vendor_selection_date = datetime.utcnow()
            cr.vendor_selection_status = 'pending_td_approval'

        # Add to BOQ History - Vendor Selection
        from models.boq import BOQHistory
        from sqlalchemy.orm.attributes import flag_modified

        existing_history = BOQHistory.query.filter_by(boq_id=cr.boq_id).order_by(BOQHistory.action_date.desc()).first()

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

        # Create history action based on user role
        if is_td:
            new_action = {
                "role": "technical_director",
                "type": "change_request_vendor_approved",
                "sender": user_name,
                "receiver": "Buyer",
                "sender_role": "technical_director",
                "receiver_role": "buyer",
                "status": cr.status,
                "cr_id": cr_id,
                "item_name": cr.item_name or f"CR #{cr_id}",
                "materials_count": len(cr.materials_data) if cr.materials_data else 0,
                "total_cost": cr.materials_total_cost,
                "vendor_id": vendor_id,
                "vendor_name": vendor.company_name,
                "vendor_selection_status": "approved",
                "comments": f"TD selected and approved vendor '{vendor.company_name}' for purchase.",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": user_name,
                "sender_user_id": user_id,
                "project_name": cr.project.project_name if cr.project else None,
                "project_id": cr.project_id
            }
        else:
            new_action = {
                "role": "buyer",
                "type": "change_request_vendor_selected",
                "sender": user_name,
                "receiver": "Technical Director",
                "sender_role": "buyer",
                "receiver_role": "technical_director",
                "status": cr.status,
                "cr_id": cr_id,
                "item_name": cr.item_name or f"CR #{cr_id}",
                "materials_count": len(cr.materials_data) if cr.materials_data else 0,
                "total_cost": cr.materials_total_cost,
                "vendor_id": vendor_id,
                "vendor_name": vendor.company_name,
                "vendor_selection_status": "pending_td_approval",
                "comments": f"Buyer selected vendor '{vendor.company_name}' for purchase. Awaiting TD approval.",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": user_name,
                "sender_user_id": user_id,
                "project_name": cr.project.project_name if cr.project else None,
                "project_id": cr.project_id
            }

        current_actions.append(new_action)
        log.info(f"Appending change_request_vendor_selected action to BOQ {cr.boq_id} history")

        # Update history entry based on user role
        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = user_name
            existing_history.sender = user_name

            if is_td:
                existing_history.receiver = "Buyer"
                existing_history.comments = f"CR #{cr_id} vendor approved by TD"
                existing_history.sender_role = 'technical_director'
                existing_history.receiver_role = 'buyer'
            else:
                existing_history.receiver = "Technical Director"
                existing_history.comments = f"CR #{cr_id} vendor selected, pending TD approval"
                existing_history.sender_role = 'buyer'
                existing_history.receiver_role = 'technical_director'

            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            if is_td:
                boq_history = BOQHistory(
                    boq_id=cr.boq_id,
                    action=current_actions,
                    action_by=user_name,
                    boq_status=cr.boq.status if cr.boq else 'unknown',
                    sender=user_name,
                    receiver="Buyer",
                    comments=f"CR #{cr_id} vendor approved by TD",
                    sender_role='technical_director',
                    receiver_role='buyer',
                    action_date=datetime.utcnow(),
                    created_by=user_name
                )
            else:
                boq_history = BOQHistory(
                    boq_id=cr.boq_id,
                    action=current_actions,
                    action_by=user_name,
                    boq_status=cr.boq.status if cr.boq else 'unknown',
                    sender=user_name,
                    receiver="Technical Director",
                    comments=f"CR #{cr_id} vendor selected",
                    sender_role='buyer',
                    receiver_role='technical_director',
                    action_date=datetime.utcnow(),
                    created_by=user_name
                )
            db.session.add(boq_history)

        db.session.commit()

        # Send notification when buyer selects vendor (needs TD approval)
        try:
            if not is_td:  # Only notify TD when buyer selects vendor
                # Get TD users
                td_role = Role.query.filter_by(role_name='Technical Director').first()
                if not td_role:
                    td_role = Role.query.filter(Role.role.ilike('%technical%director%')).first()

                if td_role:
                    tds = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                    if tds:
                        td_user_id = tds[0].user_id
                        project_name = cr.project.project_name if cr.project else 'Unknown Project'
                        notification_service.notify_vendor_selected_for_cr(
                            cr_id=cr_id,
                            project_name=project_name,
                            buyer_id=user_id,
                            buyer_name=user_name,
                            td_user_id=td_user_id,
                            vendor_name=vendor.company_name
                        )
        except Exception as notif_error:
            log.error(f"Failed to send vendor selection notification: {notif_error}")

        # Log and return response based on user role
        if is_td:
            log.info(f"Vendor {vendor_id} selected and approved for purchase CR-{cr_id} by TD {user_id}")
            return jsonify({
                "success": True,
                "message": "Vendor selection saved and approved",
                "purchase": {
                    "cr_id": cr.cr_id,
                    "selected_vendor_id": cr.selected_vendor_id,
                    "selected_vendor_name": cr.selected_vendor_name,
                    "vendor_selection_status": cr.vendor_selection_status,
                    "vendor_selection_date": cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None
                }
            }), 200
        else:
            log.info(f"Vendor {vendor_id} selected for purchase CR-{cr_id} by buyer {user_id}, pending TD approval")
            return jsonify({
                "success": True,
                "message": "Vendor selection sent to TD for approval",
                "purchase": {
                    "cr_id": cr.cr_id,
                    "selected_vendor_id": cr.selected_vendor_id,
                    "selected_vendor_name": cr.selected_vendor_name,
                    "vendor_selection_status": cr.vendor_selection_status,
                    "vendor_selection_date": cr.vendor_selection_date.isoformat()
                }
            }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error selecting vendor for purchase: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to select vendor: {str(e)}"}), 500


def update_purchase_order(cr_id):
    """Update purchase order materials and costs"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']

        data = request.get_json()
        materials = data.get('materials')
        total_cost = data.get('total_cost')

        if not materials or total_cost is None:
            return jsonify({"error": "Materials and total cost are required"}), 400

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

        # Verify it's in the correct status (can only edit pending purchases)
        if cr.status != 'assigned_to_buyer':
            return jsonify({"error": f"Cannot edit purchase. Current status: {cr.status}"}), 400

        # Validate materials structure
        if not isinstance(materials, list):
            return jsonify({"error": "Materials must be an array"}), 400

        # Update materials in sub_items_data format
        updated_materials = []
        for material in materials:
            updated_materials.append({
                "material_name": material.get('material_name', ''),
                "sub_item_name": material.get('sub_item_name', ''),
                "quantity": float(material.get('quantity', 0)),
                "unit": material.get('unit', ''),
                "unit_price": float(material.get('unit_price', 0)),
                "total_price": float(material.get('total_price', 0))
            })

        # Update the change request
        cr.sub_items_data = updated_materials
        cr.materials_total_cost = float(total_cost)
        cr.updated_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Purchase order CR-{cr_id} updated by buyer {buyer_id}")

        return jsonify({
            "success": True,
            "message": "Purchase order updated successfully",
            "purchase": {
                "cr_id": cr.cr_id,
                "materials": cr.sub_items_data,
                "total_cost": cr.materials_total_cost
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating purchase order: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update purchase order: {str(e)}"}), 500


def update_purchase_notes(cr_id):
    """Update purchase notes"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']

        data = request.get_json()
        notes = data.get('notes', '')

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify it's assigned to this buyer or completed by this buyer
        if cr.assigned_to_buyer_user_id != buyer_id and cr.purchase_completed_by_user_id != buyer_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Update notes
        cr.purchase_notes = notes
        cr.updated_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Purchase notes updated for CR-{cr_id} by buyer {buyer_id}")

        return jsonify({
            "success": True,
            "message": "Purchase notes updated successfully",
            "purchase": {
                "cr_id": cr.cr_id,
                "purchase_notes": cr.purchase_notes
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating purchase notes: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update notes: {str(e)}"}), 500


def td_approve_vendor(cr_id):
    """TD approves vendor selection for purchase"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify vendor selection is pending approval
        if cr.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {cr.vendor_selection_status}"}), 400

        # Approve the vendor selection
        cr.vendor_selection_status = 'approved'
        cr.vendor_approved_by_td_id = td_id
        cr.vendor_approved_by_td_name = td_name
        cr.vendor_approval_date = datetime.utcnow()
        cr.updated_at = datetime.utcnow()

        # Add to BOQ History - TD Vendor Approval
        from models.boq import BOQHistory
        from sqlalchemy.orm.attributes import flag_modified

        existing_history = BOQHistory.query.filter_by(boq_id=cr.boq_id).order_by(BOQHistory.action_date.desc()).first()

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

        new_action = {
            "role": "technical_director",
            "type": "change_request_vendor_approved_by_td",
            "sender": td_name,
            "receiver": cr.vendor_selected_by_buyer_name or "Buyer",
            "sender_role": "technical_director",
            "receiver_role": "buyer",
            "status": cr.status,
            "cr_id": cr_id,
            "item_name": cr.item_name or f"CR #{cr_id}",
            "materials_count": len(cr.materials_data) if cr.materials_data else 0,
            "total_cost": cr.materials_total_cost,
            "vendor_id": cr.selected_vendor_id,
            "vendor_name": cr.selected_vendor_name,
            "vendor_selection_status": "approved",
            "comments": f"TD approved vendor selection: '{cr.selected_vendor_name}'. Buyer can proceed with purchase.",
            "timestamp": datetime.utcnow().isoformat(),
            "sender_name": td_name,
            "sender_user_id": td_id,
            "project_name": cr.project.project_name if cr.project else None,
            "project_id": cr.project_id
        }

        current_actions.append(new_action)
        log.info(f"Appending change_request_vendor_approved_by_td action to BOQ {cr.boq_id} history")

        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = td_name
            existing_history.sender = td_name
            existing_history.receiver = cr.vendor_selected_by_buyer_name or "Buyer"
            existing_history.comments = f"CR #{cr_id} vendor approved by TD"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = td_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            boq_history = BOQHistory(
                boq_id=cr.boq_id,
                action=current_actions,
                action_by=td_name,
                boq_status=cr.boq.status if cr.boq else 'unknown',
                sender=td_name,
                receiver=cr.vendor_selected_by_buyer_name or "Buyer",
                comments=f"CR #{cr_id} vendor approved by TD",
                sender_role='technical_director',
                receiver_role='buyer',
                action_date=datetime.utcnow(),
                created_by=td_name
            )
            db.session.add(boq_history)

        db.session.commit()

        log.info(f"Vendor selection for CR-{cr_id} approved by TD {td_id}")

        # Send notification to buyer about vendor approval
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            if cr.created_by:
                notification = NotificationManager.create_notification(
                    user_id=cr.created_by,
                    type='approval',
                    title='Vendor Selection Approved',
                    message=f'TD approved vendor "{cr.selected_vendor_name}" for CR: {cr.item_name or "Change Request"}',
                    priority='high',
                    category='vendor',
                    action_url=f'/buyer/change-requests/{cr_id}',
                    action_label='Proceed with Purchase',
                    metadata={
                        'cr_id': str(cr_id),
                        'vendor_name': cr.selected_vendor_name,
                        'vendor_id': str(cr.selected_vendor_id) if cr.selected_vendor_id else None,
                        'item_name': cr.item_name
                    },
                    sender_id=td_id,
                    sender_name=td_name
                )
                send_notification_to_user(cr.created_by, notification.to_dict())
                log.info(f"Sent vendor approval notification to buyer {cr.created_by}")
        except Exception as notif_error:
            log.error(f"Failed to send vendor approval notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection approved successfully",
            "purchase": {
                "cr_id": cr.cr_id,
                "vendor_selection_status": cr.vendor_selection_status,
                "vendor_approved_by_td_id": cr.vendor_approved_by_td_id,
                "vendor_approved_by_td_name": cr.vendor_approved_by_td_name,
                "vendor_approval_date": cr.vendor_approval_date.isoformat()
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to approve vendor: {str(e)}"}), 500


def td_reject_vendor(cr_id):
    """TD rejects vendor selection for purchase"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        data = request.get_json()
        reason = data.get('reason', '')

        if not reason:
            return jsonify({"error": "Rejection reason is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Verify vendor selection is pending approval
        if cr.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {cr.vendor_selection_status}"}), 400

        # Reject the vendor selection - clear vendor and allow buyer to select again
        cr.vendor_selection_status = 'rejected'
        cr.vendor_approved_by_td_id = td_id
        cr.vendor_approved_by_td_name = td_name
        cr.vendor_approval_date = datetime.utcnow()
        cr.vendor_rejection_reason = reason

        # Clear vendor selection so buyer can select new vendor
        cr.selected_vendor_id = None
        cr.selected_vendor_name = None
        cr.vendor_selected_by_buyer_id = None
        cr.vendor_selected_by_buyer_name = None
        cr.vendor_selection_date = None

        cr.updated_at = datetime.utcnow()

        db.session.commit()

        log.info(f"Vendor selection for CR-{cr_id} rejected by TD {td_id}: {reason}")

        # Send notification to buyer about vendor rejection
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            if cr.created_by:
                notification = NotificationManager.create_notification(
                    user_id=cr.created_by,
                    type='rejection',
                    title='Vendor Selection Rejected',
                    message=f'TD rejected vendor selection for CR: {cr.item_name or "Change Request"}. Reason: {reason}',
                    priority='high',
                    category='vendor',
                    action_required=True,
                    action_url=f'/buyer/change-requests/{cr_id}',
                    action_label='Select New Vendor',
                    metadata={
                        'cr_id': str(cr_id),
                        'rejection_reason': reason,
                        'item_name': cr.item_name
                    },
                    sender_id=td_id,
                    sender_name=td_name
                )
                send_notification_to_user(cr.created_by, notification.to_dict())
                log.info(f"Sent vendor rejection notification to buyer {cr.created_by}")
        except Exception as notif_error:
            log.error(f"Failed to send vendor rejection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection rejected",
            "purchase": {
                "cr_id": cr.cr_id,
                "vendor_selection_status": cr.vendor_selection_status,
                "vendor_rejection_reason": cr.vendor_rejection_reason
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to reject vendor: {str(e)}"}), 500


def preview_vendor_email(cr_id):
    """Preview vendor purchase order email"""
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

        # Check if vendor is selected
        if not cr.selected_vendor_id:
            return jsonify({"error": "No vendor selected for this purchase"}), 400

        # Get vendor details
        from models.vendor import Vendor
        vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Get project details
        project = Project.query.get(cr.project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get BOQ details
        boq = BOQ.query.filter_by(boq_id=cr.boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get buyer details
        buyer = User.query.filter_by(user_id=buyer_id).first()

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
                                "quantity": material.get('quantity') or 0,
                                "unit": material.get('unit', ''),
                                "unit_price": material.get('unit_price') or 0,
                                "total_price": material_total
                            })
                    else:
                        sub_total = float(sub_item.get('total_price', 0) or 0)
                        cr_total += sub_total
                        materials_list.append({
                            "material_name": sub_item.get('material_name', ''),
                            "sub_item_name": sub_item.get('sub_item_name', ''),
                            "quantity": sub_item.get('quantity') or 0,
                            "unit": sub_item.get('unit', ''),
                            "unit_price": sub_item.get('unit_price') or 0,
                            "total_price": sub_total
                        })
        else:
            for material in sub_items_data:
                material_total = float(material.get('total_price', 0) or 0)
                cr_total += material_total
                materials_list.append({
                    "material_name": material.get('material_name', ''),
                    "sub_item_name": material.get('sub_item_name', ''),
                    "quantity": material.get('quantity', 0),
                    "unit": material.get('unit', ''),
                    "unit_price": material.get('unit_price', 0),
                    "total_price": material_total
                })

        # Prepare data for email template
        vendor_data = {
            'company_name': vendor.company_name or 'N/A',
            'contact_person_name': vendor.contact_person_name or '',
            'email': vendor.email or 'N/A'
        }

        purchase_data = {
            'cr_id': cr.cr_id,
            'materials': materials_list,
            'total_cost': round(cr_total, 2),
            'file_bath' : cr.file_path
        }

        buyer_data = {
            'buyer_name': (buyer.full_name if buyer and buyer.full_name else None) or 'Procurement Team',
            'buyer_email': (buyer.email if buyer and buyer.email else None) or 'N/A',
            'buyer_phone': (buyer.phone if buyer and buyer.phone else None) or 'N/A'
        }

        project_data = {
            'project_name': project.project_name or 'N/A',
            'client': project.client or 'N/A',
            'location': project.location or 'N/A'
        }

        # Get uploaded files information
        uploaded_files = []
        if cr.file_path:
            filenames = [f.strip() for f in cr.file_path.split(",") if f.strip()]
            for filename in filenames:
                file_path = f"buyer/cr_{cr_id}/{filename}"
                file_size = None

                # Try to get file size from Supabase
                try:
                    file_response = supabase.storage.from_(SUPABASE_BUCKET).download(file_path)
                    if file_response:
                        file_size = len(file_response)
                except Exception as e:
                    log.warning(f"Could not get file size for {filename}: {str(e)}")

                uploaded_files.append({
                    "filename": filename,
                    "path": file_path,
                    "size_bytes": file_size,
                    "size_mb": round(file_size / (1024 * 1024), 2) if file_size else None,
                    "public_url": f"{supabase_url}/storage/v1/object/public/{SUPABASE_BUCKET}/{file_path}"
                })

        # Generate email preview
        from utils.boq_email_service import BOQEmailService
        email_service = BOQEmailService()
        email_html = email_service.generate_vendor_purchase_order_email(
            vendor_data, purchase_data, buyer_data, project_data
        )

        # Use vendor table values and include uploaded files
        return jsonify({
            "success": True,
            "email_preview": email_html,
            "vendor_email": vendor.email,
            "vendor_name": vendor.company_name,
            "vendor_contact_person": vendor.contact_person_name,
            "vendor_phone": vendor.phone,
            "uploaded_files": uploaded_files,
            "total_attachments": len(uploaded_files)
        }), 200

    except Exception as e:
        log.error(f"Error generating email preview: {str(e)}")
        return jsonify({"error": f"Failed to generate email preview: {str(e)}"}), 500


def send_vendor_email(cr_id):
    """Send purchase order email to vendor"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']

        data = request.get_json()
        vendor_email = data.get('vendor_email')
        custom_email_body = data.get('custom_email_body')
        custom_email_body = data.get('custom_email_body')  # Optional custom HTML body
        vendor_company_name = data.get('vendor_company_name')  # Update company name
        vendor_contact_person = data.get('vendor_contact_person')  # Update contact person
        vendor_phone = data.get('vendor_phone')  # Update phone

        if not vendor_email:
            return jsonify({"error": "Vendor email is required"}), 400

        # Parse comma-separated emails
        import re
        email_list = [email.strip() for email in vendor_email.split(',') if email.strip()]

        # Validate each email
        email_regex = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
        invalid_emails = [email for email in email_list if not email_regex.match(email)]

        if invalid_emails:
            return jsonify({"error": f"Invalid email address: {invalid_emails[0]}"}), 400

        if not email_list:
            return jsonify({"error": "At least one valid email address is required"}), 400

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

        # Verify vendor is selected and approved
        if not cr.selected_vendor_id:
            return jsonify({"error": "No vendor selected for this purchase"}), 400

        if cr.vendor_selection_status != 'approved':
            return jsonify({"error": "Vendor selection must be approved by TD before sending email"}), 400

        # Get vendor details
        from models.vendor import Vendor
        vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Update vendor details in vendors table if provided
        if vendor_company_name and vendor_company_name != vendor.company_name:
            vendor.company_name = vendor_company_name
        if vendor_contact_person and vendor_contact_person != vendor.contact_person_name:
            vendor.contact_person_name = vendor_contact_person
        if vendor_phone and vendor_phone != vendor.phone:
            # Sanitize phone number: remove duplicate country codes and limit to 20 chars
            sanitized_phone = vendor_phone.strip()
            # Remove duplicate +971 prefixes
            while sanitized_phone.count('+971') > 1:
                sanitized_phone = sanitized_phone.replace('+971 ', '', 1)
            # Limit to 20 characters to fit database constraint
            sanitized_phone = sanitized_phone[:20]
            vendor.phone = sanitized_phone
        if vendor_email and vendor_email != vendor.email:
            vendor.email = vendor_email

        # Get buyer details
        buyer = User.query.filter_by(user_id=buyer_id).first()
        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

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
                                "quantity": material.get('quantity') or 0,
                                "unit": material.get('unit', ''),
                                "unit_price": material.get('unit_price') or 0,
                                "total_price": material_total
                            })
                    else:
                        sub_total = float(sub_item.get('total_price', 0) or 0)
                        cr_total += sub_total
                        materials_list.append({
                            "material_name": sub_item.get('material_name', ''),
                            "sub_item_name": sub_item.get('sub_item_name', ''),
                            "quantity": sub_item.get('quantity') or 0,
                            "unit": sub_item.get('unit', ''),
                            "unit_price": sub_item.get('unit_price') or 0,
                            "total_price": sub_total
                        })
        else:
            for material in sub_items_data:
                material_total = float(material.get('total_price', 0) or 0)
                cr_total += material_total
                materials_list.append({
                    "material_name": material.get('material_name', ''),
                    "sub_item_name": material.get('sub_item_name', ''),
                    "quantity": material.get('quantity', 0),
                    "unit": material.get('unit', ''),
                    "unit_price": material.get('unit_price', 0),
                    "total_price": material_total
                })

        # Prepare data for email template
        vendor_data = {
            'company_name': vendor.company_name,
            'contact_person_name': vendor.contact_person_name,
            'email': email_list[0]  # Primary email for display
        }

        purchase_data = {
            'cr_id': cr.cr_id,
            'materials': materials_list,
            'total_cost': round(cr_total, 2)
        }

        buyer_data = {
            'buyer_name': (buyer.full_name if buyer and buyer.full_name else None) or 'Procurement Team',
            'buyer_email': (buyer.email if buyer and buyer.email else None) or 'N/A',
            'buyer_phone': (buyer.phone if buyer and buyer.phone else None) or 'N/A'
        }

        project_data = {
            'project_name': project.project_name or 'N/A',
            'client': project.client or 'N/A',
            'location': project.location or 'N/A'
        }

        # Fetch uploaded files from Supabase if available
        attachments = []
        if cr.file_path:
            try:
                # Parse file paths from database
                filenames = [f.strip() for f in cr.file_path.split(",") if f.strip()]

                for filename in filenames:
                    try:
                        # Build the full path in Supabase storage
                        file_path = f"buyer/cr_{cr_id}/{filename}"

                        # Download file from Supabase
                        file_response = supabase.storage.from_(SUPABASE_BUCKET).download(file_path)

                        if file_response:
                            # Determine MIME type based on file extension
                            ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
                            mime_types = {
                                # Documents
                                'pdf': 'application/pdf',
                                'doc': 'application/msword',
                                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                'xls': 'application/vnd.ms-excel',
                                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                'ppt': 'application/vnd.ms-powerpoint',
                                'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                                'csv': 'text/csv',
                                # Images
                                'png': 'image/png',
                                'jpg': 'image/jpeg',
                                'jpeg': 'image/jpeg',
                                'gif': 'image/gif',
                                'bmp': 'image/bmp',
                                'tiff': 'image/tiff',
                                'svg': 'image/svg+xml',
                                'webp': 'image/webp',
                                # Text
                                'txt': 'text/plain',
                                # Archives
                                'zip': 'application/zip',
                                'rar': 'application/x-rar-compressed',
                                '7z': 'application/x-7z-compressed',
                                # CAD files
                                'dwg': 'application/acad',
                                'dxf': 'application/dxf',
                                'dwf': 'application/x-dwf',
                                'dgn': 'application/x-dgn',
                                'rvt': 'application/octet-stream',
                                'rfa': 'application/octet-stream',
                                'nwd': 'application/octet-stream',
                                'nwc': 'application/octet-stream',
                                'ifc': 'application/x-step',
                                'sat': 'application/x-sat',
                                'step': 'application/x-step',
                                'stp': 'application/x-step',
                                'iges': 'application/iges',
                                'igs': 'application/iges',
                                # 3D files
                                'skp': 'application/vnd.sketchup.skp',
                                'obj': 'text/plain',
                                'fbx': 'application/octet-stream',
                                '3ds': 'application/x-3ds',
                                'stl': 'model/stl',
                                'ply': 'text/plain',
                                'dae': 'model/vnd.collada+xml'
                            }
                            mime_type = mime_types.get(ext, 'application/octet-stream')

                            # Add to attachments list
                            attachments.append((filename, file_response, mime_type))
                            log.info(f"Added attachment: {filename} for CR-{cr_id}")
                        else:
                            log.warning(f"Could not download file: {filename} for CR-{cr_id}")

                    except Exception as e:
                        log.error(f"Error downloading file {filename}: {str(e)}")
                        # Continue with other files even if one fails
                        continue

                if attachments:
                    log.info(f"Prepared {len(attachments)} attachments for CR-{cr_id}")

            except Exception as e:
                log.error(f"Error processing attachments for CR-{cr_id}: {str(e)}")
        # Continue sending email even if attachments fail
        # Send email to vendor(s) (with optional custom body)
        # ✅ PERFORMANCE FIX: Use async email sending (15s → 0.1s response time)
        from utils.boq_email_service import BOQEmailService
        email_service = BOQEmailService()
        email_sent = email_service.send_vendor_purchase_order_async(
            email_list, vendor_data, purchase_data, buyer_data, project_data, custom_email_body, attachments
        )

        if email_sent:
            # Mark email as sent
            cr.vendor_email_sent = True
            cr.vendor_email_sent_date = datetime.utcnow()
            cr.vendor_email_sent_by_user_id = buyer_id
            cr.updated_at = datetime.utcnow()
            db.session.commit()

            recipients_str = ', '.join(email_list)
            log.info(f"Purchase order email sent to vendor(s) {recipients_str} for CR-{cr_id}")
            message = f"Purchase order email sent to {len(email_list)} recipient(s) successfully" if len(email_list) > 1 else "Purchase order email sent to vendor successfully"
            # Count recipients for response message
            if isinstance(vendor_email, str):
                recipient_count = len([e.strip() for e in vendor_email.split(',') if e.strip()])
            else:
                recipient_count = len(vendor_email) if isinstance(vendor_email, list) else 1

            log.info(f"Purchase order email sent to {recipient_count} vendor(s) for CR-{cr_id}")
            return jsonify({
                "success": True,
                "message": f"Purchase order email sent to {recipient_count} recipient(s) successfully"
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": "Failed to send email to vendor"
            }), 500

    except Exception as e:
        log.error(f"Error sending vendor email: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to send vendor email: {str(e)}"}), 500


def send_vendor_whatsapp(cr_id):
    """Send purchase order via WhatsApp to vendor"""
    try:
        from utils.whatsapp_service import WhatsAppService
        from datetime import datetime

        current_user = g.user
        buyer_id = current_user['user_id']

        data = request.get_json()
        vendor_phone = data.get('vendor_phone')

        if not vendor_phone:
            return jsonify({"error": "Vendor phone number is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase order not found"}), 404

        if not cr.selected_vendor_id:
            return jsonify({"error": "No vendor selected for this purchase"}), 400

        if cr.vendor_selection_status != 'approved':
            return jsonify({"error": "Vendor selection must be approved by TD before sending WhatsApp"}), 400

        # Get vendor details
        from models.vendor import Vendor
        vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Get buyer details
        buyer = User.query.filter_by(user_id=buyer_id).first()
        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        # Get project details
        project = Project.query.filter_by(project_id=cr.project_id, is_deleted=False).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get materials for this change request (stored as JSON)
        sub_items_data = cr.sub_items_data or cr.materials_data or []
        materials_list = []
        for sub_item in sub_items_data:
            materials = sub_item.get('materials', [])
            for m in materials:
                materials_list.append({
                    'material_name': m.get('material_name', 'N/A'),
                    'brand': m.get('brand', ''),
                    'specification': m.get('specification', ''),
                    'quantity': m.get('quantity', 0),
                    'unit': m.get('unit', '')
                })

        # Prepare data for message generation
        vendor_data = {
            'company_name': vendor.company_name or 'N/A',
            'contact_person_name': vendor.contact_person_name or '',
            'phone': vendor_phone
        }

        purchase_data = {
            'cr_id': cr_id,
            'date': datetime.utcnow().strftime('%d/%m/%Y'),
            'materials': materials_list
        }

        buyer_data = {
            'name': buyer.full_name or buyer.username or 'Buyer',
            'email': buyer.email or '',
            'phone': buyer.phone or ''
        }

        project_data = {
            'project_name': project.project_name,
            'location': project.location or ''
        }

        # Send WhatsApp message with interactive buttons
        whatsapp_service = WhatsAppService()
        result = whatsapp_service.send_purchase_order(
            phone_number=vendor_phone,
            vendor_data=vendor_data,
            purchase_data=purchase_data,
            buyer_data=buyer_data,
            project_data=project_data
        )

        if result.get('success'):
            # Update the change request to mark WhatsApp as sent
            cr.vendor_whatsapp_sent = True
            cr.vendor_whatsapp_sent_at = datetime.utcnow()
            cr.updated_at = datetime.utcnow()
            db.session.commit()

            log.info(f"Purchase order WhatsApp sent to vendor {vendor_phone} for CR-{cr_id}")
            return jsonify({
                "success": True,
                "message": "Purchase order sent via WhatsApp successfully"
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": result.get('message', 'Failed to send WhatsApp message'),
                "debug": result.get('debug', {})
            }), 500

    except Exception as e:
        log.error(f"Error sending vendor WhatsApp: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to send vendor WhatsApp: {str(e)}"}), 500


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

        log.info(f"User {user_id} ({user_role}) selected vendor {vendor_id} for SE BOQ assignment {assignment_id}")

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

        log.info(f"TD {td_id} approved vendor for SE BOQ assignment {assignment_id}")

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
                    action_url=f'/buyer/se-boq-assignments/{assignment_id}',
                    action_label='Proceed with Purchase',
                    metadata={
                        'assignment_id': str(assignment_id),
                        'vendor_name': assignment.selected_vendor_name,
                        'boq_id': str(assignment.boq_id) if assignment.boq_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name
                )
                send_notification_to_user(assignment.assigned_to_buyer_id, buyer_notification.to_dict())
                log.info(f"Sent SE BOQ vendor approval notification to buyer {assignment.assigned_to_buyer_id}")

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
                log.info(f"Sent SE BOQ vendor approval notification to site engineer {assignment.site_engineer_id}")

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

        log.info(f"TD {td_id} rejected vendor for SE BOQ assignment {assignment_id}")

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
                    action_url=f'/buyer/se-boq-assignments/{assignment_id}',
                    action_label='Select New Vendor',
                    metadata={
                        'assignment_id': str(assignment_id),
                        'rejected_vendor_name': rejected_vendor_name,
                        'rejection_reason': rejection_reason,
                        'boq_id': str(assignment.boq_id) if assignment.boq_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name
                )
                send_notification_to_user(assignment.assigned_to_buyer_id, buyer_notification.to_dict())
                log.info(f"Sent SE BOQ vendor rejection notification to buyer {assignment.assigned_to_buyer_id}")

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
                log.info(f"Sent SE BOQ vendor rejection notification to site engineer {assignment.site_engineer_id}")

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

        log.info(f"Buyer {buyer_id} completed purchase for SE BOQ assignment {assignment_id}")

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
        # ✅ PERFORMANCE FIX: Use async email sending (15s → 0.1s response time)
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

            log.info(f"SE BOQ purchase order email sent to vendor {vendor_email} for assignment {assignment_id}")
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


# Store Management Functions
def get_store_items():
    """Get all available store items from inventory"""
    try:
        # Query real inventory data from InventoryMaterial table
        materials = InventoryMaterial.query.filter_by(is_active=True).all()

        store_items = []
        for material in materials:
            store_items.append({
                'id': material.inventory_material_id,
                'name': material.material_name,
                'description': material.description or f'{material.material_name} - {material.brand or ""}',
                'category': material.category or 'General',
                'price': material.unit_price or 0,
                'unit': material.unit,
                'available_quantity': material.current_stock or 0,
                'supplier_name': 'M2 Store',
                'supplier_location': 'Warehouse',
                'delivery_time_days': 1,
                'rating': 4.5,
                'specifications': {
                    'material_code': material.material_code,
                    'brand': material.brand or 'N/A',
                    'size': material.size or 'N/A'
                }
            })

        log.info(f"Retrieved {len(store_items)} store items from inventory")
        return jsonify(store_items), 200

    except Exception as e:
        log.error(f"Error getting store items: {str(e)}")
        return jsonify({"error": f"Failed to get store items: {str(e)}"}), 500


def get_store_item_details(item_id):
    """Get details of a specific store item"""
    try:
        # Query real inventory data
        material = InventoryMaterial.query.get(item_id)

        if not material:
            return jsonify({"error": "Item not found"}), 404

        item = {
            'id': material.inventory_material_id,
            'name': material.material_name,
            'description': material.description or f'{material.material_name} - {material.brand or ""}',
            'category': material.category or 'General',
            'price': material.unit_price or 0,
            'unit': material.unit,
            'available_quantity': material.current_stock or 0,
            'supplier_name': 'M2 Store',
            'supplier_location': 'Warehouse',
            'delivery_time_days': 1,
            'rating': 4.5,
            'specifications': {
                'material_code': material.material_code,
                'brand': material.brand or 'N/A',
                'size': material.size or 'N/A'
            },
            'images': [],
            'certifications': []
        }

        log.info(f"Retrieved details for store item {item_id}")
        return jsonify(item), 200

    except Exception as e:
        log.error(f"Error getting store item details: {str(e)}")
        return jsonify({"error": f"Failed to get item details: {str(e)}"}), 500


def get_store_categories():
    """Get all store categories from inventory"""
    try:
        # Query unique categories from inventory with item counts
        from sqlalchemy import func
        category_counts = db.session.query(
            InventoryMaterial.category,
            func.count(InventoryMaterial.inventory_material_id).label('items_count')
        ).filter(
            InventoryMaterial.is_active == True,
            InventoryMaterial.category.isnot(None)
        ).group_by(InventoryMaterial.category).all()

        categories = []
        for idx, (category, count) in enumerate(category_counts):
            categories.append({
                'id': idx + 1,
                'name': category or 'General',
                'items_count': count
            })

        log.info(f"Retrieved {len(categories)} store categories from inventory")
        return jsonify(categories), 200

    except Exception as e:
        log.error(f"Error getting store categories: {str(e)}")
        return jsonify({"error": f"Failed to get categories: {str(e)}"}), 500


def get_projects_by_material(material_id):
    """Get projects with pending Change Requests containing this material, including CR details"""
    try:
        # Get the material name from inventory
        material = InventoryMaterial.query.get(material_id)
        if not material:
            return jsonify([]), 200

        material_name = material.material_name.lower()

        # Completed statuses for Change Requests
        completed_statuses = ['completed', 'purchase_completed', 'rejected']

        # Get Change Requests that contain this material and are not completed
        from sqlalchemy import cast, String
        change_requests = ChangeRequest.query.filter(
            ChangeRequest.status.notin_(completed_statuses),
            db.or_(
                cast(ChangeRequest.materials_data, String).ilike(f'%{material.material_name}%'),
                cast(ChangeRequest.sub_items_data, String).ilike(f'%{material.material_name}%')
            )
        ).all()

        if not change_requests:
            log.info(f"No pending CRs found for material '{material.material_name}'")
            return jsonify([]), 200

        # Get CRs that already have active requests for this material
        existing_requests = InternalMaterialRequest.query.filter(
            InternalMaterialRequest.inventory_material_id == material_id,
            InternalMaterialRequest.cr_id.isnot(None),
            InternalMaterialRequest.status.in_(['PENDING', 'send_request', 'approved'])
        ).all()
        # Map cr_id to request status
        crs_with_active_requests = {req.cr_id: req.status for req in existing_requests}

        # Build project list with CR details
        projects_list = []
        for cr in change_requests:
            # Get project info
            project = Project.query.get(cr.project_id)
            if not project or project.is_deleted:
                continue

            # Check if this CR already has an active request
            has_active_request = cr.cr_id in crs_with_active_requests
            active_request_status = crs_with_active_requests.get(cr.cr_id)

            # Extract quantity and unit from materials_data
            quantity = 0
            unit = material.unit or 'nos'

            # Check materials_data
            materials = cr.materials_data or cr.sub_items_data or []
            if isinstance(materials, list):
                for mat in materials:
                    mat_name = (mat.get('material_name') or mat.get('name') or '').lower()
                    if material_name in mat_name or mat_name in material_name:
                        quantity = mat.get('quantity', 0)
                        unit = mat.get('unit', unit)
                        break

            projects_list.append({
                'project_id': project.project_id,
                'project_name': project.project_name,
                'cr_id': cr.cr_id,
                'quantity': quantity,
                'unit': unit,
                'cr_status': cr.status,
                'has_active_request': has_active_request,
                'active_request_status': active_request_status
            })

        log.info(f"Found {len(projects_list)} projects with pending CRs for material '{material.material_name}'")
        return jsonify(projects_list), 200

    except Exception as e:
        log.error(f"Error getting projects: {str(e)}")
        return jsonify({"error": f"Failed to get projects: {str(e)}"}), 500


def check_store_availability(cr_id):
    """Check if materials in a CR are available in the M2 Store inventory"""
    try:
        cr = ChangeRequest.query.get(cr_id)
        if not cr:
            return jsonify({"error": "Change request not found"}), 404

        # Get materials from CR
        materials = cr.materials_data or cr.sub_items_data or []
        if not isinstance(materials, list):
            materials = []

        available_materials = []
        unavailable_materials = []

        for mat in materials:
            mat_name = mat.get('material_name') or mat.get('name') or ''
            mat_qty = mat.get('quantity', 0)

            # Search in inventory by name
            inventory_item = InventoryMaterial.query.filter(
                InventoryMaterial.is_active == True,
                InventoryMaterial.material_name.ilike(f'%{mat_name}%')
            ).first()

            if inventory_item and inventory_item.current_stock >= mat_qty:
                available_materials.append({
                    'material_name': mat_name,
                    'required_quantity': mat_qty,
                    'available_quantity': inventory_item.current_stock,
                    'is_available': True,
                    'inventory_material_id': inventory_item.inventory_material_id
                })
            else:
                unavailable_materials.append({
                    'material_name': mat_name,
                    'required_quantity': mat_qty,
                    'available_quantity': inventory_item.current_stock if inventory_item else 0,
                    'is_available': False,
                    'inventory_material_id': inventory_item.inventory_material_id if inventory_item else None
                })

        all_available = len(unavailable_materials) == 0 and len(available_materials) > 0

        return jsonify({
            'success': True,
            'cr_id': cr_id,
            'all_available_in_store': all_available,
            'available_materials': available_materials,
            'unavailable_materials': unavailable_materials,
            'can_complete_from_store': all_available
        }), 200

    except Exception as e:
        log.error(f"Error checking store availability: {str(e)}")
        return jsonify({"error": f"Failed to check store availability: {str(e)}"}), 500


def complete_from_store(cr_id):
    """Request materials from M2 Store - creates internal requests without completing the purchase"""
    try:
        current_user = g.user
        cr = ChangeRequest.query.get(cr_id)
        if not cr:
            return jsonify({"error": "Change request not found"}), 404

        # Check if already requested from store
        existing_requests = InternalMaterialRequest.query.filter_by(cr_id=cr_id).count()
        if existing_requests > 0:
            return jsonify({"error": "Materials already requested from store for this CR"}), 400

        # Get materials from CR
        materials = cr.materials_data or cr.sub_items_data or []
        if not isinstance(materials, list):
            return jsonify({"error": "No materials found in this CR"}), 400

        requests_created = 0
        # Check availability and create internal requests
        for mat in materials:
            mat_name = mat.get('material_name') or mat.get('name') or ''
            mat_qty = mat.get('quantity', 0)

            # Find in inventory
            inventory_item = InventoryMaterial.query.filter(
                InventoryMaterial.is_active == True,
                InventoryMaterial.material_name.ilike(f'%{mat_name}%')
            ).first()

            if not inventory_item:
                return jsonify({"error": f"Material '{mat_name}' not found in store"}), 400

            if inventory_item.current_stock < mat_qty:
                return jsonify({"error": f"Insufficient stock for '{mat_name}'. Need {mat_qty}, have {inventory_item.current_stock}"}), 400

            # Create internal material request
            new_request = InternalMaterialRequest(
                project_id=cr.project_id,
                cr_id=cr_id,
                material_name=mat_name,
                inventory_material_id=inventory_item.inventory_material_id,
                quantity=float(mat_qty),
                notes=f"Requested from CR-{cr_id}",
                request_send=True,
                status='send_request',
                created_by=current_user.get('email', 'system'),
                request_buyer_id=current_user.get('user_id'),
                last_modified_by=current_user.get('email', 'system')
            )
            db.session.add(new_request)
            requests_created += 1

        # Update CR notes to indicate store request was made (DON'T mark as completed yet)
        cr.purchase_notes = f"Requested from M2 Store by {current_user.get('full_name', current_user.get('email'))} on {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"

        db.session.commit()

        log.info(f"CR-{cr_id} materials requested from store by user {current_user.get('user_id')}")
        return jsonify({
            "success": True,
            "message": f"Material requests sent to M2 Store. {requests_created} request(s) created.",
            "cr_id": cr_id,
            "requests_created": requests_created
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error requesting from store: {str(e)}")
        return jsonify({"error": f"Failed to request from store: {str(e)}"}), 500


def get_store_request_status(cr_id):
    """Get the status of store requests for a CR"""
    try:
        requests = InternalMaterialRequest.query.filter_by(cr_id=cr_id).all()

        if not requests:
            return jsonify({
                "success": True,
                "has_store_requests": False,
                "requests": []
            }), 200

        request_list = []
        for req in requests:
            request_list.append({
                "request_id": req.request_id,
                "material_name": req.material_name,
                "quantity": req.quantity,
                "status": req.status,
                "created_at": req.created_at.isoformat() if req.created_at else None
            })

        return jsonify({
            "success": True,
            "has_store_requests": True,
            "total_requests": len(requests),
            "requests": request_list
        }), 200

    except Exception as e:
        log.error(f"Error getting store request status: {str(e)}")
        return jsonify({"error": f"Failed to get store request status: {str(e)}"}), 500
