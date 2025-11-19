from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from models.preliminary_master import BOQPreliminary, BOQInternalRevision
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role
from utils.admin_viewing_context import get_effective_user_context, should_apply_role_filter
from sqlalchemy import func, and_, or_
from config.change_request_config import CR_CONFIG


log = get_logger()


def validate_negotiable_margin_formula(client_amount, materials, labour, misc, overhead_profit, transport, calculated_margin):
    """
    Validate that negotiable margin follows the correct formula:
    Negotiable Margin = Client Amount - (Materials + Labour + Misc + O&P + Transport)

    Raises ValueError if formula is incorrect
    """
    expected_internal_cost = materials + labour + misc + overhead_profit + transport
    expected_margin = client_amount - expected_internal_cost

    # Allow small floating point differences (0.01)
    tolerance = 0.01
    difference = abs(expected_margin - calculated_margin)

    if difference > tolerance:
        error_msg = (
            f"Negotiable margin calculation error!\n"
            f"Expected: {expected_margin:.2f} "
            f"(Client: {client_amount:.2f} - Internal: {expected_internal_cost:.2f})\n"
            f"Got: {calculated_margin:.2f}\n"
            f"Difference: {difference:.2f}\n"
            f"Formula: Client Amount - (Materials + Labour + Misc + O&P + Transport)\n"
            f"Breakdown: {client_amount:.2f} - ({materials:.2f} + {labour:.2f} + {misc:.2f} + {overhead_profit:.2f} + {transport:.2f})"
        )
        log.error(error_msg)
        raise ValueError(error_msg)

    return True


def add_to_master_tables(item_name, description, work_type, materials_data, labour_data, created_by, miscellaneous_percentage=None, miscellaneous_amount=None, overhead_percentage=None, overhead_amount=None, profit_margin_percentage=None, profit_margin_amount=None, discount_percentage=None, discount_amount=None, vat_percentage=None, vat_amount=None, unit=None, quantity=None, per_unit_cost=None, total_amount=None, item_total_cost=None):
    """Add items, materials, and labour to master tables if they don't exist"""
    master_item_id = None
    master_material_ids = []
    master_labour_ids = []
    # Add to master items (prevent duplicates)
    master_item = MasterItem.query.filter_by(item_name=item_name).first()
    if not master_item:
        master_item = MasterItem(
            item_name=item_name,
            description=description,
            unit=unit,
            quantity=quantity,
            per_unit_cost=per_unit_cost,
            total_amount=total_amount,
            item_total_cost=item_total_cost,
            miscellaneous_percentage=miscellaneous_percentage,
            miscellaneous_amount=miscellaneous_amount,
            overhead_percentage=overhead_percentage,
            overhead_amount=overhead_amount,
            profit_margin_percentage=profit_margin_percentage,
            profit_margin_amount=profit_margin_amount,
            discount_percentage=discount_percentage,
            discount_amount=discount_amount,
            vat_percentage=vat_percentage,
            vat_amount=vat_amount,
            created_by=created_by
        )
        db.session.add(master_item)
        db.session.flush()
    else:
        # If item exists, update description, cost fields, and miscellaneous/profit values
        if description:
            master_item.description = description

        # Always update all fields with latest values (even if None)
        master_item.unit = unit
        master_item.quantity = quantity
        master_item.per_unit_cost = per_unit_cost
        master_item.total_amount = total_amount
        master_item.item_total_cost = item_total_cost
        master_item.miscellaneous_percentage = miscellaneous_percentage
        master_item.miscellaneous_amount = miscellaneous_amount
        master_item.overhead_percentage = overhead_percentage
        master_item.overhead_amount = overhead_amount
        master_item.profit_margin_percentage = profit_margin_percentage
        master_item.profit_margin_amount = profit_margin_amount
        master_item.discount_percentage = discount_percentage
        master_item.discount_amount = discount_amount
        master_item.vat_percentage = vat_percentage
        master_item.vat_amount = vat_amount

        db.session.flush()
    master_item_id = master_item.item_id

    # ✅ OPTIMIZED: Bulk query for materials (prevents N+1 queries)
    # BEFORE: 1 query per material = N+1 queries
    # AFTER: 1 bulk query for all materials
    material_names = [mat_data.get("material_name") for mat_data in materials_data]
    existing_materials = MasterMaterial.query.filter(
        MasterMaterial.material_name.in_(material_names)
    ).all()
    existing_materials_map = {mat.material_name: mat for mat in existing_materials}

    # Add to master materials (prevent duplicates) with item_id reference
    for mat_data in materials_data:
        material_name = mat_data.get("material_name")
        quantity = mat_data.get("quantity", 0.0)
        unit_price = mat_data.get("unit_price", 0.0)
        total_price = mat_data.get("total_price", quantity * unit_price)
        vat_percentage = mat_data.get("vat_percentage", 0.0)
        vat_amount = mat_data.get("vat_amount", 0.0)

        master_material = existing_materials_map.get(material_name)
        if not master_material:
            master_material = MasterMaterial(
                material_name=material_name,
                item_id=master_item_id,  # Set the item_id reference
                description=mat_data.get("description"),
                brand=mat_data.get("brand"),
                size=mat_data.get("size"),
                specification=mat_data.get("specification"),
                quantity=quantity,
                default_unit=mat_data.get("unit", "nos"),
                current_market_price=unit_price,
                total_price=total_price,
                vat_percentage=vat_percentage,
                vat_amount=vat_amount,
                created_by=created_by,
                last_modified_by=created_by
            )
            db.session.add(master_material)
            db.session.flush()
        else:
            # Update existing material: always update current_market_price and item_id if needed
            if master_material.item_id is None:
                master_material.item_id = master_item_id

            # Always update current_market_price with the new unit_price from BOQ
            master_material.description = mat_data.get("description")
            master_material.brand = mat_data.get("brand")
            master_material.size = mat_data.get("size")
            master_material.specification = mat_data.get("specification")
            master_material.quantity = quantity
            master_material.current_market_price = unit_price
            master_material.total_price = total_price
            master_material.vat_percentage = vat_percentage
            master_material.vat_amount = vat_amount
            master_material.last_modified_by = created_by

            # Update unit if different
            new_unit = mat_data.get("unit", "nos")
            if master_material.default_unit != new_unit:
                master_material.default_unit = new_unit

            db.session.flush()
        master_material_ids.append(master_material.material_id)

    # ✅ OPTIMIZED: Bulk query for labour (prevents N+1 queries)
    # BEFORE: 1 query per labour role = N+1 queries
    # AFTER: 1 bulk query for all labour roles
    labour_roles = [labour_data_item.get("labour_role") for labour_data_item in labour_data]
    existing_labour = MasterLabour.query.filter(
        MasterLabour.labour_role.in_(labour_roles)
    ).all()
    existing_labour_map = {labour.labour_role: labour for labour in existing_labour}

    # Add to master labour (prevent duplicates) with item_id reference
    for i, labour_data_item in enumerate(labour_data):
        labour_role = labour_data_item.get("labour_role")
        # Get hours and rate_per_hour
        rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
        hours = labour_data_item.get("hours", 0.0)
        labour_amount = float(rate_per_hour) * float(hours)

        master_labour = existing_labour_map.get(labour_role)

        if not master_labour:
            master_labour = MasterLabour(
                labour_role=labour_role,
                item_id=master_item_id,  # Set the item_id reference
                work_type=work_type,  # Set the work_type
                hours=float(hours),  # Store hours as float
                rate_per_hour=float(rate_per_hour),  # Store rate per hour as float
                amount=labour_amount,  # Set the calculated amount
                created_by=created_by
            )
            db.session.add(master_labour)
            db.session.flush()
        else:
            # Update existing labour: always update item_id, work_type, hours, rate_per_hour, and amount
            if master_labour.item_id is None:
                master_labour.item_id = master_item_id
            if master_labour.work_type is None and work_type:
                master_labour.work_type = work_type

            # Always update hours, rate_per_hour, and amount with the latest values
            master_labour.hours = float(hours)
            master_labour.rate_per_hour = float(rate_per_hour)
            master_labour.amount = labour_amount

            db.session.flush()
        master_labour_ids.append(master_labour.labour_id)

    return master_item_id, master_material_ids, master_labour_ids

def add_sub_items_to_master_tables(master_item_id, sub_items, created_by):
    """Add sub-items, their materials, and labour to master tables"""
    master_sub_item_ids = []

    for sub_item in sub_items:
        sub_item_name = sub_item.get("sub_item_name")
        if not sub_item_name:
            continue

        # Check if master sub-item already exists for this item and sub-item name
        master_sub_item = MasterSubItem.query.filter_by(
            item_id=master_item_id,
            sub_item_name=sub_item_name
        ).first()

        if not master_sub_item:
            # Create new master sub-item
            master_sub_item = MasterSubItem(
                item_id=master_item_id,
                sub_item_name=sub_item_name,
                description=sub_item.get("scope") or sub_item.get("description", ""),
                size=sub_item.get("size", ""),
                location=sub_item.get("location", ""),
                brand=sub_item.get("brand", ""),
                unit=sub_item.get("unit"),
                quantity=sub_item.get("quantity"),
                per_unit_cost=sub_item.get("per_unit_cost"),
                sub_item_total_cost=sub_item.get("sub_item_total_cost"),
                misc_percentage=sub_item.get("misc_percentage", 10.0),
                misc_amount=sub_item.get("misc_amount", 0.0),
                overhead_profit_percentage=sub_item.get("overhead_profit_percentage", 25.0),
                overhead_profit_amount=sub_item.get("overhead_profit_amount", 0.0),
                transport_percentage=sub_item.get("transport_percentage", 5.0),
                transport_amount=sub_item.get("transport_amount", 0.0),
                material_cost=sub_item.get("material_cost", 0.0),
                labour_cost=sub_item.get("labour_cost", 0.0),
                internal_cost=sub_item.get("internal_cost", 0.0),
                planned_profit=sub_item.get("planned_profit", 0.0),
                negotiable_margin=sub_item.get("negotiable_margin", 0.0),
                created_by=created_by
            )
            db.session.add(master_sub_item)
            db.session.flush()
        else:
            # Update existing master sub-item
            master_sub_item.description = sub_item.get("scope") or sub_item.get("description", "")
            master_sub_item.size = sub_item.get("size", "")
            master_sub_item.location = sub_item.get("location", "")
            master_sub_item.brand = sub_item.get("brand", "")
            master_sub_item.unit = sub_item.get("unit")
            master_sub_item.quantity = sub_item.get("quantity")
            master_sub_item.per_unit_cost = sub_item.get("per_unit_cost")
            master_sub_item.sub_item_total_cost = sub_item.get("sub_item_total_cost")
            master_sub_item.misc_percentage = sub_item.get("misc_percentage", 10.0)
            master_sub_item.misc_amount = sub_item.get("misc_amount", 0.0)
            master_sub_item.overhead_profit_percentage = sub_item.get("overhead_profit_percentage", 25.0)
            master_sub_item.overhead_profit_amount = sub_item.get("overhead_profit_amount", 0.0)
            master_sub_item.transport_percentage = sub_item.get("transport_percentage", 5.0)
            master_sub_item.transport_amount = sub_item.get("transport_amount", 0.0)
            master_sub_item.material_cost = sub_item.get("material_cost", 0.0)
            master_sub_item.labour_cost = sub_item.get("labour_cost", 0.0)
            master_sub_item.internal_cost = sub_item.get("internal_cost", 0.0)
            master_sub_item.planned_profit = sub_item.get("planned_profit", 0.0)
            master_sub_item.negotiable_margin = sub_item.get("negotiable_margin", 0.0)
            db.session.flush()

        master_sub_item_id = master_sub_item.sub_item_id
        master_sub_item_ids.append(master_sub_item_id)

        # Add materials for this sub-item
        materials = sub_item.get("materials", [])
        if materials:
            # Filter out materials with empty names before querying
            material_names = [mat.get("material_name", "").strip() for mat in materials if mat.get("material_name", "").strip()]

            existing_materials_map = {}
            if material_names:
                existing_materials = MasterMaterial.query.filter(
                    MasterMaterial.material_name.in_(material_names)
                ).all()
                existing_materials_map = {mat.material_name: mat for mat in existing_materials}

            for mat in materials:
                material_name = mat.get("material_name", "").strip()
                if not material_name:
                    continue

                quantity = mat.get("quantity", 0.0)
                unit_price = mat.get("unit_price", 0.0)
                total_price = mat.get("total_price", quantity * unit_price)

                master_material = existing_materials_map.get(material_name)
                if not master_material:
                    master_material = MasterMaterial(
                        material_name=material_name,
                        item_id=master_item_id,
                        sub_item_id=master_sub_item_id,
                        description=mat.get("description"),
                        brand=mat.get("brand"),
                        size=mat.get("size"),
                        specification=mat.get("specification"),
                        quantity=quantity,
                        default_unit=mat.get("unit", "nos"),
                        current_market_price=unit_price,
                        total_price=total_price,
                        vat_percentage=mat.get("vat_percentage", 0.0),
                        vat_amount=mat.get("vat_amount", 0.0),
                        created_by=created_by,
                        last_modified_by=created_by
                    )
                    db.session.add(master_material)
                    db.session.flush()
                else:
                    # Update existing material
                    master_material.sub_item_id = master_sub_item_id
                    if master_material.item_id is None:
                        master_material.item_id = master_item_id
                    master_material.description = mat.get("description")
                    master_material.brand = mat.get("brand")
                    master_material.size = mat.get("size")
                    master_material.specification = mat.get("specification")
                    master_material.quantity = quantity
                    master_material.current_market_price = unit_price
                    master_material.total_price = total_price
                    master_material.vat_percentage = mat.get("vat_percentage", 0.0)
                    master_material.vat_amount = mat.get("vat_amount", 0.0)
                    master_material.last_modified_by = created_by
                    db.session.flush()

        # Add labour for this sub-item
        labour_list = sub_item.get("labour", [])
        if labour_list:
            # Filter out labour with empty roles before querying
            labour_roles = [labour.get("labour_role", "").strip() for labour in labour_list if labour.get("labour_role", "").strip()]

            existing_labour_map = {}
            if labour_roles:
                existing_labour = MasterLabour.query.filter(
                    MasterLabour.labour_role.in_(labour_roles)
                ).all()
                existing_labour_map = {labour.labour_role: labour for labour in existing_labour}

            for labour in labour_list:
                labour_role = labour.get("labour_role", "").strip()
                if not labour_role:
                    continue

                rate_per_hour = labour.get("rate_per_hour", 0.0)
                hours = labour.get("hours", 0.0)
                labour_amount = float(rate_per_hour) * float(hours)

                # Check if labour_role already exists in master table
                master_labour = existing_labour_map.get(labour_role)

                if not master_labour:
                    # Insert new labour entry
                    master_labour = MasterLabour(
                        labour_role=labour_role,
                        item_id=master_item_id,
                        sub_item_id=master_sub_item_id,
                        work_type=labour.get("work_type", "daily_wages"),
                        hours=float(hours),
                        rate_per_hour=float(rate_per_hour),
                        amount=labour_amount,
                        created_by=created_by
                    )
                    db.session.add(master_labour)
                    db.session.flush()
                else:
                    # Update existing labour entry with new values
                    master_labour.item_id = master_item_id
                    master_labour.sub_item_id = master_sub_item_id
                    if labour.get("work_type"):
                        master_labour.work_type = labour.get("work_type")
                    master_labour.hours = float(hours)
                    master_labour.rate_per_hour = float(rate_per_hour)
                    master_labour.amount = labour_amount
                    db.session.flush()

    return master_sub_item_ids

def clean_numeric_value(value):
    """Clean numeric values that might come wrapped in {source, parsedValue} objects"""
    if value is None:
        return 0.0

    # If it's a dict with parsedValue, extract it
    if isinstance(value, dict):
        if 'parsedValue' in value:
            return float(value['parsedValue']) if value['parsedValue'] is not None else 0.0
        if 'source' in value:
            try:
                return float(value['source'])
            except (ValueError, TypeError):
                return 0.0
        return 0.0

    # If it's already a number, return it
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0

def create_boq():
    """Create a new BOQ using master tables and JSON storage"""
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

        created_by = data.get("created_by", "Admin")

        # Create BOQ
        boq = BOQ(
            project_id=project_id,
            boq_name=data.get("boq_name"),
            status=data.get("status", "Draft"),
            created_by=created_by,
        )
        db.session.add(boq)
        db.session.flush()  # Get boq_id

        # Process items and create JSON structure
        boq_items = []
        total_boq_cost = 0
        total_materials = 0
        total_labour = 0

        # Track processed items to prevent duplicates
        processed_item_names = set()

        for idx, item_data in enumerate(data.get("items", [])):
            item_name = item_data.get("item_name", "")

            # Skip if this item name was already processed (prevent duplicates)
            if item_name in processed_item_names:
                continue

            processed_item_names.add(item_name)
            # Initialize variables for this item iteration
            item_materials = []
            item_labour = []

            # Get item-level materials and labour
            item_level_materials = item_data.get("materials", [])
            item_level_labour = item_data.get("labour", [])

            # Get sub-items
            sub_items = item_data.get("sub_items", [])

            # Extract item-level cost fields from payload
            item_unit = item_data.get("unit")
            item_quantity = item_data.get("quantity")
            item_per_unit_cost = item_data.get("per_unit_cost")
            item_rate = item_data.get("rate", item_per_unit_cost)  # rate is alias for per_unit_cost
            item_total_amount = item_data.get("total_amount")  # Accept total_amount from payload

            # Use rate if per_unit_cost not provided
            if item_per_unit_cost is None and item_rate is not None:
                item_per_unit_cost = item_rate

            # Calculate base cost from materials and labour (item-level + sub-items)
            materials_cost = 0
            labour_cost = 0

            # Collect ALL materials from item-level
            all_materials = []
            for mat_data in item_level_materials:
                all_materials.append(mat_data)
                quantity = mat_data.get("quantity", 1.0)
                unit_price = mat_data.get("unit_price", 0.0)
                materials_cost += quantity * unit_price

            # Collect ALL labour from item-level
            all_labour = []
            for labour_data_item in item_level_labour:
                all_labour.append(labour_data_item)
                hours = labour_data_item.get("hours", 0.0)
                rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
                labour_cost += hours * rate_per_hour

            # Process sub-items and collect their materials and labour
            processed_sub_items = []
            for sub_item_idx, sub_item in enumerate(sub_items):
                sub_item_materials = []
                sub_item_labour = []
                sub_item_materials_cost = 0
                sub_item_labour_cost = 0

                # Process sub-item materials
                for mat_data in sub_item.get("materials", []):
                    all_materials.append(mat_data)
                    quantity = mat_data.get("quantity", 1.0)
                    unit_price = mat_data.get("unit_price", 0.0)
                    total_price = quantity * unit_price
                    materials_cost += total_price
                    sub_item_materials_cost += total_price

                    sub_item_materials.append({
                        "material_id": mat_data.get("material_id"),
                        "material_name": mat_data.get("material_name"),
                        "location": mat_data.get("location", ""),
                        "brand": mat_data.get("brand", ""),
                        "size": mat_data.get("size", ""),
                        "specification": mat_data.get("specification", ""),
                        "description": mat_data.get("description", ""),
                        "quantity": quantity,
                        "unit": mat_data.get("unit", "nos"),
                        "unit_price": unit_price,
                        "total_price": total_price
                    })

                # Process sub-item labour
                for labour_data_item in sub_item.get("labour", []):
                    all_labour.append(labour_data_item)
                    hours = labour_data_item.get("hours", 0.0)
                    rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
                    total_cost_labour = hours * rate_per_hour
                    labour_cost += total_cost_labour
                    sub_item_labour_cost += total_cost_labour

                    sub_item_labour.append({
                        "labour_role": labour_data_item.get("labour_role"),
                        "hours": hours,
                        "rate_per_hour": rate_per_hour,
                        "total_cost": total_cost_labour
                    })

                # Get per-sub-item percentages from payload or use config defaults
                misc_percentage = sub_item.get("misc_percentage", CR_CONFIG.DEFAULT_MISC_PERCENTAGE)
                overhead_profit_percentage = sub_item.get("overhead_profit_percentage", CR_CONFIG.DEFAULT_OVERHEAD_PROFIT_PERCENTAGE)
                transport_percentage = sub_item.get("transport_percentage", CR_CONFIG.DEFAULT_TRANSPORT_PERCENTAGE)

                # Calculate sub-item client amount
                sub_item_quantity = sub_item.get("quantity", 0)
                sub_item_rate = sub_item.get("rate", 0) or sub_item.get("per_unit_cost", 0)
                sub_item_client_amount = sub_item_quantity * sub_item_rate

                # Calculate percentage amounts (from client rate)
                misc_amount = sub_item_client_amount * (misc_percentage / 100)
                overhead_profit_amount = sub_item_client_amount * (overhead_profit_percentage / 100)
                transport_amount = sub_item_client_amount * (transport_percentage / 100)

                # Calculate internal cost (materials + labour)
                sub_item_internal_cost = sub_item_materials_cost + sub_item_labour_cost

                # Calculate profits
                planned_profit = overhead_profit_amount
                # Negotiable Margin = Client Amount - (Materials + Labour + Misc + O&P + Transport)
                negotiable_margin = sub_item_client_amount - sub_item_internal_cost - misc_amount - overhead_profit_amount - transport_amount

                # Validate the calculation
                try:
                    validate_negotiable_margin_formula(
                        client_amount=sub_item_client_amount,
                        materials=sub_item_materials_cost,
                        labour=sub_item_labour_cost,
                        misc=misc_amount,
                        overhead_profit=overhead_profit_amount,
                        transport=transport_amount,
                        calculated_margin=negotiable_margin
                    )
                except ValueError as e:
                    log.warning(f"Negotiable margin validation failed for sub-item: {e}")

                # Store processed sub-item
                processed_sub_items.append({
                    "sub_item_name": sub_item.get("sub_item_name"),
                    "description": sub_item.get("scope", ""),
                    "size": sub_item.get("size", ""),
                    "location": sub_item.get("location", ""),
                    "brand": sub_item.get("brand", ""),
                    "unit": sub_item.get("unit"),
                    "quantity": sub_item_quantity,
                    "per_unit_cost": sub_item_rate,
                    "rate": sub_item_rate,
                    "sub_item_total": sub_item_client_amount,

                    # Per-sub-item percentages
                    "misc_percentage": misc_percentage,
                    "misc_amount": misc_amount,
                    "overhead_profit_percentage": overhead_profit_percentage,
                    "overhead_profit_amount": overhead_profit_amount,
                    "transport_percentage": transport_percentage,
                    "transport_amount": transport_amount,

                    # Cost breakdown
                    "materials": sub_item_materials,
                    "labour": sub_item_labour,
                    "material_cost": sub_item_materials_cost,
                    "labour_cost": sub_item_labour_cost,
                    "internal_cost": sub_item_internal_cost,
                    "planned_profit": planned_profit,
                    "negotiable_margin": negotiable_margin,

                    # Legacy fields for backward compatibility
                    "total_materials_cost": sub_item_materials_cost,
                    "total_labour_cost": sub_item_labour_cost,
                    "total_cost": sub_item_materials_cost + sub_item_labour_cost
                })

            # Calculate base_cost from sub-items or from item-level quantity * rate
            sub_items_base_cost = materials_cost + labour_cost

            # Determine base cost: Priority: total_amount > (quantity * rate) > sub-items
            item_total_cost_field = None
            if item_total_amount is not None:
                # Use total_amount directly from payload
                base_cost = float(item_total_amount)
                item_total_cost_field = float(item_total_amount)
            elif item_quantity is not None and item_per_unit_cost is not None:
                # Calculate from quantity * rate
                item_total_cost_field = float(item_quantity) * float(item_per_unit_cost)
                base_cost = item_total_cost_field
            else:
                # Use sub-items cost
                base_cost = sub_items_base_cost
                item_total_cost_field = sub_items_base_cost

            # Get percentages and amounts from payload
            miscellaneous_percentage = item_data.get("miscellaneous_percentage", 0.0)
            overhead_percentage = item_data.get("overhead_percentage", 0.0)
            profit_margin_percentage = item_data.get("profit_margin_percentage", 0.0)
            discount_percentage = item_data.get("discount_percentage", 0.0)
            vat_percentage = item_data.get("vat_percentage", 0.0)

            # Check if amounts are provided in payload, if yes use them, else calculate
            if item_data.get("miscellaneous_amount") is not None:
                miscellaneous_amount = float(item_data.get("miscellaneous_amount"))
            else:
                miscellaneous_amount = (base_cost * float(miscellaneous_percentage)) / 100 if miscellaneous_percentage else 0.0

            cost_after_misc = base_cost + miscellaneous_amount

            # Overhead amount (separate from profit margin)
            if item_data.get("overhead_amount") is not None:
                overhead_amount = float(item_data.get("overhead_amount"))
            else:
                overhead_amount = (base_cost * float(overhead_percentage)) / 100 if overhead_percentage else 0.0

            # Profit margin amount (separate from overhead)
            if item_data.get("profit_margin_amount") is not None:
                profit_margin_amount = float(item_data.get("profit_margin_amount"))
            else:
                profit_margin_amount = (base_cost * float(profit_margin_percentage)) / 100 if profit_margin_percentage else 0.0

            # Total after adding overhead and profit
            total_cost = base_cost + miscellaneous_amount + profit_margin_amount
            selling_price_before_discount = total_cost

            # Discount amount
            if item_data.get("discount_amount") is not None:
                discount_amount = float(item_data.get("discount_amount"))
            else:
                discount_amount = (selling_price_before_discount * float(discount_percentage)) / 100 if discount_percentage else 0.0

            after_discount = selling_price_before_discount - discount_amount

            # VAT - Apply on the final amount after discount (based on after_discount amount)
            if item_data.get("vat_amount") is not None:
                # Use provided VAT amount
                vat_amount = float(item_data.get("vat_amount"))
            else:
                # Calculate VAT on after_discount amount
                vat_amount = (after_discount * float(vat_percentage)) / 100 if vat_percentage else 0.0

            final_selling_price = after_discount + vat_amount
            # Now add to master tables with calculated values (using ALL materials and labour)
            master_item_id, master_material_ids, master_labour_ids = add_to_master_tables(
                item_data.get("item_name"),
                item_data.get("description"),
                item_data.get("work_type", "contract"),
                all_materials,
                all_labour,
                created_by,
                miscellaneous_percentage,
                miscellaneous_amount,
                overhead_percentage,
                overhead_amount,
                profit_margin_percentage,
                profit_margin_amount,
                discount_percentage,
                discount_amount,
                vat_percentage,
                vat_amount,
                unit=item_unit,
                quantity=item_quantity,
                per_unit_cost=item_per_unit_cost,
                total_amount=item_total_amount,
                item_total_cost=item_total_cost_field
            )

            # Add sub-items to master tables (if any) and update processed_sub_items with master IDs
            master_sub_item_ids = []
            if sub_items:
                master_sub_item_ids = add_sub_items_to_master_tables(master_item_id, sub_items, created_by)

                # Add master_sub_item_id to each processed sub-item
                for idx, processed_sub_item in enumerate(processed_sub_items):
                    if idx < len(master_sub_item_ids):
                        processed_sub_item["master_sub_item_id"] = master_sub_item_ids[idx]
            # Check if item has sub_items structure (new format)
            has_sub_items = "sub_items" in item_data and item_data.get("sub_items")

            if has_sub_items:
                # NEW FORMAT: Process items with sub_items structure
                sub_items_list = []
                materials_count = 0
                labour_count = 0

                # Get item-level quantity and rate - THIS is the base for calculations!
                item_quantity = clean_numeric_value(item_data.get("quantity", 1.0))
                item_rate = clean_numeric_value(item_data.get("rate", 0.0))
                item_unit = item_data.get("unit", "nos")

                # Calculate item_total from item-level quantity × rate (NOT sub-items!)
                item_total = item_quantity * item_rate

                # Get item-level percentages
                # overhead_percentage is labeled as "Miscellaneous" in UI
                # profit_margin_percentage is labeled as "Overhead & Profit" in UI
                miscellaneous_percentage = clean_numeric_value(item_data.get("overhead_percentage", 10.0))
                overhead_profit_percentage = clean_numeric_value(item_data.get("profit_margin_percentage", 15.0))
                discount_percentage = clean_numeric_value(item_data.get("discount_percentage", 0.0))
                vat_percentage = clean_numeric_value(item_data.get("vat_percentage", 0.0))

                # Calculate ALL amounts based on item-level total (NOT sub-items!)
                total_miscellaneous_amount = (item_total * miscellaneous_percentage) / 100
                total_overhead_profit_amount = (item_total * overhead_profit_percentage) / 100
                total_subtotal = item_total + total_miscellaneous_amount + total_overhead_profit_amount
                total_discount_amount = (total_subtotal * discount_percentage) / 100 if discount_percentage > 0 else 0.0
                total_after_discount = total_subtotal - total_discount_amount
                total_vat_amount = (total_after_discount * vat_percentage) / 100 if vat_percentage > 0 else 0.0
                total_selling_price = total_after_discount + total_vat_amount

                for sub_item_data in item_data.get("sub_items", []):
                    # Get sub-item fields (just for material/labour breakdown)
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
                            "material_id": mat_data.get("material_id"),
                            "material_name": mat_data.get("material_name"),
                            "location": mat_data.get("location", ""),
                            "brand": mat_data.get("brand", ""),
                            "size": mat_data.get("size", ""),
                            "specification": mat_data.get("specification", ""),
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

                    # Create sub-item JSON (stores only material/labour breakdown, NOT pricing)
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

                # Add sub-items to master tables and get IDs
                master_sub_item_ids = add_sub_items_to_master_tables(master_item_id, item_data.get("sub_items", []), created_by)

                # Add sub_item_id to each sub-item in the list
                for idx, sub_item in enumerate(sub_items_list):
                    if idx < len(master_sub_item_ids):
                        sub_item["sub_item_id"] = master_sub_item_ids[idx]
                        sub_item["master_sub_item_id"] = master_sub_item_ids[idx]

                # Calculate total materials and labour costs from all sub-items
                total_materials_cost = sum(si.get("materials_cost", 0) for si in sub_items_list)
                total_labour_cost = sum(si.get("labour_cost", 0) for si in sub_items_list)
                base_cost = total_materials_cost + total_labour_cost

                # Create parent item with sub_items
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
                    "overhead_percentage": miscellaneous_percentage,  # Labeled as "Miscellaneous" in UI
                    "overhead_amount": total_miscellaneous_amount,
                    "profit_margin_percentage": overhead_profit_percentage,  # Labeled as "Overhead & Profit" in UI
                    "profit_margin_amount": total_overhead_profit_amount,
                    "subtotal": total_subtotal,
                    "discount_percentage": discount_percentage,
                    "discount_amount": total_discount_amount,
                    "vat_percentage": vat_percentage,
                    "vat_amount": total_vat_amount,
                    "after_discount": total_after_discount,
                    "total_materials": materials_count,
                    "total_labour": labour_count,
                    "totalMaterialCost": total_materials_cost,
                    "totalLabourCost": total_labour_cost,
                    "materials": item_materials,
                    "labour": item_labour
                }

                boq_items.append(item_json)
                total_boq_cost += total_selling_price
                total_materials += materials_count
                total_labour += labour_count

            else:
                # EXISTING FORMAT: Original flat structure (backwards compatible)
                materials_data = item_data.get("materials", [])
                labour_data = item_data.get("labour", [])

                # Get item-level fields (quantity, unit, rate) - CLEAN wrapped values
                item_quantity = clean_numeric_value(item_data.get("quantity", 1.0))
                item_unit = item_data.get("unit", "nos")
                item_rate = clean_numeric_value(item_data.get("rate", 0.0))

                # Calculate item total from quantity × rate
                item_total = item_quantity * item_rate

                # Use provided percentages from frontend - CLEAN wrapped values
                miscellaneous_percentage = clean_numeric_value(item_data.get("overhead_percentage", 10.0))
                profit_margin_percentage = clean_numeric_value(item_data.get("profit_margin_percentage", 15.0))

                # NEW CALCULATION: miscellaneous and profit margin are based on ITEM TOTAL (qty × rate), NOT subitems
                miscellaneous_amount = (item_total * miscellaneous_percentage) / 100
                profit_margin_amount = (item_total * profit_margin_percentage) / 100
                before_discount = item_total + miscellaneous_amount + profit_margin_amount

                # Handle discount after miscellaneous and overhead - CLEAN wrapped values
                discount_percentage = clean_numeric_value(item_data.get("discount_percentage", 0.0))
                discount_amount = 0.0
                after_discount = before_discount

                if discount_percentage > 0:
                    discount_amount = (before_discount * discount_percentage) / 100
                    after_discount = before_discount - discount_amount

                # Handle VAT on final amount - CLEAN wrapped values
                vat_percentage = clean_numeric_value(item_data.get("vat_percentage", 0.0))
                vat_amount = 0.0
                final_selling_price = after_discount

                if vat_percentage > 0:
                    vat_amount = (after_discount * vat_percentage) / 100
                    final_selling_price = after_discount + vat_amount

                # Also calculate sub-items cost for reference - CLEAN wrapped values
                materials_cost = 0
                for mat_data in materials_data:
                    quantity = clean_numeric_value(mat_data.get("quantity", 1.0))
                    unit_price = clean_numeric_value(mat_data.get("unit_price", 0.0))
                    materials_cost += quantity * unit_price

                labour_cost = 0
                for labour_data_item in labour_data:
                    hours = clean_numeric_value(labour_data_item.get("hours", 0.0))
                    rate_per_hour = clean_numeric_value(labour_data_item.get("rate_per_hour", 0.0))
                    labour_cost += hours * rate_per_hour

                sub_items_total = materials_cost + labour_cost

                # Now add to master tables with calculated values
                master_item_id, master_material_ids, master_labour_ids = add_to_master_tables(
                    item_data.get("item_name"),
                    item_data.get("description"),
                    item_data.get("work_type", "contract"),
                    materials_data,
                    labour_data,
                    created_by,
                    miscellaneous_percentage,
                    miscellaneous_amount,
                    miscellaneous_percentage,  # overhead_percentage = miscellaneous
                    miscellaneous_amount,  # overhead_amount = miscellaneous
                    profit_margin_percentage,
                    profit_margin_amount
                )

                # Process materials for BOQ details (from all_materials with master IDs) - CLEAN wrapped values
                item_materials = []
                for i, mat_data in enumerate(all_materials):
                    quantity = clean_numeric_value(mat_data.get("quantity", 1.0))
                    unit_price = clean_numeric_value(mat_data.get("unit_price", 0.0))
                    total_price = quantity * unit_price
                    vat_pct = clean_numeric_value(mat_data.get("vat_percentage", 0.0))

                    item_materials.append({
                        "master_material_id": master_material_ids[i] if i < len(master_material_ids) else None,
                        "material_name": mat_data.get("material_name"),
                    "location": mat_data.get("location", ""),
                    "brand": mat_data.get("brand", ""),
                        "size": mat_data.get("size", ""),
                        "specification": mat_data.get("specification", ""),
                        "description": mat_data.get("description", ""),
                        "quantity": quantity,
                        "unit": mat_data.get("unit", "nos"),
                        "unit_price": unit_price,
                        "total_price": total_price,
                        "vat_percentage": vat_pct
                    })

                # Process labour for BOQ details (from all_labour with master IDs) - CLEAN wrapped values
                item_labour = []
                for i, labour_data_item in enumerate(all_labour):
                    hours = clean_numeric_value(labour_data_item.get("hours", 0.0))
                    rate_per_hour = clean_numeric_value(labour_data_item.get("rate_per_hour", 0.0))
                    total_cost_labour = hours * rate_per_hour

                    item_labour.append({
                        "master_labour_id": master_labour_ids[i] if i < len(master_labour_ids) else None,
                        "labour_role": labour_data_item.get("labour_role"),
                        "hours": hours,
                        "rate_per_hour": rate_per_hour,
                        "total_cost": total_cost_labour
                    })

        # Get preliminaries from request data
        from models.preliminary_master import BOQPreliminary

        preliminaries = data.get("preliminaries", {})
        preliminary_id = None

        # Prepare preliminary selections to save to boq_preliminaries junction table
        preliminary_selections_to_save = []
        if preliminaries and preliminaries.get('items'):
            preliminary_items = preliminaries.get('items', [])
            log.info(f"Processing {len(preliminary_items)} preliminary items from request")

            for item in preliminary_items:
                prelim_id = item.get('prelim_id')
                is_checked = item.get('checked', False) or item.get('selected', False)
                is_custom = item.get('isCustom', False)

                log.info(f"Preliminary item: prelim_id={prelim_id}, checked={is_checked}, isCustom={is_custom}, item={item}")

                # Handle edited master preliminaries - update the master record
                if prelim_id and not is_custom:
                    description = item.get('description', '')
                    if description:
                        # Check if description was changed from master
                        from models.preliminary_master import PreliminaryMaster
                        master_prelim = PreliminaryMaster.query.get(prelim_id)
                        if master_prelim and master_prelim.description != description:
                            # Update the master preliminary description
                            master_prelim.description = description
                            master_prelim.updated_by = 'Estimator'
                            log.info(f"[CREATE_BOQ] Updated master preliminary: prelim_id={prelim_id}, new description={description}")

                # Handle custom preliminaries - create new row in preliminaries_master
                if is_custom and not prelim_id:
                    from models.preliminary_master import PreliminaryMaster
                    description = item.get('description', '')
                    name = item.get('name', description[:50] if description else 'Custom Item')

                    if description:  # Only create if there's a description
                        # Check if this custom preliminary already exists (by description)
                        existing_custom = PreliminaryMaster.query.filter_by(
                            description=description,
                            created_by='Estimator'
                        ).first()

                        if existing_custom:
                            prelim_id = existing_custom.prelim_id
                            log.info(f"[CREATE_BOQ] Found existing custom preliminary: prelim_id={prelim_id}")
                        else:
                            # Create new custom preliminary in master table
                            new_custom_prelim = PreliminaryMaster(
                                name=name,
                                description=description,
                                unit='nos',
                                rate=0,
                                is_active=True,
                                display_order=9999,  # Custom items appear at the end
                                created_by='Estimator',
                                updated_by='Estimator'
                            )
                            db.session.add(new_custom_prelim)
                            db.session.flush()  # Get the prelim_id
                            prelim_id = new_custom_prelim.prelim_id
                            log.info(f"[CREATE_BOQ] Created new custom preliminary: prelim_id={prelim_id}, description={description}")

                if prelim_id:
                    preliminary_selections_to_save.append({
                        'prelim_id': prelim_id,
                        'is_checked': is_checked
                    })

            log.info(f"Prepared {len(preliminary_selections_to_save)} preliminary selections for saving: {preliminary_selections_to_save}")

        # Apply BOQ-level discount to total
        boq_discount_percentage = data.get("discount_percentage", 0) or 0
        boq_discount_amount = data.get("discount_amount", 0) or 0

        # Get preliminary amount to include in discount calculation
        preliminary_amount = preliminaries.get('cost_details', {}).get('amount', 0) if preliminaries else 0

        # Combined subtotal = items total + preliminary amount
        combined_subtotal = total_boq_cost + preliminary_amount

        # Calculate discount amount if only percentage is provided
        # Discount should be calculated on combined subtotal (items + preliminaries)
        if boq_discount_amount == 0 and boq_discount_percentage > 0 and combined_subtotal > 0:
            boq_discount_amount = combined_subtotal * (boq_discount_percentage / 100)

        # Apply BOQ-level discount to get final total
        final_boq_cost = combined_subtotal - boq_discount_amount if boq_discount_amount > 0 else combined_subtotal

        log.info(f"BOQ {boq.boq_id} create totals - Items: {total_boq_cost}, Preliminaries: {preliminary_amount}, Combined: {combined_subtotal}, Discount: {boq_discount_amount} ({boq_discount_percentage}%), Final: {final_boq_cost}")

        # Calculate total negotiable margin from all sub-items
        total_negotiable_margin = 0.0
        total_planned_profit = 0.0
        total_misc_amount = 0.0
        total_overhead_profit_amount = 0.0
        total_transport_amount = 0.0

        for item in boq_items:
            if item.get("has_sub_items") and item.get("sub_items"):
                for sub_item in item["sub_items"]:
                    total_negotiable_margin += sub_item.get("negotiable_margin", 0.0)
                    total_planned_profit += sub_item.get("planned_profit", 0.0)
                    total_misc_amount += sub_item.get("misc_amount", 0.0)
                    total_overhead_profit_amount += sub_item.get("overhead_profit_amount", 0.0)
                    total_transport_amount += sub_item.get("transport_amount", 0.0)

        log.info(f"BOQ {boq.boq_id} profit breakdown - Negotiable Margin: {total_negotiable_margin}, Planned Profit (O&P): {total_planned_profit}, Misc: {total_misc_amount}, Transport: {total_transport_amount}")

        # Create BOQ details JSON (without terms - stored in junction table)
        boq_details_json = {
            "boq_id": boq.boq_id,
            "preliminaries": preliminaries,
            "preliminary_id": preliminary_id,  # Reference to preliminaries table
            "discount_percentage": boq_discount_percentage,
            "discount_amount": boq_discount_amount,
            "items": boq_items,
            "summary": {
                "total_items": len(boq_items),
                "total_materials": total_materials,
                "total_labour": total_labour,
                "total_material_cost": sum(item["totalMaterialCost"] for item in boq_items),
                "total_labour_cost": sum(item["totalLabourCost"] for item in boq_items),
                "total_cost": final_boq_cost,
                "selling_price": final_boq_cost,
                "estimatedSellingPrice": final_boq_cost,
                "actual_profit": round(total_negotiable_margin, 2),
                "negotiable_margin": round(total_negotiable_margin, 2),
                "planned_profit": round(total_planned_profit, 2),
                "total_misc": round(total_misc_amount, 2),
                "total_overhead_profit": round(total_overhead_profit_amount, 2),
                "total_transport": round(total_transport_amount, 2)
            }
        }

        # Save BOQ details
        boq_details = BOQDetails(
            boq_id=boq.boq_id,
            boq_details=boq_details_json,
            total_cost=final_boq_cost,
            total_items=len(boq_items),
            total_materials=total_materials,
            total_labour=total_labour,
            created_by=created_by
        )
        db.session.add(boq_details)
        db.session.flush()  # Flush to get IDs

        # Save preliminary selections to boq_preliminaries junction table
        if preliminary_selections_to_save:
            for selection in preliminary_selections_to_save:
                boq_prelim = BOQPreliminary(
                    boq_id=boq.boq_id,
                    prelim_id=selection['prelim_id'],
                    is_checked=selection['is_checked']
                )
                db.session.add(boq_prelim)

            log.info(f"Saved {len(preliminary_selections_to_save)} preliminary selections to boq_preliminaries for BOQ {boq.boq_id}")

        # Save terms & conditions selections to boq_terms_selections junction table
        terms_conditions = data.get("terms_conditions", [])
        log.info(f"Received terms_conditions payload: {len(terms_conditions) if terms_conditions else 0} terms")

        if terms_conditions and isinstance(terms_conditions, list):
            from sqlalchemy import text
            for term in terms_conditions:
                term_id = term.get('term_id')
                is_checked = term.get('checked', False)

                if term_id:  # Only save if it has a term_id (from master table)
                    # Insert or update term selection
                    db.session.execute(text("""
                        INSERT INTO boq_terms_selections (boq_id, term_id, is_checked, created_at, updated_at)
                        VALUES (:boq_id, :term_id, :is_checked, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        ON CONFLICT (boq_id, term_id)
                        DO UPDATE SET is_checked = :is_checked, updated_at = CURRENT_TIMESTAMP
                    """), {
                        'boq_id': boq.boq_id,
                        'term_id': term_id,
                        'is_checked': is_checked
                    })

            log.info(f"✅ Saved terms selections to boq_terms_selections for BOQ {boq.boq_id}")
        else:
            log.warning(f"No terms_conditions in payload for BOQ {boq.boq_id}")

        db.session.commit()

        log.info(f"BOQ {boq.boq_id} created successfully with {len(boq_items)} items and {len(preliminary_selections_to_save)} preliminary selections")

        return jsonify({
            "message": "BOQ created successfully",
            "boq": {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "project_id": boq.project_id,
                "status": boq.status,
                "total_cost": total_boq_cost,
                "items_count": len(boq_items),
                "materials_count": total_materials,
                "labour_count": total_labour,
                "selling_price": total_boq_cost,
                "estimatedSellingPrice": total_boq_cost
            }
        }), 201

    except SQLAlchemyError as e:
        db.session.rollback()
        log.error(f"Database error creating BOQ: {str(e)}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating BOQ: {str(e)}")
        return jsonify({"error": f"Error: {str(e)}"}), 500

