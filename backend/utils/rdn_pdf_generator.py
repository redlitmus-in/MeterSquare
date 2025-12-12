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

    # Layout dimensions
    PAGE_MARGIN_H = 15 * mm
    PAGE_MARGIN_V = 12 * mm
    LOGO_SIZE = 25 * mm

    # Table column character limits
    MAX_MATERIAL_DESC_LENGTH = 75
    MAX_RETURN_REASON_LENGTH = 35
    MAX_NOTES_LENGTH = 55

    # Default values
    DEFAULT_COMPANY_NAME = os.getenv('COMPANY_NAME', 'MeterSquare')
    DEFAULT_PREPARED_BY_ROLE = 'Site Engineer'
    DEFAULT_RECEIVED_BY_ROLE = 'Production Manager'

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
            fontSize=20,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a202c'),
            alignment=TA_CENTER,
            spaceAfter=2,
            spaceBefore=5
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
            fontSize=7,
            textColor=colors.HexColor('#666666'),
            alignment=TA_CENTER,
            fontName='Helvetica-Oblique'
        ))

        # Company name
        self.styles.add(ParagraphStyle(
            name='CompanyName',
            parent=self.styles['Normal'],
            fontSize=18,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a202c'),
            alignment=TA_RIGHT,
            spaceAfter=0
        ))

    def generate_pdf(self, rdn_data, project_data, items_data, company_name=None):
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

        # Use default company name if not provided
        company_name = company_name or self.DEFAULT_COMPANY_NAME

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=self.PAGE_MARGIN_H,
            leftMargin=self.PAGE_MARGIN_H,
            topMargin=self.PAGE_MARGIN_V,
            bottomMargin=self.PAGE_MARGIN_V
        )

        story = []

        # Header with Logo (centered, professional)
        # Escape company name to prevent XSS in PDF
        company_name_escaped = self._escape_html(company_name)

        if self.logo_path and os.path.exists(self.logo_path):
            try:
                # Logo centered - no duplicate company name text
                logo = Image(self.logo_path, width=self.LOGO_SIZE, height=self.LOGO_SIZE, kind='proportional')

                logo_table = Table([[logo]], colWidths=[180*mm])
                logo_table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                    ('VALIGN', (0, 0), (0, 0), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (0, 0), 0),
                    ('BOTTOMPADDING', (0, 0), (0, 0), 5),
                ]))
                story.append(logo_table)
            except (IOError, OSError, ValueError) as e:
                logger.warning(f"Failed to load logo from {self.logo_path}: {e}")
                # If logo fails, just show company name centered
                company_center_style = ParagraphStyle(
                    name='CompanyCentered',
                    parent=self.styles['Normal'],
                    fontSize=18,
                    fontName='Helvetica-Bold',
                    textColor=colors.HexColor('#1a202c'),
                    alignment=TA_CENTER,
                )
                company_para = Paragraph(f'<b>{company_name_escaped}</b>', company_center_style)
                story.append(company_para)
                story.append(Spacer(1, 3*mm))
            except Exception as e:
                logger.error(f"Unexpected error loading logo from {self.logo_path}: {e}", exc_info=True)
                # Fallback to company name
                company_center_style = ParagraphStyle(
                    name='CompanyCentered',
                    parent=self.styles['Normal'],
                    fontSize=18,
                    fontName='Helvetica-Bold',
                    textColor=colors.HexColor('#1a202c'),
                    alignment=TA_CENTER,
                )
                company_para = Paragraph(f'<b>{company_name_escaped}</b>', company_center_style)
                story.append(company_para)
                story.append(Spacer(1, 3*mm))
        else:
            # No logo, just company name centered
            company_center_style = ParagraphStyle(
                name='CompanyCentered',
                parent=self.styles['Normal'],
                fontSize=18,
                fontName='Helvetica-Bold',
                textColor=colors.HexColor('#1a202c'),
                alignment=TA_CENTER,
            )
            company_para = Paragraph(f'<b>{company_name_escaped}</b>', company_center_style)
            story.append(company_para)
            story.append(Spacer(1, 3*mm))

        # Separator line - subtle
        line_table = Table([['']], colWidths=[180*mm])
        line_table.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, 0), 0.5, colors.HexColor('#e5e7eb')),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(line_table)
        story.append(Spacer(1, 6*mm))

        # Main Title - Centered
        title = Paragraph("<b>RETURN DELIVERY NOTE</b>", self.styles['RDNTitle'])
        story.append(title)

        # RDN Number centered below title
        rdn_num_escaped = self._escape_html(rdn_data.get('return_note_number', 'N/A'))
        rdn_number_style = ParagraphStyle(
            name='RDNNumber',
            parent=self.styles['Normal'],
            fontSize=11,
            fontName='Helvetica',
            textColor=colors.HexColor('#4a5568'),
            alignment=TA_CENTER,
            spaceBefore=14,
            spaceAfter=20
        )
        rdn_num_para = Paragraph(f"RDN No: <b>{rdn_num_escaped}</b>", rdn_number_style)
        story.append(rdn_num_para)
        story.append(Spacer(1, 8*mm))

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

        info_grid_table = Table(info_grid_data, colWidths=[32*mm, 58*mm, 32*mm, 58*mm])
        info_grid_table.setStyle(TableStyle([
            # Label columns (0, 2) - Bold
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (2, 0), (2, -1), 'LEFT'),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#4b5563')),
            ('TEXTCOLOR', (2, 0), (2, -1), colors.HexColor('#4b5563')),

            # Value columns (1, 3)
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTNAME', (3, 0), (3, -1), 'Helvetica'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('ALIGN', (3, 0), (3, -1), 'LEFT'),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1f2937')),
            ('TEXTCOLOR', (3, 0), (3, -1), colors.HexColor('#1f2937')),

            # Font size
            ('FONTSIZE', (0, 0), (-1, -1), 9),

            # Grid lines - subtle
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),

            # Padding - consistent
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]))
        story.append(info_grid_table)
        story.append(Spacer(1, 10*mm))

        # Materials Table - Purple header matching Material Delivery Note
        # Columns: # | Material Description | Quantity | Notes

        items_table_data = [
            ['#', 'Material Description', 'Quantity', 'Notes']
        ]

        # Table rows - combining material name, code, size, and condition into description
        for idx, item in enumerate(items_data, 1):
            # Build material description with size if available
            # Escape each component individually to prevent XSS
            material_name = self._escape_html(item.get('material_name', 'N/A'))
            material_code = self._escape_html(item.get('material_code', 'N/A'))
            material_size = self._escape_html(item.get('size', ''))

            if material_size:
                material_desc = f"{material_name} - {material_size} ({material_code})"
            else:
                material_desc = f"{material_name} ({material_code})"

            # Truncate if needed (after escaping to avoid breaking entities)
            if len(material_desc) > self.MAX_MATERIAL_DESC_LENGTH:
                logger.debug(f"Material description truncated for item {idx}: {material_desc[:50]}...")
                material_desc = material_desc[:self.MAX_MATERIAL_DESC_LENGTH]

            qty_with_unit = f"{item.get('quantity', 0)} {self._escape_html(item.get('unit', ''))}"

            # Notes column: Condition + Return Reason
            condition = self._escape_html(item.get('condition', 'N/A'))
            return_reason = item.get('return_reason', '')
            notes = f"Condition: {condition}"
            if return_reason:
                if len(return_reason) > self.MAX_RETURN_REASON_LENGTH:
                    logger.debug(f"Return reason truncated for item {idx}: {return_reason[:50]}...")
                    return_reason = return_reason[:self.MAX_RETURN_REASON_LENGTH]
                notes += f" | Reason: {self._escape_html(return_reason)}"

            # Truncate notes if needed
            if len(notes) > self.MAX_NOTES_LENGTH:
                logger.debug(f"Notes truncated for item {idx}")
                notes = notes[:self.MAX_NOTES_LENGTH]

            items_table_data.append([
                str(idx),
                material_desc,
                qty_with_unit,
                notes
            ])

        items_table = Table(
            items_table_data,
            colWidths=[15*mm, 80*mm, 35*mm, 50*mm]
        )

        items_table.setStyle(TableStyle([
            # Header styling - Gray background matching Material Delivery Note
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#9ca3af')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),

            # Data rows styling
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#374151')),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # # column center
            ('ALIGN', (1, 1), (1, -1), 'LEFT'),    # Description left
            ('ALIGN', (2, 1), (2, -1), 'CENTER'),  # Quantity center
            ('ALIGN', (3, 1), (3, -1), 'LEFT'),    # Notes left

            # Grid with clean lines
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),

            # Padding - balanced
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
        ]))

        story.append(items_table)
        story.append(Spacer(1, 12*mm))

        # Notes Section (if any)
        if rdn_data.get('notes'):
            notes_box_data = [['Additional Notes:', self._escape_html(rdn_data.get('notes', ''))]]
            notes_box = Table(notes_box_data, colWidths=[40*mm, 140*mm])
            notes_box.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
                ('FONTNAME', (1, 0), (1, 0), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (0, 0), (0, 0), 'LEFT'),
                ('ALIGN', (1, 0), (1, 0), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
                ('LEFTPADDING', (0, 0), (-1, -1), 12),
                ('RIGHTPADDING', (0, 0), (-1, -1), 12),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ]))
            story.append(notes_box)
            story.append(Spacer(1, 15*mm))
        else:
            story.append(Spacer(1, 20*mm))

        # Signature Section - Clean lines without overlapping
        prepared_by_role = rdn_data.get('prepared_by_role', self.DEFAULT_PREPARED_BY_ROLE)
        received_by_role = rdn_data.get('received_by_role', self.DEFAULT_RECEIVED_BY_ROLE)

        signature_data = [
            ['Prepared By', 'Received By'],
            [f'({prepared_by_role})', f'({received_by_role})'],
            ['', ''],
            ['', ''],
        ]

        signature_table = Table(signature_data, colWidths=[90*mm, 90*mm])
        signature_table.setStyle(TableStyle([
            # Labels - bold
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1f2937')),

            # Roles - smaller gray
            ('FONTNAME', (0, 1), (-1, 1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, 1), 8),
            ('TEXTCOLOR', (0, 1), (-1, 1), colors.HexColor('#6b7280')),

            # Line below role
            ('LINEBELOW', (0, 1), (-1, 1), 0.75, colors.HexColor('#9ca3af')),

            # Alignment
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),

            # Padding
            ('TOPPADDING', (0, 0), (-1, 0), 0),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 3),
            ('TOPPADDING', (0, 1), (-1, 1), 0),
            ('BOTTOMPADDING', (0, 1), (-1, 1), 15),
            ('TOPPADDING', (0, 2), (-1, -1), 5),
        ]))
        story.append(signature_table)

        # Date fields below signature
        date_data = [['Date: ________________', 'Date: ________________']]
        date_table = Table(date_data, colWidths=[90*mm, 90*mm])
        date_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#6b7280')),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, 0), 3),
        ]))
        story.append(date_table)

        # Footer
        story.append(Spacer(1, 10*mm))
        footer_text = f"Generated on {datetime.now().strftime('%d %B %Y at %I:%M %p')}"
        footer_para = Paragraph(f'<para align=center><i>{footer_text}</i></para>', self.styles['SmallText'])
        story.append(footer_para)

        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer
