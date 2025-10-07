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

        # Calculate CLIENT VERSION - Base cost only (material + labor, NO overhead/profit)
        client_base_cost = total_material_cost + total_labour_cost

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
            excel_data = generate_client_excel(project, items, total_material_cost, total_labour_cost, client_base_cost)
            excel_file = (excel_filename, excel_data)

        if 'pdf' in formats:
            pdf_filename = f"BOQ_{project.project_name.replace(' ', '_')}_Client_{date.today().isoformat()}.pdf"
            pdf_data = generate_client_pdf(project, items, total_material_cost, total_labour_cost, client_base_cost)
            pdf_file = (pdf_filename, pdf_data)

        # Send email - Pass CLIENT BASE COST (not selling price)
        email_service = BOQEmailService()
        email_sent = email_service.send_boq_to_client(
            boq_data=boq_data,
            project_data=project_data,
            client_email=client_email,
            message=message,
            total_value=client_base_cost,  # CLIENT VERSION: Base cost only
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


def generate_client_excel(project, items, total_material_cost, total_labour_cost, client_base_cost):
    """Generate Client Excel file from JSON data"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Complete BOQ Client"

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

    for idx, item in enumerate(items, 1):
        # Item header
        ws[f'A{row}'] = f"{idx}. {item.get('item_name', 'N/A')}"
        ws[f'A{row}'].font = Font(bold=True)
        row += 1

        if item.get('description'):
            ws[f'A{row}'] = item['description']
            row += 1
        row += 1

        # Materials
        materials = item.get('materials', [])
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
                ws[f'A{row}'] = mat.get('material_name', 'N/A')
                ws[f'B{row}'] = mat.get('quantity', 0)
                ws[f'C{row}'] = mat.get('unit', '')
                ws[f'D{row}'] = mat.get('rate_per_unit', 0)
                ws[f'E{row}'] = mat.get('total_price', 0)
                material_total += mat.get('total_price', 0)
                row += 1

            ws[f'A{row}'] = "Total Materials:"
            ws[f'E{row}'] = material_total
            ws[f'A{row}'].font = Font(bold=True)
            row += 2

        # Labour
        labour = item.get('labour', [])
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
                ws[f'A{row}'] = lab.get('labour_role', 'N/A')
                ws[f'B{row}'] = lab.get('no_of_hours', 0)
                ws[f'C{row}'] = "hours"
                ws[f'D{row}'] = lab.get('rate_per_hour', 0)
                ws[f'E{row}'] = lab.get('total_cost', 0)
                labour_total += lab.get('total_cost', 0)
                row += 1

            ws[f'A{row}'] = "Total Labour:"
            ws[f'E{row}'] = labour_total
            ws[f'A{row}'].font = Font(bold=True)
            row += 2

        # Calculate base cost for this item (material + labor only, NO profit/overhead)
        item_material_cost = sum([m.get('total_price', 0) for m in item.get('materials', [])])
        item_labour_cost = sum([l.get('total_cost', 0) for l in item.get('labour', [])])
        item_base_cost = item_material_cost + item_labour_cost

        # Total Price (Client Version - Base Cost Only)
        ws[f'A{row}'] = "TOTAL PRICE:"
        ws[f'E{row}'] = item_base_cost
        ws[f'A{row}'].font = Font(bold=True, color="10B981")
        row += 3

    # Cost Overview
    row += 1
    ws[f'A{row}'] = "COST OVERVIEW"
    ws[f'A{row}'].font = Font(bold=True, size=12)
    row += 2
    ws[f'A{row}'] = "Total Material Cost:"
    ws[f'B{row}'] = total_material_cost
    row += 1
    ws[f'A{row}'] = "Total Labor Cost:"
    ws[f'B{row}'] = total_labour_cost
    row += 1
    ws[f'A{row}'] = "Base Cost (Material + Labor):"
    ws[f'B{row}'] = total_material_cost + total_labour_cost
    row += 2
    ws[f'A{row}'] = "TOTAL PROJECT VALUE:"
    ws[f'B{row}'] = client_base_cost  # Client version: Base cost only
    ws[f'A{row}'].font = Font(bold=True, size=12, color="10B981")

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


def generate_client_pdf(project, items, total_material_cost, total_labour_cost, client_base_cost):
    """Generate Client PDF file from JSON data - Detailed version matching download format"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
    elements = []
    styles = getSampleStyleSheet()

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

        # Materials Table
        materials = item.get('materials', [])
        if materials:
            elements.append(Paragraph("<b>Materials:</b>", styles['Normal']))
            elements.append(Spacer(1, 4))

            material_data = [['Material Name', 'Quantity', 'Unit', 'Rate (AED)', 'Amount (AED)']]
            for mat in materials:
                material_data.append([
                    mat.get('material_name', 'N/A'),
                    f"{mat.get('quantity', 0):.2f}",
                    mat.get('unit', ''),
                    f"{mat.get('unit_price', 0):.2f}",
                    f"{mat.get('total_price', 0):.2f}"
                ])

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

        # Labour Table
        labour = item.get('labour', [])
        if labour:
            elements.append(Paragraph("<b>Labour:</b>", styles['Normal']))
            elements.append(Spacer(1, 4))

            labour_data = [['Labour Role', 'Hours', 'Rate/Hour (AED)', 'Total (AED)']]
            for lab in labour:
                labour_data.append([
                    lab.get('labour_role', 'N/A'),
                    f"{lab.get('hours', 0):.2f}",
                    f"{lab.get('rate_per_hour', 0):.2f}",
                    f"{lab.get('total_cost', 0):.2f}"
                ])

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

        # Item Cost Summary (CLIENT VERSION - Base cost only, no overhead/profit shown)
        item_material_cost = sum([m.get('total_price', 0) for m in materials])
        item_labour_cost = sum([l.get('total_cost', 0) for l in labour])
        item_base_cost = item_material_cost + item_labour_cost

        cost_summary_style = ParagraphStyle(
            'CostSummary',
            parent=styles['Normal'],
            fontSize=10,
            leftIndent=20
        )
        elements.append(Paragraph(f"<b>Total Item Cost: AED {item_base_cost:,.2f}</b>", cost_summary_style))
        elements.append(Spacer(1, 15))

    # Final Summary Section
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

    summary_data = [
        ['Total Material Cost:', f'AED {total_material_cost:,.2f}'],
        ['Total Labour Cost:', f'AED {total_labour_cost:,.2f}'],
        ['', ''],
        ['TOTAL PROJECT VALUE:', f'AED {client_base_cost:,.2f}']
    ]
    summary_table = Table(summary_data, colWidths=[3.5*inch, 2.5*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 1), colors.HexColor('#DBEAFE')),
        ('BACKGROUND', (0, 3), (-1, 3), colors.HexColor('#10B981')),
        ('TEXTCOLOR', (0, 3), (-1, 3), colors.white),
        ('FONTNAME', (0, 3), (-1, 3), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 3), (-1, 3), 14),
        ('FONTSIZE', (0, 0), (-1, 1), 11),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
    ]))
    elements.append(summary_table)

    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
