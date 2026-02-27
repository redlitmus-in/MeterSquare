"""
Universal Email Styles for MeterSquare ERP
Using only Dark Black (#000000) and Light Blue (#3b82f6) color scheme
"""
import os

def get_email_styles():
    """Returns the universal email styles for all emails"""
    return """
        <style>
        /* Universal Dark Black and Light Blue Theme */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', 'Helvetica', sans-serif !important;
            background-color: #f0f9ff !important;
            margin: 0 !important;
            padding: 0 !important;
            color: #000000 !important;
            line-height: 1.6 !important;
            -webkit-text-size-adjust: 100% !important;
            -ms-text-size-adjust: 100% !important;
        }
        
        .email-wrapper {
            background-color: #f0f9ff !important;
            padding: 20px !important;
            width: 100% !important;
        }
        
        .email-container {
            max-width: 650px !important;
            margin: 0 auto !important;
            background: #ffffff !important;
            border-radius: 10px !important;
            overflow: hidden !important;
            box-shadow: 0 5px 15px rgba(59, 130, 246, 0.2) !important;
            border: 2px solid #3b82f6 !important;
        }
        
        /* Header Styles */
        .header {
            background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%) !important;
            padding: 25px !important;
            text-align: center !important;
        }
        
        .header h1,
        .header h2 {
            color: #ffffff !important;
            margin: 0 !important;
            font-size: 24px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            letter-spacing: 1.5px !important;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
        }
        
        .header img {
            max-width: 180px !important;
            height: auto !important;
            margin-bottom: 15px !important;
        }
        
        /* Content Styles */
        .content {
            padding: 30px !important;
            background: #ffffff !important;
        }
        
        .content h2 {
            color: #000000 !important;
            font-size: 20px !important;
            margin-bottom: 20px !important;
            padding-bottom: 10px !important;
            border-bottom: 2px solid #3b82f6 !important;
        }
        
        .content h3 {
            color: #000000 !important;
            font-size: 18px !important;
            margin: 25px 0 15px 0 !important;
            font-weight: bold !important;
            border-left: 4px solid #3b82f6 !important;
            padding-left: 10px !important;
        }
        
        .content p {
            color: #000000 !important;
            font-size: 14px !important;
            line-height: 1.8 !important;
            margin: 12px 0 !important;
        }
        
        /* Labels and Values */
        .label {
            font-weight: bold !important;
            color: #000000 !important;
            display: inline-block !important;
            min-width: 140px !important;
        }
        
        .value {
            color: #3b82f6 !important;
            font-weight: 500 !important;
        }
        
        /* Table Styles */
        .table-container {
            overflow-x: auto !important;
            margin: 20px 0 !important;
            border-radius: 8px !important;
            border: 2px solid #3b82f6 !important;
        }
        
        table {
            width: 100% !important;
            border-collapse: collapse !important;
            background: #ffffff !important;
        }
        
        table thead {
            background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%) !important;
        }
        
        table th {
            color: #ffffff !important;
            padding: 12px 10px !important;
            text-align: left !important;
            font-size: 13px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
        }
        
        table tbody tr {
            border-bottom: 1px solid #3b82f6 !important;
        }
        
        table tbody tr:nth-child(even) {
            background: #f0f9ff !important;
        }
        
        table td {
            padding: 12px 10px !important;
            color: #000000 !important;
            font-size: 13px !important;
        }
        
        /* Total Cost Box */
        .total-cost {
            margin: 25px 0 !important;
            padding: 20px !important;
            background: linear-gradient(135deg, #f0f9ff 0%, #dbeafe 100%) !important;
            border: 1px solid #bfdbfe !important;
            border-radius: 10px !important;
            text-align: right !important;
        }
        
        .total-cost .label {
            color: #000000 !important;
            font-size: 16px !important;
            font-weight: bold !important;
        }
        
        .total-cost .amount {
            color: rgb(22 163 74) !important;
            font-size: 24px !important;
            font-weight: bold !important;
            margin-left: 10px !important;
        }
        
        /* Buttons */
        .button {
            display: inline-block !important;
            padding: 12px 30px !important;
            background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%) !important;
            color: #ffffff !important;
            text-decoration: none !important;
            border-radius: 5px !important;
            font-weight: bold !important;
            font-size: 14px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            margin: 10px 5px !important;
            box-shadow: 0 3px 6px rgba(59, 130, 246, 0.3) !important;
        }
        
        .button:hover {
            background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%) !important;
        }
        
        /* Status Badges */
        .status-badge {
            display: inline-block !important;
            padding: 5px 15px !important;
            border-radius: 20px !important;
            font-size: 12px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
        }
        
        .status-approved {
            background: #3b82f6 !important;
            color: #ffffff !important;
        }
        
        .status-pending {
            background: #f0f9ff !important;
            color: #3b82f6 !important;
            border: 1px solid #3b82f6 !important;
        }
        
        .status-rejected {
            background: #000000 !important;
            color: #ffffff !important;
        }
        
        /* Signature Section */
        .signature {
            margin-top: 30px !important;
            padding-top: 20px !important;
            border-top: 2px solid #3b82f6 !important;
            color: #000000 !important;
            font-size: 14px !important;
        }
        
        .signature strong {
            color: #3b82f6 !important;
            font-size: 16px !important;
        }
        
        /* Footer */
        .footer {
            background: linear-gradient(135deg, #f0f9ff 0%, #dbeafe 100%) !important;
            padding: 25px !important;
            text-align: center !important;
            border-top: 2px solid #3b82f6 !important;
        }
        
        .footer p {
            color: #000000 !important;
            font-size: 13px !important;
            margin: 5px 0 !important;
        }
        
        .footer img {
            max-width: 150px !important;
            height: auto !important;
            margin: 15px auto !important;
            display: block !important;
        }
        
        /* Info Box */
        .info-box {
            background: #f0f9ff !important;
            border-left: 4px solid #3b82f6 !important;
            padding: 15px !important;
            margin: 20px 0 !important;
            border-radius: 0 5px 5px 0 !important;
        }
        
        .info-box p {
            color: #000000 !important;
            margin: 5px 0 !important;
        }
        
        /* Alert Box */
        .alert {
            padding: 15px !important;
            margin: 20px 0 !important;
            border-radius: 5px !important;
            font-weight: 500 !important;
        }
        
        .alert-info {
            background: #f0f9ff !important;
            border: 1px solid #3b82f6 !important;
            color: #000000 !important;
        }
        
        .alert-success {
            background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%) !important;
            color: #ffffff !important;
        }
        
        /* Divider */
        .divider {
            height: 2px !important;
            background: linear-gradient(90deg, transparent, #3b82f6, transparent) !important;
            margin: 25px 0 !important;
        }
        
        /* Responsive Design */
        @media only screen and (max-width: 600px) {
            .email-container {
                width: 100% !important;
                border-radius: 0 !important;
            }
            
            .content {
                padding: 20px !important;
            }
            
            table {
                font-size: 12px !important;
            }
            
            table th,
            table td {
                padding: 8px 5px !important;
            }
            
            .total-cost .amount {
                font-size: 20px !important;
            }
            
            .header h1,
            .header h2 {
                font-size: 20px !important;
            }
        }
        
        /* Print Styles */
        @media print {
            body {
                background: white !important;
            }
            
            .email-container {
                box-shadow: none !important;
                border: 1px solid #3b82f6 !important;
            }
        }
        </style>
    """

