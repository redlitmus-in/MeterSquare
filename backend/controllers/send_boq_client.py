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
    Supports multiple email addresses (comma or semicolon separated)
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400

        boq_id = data.get('boq_id')
        client_emails_raw = data.get('client_email') or data.get('client_emails')
        message = data.get('message', 'Please review the attached BOQ for your project.')
        formats = data.get('formats', ['excel', 'pdf'])

        if not boq_id or not client_emails_raw:
            return jsonify({"success": False, "error": "boq_id and client_email are required"}), 400

        # Parse multiple emails (support comma, semicolon, or list)
        if isinstance(client_emails_raw, list):
            client_emails = [email.strip() for email in client_emails_raw if email.strip()]
        else:
            # Split by comma or semicolon
            client_emails = [email.strip() for email in client_emails_raw.replace(';', ',').split(',') if email.strip()]

        if not client_emails:
            return jsonify({"success": False, "error": "At least one valid email address is required"}), 400

        # Validate email format (basic check)
        import re
        email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
        invalid_emails = [email for email in client_emails if not email_pattern.match(email)]
        if invalid_emails:
            return jsonify({"success": False, "error": f"Invalid email format: {', '.join(invalid_emails)}"}), 400

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
        total_material_cost, total_labour_cost, items_subtotal, preliminary_amount, grand_total = calculate_boq_values(items, boq_json)

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

        # Send email to all recipients - Pass selling price (overhead/profit distributed)
        email_service = BOQEmailService()

        # Track successful and failed sends
        successful_sends = []
        failed_sends = []

        for client_email in client_emails:
            try:
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
                    successful_sends.append(client_email)
                else:
                    failed_sends.append(client_email)
            except Exception as e:
                failed_sends.append(client_email)
                log.error(f"Error sending BOQ to {client_email}: {str(e)}")

        # Check if at least one email was sent successfully
        if successful_sends:
            # Update BOQ flags: email_sent = TRUE, client_status = FALSE, status = Sent_for_Confirmation
            boq.email_sent = True
            boq.client_status = False  # Not yet confirmed by client
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

            # Prepare new action for sending BOQ to client(s)
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
                "client_emails": successful_sends,  # List of all successful recipients
                "failed_emails": failed_sends if failed_sends else None  # Track failures
            }

            # Append new action to existing list
            current_actions.append(new_action)

            # Create or update history record
            recipients_str = ', '.join(successful_sends)
            if existing_history:
                # Update existing history with new action added to list
                existing_history.action = current_actions
                existing_history.action_date = datetime.utcnow()
                existing_history.comment = f"BOQ sent to {len(successful_sends)} client(s): {recipients_str}"
            else:
                # Create new history entry with action as list
                new_history = BOQHistory(
                    boq_id=boq_id,
                    action=current_actions,  # Store as list
                    action_date=datetime.utcnow(),
                    comment=f"BOQ sent to {len(successful_sends)} client(s): {recipients_str}"
                )
                db.session.add(new_history)

            db.session.commit()

            # Prepare response message
            response_message = f"BOQ sent successfully to {len(successful_sends)} recipient(s): {recipients_str}"
            if failed_sends:
                response_message += f". Failed to send to: {', '.join(failed_sends)}"

            return jsonify({
                "success": True,
                "message": response_message,
                "boq_id": boq_id,
                "status": boq.status,
                "successful_sends": successful_sends,
                "failed_sends": failed_sends,
                "total_sent": len(successful_sends),
                "total_failed": len(failed_sends)
            }), 200
        else:
            return jsonify({
                "success": False,
                "error": f"Failed to send email to all recipients. Attempted: {', '.join(client_emails)}",
                "failed_emails": failed_sends
            }), 500

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

            # Calculate item total from sub-items (clean calculation)
            item_total_calculated = 0

            # Sub-items data (CLEAN CLIENT VIEW - just qty × rate)
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

                # CLIENT VIEW: Simple qty × rate (same as PDF)
                quantity = sub_item.get('quantity', 0)
                unit = sub_item.get('unit', 'nos')
                rate = sub_item.get('rate', 0)
                sub_item_total = quantity * rate

                # Accumulate for item total
                item_total_calculated += sub_item_total

                # Write row (same as client PDF structure)
                ws.cell(row=row, column=1).value = sub_item_name
                ws.cell(row=row, column=1).alignment = Alignment(horizontal='left', vertical='center')
                ws.cell(row=row, column=2).value = scope_size
                ws.cell(row=row, column=2).alignment = Alignment(horizontal='left', vertical='center')
                ws.cell(row=row, column=3).value = round(quantity, 2)
                ws.cell(row=row, column=3).alignment = Alignment(horizontal='center', vertical='center')
                ws.cell(row=row, column=4).value = unit
                ws.cell(row=row, column=4).alignment = Alignment(horizontal='center', vertical='center')
                ws.cell(row=row, column=5).value = round(rate, 2)
                ws.cell(row=row, column=5).alignment = Alignment(horizontal='right', vertical='center')
                ws.cell(row=row, column=5).number_format = '#,##0.00'
                ws.cell(row=row, column=6).value = round(sub_item_total, 2)
                ws.cell(row=row, column=6).alignment = Alignment(horizontal='right', vertical='center')
                ws.cell(row=row, column=6).number_format = '#,##0.00'

                for col in range(1, 7):
                    ws.cell(row=row, column=col).border = thin_border
                    ws.cell(row=row, column=col).font = normal_font

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
        # Use calculated total if has sub-items, otherwise use old field
        item_total_value = item_total_calculated if (item.get('has_sub_items', False) and item.get('sub_items', [])) else item.get('selling_price', 0)
        ws[f'F{row}'] = round(item_total_value, 2)
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

    # Calculate items subtotal from sub-items (qty × rate) - same as PDF
    items_subtotal = 0
    for item in items:
        has_sub_items = item.get('has_sub_items', False)
        sub_items = item.get('sub_items', [])

        if has_sub_items and sub_items:
            for sub_item in sub_items:
                qty = sub_item.get('quantity', 0)
                rate = sub_item.get('rate', 0)
                items_subtotal += qty * rate
        else:
            items_subtotal += item.get('selling_price', 0)

    # Extract preliminary amount from boq_json
    preliminary_amount = 0
    if boq_json:
        preliminaries_data = boq_json.get('preliminaries', {})
        cost_details = preliminaries_data.get('cost_details', {})
        preliminary_amount = cost_details.get('amount', 0) or 0

    # Calculate combined subtotal (items + preliminary)
    combined_subtotal = items_subtotal + preliminary_amount

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

    # Calculate discount from combined subtotal (items + preliminary) if percentage exists
    if discount_percentage > 0 and discount_amount == 0:
        discount_amount = combined_subtotal * (discount_percentage / 100)

    total_discount = discount_amount
    subtotal_after_discount = combined_subtotal - total_discount
    total_vat = 0  # VAT not used
    grand_total_with_vat = subtotal_after_discount + total_vat

    # Items Subtotal
    ws.merge_cells(f'A{row}:E{row}')
    ws[f'A{row}'] = "Items Subtotal:"
    ws[f'A{row}'].font = bold_font
    ws[f'A{row}'].alignment = Alignment(horizontal='right', vertical='center')
    ws[f'F{row}'] = round(items_subtotal, 2)
    ws[f'F{row}'].font = bold_font
    ws[f'F{row}'].alignment = Alignment(horizontal='right', vertical='center')
    ws[f'F{row}'].number_format = '#,##0.00'
    row += 1

    # Preliminary Amount (if exists)
    if preliminary_amount > 0:
        ws.merge_cells(f'A{row}:E{row}')
        ws[f'A{row}'] = "Preliminary Amount:"
        ws[f'A{row}'].font = bold_font
        ws[f'A{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'] = round(preliminary_amount, 2)
        ws[f'F{row}'].font = bold_font
        ws[f'F{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'].number_format = '#,##0.00'
        row += 1

        # Combined Subtotal
        ws.merge_cells(f'A{row}:E{row}')
        ws[f'A{row}'] = "Combined Subtotal:"
        ws[f'A{row}'].font = Font(bold=True, size=11)
        ws[f'A{row}'].alignment = Alignment(horizontal='right', vertical='center')
        ws[f'F{row}'] = round(combined_subtotal, 2)
        ws[f'F{row}'].font = Font(bold=True, size=11)
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
    ws[f'A{row}'] = "TOTAL PROJECT VALUE (Excluding VAT):"
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
