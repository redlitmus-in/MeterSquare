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
        elements.extend(self._client_header(project))

        # Main items table
        elements.extend(self._client_items_table(items, boq_json))

        # Summary
        elements.extend(self._client_summary(items, grand_total))

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

    def _client_header(self, project):
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

        # Project info - compact grid
        today = date.today().strftime('%d %B %Y')
        info_data = [
            ['Quotation No:', 'MSQ-BOQ-2025-0101', 'Date:', today],
            ['Client:', getattr(project, 'client', 'N/A'), 'Project:', getattr(project, 'project_name', 'N/A')],
            ['Location:', getattr(project, 'location', 'Dubai, UAE'), 'Duration:', '45 days']
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

        # Preliminaries note if exists
        if boq_json and boq_json.get('preliminaries'):
            prelim_items = boq_json['preliminaries'].get('items', [])
            if prelim_items:
                prelim_text = '<b>Note:</b> <i>All authority charges & deposits excluded (approx. AED 10,000).</i>'
                elements.append(Paragraph(prelim_text,
                    ParagraphStyle('Note', parent=self.styles['Normal'], fontSize=7,
                                 textColor=colors.HexColor('#666666'))))
                elements.append(Spacer(1, 5))

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

        table_data = []

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
                    # Sub-item header
                    table_data.append([
                        f'{idx}.{sub_idx}',
                        Paragraph(f'<b>{sub_item.get("sub_item_name", "N/A")}</b>',
                                 ParagraphStyle('Sub', parent=self.styles['Normal'], fontSize=7)),
                        '', '', '', ''
                    ])

                    # Materials
                    for mat in sub_item.get('materials', []):
                        table_data.append([
                            '',
                            Paragraph(f'• {mat.get("material_name", "N/A")}',
                                     ParagraphStyle('Mat', parent=self.styles['Normal'], fontSize=7)),
                            f'{mat.get("quantity", 0):.0f}',
                            mat.get('unit', 'nos'),
                            f'{mat.get("unit_price", 0):.2f}',
                            f'{mat.get("total_price", 0):.2f}'
                        ])

                    # Labour
                    for lab in sub_item.get('labour', []):
                        table_data.append([
                            '',
                            Paragraph(f'• {lab.get("labour_role", "N/A")} (Labour)',
                                     ParagraphStyle('Lab', parent=self.styles['Normal'], fontSize=7)),
                            f'{lab.get("hours", 0):.0f}',
                            'Hrs',
                            f'{lab.get("rate_per_hour", 0):.2f}',
                            f'{lab.get("total_cost", 0):.2f}'
                        ])

                    # Calculations
                    qty = sub_item.get('quantity', 0)
                    rate = sub_item.get('rate', 0)
                    client_amount = qty * rate

                    materials_cost = sum([m.get('total_price', 0) for m in sub_item.get('materials', [])])
                    labour_cost = sum([l.get('total_cost', 0) for l in sub_item.get('labour', [])])

                    misc_pct = sub_item.get('misc_percentage', 10)
                    overhead_pct = sub_item.get('overhead_profit_percentage', 25)

                    misc_amt = client_amount * (misc_pct / 100)
                    overhead_amt = client_amount * (overhead_pct / 100)

                    # Show totals
                    table_data.append([
                        '',
                        Paragraph(f'<i>Misc ({misc_pct}%) + O&P ({overhead_pct}%)</i>',
                                 ParagraphStyle('Calc', parent=self.styles['Normal'], fontSize=7, textColor=colors.HexColor('#666666'))),
                        '', '',
                        '',
                        f'{misc_amt + overhead_amt:,.2f}'
                    ])

        # Create table
        main_table = Table(table_data, colWidths=[0.4*inch, 3*inch, 0.5*inch, 0.5*inch, 0.9*inch, 1.2*inch])
        main_table.setStyle(TableStyle([
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
        ]))

        elements.append(main_table)
        return elements

    def _client_summary(self, items, grand_total):
        """Clean client summary"""
        elements = []
        elements.append(Spacer(1, 10))

        # Calculate totals
        subtotal = sum([item.get('selling_price', 0) for item in items])

        summary_data = [
            ['Subtotal:', f'{subtotal:,.2f} AED'],
            ['VAT (0%):', '0.00 AED'],
            ['<b>Grand Total:</b>', f'<b>{subtotal:,.2f} AED</b>']
        ]

        summary_table = Table(summary_data, colWidths=[5*inch, 1.5*inch])
        summary_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
            ('FONTSIZE', (0,0), (-1,-2), 9),
            ('FONTSIZE', (0,-1), (-1,-1), 10),
            ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
            ('TOPPADDING', (0,0), (-1,-1), 3),
            ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ('LINEABOVE', (0,-1), (-1,-1), 1, colors.black),
        ]))
        elements.append(summary_table)

        return elements

    def _internal_summary(self, items, total_material_cost, total_labour_cost):
        """Internal cost analysis"""
        elements = []
        elements.append(Spacer(1, 10))

        # Calculate from sub-items
        all_sub_items = []
        for item in items:
            if item.get('has_sub_items') and item.get('sub_items'):
                all_sub_items.extend(item.get('sub_items', []))

        client_amount = 0
        total_misc = 0
        total_overhead = 0

        for sub_item in all_sub_items:
            qty = sub_item.get('quantity', 0)
            rate = sub_item.get('rate', 0)
            sub_client = qty * rate
            client_amount += sub_client

            misc_pct = sub_item.get('misc_percentage', 10)
            overhead_pct = sub_item.get('overhead_profit_percentage', 25)

            total_misc += sub_client * (misc_pct / 100)
            total_overhead += sub_client * (overhead_pct / 100)

        internal_cost = total_material_cost + total_labour_cost + total_misc + total_overhead
        actual_profit = client_amount - internal_cost

        summary_data = [
            ['Client Amount:', f'{client_amount:,.2f} AED'],
            ['Internal Costs:', ''],
            ['  - Materials:', f'{total_material_cost:,.2f} AED'],
            ['  - Labour:', f'{total_labour_cost:,.2f} AED'],
            ['  - Misc:', f'{total_misc:,.2f} AED'],
            ['  - O&P:', f'{total_overhead:,.2f} AED'],
            ['<b>Total Internal Cost:</b>', f'<b>{internal_cost:,.2f} AED</b>'],
            ['', ''],
            ['<b>Profit Analysis:</b>', ''],
            ['Planned Profit:', f'{total_overhead:,.2f} AED'],
            ['Actual Profit:', f'{actual_profit:,.2f} AED'],
        ]

        summary_table = Table(summary_data, colWidths=[5*inch, 1.5*inch])
        profit_color = colors.HexColor('#00AA00') if actual_profit >= total_overhead else colors.HexColor('#CC0000')

        summary_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('TOPPADDING', (0,0), (-1,-1), 2),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('FONTNAME', (0,6), (-1,6), 'Helvetica-Bold'),
            ('LINEABOVE', (0,6), (-1,6), 1, colors.black),
            ('TEXTCOLOR', (1,10), (1,10), profit_color),
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
