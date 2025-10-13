from flask import request, jsonify, g
from config.db import db
from models.boq import BOQ, BOQDetails, BOQHistory
from config.logging import get_logger
from utils.boq_email_service import BOQEmailService
from io import BytesIO
from datetime import date, datetime
import openpyxl
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import os

log = get_logger()

def send_boq_to_client():
    """
    Send BOQ to client with Excel and PDF attachments
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400

        boq_id = data.get('boq_id')
        client_email = data.get('client_email')
        message = data.get('message', 'Please review the attached BOQ for your project.')
        formats = data.get('formats', ['excel', 'pdf'])

        if not boq_id or not client_email:
            return jsonify({"success": False, "error": "boq_id and client_email are required"}), 400

        # Fetch BOQ
        boq = BOQ.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq:
            return jsonify({"success": False, "error": "BOQ not found"}), 404

        # Fetch BOQ Details (contains JSON structure)
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"success": False, "error": "BOQ details not found"}), 404

        # Extract data from JSON
        boq_json = boq_details.boq_details
        items = boq_json.get('items', [])

        # Calculate totals
        total_material_cost = sum([
            sum([m.get('total_price', 0) for m in item.get('materials', [])])
            for item in items
        ])

        total_labour_cost = sum([
            sum([l.get('total_cost', 0) for l in item.get('labour', [])])
            for item in items
        ])

        # Calculate grand total from items' selling prices or from details (INTERNAL VERSION)
        grand_total = sum([item.get('selling_price', 0) for item in items])
        if grand_total == 0:
            grand_total = boq_details.total_cost or (total_material_cost + total_labour_cost)

        # Calculate CLIENT VERSION - Selling price (includes overhead/profit distributed)
        client_total_value = grand_total  # Client sees same total as internal, just distributed differently

        # Get project data from relationship
        project = boq.project
        if not project:
            return jsonify({"success": False, "error": "Project not found for this BOQ"}), 404

        # Prepare email data
        boq_data = {
            'boq_id': boq.boq_id,
            'boq_name': boq.boq_name,
            'status': boq.status
        }

        project_data = {
            'project_name': project.project_name or 'N/A',
            'client': project.client or 'Valued Client',
            'location': project.location or 'N/A'
        }

        # Generate files - Pass CLIENT BASE COST (not selling price)
        excel_file = None
        pdf_file = None

        if 'excel' in formats:
            excel_filename = f"BOQ_{project.project_name.replace(' ', '_')}_Client_{date.today().isoformat()}.xlsx"
            excel_data = generate_client_excel(project, items, total_material_cost, total_labour_cost, grand_total, boq_json)
            excel_file = (excel_filename, excel_data)

        if 'pdf' in formats:
            pdf_filename = f"BOQ_{project.project_name.replace(' ', '_')}_Client_{date.today().isoformat()}.pdf"
            pdf_data = generate_client_pdf(project, items, total_material_cost, total_labour_cost, grand_total, boq_json)
            pdf_file = (pdf_filename, pdf_data)

        # Send email - Pass selling price (overhead/profit distributed)
        email_service = BOQEmailService()
        email_sent = email_service.send_boq_to_client(
            boq_data=boq_data,
            project_data=project_data,
            client_email=client_email,
            message=message,
            total_value=client_total_value,  # CLIENT VERSION: Same total, distributed markup
            item_count=len(items),
            excel_file=excel_file,
            pdf_file=pdf_file
        )

        if email_sent:
            # Update BOQ flags: email_sent = TRUE, status = Sent_for_Confirmation
            boq.email_sent = True
            boq.status = "Sent_for_Confirmation"  # Waiting for client confirmation

            # Get current user (estimator)
            current_user = getattr(g, 'user', None)
            estimator_name = current_user.get('full_name', 'Estimator') if current_user else 'Estimator'
            estimator_id = current_user.get('user_id') if current_user else None
            estimator_email = current_user.get('email', '') if current_user else ''

            # Update last_modified fields
            boq.last_modified_by = estimator_name
            boq.last_modified_at = datetime.utcnow()

            # Get existing BOQ history
            existing_history = BOQHistory.query.filter_by(boq_id=boq_id).order_by(BOQHistory.action_date.desc()).first()

            # Handle existing actions - ensure it's always a list
            if existing_history:
                if existing_history.action is None:
                    current_actions = []
                elif isinstance(existing_history.action, list):
                    current_actions = existing_history.action
                elif isinstance(existing_history.action, dict):
                    current_actions = [existing_history.action]
                else:
                    current_actions = []
            else:
                current_actions = []

            # Prepare new action for sending BOQ to client
            new_action = {
                "role": "estimator",
                "type": "sent_to_client",
                "sender": "estimator",
                "receiver": "client",
                "status": "Sent_for_Confirmation",
                "boq_name": boq.boq_name,
                "comments": message or "BOQ sent to client for confirmation",
                "timestamp": datetime.utcnow().isoformat(),
                "sender_name": estimator_name,
                "sender_user_id": estimator_id,
                "total_value": grand_total,
                "item_count": len(items),
                "project_name": project.project_name,
                "recipient_email": client_email,
                "recipient_name": project.client or "Client",
                "attachments": [f[0] for f in [excel_file, pdf_file] if f]
            }

            # Append new action
            current_actions.append(new_action)
            log.info(f"Appending send-to-client action to BOQ {boq_id} history. Total actions: {len(current_actions)}")

            if existing_history:
                # Update existing history
                existing_history.action = current_actions
                # Mark JSONB field as modified for SQLAlchemy
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(existing_history, "action")

                existing_history.action_by = estimator_name
                existing_history.boq_status = "approved"
                existing_history.sender = estimator_name
                existing_history.receiver = project.client or "Client"
                existing_history.comments = message or "BOQ sent to client for confirmation"
                existing_history.sender_role = 'estimator'
                existing_history.receiver_role = 'client'
                existing_history.action_date = datetime.utcnow()
                existing_history.last_modified_by = estimator_name
                existing_history.last_modified_at = datetime.utcnow()

                log.info(f"Updated existing history for BOQ {boq_id} with {len(current_actions)} actions")
            else:
                # Create new history entry
                boq_history = BOQHistory(
                    boq_id=boq_id,
                    action=current_actions,
                    action_by=estimator_name,
                    boq_status="Sent_for_Confirmation",
                    sender=estimator_name,
                    receiver=project.client or "Client",
                    comments=message or "BOQ sent to client for confirmation",
                    sender_role='estimator',
                    receiver_role='client',
                    action_date=datetime.utcnow(),
                    created_by=estimator_name
                )
                db.session.add(boq_history)
                log.info(f"Created new history for BOQ {boq_id} with {len(current_actions)} actions")

            db.session.commit()
            log.info(f"Successfully sent BOQ {boq_id} to client and updated history")

            return jsonify({
                "success": True,
                "message": "BOQ sent to client successfully",
                "email_sent_to": client_email,
                "attachments": [f[0] for f in [excel_file, pdf_file] if f],
                "action_appended": True
            }), 200
        else:
            return jsonify({"success": False, "error": "Failed to send email"}), 500

    except Exception as e:
        log.error(f"Error sending BOQ to client: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500


def generate_client_excel(project, items, total_material_cost, total_labour_cost, client_base_cost, boq_json=None):
    """Generate Client Excel file from JSON data - Overhead & Profit distributed into materials and labor"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Complete BOQ Client"

    if boq_json is None:
        boq_json = {}

    header_font = Font(bold=True, size=14, color="1F4788")
    sub_header_font = Font(bold=True, size=11)

    row = 1

    # Title
    ws.merge_cells(f'A{row}:E{row}')
    ws[f'A{row}'] = "BILL OF QUANTITIES - CLIENT VERSION"
    ws[f'A{row}'].font = header_font
    row += 2

    # Project Info
    ws[f'A{row}'] = "Project Information"
    ws[f'A{row}'].font = sub_header_font
    row += 1
    ws[f'A{row}'] = "Project Name:"
    ws[f'B{row}'] = project.project_name
    row += 1
    ws[f'A{row}'] = "Client Name:"
    ws[f'B{row}'] = project.client
    row += 1
    ws[f'A{row}'] = "Location:"
    ws[f'B{row}'] = project.location
    row += 2

    # Items
    ws[f'A{row}'] = "DETAILED BOQ ITEMS"
    ws[f'A{row}'].font = sub_header_font
    row += 2

    # Calculate adjusted totals for summary
    adjusted_total_material_cost = 0
    adjusted_total_labour_cost = 0

    for idx, item in enumerate(items, 1):
        # Item header
        ws[f'A{row}'] = f"{idx}. {item.get('item_name', 'N/A')}"
        ws[f'A{row}'].font = Font(bold=True)
        row += 1

        if item.get('description'):
            ws[f'A{row}'] = item['description']
            row += 1
        row += 1

        # Calculate item costs
        item_material_cost = sum([m.get('total_price', 0) for m in item.get('materials', [])])
        item_labour_cost = sum([l.get('total_cost', 0) for l in item.get('labour', [])])
        item_base_cost = item_material_cost + item_labour_cost

        # Get overhead and profit for this item
        item_overhead = item.get('overhead_amount', 0)
        item_profit = item.get('profit_margin_amount', 0)
        item_total_markup = item_overhead + item_profit

        # Calculate distribution ratio (50% to materials, 50% to labor if both exist)
        materials = item.get('materials', [])
        labour = item.get('labour', [])

        if item_base_cost > 0:
            material_ratio = item_material_cost / item_base_cost if item_base_cost > 0 else 0
            labour_ratio = item_labour_cost / item_base_cost if item_base_cost > 0 else 0

            material_markup_share = item_total_markup * material_ratio
            labour_markup_share = item_total_markup * labour_ratio
        else:
            material_markup_share = 0
            labour_markup_share = 0

        # Materials with distributed markup
        if materials:
            ws[f'A{row}'] = "+ RAW MATERIALS"
            ws[f'A{row}'].font = Font(bold=True)
            row += 1

            ws[f'A{row}'] = "Material Name"
            ws[f'B{row}'] = "Quantity"
            ws[f'C{row}'] = "Unit"
            ws[f'D{row}'] = "Rate (AED)"
            ws[f'E{row}'] = "Amount (AED)"
            row += 1

            material_total = 0
            for mat in materials:
                original_price = mat.get('total_price', 0)
                # Distribute markup proportionally to each material
                mat_share = (original_price / item_material_cost * material_markup_share) if item_material_cost > 0 else 0
                adjusted_price = original_price + mat_share
                adjusted_rate = mat.get('unit_price', 0) + (mat_share / mat.get('quantity', 1) if mat.get('quantity', 0) > 0 else 0)

                ws[f'A{row}'] = mat.get('material_name', 'N/A')
                ws[f'B{row}'] = mat.get('quantity', 0)
                ws[f'C{row}'] = mat.get('unit', '')
                ws[f'D{row}'] = round(adjusted_rate, 2)
                ws[f'E{row}'] = round(adjusted_price, 2)
                material_total += adjusted_price
                row += 1

            ws[f'A{row}'] = "Total Materials:"
            ws[f'E{row}'] = round(material_total, 2)
            ws[f'A{row}'].font = Font(bold=True)
            row += 2

            adjusted_total_material_cost += material_total

        # Labour with distributed markup
        if labour:
            ws[f'A{row}'] = "+ LABOUR"
            ws[f'A{row}'].font = Font(bold=True)
            row += 1

            ws[f'A{row}'] = "Labour Type"
            ws[f'B{row}'] = "Hours/Qty"
            ws[f'C{row}'] = "Unit"
            ws[f'D{row}'] = "Rate (AED)"
            ws[f'E{row}'] = "Amount (AED)"
            row += 1

            labour_total = 0
            for lab in labour:
                original_cost = lab.get('total_cost', 0)
                # Distribute markup proportionally to each labor
                lab_share = (original_cost / item_labour_cost * labour_markup_share) if item_labour_cost > 0 else 0
                adjusted_cost = original_cost + lab_share
                adjusted_rate = lab.get('rate_per_hour', 0) + (lab_share / lab.get('hours', 1) if lab.get('hours', 0) > 0 else 0)

                ws[f'A{row}'] = lab.get('labour_role', 'N/A')
                ws[f'B{row}'] = lab.get('hours', 0)
                ws[f'C{row}'] = "hours"
                ws[f'D{row}'] = round(adjusted_rate, 2)
                ws[f'E{row}'] = round(adjusted_cost, 2)
                labour_total += adjusted_cost
                row += 1

            ws[f'A{row}'] = "Total Labour:"
            ws[f'E{row}'] = round(labour_total, 2)
            ws[f'A{row}'].font = Font(bold=True)
            row += 2

            adjusted_total_labour_cost += labour_total

        # Total Price (Client Version - with markup distributed)
        item_total_with_markup = item.get('selling_price', item_base_cost + item_total_markup)
        ws[f'A{row}'] = "TOTAL PRICE:"
        ws[f'E{row}'] = round(item_total_with_markup, 2)
        ws[f'A{row}'].font = Font(bold=True, color="10B981")
        row += 3

    # Cost Overview with VAT and Discount
    row += 1
    ws[f'A{row}'] = "COST OVERVIEW"
    ws[f'A{row}'].font = Font(bold=True, size=12)
    row += 2
    ws[f'A{row}'] = "Total Material Cost:"
    ws[f'B{row}'] = round(adjusted_total_material_cost, 2)
    row += 1
    ws[f'A{row}'] = "Total Labor Cost:"
    ws[f'B{row}'] = round(adjusted_total_labour_cost, 2)
    row += 1
    ws[f'A{row}'] = "Total Project Cost:"
    ws[f'B{row}'] = round(adjusted_total_material_cost + adjusted_total_labour_cost, 2)
    row += 1

    # Calculate discount from items (if any)
    total_discount = sum([item.get('discount_amount', 0) for item in items])
    if total_discount > 0:
        subtotal_before_discount = adjusted_total_material_cost + adjusted_total_labour_cost
        discount_pct = (total_discount / subtotal_before_discount * 100) if subtotal_before_discount > 0 else 0
        ws[f'A{row}'] = f"Discount ({discount_pct:.1f}%):"
        ws[f'B{row}'] = f"-{round(total_discount, 2)}"
        ws[f'B{row}'].font = Font(color="EF4444")
        row += 1
        ws[f'A{row}'] = "Subtotal (After Discount):"
        ws[f'B{row}'] = round((adjusted_total_material_cost + adjusted_total_labour_cost) - total_discount, 2)
        ws[f'A{row}'].font = Font(bold=True)
        row += 1

    # Calculate VAT from items
    total_vat = sum([item.get('vat_amount', 0) for item in items])
    subtotal_after_discount = (adjusted_total_material_cost + adjusted_total_labour_cost) - total_discount
    if total_vat > 0 or subtotal_after_discount > 0:  # Always show VAT line
        vat_pct = (total_vat / subtotal_after_discount * 100) if subtotal_after_discount > 0 else 0
        ws[f'A{row}'] = f"VAT ({vat_pct:.1f}%):"
        ws[f'B{row}'] = round(total_vat, 2)
        row += 1

    grand_total_with_vat = subtotal_after_discount + total_vat

    row += 1
    ws[f'A{row}'] = "TOTAL PROJECT VALUE:"
    ws[f'B{row}'] = round(grand_total_with_vat, 2)
    ws[f'A{row}'].font = Font(bold=True, size=12, color="10B981")

    # Add Preliminaries Section (if exists in boq_json)
    preliminaries = boq_json.get('preliminaries', {})
    prelim_items = preliminaries.get('items', [])
    prelim_notes = preliminaries.get('notes', '')

    if prelim_items or prelim_notes:
        row += 3
        ws[f'A{row}'] = "PRELIMINARIES & APPROVAL WORKS"
        ws[f'A{row}'].font = Font(bold=True, size=12, color="643CCA")
        row += 1
        ws[f'A{row}'] = "Selected conditions and terms"
        ws[f'A{row}'].font = Font(italic=True, color="666666")
        row += 2

        for prelim_item in prelim_items:
            desc = prelim_item.get('description', prelim_item) if isinstance(prelim_item, dict) else str(prelim_item)
            ws[f'A{row}'] = f"✓ {desc}"
            row += 1

        if prelim_notes:
            row += 1
            ws[f'A{row}'] = "Additional Notes:"
            ws[f'A{row}'].font = Font(bold=True)
            row += 1
            ws[f'A{row}'] = prelim_notes
            ws[f'A{row}'].font = Font(italic=True)

    # Column widths
    ws.column_dimensions['A'].width = 40
    ws.column_dimensions['B'].width = 15
    ws.column_dimensions['C'].width = 12
    ws.column_dimensions['D'].width = 15
    ws.column_dimensions['E'].width = 18

    # Save to BytesIO
    excel_buffer = BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)
    return excel_buffer.read()


