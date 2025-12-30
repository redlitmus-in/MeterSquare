"""
Asset Delivery Note (ADN) PDF Generator
Generates professional delivery note PDFs for returnable assets
Matches the format of Material Delivery Notes: Logo + Title header, info grid, items table, signatures, footer
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from io import BytesIO
from datetime import datetime
from xml.sax.saxutils import escape
import os
import logging

logger = logging.getLogger(__name__)


class AssetDNPDFGenerator:
    """Asset Delivery Note PDF Generator - Professional format matching Material DN template"""

    def __init__(self, logo_path=None):
        self.styles = getSampleStyleSheet()
        self._setup_styles()
        self.page_width, self.page_height = A4
        self.logo_path = logo_path or self._find_logo()

    def _find_logo(self):
        """Find company logo in common locations"""
        script_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(script_dir)

        possible_paths = [
            os.path.join(backend_dir, 'static', 'logo.png'),
            os.path.join(backend_dir, 'assets', 'logo.png'),
            os.path.join(backend_dir, 'logo.png'),
        ]

        for path in possible_paths:
            if os.path.exists(path):
                return path
        return None

    @staticmethod
    def _escape_html(text):
        """Escape HTML/XML special characters"""
        if text is None:
            return ''
        return escape(str(text))

    def _setup_styles(self):
        """Setup professional styles for ADN"""
        # Main title - large bold
        self.styles.add(ParagraphStyle(
            name='ADNTitle',
            parent=self.styles['Normal'],
            fontSize=16,
            fontName='Helvetica-Bold',
            textColor=colors.black,
            alignment=TA_CENTER,
            spaceAfter=2,
        ))

        # ADN Number subtitle
        self.styles.add(ParagraphStyle(
            name='ADNSubtitle',
            parent=self.styles['Normal'],
            fontSize=11,
            fontName='Helvetica',
            textColor=colors.HexColor('#666666'),
            alignment=TA_CENTER,
        ))

        # Normal text
        self.styles.add(ParagraphStyle(
            name='ADNNormal',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=colors.black,
        ))

        # Bold label
        self.styles.add(ParagraphStyle(
            name='ADNLabel',
            parent=self.styles['Normal'],
            fontSize=9,
            fontName='Helvetica-Bold',
            textColor=colors.black,
        ))

        # Small text for footer
        self.styles.add(ParagraphStyle(
            name='ADNFooter',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#666666'),
            alignment=TA_CENTER,
        ))

    def generate_pdf(self, adn_data, project_data, items_data):
        """
        Generate Asset Delivery Note PDF matching exact template format

        Args:
            adn_data: dict - Asset Delivery note details
            project_data: dict - Project details
            items_data: list[dict] - List of asset items

        Returns:
            BytesIO: PDF content
        """
        if not isinstance(adn_data, dict):
            raise ValueError("adn_data must be a dictionary")
        if not isinstance(project_data, dict):
            raise ValueError("project_data must be a dictionary")
        if not isinstance(items_data, list):
            raise ValueError("items_data must be a list")
        if not items_data:
            raise ValueError("items_data cannot be empty")

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=20*mm,
            rightMargin=20*mm,
            topMargin=15*mm,
            bottomMargin=15*mm
        )

        story = []
        content_width = self.page_width - 40*mm  # Total content width

        # ==================== HEADER SECTION ====================
        # Logo on left, Title + ADN Number on right
        adn_number = self._escape_html(adn_data.get('adn_number', 'N/A'))

        # Create title block (right side) with spacing between title and ADN number
        title_para = Paragraph('<b>ASSET DELIVERY NOTE</b>', self.styles['ADNTitle'])
        spacer_para = Spacer(1, 3*mm)  # Space between title and ADN number
        adn_num_para = Paragraph(adn_number, self.styles['ADNSubtitle'])

        if self.logo_path and os.path.exists(self.logo_path):
            try:
                logo = Image(self.logo_path, width=35*mm, height=35*mm, kind='proportional')
                # Header table: Logo | Title with spacing
                header_data = [[logo, [title_para, spacer_para, adn_num_para]]]
                header_table = Table(header_data, colWidths=[45*mm, content_width - 45*mm])
                header_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (0, 0), 'LEFT'),
                    ('ALIGN', (1, 0), (1, 0), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ]))
                story.append(header_table)
            except Exception as e:
                logger.warning(f"Failed to load logo: {e}")
                story.append(title_para)
                story.append(Spacer(1, 3*mm))
                story.append(adn_num_para)
        else:
            story.append(title_para)
            story.append(Spacer(1, 3*mm))
            story.append(adn_num_para)

        # Red separator line
        story.append(Spacer(1, 5*mm))
        line_table = Table([['']], colWidths=[content_width])
        line_table.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, 0), 2, colors.HexColor('#CC0000')),
        ]))
        story.append(line_table)
        story.append(Spacer(1, 5*mm))

        # ==================== INFO GRID SECTION ====================
        # 2-column layout matching the template exactly

        # Format values
        project_location = f"{self._escape_html(project_data.get('project_name', 'N/A'))}, {self._escape_html(project_data.get('location', ''))}"
        delivery_date = self._format_date(adn_data.get('delivery_date'))
        attention_to = self._escape_html(adn_data.get('attention_to', '-'))
        delivery_from = self._escape_html(adn_data.get('delivery_from', 'M2 Store'))
        vehicle_driver = f"{self._escape_html(adn_data.get('vehicle_number', '-'))} / {self._escape_html(adn_data.get('driver_name', '-'))}"

        # Create info grid with proper formatting
        info_data = [
            [
                Paragraph('<b>Project & Location:</b>', self.styles['ADNLabel']),
                Paragraph(project_location, self.styles['ADNNormal']),
                Paragraph('<b>Delivery Date:</b>', self.styles['ADNLabel']),
                Paragraph(delivery_date, self.styles['ADNNormal']),
            ],
            [
                Paragraph('<b>Attention To:</b>', self.styles['ADNLabel']),
                Paragraph(attention_to, self.styles['ADNNormal']),
                Paragraph('<b>Delivery From:</b>', self.styles['ADNLabel']),
                Paragraph(delivery_from, self.styles['ADNNormal']),
            ],
            [
                Paragraph('<b>Vehicle & Driver:</b>', self.styles['ADNLabel']),
                Paragraph(vehicle_driver, self.styles['ADNNormal']),
                Paragraph('<b>Name & Signature:</b>', self.styles['ADNLabel']),
                Paragraph('', self.styles['ADNNormal']),
            ],
        ]

        # Info table with borders
        col_widths = [38*mm, 47*mm, 38*mm, 47*mm]
        info_table = Table(info_data, colWidths=col_widths)
        info_table.setStyle(TableStyle([
            # Grid lines
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
            # Background for label columns
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#F5F5F5')),
            ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#F5F5F5')),
            # Padding
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            # Alignment
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 8*mm))

        # ==================== ITEMS TABLE ====================
        # Header row
        items_header = [
            Paragraph('<b>#</b>', self.styles['ADNLabel']),
            Paragraph('<b>Asset Description</b>', self.styles['ADNLabel']),
            Paragraph('<b>Quantity</b>', self.styles['ADNLabel']),
            Paragraph('<b>Condition</b>', self.styles['ADNLabel']),
            Paragraph('<b>Notes</b>', self.styles['ADNLabel']),
        ]
        items_table_data = [items_header]

        # Item rows
        for idx, item in enumerate(items_data, 1):
            # Build description - category name and item code if available
            desc = item.get('category_name', '')
            if item.get('item_code'):
                desc += f" ({item.get('item_code')})"
            elif item.get('serial_number'):
                desc += f" (S/N: {item.get('serial_number')})"

            # Format quantity
            qty = item.get('quantity', 1)
            qty_str = str(int(qty) if isinstance(qty, float) and qty % 1 == 0 else qty)

            condition = item.get('condition_at_dispatch', item.get('condition', 'Good'))
            notes = item.get('notes', '') or '-'

            items_table_data.append([
                Paragraph(str(idx), self.styles['ADNNormal']),
                Paragraph(self._escape_html(desc), self.styles['ADNNormal']),
                Paragraph(qty_str, self.styles['ADNNormal']),
                Paragraph(self._escape_html(condition).title(), self.styles['ADNNormal']),
                Paragraph(self._escape_html(notes), self.styles['ADNNormal']),
            ])

        # Items table styling
        items_col_widths = [12*mm, 70*mm, 25*mm, 30*mm, 33*mm]
        items_table = Table(items_table_data, colWidths=items_col_widths)
        items_table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E8F5E9')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            # Grid
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
            # Padding
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            # Alignment
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),  # # column centered
            ('ALIGN', (2, 0), (2, -1), 'CENTER'),  # Quantity centered
            ('ALIGN', (3, 0), (3, -1), 'CENTER'),  # Condition centered
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(items_table)

        # ==================== NOTES SECTION ====================
        if adn_data.get('notes'):
            story.append(Spacer(1, 5*mm))
            notes_para = Paragraph(
                f"<b>Notes:</b><br/>{self._escape_html(adn_data.get('notes'))}",
                self.styles['ADNNormal']
            )
            story.append(notes_para)

        # ==================== SIGNATURE SECTION ====================
        story.append(Spacer(1, 15*mm))

        sig_data = [
            [
                Paragraph('<b>Prepared By:</b>', self.styles['ADNLabel']),
                Paragraph('<b>Received By:</b>', self.styles['ADNLabel']),
            ],
            [
                Paragraph('Production Manager', self.styles['ADNNormal']),
                Paragraph('Site Engineer', self.styles['ADNNormal']),
            ],
            [
                Paragraph('Signature: ________________', self.styles['ADNNormal']),
                Paragraph('Signature: ________________', self.styles['ADNNormal']),
            ],
            [
                Paragraph('Date: ________________', self.styles['ADNNormal']),
                Paragraph('Date: ________________', self.styles['ADNNormal']),
            ],
        ]

        sig_table = Table(sig_data, colWidths=[content_width/2, content_width/2])
        sig_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(sig_table)

        # ==================== FOOTER ====================
        story.append(Spacer(1, 20*mm))
        footer_text = f"Generated on {datetime.now().strftime('%m/%d/%Y, %I:%M:%S %p')}"
        footer_para = Paragraph(footer_text, self.styles['ADNFooter'])
        story.append(footer_para)

        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer

    def _format_date(self, date_value):
        """Format date value to readable string"""
        if not date_value:
            return '-'
        if isinstance(date_value, str):
            try:
                date_obj = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
                return date_obj.strftime('%d %B %Y')
            except (ValueError, AttributeError):
                return date_value
        elif isinstance(date_value, datetime):
            return date_value.strftime('%d %B %Y')
        return str(date_value)
