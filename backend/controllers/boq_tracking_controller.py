from flask import request, jsonify, g
from config.db import db
from models.boq import MaterialPurchaseTracking, LabourTracking, BOQ, BOQDetails
from config.logging import get_logger
from datetime import datetime
from decimal import Decimal
import json

log = get_logger()


def get_boq_planned_vs_actual(boq_id):
    """
    Get planned vs actual comparison for a BOQ
    - Planned data: from boq_details.boq_details JSON
    - Actual data: from MaterialPurchaseTracking and LabourTracking tables

    This function handles the old purchase_history structure: {"materials": [...]}
    and matches materials by master_material_id only (not requiring master_item_id match)
    """
    try:
        # Get BOQ details
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        boq_detail = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_detail or not boq_detail.boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Parse BOQ details (planned data)
        boq_data = json.loads(boq_detail.boq_details) if isinstance(boq_detail.boq_details, str) else boq_detail.boq_details

        # Get actual material purchases from MaterialPurchaseTracking
        actual_materials = MaterialPurchaseTracking.query.filter_by(
            boq_id=boq_id, is_deleted=False
        ).all()

        # Get actual labour tracking from LabourTracking
        actual_labour = LabourTracking.query.filter_by(
            boq_id=boq_id, is_deleted=False
        ).all()

        # Build comparison
        comparison = {
            "boq_id": boq_id,
            "project_id": boq.project_id,
            "boq_name": boq.boq_name,
            "items": []
        }

        # Process each item
        for planned_item in boq_data.get('items', []):
            master_item_id = planned_item.get('master_item_id')

            # Material comparison
            materials_comparison = []
            planned_materials_total = Decimal('0')
            actual_materials_total = Decimal('0')

            for planned_mat in planned_item.get('materials', []):
                master_material_id = planned_mat.get('master_material_id')
                material_name = planned_mat.get('material_name')

                actual_mat = None
                matched_material_id = master_material_id

                # Strategy 1: Find by exact match (master_material_id + master_item_id)
                if master_material_id:
                    actual_mat = next(
                        (am for am in actual_materials
                         if am.master_material_id == master_material_id
                         and am.master_item_id == master_item_id),
                        None
                    )

                # Strategy 2: Find by material_id only
                if not actual_mat and master_material_id:
                    actual_mat = next(
                        (am for am in actual_materials
                         if am.master_material_id == master_material_id),
                        None
                    )

                # Strategy 3: Search inside purchase_history.materials array for matching master_material_id
                if not actual_mat and master_material_id:
                    for am in actual_materials:
                        if am.purchase_history:
                            if isinstance(am.purchase_history, dict) and 'materials' in am.purchase_history:
                                for mat_entry in am.purchase_history.get('materials', []):
                                    if mat_entry.get('master_material_id') == master_material_id:
                                        actual_mat = am
                                        matched_material_id = master_material_id
                                        break
                        if actual_mat:
                            break

                # Strategy 4: Match by material name (case-insensitive) if no master_material_id in BOQ
                if not actual_mat and material_name:
                    actual_mat = next(
                        (am for am in actual_materials
                         if am.material_name and am.material_name.lower().strip() == material_name.lower().strip()),
                        None
                    )
                    if actual_mat:
                        matched_material_id = actual_mat.master_material_id

                # Strategy 5: Search by material name inside purchase_history
                if not actual_mat and material_name:
                    for am in actual_materials:
                        if am.purchase_history:
                            if isinstance(am.purchase_history, dict) and 'materials' in am.purchase_history:
                                for mat_entry in am.purchase_history.get('materials', []):
                                    mat_entry_name = mat_entry.get('material_name', '')
                                    if mat_entry_name.lower().strip() == material_name.lower().strip():
                                        actual_mat = am
                                        matched_material_id = mat_entry.get('master_material_id')
                                        break
                        if actual_mat:
                            break

                # Calculate planned total
                planned_quantity = Decimal(str(planned_mat.get('quantity', 0)))
                planned_unit_price = Decimal(str(planned_mat.get('unit_price', 0)))
                planned_total = planned_quantity * planned_unit_price

                # Calculate actual total from purchase history
                actual_total = Decimal('0')
                actual_quantity = Decimal('0')
                actual_avg_unit_price = Decimal('0')
                purchase_history = []

                if actual_mat and actual_mat.purchase_history:
                    purchase_data = actual_mat.purchase_history

                    # Handle dictionary structure: {"materials": [...], "new_material": {...}, ...}
                    if isinstance(purchase_data, dict):
                        # Collect all material entries from the dictionary
                        all_material_entries = []

                        # Check for 'materials' array
                        if 'materials' in purchase_data and isinstance(purchase_data['materials'], list):
                            all_material_entries.extend(purchase_data['materials'])

                        # Check for other fields that contain material objects (like 'new_material')
                        for key, value in purchase_data.items():
                            if key != 'materials' and isinstance(value, dict):
                                # Check if this dict has material fields
                                if 'material_name' in value or 'master_material_id' in value:
                                    all_material_entries.append(value)

                        # Process all material entries
                        for mat_entry in all_material_entries:
                            # Check if this material matches by ID or by name
                            entry_mat_id = mat_entry.get('master_material_id')
                            entry_mat_name = mat_entry.get('material_name', '')

                            is_match = False
                            if matched_material_id and entry_mat_id == matched_material_id:
                                is_match = True
                            elif not matched_material_id and material_name and entry_mat_name.lower().strip() == material_name.lower().strip():
                                is_match = True

                            if is_match:
                                purchase_qty = Decimal(str(mat_entry.get('quantity', 0)))
                                purchase_price = Decimal(str(mat_entry.get('unit_price', 0)))
                                purchase_total = Decimal(str(mat_entry.get('total_price', 0)))

                                actual_quantity += purchase_qty
                                actual_total += purchase_total

                                purchase_history.append({
                                    "purchase_date": actual_mat.created_at.isoformat() if actual_mat.created_at else None,
                                    "quantity": float(purchase_qty),
                                    "unit": mat_entry.get('unit', planned_mat.get('unit')),
                                    "unit_price": float(purchase_price),
                                    "total_price": float(purchase_total),
                                    "purchased_by": actual_mat.created_by or "Unknown"
                                })

                    # Handle new structure: [{...}, {...}]
                    elif isinstance(purchase_data, list):
                        for purchase in purchase_data:
                            purchase_qty = Decimal(str(purchase.get('quantity', 0)))
                            purchase_price = Decimal(str(purchase.get('unit_price', 0)))
                            purchase_total = Decimal(str(purchase.get('total_price', 0)))

                            actual_quantity += purchase_qty
                            actual_total += purchase_total

                            purchase_history.append({
                                "purchase_date": purchase.get('purchase_date'),
                                "quantity": float(purchase_qty),
                                "unit_price": float(purchase_price),
                                "total_price": float(purchase_total),
                                "purchased_by": purchase.get('purchased_by')
                            })

                    if actual_quantity > 0:
                        actual_avg_unit_price = actual_total / actual_quantity

                planned_materials_total += planned_total

                # For actual total: use actual if purchased, otherwise use planned (for pending items)
                if actual_total > 0:
                    actual_materials_total += actual_total
                else:
                    # Material is pending - assume planned cost
                    actual_materials_total += planned_total

                # Calculate variances
                quantity_variance = actual_quantity - planned_quantity
                price_variance = actual_avg_unit_price - planned_unit_price
                total_variance = actual_total - planned_total

                # Determine status
                material_status = "pending"
                if actual_mat and actual_quantity > 0:
                    material_status = "completed"

                # Generate reason based on variance
                variance_reason = None
                variance_response = None

                if actual_mat and actual_quantity > 0:
                    if total_variance > 0:
                        variance_reason = f"Cost overrun: AED{float(total_variance):.2f} over budget"
                        if price_variance > 0:
                            variance_reason += f" (Price increased by AED{float(price_variance):.2f})"
                        if quantity_variance > 0:
                            variance_reason += f" (Quantity increased by {float(quantity_variance):.2f} {planned_mat.get('unit', '')})"
                    elif total_variance < 0:
                        variance_reason = f"Cost saved: AED{abs(float(total_variance)):.2f} under budget"
                    else:
                        variance_reason = "On budget"

                    # Response placeholder - can be updated later from tracking data
                    variance_response = actual_mat.variance_response if hasattr(actual_mat, 'variance_response') else None

                materials_comparison.append({
                    "material_name": material_name,
                    "sub_item_name": planned_mat.get('sub_item_name', material_name),  # Sub item name from BOQ
                    "master_material_id": matched_material_id,  # Use the matched ID (could be from purchase_history)
                    "planned": {
                        "quantity": float(planned_quantity),
                        "unit": planned_mat.get('unit'),
                        "unit_price": float(planned_unit_price),
                        "total": float(planned_total)
                    },
                    "actual": {
                        "quantity": float(actual_quantity),
                        "unit": purchase_history[0].get('unit') if purchase_history else planned_mat.get('unit'),
                        "unit_price": float(actual_avg_unit_price),
                        "total": float(actual_total),
                        "purchase_history": purchase_history
                    } if actual_mat and actual_quantity > 0 else None,
                    "variance": {
                        "quantity": float(quantity_variance),
                        "unit": planned_mat.get('unit'),
                        "price": float(price_variance),
                        "total": float(total_variance),
                        "percentage": (float(total_variance) / float(planned_total) * 100) if planned_total > 0 else 0,
                        "status": "overrun" if total_variance > 0 else "saved" if total_variance < 0 else "on_budget"
                    } if actual_mat and actual_quantity > 0 else None,
                    "status": material_status,
                    "variance_reason": variance_reason,
                    "variance_response": variance_response
                })

            # Check for unplanned materials (purchased but not in BOQ)
            # Build a set of all material IDs we've already processed
            processed_material_ids = set()
            processed_material_names = set()

            for planned_mat in planned_item.get('materials', []):
                mat_id = planned_mat.get('master_material_id')
                mat_name = planned_mat.get('material_name', '').lower().strip()
                if mat_id:
                    processed_material_ids.add(mat_id)
                if mat_name:
                    processed_material_names.add(mat_name)

            # Find materials in actual purchases that weren't in the plan
            for am in actual_materials:
                if am.master_item_id == master_item_id or not master_item_id:
                    if am.purchase_history:
                        purchase_data = am.purchase_history

                        if isinstance(purchase_data, dict):
                            # Collect all material entries
                            all_material_entries = []

                            if 'materials' in purchase_data and isinstance(purchase_data['materials'], list):
                                all_material_entries.extend(purchase_data['materials'])

                            for key, value in purchase_data.items():
                                if key != 'materials' and isinstance(value, dict):
                                    if 'material_name' in value or 'master_material_id' in value:
                                        all_material_entries.append(value)

                            # Check each material entry
                            for mat_entry in all_material_entries:
                                entry_mat_id = mat_entry.get('master_material_id')
                                entry_mat_name = mat_entry.get('material_name', '').lower().strip()

                                # Check if this material is unplanned
                                is_unplanned = True
                                if entry_mat_id and entry_mat_id in processed_material_ids:
                                    is_unplanned = False
                                if entry_mat_name and entry_mat_name in processed_material_names:
                                    is_unplanned = False

                                if is_unplanned:
                                    # Add this as an unplanned material
                                    purchase_qty = Decimal(str(mat_entry.get('quantity', 0)))
                                    purchase_price = Decimal(str(mat_entry.get('unit_price', 0)))
                                    purchase_total = Decimal(str(mat_entry.get('total_price', 0)))

                                    actual_materials_total += purchase_total

                                    # Mark as processed to avoid duplicates
                                    if entry_mat_id:
                                        processed_material_ids.add(entry_mat_id)
                                    if entry_mat_name:
                                        processed_material_names.add(entry_mat_name)

                                    materials_comparison.append({
                                        "material_name": mat_entry.get('material_name'),
                                        "master_material_id": entry_mat_id,
                                        "planned": None,  # Not in original BOQ
                                        "actual": {
                                            "quantity": float(purchase_qty),
                                            "unit": mat_entry.get('unit'),
                                            "unit_price": float(purchase_price),
                                            "total": float(purchase_total),
                                            "purchase_history": [{
                                                "purchase_date": am.created_at.isoformat() if am.created_at else None,
                                                "quantity": float(purchase_qty),
                                                "unit": mat_entry.get('unit'),
                                                "unit_price": float(purchase_price),
                                                "total_price": float(purchase_total),
                                                "purchased_by": am.created_by or "Unknown"
                                            }]
                                        },
                                        "variance": {
                                            "quantity": float(purchase_qty),
                                            "unit": mat_entry.get('unit'),
                                            "price": float(purchase_price),
                                            "total": float(purchase_total),
                                            "percentage": 0,  # No baseline to compare
                                            "status": "unplanned",
                                            "reason": mat_entry.get('reason'),
                                        },
                                        "status": "unplanned",
                                        "note": "This material was purchased but was not in the original BOQ plan"
                                    })

            # Labour comparison
            labour_comparison = []
            planned_labour_total = Decimal('0')
            actual_labour_total = Decimal('0')

            for planned_lab in planned_item.get('labour', []):
                master_labour_id = planned_lab.get('master_labour_id')

                # Find actual labour tracking for this role - Try exact match first
                actual_lab = next(
                    (al for al in actual_labour
                     if al.master_labour_id == master_labour_id
                     and al.master_item_id == master_item_id),
                    None
                )

                # Fallback: match by labour_id only
                if not actual_lab:
                    actual_lab = next(
                        (al for al in actual_labour
                         if al.master_labour_id == master_labour_id),
                        None
                    )

                # Calculate planned total
                planned_hours = Decimal(str(planned_lab.get('hours', 0)))
                planned_rate = Decimal(str(planned_lab.get('rate_per_hour', 0)))
                planned_total = planned_hours * planned_rate

                # Calculate actual total from labour history
                actual_total = Decimal('0')
                actual_hours = Decimal('0')
                actual_avg_rate = Decimal('0')
                labour_history = []

                if actual_lab and actual_lab.labour_history:
                    for work_entry in actual_lab.labour_history:
                        work_hours = Decimal(str(work_entry.get('hours', 0)))
                        work_rate = Decimal(str(work_entry.get('rate_per_hour', 0)))
                        work_total = Decimal(str(work_entry.get('total_cost', 0)))

                        actual_hours += work_hours
                        actual_total += work_total

                        labour_history.append({
                            "work_date": work_entry.get('work_date'),
                            "hours": float(work_hours),
                            "rate_per_hour": float(work_rate),
                            "total_cost": float(work_total),
                            "worker_name": work_entry.get('worker_name'),
                            "notes": work_entry.get('notes')
                        })

                    if actual_hours > 0:
                        actual_avg_rate = actual_total / actual_hours

                planned_labour_total += planned_total

                # For actual total: use actual if recorded, otherwise use planned (for pending items)
                if actual_total > 0:
                    actual_labour_total += actual_total
                else:
                    # Labour is pending - assume planned cost
                    actual_labour_total += planned_total

                # Calculate variances
                hours_variance = actual_hours - planned_hours
                rate_variance = actual_avg_rate - planned_rate
                total_variance = actual_total - planned_total

                # Determine status
                labour_status = "pending"
                if actual_lab and actual_hours > 0:
                    labour_status = "completed"

                labour_comparison.append({
                    "labour_role": planned_lab.get('labour_role'),
                    "master_labour_id": master_labour_id,
                    "planned": {
                        "hours": float(planned_hours),
                        "rate_per_hour": float(planned_rate),
                        "total": float(planned_total)
                    },
                    "actual": {
                        "hours": float(actual_hours),
                        "rate_per_hour": float(actual_avg_rate),
                        "total": float(actual_total),
                        "labour_history": labour_history
                    } if actual_lab and actual_hours > 0 else None,
                    "variance": {
                        "hours": float(hours_variance),
                        "rate": float(rate_variance),
                        "total": float(total_variance),
                        "percentage": (float(total_variance) / float(planned_total) * 100) if planned_total > 0 else 0
                    } if actual_lab and actual_hours > 0 else None,
                    "status": labour_status
                })

            # Calculate item totals
            planned_base = planned_materials_total + planned_labour_total
            actual_base = actual_materials_total + actual_labour_total

            overhead_pct = Decimal(str(planned_item.get('overhead_percentage', 0)))
            profit_pct = Decimal(str(planned_item.get('profit_margin_percentage', 0)))

            # Planned amounts (original BOQ)
            planned_overhead = planned_base * (overhead_pct / 100)
            planned_profit = planned_base * (profit_pct / 100)
            planned_total = planned_base + planned_overhead + planned_profit

            # The selling price is FIXED - this is what we're selling to the client
            selling_price = Decimal(str(planned_item.get('selling_price', 0)))

            # CONSUMPTION MODEL CALCULATION:
            # Calculate ONLY the extra costs (overspend on planned items + unplanned items)
            # These extra costs consume overhead and profit buffers

            # 1. Calculate extra costs from material/labour overruns and unplanned items
            extra_costs = Decimal('0')

            # Add overspend from planned materials (only positive variances)
            for mat_comp in materials_comparison:
                if mat_comp.get('status') == 'completed' and mat_comp.get('variance'):
                    # Only count if we overspent (positive variance)
                    mat_variance = Decimal(str(mat_comp['variance'].get('total', 0)))
                    if mat_variance > 0:
                        extra_costs += mat_variance
                elif mat_comp.get('status') == 'unplanned' and mat_comp.get('actual'):
                    # Add full cost of unplanned materials
                    unplanned_cost = Decimal(str(mat_comp['actual'].get('total', 0)))
                    extra_costs += unplanned_cost

            # Add overspend from labour (only positive variances)
            for lab_comp in labour_comparison:
                if lab_comp.get('status') == 'completed' and lab_comp.get('variance'):
                    lab_variance = Decimal(str(lab_comp['variance'].get('total', 0)))
                    if lab_variance > 0:
                        extra_costs += lab_variance

            # 2. Start with planned overhead and profit (these are our buffers)
            remaining_overhead = planned_overhead
            remaining_profit = planned_profit
            overhead_consumed = Decimal('0')
            profit_consumed = Decimal('0')

            if extra_costs > 0:
                # We have extra costs - consume overhead first
                overhead_consumed = min(extra_costs, planned_overhead)
                remaining_overhead = planned_overhead - overhead_consumed

                # If extra costs exceed overhead, consume profit
                if extra_costs > planned_overhead:
                    excess_costs = extra_costs - planned_overhead
                    profit_consumed = min(excess_costs, planned_profit)
                    remaining_profit = planned_profit - profit_consumed
            else:
                # No extra costs - keep full overhead and profit
                remaining_overhead = planned_overhead
                remaining_profit = planned_profit

            # 3. Calculate actual overhead and profit (what remains after consumption)
            actual_overhead = remaining_overhead
            actual_profit = remaining_profit

            # 4. Calculate actual total cost (base + remaining overhead + remaining profit)
            actual_total = actual_base + actual_overhead + actual_profit

            # 5. Calculate variances
            base_cost_variance = actual_base - planned_base  # For reporting
            overhead_variance = actual_overhead - planned_overhead
            profit_variance = actual_profit - planned_profit

            # Calculate savings/overrun (use absolute values for display)
            cost_savings = abs(planned_base - actual_base)  # Always positive
            overhead_diff = abs(planned_overhead - actual_overhead)  # Always positive
            profit_diff = abs(planned_profit - actual_profit)  # Always positive

           # Calculate completion percentage
            total_materials = len(planned_item.get('materials', []))
            total_labour = len(planned_item.get('labour', []))
            completed_materials = len([m for m in materials_comparison if m['status'] == 'completed'])
            completed_labour = len([l for l in labour_comparison if l['status'] == 'completed'])
            unplanned_materials = len([m for m in materials_comparison if m['status'] == 'unplanned'])

            # Count unplanned materials as "completed" since they were purchased
            completion_percentage = 0
            if (total_materials + total_labour) > 0:
                completion_percentage = ((completed_materials + completed_labour + unplanned_materials) / (total_materials + total_labour)) * 100

            item_comparison = {
                "item_name": planned_item.get('item_name'),
                "master_item_id": master_item_id,
                "description": planned_item.get('description'),
                "completion_status": {
                    "percentage": round(completion_percentage, 2),
                    "materials_completed": f"{completed_materials}/{total_materials}",
                    "labour_completed": f"{completed_labour}/{total_labour}",
                    "unplanned_materials": unplanned_materials,
                    "is_fully_completed": completion_percentage == 100,
                    "note": f"{unplanned_materials} unplanned material(s) purchased" if unplanned_materials > 0 else None
                },
                "materials": materials_comparison,
                "labour": labour_comparison,
                "planned": {
                    "materials_total": float(planned_materials_total),
                    "labour_total": float(planned_labour_total),
                    "base_cost": float(planned_base),
                    "overhead_amount": float(planned_overhead),
                    "overhead_percentage": float(overhead_pct),
                    "profit_amount": float(planned_profit),
                    "profit_percentage": float(profit_pct),
                    "total": float(planned_total),
                    "selling_price": float(selling_price)
                },
                "actual": {
                    "materials_total": float(actual_materials_total),
                    "labour_total": float(actual_labour_total),
                    "base_cost": float(actual_base),
                    "overhead_amount": float(actual_overhead),
                    "overhead_percentage": float(overhead_pct),
                    "profit_amount": float(actual_profit),
                    "profit_percentage": (float(actual_profit) / float(selling_price) * 100) if selling_price > 0 else 0,
                    "total": float(actual_total),
                    "selling_price": float(selling_price)
                },
                "consumption_flow": {
                    "extra_costs": float(extra_costs),
                    "base_cost_variance": float(base_cost_variance),
                    "variance_status": "overspent" if extra_costs > 0 else "saved",
                    "overhead_variance": float(overhead_variance),
                    "profit_variance": float(profit_variance),
                    "overhead_consumed": float(overhead_consumed),
                    "overhead_remaining": float(remaining_overhead),
                    "profit_consumed": float(profit_consumed),
                    "profit_remaining": float(remaining_profit),
                    "explanation": "Extra costs (overruns + unplanned items) consume overhead first, then profit. Incomplete purchases don't affect consumption."
                },
                "savings_breakdown": {
                    "total_cost_savings": float(cost_savings),
                    "overhead_difference": float(overhead_diff),
                    "profit_difference": float(profit_diff),
                    "note": "All values shown as absolute (positive) amounts for clarity"
                },
                "variance": {
                    "materials": {
                        "amount": float(abs(actual_materials_total - planned_materials_total)),
                        "status": "saved" if (planned_materials_total - actual_materials_total) > 0 else "overrun"
                    },
                    "labour": {
                        "amount": float(abs(actual_labour_total - planned_labour_total)),
                        "status": "saved" if (planned_labour_total - actual_labour_total) > 0 else "overrun"
                    },
                    "base_cost": {
                        "amount": float(abs(actual_base - planned_base)),
                        "status": "saved" if (planned_base - actual_base) > 0 else "overrun"
                    },
                    "overhead": {
                        "planned": float(planned_overhead),
                        "actual": float(actual_overhead),
                        "difference": float(abs(overhead_diff))
                    },
                    "profit": {
                        "planned": float(planned_profit),
                        "actual": float(actual_profit),
                        "difference": float(abs(profit_diff))
                    }
                }
            }

            comparison['items'].append(item_comparison)

        # Calculate overall summary
        total_planned = sum(float(item['planned']['total']) for item in comparison['items'])
        total_actual = sum(float(item['actual']['total']) for item in comparison['items'])
        total_planned_profit = sum(float(item['planned']['profit_amount']) for item in comparison['items'])
        total_actual_profit = sum(float(item['actual']['profit_amount']) for item in comparison['items'])
        total_planned_overhead = sum(float(item['planned']['overhead_amount']) for item in comparison['items'])
        total_actual_overhead = sum(float(item['actual']['overhead_amount']) for item in comparison['items'])

        comparison['summary'] = {
            "planned_total": float(total_planned),
            "actual_total": float(total_actual),
            "variance": float(abs(total_actual - total_planned)),  # Always positive number
            "variance_percentage": float(abs((total_actual - total_planned) / total_planned * 100)) if total_planned > 0 else 0,
            "status": "under_budget" if total_actual < total_planned else "over_budget" if total_actual > total_planned else "on_budget",
            "total_planned_overhead": float(total_planned_overhead),
            "total_actual_overhead": float(total_actual_overhead),
            "overhead_variance": float(abs(total_actual_overhead - total_planned_overhead)),
            "total_planned_profit": float(total_planned_profit),
            "total_actual_profit": float(total_actual_profit),
            "profit_variance": float(abs(total_actual_profit - total_planned_profit)),
            "profit_status": "reduced" if total_actual_profit < total_planned_profit else "maintained" if total_actual_profit == total_planned_profit else "increased",
            "total_overhead_plus_profit": float(total_actual_overhead + total_actual_profit),
            "planned_overhead_plus_profit": float(total_planned_overhead + total_planned_profit)
        }

        return jsonify(comparison), 200

    except Exception as e:
        log.error(f"Error getting planned vs actual: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to get comparison: {str(e)}"}), 500