def generate_client_pdf(project, items, total_material_cost, total_labour_cost, grand_total, boq_json=None):
    """Generate Client PDF file from JSON data - Overhead & Profit distributed into materials and labor"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
    elements = []
    styles = getSampleStyleSheet()

    if boq_json is None:
        boq_json = {}

    # Company Logo (if exists)
    logo_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'logo.png')
    if os.path.exists(logo_path):
        try:
            logo = Image(logo_path, width=2*inch, height=0.8*inch)
            logo.hAlign = 'CENTER'
            elements.append(logo)
            elements.append(Spacer(1, 12))
        except Exception as e:
            log.error(f"Error loading logo: {str(e)}")

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#1F4788'),
        spaceAfter=12,
        alignment=TA_CENTER
    )
    elements.append(Paragraph("<b>BILL OF QUANTITIES - CLIENT VERSION</b>", title_style))
    elements.append(Spacer(1, 12))

    # Project Info
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#4B5563')
    )
    info_data = [
        ['Project Name:', project.project_name or 'N/A'],
        ['Client:', project.client or 'N/A'],
        ['Location:', project.location or 'N/A'],
        ['Date:', date.today().strftime('%d %b %Y')]
    ]
    info_table = Table(info_data, colWidths=[1.5*inch, 4.5*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#F3F4F6')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 20))

    # Items Section Header
    item_header_style = ParagraphStyle(
        'ItemHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1F4788'),
        spaceAfter=10
    )
    elements.append(Paragraph("<b>DETAILED BOQ ITEMS</b>", item_header_style))
    elements.append(Spacer(1, 10))

    # Calculate adjusted totals for summary
    adjusted_total_material_cost = 0
    adjusted_total_labour_cost = 0

    # Process each item
    for idx, item in enumerate(items, 1):
        # Item Header
        item_name_style = ParagraphStyle(
            'ItemName',
            parent=styles['Normal'],
            fontSize=12,
            textColor=colors.HexColor('#1F4788'),
            spaceAfter=6
        )
        elements.append(Paragraph(f"<b>{idx}. {item.get('item_name', 'N/A')}</b>", item_name_style))

        if item.get('description'):
            desc_style = ParagraphStyle(
                'Description',
                parent=styles['Normal'],
                fontSize=9,
                textColor=colors.HexColor('#6B7280'),
                fontName='Helvetica-Oblique',
                leftIndent=20
            )
            elements.append(Paragraph(item['description'], desc_style))
            elements.append(Spacer(1, 6))

        # Calculate item costs
        materials = item.get('materials', [])
        labour = item.get('labour', [])

        item_material_cost = sum([m.get('total_price', 0) for m in materials])
        item_labour_cost = sum([l.get('total_cost', 0) for l in labour])
        item_base_cost = item_material_cost + item_labour_cost

        # Get overhead and profit for this item
        item_overhead = item.get('overhead_amount', 0)
        item_profit = item.get('profit_margin_amount', 0)
        item_total_markup = item_overhead + item_profit

        # Calculate distribution ratio
        if item_base_cost > 0:
            material_ratio = item_material_cost / item_base_cost
            labour_ratio = item_labour_cost / item_base_cost
            material_markup_share = item_total_markup * material_ratio
            labour_markup_share = item_total_markup * labour_ratio
        else:
            material_markup_share = 0
            labour_markup_share = 0

        # Materials Table with distributed markup
        if materials:
            elements.append(Paragraph("<b>Materials:</b>", styles['Normal']))
            elements.append(Spacer(1, 4))

            material_data = [['Material Name', 'Quantity', 'Unit', 'Rate (AED)', 'Amount (AED)']]
            material_total = 0
            for mat in materials:
                original_price = mat.get('total_price', 0)
                mat_share = (original_price / item_material_cost * material_markup_share) if item_material_cost > 0 else 0
                adjusted_price = original_price + mat_share
                adjusted_rate = mat.get('unit_price', 0) + (mat_share / mat.get('quantity', 1) if mat.get('quantity', 0) > 0 else 0)

                material_data.append([
                    mat.get('material_name', 'N/A'),
                    f"{mat.get('quantity', 0):.2f}",
                    mat.get('unit', ''),
                    f"{adjusted_rate:.2f}",
                    f"{adjusted_price:.2f}"
                ])
                material_total += adjusted_price

            material_table = Table(material_data, colWidths=[2.5*inch, 0.8*inch, 0.6*inch, 0.9*inch, 1*inch])
            material_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('ALIGN', (0, 1), (0, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
            ]))
            elements.append(material_table)
            elements.append(Spacer(1, 8))
            adjusted_total_material_cost += material_total

        # Labour Table with distributed markup
        if labour:
            elements.append(Paragraph("<b>Labour:</b>", styles['Normal']))
            elements.append(Spacer(1, 4))

            labour_data = [['Labour Role', 'Hours', 'Rate/Hour (AED)', 'Total (AED)']]
            labour_total = 0
            for lab in labour:
                original_cost = lab.get('total_cost', 0)
                lab_share = (original_cost / item_labour_cost * labour_markup_share) if item_labour_cost > 0 else 0
                adjusted_cost = original_cost + lab_share
                adjusted_rate = lab.get('rate_per_hour', 0) + (lab_share / lab.get('hours', 1) if lab.get('hours', 0) > 0 else 0)

                labour_data.append([
                    lab.get('labour_role', 'N/A'),
                    f"{lab.get('hours', 0):.2f}",
                    f"{adjusted_rate:.2f}",
                    f"{adjusted_cost:.2f}"
                ])
                labour_total += adjusted_cost

            labour_table = Table(labour_data, colWidths=[2.5*inch, 1*inch, 1.2*inch, 1.1*inch])
            labour_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F97316')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('ALIGN', (0, 1), (0, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
            ]))
            elements.append(labour_table)
            elements.append(Spacer(1, 8))
            adjusted_total_labour_cost += labour_total

        # Item Cost Summary (CLIENT VERSION - with markup distributed)
        item_total_with_markup = item.get('selling_price', item_base_cost + item_total_markup)

        cost_summary_style = ParagraphStyle(
            'CostSummary',
            parent=styles['Normal'],
            fontSize=10,
            leftIndent=20
        )
        elements.append(Paragraph(f"<b>Total Item Cost: AED {item_total_with_markup:,.2f}</b>", cost_summary_style))
        elements.append(Spacer(1, 15))

    # Final Summary Section with VAT and Discount
    elements.append(Spacer(1, 10))
    summary_header_style = ParagraphStyle(
        'SummaryHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1F4788'),
        spaceAfter=10
    )
    elements.append(Paragraph("<b>PROJECT COST SUMMARY</b>", summary_header_style))
    elements.append(Spacer(1, 8))

    # Calculate discount and VAT
    total_discount = sum([item.get('discount_amount', 0) for item in items])
    total_vat = sum([item.get('vat_amount', 0) for item in items])
    subtotal_before_discount = adjusted_total_material_cost + adjusted_total_labour_cost
    subtotal_after_discount = subtotal_before_discount - total_discount
    grand_total_with_vat = subtotal_after_discount + total_vat

    summary_data = [
        ['Total Material Cost:', f'AED {adjusted_total_material_cost:,.2f}'],
        ['Total Labour Cost:', f'AED {adjusted_total_labour_cost:,.2f}'],
    ]

    # Add discount if exists
    if total_discount > 0:
        discount_pct = (total_discount / subtotal_before_discount * 100) if subtotal_before_discount > 0 else 0
        summary_data.append([f'Discount ({discount_pct:.1f}%):', f'-AED {total_discount:,.2f}'])
        summary_data.append(['Subtotal (After Discount):', f'AED {subtotal_after_discount:,.2f}'])

    # Add VAT
    if total_vat > 0 or subtotal_after_discount > 0:
        vat_pct = (total_vat / subtotal_after_discount * 100) if subtotal_after_discount > 0 else 0
        summary_data.append([f'VAT ({vat_pct:.1f}%):', f'AED {total_vat:,.2f}'])

    summary_data.append(['', ''])
    summary_data.append(['TOTAL PROJECT VALUE:', f'AED {grand_total_with_vat:,.2f}'])

    summary_table = Table(summary_data, colWidths=[3.5*inch, 2.5*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -3), colors.HexColor('#DBEAFE')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#10B981')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.white),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 14),
        ('FONTSIZE', (0, 0), (-1, -2), 11),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
    ]))
    elements.append(summary_table)

    # Add Preliminaries Section (if exists)
    preliminaries = boq_json.get('preliminaries', {})
    prelim_items = preliminaries.get('items', [])
    prelim_notes = preliminaries.get('notes', '')

    if prelim_items or prelim_notes:
        elements.append(Spacer(1, 20))
        prelim_header_style = ParagraphStyle(
            'PrelimHeader',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=colors.HexColor('#643CCA'),
            spaceAfter=6
        )
        elements.append(Paragraph("<b>PRELIMINARIES & APPROVAL WORKS</b>", prelim_header_style))
        prelim_subtitle_style = ParagraphStyle(
            'PrelimSubtitle',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.grey,
            fontName='Helvetica-Oblique',
            spaceAfter=10
        )
        elements.append(Paragraph("Selected conditions and terms", prelim_subtitle_style))

        for prelim_item in prelim_items:
            desc = prelim_item.get('description', prelim_item) if isinstance(prelim_item, dict) else str(prelim_item)
            prelim_text = f"✓ {desc}"
            prelim_style = ParagraphStyle('PrelimItem', parent=styles['Normal'], fontSize=9, leftIndent=10, spaceAfter=4)
            elements.append(Paragraph(prelim_text, prelim_style))

        if prelim_notes:
            elements.append(Spacer(1, 8))
            notes_header = Paragraph("<b>Additional Notes:</b>", styles['Normal'])
            elements.append(notes_header)
            notes_text = Paragraph(prelim_notes, ParagraphStyle('Notes', parent=styles['Normal'], fontSize=9, fontName='Helvetica-Oblique'))
            elements.append(notes_text)

    # Add Signature Section
    elements.append(Spacer(1, 30))
    from reportlab.platypus import HRFlowable
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.grey, spaceBefore=10, spaceAfter=15))

    sig_style = ParagraphStyle('Signature', parent=styles['Normal'], fontSize=10, spaceAfter=40)
    elements.append(Paragraph("<b>For MeterSquare:</b>", sig_style))
    elements.append(HRFlowable(width="40%", thickness=0.5, color=colors.black, spaceBefore=1, spaceAfter=5))
    elements.append(Paragraph("Authorized Signature", styles['Normal']))
    elements.append(Paragraph("Date: __________", styles['Normal']))

    elements.append(Spacer(1, 20))
    elements.append(Paragraph("<b>Client Acceptance:</b>", sig_style))
    elements.append(HRFlowable(width="40%", thickness=0.5, color=colors.black, spaceBefore=1, spaceAfter=5))
    elements.append(Paragraph("Client Signature", styles['Normal']))
    elements.append(Paragraph("Date: __________", styles['Normal']))

    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
