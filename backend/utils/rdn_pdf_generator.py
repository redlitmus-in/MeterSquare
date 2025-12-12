"""
RDN (Return Delivery Note) PDF Generator
Generates professional return delivery note PDFs matching Material Delivery Note format
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas
from io import BytesIO
from datetime import datetime
from xml.sax.saxutils import escape
import os
import logging

logger = logging.getLogger(__name__)


class RDNPDFGenerator:
    """Return Delivery Note PDF Generator - Professional format with logo"""

    def __init__(self, logo_path=None):
        self.styles = getSampleStyleSheet()
        self._setup_styles()
        self.page_width, self.page_height = A4
        self.logo_path = logo_path or self._find_logo()

    def _find_logo(self):
        """Find company logo in common locations"""
        # Get the directory where this script is located
        script_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(script_dir)

        possible_paths = [
            os.path.join(backend_dir, 'static', 'logo.png'),
            os.path.join(backend_dir, 'logo.png'),
            os.path.join(backend_dir, 'assets', 'logo.png'),
            os.path.join(backend_dir, '..', 'frontend', 'public', 'assets', 'logo.png'),
        ]

        for path in possible_paths:
            abs_path = os.path.abspath(path)
            if os.path.exists(abs_path):
                return abs_path
        return None

    @staticmethod
    def _escape_html(text):
        """Escape HTML/XML special characters to prevent XSS in PDF"""
        if text is None:
            return ''
        return escape(str(text))

    def _setup_styles(self):
        """Setup professional styles for RDN"""
        # Main title
        self.styles.add(ParagraphStyle(
            name='RDNTitle',
            parent=self.styles['Normal'],
            fontSize=18,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#2c3e50'),
            alignment=TA_CENTER,
            spaceAfter=15,
            spaceBefore=10
        ))

        # Section header
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Normal'],
            fontSize=11,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#2c3e50'),
            spaceBefore=10,
            spaceAfter=5,
            leftIndent=0
        ))

        # Normal text
        self.styles.add(ParagraphStyle(
            name='RDNNormal',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#333333')
        ))

        # Small text
        self.styles.add(ParagraphStyle(
            name='SmallText',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#666666'),
            alignment=TA_CENTER
        ))

        # Company name
        self.styles.add(ParagraphStyle(
            name='CompanyName',
            parent=self.styles['Normal'],
            fontSize=16,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#2c3e50'),
            alignment=TA_CENTER
        ))

    def generate_pdf(self, rdn_data, project_data, items_data, company_name="MeterSquare"):
        """
        Generate RDN PDF matching Material Delivery Note format

        Args:
            rdn_data: dict - Return delivery note details
            project_data: dict - Project details
            items_data: list[dict] - List of return items
            company_name: str - Company name for header

        Returns:
            BytesIO: PDF content

        Raises:
            ValueError: If required data is missing or invalid
        """
        # Validate inputs
        if not isinstance(rdn_data, dict):
            raise ValueError("rdn_data must be a dictionary")
        if not isinstance(project_data, dict):
            raise ValueError("project_data must be a dictionary")
        if not isinstance(items_data, list):
            raise ValueError("items_data must be a list")
        if not items_data:
            raise ValueError("items_data cannot be empty - RDN must have at least one item")

        # Validate required RDN fields
        required_rdn_fields = ['return_note_number', 'return_date', 'status']
        for field in required_rdn_fields:
            if field not in rdn_data:
                raise ValueError(f"Missing required field in rdn_data: {field}")

        # Validate required project fields
        required_project_fields = ['project_name', 'project_code']
        for field in required_project_fields:
            if field not in project_data:
                raise ValueError(f"Missing required field in project_data: {field}")

        logger.info(f"Generating PDF for RDN: {rdn_data.get('return_note_number')}")

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=15*mm,
            leftMargin=15*mm,
            topMargin=12*mm,
            bottomMargin=12*mm
        )

        story = []

        # Header with Logo and Company Name in single row
        # Escape company name to prevent XSS in PDF
        company_name_escaped = self._escape_html(company_name)

        if self.logo_path and os.path.exists(self.logo_path):
            try:
                logo = Image(self.logo_path, width=35*mm, height=35*mm, kind='proportional')
                company_para = Paragraph(f'<b>{company_name_escaped}</b>', self.styles['CompanyName'])

                header_table = Table([[logo, company_para]], colWidths=[45*mm, 135*mm])
                header_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (0, 0), 'LEFT'),
                    ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 0),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                ]))
                story.append(header_table)
                story.append(Spacer(1, 5*mm))
            except Exception as e:
                logger.warning(f"Failed to load logo from {self.logo_path}: {e}")
                # If logo fails, just show company name
                company_para = Paragraph(f'<b>{company_name_escaped}</b>', self.styles['CompanyName'])
                story.append(company_para)
                story.append(Spacer(1, 5*mm))
        else:
            # No logo, just company name
            company_para = Paragraph(f'<b>{company_name_escaped}</b>', self.styles['CompanyName'])
            story.append(company_para)
            story.append(Spacer(1, 5*mm))

        # Main Title - Centered with RDN number below
        title = Paragraph("<b>RETURN DELIVERY NOTE</b>", self.styles['RDNTitle'])
        story.append(title)

        # RDN Number centered below title
        rdn_num_escaped = self._escape_html(rdn_data.get('return_note_number', 'N/A'))
        rdn_number_style = ParagraphStyle(
            name='RDNNumber',
            parent=self.styles['Normal'],
            fontSize=10,
            fontName='Helvetica',
            textColor=colors.HexColor('#666666'),
            alignment=TA_CENTER,
            spaceAfter=8
        )
        rdn_num_para = Paragraph(f"RDN No: <b>{rdn_num_escaped}</b>", rdn_number_style)
        story.append(rdn_num_para)
        story.append(Spacer(1, 5*mm))

        # 4x2 Grid Info Section matching Material Delivery Note format
        # Row 1: Project | Date
        # Row 2: Location | Status
        # Row 3: Attention To (SE) | From (Store/PM)
        # Row 4: Vehicle | Driver

        info_grid_data = [
            # Row 1
            ['Project:', self._escape_html(project_data.get('project_name', 'N/A')),
             'Date:', self._escape_html(rdn_data.get('return_date', 'N/A'))],
            # Row 2
            ['Location:', self._escape_html(project_data.get('project_location', 'N/A')),
             'Status:', self._escape_html(rdn_data.get('status', 'N/A'))],
            # Row 3
            ['Attention To:', self._escape_html(rdn_data.get('created_by', 'Site Engineer')),
             'From:', 'Store / Production Manager'],
            # Row 4
            ['Vehicle:', self._escape_html(rdn_data.get('vehicle_number', 'N/A')),
             'Driver:', self._escape_html(rdn_data.get('driver_name', 'N/A'))]
        ]

        info_grid_table = Table(info_grid_data, colWidths=[28*mm, 62*mm, 28*mm, 62*mm])
        info_grid_table.setStyle(TableStyle([
            # Label columns (0, 2) - Bold and right-aligned
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (2, 0), (2, -1), 'LEFT'),

            # Value columns (1, 3)
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTNAME', (3, 0), (3, -1), 'Helvetica'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('ALIGN', (3, 0), (3, -1), 'LEFT'),

            # Font size
            ('FONTSIZE', (0, 0), (-1, -1), 9),

            # Grid lines
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),

            # Padding
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]))
        story.append(info_grid_table)
        story.append(Spacer(1, 8*mm))

        # Materials Table - Purple header matching Material Delivery Note
        # Columns: # | Material Description | Quantity | Notes

        items_table_data = [
            ['#', 'Material Description', 'Quantity', 'Notes']
        ]

        # Table rows - combining material name, code, unit, and condition into description
        for idx, item in enumerate(items_data, 1):
            material_desc = f"{item.get('material_name', 'N/A')} ({item.get('material_code', 'N/A')})"

            qty_with_unit = f"{item.get('quantity', 0)} {item.get('unit', '')}"

            # Notes column: Condition + Return Reason
            condition = item.get('condition', 'N/A')
            return_reason = item.get('return_reason', '')
            notes = f"Condition: {condition}"
            if return_reason:
                notes += f" | Reason: {return_reason[:30]}"

            items_table_data.append([
                str(idx),
                self._escape_html(material_desc)[:80],
                self._escape_html(qty_with_unit),
                self._escape_html(notes)[:60]
            ])

        items_table = Table(
            items_table_data,
            colWidths=[12*mm, 85*mm, 30*mm, 53*mm]
        )

        items_table.setStyle(TableStyle([
            # Header styling - Purple background (#7C3AED) with white text
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7C3AED')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),

            # Data rows styling
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1f2937')),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # # column center
            ('ALIGN', (1, 1), (1, -1), 'LEFT'),    # Description left
            ('ALIGN', (2, 1), (2, -1), 'CENTER'),  # Quantity center
            ('ALIGN', (3, 1), (3, -1), 'LEFT'),    # Notes left

            # Grid with clean lines
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),

            # Padding
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]))

        story.append(items_table)
        story.append(Spacer(1, 10*mm))

        # Notes Section (if any)
        if rdn_data.get('notes'):
            notes_label = Paragraph('<b>Additional Notes:</b>', self.styles['RDNNormal'])
            story.append(notes_label)
            story.append(Spacer(1, 2*mm))

            # Escape notes to prevent XSS
            notes_escaped = self._escape_html(rdn_data.get('notes', ''))
            notes_para = Paragraph(notes_escaped, self.styles['RDNNormal'])
            story.append(notes_para)
            story.append(Spacer(1, 10*mm))

        # Signature Section - "Prepared By" | "Received By"
        story.append(Spacer(1, 15*mm))
        signature_data = [
            ['', ''],
            ['_' * 35, '_' * 35],
            ['Prepared By', 'Received By'],
            ['(Site Engineer)', '(Production Manager)'],
            ['', ''],
            ['Date: _____________', 'Date: _____________']
        ]

        signature_table = Table(signature_data, colWidths=[90*mm, 90*mm])
        signature_table.setStyle(TableStyle([
            ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
            ('FONTNAME', (0, 3), (-1, 3), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, 2), 9),
            ('FONTSIZE', (0, 3), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 1), (-1, 1), 2),
            ('BOTTOMPADDING', (0, 1), (-1, 1), 2),
        ]))
        story.append(signature_table)

        # Footer
        story.append(Spacer(1, 10*mm))
        footer_text = f"Generated on {datetime.now().strftime('%d %B %Y at %I:%M %p')}"
        footer_para = Paragraph(f'<para align=center><i>{footer_text}</i></para>', self.styles['SmallText'])
        story.append(footer_para)

        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer
