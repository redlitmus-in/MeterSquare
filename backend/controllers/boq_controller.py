from flask import request, jsonify, g
from config.db import db
from models.project import Project
from models.boq import *
from config.logging import get_logger
from sqlalchemy.exc import SQLAlchemyError
from utils.boq_email_service import BOQEmailService
from models.user import User
from models.role import Role

log = get_logger()

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

    # Add to master materials (prevent duplicates) with item_id reference
    for mat_data in materials_data:
        material_name = mat_data.get("material_name")
        unit_price = mat_data.get("unit_price", 0.0)
        master_material = MasterMaterial.query.filter_by(material_name=material_name).first()
        if not master_material:
            master_material = MasterMaterial(
                material_name=material_name,
                item_id=master_item_id,  # Set the item_id reference
                default_unit=mat_data.get("unit", "nos"),
                current_market_price=unit_price,
                created_by=created_by
            )
            db.session.add(master_material)
            db.session.flush()
        else:
            # Update existing material: always update current_market_price and item_id if needed
            if master_material.item_id is None:
                master_material.item_id = master_item_id

            # Always update current_market_price with the new unit_price from BOQ
            master_material.current_market_price = unit_price

            # Update unit if different
            new_unit = mat_data.get("unit", "nos")
            if master_material.default_unit != new_unit:
                master_material.default_unit = new_unit

            db.session.flush()
        master_material_ids.append(master_material.material_id)

    # Add to master labour (prevent duplicates) with item_id reference
    for i, labour_data_item in enumerate(labour_data):
        labour_role = labour_data_item.get("labour_role")
        # Get hours and rate_per_hour
        rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
        hours = labour_data_item.get("hours", 0.0)
        labour_amount = float(rate_per_hour) * float(hours)

        master_labour = MasterLabour.query.filter_by(labour_role=labour_role).first()

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
    """Add sub-items to master tables with their materials and labour"""
    master_sub_item_ids = []

    for sub_item in sub_items:
        sub_item_name = sub_item.get("sub_item_name")

        # Check if sub-item already exists for this master item
        master_sub_item = MasterSubItem.query.filter_by(
            item_id=master_item_id,
            sub_item_name=sub_item_name
        ).first()

        if not master_sub_item:
            master_sub_item = MasterSubItem(
                item_id=master_item_id,
                sub_item_name=sub_item_name,
                description=sub_item.get("description"),
                location=sub_item.get("location"),
                brand=sub_item.get("brand"),
                unit=sub_item.get("unit"),
                quantity=sub_item.get("quantity"),
                per_unit_cost=sub_item.get("per_unit_cost"),
                sub_item_total_cost=sub_item.get("per_unit_cost", 0) * sub_item.get("quantity", 1) if sub_item.get("per_unit_cost") and sub_item.get("quantity") else None,
                created_by=created_by
            )
            db.session.add(master_sub_item)
            db.session.flush()
        else:
            # Update existing sub-item
            master_sub_item.description = sub_item.get("description")
            master_sub_item.location = sub_item.get("location")
            master_sub_item.brand = sub_item.get("brand")
            master_sub_item.unit = sub_item.get("unit")
            master_sub_item.quantity = sub_item.get("quantity")
            master_sub_item.per_unit_cost = sub_item.get("per_unit_cost")
            master_sub_item.sub_item_total_cost = sub_item.get("per_unit_cost", 0) * sub_item.get("quantity", 1) if sub_item.get("per_unit_cost") and sub_item.get("quantity") else None
            db.session.flush()

        master_sub_item_ids.append(master_sub_item.sub_item_id)

        # Add materials for this sub-item
        for mat_data in sub_item.get("materials", []):
            material_name = mat_data.get("material_name")
            unit_price = mat_data.get("unit_price", 0.0)

            master_material = MasterMaterial.query.filter_by(material_name=material_name).first()
            if not master_material:
                master_material = MasterMaterial(
                    material_name=material_name,
                    item_id=master_item_id,
                    sub_item_id=master_sub_item.sub_item_id,
                    default_unit=mat_data.get("unit", "nos"),
                    current_market_price=unit_price,
                    created_by=created_by
                )
                db.session.add(master_material)
                db.session.flush()
            else:
                # Update existing material
                if master_material.sub_item_id is None:
                    master_material.sub_item_id = master_sub_item.sub_item_id
                if master_material.item_id is None:
                    master_material.item_id = master_item_id
                master_material.current_market_price = unit_price
                master_material.default_unit = mat_data.get("unit", "nos")
                db.session.flush()

        # Add labour for this sub-item
        for labour_data in sub_item.get("labour", []):
            labour_role = labour_data.get("labour_role")
            rate_per_hour = labour_data.get("rate_per_hour", 0.0)
            hours = labour_data.get("hours", 0.0)
            labour_amount = float(rate_per_hour) * float(hours)

            master_labour = MasterLabour.query.filter_by(labour_role=labour_role).first()
            if not master_labour:
                master_labour = MasterLabour(
                    labour_role=labour_role,
                    item_id=master_item_id,
                    sub_item_id=master_sub_item.sub_item_id,
                    work_type="contract",
                    hours=float(hours),
                    rate_per_hour=float(rate_per_hour),
                    amount=labour_amount,
                    created_by=created_by
                )
                db.session.add(master_labour)
                db.session.flush()
            else:
                # Update existing labour
                if master_labour.sub_item_id is None:
                    master_labour.sub_item_id = master_sub_item.sub_item_id
                if master_labour.item_id is None:
                    master_labour.item_id = master_item_id
                master_labour.hours = float(hours)
                master_labour.rate_per_hour = float(rate_per_hour)
                master_labour.amount = labour_amount
                db.session.flush()

    return master_sub_item_ids


