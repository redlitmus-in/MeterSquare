from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.change_request import ChangeRequest
from models.inventory import InventoryMaterial, InternalMaterialRequest
from models.po_child import POChild
from config.logging import get_logger
from datetime import datetime

log = get_logger()

__all__ = [
    'get_store_items', 'get_store_item_details', 'get_store_categories',
    'get_projects_by_material', 'check_store_availability',
    'complete_from_store', 'get_store_request_status',
]


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

        # Use routed_materials to detect already-sent materials (tracks individual material names)
        # InternalMaterialRequest.item_name stores CR-level name (e.g. "Glass"), NOT individual materials
        routed_materials = cr.routed_materials or {}
        already_routed_store = {
            name for name, info in routed_materials.items()
            if isinstance(info, dict) and info.get('routing') == 'store'
        }

        # Get store request status for display
        existing_store_requests = InternalMaterialRequest.query.filter_by(cr_id=cr_id).all()
        store_request_status = 'pending'
        if existing_store_requests:
            statuses = [r.status for r in existing_store_requests if r.status]
            if any(s.lower() == 'approved' for s in statuses):
                store_request_status = 'approved'
            elif any(s.lower() == 'rejected' for s in statuses):
                store_request_status = 'rejected'
            elif any(s.lower() in ('pending', 'send_request') for s in statuses):
                store_request_status = 'pending'

        available_materials = []
        unavailable_materials = []
        already_sent_materials = []  # Materials already sent to store

        for mat in materials:
            mat_name = mat.get('material_name') or mat.get('name') or ''
            mat_qty = mat.get('quantity', 0)

            # Skip materials that have already been routed to store
            if mat_name in already_routed_store:
                already_sent_materials.append({
                    'material_name': mat_name,
                    'required_quantity': mat_qty,
                    'status': store_request_status,
                    'already_sent': True
                })
                continue

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

        # Can complete if there are available materials (even if some are unavailable or already sent)
        can_complete = len(available_materials) > 0

        return jsonify({
            'success': True,
            'cr_id': cr_id,
            'all_available_in_store': len(unavailable_materials) == 0 and len(available_materials) > 0,
            'available_materials': available_materials,
            'unavailable_materials': unavailable_materials,
            'already_sent_materials': already_sent_materials,  # Materials already requested from store
            'can_complete_from_store': can_complete
        }), 200

    except Exception as e:
        log.error(f"Error checking store availability: {str(e)}")
        return jsonify({"error": f"Failed to check store availability: {str(e)}"}), 500


