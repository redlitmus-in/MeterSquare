from flask import request, jsonify, g
from sqlalchemy.orm import selectinload
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails, MasterItem, MasterSubItem, MasterMaterial
from models.change_request import ChangeRequest
from models.po_child import POChild
from models.user import User
from models.role import Role
from models.vendor import Vendor
from models.inventory import InventoryMaterial, InternalMaterialRequest
from config.logging import get_logger
from datetime import datetime
import os
import json
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


def process_materials_with_negotiated_prices(cr):
    """
    Helper function to process materials and apply negotiated prices
    Returns (materials_list, cr_total)

    NOTE: cr_total uses ORIGINAL prices (not negotiated)
    Individual materials show negotiated_price separately
    """
    sub_items_data = cr.sub_items_data or cr.materials_data or []
    cr_total = 0
    materials_list = []
    material_vendor_selections = cr.material_vendor_selections or {}

    if cr.sub_items_data:
        for sub_item in sub_items_data:
            if isinstance(sub_item, dict):
                sub_materials = sub_item.get('materials', [])
                if sub_materials:
                    for material in sub_materials:
                        material_name = material.get('material_name', '')
                        quantity = material.get('quantity') or 0
                        original_unit_price = material.get('unit_price') or 0

                        # Check if there's a negotiated price for this material
                        vendor_selection = material_vendor_selections.get(material_name, {})
                        negotiated_price = vendor_selection.get('negotiated_price')

                        # ALWAYS use original price for total calculation
                        material_total = float(quantity) * float(original_unit_price)

                        cr_total += material_total
                        materials_list.append({
                            "material_name": material_name,
                            "quantity": quantity,
                            "unit": material.get('unit', ''),
                            "unit_price": original_unit_price,  # Keep original price
                            "total_price": material_total,  # Based on original price
                            "negotiated_price": negotiated_price if negotiated_price is not None else None,
                            "original_unit_price": original_unit_price  # Add original for reference
                        })
                else:
                    material_name = sub_item.get('material_name', '')
                    quantity = sub_item.get('quantity') or 0
                    original_unit_price = sub_item.get('unit_price') or 0

                    # Check if there's a negotiated price for this material
                    vendor_selection = material_vendor_selections.get(material_name, {})
                    negotiated_price = vendor_selection.get('negotiated_price')

                    # ALWAYS use original price for total calculation
                    sub_total = float(quantity) * float(original_unit_price)

                    cr_total += sub_total
                    materials_list.append({
                        "material_name": material_name,
                        "sub_item_name": sub_item.get('sub_item_name', ''),
                        "quantity": quantity,
                        "unit": sub_item.get('unit', ''),
                        "unit_price": original_unit_price,  # Keep original price
                        "total_price": sub_total,  # Based on original price
                        "negotiated_price": negotiated_price if negotiated_price is not None else None,
                        "original_unit_price": original_unit_price  # Add original for reference
                    })
    else:
        for material in sub_items_data:
            material_name = material.get('material_name', '')
            quantity = material.get('quantity', 0)
            original_unit_price = material.get('unit_price', 0)

            # Check if there's a negotiated price for this material
            vendor_selection = material_vendor_selections.get(material_name, {})
            negotiated_price = vendor_selection.get('negotiated_price')

            # ALWAYS use original price for total calculation
            material_total = float(quantity) * float(original_unit_price)

            cr_total += material_total
            materials_list.append({
                "material_name": material_name,
                "sub_item_name": material.get('sub_item_name', ''),
                "quantity": quantity,
                "unit": material.get('unit', ''),
                "unit_price": original_unit_price,  # Keep original price
                "total_price": material_total,  # Based on original price
                "negotiated_price": negotiated_price if negotiated_price is not None else None,
                "original_unit_price": original_unit_price  # Add original for reference
            })

    return materials_list, cr_total

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
    """Get buyer dashboard statistics with detailed counts and workflow data"""
    try:
        from sqlalchemy import or_, and_, func, desc
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = (current_user.get('role_name', '') or current_user.get('role', '')).lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # FORCE admin to see all data
        if user_role == 'admin':
            is_admin_viewing = True

        # Initialize detailed stats
        stats = {
            'total_materials': 0,
            'pending_purchase': 0,
            'ordered': 0,
            'delivered': 0,
            'total_projects': 0,
            'total_cost': 0
        }

        # Workflow stages with detailed tracking
        workflow_stats = {
            'new_requests': 0,           # assigned_to_buyer (needs vendor selection)
            'pending_td_approval': 0,    # pending_td_approval (waiting for TD)
            'vendor_approved': 0,        # vendor_approved (ready to purchase)
            'purchase_completed': 0,     # purchase_completed (done)
            'total_orders': 0
        }

        # Cost breakdown by status
        cost_breakdown = {
            'pending_cost': 0,
            'ordered_cost': 0,
            'completed_cost': 0,
            'total_cost': 0
        }

        # Materials by status
        materials_breakdown = {
            'pending_materials': 0,
            'ordered_materials': 0,
            'completed_materials': 0
        }

        project_ids = set()
        project_data = {}  # Track per-project stats
        pending_purchases = []
        recent_purchases = []

        # Define status categories - Match Purchase Orders page statuses
        # Pending: needs vendor selection
        pending_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'under_review']
        # TD Approval: vendor selected, waiting for TD
        td_approval_statuses = ['pending_td_approval']
        # Vendor Approved: ready to complete purchase
        ordered_statuses = ['vendor_approved']
        # Completed
        completed_statuses = ['purchase_completed']

        buyer_id_int = int(buyer_id)

        # Get all CRs assigned to buyer (or all for admin) - same logic as Purchase Orders page
        if is_admin_viewing or user_role == 'admin':
            # Admin sees ALL CRs assigned to any buyer
            change_requests = ChangeRequest.query.filter(
                ChangeRequest.assigned_to_buyer_user_id.isnot(None),
                ChangeRequest.is_deleted == False
            ).order_by(desc(ChangeRequest.updated_at)).all()
        else:
            # Regular buyer sees only their assigned CRs
            change_requests = ChangeRequest.query.filter(
                or_(
                    # Assigned to buyer statuses
                    and_(
                        func.trim(ChangeRequest.status).in_(pending_statuses + td_approval_statuses + ordered_statuses + completed_statuses),
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    ),
                    # Under review AND approval_required_from='buyer'
                    and_(
                        func.trim(ChangeRequest.status) == 'under_review',
                        ChangeRequest.approval_required_from == 'buyer',
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    )
                ),
                ChangeRequest.is_deleted == False
            ).order_by(desc(ChangeRequest.updated_at)).all()

        for cr in change_requests:
            # Get BOQ and project info
            boq = BOQ.query.filter_by(boq_id=cr.boq_id, is_deleted=False).first()
            if not boq:
                continue

            project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
            if not project:
                continue

            project_id = boq.project_id
            project_ids.add(project_id)

            # Initialize project data if not exists
            if project_id not in project_data:
                project_data[project_id] = {
                    'project_id': project_id,
                    'project_name': project.project_name,
                    'total_orders': 0,
                    'pending': 0,
                    'completed': 0,
                    'total_cost': 0
                }

            # Calculate materials count and cost
            sub_items_data = cr.sub_items_data or cr.materials_data or []
            cr_total = 0
            materials_count = 0

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

            # Update stats based on status
            stats['total_materials'] += materials_count
            stats['total_cost'] += cr_total
            workflow_stats['total_orders'] += 1
            project_data[project_id]['total_orders'] += 1
            project_data[project_id]['total_cost'] += cr_total

            cr_status = (cr.status or '').strip().lower()

            # Workflow stage tracking - match all buyer-related statuses
            if cr_status in ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'under_review']:
                # New requests - awaiting vendor selection
                stats['pending_purchase'] += 1
                workflow_stats['new_requests'] += 1
                cost_breakdown['pending_cost'] += cr_total
                materials_breakdown['pending_materials'] += materials_count
                project_data[project_id]['pending'] += 1
            elif cr_status == 'pending_td_approval':
                # Vendor selected, waiting for TD approval
                stats['ordered'] += 1
                workflow_stats['pending_td_approval'] += 1
                cost_breakdown['ordered_cost'] += cr_total
                materials_breakdown['ordered_materials'] += materials_count
            elif cr_status == 'vendor_approved':
                # TD approved, ready to complete purchase
                stats['ordered'] += 1
                workflow_stats['vendor_approved'] += 1
                cost_breakdown['ordered_cost'] += cr_total
                materials_breakdown['ordered_materials'] += materials_count
            elif cr_status == 'purchase_completed':
                # Purchase completed
                stats['delivered'] += 1
                workflow_stats['purchase_completed'] += 1
                cost_breakdown['completed_cost'] += cr_total
                materials_breakdown['completed_materials'] += materials_count
                project_data[project_id]['completed'] += 1
            else:
                # Any other status assigned to buyer - count as pending
                stats['pending_purchase'] += 1
                workflow_stats['new_requests'] += 1
                cost_breakdown['pending_cost'] += cr_total
                materials_breakdown['pending_materials'] += materials_count
                project_data[project_id]['pending'] += 1

            # Build purchase info
            purchase_info = {
                "cr_id": cr.cr_id,
                "project_id": project_id,
                "project_name": project.project_name,
                "materials_count": materials_count,
                "total_cost": round(cr_total, 2),
                "status": cr.status,
                "status_display": get_status_display(cr.status),
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "updated_at": cr.updated_at.isoformat() if cr.updated_at else None,
                "vendor_name": None
            }

            # Get vendor info if available
            if cr.selected_vendor_id:
                vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id).first()
                if vendor:
                    purchase_info['vendor_name'] = vendor.company_name

            # Add to pending list if not completed
            if cr_status != 'purchase_completed':
                pending_purchases.append(purchase_info)

            # Add to recent purchases (limit to 10)
            if len(recent_purchases) < 10:
                recent_purchases.append(purchase_info)

        # Also count POChild records (split vendor orders like PO-400.1, PO-400.2)
        po_children = POChild.query.filter(
            POChild.is_deleted == False
        ).all()

        for po_child in po_children:
            # Get parent CR to check if it's buyer-related
            parent_cr = ChangeRequest.query.filter_by(cr_id=po_child.parent_cr_id, is_deleted=False).first()
            if not parent_cr or not parent_cr.assigned_to_buyer_user_id:
                continue

            # For non-admin, check if assigned to current buyer
            if not is_admin_viewing and user_role != 'admin':
                if parent_cr.assigned_to_buyer_user_id != buyer_id_int:
                    continue

            # Calculate materials cost from POChild
            po_child_materials = po_child.materials_data or []
            po_child_total = sum(float(m.get('total_price', 0) or 0) for m in po_child_materials)
            po_child_materials_count = len(po_child_materials)

            po_child_status = (po_child.status or '').strip().lower()

            # Count based on status - but don't double count if parent CR already counted
            if po_child_status == 'pending_td_approval':
                workflow_stats['pending_td_approval'] += 1
                stats['ordered'] += 1
                cost_breakdown['ordered_cost'] += po_child_total
                materials_breakdown['ordered_materials'] += po_child_materials_count
            elif po_child_status == 'vendor_approved':
                workflow_stats['vendor_approved'] += 1
                stats['ordered'] += 1
                cost_breakdown['ordered_cost'] += po_child_total
                materials_breakdown['ordered_materials'] += po_child_materials_count
            elif po_child_status == 'purchase_completed':
                workflow_stats['purchase_completed'] += 1
                stats['delivered'] += 1
                cost_breakdown['completed_cost'] += po_child_total
                materials_breakdown['completed_materials'] += po_child_materials_count

            workflow_stats['total_orders'] += 1
            stats['total_materials'] += po_child_materials_count
            stats['total_cost'] += po_child_total

            # Get project info for POChild
            if parent_cr.boq_id:
                boq = BOQ.query.filter_by(boq_id=parent_cr.boq_id, is_deleted=False).first()
                if boq:
                    project = Project.query.filter_by(project_id=boq.project_id, is_deleted=False).first()
                    if project:
                        project_id = boq.project_id
                        project_ids.add(project_id)

                        if project_id not in project_data:
                            project_data[project_id] = {
                                'project_id': project_id,
                                'project_name': project.project_name,
                                'total_orders': 0,
                                'pending': 0,
                                'completed': 0,
                                'total_cost': 0
                            }

                        project_data[project_id]['total_orders'] += 1
                        project_data[project_id]['total_cost'] += po_child_total

                        if po_child_status == 'purchase_completed':
                            project_data[project_id]['completed'] += 1
                        elif po_child_status not in ['vendor_approved', 'pending_td_approval']:
                            project_data[project_id]['pending'] += 1

                        # Add to recent purchases
                        vendor = Vendor.query.filter_by(vendor_id=po_child.vendor_id).first() if po_child.vendor_id else None
                        if len(recent_purchases) < 10:
                            recent_purchases.append({
                                "cr_id": po_child.parent_cr_id,
                                "po_child_id": po_child.id,
                                "formatted_id": f"PO-{po_child.parent_cr_id}{po_child.suffix or ''}",
                                "project_id": project_id,
                                "project_name": project.project_name,
                                "materials_count": po_child_materials_count,
                                "total_cost": round(po_child_total, 2),
                                "status": po_child.status,
                                "status_display": get_status_display(po_child.status),
                                "created_at": po_child.created_at.isoformat() if po_child.created_at else None,
                                "updated_at": po_child.updated_at.isoformat() if po_child.updated_at else None,
                                "vendor_name": vendor.company_name if vendor else None
                            })

        stats['total_projects'] = len(project_ids)
        stats['total_cost'] = round(stats['total_cost'], 2)
        cost_breakdown['total_cost'] = round(cost_breakdown['pending_cost'] + cost_breakdown['ordered_cost'] + cost_breakdown['completed_cost'], 2)
        cost_breakdown['pending_cost'] = round(cost_breakdown['pending_cost'], 2)
        cost_breakdown['ordered_cost'] = round(cost_breakdown['ordered_cost'], 2)
        cost_breakdown['completed_cost'] = round(cost_breakdown['completed_cost'], 2)

        # Calculate completion rate
        total_orders = workflow_stats['total_orders']
        completion_rate = round((workflow_stats['purchase_completed'] / total_orders * 100), 1) if total_orders > 0 else 0

        # Sort projects by total cost
        projects_list = sorted(project_data.values(), key=lambda x: x['total_cost'], reverse=True)

        # Sort recent purchases by updated_at descending
        recent_purchases.sort(key=lambda x: x.get('updated_at') or '', reverse=True)

        return jsonify({
            "success": True,
            "stats": stats,
            "workflow_stats": workflow_stats,
            "cost_breakdown": cost_breakdown,
            "materials_breakdown": materials_breakdown,
            "completion_rate": completion_rate,
            "projects": projects_list[:5],  # Top 5 projects
            "recent_purchases": recent_purchases,
            "pending_purchases": pending_purchases,
            "total_cost": stats['total_cost']
        }), 200

    except Exception as e:
        log.error(f"Error fetching Procurement dashboard: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch dashboard: {str(e)}"}), 500


