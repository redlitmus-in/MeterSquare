from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.change_request import ChangeRequest
from models.inventory import InventoryMaterial, InternalMaterialRequest
from models.po_child import POChild
from config.logging import get_logger
from datetime import datetime
from sqlalchemy.orm.attributes import flag_modified

log = get_logger()

__all__ = [
    'get_store_items', 'get_store_item_details', 'get_store_categories',
    'get_projects_by_material', 'check_store_availability',
    'complete_from_store', 'get_store_request_status', 'route_all_to_store',
]


# ─── Shared Helpers ───────────────────────────────────────────────────────────

def _normalize_material_name(name):
    """Normalize material name: strip, lowercase, collapse whitespace for exact matching."""
    return ' '.join((name or '').strip().lower().split())


def _get_cr_materials(cr):
    """Get materials from CR with consistent source ordering.
    Always prefers sub_items_data over materials_data."""
    materials = cr.sub_items_data or cr.materials_data or []
    return materials if isinstance(materials, list) else []


def _merge_duplicate_materials(materials):
    """Merge materials with the same name, combining quantities and total_price."""
    merged = {}
    for mat in materials:
        mat_name = (mat.get('material_name') or mat.get('name') or '').strip()
        if not mat_name:
            continue
        if mat_name in merged:
            merged[mat_name]['quantity'] = merged[mat_name].get('quantity', 0) + mat.get('quantity', 0)
            merged[mat_name]['total_price'] = merged[mat_name].get('total_price', 0) + mat.get('total_price', 0)
        else:
            merged[mat_name] = {**mat, 'material_name': mat_name}
    return list(merged.values())


def _find_inventory_by_name(name, inventory_items):
    """Find inventory item by exact normalized name match."""
    name_norm = _normalize_material_name(name)
    for item in inventory_items:
        item_norm = _normalize_material_name(item.material_name)
        if name_norm == item_norm:
            return item
    return None


def _get_active_po_children(cr_id):
    """Fetch all non-deleted POChildren for a CR. Returns the list for reuse."""
    return POChild.query.filter_by(
        parent_cr_id=cr_id,
        is_deleted=False
    ).all()


def _get_materials_in_po_children(po_children):
    """Extract material names from active (non-rejected) POChildren."""
    materials = set()
    for pc in po_children:
        if pc.status == 'rejected':
            continue
        if pc.materials_data and isinstance(pc.materials_data, list):
            for mat in pc.materials_data:
                mat_name = mat.get('material_name', '').strip()
                if mat_name:
                    materials.add(mat_name)
    return materials


def _calculate_next_suffix(existing_po_children):
    """Calculate the next POChild suffix number."""
    max_suffix = 0
    for po in existing_po_children:
        if po.suffix:
            try:
                suffix_num = int(po.suffix.replace('.', ''))
                if suffix_num > max_suffix:
                    max_suffix = suffix_num
            except (ValueError, AttributeError):
                pass
    return max_suffix + 1


def _check_all_materials_routed(cr):
    """Check if all materials in a CR have been routed."""
    all_cr_materials = _get_cr_materials(cr)
    all_material_names = {
        (mat.get('material_name') or mat.get('name') or '').strip()
        for mat in all_cr_materials if isinstance(mat, dict)
    } - {''}
    all_routed_names = {k.strip() for k in cr.routed_materials.keys()} if cr.routed_materials else set()
    return bool(all_material_names) and all_material_names.issubset(all_routed_names)


def _create_store_po_child(cr, grouped_materials, buyer_id, buyer_name, existing_po_children):
    """Create a store-routed POChild. Returns (po_child_id, po_child) or (None, None) if duplicate exists."""
    # Check if an active store POChild already exists (prevent duplicates, allow retry after rejection)
    existing_store_po = next(
        (po for po in existing_po_children
         if po.routing_type == 'store' and po.status not in ('store_rejected', 'rejected')),
        None
    )
    if existing_store_po:
        return existing_store_po.id, existing_store_po

    next_suffix = _calculate_next_suffix(existing_po_children)
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
        vendor_selected_by_buyer_id=buyer_id,
        vendor_selected_by_buyer_name=buyer_name,
        vendor_selection_date=datetime.utcnow(),
        vendor_selection_status='store_routed',
        status='sent_to_store',
        is_deleted=False
    )
    db.session.add(store_po_child)
    db.session.flush()
    return store_po_child.id, store_po_child


