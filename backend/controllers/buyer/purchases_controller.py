from flask import request, jsonify, g
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import or_, and_, func, desc
from config.db import db
from models.project import Project
from models.boq import BOQ, BOQDetails, MasterItem, MasterSubItem, MasterMaterial
from models.change_request import ChangeRequest
from models.po_child import POChild
from models.user import User
from models.vendor import Vendor
from models.inventory import *
from models.role import Role
from config.logging import get_logger
from datetime import datetime, timedelta
from utils.comprehensive_notification_service import notification_service
import json

log = get_logger()

__all__ = [
    'get_buyer_boq_materials', 'get_buyer_pending_purchases',
    'get_buyer_completed_purchases', 'get_buyer_rejected_purchases',
    'complete_purchase', 'get_purchase_by_id',
]

from controllers.buyer.helpers import (
    process_materials_with_negotiated_prices,
    has_buyer_permissions,
    is_buyer_role,
    is_admin_role,
    is_estimator_role,
    is_technical_director,
    sanitize_string,
    MAX_STRING_LENGTH,
    MAX_TEXT_LENGTH
)


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
                                    "size": material.get('size'),
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

        # ✅ PERFORMANCE OPTIMIZATION: Import eager loading functions
        from sqlalchemy.orm import selectinload, joinedload

        # ✅ PERFORMANCE: Add pagination support
        page = flask_request.args.get('page', 1, type=int)
        per_page = min(flask_request.args.get('per_page', 50, type=int), 100)  # Max 100 per page

        # If admin is viewing as buyer, show ALL purchases (no buyer filtering)
        # If regular buyer, show only purchases assigned to them
        if is_admin_viewing:
            # SIMPLIFIED QUERY: Show ALL CRs assigned to any buyer (for admin viewing)
            # Exclude completed, purchase_completed and routed_to_store status - those should go to completed tab
            # Exclude rejected items - those should only show in rejected tab
            # ✅ PERFORMANCE: Add eager loading to prevent N+1 queries + pagination
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),  # 1-to-1: Use joinedload
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),  # 1-to-many chain
                joinedload(ChangeRequest.vendor),  # 1-to-1: Use joinedload
                selectinload(ChangeRequest.store_requests),  # 1-to-many
                selectinload(ChangeRequest.po_children)  # 1-to-many
            ).filter(
                ChangeRequest.assigned_to_buyer_user_id.isnot(None),
                ChangeRequest.is_deleted == False,
                # Exclude completed items — routed_to_store = buyer completed purchase, goes to Completed tab
                ~func.trim(ChangeRequest.status).in_(['completed', 'purchase_completed', 'routed_to_store']),
                or_(
                    ChangeRequest.vendor_selection_status.is_(None),
                    ChangeRequest.vendor_selection_status != 'rejected'
                )
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items

        else:
            # ✅ PERFORMANCE: Add eager loading to prevent N+1 queries + pagination
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor),
                selectinload(ChangeRequest.store_requests),
                selectinload(ChangeRequest.po_children)
            ).filter(
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
                    # CRs with vendor_approved status (vendor approved, waiting for buyer to complete purchase)
                    and_(
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int,
                        func.trim(ChangeRequest.status) == 'vendor_approved'
                    ),
                    # approved_by_pm or send_to_buyer status AND assigned to this buyer
                    and_(
                        func.trim(ChangeRequest.status).in_(['approved_by_pm', 'send_to_buyer']),
                        ChangeRequest.approval_required_from == 'buyer',
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    ),
                    # ✅ FIX: CRs pending TD approval (vendor selection sent to TD) - buyer should still see them
                    and_(
                        func.trim(ChangeRequest.status) == 'pending_td_approval',
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    ),
                    # CRs partially routed to store - buyer should still see for remaining materials
                    and_(
                        func.trim(ChangeRequest.status) == 'sent_to_store',
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id_int
                    )
                ),
                ChangeRequest.is_deleted == False,
                # Exclude completed items — routed_to_store = buyer completed purchase, goes to Completed tab
                ~func.trim(ChangeRequest.status).in_(['completed', 'purchase_completed', 'routed_to_store']),
                # Exclude rejected items - those should only show in rejected tab
                or_(
                    ChangeRequest.vendor_selection_status.is_(None),
                    ChangeRequest.vendor_selection_status != 'rejected'
                )
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items

        pending_purchases = []
        total_cost = 0

        for cr in change_requests:
            # ✅ PERFORMANCE: Use preloaded relationships instead of separate queries
            # Get project details (already loaded via joinedload)
            project = cr.project
            if not project:
                continue

            # Get BOQ details (already loaded via selectinload)
            boq = cr.boq
            if not boq:
                continue

            # Get BOQ details (already loaded via selectinload chain)
            boq_details = boq.details[0] if boq.details else None
            materials_list, cr_total = process_materials_with_negotiated_prices(cr, boq_details)

            total_cost += cr_total

            # Get the first sub-item's sub_item_name for display (since all materials in a CR should be from same sub-item)
            first_sub_item_name = materials_list[0].get('sub_item_name', 'N/A') if materials_list else 'N/A'

            # Check if vendor selection is pending TD approval
            vendor_selection_pending_td_approval = (
                cr.vendor_selection_status == 'pending_td_approval'
            )

            # Validate and refresh material_vendor_selections with current vendor data
            # This ensures deleted vendors are removed and vendor names are up-to-date
            validated_material_vendor_selections = {}
            if cr.material_vendor_selections:
                from models.vendor import Vendor as VendorModel
                # Get all unique vendor IDs from selections
                mvs_vendor_ids = set()
                for selection in cr.material_vendor_selections.values():
                    if isinstance(selection, dict) and selection.get('vendor_id'):
                        mvs_vendor_ids.add(selection.get('vendor_id'))

                # Fetch all referenced vendors in one query
                active_mvs_vendors = {
                    v.vendor_id: v for v in VendorModel.query.filter(
                        VendorModel.vendor_id.in_(mvs_vendor_ids),
                        VendorModel.is_deleted == False
                    ).all()
                } if mvs_vendor_ids else {}

                # Validate each selection
                for material_name, selection in cr.material_vendor_selections.items():
                    if isinstance(selection, dict) and selection.get('vendor_id'):
                        vendor_id = selection.get('vendor_id')
                        if vendor_id in active_mvs_vendors:
                            # Vendor exists - refresh vendor_name with current value
                            validated_selection = dict(selection)
                            validated_selection['vendor_name'] = active_mvs_vendors[vendor_id].company_name
                            validated_material_vendor_selections[material_name] = validated_selection
                        # If vendor doesn't exist (deleted), skip this selection
                    else:
                        # Selection without vendor_id (just negotiated price) - keep it
                        validated_material_vendor_selections[material_name] = selection

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
                # ✅ PERFORMANCE: Use preloaded vendor relationship
                vendor = cr.vendor
                if vendor and not vendor.is_deleted:
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

            # ✅ PERFORMANCE: Use preloaded store_requests relationship
            store_requests = cr.store_requests if cr.store_requests else []
            has_store_requests = len(store_requests) > 0

            # Check store request statuses
            all_store_requests_approved = False
            any_store_request_rejected = False
            store_requests_pending = False

            # Track which specific materials have been sent to store (for partial store requests)
            # Use routed_materials (tracks individual material names) instead of InternalMaterialRequest.item_name
            # which only stores the CR-level item name (e.g., "Glass") not individual materials
            store_requested_material_names = []
            routed_materials = cr.routed_materials or {}
            store_routed_names = [
                mat_name for mat_name, info in routed_materials.items()
                if isinstance(info, dict) and info.get('routing') == 'store'
            ]

            if has_store_requests:
                approved_count = sum(1 for r in store_requests if r.status and r.status.lower() in ['approved', 'dispatched', 'fulfilled'])
                rejected_count = sum(1 for r in store_requests if r.status and r.status.lower() == 'rejected')
                pending_count = sum(1 for r in store_requests if r.status and r.status.lower() in ['pending', 'send_request'])

                # Use individual material names from routed_materials (not InternalMaterialRequest.item_name)
                # If any request is rejected, exclude those materials from store count
                if rejected_count > 0 and rejected_count == len(store_requests):
                    # All requests rejected - no materials in store
                    store_requested_material_names = []
                else:
                    store_requested_material_names = store_routed_names

                all_store_requests_approved = approved_count == len(store_requests) and len(store_requests) > 0
                any_store_request_rejected = rejected_count > 0

                store_requested_count = len(store_requested_material_names)

                # store_requests_pending = True when ANY materials have pending store requests
                store_requests_pending = pending_count > 0 and store_requested_count > 0
            elif store_routed_names:
                # FIX: Even without IMR records, routed_materials tracks store-routed materials
                # This ensures frontend detects mixed routing and creates proper POChildren
                store_requested_material_names = store_routed_names
                has_store_requests = True  # Signal to frontend that store routing exists

            # ✅ PERFORMANCE: Use preloaded po_children relationship
            # Get POChild records for this CR (if any exist)
            # This allows the frontend to know which materials have already been sent to TD
            po_children_data = []
            # Filter out deleted po_children in Python (they're already loaded)
            po_children_for_parent = [pc for pc in (cr.po_children or []) if not pc.is_deleted]

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

            # ✅ FIX: Check if all materials are handled by POChildren
            # Only hide parent if POChildren exist AND handle all unrouted materials
            # Don't hide if vendor selections are in parent CR (not POChildren)
            routed_materials = cr.routed_materials or {}
            total_materials_count = len(cr.materials_data or cr.sub_items_data or [])
            routed_count = len(routed_materials)

            # Count materials in POChildren
            po_child_materials_count = 0
            if po_children_for_parent:
                for po_child in po_children_for_parent:
                    po_child_materials = po_child.materials_data or po_child.sub_items_data or []
                    po_child_materials_count += len(po_child_materials) if isinstance(po_child_materials, list) else 0

            # Hide parent CR only if ALL materials are in POChildren (complete vendor split, no store)
            hide_parent_due_to_po_children = po_child_materials_count >= total_materials_count and total_materials_count > 0 and len(po_children_for_parent) > 0

            # For buyer/TD view: Skip parent PO if:
            # 1. Admin viewing AND all children sent to TD or approved
            # 2. OR all materials are in POChildren (complete vendor split, no store materials)
            # NOTE: Parent stays visible for mixed routing (store + vendor) to show complete picture
            if (is_admin_viewing and all_children_sent_to_td_or_approved) or hide_parent_due_to_po_children:
                continue

            # Get submission_group_id from first POChild if any exist
            submission_group_id = po_children_data[0].get('submission_group_id') if po_children_data else None

            pending_purchases.append({
                "cr_id": cr.cr_id,
                "formatted_cr_id": cr.get_formatted_cr_id(),
                "submission_group_id": submission_group_id,  # From POChild records
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
                "requested_by_user_id": cr.requested_by_user_id if cr.requested_by_user_id else None,
                "requested_by_name": cr.requested_by_name if cr.requested_by_name else None,
                "requested_by_role": cr.requested_by_role if cr.requested_by_role else None,
                "approved_by": cr.approved_by_user_id,
                "approved_at": cr.approval_date.isoformat() if cr.approval_date else None,
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "updated_at": cr.updated_at.isoformat() if cr.updated_at else None,
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
                "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval,
                "vendor_selection_status": cr.vendor_selection_status,  # 'pending_td_approval', 'approved', 'rejected'
                "vendor_email_sent": cr.vendor_email_sent or False,
                "vendor_email_sent_date": cr.vendor_email_sent_date.isoformat() if cr.vendor_email_sent_date else None,
                "vendor_whatsapp_sent": cr.vendor_whatsapp_sent or False,
                "vendor_whatsapp_sent_at": cr.vendor_whatsapp_sent_at.isoformat() if cr.vendor_whatsapp_sent_at else None,
                "use_per_material_vendors": cr.use_per_material_vendors or False,
                "material_vendor_selections": validated_material_vendor_selections,
                "routed_materials": cr.routed_materials or {},  # Material routing tracking (store/vendor)
                "has_store_requests": has_store_requests,
                "store_request_count": len(store_requests),
                "store_requested_materials": store_requested_material_names,  # List of material names sent to store
                "all_store_requests_approved": all_store_requests_approved,
                "any_store_request_rejected": any_store_request_rejected,
                "all_store_requests_rejected": (
                    any_store_request_rejected
                    and not store_requests_pending
                    and not all_store_requests_approved
                    and has_store_requests
                    # Don't mark as fully rejected if vendor-routed materials still need attention
                    and not any(
                        isinstance(info, dict) and info.get('routing') == 'vendor'
                        for info in routed_materials.values()
                    )
                ),
                "store_requests_pending": store_requests_pending,
                "store_request_status": cr.store_request_status,  # CR-level store status field
                # VAT data from LPO customization
                "vat_percent": 5.0,  # Default, will be updated below
                "vat_amount": cr_total * 0.05  # Default, will be updated below
            })

            # Get VAT data from LPO customization for this purchase
            try:
                from models.lpo_customization import LPOCustomization
                lpo_customization = LPOCustomization.query.filter_by(cr_id=cr.cr_id, po_child_id=None).first()
                if lpo_customization and lpo_customization.vat_percent is not None:
                    vat_percent = float(lpo_customization.vat_percent)
                    pending_purchases[-1]["vat_percent"] = vat_percent
                    # Always recalculate VAT based on current subtotal (stored vat_amount may be stale)
                    pending_purchases[-1]["vat_amount"] = cr_total * vat_percent / 100
            except Exception:
                pass  # Keep defaults

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
            "pending_approval_total_cost": round(pending_approval_total, 2),
            # ✅ PERFORMANCE: Add pagination metadata
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated_result.total,
                "pages": paginated_result.pages,
                "has_next": paginated_result.has_next,
                "has_prev": paginated_result.has_prev
            }
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

        # ✅ PERFORMANCE: Import eager loading functions
        from sqlalchemy.orm import selectinload, joinedload
        from flask import request as flask_request

        # ✅ PERFORMANCE: Add pagination support
        page = flask_request.args.get('page', 1, type=int)
        per_page = min(flask_request.args.get('per_page', 50, type=int), 100)  # Max 100 per page

        # FORCE admin to see all data
        if user_role == 'admin':
            is_admin_viewing = True
        # If admin is viewing as buyer, show ALL completed purchases
        # If regular buyer, show only purchases assigned to them (not just completed by them)
        if is_admin_viewing:
            # ✅ PERFORMANCE: Add eager loading + pagination
            # Include routed_to_store — buyer already completed the purchase (PM warehouse step is separate)
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor),
                selectinload(ChangeRequest.po_children)
            ).filter(
                ChangeRequest.status.in_(['completed', 'purchase_completed', 'routed_to_store']),
                ChangeRequest.is_deleted == False
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items
        else:
            # ✅ PERFORMANCE: Add eager loading + pagination
            # Show completed purchases where assigned_to_buyer_user_id OR purchase_completed_by_user_id matches current buyer
            # Include routed_to_store — buyer already completed the purchase (PM warehouse step is separate)
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor),
                selectinload(ChangeRequest.po_children)
            ).filter(
                ChangeRequest.status.in_(['completed', 'purchase_completed', 'routed_to_store']),
                or_(
                    ChangeRequest.assigned_to_buyer_user_id == buyer_id,
                    ChangeRequest.purchase_completed_by_user_id == buyer_id
                ),
                ChangeRequest.is_deleted == False
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items

        # Import POChild for checking if parent has completed children
        from models.po_child import POChild

        completed_purchases = []
        total_cost = 0

        for cr in change_requests:
            # ✅ PERFORMANCE: Use preloaded relationships
            # Get project details (already loaded via joinedload)
            project = cr.project
            if not project:
                continue

            # Get BOQ details (already loaded via selectinload)
            boq = cr.boq
            if not boq:
                continue

            # ✅ PERFORMANCE: Use preloaded po_children
            # BUYER VIEW: Skip parent CRs that have POChildren (all completed)
            # Parents should be hidden when they have children - only show children cards
            po_children_for_cr = [pc for pc in (cr.po_children or []) if not pc.is_deleted]

            if po_children_for_cr:
                # Parent has children - check if all are completed
                all_children_completed = all(
                    pc.status in ['purchase_completed', 'routed_to_store', 'sent_to_store'] for pc in po_children_for_cr
                )
                if all_children_completed:
                    # Skip this parent CR - children will be shown separately
                    continue

            # ✅ FIX: Skip if all materials are handled by POChildren (complete split)
            total_materials_completed = len(cr.materials_data or cr.sub_items_data or [])

            # Count materials in POChildren
            po_child_materials_completed = 0
            if po_children_for_cr:
                for pc in po_children_for_cr:
                    pc_materials = pc.materials_data or pc.sub_items_data or []
                    po_child_materials_completed += len(pc_materials) if isinstance(pc_materials, list) else 0

            # Skip parent CR only if ALL materials are in POChildren (complete vendor split, no store)
            # NOTE: Parent stays visible for mixed routing (store + vendor) to show complete picture
            if po_child_materials_completed >= total_materials_completed and total_materials_completed > 0 and len(po_children_for_cr) > 0:
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
                                # Get sub_item_name from material or parent sub_item
                                sub_item_name_for_material = material.get('sub_item_name', '') or sub_item.get('sub_item_name', '')
                                materials_list.append({
                                    "material_name": material.get('material_name', ''),
                                    "sub_item_name": sub_item_name_for_material,  # ✅ FIXED: Add sub_item_name
                                    "quantity": material.get('quantity', 0),
                                    "unit": material.get('unit', ''),
                                    "unit_price": material.get('unit_price', 0),
                                    "total_price": material_total,
                                    "brand": material.get('brand'),
                                    "size": material.get('size'),
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
                                "size": sub_item.get('size'),
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
                        "size": material.get('size'),
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
                # ✅ PERFORMANCE: Use preloaded vendor relationship
                vendor = cr.vendor
                if vendor and not vendor.is_deleted:
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
                "requested_by_user_id": cr.requested_by_user_id if cr.requested_by_user_id else None,
                "requested_by_name": cr.requested_by_name if cr.requested_by_name else None,
                "requested_by_role": cr.requested_by_role if cr.requested_by_role else None,
                "approved_by": cr.approved_by_user_id,
                "approved_at": cr.approval_date.isoformat() if cr.approval_date else None,
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "updated_at": cr.updated_at.isoformat() if cr.updated_at else None,
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
                "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval,
                # VAT data
                "vat_percent": 5.0,  # Default
                "vat_amount": cr_total * 0.05  # Default
            })

            # Get VAT data from LPO customization for this purchase
            try:
                from models.lpo_customization import LPOCustomization
                lpo_customization = LPOCustomization.query.filter_by(cr_id=cr.cr_id, po_child_id=None).first()
                if lpo_customization and lpo_customization.vat_percent is not None:
                    vat_percent = float(lpo_customization.vat_percent)
                    completed_purchases[-1]["vat_percent"] = vat_percent
                    # Always recalculate VAT based on current subtotal (stored vat_amount may be stale)
                    completed_purchases[-1]["vat_amount"] = cr_total * vat_percent / 100
            except Exception:
                pass  # Keep defaults

        # Also get completed POChildren (vendor-split purchases)
        # POChild already imported above

        if is_admin_viewing:
            # Completed POChildren: purchase_completed + routed_to_store (buyer completed purchase)
            # sent_to_store stays in Pending Approval until PM approves
            completed_po_children = POChild.query.options(
                joinedload(POChild.parent_cr)
            ).filter(
                POChild.status.in_(['purchase_completed', 'routed_to_store']),
                POChild.is_deleted == False
            ).order_by(
                POChild.updated_at.desc().nulls_last(),
                POChild.created_at.desc()
            ).all()
        else:
            # Get POChildren where parent CR is assigned to this buyer OR completed by this buyer
            # sent_to_store stays in Pending Approval until PM approves
            completed_po_children = POChild.query.options(
                joinedload(POChild.parent_cr)
            ).join(
                ChangeRequest, POChild.parent_cr_id == ChangeRequest.cr_id
            ).filter(
                POChild.status.in_(['purchase_completed', 'routed_to_store']),
                POChild.is_deleted == False,
                or_(
                    ChangeRequest.assigned_to_buyer_user_id == buyer_id,
                    ChangeRequest.purchase_completed_by_user_id == buyer_id,
                    POChild.purchase_completed_by_user_id == buyer_id
                )
            ).order_by(
                POChild.updated_at.desc().nulls_last(),
                POChild.created_at.desc()
            ).all()

        completed_po_children_list = []
        for po_child in completed_po_children:
            parent_cr = po_child.parent_cr  # Use preloaded relationship
            project = Project.query.get(parent_cr.project_id) if parent_cr else None
            boq = BOQ.query.get(po_child.boq_id) if po_child.boq_id else (BOQ.query.get(parent_cr.boq_id) if parent_cr and parent_cr.boq_id else None)

            # Get vendor details
            vendor = None
            if po_child.vendor_id:
                from models.vendor import Vendor
                vendor = Vendor.query.get(po_child.vendor_id)

            po_child_total = po_child.materials_total_cost or 0
            total_cost += po_child_total

            # Get VAT data for PO Child
            vat_percent = 5.0  # Default
            vat_amount = po_child_total * 0.05  # Default
            try:
                from models.lpo_customization import LPOCustomization
                lpo_customization = LPOCustomization.query.filter_by(
                    cr_id=parent_cr.cr_id if parent_cr else None,
                    po_child_id=po_child.id
                ).first()
                if not lpo_customization and parent_cr:
                    # Fall back to CR-level customization
                    lpo_customization = LPOCustomization.query.filter_by(cr_id=parent_cr.cr_id, po_child_id=None).first()
                if lpo_customization and lpo_customization.vat_percent is not None:
                    vat_percent = float(lpo_customization.vat_percent)
                    # Always recalculate VAT based on current subtotal (stored vat_amount may be stale)
                    vat_amount = po_child_total * vat_percent / 100
            except Exception:
                pass  # Keep defaults

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
                'is_po_child': True,
                'vat_percent': vat_percent,
                'vat_amount': vat_amount
            })

        return jsonify({
            "success": True,
            "completed_purchases_count": len(completed_purchases),
            "total_cost": round(total_cost, 2),
            "completed_purchases": completed_purchases,
            "completed_po_children": completed_po_children_list,
            "completed_po_children_count": len(completed_po_children_list),
            # ✅ PERFORMANCE: Add pagination metadata
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated_result.total,
                "pages": paginated_result.pages,
                "has_next": paginated_result.has_next,
                "has_prev": paginated_result.has_prev
            }
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

        # ✅ PERFORMANCE: Import eager loading functions
        from sqlalchemy.orm import selectinload, joinedload
        from flask import request as flask_request

        # ✅ PERFORMANCE: Add pagination support
        page = flask_request.args.get('page', 1, type=int)
        per_page = min(flask_request.args.get('per_page', 50, type=int), 100)  # Max 100 per page

        # FORCE admin to see all data
        if user_role == 'admin':
            is_admin_viewing = True

        # Get rejected change requests:
        # 1. status='rejected' (rejected by TD)
        # 2. vendor_selection_status='rejected' (vendor rejected by TD)
        # 3. store_request_status='store_rejected' (store request rejected by PM)
        # EXCLUDE: CRs that have been split into POChildren (status='split_to_sub_crs')
        #          These are handled separately via td_rejected_po_children
        if is_admin_viewing:
            # ✅ PERFORMANCE: Add eager loading + pagination
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor)
            ).filter(
                or_(
                    ChangeRequest.status == 'rejected',
                    ChangeRequest.vendor_selection_status == 'rejected',
                    ChangeRequest.store_request_status == 'store_rejected'
                ),
                ChangeRequest.status != 'split_to_sub_crs',  # Exclude split CRs - POChildren are handled separately
                ChangeRequest.is_deleted == False
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items
        else:
            # ✅ PERFORMANCE: Add eager loading + pagination
            paginated_result = ChangeRequest.query.options(
                joinedload(ChangeRequest.project),
                selectinload(ChangeRequest.boq).selectinload(BOQ.details),
                joinedload(ChangeRequest.vendor)
            ).filter(
                or_(
                    ChangeRequest.status == 'rejected',
                    ChangeRequest.vendor_selection_status == 'rejected',
                    ChangeRequest.store_request_status == 'store_rejected'
                ),
                ChangeRequest.status != 'split_to_sub_crs',  # Exclude split CRs - POChildren are handled separately
                or_(
                    ChangeRequest.assigned_to_buyer_user_id == buyer_id,
                    ChangeRequest.purchase_completed_by_user_id == buyer_id
                ),
                ChangeRequest.is_deleted == False
            ).order_by(
                ChangeRequest.updated_at.desc().nulls_last(),
                ChangeRequest.created_at.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

            change_requests = paginated_result.items

        rejected_purchases = []

        for cr in change_requests:
            # Skip parent CRs that have store POChildren — the POChild handles rejection display
            # This prevents duplicates: parent CR + POChild both showing in Rejected tab
            if cr.store_request_status == 'store_rejected':
                store_po_child = POChild.query.filter_by(
                    parent_cr_id=cr.cr_id,
                    routing_type='store',
                    is_deleted=False
                ).first()
                if store_po_child:
                    continue  # POChild will show in td_rejected_po_children instead

            # ✅ PERFORMANCE: Use preloaded relationships
            # Get project details (already loaded via joinedload)
            project = cr.project
            if not project:
                continue

            # Get BOQ details (already loaded via selectinload)
            boq = cr.boq
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
                                # Get sub_item_name from material or parent sub_item
                                sub_item_name_for_material = material.get('sub_item_name', '') or sub_item.get('sub_item_name', '')
                                materials_list.append({
                                    "material_name": material.get('material_name', ''),
                                    "sub_item_name": sub_item_name_for_material,  # ✅ FIXED: Add sub_item_name
                                    "quantity": material.get('quantity', 0),
                                    "unit": material.get('unit', ''),
                                    "unit_price": material.get('unit_price', 0),
                                    "total_price": material_total,
                                    "brand": material.get('brand'),
                                    "size": material.get('size'),
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
                                "size": sub_item.get('size'),
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
                # ✅ PERFORMANCE: Use preloaded vendor relationship
                vendor = cr.vendor
                if vendor and not vendor.is_deleted:
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
                    from models.user import User
                    selector = User.query.filter_by(user_id=cr.vendor_selected_by_buyer_user_id).first()
                    if selector:
                        vendor_selected_by_name = selector.full_name

            # Determine rejection type and reason
            rejection_type = "change_request"  # default
            rejection_reason = cr.rejection_reason or "No reason provided"

            if cr.store_request_status == 'store_rejected':
                rejection_type = "store_rejection"
                rejection_reason = cr.rejection_reason or "Store material request rejected by Production Manager"
            elif cr.vendor_selection_status == 'rejected':
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
                "requested_by_user_id": cr.requested_by_user_id if cr.requested_by_user_id else None,
                "requested_by_name": cr.requested_by_name if cr.requested_by_name else None,
                "requested_by_role": cr.requested_by_role if cr.requested_by_role else None,
                "created_at": cr.created_at.isoformat() if cr.created_at else None,
                "updated_at": cr.updated_at.isoformat() if cr.updated_at else None,
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
                "vendor_selected_by_name": vendor_selected_by_name,
                "store_request_status": cr.store_request_status
            })

        # Also get rejected POChild items (TD vendor rejections + store rejections by PM)
        td_rejected_po_children = []
        try:
            rejected_statuses = ['td_rejected', 'store_rejected']
            if is_admin_viewing:
                po_children = POChild.query.options(
                    joinedload(POChild.parent_cr)
                ).outerjoin(
                    ChangeRequest, POChild.parent_cr_id == ChangeRequest.cr_id
                ).filter(
                    or_(
                        POChild.status.in_(rejected_statuses),
                        POChild.vendor_selection_status.in_(rejected_statuses),
                        # Fallback: Store POChildren where parent CR is store-rejected
                        # (handles legacy data where po_child_id wasn't linked on the IMR)
                        and_(
                            POChild.routing_type == 'store',
                            ChangeRequest.store_request_status == 'store_rejected'
                        )
                    ),
                    POChild.is_deleted == False
                ).order_by(
                    POChild.updated_at.desc().nulls_last(),
                    POChild.created_at.desc()
                ).all()
            else:
                # Query by vendor_selected_by_buyer_id OR by parent CR's assigned buyer
                po_children = POChild.query.options(
                    joinedload(POChild.parent_cr)
                ).outerjoin(
                    ChangeRequest, POChild.parent_cr_id == ChangeRequest.cr_id
                ).filter(
                    or_(
                        POChild.status.in_(rejected_statuses),
                        POChild.vendor_selection_status.in_(rejected_statuses),
                        # Fallback: Store POChildren where parent CR is store-rejected
                        and_(
                            POChild.routing_type == 'store',
                            ChangeRequest.store_request_status == 'store_rejected'
                        )
                    ),
                    POChild.is_deleted == False,
                    or_(
                        POChild.vendor_selected_by_buyer_id == buyer_id,
                        ChangeRequest.assigned_to_buyer_user_id == buyer_id
                    )
                ).order_by(
                    POChild.updated_at.desc().nulls_last(),
                    POChild.created_at.desc()
                ).all()

            for poc in po_children:
                # Get parent CR for project/boq info (use preloaded relationship)
                parent_cr = poc.parent_cr
                project = Project.query.get(poc.project_id) if poc.project_id else None
                boq = BOQ.query.filter_by(boq_id=poc.boq_id).first() if poc.boq_id else None

                is_store_rejection = (
                    poc.status == 'store_rejected'
                    or poc.vendor_selection_status == 'store_rejected'
                    or (poc.routing_type == 'store' and parent_cr and parent_cr.store_request_status == 'store_rejected')
                )
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
                    "updated_at": poc.updated_at.isoformat() if poc.updated_at else None,
                    "status": poc.status,
                    "routing_type": poc.routing_type,
                    "rejection_type": "store_rejection" if is_store_rejection else "td_vendor_rejection",
                    "rejection_reason": poc.rejection_reason or ("Store request rejected by Production Manager" if is_store_rejection else "Vendor selection rejected by TD"),
                    "rejected_by_name": poc.vendor_approved_by_td_name or ("Production Manager" if is_store_rejection else None),
                    "vendor_name": poc.vendor_name,
                    "vendor_selection_status": poc.vendor_selection_status,
                    "can_reselect_vendor": not is_store_rejection  # Only vendor rejections can reselect
                })
        except Exception as poc_error:
            log.error(f"Error fetching TD rejected POChild items: {poc_error}")

        return jsonify({
            "success": True,
            "rejected_purchases_count": len(rejected_purchases),
            "rejected_purchases": rejected_purchases,
            "td_rejected_po_children": td_rejected_po_children,
            "td_rejected_count": len(td_rejected_po_children),
            # ✅ PERFORMANCE: Add pagination metadata
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": paginated_result.total,
                "pages": paginated_result.pages,
                "has_next": paginated_result.has_next,
                "has_prev": paginated_result.has_prev
            }
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
        # Allow: assigned_to_buyer, vendor_approved, pending_td_approval, or send_to_buyer
        allowed_statuses = ['assigned_to_buyer', 'vendor_approved', 'pending_td_approval', 'send_to_buyer']
        if cr.status not in allowed_statuses:
            return jsonify({"error": f"Purchase cannot be completed. Current status: {cr.status}"}), 400

        # If still showing pending_td_approval, verify vendor is actually approved
        if cr.status == 'pending_td_approval':
            if cr.vendor_selection_status != 'approved' or not cr.vendor_approved_by_td_id:
                return jsonify({"error": "Vendor selection must be approved by TD before completing purchase"}), 400

        # ========================================
        # NEW FEATURE: Route materials through Production Manager (M2 Store)
        # When buyer completes purchase, materials go to warehouse first,
        # then PM dispatches to site (like Internal Material Request flow)
        # ========================================

        # Update the change request - Route through Production Manager
        cr.delivery_routing = 'via_production_manager'  # NEW FIELD
        cr.store_request_status = 'pending_vendor_delivery'  # NEW FIELD
        cr.status = 'routed_to_store'  # Changed from 'purchase_completed'
        cr.purchase_completed_by_user_id = buyer_id
        cr.purchase_completed_by_name = buyer_name
        cr.purchase_completion_date = datetime.utcnow()
        cr.purchase_notes = notes
        cr.buyer_completion_notes = notes  # NEW FIELD
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

        # ========================================
        # NEW FEATURE: Auto-create Internal Material Requests
        # These requests go to Production Manager so they know
        # which materials to dispatch to which site
        # IMPORTANT: Skip if this CR has POChildren - they handle their own requests
        # ========================================
        created_imr_count = 0

        # Check if this CR has POChildren - if so, skip individual request creation
        # POChildren have their own completion flow via complete_po_child_purchase() which creates GROUPED requests
        po_children_exist = POChild.query.filter_by(parent_cr_id=cr.cr_id, is_deleted=False).first() is not None

        # SAFETY CHECK: Check if IMR records already exist for this CR (prevent duplicates)
        existing_imr_count = InternalMaterialRequest.query.filter_by(cr_id=cr.cr_id).count()

        if po_children_exist:
            log.info(f"CR-{cr_id} has POChildren - skipping individual request creation (handled by POChild completion)")
        elif existing_imr_count > 0:
            log.warning(f"⚠️ CR-{cr_id} already has {existing_imr_count} Internal Material Request(s) - skipping creation to prevent duplicates")
            created_imr_count = existing_imr_count  # Use existing count for notification
        else:
            try:
                # Get project details for final destination
                project = Project.query.get(cr.project_id)
                final_destination = project.project_name if project else f"Project {cr.project_id}"

                # ========================================
                # GROUPED IMR CREATION (like POChild pattern)
                # Create ONE IMR with all materials grouped together
                # ========================================

                # Prepare grouped materials list for single request
                grouped_materials = []
                primary_material_name = None

                for idx, sub_item in enumerate(sub_items_data):
                    if isinstance(sub_item, dict):
                        # Check if this sub-item has nested materials array (same pattern as MasterMaterial loop above)
                        materials_list = sub_item.get('materials', [])

                        # If no materials array, treat the sub_item itself as a material
                        if not materials_list:
                            materials_list = [sub_item]

                        # Process each material (handles both flat and nested structures)
                        for material in materials_list:
                            material_name = material.get('material_name', '').strip()

                            # Fallback to sub_item_name if material_name is empty
                            if not material_name:
                                material_name = material.get('sub_item_name', 'Unknown').strip()

                            quantity = material.get('quantity', 0)

                            grouped_materials.append({
                                'material_name': material_name,
                                'quantity': quantity,
                                'brand': material.get('brand'),
                                'size': material.get('size'),
                                'unit': material.get('unit', 'pcs'),
                                'unit_price': material.get('unit_price', 0),
                                'total_price': material.get('total_price', 0)
                            })

                            if not primary_material_name:
                                primary_material_name = material_name
                    else:
                        log.warning(f"Skipping material {idx+1}: not a dict, type={type(sub_item)}")

                # Create ONE grouped Internal Material Request (not multiple)
                if grouped_materials:
                    imr = InternalMaterialRequest(
                        cr_id=cr.cr_id,
                        project_id=cr.project_id,
                        request_buyer_id=buyer_id,
                        item_name=cr.item_name,  # Store actual item name from CR
                        quantity=len(grouped_materials),  # Number of materials
                        brand=None,
                        size=None,
                        notes=f"CR-{cr.cr_id} - {len(grouped_materials)} material(s) - Vendor delivery expected",

                        # Vendor delivery tracking
                        source_type='from_vendor_delivery',
                        status='awaiting_vendor_delivery',
                        vendor_delivery_confirmed=False,
                        final_destination_site=final_destination,
                        routed_by_buyer_id=buyer_id,
                        routed_to_store_at=datetime.utcnow(),
                        request_send=True,

                        # GROUPED DATA - All materials in JSONB
                        materials_data=grouped_materials,  # All materials in JSONB
                        materials_count=len(grouped_materials),

                        created_at=datetime.utcnow(),
                        created_by=buyer_name,
                        last_modified_by=buyer_name
                    )
                    db.session.add(imr)
                    created_imr_count = 1

                    log.info(f"✅ Created 1 grouped Internal Material Request for CR-{cr_id} with {len(grouped_materials)} materials")

                    # ✅ FIX: Mark all materials as routed to vendor (via production manager)
                    routed_materials_to_add = {}
                    for mat in grouped_materials:
                        mat_name = mat.get('material_name')
                        if mat_name:
                            routed_materials_to_add[mat_name] = {
                                'routing': 'store',  # Routed via PM to store first
                                'routed_at': datetime.utcnow().isoformat(),
                                'routed_by': buyer_id
                            }

                    # Update routed_materials field
                    current_routed = cr.routed_materials or {}
                    current_routed.update(routed_materials_to_add)
                    cr.routed_materials = current_routed
                else:
                    log.warning(f"No valid materials found for CR-{cr_id}")

            except Exception as imr_error:
                log.error(f"❌ Error creating grouped Internal Material Request: {imr_error}")
                # Don't fail the whole request, but log the error

        db.session.commit()

        # ========================================
        # NEW FEATURE: Notify Production Manager about incoming vendor delivery
        # ========================================
        try:
            # Notify Production Manager(s)
            pm_role = Role.query.filter_by(role='production_manager').first()
            if pm_role:
                pms = User.query.filter_by(
                    role_id=pm_role.role_id,
                    is_deleted=False,
                    is_active=True
                ).all()

                project_name = cr.project.project_name if cr.project else 'Unknown Project'
                vendor_name = cr.selected_vendor_name or 'Selected Vendor'

                for pm in pms:
                    notification_service.create_notification(
                        user_id=pm.user_id,
                        title=f"📦 Incoming Vendor Delivery - {project_name}",
                        message=f"{buyer_name} has routed {created_imr_count} material(s) from vendor '{vendor_name}' to M2 Store for project '{project_name}'. Materials will be delivered to warehouse for inspection and dispatch to site.",
                        type='vendor_delivery_incoming',
                        reference_type='change_request',
                        reference_id=cr_id,
                        action_url=f'/store/incoming-deliveries'
                    )
                    log.info(f"✅ Notified PM {pm.full_name} about incoming vendor delivery for CR-{cr_id}")

        except Exception as pm_notif_error:
            log.error(f"❌ Failed to send PM notification: {pm_notif_error}")

        # Send notification to CR creator about purchase routing
        try:
            if cr.requested_by_user_id:
                project_name = cr.project.project_name if cr.project else 'Unknown Project'
                notification_service.create_notification(
                    user_id=cr.requested_by_user_id,
                    title=f"Purchase Routed to M2 Store - {project_name}",
                    message=f"{buyer_name} has completed the purchase and routed materials to M2 Store. Production Manager will receive materials from vendor and dispatch to your site.",
                    type='cr_routed_to_store',
                    reference_type='change_request',
                    reference_id=cr_id
                )
        except Exception as notif_error:
            log.error(f"Failed to send CR routing notification: {notif_error}")

        success_message = f"Purchase routed to M2 Store successfully! {created_imr_count} material request(s) sent to Production Manager"
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

        # Allow Estimators and TDs to view any purchase (they need to see details for approval/review)
        is_estimator = is_estimator_role(user_role)
        is_td = is_technical_director(user_role)

        # Verify access: admin, estimator, TD, assigned buyer, or buyer who completed purchase
        if not is_admin and not is_admin_viewing and not is_estimator and not is_td and cr.assigned_to_buyer_user_id != buyer_id and cr.purchase_completed_by_user_id != buyer_id:
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

        # Get store requests for this CR to know which materials are sent to store
        # Use routed_materials (tracks individual material names) for accurate counts
        store_requests = InternalMaterialRequest.query.filter_by(cr_id=cr_id).all()
        routed_materials = cr.routed_materials or {}
        has_rejected_requests = any(
            r.status and r.status.lower() == 'rejected' for r in store_requests
        ) if store_requests else False
        all_rejected = all(
            r.status and r.status.lower() == 'rejected' for r in store_requests
        ) if store_requests else False

        if all_rejected:
            store_requested_material_names = []
        else:
            store_requested_material_names = [
                mat_name for mat_name, info in routed_materials.items()
                if isinstance(info, dict) and info.get('routing') == 'store'
            ]

        # Validate and refresh material_vendor_selections with current vendor data
        # This ensures deleted vendors are removed and vendor names are up-to-date
        validated_material_vendor_selections = {}
        if cr.material_vendor_selections:
            from models.vendor import Vendor
            # Get all unique vendor IDs from selections
            vendor_ids = set()
            for selection in cr.material_vendor_selections.values():
                if isinstance(selection, dict) and selection.get('vendor_id'):
                    vendor_ids.add(selection.get('vendor_id'))

            # Fetch all referenced vendors in one query
            active_vendors = {
                v.vendor_id: v for v in Vendor.query.filter(
                    Vendor.vendor_id.in_(vendor_ids),
                    Vendor.is_deleted == False
                ).all()
            } if vendor_ids else {}

            # Validate each selection
            for material_name, selection in cr.material_vendor_selections.items():
                if isinstance(selection, dict) and selection.get('vendor_id'):
                    vendor_id = selection.get('vendor_id')
                    if vendor_id in active_vendors:
                        # Vendor exists - refresh vendor_name with current value
                        validated_selection = dict(selection)
                        validated_selection['vendor_name'] = active_vendors[vendor_id].company_name
                        validated_material_vendor_selections[material_name] = validated_selection
                    # If vendor doesn't exist (deleted), skip this selection
                else:
                    # Selection without vendor_id (just negotiated price) - keep it
                    validated_material_vendor_selections[material_name] = selection

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
            "updated_at": cr.updated_at.isoformat() if cr.updated_at else None,
            "status": purchase_status,
            "purchase_completed_by_user_id": cr.purchase_completed_by_user_id,
            "purchase_completed_by_name": cr.purchase_completed_by_name,
            "purchase_completion_date": cr.purchase_completion_date.isoformat() if cr.purchase_completion_date else None,
            "purchase_notes": cr.purchase_notes,
            "vendor_id": cr.selected_vendor_id,
            "vendor_name": cr.selected_vendor_name,
            "vendor_selection_pending_td_approval": vendor_selection_pending_td_approval,
            "vendor_email_sent": cr.vendor_email_sent or False,
            "vendor_whatsapp_sent": cr.vendor_whatsapp_sent or False,
            "vendor_whatsapp_sent_at": cr.vendor_whatsapp_sent_at.isoformat() if cr.vendor_whatsapp_sent_at else None,
            # Include validated material vendor selections (with current vendor names, deleted vendors removed)
            "material_vendor_selections": validated_material_vendor_selections,
            # Include store requested materials for filtering in vendor selection
            "store_requested_materials": store_requested_material_names,
            "has_store_requests": len(store_requested_material_names) > 0,
            "store_request_count": len(store_requested_material_names)
        }

        # Get VAT data from LPO customization if available
        try:
            from models.lpo_customization import LPOCustomization
            # Check for PO child specific customization first, then CR-level
            lpo_customization = LPOCustomization.query.filter_by(cr_id=cr_id, po_child_id=None).first()
            if lpo_customization and lpo_customization.vat_percent is not None:
                vat_percent = float(lpo_customization.vat_percent)
                purchase["vat_percent"] = vat_percent
                # Always recalculate VAT based on current subtotal (stored vat_amount may be stale)
                purchase["vat_amount"] = cr_total * vat_percent / 100
            else:
                # Default 5% VAT for UAE
                purchase["vat_percent"] = 5.0
                purchase["vat_amount"] = cr_total * 0.05
        except Exception as vat_error:
            log.warning(f"Could not fetch VAT data: {vat_error}")
            purchase["vat_percent"] = 5.0
            purchase["vat_amount"] = cr_total * 0.05

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
