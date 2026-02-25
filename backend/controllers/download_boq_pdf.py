"""
BOQ PDF & Excel Download Controller
Provides endpoints for downloading BOQ PDFs and Excel files (Internal and Client versions)
"""
from flask import request, jsonify, send_file
from models.boq import *
from models.project import Project
from utils.modern_boq_pdf_generator import ModernBOQPDFGenerator
from controllers.boq_internal_excel_generator import generate_internal_excel
from controllers.send_boq_client import generate_client_excel
from utils.boq_calculation_helper import calculate_boq_values
from config.logging import get_logger
from io import BytesIO
from datetime import date


log = get_logger()


def _inject_sub_item_images(items):
    """
    Batch-fetch MasterSubItem fields for all sub_items across all items.
    Replaces the nested N+1 pattern (1 query per sub_item) with a single
    .in_() query, then injects image, description, brand, and size from the result dict.
    """
    # Collect all sub_item_ids in one pass over in-memory data
    all_sub_item_ids = []
    for item in items:
        if item.get('has_sub_items'):
            for sub_item in item.get('sub_items', []):
                sid = sub_item.get('sub_item_id')
                if sid:
                    all_sub_item_ids.append(sid)

    if not all_sub_item_ids:
        return  # nothing to do

    # Single batch query instead of one query per sub_item
    db_sub_items = {
        row.sub_item_id: row for row in MasterSubItem.query.filter(
            MasterSubItem.sub_item_id.in_(all_sub_item_ids),
            MasterSubItem.is_deleted == False
        ).all()
    }

    # Inject fields back into the in-memory items list
    for item in items:
        if item.get('has_sub_items'):
            for sub_item in item.get('sub_items', []):
                sid = sub_item.get('sub_item_id')
                if sid:
                    db_row = db_sub_items.get(sid)
                    if db_row:
                        if db_row.sub_item_image:
                            sub_item['sub_item_image'] = db_row.sub_item_image
                        if not sub_item.get('description') and db_row.description:
                            sub_item['description'] = db_row.description
                        if not sub_item.get('brand') and db_row.brand:
                            sub_item['brand'] = db_row.brand
                        if not sub_item.get('size') and db_row.size:
                            sub_item['size'] = db_row.size


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

        # Batch-fetch sub_item images (single query for all sub_items)
        _inject_sub_item_images(items)

        # Get project
        project = boq.project
        if not project:
            return jsonify({"success": False, "error": "Project not found"}), 404

        # Generate PDF with images
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
    GET /api/boq/download/client/<boq_id>?include_images=true
    POST /api/boq/download/client/<boq_id> with cover_page and include_signature in body
    """
    try:
        boq_id = request.view_args.get('boq_id')
        include_images = request.args.get('include_images', 'true').lower() == 'true'  # Default: include images

        # Handle POST request with cover_page and include_signature
        cover_page = None
        md_signature_image = None
        authorized_signature_image = None
        company_seal_image = None
        if request.method == 'POST':
            data = request.get_json() or {}
            cover_page = data.get('cover_page')
            include_signature = data.get('include_signature', False)

            # If include_signature is True, fetch both signatures and seal from admin settings
            if include_signature:
                from controllers.settings_controller import get_signatures_for_pdf
                signatures = get_signatures_for_pdf()
                md_signature_image = signatures.get('md_signature')
                authorized_signature_image = signatures.get('authorized_signature')
                company_seal_image = signatures.get('company_seal')

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

        # Batch-fetch sub_item images, description, brand, size from DB (no N+1)
        _inject_sub_item_images(items)

        # Get project
        project = boq.project
        if not project:
            return jsonify({"success": False, "error": "Project not found"}), 404

        # Fetch selected Terms & Conditions from database (single row with term_ids array)
        from sqlalchemy import text
        from config.db import db
        selected_terms = []
        try:
            # First get the term_ids array for this BOQ
            term_ids_query = text("""
                SELECT term_ids FROM boq_terms_selections WHERE boq_id = :boq_id
            """)
            term_ids_result = db.session.execute(term_ids_query, {'boq_id': boq_id}).fetchone()
            term_ids = term_ids_result[0] if term_ids_result and term_ids_result[0] else []

            if term_ids:
                # Fetch terms text for selected term IDs
                query = text("""
                    SELECT terms_text
                    FROM boq_terms
                    WHERE term_id = ANY(:term_ids)
                    AND is_active = TRUE
                    AND is_deleted = FALSE
                    ORDER BY display_order, term_id
                """)
                terms_result = db.session.execute(query, {'term_ids': term_ids})
                for row in terms_result:
                    selected_terms.append({'terms_text': row[0]})
            log.info(f"Fetched {len(selected_terms)} selected terms for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error fetching terms for BOQ {boq_id}: {str(e)}")

        # Generate PDF with selected terms from database, optional cover page, and optional signatures
        generator = ModernBOQPDFGenerator()
        pdf_data = generator.generate_client_pdf(
            project, items, total_material_cost, total_labour_cost, grand_total, boq_json,
            terms_text=None, selected_terms=selected_terms, include_images=include_images,
            cover_page=cover_page, md_signature_image=md_signature_image, authorized_signature_image=authorized_signature_image,
            company_seal_image=company_seal_image
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
        total_material_cost, total_labour_cost, items_subtotal, preliminary_amount, grand_total = calculate_boq_values(items, boq_json)

        # Batch-fetch sub_item images, description, brand, size from DB (no N+1)
        _inject_sub_item_images(items)

        # Get project
        project = boq.project
        if not project:
            return jsonify({"success": False, "error": "Project not found"}), 404

        # Generate Excel with images
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


def preview_client_pdf():
    """
    Preview BOQ as Client PDF with optional cover page and signature
    POST /api/boq/preview/client/<boq_id>
    Body: { cover_page: {...}, terms_text: string, include_signature: boolean }
    """
    try:
        boq_id = request.view_args.get('boq_id')
        data = request.get_json() or {}
        cover_page = data.get('cover_page')
        include_images = data.get('include_images', True)
        include_signature = data.get('include_signature', False)

        # If include_signature is True, fetch both signatures and seal from admin settings
        md_signature_image = None
        authorized_signature_image = None
        company_seal_image = None
        if include_signature:
            from controllers.settings_controller import get_signatures_for_pdf
            signatures = get_signatures_for_pdf()
            md_signature_image = signatures.get('md_signature')
            authorized_signature_image = signatures.get('authorized_signature')
            company_seal_image = signatures.get('company_seal')

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
        total_material_cost, total_labour_cost, items_subtotal, preliminary_amount, grand_total = calculate_boq_values(items, boq_json)

        # Batch-fetch sub_item images, description, brand, size from DB (no N+1)
        _inject_sub_item_images(items)

        # Get project
        project = boq.project
        if not project:
            return jsonify({"success": False, "error": "Project not found"}), 404

        # Fetch selected Terms & Conditions from database (single row with term_ids array)
        from sqlalchemy import text
        from config.db import db
        selected_terms = []
        try:
            # First get the term_ids array for this BOQ
            term_ids_query = text("""
                SELECT term_ids FROM boq_terms_selections WHERE boq_id = :boq_id
            """)
            term_ids_result = db.session.execute(term_ids_query, {'boq_id': boq_id}).fetchone()
            term_ids = term_ids_result[0] if term_ids_result and term_ids_result[0] else []

            if term_ids:
                # Fetch terms text for selected term IDs
                query = text("""
                    SELECT terms_text
                    FROM boq_terms
                    WHERE term_id = ANY(:term_ids)
                    AND is_active = TRUE
                    AND is_deleted = FALSE
                    ORDER BY display_order, term_id
                """)
                terms_result = db.session.execute(query, {'term_ids': term_ids})
                for row in terms_result:
                    selected_terms.append({'terms_text': row[0]})
        except Exception as e:
            log.error(f"Error fetching terms for BOQ {boq_id}: {str(e)}")

        # Generate PDF with cover page and optional signatures
        generator = ModernBOQPDFGenerator()
        pdf_data = generator.generate_client_pdf(
            project, items, total_material_cost, total_labour_cost, grand_total, boq_json,
            terms_text=None, selected_terms=selected_terms, include_images=include_images,
            cover_page=cover_page, md_signature_image=md_signature_image, authorized_signature_image=authorized_signature_image,
            company_seal_image=company_seal_image
        )

        # Send file for preview (inline display, not download)
        filename = f"BOQ_{project.project_name.replace(' ', '_')}_Preview_{date.today().isoformat()}.pdf"

        return send_file(
            BytesIO(pdf_data),
            mimetype='application/pdf',
            as_attachment=False,  # Display inline for preview
            download_name=filename
        )

    except Exception as e:
        import traceback
        log.error(f"Error previewing client PDF: {str(e)}")
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
        total_material_cost, total_labour_cost, items_subtotal, preliminary_amount, grand_total = calculate_boq_values(items, boq_json)

        # Batch-fetch sub_item images, description, brand, size from DB (no N+1)
        _inject_sub_item_images(items)

        # Get project
        project = boq.project
        if not project:
            return jsonify({"success": False, "error": "Project not found"}), 404

        # Fetch selected Terms & Conditions from database (single row with term_ids array)
        from sqlalchemy import text
        selected_terms = []
        try:
            # First get the term_ids array for this BOQ
            term_ids_query = text("""
                SELECT term_ids FROM boq_terms_selections WHERE boq_id = :boq_id
            """)
            term_ids_result = db.session.execute(term_ids_query, {'boq_id': boq_id}).fetchone()
            term_ids = term_ids_result[0] if term_ids_result and term_ids_result[0] else []

            if term_ids:
                # Fetch terms text for selected term IDs
                query = text("""
                    SELECT terms_text
                    FROM boq_terms
                    WHERE term_id = ANY(:term_ids)
                    AND is_active = TRUE
                    AND is_deleted = FALSE
                    ORDER BY display_order, term_id
                """)
                terms_result = db.session.execute(query, {'term_ids': term_ids})
                for row in terms_result:
                    selected_terms.append({'terms_text': row[0]})
            log.info(f"Fetched {len(selected_terms)} selected terms for BOQ {boq_id}")
        except Exception as e:
            log.error(f"Error fetching terms for BOQ {boq_id}: {str(e)}")

        # Generate Excel with selected terms from database
        excel_data = generate_client_excel(
            project, items, total_material_cost, total_labour_cost, grand_total, boq_json, selected_terms
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
