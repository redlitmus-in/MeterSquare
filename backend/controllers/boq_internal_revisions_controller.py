"""
BOQ Internal Revisions Controller
Handles tracking and retrieval of internal approval cycles (PM edits, TD rejections)
before sending to client for the first time
"""

from flask import request, jsonify, g
from models.preliminary import *
from config.db import db
from config.logging import get_logger
from models.boq import *
from controllers.boq_controller import *
from sqlalchemy import text
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime
import json

log = get_logger()

def get_all_internal_revision():
    """
    Get all BOQs with their internal revisions
    Returns complete BOQ details with all internal revision history

    GET /api/boqs/all-internal-revisions
    """
    try:
        # Get all BOQs that have internal revisions
        boqs = BOQ.query.filter_by(is_deleted=False, has_internal_revisions=True).all()

        result = []

        for boq in boqs:
            # Get BOQ details
            boq_details = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()

            # Get all internal revisions for this BOQ
            internal_revisions = BOQInternalRevision.query.filter_by(
                boq_id=boq.boq_id,
                is_deleted=False
            ).order_by(BOQInternalRevision.internal_revision_number.desc()).all()

            # Format internal revisions
            revisions_list = []
            for revision in internal_revisions:
                revisions_list.append({
                    "id": revision.id,
                    "internal_revision_number": revision.internal_revision_number,
                    "created_at": revision.created_at.isoformat() if revision.created_at else None
                })

            # Build BOQ data
            boq_data = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "status": boq.status,
                "revision_number": boq.revision_number,
                "internal_revision_number": boq.internal_revision_number,
                "internal_revisions": revisions_list,
                "revision_count": len(revisions_list)
            }

            result.append(boq_data)

        return jsonify({
            "success": True,
            "count": len(result),
            "message": f"Found {len(result)} BOQ(s) with internal revisions",
            "data": result
        }), 200

    except Exception as e:
        log.error(f"Error fetching internal revisions: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

        
def get_internal_revisions(boq_id):
    """
    Get all internal revisions for a BOQ

    GET /api/boq/<boq_id>/internal_revisions
    """
    try:
        # Get BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Get all internal revisions for this BOQ
        revisions = BOQInternalRevision.query.filter_by(
            boq_id=boq_id,
            is_deleted=False
        ).order_by(BOQInternalRevision.internal_revision_number.asc()).all()

        # Format data
        internal_revisions = []
        for rev in revisions:
            internal_revisions.append({
                "id": rev.id,
                "boq_id": rev.boq_id,
                "internal_revision_number": rev.internal_revision_number,
                "action_type": rev.action_type,
                "actor_role": rev.actor_role,
                "actor_name": rev.actor_name,
                "actor_user_id": rev.actor_user_id,
                "status_before": rev.status_before,
                "status_after": rev.status_after,
                "changes_summary": rev.changes_summary,
                "rejection_reason": rev.rejection_reason,
                "approval_comments": rev.approval_comments,
                "created_at": rev.created_at.isoformat() if rev.created_at else None
            })

        return jsonify({
            "success": True,
            "data": {
                "boq_id": boq_id,
                "boq_name": boq.boq_name,
                "current_internal_revision": boq.internal_revision_number or 0,
                "has_internal_revisions": boq.has_internal_revisions or False,
                "internal_revisions": internal_revisions,
                "total_count": len(internal_revisions)
            }
        }), 200

    except Exception as e:
        log.error(f"Error fetching internal revisions: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def update_internal_revision_boq(boq_id):
    """Update BOQ using JSON storage approach"""
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

        # Update BOQ basic details
        if "boq_name" in data:
            boq.boq_name = data["boq_name"]

        # Set status to Internal_Revision_Pending for internal revision
        current_status = boq.status
        boq.status = "Internal_Revision_Pending"

        # Update last modified by
        boq.last_modified_by = user_name

        # Get existing BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Store old values before updating (for change tracking)
        old_boq_name = boq.boq_name
        old_status = boq.status
        old_total_cost = boq_details.total_cost
        old_total_items = boq_details.total_items
        old_boq_details_json = boq_details.boq_details

        # Update last modified timestamp
        boq.last_modified_at = datetime.utcnow()

        # Note: BOQDetailsHistory is NOT stored in update_boq
        # History is only stored in revision_boq function
        next_version = 1

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
                # Initialize variables for both formats
                materials_data = []
                labour_data = []
                # Check if item has sub_items structure (new format)
                has_sub_items = "sub_items" in item_data and item_data.get("sub_items")

                if has_sub_items:
                    # NEW FORMAT: Item with sub_items structure - preserve scope and size
                    sub_items_list = []
                    materials_count = 0
                    labour_count = 0

                    # Get item-level quantity and rate
                    item_quantity = clean_numeric_value(item_data.get("quantity", 1.0))
                    item_rate = clean_numeric_value(item_data.get("rate", 0.0))
                    item_unit = item_data.get("unit", "nos")
                    item_total = item_quantity * item_rate

                    # Get percentages
                    miscellaneous_percentage = clean_numeric_value(item_data.get("overhead_percentage", 10.0))
                    overhead_profit_percentage = clean_numeric_value(item_data.get("profit_margin_percentage", 15.0))
                    discount_percentage = clean_numeric_value(item_data.get("discount_percentage", 0.0))
                    vat_percentage = clean_numeric_value(item_data.get("vat_percentage", 0.0))

                    # Calculate amounts
                    total_miscellaneous_amount = (item_total * miscellaneous_percentage) / 100
                    total_overhead_profit_amount = (item_total * overhead_profit_percentage) / 100
                    total_subtotal = item_total + total_miscellaneous_amount + total_overhead_profit_amount
                    total_discount_amount = (total_subtotal * discount_percentage) / 100 if discount_percentage > 0 else 0.0
                    total_after_discount = total_subtotal - total_discount_amount
                    total_vat_amount = (total_after_discount * vat_percentage) / 100 if vat_percentage > 0 else 0.0
                    total_selling_price = total_after_discount + total_vat_amount

                    # Process sub_items
                    for sub_item_data in item_data.get("sub_items", []):
                        sub_item_quantity = clean_numeric_value(sub_item_data.get("quantity", 1.0))
                        sub_item_unit = sub_item_data.get("unit", "nos")
                        sub_item_rate = clean_numeric_value(sub_item_data.get("rate", 0.0))
                        sub_item_base_total = sub_item_quantity * sub_item_rate

                        # Process materials for this sub-item
                        sub_item_materials = []
                        materials_cost = 0
                        for mat_data in sub_item_data.get("materials", []):
                            quantity = clean_numeric_value(mat_data.get("quantity", 1.0))
                            unit_price = clean_numeric_value(mat_data.get("unit_price", 0.0))
                            total_price = quantity * unit_price
                            materials_cost += total_price

                            sub_item_materials.append({
                                "material_name": mat_data.get("material_name"),
                                "location": mat_data.get("location", ""),
                                "brand": mat_data.get("brand", ""),
                                "description": mat_data.get("description", ""),
                                "quantity": quantity,
                                "unit": mat_data.get("unit", "nos"),
                                "unit_price": unit_price,
                                "total_price": total_price,
                                "vat_percentage": clean_numeric_value(mat_data.get("vat_percentage", 0.0))
                            })

                        # Process labour for this sub-item
                        sub_item_labour = []
                        labour_cost = 0
                        for labour_data_item in sub_item_data.get("labour", []):
                            hours = clean_numeric_value(labour_data_item.get("hours", 0.0))
                            rate_per_hour = clean_numeric_value(labour_data_item.get("rate_per_hour", 0.0))
                            total_cost_labour = hours * rate_per_hour
                            labour_cost += total_cost_labour

                            sub_item_labour.append({
                                "labour_role": labour_data_item.get("labour_role"),
                                "hours": hours,
                                "rate_per_hour": rate_per_hour,
                                "total_cost": total_cost_labour
                            })

                        # Create sub-item JSON with scope and size
                        sub_item_json = {
                            "sub_item_name": sub_item_data.get("sub_item_name"),
                            "scope": sub_item_data.get("scope", ""),
                            "size": sub_item_data.get("size", ""),
                            "description": sub_item_data.get("description", ""),
                            "location": sub_item_data.get("location", ""),
                            "brand": sub_item_data.get("brand", ""),
                            "quantity": sub_item_quantity,
                            "unit": sub_item_unit,
                            "rate": sub_item_rate,
                            "base_total": sub_item_base_total,
                            "materials_cost": materials_cost,
                            "labour_cost": labour_cost,
                            "materials": sub_item_materials,
                            "labour": sub_item_labour
                        }

                        sub_items_list.append(sub_item_json)
                        materials_count += len(sub_item_materials)
                        labour_count += len(sub_item_labour)

                    # Calculate total materials and labour costs from all sub-items
                    total_materials_cost = sum(si.get("materials_cost", 0) for si in sub_items_list)
                    total_labour_cost = sum(si.get("labour_cost", 0) for si in sub_items_list)
                    base_cost = total_materials_cost + total_labour_cost

                    # Create item JSON with sub_items
                    item_json = {
                        "item_name": item_data.get("item_name"),
                        "description": item_data.get("description", ""),
                        "work_type": item_data.get("work_type", "contract"),
                        "has_sub_items": True,
                        "sub_items": sub_items_list,
                        "quantity": item_quantity,
                        "unit": item_unit,
                        "rate": item_rate,
                        "item_total": item_total,
                        "base_cost": base_cost,
                        "sub_items_cost": base_cost,
                        "total_selling_price": total_selling_price,
                        "selling_price": total_selling_price,
                        "estimatedSellingPrice": total_selling_price,
                        "actualItemCost": base_cost,
                        "total_cost": total_selling_price,
                        "overhead_percentage": miscellaneous_percentage,
                        "overhead_amount": total_miscellaneous_amount,
                        "profit_margin_percentage": overhead_profit_percentage,
                        "profit_margin_amount": total_overhead_profit_amount,
                        "subtotal": total_subtotal,
                        "discount_percentage": discount_percentage,
                        "discount_amount": total_discount_amount,
                        "vat_percentage": vat_percentage,
                        "vat_amount": total_vat_amount,
                        "totalMaterialCost": total_materials_cost,
                        "totalLabourCost": total_labour_cost
                    }

                    # Add/Update to master tables
                    # Collect all materials and labour from sub-items for master tables
                    all_materials = []
                    all_labour = []
                    for sub_item in item_data.get("sub_items", []):
                        all_materials.extend(sub_item.get("materials", []))
                        all_labour.extend(sub_item.get("labour", []))

                    # Add to master tables
                    log.info(f"Updating master tables for item: {item_data.get('item_name')}, materials: {len(all_materials)}")
                    master_item_id, master_material_ids, master_labour_ids = add_to_master_tables(
                        item_data.get("item_name"),
                        item_data.get("description", ""),
                        item_data.get("work_type", "contract"),
                        all_materials,
                        all_labour,
                        created_by,
                        miscellaneous_percentage,
                        total_miscellaneous_amount,
                        overhead_profit_percentage,
                        total_overhead_profit_amount,
                        overhead_profit_percentage,
                        total_overhead_profit_amount,
                        discount_percentage,
                        total_discount_amount,
                        vat_percentage,
                        total_vat_amount,
                        unit=item_unit,
                        quantity=item_quantity,
                        per_unit_cost=item_rate,
                        total_amount=item_total,
                        item_total_cost=item_total
                    )
                    log.info(f"Master tables updated: item_id={master_item_id}, materials={len(master_material_ids)}, labour={len(master_labour_ids)}")

                    # Add sub-items to master tables
                    master_sub_item_ids = []
                    if item_data.get("sub_items"):
                        master_sub_item_ids = add_sub_items_to_master_tables(
                            master_item_id,
                            item_data.get("sub_items"),
                            created_by
                        )

                    boq_items.append(item_json)
                    total_boq_cost += total_selling_price
                    total_materials += materials_count
                    total_labour += labour_count


            # Get preliminaries from request data
            preliminaries = data.get("preliminaries", {})

            # Update JSON structure
            updated_json = {
                "boq_id": boq.boq_id,
                "preliminaries": preliminaries,
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

        # Track detailed changes
        detailed_changes = {}

        # Check BOQ name change
        if old_boq_name != boq.boq_name:
            detailed_changes["boq_name"] = {
                "old": old_boq_name,
                "new": boq.boq_name
            }

        # Check total cost change
        new_total_cost = total_boq_cost if "items" in data else boq_details.total_cost
        if old_total_cost != new_total_cost:
            detailed_changes["total_cost"] = {
                "old": float(old_total_cost) if old_total_cost else 0,
                "new": float(new_total_cost) if new_total_cost else 0,
                "difference": float(new_total_cost - old_total_cost) if old_total_cost and new_total_cost else 0
            }

        # Check total items change
        new_total_items = len(boq_items) if "items" in data else boq_details.total_items
        if old_total_items != new_total_items:
            detailed_changes["total_items"] = {
                "old": old_total_items,
                "new": new_total_items,
                "difference": new_total_items - old_total_items if old_total_items and new_total_items else 0
            }

        # Track item-level changes (if items were updated)
        if "items" in data and old_boq_details_json and "items" in old_boq_details_json:
            items_changes = []
            old_items = old_boq_details_json.get("items", [])
            new_items = boq_items

            # Create dictionaries for easier lookup
            old_items_dict = {item.get("master_item_id"): item for item in old_items if item.get("master_item_id")}
            new_items_dict = {item.get("master_item_id"): item for item in new_items if item.get("master_item_id")}

            # Check for modified items
            for item_id, new_item in new_items_dict.items():
                if item_id in old_items_dict:
                    old_item = old_items_dict[item_id]
                    item_change = {"item_name": new_item.get("item_name"), "master_item_id": item_id}

                    # Check specific field changes
                    if old_item.get("base_cost") != new_item.get("base_cost"):
                        item_change["base_cost"] = {
                            "old": float(old_item.get("base_cost", 0)),
                            "new": float(new_item.get("base_cost", 0))
                        }

                    if old_item.get("selling_price") != new_item.get("selling_price"):
                        item_change["selling_price"] = {
                            "old": float(old_item.get("selling_price", 0)),
                            "new": float(new_item.get("selling_price", 0))
                        }

                    if old_item.get("overhead_percentage") != new_item.get("overhead_percentage"):
                        item_change["overhead_percentage"] = {
                            "old": float(old_item.get("overhead_percentage", 0)),
                            "new": float(new_item.get("overhead_percentage", 0))
                        }

                    if old_item.get("profit_margin_percentage") != new_item.get("profit_margin_percentage"):
                        item_change["profit_margin_percentage"] = {
                            "old": float(old_item.get("profit_margin_percentage", 0)),
                            "new": float(new_item.get("profit_margin_percentage", 0))
                        }

                    # Check material changes
                    old_materials_count = len(old_item.get("materials", []))
                    new_materials_count = len(new_item.get("materials", []))
                    if old_materials_count != new_materials_count:
                        item_change["materials_count"] = {
                            "old": old_materials_count,
                            "new": new_materials_count
                        }

                    # Check labour changes
                    old_labour_count = len(old_item.get("labour", []))
                    new_labour_count = len(new_item.get("labour", []))
                    if old_labour_count != new_labour_count:
                        item_change["labour_count"] = {
                            "old": old_labour_count,
                            "new": new_labour_count
                        }

                    if len(item_change) > 2:  # More than just item_name and master_item_id
                        items_changes.append(item_change)

            # Check for added items
            for item_id, new_item in new_items_dict.items():
                if item_id not in old_items_dict:
                    items_changes.append({
                        "type": "added",
                        "item_name": new_item.get("item_name"),
                        "master_item_id": item_id,
                        "selling_price": float(new_item.get("selling_price", 0))
                    })

            # Check for removed items
            for item_id, old_item in old_items_dict.items():
                if item_id not in new_items_dict:
                    items_changes.append({
                        "type": "removed",
                        "item_name": old_item.get("item_name"),
                        "master_item_id": item_id,
                        "selling_price": float(old_item.get("selling_price", 0))
                    })

            if items_changes:
                detailed_changes["items"] = items_changes

        # Create action for BOQ history with current user role and name
        update_action = {
            "type": "boq_updated",
            "role": user_role if user_role else 'system',
            "user_name": user_name,
            "user_id": user_id,
            "status": boq.status,
            "timestamp": datetime.utcnow().isoformat(),
            "updated_by": user_name,
            "updated_by_user_id": user_id,
            "boq_name": boq.boq_name,
            "total_items": len(boq_items) if "items" in data else boq_details.total_items,
            "total_cost": total_boq_cost if "items" in data else boq_details.total_cost,
            "changes": detailed_changes,
            "change_summary": {
                "boq_name_changed": bool(detailed_changes.get("boq_name")),
                "cost_changed": bool(detailed_changes.get("total_cost")),
                "items_changed": bool(detailed_changes.get("items")),
                "items_count_changed": bool(detailed_changes.get("total_items"))
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
            existing_history.comments = f"BOQ updated - Version {next_version} by {user_name}"
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
                comments=f"BOQ updated - Version {next_version} by {user_name}",
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(boq_history)

        # Store internal revision in BOQInternalRevision table
        # Check if there are any existing internal revisions for this BOQ
        existing_internal_revisions_count = BOQInternalRevision.query.filter_by(boq_id=boq_id).count()

        # Set internal revision number based on existing count
        # First revision should be 1, not 2
        new_internal_rev = existing_internal_revisions_count + 1
        boq.internal_revision_number = new_internal_rev
        boq.has_internal_revisions = True

        # Create complete BOQ snapshot with all details
        complete_boq_snapshot = {
            "boq_id": boq.boq_id,
            "boq_name": boq.boq_name,
            "status": boq.status,
            "revision_number": boq.revision_number,
            "internal_revision_number": new_internal_rev,
            "total_cost": float(boq_details.total_cost) if boq_details.total_cost else 0,
            "total_items": boq_details.total_items or 0,
            "total_materials": boq_details.total_materials or 0,
            "total_labour": boq_details.total_labour or 0,
            "preliminaries": updated_json.get("preliminaries", {}) if "items" in data else boq_details.boq_details.get("preliminaries", {}),
            "items": updated_json.get("items", []) if "items" in data else boq_details.boq_details.get("items", []),
            "summary": updated_json.get("summary", {}) if "items" in data else boq_details.boq_details.get("summary", {}),
            "created_by": boq.created_by,
            "created_at": boq.created_at.isoformat() if boq.created_at else None,
            "last_modified_by": user_name,
            "last_modified_at": datetime.utcnow().isoformat()
        }

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

        log.info(f"✅ Internal revision {new_internal_rev} stored in BOQInternalRevision table for BOQ {boq_id}")

        db.session.commit()

        # Return updated BOQ
        return jsonify({
            "message": "BOQ Updated successfully",
            "success": True,
            "boq_id": boq_id,
            "version": next_version,
            "internal_revision_number": new_internal_rev,
            "status": boq.status,
            "updated_by": user_name
        }), 200
        # return get_boq(boq_id)

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500