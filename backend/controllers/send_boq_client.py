from flask import request, jsonify, g
from models.boq import BOQ, BOQDetails, BOQHistory
from models.project import Project
from config.db import db
from datetime import datetime, date
from config.logging import get_logger
from utils.boq_email_service import BOQEmailService
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
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

        # Validate BOQ is approved by both PM and TD before sending to client
        # Allow both "Approved" and "Revision_Approved" statuses
        if boq.status not in ["Approved", "Revision_Approved"]:
            return jsonify({
                "success": False,
                "error": f"BOQ must be approved by Project Manager and Technical Director before sending to client. Current status: {boq.status}"
            }), 400

        # Fetch BOQ Details (contains JSON structure)
        boq_details = BOQDetails.query.filter_by(boq_id=boq_id, is_deleted=False).first()
        if not boq_details:
            return jsonify({"success": False, "error": "BOQ details not found"}), 404

        # Extract data from JSON
        boq_json = boq_details.boq_details
        items = boq_json.get('items', [])

        # Calculate totals - handle both old format (direct materials/labour) and new format (sub-items)
        total_material_cost = 0
        total_labour_cost = 0

        for item in items:
            has_sub_items = item.get('has_sub_items', False)

            if has_sub_items and item.get('sub_items'):
                # NEW FORMAT: Sum from sub-items
                for sub_item in item.get('sub_items', []):
                    total_material_cost += sub_item.get('materials_cost', 0)
                    total_labour_cost += sub_item.get('labour_cost', 0)
            else:
                # OLD FORMAT: Sum from item's direct materials/labour
                total_material_cost += sum([m.get('total_price', 0) for m in item.get('materials', [])])
                total_labour_cost += sum([l.get('total_cost', 0) for l in item.get('labour', [])])

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
                "client_name": project.client,
                "client_email": client_email
            }

            # Append new action to existing list
            current_actions.append(new_action)

            # Create or update history record
            if existing_history:
                # Update existing history with new action added to list
                existing_history.action = current_actions
                existing_history.action_date = datetime.utcnow()
                existing_history.comment = f"BOQ sent to client at {client_email}"
            else:
                # Create new history entry with action as list
                new_history = BOQHistory(
                    boq_id=boq_id,
                    action=current_actions,  # Store as list
                    action_date=datetime.utcnow(),
                    comment=f"BOQ sent to client at {client_email}"
                )
                db.session.add(new_history)

            db.session.commit()

            return jsonify({
                "success": True,
                "message": f"BOQ sent successfully to {client_email}",
                "boq_id": boq_id,
                "status": boq.status
            }), 200
        else:
            return jsonify({"success": False, "error": "Failed to send email"}), 500

    except Exception as e:
        import traceback
        log.error(f"Error sending BOQ to client: {str(e)}")
        log.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500