def get_open_erp_button():
    """Returns the 'Open MeterSquare ERP' CTA button HTML based on current ENVIRONMENT."""
    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment == "production":
        app_url = os.getenv("PROD_FRONTEND_URL", "https://msq.kol.tel")
    else:
        app_url = os.getenv("DEV_FRONTEND_URL", "http://localhost:3000")

    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
            <td align="left" style="padding: 16px 30px;">
                <a href="{app_url}"
                   style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                          color: #ffffff;
                          padding: 11px 26px;
                          text-decoration: none;
                          border-radius: 6px;
                          font-family: Arial, sans-serif;
                          font-weight: 700;
                          font-size: 13px;
                          display: inline-block;
                          box-shadow: 0 3px 8px rgba(37, 99, 235, 0.25);
                          letter-spacing: 0.4px;
                          mso-padding-alt: 0;">
                    Open MeterSquare ERP &nbsp;&rarr;
                </a>
            </td>
        </tr>
    </table>
    """


def wrap_email_content(content, show_erp_button=True):
    """Wraps email content with the universal styles and optional CTA button at the bottom.
    Set show_erp_button=False for client-facing emails where ERP access is not relevant.
    """
    button_html = get_open_erp_button() if show_erp_button else ""
    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        {get_email_styles()}
    </head>
    <body>
        <div class="email-wrapper">
            {content}
            {button_html}
        </div>
    </body>
    </html>
    """


# ──────────────────────────────────────────────────────────
# Professional Material / Delivery Email Template Builders
# ──────────────────────────────────────────────────────────

