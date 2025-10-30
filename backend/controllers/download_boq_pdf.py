"""
BOQ PDF & Excel Download Controller
Provides endpoints for downloading BOQ PDFs and Excel files (Internal and Client versions)
"""
from flask import request, jsonify, send_file
from models.boq import BOQ, BOQDetails
from models.project import Project
from utils.modern_boq_pdf_generator import ModernBOQPDFGenerator
from controllers.boq_internal_excel_generator import generate_internal_excel
from controllers.send_boq_client import generate_client_excel
from utils.boq_calculation_helper import calculate_boq_values
from config.logging import get_logger
from io import BytesIO
from datetime import date

log = get_logger()


def download_internal_pdf():
    """
    Download BOQ as Internal PDF with full breakdown
    GET /api/boq/download/internal/<boq_id>
    """
    try:
        boq_id = request.view_args.get('boq_id')

        if not boq_id:
            return jsonify({"success": False, "error": "boq_id is required"}), 400

        # Fetch BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Fetch BOQ Details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"success": False, "error": "BOQ details not found"}), 404

        # Extract data
        boq_json = boq_details.boq_details

        # Handle both old and new data structures
        # New structure: items are in existing_purchase.items
        # Old structure: items are directly in boq_json.items
        if 'existing_purchase' in boq_json and 'items' in boq_json['existing_purchase']:
            items = boq_json['existing_purchase']['items']
        else:
            items = boq_json.get('items', [])

        # Calculate all values (this populates selling_price, overhead_amount, etc.)
        total_material_cost, total_labour_cost, items_subtotal, preliminary_amount, grand_total = calculate_boq_values(items, boq_json)

        # Get project
        project = boq.project
        if not project:
            return jsonify({"success": False, "error": "Project not found"}), 404

        # Generate PDF
        generator = ModernBOQPDFGenerator()
        pdf_data = generator.generate_internal_pdf(
            project, items, total_material_cost, total_labour_cost, grand_total, boq_json
        )

        # Send file
        filename = f"BOQ_{project.project_name.replace(' ', '_')}_Internal_{date.today().isoformat()}.pdf"

        return send_file(
            BytesIO(pdf_data),
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        import traceback
        log.error(f"Error downloading internal PDF: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500


def download_client_pdf():
    """
    Download BOQ as Client PDF (clean view)
    GET /api/boq/download/client/<boq_id>
    """
    try:
        boq_id = request.view_args.get('boq_id')

        if not boq_id:
            return jsonify({"success": False, "error": "boq_id is required"}), 400

        # Fetch BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Fetch BOQ Details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"success": False, "error": "BOQ details not found"}), 404

        # Extract data
        boq_json = boq_details.boq_details

        # Handle both old and new data structures
        # New structure: items are in existing_purchase.items
        # Old structure: items are directly in boq_json.items
        if 'existing_purchase' in boq_json and 'items' in boq_json['existing_purchase']:
            items = boq_json['existing_purchase']['items']
        else:
            items = boq_json.get('items', [])

        # Calculate all values (this populates selling_price, overhead_amount, etc.)
        total_material_cost, total_labour_cost, items_subtotal, preliminary_amount, grand_total = calculate_boq_values(items, boq_json)

        # Get project
        project = boq.project
        if not project:
            return jsonify({"success": False, "error": "Project not found"}), 404

        # Generate PDF
        generator = ModernBOQPDFGenerator()
        pdf_data = generator.generate_client_pdf(
            project, items, total_material_cost, total_labour_cost, grand_total, boq_json
        )

        # Send file
        filename = f"BOQ_{project.project_name.replace(' ', '_')}_Client_{date.today().isoformat()}.pdf"

        return send_file(
            BytesIO(pdf_data),
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        import traceback
        log.error(f"Error downloading client PDF: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500


def download_internal_excel():
    """
    Download BOQ as Internal Excel with full breakdown
    GET /api/boq/download/internal-excel/<boq_id>
    """
    try:
        boq_id = request.view_args.get('boq_id')

        if not boq_id:
            return jsonify({"success": False, "error": "boq_id is required"}), 400

        # Fetch BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Fetch BOQ Details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"success": False, "error": "BOQ details not found"}), 404

        # Extract data
        boq_json = boq_details.boq_details

        # Handle both old and new data structures
        if 'existing_purchase' in boq_json and 'items' in boq_json['existing_purchase']:
            items = boq_json['existing_purchase']['items']
        else:
            items = boq_json.get('items', [])

        # Calculate all values
        total_material_cost, total_labour_cost, grand_total = calculate_boq_values(items)

        # Get project
        project = boq.project
        if not project:
            return jsonify({"success": False, "error": "Project not found"}), 404

        # Generate Excel
        excel_data = generate_internal_excel(
            project, items, total_material_cost, total_labour_cost, grand_total, boq_json
        )

        # Send file
        filename = f"BOQ_{project.project_name.replace(' ', '_')}_Internal_{date.today().isoformat()}.xlsx"

        return send_file(
            BytesIO(excel_data),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        import traceback
        log.error(f"Error downloading internal Excel: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500


def download_client_excel():
    """
    Download BOQ as Client Excel (clean view)
    GET /api/boq/download/client-excel/<boq_id>
    """
    try:
        boq_id = request.view_args.get('boq_id')

        if not boq_id:
            return jsonify({"success": False, "error": "boq_id is required"}), 400

        # Fetch BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Fetch BOQ Details
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"success": False, "error": "BOQ details not found"}), 404

        # Extract data
        boq_json = boq_details.boq_details

        # Handle both old and new data structures
        if 'existing_purchase' in boq_json and 'items' in boq_json['existing_purchase']:
            items = boq_json['existing_purchase']['items']
        else:
            items = boq_json.get('items', [])

        # Calculate all values
        total_material_cost, total_labour_cost, grand_total = calculate_boq_values(items)

        # Get project
        project = boq.project
        if not project:
            return jsonify({"success": False, "error": "Project not found"}), 404

        # Generate Excel
        excel_data = generate_client_excel(
            project, items, total_material_cost, total_labour_cost, grand_total, boq_json
        )

        # Send file
        filename = f"BOQ_{project.project_name.replace(' ', '_')}_Client_{date.today().isoformat()}.xlsx"

        return send_file(
            BytesIO(excel_data),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        import traceback
        log.error(f"Error downloading client Excel: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500
