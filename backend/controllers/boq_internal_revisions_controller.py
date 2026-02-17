"""
BOQ Internal Revisions Controller
Handles tracking and retrieval of internal approval cycles (PM edits, TD rejections)
before sending to client for the first time
"""

from flask import request, jsonify, g
from config.db import db
from config.logging import get_logger
from models.boq import *
from controllers.boq_controller import *
from models.preliminary_master import *
from models.project import Project
from sqlalchemy import text
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime
import json

log = get_logger()

def get_all_internal_revision():
    """
    Get all BOQs with their internal revisions
    Returns complete BOQ details with all internal revision history
    - Estimators: Only see projects assigned to them
    - Technical Directors: See all projects

    GET /api/boqs/all-internal-revisions
    """
    try:
        from sqlalchemy.orm import selectinload, joinedload
        from models.boq import MasterSubItem, MasterItem

        # Get current logged-in user
        current_user = getattr(g, 'user', None)
        user_id = current_user.get('user_id') if current_user else None
        user_role = current_user.get('role', '').lower() if current_user else ''

        # Get all BOQ IDs that have internal revision records (handle NULL is_deleted as not deleted)
        boq_ids_with_revisions = db.session.query(BOQInternalRevision.boq_id).filter(
            db.or_(
                BOQInternalRevision.is_deleted == False,
                BOQInternalRevision.is_deleted.is_(None)
            )
        ).distinct().all()

        boq_ids = [row[0] for row in boq_ids_with_revisions]

        if not boq_ids:
            return jsonify({"success": True, "count": 0, "message": "No BOQs with internal revisions", "user_role": user_role, "data": []}), 200

        # PERFORMANCE: Eager load project relationship to prevent N+1
        base_filter = [
            BOQ.is_deleted == False,
            db.or_(
                BOQ.has_internal_revisions == True,
                BOQ.boq_id.in_(boq_ids)
            )
        ]

        if user_role in ('technical_director', 'technicaldirector'):
            boqs_query = BOQ.query.options(
                joinedload(BOQ.project)
            ).filter(*base_filter)
        elif user_role == 'admin':
            boqs_query = BOQ.query.options(
                joinedload(BOQ.project)
            ).filter(*base_filter)
        elif user_role == 'estimator':
            boqs_query = BOQ.query.options(
                joinedload(BOQ.project)
            ).join(
                Project, BOQ.project_id == Project.project_id
            ).filter(
                *base_filter,
                Project.is_deleted == False,
                Project.estimator_id == user_id
            )
        else:
            base_filter.append(db.func.lower(BOQ.status) != 'internal_revision_pending')
            boqs_query = BOQ.query.options(
                joinedload(BOQ.project)
            ).filter(*base_filter)

        boqs = boqs_query.all()

        if not boqs:
            return jsonify({"success": True, "count": 0, "message": "No BOQs with internal revisions", "user_role": user_role, "data": []}), 200

        all_boq_ids = [boq.boq_id for boq in boqs]

        # PERFORMANCE: Batch load all BOQDetails for all BOQs (1 query instead of N)
        all_boq_details = BOQDetails.query.filter(
            BOQDetails.boq_id.in_(all_boq_ids),
            BOQDetails.is_deleted == False
        ).all()
        boq_details_map = {bd.boq_id: bd for bd in all_boq_details}

        # PERFORMANCE: Batch load all internal revisions for all BOQs (1 query instead of N)
        all_revisions = BOQInternalRevision.query.filter(
            BOQInternalRevision.boq_id.in_(all_boq_ids),
            db.or_(
                BOQInternalRevision.is_deleted == False,
                BOQInternalRevision.is_deleted.is_(None)
            )
        ).order_by(BOQInternalRevision.boq_id, BOQInternalRevision.internal_revision_number.desc()).all()

        # Group revisions by boq_id
        revisions_by_boq = {}
        for rev in all_revisions:
            if rev.boq_id not in revisions_by_boq:
                revisions_by_boq[rev.boq_id] = []
            revisions_by_boq[rev.boq_id].append(rev)

        # PERFORMANCE: Batch load all sub-item images (1 query instead of N per sub-item)
        # Collect all sub_item_ids from all BOQ details
        all_sub_item_ids = set()
        all_item_sub_item_names = []  # For fallback name-based lookup

        for boq in boqs:
            boq_details = boq_details_map.get(boq.boq_id)
            if boq_details and boq_details.boq_details:
                for item in boq_details.boq_details.get('items', []):
                    for sub_item in item.get('sub_items', []):
                        sid = sub_item.get('sub_item_id') or sub_item.get('master_sub_item_id')
                        if sid:
                            all_sub_item_ids.add(sid)
                        else:
                            item_name = item.get('item_name')
                            sub_item_name = sub_item.get('sub_item_name')
                            if item_name and sub_item_name:
                                all_item_sub_item_names.append((item_name, sub_item_name))

        # Batch fetch sub-item images by ID (1 query)
        sub_item_image_map = {}
        if all_sub_item_ids:
            sub_items_with_images = MasterSubItem.query.filter(
                MasterSubItem.sub_item_id.in_(list(all_sub_item_ids)),
                MasterSubItem.sub_item_image.isnot(None)
            ).all()
            for msi in sub_items_with_images:
                sub_item_image_map[msi.sub_item_id] = msi.sub_item_image

        # Batch fetch by name for fallback (only if needed)
        name_to_image_map = {}
        item_name_to_id = {}
        if all_item_sub_item_names:
            unique_item_names = set(name for name, _ in all_item_sub_item_names)
            master_items = MasterItem.query.filter(
                MasterItem.item_name.in_(list(unique_item_names))
            ).all()
            item_name_to_id = {mi.item_name: mi.item_id for mi in master_items}

            # Get all sub-items for these master items
            if item_name_to_id:
                fallback_sub_items = MasterSubItem.query.filter(
                    MasterSubItem.item_id.in_(list(item_name_to_id.values()))
                ).all()
                for msi in fallback_sub_items:
                    name_to_image_map[(msi.item_id, msi.sub_item_name)] = {
                        'sub_item_id': msi.sub_item_id,
                        'sub_item_image': msi.sub_item_image
                    }

        # PERFORMANCE: Batch load terms - fetch master terms once and per-BOQ selections in batch
        # Get all active terms (shared across all BOQs)
        all_terms_query = text("""
            SELECT term_id, terms_text, display_order
            FROM boq_terms
            WHERE is_active = TRUE AND is_deleted = FALSE
            ORDER BY display_order, term_id
        """)
        all_terms_rows = db.session.execute(all_terms_query).fetchall()
        master_terms = [{'term_id': row[0], 'terms_text': row[1], 'display_order': row[2]} for row in all_terms_rows]

        # Batch fetch term selections for all BOQs (1 query instead of N)
        term_selections_query = text("""
            SELECT boq_id, term_ids FROM boq_terms_selections WHERE boq_id = ANY(:boq_ids)
        """)
        term_selections_result = db.session.execute(term_selections_query, {'boq_ids': all_boq_ids}).fetchall()
        term_selections_map = {row[0]: (row[1] if row[1] else []) for row in term_selections_result}

        # Helper to calculate total cost from revision snapshot
        def _calc_revision_cost(snapshot):
            items = snapshot.get('items', [])
            if not items:
                return snapshot.get('total_cost', 0)

            subtotal = 0
            for item in items:
                item_amount = (item.get('quantity', 0) or 0) * (item.get('rate', 0) or 0)
                if item_amount == 0 and item.get('sub_items'):
                    for si in item.get('sub_items', []):
                        item_amount += (si.get('quantity', 0) or 0) * (si.get('rate', 0) or 0)
                subtotal += item_amount

            preliminary_amount = snapshot.get('preliminaries', {}).get('cost_details', {}).get('amount', 0) or 0
            combined_subtotal = subtotal + preliminary_amount

            disc_amount = snapshot.get('discount_amount', 0) or 0
            disc_pct = snapshot.get('discount_percentage', 0) or 0
            if disc_pct > 0 and disc_amount == 0:
                disc_amount = (combined_subtotal * disc_pct) / 100

            return combined_subtotal - disc_amount

        # Build result using pre-loaded data (no per-BOQ queries)
        result = []

        for boq in boqs:
            internal_revisions = revisions_by_boq.get(boq.boq_id, [])
            if not internal_revisions:
                continue

            revisions_list = [{
                "id": rev.id,
                "internal_revision_number": rev.internal_revision_number,
                "created_at": rev.created_at.isoformat() if rev.created_at else None
            } for rev in internal_revisions]

            # Calculate latest revision total cost
            latest_revision_total_cost = 0
            boq_details = boq_details_map.get(boq.boq_id)

            for revision in internal_revisions:
                if revision.action_type != 'ORIGINAL_BOQ' and revision.changes_summary:
                    latest_revision_total_cost = _calc_revision_cost(revision.changes_summary)
                    break

            if latest_revision_total_cost == 0 and boq_details:
                latest_revision_total_cost = boq_details.total_cost or 0
                if boq_details.boq_details:
                    d_amt = boq_details.boq_details.get('discount_amount', 0) or 0
                    d_pct = boq_details.boq_details.get('discount_percentage', 0) or 0
                    if d_pct > 0 and d_amt == 0:
                        d_amt = (latest_revision_total_cost * d_pct) / 100
                    if d_amt > 0:
                        latest_revision_total_cost -= d_amt

            # Get items with images from pre-loaded data
            items = []
            preliminaries = None
            discount_percentage = 0
            discount_amount = 0

            if boq_details and boq_details.boq_details:
                details_json = boq_details.boq_details
                items = details_json.get('items', [])
                preliminaries = details_json.get('preliminaries', None)
                discount_percentage = details_json.get('discount_percentage', 0) or 0
                discount_amount = details_json.get('discount_amount', 0) or 0

                # Enrich sub-items with images from pre-loaded maps (no queries)
                for item in items:
                    for sub_item in item.get('sub_items', []):
                        sid = sub_item.get('sub_item_id') or sub_item.get('master_sub_item_id')
                        if sid and sid in sub_item_image_map:
                            sub_item['sub_item_image'] = sub_item_image_map[sid]
                        elif not sid:
                            item_name = item.get('item_name')
                            sub_item_name = sub_item.get('sub_item_name')
                            if item_name and sub_item_name and item_name_to_id:
                                item_id = item_name_to_id.get(item_name)
                                if item_id:
                                    lookup = name_to_image_map.get((item_id, sub_item_name))
                                    if lookup:
                                        sub_item['sub_item_id'] = lookup['sub_item_id']
                                        if lookup['sub_item_image']:
                                            sub_item['sub_item_image'] = lookup['sub_item_image']

            # Build terms from pre-loaded data (no queries)
            selected_term_ids = term_selections_map.get(boq.boq_id, [])
            terms_conditions = {'items': [{
                'id': f'term-{t["term_id"]}',
                'term_id': t['term_id'],
                'terms_text': t['terms_text'],
                'display_order': t['display_order'],
                'checked': t['term_id'] in selected_term_ids,
                'isCustom': False
            } for t in master_terms]}

            # Use eagerly-loaded project (no query)
            project = boq.project

            boq_data = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "title": boq.boq_name,
                "project_name": project.project_name if project else boq.boq_name,
                "client": project.client if project else "Unknown",
                "status": boq.status,
                "revision_number": boq.revision_number,
                "internal_revision_number": boq.internal_revision_number,
                "total_cost": latest_revision_total_cost,
                "selling_price": latest_revision_total_cost,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "internal_revisions": revisions_list,
                "revision_count": len(revisions_list),
                "project": {
                    "name": project.project_name if project else boq.boq_name,
                    "client": project.client if project else "Unknown",
                    "location": project.location if project else "Unknown"
                } if project else None,
                "project_details": {
                    "project_name": project.project_name if project else boq.boq_name,
                    "client": project.client if project else "Unknown",
                    "location": project.location if project else "Unknown"
                } if project else None,
                "details": {
                    "items": items,
                    "total_items": len(items)
                },
                "items": items,
                "total_items": len(items),
                "preliminaries": preliminaries,
                "terms_conditions": terms_conditions,
                "discount_percentage": discount_percentage,
                "discount_amount": discount_amount
            }

            result.append(boq_data)

        # Build response message based on user role
        if user_role == 'estimator':
            message = f"Found {len(result)} BOQ(s) with internal revisions assigned to you"
        elif user_role == 'technical_director':
            message = f"Found {len(result)} BOQ(s) with internal revisions (all projects)"
        else:
            message = f"Found {len(result)} BOQ(s) with internal revisions"

        return jsonify({
            "success": True,
            "count": len(result),
            "message": message,
            "user_role": user_role,
            "data": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching internal revisions: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def get_internal_revisions(boq_id):
    """
    Get all internal revisions for a BOQ (excluding the current one if applicable)

    GET /api/boq/<boq_id>/internal_revisions
    """
    try:
        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        current_internal_revision = boq.internal_revision_number or 0

        # Helper function to enrich BOQ details with terms_conditions and images
        def enrich_internal_revision_data(changes_summary):
            if not changes_summary:
                return changes_summary

            import copy
            enriched = copy.deepcopy(changes_summary)

            # Fetch terms & conditions from database (single row with term_ids array)
            try:
                # First get selected term_ids for this BOQ
                term_ids_query = text("""
                    SELECT term_ids FROM boq_terms_selections WHERE boq_id = :boq_id
                """)
                term_ids_result = db.session.execute(term_ids_query, {'boq_id': boq_id}).fetchone()
                selected_term_ids = term_ids_result[0] if term_ids_result and term_ids_result[0] else []

                # Get all active terms from master
                all_terms_query = text("""
                    SELECT term_id, terms_text, display_order
                    FROM boq_terms
                    WHERE is_active = TRUE AND is_deleted = FALSE
                    ORDER BY display_order, term_id
                """)
                all_terms_result = db.session.execute(all_terms_query)
                terms_items = []
                for row in all_terms_result:
                    term_id = row[0]
                    terms_items.append({
                        'term_id': term_id,
                        'terms_text': row[1],
                        'checked': term_id in selected_term_ids
                    })

                # Add terms_conditions to changes_summary
                if terms_items:
                    enriched['terms_conditions'] = {
                        'items': terms_items
                    }
            except Exception as e:
                log.error(f"Error fetching terms for BOQ {boq_id}: {str(e)}")

            # Fetch sub_item images from database
            try:
                items = enriched.get('items', [])
                for item in items:
                    if item.get('sub_items'):
                        for sub_item in item['sub_items']:
                            sub_item_id = sub_item.get('sub_item_id')
                            if sub_item_id:
                                # Fetch image from master_sub_items table
                                master_sub_item = MasterSubItem.query.filter_by(
                                    sub_item_id=sub_item_id,
                                    is_deleted=False
                                ).first()

                                if master_sub_item and master_sub_item.sub_item_image:
                                    sub_item['sub_item_image'] = master_sub_item.sub_item_image
            except Exception as e:
                log.error(f"Error fetching images for BOQ {boq_id}: {str(e)}")

            return enriched

        # ✅ Fix: Fetch all internal revisions linked to this BOQ (not filtered by < current)
        # Because BOQInternalRevision stores history snapshots, not only numeric sequence comparisons

        # Debug: Check total records for this BOQ (including deleted)
        total_revisions_all = BOQInternalRevision.query.filter(
            BOQInternalRevision.boq_id == boq_id
        ).count()

        # Query internal revisions - handle NULL is_deleted as FALSE (not deleted)
        revisions = BOQInternalRevision.query.filter(
            BOQInternalRevision.boq_id == boq_id,
            db.or_(
                BOQInternalRevision.is_deleted == False,
                BOQInternalRevision.is_deleted.is_(None)  # Handle NULL as not deleted
            )
        ).order_by(BOQInternalRevision.internal_revision_number.asc()).all()

        internal_revisions = []
        original_boq = None

        for rev in revisions:
            # 🔥 ALWAYS recalculate from items to ensure accuracy (don't trust stored total_cost)
            changes_summary = rev.changes_summary.copy() if rev.changes_summary else {}

            # Enrich with terms and images from database
            changes_summary = enrich_internal_revision_data(changes_summary)

            if changes_summary:
                items = changes_summary.get('items', [])
                if items and len(items) > 0:
                    # Calculate subtotal from items
                    subtotal = 0
                    for item in items:
                        item_amount = (item.get('quantity', 0) or 0) * (item.get('rate', 0) or 0)
                        # If item rate is 0, calculate from sub_items
                        if item_amount == 0 and item.get('sub_items'):
                            for sub_item in item.get('sub_items', []):
                                item_amount += (sub_item.get('quantity', 0) or 0) * (sub_item.get('rate', 0) or 0)
                        subtotal += item_amount

                    # Add preliminaries amount to subtotal
                    preliminary_amount = changes_summary.get('preliminaries', {}).get('cost_details', {}).get('amount', 0) or 0
                    combined_subtotal = subtotal + preliminary_amount

                    # Apply discount
                    discount_amount = changes_summary.get('discount_amount', 0) or 0
                    discount_percentage = changes_summary.get('discount_percentage', 0) or 0

                    if discount_percentage > 0 and discount_amount == 0:
                        discount_amount = (combined_subtotal * discount_percentage) / 100

                    # Store corrected values
                    changes_summary['total_cost_before_discount'] = combined_subtotal
                    changes_summary['total_cost'] = combined_subtotal - discount_amount
                else:
                    # No items, use existing total_cost
                    log.info(f"📊 Revision {rev.id}: No items, using stored total_cost")

            revision_data = {
                "id": rev.id,
                "boq_id": rev.boq_id,
                "internal_revision_number": rev.internal_revision_number,
                "action_type": rev.action_type,
                "actor_role": rev.actor_role,
                "actor_name": rev.actor_name,
                "actor_user_id": rev.actor_user_id,
                "status_before": rev.status_before,
                "status_after": rev.status_after,
                "changes_summary": changes_summary,
                "rejection_reason": rev.rejection_reason,
                "approval_comments": rev.approval_comments,
                "created_at": rev.created_at.isoformat() if rev.created_at else None
            }

            # 🔥 If this is the Original BOQ (revision 0), store it separately
            if rev.internal_revision_number == 0 and rev.action_type == 'ORIGINAL_BOQ':
                original_boq = {
                    "boq_details": changes_summary,  # 🔥 Use the updated changes_summary with discount applied
                    "internal_revision_number": 0,
                    "action_type": "ORIGINAL_BOQ",
                    "created_at": rev.created_at.isoformat() if rev.created_at else None
                }

            internal_revisions.append(revision_data)

        return jsonify({
            "success": True,
            "data": {
                "boq_id": boq_id,
                "boq_name": boq.boq_name,
                "current_internal_revision": current_internal_revision,
                "has_internal_revisions": boq.has_internal_revisions or bool(internal_revisions),
                "internal_revisions": internal_revisions,
                "original_boq": original_boq,  # 🔥 Include original BOQ in response
                "total_count": len(internal_revisions)
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching internal revisions for BOQ {boq_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


def update_internal_revision_boq(boq_id):
    """
    Store BOQ edits in internal revision table WITHOUT updating main BOQ data
    This allows tracking internal changes before TD approval
    """
    try:
        data = request.get_json()

        # Get current logged-in user
        current_user = getattr(g, 'user', None)
        user_id = current_user.get('user_id') if current_user else None
        user_role = current_user.get('role', '').lower() if current_user else ''
        user_name = current_user.get('full_name') or current_user.get('username') or 'Unknown' if current_user else 'Unknown'

        boq = BOQ.query.filter_by(boq_id=boq_id).first()

        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get existing BOQ details (for reference only, not updating)
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Store current status for history
        current_status = boq.status

        # Update BOQ status to Internal_Revision_Pending
        boq.status = "Internal_Revision_Pending"
        boq.last_modified_by = user_name
        boq.last_modified_at = datetime.utcnow()

        # 🔥 Fix: Explicitly add BOQ to session and flag as modified to ensure status is saved
        db.session.add(boq)
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(boq, 'status')

        # Extract summary values from incoming payload (do NOT recalculate)
        # The frontend has already calculated everything, just use those values
        combined_summary = data.get("combined_summary", {})

        # Use values from combined_summary if available, otherwise extract from items
        total_boq_cost = float(combined_summary.get("total_cost", 0) or combined_summary.get("selling_price", 0) or combined_summary.get("estimatedSellingPrice", 0))
        total_items = int(combined_summary.get("total_items", len(data.get("items", []))))
        total_materials = int(combined_summary.get("total_materials", 0))
        total_labour = int(combined_summary.get("total_labour", 0))
        total_material_cost = float(combined_summary.get("total_material_cost", 0))
        total_labour_cost = float(combined_summary.get("total_labour_cost", 0))

        # Get preliminaries from payload
        preliminaries = data.get("preliminaries", {})

        # Get other cost breakdowns if available in the payload
        base_cost = total_material_cost + total_labour_cost
        miscellaneous_cost = 0
        overhead_profit_cost = 0
        discount_amount = float(data.get("discount_amount", 0))
        discount_percentage = float(data.get("discount_percentage", 0))
        vat_amount = 0
        vat_percentage = float(preliminaries.get("vat", 0)) if isinstance(preliminaries, dict) else 0

        # Store internal revision in BOQInternalRevision table
        # Check if there are any existing internal revisions for this BOQ
        existing_internal_revisions_count = BOQInternalRevision.query.filter_by(boq_id=boq_id).count()

        # 🔥 If this is the FIRST internal revision, store the "before" state as "Original BOQ" (revision 0)
        if existing_internal_revisions_count == 0:
            # Capture the current BOQ state BEFORE any edits
            # 🔥 Get discount from current BOQ state
            original_discount_percentage = boq_details.boq_details.get("discount_percentage", 0) if boq_details and boq_details.boq_details else 0
            original_discount_amount = boq_details.boq_details.get("discount_amount", 0) if boq_details and boq_details.boq_details else 0
            original_total_cost = boq_details.total_cost if boq_details else 0

            # 🔥 Calculate after-discount total for original BOQ
            original_total_cost_after_discount = original_total_cost - original_discount_amount

            before_changes_snapshot = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "status": current_status,
                "revision_number": boq.revision_number,
                "internal_revision_number": 0,
                "total_cost": original_total_cost_after_discount,  # 🔥 Store grand total AFTER discount
                "total_cost_before_discount": original_total_cost,  # Store before-discount for reference
                # 🔥 Capture overall discount at BOQ level
                "discount_percentage": original_discount_percentage,
                "discount_amount": original_discount_amount,
                "items": boq_details.boq_details.get("items", []) if boq_details and boq_details.boq_details else [],
                "preliminaries": boq_details.boq_details.get("preliminaries", {}) if boq_details and boq_details.boq_details else {},
                "combined_summary": boq_details.boq_details.get("combined_summary", {}) if boq_details and boq_details.boq_details else {},
                "existing_purchase": boq_details.boq_details.get("existing_purchase", {}) if boq_details and boq_details.boq_details else {},
                "new_purchase": boq_details.boq_details.get("new_purchase", {}) if boq_details and boq_details.boq_details else {},
            }

            original_boq_revision = BOQInternalRevision(
                boq_id=boq_id,
                internal_revision_number=0,  # Original BOQ is revision 0
                action_type='ORIGINAL_BOQ',
                actor_role='system',
                actor_name='System',
                actor_user_id=None,
                status_before=current_status,
                status_after=current_status,
                changes_summary=before_changes_snapshot  # Store the "before" state
            )
            db.session.add(original_boq_revision)

        # Set internal revision number based on existing count (add 1 for the new edit)
        new_internal_rev = existing_internal_revisions_count + 1
        boq.internal_revision_number = new_internal_rev
        boq.has_internal_revisions = True

        # Create complete BOQ snapshot with incoming data AS-IS
        # 🔥 Calculate total_cost AFTER discount for display purposes
        total_cost_after_discount = total_boq_cost - discount_amount

        complete_boq_snapshot = {
            "boq_id": boq.boq_id,
            "boq_name": data.get("boq_name", boq.boq_name),
            "status": boq.status,
            "revision_number": boq.revision_number,
            "internal_revision_number": new_internal_rev,
            "total_cost": total_cost_after_discount,  # 🔥 Store grand total AFTER discount
            "total_cost_before_discount": total_boq_cost,  # Store before-discount for reference
            "total_items": total_items,
            "total_materials": total_materials,
            "total_labour": total_labour,
            # 🔥 Store overall discount from payload
            "discount_percentage": discount_percentage,
            "discount_amount": discount_amount,
            "preliminaries": data.get("preliminaries", {}),
            "items": data.get("items", []),  # Store items AS-IS from payload
            "combined_summary": combined_summary,  # Store the complete summary as-is
            "existing_purchase": data.get("existing_purchase", {}),
            "new_purchase": data.get("new_purchase", {}),
            "created_by": boq.created_by,
            "created_at": boq.created_at.isoformat() if boq.created_at else None,
            "last_modified_by": user_name,
            "last_modified_at": datetime.utcnow().isoformat()
        }

        # ALSO update BOQDetails table with the new data
        # This ensures the main BOQ data is updated, not just the internal revision history
        # Store everything AS-IS from the incoming payload

        boq_details_json = {
            "items": data.get("items", []),  # Store items at root level for get_boq compatibility
            "preliminaries": data.get("preliminaries", {}),
            "combined_summary": combined_summary,  # Store complete summary as-is
            # 🔥 Store overall discount at BOQ level
            "discount_percentage": discount_percentage,
            "discount_amount": discount_amount,
            "existing_purchase": data.get("existing_purchase", {}),
            "new_purchase": data.get("new_purchase", {})
        }

        boq_details.boq_details = boq_details_json
        boq_details.total_cost = total_boq_cost
        boq_details.total_items = total_items
        boq_details.total_materials = total_materials
        boq_details.total_labour = total_labour
        boq_details.last_modified_by = user_name
        flag_modified(boq_details, 'boq_details')

        # ===== MASTER TABLES SYNC =====
        # Process ALL items to store/update in master tables (handles all 3 scenarios)
        # Scenario 1: New item + new sub-items + materials/labour
        # Scenario 2: Existing item + new sub-items + materials/labour
        # Scenario 3: Existing sub-item + new materials/labour
        boq_items = data.get("items", [])
        created_by = user_name

        for idx, item_data in enumerate(boq_items):
            # Check if item has sub_items structure
            if "sub_items" in item_data and item_data.get("sub_items"):
                # Get item-level data
                item_quantity = clean_numeric_value(item_data.get("quantity", 1.0))
                item_rate = clean_numeric_value(item_data.get("rate", 0.0))
                item_unit = item_data.get("unit", "nos")
                item_total = item_quantity * item_rate

                # Get percentages
                miscellaneous_percentage = clean_numeric_value(item_data.get("overhead_percentage", 10.0))
                overhead_profit_percentage = clean_numeric_value(item_data.get("profit_margin_percentage", 15.0))

                # Calculate amounts
                total_miscellaneous_amount = (item_total * miscellaneous_percentage) / 100
                total_overhead_profit_amount = (item_total * overhead_profit_percentage) / 100

                # Add item to master tables (or update if exists)
                master_item_id, _, _ = add_to_master_tables(
                    item_data.get("item_name"),
                    item_data.get("description", ""),
                    item_data.get("work_type", "contract"),
                    [],  # Don't add materials here, will add per sub-item
                    [],  # Don't add labour here, will add per sub-item
                    created_by,
                    miscellaneous_percentage,
                    total_miscellaneous_amount,
                    overhead_profit_percentage,
                    total_overhead_profit_amount,
                    overhead_profit_percentage,
                    total_overhead_profit_amount,
                    clean_numeric_value(item_data.get("discount_percentage", 0.0)),
                    clean_numeric_value(item_data.get("discount_amount", 0.0)),
                    clean_numeric_value(item_data.get("vat_percentage", 0.0)),
                    clean_numeric_value(item_data.get("vat_amount", 0.0)),
                    unit=item_unit,
                    quantity=item_quantity,
                    per_unit_cost=item_rate,
                    total_amount=item_total,
                    item_total_cost=item_total
                )

                # Update master_item_id in the item data
                item_data["master_item_id"] = master_item_id
                boq_details_json["items"][idx]["master_item_id"] = master_item_id

                # Process sub-items with their materials and labour
                sub_items_list = item_data.get("sub_items", [])
                if sub_items_list:
                    master_sub_item_ids = add_sub_items_to_master_tables(
                        master_item_id,
                        sub_items_list,
                        created_by
                    )

                    # Add master sub-item IDs back to payload
                    for sub_idx, sub_item_id in enumerate(master_sub_item_ids):
                        if sub_idx < len(sub_items_list):
                            sub_items_list[sub_idx]["sub_item_id"] = sub_item_id
                            sub_items_list[sub_idx]["master_sub_item_id"] = sub_item_id
                            boq_details_json["items"][idx]["sub_items"][sub_idx]["sub_item_id"] = sub_item_id
                            boq_details_json["items"][idx]["sub_items"][sub_idx]["master_sub_item_id"] = sub_item_id

        # Update boq_details with master IDs
        boq_details.boq_details = boq_details_json
        flag_modified(boq_details, 'boq_details')
        # ===== END MASTER TABLES SYNC =====

        # Save preliminary selections to boq_preliminaries junction table
        preliminaries_data = data.get("preliminaries", {})
        if preliminaries_data and isinstance(preliminaries_data, dict):
            prelim_items = preliminaries_data.get("items", [])
            if prelim_items:
                # Delete existing preliminary selections for this BOQ
                BOQPreliminary.query.filter_by(boq_id=boq_id).delete()

                # Insert new selections
                for prelim in prelim_items:
                    prelim_id = prelim.get('prelim_id')
                    is_checked = prelim.get('checked', False) or prelim.get('selected', False)

                    if prelim_id:  # Only save master preliminary items
                        boq_prelim = BOQPreliminary(
                            boq_id=boq_id,
                            prelim_id=prelim_id,
                            is_checked=is_checked
                        )
                        db.session.add(boq_prelim)

        # Save terms & conditions selections to boq_terms_selections (single row with term_ids array)
        terms_conditions = data.get("terms_conditions", [])
        if terms_conditions and isinstance(terms_conditions, list):
            # Extract only checked term IDs
            selected_term_ids = [
                term.get('term_id') for term in terms_conditions
                if term.get('term_id') and term.get('checked', False)
            ]

            # Insert or update single row with term_ids array
            db.session.execute(text("""
                INSERT INTO boq_terms_selections (boq_id, term_ids, created_at, updated_at)
                VALUES (:boq_id, :term_ids, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (boq_id)
                DO UPDATE SET term_ids = :term_ids, updated_at = CURRENT_TIMESTAMP
            """), {
                'boq_id': boq_id,
                'term_ids': selected_term_ids
            })

        # Create internal revision record using SQLAlchemy ORM
        internal_revision = BOQInternalRevision(
            boq_id=boq_id,
            internal_revision_number=new_internal_rev,
            action_type='INTERNAL_REVISION_EDIT',
            actor_role=user_role,
            actor_name=user_name,
            actor_user_id=user_id,
            status_before=current_status,
            status_after=boq.status,
            changes_summary=complete_boq_snapshot
        )
        db.session.add(internal_revision)

        # Add history record to BOQHistory table
        history_action = {
            "type": "internal_revision_edit",
            "role": user_role,
            "user_name": user_name,
            "user_id": user_id,
            "status": boq.status,
            "timestamp": datetime.utcnow().isoformat(),
            "internal_revision_number": new_internal_rev,
            "boq_name": data.get("boq_name", boq.boq_name),
            "total_items": total_items,
            "total_cost": total_boq_cost,
            "changes": {
                "status_changed": current_status != boq.status,
                "old_status": current_status,
                "new_status": boq.status,
                "items_updated": True,
                "items_count": total_items
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

            current_actions.append(history_action)
            existing_history.action = current_actions
            flag_modified(existing_history, "action")
            existing_history.action_by = user_name
            existing_history.boq_status = boq.status
            existing_history.comments = f"Internal Revision {new_internal_rev} - BOQ updated by {user_name}"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            boq_history = BOQHistory(
                boq_id=boq_id,
                action=[history_action],
                action_by=user_name,
                boq_status=boq.status,
                comments=f"Internal Revision {new_internal_rev} - BOQ updated by {user_name}",
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # NOTE: Auto-notification removed to prevent duplicate notifications
        # TD will be notified ONLY when estimator clicks "Send to TD" button
        # which calls send_boq_email() -> notify_boq_sent_to_td()
        # Previous code was sending notification here AND on "Send to TD" causing duplicates

        # Return success response
        return jsonify({
            "message": "BOQ internal revision stored successfully",
            "success": True,
            "boq_id": boq_id,
            "internal_revision_number": new_internal_rev,
            "status": boq.status,
            "total_cost": total_boq_cost,
            "updated_by": user_name
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error storing internal revision: {str(e)}")
        return jsonify({"error": str(e)}), 500