def _status_badge_html(label, variant='info'):
    """Render an inline status badge compatible with all email clients.
    Variants: info (blue), success (green), warning (amber), urgent (red), neutral (grey).
    """
    colors = {
        'info':    ('linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)', '#ffffff'),
        'success': ('linear-gradient(135deg, #059669 0%, #34d399 100%)', '#ffffff'),
        'warning': ('linear-gradient(135deg, #d97706 0%, #fbbf24 100%)', '#000000'),
        'urgent':  ('linear-gradient(135deg, #dc2626 0%, #f87171 100%)', '#ffffff'),
        'neutral': ('#e5e7eb', '#374151'),
    }
    bg, fg = colors.get(variant, colors['info'])
    return (
        f'<span style="display:inline-block;padding:5px 16px;border-radius:20px;'
        f'font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;'
        f'background:{bg};color:{fg};">{label}</span>'
    )


def _detail_row(label, value):
    """Single key-value row for info-box sections (inline-styled for email clients)."""
    if not value:
        return ''
    return (
        f'<tr>'
        f'<td style="padding:6px 12px;font-size:13px;font-weight:bold;color:#000000;'
        f'white-space:nowrap;vertical-align:top;">{label}</td>'
        f'<td style="padding:6px 12px;font-size:13px;color:#1e3a5f;">{value}</td>'
        f'</tr>'
    )


def _info_box(rows_html, title=None):
    """Wraps key-value rows in a styled info-box."""
    title_html = (
        f'<div style="font-size:13px;font-weight:bold;text-transform:uppercase;'
        f'letter-spacing:0.5px;color:#3b82f6;margin-bottom:8px;">{title}</div>'
    ) if title else ''
    return (
        f'<div style="background:#f0f9ff;border-left:4px solid #3b82f6;'
        f'padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">'
        f'{title_html}'
        f'<table width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="border-collapse:collapse;">{rows_html}</table>'
        f'</div>'
    )


def _materials_table(items):
    """Render a professional materials table from a list of dicts.
    Each dict should have: material_name, quantity, unit, and optionally brand, size.
    """
    if not items:
        return ''
    rows = ''
    for idx, item in enumerate(items):
        bg = '#f0f9ff' if idx % 2 == 0 else '#ffffff'
        name = item.get('material_name', 'Unknown Material')
        brand = item.get('brand', '')
        size = item.get('size', '')
        qty = item.get('quantity', '')
        unit = item.get('unit', '')
        detail_parts = [p for p in [brand, size] if p]
        detail = f'<br/><span style="font-size:11px;color:#6b7280;">{" · ".join(detail_parts)}</span>' if detail_parts else ''
        rows += (
            f'<tr style="background:{bg};border-bottom:1px solid #e0e7ff;">'
            f'<td style="padding:10px 12px;font-size:13px;color:#000000;">{idx+1}</td>'
            f'<td style="padding:10px 12px;font-size:13px;color:#000000;">{name}{detail}</td>'
            f'<td style="padding:10px 12px;font-size:13px;color:#000000;text-align:center;">{qty}</td>'
            f'<td style="padding:10px 12px;font-size:13px;color:#000000;text-align:center;">{unit}</td>'
            f'</tr>'
        )
    return (
        f'<div style="overflow-x:auto;margin:20px 0;border-radius:8px;border:1px solid #bfdbfe;">'
        f'<table width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="border-collapse:collapse;background:#ffffff;">'
        f'<thead><tr style="background:linear-gradient(135deg,#3b82f6 0%,#60a5fa 100%);">'
        f'<th style="padding:10px 12px;font-size:12px;color:#ffffff;text-transform:uppercase;'
        f'letter-spacing:0.5px;text-align:left;width:40px;">#</th>'
        f'<th style="padding:10px 12px;font-size:12px;color:#ffffff;text-transform:uppercase;'
        f'letter-spacing:0.5px;text-align:left;">Material</th>'
        f'<th style="padding:10px 12px;font-size:12px;color:#ffffff;text-transform:uppercase;'
        f'letter-spacing:0.5px;text-align:center;">Qty</th>'
        f'<th style="padding:10px 12px;font-size:12px;color:#ffffff;text-transform:uppercase;'
        f'letter-spacing:0.5px;text-align:center;">Unit</th>'
        f'</tr></thead>'
        f'<tbody>{rows}</tbody>'
        f'</table></div>'
    )


def _action_box(message, variant='info'):
    """Render a call-to-action box with a message."""
    border_colors = {
        'info': '#3b82f6', 'success': '#059669',
        'warning': '#d97706', 'urgent': '#dc2626',
    }
    bg_colors = {
        'info': '#eff6ff', 'success': '#ecfdf5',
        'warning': '#fffbeb', 'urgent': '#fef2f2',
    }
    bc = border_colors.get(variant, '#3b82f6')
    bg = bg_colors.get(variant, '#eff6ff')
    icon = {'info': 'ℹ️', 'success': '✅', 'warning': '⚠️', 'urgent': '🚨'}.get(variant, 'ℹ️')
    return (
        f'<div style="background:{bg};border:1px solid {bc};border-radius:8px;'
        f'padding:14px 18px;margin:20px 0;font-size:13px;color:#000000;line-height:1.6;">'
        f'{icon}&nbsp; {message}</div>'
    )


