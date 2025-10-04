from flask import request, jsonify
from config.db import db
from models.boq import BOQ, BOQDetails
from config.logging import get_logger
from utils.boq_email_service import BOQEmailService
from io import BytesIO
from datetime import date
import openpyxl
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT

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

        # Calculate grand total from items' selling prices or from details
        grand_total = sum([item.get('selling_price', 0) for item in items])
        if grand_total == 0:
            grand_total = boq_details.total_cost or (total_material_cost + total_labour_cost)

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

        # Generate files
        excel_file = None
        pdf_file = None

        if 'excel' in formats:
            excel_filename = f"BOQ_{project.project_name.replace(' ', '_')}_Client_{date.today().isoformat()}.xlsx"
            excel_data = generate_client_excel(project, items, total_material_cost, total_labour_cost, grand_total)
            excel_file = (excel_filename, excel_data)

        if 'pdf' in formats:
            pdf_filename = f"BOQ_{project.project_name.replace(' ', '_')}_Client_{date.today().isoformat()}.pdf"
            pdf_data = generate_client_pdf(project, items, total_material_cost, total_labour_cost, grand_total)
            pdf_file = (pdf_filename, pdf_data)

        # Send email
        email_service = BOQEmailService()
        email_sent = email_service.send_boq_to_client(
            boq_data=boq_data,
            project_data=project_data,
            client_email=client_email,
            message=message,
            total_value=grand_total,
            item_count=len(items),
            excel_file=excel_file,
            pdf_file=pdf_file
        )

        if email_sent:
            # Update BOQ flags: email_sent = TRUE, status = Sent_for_Confirmation
            boq.email_sent = True
            boq.status = "Sent_for_Confirmation"  # Waiting for client confirmation
            db.session.commit()

            return jsonify({
                "success": True,
                "message": "BOQ sent to client successfully",
                "email_sent_to": client_email,
                "attachments": [f[0] for f in [excel_file, pdf_file] if f]
            }), 200
        else:
            return jsonify({"success": False, "error": "Failed to send email"}), 500

    except Exception as e:
        log.error(f"Error sending BOQ to client: {str(e)}")
        import traceback
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500


def generate_client_excel(project, items, total_material_cost, total_labour_cost, grand_total):
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
                ws[f'A{row}'] = lab.get('labour_type', 'N/A')
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

        # Total Price
        ws[f'A{row}'] = "TOTAL PRICE:"
        ws[f'E{row}'] = item.get('selling_price', 0)
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
    ws[f'B{row}'] = grand_total
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


def generate_client_pdf(project, items, total_material_cost, total_labour_cost, grand_total):
    """Generate Client PDF file from JSON data"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    elements = []
    styles = getSampleStyleSheet()

    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#1F4788'),
        spaceAfter=20,
        alignment=TA_CENTER
    )
    elements.append(Paragraph("BILL OF QUANTITIES", title_style))
    elements.append(Spacer(1, 12))

    # Project Info
    info_data = [
        ['Project Name:', project.project_name],
        ['Client:', project.client],
        ['Location:', project.location]
    ]
    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
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

    # Cost Summary
    summary_data = [
        ['Total Material Cost:', f'AED {total_material_cost:,.2f}'],
        ['Total Labor Cost:', f'AED {total_labour_cost:,.2f}'],
        ['Base Cost:', f'AED {total_material_cost + total_labour_cost:,.2f}'],
        ['', ''],
        ['TOTAL PROJECT VALUE:', f'AED {grand_total:,.2f}']
    ]
    summary_table = Table(summary_data, colWidths=[3*inch, 3*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 2), colors.HexColor('#DBEAFE')),
        ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor('#10B981')),
        ('TEXTCOLOR', (0, 4), (-1, 4), colors.white),
        ('FONTNAME', (0, 4), (-1, 4), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 4), (-1, 4), 14),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
    ]))
    elements.append(summary_table)

    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