def add_sub_items_to_master_tables(master_item_id, sub_items, created_by):
    """Add sub-items to master tables with their materials and labour"""
    master_sub_item_ids = []

    for sub_item in sub_items:
        sub_item_name = sub_item.get("sub_item_name")

        # Check if sub-item already exists for this master item
        master_sub_item = MasterSubItem.query.filter_by(
            item_id=master_item_id,
            sub_item_name=sub_item_name
        ).first()

        if not master_sub_item:
            master_sub_item = MasterSubItem(
                item_id=master_item_id,
                sub_item_name=sub_item_name,
                description=sub_item.get("description"),
                location=sub_item.get("location"),
                brand=sub_item.get("brand"),
                unit=sub_item.get("unit"),
                quantity=sub_item.get("quantity"),
                per_unit_cost=sub_item.get("per_unit_cost"),
                sub_item_total_cost=sub_item.get("per_unit_cost", 0) * sub_item.get("quantity", 1) if sub_item.get("per_unit_cost") and sub_item.get("quantity") else None,
                created_by=created_by
            )
            db.session.add(master_sub_item)
            db.session.flush()
        else:
            # Update existing sub-item
            master_sub_item.description = sub_item.get("description")
            master_sub_item.location = sub_item.get("location")
            master_sub_item.brand = sub_item.get("brand")
            master_sub_item.unit = sub_item.get("unit")
            master_sub_item.quantity = sub_item.get("quantity")
            master_sub_item.per_unit_cost = sub_item.get("per_unit_cost")
            master_sub_item.sub_item_total_cost = sub_item.get("per_unit_cost", 0) * sub_item.get("quantity", 1) if sub_item.get("per_unit_cost") and sub_item.get("quantity") else None
            db.session.flush()

        master_sub_item_ids.append(master_sub_item.sub_item_id)

        # Add materials for this sub-item
        for mat_data in sub_item.get("materials", []):
            material_name = mat_data.get("material_name")
            unit_price = mat_data.get("unit_price", 0.0)

            master_material = MasterMaterial.query.filter_by(material_name=material_name).first()
            if not master_material:
                master_material = MasterMaterial(
                    material_name=material_name,
                    item_id=master_item_id,
                    sub_item_id=master_sub_item.sub_item_id,
                    default_unit=mat_data.get("unit", "nos"),
                    current_market_price=unit_price,
                    created_by=created_by
                )
                db.session.add(master_material)
                db.session.flush()
            else:
                # Update existing material
                if master_material.sub_item_id is None:
                    master_material.sub_item_id = master_sub_item.sub_item_id
                if master_material.item_id is None:
                    master_material.item_id = master_item_id
                master_material.current_market_price = unit_price
                master_material.default_unit = mat_data.get("unit", "nos")
                db.session.flush()

        # Add labour for this sub-item
        for labour_data in sub_item.get("labour", []):
            labour_role = labour_data.get("labour_role")
            rate_per_hour = labour_data.get("rate_per_hour", 0.0)
            hours = labour_data.get("hours", 0.0)
            labour_amount = float(rate_per_hour) * float(hours)

            master_labour = MasterLabour.query.filter_by(labour_role=labour_role).first()
            if not master_labour:
                master_labour = MasterLabour(
                    labour_role=labour_role,
                    item_id=master_item_id,
                    sub_item_id=master_sub_item.sub_item_id,
                    work_type="contract",
                    hours=float(hours),
                    rate_per_hour=float(rate_per_hour),
                    amount=labour_amount,
                    created_by=created_by
                )
                db.session.add(master_labour)
                db.session.flush()
            else:
                # Update existing labour
                if master_labour.sub_item_id is None:
                    master_labour.sub_item_id = master_sub_item.sub_item_id
                if master_labour.item_id is None:
                    master_labour.item_id = master_item_id
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
                log.warning(f"Skipping duplicate item: {item_name}")
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
                        "material_name": mat_data.get("material_name"),
                        "location": mat_data.get("location", ""),
                        "brand": mat_data.get("brand", ""),
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

                # Store processed sub-item
                processed_sub_items.append({
                    "sub_item_name": sub_item.get("sub_item_name"),
                    "scope": sub_item.get("scope", ""),
                    "size": sub_item.get("size", ""),
                    "description": sub_item.get("description", ""),
                    "location": sub_item.get("location", ""),
                    "brand": sub_item.get("brand", ""),
                    "unit": sub_item.get("unit"),
                    "quantity": sub_item.get("quantity"),
                    "per_unit_cost": sub_item.get("per_unit_cost"),
                    "materials": sub_item_materials,
                    "labour": sub_item_labour,
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
        preliminaries = data.get("preliminaries", {})

        # Create BOQ details JSON
        boq_details_json = {
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

        # Save BOQ details
        boq_details = BOQDetails(
            boq_id=boq.boq_id,
            boq_details=boq_details_json,
            total_cost=total_boq_cost,
            total_items=len(boq_items),
            total_materials=total_materials,
            total_labour=total_labour,
            created_by=created_by
        )
        db.session.add(boq_details)

        db.session.commit()

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
        current_user = getattr(g, 'user', None)
        user_role = ''
        user_role_id = None

        if current_user:
            # Try 'role' first (set by jwt_required), then 'role_name' as fallback
            role_name = current_user.get('role') or current_user.get('role_name', '')
            user_role = role_name.lower().replace(' ', '').replace('_', '') if isinstance(role_name, str) else ''
            user_role_id = current_user.get('role_id')
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
        can_view_new_purchase = False
        boq_status = boq.status.lower() if boq.status else ''

        if boq_status in ['new_purchase_create', 'sent_for_review']:
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

        # Get preliminaries from boq_details
        preliminaries = boq_details.boq_details.get("preliminaries", {}) if boq_details.boq_details else {}

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
            "preliminaries": preliminaries,
            "project_details": {
                "project_name": project.project_name if project else None,
                "location": project.location if project else None,
                "floor": project.floor_name if project else None,
                "hours": project.working_hours if project else None,
                "status": project.status if project else None
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

            # Get approved change requests for this BOQ
            approved_change_requests = ChangeRequest.query.filter_by(
                boq_id=boq_id,
                status='approved',
                is_deleted=False
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
        log.error(f"Error fetching BOQ: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_all_boq():
    """Get all BOQs with their details from JSON storage"""
    try:
        # Get all BOQs with their details
        boqs = (
            db.session.query(BOQ, BOQDetails)
            .join(BOQDetails, BOQ.boq_id == BOQDetails.boq_id)
            .filter(BOQ.is_deleted == False)
            .all()
        )
        complete_boqs = []
        for boq, boq_detail in boqs:
            # Fetch project details
            project = Project.query.filter_by(project_id=boq.project_id).first()

            # Check BOQ history for sender and receiver roles
            display_status = boq.status
            boq_history = BOQHistory.query.filter_by(boq_id=boq.boq_id).order_by(BOQHistory.created_at.desc()).first()

            if boq_history and boq_history.sender_role and boq_history.receiver_role:
                sender_role = boq_history.sender_role.lower().replace('_', '').replace(' ', '')
                receiver_role = boq_history.receiver_role.lower().replace('_', '').replace(' ', '')

                # Don't override if BOQ has a definitive status (PM_Approved, PM_Rejected, etc.)
                if sender_role == 'projectmanager' and receiver_role == 'estimator':
                    # Only set to pending if status is not already PM_Approved or PM_Rejected
                    if boq.status not in ['PM_Approved', 'PM_Rejected', 'Pending_TD_Approval', 'Approved', 'Rejected']:
                        display_status = 'pending'
                elif sender_role == 'technicaldirector' and receiver_role == 'projectmanager':
                    display_status = 'Client_Confirmed'
                elif sender_role == 'projectmanager' and receiver_role == 'siteengineer':
                    display_status = 'Client_Confirmed'
                elif sender_role == 'siteengineer' and receiver_role == 'projectmanager':
                    display_status = 'Client_Confirmed'
            elif boq.status in ['new_purchase_create', 'sent_for_review', 'new_purchase_approved', 'new_purchase_rejected', 'approved']:
                display_status = 'Client_Confirmed'

            boq_summary = {
                "boq_id": boq.boq_id,
                "boq_name": boq.boq_name,
                "project_id": boq.project_id,
                "project_name": project.project_name if project else None,
                "client": project.client if project else None,
                "location": project.location if project else None,
                "floor": project.floor_name if project else None,
                "hours": project.working_hours if project else None,
                "status": display_status,
                "revision_number": getattr(boq, 'revision_number', 0) or 0,
                "client_rejection_reason": boq.client_rejection_reason,
                "email_sent" : boq.email_sent,
                "user_id": project.user_id if project else None,  # PM assignment indicator
                "items_count": boq_detail.total_items,
                "material_count": boq_detail.total_materials,
                "labour_count": boq_detail.total_labour,
                "total_cost": boq_detail.total_cost,
                "selling_price": boq_detail.total_cost,
                "estimatedSellingPrice": boq_detail.total_cost,
                "created_at": boq.created_at.isoformat() if boq.created_at else None,
                "created_by": boq.created_by
            }

            # Add items from JSON
            items_list = []
            total_material_cost = 0
            total_labour_cost = 0
            overhead_percentage = 0
            profit_margin = 0

            if boq_detail.boq_details and "items" in boq_detail.boq_details:
                items = boq_detail.boq_details["items"]
                items_list = items

                # Calculate totals from items
                for item in items:
                    # Calculate material cost
                    materials = item.get("materials", [])
                    for mat in materials:
                        total_material_cost += mat.get("total_price", 0)

                    # Calculate labour cost
                    labour = item.get("labour", [])
                    for lab in labour:
                        total_labour_cost += lab.get("total_cost", 0)

                    # Get overhead and profit from first item
                    if overhead_percentage == 0:
                        overhead_percentage = item.get("overhead_percentage", 0)
                    if profit_margin == 0:
                        profit_margin = item.get("profit_margin", 0)

            # Add summary from JSON if available (this will override calculated values if present)
            if boq_detail.boq_details and "summary" in boq_detail.boq_details:
                summary = boq_detail.boq_details["summary"]
                if summary.get("total_material_cost", 0) > 0:
                    total_material_cost = summary.get("total_material_cost", 0)
                if summary.get("total_labour_cost", 0) > 0:
                    total_labour_cost = summary.get("total_labour_cost", 0)
                if summary.get("overhead_percentage", 0) > 0:
                    overhead_percentage = summary.get("overhead_percentage", 0)
                if summary.get("profit_margin", 0) > 0:
                    profit_margin = summary.get("profit_margin", 0)

            boq_summary.update({
                "items": items_list,
                "total_material_cost": total_material_cost,
                "total_labour_cost": total_labour_cost,
                "overhead_percentage": overhead_percentage,
                "profit_margin": profit_margin
            })

            complete_boqs.append(boq_summary)

        return jsonify({
            "message": "BOQs retrieved successfully",
            "count": len(complete_boqs),
            "data": complete_boqs
        }), 200

    except Exception as e:
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

        db.session.commit()

        # Return updated BOQ
        return jsonify({
            "message": "BOQ Updated successfully",
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

        # Create history entry with current BOQ details BEFORE updating
        boq_detail_history = BOQDetailsHistory(
            boq_detail_id=boq_details.boq_detail_id,
            boq_id=boq_id,
            version=next_version,
            boq_details=old_boq_details_json,  # Save OLD state before updating
            total_cost=old_total_cost,
            total_items=old_total_items,
            total_materials=boq_details.total_materials,
            total_labour=boq_details.total_labour,
            created_by=user_name
        )
        db.session.add(boq_detail_history)
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
        print("boq_sub_item:",boq_sub_item)
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
        boq_email_service = BOQEmailService()

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
            email_sent = boq_email_service.send_boq_to_technical_director(
                boq_data, project_data, items_summary, td_email
            )

            if email_sent:
                # Update BOQ status and mark email as sent to TD
                # Check if this is a revision (was Rejected, Client_Rejected, Under_Revision, Pending_Revision, or Revision_Approved) or a new submission
                is_revision = boq.status in ["Rejected", "Client_Rejected", "Under_Revision", "Pending_Revision", "Revision_Approved"]
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
            else:
                return jsonify({
                    "success": False,
                    "message": "Failed to send BOQ review email",
                    "boq_id": boq_id,
                    "error": "Email service failed"
                }), 500
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
            email_sent = boq_email_service.send_boq_to_technical_director(
                boq_data, project_data, items_summary, technical_director.email
            )

            if email_sent:
                # Update BOQ status and mark email as sent to TD
                # Check if this is a revision (was Rejected, Client_Rejected, Under_Revision, Pending_Revision, or Revision_Approved) or a new submission
                is_revision = boq.status in ["Rejected", "Client_Rejected", "Under_Revision", "Pending_Revision", "Revision_Approved"]
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
            else:
                return jsonify({
                    "success": False,
                    "message": "Failed to send BOQ review email to Technical Director",
                    "boq_id": boq_id,
                    "error": "Email service failed"
                }), 500

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
        log.error(f"Error fetching BOQ history: {str(e)}")
        return jsonify({"error": str(e)}), 500

def get_estimator_dashboard():
    try:
        from datetime import datetime, timedelta
        from collections import defaultdict

        # Get all BOQs and Projects
        all_boqs = BOQ.query.filter_by(is_deleted=False).all()
        projects = Project.query.filter_by(is_deleted=False).all()

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

        # Calculate metrics for each project
        for project in projects:
            project_boqs = BOQ.query.filter_by(project_id=project.project_id, is_deleted=False).all()
            if not project_boqs:
                continue

            project_total_value = 0
            project_total_material = 0
            project_total_labor = 0
            project_total_items = 0
            project_material_count = 0
            project_labor_count = 0

            for boq in project_boqs:
                boq_details = BOQDetails.query.filter_by(boq_id=boq.boq_id, is_deleted=False).first()

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
                    "location": None,  # Location is stored in sub_item, not material
                    "brand": None,  # Brand is stored in sub_item, not material
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
                "description": sub_item.description,
                "location": sub_item.location,
                "brand": sub_item.brand,
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

        return jsonify({
            "item_id": boq_item.item_id,
            "item_name": boq_item.item_name,
            "item_description": boq_item.description,
            "sub_items_count": len(sub_item_details),
            "sub_items": sub_item_details
        }), 200

    except Exception as e:
        log.error(f"Error fetching sub-items for item {item_id}: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500