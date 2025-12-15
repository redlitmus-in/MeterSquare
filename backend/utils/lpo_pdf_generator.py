"""
LPO (Local Purchase Order) PDF Generator
Generates professional purchase order PDFs for vendors
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
from io import BytesIO
from datetime import datetime
import os
import base64


class LPOPDFGenerator:
    """Local Purchase Order PDF Generator - Professional corporate design"""

    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_styles()
        self.page_width, self.page_height = A4

    def _setup_styles(self):
        """Setup professional styles for LPO"""
        # Header style
        self.styles.add(ParagraphStyle(
            name='LPOHeader',
            parent=self.styles['Normal'],
            fontSize=14,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a'),
            alignment=TA_CENTER,
            spaceAfter=10
        ))

        # Section header
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Normal'],
            fontSize=9,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#333333'),
            spaceBefore=5,
            spaceAfter=3
        ))

        # Normal text
        self.styles.add(ParagraphStyle(
            name='LPONormal',
            parent=self.styles['Normal'],
            fontSize=8,
            fontName='Helvetica',
            textColor=colors.HexColor('#333333'),
            leading=11
        ))

        # Small text
        self.styles.add(ParagraphStyle(
            name='LPOSmall',
            parent=self.styles['Normal'],
            fontSize=7,
            fontName='Helvetica',
            textColor=colors.HexColor('#666666'),
            leading=9
        ))

        # Bold text
        self.styles.add(ParagraphStyle(
            name='LPOBold',
            parent=self.styles['Normal'],
            fontSize=8,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#333333')
        ))

    def _get_image_from_base64(self, base64_string, width=None, height=None):
        """Convert base64 string to ReportLab Image"""
        try:
            if not base64_string:
                return None

            # Remove data URL prefix if present
            if ',' in base64_string:
                base64_string = base64_string.split(',')[1]

            image_data = base64.b64decode(base64_string)
            image_buffer = BytesIO(image_data)

            if width and height:
                return Image(image_buffer, width=width, height=height)
            elif width:
                return Image(image_buffer, width=width)
            else:
                return Image(image_buffer)
        except Exception as e:
            print(f"Error loading image from base64: {e}")
            return None

    def _add_watermark(self, canvas_obj, doc):
        """Add subtle watermark and set PDF metadata"""
        # Set PDF metadata (title, author, etc.) - this is what WhatsApp reads
        if hasattr(self, '_pdf_title') and self._pdf_title:
            # Method 1: Direct canvas methods
            canvas_obj.setTitle(self._pdf_title)
            canvas_obj.setAuthor("MeterSquare Interiors LLC")
            canvas_obj.setSubject("Local Purchase Order")
            canvas_obj.setCreator("MeterSquare LPO System")

            # Method 2: Set via internal document info (more reliable)
            if hasattr(canvas_obj, '_doc') and hasattr(canvas_obj._doc, 'info'):
                canvas_obj._doc.info.title = self._pdf_title
                canvas_obj._doc.info.author = "MeterSquare Interiors LLC"
                canvas_obj._doc.info.subject = "Local Purchase Order"
                canvas_obj._doc.info.creator = "MeterSquare LPO System"

        logo_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'logo.png')
        if os.path.exists(logo_path):
            try:
                canvas_obj.saveState()
                canvas_obj.setFillAlpha(0.05)
                canvas_obj.drawImage(
                    logo_path,
                    (self.page_width - 3*inch) / 2,
                    (self.page_height - 1.2*inch) / 2,
                    width=3*inch, height=1.2*inch,
                    preserveAspectRatio=True, mask='auto'
                )
                canvas_obj.restoreState()
            except:
                pass

    def _number_to_words(self, num):
        """Convert number to words (AED format)"""
        ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
                'Seventeen', 'Eighteen', 'Nineteen']
        tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

        def convert_less_than_thousand(n):
            if n == 0:
                return ''
            elif n < 20:
                return ones[n]
            elif n < 100:
                return tens[n // 10] + ('' if n % 10 == 0 else ' ' + ones[n % 10])
            else:
                return ones[n // 100] + ' Hundred' + ('' if n % 100 == 0 else ' ' + convert_less_than_thousand(n % 100))

        if num == 0:
            return 'Zero'

        num = int(round(num))
        result = ''

        if num >= 1000000:
            result += convert_less_than_thousand(num // 1000000) + ' Million '
            num %= 1000000

        if num >= 1000:
            result += convert_less_than_thousand(num // 1000) + ' Thousand '
            num %= 1000

        result += convert_less_than_thousand(num)

        return result.strip()

    def generate_lpo_pdf(self, lpo_data):
        """
        Generate LPO PDF

        Args:
            lpo_data: dict containing:
                - vendor: dict with company_name, contact_person, phone, fax, email, trn, project, subject
                - company: dict with name, contact_person, division, phone, fax, email, trn
                - lpo_info: dict with lpo_number, lpo_date, quotation_ref
                - items: list of dicts with sl_no, description, qty, unit, rate, amount
                - totals: dict with subtotal, vat_percent, vat_amount, grand_total
                - terms: dict with payment_terms, completion_terms
                - signatures: dict with md_name, md_signature, td_name, td_signature, stamp_image
                - header_image: base64 of custom header (optional)

        Returns:
            bytes: PDF file content
        """
        buffer = BytesIO()

        # Get LPO number for PDF title
        lpo_number = lpo_data.get('lpo_info', {}).get('lpo_number', 'LPO')
        pdf_title = f"Local Purchase Order - {lpo_number}"
        # Store title for use in canvas callback (sets actual PDF metadata)
        self._pdf_title = pdf_title

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            topMargin=20,
            bottomMargin=30,
            leftMargin=25,
            rightMargin=25,
            title=pdf_title,
            author="MeterSquare Interiors LLC",
            subject="Local Purchase Order",
            creator="MeterSquare LPO System"
        )
        elements = []

        # === HEADER SECTION ===
        elements.extend(self._generate_header(lpo_data))

        # === TITLE ===
        elements.append(Spacer(1, 10))
        title = Paragraph('<u>LOCAL PURCHASE ORDER</u>', self.styles['LPOHeader'])
        elements.append(title)
        elements.append(Spacer(1, 15))

        # === TO/FROM SECTION ===
        elements.extend(self._generate_to_from_section(lpo_data))

        # === THANK YOU MESSAGE ===
        elements.append(Spacer(1, 10))
        quotation_ref = lpo_data.get('lpo_info', {}).get('quotation_ref', '')
        # Use custom message if provided, otherwise use default
        default_message = """Thank you very much for quoting us for requirements. As per your quotation and settlement done over the mail, we are issuing the LPO and please ensure the delivery on time"""
        thank_you_text = lpo_data.get('lpo_info', {}).get('custom_message', '') or default_message
        elements.append(Paragraph(thank_you_text, self.styles['LPONormal']))

        # === SCOPE OF WORK ===
        elements.append(Spacer(1, 10))
        elements.append(Paragraph('<b><u>Scope of work</u></b>', self.styles['SectionHeader']))
        if quotation_ref:
            elements.append(Paragraph(f'<b>As per your Qtn Ref# {quotation_ref}</b>', self.styles['LPONormal']))
        elements.append(Spacer(1, 8))

        # === ITEMS TABLE ===
        elements.extend(self._generate_items_table(lpo_data))

        # === AMOUNT IN WORDS ===
        elements.append(Spacer(1, 8))
        grand_total = lpo_data.get('totals', {}).get('grand_total', 0)
        amount_words = self._number_to_words(grand_total)
        # Include fils (cents) in words if present
        fils = int(round((grand_total - int(grand_total)) * 100))
        if fils > 0:
            fils_words = self._number_to_words(fils)
            amount_text = f'{self._number_to_words(int(grand_total))} and Fils {fils_words}'
        else:
            amount_text = amount_words
        elements.append(Paragraph(
            f'<b>AED: {grand_total:,.2f}/- (Dirhams: {amount_text} Only)</b>',
            self.styles['LPONormal']
        ))

        # === TERMS + SIGNATURES + FOOTER ===
        # Check both materials AND terms count to decide page layout
        terms = lpo_data.get('terms', {})
        general_terms = terms.get('general_terms', [])
        items = lpo_data.get('items', [])
        terms_count = len(general_terms)
        items_count = len(items)

        # If content is small (few items AND few terms), let it flow naturally
        # Otherwise, keep Terms + Signatures + Footer together for security
        is_small_document = items_count <= 5 and terms_count <= 4

        if is_small_document:
            # Small document - let everything flow naturally (fits on page 1)
            elements.extend(self._generate_terms_section(lpo_data))
            elements.extend(self._generate_signature_section(lpo_data))
            elements.extend(self._generate_footer(lpo_data))
        else:
            # Large document - keep Terms + Signatures + Footer together
            # This ensures signatures are never alone on a page
            secure_block = []
            secure_block.extend(self._generate_terms_section(lpo_data))
            secure_block.extend(self._generate_signature_section(lpo_data))
            secure_block.extend(self._generate_footer(lpo_data))
            elements.append(KeepTogether(secure_block))

        # Build PDF
        doc.build(elements, onFirstPage=self._add_watermark, onLaterPages=self._add_watermark)
        buffer.seek(0)
        return buffer.read()

    def _generate_header(self, lpo_data):
        """Generate header with logo and contact info"""
        elements = []
        header_image = lpo_data.get('header_image')

        # Try custom header image first
        if header_image:
            img = self._get_image_from_base64(header_image, width=7.5*inch)
            if img:
                elements.append(img)
                return elements

        # Default header with logo
        logo_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'logo.png')

        # Create header table
        header_data = []

        # Logo cell - compact size with proper aspect ratio (same as BOQ PDF)
        # With "DUBAI | SHARJAH | MUSCAT | COCHIN" below the logo
        if os.path.exists(logo_path):
            try:
                # Use kind='proportional' to maintain aspect ratio like BOQ PDF
                logo_img = Image(logo_path, width=1.8*inch, height=0.7*inch, kind='proportional')
                # Create a table to stack logo and locations text
                locations_text = Paragraph(
                    '<font size="7" color="#666666">DUBAI | SHARJAH | MUSCAT | COCHIN</font>',
                    ParagraphStyle('LocationsInfo', fontSize=7, alignment=TA_LEFT, leading=9)
                )
                logo = Table([[logo_img], [locations_text]], colWidths=[2*inch])
                logo.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 0),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                    ('LEFTPADDING', (0, 0), (-1, -1), 0),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ]))
            except:
                logo = Paragraph('<b>METER SQUARE</b><br/><font size="7">INTERIORS LLC</font><br/><font size="7" color="#666666">DUBAI | SHARJAH | MUSCAT | COCHIN</font>',
                                self.styles['LPOBold'])
        else:
            logo = Paragraph('<b>METER SQUARE</b><br/><font size="7">INTERIORS LLC</font><br/><font size="7" color="#666666">DUBAI | SHARJAH | MUSCAT | COCHIN</font>',
                            self.styles['LPOBold'])

        # Company info cell - contact numbers only (locations moved below logo)
        company = lpo_data.get('company', {})
        company_info = Paragraph(
            f'''<font size="6">Sharjah: 66015 | 06 5398189/90 | Fax: 06 5398289</font><br/>
            <font size="6">Dubai: 89381 | 04 2596772 | Fax: 04 2647603</font>''',
            ParagraphStyle('HeaderInfo', fontSize=7, alignment=TA_RIGHT, leading=9)
        )

        header_data.append([logo, company_info])

        header_table = Table(header_data, colWidths=[3.5*inch, 4*inch])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(header_table)

        # Contact bar
        contact_bar = Table(
            [[Paragraph(
                '<font size="6" color="white">Sharjah: 66015 | 06 5398189/90 | Fax: 06 5398289 &nbsp;&nbsp;&nbsp;&nbsp; '
                'Dubai: 89381 | 04 2596772 | Fax: 04 2647603</font>',
                ParagraphStyle('ContactBar', fontSize=6, textColor=colors.white, alignment=TA_CENTER)
            )]],
            colWidths=[7.5*inch]
        )
        contact_bar.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#ec2024')),  # Red color to match company branding
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(contact_bar)

        return elements

    def _generate_to_from_section(self, lpo_data):
        """Generate TO and FROM columns"""
        elements = []
        vendor = lpo_data.get('vendor', {})
        company = lpo_data.get('company', {})
        lpo_info = lpo_data.get('lpo_info', {})

        # TO section content
        to_content = f'''<b>To,</b><br/>
<b>{vendor.get('company_name', 'N/A')}</b><br/>
Atten: {vendor.get('contact_person', 'N/A')}<br/>
Phone: {vendor.get('phone', 'N/A')}<br/>
Fax: {vendor.get('fax', 'N/A')}<br/>
Email: {vendor.get('email', 'N/A')}<br/>
Project: {vendor.get('project', 'N/A')}<br/>
Subject: {vendor.get('subject', 'N/A')}<br/>
TRN# {vendor.get('trn', 'N/A')}'''

        # FROM section content
        lpo_date = lpo_info.get('lpo_date', datetime.now().strftime('%d.%m.%Y'))
        from_content = f'''<b>From,</b><br/>
<b>{company.get('name', 'Meter Square Interiors LLC')}</b><br/>
{company.get('contact_person', 'N/A')}<br/>
Division: {company.get('division', 'Admin')}<br/>
Phone: {company.get('phone', 'N/A')}<br/>
Fax: {company.get('fax', 'N/A')}<br/>
Email: {company.get('email', 'N/A')}<br/>
LPO Date: {lpo_date}<br/>
LPO Number: {lpo_info.get('lpo_number', 'N/A')}<br/>
TRN# {company.get('trn', 'N/A')}'''

        to_para = Paragraph(to_content, self.styles['LPONormal'])
        from_para = Paragraph(from_content, self.styles['LPONormal'])

        address_table = Table([[to_para, from_para]], colWidths=[3.7*inch, 3.7*inch])
        address_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('ALIGN', (1, 0), (1, 0), 'LEFT'),
        ]))
        elements.append(address_table)

        return elements

    def _generate_items_table(self, lpo_data):
        """Generate items table with totals"""
        elements = []
        items = lpo_data.get('items', [])
        totals = lpo_data.get('totals', {})

        # Table header with separate columns for Material, Brand, Specification
        table_data = [['SI#', 'Material', 'Brand', 'Specification', 'Qty', 'Unit', 'Rate', 'Amount']]

        # Add items
        for i, item in enumerate(items, 1):
            material_name = item.get('material_name', '') or item.get('description', '')
            brand = item.get('brand', '') or '-'
            specification = item.get('specification', '') or '-'
            
            table_data.append([
                str(item.get('sl_no', i)),
                Paragraph(str(material_name), self.styles['LPOSmall']),
                Paragraph(str(brand), self.styles['LPOSmall']),
                Paragraph(str(specification), self.styles['LPOSmall']),
                str(item.get('qty', '')),
                str(item.get('unit', '')),
                f"{item.get('rate', 0):,.2f}",
                f"{item.get('amount', 0):,.2f}"
            ])

        # Add totals
        subtotal = totals.get('subtotal', 0)
        vat_percent = totals.get('vat_percent', 0)
        vat_amount = totals.get('vat_amount', 0)
        grand_total = totals.get('grand_total', 0)

        table_data.append(['', '', '', '', '', '', 'Total', f"{subtotal:,.2f}"])
        # Only show VAT row if VAT is applicable (vat_percent > 0)
        if vat_percent > 0:
            table_data.append(['', '', '', '', '', '', f'VAT {vat_percent}%', f"{vat_amount:,.2f}"])
            table_data.append(['', '', '', '', '', '', 'Total', f"{grand_total:,.2f}"])

        # Create table with adjusted column widths for 8 columns
        col_widths = [0.35*inch, 1.6*inch, 1.0*inch, 1.2*inch, 0.5*inch, 0.45*inch, 0.8*inch, 0.9*inch]
        items_table = Table(table_data, colWidths=col_widths)

        # Calculate styling offsets based on whether VAT is shown
        # With VAT: 3 total rows (subtotal, VAT, grand total)
        # Without VAT: 1 total row (just subtotal/total)
        total_rows = 3 if vat_percent > 0 else 1
        body_end_offset = -(total_rows + 1)  # Row before totals section

        # Style the table
        style = TableStyle([
            # Header
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8e8e8')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),

            # Body
            ('FONTNAME', (0, 1), (-1, body_end_offset), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, body_end_offset), 8),
            ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # SI#
            ('ALIGN', (4, 1), (4, -1), 'CENTER'),  # Qty
            ('ALIGN', (5, 1), (5, -1), 'CENTER'),  # Unit
            ('ALIGN', (6, 1), (-1, -1), 'RIGHT'),  # Rate, Amount

            # Totals rows
            ('FONTNAME', (6, -total_rows), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (4, -total_rows), (-1, -1), 8),

            # Grid
            ('GRID', (0, 0), (-1, body_end_offset), 0.5, colors.HexColor('#cccccc')),
            ('BOX', (4, -total_rows), (-1, -1), 0.5, colors.HexColor('#cccccc')),
            ('LINEABOVE', (4, -total_rows), (-1, -total_rows), 0.5, colors.HexColor('#cccccc')),
            ('LINEABOVE', (4, -1), (-1, -1), 0.5, colors.HexColor('#cccccc')),

            # Padding
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),

            # Vertical alignment
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ])
        items_table.setStyle(style)
        elements.append(items_table)

        return elements

    def _generate_terms_section(self, lpo_data):
        """Generate payment terms and delivery terms section"""
        elements = []
        terms = lpo_data.get('terms', {})

        # Get custom/payment terms (selected ones only)
        custom_terms = terms.get('custom_terms', [])
        selected_terms = [t for t in custom_terms if t.get('selected', False)]

        delivery_terms = terms.get('delivery_terms', '')

        elements.append(Spacer(1, 10))

        # Payment Terms - show as numbered list if multiple, or single line if one
        if selected_terms:
            payment_text_parts = [t.get('text', '') for t in selected_terms if t.get('text', '')]
            if len(payment_text_parts) == 1:
                # Single term - show on same line
                elements.append(Paragraph(f'<b>Payment Terms:</b> {payment_text_parts[0]}', self.styles['LPONormal']))
            elif len(payment_text_parts) > 1:
                # Multiple terms - show as numbered list
                elements.append(Paragraph('<b>Payment Terms:</b>', self.styles['LPONormal']))
                for idx, term_text in enumerate(payment_text_parts, 1):
                    safe_term = term_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    elements.append(Paragraph(f'&nbsp;&nbsp;&nbsp;&nbsp;{idx}. {safe_term}', self.styles['LPONormal']))
        else:
            # Fallback to legacy payment_terms field
            payment_terms_combined = terms.get('payment_terms', '100% CDC after delivery')
            if payment_terms_combined:
                elements.append(Paragraph(f'<b>Payment Terms:</b> {payment_terms_combined}', self.styles['LPONormal']))

        # Delivery Terms line
        if delivery_terms:
            elements.append(Paragraph(f'<b>Delivery Terms:</b> {delivery_terms}', self.styles['LPONormal']))

        return elements

    def _generate_signature_section(self, lpo_data):
        """Generate signature section with MD and TD"""
        elements = []
        signatures = lpo_data.get('signatures', {})

        elements.append(Spacer(1, 10))  # Compact spacing

        # Create signature cells
        md_name = signatures.get('md_name', 'Managing Director')
        td_name = signatures.get('td_name', 'Technical Director')
        md_signature = signatures.get('md_signature')
        td_signature = signatures.get('td_signature')
        stamp_image = signatures.get('stamp_image')
        is_system_signature = signatures.get('is_system_signature', False)

        # System signature indicator text
        system_sig_text = '<font size="5" color="#888888"><i>(System Generated)</i></font>' if is_system_signature else ''

        # MD signature cell content
        md_content = []
        if md_signature:
            md_img = self._get_image_from_base64(md_signature, width=1.2*inch, height=0.5*inch)
            if md_img:
                md_content.append(md_img)
        # Only show name above title if name is different from title (actual person name)
        if md_name and md_name != 'Managing Director':
            md_content.append(Paragraph(
                f'<br/><b>{md_name}</b><br/><font color="#1a365d">Managing Director</font><br/>{system_sig_text}',
                self.styles['LPOSmall']
            ))
        else:
            md_content.append(Paragraph(
                f'<br/><br/><font color="#1a365d"><b>Managing Director</b></font><br/>{system_sig_text}',
                self.styles['LPOSmall']
            ))

        # Stamp cell (center) - reduced size for better fit
        stamp_cell = []
        if stamp_image:
            stamp_img = self._get_image_from_base64(stamp_image, width=1*inch, height=1*inch)
            if stamp_img:
                stamp_cell.append(stamp_img)

        # TD signature cell content - aligned left within cell
        td_content = []
        if td_signature:
            td_img = self._get_image_from_base64(td_signature, width=1.2*inch, height=0.5*inch)
            if td_img:
                td_content.append(td_img)
        # Only show name above title if name is different from title (actual person name)
        if td_name and td_name != 'Technical Director':
            td_content.append(Paragraph(
                f'<br/><b>{td_name}</b><br/><font color="#1a365d">Technical Director</font><br/>{system_sig_text}',
                self.styles['LPOSmall']
            ))
        else:
            td_content.append(Paragraph(
                f'<br/><br/><font color="#1a365d"><b>Technical Director</b></font><br/>{system_sig_text}',
                self.styles['LPOSmall']
            ))

        # Build signature table
        sig_data = []

        # Row with signatures and stamp
        row = []

        # MD column - align left
        if md_content:
            md_table = Table([[item] for item in md_content], colWidths=[2*inch])
            md_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
            ]))
            row.append(md_table)
        else:
            # Fallback - only show name if different from title
            if md_name and md_name != 'Managing Director':
                row.append(Paragraph(f'<br/><br/><b>{md_name}</b><br/><font color="#1a365d">Managing Director</font>', self.styles['LPOSmall']))
            else:
                row.append(Paragraph(f'<br/><br/><font color="#1a365d"><b>Managing Director</b></font>', self.styles['LPOSmall']))

        # Stamp column - center
        if stamp_cell:
            stamp_table = Table([[item] for item in stamp_cell], colWidths=[2*inch])
            stamp_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            row.append(stamp_table)
        else:
            row.append('')

        # TD column - align LEFT (fixed from RIGHT)
        if td_content:
            td_table = Table([[item] for item in td_content], colWidths=[2*inch])
            td_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),  # Changed from RIGHT to LEFT
                ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
            ]))
            row.append(td_table)
        else:
            # Fallback - only show name if different from title
            if td_name and td_name != 'Technical Director':
                row.append(Paragraph(f'<br/><br/><b>{td_name}</b><br/><font color="#1a365d">Technical Director</font>', self.styles['LPOSmall']))
            else:
                row.append(Paragraph(f'<br/><br/><font color="#1a365d"><b>Technical Director</b></font>', self.styles['LPOSmall']))

        sig_data.append(row)

        # Adjusted column widths for better alignment
        sig_table = Table(sig_data, colWidths=[2.3*inch, 2.9*inch, 2.3*inch])
        sig_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('ALIGN', (1, 0), (1, 0), 'CENTER'),
            ('ALIGN', (2, 0), (2, 0), 'LEFT'),  # Changed from RIGHT to LEFT
            ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ]))
        elements.append(sig_table)

        return elements

    def _generate_footer(self, lpo_data):
        """Generate footer with colored line and company info"""
        elements = []
        lpo_info = lpo_data.get('lpo_info', {})
        vendor = lpo_data.get('vendor', {})

        elements.append(Spacer(1, 20))

        # Create colored line (red on left, blue on right) - very thin (1px)
        # Using a table with colored backgrounds
        line_data = [['', '']]
        line_table = Table(line_data, colWidths=[3.75*inch, 3.75*inch], rowHeights=[1])  # 1px thin line
        line_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#c41e3a')),  # Red
            ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#1a365d')),  # Blue
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        elements.append(line_table)

        elements.append(Spacer(1, 8))

        # Footer content - website and email
        footer_line1 = Paragraph(
            '<font size="8" color="#1a365d"><b>www.metersquare.com</b></font> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; '
            '<font size="8" color="#666666">admin@metersquare.com</font>',
            ParagraphStyle('FooterLine1', fontSize=8, alignment=TA_CENTER)
        )
        elements.append(footer_line1)

        elements.append(Spacer(1, 3))

        # Services info
        footer_line2 = Paragraph(
            '<font size="7" color="#888888">INTERIOR DESIGN &nbsp;&nbsp;&nbsp; TURNKEY SOLUTIONS &nbsp;&nbsp;&nbsp; CONTRACTING</font>',
            ParagraphStyle('FooterLine2', fontSize=7, alignment=TA_CENTER)
        )
        elements.append(footer_line2)

        # Document reference
        elements.append(Spacer(1, 5))
        lpo_number = lpo_info.get('lpo_number', '')
        vendor_name = vendor.get('company_name', '').replace(' ', '-')[:20]
        project_name = vendor.get('project', '').replace(' ', '')[:10]
        doc_ref = f"{lpo_number}--{vendor_name}"
        elements.append(Paragraph(
            f'<font size="6" color="#999999">{doc_ref}</font>',
            ParagraphStyle('DocRef', fontSize=6, alignment=TA_CENTER)
        ))

        return elements


# Utility function for easy use
def generate_lpo_pdf(lpo_data):
    """
    Generate LPO PDF with given data

    Args:
        lpo_data: dict with vendor, company, lpo_info, items, totals, terms, signatures

    Returns:
        bytes: PDF content
    """
    generator = LPOPDFGenerator()
    return generator.generate_lpo_pdf(lpo_data)