def _divider():
    """Horizontal gradient divider line."""
    return '<div style="height:2px;background:linear-gradient(90deg,transparent,#3b82f6,transparent);margin:24px 0;"></div>'


def _footer_note():
    """Standard footer text for material emails."""
    return (
        '<div style="padding:16px 30px 8px;font-size:11px;color:#6b7280;line-height:1.5;">'
        'This is an automated notification from MeterSquare ERP. '
        'Please do not reply directly to this email.'
        '</div>'
    )


def build_material_email(
    header_title,
    status_label=None,
    status_variant='info',
    reference_number=None,
    reference_label='Reference',
    project_name=None,
    date_str=None,
    detail_rows=None,
    detail_title=None,
    materials=None,
    materials_summary=None,
    action_message=None,
    action_variant='info',
    extra_html='',
):
    """Build a complete professional material/delivery email body (pre-wrap_email_content).

    Args:
        header_title:     Main heading shown in the blue gradient header
        status_label:     Badge text (e.g. "In Transit", "Delivered", "Urgent")
        status_variant:   Badge color variant (info/success/warning/urgent)
        reference_number: Document number (DN, RDN, IMR)
        reference_label:  Label for the reference (e.g. "Delivery Note", "Return Note")
        project_name:     Target project name
        date_str:         Date string to show
        detail_rows:      List of (label, value) tuples for the info-box
        detail_title:     Title for the detail info-box section
        materials:        List of dicts with material_name, quantity, unit, brand, size
        materials_summary: Fallback text summary when items list is not available
        action_message:   Call-to-action text (e.g. "Please confirm receipt...")
        action_variant:   CTA box color variant
        extra_html:       Any additional HTML to append before the footer
    """
    parts = []

    # ── Header ──
    badge = _status_badge_html(status_label, status_variant) if status_label else ''
    parts.append(
        f'<div class="email-container" style="max-width:650px;margin:0 auto;background:#ffffff;'
        f'border-radius:10px;overflow:hidden;box-shadow:0 5px 15px rgba(59,130,246,0.15);'
        f'border:1px solid #bfdbfe;">'
        f'<div style="background:linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%);'
        f'padding:28px 30px;text-align:center;">'
        f'<h2 style="color:#ffffff;margin:0 0 8px;font-size:22px;font-weight:bold;'
        f'text-transform:uppercase;letter-spacing:1.5px;'
        f'text-shadow:0 2px 4px rgba(0,0,0,0.15);">{header_title}</h2>'
        f'{badge}'
        f'</div>'
    )

    # ── Content area ──
    parts.append('<div style="padding:28px 30px;">')

    # Reference + project info box
    ref_rows = ''
    if reference_number:
        ref_rows += _detail_row(reference_label, f'<strong>{reference_number}</strong>')
    if project_name:
        ref_rows += _detail_row('Project', f'<strong>{project_name}</strong>')
    if date_str:
        ref_rows += _detail_row('Date', date_str)
    if ref_rows:
        parts.append(_info_box(ref_rows, 'Reference Details'))

    # Additional detail rows (transport, sender, etc.)
    if detail_rows:
        rows_html = ''
        for label, value in detail_rows:
            rows_html += _detail_row(label, value)
        if rows_html:
            parts.append(_info_box(rows_html, detail_title))

    # Materials table or summary
    if materials:
        parts.append(
            f'<div style="font-size:14px;font-weight:bold;color:#000000;'
            f'margin:20px 0 4px;border-left:4px solid #3b82f6;padding-left:10px;">'
            f'Materials</div>'
        )
        parts.append(_materials_table(materials))
    elif materials_summary:
        parts.append(
            f'<div style="font-size:14px;font-weight:bold;color:#000000;'
            f'margin:20px 0 8px;border-left:4px solid #3b82f6;padding-left:10px;">'
            f'Materials</div>'
            f'<p style="font-size:13px;color:#000000;line-height:1.7;margin:8px 0;">'
            f'{materials_summary}</p>'
        )

    # Extra HTML
    if extra_html:
        parts.append(extra_html)

    # Action / next steps
    if action_message:
        parts.append(_divider())
        parts.append(_action_box(action_message, action_variant))

    parts.append('</div>')  # close content padding

    # ── Footer ──
    parts.append(_footer_note())
    parts.append('</div>')  # close email-container

    return '\n'.join(parts)