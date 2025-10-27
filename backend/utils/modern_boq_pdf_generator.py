"""
Modern BOQ PDF Generator - Unified Template
Generates professional, accurate PDFs for both Internal and Client views
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
    """
    Modern BOQ PDF Generator with accurate calculations and clean design
    """

    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()

    def _setup_custom_styles(self):
        """Setup custom paragraph styles"""
        # Title style
        self.styles.add(ParagraphStyle(
            name='CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1F4788'),
            spaceAfter=10,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))

        # Section header
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=14,
            textColor=colors.white,
            spaceAfter=12,
            spaceBefore=20,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))

        # Item header
        self.styles.add(ParagraphStyle(
            name='ItemHeader',
            parent=self.styles['Heading3'],
            fontSize=11,
            textColor=colors.HexColor('#1F4788'),
            spaceAfter=6,
            spaceBefore=12,
            fontName='Helvetica-Bold'
        ))

    def generate_client_pdf(self, project, items, total_material_cost, total_labour_cost, grand_total, boq_json=None):
        """
        Generate CLIENT PDF - Clean view without internal breakdown
        Shows only items, sub-items, and final prices
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

        # Header with logo
        elements.extend(self._add_header(project, "CLIENT QUOTATION"))

        # BOQ Items - Client view
        elements.extend(self._add_client_items(items, boq_json))

        # Summary
        elements.extend(self._add_client_summary(items))

        # Preliminaries
        if boq_json and boq_json.get('preliminaries'):
            elements.extend(self._add_preliminaries(boq_json['preliminaries']))

        # Signatures
        elements.append(PageBreak())
        elements.extend(self._add_signatures())

        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer.read()

    def generate_internal_pdf(self, project, items, total_material_cost, total_labour_cost, grand_total, boq_json=None):
        """
        Generate INTERNAL PDF - Detailed view with full breakdown
        Shows materials, labour, costs, profit calculations
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

        # Header
        elements.extend(self._add_header(project, "INTERNAL BOQ"))

        # BOQ Items - Internal view with full breakdown
        elements.extend(self._add_internal_items(items, boq_json))

        # Cost Analysis
        elements.extend(self._add_internal_summary(items, total_material_cost, total_labour_cost))

        # Preliminaries
        if boq_json and boq_json.get('preliminaries'):
            elements.extend(self._add_preliminaries(boq_json['preliminaries']))

        # Signatures on new page
        elements.append(PageBreak())
        elements.extend(self._add_signatures())

        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer.read()

    def _add_header(self, project, title_text):
        """Add professional header with logo and modern project info layout"""
        elements = []

        # Professional Header Section with Logo and Company Info
        header_data = []

        # Logo path
        logo_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'logo.png')

        if os.path.exists(logo_path):
            try:
                logo = Image(logo_path, width=1.2*inch, height=0.5*inch)
                company_info = Paragraph(
                    '''<b><font size="10">METERSQUARE INTERIORS LLC</font></b><br/>
                    <font size="7">P.O. Box 12345, Dubai, UAE<br/>
                    Tel: +971 4 123 4567</font>''',
                    ParagraphStyle('CompanyInfo', parent=self.styles['Normal'], fontSize=8, alignment=TA_RIGHT)
                )
                header_data = [[logo, company_info]]
            except:
                # Fallback if logo fails
                company_info = Paragraph(
                    '''<b>METERSQUARE INTERIORS LLC</b><br/>
                    <font size="8">P.O. Box 12345, Dubai, UAE | Tel: +971 4 123 4567</font>''',
                    ParagraphStyle('CompanyInfo', parent=self.styles['Normal'], fontSize=10, alignment=TA_CENTER)
                )
                header_data = [[company_info]]
        else:
            # No logo fallback
            company_info = Paragraph(
                '''<b>METERSQUARE INTERIORS LLC</b><br/>
                <font size="8">P.O. Box 12345, Dubai, UAE | Tel: +971 4 123 4567</font>''',
                ParagraphStyle('CompanyInfo', parent=self.styles['Normal'], fontSize=10, alignment=TA_CENTER)
            )
            header_data = [[company_info]]

        if len(header_data[0]) == 2:
            header_table = Table(header_data, colWidths=[1.5*inch, 5.2*inch])
        else:
            header_table = Table(header_data, colWidths=[6.7*inch])

        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LINEBELOW', (0, 0), (-1, -1), 1.5, colors.HexColor('#1F4788')),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 8))

        # Professional Title with colored background - more compact
        title_table = Table([[Paragraph(f"<b>{title_text}</b>", self.styles['CustomTitle'])]],
                           colWidths=[6.7*inch])
        title_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1F4788')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 14),
        ]))
        elements.append(title_table)

        # Subtitle - more compact
        subtitle_table = Table([[Paragraph("Bill of Quantities", ParagraphStyle(
            'Subtitle',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#64748B'),
            alignment=TA_CENTER,
            fontName='Helvetica-Oblique'
        ))]], colWidths=[6.7*inch])
        subtitle_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(subtitle_table)
        elements.append(Spacer(1, 8))

        # Project Information - Clean 2-column table - more compact
        elements.append(Paragraph("<b>PROJECT INFORMATION</b>", ParagraphStyle(
            'SectionTitle',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#1F4788'),
            fontName='Helvetica-Bold',
            spaceAfter=4,
            spaceBefore=0
        )))

        # Clean 2-column table layout
        info_data = [
            ['Project Name:', project.project_name or 'N/A'],
            ['Client Name:', project.client or 'N/A'],
            ['Location:', project.location or 'N/A'],
            ['Quotation Date:', date.today().strftime('%B %d, %Y')],
        ]

        info_table = Table(info_data, colWidths=[1.8*inch, 4.9*inch])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#1F4788')),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#475569')),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        # Project details in modern card style - Create separate paragraphs for each field
        info_style = ParagraphStyle(
            'InfoField',
            parent=self.styles['Normal'],
            leftIndent=10,
            rightIndent=10,
            spaceBefore=5,
            spaceAfter=5
        )

        info_paras = [
            Paragraph(f'<b><font color="#1F4788">Project Name:</font></b><br/><font size="11">{project.project_name or "N/A"}</font>', info_style),
            Paragraph(f'<b><font color="#1F4788">Client Name:</font></b><br/><font size="11">{project.client or "N/A"}</font>', info_style),
            Paragraph(f'<b><font color="#1F4788">Location:</font></b><br/><font size="11">{project.location or "N/A"}</font>', info_style),
            Paragraph(f'<b><font color="#1F4788">Quotation Date:</font></b><br/><font size="11">{date.today().strftime("%B %d, %Y")}</font>', info_style),
        ]

        info_card = Table([[p] for p in info_paras], colWidths=[6.7*inch])
        info_card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F9FAFB')),
            ('BOX', (0, 0), (-1, -1), 1.5, colors.HexColor('#E5E7EB')),
            ('TOPPADDING', (0, 0), (-1, -1), 15),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
            ('LEFTPADDING', (0, 0), (-1, -1), 15),
            ('RIGHTPADDING', (0, 0), (-1, -1), 15),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 8))

        return elements

    def _add_client_items(self, items, boq_json):
        """Add client BOQ items - clean professional view"""
        elements = []

        # Section header - compact
        section_header = Table([['SCOPE OF WORK']], colWidths=[6.7*inch])
        section_header.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1F4788')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(section_header)
        elements.append(Spacer(1, 6))

        for idx, item in enumerate(items, 1):
            # Item header - more compact and professional
            item_name = item.get('item_name', 'N/A')
            item_desc = item.get('description', '')

            # Combine header and description in one table
            if item_desc:
                header_text = f"<b>{idx}. {item_name}</b><br/><font size='8' color='#64748B'><i>{item_desc}</i></font>"
            else:
                header_text = f"<b>{idx}. {item_name}</b>"

            item_header = Table([[Paragraph(header_text, self.styles['Normal'])]], colWidths=[6.7*inch])
            item_header.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F1F5F9')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1F4788')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ]))
            elements.append(item_header)
            elements.append(Spacer(1, 3))

            # Check for sub-items
            has_sub_items = item.get('has_sub_items', False)
            sub_items = item.get('sub_items', [])

            if has_sub_items and sub_items:
                # Sub-items table - professional and compact
                header_style = ParagraphStyle('TableHeader', parent=self.styles['Normal'],
                                             fontSize=8, textColor=colors.white, alignment=TA_CENTER)
                table_data = [[
                    Paragraph('<b>Description</b>', header_style),
                    Paragraph('<b>Scope / Specifications</b>', header_style),
                    Paragraph('<b>Qty</b>', header_style),
                    Paragraph('<b>Unit</b>', header_style),
                    Paragraph('<b>Rate</b>', header_style),
                    Paragraph('<b>Amount</b>', header_style)
                ]]

                # Calculate distributed markup
                item_misc = item.get('miscellaneous_amount', 0)
                item_overhead = item.get('overhead_amount', 0)
                item_profit = item.get('profit_margin_amount', 0)
                item_base_cost = sum([
                    si.get('materials_cost', 0) + si.get('labour_cost', 0)
                    for si in sub_items
                ])

                for sub_item in sub_items:
                    sub_base = sub_item.get('materials_cost', 0) + sub_item.get('labour_cost', 0)

                    # Distribute markup proportionally
                    if item_base_cost > 0:
                        sub_markup = (sub_base / item_base_cost) * (item_misc + item_overhead + item_profit)
                    else:
                        sub_markup = 0

                    sub_total = sub_base + sub_markup
                    qty = sub_item.get('quantity', 0)
                    adjusted_rate = sub_total / qty if qty > 0 else 0

                    # Build scope
                    scope_parts = []
                    if sub_item.get('scope'):
                        scope_parts.append(sub_item['scope'])
                    if sub_item.get('size'):
                        scope_parts.append(sub_item['size'])
                    if sub_item.get('location'):
                        scope_parts.append(f"Loc: {sub_item['location']}")
                    if sub_item.get('brand'):
                        scope_parts.append(f"Brand: {sub_item['brand']}")
                    scope_text = ' | '.join(scope_parts) if scope_parts else '-'

                    table_data.append([
                        sub_item.get('sub_item_name', 'N/A'),
                        scope_text,
                        f"{qty:.2f}",
                        sub_item.get('unit', 'nos'),
                        f"{adjusted_rate:,.2f}",
                        f"{sub_total:,.2f}"
                    ])

                sub_table = Table(table_data, colWidths=[1.8*inch, 1.6*inch, 0.5*inch, 0.5*inch, 0.9*inch, 1.4*inch])
                sub_table.setStyle(TableStyle([
                    # Header row styling
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4788')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 8),
                    ('TOPPADDING', (0, 0), (-1, 0), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
                    # Data rows styling
                    ('ALIGN', (0, 1), (1, -1), 'LEFT'),
                    ('ALIGN', (2, 1), (3, -1), 'CENTER'),
                    ('ALIGN', (4, 1), (-1, -1), 'RIGHT'),
                    ('FONTSIZE', (0, 1), (-1, -1), 8),
                    ('TOPPADDING', (0, 1), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 1), (-1, -1), 4),
                    ('LEFTPADDING', (0, 0), (-1, -1), 5),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                    # Grid and borders
                    ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#94A3B8')),
                    ('LINEBELOW', (0, 0), (-1, 0), 1, colors.HexColor('#1F4788')),
                    ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#CBD5E1')),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
                ]))
                elements.append(sub_table)
            else:
                # Old format - single item (make it cleaner)
                qty = item.get('quantity', 0)
                unit = item.get('unit', 'nos')
                rate = item.get('rate', 0)

                simple_data = [[
                    'Quantity', 'Unit', 'Rate (AED)', 'Amount (AED)'
                ], [
                    f"{qty:.2f}", unit, f"{rate:,.2f}", f"{item.get('selling_price', 0):,.2f}"
                ]]

                simple_table = Table(simple_data, colWidths=[1.6*inch, 1.6*inch, 1.6*inch, 1.9*inch])
                simple_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4788')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 8),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTSIZE', (0, 1), (-1, 1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#94A3B8')),
                    ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#CBD5E1')),
                ]))
                elements.append(simple_table)

            elements.append(Spacer(1, 3))

            # Item total - more compact
            item_total_data = [[f"Item {idx} Total:", f"AED {item.get('selling_price', 0):,.2f}"]]
            item_total_table = Table(item_total_data, colWidths=[5.3*inch, 1.4*inch])
            item_total_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#ECFDF5')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#059669')),
                ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#059669')),
            ]))
            elements.append(item_total_table)
            elements.append(Spacer(1, 6))

        return elements

    def _add_internal_items(self, items, boq_json):
        """Add internal BOQ items - clean table format matching screenshot"""
        elements = []

        # Build unified table data
        table_data = []

        # Header row
        header_style = ParagraphStyle('TableHeader', parent=self.styles['Normal'],
                                      fontSize=9, textColor=colors.HexColor('#2C3E50'),
                                      fontName='Helvetica-Bold', alignment=TA_CENTER)
        table_data.append([
            Paragraph('<b>S.No</b>', header_style),
            Paragraph('<b>Category / Item</b>', header_style),
            Paragraph('<b>Description</b>', header_style),
            Paragraph('<b>Qty</b>', header_style),
            Paragraph('<b>Unit</b>', header_style),
            Paragraph('<b>Unit Rate (AED)</b>', header_style),
            Paragraph('<b>Amount (AED)</b>', header_style)
        ])

        # Process each item
        for idx, item in enumerate(items, 1):
            has_sub_items = item.get('has_sub_items', False)
            sub_items = item.get('sub_items', [])

            if has_sub_items and sub_items:
                # Process sub-items
                for sub_idx, sub_item in enumerate(sub_items, 1):
                    # Sub-item main row
                    sub_name = sub_item.get('sub_item_name', 'N/A')
                    sub_desc_parts = []
                    if sub_item.get('scope'):
                        sub_desc_parts.append(sub_item['scope'])
                    if sub_item.get('size'):
                        sub_desc_parts.append(f"Size: {sub_item['size']}")
                    sub_desc = '<br/>'.join(sub_desc_parts) if sub_desc_parts else ''

                    qty = sub_item.get('quantity', 0)
                    unit = sub_item.get('unit', 'nos')

                    # Calculate client rate (distributed with markup)
                    materials_cost = sum([m.get('total_price', 0) for m in sub_item.get('materials', [])])
                    labour_cost = sum([l.get('total_cost', 0) for l in sub_item.get('labour', [])])
                    base_cost = materials_cost + labour_cost

                    # Get markup from parent item
                    misc_pct = item.get('miscellaneous_percentage', 0)
                    overhead_pct = item.get('overhead_percentage', item.get('profit_margin_percentage', 0))

                    markup = base_cost * ((misc_pct + overhead_pct) / 100)
                    total_with_markup = base_cost + markup
                    rate = total_with_markup / qty if qty > 0 else 0

                    # Main sub-item row
                    item_style = ParagraphStyle('ItemText', parent=self.styles['Normal'],
                                               fontSize=9, textColor=colors.HexColor('#2C3E50'))
                    desc_style = ParagraphStyle('DescText', parent=self.styles['Normal'],
                                               fontSize=8, textColor=colors.HexColor('#546E7A'))

                    table_data.append([
                        str(idx) if sub_idx == 1 else '',
                        Paragraph(f"<b>{item.get('item_name', 'N/A')}</b><br/><font size='8' color='#78909C'>{sub_name}</font>", item_style),
                        Paragraph(sub_desc, desc_style) if sub_desc else '',
                        f"{qty:.0f}",
                        unit,
                        f"{rate:,.2f} AED",
                        f"{total_with_markup:,.2f} AED"
                    ])

                    # Materials row
                    materials_style = ParagraphStyle('MaterialsText', parent=self.styles['Normal'],
                                                    fontSize=8, textColor=colors.HexColor('#D32F2F'),
                                                    fontName='Helvetica-Bold')
                    table_data.append([
                        '',
                        Paragraph('<font color="#D32F2F">Materials</font>', materials_style),
                        '',
                        '',
                        '',
                        f"{materials_cost:,.2f} AED",
                        f"{materials_cost:,.2f} AED"
                    ])

                    # Labour row
                    labour_style = ParagraphStyle('LabourText', parent=self.styles['Normal'],
                                                  fontSize=8, textColor=colors.HexColor('#D32F2F'),
                                                  fontName='Helvetica-Bold')
                    table_data.append([
                        '',
                        Paragraph('<font color="#D32F2F">Labour</font>', labour_style),
                        '',
                        '',
                        '',
                        f"{labour_cost:,.2f} AED",
                        f"{labour_cost:,.2f} AED"
                    ])

                    # Planned Profit row
                    profit_style = ParagraphStyle('ProfitText', parent=self.styles['Normal'],
                                                  fontSize=8, textColor=colors.HexColor('#4CAF50'),
                                                  fontName='Helvetica-Bold')
                    table_data.append([
                        '',
                        Paragraph('Planned Profit', profit_style),
                        '',
                        '',
                        '',
                        '',
                        Paragraph(f'<font color="#4CAF50">{markup:,.2f} AED</font>', profit_style)
                    ])
            else:
                # Single item without sub-items
                item_name = item.get('item_name', 'N/A')
                item_desc = item.get('description', '')
                qty = item.get('quantity', 0)
                unit = item.get('unit', 'nos')
                rate = item.get('rate', 0)
                selling_price = item.get('selling_price', 0)

                item_style = ParagraphStyle('ItemText', parent=self.styles['Normal'],
                                           fontSize=9, textColor=colors.HexColor('#2C3E50'))
                desc_style = ParagraphStyle('DescText', parent=self.styles['Normal'],
                                           fontSize=8, textColor=colors.HexColor('#546E7A'))

                table_data.append([
                    str(idx),
                    Paragraph(f"<b>{item_name}</b>", item_style),
                    Paragraph(item_desc, desc_style),
                    f"{qty:.0f}",
                    unit,
                    f"{rate:,.2f} AED",
                    f"{selling_price:,.2f} AED"
                ])

        # Create the main table
        main_table = Table(table_data, colWidths=[0.4*inch, 1.8*inch, 1.8*inch, 0.5*inch, 0.5*inch, 0.9*inch, 0.8*inch])

        # Apply styling
        style_commands = [
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F5F5F5')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#2C3E50')),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor('#BDBDBD')),

            # All cells alignment
            ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # S.No center
            ('ALIGN', (1, 1), (2, -1), 'LEFT'),     # Category and Description left
            ('ALIGN', (3, 1), (4, -1), 'CENTER'),   # Qty and Unit center
            ('ALIGN', (5, 1), (-1, -1), 'RIGHT'),   # Rates and Amounts right
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),

            # Borders
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#E0E0E0')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#EEEEEE')),

            # Padding
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),

            # Row backgrounds
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#FAFAFA')]),
        ]

        main_table.setStyle(TableStyle(style_commands))
        elements.append(main_table)

        return elements

    def _add_sub_item_breakdown(self, sub_item, item_idx, sub_idx, parent_item):
        """Add detailed sub-item breakdown for internal view"""
        elements = []

        # Sub-item header with soft corporate styling
        sub_header = Paragraph(
            f"<b>{item_idx}.{sub_idx}. {sub_item.get('sub_item_name', 'N/A')}</b>",
            ParagraphStyle('SubItemHeader', parent=self.styles['Normal'], fontSize=10, leftIndent=10,
                          textColor=colors.HexColor('#455A64'), fontName='Helvetica-Bold')
        )
        elements.append(sub_header)

        # Scope details with professional styling
        scope_parts = []
        if sub_item.get('scope'):
            scope_parts.append(f"Scope: {sub_item['scope']}")
        if sub_item.get('size'):
            scope_parts.append(f"Size: {sub_item['size']}")
        if scope_parts:
            scope_text = Paragraph(' | '.join(scope_parts), ParagraphStyle(
                'Scope', parent=self.styles['Normal'], fontSize=8, leftIndent=15,
                textColor=colors.HexColor('#78909C'), fontName='Helvetica-Oblique'
            ))
            elements.append(scope_text)

        elements.append(Spacer(1, 5))

        # Materials table
        materials = sub_item.get('materials', [])
        if materials:
            mat_data = [[
                Paragraph('<b>Material</b>', self.styles['Normal']),
                Paragraph('<b>Qty</b>', self.styles['Normal']),
                Paragraph('<b>Unit</b>', self.styles['Normal']),
                Paragraph('<b>Rate</b>', self.styles['Normal']),
                Paragraph('<b>Amount</b>', self.styles['Normal'])
            ]]

            mat_total = 0
            for mat in materials:
                amount = mat.get('total_price', 0)
                mat_total += amount
                mat_data.append([
                    mat.get('material_name', 'N/A'),
                    f"{mat.get('quantity', 0):.2f}",
                    mat.get('unit', 'nos'),
                    f"{mat.get('unit_price', 0):,.2f}",
                    f"{amount:,.2f}"
                ])

            mat_data.append([
                {'content': 'Total Materials:', 'colSpan': 4, 'align': 'RIGHT', 'fontStyle': 'bold'},
                '', '', '',
                {'content': f"{mat_total:,.2f}", 'fontStyle': 'bold'}
            ])

            mat_table = Table(mat_data, colWidths=[2.5*inch, 0.8*inch, 0.7*inch, 1*inch, 1*inch])
            mat_table.setStyle(TableStyle([
                # Header with soft blue-gray gradient effect
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E8EAF6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#37474F')),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('TOPPADDING', (0, 0), (-1, 0), 6),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
                # Data rows with soft alternating background
                ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#FAFAFA')]),
                # Subtle borders
                ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#E0E0E0')),
                ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor('#B0BEC5')),
                ('INNERGRID', (0, 1), (-1, -1), 0.25, colors.HexColor('#EEEEEE')),
                ('TOPPADDING', (0, 1), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                # Total row subtle highlight
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#F5F5F5')),
                ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#BDBDBD')),
            ]))
            elements.append(mat_table)
            elements.append(Spacer(1, 5))

        # Labour table
        labour = sub_item.get('labour', [])
        if labour:
            lab_data = [[
                Paragraph('<b>Labour Role</b>', self.styles['Normal']),
                Paragraph('<b>Hours</b>', self.styles['Normal']),
                Paragraph('<b>Rate/Hr</b>', self.styles['Normal']),
                Paragraph('<b>Amount</b>', self.styles['Normal'])
            ]]

            lab_total = 0
            for lab in labour:
                amount = lab.get('total_cost', 0)
                lab_total += amount
                lab_data.append([
                    lab.get('labour_role', 'N/A'),
                    f"{lab.get('hours', 0):.2f}",
                    f"{lab.get('rate_per_hour', 0):,.2f}",
                    f"{amount:,.2f}"
                ])

            lab_data.append([
                {'content': 'Total Labour:', 'colSpan': 3, 'align': 'RIGHT', 'fontStyle': 'bold'},
                '', '',
                {'content': f"{lab_total:,.2f}", 'fontStyle': 'bold'}
            ])

            lab_table = Table(lab_data, colWidths=[2.5*inch, 1*inch, 1.2*inch, 1.3*inch])
            lab_table.setStyle(TableStyle([
                # Header with soft warm gray
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FFF3E0')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#37474F')),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('TOPPADDING', (0, 0), (-1, 0), 6),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
                # Data rows with soft alternating background
                ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#FAFAFA')]),
                # Subtle borders
                ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#E0E0E0')),
                ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor('#BCAAA4')),
                ('INNERGRID', (0, 1), (-1, -1), 0.25, colors.HexColor('#EEEEEE')),
                ('TOPPADDING', (0, 1), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                # Total row subtle highlight
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#F5F5F5')),
                ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#BDBDBD')),
            ]))
            elements.append(lab_table)
            elements.append(Spacer(1, 5))

        # Cost breakdown
        materials_cost = sum([m.get('total_price', 0) for m in materials])
        labour_cost = sum([l.get('total_cost', 0) for l in labour])
        base_cost = materials_cost + labour_cost

        # Get percentages from parent item
        misc_pct = parent_item.get('miscellaneous_percentage', 0)
        overhead_pct = parent_item.get('overhead_percentage', parent_item.get('profit_margin_percentage', 0))
        transport_pct = parent_item.get('transport_percentage', 0)

        misc_amt = base_cost * (misc_pct / 100)
        overhead_amt = base_cost * (overhead_pct / 100)
        transport_amt = base_cost * (transport_pct / 100)

        internal_cost = base_cost + misc_amt + overhead_amt + transport_amt
        client_rate = sub_item.get('rate', 0)
        client_total = sub_item.get('quantity', 0) * client_rate
        planned_profit = overhead_amt
        actual_profit = client_total - internal_cost

        # Cost breakdown table
        breakdown_data = [
            ['Base Cost (Materials + Labour):', f"{base_cost:,.2f}"],
            [f'Miscellaneous ({misc_pct}%):', f"{misc_amt:,.2f}"],
            [f'Overhead & Profit ({overhead_pct}%):', f"{overhead_amt:,.2f}"],
            [f'Transport ({transport_pct}%):', f"{transport_amt:,.2f}"],
            ['Internal Cost:', f"{internal_cost:,.2f}"],
            ['', ''],
            ['Client Rate:', f"{client_total:,.2f}"],
            ['Planned Profit:', f"{planned_profit:,.2f}"],
            [{'content': 'Actual Profit:', 'textColor': colors.HexColor('#10B981'), 'fontStyle': 'bold'},
             {'content': f"{actual_profit:,.2f}", 'textColor': colors.HexColor('#10B981'), 'fontStyle': 'bold'}]
        ]

        breakdown_table = Table(breakdown_data, colWidths=[4.7*inch, 2*inch])
        breakdown_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LINEABOVE', (0, 4), (-1, 4), 1, colors.HexColor('#D1D5DB')),
            ('LINEABOVE', (0, 6), (-1, 6), 1, colors.HexColor('#D1D5DB')),
            ('LINEABOVE', (0, 8), (-1, 8), 2, colors.HexColor('#10B981')),
        ]))
        elements.append(breakdown_table)
        elements.append(Spacer(1, 10))

        return elements

    def _add_item_breakdown(self, item, item_idx):
        """Add breakdown for items without sub-items"""
        elements = []

        # Similar to sub-item but for main item
        materials = item.get('materials', [])
        labour = item.get('labour', [])

        # Add materials and labour tables (similar to sub-item)
        # Add cost breakdown

        return elements

    def _add_client_summary(self, items):
        """Add client summary section - professional and compact"""
        elements = []

        elements.append(Spacer(1, 6))

        summary_header = Table([['COST SUMMARY']], colWidths=[6.7*inch])
        summary_header.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1F4788')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(summary_header)
        elements.append(Spacer(1, 4))

        # Calculate totals
        subtotal = sum([item.get('selling_price', 0) for item in items])
        total_discount = sum([item.get('discount_amount', 0) for item in items])
        subtotal_after_discount = subtotal - total_discount
        total_vat = sum([item.get('vat_amount', 0) for item in items])
        grand_total = subtotal_after_discount + total_vat

        summary_data = [['Subtotal:', f'AED {subtotal:,.2f}']]

        if total_discount > 0:
            discount_pct = (total_discount / subtotal * 100) if subtotal > 0 else 0
            summary_data.append([f'Discount ({discount_pct:.1f}%):', f'-AED {total_discount:,.2f}'])
            summary_data.append(['After Discount:', f'AED {subtotal_after_discount:,.2f}'])

        if total_vat > 0:
            vat_pct = (total_vat / subtotal_after_discount * 100) if subtotal_after_discount > 0 else 0
            summary_data.append([f'VAT ({vat_pct:.1f}%):', f'AED {total_vat:,.2f}'])

        summary_data.append(['TOTAL PROJECT VALUE:', f'AED {grand_total:,.2f}'])

        summary_table = Table(summary_data, colWidths=[5.2*inch, 1.5*inch])
        summary_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -2), 9),
            ('TOPPADDING', (0, 0), (-1, -2), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -2), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (1, 0), (1, -1), 8),
            # Grand total row - green background
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#059669')),
            ('TEXTCOLOR', (0, -1), (-1, -1), colors.white),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 11),
            ('TOPPADDING', (0, -1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
            # Borders
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#94A3B8')),
            ('LINEABOVE', (0, -1), (-1, -1), 2, colors.HexColor('#059669')),
            ('INNERGRID', (0, 0), (-1, -2), 0.25, colors.HexColor('#CBD5E1')),
        ]))
        elements.append(summary_table)

        return elements

    def _add_internal_summary(self, items, total_material_cost, total_labour_cost):
        """Add internal cost analysis - MATCHING FRONTEND EXACTLY"""
        elements = []

        elements.append(Spacer(1, 12))

        # Calculate totals exactly like frontend
        client_amount = sum([item.get('selling_price', 0) for item in items])
        internal_cost_total = total_material_cost + total_labour_cost

        # Calculate all markup amounts
        total_misc = 0
        total_overhead = 0
        total_profit = 0

        for item in items:
            total_misc += item.get('miscellaneous_amount', 0)
            total_overhead += item.get('overhead_amount', 0)
            total_profit += item.get('profit_margin_amount', 0)

        # Planned profit (O&P)
        planned_profit = total_overhead + total_profit

        # Actual profit calculation
        actual_profit = client_amount - internal_cost_total

        # Variance
        variance = actual_profit - planned_profit

        # Project margin (excluding planned profit)
        project_margin = client_amount - internal_cost_total - planned_profit
        margin_percentage = (project_margin / client_amount * 100) if client_amount > 0 else 0

        # Overall Cost Summary Header
        summary_header = Table([['OVERALL COST SUMMARY']], colWidths=[6.7*inch])
        summary_header.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#E8EAF6')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1F4788')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 13),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]))
        elements.append(summary_header)
        elements.append(Spacer(1, 15))

        # BOQ Financials Box (matching frontend)
        financials_data = [
            [Paragraph('<b>💰 BOQ Financials</b>', self.styles['Normal']), '']
        ]

        financials_table = Table([['']], colWidths=[6.7*inch])
        financials_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FFF9C4')),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        elements.append(financials_table)

        # Client Amount
        client_data = [['Client Amount:', f'AED {client_amount:,.2f}']]
        client_table = Table(client_data, colWidths=[4.7*inch, 2*inch])
        client_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1976D2')),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ]))
        elements.append(client_table)

        # Internal Cost Breakdown
        internal_data = [
            ['Internal Cost:', ''],
            ['  Materials:', f'AED {total_material_cost:,.2f}'],
            ['  Labour:', f'AED {total_labour_cost:,.2f}'],
        ]
        internal_table = Table(internal_data, colWidths=[4.7*inch, 2*inch])
        internal_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (0, 0), 11),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TEXTCOLOR', (0, 0), (0, 0), colors.black),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#EF6C00')),
            ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
        ]))
        elements.append(internal_table)

        elements.append(Spacer(1, 10))

        # Project Margin
        margin_color = colors.HexColor('#EF5350') if project_margin < 0 else colors.HexColor('#10B981')
        margin_data = [[
            'Project Margin:',
            f'AED {project_margin:,.2f}\n({margin_percentage:.1f}% margin)'
        ]]
        margin_table = Table(margin_data, colWidths=[4.7*inch, 2*inch])
        margin_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TEXTCOLOR', (1, 0), (1, -1), margin_color),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('LINEABOVE', (0, 0), (-1, -1), 1, colors.HexColor('#D1D5DB')),
        ]))
        elements.append(margin_table)

        elements.append(Spacer(1, 15))

        # Profit Analysis Box (matching frontend green box)
        profit_header = Table([[' 📊 Profit Analysis']], colWidths=[6.7*inch])
        profit_header.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#C8E6C9')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ]))
        elements.append(profit_header)

        profit_data = [
            ['Planned Profit (O&P):', f'AED {planned_profit:,.2f}'],
            ['Actual Profit:', f'AED {actual_profit:,.2f}'],
            ['', ''],
            ['Variance:', f'AED {variance:,.2f}']
        ]

        profit_table = Table(profit_data, colWidths=[4.7*inch, 2*inch])
        variance_color = colors.HexColor('#EF5350') if variance < 0 else colors.HexColor('#10B981')
        profit_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TEXTCOLOR', (1, 0), (1, 0), colors.HexColor('#1976D2')),
            ('TEXTCOLOR', (1, 1), (1, 1), colors.HexColor('#EF6C00')),
            ('TEXTCOLOR', (1, -1), (1, -1), variance_color),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#D1D5DB')),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F1F8E9')),
        ]))
        elements.append(profit_table)

        elements.append(Spacer(1, 15))

        # Grand Total (matching frontend green box)
        grand_total_data = [
            ['Subtotal:', f'AED {client_amount:,.2f}'],
            ['Grand Total: (Excluding VAT)', f'AED {client_amount:,.2f}']
        ]

        grand_table = Table(grand_total_data, colWidths=[4.7*inch, 2*inch])
        grand_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTSIZE', (0, 1), (-1, 1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (1, 1), (1, 1), colors.HexColor('#10B981')),
            ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#D1FAE5')),
            ('LINEABOVE', (0, 1), (-1, 1), 2, colors.HexColor('#10B981')),
        ]))
        elements.append(grand_table)

        return elements

    def _add_preliminaries(self, preliminaries):
        """Add preliminaries section"""
        elements = []

        elements.append(Spacer(1, 8))

        prelim_header = Paragraph(
            "<b>PRELIMINARIES & APPROVAL WORKS</b>",
            ParagraphStyle('PrelimHeader', parent=self.styles['Heading3'], fontSize=11,
                          textColor=colors.HexColor('#1F4788'), fontName='Helvetica-Bold')
        )
        elements.append(prelim_header)

        prelim_sub = Paragraph(
            "Selected conditions and terms",
            ParagraphStyle('PrelimSub', parent=self.styles['Normal'], fontSize=8,
                          textColor=colors.HexColor('#64748B'), fontName='Helvetica-Oblique', spaceAfter=4)
        )
        elements.append(prelim_sub)

        prelim_items = preliminaries.get('items', [])
        for item in prelim_items:
            desc = item.get('description', item) if isinstance(item, dict) else str(item)
            item_para = Paragraph(
                f"✓ {desc}",
                ParagraphStyle('PrelimItem', parent=self.styles['Normal'], fontSize=8,
                              leftIndent=12, spaceAfter=3)
            )
            elements.append(item_para)

        if preliminaries.get('notes'):
            elements.append(Spacer(1, 4))
            elements.append(Paragraph("<b>Additional Notes:</b>",
                ParagraphStyle('NotesHeader', parent=self.styles['Normal'], fontSize=9, fontName='Helvetica-Bold')))
            notes_para = Paragraph(
                preliminaries['notes'],
                ParagraphStyle('Notes', parent=self.styles['Normal'], fontSize=8,
                              fontName='Helvetica-Oblique', leftIndent=8, spaceAfter=2)
            )
            elements.append(notes_para)

        return elements

    def _add_signatures(self):
        """Add professional signature section"""
        elements = []

        from reportlab.platypus import HRFlowable

        elements.append(Spacer(1, 10))

        # Signature Section Header
        sig_header = Table([['AUTHORIZATION & ACCEPTANCE']], colWidths=[6.7*inch])
        sig_header.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#E8EAF6')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1F4788')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(sig_header)
        elements.append(Spacer(1, 8))

        # Two-column signature layout
        sig_data = [
            [
                # Company Signature (Left)
                Paragraph('''
                    <b>FOR METERSQUARE INTERIORS LLC</b><br/><br/><br/><br/><br/>
                    _________________________________<br/>
                    <b>Authorized Signatory</b><br/>
                    Name: _____________________________<br/>
                    Title: _____________________________<br/>
                    Date: _____________________________
                ''', ParagraphStyle('SigPara', parent=self.styles['Normal'], fontSize=9, alignment=TA_CENTER)),

                # Client Signature (Right)
                Paragraph('''
                    <b>CLIENT ACCEPTANCE</b><br/><br/><br/><br/><br/>
                    _________________________________<br/>
                    <b>Client Signature</b><br/>
                    Name: _____________________________<br/>
                    Company: __________________________<br/>
                    Date: _____________________________
                ''', ParagraphStyle('SigPara', parent=self.styles['Normal'], fontSize=9, alignment=TA_CENTER))
            ]
        ]

        sig_table = Table(sig_data, colWidths=[3.35*inch, 3.35*inch])
        sig_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOX', (0, 0), (0, 0), 1, colors.HexColor('#E5E7EB')),
            ('BOX', (1, 0), (1, 0), 1, colors.HexColor('#E5E7EB')),
            ('TOPPADDING', (0, 0), (-1, -1), 20),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 20),
            ('LEFTPADDING', (0, 0), (-1, -1), 15),
            ('RIGHTPADDING', (0, 0), (-1, -1), 15),
        ]))
        elements.append(sig_table)

        elements.append(Spacer(1, 15))

        # Terms and Conditions
        elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#D1D5DB')))
        elements.append(Spacer(1, 15))

        terms_style = ParagraphStyle(
            'Terms',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#4B5563'),
            alignment=TA_JUSTIFY
        )

        elements.append(Paragraph("<b>TERMS & CONDITIONS:</b>", terms_style))
        elements.append(Spacer(1, 5))
        elements.append(Paragraph(
            "1. This quotation is valid for 30 days from the date of issue. "
            "2. Payment terms: 50% advance, 40% on delivery, 10% after installation. "
            "3. All prices are in AED and exclude VAT unless stated otherwise. "
            "4. Any changes to the scope of work will be charged additionally. "
            "5. Delivery timeline: As per agreed schedule.",
            terms_style
        ))

        elements.append(Spacer(1, 15))

        # Footer
        footer_style = ParagraphStyle(
            'Footer',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER
        )
        elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
        elements.append(Spacer(1, 10))
        elements.append(Paragraph(
            "<b>MeterSquare Interiors LLC</b> | P.O. Box 12345, Dubai, UAE | "
            "Tel: +971 4 123 4567 | Email: info@metersquare.com",
            footer_style
        ))
        elements.append(Paragraph("© 2025 MeterSquare Interiors LLC. All rights reserved.", footer_style))

        return elements
