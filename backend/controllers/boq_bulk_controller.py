"""
BOQ Bulk Upload Controller
Handles bulk BOQ creation from Excel files
"""
from flask import request, jsonify, g
from werkzeug.utils import secure_filename
from datetime import datetime
import os
import uuid
import gc
import time
from config.db import db
from models.boq import BOQ, BOQDetails, MasterItem, MasterMaterial, MasterLabour
from models.project import Project
from utils.excel_parser import parse_boq_excel
from config.logging import get_logger

log = get_logger()

# File upload configuration
ALLOWED_EXTENSIONS = {'xlsx', 'xls'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def allowed_file(filename):
    """Check if file extension is allowed for bulk upload"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def add_to_master_tables_bulk(item_name, description, work_type, materials_data, labour_data, created_by,
                               overhead_percentage=None, overhead_amount=None,
                               profit_margin_percentage=None, profit_margin_amount=None):
    """
    Add items, materials, and labour to master tables
    Same as boq_controller.add_to_master_tables but adapted for bulk operations
    """
    master_item_id = None
    master_material_ids = []
    master_labour_ids = []

    # Add to master items (prevent duplicates)
    master_item = MasterItem.query.filter_by(item_name=item_name).first()
    if not master_item:
        master_item = MasterItem(
            item_name=item_name,
            description=description,
            overhead_percentage=overhead_percentage,
            overhead_amount=overhead_amount,
            profit_margin_percentage=profit_margin_percentage,
            profit_margin_amount=profit_margin_amount,
            created_by=created_by
        )
        db.session.add(master_item)
        db.session.flush()
    else:
        # Update description and overhead/profit values
        if description:
            master_item.description = description
        master_item.overhead_percentage = overhead_percentage
        master_item.overhead_amount = overhead_amount
        master_item.profit_margin_percentage = profit_margin_percentage
        master_item.profit_margin_amount = profit_margin_amount
        db.session.flush()

    master_item_id = master_item.item_id

    # Add to master materials (prevent duplicates)
    for mat_data in materials_data:
        material_name = mat_data.get("material_name")
        unit_price = mat_data.get("unit_price", 0.0)
        master_material = MasterMaterial.query.filter_by(material_name=material_name).first()
        if not master_material:
            master_material = MasterMaterial(
                material_name=material_name,
                item_id=master_item_id,
                default_unit=mat_data.get("unit", "nos"),
                current_market_price=unit_price,
                created_by=created_by
            )
            db.session.add(master_material)
            db.session.flush()
        else:
            # Update existing material
            if master_material.item_id is None:
                master_material.item_id = master_item_id
            master_material.current_market_price = unit_price
            new_unit = mat_data.get("unit", "nos")
            if master_material.default_unit != new_unit:
                master_material.default_unit = new_unit
            db.session.flush()

        master_material_ids.append(master_material.material_id)

    # Add to master labour (prevent duplicates)
    for labour_data_item in labour_data:
        labour_role = labour_data_item.get("labour_role")
        rate_per_hour = labour_data_item.get("rate_per_hour", 0.0)
        hours = labour_data_item.get("hours", 0.0)
        labour_amount = float(rate_per_hour) * float(hours)

        master_labour = MasterLabour.query.filter_by(labour_role=labour_role).first()

        if not master_labour:
            master_labour = MasterLabour(
                labour_role=labour_role,
                item_id=master_item_id,
                work_type=work_type,
                hours=float(hours),
                rate_per_hour=float(rate_per_hour),
                amount=labour_amount,
                created_by=created_by
            )
            db.session.add(master_labour)
            db.session.flush()
        else:
            # Update existing labour
            if master_labour.item_id is None:
                master_labour.item_id = master_item_id
            if master_labour.work_type is None and work_type:
                master_labour.work_type = work_type
            master_labour.hours = float(hours)
            master_labour.rate_per_hour = float(rate_per_hour)
            master_labour.amount = labour_amount
            db.session.flush()

        master_labour_ids.append(master_labour.labour_id)

    return master_item_id, master_material_ids, master_labour_ids


def bulk_upload_boq():
    """
    Handle bulk BOQ upload from Excel file
    """
    try:
        log.info("=== Bulk BOQ Upload Request Started ===")
        log.info(f"Files: {list(request.files.keys())}")
        log.info(f"Form: {dict(request.form)}")

        # Check if file is present
        if 'file' not in request.files:
            log.error("No file in request.files")
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']

        if file.filename == '':
            log.error("Empty filename")
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        log.info(f"Received file: {file.filename}, size: {file.content_length}")

        if not allowed_file(file.filename):
            log.error(f"Invalid file extension: {file.filename}")
            return jsonify({
                'success': False,
                'error': f'Invalid file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400

        # Get request data
        project_id = request.form.get('project_id')
        boq_name = request.form.get('boq_name')

        log.info(f"Project ID: {project_id}, BOQ Name: {boq_name}")

        if not project_id:
            return jsonify({'success': False, 'error': 'Project ID is required'}), 400

        if not boq_name:
            return jsonify({'success': False, 'error': 'BOQ Name is required'}), 400

        # Validate project exists
        project = Project.query.filter_by(project_id=project_id).first()
        if not project:
            return jsonify({'success': False, 'error': 'Project not found'}), 404

        # Get user info
        current_user = getattr(g, 'user', None)
        if current_user:
            created_by = current_user.get('username') or current_user.get('full_name') or current_user.get('user_id', 'Estimator')
        else:
            created_by = 'Estimator'

        # Read file content
        file_content = file.read()

        # Check file size
        if len(file_content) > MAX_FILE_SIZE:
            return jsonify({'success': False, 'error': 'File size exceeds 10MB limit'}), 400

        # Save file temporarily
        temp_dir = 'temp_uploads'
        os.makedirs(temp_dir, exist_ok=True)

        filename = secure_filename(file.filename)
        temp_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{filename}")

        with open(temp_path, 'wb') as f:
            f.write(file_content)

        try:
            # Parse Excel file
            success, parse_result = parse_boq_excel(temp_path)

            if not success:
                return jsonify({
                    'success': False,
                    'error': 'Failed to parse Excel file',
                    'errors': parse_result.get('errors', []),
                    'warnings': parse_result.get('warnings', [])
                }), 400

            items_data = parse_result.get('items', [])

            if not items_data:
                return jsonify({
                    'success': False,
                    'error': 'No valid items found in Excel file',
                    'errors': parse_result.get('errors', []),
                    'warnings': parse_result.get('warnings', [])
                }), 400

            # Create BOQ
            boq = BOQ(
                project_id=project_id,
                boq_name=boq_name,
                status='Draft',
                created_by=created_by,
            )
            db.session.add(boq)
            db.session.flush()  # Get boq_id

            # Process items and create JSON structure
            boq_items = []
            total_boq_cost = 0
            total_materials = 0
            total_labour = 0

            for item_data in items_data:
                materials_data = item_data.get('materials', [])
                labour_data = item_data.get('labour', [])

                # Calculate costs
                materials_cost = sum(
                    mat.get('quantity', 0) * mat.get('unit_price', 0)
                    for mat in materials_data
                )

                labour_cost = sum(
                    lab.get('hours', 0) * lab.get('rate_per_hour', 0)
                    for lab in labour_data
                )

                base_cost = materials_cost + labour_cost

                # Get overhead and profit percentages
                overhead_percentage = item_data.get('overhead_percentage', 10.0)
                profit_margin_percentage = item_data.get('profit_margin_percentage', 15.0)

                # Calculate amounts
                overhead_amount = (base_cost * overhead_percentage) / 100
                profit_margin_amount = (base_cost * profit_margin_percentage) / 100
                total_cost = base_cost + overhead_amount
                selling_price = total_cost + profit_margin_amount

                # Add to master tables
                master_item_id, master_material_ids, master_labour_ids = add_to_master_tables_bulk(
                    item_data.get('item_name'),
                    item_data.get('description'),
                    item_data.get('work_type', 'contract'),
                    materials_data,
                    labour_data,
                    created_by,
                    overhead_percentage,
                    overhead_amount,
                    profit_margin_percentage,
                    profit_margin_amount
                )

                # Process materials for BOQ details
                item_materials = []
                for i, mat_data in enumerate(materials_data):
                    quantity = mat_data.get('quantity', 1.0)
                    unit_price = mat_data.get('unit_price', 0.0)
                    total_price = quantity * unit_price

                    item_materials.append({
                        "master_material_id": master_material_ids[i] if i < len(master_material_ids) else None,
                        "material_name": mat_data.get('material_name'),
                        "quantity": quantity,
                        "unit": mat_data.get('unit', 'nos'),
                        "unit_price": unit_price,
                        "total_price": total_price
                    })

                # Process labour for BOQ details
                item_labour = []
                for i, labour_data_item in enumerate(labour_data):
                    hours = labour_data_item.get('hours', 0.0)
                    rate_per_hour = labour_data_item.get('rate_per_hour', 0.0)
                    total_cost_labour = hours * rate_per_hour

                    item_labour.append({
                        "master_labour_id": master_labour_ids[i] if i < len(master_labour_ids) else None,
                        "labour_role": labour_data_item.get('labour_role'),
                        "hours": hours,
                        "rate_per_hour": rate_per_hour,
                        "total_cost": total_cost_labour
                    })

                # Create item JSON structure
                item_json = {
                    "master_item_id": master_item_id,
                    "item_name": item_data.get('item_name'),
                    "description": item_data.get('description'),
                    "work_type": item_data.get('work_type', 'contract'),
                    "base_cost": base_cost,
                    "overhead_percentage": overhead_percentage,
                    "overhead_amount": overhead_amount,
                    "profit_margin_percentage": profit_margin_percentage,
                    "profit_margin_amount": profit_margin_amount,
                    "total_cost": total_cost,
                    "selling_price": selling_price,
                    "totalMaterialCost": materials_cost,
                    "totalLabourCost": labour_cost,
                    "actualItemCost": base_cost,
                    "estimatedSellingPrice": selling_price,
                    "materials": item_materials,
                    "labour": item_labour
                }

                boq_items.append(item_json)
                total_boq_cost += selling_price
                total_materials += len(item_materials)
                total_labour += len(item_labour)

            # Create BOQ details JSON
            boq_details_json = {
                "boq_id": boq.boq_id,
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
                "success": True,
                "message": "BOQ created successfully from bulk upload",
                "boq_id": boq.boq_id,
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
                },
                "warnings": parse_result.get('warnings', [])
            }), 201

        finally:
            # Clean up temp file with multiple retry attempts
            if os.path.exists(temp_path):
                # Force garbage collection to release file handles
                gc.collect()

                # Try to delete with multiple retries (Windows file locking workaround)
                max_retries = 5
                for attempt in range(max_retries):
                    try:
                        # Wait a bit for file handles to be released
                        time.sleep(0.2 * (attempt + 1))
                        os.remove(temp_path)
                        log.info(f"Successfully deleted temp file: {temp_path}")
                        break
                    except PermissionError as e:
                        if attempt < max_retries - 1:
                            log.debug(f"Attempt {attempt + 1}/{max_retries} to delete {temp_path} failed, retrying...")
                            gc.collect()  # Force another GC
                        else:
                            log.warning(f"Could not delete temp file after {max_retries} attempts: {temp_path}. Error: {e}")
                    except Exception as cleanup_error:
                        log.warning(f"Error deleting temp file {temp_path}: {cleanup_error}")
                        break

    except Exception as e:
        db.session.rollback()
        log.error(f"Error in bulk BOQ upload: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': f'Error processing bulk upload: {str(e)}'
        }), 500