def generate_client_excel(project, items, total_material_cost, total_labour_cost, client_base_cost, boq_json=None):
    """
    Generate Client Excel file - MODERN PROFESSIONAL FORMAT
    Shows ONLY items and sub-items (NO raw materials/labour details)
    Overhead & Profit already included in selling prices
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Quotation"

    if boq_json is None:
        boq_json = {}

    # Define styles
    header_font = Font(bold=True, size=16, color="1F4788")
    sub_header_font = Font(bold=True, size=12, color="1F4788")
    table_header_font = Font(bold=True, size=10, color="FFFFFF")
    bold_font = Font(bold=True, size=10)
    normal_font = Font(size=10)
    total_font = Font(bold=True, size=12, color="10B981")

    # Header fills
    blue_fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")
    light_blue_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
    green_fill = PatternFill(start_color="10B981", end_color="10B981", fill_type="solid")
    grey_fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")

    # Borders
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )

    row = 1

    # Title
    ws.merge_cells(f'A{row}:F{row}')
    ws[f'A{row}'] = "QUOTATION"
    ws[f'A{row}'].font = header_font
    ws[f'A{row}'].alignment = Alignment(horizontal='center', vertical='center')
    row += 1

    ws.merge_cells(f'A{row}:F{row}')
    ws[f'A{row}'] = "Bill of Quantities"
    ws[f'A{row}'].font = Font(size=11, italic=True, color="6B7280")
    ws[f'A{row}'].alignment = Alignment(horizontal='center', vertical='center')
    row += 2

    # Project Information Box
    ws[f'A{row}'] = "Project Information"
    ws[f'A{row}'].font = sub_header_font
    row += 1

    info_data = [
        ["Project Name:", project.project_name],
        ["Client:", project.client],
        ["Location:", project.location],
        ["Date:", date.today().strftime('%d %B %Y')]
    ]

    for info_row in info_data:
        ws[f'A{row}'] = info_row[0]
        ws[f'A{row}'].font = bold_font
        ws[f'A{row}'].fill = grey_fill
        ws[f'B{row}'] = info_row[1]
        ws[f'B{row}'].font = normal_font
        for col in ['A', 'B']:
            ws[f'{col}{row}'].border = thin_border
        row += 1

    row += 2

    # Scope of Work Header
    ws.merge_cells(f'A{row}:F{row}')
    ws[f'A{row}'] = "SCOPE OF WORK"
    ws[f'A{row}'].font = sub_header_font
    ws[f'A{row}'].fill = light_blue_fill
    ws[f'A{row}'].alignment = Alignment(horizontal='center', vertical='center')
    row += 2

    # Process each item
    for idx, item in enumerate(items, 1):
        # Item Header
        ws.merge_cells(f'A{row}:F{row}')
        ws[f'A{row}'] = f"{idx}. {item.get('item_name', 'N/A')}"
        ws[f'A{row}'].font = Font(bold=True, size=11, color="1F4788")
        ws[f'A{row}'].fill = PatternFill(start_color="E0E7FF", end_color="E0E7FF", fill_type="solid")
        row += 1

        if item.get('description'):
            ws.merge_cells(f'A{row}:F{row}')
            ws[f'A{row}'] = item['description']
            ws[f'A{row}'].font = Font(italic=True, size=9, color="6B7280")
            row += 1

        row += 1

        # Check if item has sub-items
        has_sub_items = item.get('has_sub_items', False)
        sub_items = item.get('sub_items', [])

        if has_sub_items and sub_items:
            # Sub-items table header
            headers = ['Sub-Item Description', 'Scope / Size', 'Qty', 'Unit', 'Rate (AED)', 'Amount (AED)']
            for col_idx, header in enumerate(headers, start=1):
                cell = ws.cell(row=row, column=col_idx)
                cell.value = header
                cell.font = table_header_font
                cell.fill = blue_fill
                cell.alignment = Alignment(horizontal='center', vertical='center')
                cell.border = thin_border
            row += 1

            # Sub-items data
            item_total = 0
            item_misc = item.get('miscellaneous_amount', 0)
            item_overhead = item.get('overhead_amount', 0)
            item_profit = item.get('profit_margin_amount', 0)
            item_base_cost = sum([si.get('materials_cost', 0) + si.get('labour_cost', 0) for si in sub_items])

            for sub_item in sub_items:
                sub_item_name = sub_item.get('sub_item_name', 'N/A')
                scope = sub_item.get('scope', '')
                size = sub_item.get('size', '')
                location = sub_item.get('location', '')
                brand = sub_item.get('brand', '')

                # Build scope/size display
                scope_parts = []
                if scope:
                    scope_parts.append(scope)
                if size:
                    scope_parts.append(size)
                if location:
                    scope_parts.append(f"Loc: {location}")
                if brand:
                    scope_parts.append(f"Brand: {brand}")
                scope_size = " | ".join(scope_parts) if scope_parts else '-'

                quantity = sub_item.get('quantity', 0)
                unit = sub_item.get('unit', 'nos')

                # Calculate sub-item total with distributed misc/overhead/profit
                materials_cost = sub_item.get('materials_cost', 0)
                labour_cost = sub_item.get('labour_cost', 0)
                sub_item_base = materials_cost + labour_cost

                if item_base_cost > 0:
                    sub_item_markup = (sub_item_base / item_base_cost) * (item_misc + item_overhead + item_profit)
                else:
                    sub_item_markup = 0

                sub_item_total = sub_item_base + sub_item_markup
                adjusted_rate = sub_item_total / quantity if quantity > 0 else 0

                # Write row
                ws.cell(row=row, column=1).value = sub_item_name
                ws.cell(row=row, column=1).alignment = Alignment(horizontal='left', vertical='center')
                ws.cell(row=row, column=2).value = scope_size
                ws.cell(row=row, column=2).alignment = Alignment(horizontal='left', vertical='center')
                ws.cell(row=row, column=3).value = round(quantity, 2)
                ws.cell(row=row, column=3).alignment = Alignment(horizontal='center', vertical='center')
                ws.cell(row=row, column=4).value = unit
                ws.cell(row=row, column=4).alignment = Alignment(horizontal='center', vertical='center')
                ws.cell(row=row, column=5).value = round(adjusted_rate, 2)
                ws.cell(row=row, column=5).alignment = Alignment(horizontal='right', vertical='center')
                ws.cell(row=row, column=5).number_format = '#,##0.00'
                ws.cell(row=row, column=6).value = round(sub_item_total, 2)
                ws.cell(row=row, column=6).alignment = Alignment(horizontal='right', vertical='center')
                ws.cell(row=row, column=6).number_format = '#,##0.00'

                for col in range(1, 7):
                    ws.cell(row=row, column=col).border = thin_border
                    ws.cell(row=row, column=col).font = normal_font

                item_total += sub_item_total
                row += 1

        else:
            # Old format: No sub-items
            item_qty = item.get('quantity', 0)
            item_unit = item.get('unit', 'nos')
            item_rate = item.get('rate', 0)
            item_total = item.get('selling_price', 0)

            ws[f'A{row}'] = f"Quantity: {item_qty} {item_unit}"
            ws[f'D{row}'] = f"Rate: AED {item_rate:,.2f}/{item_unit}"
            row += 1

        # Item Total
        ws.merge_cells(f'A{row}:E{row}')
        ws[f'A{row}'] = "Item Total:"
        ws[f'A{row}'].font = Font(bold=True, size=11, color="10B981")
        ws[f'A{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'] = round(item.get('selling_price', 0), 2)
        ws[f'F{row}'].font = Font(bold=True, size=11, color="10B981")
        ws[f'F{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'].number_format = '#,##0.00'
        ws[f'F{row}'].fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
        row += 3

    # Cost Summary
    row += 1
    ws.merge_cells(f'A{row}:F{row}')
    ws[f'A{row}'] = "COST SUMMARY"
    ws[f'A{row}'].font = sub_header_font
    ws[f'A{row}'].fill = light_blue_fill
    ws[f'A{row}'].alignment = Alignment(horizontal='center', vertical='center')
    row += 2

    # Calculate totals
    subtotal_before_discount = sum([item.get('selling_price', 0) for item in items])
    total_discount = sum([item.get('discount_amount', 0) for item in items])
    subtotal_after_discount = subtotal_before_discount - total_discount
    total_vat = sum([item.get('vat_amount', 0) for item in items])
    grand_total_with_vat = subtotal_after_discount + total_vat

    # Subtotal
    ws.merge_cells(f'A{row}:E{row}')
    ws[f'A{row}'] = "Subtotal:"
    ws[f'A{row}'].font = bold_font
    ws[f'A{row}'].alignment = Alignment(horizontal='right', vertical='center')
    ws[f'F{row}'] = round(subtotal_before_discount, 2)
    ws[f'F{row}'].font = bold_font
    ws[f'F{row}'].alignment = Alignment(horizontal='right', vertical='center')
    ws[f'F{row}'].number_format = '#,##0.00'
    row += 1

    # Discount
    if total_discount > 0:
        discount_pct = (total_discount / subtotal_before_discount * 100) if subtotal_before_discount > 0 else 0
        ws.merge_cells(f'A{row}:E{row}')
        ws[f'A{row}'] = f"Discount ({discount_pct:.1f}%):"
        ws[f'A{row}'].font = bold_font
        ws[f'A{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'] = -round(total_discount, 2)
        ws[f'F{row}'].font = Font(bold=True, color="EF4444")
        ws[f'F{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'].number_format = '#,##0.00'
        row += 1

        ws.merge_cells(f'A{row}:E{row}')
        ws[f'A{row}'] = "After Discount:"
        ws[f'A{row}'].font = bold_font
        ws[f'A{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'] = round(subtotal_after_discount, 2)
        ws[f'F{row}'].font = bold_font
        ws[f'F{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'].number_format = '#,##0.00'
        row += 1

    # VAT
    if total_vat > 0:
        vat_pct = (total_vat / subtotal_after_discount * 100) if subtotal_after_discount > 0 else 0
        ws.merge_cells(f'A{row}:E{row}')
        ws[f'A{row}'] = f"VAT ({vat_pct:.1f}%):"
        ws[f'A{row}'].font = bold_font
        ws[f'A{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'] = round(total_vat, 2)
        ws[f'F{row}'].font = bold_font
        ws[f'F{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'].number_format = '#,##0.00'
        row += 1

    row += 1

    # Grand Total
    ws.merge_cells(f'A{row}:E{row}')
    ws[f'A{row}'] = "TOTAL PROJECT VALUE:"
    ws[f'A{row}'].font = Font(bold=True, size=12, color="FFFFFF")
    ws[f'A{row}'].fill = green_fill
    ws[f'A{row}'].alignment = Alignment(horizontal='right', vertical='center')
    ws[f'F{row}'] = round(grand_total_with_vat, 2)
    ws[f'F{row}'].font = Font(bold=True, size=12, color="FFFFFF")
    ws[f'F{row}'].fill = green_fill
    ws[f'F{row}'].alignment = Alignment(horizontal='right', vertical='center')
    ws[f'F{row}'].number_format = '#,##0.00'
    row += 2

    # Preliminaries
    preliminaries = boq_json.get('preliminaries', {})
    prelim_items = preliminaries.get('items', [])
    prelim_notes = preliminaries.get('notes', '')

    if prelim_items or prelim_notes:
        row += 1
        ws.merge_cells(f'A{row}:F{row}')
        ws[f'A{row}'] = "PRELIMINARIES & APPROVAL WORKS"
        ws[f'A{row}'].font = Font(bold=True, size=11, color="643CCA")
        row += 1

        ws.merge_cells(f'A{row}:F{row}')
        ws[f'A{row}'] = "Selected conditions and terms"
        ws[f'A{row}'].font = Font(italic=True, size=9, color="666666")
        row += 2

        for prelim_item in prelim_items:
            desc = prelim_item.get('description', prelim_item) if isinstance(prelim_item, dict) else str(prelim_item)
            ws.merge_cells(f'A{row}:F{row}')
            ws[f'A{row}'] = f"✓ {desc}"
            ws[f'A{row}'].font = normal_font
            row += 1

        if prelim_notes:
            row += 1
            ws.merge_cells(f'A{row}:F{row}')
            ws[f'A{row}'] = "Additional Notes:"
            ws[f'A{row}'].font = bold_font
            row += 1
            ws.merge_cells(f'A{row}:F{row}')
            ws[f'A{row}'] = prelim_notes
            ws[f'A{row}'].font = Font(italic=True, size=9)
            ws[f'A{row}'].alignment = Alignment(wrap_text=True)

    # Column widths
    ws.column_dimensions['A'].width = 30
    ws.column_dimensions['B'].width = 25
    ws.column_dimensions['C'].width = 10
    ws.column_dimensions['D'].width = 10
    ws.column_dimensions['E'].width = 15
    ws.column_dimensions['F'].width = 18

    # Save to BytesIO
    excel_buffer = BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)
    return excel_buffer.read()


def generate_client_pdf(project, items, total_material_cost, total_labour_cost, grand_total, boq_json=None):
    """
    Generate Client PDF - MODERN PROFESSIONAL CORPORATE FORMAT
    Shows ONLY items and sub-items (NO raw materials/labour details)
    Overhead & Profit already included in selling prices
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=40,
        bottomMargin=40,
        leftMargin=40,
        rightMargin=40
    )
    elements = []
    styles = getSampleStyleSheet()

    if boq_json is None:
        boq_json = {}

    # Company Logo
    logo_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'logo.png')
    if os.path.exists(logo_path):
        try:
            logo = Image(logo_path, width=2.5*inch, height=1*inch)
            logo.hAlign = 'CENTER'
            elements.append(logo)
            elements.append(Spacer(1, 15))
        except Exception as e:
            log.error(f"Error loading logo: {str(e)}")

    # Professional Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1F4788'),
        spaceAfter=6,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    elements.append(Paragraph("<b>QUOTATION</b>", title_style))

    subtitle_style = ParagraphStyle(
        'SubtitleStyle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#6B7280'),
        spaceAfter=20,
        alignment=TA_CENTER,
        fontName='Helvetica-Oblique'
    )
    elements.append(Paragraph("Bill of Quantities", subtitle_style))
    elements.append(Spacer(1, 10))

    # Project Information in professional box
    project_info_style = ParagraphStyle(
        'ProjectInfo',
        parent=styles['Normal'],
        fontSize=10,
        leading=14
    )

    info_data = [
        ['Project Name:', project.project_name or 'N/A'],
        ['Client Name:', project.client or 'N/A'],
        ['Location:', project.location or 'N/A'],
        ['Quotation Date:', date.today().strftime('%d %B %Y')]
    ]

    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#F3F4F6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1D5DB')),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.HexColor('#1F4788')),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 25))

    # Section Header: Scope of Work
    section_header_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.white,
        spaceAfter=15,
        spaceBefore=5,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )

    # Create colored background for section header
    scope_header_data = [['SCOPE OF WORK']]
    scope_header_table = Table(scope_header_data, colWidths=[6.7*inch])
    scope_header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#3B82F6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 14),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(scope_header_table)
    elements.append(Spacer(1, 15))

    # Process each item
    for idx, item in enumerate(items, 1):
        # Item number and name with background
        item_header_data = [[f"{idx}. {item.get('item_name', 'N/A')}"]]
        item_header_table = Table(item_header_data, colWidths=[6.7*inch])
        item_header_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#E0E7FF')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1F4788')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ]))
        elements.append(item_header_table)

        # Item description
        if item.get('description'):
            desc_style = ParagraphStyle(
                'ItemDesc',
                parent=styles['Normal'],
                fontSize=9,
                textColor=colors.HexColor('#6B7280'),
                fontName='Helvetica-Oblique',
                leftIndent=10,
                spaceAfter=8
            )
            elements.append(Paragraph(item['description'], desc_style))

        elements.append(Spacer(1, 8))

        # Check if item has sub-items
        has_sub_items = item.get('has_sub_items', False)
        sub_items = item.get('sub_items', [])

        if has_sub_items and sub_items:
            # Professional sub-items table
            sub_items_data = [[
                Paragraph('<b>Description</b>', styles['Normal']),
                Paragraph('<b>Scope/Size</b>', styles['Normal']),
                Paragraph('<b>Qty</b>', styles['Normal']),
                Paragraph('<b>Unit</b>', styles['Normal']),
                Paragraph('<b>Rate (AED)</b>', styles['Normal']),
                Paragraph('<b>Amount (AED)</b>', styles['Normal'])
            ]]

            item_misc = item.get('miscellaneous_amount', 0)
            item_overhead = item.get('overhead_amount', 0)
            item_profit = item.get('profit_margin_amount', 0)
            item_base_cost = sum([si.get('materials_cost', 0) + si.get('labour_cost', 0) for si in sub_items])

            for sub_item in sub_items:
                sub_item_name = sub_item.get('sub_item_name', 'N/A')
                scope = sub_item.get('scope', '')
                size = sub_item.get('size', '')
                location = sub_item.get('location', '')
                brand = sub_item.get('brand', '')

                # Build scope/size display with all details
                scope_parts = []
                if scope:
                    scope_parts.append(scope)
                if size:
                    scope_parts.append(size)
                if location:
                    scope_parts.append(f"Loc: {location}")
                if brand:
                    scope_parts.append(f"Brand: {brand}")
                scope_size = " | ".join(scope_parts) if scope_parts else '-'

                quantity = sub_item.get('quantity', 0)
                unit = sub_item.get('unit', 'nos')

                # Calculate with distributed misc/overhead/profit
                materials_cost = sub_item.get('materials_cost', 0)
                labour_cost = sub_item.get('labour_cost', 0)
                sub_item_base = materials_cost + labour_cost

                if item_base_cost > 0:
                    sub_item_markup = (sub_item_base / item_base_cost) * (item_misc + item_overhead + item_profit)
                else:
                    sub_item_markup = 0

                sub_item_total = sub_item_base + sub_item_markup
                adjusted_rate = sub_item_total / quantity if quantity > 0 else 0

                sub_items_data.append([
                    sub_item_name,
                    scope_size,
                    f"{quantity:.2f}",
                    unit,
                    f"{adjusted_rate:,.2f}",
                    f"{sub_item_total:,.2f}"
                ])

            # Create modern table with better styling
            sub_table = Table(sub_items_data, colWidths=[2*inch, 1.5*inch, 0.6*inch, 0.5*inch, 1*inch, 1.1*inch])
            sub_table.setStyle(TableStyle([
                # Header row
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('TOPPADDING', (0, 0), (-1, 0), 8),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),

                # Data rows
                ('ALIGN', (0, 1), (1, -1), 'LEFT'),
                ('ALIGN', (2, 1), (2, -1), 'CENTER'),
                ('ALIGN', (3, 1), (3, -1), 'CENTER'),
                ('ALIGN', (4, 1), (-1, -1), 'RIGHT'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('TOPPADDING', (0, 1), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 6),

                # Grid and borders
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1D5DB')),
                ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor('#2563EB')),

                # Alternating row colors
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
            ]))
            elements.append(sub_table)

        else:
            # Old format without sub-items
            item_qty = item.get('quantity', 0)
            item_unit = item.get('unit', 'nos')
            item_rate = item.get('rate', 0)

            old_format_style = ParagraphStyle(
                'OldFormat',
                parent=styles['Normal'],
                fontSize=9,
                leftIndent=15,
                spaceAfter=5
            )
            elements.append(Paragraph(f"<b>Quantity:</b> {item_qty:.2f} {item_unit} @ AED {item_rate:,.2f}/{item_unit}", old_format_style))

        elements.append(Spacer(1, 8))

        # Item Total with green background
        item_selling_price = item.get('selling_price', 0)
        item_total_data = [['Item Total:', f'AED {item_selling_price:,.2f}']]
        item_total_table = Table(item_total_data, colWidths=[5.6*inch, 1.1*inch])
        item_total_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D1FAE5')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#10B981')),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (1, 0), (1, -1), 10),
        ]))
        elements.append(item_total_table)
        elements.append(Spacer(1, 20))

    # Cost Summary Section
    elements.append(Spacer(1, 10))

    summary_header_data = [['COST SUMMARY']]
    summary_header_table = Table(summary_header_data, colWidths=[6.7*inch])
    summary_header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#DBEAFE')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1F4788')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 13),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(summary_header_table)
    elements.append(Spacer(1, 10))

    # Calculate totals
    subtotal_before_discount = sum([item.get('selling_price', 0) for item in items])
    total_discount = sum([item.get('discount_amount', 0) for item in items])
    subtotal_after_discount = subtotal_before_discount - total_discount
    total_vat = sum([item.get('vat_amount', 0) for item in items])
    grand_total_with_vat = subtotal_after_discount + total_vat

    summary_data = [['Subtotal:', f'AED {subtotal_before_discount:,.2f}']]

    if total_discount > 0:
        discount_pct = (total_discount / subtotal_before_discount * 100) if subtotal_before_discount > 0 else 0
        summary_data.append([f'Discount ({discount_pct:.1f}%):', f'-AED {total_discount:,.2f}'])
        summary_data.append(['After Discount:', f'AED {subtotal_after_discount:,.2f}'])

    if total_vat > 0:
        vat_pct = (total_vat / subtotal_after_discount * 100) if subtotal_after_discount > 0 else 0
        summary_data.append([f'VAT ({vat_pct:.1f}%):', f'AED {total_vat:,.2f}'])

    summary_data.append(['', ''])  # Empty row for spacing
    summary_data.append(['TOTAL PROJECT VALUE:', f'AED {grand_total_with_vat:,.2f}'])

    summary_table = Table(summary_data, colWidths=[5*inch, 1.7*inch])
    summary_table.setStyle(TableStyle([
        # Regular rows
        ('ALIGN', (0, 0), (0, -3), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, -2), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -2), 11),
        ('TOPPADDING', (0, 0), (-1, -2), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -2), 6),
        ('RIGHTPADDING', (1, 0), (1, -1), 10),

        # Grand total row
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#10B981')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.white),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 13),
        ('TOPPADDING', (0, -1), (-1, -1), 12),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 12),

        # Borders
        ('LINEABOVE', (0, 0), (-1, 0), 0.5, colors.grey),
        ('LINEABOVE', (0, -1), (-1, -1), 2, colors.HexColor('#10B981')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#D1D5DB')),
    ]))
    elements.append(summary_table)

    # Preliminaries Section
    preliminaries = boq_json.get('preliminaries', {})
    prelim_items = preliminaries.get('items', [])
    prelim_notes = preliminaries.get('notes', '')

    if prelim_items or prelim_notes:
        elements.append(Spacer(1, 25))

        prelim_header_style = ParagraphStyle(
            'PrelimHeader',
            parent=styles['Heading3'],
            fontSize=12,
            textColor=colors.HexColor('#7C3AED'),
            spaceAfter=8,
            fontName='Helvetica-Bold'
        )
        elements.append(Paragraph("<b>PRELIMINARIES & APPROVAL WORKS</b>", prelim_header_style))

        prelim_sub_style = ParagraphStyle(
            'PrelimSub',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.grey,
            fontName='Helvetica-Oblique',
            spaceAfter=12
        )
        elements.append(Paragraph("Selected conditions and terms", prelim_sub_style))

        prelim_item_style = ParagraphStyle(
            'PrelimItem',
            parent=styles['Normal'],
            fontSize=9,
            leftIndent=15,
            spaceAfter=5
        )

        for prelim_item in prelim_items:
            desc = prelim_item.get('description', prelim_item) if isinstance(prelim_item, dict) else str(prelim_item)
            elements.append(Paragraph(f"✓ {desc}", prelim_item_style))

        if prelim_notes:
            elements.append(Spacer(1, 10))
            elements.append(Paragraph("<b>Additional Notes:</b>", styles['Normal']))
            notes_style = ParagraphStyle(
                'Notes',
                parent=styles['Normal'],
                fontSize=9,
                fontName='Helvetica-Oblique',
                leftIndent=10
            )
            elements.append(Paragraph(prelim_notes, notes_style))

    # Signature Section
    elements.append(PageBreak())  # New page for signatures
    elements.append(Spacer(1, 50))

    from reportlab.platypus import HRFlowable

    sig_header_style = ParagraphStyle(
        'SigHeader',
        parent=styles['Heading3'],
        fontSize=12,
        textColor=colors.HexColor('#1F4788'),
        spaceAfter=30
    )

    # Company Signature
    elements.append(Paragraph("<b>For MeterSquare Interiors LLC:</b>", sig_header_style))
    elements.append(Spacer(1, 40))
    elements.append(HRFlowable(width="40%", thickness=1, color=colors.black, spaceBefore=1, spaceAfter=5))
    elements.append(Paragraph("Authorized Signature", styles['Normal']))
    elements.append(Spacer(1, 5))
    elements.append(Paragraph("Date: __________________", styles['Normal']))

    elements.append(Spacer(1, 50))

    # Client Signature
    elements.append(Paragraph("<b>Client Acceptance:</b>", sig_header_style))
    elements.append(Spacer(1, 40))
    elements.append(HRFlowable(width="40%", thickness=1, color=colors.black, spaceBefore=1, spaceAfter=5))
    elements.append(Paragraph("Client Signature", styles['Normal']))
    elements.append(Spacer(1, 5))
    elements.append(Paragraph("Date: __________________", styles['Normal']))

    # Footer
    elements.append(Spacer(1, 50))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.grey,
        alignment=TA_CENTER
    )
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("This quotation is valid for 30 days from the date of issue.", footer_style))
    elements.append(Paragraph("© 2025 MeterSquare Interiors LLC. All rights reserved.", footer_style))

    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