def get_status_display(status):
    """Convert status to user-friendly display text"""
    status_map = {
        'assigned_to_buyer': 'New - Awaiting Vendor Selection',
        'send_to_buyer': 'New - Awaiting Vendor Selection',
        'approved_by_pm': 'PM Approved - Awaiting Vendor',
        'under_review': 'Under Review',
        'pending_td_approval': 'Pending TD Approval',
        'vendor_approved': 'Vendor Approved - Ready to Purchase',
        'purchase_completed': 'Purchase Completed'
    }
    return status_map.get(status, status)


def get_buyer_pending_purchases():
    """Get approved change requests (extra materials) for buyer to purchase"""
    try:
        from flask import request as flask_request
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role_name', '').lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # Get headers for debugging
        viewing_as_role_header = flask_request.headers.get('X-Viewing-As-Role')
        viewing_as_role_id_header = flask_request.headers.get('X-Viewing-As-Role-Id')

        # FORCE admin to see all buyer data if they are admin (regardless of headers)
        # This is a workaround if headers are not working
        if user_role == 'admin':
            is_admin_viewing = True

        # Get change requests for buyer:
        # 1. Under review AND approval_required_from='buyer' (pending buyer's review/acceptance)
        # 2. Assigned to this buyer (via assigned_to_buyer_user_id) - actively being worked on
        # 3. CRs with pending_td_approval OR vendor_approved status (vendor selection flow)
        # NOTE: Sub-CRs are deprecated - now using po_child table for vendor splits
        from sqlalchemy import or_, and_, func

        # Convert buyer_id to int for safe comparison
        buyer_id_int = int(buyer_id)

        # If admin is viewing as buyer, show ALL purchases (no buyer filtering)
        # If regular buyer, show only purchases assigned to them
        if is_admin_viewing:
            # SIMPLIFIED QUERY: Show ALL CRs assigned to any buyer (for admin viewing)
            # Exclude purchase_completed status - those should go to completed tab
            change_requests = ChangeRequest.query.filter(
                ChangeRequest.assigned_to_buyer_user_id.isnot(None),
                ChangeRequest.is_deleted == False,
                func.trim(ChangeRequest.status) != 'purchase_completed'
            ).all()

        else:
            change_requests = ChangeRequest.query.filter(
                or_(
                    # Under review AND approval_required_from='buyer' AND assigned to this buyer
                    and_(
                        func.trim(ChangeRequest.status) == 'under_review',
                        ChangeRequest.approval_required_from == 'buyer',
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    ),
                    # Assigned to this buyer - actively being worked on
                    and_(
                        func.trim(ChangeRequest.status).in_(['assigned_to_buyer', 'send_to_buyer']),
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    ),
                    # CRs with pending_td_approval OR vendor_approved status (full purchase to single vendor)
                    and_(
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int,
                        func.trim(ChangeRequest.status).in_(['pending_td_approval', 'vendor_approved'])
                    ),
                    # approved_by_pm or send_to_buyer status AND assigned to this buyer
                    and_(
                        func.trim(ChangeRequest.status).in_(['approved_by_pm', 'send_to_buyer']),
                        ChangeRequest.approval_required_from == 'buyer',
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
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

            # Get full vendor details from Vendor table if vendor is selected
            vendor_details = {
                'phone': None,
                'phone_code': None,
                'contact_person': None,
                'email': None,
                'category': None,
                'street_address': None,
                'city': None,
                'state': None,
                'country': None,
                'gst_number': None,
                'selected_by_name': None
            }
            # Initialize vendor_trn and vendor_email before conditional blocks
            vendor_trn = ""
            vendor_email = ""
            if cr.selected_vendor_id:
                from models.vendor import Vendor
                vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
                if vendor:
                    vendor_details['phone'] = vendor.phone
                    vendor_details['phone_code'] = vendor.phone_code
                    vendor_details['contact_person'] = vendor.contact_person_name
                    vendor_details['email'] = vendor.email
                    vendor_details['category'] = vendor.category
                    vendor_details['street_address'] = vendor.street_address
                    vendor_details['city'] = vendor.city
                    vendor_details['state'] = vendor.state
                    vendor_details['country'] = vendor.country
                    vendor_details['gst_number'] = vendor.gst_number
                    # Set vendor_trn and vendor_email from vendor object
                    vendor_trn = vendor.gst_number or ""
                    vendor_email = vendor.email or ""
                # Get who selected the vendor
                if cr.vendor_selected_by_buyer_id:
                    from models.user import User
                    selector = User.query.get(cr.vendor_selected_by_buyer_id)
                    if selector:
                        vendor_details['selected_by_name'] = selector.full_name

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

            # Get POChild records for this CR (if any exist)
            # This allows the frontend to know which materials have already been sent to TD
            po_children_data = []
            po_children_for_parent = POChild.query.filter_by(
                parent_cr_id=cr.cr_id,
                is_deleted=False
            ).all()

            for po_child in po_children_for_parent:
                po_children_data.append({
                    "id": po_child.id,
                    "formatted_id": po_child.get_formatted_id(),
                    "suffix": po_child.suffix,
                    "vendor_id": po_child.vendor_id,
                    "vendor_name": po_child.vendor_name,
                    "vendor_selection_status": po_child.vendor_selection_status,
                    "status": po_child.status,
                    "materials": po_child.materials_data or [],
                    "materials_count": len(po_child.materials_data) if po_child.materials_data else 0,
                    "materials_total_cost": po_child.materials_total_cost,
                    "vendor_email_sent": po_child.vendor_email_sent,
                    "purchase_completed_by_name": po_child.purchase_completed_by_name,
                    "purchase_completion_date": po_child.purchase_completion_date.isoformat() if po_child.purchase_completion_date else None
                })

            # Check if ALL children are pending TD approval OR all approved (for admin view - parent should be hidden)
            all_children_sent_to_td_or_approved = False
            if po_children_for_parent:
                all_children_sent_to_td_or_approved = all(
                    po_child.vendor_selection_status in ['pending_td_approval', 'approved']
                    for po_child in po_children_for_parent
                )

            # For admin view: Skip parent PO if all children are sent for TD approval or approved
            if is_admin_viewing and all_children_sent_to_td_or_approved:
                continue

            pending_purchases.append({
                "cr_id": cr.cr_id,
                "formatted_cr_id": cr.get_formatted_cr_id(),
                "submission_group_id": cr.submission_group_id,
                "po_children": po_children_data,  # POChild records for vendor splits
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
                "vendor_phone": vendor_details['phone'],
                "vendor_phone_code": vendor_details['phone_code'],
                "vendor_contact_person": vendor_details['contact_person'],
                "vendor_email": vendor_details['email'],
                "vendor_category": vendor_details['category'],
                "vendor_street_address": vendor_details['street_address'],
                "vendor_city": vendor_details['city'],
                "vendor_state": vendor_details['state'],
                "vendor_country": vendor_details['country'],
                "vendor_gst_number": vendor_details['gst_number'],
                "vendor_selected_by_name": vendor_details['selected_by_name'],
                "vendor_selected_by_buyer_name": cr.vendor_selected_by_buyer_name,
                "vendor_approved_by_td_name": cr.vendor_approved_by_td_name,
                "vendor_approval_date": cr.vendor_approval_date.isoformat() if cr.vendor_approval_date else None,
                "vendor_selection_date": cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None,
                "vendor_trn": vendor_trn,
                "vendor_email": vendor_email,
                "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval,
                "vendor_selection_status": cr.vendor_selection_status,  # 'pending_td_approval', 'approved', 'rejected'
                "vendor_email_sent": cr.vendor_email_sent or False,
                "use_per_material_vendors": cr.use_per_material_vendors or False,
                "material_vendor_selections": cr.material_vendor_selections or {},
                "has_store_requests": has_store_requests,
                "store_request_count": len(store_requests),
                "all_store_requests_approved": all_store_requests_approved,
                "any_store_request_rejected": any_store_request_rejected,
                "store_requests_pending": store_requests_pending
            })
        # Separate ongoing and pending approval
        ongoing_purchases = []
        pending_approval_purchases = []
        ongoing_total = 0
        pending_approval_total = 0

        for purchase in pending_purchases:
            if purchase.get('vendor_selection_pending_td_approval'):
                pending_approval_purchases.append(purchase)
                pending_approval_total += purchase.get('total_cost', 0)
            else:
                ongoing_purchases.append(purchase)
                ongoing_total += purchase.get('total_cost', 0)

        return jsonify({
            "success": True,
            "pending_purchases_count": len(pending_purchases),
            "total_cost": round(total_cost, 2),
            "pending_purchases": pending_purchases,
            "ongoing_purchases": ongoing_purchases,
            "ongoing_purchases_count": len(ongoing_purchases),
            "ongoing_total_cost": round(ongoing_total, 2),
            "pending_approval_purchases": pending_approval_purchases,
            "pending_approval_count": len(pending_approval_purchases),
            "pending_approval_total_cost": round(pending_approval_total, 2)
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyer pending purchases: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch pending purchases: {str(e)}"}), 500


def get_buyer_completed_purchases():
    """Get completed purchases by buyer"""
    try:
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role_name', '').lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # FORCE admin to see all data
        if user_role == 'admin':
            is_admin_viewing = True
        # If admin is viewing as buyer, show ALL completed purchases
        # If regular buyer, show only purchases assigned to them (not just completed by them)
        if is_admin_viewing:
            change_requests = ChangeRequest.query.filter(
                ChangeRequest.status == 'purchase_completed',
                ChangeRequest.is_deleted == False
            ).all()
        else:
            # Show completed purchases where assigned_to_buyer_user_id matches current buyer
            change_requests = ChangeRequest.query.filter(
                ChangeRequest.status == 'purchase_completed',
                ChangeRequest.assigned_to_buyer_user_id == buyer_id,
                ChangeRequest.is_deleted == False
            ).all()

        # Import POChild for checking if parent has completed children
        from models.po_child import POChild

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

            # BUYER VIEW: Skip parent CRs that have POChildren (all completed)
            # Parents should be hidden when they have children - only show children cards
            po_children_for_cr = POChild.query.filter_by(
                parent_cr_id=cr.cr_id,
                is_deleted=False
            ).all()

            if po_children_for_cr:
                # Parent has children - check if all are completed
                all_children_completed = all(
                    pc.status == 'purchase_completed' for pc in po_children_for_cr
                )
                if all_children_completed:
                    # Skip this parent CR - children will be shown separately
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

            # Get full vendor details from Vendor table if vendor is selected
            vendor_details = {
                'phone': None,
                'phone_code': None,
                'contact_person': None,
                'email': None,
                'category': None,
                'street_address': None,
                'city': None,
                'state': None,
                'country': None,
                'gst_number': None,
                'selected_by_name': None
            }
            # Initialize vendor_trn and vendor_email before conditional blocks
            vendor_trn = ""
            vendor_email = ""
            if cr.selected_vendor_id:
                from models.vendor import Vendor
                vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()
                if vendor:
                    vendor_details['phone'] = vendor.phone
                    vendor_details['phone_code'] = vendor.phone_code
                    vendor_details['contact_person'] = vendor.contact_person_name
                    vendor_details['email'] = vendor.email
                    vendor_details['category'] = vendor.category
                    vendor_details['street_address'] = vendor.street_address
                    vendor_details['city'] = vendor.city
                    vendor_details['state'] = vendor.state
                    vendor_details['country'] = vendor.country
                    vendor_details['gst_number'] = vendor.gst_number
                    # Set vendor_trn and vendor_email from vendor object
                    vendor_trn = vendor.gst_number or ""
                    vendor_email = vendor.email or ""
                # Get who selected the vendor
                if cr.vendor_selected_by_buyer_id:
                    from models.user import User
                    selector = User.query.get(cr.vendor_selected_by_buyer_id)
                    if selector:
                        vendor_details['selected_by_name'] = selector.full_name

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
                "vendor_phone": vendor_details['phone'],
                "vendor_phone_code": vendor_details['phone_code'],
                "vendor_contact_person": vendor_details['contact_person'],
                "vendor_email": vendor_details['email'],
                "vendor_category": vendor_details['category'],
                "vendor_street_address": vendor_details['street_address'],
                "vendor_city": vendor_details['city'],
                "vendor_state": vendor_details['state'],
                "vendor_country": vendor_details['country'],
                "vendor_gst_number": vendor_details['gst_number'],
                "vendor_selected_by_name": vendor_details['selected_by_name'],
                "vendor_selected_by_buyer_name": cr.vendor_selected_by_buyer_name,
                "vendor_approved_by_td_name": cr.vendor_approved_by_td_name,
                "vendor_approval_date": cr.vendor_approval_date.isoformat() if cr.vendor_approval_date else None,
                "vendor_selection_date": cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None,
                "vendor_selection_status": cr.vendor_selection_status,
                "vendor_trn": vendor_trn,
                "vendor_email": vendor_email,
                "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval
            })

        # Also get completed POChildren (vendor-split purchases)
        # POChild already imported above

        if is_admin_viewing:
            completed_po_children = POChild.query.filter(
                POChild.status == 'purchase_completed',
                POChild.is_deleted == False
            ).all()
        else:
            # Get POChildren where parent CR is assigned to this buyer
            completed_po_children = POChild.query.join(
                ChangeRequest, POChild.parent_cr_id == ChangeRequest.cr_id
            ).filter(
                POChild.status == 'purchase_completed',
                POChild.is_deleted == False,
                ChangeRequest.assigned_to_buyer_user_id == buyer_id
            ).all()

        completed_po_children_list = []
        for po_child in completed_po_children:
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id)
            project = Project.query.get(parent_cr.project_id) if parent_cr else None
            boq = BOQ.query.get(po_child.boq_id) if po_child.boq_id else (BOQ.query.get(parent_cr.boq_id) if parent_cr and parent_cr.boq_id else None)

            # Get vendor details
            vendor = None
            if po_child.vendor_id:
                from models.vendor import Vendor
                vendor = Vendor.query.get(po_child.vendor_id)

            po_child_total = po_child.materials_total_cost or 0
            total_cost += po_child_total

            completed_po_children_list.append({
                **po_child.to_dict(),
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None,
                'vendor_phone': vendor.phone if vendor else None,
                'vendor_contact_person': vendor.contact_person_name if vendor else None,
                'is_po_child': True
            })

        return jsonify({
            "success": True,
            "completed_purchases_count": len(completed_purchases),
            "total_cost": round(total_cost, 2),
            "completed_purchases": completed_purchases,
            "completed_po_children": completed_po_children_list,
            "completed_po_children_count": len(completed_po_children_list)
        }), 200

    except Exception as e:
        log.error(f"Error fetching completed purchases: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch completed purchases: {str(e)}"}), 500


def get_buyer_rejected_purchases():
    """Get rejected change requests for buyer (rejected by TD or vendor selection rejected)"""
    try:
        from utils.admin_viewing_context import get_effective_user_context
        from sqlalchemy import or_, and_

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role_name', '').lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        # FORCE admin to see all data
        if user_role == 'admin':
            is_admin_viewing = True

        # Get rejected change requests:
        # 1. status='rejected' (rejected by TD)
        # 2. vendor_selection_status='rejected' (vendor rejected by TD)
        if is_admin_viewing:
            change_requests = ChangeRequest.query.filter(
                or_(
                    ChangeRequest.status == 'rejected',
                    ChangeRequest.vendor_selection_status == 'rejected'
                ),
                ChangeRequest.is_deleted == False
            ).all()
        else:
            change_requests = ChangeRequest.query.filter(
                or_(
                    ChangeRequest.status == 'rejected',
                    ChangeRequest.vendor_selection_status == 'rejected'
                ),
                ChangeRequest.assigned_to_buyer_user_id == buyer_id,
                ChangeRequest.is_deleted == False
            ).all()

        rejected_purchases = []

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
            first_sub_item_name = ""

            if cr.sub_items_data:
                for sub_item in sub_items_data:
                    if isinstance(sub_item, dict):
                        if not first_sub_item_name and sub_item.get('sub_item_name'):
                            first_sub_item_name = sub_item.get('sub_item_name', '')

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
                    if isinstance(material, dict):
                        material_total = float(material.get('total_price', 0) or 0)
                        cr_total += material_total
                        materials_list.append({
                            "material_name": material.get('material_name', ''),
                            "quantity": material.get('quantity', 0),
                            "unit": material.get('unit', ''),
                            "unit_price": material.get('unit_price', 0),
                            "total_price": material_total
                        })

            # Get full vendor details if available
            vendor_phone = None
            vendor_phone_code = None
            vendor_contact_person = None
            vendor_email = None
            vendor_category = None
            vendor_street_address = None
            vendor_city = None
            vendor_state = None
            vendor_country = None
            vendor_gst_number = None
            vendor_selected_by_name = None
            if cr.selected_vendor_id:
                vendor = Vendor.query.get(cr.selected_vendor_id)
                if vendor:
                    vendor_phone = vendor.phone
                    vendor_phone_code = vendor.phone_code
                    vendor_contact_person = vendor.contact_person_name
                    vendor_email = vendor.email
                    vendor_category = vendor.category
                    vendor_street_address = vendor.street_address
                    vendor_city = vendor.city
                    vendor_state = vendor.state
                    vendor_country = vendor.country
                    vendor_gst_number = vendor.gst_number
                # Get who selected the vendor
                if cr.vendor_selected_by_buyer_user_id:
                    from models.users import User
                    selector = User.query.filter_by(user_id=cr.vendor_selected_by_buyer_user_id).first()
                    if selector:
                        vendor_selected_by_name = selector.full_name

            # Determine rejection type and reason
            rejection_type = "change_request"  # default
            rejection_reason = cr.rejection_reason or "No reason provided"

            if cr.vendor_selection_status == 'rejected':
                rejection_type = "vendor_selection"
                rejection_reason = cr.vendor_rejection_reason or "Vendor selection rejected by TD"

            rejected_purchases.append({
                "cr_id": cr.cr_id,
                "formatted_cr_id": cr.get_formatted_cr_id(),
                "project_id": cr.project_id,
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
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "status": cr.status,
                "rejection_type": rejection_type,
                "rejection_reason": rejection_reason,
                "rejected_by_name": cr.rejected_by_name,
                "rejected_at_stage": cr.rejected_at_stage,
                "vendor_id": cr.selected_vendor_id,
                "vendor_name": cr.selected_vendor_name,
                "vendor_phone": vendor_phone,
                "vendor_phone_code": vendor_phone_code,
                "vendor_contact_person": vendor_contact_person,
                "vendor_email": vendor_email,
                "vendor_category": vendor_category,
                "vendor_street_address": vendor_street_address,
                "vendor_city": vendor_city,
                "vendor_state": vendor_state,
                "vendor_country": vendor_country,
                "vendor_gst_number": vendor_gst_number,
                "vendor_selection_status": cr.vendor_selection_status,
                "vendor_selected_by_name": vendor_selected_by_name
            })

        # Also get TD rejected POChild items
        td_rejected_po_children = []
        try:
            if is_admin_viewing:
                po_children = POChild.query.filter(
                    or_(
                        POChild.status == 'td_rejected',
                        POChild.vendor_selection_status == 'td_rejected'
                    ),
                    POChild.is_deleted == False
                ).all()
            else:
                po_children = POChild.query.filter(
                    or_(
                        POChild.status == 'td_rejected',
                        POChild.vendor_selection_status == 'td_rejected'
                    ),
                    POChild.vendor_selected_by_buyer_id == buyer_id,
                    POChild.is_deleted == False
                ).all()

            for poc in po_children:
                # Get parent CR for project/boq info
                parent_cr = ChangeRequest.query.filter_by(cr_id=poc.parent_cr_id).first()
                project = Project.query.get(poc.project_id) if poc.project_id else None
                boq = BOQ.query.filter_by(boq_id=poc.boq_id).first() if poc.boq_id else None

                td_rejected_po_children.append({
                    "po_child_id": poc.id,
                    "formatted_id": poc.get_formatted_id(),
                    "parent_cr_id": poc.parent_cr_id,
                    "project_id": poc.project_id,
                    "project_name": project.project_name if project else "Unknown",
                    "client": project.client if project else "Unknown",
                    "location": project.location if project else "Unknown",
                    "boq_id": poc.boq_id,
                    "boq_name": boq.boq_name if boq else "Unknown",
                    "item_name": poc.item_name or "N/A",
                    "materials": poc.materials_data or [],
                    "materials_count": len(poc.materials_data or []),
                    "total_cost": poc.materials_total_cost or 0,
                    "created_at": poc.created_at.isoformat() if poc.created_at else None,
                    "status": poc.status,
                    "rejection_type": "td_vendor_rejection",
                    "rejection_reason": poc.rejection_reason or "Vendor selection rejected by TD",
                    "rejected_by_name": poc.vendor_approved_by_td_name,
                    "vendor_selection_status": poc.vendor_selection_status,
                    "can_reselect_vendor": True  # Flag to indicate buyer can select new vendor
                })
        except Exception as poc_error:
            log.error(f"Error fetching TD rejected POChild items: {poc_error}")

        return jsonify({
            "success": True,
            "rejected_purchases_count": len(rejected_purchases),
            "rejected_purchases": rejected_purchases,
            "td_rejected_po_children": td_rejected_po_children,
            "td_rejected_count": len(td_rejected_po_children)
        }), 200

    except Exception as e:
        log.error(f"Error fetching rejected purchases: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch rejected purchases: {str(e)}"}), 500