def get_boq(boq_id):
    """Get BOQ details from JSON storage with existing and new purchases separated"""
    try:
        boq = BOQ.query.filter_by(boq_id=boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Get BOQ details from JSON
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Get current user for role-based access control
        # Support admin viewing as another role
        current_user = getattr(g, 'user', None)
        user_role = ''
        user_role_id = None
        actual_role = ''

        if current_user:
            # Get the actual role from JWT
            role_name = current_user.get('role') or current_user.get('role_name', '')
            actual_role = role_name.lower().replace(' ', '').replace('_', '') if isinstance(role_name, str) else ''
            user_role_id = current_user.get('role_id')

            # Check if admin is viewing as another role
            context = get_effective_user_context()
            effective_role = context.get('effective_role', actual_role)

            # Use effective role for access control (handles admin viewing as PM)
            user_role = effective_role.lower().replace(' ', '').replace('_', '') if isinstance(effective_role, str) else ''

            log.info(f"BOQ {boq_id} - User access: actual_role='{actual_role}', effective_role='{user_role}', is_admin_viewing={context.get('is_admin_viewing', False)}")
        # Fetch project details
        project = Project.query.filter_by(project_id=boq.project_id).first()
        # Get BOQ history to track which items were added via new_purchase
        boq_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.asc()).all()
        # Track newly added items using master_item_id and item_name from history
        new_purchase_item_ids = set()  # Track by master_item_id
        new_purchase_item_names = set()  # Track by item_name as fallback
        original_item_count = 0

        for history in boq_history:
            if history.action:
                actions = history.action if isinstance(history.action, list) else [history.action]
                for action in actions:
                    if isinstance(action, dict):
                        action_type = action.get("type")
                        if action_type == "add_new_purchase":
                            # Get item identifiers from history (new minimal format)
                            item_identifiers = action.get("item_identifiers", [])

                            # If item_identifiers exists (new minimal format), use it
                            if item_identifiers:
                                for identifier in item_identifiers:
                                    master_item_id = identifier.get("master_item_id")
                                    item_name = identifier.get("item_name")

                                    if master_item_id:
                                        new_purchase_item_ids.add(master_item_id)
                                    if item_name:
                                        new_purchase_item_names.add(item_name)
                            else:
                                # Fallback to old formats for backward compatibility
                                # Try items_details first (medium format)
                                items_details = action.get("items_details", [])
                                if items_details:
                                    for item_detail in items_details:
                                        master_item_id = item_detail.get("master_item_id")
                                        item_name = item_detail.get("item_name")

                                        if master_item_id:
                                            new_purchase_item_ids.add(master_item_id)
                                        if item_name:
                                            new_purchase_item_names.add(item_name)
                                else:
                                    # Fallback to items_added (old format)
                                    items_added = action.get("items_added", [])
                                    for item_info in items_added:
                                        item_name = item_info.get("item_name")
                                        if item_name:
                                            new_purchase_item_names.add(item_name)

        # Get all items from BOQ details
        all_items = []
        if boq_details.boq_details and "items" in boq_details.boq_details:
            all_items = boq_details.boq_details["items"]
        # If no history of new purchases, determine original items count from first creation
        if not new_purchase_item_ids and not new_purchase_item_names and boq_history:
            # Find the creation action to determine original item count
            for history in boq_history:
                if history.action:
                    actions = history.action if isinstance(history.action, list) else [history.action]
                    for action in actions:
                        if isinstance(action, dict) and action.get("type") in ["boq_created", "created"]:
                            original_item_count = action.get("items_count", len(all_items))
                            break
                if original_item_count > 0:
                    break

        # Separate existing and new purchases
        existing_purchase_items = []
        new_add_purchase_items = []

        for idx, item in enumerate(all_items):
            master_item_id = item.get("master_item_id")
            item_name = item.get("item_name")
            is_new_purchase = False

            # Check if item is a new purchase
            # Priority 0: Check if item has is_extra_purchase flag (from approved change requests)
            if item.get("is_extra_purchase"):
                is_new_purchase = True
            # Priority 1: Match by master_item_id (most reliable)
            elif master_item_id and master_item_id in new_purchase_item_ids:
                is_new_purchase = True
            # Priority 2: Match by item_name (fallback)
            elif item_name and item_name in new_purchase_item_names:
                is_new_purchase = True
            # Priority 3: Use original item count position
            elif not new_purchase_item_ids and not new_purchase_item_names and original_item_count > 0:
                if idx >= original_item_count:
                    is_new_purchase = True

            # Ensure purchase_tracking exists in item
            if "purchase_tracking" not in item:
                item["purchase_tracking"] = {
                    "total_purchased_amount": 0.0,
                    "purchased_materials": []
                }

            # Add to appropriate list
            if is_new_purchase:
                new_add_purchase_items.append(item)
            else:
                existing_purchase_items.append(item)

        # Calculate summary for existing purchases
        existing_material_cost = 0
        existing_labour_cost = 0
        existing_materials_count = 0
        existing_labour_count = 0
        existing_total_cost = 0

        for item in existing_purchase_items:
            existing_total_cost += item.get("selling_price", 0)
            existing_material_cost += item.get("totalMaterialCost", 0)
            existing_labour_cost += item.get("totalLabourCost", 0)
            existing_materials_count += len(item.get("materials", []))
            existing_labour_count += len(item.get("labour", []))
        # Calculate summary for new purchases
        new_material_cost = 0
        new_labour_cost = 0
        new_materials_count = 0
        new_labour_count = 0
        new_total_cost = 0

        for item in new_add_purchase_items:
            new_total_cost += item.get("selling_price", 0)
            new_material_cost += item.get("totalMaterialCost", 0)
            new_labour_cost += item.get("totalLabourCost", 0)
            new_materials_count += len(item.get("materials", []))
            new_labour_count += len(item.get("labour", []))
        # Role-based access control for new purchase items
        # Determine if user can view new purchase details based on status and role
        # Admin always has access (both direct admin and admin viewing as another role)
        can_view_new_purchase = False
        boq_status = boq.status.lower() if boq.status else ''

        # Admin has full access
        if actual_role == 'admin':
            can_view_new_purchase = True
            log.info(f"BOQ {boq_id} - Admin access GRANTED for status '{boq_status}'")
        elif boq_status in ['new_purchase_create', 'sent_for_review']:
            # Only Project Manager can view when purchase is created or sent for review
            if user_role in ['projectmanager', 'project_manager']:
                can_view_new_purchase = True
            else:
                log.info(f"BOQ {boq_id} - Access DENIED: Only PM can view '{boq_status}', current role: '{user_role}'")
        elif boq_status in ['add_new_purchase', 'new_purchase_request']:
            # Estimator and Project Manager can view
            if user_role in ['estimator', 'projectmanager', 'project_manager']:
                can_view_new_purchase = True
            else:
                log.info(f"BOQ {boq_id} - Access DENIED: Only Estimator/PM can view '{boq_status}', current role: '{user_role}'")
        elif boq_status == 'new_purchase_approved':
            # All roles can view when new purchase is approved
            can_view_new_purchase = True
        elif boq_status == 'new_purchase_rejected':
            # Only Project Manager can view when new purchase is rejected
            if user_role in ['projectmanager', 'project_manager']:
                can_view_new_purchase = True
            else:
                log.info(f"BOQ {boq_id} - Access DENIED: Only PM can view 'new_purchase_rejected', current role: '{user_role}'")
        else:
            log.info(f"BOQ {boq_id} - Access DENIED: Unknown status '{boq_status}'")

        # Filter new purchase items based on access control
        filtered_new_purchase_items = []
        filtered_new_total_cost = 0
        filtered_new_material_cost = 0
        filtered_new_labour_cost = 0
        filtered_new_materials_count = 0
        filtered_new_labour_count = 0

        if can_view_new_purchase:
            # User has permission to view new purchases
            filtered_new_purchase_items = new_add_purchase_items
            filtered_new_total_cost = new_total_cost
            filtered_new_material_cost = new_material_cost
            filtered_new_labour_cost = new_labour_cost
            filtered_new_materials_count = new_materials_count
            filtered_new_labour_count = new_labour_count

        # Process items with purchase_tracking and add them to new_purchase.items
        # BUT only if user has permission to view (can_view_new_purchase)
        new_purchase_items_with_tracking = []
        new_purchase_total_materials_count = 0
        new_purchase_total_labour_count = 0
        new_purchase_total_material_cost = 0.0
        new_purchase_total_labour_cost = 0.0
        new_purchase_total_cost = 0.0

        # Calculate total purchased amounts (all purchases, not just latest)
        total_all_purchased_amount = 0.0
        existing_purchased_amount = 0.0

        for item in all_items:
            purchase_tracking = item.get("purchase_tracking", {})
            total_all_purchased_amount += purchase_tracking.get("total_purchased_amount", 0.0)

        if can_view_new_purchase:
            # Get the LATEST add_new_purchase action timestamp from BOQ history
            latest_purchase_action_date = None
            for history in boq_history:
                if history.action:
                    actions = history.action if isinstance(history.action, list) else [history.action]
                    for action in actions:
                        if isinstance(action, dict) and action.get("type") == "add_new_purchase":
                            action_timestamp = action.get("timestamp")
                            if action_timestamp:
                                try:
                                    action_date = datetime.fromisoformat(action_timestamp)
                                    if latest_purchase_action_date is None or action_date > latest_purchase_action_date:
                                        latest_purchase_action_date = action_date
                                except:
                                    pass

            # Process items with purchase_tracking and add them to new purchase items
            if latest_purchase_action_date:
                for item in all_items:
                    purchase_tracking = item.get("purchase_tracking", {})
                    purchased_materials = purchase_tracking.get("purchased_materials", [])

                    if purchased_materials:
                        # Collect only the LATEST purchased materials (from most recent add_new_purchase)
                        latest_materials = []
                        earlier_materials = []

                        for material in purchased_materials:
                            purchase_date_str = material.get("purchase_date")
                            if purchase_date_str:
                                try:
                                    purchase_date = datetime.fromisoformat(purchase_date_str)
                                    # Check if this material was purchased during the latest add_new_purchase action
                                    time_diff = abs((purchase_date - latest_purchase_action_date).total_seconds())
                                    if time_diff <= 60:  # Within 1 minute
                                        latest_materials.append(material)
                                    else:
                                        earlier_materials.append(material)
                                except:
                                    earlier_materials.append(material)

                        # Calculate existing purchase amount (purchased before latest action)
                        existing_purchased_amount += sum(mat.get("total_price", 0) for mat in earlier_materials)

                        # If there are latest materials, create a simple purchase entry
                        if latest_materials:
                            # Calculate totals for this purchase
                            new_materials_total = sum(mat.get("total_price", 0) for mat in latest_materials)

                            new_purchase_items_with_tracking.append({
                                "master_item_id": item.get("master_item_id"),
                                "item_name": item.get("item_name"),
                                "description": item.get("description"),
                                "materials": latest_materials,
                                "total_purchased_amount": new_materials_total
                            })

                            new_purchase_total_materials_count += len(latest_materials)
                            new_purchase_total_material_cost += new_materials_total
                            new_purchase_total_cost += new_materials_total

        # Remove purchase_tracking from existing_purchase items (keep all items)
        for item in existing_purchase_items:
            # Remove purchase_tracking completely from existing purchase items
            if "purchase_tracking" in item:
                del item["purchase_tracking"]

        # Fetch sub_item_image from database for all items (both existing and new)
        # Also track if we need to update the database with recovered IDs
        from models.boq import MasterSubItem, MasterItem
        ids_were_recovered = False

        for item in existing_purchase_items + new_add_purchase_items:
            sub_items = item.get("sub_items", [])
            for sub_item in sub_items:
                sub_item_id = sub_item.get("sub_item_id") or sub_item.get("master_sub_item_id")
                master_sub_item = None

                if sub_item_id:
                    # Query database for sub_item_image using ID
                    master_sub_item = MasterSubItem.query.filter_by(sub_item_id=sub_item_id).first()
                else:
                    # Fallback: Try to find by item_name and sub_item_name (for BOQs that lost their IDs)
                    item_name = item.get("item_name")
                    sub_item_name = sub_item.get("sub_item_name")

                    if item_name and sub_item_name:
                        # First find the master item
                        master_item = MasterItem.query.filter_by(item_name=item_name).first()
                        if master_item:
                            # Then find the sub-item by item_id and sub_item_name
                            master_sub_item = MasterSubItem.query.filter_by(
                                item_id=master_item.item_id,
                                sub_item_name=sub_item_name
                            ).first()

                            # If found, add the ID back to the JSON for future use
                            if master_sub_item:
                                sub_item["sub_item_id"] = master_sub_item.sub_item_id
                                sub_item["master_sub_item_id"] = master_sub_item.sub_item_id
                                ids_were_recovered = True
                                log.info(f"Recovered sub_item_id {master_sub_item.sub_item_id} for '{sub_item_name}' in item '{item_name}'")

                # Add images if found
                if master_sub_item and master_sub_item.sub_item_image:
                    sub_item["sub_item_image"] = master_sub_item.sub_item_image

        # If we recovered any IDs, persist them back to the database
        if ids_were_recovered:
            try:
                log.info(f"Persisting recovered sub_item_ids back to BOQDetails for BOQ {boq_id}")
                # Update the existing_purchase items in boq_details with recovered IDs
                boq_details.boq_details["items"] = existing_purchase_items + new_add_purchase_items
                db.session.add(boq_details)
                db.session.commit()
                log.info(f"Successfully persisted recovered sub_item_ids for BOQ {boq_id}")
            except Exception as e:
                log.error(f"Failed to persist recovered sub_item_ids for BOQ {boq_id}: {str(e)}")
                db.session.rollback()

        # Calculate combined totals (with filtered new purchases)
        total_material_cost = existing_material_cost + filtered_new_material_cost
        total_labour_cost = existing_labour_cost + filtered_new_labour_cost
        total_cost = existing_total_cost + filtered_new_total_cost
        overhead_percentage = 0
        profit_margin = 0

        # Get overhead and profit from summary or first item
        if boq_details.boq_details and "summary" in boq_details.boq_details:
            summary = boq_details.boq_details["summary"]
            overhead_percentage = summary.get("overhead_percentage", 0) or summary.get("overhead", 0)
            profit_margin = summary.get("profit_margin_percentage", 0) or summary.get("profit_margin", 0)

        # Fallback: Get from first item if not in summary
        if (overhead_percentage == 0 or profit_margin == 0) and all_items:
            for item in all_items:
                if overhead_percentage == 0:
                    overhead_percentage = item.get("overhead_percentage", 0)
                if profit_margin == 0:
                    profit_margin = item.get("profit_margin_percentage", 0) or item.get("profit_margin", 0)
                if overhead_percentage > 0 and profit_margin > 0:
                    break

        # Determine display status for Technical Director
        display_status = boq.status
        if boq.status == "new_purchase_approved" and user_role in ['technicaldirector', 'technical_director']:
            display_status = "approved"

        # Get preliminaries from NEW boq_preliminaries junction table
        from models.preliminary_master import BOQPreliminary, PreliminaryMaster

        preliminaries = {}
        try:
            # Fetch selected preliminaries for this BOQ
            boq_prelims = db.session.query(
                BOQPreliminary, PreliminaryMaster
            ).join(
                PreliminaryMaster, BOQPreliminary.prelim_id == PreliminaryMaster.prelim_id
            ).filter(
                BOQPreliminary.boq_id == boq.boq_id,
                BOQPreliminary.is_checked == True
            ).order_by(PreliminaryMaster.display_order.asc()).all()

            # Build preliminaries data with selected items (both master and custom)
            items = []
            for boq_prelim, prelim_master in boq_prelims:
                # Mark as custom if display_order is 9999 (our custom indicator)
                is_custom = prelim_master.display_order == 9999

                items.append({
                    'id': f'prelim-{prelim_master.prelim_id}',
                    'prelim_id': prelim_master.prelim_id,
                    'description': prelim_master.description,
                    'name': prelim_master.name,
                    'checked': True,
                    'selected': True,
                    'isCustom': is_custom
                })

            # Get cost details and notes from JSON
            stored_preliminaries = boq_details.boq_details.get("preliminaries", {}) if boq_details.boq_details else {}

            preliminaries = {
                'items': items,
                'cost_details': stored_preliminaries.get("cost_details", {}),
                'notes': stored_preliminaries.get("notes", "")
            }

            custom_count = len([i for i in items if i.get('isCustom')])
            master_count = len(items) - custom_count
            log.info(f"Retrieved {len(items)} preliminaries ({master_count} master + {custom_count} custom) for BOQ {boq.boq_id}")
        except Exception as e:
            log.error(f"Error fetching preliminaries for BOQ {boq.boq_id}: {str(e)}")
            # Fallback to empty
            preliminaries = {'items': [], 'cost_details': {}, 'notes': ''}

        # Get discount values from boq_details JSON
        discount_percentage = boq_details.boq_details.get("discount_percentage", 0) if boq_details.boq_details else 0
        discount_amount = boq_details.boq_details.get("discount_amount", 0) if boq_details.boq_details else 0

        # Get terms & conditions from boq_terms_selections junction table using JOIN
        try:
            from sqlalchemy import text
            # Query to join boq_terms_selections with boq_terms to get term details
            query = text("""
                SELECT
                    bt.term_id,
                    bt.terms_text,
                    bt.display_order,
                    bts.is_checked,
                    bts.id as selection_id
                FROM boq_terms_selections bts
                INNER JOIN boq_terms bt ON bts.term_id = bt.term_id
                WHERE bts.boq_id = :boq_id
                AND bt.is_active = TRUE AND bt.is_deleted = FALSE
                ORDER BY bt.display_order, bt.term_id
            """)

            terms_result = db.session.execute(query, {'boq_id': boq_id})
            terms_items = []

            for row in terms_result:
                terms_items.append({
                    'id': f'term-{row[0]}',
                    'term_id': row[0],
                    'terms_text': row[1],
                    'display_order': row[2],
                    'checked': row[3],
                    'isCustom': False
                })

            terms_conditions = {'items': terms_items}
            log.info(f"Retrieved {len(terms_items)} terms from boq_terms_selections for BOQ {boq.boq_id}")
        except Exception as e:
            log.error(f"Error fetching terms for BOQ {boq.boq_id}: {str(e)}")
            terms_conditions = {'items': []}

        # Build response with project details
        response_data = {
            "boq_id": boq.boq_id,
            "boq_name": boq.boq_name,
            "project_id": boq.project_id,
            "status": display_status,
            "email_sent": boq.email_sent,
            "created_at": boq.created_at.isoformat() if boq.created_at else None,
            "created_by": boq.created_by,
            "user_id": project.user_id if project else None,
            "discount_percentage": discount_percentage,
            "discount_amount": discount_amount,
            "preliminaries": preliminaries,
            "terms_conditions": terms_conditions,
            "project_details": {
                "project_name": project.project_name if project else None,
                "location": project.location if project else None,
                "floor": project.floor_name if project else None,
                "hours": project.working_hours if project else None,
                "status": project.status if project else None,
                "start_date": project.start_date.isoformat() if project and project.start_date else None,
                "end_date": project.end_date.isoformat() if project and project.end_date else None,
                "duration_days": project.duration_days if project else None
            },
            "existing_purchase": {
                "items": existing_purchase_items,
                "summary": {
                    "total_items": len(existing_purchase_items),
                    "total_materials": existing_materials_count,
                    "total_labour": existing_labour_count,
                    "total_material_cost": existing_material_cost,
                    "total_labour_cost": existing_labour_cost,
                    "total_cost": existing_total_cost,
                    "selling_price": existing_total_cost,
                    "estimatedSellingPrice": existing_total_cost
                }
            },
            "new_purchase": {
                "items": new_purchase_items_with_tracking,
                "summary": {
                    "total_items": len(new_purchase_items_with_tracking),
                    "total_materials": new_purchase_total_materials_count,
                    "total_material_cost": new_purchase_total_material_cost,
                    "total_cost": new_purchase_total_cost,
                    "selling_price": new_purchase_total_cost,
                    "estimatedSellingPrice": new_purchase_total_cost
                },
                "access_info": {
                    "can_view": can_view_new_purchase,
                    "user_role": user_role,
                    "boq_status": boq.status
                }
            },
            "combined_summary": {
                "total_items": len(existing_purchase_items),
                "total_materials": existing_materials_count + new_purchase_total_materials_count,
                "total_labour": existing_labour_count,
                "total_item_amount": existing_total_cost,  # Total amount from existing BOQ items
                "total_material_cost": existing_material_cost,
                "total_labour_cost": existing_labour_cost,
                "existing_purchase_amount": existing_purchased_amount,  # Materials purchased before latest action
                "new_purchase_amount": new_purchase_total_cost,  # Materials from latest purchase
                "total_purchased_amount": total_all_purchased_amount,  # Sum of all purchases
                "balance_amount": existing_total_cost - total_all_purchased_amount,  # Remaining to be purchased
                "total_cost": existing_total_cost,
                "selling_price": existing_total_cost,
                "estimatedSellingPrice": existing_total_cost
            },
            "total_material_cost": total_material_cost,
            "total_labour_cost": total_labour_cost,
            "overhead_percentage": overhead_percentage,
            "profit_margin": profit_margin,
            "profit_margin_percentage": profit_margin
        }

        # Add change request materials tracking (if any)
        try:
            from models.change_request import ChangeRequest

            # Get approved and completed change requests for this BOQ
            approved_change_requests = ChangeRequest.query.filter(
                ChangeRequest.boq_id == boq_id,
                ChangeRequest.status.in_(['approved', 'purchase_completed', 'assigned_to_buyer']),
                ChangeRequest.is_deleted == False
            ).order_by(ChangeRequest.approval_date.desc()).all()

            if approved_change_requests:
                change_request_items = []
                total_cr_materials_cost = 0
                total_cr_overhead_consumed = 0

                for cr in approved_change_requests:
                    cr_materials = cr.materials_data or []

                    change_request_items.append({
                        'cr_id': cr.cr_id,
                        'requested_by': cr.requested_by_name,
                        'request_date': cr.created_at.isoformat() if cr.created_at else None,
                        'approval_date': cr.approval_date.isoformat() if cr.approval_date else None,
                        'justification': cr.justification,
                        'materials': cr_materials,
                        'materials_cost': cr.materials_total_cost,
                        'overhead_consumed': cr.overhead_consumed,
                        'is_over_budget': cr.is_over_budget
                    })

                    total_cr_materials_cost += cr.materials_total_cost or 0
                    total_cr_overhead_consumed += cr.overhead_consumed or 0

                # Calculate overhead budget tracking
                original_overhead_allocated = (existing_total_cost * overhead_percentage) / (100 + overhead_percentage + profit_margin) * overhead_percentage if overhead_percentage > 0 else 0
                overhead_remaining = original_overhead_allocated - total_cr_overhead_consumed

                response_data['change_requests'] = {
                    'items': change_request_items,
                    'summary': {
                        'total_requests': len(approved_change_requests),
                        'total_materials_cost': round(total_cr_materials_cost, 2),
                        'total_overhead_consumed': round(total_cr_overhead_consumed, 2)
                    }
                }

                response_data['overhead_tracking'] = {
                    'original_allocated': round(original_overhead_allocated, 2),
                    'consumed_by_extra_materials': round(total_cr_overhead_consumed, 2),
                    'remaining': round(overhead_remaining, 2),
                    'is_over_budget': overhead_remaining < 0,
                    'balance_type': 'negative' if overhead_remaining < 0 else 'positive',
                    'percentage': round(overhead_percentage, 2)
                }
        except Exception as e:
            # Don't fail the entire request if change request data fails
            pass

        return jsonify(response_data), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error fetching BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_all_boq():
    """Get all BOQs with their details from JSON storage"""
    try:
         # Get current logged-in user
        current_user = getattr(g, 'user', None)
        user_id = current_user.get('user_id') if current_user else None
        user_role = current_user.get('role', '').lower() if current_user else ''

        # Get effective user context (handles admin viewing as other roles)
        context = get_effective_user_context()

        # Build base query with optimized ordering (most recent first)
        query = (
            db.session.query(BOQ, Project)
            .join(Project, BOQ.project_id == Project.project_id)
            .filter(BOQ.is_deleted == False)
            .filter(Project.is_deleted == False)
            .order_by(BOQ.created_at.desc())  # Most recent first
        )

        # Role-based filtering for BOQs
        if user_role != 'admin' and should_apply_role_filter(context):
            if user_role in ['projectmanager', 'project_manager']:
                # Project Manager sees only BOQs from their assigned projects
                query = query.filter(Project.user_id == user_id)
                log.info(f"PM {user_id} - filtering BOQs by assigned projects")
            elif user_role == 'estimator':
                # Estimator sees BOQs for their assigned projects OR projects with no estimator (backward compatibility)
                query = query.filter(
                    or_(
                        Project.estimator_id == user_id,
                        Project.estimator_id == None
                    )
                )
            elif user_role in ['siteengineer', 'site_engineer', 'sitesupervisor', 'site_supervisor']:
                # Site Engineer/Supervisor sees BOQs from their assigned projects
                query = query.filter(Project.site_supervisor_id == user_id)
                log.info(f"SE/SS {user_id} - filtering BOQs by assigned projects")
            elif user_role == 'buyer':
                # Buyer sees BOQs from their assigned projects
                query = query.filter(Project.buyer_id == user_id)
                log.info(f"Buyer {user_id} - filtering BOQs by assigned projects")

        boqs = query.all()
        log.info(f"📊 Processing {len(boqs)} BOQs for user {user_id} (role: {user_role})")

        # OPTIMIZATION: Fetch all BOQ histories at once to avoid N+1 queries
        boq_ids = [boq.boq_id for boq, _ in boqs]
        all_histories = BOQHistory.query.filter(BOQHistory.boq_id.in_(boq_ids)).order_by(BOQHistory.boq_id, BOQHistory.created_at.desc()).all() if boq_ids else []

        # Group histories by boq_id for quick lookup
        history_by_boq = {}
        for hist in all_histories:
            if hist.boq_id not in history_by_boq:
                history_by_boq[hist.boq_id] = []
            history_by_boq[hist.boq_id].append(hist)

        log.info(f"⚡ Loaded {len(all_histories)} history records for {len(boq_ids)} BOQs")

        # Note: Old preliminary system removed - now using preliminaries_master + boq_preliminaries tables
        # Preliminary data is now fetched per-BOQ through boq_preliminaries junction table
        prelim_by_project = {}  # Empty dict for compatibility

        complete_boqs = []
        for boq, project in boqs:
            # Check BOQ history for sender and receiver roles
            display_status = boq.status
           
            boq_summary = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "project_id": boq.project_id,
                "project_name": project.project_name if project else None,
                "project_code": project.project_code if project else None,
                "client": project.client if project else None,
                "location": project.location if project else None,
                "floor": project.floor_name if project else None,
                "hours": project.working_hours if project else None,
                "status": display_status,
                "client_status":boq.client_status,
                "revision_number": getattr(boq, 'revision_number', 0) or 0,
                "email_sent" : boq.email_sent,
                "user_id": project.user_id if project else None,  # PM assignment indicator
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "created_by": boq.created_by,
            }

            complete_boqs.append(boq_summary)

        return jsonify({
            "message": "BOQs retrieved successfully",
            "count": len(complete_boqs),
            "data": complete_boqs
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error retrieving BOQs: {str(e)}")
        return jsonify({
            'error': 'Failed to retrieve BOQs',
            'details': str(e)
        }), 500


def update_boq(boq_id):
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
        # Check if this is a revision edit (from Revisions button)
        is_revision = data.get("is_revision", False)
        # Set status based on current status and revision mode
        current_status = boq.status
        if is_revision:
            # If this is a revision edit, always set to Under_Revision
            boq.status = "Under_Revision"
        elif current_status == "Client_Rejected":
            boq.status = "Under_Revision"
        elif current_status == "Rejected":
            # If TD rejected, keep as Under_Revision when editing
            boq.status = "Under_Revision"
        elif current_status in ["Sent_for_Confirmation", "Pending_Revision", "Pending", "Approved", "Client_Confirmed", "Under_Revision"]:
            # Keep the current status (don't change workflow statuses)
            pass
        else:
            boq.status = boq.status

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
        boq_items = []
        total_boq_cost = 0

        # Check if we should store payload directly (when combined_summary exists in payload)
        if "items" in data and "combined_summary" in data:
            # Store payload directly without recalculation
            import copy
            payload_copy = copy.deepcopy(data)
            # Get values directly from payload
            boq_items = data.get("items", [])
            combined_summary = data.get("combined_summary", {})
            total_boq_cost = combined_summary.get("total_cost", 0)
            total_items = combined_summary.get("total_items", len(boq_items))
            total_materials = combined_summary.get("total_materials", 0)
            total_labour = combined_summary.get("total_labour", 0)

            # Get current user for master table operations
            current_user = getattr(g, 'user', None)
            if current_user:
                created_by = current_user.get('username') or current_user.get('full_name') or current_user.get('user_id', 'Admin')
            else:
                created_by = data.get("modified_by", "Admin")

            # Process ALL items to store in master tables (both new and existing)
            # This ensures materials/labour added to existing items are also saved
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
                    # Use existing master_item_id if available, otherwise will create new
                    existing_master_item_id = item_data.get("master_item_id")
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

                    # Add master_item_id back to payload
                    item_data["master_item_id"] = master_item_id
                    payload_copy["items"][idx]["master_item_id"] = master_item_id

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
                                payload_copy["items"][idx]["sub_items"][sub_idx]["sub_item_id"] = sub_item_id
                                payload_copy["items"][idx]["sub_items"][sub_idx]["master_sub_item_id"] = sub_item_id

            # Update BOQDetails with the raw payload directly
            boq_details.boq_details = payload_copy
            boq_details.total_cost = total_boq_cost
            boq_details.total_items = total_items
            boq_details.total_materials = total_materials
            boq_details.total_labour = total_labour
            boq_details.last_modified_by = user_name

        # If items are provided, update the JSON structure (normal calculation mode)
        elif "items" in data:
            # Use the same current user logic for BOQ details
            current_user = getattr(g, 'user', None)
            if current_user:
                created_by = current_user.get('username') or current_user.get('full_name') or current_user.get('user_id', 'Admin')
            else:
                created_by = data.get("modified_by", "Admin")

            # Process updated items
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
                    for idx, sub_item_data in enumerate(item_data.get("sub_items", [])):
                        sub_item_quantity = clean_numeric_value(sub_item_data.get("quantity", 1.0))
                        sub_item_unit = sub_item_data.get("unit", "nos")
                        sub_item_rate = clean_numeric_value(sub_item_data.get("rate", 0.0))
                        sub_item_base_total = sub_item_quantity * sub_item_rate

                        # Process materials for this sub-item
                        sub_item_materials = []
                        materials_cost = 0
                        for mat_data in sub_item_data.get("materials", []):
                            material_name = mat_data.get("material_name", "").strip()
                            # Skip materials with empty or null names
                            if not material_name:
                                continue

                            quantity = clean_numeric_value(mat_data.get("quantity", 1.0))
                            unit_price = clean_numeric_value(mat_data.get("unit_price", 0.0))
                            total_price = quantity * unit_price
                            materials_cost += total_price

                            sub_item_materials.append({
                                "material_name": material_name,
                                "location": mat_data.get("location", ""),
                                "brand": mat_data.get("brand", ""),
                                "size": mat_data.get("size", ""),
                                "specification": mat_data.get("specification", ""),
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
                            labour_role = labour_data_item.get("labour_role", "").strip()
                            # Skip labour with empty or null roles
                            if not labour_role:
                                continue

                            hours = clean_numeric_value(labour_data_item.get("hours", 0.0))
                            rate_per_hour = clean_numeric_value(labour_data_item.get("rate_per_hour", 0.0))
                            total_cost_labour = hours * rate_per_hour
                            labour_cost += total_cost_labour

                            sub_item_labour.append({
                                "labour_role": labour_role,
                                "work_type": labour_data_item.get("work_type", "daily_wages"),
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
                            "per_unit_cost": sub_item_rate,  # Added for master table
                            "base_total": sub_item_base_total,
                            "sub_item_total_cost": sub_item_base_total,  # Added for master table
                            "materials_cost": materials_cost,
                            "labour_cost": labour_cost,
                            "material_cost": materials_cost,  # Added for master table (uses singular)
                            "internal_cost": sub_item_data.get("internal_cost", 0.0),
                            "planned_profit": sub_item_data.get("planned_profit", 0.0),
                            "actual_profit": sub_item_data.get("actual_profit", 0.0),
                            "negotiable_margin": sub_item_data.get("actual_profit", 0.0),  # Same as actual_profit
                            "misc_percentage": sub_item_data.get("misc_percentage", 10.0),
                            "misc_amount": sub_item_data.get("misc_amount", 0.0),
                            "overhead_profit_percentage": sub_item_data.get("overhead_profit_percentage", 25.0),
                            "overhead_profit_amount": sub_item_data.get("overhead_profit_amount", 0.0),
                            "transport_percentage": sub_item_data.get("transport_percentage", 5.0),
                            "transport_amount": sub_item_data.get("transport_amount", 0.0),
                            "materials": sub_item_materials,
                            "labour": sub_item_labour
                        }

                        # PRESERVE sub_item_id if it exists in the input data
                        if "sub_item_id" in sub_item_data:
                            sub_item_json["sub_item_id"] = sub_item_data["sub_item_id"]
                        if "master_sub_item_id" in sub_item_data:
                            sub_item_json["master_sub_item_id"] = sub_item_data["master_sub_item_id"]

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
                    # Step 1: Add item to boq_items table
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

                    # Step 2: Add sub-items to boq_sub_items table, and their materials & labour
                    master_sub_item_ids = []
                    if sub_items_list:
                        # Pass the processed sub_items_list that contains materials and labour
                        master_sub_item_ids = add_sub_items_to_master_tables(
                            master_item_id,
                            sub_items_list,
                            created_by
                        )

                        # Assign master sub-item IDs back to the sub_items in item_json
                        # This ensures sub_item_id is preserved for future edits
                        for idx, sub_item_id in enumerate(master_sub_item_ids):
                            if idx < len(item_json.get("sub_items", [])):
                                # Only assign if not already present (preserve existing IDs)
                                if "sub_item_id" not in item_json["sub_items"][idx]:
                                    item_json["sub_items"][idx]["sub_item_id"] = sub_item_id
                                if "master_sub_item_id" not in item_json["sub_items"][idx]:
                                    item_json["sub_items"][idx]["master_sub_item_id"] = sub_item_id

                    boq_items.append(item_json)
                    total_boq_cost += total_selling_price
                    total_materials += materials_count
                    total_labour += labour_count


            # Get preliminaries from request data (for discount calculation only)
            preliminaries = data.get("preliminaries", {})
            preliminary_id = old_boq_details_json.get("preliminary_id") if old_boq_details_json else None

            # Apply BOQ-level discount to total
            boq_discount_percentage = data.get("discount_percentage", old_boq_details_json.get("discount_percentage", 0)) or 0
            boq_discount_amount = data.get("discount_amount", old_boq_details_json.get("discount_amount", 0)) or 0

            # Get preliminary amount to include in discount calculation
            preliminary_amount = preliminaries.get('cost_details', {}).get('amount', 0) if preliminaries else 0

            # Combined subtotal = items total + preliminary amount
            combined_subtotal = total_boq_cost + preliminary_amount

            # Calculate discount amount if only percentage is provided
            # Discount should be calculated on combined subtotal (items + preliminaries)
            if boq_discount_amount == 0 and boq_discount_percentage > 0 and combined_subtotal > 0:
                boq_discount_amount = combined_subtotal * (boq_discount_percentage / 100)

            # Apply BOQ-level discount to get final total
            final_boq_cost = combined_subtotal - boq_discount_amount if boq_discount_amount > 0 else combined_subtotal

            # Update JSON structure
            updated_json = {
                "boq_id": boq.boq_id,
                "preliminaries": preliminaries,
                "preliminary_id": preliminary_id,
                "discount_percentage": boq_discount_percentage,
                "discount_amount": boq_discount_amount,
                "items": boq_items,
                "summary": {
                    "total_items": len(boq_items),
                    "total_materials": total_materials,
                    "total_labour": total_labour,
                    "total_material_cost": sum(item["totalMaterialCost"] for item in boq_items),
                    "total_labour_cost": sum(item["totalLabourCost"] for item in boq_items),
                    "total_cost": final_boq_cost,
                    "selling_price": final_boq_cost,
                    "estimatedSellingPrice": final_boq_cost
                }
            }

            # Update BOQ details
            boq_details.boq_details = updated_json
            boq_details.total_cost = final_boq_cost
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
            # Add role information for admin users
            if user_role == 'admin':
                existing_history.sender_role = 'Admin'
                existing_history.comments = f"BOQ updated - Version {next_version} by Admin {user_name}"
            else:
                existing_history.sender_role = user_role.title() if user_role else None
                existing_history.comments = f"BOQ updated - Version {next_version} by {user_name}"
            existing_history.action_date = datetime.utcnow()
            existing_history.last_modified_by = user_name
            existing_history.last_modified_at = datetime.utcnow()
        else:
            # Create new history entry
            # Determine sender role for history tracking
            sender_role = 'Admin' if user_role == 'admin' else (user_role.title() if user_role else None)
            comments_text = f"BOQ updated - Version {next_version} by Admin {user_name}" if user_role == 'admin' else f"BOQ updated - Version {next_version} by {user_name}"

            boq_history = BOQHistory(
                boq_id=boq_id,
                action=[update_action],
                action_by=user_name,
                sender_role=sender_role,
                boq_status=boq.status,
                comments=comments_text,
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(boq_history)

        # Update preliminary selections in boq_preliminaries junction table
        preliminaries = data.get("preliminaries", {})
        if preliminaries and preliminaries.get('items'):
            from models.preliminary_master import BOQPreliminary, PreliminaryMaster

            preliminary_items = preliminaries.get('items', [])
            # Delete all existing preliminary selections for this BOQ
            BOQPreliminary.query.filter_by(boq_id=boq_id).delete()
            # Insert new selections
            preliminary_selections_saved = 0
            custom_preliminaries_created = 0

            for item in preliminary_items:
                prelim_id = item.get('prelim_id')
                is_checked = item.get('checked', False) or item.get('selected', False)
                is_custom = item.get('isCustom', False)

                # Handle edited master preliminaries - update the master record
                if prelim_id and not is_custom:
                    description = item.get('description', '')
                    if description:
                        # Check if description was changed from master
                        master_prelim = PreliminaryMaster.query.get(prelim_id)
                        if master_prelim and master_prelim.description != description:
                            # Update the master preliminary description
                            master_prelim.description = description
                            master_prelim.updated_by = user_name

                # Handle custom preliminaries - create new row in preliminaries_master
                if is_custom and not prelim_id:
                    description = item.get('description', '')
                    name = item.get('name', description[:50] if description else 'Custom Item')

                    if description:  # Only create if there's a description
                        # Check if this custom preliminary already exists (by description)
                        existing_custom = PreliminaryMaster.query.filter_by(
                            description=description,
                            created_by=user_name
                        ).first()

                        if existing_custom:
                            prelim_id = existing_custom.prelim_id
                        else:
                            # Create new custom preliminary in master table
                            new_custom_prelim = PreliminaryMaster(
                                name=name,
                                description=description,
                                unit='nos',
                                rate=0,
                                is_active=True,
                                display_order=9999,  # Custom items appear at the end
                                created_by=user_name,
                                updated_by=user_name
                            )
                            db.session.add(new_custom_prelim)
                            db.session.flush()  # Get the prelim_id
                            prelim_id = new_custom_prelim.prelim_id
                            custom_preliminaries_created += 1

                if prelim_id:
                    boq_prelim = BOQPreliminary(
                        boq_id=boq_id,
                        prelim_id=prelim_id,
                        is_checked=is_checked
                    )
                    db.session.add(boq_prelim)
                    preliminary_selections_saved += 1

        db.session.commit()

        # Return updated BOQ
        return jsonify({
            "message": "BOQ Updated successfully",
            "success": True,
            "boq_id": boq_id,
            "version": next_version,
            "status": boq.status,
            "updated_by": user_name
        }), 200
        # return get_boq(boq_id)

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500

def revision_boq(boq_id):
    """Create a revision of BOQ - stores history and increments revision number"""
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

        # Get existing BOQ details BEFORE any updates
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({"error": "BOQ details not found"}), 404

        # Store old values before updating (for change tracking)
        # IMPORTANT: Use deepcopy to create independent copy of JSON data
        import copy
        old_boq_name = boq.boq_name
        old_status = boq.status
        old_revision_number = boq.revision_number or 0
        old_total_cost = boq_details.total_cost
        old_total_items = boq_details.total_items
        old_boq_details_json = copy.deepcopy(boq_details.boq_details)  # Deep copy to prevent reference issues

        # Update BOQ basic details
        if "boq_name" in data:
            boq.boq_name = data["boq_name"]

        # Check if this is a revision edit (from Revisions button)
        is_revision = data.get("is_revision", False)

        # Set current_status BEFORE using it
        current_status = old_status

        # This ensures revision increments each time estimator starts revising after sending to client
        statuses_that_start_new_revision = ["Client_Rejected", "Sent_for_Confirmation"]

        if is_revision and current_status in statuses_that_start_new_revision:
            boq.revision_number = (boq.revision_number or 0) + 1

        new_revision_number = boq.revision_number or 0

        # Set status based on current status and revision mode
        if is_revision:
            # If this is a revision edit, always set to Under_Revision
            boq.status = "Under_Revision"
        elif current_status == "Client_Rejected":
            boq.status = "Under_Revision"
        elif current_status == "Rejected":
            # If TD rejected, keep as Under_Revision when editing
            boq.status = "Under_Revision"
        elif current_status in ["Sent_for_Confirmation", "Pending_Revision", "Pending", "Approved", "Client_Confirmed", "Under_Revision"]:
            # Keep the current status (don't change workflow statuses)
            pass
        else:
            boq.status = boq.status

        # Update last modified by and timestamp
        boq.last_modified_by = user_name
        boq.last_modified_at = datetime.utcnow()
        next_version = old_revision_number

        # Initialize variables used later in the function
        boq_items = []
        total_boq_cost = 0

        # Store the payload directly in BOQDetailsHistory without recalculation
        if data.get("is_revision", False) and "items" in data:
            # Create history entry with payload data directly (no recalculation)
            import copy
            payload_copy = copy.deepcopy(data)

            # Calculate totals from payload as-is
            boq_items = data.get("items", [])  # Use payload items directly
            total_items = len(boq_items)
            total_materials = 0
            total_labour = 0
            total_cost = 0

            for item in boq_items:
                # Get selling price from payload directly
                total_cost += item.get("selling_price", 0)

                # Count materials and labour from sub_items
                for sub_item in item.get("sub_items", []):
                    total_materials += len(sub_item.get("materials", []))
                    total_labour += len(sub_item.get("labour", []))

            # Set total_boq_cost for later use
            total_boq_cost = total_cost

            # Create BOQDetailsHistory entry with the raw payload
            boq_detail_history = BOQDetailsHistory(
                boq_detail_id=boq_details.boq_detail_id,
                boq_id=boq_id,
                version=next_version,
                boq_details=payload_copy,  # Store payload directly as-is
                total_cost=total_cost,
                total_items=total_items,
                total_materials=total_materials,
                total_labour=total_labour,
                created_by=user_name
            )
            db.session.add(boq_detail_history)

            # Also update BOQDetails with the raw payload (no recalculation)
            boq_details.boq_details = payload_copy
            boq_details.total_cost = total_cost
            boq_details.total_items = total_items
            boq_details.total_materials = total_materials
            boq_details.total_labour = total_labour
            boq_details.last_modified_by = user_name

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
                    log.info(f"✅ Updated preliminary selections in boq_preliminaries for BOQ {boq_id} during revision")

            # Save terms & conditions selections to boq_terms_selections junction table
            terms_conditions = data.get("terms_conditions", [])
            if terms_conditions and isinstance(terms_conditions, list):
                from sqlalchemy import text
                for term in terms_conditions:
                    term_id = term.get('term_id')
                    is_checked = term.get('checked', False)

                    if term_id:  # Only save if it has a term_id (from master table)
                        # Insert or update term selection
                        db.session.execute(text("""
                            INSERT INTO boq_terms_selections (boq_id, term_id, is_checked, created_at, updated_at)
                            VALUES (:boq_id, :term_id, :is_checked, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                            ON CONFLICT (boq_id, term_id)
                            DO UPDATE SET is_checked = :is_checked, updated_at = CURRENT_TIMESTAMP
                        """), {
                            'boq_id': boq_id,
                            'term_id': term_id,
                            'is_checked': is_checked
                        })
                log.info(f"✅ Updated terms selections in boq_terms_selections for BOQ {boq_id} during revision")

        # If items are provided, update the JSON structure (for non-revision updates)
        elif "items" in data:
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
                    for idx, sub_item_data in enumerate(item_data.get("sub_items", [])):
                        sub_item_quantity = clean_numeric_value(sub_item_data.get("quantity", 1.0))
                        sub_item_unit = sub_item_data.get("unit", "nos")
                        sub_item_rate = clean_numeric_value(sub_item_data.get("rate", 0.0))
                        sub_item_base_total = sub_item_quantity * sub_item_rate

                        # Process materials for this sub-item
                        sub_item_materials = []
                        materials_cost = 0
                        for mat_data in sub_item_data.get("materials", []):
                            material_name = mat_data.get("material_name", "").strip()
                            # Skip materials with empty or null names
                            if not material_name:
                                continue

                            quantity = clean_numeric_value(mat_data.get("quantity", 1.0))
                            unit_price = clean_numeric_value(mat_data.get("unit_price", 0.0))
                            total_price = quantity * unit_price
                            materials_cost += total_price

                            sub_item_materials.append({
                                "material_name": material_name,
                                "location": mat_data.get("location", ""),
                                "brand": mat_data.get("brand", ""),
                                "size": mat_data.get("size", ""),
                                "specification": mat_data.get("specification", ""),
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
                            labour_role = labour_data_item.get("labour_role", "").strip()
                            # Skip labour with empty or null roles
                            if not labour_role:
                                continue

                            hours = clean_numeric_value(labour_data_item.get("hours", 0.0))
                            rate_per_hour = clean_numeric_value(labour_data_item.get("rate_per_hour", 0.0))
                            total_cost_labour = hours * rate_per_hour
                            labour_cost += total_cost_labour

                            sub_item_labour.append({
                                "labour_role": labour_role,
                                "work_type": labour_data_item.get("work_type", "daily_wages"),
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
                            "per_unit_cost": sub_item_rate,  # Added for master table
                            "base_total": sub_item_base_total,
                            "sub_item_total_cost": sub_item_base_total,  # Added for master table
                            "materials_cost": materials_cost,
                            "labour_cost": labour_cost,
                            "material_cost": materials_cost,  # Added for master table (uses singular)
                            "internal_cost": sub_item_data.get("internal_cost", 0.0),
                            "planned_profit": sub_item_data.get("planned_profit", 0.0),
                            "actual_profit": sub_item_data.get("actual_profit", 0.0),
                            "negotiable_margin": sub_item_data.get("actual_profit", 0.0),  # Same as actual_profit
                            "misc_percentage": sub_item_data.get("misc_percentage", 10.0),
                            "misc_amount": sub_item_data.get("misc_amount", 0.0),
                            "overhead_profit_percentage": sub_item_data.get("overhead_profit_percentage", 25.0),
                            "overhead_profit_amount": sub_item_data.get("overhead_profit_amount", 0.0),
                            "transport_percentage": sub_item_data.get("transport_percentage", 5.0),
                            "transport_amount": sub_item_data.get("transport_amount", 0.0),
                            "materials": sub_item_materials,
                            "labour": sub_item_labour
                        }

                        # PRESERVE sub_item_id if it exists in the input data
                        if "sub_item_id" in sub_item_data:
                            sub_item_json["sub_item_id"] = sub_item_data["sub_item_id"]
                        if "master_sub_item_id" in sub_item_data:
                            sub_item_json["master_sub_item_id"] = sub_item_data["master_sub_item_id"]

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

                    boq_items.append(item_json)
                    total_boq_cost += total_selling_price
                    total_materials += materials_count
                    total_labour += labour_count

                else:
                    # OLD FORMAT: Item without sub_items (materials/labour directly on item)
                    materials_data = item_data.get("materials", [])
                    labour_data = item_data.get("labour", [])

                    # Calculate costs first to get overhead and profit amounts
                    materials_cost = 0
                    labour_cost = 0

                    # Calculate material and labour costs
                    for mat_data in materials_data:
                        quantity = mat_data.get("quantity", 1.0)
                        unit_price = mat_data.get("unit_price", 0.0)
                        materials_cost += quantity * unit_price

                    for labour_data_item in labour_data:
                        hours = labour_data_item.get("hours", 0.0)
                        rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
                        labour_cost += hours * rate_per_hour

                    # Calculate item costs
                    base_cost = materials_cost + labour_cost

                    # Use provided percentages, default to 10% overhead and 15% profit if not provided
                    overhead_percentage = item_data.get("overhead_percentage", 10.0)
                    profit_margin_percentage = item_data.get("profit_margin_percentage", 15.0)

                    # Calculate amounts based on percentages
                    overhead_amount = (base_cost * overhead_percentage) / 100
                    profit_margin_amount = (base_cost * profit_margin_percentage) / 100
                    total_cost = base_cost + overhead_amount
                    selling_price = total_cost + profit_margin_amount

                    # Handle discount (can be null or a value)
                    discount_percentage = item_data.get("discount_percentage")
                    discount_amount = 0.0
                    after_discount = selling_price

                    if discount_percentage is not None and discount_percentage > 0:
                        discount_amount = (selling_price * float(discount_percentage)) / 100
                        after_discount = selling_price - discount_amount

                    # Handle VAT - check if using per-material VAT or item-level VAT
                    vat_percentage = item_data.get("vat_percentage", 0.0)
                    vat_amount = 0.0
                    final_selling_price = after_discount

                    # Check if any material has VAT percentage defined (per-material mode)
                    has_material_vat = any(mat.get("vat_percentage") is not None and mat.get("vat_percentage", 0) > 0 for mat in materials_data)

                    if has_material_vat:
                        # Per-material VAT mode: Calculate VAT for each material
                        for mat_data in materials_data:
                            mat_vat_pct = mat_data.get("vat_percentage", 0.0)
                            if mat_vat_pct and mat_vat_pct > 0:
                                mat_total = mat_data.get("quantity", 0) * mat_data.get("unit_price", 0)
                                vat_amount += (mat_total * float(mat_vat_pct)) / 100
                        final_selling_price = after_discount + vat_amount
                    elif vat_percentage is not None and vat_percentage > 0:
                        # Item-level VAT mode: Apply single VAT to after-discount amount
                        vat_amount = (after_discount * float(vat_percentage)) / 100
                        final_selling_price = after_discount + vat_amount

                    # Add new items/materials/labour to master tables with calculated values
                    master_item_id, master_material_ids, master_labour_ids = add_to_master_tables(
                        item_data.get("item_name"),
                        item_data.get("description"),
                        item_data.get("work_type", "contract"),
                        materials_data,
                        labour_data,
                        created_by,
                        overhead_percentage,
                        overhead_amount,
                        profit_margin_percentage,
                        profit_margin_amount
                    )

                    # Process materials with master IDs
                    processed_materials = []
                    for i, mat_data in enumerate(materials_data):
                        quantity = mat_data.get("quantity", 1.0)
                        unit_price = mat_data.get("unit_price", 0.0)
                        total_price = quantity * unit_price
                        vat_pct = mat_data.get("vat_percentage", 0.0)

                        processed_materials.append({
                            "master_material_id": master_material_ids[i] if i < len(master_material_ids) else None,
                            "material_name": mat_data.get("material_name"),
                            "description": mat_data.get("description", ""),
                            "quantity": quantity,
                            "unit": mat_data.get("unit", "nos"),
                            "unit_price": unit_price,
                            "total_price": total_price,
                            "vat_percentage": vat_pct if vat_pct else 0.0
                        })

                    # Process labour with master IDs
                    processed_labour = []
                    for i, labour_data_item in enumerate(labour_data):
                        hours = labour_data_item.get("hours", 0.0)
                        rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
                        total_cost_labour = hours * rate_per_hour

                        processed_labour.append({
                            "master_labour_id": master_labour_ids[i] if i < len(master_labour_ids) else None,
                            "labour_role": labour_data_item.get("labour_role"),
                            "hours": hours,
                            "rate_per_hour": rate_per_hour,
                            "total_cost": total_cost_labour
                        })

                    # Build updated item JSON
                    item_json = {
                        "master_item_id": master_item_id,
                        "item_name": item_data.get("item_name"),
                        "description": item_data.get("description"),
                        "work_type": item_data.get("work_type"),
                        "base_cost": base_cost,
                        "overhead_percentage": overhead_percentage,
                        "overhead_amount": overhead_amount,
                        "profit_margin_percentage": profit_margin_percentage,
                        "profit_margin_amount": profit_margin_amount,
                        "discount_percentage": discount_percentage if discount_percentage is not None else 0.0,
                        "discount_amount": discount_amount,
                        "vat_percentage": vat_percentage if vat_percentage is not None else 0.0,
                        "vat_amount": vat_amount,
                        "total_cost": total_cost,
                        "selling_price": final_selling_price,  # Use final_selling_price after discount and VAT
                        "selling_price_before_discount": selling_price,  # Original selling price
                        "totalMaterialCost": materials_cost,
                        "totalLabourCost": labour_cost,
                        "actualItemCost": base_cost,
                        "estimatedSellingPrice": final_selling_price,  # Use final_selling_price after discount and VAT
                        "materials": processed_materials,
                        "labour": processed_labour
                    }

                    boq_items.append(item_json)
                    total_boq_cost += final_selling_price  # Add final price after discount to total
                    total_materials += len(materials_data)
                    total_labour += len(labour_data)

            # Get preliminaries from request data (for discount calculation only)
            preliminaries = data.get("preliminaries", {})

            # NOTE: Preliminary updates are now handled by dedicated /preliminary/{project_id} endpoint
            # to prevent race conditions and data conflicts. This section only reads preliminary data
            # for discount calculations, it does not save/update preliminary records.
            preliminary_id = old_boq_details_json.get("preliminary_id") if old_boq_details_json else None

            # Note: Old preliminary system removed - preliminary_id no longer used
            # preliminary_id = None  # Kept for backward compatibility but not used

            # Apply BOQ-level discount to total
            boq_discount_percentage = data.get("discount_percentage", old_boq_details_json.get("discount_percentage", 0)) or 0
            boq_discount_amount = data.get("discount_amount", old_boq_details_json.get("discount_amount", 0)) or 0

            # Get preliminary amount to include in discount calculation
            preliminary_amount = preliminaries.get('cost_details', {}).get('amount', 0) if preliminaries else 0

            # Combined subtotal = items total + preliminary amount
            combined_subtotal = total_boq_cost + preliminary_amount

            # Calculate discount amount if only percentage is provided
            # Discount should be calculated on combined subtotal (items + preliminaries)
            if boq_discount_amount == 0 and boq_discount_percentage > 0 and combined_subtotal > 0:
                boq_discount_amount = combined_subtotal * (boq_discount_percentage / 100)

            # Apply BOQ-level discount to get final total
            final_boq_cost = combined_subtotal - boq_discount_amount if boq_discount_amount > 0 else combined_subtotal

            log.info(f"BOQ {boq.boq_id} revision update totals - Items: {total_boq_cost}, Preliminaries: {preliminary_amount}, Combined: {combined_subtotal}, Discount: {boq_discount_amount} ({boq_discount_percentage}%), Final: {final_boq_cost}")

            # Store new items, sub-items, and materials to master tables
            for item_data in boq_items:
                # Check if item has sub_items structure
                if item_data.get("has_sub_items") and "sub_items" in item_data:
                    # NEW FORMAT: Item with sub_items
                    # 1. Store/Update Item in boq_items table
                    item_name = item_data.get("item_name")
                    existing_item = MasterItem.query.filter_by(item_name=item_name).first()

                    if not existing_item:
                        new_item = MasterItem(
                            item_name=item_name,
                            description=item_data.get("description", ""),
                            unit=item_data.get("unit", "nos"),
                            quantity=item_data.get("quantity", 1.0),
                            per_unit_cost=item_data.get("rate", 0.0),
                            total_amount=item_data.get("item_total", 0.0),
                            item_total_cost=item_data.get("base_cost", 0.0),
                            overhead_percentage=item_data.get("overhead_percentage", 10.0),
                            overhead_amount=item_data.get("overhead_amount", 0.0),
                            profit_margin_percentage=item_data.get("profit_margin_percentage", 15.0),
                            profit_margin_amount=item_data.get("profit_margin_amount", 0.0),
                            discount_percentage=item_data.get("discount_percentage", 0.0),
                            discount_amount=item_data.get("discount_amount", 0.0),
                            vat_percentage=item_data.get("vat_percentage", 0.0),
                            vat_amount=item_data.get("vat_amount", 0.0),
                            is_active=True,
                            created_by=user_name
                        )
                        db.session.add(new_item)
                        db.session.flush()  # Get the item_id
                        master_item_id = new_item.item_id

                        # Update item_data with master_item_id
                        item_data["master_item_id"] = master_item_id
                    else:
                        master_item_id = existing_item.item_id
                        if "master_item_id" not in item_data:
                            item_data["master_item_id"] = master_item_id

                    # 2. Process sub_items for this item
                    for sub_item_data in item_data.get("sub_items", []):
                        sub_item_name = sub_item_data.get("sub_item_name")

                        # Check if sub_item already exists for this item
                        existing_sub_item = MasterSubItem.query.filter_by(
                            item_id=master_item_id,
                            sub_item_name=sub_item_name
                        ).first()

                        if not existing_sub_item:
                            new_sub_item = MasterSubItem(
                                item_id=master_item_id,
                                sub_item_name=sub_item_name,
                                description=sub_item_data.get("description", ""),
                                size=sub_item_data.get("size", ""),
                                location=sub_item_data.get("location", ""),
                                brand=sub_item_data.get("brand", ""),
                                unit=sub_item_data.get("unit", "nos"),
                                quantity=sub_item_data.get("quantity", 1.0),
                                per_unit_cost=sub_item_data.get("rate", 0.0),
                                sub_item_total_cost=sub_item_data.get("base_total", 0.0),
                                material_cost=sub_item_data.get("materials_cost", 0.0),
                                labour_cost=sub_item_data.get("labour_cost", 0.0),
                                is_active=True,
                                created_by=user_name
                            )
                            db.session.add(new_sub_item)
                            db.session.flush()  # Get the sub_item_id
                            master_sub_item_id = new_sub_item.sub_item_id

                            # Update sub_item_data with master_sub_item_id
                            sub_item_data["master_sub_item_id"] = master_sub_item_id
                        else:
                            master_sub_item_id = existing_sub_item.sub_item_id
                            if "master_sub_item_id" not in sub_item_data:
                                sub_item_data["master_sub_item_id"] = master_sub_item_id

                        # 3. Process materials for this sub_item
                        for material_data in sub_item_data.get("materials", []):
                            material_name = material_data.get("material_name")

                            # Check if material already exists
                            existing_material = MasterMaterial.query.filter_by(
                                material_name=material_name
                            ).first()

                            if not existing_material:
                                new_material = MasterMaterial(
                                    material_name=material_name,
                                    item_id=master_item_id,
                                    sub_item_id=master_sub_item_id,
                                    description=material_data.get("description", ""),
                                    brand=material_data.get("brand", ""),
                                    size=material_data.get("size", ""),
                                    specification=material_data.get("specification", ""),
                                    quantity=material_data.get("quantity", 1.0),
                                    default_unit=material_data.get("unit", "nos"),
                                    current_market_price=material_data.get("unit_price", 0.0),
                                    total_price=material_data.get("total_price", 0.0),
                                    vat_percentage=material_data.get("vat_percentage", 0.0),
                                    is_active=True,
                                    created_by=user_name,
                                    last_modified_by=user_name
                                )
                                db.session.add(new_material)
                                db.session.flush()  # Get the material_id
                                master_material_id = new_material.material_id

                                # Update material_data with master_material_id
                                material_data["master_material_id"] = master_material_id
                            else:
                                if "master_material_id" not in material_data:
                                    material_data["master_material_id"] = existing_material.material_id

                        # 4. Process labour for this sub_item
                        for labour_data_item in sub_item_data.get("labour", []):
                            labour_role = labour_data_item.get("labour_role")

                            # Check if labour already exists
                            existing_labour = MasterLabour.query.filter_by(
                                labour_role=labour_role
                            ).first()

                            if not existing_labour:
                                new_labour = MasterLabour(
                                    labour_role=labour_role,
                                    item_id=master_item_id,
                                    sub_item_id=master_sub_item_id,
                                    hours=labour_data_item.get("hours", 0.0),
                                    rate_per_hour=labour_data_item.get("rate_per_hour", 0.0),
                                    amount=labour_data_item.get("total_cost", 0.0),
                                    is_active=True,
                                    created_by=user_name
                                )
                                db.session.add(new_labour)
                                db.session.flush()  # Get the labour_id
                                master_labour_id = new_labour.labour_id

                                # Update labour_data with master_labour_id
                                labour_data_item["master_labour_id"] = master_labour_id
                            else:
                                if "master_labour_id" not in labour_data_item:
                                    labour_data_item["master_labour_id"] = existing_labour.labour_id

            # Update JSON structure
            updated_json = {
                "boq_id": boq.boq_id,
                "preliminaries": preliminaries,
                "preliminary_id": preliminary_id,
                "discount_percentage": boq_discount_percentage,
                "discount_amount": boq_discount_amount,
                "items": boq_items,
                "summary": {
                    "total_items": len(boq_items),
                    "total_materials": total_materials,
                    "total_labour": total_labour,
                    "total_material_cost": sum(item["totalMaterialCost"] for item in boq_items),
                    "total_labour_cost": sum(item["totalLabourCost"] for item in boq_items),
                    "total_cost": final_boq_cost,
                    "selling_price": final_boq_cost,
                    "estimatedSellingPrice": final_boq_cost
                }
            }

            # Update BOQ details
            boq_details.boq_details = updated_json
            boq_details.total_cost = final_boq_cost
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
            "type": "boq_revision",
            "role": user_role if user_role else 'system',
            "user_name": user_name,
            "user_id": user_id,
            "status": boq.status,
            "old_status": old_status,
            "revision_number": new_revision_number,
            "old_revision_number": old_revision_number,
            "version": next_version,
            "timestamp": datetime.utcnow().isoformat(),
            "updated_by": user_name,
            "updated_by_user_id": user_id,
            "boq_name": boq.boq_name,
            "old_boq_name": old_boq_name,
            "total_items": len(boq_items) if "items" in data else boq_details.total_items,
            "total_cost": total_boq_cost if "items" in data else boq_details.total_cost,
            "changes": detailed_changes,
            "change_summary": {
                "boq_name_changed": bool(detailed_changes.get("boq_name")),
                "cost_changed": bool(detailed_changes.get("total_cost")),
                "items_changed": bool(detailed_changes.get("items")),
                "items_count_changed": bool(detailed_changes.get("total_items")),
                "status_changed": old_status != boq.status,
                "revision_created": True
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
            existing_history.comments = f"BOQ Revision {new_revision_number} - Version {next_version} by {user_name}"
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
                comments=f"BOQ Revision {new_revision_number} - Version {next_version} by {user_name}",
                action_date=datetime.utcnow(),
                created_by=user_name
            )
            db.session.add(boq_history)

        db.session.commit()

        # Return updated BOQ
        return jsonify({
            "message": "BOQ Revision created successfully",
            "boq_id": boq_id,
            "revision_number": new_revision_number,
            "version": next_version,
            "status": boq.status,
            "updated_by": user_name
        }), 200
        # return get_boq(boq_id)

    except Exception as e:
        db.session.rollback()
        log.error(f"Error updating BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500

def delete_boq(boq_id):
    """Delete BOQ and its details (soft delete could be implemented)"""
    try:
        boq = BOQ.query.filter_by(boq_id=boq_id).first()
        if not boq:
            return jsonify({"error": "BOQ not found"}), 404

        # Delete BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if boq_details:
            boq_details.is_deleted = True
            db.session.commit()
            # db.session.delete(boq_details)

        # Delete BOQ (master tables remain untouched)
        # db.session.delete(boq)
        boq.is_deleted = True
        db.session.commit()

        return jsonify({"message": "BOQ deleted successfully"}), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error deleting BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_sub_item_material(sub_item_id):
    """Get all materials for a given sub_item_id"""
    try:
        # Check if sub-item exists
        boq_sub_item = MasterSubItem.query.filter_by(
            sub_item_id=sub_item_id,
            is_deleted=False
        ).first()
        if not boq_sub_item:
            return jsonify([]), 200

        # Get parent item details
        boq_item = MasterItem.query.filter_by(
            item_id=boq_sub_item.item_id,
            is_deleted=False
        ).first()

        # Get all materials for this sub-item
        boq_materials = MasterMaterial.query.filter_by(
            sub_item_id=sub_item_id,
            is_active=True
        ).all()

        material_details = []
        total_material_cost = 0

        for material in boq_materials:
            material_cost = (material.current_market_price or 0)
            total_material_cost += material_cost

            material_details.append({
                "material_id": material.material_id,
                "material_name": material.material_name,
                "description" : material.description,
                "size" : material.size,
                "specification" : material.specification,
                "quantity" : material.quantity,
                "brand" : material.brand,
                "item_id": material.item_id,
                "sub_item_id": material.sub_item_id,
                "item_name": boq_item.item_name if boq_item else None,
                "sub_item_name": boq_sub_item.sub_item_name,
                "default_unit": material.default_unit,
                "current_market_price": material.current_market_price,
                "is_active": material.is_active,
                "created_at": material.created_at.isoformat() if material.created_at else None,
                "created_by": material.created_by
            })

        return jsonify({
            "sub_item_id": boq_sub_item.sub_item_id,
            "sub_item_name": boq_sub_item.sub_item_name,
            "item_id": boq_sub_item.item_id,
            "item_name": boq_item.item_name if boq_item else None,
            "location": boq_sub_item.location,
            "brand": boq_sub_item.brand,
            "materials_count": len(material_details),
            "total_material_cost": total_material_cost,
            "materials": material_details
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error fetching materials for sub_item {sub_item_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

def get_sub_item_labours(sub_item_id):
    """Get all labour for a given sub_item_id"""
    try:
        # Check if sub-item exists
        boq_sub_item = MasterSubItem.query.filter_by(
            sub_item_id=sub_item_id,
            is_deleted=False
        ).first()

        if not boq_sub_item:
            return jsonify([]), 200

        # Get parent item details
        boq_item = MasterItem.query.filter_by(
            item_id=boq_sub_item.item_id,
            is_deleted=False
        ).first()

        # Get all labour for this sub-item
        boq_labours = MasterLabour.query.filter_by(
            sub_item_id=sub_item_id,
            is_active=True
        ).all()

        labour_details = []
        total_labour_cost = 0
        total_hours = 0

        for labour in boq_labours:
            labour_amount = labour.amount or 0
            labour_hours = labour.hours or 0
            total_labour_cost += labour_amount
            total_hours += labour_hours

            labour_details.append({
                "labour_id": labour.labour_id,
                "labour_role": labour.labour_role,
                "item_id": labour.item_id,
                "sub_item_id": labour.sub_item_id,
                "item_name": boq_item.item_name if boq_item else None,
                "sub_item_name": boq_sub_item.sub_item_name,
                "work_type": labour.work_type,
                "hours": labour.hours,
                "rate_per_hour": labour.rate_per_hour,
                "amount": labour.amount,
                "is_active": labour.is_active,
                "created_at": labour.created_at.isoformat() if labour.created_at else None,
                "created_by": labour.created_by
            })

        return jsonify({
            "sub_item_id": boq_sub_item.sub_item_id,
            "sub_item_name": boq_sub_item.sub_item_name,
            "item_id": boq_sub_item.item_id,
            "item_name": boq_item.item_name if boq_item else None,
            "location": boq_sub_item.location,
            "brand": boq_sub_item.brand,
            "labours_count": len(labour_details),
            "total_hours": total_hours,
            "total_labour_cost": total_labour_cost,
            "labours": labour_details
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error fetching labour for sub_item {sub_item_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

def get_all_item():
    try:
        boq_items = MasterItem.query.filter_by(is_deleted=False).all()
        item_details = []
        for item in boq_items:
            item_details.append({
                "item_id": item.item_id,
                "item_name": item.item_name,
                "description": item.description,
                "miscellaneous_percentage": item.miscellaneous_percentage,
                "miscellaneous_amount": item.miscellaneous_amount,
                "overhead_percentage": item.overhead_percentage,
                "overhead_amount": item.overhead_amount,
                "profit_margin_percentage": item.profit_margin_percentage,
                "profit_margin_amount": item.profit_margin_amount
            })

        return jsonify({
            "item_list": item_details
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error fetching item: {str(e)}")
        return jsonify({"error": str(e)}), 500

# SEND EMAIL - Send BOQ to Technical Director
def send_boq_email(boq_id):
    try:
        current_user = getattr(g, 'user', None)
        user_id = current_user.get('user_id') if current_user else None
        user_role = current_user.get('role', '').lower() if current_user else ''
        user_name = current_user.get('full_name') or current_user.get('username') or 'Unknown' if current_user else 'Unknown'
        # Get BOQ data
        boq = BOQ.query.filter_by(boq_id=boq_id).first()
        if not boq:
            return jsonify({
                "error": "BOQ not found",
                "message": f"No BOQ found with ID {boq_id}"
            }), 404

        # Get BOQ details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id).first()
        if not boq_details:
            return jsonify({
                "error": "BOQ details not found",
                "message": f"No BOQ details found for BOQ ID {boq_id}"
            }), 404

        # Get project data
        project = Project.query.filter_by(project_id=boq.project_id).first()
        if not project:
            return jsonify({
                "error": "Project not found",
                "message": f"No project found with ID {boq.project_id}"
            }), 404

        # Prepare BOQ data
        boq_data = {
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'status': boq.status,
            'created_by': boq.created_by,
            'created_at': boq.created_at.strftime('%d-%b-%Y %I:%M %p') if boq.created_at else 'N/A'
        }

        # Prepare project data
        project_data = {
            'project_name': project.project_name,
            'client': project.client if hasattr(project, 'client') else 'N/A',
            'location': project.location if hasattr(project, 'location') else 'N/A'
        }

        # Prepare items summary from BOQ details JSON
        items_summary = boq_details.boq_details.get('summary', {})
        items_summary['items'] = boq_details.boq_details.get('items', [])

        # Initialize email service
        # boq_email_service = BOQEmailService()

        # Get TD email from request or fetch all Technical Directors
        # Handle GET request with optional JSON body (non-standard but supported)
        try:
            data = request.get_json(silent=True) or {}
        except Exception as e:
            log.warning(f"Failed to parse JSON body: {e}")
            data = {}

        td_email = data.get('td_email')
        td_name = data.get('full_name')
        comments = data.get('comments')  # Get comments from request

        if td_email:
            # Send to specific TD
            # email_sent = boq_email_service.send_boq_to_technical_director(
            #     boq_data, project_data, items_summary, td_email
            # )

            # if email_sent:
                # Update BOQ status and mark email as sent to TD
            # Check if this is a revision (was Rejected, Client_Rejected, Under_Revision, Pending_Revision, Revision_Approved, or client_revision_rejected) or a new submission
            is_revision = boq.status in ["Rejected", "Client_Rejected", "Under_Revision", "Pending_Revision", "Revision_Approved", "client_revision_rejected"]
            new_status = "Pending_Revision" if is_revision else "Pending"
            boq.email_sent = True
            boq.status = new_status
            boq.last_modified_by = user_name
            boq.last_modified_at = datetime.utcnow()

            # Check if history entry already exists for this BOQ
            existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

            # Prepare action data in the new format
            new_action = {
                "role": user_role,
                "type": "revision_sent" if is_revision else "email_sent",
                "sender": user_role,
                "receiver": "technicalDirector",
                "status": new_status.lower(),
                # "pending",
                "comments": comments if comments else ("BOQ revision sent for review" if is_revision else "BOQ sent for review and approval"),
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": user_name,
                "decided_by_user_id": user_id,
                "recipient_email": td_email,
                "recipient_name": td_name if td_name else None,
                "boq_name": boq.boq_name,
                "project_name": project_data.get("project_name"),
                "total_cost": items_summary.get("total_cost"),
                "is_revision": is_revision
            }

            if existing_history:
                # Append to existing action array (avoid duplicates)
                # Handle existing actions - ensure it's always a list
                if existing_history.action is None:
                    current_actions = []
                elif isinstance(existing_history.action, list):
                    current_actions = existing_history.action
                elif isinstance(existing_history.action, dict):
                    current_actions = [existing_history.action]
                else:
                    current_actions = []

                # Check if similar action already exists (same type, sender, receiver, timestamp within 1 minute)
                action_exists = False
                for existing_action in current_actions:
                    if (existing_action.get('type') == new_action['type'] and
                        existing_action.get('sender') == new_action['sender'] and
                        existing_action.get('receiver') == new_action['receiver']):
                        # Check if timestamps are within 1 minute (to avoid duplicate on retry)
                        existing_ts = existing_action.get('timestamp', '')
                        new_ts = new_action['timestamp']
                        if existing_ts and new_ts:
                            try:
                                existing_dt = datetime.fromisoformat(existing_ts)
                                new_dt = datetime.fromisoformat(new_ts)
                                if abs((new_dt - existing_dt).total_seconds()) < 60:
                                    action_exists = True
                                    break
                            except:
                                pass

                if not action_exists:
                    current_actions.append(new_action)
                    existing_history.action = current_actions
                    # Mark JSONB field as modified for SQLAlchemy
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(existing_history, "action")

                existing_history.action_by = user_name
                existing_history.boq_status = "Pending"
                existing_history.sender = user_name
                existing_history.receiver = td_name if td_name else td_email
                existing_history.comments = comments if comments else "BOQ sent for review and approval"
                existing_history.sender_role = user_role
                existing_history.receiver_role = 'technicalDirector'
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = user_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                # Create new history entry with action as array
                boq_history = BOQHistory(
                    boq_id=boq_id,
                    action=[new_action],  # Store as array
                    action_by=user_name,
                    boq_status="Pending",
                    sender=user_name,
                    receiver=td_name if td_name else td_email,
                    comments=comments if comments else "BOQ sent for review and approval",
                    sender_role=user_role,
                    receiver_role='technicalDirector',
                    action_date=datetime.utcnow(),
                    created_by=user_name
                )
                db.session.add(boq_history)

            db.session.commit()

            return jsonify({
                "success": True,
                "message": "BOQ review email sent successfully to Technical Director",
                "boq_id": boq_id,
                "recipient": td_email
            }), 200
            # else:
            #     return jsonify({
            #         "success": False,
            #         "message": "Failed to send BOQ review email",
            #         "boq_id": boq_id,
            #         "error": "Email service failed"
            #     }), 500
        else:
            # Send to the Technical Director (auto-detect)
            td_role = Role.query.filter_by(role='technicalDirector').first()

            if not td_role:
                return jsonify({
                    "error": "Technical Director role not found",
                    "message": "Technical Director role not configured in the system"
                }), 404

            technical_director = User.query.filter_by(
                role_id=td_role.role_id,
                is_active=True,
                is_deleted=False
            ).first()

            if not technical_director:
                return jsonify({
                    "error": "No Technical Director found",
                    "message": "No active Technical Director found in the system"
                }), 404

            if not technical_director.email:
                return jsonify({
                    "error": "Technical Director has no email",
                    "message": f"Technical Director {technical_director.full_name} does not have an email address"
                }), 400

            # Send email to the Technical Director
            # email_sent = boq_email_service.send_boq_to_technical_director(
            #     boq_data, project_data, items_summary, technical_director.email
            # )

            # if email_sent:
                # Update BOQ status and mark email as sent to TD
                # Check if this is a revision (was Rejected, Client_Rejected, Under_Revision, Pending_Revision, Revision_Approved, or client_revision_rejected) or a new submission
            is_revision = boq.status in ["Rejected", "Client_Rejected", "Under_Revision", "Pending_Revision", "Revision_Approved", "client_revision_rejected"]
            new_status = "Pending_Revision" if is_revision else "Pending"

            boq.email_sent = True
            boq.status = new_status
            boq.last_modified_by = boq.created_by
            boq.last_modified_at = datetime.utcnow()

            # Check if history entry already exists for this BOQ
            existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

            # Prepare action data in the new format
            new_action = {
                "role": user_role,
                "type": "revision_sent" if is_revision else "email_sent",
                "sender": user_name,
                "receiver": "technicalDirector",
                "status": new_status.lower(),
                "comments": comments if comments else "BOQ sent for review and approval",
                "timestamp": datetime.utcnow().isoformat(),
                "decided_by": user_name,
                "decided_by_user_id": user_id,
                "recipient_email": technical_director.email if technical_director.email else None,
                "recipient_name": technical_director.full_name if technical_director.full_name else None,
                "boq_name": boq.boq_name,
                "project_name": project_data.get("project_name"),
                "total_cost": items_summary.get("total_cost")
            }

            if existing_history:
                # Append to existing action array (avoid duplicates)
                # Handle existing actions - ensure it's always a list
                if existing_history.action is None:
                    current_actions = []
                elif isinstance(existing_history.action, list):
                    current_actions = existing_history.action
                elif isinstance(existing_history.action, dict):
                    current_actions = [existing_history.action]
                else:
                    current_actions = []

                # Check if similar action already exists (same type, sender, receiver, timestamp within 1 minute)
                action_exists = False
                for existing_action in current_actions:
                    if (existing_action.get('type') == new_action['type'] and
                        existing_action.get('sender') == new_action['sender'] and
                        existing_action.get('receiver') == new_action['receiver']):
                        # Check if timestamps are within 1 minute (to avoid duplicate on retry)
                        existing_ts = existing_action.get('timestamp', '')
                        new_ts = new_action['timestamp']
                        if existing_ts and new_ts:
                            try:
                                existing_dt = datetime.fromisoformat(existing_ts)
                                new_dt = datetime.fromisoformat(new_ts)
                                if abs((new_dt - existing_dt).total_seconds()) < 60:
                                    action_exists = True
                                    break
                            except:
                                pass

                if not action_exists:
                    current_actions.append(new_action)
                    existing_history.action = current_actions
                    # Mark JSONB field as modified for SQLAlchemy
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(existing_history, "action")

                existing_history.action_by = user_name
                existing_history.boq_status = "Pending"
                existing_history.sender = user_name
                existing_history.receiver = technical_director.full_name if technical_director.full_name else technical_director.email
                existing_history.comments = comments if comments else "BOQ sent for review and approval"
                existing_history.sender_role = user_role
                existing_history.receiver_role = 'technicalDirector'
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = user_name
                existing_history.last_modified_at = datetime.utcnow()
            else:
                # Create new history entry with action as array
                boq_history = BOQHistory(
                    boq_id=boq_id,
                    action=[new_action],  # Store as array
                    action_by=user_name,
                    boq_status="Pending",
                    sender=user_name,
                    receiver=technical_director.full_name if technical_director.full_name else technical_director.email,
                    comments=comments if comments else "BOQ sent for review and approval",
                    sender_role=user_role,
                    receiver_role='technicalDirector',
                    action_date=datetime.utcnow(),
                    created_by=user_name
                )
                db.session.add(boq_history)

            db.session.commit()

            return jsonify({
                "success": True,
                "message": "BOQ review email sent successfully to Technical Director",
                "boq_id": boq_id,
                "email": technical_director.email,
            }), 200
            # else:
            #     return jsonify({
            #         "success": False,
            #         "message": "Failed to send BOQ review email to Technical Director",
            #         "boq_id": boq_id,
            #         "error": "Email service failed"
            #     }), 500

    except Exception as e:
        log.error(f"Error sending BOQ email for BOQ {boq_id}: {str(e)}")
        return jsonify({
            "success": False,
            "message": "Failed to send BOQ email notification",
            "error": str(e)
        }), 500

def get_boq_history(boq_id):
    try:
        boq_history_records = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).all()

        history_list = []
        for h in boq_history_records:
            history_list.append({
                "boq_history_id": h.boq_history_id,
                "boq_id": h.boq_id,
                "action": h.action,
                "action_by": h.action_by,
                "boq_status": h.boq_status,
                "sender": h.sender,
                "receiver": h.receiver,
                "comments": h.comments,
                "sender_role": h.sender_role,
                "receiver_role": h.receiver_role,
                "action_date": h.action_date.isoformat() if h.action_date else None,
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "created_by": h.created_by
            })

        return jsonify({
            "boq_history": history_list
        }), 200
    except Exception as e:
        db.session.rollback()
        log.error(f"Error fetching BOQ history: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_estimator_dashboard():
    try:
        from datetime import datetime, timedelta
        from collections import defaultdict

        # Get current user context
        current_user = getattr(g, 'user', None)
        user_id = current_user.get('user_id') if current_user else None
        user_role = current_user.get('role', '').lower() if current_user else ''

        # Get effective user context (handles admin viewing as other roles)
        context = get_effective_user_context()

        # PERFORMANCE FIX: Use eager loading to prevent N+1 queries
        from sqlalchemy.orm import selectinload

        # Get BOQs and Projects based on user role with eager loading
        if user_role == 'admin' or not should_apply_role_filter(context):
            # Admin sees all BOQs and projects with eager-loaded relationships
            all_boqs = BOQ.query.options(
                selectinload(BOQ.details)  # Fixed: use 'details' not 'boq_details'
            ).filter_by(is_deleted=False).all()
            projects = Project.query.options(
                selectinload(Project.boqs).selectinload(BOQ.details)  # Fixed relationship name
            ).filter_by(is_deleted=False).all()
        else:
            # Estimators see their assigned projects OR projects with no estimator
            projects = Project.query.options(
                selectinload(Project.boqs).selectinload(BOQ.details)  # Fixed relationship name
            ).filter(
                Project.is_deleted == False
            ).filter(
                or_(
                    Project.estimator_id == user_id,
                    Project.estimator_id == None
                )
            ).all()
            project_ids = [p.project_id for p in projects]
            if project_ids:
                all_boqs = BOQ.query.options(
                    selectinload(BOQ.details)  # Fixed relationship name
                ).filter(BOQ.project_id.in_(project_ids), BOQ.is_deleted == False).all()
            else:
                all_boqs = []

        # Initialize lists BEFORE using them
        monthly_trend = []
        top_projects = []
        recent_activities = []

        # Get current month start date
        now = datetime.utcnow()
        current_month_start = datetime(now.year, now.month, 1)

        # Initialize totals
        total_selling_amount = 0
        total_profit_amount = 0
        total_material_cost = 0
        total_labor_cost = 0
        total_item_count = 0
        total_material_count = 0
        total_labor_count = 0

        # Monthly trend tracking
        monthly_data = defaultdict(lambda: {"count": 0, "value": 0})

        # PERFORMANCE FIX: Use pre-loaded relationships instead of additional queries
        # Calculate metrics for each project
        for project in projects:
            # Use already-loaded BOQs relationship instead of querying
            project_boqs = [boq for boq in project.boqs if not boq.is_deleted] if hasattr(project, 'boqs') and project.boqs else []
            if not project_boqs:
                continue

            project_total_value = 0
            project_total_material = 0
            project_total_labor = 0
            project_total_items = 0
            project_material_count = 0
            project_labor_count = 0

            for boq in project_boqs:
                # Use pre-loaded relationship instead of querying (relationship name is 'details')
                boq_details = boq.details[0] if hasattr(boq, 'details') and boq.details else None

                if boq_details:
                    selling_price = float(boq_details.total_cost) if boq_details.total_cost else 0.0
                    project_total_value += selling_price
                    total_selling_amount += selling_price

                    items_count = int(boq_details.total_items) if boq_details.total_items else 0
                    project_total_items += items_count
                    total_item_count += items_count

                    # Get material and labor costs from JSON
                    if boq_details.boq_details and 'summary' in boq_details.boq_details:
                        summary = boq_details.boq_details['summary']
                        material_cost = float(summary.get('total_material_cost', 0))
                        labor_cost = float(summary.get('total_labor_cost', 0))

                        project_total_material += material_cost
                        total_material_cost += material_cost

                        project_total_labor += labor_cost
                        total_labor_cost += labor_cost

                        # Count items with material/labor
                        items = boq_details.boq_details.get('items', [])
                        for item in items:
                            if item.get('material_cost', 0) > 0:
                                project_material_count += 1
                                total_material_count += 1
                            if item.get('labor_cost', 0) > 0:
                                project_labor_count += 1
                                total_labor_count += 1

                            base_cost = float(item.get('base_cost', 0))
                            item_selling_price = float(item.get('selling_price', 0))
                            profit = item_selling_price - base_cost
                            total_profit_amount += profit

                    # Monthly trend data
                    if boq.created_at:
                        month_key = boq.created_at.strftime('%B %Y')
                        monthly_data[month_key]["count"] += 1
                        monthly_data[month_key]["value"] += selling_price

            # Store project details with all metrics
            top_projects.append({
                "project_id": project.project_id,
                "project_name": project.project_name,
                "boq_count": len(project_boqs),
                "total_value": round(project_total_value, 2),
                "total_items": project_total_items,
                "material_count": project_material_count,
                "labor_count": project_labor_count,
                "material_cost": round(project_total_material, 2),
                "labor_cost": round(project_total_labor, 2)
            })

            recent_activities.append({
                "project_id": project.project_id,
                "project_name": project.project_name,
                "boq_count": len(project_boqs),
                "value": round(project_total_value, 2)
            })

        # Monthly trend (last 6 months)
        for i in range(5, -1, -1):
            month_date = now - timedelta(days=30*i)
            month_key = month_date.strftime('%B %Y')
            monthly_trend.append({
                "month": month_key,
                "count": monthly_data[month_key]["count"],
                "value": round(monthly_data[month_key]["value"], 2)
            })

        # Sort top projects by value
        top_projects = sorted(top_projects, key=lambda x: x['total_value'], reverse=True)[:5]

        # Calculate average approval time
        approved_boqs = [boq for boq in all_boqs if boq.status == 'Approved' and boq.last_modified_at and boq.created_at]
        average_approval_time = 0
        if approved_boqs:
            total_days = sum([(boq.last_modified_at - boq.created_at).days for boq in approved_boqs])
            average_approval_time = round(total_days / len(approved_boqs), 1)

        return jsonify({
            # Summary metrics
            "total_projects": len(projects),
            "total_boqs": len(all_boqs),
            "total_selling_amount": round(total_selling_amount, 2),
            "total_profit_amount": round(total_profit_amount, 2),
            "total_material_cost": round(total_material_cost, 2),
            "total_labor_cost": round(total_labor_cost, 2),
            "total_items": total_item_count,
            "total_material_count": total_material_count,
            "total_labor_count": total_labor_count,

            # Status breakdown
            "pending_boqs": len([boq for boq in all_boqs if boq.status == 'Pending']),
            "approved_boqs": len([boq for boq in all_boqs if boq.status == 'Approved']),
            "rejected_boqs": len([boq for boq in all_boqs if boq.status == 'Rejected']),
            "draft_boqs": len([boq for boq in all_boqs if boq.status == 'Draft']),
            "sent_for_confirmation_boqs": len([boq for boq in all_boqs if boq.status == 'Sent_for_Confirmation']),

            # Additional metrics
            "average_approval_time": average_approval_time,

            # Detailed data
            "monthly_trend": monthly_trend,
            "top_projects": top_projects,
            "recent_activities": recent_activities
        }), 200
    except Exception as e:
        db.session.rollback()
        log.error(f"Error fetching Estimator dashboard: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_sub_item(item_id):
    """Get all sub-items for a given item_id with their materials and labour"""
    try:
        # Check if the item exists
        boq_item = MasterItem.query.filter_by(item_id=item_id, is_deleted=False).first()
        if not boq_item:
            return jsonify({"error": "BOQ Item not found"}), 404

        # Get all sub-items for this item
        boq_sub_items = MasterSubItem.query.filter_by(
            item_id=item_id,
            is_deleted=False
        ).all()

        sub_item_details = []
        for sub_item in boq_sub_items:
            # Get materials for this sub-item
            materials = MasterMaterial.query.filter_by(
                sub_item_id=sub_item.sub_item_id,
                is_active=True
            ).all()

            material_list = []
            for material in materials:
                material_list.append({
                    "material_id": material.material_id,
                    "material_name": material.material_name,
                    "description" : material.description,
                    "size" : material.size,
                    "specification" : material.specification,
                    "quantity" : material.quantity,
                    "location": None,  # Location is stored in sub_item, not material
                    "brand": material.brand,  # Brand is stored in sub_item, not material
                    "unit": material.default_unit,
                    "current_market_price": material.current_market_price,
                    "is_active": material.is_active
                })

            # Get labour for this sub-item
            labours = MasterLabour.query.filter_by(
                sub_item_id=sub_item.sub_item_id,
                is_active=True
            ).all()

            labour_list = []
            for labour in labours:
                labour_list.append({
                    "labour_id": labour.labour_id,
                    "labour_role": labour.labour_role,
                    "work_type": labour.work_type,
                    "hours": labour.hours,
                    "rate_per_hour": labour.rate_per_hour,
                    "amount": labour.amount,
                    "is_active": labour.is_active
                })

            # Calculate total costs
            total_materials_cost = sum(
                (mat.current_market_price or 0) for mat in materials
            )
            total_labour_cost = sum(
                (lab.amount or 0) for lab in labours
            )

            sub_item_details.append({
                "sub_item_id": sub_item.sub_item_id,
                "item_id": sub_item.item_id,
                "sub_item_name": sub_item.sub_item_name,
                "scope" : sub_item.description,
                "size" : sub_item.size,
                "description": sub_item.description,
                "location": sub_item.location,
                "brand": sub_item.brand,
                "sub_item_image": sub_item.sub_item_image,
                "unit": sub_item.unit,
                "quantity": sub_item.quantity,
                "per_unit_cost": sub_item.per_unit_cost,
                "sub_item_total_cost": sub_item.sub_item_total_cost,
                "materials": material_list,
                "labour": labour_list,
                "total_materials_cost": total_materials_cost,
                "total_labour_cost": total_labour_cost,
                "total_cost": total_materials_cost + total_labour_cost,
                "created_at": sub_item.created_at.isoformat() if sub_item.created_at else None,
                "created_by": sub_item.created_by
            })

        # Collect all unique materials from sub-items for the dropdown
        all_materials_dict = {}
        for sub_item_detail in sub_item_details:
            for material in sub_item_detail.get('materials', []):
                mat_id = material['material_id']
                if mat_id not in all_materials_dict:
                    all_materials_dict[mat_id] = {
                        "material_id": mat_id,
                        "item_id": boq_item.item_id,
                        "item_name": boq_item.item_name,
                        "material_name": material['material_name'],
                        "description" : material['description'],
                        "size" : material['size'],
                        "brand" : material['brand'],
                        "specification" : material['specification'],
                        "quantity" : material['quantity'],
                        "current_market_price": material['current_market_price'],
                        "default_unit": material['unit']
                    }

        # Also fetch materials from purchased change requests for this item
        # Query material_purchase_tracking for materials added via change requests
        from models.boq import MaterialPurchaseTracking
        cr_materials = MaterialPurchaseTracking.query.filter(
            MaterialPurchaseTracking.master_item_id == item_id,
            MaterialPurchaseTracking.is_from_change_request == True
        ).all()

        for cr_mat in cr_materials:
            mat_id = cr_mat.master_material_id
            if mat_id and mat_id not in all_materials_dict:
                # Fetch the full material details from boq_material
                master_material = MasterMaterial.query.filter_by(
                    material_id=mat_id,
                    is_active=True
                ).first()

                if master_material:
                    all_materials_dict[mat_id] = {
                        "material_id": mat_id,
                        "item_id": boq_item.item_id,
                        "item_name": boq_item.item_name,
                        "material_name": master_material.material_name,
                        "description" : master_material.description,
                        "size" : master_material.size,
                        "specification" : master_material.specification,
                        "quantity" : master_material.quantity,
                        "brand" : master_material.brand,
                        "current_market_price": master_material.current_market_price,
                        "default_unit": master_material.default_unit,
                        "is_from_change_request": True
                    }

        materials_for_dropdown = list(all_materials_dict.values())

        return jsonify({
            "item_id": boq_item.item_id,
            "item_name": boq_item.item_name,
            "scope" : sub_item.description,
            "size" : sub_item.size,
            "item_description": boq_item.description,
            "sub_items_count": len(sub_item_details),
            "sub_items": sub_item_details,
            "materials": materials_for_dropdown  # Top-level materials array for dropdown
        }), 200

    except Exception as e:
        db.session.rollback()
        log.error(f"Error fetching sub-items for item {item_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


# ===================================
# Custom Units Management
# ===================================

def get_custom_units():
    """Get all custom units (non-deleted)"""
    try:
        custom_units = CustomUnit.query.filter_by(is_deleted=False).order_by(CustomUnit.unit_label.asc()).all()

        units_data = []
        for unit in custom_units:
            units_data.append({
                "unit_id": unit.unit_id,
                "value": unit.unit_value,
                "label": unit.unit_label,
                "created_at": unit.created_at.isoformat() if unit.created_at else None,
                "created_by": unit.created_by
            })

        log.info(f"Retrieved {len(units_data)} custom units")
        return jsonify({
            "message": "Custom units retrieved successfully",
            "custom_units": units_data
        }), 200

    except Exception as e:
        log.error(f"Error fetching custom units: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def create_custom_unit():
    """Create a new custom unit"""
    try:
        data = request.get_json()
        current_user = g.user

        # Validate required fields
        unit_value = data.get('unit_value', '').strip().lower()
        unit_label = data.get('unit_label', '').strip()

        if not unit_value or not unit_label:
            return jsonify({"error": "Both unit_value and unit_label are required"}), 400

        # Check if unit already exists (case-insensitive)
        existing_unit = CustomUnit.query.filter(
            func.lower(CustomUnit.unit_value) == unit_value,
            CustomUnit.is_deleted == False
        ).first()

        if existing_unit:
            return jsonify({
                "message": "Unit already exists",
                "unit": {
                    "unit_id": existing_unit.unit_id,
                    "value": existing_unit.unit_value,
                    "label": existing_unit.unit_label
                }
            }), 200

        # Create new custom unit
        new_unit = CustomUnit(
            unit_value=unit_value,
            unit_label=unit_label,
            created_by=current_user.get('email', 'Unknown')
        )

        db.session.add(new_unit)
        db.session.commit()

        log.info(f"Created custom unit: {unit_label} ({unit_value}) by {current_user.get('email')}")

        return jsonify({
            "message": "Custom unit created successfully",
            "unit": {
                "unit_id": new_unit.unit_id,
                "value": new_unit.unit_value,
                "label": new_unit.unit_label,
                "created_at": new_unit.created_at.isoformat() if new_unit.created_at else None
            }
        }), 201

    except SQLAlchemyError as e:
        db.session.rollback()
        log.error(f"Database error creating custom unit: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        db.session.rollback()
        log.error(f"Error creating custom unit: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