def _create_store_imr(cr, cr_id, grouped_materials, current_user, final_destination, source_type='manual', po_child_id=None):
    """Create an Internal Material Request for store routing."""
    new_request = InternalMaterialRequest(
        project_id=cr.project_id,
        cr_id=cr_id,
        item_name=cr.item_name,
        quantity=len(grouped_materials),
        brand=None,
        size=None,
        notes=f"Requested from M2 Store for CR-{cr_id} - {len(grouped_materials)} material(s)",
        request_send=True,
        status='send_request',
        created_by=current_user.get('email', 'system'),
        request_buyer_id=current_user.get('user_id'),
        last_modified_by=current_user.get('email', 'system'),
        materials_data=grouped_materials,
        materials_count=len(grouped_materials),
        source_type=source_type,
        final_destination_site=final_destination,
        po_child_id=po_child_id
    )
    db.session.add(new_request)
    return new_request


def _update_cr_status(cr, has_vendor_po_children, all_materials_routed):
    """Update parent CR status based on routing state."""
    cr.store_request_status = 'pending_store_approval'
    if all_materials_routed:
        cr.status = 'split_to_sub_crs' if has_vendor_po_children else 'sent_to_store'
    else:
        cr.status = 'sent_to_store'


def _notify_store_routing(cr, cr_id, project, buyer_name, buyer_user_id, materials_count):
    """Send notification to Production Managers about store routing (non-blocking)."""
    try:
        from utils.comprehensive_notification_service import ComprehensiveNotificationService
        ComprehensiveNotificationService.notify_store_routing(
            cr_id=cr_id,
            cr_number=getattr(cr, 'cr_number', None) or str(cr_id),
            project_name=project.project_name if project else f'Project {cr.project_id}',
            buyer_name=buyer_name,
            buyer_user_id=buyer_user_id,
            materials_count=materials_count,
            routing_type='store'
        )
    except Exception as notif_err:
        log.error(f"Failed to send store routing notification for CR-{cr_id}: {notif_err}")


def _validate_buyer_assignment(cr, buyer_id):
    """Validate that the CR is assigned to the calling buyer. Returns error response or None."""
    if cr.assigned_to_buyer_user_id and cr.assigned_to_buyer_user_id != buyer_id:
        return jsonify({"error": "This purchase is not assigned to you"}), 403
    return None


def _get_store_imrs_for_cr(cr_id):
    """Get buyer-initiated store routing IMRs for a CR (SQL-side filtering)."""
    return InternalMaterialRequest.query.filter(
        InternalMaterialRequest.cr_id == cr_id,
        db.or_(
            InternalMaterialRequest.source_type.in_(['buyer_store_routing', 'manual']),
            InternalMaterialRequest.source_type.is_(None)
        )
    ).all()


# ─── Store Management Functions ───────────────────────────────────────────────