def complete_purchase():
    """Mark a purchase as complete"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Unknown Buyer')
        user_role = current_user.get('role', '').lower()

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

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for admin)
        if not is_admin and not is_admin_viewing and cr.assigned_to_buyer_user_id != buyer_id:
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

                        # Log warning if sub_item_id is still None
                        if sub_item_id_int is None:
                            log.warning(f"⚠️ No valid sub_item_id found for material '{material_name}' in CR-{cr_id}")

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
        user_role = current_user.get('role', '').lower()

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer or completed by this buyer (skip check for admin)
        if not is_admin and not is_admin_viewing and cr.assigned_to_buyer_user_id != buyer_id and cr.purchase_completed_by_user_id != buyer_id:
            return jsonify({"error": "You don't have access to this purchase"}), 403

        # Get project details
        project = Project.query.get(cr.project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get BOQ details
        boq = BOQ.query.filter_by(boq_id=cr.boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Process materials with negotiated prices
        materials_list, cr_total = process_materials_with_negotiated_prices(cr)

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
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        # Get effective context for admin viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']
        effective_role = context['effective_role']

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
        is_admin = user_role == 'admin'

        # Allow admin viewing as buyer to select vendor
        is_admin_as_buyer = is_admin_viewing and effective_role == 'buyer'

        # Verify it's assigned to this buyer (skip check for TD, admin, or admin viewing as buyer)
        if not is_td and not is_admin and not is_admin_as_buyer and cr.assigned_to_buyer_user_id != user_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        # TD can change vendor even when status is pending_td_approval
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm']
        if is_td:
            allowed_statuses.append('pending_td_approval')

        if cr.status not in allowed_statuses:
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
        # TD changing vendor does NOT auto-approve - TD must manually click "Approve Vendor"
        if is_td:
            # TD is selecting/editing vendor - set to pending (TD must manually approve)
            cr.vendor_selection_status = 'pending_td_approval'
            cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD
            # Clear previous approval info since vendor changed
            cr.vendor_approved_by_td_id = None
            cr.vendor_approved_by_td_name = None
            cr.vendor_approval_date = None
            # Track who made the change
            cr.vendor_selected_by_buyer_id = user_id
            cr.vendor_selected_by_buyer_name = user_name
            cr.vendor_selection_date = datetime.utcnow()
        else:
            # Buyer is selecting vendor - needs TD approval
            cr.vendor_selected_by_buyer_id = user_id
            cr.vendor_selected_by_buyer_name = user_name
            cr.vendor_selection_date = datetime.utcnow()
            cr.vendor_selection_status = 'pending_td_approval'
            cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD

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
        # Both TD and Buyer vendor selection goes to pending_td_approval status
        if is_td:
            new_action = {
                "role": "technical_director",
                "type": "change_request_vendor_changed",
                "sender": user_name,
                "receiver": "Technical Director",
                "sender_role": "technical_director",
                "receiver_role": "technical_director",
                "status": cr.status,
                "cr_id": cr_id,
                "item_name": cr.item_name or f"CR #{cr_id}",
                "materials_count": len(cr.materials_data) if cr.materials_data else 0,
                "total_cost": cr.materials_total_cost,
                "vendor_id": vendor_id,
                "vendor_name": vendor.company_name,
                "vendor_selection_status": "pending_td_approval",
                "comments": f"TD changed vendor to '{vendor.company_name}'. Manual approval required.",
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

        # Update history entry based on user role
        if existing_history:
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = user_name
            existing_history.sender = user_name

            if is_td:
                existing_history.receiver = "Technical Director"
                existing_history.comments = f"CR #{cr_id} vendor changed by TD, pending manual approval"
                existing_history.sender_role = 'technical_director'
                existing_history.receiver_role = 'technical_director'
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
                    receiver="Technical Director",
                    comments=f"CR #{cr_id} vendor changed by TD, pending manual approval",
                    sender_role='technical_director',
                    receiver_role='technical_director',
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


def update_vendor_price(vendor_id):
    """Update vendor product price for a specific material"""
    try:
        data = request.get_json()
        material_name = data.get('material_name')
        new_price = data.get('new_price')
        save_for_future = data.get('save_for_future', False)

        if not material_name:
            return jsonify({"error": "material_name is required"}), 400

        if new_price is None or new_price <= 0:
            return jsonify({"error": "valid new_price is required"}), 400

        # Get the vendor
        from models.vendor import Vendor, VendorProduct
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        if vendor.status != 'active':
            return jsonify({"error": f"Vendor '{vendor.company_name}' is not active"}), 400

        # Only update vendor product if save_for_future is True
        if save_for_future:
            # Find matching product(s) for this vendor and material
            material_lower = material_name.lower().strip()
            products = VendorProduct.query.filter_by(
                vendor_id=vendor_id,
                is_deleted=False
            ).all()

            matching_products = []
            for product in products:
                product_name = (product.product_name or '').lower().strip()
                # Exact match or contains match
                if product_name == material_lower or material_lower in product_name or product_name in material_lower:
                    matching_products.append(product)

            # Update unit_price for all matching products
            if matching_products:
                for product in matching_products:
                    old_price = product.unit_price
                    product.unit_price = float(new_price)

                db.session.commit()

                return jsonify({
                    "success": True,
                    "message": f"Price updated for {len(matching_products)} product(s) for future purchases"
                }), 200
            else:
                return jsonify({"error": f"No matching products found for material '{material_name}'"}), 404
        else:
            # For "This BOQ" option, save negotiated price to change request
            # Get cr_id from request (optional - if provided, save to that CR)
            cr_id = data.get('cr_id')

            if cr_id:
                # Find the change request and update the material_vendor_selections
                cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()

                if cr:
                    # Get or create material_vendor_selections
                    material_vendor_selections = cr.material_vendor_selections or {}

                    # Update negotiated price for this material
                    if material_name in material_vendor_selections:
                        # Material already has vendor selection - update negotiated price
                        material_vendor_selections[material_name]['negotiated_price'] = float(new_price)
                        material_vendor_selections[material_name]['save_price_for_future'] = False
                    else:
                        # Material not yet selected - create entry with negotiated price for vendor_id
                        # Store with vendor_id so we can retrieve it later
                        material_vendor_selections[material_name] = {
                            'vendor_id': vendor_id,
                            'vendor_name': None,  # Will be set when vendor is selected
                            'negotiated_price': float(new_price),
                            'save_price_for_future': False,
                            'selection_status': 'pending'
                        }

                    # Update the JSONB field
                    from sqlalchemy.orm.attributes import flag_modified
                    cr.material_vendor_selections = material_vendor_selections
                    flag_modified(cr, 'material_vendor_selections')

                    db.session.commit()

                    return jsonify({
                        "success": True,
                        "message": f"Negotiated price saved for this purchase: AED {new_price}"
                    }), 200
                else:
                    log.warning(f"Change request {cr_id} not found")

            # If no cr_id provided, just return success (price will be sent on submit)
            return jsonify({
                "success": True,
                "message": "Price will be applied to this purchase only"
            }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating vendor price: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update vendor price: {str(e)}"}), 500


def select_vendor_for_material(cr_id):
    """Select vendor for specific material(s) in purchase order"""
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        material_selections = data.get('material_selections')  # Array of {material_name, vendor_id}

        if not material_selections or not isinstance(material_selections, list):
            return jsonify({"error": "material_selections array is required"}), 400

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        # Get effective user context for admin viewing as buyer
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for TD, Admin, or Admin viewing as Buyer)
        # Convert both to int for safe comparison (user_id from JWT may be string)
        assigned_buyer_id = int(cr.assigned_to_buyer_user_id or 0)
        current_user_id = int(user_id)
        if not is_td and not is_admin and not is_admin_viewing and assigned_buyer_id != current_user_id:
            log.warning(f"select_vendor_for_material - Permission denied: assigned_buyer_id={assigned_buyer_id} != current_user_id={current_user_id}")
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        # Both buyer and TD can change vendor when status is pending_td_approval
        # Buyer may want to update their selection before TD approves
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'pending_td_approval']

        if cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot select vendor. Current status: {cr.status}"}), 400

        # Special handling for sub-CRs: TD changing vendor for specific material(s)
        # When TD changes vendor for ONE material, only that material should be separated
        # Other materials should stay in the original sub-CR with their existing vendor
        if is_td and cr.is_sub_cr and material_selections:
            from models.vendor import Vendor

            # Get the original sub-CR's vendor (convert to int for safe comparison)
            original_vendor_id = int(cr.selected_vendor_id) if cr.selected_vendor_id else None

            # Separate materials into: changed (different vendor) vs unchanged (same vendor)
            changed_materials = []  # Materials that TD is assigning to a DIFFERENT vendor
            unchanged_materials = []  # Materials staying with the original vendor

            for sel in material_selections:
                sel_vendor_id = sel.get('vendor_id')
                # Convert to int for safe comparison (JSON may send as string)
                sel_vendor_id_int = int(sel_vendor_id) if sel_vendor_id else None

                if sel_vendor_id_int and sel_vendor_id_int != original_vendor_id:
                    changed_materials.append(sel)
                else:
                    unchanged_materials.append(sel)

            # If no materials are being changed to a different vendor, just update the sub-CR
            if not changed_materials:
                # Single vendor selected - just update the sub-CR's vendor (no splitting)
                first_selection = material_selections[0]
                new_vendor_id = first_selection.get('vendor_id')

                if new_vendor_id:
                    new_vendor = Vendor.query.filter_by(vendor_id=new_vendor_id, is_deleted=False).first()
                    if not new_vendor:
                        return jsonify({"error": f"Vendor {new_vendor_id} not found"}), 404
                    if new_vendor.status != 'active':
                        return jsonify({"error": f"Vendor '{new_vendor.company_name}' is not active"}), 400

                    old_vendor_name = cr.selected_vendor_name

                    # Update sub-CR's main vendor fields (vendor changed, but NOT auto-approved)
                    cr.selected_vendor_id = new_vendor_id
                    cr.selected_vendor_name = new_vendor.company_name
                    # Keep status as pending_td_approval - TD needs to explicitly approve
                    cr.vendor_selection_status = 'pending_td_approval'
                    cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD
                    cr.updated_at = datetime.utcnow()

                    db.session.commit()

                    return jsonify({
                        "success": True,
                        "message": f"Vendor changed from '{old_vendor_name}' to '{new_vendor.company_name}'",
                        "purchase": {
                            "cr_id": cr.cr_id,
                            "formatted_cr_id": cr.get_formatted_cr_id(),
                            "status": cr.status,
                            "selected_vendor_id": cr.selected_vendor_id,
                            "selected_vendor_name": cr.selected_vendor_name,
                            "vendor_selection_status": cr.vendor_selection_status
                        }
                    })
                # Fall through to normal processing if no vendor_id

            # TD is changing vendor for SOME materials (not all)
            # Only split out the changed materials, keep unchanged materials in original sub-CR
            # Get parent CR to create new sub-CRs under it
            parent_cr = ChangeRequest.query.filter_by(
                cr_id=cr.parent_cr_id,
                is_deleted=False
            ).first()

            if not parent_cr:
                return jsonify({"error": "Parent CR not found for sub-CR splitting"}), 404

            # Get existing sub-CR count for the parent
            existing_sub_cr_count = ChangeRequest.query.filter_by(
                parent_cr_id=parent_cr.cr_id,
                is_deleted=False
            ).count()
            next_suffix_number = existing_sub_cr_count + 1

            created_sub_crs = []
            old_sub_cr_id = cr.get_formatted_cr_id()
            old_vendor_name = cr.selected_vendor_name

            # Group changed materials by their new vendor
            vendor_groups = {}
            for sel in changed_materials:
                vendor_id = sel.get('vendor_id')
                if not vendor_id:
                    continue
                if vendor_id not in vendor_groups:
                    vendor_groups[vendor_id] = []
                vendor_groups[vendor_id].append(sel)

            # Create new sub-CRs for each new vendor (only for changed materials)
            for vendor_id, vendor_materials in vendor_groups.items():
                vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
                if not vendor:
                    return jsonify({"error": f"Vendor {vendor_id} not found"}), 404
                if vendor.status != 'active':
                    return jsonify({"error": f"Vendor '{vendor.company_name}' is not active"}), 400

                # Build materials data for new sub-CR
                new_materials = []
                total_cost = 0.0

                for sel in vendor_materials:
                    material_name = sel.get('material_name')
                    # Find the material from original sub-CR
                    original_material = None
                    if cr.materials_data:
                        for m in cr.materials_data:
                            if m.get('material_name') == material_name:
                                original_material = m
                                break

                    if original_material:
                        unit_price = sel.get('negotiated_price') or original_material.get('unit_price', 0)
                        quantity = original_material.get('quantity', 0)
                        material_total = unit_price * quantity
                        total_cost += material_total

                        new_materials.append({
                            'material_name': material_name,
                            'sub_item_name': original_material.get('sub_item_name', ''),
                            'quantity': quantity,
                            'unit': original_material.get('unit', ''),
                            'unit_price': unit_price,
                            'total_price': material_total,
                            'master_material_id': original_material.get('master_material_id')
                        })

                # Create new sub-CR for the split-off materials
                new_sub_cr = ChangeRequest(
                    boq_id=parent_cr.boq_id,
                    project_id=parent_cr.project_id,
                    requested_by_user_id=parent_cr.requested_by_user_id,
                    requested_by_name=parent_cr.requested_by_name,
                    requested_by_role=parent_cr.requested_by_role,
                    request_type=parent_cr.request_type,
                    justification=f"Sub-CR for vendor {vendor.company_name} - Split by TD from {old_sub_cr_id}",
                    status='pending_td_approval',  # NOT auto-approved
                    approval_required_from='technical_director',  # Set approval_required_from to TD
                    item_id=parent_cr.item_id,
                    item_name=parent_cr.item_name,
                    sub_item_id=parent_cr.sub_item_id,
                    sub_items_data=new_materials,
                    materials_data=new_materials,
                    materials_total_cost=total_cost,
                    assigned_to_buyer_user_id=parent_cr.assigned_to_buyer_user_id,
                    assigned_to_buyer_name=parent_cr.assigned_to_buyer_name,
                    assigned_to_buyer_date=parent_cr.assigned_to_buyer_date,
                    # Vendor selection
                    selected_vendor_id=vendor_id,
                    selected_vendor_name=vendor.company_name,
                    vendor_selected_by_buyer_id=user_id,
                    vendor_selected_by_buyer_name=user_name,
                    vendor_selection_date=datetime.utcnow(),
                    vendor_selection_status='pending_td_approval',  # NOT auto-approved
                    # Sub-CR specific fields
                    parent_cr_id=parent_cr.cr_id,
                    cr_number_suffix=f".{next_suffix_number}",
                    is_sub_cr=True,
                    submission_group_id=cr.submission_group_id,  # Keep same group
                    use_per_material_vendors=False,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )

                db.session.add(new_sub_cr)
                db.session.flush()

                created_sub_crs.append({
                    'cr_id': new_sub_cr.cr_id,
                    'formatted_cr_id': new_sub_cr.get_formatted_cr_id(),
                    'vendor_id': vendor_id,
                    'vendor_name': vendor.company_name,
                    'materials_count': len(new_materials),
                    'total_cost': total_cost
                })

                next_suffix_number += 1

            # Update the ORIGINAL sub-CR to keep only the unchanged materials
            if unchanged_materials:
                # Keep the original sub-CR but update its materials list
                remaining_materials = []
                remaining_total_cost = 0.0

                for sel in unchanged_materials:
                    material_name = sel.get('material_name')
                    # Find the material from original sub-CR
                    if cr.materials_data:
                        for m in cr.materials_data:
                            if m.get('material_name') == material_name:
                                remaining_materials.append(m)
                                remaining_total_cost += m.get('total_price', 0) or (m.get('unit_price', 0) * m.get('quantity', 0))
                                break

                # Update original sub-CR with remaining materials
                cr.materials_data = remaining_materials
                cr.sub_items_data = remaining_materials
                cr.materials_total_cost = remaining_total_cost
                cr.updated_at = datetime.utcnow()
                # Keep original vendor and status

                # Flag JSONB fields as modified so SQLAlchemy detects the change
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(cr, 'materials_data')
                flag_modified(cr, 'sub_items_data')

            else:
                # All materials were moved to new sub-CRs, soft-delete the original
                cr.is_deleted = True
                cr.updated_at = datetime.utcnow()

            db.session.commit()

            return jsonify({
                "success": True,
                "message": f"{len(changed_materials)} material(s) separated into new purchase order(s). {len(unchanged_materials)} material(s) remain with original vendor.",
                "split_result": {
                    "original_sub_cr": old_sub_cr_id,
                    "original_materials_remaining": len(unchanged_materials),
                    "new_sub_crs": created_sub_crs
                }
            })

        # Initialize material_vendor_selections if it doesn't exist
        if not cr.material_vendor_selections:
            cr.material_vendor_selections = {}

        # Enable per-material vendor mode
        cr.use_per_material_vendors = True

        # Process each material selection
        from models.vendor import Vendor
        updated_materials = []

        for selection in material_selections:
            material_name = selection.get('material_name')
            vendor_id = selection.get('vendor_id')
            negotiated_price = selection.get('negotiated_price')
            save_price_for_future = selection.get('save_price_for_future', False)

            if not material_name or not vendor_id:
                continue

            # Verify vendor exists and is active
            vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
            if not vendor:
                return jsonify({"error": f"Vendor {vendor_id} not found"}), 404

            if vendor.status != 'active':
                return jsonify({"error": f"Vendor '{vendor.company_name}' is not active"}), 400

            # Handle price updates for future purchases
            if save_price_for_future and negotiated_price is not None:
                try:
                    from models.vendor import VendorProduct

                    # Find matching product(s) for this vendor and material
                    # Try exact match first
                    material_lower = material_name.lower().strip()
                    products = VendorProduct.query.filter_by(
                        vendor_id=vendor_id,
                        is_deleted=False
                    ).all()

                    matching_products = []
                    for product in products:
                        product_name = (product.product_name or '').lower().strip()
                        # Exact match or contains match
                        if product_name == material_lower or material_lower in product_name or product_name in material_lower:
                            matching_products.append(product)

                    # Update unit_price for all matching products
                    if matching_products:
                        for product in matching_products:
                            product.unit_price = float(negotiated_price)

                        db.session.flush()  # Flush to ensure updates are persisted
                    else:
                        log.warning(f"No matching products found for material '{material_name}' from vendor {vendor_id}")

                except Exception as price_error:
                    log.error(f"Error updating vendor product price: {str(price_error)}")
                    # Continue with vendor selection even if price update fails

            # Set status based on user role
            if is_td:
                selection_status = 'approved'
                approved_by_td_id = user_id
                approved_by_td_name = user_name
                approval_date = datetime.utcnow().isoformat()
            else:
                selection_status = 'pending_td_approval'
                approved_by_td_id = None
                approved_by_td_name = None
                approval_date = None

            # Store vendor selection for this material (including negotiated price)
            vendor_selection_data = {
                'vendor_id': vendor_id,
                'vendor_name': vendor.company_name,
                'vendor_email': vendor.email,
                'vendor_phone': vendor.phone,
                'vendor_phone_code': vendor.phone_code,
                'vendor_contact_person': vendor.contact_person_name,
                'selected_by_user_id': user_id,
                'selected_by_name': user_name,
                'selection_date': datetime.utcnow().isoformat(),
                'selection_status': selection_status,
                'approved_by_td_id': approved_by_td_id,
                'approved_by_td_name': approved_by_td_name,
                'approval_date': approval_date,
                'rejection_reason': None
            }

            # Add negotiated price information if provided
            if negotiated_price is not None:
                vendor_selection_data['negotiated_price'] = float(negotiated_price)
                vendor_selection_data['save_price_for_future'] = bool(save_price_for_future)

            cr.material_vendor_selections[material_name] = vendor_selection_data

            updated_materials.append(material_name)

        # Mark the JSONB field as modified so SQLAlchemy detects the change
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(cr, 'material_vendor_selections')

        # Check if ALL materials now have vendors selected
        all_materials_have_vendors = True
        if cr.materials_data and isinstance(cr.materials_data, list):
            for material in cr.materials_data:
                material_name = material.get('material_name')
                if material_name and material_name not in cr.material_vendor_selections:
                    all_materials_have_vendors = False
                    break

        # If all materials have vendors selected, change CR status to pending_td_approval
        # TD selecting vendors does NOT auto-approve - TD must manually click "Approve Vendor"
        if all_materials_have_vendors:
            cr.status = 'pending_td_approval'
            cr.vendor_selection_status = 'pending_td_approval'  # Also set vendor_selection_status for Pending Approval tab
            cr.approval_required_from = 'technical_director'  # Set approval_required_from to TD
            # Set selected_vendor fields from the first material's vendor (for single vendor case)
            first_material = list(cr.material_vendor_selections.values())[0] if cr.material_vendor_selections else None
            if first_material:
                cr.selected_vendor_id = first_material.get('vendor_id')
                cr.selected_vendor_name = first_material.get('vendor_name')
                cr.vendor_selected_by_buyer_id = user_id
                cr.vendor_selected_by_buyer_name = user_name
                cr.vendor_selection_date = datetime.utcnow()

        cr.updated_at = datetime.utcnow()
        db.session.commit()

        # Send notifications to TD if buyer made selections
        if not is_td:
            try:
                from models.role import Role
                from utils.notification_utils import NotificationManager
                from socketio_server import send_notification_to_user

                td_role = Role.query.filter_by(role='Technical Director', is_deleted=False).first()
                if td_role:
                    from models.user import User
                    td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                    for td_user in td_users:
                        # Customize notification based on whether all materials are submitted
                        if all_materials_have_vendors:
                            notification_title = 'Purchase Order Ready for Approval'
                            notification_message = f'Buyer completed vendor selection for all materials in CR #{cr_id}. Ready for your approval.'
                        else:
                            notification_title = 'Vendor Selections Need Approval'
                            notification_message = f'Buyer selected vendors for {len(updated_materials)} material(s) in CR #{cr_id}'

                        notification = NotificationManager.create_notification(
                            user_id=td_user.user_id,
                            type='action_required',
                            title=notification_title,
                            message=notification_message,
                            priority='high',
                            category='purchase',
                            action_url=f'/technical-director/change-requests/{cr_id}',
                            action_label='Review Selections',
                            metadata={'cr_id': str(cr_id), 'materials_count': len(updated_materials)},
                            sender_id=user_id,
                            sender_name=user_name
                        )
                        send_notification_to_user(td_user.user_id, notification.to_dict())
            except Exception as notif_error:
                log.error(f"Failed to send notification: {notif_error}")

        # Determine appropriate message based on status
        if all_materials_have_vendors:
            if is_td:
                message = f"All materials approved! PO-{cr_id} is ready for purchase."
            else:
                message = f"All materials submitted for TD approval! PO-{cr_id} will be reviewed by Technical Director."
        else:
            message = f"Vendor(s) {'approved' if is_td else 'selected for TD approval'} for {len(updated_materials)} material(s)"

        return jsonify({
            "success": True,
            "message": message,
            "purchase": {
                "cr_id": cr.cr_id,
                "status": cr.status,
                "use_per_material_vendors": cr.use_per_material_vendors,
                "material_vendor_selections": cr.material_vendor_selections,
                "updated_materials": updated_materials,
                "all_materials_have_vendors": all_materials_have_vendors
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error selecting vendors for materials: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to select vendors: {str(e)}"}), 500


def create_sub_crs_for_vendor_groups(cr_id):
    """
    Create separate sub-CRs for each vendor group
    Used when buyer wants to send vendors separately with full details

    Each sub-CR will have:
    - parent_cr_id pointing to the original CR
    - cr_number_suffix like ".1", ".2", ".3"
    - is_sub_cr = True
    - Subset of materials for that vendor
    - Independent lifecycle (status, approvals, etc.)
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_groups = data.get('vendor_groups')  # Array of {vendor_id, vendor_name, materials: []}
        submission_group_id = data.get('submission_group_id')  # UUID to group these sub-CRs

        if not vendor_groups or not isinstance(vendor_groups, list):
            return jsonify({"error": "vendor_groups array is required"}), 400

        if not submission_group_id:
            # Generate UUID if not provided
            import uuid
            submission_group_id = str(uuid.uuid4())

        # Get the parent change request
        parent_cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not parent_cr:
            return jsonify({"error": "Parent purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        # Get effective user context for admin viewing as buyer
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for TD, Admin, or Admin viewing as Buyer)
        # Convert both to int for safe comparison (user_id from JWT may be string)
        assigned_buyer_id = int(parent_cr.assigned_to_buyer_user_id or 0)
        current_user_id = int(user_id)
        if not is_td and not is_admin and not is_admin_viewing and assigned_buyer_id != current_user_id:
            return jsonify({"error": f"This purchase is not assigned to you (assigned to buyer ID {assigned_buyer_id})"}), 403

        # Verify parent CR is in correct status
        # Allow 'assigned_to_buyer', 'send_to_buyer', and 'approved_by_pm' statuses
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm']
        if parent_cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot create sub-CRs. Parent CR status: {parent_cr.status}"}), 400

        # Create sub-CRs for each vendor group
        from models.vendor import Vendor
        created_sub_crs = []

        # Count existing sub-CRs to determine the next suffix number
        existing_sub_cr_count = ChangeRequest.query.filter_by(
            parent_cr_id=cr_id,
            is_deleted=False
        ).count()
        next_suffix_number = existing_sub_cr_count + 1

        for idx, vendor_group in enumerate(vendor_groups, start=next_suffix_number):
            vendor_id = vendor_group.get('vendor_id')
            vendor_name = vendor_group.get('vendor_name')
            materials = vendor_group.get('materials')  # Array of material selections

            if not vendor_id or not materials:
                continue

            # Verify vendor exists and is active
            vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
            if not vendor:
                return jsonify({"error": f"Vendor {vendor_id} not found"}), 404

            if vendor.status != 'active':
                return jsonify({"error": f"Vendor '{vendor.company_name}' is not active"}), 400

            # Extract materials data for this vendor group
            sub_cr_materials = []
            total_cost = 0.0

            for material in materials:
                material_name = material.get('material_name')
                quantity = material.get('quantity', 0)
                unit = material.get('unit', '')
                negotiated_price = material.get('negotiated_price')
                save_price_for_future = material.get('save_price_for_future', False)

                # Find the material from parent CR
                parent_material = None
                if parent_cr.materials_data:
                    for pm in parent_cr.materials_data:
                        if pm.get('material_name') == material_name:
                            parent_material = pm
                            break

                # Calculate price
                unit_price = negotiated_price if negotiated_price else (parent_material.get('unit_price', 0) if parent_material else 0)
                material_total = unit_price * quantity
                total_cost += material_total

                # Add to sub-CR materials
                sub_cr_materials.append({
                    'material_name': material_name,
                    'sub_item_name': parent_material.get('sub_item_name', '') if parent_material else '',
                    'quantity': quantity,
                    'unit': unit,
                    'unit_price': unit_price,
                    'total_price': material_total,
                    'master_material_id': parent_material.get('master_material_id') if parent_material else None
                })

            # Create the sub-CR
            # TD creating sub-CRs does NOT auto-approve - TD must manually click "Approve Vendor"
            sub_cr = ChangeRequest(
                boq_id=parent_cr.boq_id,
                project_id=parent_cr.project_id,
                requested_by_user_id=parent_cr.requested_by_user_id,
                requested_by_name=parent_cr.requested_by_name,
                requested_by_role=parent_cr.requested_by_role,
                request_type=parent_cr.request_type,
                justification=f"Sub-PO for vendor {vendor_name} - Split from PO-{cr_id}",
                status='pending_td_approval',  # Always pending - TD must manually approve
                approval_required_from='technical_director',  # Set approval_required_from to TD
                item_id=parent_cr.item_id,
                item_name=parent_cr.item_name,
                sub_item_id=parent_cr.sub_item_id,
                sub_items_data=sub_cr_materials,
                materials_data=sub_cr_materials,
                materials_total_cost=total_cost,
                assigned_to_buyer_user_id=parent_cr.assigned_to_buyer_user_id,
                assigned_to_buyer_name=parent_cr.assigned_to_buyer_name,
                assigned_to_buyer_date=parent_cr.assigned_to_buyer_date,
                # Vendor selection already done
                selected_vendor_id=vendor_id,
                selected_vendor_name=vendor.company_name,
                vendor_selected_by_buyer_id=user_id,
                vendor_selected_by_buyer_name=user_name,
                vendor_selection_date=datetime.utcnow(),
                vendor_selection_status='pending_td_approval',  # Always pending - TD must manually approve
                # Sub-CR specific fields
                parent_cr_id=parent_cr.cr_id,
                cr_number_suffix=f".{idx}",
                is_sub_cr=True,
                submission_group_id=submission_group_id,
                use_per_material_vendors=False,  # Sub-CR uses single vendor
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            # Note: TD must manually approve even when TD creates sub-CRs
            # No auto-approval here

            db.session.add(sub_cr)
            db.session.flush()  # Get the cr_id

            created_sub_crs.append({
                'cr_id': sub_cr.cr_id,
                'formatted_cr_id': sub_cr.get_formatted_cr_id(),
                'vendor_id': vendor_id,
                'vendor_name': vendor_name,
                'materials_count': len(sub_cr_materials),
                'total_cost': total_cost
            })

        # Check if ALL materials from parent CR have been sent to sub-CRs
        # Get all sub-CRs for this parent (including newly created ones)
        all_sub_crs = ChangeRequest.query.filter_by(
            parent_cr_id=parent_cr.cr_id,
            is_deleted=False
        ).all()

        # Collect all material names that are in sub-CRs
        materials_in_sub_crs = set()
        for sub_cr in all_sub_crs:
            if sub_cr.materials_data:
                for material in sub_cr.materials_data:
                    material_name = material.get('material_name')
                    if material_name:
                        materials_in_sub_crs.add(material_name)

        # Collect all material names from parent CR
        parent_materials = set()
        if parent_cr.materials_data:
            for material in parent_cr.materials_data:
                material_name = material.get('material_name')
                if material_name:
                    parent_materials.add(material_name)

        # Only mark parent as 'split_to_sub_crs' if ALL materials are now in sub-CRs
        if parent_materials and materials_in_sub_crs >= parent_materials:
            # All materials sent - mark parent as split
            parent_cr.status = 'split_to_sub_crs'
            parent_cr.updated_at = datetime.utcnow()
        else:
            # Some materials still not sent - keep parent as 'assigned_to_buyer'
            unsent_materials = parent_materials - materials_in_sub_crs

        db.session.commit()

        # Send notifications to TD if buyer created sub-CRs
        if not is_td:
            try:
                from models.role import Role
                from utils.notification_utils import NotificationManager
                from socketio_server import send_notification_to_user

                td_role = Role.query.filter_by(role='Technical Director', is_deleted=False).first()
                if td_role:
                    from models.user import User
                    td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                    for td_user in td_users:
                        notification = NotificationManager.create_notification(
                            user_id=td_user.user_id,
                            type='action_required',
                            title=f'{len(created_sub_crs)} Purchase Orders Need Approval',
                            message=f'Buyer created {len(created_sub_crs)} separate purchase orders from PO-{cr_id}. Each needs approval.',
                            priority='high',
                            category='purchase',
                            action_url=f'/technical-director/change-requests',
                            action_label='Review Purchase Orders',
                            metadata={'parent_cr_id': str(cr_id), 'sub_crs_count': len(created_sub_crs), 'submission_group_id': submission_group_id},
                            sender_id=user_id,
                            sender_name=user_name
                        )
                        send_notification_to_user(td_user.user_id, notification.to_dict())
            except Exception as notif_error:
                log.error(f"Failed to send notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": f"Successfully created {len(created_sub_crs)} separate purchase orders!",
            "parent_cr_id": parent_cr.cr_id,
            "submission_group_id": submission_group_id,
            "sub_crs": created_sub_crs
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating sub-CRs: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to create sub-CRs: {str(e)}"}), 500


def create_po_children(cr_id):
    """
    Create POChild records for each vendor group.
    Replaces the deprecated create_sub_crs_for_vendor_groups() function.

    Each POChild will have:
    - parent_cr_id pointing to the original CR
    - suffix like ".1", ".2", ".3"
    - Subset of materials for that vendor
    - Independent lifecycle (vendor approval, purchase tracking)
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_name = current_user.get('full_name', 'Unknown User')
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_groups = data.get('vendor_groups')  # Array of {vendor_id, vendor_name, materials: []}
        submission_group_id = data.get('submission_group_id')  # UUID to group these PO children

        if not vendor_groups or not isinstance(vendor_groups, list):
            return jsonify({"error": "vendor_groups array is required"}), 400

        if not submission_group_id:
            import uuid
            submission_group_id = str(uuid.uuid4())

        # Get the parent change request
        parent_cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not parent_cr:
            return jsonify({"error": "Parent purchase not found"}), 404

        # Check role-based permissions
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        # Get effective user context for admin viewing as buyer
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for TD, Admin, or Admin viewing as Buyer)
        assigned_buyer_id = int(parent_cr.assigned_to_buyer_user_id or 0)
        current_user_id = int(user_id)
        if not is_td and not is_admin and not is_admin_viewing and assigned_buyer_id != current_user_id:
            return jsonify({"error": f"This purchase is not assigned to you (assigned to buyer ID {assigned_buyer_id})"}), 403

        # Verify parent CR is in correct status
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm']
        if parent_cr.status not in allowed_statuses:
            return jsonify({"error": f"Cannot create PO children. Parent CR status: {parent_cr.status}"}), 400

        # Create POChild records for each vendor group
        created_po_children = []

        # Count existing POChild records to determine next suffix
        existing_po_child_count = POChild.query.filter_by(
            parent_cr_id=cr_id,
            is_deleted=False
        ).count()
        next_suffix_number = existing_po_child_count + 1

        for idx, vendor_group in enumerate(vendor_groups, start=next_suffix_number):
            vendor_id = vendor_group.get('vendor_id')
            vendor_name = vendor_group.get('vendor_name')
            materials = vendor_group.get('materials')

            if not vendor_id or not materials:
                continue

            # Verify vendor exists and is active
            vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
            if not vendor:
                return jsonify({"error": f"Vendor {vendor_id} not found"}), 404

            if vendor.status != 'active':
                return jsonify({"error": f"Vendor '{vendor.company_name}' is not active"}), 400

            # Extract materials data for this vendor group
            po_materials = []
            total_cost = 0.0

            for material in materials:
                material_name = material.get('material_name')
                quantity = material.get('quantity', 0)
                unit = material.get('unit', '')
                negotiated_price = material.get('negotiated_price')

                # Find the material from parent CR
                parent_material = None
                if parent_cr.materials_data:
                    for pm in parent_cr.materials_data:
                        if pm.get('material_name') == material_name:
                            parent_material = pm
                            break

                # Calculate price
                unit_price = negotiated_price if negotiated_price else (parent_material.get('unit_price', 0) if parent_material else 0)
                material_total = unit_price * quantity
                total_cost += material_total

                po_materials.append({
                    'material_name': material_name,
                    'sub_item_name': parent_material.get('sub_item_name', '') if parent_material else '',
                    'quantity': quantity,
                    'unit': unit,
                    'unit_price': unit_price,
                    'total_price': material_total,
                    'master_material_id': parent_material.get('master_material_id') if parent_material else None
                })

            # Create the POChild record
            po_child = POChild(
                parent_cr_id=parent_cr.cr_id,
                suffix=f".{idx}",
                boq_id=parent_cr.boq_id,
                project_id=parent_cr.project_id,
                item_id=parent_cr.item_id,
                item_name=parent_cr.item_name,
                submission_group_id=submission_group_id,
                materials_data=po_materials,
                materials_total_cost=total_cost,
                vendor_id=vendor_id,
                vendor_name=vendor.company_name,
                vendor_selected_by_buyer_id=user_id,
                vendor_selected_by_buyer_name=user_name,
                vendor_selection_date=datetime.utcnow(),
                vendor_selection_status='pending_td_approval',
                status='pending_td_approval',
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            db.session.add(po_child)
            db.session.flush()  # Get the id

            created_po_children.append({
                'id': po_child.id,
                'formatted_id': po_child.get_formatted_id(),
                'vendor_id': vendor_id,
                'vendor_name': vendor.company_name,
                'materials_count': len(po_materials),
                'total_cost': total_cost
            })

        # Check if ALL materials from parent CR have been assigned to PO children
        all_po_children = POChild.query.filter_by(
            parent_cr_id=parent_cr.cr_id,
            is_deleted=False
        ).all()

        materials_in_po_children = set()
        for po_child in all_po_children:
            if po_child.materials_data:
                for material in po_child.materials_data:
                    material_name = material.get('material_name')
                    if material_name:
                        materials_in_po_children.add(material_name)

        parent_materials = set()
        if parent_cr.materials_data:
            for material in parent_cr.materials_data:
                material_name = material.get('material_name')
                if material_name:
                    parent_materials.add(material_name)

        # Mark parent as 'split_to_po_children' if all materials assigned
        if parent_materials and materials_in_po_children >= parent_materials:
            parent_cr.status = 'split_to_sub_crs'  # Keep same status name for compatibility
            parent_cr.updated_at = datetime.utcnow()

        db.session.commit()

        # Send notifications to TD if buyer created PO children
        if not is_td:
            try:
                from models.role import Role
                from utils.notification_utils import NotificationManager
                from socketio_server import send_notification_to_user

                td_role = Role.query.filter_by(role='Technical Director', is_deleted=False).first()
                if td_role:
                    from models.user import User
                    td_users = User.query.filter_by(role_id=td_role.role_id, is_deleted=False, is_active=True).all()
                    for td_user in td_users:
                        notification = NotificationManager.create_notification(
                            user_id=td_user.user_id,
                            type='action_required',
                            title=f'{len(created_po_children)} Purchase Orders Need Approval',
                            message=f'Buyer created {len(created_po_children)} separate purchase orders from PO-{cr_id}. Each needs approval.',
                            priority='high',
                            category='purchase',
                            action_url=f'/technical-director/change-requests',
                            action_label='Review Purchase Orders',
                            metadata={'parent_cr_id': str(cr_id), 'po_children_count': len(created_po_children), 'submission_group_id': submission_group_id},
                            sender_id=user_id,
                            sender_name=user_name
                        )
                        send_notification_to_user(td_user.user_id, notification.to_dict())
            except Exception as notif_error:
                log.error(f"Failed to send notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": f"Successfully created {len(created_po_children)} separate purchase orders!",
            "parent_cr_id": parent_cr.cr_id,
            "submission_group_id": submission_group_id,
            "po_children": created_po_children
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to create PO children: {str(e)}"}), 500


def update_purchase_order(cr_id):
    """Update purchase order materials and costs"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

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

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for admin)
        if not is_admin and not is_admin_viewing and cr.assigned_to_buyer_user_id != buyer_id:
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
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        notes = data.get('notes', '')

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer or completed by this buyer (skip check for admin)
        if not is_admin and not is_admin_viewing and cr.assigned_to_buyer_user_id != buyer_id and cr.purchase_completed_by_user_id != buyer_id:
            return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Update notes
        cr.purchase_notes = notes
        cr.updated_at = datetime.utcnow()

        db.session.commit()

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

        # Send notification to buyer about vendor approval
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            if cr.created_by:
                notification = NotificationManager.create_notification(
                    user_id=cr.created_by,
                    type='approval',
                    title='Vendor Selection Approved',
                    message=f'TD approved vendor "{cr.selected_vendor_name}" for materials purchase: {cr.item_name or "Materials Request"}',
                    priority='high',
                    category='vendor',
                    action_url=f'/buyer/change-requests?cr_id={cr_id}',
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

        # Send notification to buyer about vendor rejection
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            if cr.created_by:
                notification = NotificationManager.create_notification(
                    user_id=cr.created_by,
                    type='rejection',
                    title='Vendor Selection Rejected',
                    message=f'TD rejected vendor selection for materials purchase: {cr.item_name or "Materials Request"}. Reason: {reason}',
                    priority='high',
                    category='vendor',
                    action_required=True,
                    action_url=f'/buyer/change-requests?cr_id={cr_id}',
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


def td_approve_po_child(po_child_id):
    """TD approves vendor selection for POChild"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        # Get the PO child
        po_child = POChild.query.filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Verify vendor selection is pending approval
        if po_child.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {po_child.vendor_selection_status}"}), 400

        # Approve the vendor selection
        po_child.vendor_selection_status = 'approved'
        po_child.status = 'vendor_approved'
        po_child.vendor_approved_by_td_id = td_id
        po_child.vendor_approved_by_td_name = td_name
        po_child.vendor_approval_date = datetime.utcnow()
        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Send notification to buyer about vendor approval
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            if po_child.vendor_selected_by_buyer_id:
                notification = NotificationManager.create_notification(
                    user_id=po_child.vendor_selected_by_buyer_id,
                    type='approval',
                    title='Vendor Selection Approved',
                    message=f'TD approved vendor "{po_child.vendor_name}" for {po_child.get_formatted_id()}',
                    priority='high',
                    category='vendor',
                    action_url=f'/buyer/purchases',
                    action_label='Proceed with Purchase',
                    metadata={
                        'po_child_id': str(po_child_id),
                        'vendor_name': po_child.vendor_name,
                        'vendor_id': str(po_child.vendor_id) if po_child.vendor_id else None
                    },
                    sender_id=td_id,
                    sender_name=td_name
                )
                send_notification_to_user(po_child.vendor_selected_by_buyer_id, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor approval notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection approved successfully",
            "po_child": po_child.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error approving PO child vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to approve vendor: {str(e)}"}), 500


def td_reject_po_child(po_child_id):
    """TD rejects vendor selection for POChild"""
    try:
        current_user = g.user
        td_id = current_user['user_id']
        td_name = current_user.get('full_name', 'Unknown TD')

        data = request.get_json()
        reason = data.get('reason', '')

        if not reason:
            return jsonify({"error": "Rejection reason is required"}), 400

        # Get the PO child
        po_child = POChild.query.filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Verify vendor selection is pending approval
        if po_child.vendor_selection_status != 'pending_td_approval':
            return jsonify({"error": f"Vendor selection not pending approval. Status: {po_child.vendor_selection_status}"}), 400

        # Reject the vendor selection
        po_child.vendor_selection_status = 'td_rejected'
        po_child.status = 'td_rejected'
        po_child.vendor_approved_by_td_id = td_id
        po_child.vendor_approved_by_td_name = td_name
        po_child.vendor_approval_date = datetime.utcnow()
        po_child.rejection_reason = reason

        # Clear vendor selection so buyer can select a new vendor
        po_child.vendor_id = None
        po_child.vendor_name = None
        po_child.vendor_selected_by_buyer_id = None
        po_child.vendor_selected_by_buyer_name = None
        po_child.vendor_selection_date = None

        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Send notification to buyer about vendor rejection
        try:
            from utils.notification_utils import NotificationManager
            from socketio_server import send_notification_to_user

            if po_child.vendor_selected_by_buyer_id:
                notification = NotificationManager.create_notification(
                    user_id=po_child.vendor_selected_by_buyer_id,
                    type='rejection',
                    title='Vendor Selection Rejected',
                    message=f'TD rejected vendor selection for {po_child.get_formatted_id()}. Reason: {reason}',
                    priority='high',
                    category='vendor',
                    action_required=True,
                    action_url=f'/buyer/purchases',
                    action_label='Select New Vendor',
                    metadata={
                        'po_child_id': str(po_child_id),
                        'rejection_reason': reason
                    },
                    sender_id=td_id,
                    sender_name=td_name
                )
                send_notification_to_user(po_child.vendor_selected_by_buyer_id, notification.to_dict())
        except Exception as notif_error:
            log.error(f"Failed to send vendor rejection notification: {notif_error}")

        return jsonify({
            "success": True,
            "message": "Vendor selection rejected",
            "po_child": po_child.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error rejecting PO child vendor: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to reject vendor: {str(e)}"}), 500


def complete_po_child_purchase(po_child_id):
    """Mark a POChild purchase as complete"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        buyer_name = current_user.get('full_name', 'Unknown Buyer')
        user_role = current_user.get('role', '').lower()

        data = request.get_json() or {}
        notes = data.get('notes', '')

        # Get the PO child
        po_child = POChild.query.filter_by(
            id=po_child_id,
            is_deleted=False
        ).first()

        if not po_child:
            return jsonify({"error": "PO Child not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (via parent CR)
        parent_cr = po_child.parent_cr
        if parent_cr and not is_admin and not is_admin_viewing:
            if parent_cr.assigned_to_buyer_user_id != buyer_id:
                return jsonify({"error": "This purchase is not assigned to you"}), 403

        # Verify it's in the correct status
        if po_child.status != 'vendor_approved':
            return jsonify({"error": f"Purchase cannot be completed. Current status: {po_child.status}"}), 400

        # Update the PO child
        po_child.status = 'purchase_completed'
        po_child.purchase_completed_by_user_id = buyer_id
        po_child.purchase_completed_by_name = buyer_name
        po_child.purchase_completion_date = datetime.utcnow()
        po_child.updated_at = datetime.utcnow()

        db.session.commit()

        # Check if all PO children for parent CR are completed
        all_po_children = POChild.query.filter_by(
            parent_cr_id=po_child.parent_cr_id,
            is_deleted=False
        ).all()

        all_completed = all(pc.status == 'purchase_completed' for pc in all_po_children)

        # If all completed, update parent CR status
        if all_completed and parent_cr:
            parent_cr.status = 'purchase_completed'
            parent_cr.purchase_completed_by_user_id = buyer_id
            parent_cr.purchase_completed_by_name = buyer_name
            parent_cr.purchase_completion_date = datetime.utcnow()
            parent_cr.updated_at = datetime.utcnow()
            db.session.commit()

        return jsonify({
            "success": True,
            "message": "Purchase marked as complete successfully",
            "po_child": po_child.to_dict(),
            "all_po_children_completed": all_completed
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error completing PO child purchase: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to complete purchase: {str(e)}"}), 500


def get_pending_po_children():
    """Get all POChild records pending TD approval"""
    try:
        current_user = g.user
        user_role = current_user.get('role', '').lower()

        # Check if TD or admin
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        if not is_td and not is_admin:
            return jsonify({"error": "Access denied. TD or Admin role required."}), 403

        # Get all POChild records pending TD approval
        pending_po_children = POChild.query.filter_by(
            vendor_selection_status='pending_td_approval',
            is_deleted=False
        ).all()

        result = []
        for po_child in pending_po_children:
            # Get parent CR
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id) if po_child.parent_cr_id else None

            # Get project details
            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            # Get BOQ details
            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            result.append({
                **po_child.to_dict(),
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None
            })

        return jsonify({
            "success": True,
            "pending_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching pending PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch pending PO children: {str(e)}"}), 500


def get_buyer_pending_po_children():
    """Get POChild records pending TD approval for the current buyer"""
    try:
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role_name', current_user.get('role', '')).lower()

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        if user_role == 'admin':
            is_admin_viewing = True

        # Get POChildren where parent CR is assigned to this buyer and pending TD approval
        if is_admin_viewing:
            pending_po_children = POChild.query.filter(
                POChild.vendor_selection_status == 'pending_td_approval',
                POChild.is_deleted == False
            ).all()
        else:
            pending_po_children = POChild.query.join(
                ChangeRequest, POChild.parent_cr_id == ChangeRequest.cr_id
            ).filter(
                POChild.vendor_selection_status == 'pending_td_approval',
                POChild.is_deleted == False,
                ChangeRequest.assigned_to_buyer_user_id == user_id
            ).all()

        result = []
        for po_child in pending_po_children:
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id) if po_child.parent_cr_id else None

            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            result.append({
                **po_child.to_dict(),
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None
            })

        return jsonify({
            "success": True,
            "pending_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching buyer pending PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch pending PO children: {str(e)}"}), 500


def get_approved_po_children():
    """Get all POChild records with approved vendor selection (for buyer to complete purchase)"""
    try:
        from utils.admin_viewing_context import get_effective_user_context

        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role_name', current_user.get('role', '')).lower()

        log.info(f"get_approved_po_children called by user {user_id}, role: '{user_role}'")

        # Check roles
        is_buyer = user_role == 'buyer'
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_admin = user_role == 'admin'

        log.info(f"Role check: is_buyer={is_buyer}, is_td={is_td}, is_admin={is_admin}")

        # Check if admin is viewing as buyer
        context = get_effective_user_context()
        is_admin_viewing = context['is_admin_viewing']

        if user_role == 'admin':
            is_admin_viewing = True

        if not is_buyer and not is_td and not is_admin:
            return jsonify({"error": "Access denied. Buyer, TD, or Admin role required."}), 403

        # Get all POChild records with approved vendor selection (not yet completed)
        approved_po_children = POChild.query.filter(
            POChild.vendor_selection_status == 'approved',
            POChild.status != 'purchase_completed',
            POChild.is_deleted == False
        ).all()

        log.info(f"Found {len(approved_po_children)} approved PO children in database")

        result = []
        for po_child in approved_po_children:
            # Get parent CR to check buyer assignment
            parent_cr = ChangeRequest.query.get(po_child.parent_cr_id)

            # For buyer, only show PO children for CRs assigned to them (unless admin viewing)
            if is_buyer and not is_admin_viewing:
                if not parent_cr or parent_cr.assigned_to_buyer_user_id != user_id:
                    continue

            # Get project details
            project = None
            if po_child.project_id:
                project = Project.query.get(po_child.project_id)
            elif parent_cr:
                project = Project.query.get(parent_cr.project_id)

            # Get BOQ details
            boq = None
            if po_child.boq_id:
                boq = BOQ.query.get(po_child.boq_id)
            elif parent_cr and parent_cr.boq_id:
                boq = BOQ.query.get(parent_cr.boq_id)

            result.append({
                **po_child.to_dict(),
                'project_name': project.project_name if project else 'Unknown',
                'project_code': project.project_code if project else None,
                'client': project.client if project else None,
                'location': project.location if project else None,
                'boq_name': boq.boq_name if boq else None,
                'item_name': po_child.item_name or (parent_cr.item_name if parent_cr else None),
                'parent_cr_formatted_id': f"PO-{parent_cr.cr_id}" if parent_cr else None
            })

        log.info(f"Returning {len(result)} approved PO children to user {user_id} (role: {user_role})")

        return jsonify({
            "success": True,
            "approved_count": len(result),
            "po_children": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching approved PO children: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to fetch approved PO children: {str(e)}"}), 500


def preview_vendor_email(cr_id):
    """Preview vendor purchase order email"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get the change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer or completed by this buyer (skip check for admin)
        if not is_admin and not is_admin_viewing and cr.assigned_to_buyer_user_id != buyer_id and cr.purchase_completed_by_user_id != buyer_id:
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

        # Process materials with negotiated prices
        materials_list, cr_total = process_materials_with_negotiated_prices(cr)

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


def preview_po_child_vendor_email(po_child_id):
    """Preview vendor purchase order email for POChild (vendor-split purchases)"""
    try:
        from models.po_child import POChild
        from models.vendor import Vendor
        from utils.boq_email_service import BOQEmailService

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        # Get the POChild record
        po_child = POChild.query.filter_by(id=po_child_id, is_deleted=False).first()
        if not po_child:
            return jsonify({"error": "Purchase order child not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Check if vendor is selected
        if not po_child.vendor_id:
            return jsonify({"error": "No vendor selected for this purchase"}), 400

        # Get vendor details
        vendor = Vendor.query.filter_by(vendor_id=po_child.vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Get parent CR for project info
        parent_cr = ChangeRequest.query.filter_by(cr_id=po_child.parent_cr_id).first()
        if not parent_cr:
            return jsonify({"error": "Parent purchase order not found"}), 404

        # Get project details
        project = Project.query.get(parent_cr.project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get buyer details
        buyer = User.query.filter_by(user_id=buyer_id).first()

        # Process materials from POChild's materials_data
        materials_list = []
        total_cost = 0
        if po_child.materials_data:
            for material in po_child.materials_data:
                mat_total = float(material.get('total_price', 0) or 0)
                materials_list.append({
                    'material_name': material.get('material_name', 'N/A'),
                    'quantity': material.get('quantity', 0),
                    'unit': material.get('unit', 'pcs'),
                    'unit_price': material.get('unit_price', 0),
                    'total_price': round(mat_total, 2)
                })
                total_cost += mat_total

        # Prepare data for email template
        vendor_data = {
            'company_name': vendor.company_name or 'N/A',
            'contact_person_name': vendor.contact_person_name or '',
            'email': vendor.email or 'N/A'
        }

        purchase_data = {
            'cr_id': po_child.parent_cr_id,
            'po_child_id': po_child.id,
            'formatted_id': po_child.get_formatted_id(),
            'materials': materials_list,
            'total_cost': round(total_cost, 2)
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

        # Get uploaded files from parent CR
        uploaded_files = []
        if parent_cr.file_path:
            filenames = [f.strip() for f in parent_cr.file_path.split(",") if f.strip()]
            for filename in filenames:
                file_path = f"buyer/cr_{parent_cr.cr_id}/{filename}"
                file_size = None
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
        email_service = BOQEmailService()
        email_html = email_service.generate_vendor_purchase_order_email(
            vendor_data, purchase_data, buyer_data, project_data
        )

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
        log.error(f"Error generating POChild email preview: {str(e)}")
        return jsonify({"error": f"Failed to generate email preview: {str(e)}"}), 500


def send_vendor_email(cr_id):
    """Send purchase order email to vendor with optional LPO PDF attachment"""
    try:
        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        vendor_email = data.get('vendor_email')
        custom_email_body = data.get('custom_email_body')  # Optional custom HTML body
        vendor_company_name = data.get('vendor_company_name')  # Update company name
        vendor_contact_person = data.get('vendor_contact_person')  # Update contact person
        vendor_phone = data.get('vendor_phone')  # Update phone

        # LPO PDF options
        include_lpo_pdf = data.get('include_lpo_pdf', False)  # Whether to attach LPO PDF
        lpo_data = data.get('lpo_data')  # Editable LPO data from frontend

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

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify it's assigned to this buyer (skip check for admin)
        if not is_admin and not is_admin_viewing and cr.assigned_to_buyer_user_id != buyer_id:
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

        # Process materials with negotiated prices
        materials_list, cr_total = process_materials_with_negotiated_prices(cr)

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
                        else:
                            log.warning(f"Could not download file: {filename} for CR-{cr_id}")

                    except Exception as e:
                        log.error(f"Error downloading file {filename}: {str(e)}")
                        # Continue with other files even if one fails
                        continue

            except Exception as e:
                log.error(f"Error processing attachments for CR-{cr_id}: {str(e)}")

        # Generate and attach LPO PDF if requested
        if include_lpo_pdf and lpo_data:
            try:
                from utils.lpo_pdf_generator import LPOPDFGenerator
                generator = LPOPDFGenerator()
                pdf_bytes = generator.generate_lpo_pdf(lpo_data)

                # Create filename for LPO PDF
                project_name_clean = project.project_name.replace(' ', '_')[:20] if project else 'Project'
                lpo_filename = f"LPO-{cr_id}-{project_name_clean}.pdf"

                # Add LPO PDF to attachments
                attachments.append((lpo_filename, pdf_bytes, 'application/pdf'))
                log.info(f"LPO PDF generated and attached: {lpo_filename}")
            except Exception as e:
                log.error(f"Error generating LPO PDF for CR-{cr_id}: {str(e)}")
                # Continue sending email even if LPO PDF generation fails

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
            message = f"Purchase order email sent to {len(email_list)} recipient(s) successfully" if len(email_list) > 1 else "Purchase order email sent to vendor successfully"
            # Count recipients for response message
            if isinstance(vendor_email, str):
                recipient_count = len([e.strip() for e in vendor_email.split(',') if e.strip()])
            else:
                recipient_count = len(vendor_email) if isinstance(vendor_email, list) else 1

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


def send_po_child_vendor_email(po_child_id):
    """Send purchase order email to vendor for POChild (vendor-split purchases)"""
    try:
        from utils.boq_email_service import BOQEmailService
        from datetime import datetime
        from models.po_child import POChild
        from models.vendor import Vendor
        import re

        current_user = g.user
        buyer_id = current_user['user_id']
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')

        data = request.get_json()
        vendor_email = data.get('vendor_email')
        custom_email_body = data.get('custom_email_body')
        vendor_company_name = data.get('vendor_company_name')
        vendor_contact_person = data.get('vendor_contact_person')
        vendor_phone = data.get('vendor_phone')

        if not vendor_email:
            return jsonify({"error": "Vendor email is required"}), 400

        # Parse comma-separated emails
        email_list = [email.strip() for email in vendor_email.split(',') if email.strip()]

        # Validate each email
        email_regex = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
        invalid_emails = [email for email in email_list if not email_regex.match(email)]

        if invalid_emails:
            return jsonify({"error": f"Invalid email address: {invalid_emails[0]}"}), 400

        if not email_list:
            return jsonify({"error": "At least one valid email address is required"}), 400

        # Get the POChild record
        po_child = POChild.query.filter_by(id=po_child_id, is_deleted=False).first()
        if not po_child:
            return jsonify({"error": "Purchase order child not found"}), 404

        # Check if admin or admin viewing as buyer
        is_admin = user_role == 'admin'
        from utils.admin_viewing_context import get_effective_user_context
        user_context = get_effective_user_context()
        is_admin_viewing = user_context.get('is_admin_viewing', False)

        # Verify vendor is selected and approved
        if not po_child.vendor_id:
            return jsonify({"error": "No vendor selected for this purchase"}), 400

        if po_child.vendor_selection_status != 'approved':
            return jsonify({"error": "Vendor selection must be approved by TD before sending email"}), 400

        # Get vendor details
        vendor = Vendor.query.filter_by(vendor_id=po_child.vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Update vendor details in vendors table if provided
        if vendor_company_name and vendor_company_name != vendor.company_name:
            vendor.company_name = vendor_company_name
        if vendor_contact_person and vendor_contact_person != vendor.contact_person_name:
            vendor.contact_person_name = vendor_contact_person
        if vendor_phone and vendor_phone != vendor.phone:
            sanitized_phone = vendor_phone.strip()
            while sanitized_phone.count('+971') > 1:
                sanitized_phone = sanitized_phone.replace('+971 ', '', 1)
            sanitized_phone = sanitized_phone[:20]
            vendor.phone = sanitized_phone
        if vendor_email and vendor_email != vendor.email:
            vendor.email = vendor_email

        # Get buyer details
        buyer = User.query.filter_by(user_id=buyer_id).first()
        if not buyer:
            return jsonify({"error": "Buyer not found"}), 404

        # Get parent CR for project info
        parent_cr = ChangeRequest.query.filter_by(cr_id=po_child.parent_cr_id).first()
        if not parent_cr:
            return jsonify({"error": "Parent purchase order not found"}), 404

        # Get project details
        project = Project.query.get(parent_cr.project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        # Get BOQ details (optional for POChild)
        boq = None
        if po_child.boq_id:
            boq = BOQ.query.filter_by(boq_id=po_child.boq_id).first()

        # Process materials from POChild's materials_data
        materials_list = []
        total_cost = 0
        if po_child.materials_data:
            for material in po_child.materials_data:
                mat_total = float(material.get('total_price', 0) or 0)
                materials_list.append({
                    'material_name': material.get('material_name', 'N/A'),
                    'quantity': material.get('quantity', 0),
                    'unit': material.get('unit', 'pcs'),
                    'unit_price': material.get('unit_price', 0),
                    'total_price': round(mat_total, 2)
                })
                total_cost += mat_total

        # Prepare data for email template
        vendor_data = {
            'company_name': vendor.company_name,
            'contact_person_name': vendor.contact_person_name,
            'email': email_list[0]
        }

        purchase_data = {
            'cr_id': po_child.parent_cr_id,
            'po_child_id': po_child.id,
            'formatted_id': po_child.get_formatted_id(),
            'materials': materials_list,
            'total_cost': round(total_cost, 2)
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

        # Fetch uploaded files from Supabase if available (use parent CR's files)
        attachments = []
        if parent_cr.file_path:
            try:
                filenames = [f.strip() for f in parent_cr.file_path.split(",") if f.strip()]
                for filename in filenames:
                    try:
                        file_path = f"buyer/cr_{parent_cr.cr_id}/{filename}"
                        file_response = supabase.storage.from_(SUPABASE_BUCKET).download(file_path)
                        if file_response:
                            ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
                            mime_types = {
                                'pdf': 'application/pdf',
                                'doc': 'application/msword',
                                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                'xls': 'application/vnd.ms-excel',
                                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                'png': 'image/png',
                                'jpg': 'image/jpeg',
                                'jpeg': 'image/jpeg',
                                'zip': 'application/zip'
                            }
                            mime_type = mime_types.get(ext, 'application/octet-stream')
                            attachments.append((filename, file_response, mime_type))
                    except Exception as e:
                        log.warning(f"Could not download file {filename}: {str(e)}")
                        continue
            except Exception as e:
                log.error(f"Error processing attachments: {str(e)}")

        # Send email
        email_service = BOQEmailService()
        email_sent = email_service.send_vendor_purchase_order_async(
            email_list, vendor_data, purchase_data, buyer_data, project_data, custom_email_body, attachments
        )

        if email_sent:
            # Mark email as sent on POChild
            po_child.vendor_email_sent = True
            po_child.vendor_email_sent_date = datetime.utcnow()
            po_child.updated_at = datetime.utcnow()
            db.session.commit()

            recipient_count = len(email_list)
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
        log.error(f"Error sending POChild vendor email: {str(e)}")
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


def get_vendor_selection_data(cr_id):
    """
    Optimized endpoint for vendor selection modal
    Returns only essential fields (78% smaller payload)

    GET /api/buyer/purchase/{cr_id}/vendor-selection

    Returns:
    - cr_id, boq_id, project_id
    - materials list (from sub_items_data)
    - vendor selection details
    - overhead warning (if applicable)
    - per-material vendor selections (if enabled)
    """
    try:
        current_user = g.user
        user_role = current_user.get('role', '').lower().replace('_', '').replace(' ', '')

        # Allow buyer, TD, or admin
        if not any(role in user_role for role in ['buyer', 'technicaldirector', 'admin']):
            return jsonify({"error": "Access denied. Buyer, TD, or Admin role required."}), 403

        # Get change request
        cr = ChangeRequest.query.filter_by(
            cr_id=cr_id,
            is_deleted=False
        ).first()

        if not cr:
            return jsonify({"error": "Purchase order not found"}), 404

        # Get project and BOQ info
        project = Project.query.filter_by(project_id=cr.project_id).first()
        boq = BOQ.query.filter_by(boq_id=cr.boq_id).first()

        # Prepare materials list (use sub_items_data, NOT materials_data)
        materials = cr.sub_items_data if cr.sub_items_data else cr.materials_data

        # Calculate materials count
        materials_count = len(materials) if materials else 0

        # Prepare vendor selection data
        vendor_data = {
            'selected_vendor_id': cr.selected_vendor_id,
            'selected_vendor_name': cr.selected_vendor_name,
            'vendor_selection_status': cr.vendor_selection_status,
            'vendor_selected_by_buyer_id': cr.vendor_selected_by_buyer_id,
            'vendor_selected_by_buyer_name': cr.vendor_selected_by_buyer_name,
            'vendor_selection_date': cr.vendor_selection_date.isoformat() if cr.vendor_selection_date else None,
            'vendor_approved_by_td_id': cr.vendor_approved_by_td_id,
            'vendor_approved_by_td_name': cr.vendor_approved_by_td_name,
            'vendor_approval_date': cr.vendor_approval_date.isoformat() if cr.vendor_approval_date else None,
            'vendor_rejection_reason': cr.vendor_rejection_reason,
            # Per-material vendor selection support
            'use_per_material_vendors': cr.use_per_material_vendors,
            'material_vendor_selections': cr.material_vendor_selections if cr.material_vendor_selections else {}
        }

        # Overhead warning removed - columns dropped from database
        overhead_warning = None

        # Return optimized response (only 18-20 fields instead of 82)
        return jsonify({
            'success': True,
            # Core identifiers
            'cr_id': cr.cr_id,
            'boq_id': cr.boq_id,
            'project_id': cr.project_id,
            'status': cr.status,
            # Display info
            'project_name': project.project_name if project else None,
            'boq_name': boq.boq_name if boq else None,
            'item_name': cr.item_name,
            'item_id': cr.item_id,
            # Materials (from sub_items_data)
            'materials': materials,
            'materials_count': materials_count,
            'total_cost': round(cr.materials_total_cost, 2) if cr.materials_total_cost else 0,
            # Vendor selection
            'vendor': vendor_data,
            # Overhead warning (only if applicable)
            'overhead_warning': overhead_warning,
            # Metadata
            'created_at': cr.created_at.isoformat() if cr.created_at else None
        }), 200

    except Exception as e:
        log.error(f"Error getting vendor selection data for CR {cr_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to get vendor selection data: {str(e)}"}), 500


def update_vendor_price(vendor_id):
    """
    Update vendor product price (immediate price negotiation).
    Supports two modes:
    1. Save for This BOQ: Updates material_vendor_selections for the CR
    2. Save for Future: Updates vendor_products.unit_price in database
    """
    try:
        current_user = g.user
        user_id = current_user['user_id']
        user_role = current_user.get('role', '').lower()

        data = request.get_json()
        material_name = data.get('material_name')
        new_price = data.get('new_price')
        save_for_future = data.get('save_for_future', False)
        cr_id = data.get('cr_id')  # Optional: CR to save negotiated price to

        if not material_name or new_price is None:
            return jsonify({"error": "material_name and new_price are required"}), 400

        # Validate new_price
        try:
            new_price = float(new_price)
            if new_price <= 0:
                return jsonify({"error": "Price must be greater than 0"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid price format"}), 400

        # Verify vendor exists
        from models.vendor import Vendor, VendorProduct
        vendor = Vendor.query.filter_by(vendor_id=vendor_id, is_deleted=False).first()
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404

        # Check role-based permissions (Buyer, TD, or Admin)
        is_td = user_role in ['technical_director', 'technicaldirector', 'technical director']
        is_buyer = user_role == 'buyer'
        is_admin = user_role == 'admin'

        if not (is_buyer or is_td or is_admin):
            return jsonify({"error": "Insufficient permissions"}), 403

        updated_products = []

        # Update vendor product prices if save_for_future=true
        if save_for_future:
            material_lower = material_name.lower().strip()
            products = VendorProduct.query.filter_by(
                vendor_id=vendor_id,
                is_deleted=False
            ).all()

            # Find matching products
            matching_products = []
            for product in products:
                product_name = (product.product_name or '').lower().strip()
                # Exact match or contains match
                if product_name == material_lower or material_lower in product_name or product_name in material_lower:
                    matching_products.append(product)

            # Update unit_price for all matching products
            if matching_products:
                for product in matching_products:
                    old_price = product.unit_price
                    product.unit_price = new_price
                    updated_products.append({
                        'product_id': product.product_id,
                        'product_name': product.product_name,
                        'old_price': old_price,
                        'new_price': new_price
                    })

                db.session.flush()
            else:
                log.warning(f"No matching products found for material '{material_name}' from vendor {vendor_id}")

        # If cr_id provided, save negotiated price to the change request
        if cr_id:
            cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
            if cr:
                # Initialize material_vendor_selections if it doesn't exist
                if not cr.material_vendor_selections:
                    cr.material_vendor_selections = {}

                # Update or create material vendor selection with negotiated price
                if material_name in cr.material_vendor_selections:
                    # Update existing selection
                    cr.material_vendor_selections[material_name]['negotiated_price'] = new_price
                    cr.material_vendor_selections[material_name]['save_price_for_future'] = save_for_future
                else:
                    # Create new selection (for cases where price is negotiated before vendor selection)
                    cr.material_vendor_selections[material_name] = {
                        'vendor_id': vendor_id,
                        'vendor_name': vendor.company_name,
                        'negotiated_price': new_price,
                        'save_price_for_future': save_for_future,
                        'selected_by_user_id': user_id,
                        'selected_by_name': current_user.get('full_name', 'Unknown User'),
                        'selection_date': datetime.utcnow().isoformat()
                    }

                # Mark the JSONB field as modified
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(cr, 'material_vendor_selections')

                cr.updated_at = datetime.utcnow()

        db.session.commit()

        # Prepare response message
        if save_for_future and updated_products:
            message = f"Price updated to AED {new_price:.2f} for {len(updated_products)} product(s). This price will be used for all future purchases."
        elif save_for_future and not updated_products:
            message = f"Price saved for this purchase (AED {new_price:.2f}). No matching products found to update for future."
        else:
            message = f"Negotiated price AED {new_price:.2f} saved for this purchase only."

        return jsonify({
            "success": True,
            "message": message,
            "vendor_id": vendor_id,
            "material_name": material_name,
            "new_price": new_price,
            "save_for_future": save_for_future,
            "updated_products": updated_products if save_for_future else [],
            "cr_id": cr_id
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating vendor price: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to update vendor price: {str(e)}"}), 500


# ============================================================================
# LPO PDF Generation Functions
# ============================================================================

def get_lpo_settings():
    """Get LPO settings (signatures, company info) for PDF generation"""
    try:
        from models.system_settings import SystemSettings

        settings = SystemSettings.query.first()
        if not settings:
            return jsonify({
                "success": True,
                "settings": {
                    "company_name": "Meter Square Interiors LLC",
                    "company_email": "",
                    "company_phone": "",
                    "company_fax": "",
                    "company_trn": "",
                    "company_address": "",
                    "md_name": "Managing Director",
                    "md_signature_image": None,
                    "td_name": "Technical Director",
                    "td_signature_image": None,
                    "company_stamp_image": None,
                    "default_payment_terms": "100% after delivery",
                    "lpo_header_image": None
                }
            }), 200

        return jsonify({
            "success": True,
            "settings": {
                "company_name": settings.company_name or "Meter Square Interiors LLC",
                "company_email": settings.company_email or "",
                "company_phone": settings.company_phone or "",
                "company_fax": getattr(settings, 'company_fax', '') or "",
                "company_trn": getattr(settings, 'company_trn', '') or "",
                "company_address": settings.company_address or "",
                "md_name": getattr(settings, 'md_name', 'Managing Director') or "Managing Director",
                "md_signature_image": getattr(settings, 'md_signature_image', None),
                "td_name": getattr(settings, 'td_name', 'Technical Director') or "Technical Director",
                "td_signature_image": getattr(settings, 'td_signature_image', None),
                "company_stamp_image": getattr(settings, 'company_stamp_image', None),
                "default_payment_terms": getattr(settings, 'default_payment_terms', '100% after delivery') or "100% after delivery",
                "lpo_header_image": getattr(settings, 'lpo_header_image', None)
            }
        }), 200

    except Exception as e:
        log.error(f"Error getting LPO settings: {str(e)}")
        return jsonify({"error": f"Failed to get LPO settings: {str(e)}"}), 500


def preview_lpo_pdf(cr_id):
    """Preview LPO PDF data before generation - returns editable data"""
    try:
        from models.system_settings import SystemSettings
        from models.vendor import Vendor

        current_user = g.user
        buyer_id = current_user['user_id']

        # Get the change request
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Get vendor details
        vendor = None
        if cr.selected_vendor_id:
            vendor = Vendor.query.filter_by(vendor_id=cr.selected_vendor_id, is_deleted=False).first()

        # Get project details
        project = Project.query.get(cr.project_id)

        # Get buyer details
        buyer = User.query.filter_by(user_id=buyer_id).first()

        # Get system settings
        settings = SystemSettings.query.first()

        # Process materials with negotiated prices
        materials_list, cr_total = process_materials_with_negotiated_prices(cr)

        # Calculate totals
        subtotal = 0
        items = []
        for i, material in enumerate(materials_list, 1):
            # Use negotiated price if available, otherwise use original unit price
            rate = material.get('negotiated_price') if material.get('negotiated_price') is not None else material.get('unit_price', 0)
            qty = material.get('quantity', 0)
            amount = float(qty) * float(rate)
            subtotal += amount

            items.append({
                "sl_no": i,
                "description": material.get('material_name', '') or material.get('sub_item_name', ''),
                "qty": qty,
                "unit": material.get('unit', 'Nos'),
                "rate": round(rate, 2),
                "amount": round(amount, 2)
            })

        vat_percent = 5
        vat_amount = subtotal * (vat_percent / 100)
        grand_total = subtotal + vat_amount

        # Default company TRN
        DEFAULT_COMPANY_TRN = "100223723600003"

        # Get vendor phone with code
        vendor_phone = ""
        if vendor:
            if hasattr(vendor, 'phone_code') and vendor.phone_code and vendor.phone:
                vendor_phone = f"{vendor.phone_code} {vendor.phone}"
            elif vendor.phone:
                vendor_phone = vendor.phone

        # Get vendor TRN (try trn field first, then gst_number)
        vendor_trn = ""
        if vendor:
            vendor_trn = getattr(vendor, 'trn', '') or getattr(vendor, 'gst_number', '') or ""

        # Build preview data
        lpo_preview = {
            "vendor": {
                "company_name": vendor.company_name if vendor else "",
                "contact_person": vendor.contact_person_name if vendor else "",
                "phone": vendor_phone,
                "fax": getattr(vendor, 'fax', '') if vendor else "",
                "email": vendor.email if vendor else "",
                "trn": vendor_trn,
                "project": project.project_name if project else "",
                "subject": cr.item_name or cr.justification or ""
            },
            "company": {
                "name": settings.company_name if settings else "Meter Square Interiors LLC",
                "contact_person": buyer.full_name if buyer else "Procurement Team",
                "division": "Admin",
                "phone": settings.company_phone if settings else "",
                "fax": getattr(settings, 'company_fax', '') if settings else "",
                "email": settings.company_email if settings else "",
                "trn": getattr(settings, 'company_trn', '') or DEFAULT_COMPANY_TRN if settings else DEFAULT_COMPANY_TRN
            },
            "lpo_info": {
                "lpo_number": f"MS/PO/{cr.cr_id}",
                "lpo_date": datetime.now().strftime('%d.%m.%Y'),
                "quotation_ref": ""
            },
            "items": items,
            "totals": {
                "subtotal": round(subtotal, 2),
                "vat_percent": vat_percent,
                "vat_amount": round(vat_amount, 2),
                "grand_total": round(grand_total, 2)
            },
            "terms": {
                "payment_terms": getattr(settings, 'default_payment_terms', '100% after delivery') if settings else "100% after delivery",
                "completion_terms": "As agreed",
                "general_terms": json.loads(getattr(settings, 'lpo_general_terms', '[]') or '[]') if settings else [],
                "payment_terms_list": json.loads(getattr(settings, 'lpo_payment_terms_list', '[]') or '[]') if settings else []
            },
            "signatures": {
                "md_name": getattr(settings, 'md_name', 'Managing Director') if settings else "Managing Director",
                "md_signature": getattr(settings, 'md_signature_image', None) if settings else None,
                "td_name": getattr(settings, 'td_name', 'Technical Director') if settings else "Technical Director",
                "td_signature": getattr(settings, 'td_signature_image', None) if settings else None,
                "stamp_image": getattr(settings, 'company_stamp_image', None) if settings else None,
                "is_system_signature": True  # Mark as system-generated signature
            },
            "header_image": getattr(settings, 'lpo_header_image', None) if settings else None
        }

        return jsonify({
            "success": True,
            "lpo_data": lpo_preview,
            "cr_id": cr_id
        }), 200

    except Exception as e:
        log.error(f"Error previewing LPO PDF: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to preview LPO PDF: {str(e)}"}), 500


def generate_lpo_pdf(cr_id):
    """Generate LPO PDF with editable data from frontend"""
    try:
        from utils.lpo_pdf_generator import LPOPDFGenerator
        from flask import Response

        current_user = g.user

        # Get the change request to verify it exists
        cr = ChangeRequest.query.filter_by(cr_id=cr_id, is_deleted=False).first()
        if not cr:
            return jsonify({"error": "Purchase not found"}), 404

        # Get LPO data from request body (editable by buyer)
        data = request.get_json()
        lpo_data = data.get('lpo_data')

        if not lpo_data:
            return jsonify({"error": "LPO data is required"}), 400

        # Generate PDF
        generator = LPOPDFGenerator()
        pdf_bytes = generator.generate_lpo_pdf(lpo_data)

        # Get project for filename
        project = Project.query.get(cr.project_id)
        project_name = project.project_name.replace(' ', '_')[:20] if project else 'Project'
        filename = f"LPO-{cr_id}-{project_name}.pdf"

        # Return PDF as downloadable file
        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Type': 'application/pdf'
            }
        )

    except Exception as e:
        log.error(f"Error generating LPO PDF: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to generate LPO PDF: {str(e)}"}), 500