def complete_from_store(cr_id):
    """Request materials from M2 Store - creates internal requests without completing the purchase

    Accepts optional 'selected_materials' in request body to request only specific materials.
    If not provided, requests all materials in the CR.
    """
    try:
        current_user = g.user
        data = request.get_json() or {}
        selected_materials = data.get('selected_materials')  # Optional: list of material names to request

        cr = ChangeRequest.query.get(cr_id)
        if not cr:
            return jsonify({"error": "Change request not found"}), 404

        # Get materials from CR
        materials = cr.materials_data or cr.sub_items_data or []
        if not isinstance(materials, list):
            return jsonify({"error": "No materials found in this CR"}), 400

        # ✅ FIX: Filter out materials that have already been routed to store or vendor
        routed_materials = cr.routed_materials or {}
        materials = [
            mat for mat in materials
            if (mat.get('material_name') or mat.get('name') or '') not in routed_materials
        ]

        if not materials:
            return jsonify({"error": "All materials from this CR have already been routed"}), 400

        # Filter to selected materials if provided
        if selected_materials and isinstance(selected_materials, list):
            # Only include materials whose name is in selected_materials list
            materials = [
                mat for mat in materials
                if (mat.get('material_name') or mat.get('name') or '') in selected_materials
            ]
            if not materials:
                return jsonify({"error": "No matching materials found in selection"}), 400

        # Prepare grouped materials list and validate availability
        grouped_materials = []
        routed_materials_to_add = {}

        # Check availability for all materials first
        for mat in materials:
            mat_name = mat.get('material_name') or mat.get('name') or ''
            mat_qty = mat.get('quantity', 0)
            mat_unit = mat.get('unit', 'pcs')

            # Find in inventory
            inventory_item = InventoryMaterial.query.filter(
                InventoryMaterial.is_active == True,
                InventoryMaterial.material_name.ilike(f'%{mat_name}%')
            ).first()

            if not inventory_item:
                return jsonify({"error": f"Material '{mat_name}' not found in store"}), 400

            if inventory_item.current_stock < mat_qty:
                return jsonify({"error": f"Insufficient stock for '{mat_name}'. Need {mat_qty}, have {inventory_item.current_stock}"}), 400

            # Add to grouped materials
            grouped_materials.append({
                'material_name': mat_name,
                'quantity': mat_qty,
                'brand': mat.get('brand'),
                'size': mat.get('size'),
                'unit': mat_unit,
                'unit_price': mat.get('unit_price', 0),
                'total_price': mat.get('total_price', 0),
                'inventory_material_id': inventory_item.inventory_material_id
            })

            # Track this material as routed to store
            routed_materials_to_add[mat_name] = {
                'routing': 'store',
                'routed_at': datetime.utcnow().isoformat(),
                'routed_by': current_user.get('user_id')
            }

        # Create ONE grouped Internal Material Request (not multiple)
        requests_created = 0
        if grouped_materials:
            # Get project details for final destination
            project = Project.query.get(cr.project_id)
            final_destination = project.project_name if project else f"Project {cr.project_id}"

            new_request = InternalMaterialRequest(
                project_id=cr.project_id,
                cr_id=cr_id,
                item_name=cr.item_name,  # Store CR item name
                quantity=len(grouped_materials),  # Number of materials
                brand=None,
                size=None,
                notes=f"Requested from M2 Store for CR-{cr_id} - {len(grouped_materials)} material(s)",
                request_send=True,
                status='send_request',
                created_by=current_user.get('email', 'system'),
                request_buyer_id=current_user.get('user_id'),
                last_modified_by=current_user.get('email', 'system'),
                # Grouped materials data
                materials_data=grouped_materials,
                materials_count=len(grouped_materials),
                source_type='manual',  # Manual store request (not vendor delivery)
                final_destination_site=final_destination
            )
            db.session.add(new_request)
            requests_created = 1

            log.info(f"Created 1 grouped Internal Material Request for CR-{cr_id} with {len(grouped_materials)} materials from store")

        # ✅ FIX: Update routed_materials to prevent duplicates
        from sqlalchemy.orm.attributes import flag_modified
        current_routed = cr.routed_materials or {}
        current_routed.update(routed_materials_to_add)
        cr.routed_materials = current_routed
        flag_modified(cr, 'routed_materials')

        # Create a store POChild so this split is visible in buyer views
        store_po_child_id = None
        store_po_child_suffix = None
        if grouped_materials:
            # Determine next suffix number from existing POChildren
            existing_po_children = POChild.query.filter_by(
                parent_cr_id=cr_id,
                is_deleted=False
            ).all()

            max_suffix = 0
            for existing_po in existing_po_children:
                if existing_po.suffix:
                    try:
                        suffix_num = int(existing_po.suffix.replace('.', ''))
                        if suffix_num > max_suffix:
                            max_suffix = suffix_num
                    except (ValueError, AttributeError):
                        pass

            # Only create if no store POChild already exists for this CR
            existing_store_po = next(
                (po for po in existing_po_children if po.routing_type == 'store'),
                None
            )

            if not existing_store_po:
                next_suffix = max_suffix + 1
                store_po_child = POChild(
                    parent_cr_id=cr.cr_id,
                    suffix=f".{next_suffix}",
                    boq_id=cr.boq_id,
                    project_id=cr.project_id,
                    item_id=cr.item_id,
                    item_name=cr.item_name,
                    submission_group_id=None,
                    materials_data=grouped_materials,
                    materials_total_cost=sum(m.get('total_price', 0) for m in grouped_materials),
                    routing_type='store',
                    vendor_id=None,
                    vendor_name='M2 Store',
                    vendor_selected_by_buyer_id=current_user.get('user_id'),
                    vendor_selected_by_buyer_name=current_user.get('full_name', current_user.get('email')),
                    vendor_selection_date=datetime.utcnow(),
                    vendor_selection_status='store_routed',  # Explicitly NOT 'pending_td_approval' - store bypasses TD
                    status='routed_to_store',
                    is_deleted=False
                )
                db.session.add(store_po_child)
                db.session.flush()
                store_po_child_id = store_po_child.id
                store_po_child_suffix = f".{next_suffix}"
                log.info(f"Created store POChild PO-{cr_id}{store_po_child_suffix} with {len(grouped_materials)} materials")

        # Check if ALL materials in CR are now routed (store + vendor)
        all_cr_materials = cr.materials_data or cr.sub_items_data or []
        all_material_names = {
            mat.get('material_name') or mat.get('name') or ''
            for mat in all_cr_materials if isinstance(mat, dict)
        }
        all_routed_names = set(cr.routed_materials.keys()) if cr.routed_materials else set()
        all_materials_routed = all_material_names and all_material_names.issubset(all_routed_names)

        if all_materials_routed:
            # All materials routed — set parent to split_to_sub_crs so POChildren take over
            cr.status = 'split_to_sub_crs'
            log.info(f"All materials routed for CR-{cr_id}, set status to split_to_sub_crs")
        elif cr.status in ('pending', 'assigned_to_buyer', 'send_to_buyer', 'approved_by_pm'):
            # Some materials still unrouted — mark as sent_to_store so buyer can still select vendor for remaining
            cr.status = 'sent_to_store'

        cr.purchase_notes = f"Requested from M2 Store by {current_user.get('full_name', current_user.get('email'))} on {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
        cr.updated_at = datetime.utcnow()

        db.session.commit()

        return jsonify({
            "success": True,
            "message": f"Material request sent to M2 Store. {len(grouped_materials)} material(s) grouped in {requests_created} request.",
            "cr_id": cr_id,
            "requests_created": requests_created,
            "materials_count": len(grouped_materials),
            "store_po_child_id": store_po_child_id,
            "store_po_child_suffix": store_po_child_suffix
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
                "item_name": req.item_name,
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