def get_store_items():
    """Get all available store items from inventory"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 100, type=int), 500)

        paginated = InventoryMaterial.query.filter_by(is_active=True).paginate(
            page=page, per_page=per_page, error_out=False
        )
        materials = paginated.items

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
        return jsonify({"error": "Failed to get store items"}), 500


def get_store_item_details(item_id):
    """Get details of a specific store item"""
    try:
        material = InventoryMaterial.query.filter_by(
            inventory_material_id=item_id,
            is_active=True
        ).first()

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
        return jsonify({"error": "Failed to get item details"}), 500


def get_store_categories():
    """Get all store categories from inventory"""
    try:
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
        return jsonify({"error": "Failed to get categories"}), 500


def get_projects_by_material(material_id):
    """Get projects with pending Change Requests containing this material, including CR details"""
    try:
        material = InventoryMaterial.query.filter_by(
            inventory_material_id=material_id,
            is_active=True
        ).first()
        if not material:
            return jsonify([]), 200

        material_name = material.material_name.strip().lower()

        completed_statuses = ['completed', 'purchase_completed', 'rejected']

        # Escape LIKE wildcards in material name to prevent pattern injection
        escaped_name = material.material_name.replace('%', r'\%').replace('_', r'\_')

        from sqlalchemy import cast, String
        change_requests = ChangeRequest.query.filter(
            ChangeRequest.status.notin_(completed_statuses),
            db.or_(
                cast(ChangeRequest.materials_data, String).ilike(f'%{escaped_name}%'),
                cast(ChangeRequest.sub_items_data, String).ilike(f'%{escaped_name}%')
            )
        ).all()

        if not change_requests:
            return jsonify([]), 200

        existing_requests = InternalMaterialRequest.query.filter(
            InternalMaterialRequest.inventory_material_id == material_id,
            InternalMaterialRequest.cr_id.isnot(None),
            InternalMaterialRequest.status.in_(['PENDING', 'send_request', 'approved'])
        ).all()
        crs_with_active_requests = {req.cr_id: req.status for req in existing_requests}

        _proj_ids = list({cr.project_id for cr in change_requests if cr.project_id})
        batch_projects = {
            p.project_id: p
            for p in Project.query.filter(Project.project_id.in_(_proj_ids)).all()
        } if _proj_ids else {}

        projects_list = []
        for cr in change_requests:
            project = batch_projects.get(cr.project_id)
            if not project or project.is_deleted:
                continue

            has_active_request = cr.cr_id in crs_with_active_requests
            active_request_status = crs_with_active_requests.get(cr.cr_id)

            quantity = 0
            unit = material.unit or 'nos'

            materials = _get_cr_materials(cr)
            for mat in materials:
                mat_name = (mat.get('material_name') or mat.get('name') or '').strip().lower()
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
        return jsonify({"error": "Failed to get projects"}), 500


def check_store_availability(cr_id):
    """Check if materials in a CR are available in the M2 Store inventory"""
    try:
        cr = ChangeRequest.query.get(cr_id)
        if not cr:
            return jsonify({"error": "Change request not found"}), 404

        materials = _get_cr_materials(cr)

        routed_materials = cr.routed_materials or {}
        already_routed_store = {
            name for name, info in routed_materials.items()
            if isinstance(info, dict) and info.get('routing') == 'store'
        }

        # Fetch POChildren once and reuse
        po_children = _get_active_po_children(cr_id)
        materials_in_po_children = _get_materials_in_po_children(po_children)

        # Get store request status (SQL-side filtering)
        existing_store_requests = _get_store_imrs_for_cr(cr_id)
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
        already_sent_materials = []

        # Merge duplicate material names
        materials = _merge_duplicate_materials(materials)

        # Batch pre-fetch all active inventory materials
        all_inventory_items = InventoryMaterial.query.filter(
            InventoryMaterial.is_active == True
        ).all()

        for mat in materials:
            mat_name = (mat.get('material_name') or mat.get('name') or '').strip()
            mat_qty = mat.get('quantity', 0)

            if mat_name in materials_in_po_children:
                continue

            if mat_name in already_routed_store:
                already_sent_materials.append({
                    'material_name': mat_name,
                    'required_quantity': mat_qty,
                    'status': store_request_status,
                    'already_sent': True
                })
                continue

            inventory_item = _find_inventory_by_name(mat_name, all_inventory_items)

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

        can_complete = len(available_materials) > 0

        return jsonify({
            'success': True,
            'cr_id': cr_id,
            'all_available_in_store': len(unavailable_materials) == 0 and len(available_materials) > 0,
            'available_materials': available_materials,
            'unavailable_materials': unavailable_materials,
            'already_sent_materials': already_sent_materials,
            'can_complete_from_store': can_complete
        }), 200

    except Exception as e:
        log.error(f"Error checking store availability: {str(e)}")
        return jsonify({"error": "Failed to check store availability"}), 500


def complete_from_store(cr_id):
    """Request materials from M2 Store - creates internal requests without completing the purchase

    Accepts optional 'selected_materials' in request body to request only specific materials.
    If not provided, requests all materials in the CR.
    """
    try:
        current_user = g.user
        data = request.get_json() or {}
        selected_materials = data.get('selected_materials')

        # Validate selected_materials input
        if selected_materials is not None:
            if not isinstance(selected_materials, list) or len(selected_materials) > 500:
                return jsonify({"error": "Invalid selected_materials format"}), 400
            if not all(isinstance(s, str) and len(s) < 500 for s in selected_materials):
                return jsonify({"error": "Invalid material name in selection"}), 400

        # Lock CR row to prevent race conditions on concurrent requests
        cr = db.session.query(ChangeRequest).filter_by(cr_id=cr_id).with_for_update().first()
        if not cr:
            return jsonify({"error": "Change request not found"}), 404

        # Validate buyer assignment
        buyer_id = current_user.get('user_id')
        auth_error = _validate_buyer_assignment(cr, buyer_id)
        if auth_error:
            return auth_error

        # Get materials from CR (consistent ordering)
        materials = _get_cr_materials(cr)
        if not materials:
            return jsonify({"error": "No materials found in this CR"}), 400

        # Filter out already-routed materials
        routed_materials = cr.routed_materials or {}
        materials = [
            mat for mat in materials
            if (mat.get('material_name') or mat.get('name') or '').strip() not in routed_materials
        ]
        if not materials:
            return jsonify({"error": "All materials from this CR have already been routed"}), 400

        # Fetch POChildren once and reuse
        existing_po_children = _get_active_po_children(cr_id)
        materials_in_po_children = _get_materials_in_po_children(existing_po_children)

        if materials_in_po_children:
            materials = [
                mat for mat in materials
                if (mat.get('material_name') or mat.get('name') or '').strip() not in materials_in_po_children
            ]
            if not materials:
                return jsonify({"error": "All remaining materials are already assigned to vendors"}), 400

        # Merge duplicate material names
        materials = _merge_duplicate_materials(materials)

        # Filter to selected materials if provided
        if selected_materials and isinstance(selected_materials, list):
            selected_set = {name.strip() for name in selected_materials}
            materials = [
                mat for mat in materials
                if (mat.get('material_name') or mat.get('name') or '').strip() in selected_set
            ]
            if not materials:
                return jsonify({"error": "No matching materials found in selection"}), 400

        # Prepare grouped materials and validate availability
        grouped_materials = []
        routed_materials_to_add = {}

        # Batch pre-fetch all active inventory materials
        all_inventory_items = InventoryMaterial.query.filter(
            InventoryMaterial.is_active == True
        ).all()

        for mat in materials:
            mat_name = (mat.get('material_name') or mat.get('name') or '').strip()
            mat_qty = mat.get('quantity', 0)
            mat_unit = mat.get('unit', 'pcs')

            # Use exact normalized matching (consistent with check_store_availability)
            inventory_item = _find_inventory_by_name(mat_name, all_inventory_items)

            if not inventory_item:
                return jsonify({"error": f"Material '{mat_name}' not found in store"}), 400

            if inventory_item.current_stock < mat_qty:
                return jsonify({"error": f"Insufficient stock for '{mat_name}'. Need {mat_qty}, have {inventory_item.current_stock}"}), 400

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

            routed_materials_to_add[mat_name] = {
                'routing': 'store',
                'routed_at': datetime.utcnow().isoformat(),
                'routed_by': buyer_id
            }

        # Update routed_materials to prevent duplicates
        current_routed = cr.routed_materials or {}
        current_routed.update(routed_materials_to_add)
        cr.routed_materials = current_routed
        flag_modified(cr, 'routed_materials')

        has_vendor_po_children = any(pc.routing_type == 'vendor' for pc in existing_po_children)
        all_materials_routed = _check_all_materials_routed(cr)

        # Create store POChild and IMR
        store_po_child_id = None
        store_po_child_suffix = None
        requests_created = 0

        if grouped_materials:
            project = Project.query.get(cr.project_id)
            final_destination = project.project_name if project else f"Project {cr.project_id}"
            buyer_name = current_user.get('full_name', current_user.get('email'))

            store_po_child_id, store_po_child_obj = _create_store_po_child(
                cr, grouped_materials, buyer_id, buyer_name, existing_po_children
            )
            store_po_child_suffix = store_po_child_obj.suffix if store_po_child_obj else None

            new_request = _create_store_imr(
                cr, cr_id, grouped_materials, current_user, final_destination,
                source_type='manual', po_child_id=store_po_child_id
            )
            requests_created = 1

            _update_cr_status(cr, has_vendor_po_children, all_materials_routed)

        cr.purchase_notes = f"Requested from M2 Store by {current_user.get('full_name', current_user.get('email'))} on {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
        cr.updated_at = datetime.utcnow()

        db.session.commit()

        # Non-blocking notification
        if grouped_materials:
            _notify_store_routing(cr, cr_id, project, buyer_name, buyer_id, len(grouped_materials))

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
        return jsonify({"error": "Failed to request from store"}), 500


def get_store_request_status(cr_id):
    """Get the status of store requests for a CR"""
    try:
        # SQL-side filtering (not Python-side)
        requests = _get_store_imrs_for_cr(cr_id)

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
        return jsonify({"error": "Failed to get store request status"}), 500


def route_all_to_store(cr_id):
    """Route remaining materials to M2 Store.

    Used when buyer sends materials to store via vendor selection modal.
    This is a routing decision — does NOT check stock availability.
    Status: sent_to_store (not routed_to_store, which is for vendor→store completion).

    Split scenario: If vendor POChildren already exist, creates a store POChild
    and sets parent to 'split_to_sub_crs'. Otherwise updates parent CR directly.
    """
    try:
        current_user = g.user
        data = request.get_json() or {}
        material_names = data.get('material_names', [])

        # Validate material_names input
        if not isinstance(material_names, list) or len(material_names) > 500:
            return jsonify({"error": "Invalid material_names format"}), 400
        if material_names and not all(isinstance(s, str) and len(s) < 500 for s in material_names):
            return jsonify({"error": "Invalid material name in list"}), 400

        # Lock CR row to prevent race conditions
        cr = db.session.query(ChangeRequest).filter_by(cr_id=cr_id).with_for_update().first()
        if not cr:
            return jsonify({"error": "Change request not found"}), 404

        # Validate CR is assigned to this buyer
        buyer_id = current_user.get('user_id')
        auth_error = _validate_buyer_assignment(cr, buyer_id)
        if auth_error:
            return auth_error

        # Validate CR status
        allowed_statuses = ['assigned_to_buyer', 'send_to_buyer', 'approved_by_pm', 'pending_td_approval', 'split_to_sub_crs', 'sent_to_store']
        if cr.status and cr.status.strip() not in allowed_statuses:
            return jsonify({"error": f"Cannot route to store. Current status: {cr.status}"}), 400

        # Get all materials from CR (consistent ordering)
        all_materials = _get_cr_materials(cr)
        if not all_materials:
            return jsonify({"error": "No materials found in this CR"}), 400

        cr_material_names = {
            (mat.get('material_name') or mat.get('name') or '').strip()
            for mat in all_materials if isinstance(mat, dict)
        } - {''}

        # Fetch POChildren once and reuse
        existing_po_children = _get_active_po_children(cr_id)
        materials_in_po_children = _get_materials_in_po_children(existing_po_children)
        if materials_in_po_children:
            cr_material_names -= materials_in_po_children

        if material_names:
            stripped_material_names = [n.strip() for n in material_names]
            invalid = set(stripped_material_names) - cr_material_names
            if invalid:
                return jsonify({"error": f"Materials not found in CR: {', '.join(invalid)}"}), 400
            materials_to_route = stripped_material_names
        else:
            materials_to_route = list(cr_material_names)

        if not materials_to_route:
            return jsonify({"error": "All materials are already assigned to vendors"}), 400

        # Build routed_materials tracking
        routed_materials = cr.routed_materials or {}
        for mat_name in materials_to_route:
            routed_materials[mat_name] = {
                'routing': 'store',
                'routed_at': datetime.utcnow().isoformat(),
                'routed_by': buyer_id
            }
        cr.routed_materials = routed_materials
        flag_modified(cr, 'routed_materials')

        # Build grouped materials for IMR (merge duplicates)
        grouped_materials = _merge_duplicate_materials([
            mat for mat in all_materials
            if (mat.get('material_name') or mat.get('name') or '').strip() in set(materials_to_route)
        ])

        # Get project details
        project = Project.query.get(cr.project_id)
        final_destination = project.project_name if project else f"Project {cr.project_id}"
        buyer_name = current_user.get('full_name', current_user.get('email', 'Buyer'))

        has_vendor_po_children = any(pc.routing_type == 'vendor' for pc in existing_po_children)
        all_materials_routed = _check_all_materials_routed(cr)

        store_po_child_id = None

        # Create store POChild when needed (split scenario or partial routing)
        needs_store_po_child = (has_vendor_po_children or not all_materials_routed) and bool(grouped_materials)

        if needs_store_po_child:
            store_po_child_id, store_po_child = _create_store_po_child(
                cr, grouped_materials, buyer_id, buyer_name, existing_po_children
            )

        # Create IMR and link to POChild
        new_request = _create_store_imr(
            cr, cr_id, grouped_materials, current_user, final_destination,
            source_type='buyer_store_routing',
            po_child_id=store_po_child_id
        )

        _update_cr_status(cr, has_vendor_po_children, all_materials_routed)

        cr.purchase_notes = f"Materials sent to M2 Store by {buyer_name} on {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
        cr.updated_at = datetime.utcnow()

        db.session.commit()

        # Non-blocking notification
        _notify_store_routing(cr, cr_id, project, buyer_name, buyer_id, len(grouped_materials))

        return jsonify({
            "success": True,
            "message": f"{len(grouped_materials)} material(s) sent to M2 Store successfully!",
            "cr_id": cr_id,
            "materials_count": len(grouped_materials),
            "status": cr.status,
            "store_po_child_id": store_po_child_id
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error routing all to store for CR-{cr_id}: {str(e)}")
        return jsonify({"error": "Failed to route to store"}), 500
