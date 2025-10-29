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
from utils.modern_boq_pdf_generator import ModernBOQPDFGenerator
from utils.boq_calculation_helper import calculate_boq_values
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

        # Handle both old and new data structures
        # New structure: items are in existing_purchase.items
        # Old structure: items are directly in boq_json.items
        if 'existing_purchase' in boq_json and 'items' in boq_json['existing_purchase']:
            items = boq_json['existing_purchase']['items']
        else:
            items = boq_json.get('items', [])

        # Calculate all values (this populates selling_price, overhead_amount, etc.)
        total_material_cost, total_labour_cost, grand_total = calculate_boq_values(items)

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

    # Calculate subtotal from sub-items (qty × rate) - same as PDF
    subtotal_before_discount = 0
    for item in items:
        has_sub_items = item.get('has_sub_items', False)
        sub_items = item.get('sub_items', [])

        if has_sub_items and sub_items:
            for sub_item in sub_items:
                qty = sub_item.get('quantity', 0)
                rate = sub_item.get('rate', 0)
                subtotal_before_discount += qty * rate
        else:
            subtotal_before_discount += item.get('selling_price', 0)

    # Get discount from BOQ JSON (same as PDF fix)
    discount_amount = 0
    discount_percentage = 0

    if boq_json:
        discount_amount = boq_json.get('discount_amount', 0)
        discount_percentage = boq_json.get('discount_percentage', 0)

    # Fallback: try from first item
    if discount_amount == 0 and discount_percentage == 0 and items:
        first_item = items[0]
        discount_percentage = first_item.get('discount_percentage', 0)

    # Calculate discount from subtotal if percentage exists
    if discount_percentage > 0 and discount_amount == 0:
        discount_amount = subtotal_before_discount * (discount_percentage / 100)

    total_discount = discount_amount
    subtotal_after_discount = subtotal_before_discount - total_discount
    total_vat = 0  # VAT not used
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

    # Discount (only if exists)
    if discount_amount > 0:
        ws.merge_cells(f'A{row}:E{row}')
        ws[f'A{row}'] = f"Discount ({discount_percentage:.1f}%):"
        ws[f'A{row}'].font = bold_font
        ws[f'A{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'] = -round(discount_amount, 2)
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

    # VAT row removed (not used)
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
            # Filter only selected preliminaries (same as PDF fix)
            if isinstance(prelim_item, dict):
                is_selected = prelim_item.get('is_selected', prelim_item.get('selected', prelim_item.get('checked', False)))
                if not is_selected:
                    continue
                desc = prelim_item.get('description', prelim_item.get('name', prelim_item.get('text', '')))
            else:
                desc = str(prelim_item)

            if desc:  # Only add if text exists
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
    Uses unified ModernBOQPDFGenerator
    """
    if boq_json is None:
        boq_json = {}

    generator = ModernBOQPDFGenerator()
    return generator.generate_client_pdf(project, items, total_material_cost, total_labour_cost, grand_total, boq_json)
