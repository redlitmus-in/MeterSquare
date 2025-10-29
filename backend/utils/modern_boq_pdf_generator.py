"""
Modern BOQ PDF Generator - Corporate Professional Design
Clean, compact, and accurate calculations
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
from io import BytesIO
from datetime import date
import os


class ModernBOQPDFGenerator:
    """Modern corporate BOQ PDF generator"""

    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_styles()

    def _setup_styles(self):
        """Setup modern professional styles"""
        # Clean header style
        self.styles.add(ParagraphStyle(
            name='ModernHeader',
            parent=self.styles['Normal'],
            fontSize=9,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a')
        ))

    def _add_watermark(self, canvas_obj, doc):
        """Add subtle watermark"""
        logo_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'logo.png')
        if os.path.exists(logo_path):
            try:
                canvas_obj.saveState()
                canvas_obj.setFillAlpha(0.08)
                page_width, page_height = A4

                # Centered, proper aspect ratio
                canvas_obj.drawImage(logo_path,
                                   (page_width - 2.5*inch) / 2,
                                   (page_height - 1*inch) / 2,
                                   width=2.5*inch, height=1*inch,
                                   preserveAspectRatio=True, mask='auto')
                canvas_obj.restoreState()
            except:
                pass

    def generate_client_pdf(self, project, items, total_material_cost, total_labour_cost, grand_total, boq_json=None):
        """Generate clean CLIENT quotation PDF"""
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4,
                              topMargin=30, bottomMargin=30,
                              leftMargin=30, rightMargin=30)
        elements = []

        # Header
        elements.extend(self._client_header(project, boq_json))

        # Main items table
        elements.extend(self._client_items_table(items, boq_json))

        # Summary (pass boq_json for discount info)
        elements.extend(self._client_summary(items, grand_total, boq_json))

        # Terms
        elements.extend(self._client_terms())

        doc.build(elements, onFirstPage=self._add_watermark, onLaterPages=self._add_watermark)
        buffer.seek(0)
        return buffer.read()

    def generate_internal_pdf(self, project, items, total_material_cost, total_labour_cost, grand_total, boq_json=None):
        """Generate detailed INTERNAL BOQ PDF"""
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4,
                              topMargin=30, bottomMargin=30,
                              leftMargin=30, rightMargin=30)
        elements = []

        # Header
        elements.extend(self._internal_header(project))

        # Items with full breakdown
        elements.extend(self._internal_items_table(items, boq_json))

        # Cost summary
        elements.extend(self._internal_summary(items, total_material_cost, total_labour_cost))

        # Terms
        elements.extend(self._client_terms())

        doc.build(elements, onFirstPage=self._add_watermark, onLaterPages=self._add_watermark)
        buffer.seek(0)
        return buffer.read()

    def _client_header(self, project, boq_json=None):
        """Modern clean client header"""
        elements = []
        logo_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'logo.png')

        # Logo and company info - single row
        if os.path.exists(logo_path):
            try:
                logo = Image(logo_path, width=1.8*inch, height=0.7*inch, kind='proportional')
                company = Paragraph(
                    '<b>METERSQUARE INTERIORS LLC</b><br/>'
                    '<font size="7">Business Bay, Dubai, UAE</font>',
                    ParagraphStyle('Co', parent=self.styles['Normal'], fontSize=9, alignment=TA_RIGHT)
                )
                header = Table([[logo, company]], colWidths=[2.5*inch, 4.5*inch])
                header.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.black),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
                ]))
                elements.append(header)
            except:
                elements.append(Paragraph('<b>METERSQUARE INTERIORS LLC</b>', self.styles['Heading1']))
        else:
            elements.append(Paragraph('<b>METERSQUARE INTERIORS LLC</b>', self.styles['Heading1']))

        elements.append(Spacer(1, 10))

        # Title
        elements.append(Paragraph(
            '<b>QUOTATION</b>',
            ParagraphStyle('Title', parent=self.styles['Normal'],
                         fontSize=14, fontName='Helvetica-Bold', alignment=TA_CENTER)
        ))
        elements.append(Spacer(1, 8))

        # Get duration from boq_json or project
        duration = '30 days'  # Default
        if boq_json and 'project_details' in boq_json:
            duration_days = boq_json['project_details'].get('duration_days', 30)
            duration = f'{duration_days} days'
        elif hasattr(project, 'duration_days'):
            duration = f'{project.duration_days} days'

        # Project info - compact grid
        today = date.today().strftime('%d %B %Y')
        info_data = [
            ['Quotation No:', 'MSQ-BOQ-2025-0101', 'Date:', today],
            ['Client:', getattr(project, 'client', 'N/A'), 'Project:', getattr(project, 'project_name', 'N/A')],
            ['Location:', getattr(project, 'location', 'Dubai, UAE'), 'Duration:', duration]
        ]

        info_table = Table(info_data, colWidths=[1.2*inch, 2*inch, 1*inch, 2.8*inch])
        info_table.setStyle(TableStyle([
            ('FONTSIZE', (0,0), (-1,-1), 7),
            ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
            ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('TOPPADDING', (0,0), (-1,-1), 2),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 10))

        return elements

    def _internal_header(self, project):
        """Modern clean internal header"""
        elements = []
        logo_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'logo.png')

        # Logo and company info
        if os.path.exists(logo_path):
            try:
                logo = Image(logo_path, width=1.8*inch, height=0.7*inch, kind='proportional')
                company = Paragraph(
                    '<b>METERSQUARE INTERIORS LLC</b><br/>'
                    '<font size="7">Internal BOQ Document</font>',
                    ParagraphStyle('Co', parent=self.styles['Normal'], fontSize=9, alignment=TA_RIGHT)
                )
                header = Table([[logo, company]], colWidths=[2.5*inch, 4.5*inch])
                header.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.black),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
                ]))
                elements.append(header)
            except:
                elements.append(Paragraph('<b>METERSQUARE INTERIORS LLC</b>', self.styles['Heading1']))
        else:
            elements.append(Paragraph('<b>METERSQUARE INTERIORS LLC</b>', self.styles['Heading1']))

        elements.append(Spacer(1, 10))

        # Title
        elements.append(Paragraph(
            '<b>INTERNAL BOQ — Bill of Quantities</b>',
            ParagraphStyle('Title', parent=self.styles['Normal'],
                         fontSize=14, fontName='Helvetica-Bold', alignment=TA_CENTER)
        ))
        elements.append(Spacer(1, 8))

        # Project info
        today = date.today().strftime('%d %B %Y')
        info_data = [
            ['BOQ No:', 'MSQ-BOQ-2025-0101', 'Date:', today],
            ['Project:', getattr(project, 'project_name', 'N/A'), 'Client:', getattr(project, 'client', 'N/A')],
        ]

        info_table = Table(info_data, colWidths=[1.2*inch, 2*inch, 1*inch, 2.8*inch])
        info_table.setStyle(TableStyle([
            ('FONTSIZE', (0,0), (-1,-1), 7),
            ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
            ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('TOPPADDING', (0,0), (-1,-1), 2),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 10))

        return elements

    def _client_items_table(self, items, boq_json):
        """Clean client items table - only quantities and prices"""
        elements = []

        # Preliminaries section if exists
        if boq_json and boq_json.get('preliminaries'):
            prelim_data = boq_json['preliminaries']
            prelim_items = prelim_data.get('items', [])
            prelim_notes = prelim_data.get('notes', '')

            if prelim_items or prelim_notes:
                # Title
                elements.append(Paragraph(
                    '<b>PRELIMINARIES & APPROVAL WORKS</b>',
                    ParagraphStyle('PrelimTitle', parent=self.styles['Normal'],
                                 fontSize=10, fontName='Helvetica-Bold',
                                 textColor=colors.HexColor('#92400e'))
                ))
                elements.append(Spacer(1, 5))

                # Items with checkmarks - FILTER ONLY SELECTED ITEMS
                if prelim_items:
                    for item_data in prelim_items:
                        # Handle both string and dict formats
                        if isinstance(item_data, dict):
                            # Check multiple field names: is_selected, selected, checked
                            # Default to False (don't show if field doesn't exist)
                            is_selected = item_data.get('is_selected', item_data.get('selected', item_data.get('checked', False)))
                            if not is_selected:
                                continue

                            item_text = item_data.get('description', item_data.get('name', item_data.get('text', '')))
                        else:
                            item_text = str(item_data)

                        if item_text:  # Only add if text exists
                            elements.append(Paragraph(
                                f'✓ {item_text}',
                                ParagraphStyle('PrelimItem', parent=self.styles['Normal'],
                                             fontSize=8, textColor=colors.HexColor('#44403c'),
                                             leftIndent=10)
                            ))

                # Notes
                if prelim_notes:
                    elements.append(Spacer(1, 5))
                    elements.append(Paragraph(
                        f'<b>Note:</b> {prelim_notes}',
                        ParagraphStyle('PrelimNote', parent=self.styles['Normal'],
                                     fontSize=8, textColor=colors.HexColor('#78350f'))
                    ))

                elements.append(Spacer(1, 10))

        table_data = []

        # Header
        table_data.append([
            Paragraph('<b>S.No</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=8, alignment=TA_CENTER)),
            Paragraph('<b>Description</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=8)),
            Paragraph('<b>Qty</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=8, alignment=TA_CENTER)),
            Paragraph('<b>Unit</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=8, alignment=TA_CENTER)),
            Paragraph('<b>Rate (AED)</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=8, alignment=TA_RIGHT)),
            Paragraph('<b>Amount (AED)</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=8, alignment=TA_RIGHT))
        ])

        # Items
        for idx, item in enumerate(items, 1):
            has_sub_items = item.get('has_sub_items', False)
            sub_items = item.get('sub_items', [])

            if has_sub_items and sub_items:
                # Parent item header
                table_data.append([
                    str(idx),
                    Paragraph(f'<b>{item.get("item_name", "N/A")}</b>',
                             ParagraphStyle('Item', parent=self.styles['Normal'], fontSize=9)),
                    '', '', '', ''
                ])

                # Sub-items
                for sub_idx, sub_item in enumerate(sub_items, 1):
                    qty = sub_item.get('quantity', 0)
                    rate = sub_item.get('rate', 0)
                    amount = qty * rate

                    desc = sub_item.get('sub_item_name', 'N/A')
                    if sub_item.get('scope'):
                        desc += f' - {sub_item["scope"]}'

                    table_data.append([
                        f'{idx}.{sub_idx}',
                        Paragraph(desc, ParagraphStyle('Sub', parent=self.styles['Normal'], fontSize=8)),
                        f'{qty:.0f}',
                        sub_item.get('unit', 'nos'),
                        f'{rate:,.2f}',
                        f'{amount:,.2f}'
                    ])
            else:
                # Single item
                qty = item.get('quantity', 0)
                rate = item.get('rate', 0)
                amount = item.get('selling_price', 0)

                table_data.append([
                    str(idx),
                    Paragraph(item.get('item_name', 'N/A'),
                             ParagraphStyle('Item', parent=self.styles['Normal'], fontSize=8)),
                    f'{qty:.0f}',
                    item.get('unit', 'nos'),
                    f'{rate:,.2f}',
                    f'{amount:,.2f}'
                ])

        # Create table
        main_table = Table(table_data, colWidths=[0.4*inch, 3.2*inch, 0.5*inch, 0.5*inch, 0.9*inch, 1*inch])
        main_table.setStyle(TableStyle([
            # Header
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f5f5f5')),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 8),
            ('BOTTOMPADDING', (0,0), (-1,0), 5),
            ('TOPPADDING', (0,0), (-1,0), 5),
            ('LINEBELOW', (0,0), (-1,0), 1, colors.black),

            # Data rows
            ('FONTSIZE', (0,1), (-1,-1), 8),
            ('TOPPADDING', (0,1), (-1,-1), 3),
            ('BOTTOMPADDING', (0,1), (-1,-1), 3),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),

            # Alignment
            ('ALIGN', (0,0), (0,-1), 'CENTER'),
            ('ALIGN', (2,0), (3,-1), 'CENTER'),
            ('ALIGN', (4,0), (-1,-1), 'RIGHT'),

            # Borders
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('INNERGRID', (0,0), (-1,-1), 0.25, colors.HexColor('#e0e0e0')),
        ]))

        elements.append(main_table)
        return elements

    def _internal_items_table(self, items, boq_json):
        """Detailed internal items with cost breakdown"""
        elements = []

        # Preliminaries section if exists
        if boq_json and boq_json.get('preliminaries'):
            prelim_data = boq_json['preliminaries']
            prelim_items = prelim_data.get('items', [])
            prelim_notes = prelim_data.get('notes', '')

            if prelim_items or prelim_notes:
                elements.append(Paragraph(
                    '<b>PRELIMINARIES & APPROVAL WORKS</b>',
                    ParagraphStyle('PrelimTitle', parent=self.styles['Normal'],
                                 fontSize=10, fontName='Helvetica-Bold',
                                 textColor=colors.HexColor('#92400e'))
                ))
                elements.append(Spacer(1, 5))

                if prelim_items:
                    for item_data in prelim_items:
                        # Handle both string and dict formats
                        if isinstance(item_data, dict):
                            # Check multiple field names: is_selected, selected, checked
                            # Default to False (don't show if field doesn't exist)
                            is_selected = item_data.get('is_selected', item_data.get('selected', item_data.get('checked', False)))
                            if not is_selected:
                                continue

                            item_text = item_data.get('description', item_data.get('name', item_data.get('text', '')))
                        else:
                            item_text = str(item_data)

                        if item_text:
                            elements.append(Paragraph(
                                f'✓ {item_text}',
                                ParagraphStyle('PrelimItem', parent=self.styles['Normal'],
                                             fontSize=8, textColor=colors.HexColor('#44403c'),
                                             leftIndent=10)
                            ))

                if prelim_notes:
                    elements.append(Spacer(1, 5))
                    elements.append(Paragraph(
                        f'<b>Note:</b> {prelim_notes}',
                        ParagraphStyle('PrelimNote', parent=self.styles['Normal'],
                                     fontSize=8, textColor=colors.HexColor('#78350f'))
                    ))

                elements.append(Spacer(1, 10))

        table_data = []
        # Track row indices for material and labour headers (for styling)
        material_header_rows = []
        labour_header_rows = []

        # Header
        table_data.append([
            Paragraph('<b>S.No</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=7, alignment=TA_CENTER)),
            Paragraph('<b>Item / Description</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=7)),
            Paragraph('<b>Qty</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=7, alignment=TA_CENTER)),
            Paragraph('<b>Unit</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=7, alignment=TA_CENTER)),
            Paragraph('<b>Unit Price</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=7, alignment=TA_RIGHT)),
            Paragraph('<b>Total (AED)</b>', ParagraphStyle('H', parent=self.styles['Normal'], fontSize=7, alignment=TA_RIGHT))
        ])

        # Items
        for idx, item in enumerate(items, 1):
            has_sub_items = item.get('has_sub_items', False)
            sub_items = item.get('sub_items', [])

            if has_sub_items and sub_items:
                # Parent header
                table_data.append([
                    str(idx),
                    Paragraph(f'<b>{item.get("item_name", "N/A")}</b>',
                             ParagraphStyle('Item', parent=self.styles['Normal'], fontSize=8)),
                    '', '', '', ''
                ])

                # Sub-items with breakdown
                for sub_idx, sub_item in enumerate(sub_items, 1):
                    # Calculate totals
                    qty = sub_item.get('quantity', 0)
                    rate = sub_item.get('rate', 0)
                    client_amount = qty * rate

                    # Sub-item header with details
                    sub_item_header = f'<b>{sub_item.get("sub_item_name", "N/A")}</b>'
                    if sub_item.get('scope'):
                        sub_item_header += f'<br/><font size="6"><i>Scope: {sub_item.get("scope")}</i></font>'

                    details = []
                    if sub_item.get('size'):
                        details.append(f'Size: {sub_item.get("size")}')
                    if sub_item.get('location'):
                        details.append(f'Location: {sub_item.get("location")}')
                    if sub_item.get('brand'):
                        details.append(f'Brand: {sub_item.get("brand")}')
                    if details:
                        sub_item_header += f'<br/><font size="6">{" | ".join(details)}</font>'

                    sub_item_header += f'<br/><font size="6">Qty: {qty} {sub_item.get("unit", "nos")} @ AED{rate:.2f}/{sub_item.get("unit", "nos")}</font>'

                    table_data.append([
                        f'{idx}.{sub_idx}',
                        Paragraph(sub_item_header, ParagraphStyle('Sub', parent=self.styles['Normal'], fontSize=7)),
                        '', '',
                        Paragraph('<b>Client Amount:</b>', ParagraphStyle('ClientLabel', parent=self.styles['Normal'], fontSize=6, alignment=TA_RIGHT)),
                        Paragraph(f'<b>{client_amount:,.2f}</b>', ParagraphStyle('ClientAmt', parent=self.styles['Normal'], fontSize=7, fontName='Helvetica-Bold', alignment=TA_RIGHT, textColor=colors.HexColor('#16a34a')))
                    ])

                    # Materials section header
                    materials = sub_item.get('materials', [])
                    if materials:
                        # Track this row for background color
                        material_header_rows.append(len(table_data))
                        table_data.append([
                            '',
                            Paragraph('<b>+ RAW MATERIALS</b>', ParagraphStyle('MatHeader', parent=self.styles['Normal'], fontSize=7, fontName='Helvetica-Bold', textColor=colors.white)),
                            '', '', '', ''
                        ])

                        materials_cost = 0
                        for mat in materials:
                            mat_total = mat.get('total_price', 0)
                            materials_cost += mat_total
                            table_data.append([
                                '',
                                Paragraph(f'  • {mat.get("material_name", "N/A")}',
                                         ParagraphStyle('Mat', parent=self.styles['Normal'], fontSize=7)),
                                f'{mat.get("quantity", 0):.0f}',
                                mat.get('unit', 'nos'),
                                f'{mat.get("unit_price", 0):.2f}',
                                f'{mat_total:,.2f}'
                            ])

                        # Total Materials row
                        table_data.append([
                            '',
                            Paragraph('<b>Total Materials:</b>', ParagraphStyle('MatTotal', parent=self.styles['Normal'], fontSize=7, fontName='Helvetica-Bold')),
                            '', '', '',
                            Paragraph(f'<b>{materials_cost:,.2f}</b>', ParagraphStyle('MatTotalVal', parent=self.styles['Normal'], fontSize=7, fontName='Helvetica-Bold'))
                        ])

                    # Labour section header
                    labour = sub_item.get('labour', [])
                    if labour:
                        # Track this row for background color
                        labour_header_rows.append(len(table_data))
                        table_data.append([
                            '',
                            Paragraph('<b>+ LABOUR</b>', ParagraphStyle('LabHeader', parent=self.styles['Normal'], fontSize=7, fontName='Helvetica-Bold', textColor=colors.white)),
                            '', '', '', ''
                        ])

                        labour_cost = 0
                        for lab in labour:
                            lab_total = lab.get('total_cost', 0)
                            labour_cost += lab_total
                            table_data.append([
                                '',
                                Paragraph(f'  • {lab.get("labour_role", "N/A")} (Labour)',
                                         ParagraphStyle('Lab', parent=self.styles['Normal'], fontSize=7)),
                                f'{lab.get("hours", 0):.0f}',
                                'Hrs',
                                f'{lab.get("rate_per_hour", 0):.2f}',
                                f'{lab_total:,.2f}'
                            ])

                        # Total Labour row
                        table_data.append([
                            '',
                            Paragraph('<b>Total Labour:</b>', ParagraphStyle('LabTotal', parent=self.styles['Normal'], fontSize=7, fontName='Helvetica-Bold')),
                            '', '', '',
                            Paragraph(f'<b>{labour_cost:,.2f}</b>', ParagraphStyle('LabTotalVal', parent=self.styles['Normal'], fontSize=7, fontName='Helvetica-Bold'))
                        ])

                    # Calculations - Get percentages from SUB-ITEM (as per TD modal!)
                    materials_cost = sum([m.get('total_price', 0) for m in sub_item.get('materials', [])])
                    labour_cost = sum([l.get('total_cost', 0) for l in sub_item.get('labour', [])])
                    base_cost = materials_cost + labour_cost

                    # Get percentages from SUB-ITEM first, fallback to PARENT ITEM
                    misc_pct = sub_item.get('misc_percentage', item.get('miscellaneous_percentage', item.get('overhead_percentage', 10)))
                    overhead_pct = sub_item.get('overhead_profit_percentage', item.get('overhead_profit_percentage', item.get('profit_margin_percentage', 25)))
                    transport_pct = sub_item.get('transport_percentage', item.get('transport_percentage', 5))

                    # Calculate based on CLIENT AMOUNT (as per BOQDetailsModal!)
                    misc_amt = client_amount * (misc_pct / 100)
                    overhead_amt = client_amount * (overhead_pct / 100)
                    transport_amt = client_amount * (transport_pct / 100)

                    # Internal cost = Materials + Labour + Misc + O&P + Transport (as per BOQDetailsModal line 757)
                    internal_cost = base_cost + misc_amt + overhead_amt + transport_amt

                    # Add blank row for spacing
                    table_data.append(['', '', '', '', '', ''])

                    # SEPARATE ROWS for each cost component
                    # Misc row
                    table_data.append([
                        '',
                        Paragraph(f'<i>Misc ({misc_pct:.1f}%)</i>',
                                 ParagraphStyle('Calc', parent=self.styles['Normal'], fontSize=7, textColor=colors.HexColor('#666666'))),
                        '', '', '',
                        f'{misc_amt:,.2f}'
                    ])

                    # O&P row
                    table_data.append([
                        '',
                        Paragraph(f'<i>O&P ({overhead_pct:.1f}%)</i>',
                                 ParagraphStyle('Calc', parent=self.styles['Normal'], fontSize=7, textColor=colors.HexColor('#666666'))),
                        '', '', '',
                        f'{overhead_amt:,.2f}'
                    ])

                    # Transport row (if exists)
                    if transport_pct > 0:
                        table_data.append([
                            '',
                            Paragraph(f'<i>Transport ({transport_pct:.1f}%)</i>',
                                     ParagraphStyle('Calc', parent=self.styles['Normal'], fontSize=7, textColor=colors.HexColor('#666666'))),
                            '', '', '',
                            f'{transport_amt:,.2f}'
                        ])

                    # Total Internal Cost row
                    table_data.append([
                        '',
                        Paragraph('<b>Total Internal Cost</b>',
                                 ParagraphStyle('TotalCost', parent=self.styles['Normal'], fontSize=7, fontName='Helvetica-Bold')),
                        '', '', '',
                        Paragraph(f'<b>{internal_cost:,.2f}</b>', ParagraphStyle('TotalCostVal', parent=self.styles['Normal'], fontSize=7, fontName='Helvetica-Bold'))
                    ])

                    # Add blank row
                    table_data.append(['', '', '', '', '', ''])

                    # Planned Profit row
                    table_data.append([
                        '',
                        Paragraph('<i>Planned Profit:</i>',
                                 ParagraphStyle('Profit', parent=self.styles['Normal'], fontSize=7, textColor=colors.HexColor('#00AA00'))),
                        '', '', '',
                        Paragraph(f'<font color="#00AA00">{overhead_amt:,.2f}</font>',
                                 ParagraphStyle('ProfitVal', parent=self.styles['Normal'], fontSize=7))
                    ])

                    # Actual Profit row (as per BOQDetailsModal line 758)
                    # actualProfit = clientAmount - internalCost
                    actual_profit = client_amount - internal_cost
                    profit_color = '#00AA00' if actual_profit >= overhead_amt else '#CC0000'
                    table_data.append([
                        '',
                        Paragraph('<i>Actual Profit:</i>',
                                 ParagraphStyle('ActualProfit', parent=self.styles['Normal'], fontSize=7, textColor=colors.HexColor(profit_color))),
                        '', '', '',
                        Paragraph(f'<font color="{profit_color}">{actual_profit:,.2f}</font>',
                                 ParagraphStyle('ActualProfitVal', parent=self.styles['Normal'], fontSize=7))
                    ])

        # Create table
        main_table = Table(table_data, colWidths=[0.4*inch, 3*inch, 0.5*inch, 0.5*inch, 0.9*inch, 1.2*inch])

        # Build table style with dynamic background colors
        table_styles = [
            # Header
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f5f5f5')),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,0), 5),
            ('TOPPADDING', (0,0), (-1,0), 5),
            ('LINEBELOW', (0,0), (-1,0), 1, colors.black),

            # Data
            ('FONTSIZE', (0,1), (-1,-1), 7),
            ('TOPPADDING', (0,1), (-1,-1), 2),
            ('BOTTOMPADDING', (0,1), (-1,-1), 2),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),

            # Alignment
            ('ALIGN', (0,0), (0,-1), 'CENTER'),
            ('ALIGN', (2,0), (3,-1), 'CENTER'),
            ('ALIGN', (4,0), (-1,-1), 'RIGHT'),

            # Borders
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
            ('INNERGRID', (0,0), (-1,-1), 0.25, colors.HexColor('#e0e0e0')),
        ]

        # Add light red background for material headers
        for row_idx in material_header_rows:
            table_styles.append(('BACKGROUND', (0, row_idx), (-1, row_idx), colors.HexColor('#ffcccc')))

        # Add light red background for labour headers
        for row_idx in labour_header_rows:
            table_styles.append(('BACKGROUND', (0, row_idx), (-1, row_idx), colors.HexColor('#ffcccc')))

        main_table.setStyle(TableStyle(table_styles))

        elements.append(main_table)
        return elements

    def _client_summary(self, items, grand_total, boq_json=None):
        """Clean client summary with discount"""
        elements = []
        elements.append(Spacer(1, 10))

        # Calculate subtotal from all sub-items (sum of qty × rate)
        subtotal = 0
        for item in items:
            has_sub_items = item.get('has_sub_items', False)
            sub_items = item.get('sub_items', [])

            if has_sub_items and sub_items:
                for sub_item in sub_items:
                    qty = sub_item.get('quantity', 0)
                    rate = sub_item.get('rate', 0)
                    subtotal += qty * rate
            else:
                subtotal += item.get('selling_price', 0)

        # Get discount from BOQ JSON or items
        discount_amount = 0
        discount_percentage = 0

        # Try to get discount from boq_json first (most reliable)
        if boq_json:
            discount_amount = boq_json.get('discount_amount', 0)
            discount_percentage = boq_json.get('discount_percentage', 0)

        # Fallback: try from first item
        if discount_amount == 0 and discount_percentage == 0 and items:
            first_item = items[0]
            discount_percentage = first_item.get('discount_percentage', 0)

        # Calculate discount from subtotal if percentage exists
        if discount_percentage > 0 and discount_amount == 0:
            discount_amount = subtotal * (discount_percentage / 100)

        after_discount = subtotal - discount_amount
        vat_amount = 0  # Usually 0 for UAE internal projects
        grand_total_calc = after_discount + vat_amount

        summary_data = [
            ['Subtotal:', f'{subtotal:,.2f} AED']
        ]

        # Add discount row if discount exists
        if discount_amount > 0:
            summary_data.append(['Discount ({:.1f}%):'.format(discount_percentage), f'- {discount_amount:,.2f} AED'])
            summary_data.append(['After Discount:', f'{after_discount:,.2f} AED'])

        # Grand Total (no VAT row - VAT not used)
        summary_data.append(['Grand Total:', f'{grand_total_calc:,.2f} AED'])

        summary_table = Table(summary_data, colWidths=[5*inch, 1.5*inch])

        # Build style list - calculate row index for Grand Total
        grand_total_row_idx = len(summary_data) - 1

        table_styles = [
            ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('FONTSIZE', (0,grand_total_row_idx), (-1,grand_total_row_idx), 10),
            ('FONTNAME', (0,grand_total_row_idx), (-1,grand_total_row_idx), 'Helvetica-Bold'),
            ('TOPPADDING', (0,0), (-1,-1), 3),
            ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ('LINEABOVE', (0,grand_total_row_idx), (-1,grand_total_row_idx), 1, colors.black),
        ]

        # Add red color for discount row only if discount exists
        if discount_amount > 0:
            table_styles.append(('TEXTCOLOR', (0,1), (-1,1), colors.HexColor('#dc2626')))

        summary_table.setStyle(TableStyle(table_styles))
        elements.append(summary_table)

        return elements

    def _internal_summary(self, items, total_material_cost, total_labour_cost):
        """Internal cost analysis"""
        elements = []
        elements.append(Spacer(1, 10))

        # Calculate from sub-items with correct percentages
        client_amount = 0
        total_misc = 0
        total_overhead = 0
        total_transport = 0

        for item in items:
            if item.get('has_sub_items') and item.get('sub_items'):
                for sub_item in item.get('sub_items', []):
                    qty = sub_item.get('quantity', 0)
                    rate = sub_item.get('rate', 0)
                    sub_client = qty * rate
                    client_amount += sub_client

                    # Calculate base cost from materials and labour
                    materials_cost = sum([m.get('total_price', 0) for m in sub_item.get('materials', [])])
                    labour_cost = sum([l.get('total_cost', 0) for l in sub_item.get('labour', [])])
                    base_cost = materials_cost + labour_cost

                    # Get percentages from SUB-ITEM first, fallback to ITEM
                    misc_pct = sub_item.get('misc_percentage', item.get('miscellaneous_percentage', item.get('overhead_percentage', 10)))
                    overhead_pct = sub_item.get('overhead_profit_percentage', item.get('overhead_profit_percentage', item.get('profit_margin_percentage', 25)))
                    transport_pct = sub_item.get('transport_percentage', item.get('transport_percentage', 5))

                    # Calculate based on CLIENT AMOUNT (as per BOQDetailsModal!)
                    total_misc += sub_client * (misc_pct / 100)
                    total_overhead += sub_client * (overhead_pct / 100)
                    total_transport += sub_client * (transport_pct / 100)

        # Internal cost = Materials + Labour + Misc + O&P + Transport (as per BOQDetailsModal line 757)
        internal_cost = total_material_cost + total_labour_cost + total_misc + total_overhead + total_transport

        # Actual profit = client - internal (as per BOQDetailsModal line 758)
        actual_profit = client_amount - internal_cost

        summary_data = [
            ['Client Amount:', f'{client_amount:,.2f} AED'],
            ['Internal Costs:', ''],
            ['  - Materials:', f'{total_material_cost:,.2f} AED'],
            ['  - Labour:', f'{total_labour_cost:,.2f} AED'],
            ['  - Misc:', f'{total_misc:,.2f} AED'],
            ['  - O&P:', f'{total_overhead:,.2f} AED'],
        ]

        # Add transport row if exists
        if total_transport > 0:
            summary_data.append(['  - Transport:', f'{total_transport:,.2f} AED'])

        summary_data.extend([
            [Paragraph('<b>Total Internal Cost:</b>', ParagraphStyle('Bold', parent=self.styles['Normal'], fontSize=8, fontName='Helvetica-Bold')),
             Paragraph(f'<b>{internal_cost:,.2f} AED</b>', ParagraphStyle('Bold', parent=self.styles['Normal'], fontSize=8, fontName='Helvetica-Bold'))],
            ['', ''],
            [Paragraph('<b>Profit Analysis:</b>', ParagraphStyle('Bold', parent=self.styles['Normal'], fontSize=8, fontName='Helvetica-Bold')), ''],
            ['Planned Profit:', f'{total_overhead:,.2f} AED'],
            ['Actual Profit:', f'{actual_profit:,.2f} AED'],
        ])

        summary_table = Table(summary_data, colWidths=[5*inch, 1.5*inch])
        profit_color = colors.HexColor('#00AA00') if actual_profit >= total_overhead else colors.HexColor('#CC0000')

        # Find actual profit row index (last row)
        actual_profit_row = len(summary_data) - 1

        summary_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('TOPPADDING', (0,0), (-1,-1), 2),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('TEXTCOLOR', (1,actual_profit_row), (1,actual_profit_row), profit_color),
        ]))
        elements.append(summary_table)

        return elements

    def _client_terms(self):
        """Simple terms section"""
        elements = []
        elements.append(Spacer(1, 10))

        terms_style = ParagraphStyle('Terms', parent=self.styles['Normal'],
                                     fontSize=7, textColor=colors.HexColor('#666666'))

        elements.append(Paragraph('<b>TERMS & CONDITIONS:</b>', terms_style))
        elements.append(Paragraph('• This quotation is valid for 30 days from the date of issue.', terms_style))
        elements.append(Paragraph('• Payment terms: 50% advance, 40% on delivery, 10% after installation.', terms_style))
        elements.append(Paragraph('• All prices are in AED and exclude VAT unless stated otherwise.', terms_style))

        elements.append(Spacer(1, 8))

        # Signatures
        sig_data = [[
            Paragraph('<b>For MeterSquare Interiors LLC</b><br/><br/><br/>_____________________<br/>Authorized Signature',
                     ParagraphStyle('S1', parent=self.styles['Normal'], fontSize=7, alignment=TA_CENTER)),
            Paragraph('<b>Client Acceptance</b><br/><br/><br/>_____________________<br/>Client Signature',
                     ParagraphStyle('S2', parent=self.styles['Normal'], fontSize=7, alignment=TA_CENTER))
        ]]

        sig_table = Table(sig_data, colWidths=[3.25*inch, 3.25*inch])
        sig_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        elements.append(sig_table)

        elements.append(Spacer(1, 5))

        # Footer
        elements.append(Paragraph(
            'MeterSquare Interiors LLC | P.O. Box 12345, Dubai, UAE | Tel: +971 4 123 4567 | info@metersquare.com',
            ParagraphStyle('Footer', parent=self.styles['Normal'], fontSize=6,
                         textColor=colors.HexColor('#999999'), alignment=TA_CENTER)
        ))

        return elements
