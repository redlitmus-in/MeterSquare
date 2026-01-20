"""
Labour Assignment PDF Generator
Generates professional PDF reports for worker assignments with project details
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from io import BytesIO
from datetime import datetime
import os


class LabourAssignmentPDFGenerator:
    """Labour Assignment PDF Generator - Professional report design"""

    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_styles()
        self.page_width, self.page_height = A4

    def _setup_styles(self):
        """Setup professional styles for assignment report"""
        # Title style
        self.styles.add(ParagraphStyle(
            name='ReportTitle',
            parent=self.styles['Normal'],
            fontSize=18,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a'),
            alignment=TA_CENTER,
            spaceAfter=6
        ))

        # Subtitle
        self.styles.add(ParagraphStyle(
            name='ReportSubtitle',
            parent=self.styles['Normal'],
            fontSize=10,
            fontName='Helvetica',
            textColor=colors.HexColor('#666666'),
            alignment=TA_CENTER,
            spaceAfter=20
        ))

        # Section header
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Normal'],
            fontSize=12,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#2563eb'),
            spaceBefore=12,
            spaceAfter=6
        ))

        # Normal text
        self.styles.add(ParagraphStyle(
            name='ReportNormal',
            parent=self.styles['Normal'],
            fontSize=9,
            fontName='Helvetica',
            textColor=colors.HexColor('#333333'),
            leading=12
        ))

        # Bold text
        self.styles.add(ParagraphStyle(
            name='ReportBold',
            parent=self.styles['Normal'],
            fontSize=9,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#333333')
        ))

    def generate_assignment_report(self, requisition_data):
        """
        Generate a professional assignment report PDF

        Args:
            requisition_data: Dictionary containing requisition and assignment details

        Returns:
            BytesIO: PDF file buffer
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=20*mm,
            leftMargin=20*mm,
            topMargin=15*mm,
            bottomMargin=15*mm
        )

        # Build PDF content
        story = []

        # Company Header with Logo
        # Check for logo file
        logo_path = None
        possible_logo_paths = [
            os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'logo.png'),
            os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logo.png'),
        ]

        for path in possible_logo_paths:
            if os.path.exists(path):
                logo_path = path
                break

        if logo_path:
            # Header with logo - matching the exact design from screenshot
            logo = Image(logo_path, width=35*mm, height=12*mm)

            # Create company name and location (right side, stacked vertically)
            company_text = Paragraph(
                "<b>METERSQUARE INTERIORS LLC</b><br/><font size=9>Business Bay, Dubai, UAE</font>",
                ParagraphStyle(
                    'CompanyHeader',
                    parent=self.styles['Normal'],
                    fontSize=12,
                    fontName='Helvetica-Bold',
                    textColor=colors.HexColor('#1a1a1a'),
                    alignment=TA_RIGHT,
                    leading=15
                )
            )

            header_table_data = [[logo, company_text]]
            header_table = Table(header_table_data, colWidths=[40*mm, 130*mm])
            header_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
        else:
            # Header without logo (fallback)
            header_table_data = [
                [
                    Paragraph("<b>METERSQUARE INTERIORS LLC</b>", self.styles['ReportTitle']),
                    Paragraph("<b>Business Bay, Dubai, UAE</b>", ParagraphStyle(
                        'HeaderRight',
                        parent=self.styles['Normal'],
                        fontSize=10,
                        fontName='Helvetica-Bold',
                        textColor=colors.HexColor('#1a1a1a'),
                        alignment=TA_RIGHT
                    ))
                ]
            ]
            header_table = Table(header_table_data, colWidths=[100*mm, 70*mm])
            header_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))

        story.append(header_table)

        # Divider line
        story.append(Spacer(1, 3*mm))
        divider_table = Table([['']], colWidths=[170*mm])
        divider_table.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, -1), 1.5, colors.HexColor('#dc2626')),
        ]))
        story.append(divider_table)
        story.append(Spacer(1, 2*mm))

        # Contact info - matching the screenshot format
        contact_info = """
        <font color="#dc2626"><b>Sharjah</b></font>&nbsp;&nbsp;P.O. Box 66015 | Tel: 06 5398189&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;<font color="#5b8fd8"><b>Dubai</b></font>&nbsp;&nbsp;P.O. Box 89381 | Tel: 04 2596772
        """
        story.append(Paragraph(contact_info, ParagraphStyle(
            'ContactInfo',
            parent=self.styles['Normal'],
            fontSize=8,
            fontName='Helvetica',
            textColor=colors.HexColor('#333333'),
            alignment=TA_CENTER
        )))
        story.append(Spacer(1, 10*mm))

        # Document Title
        doc_title = "LABOUR ASSIGNMENT REPORT"
        story.append(Paragraph(doc_title, ParagraphStyle(
            'DocumentTitle',
            parent=self.styles['Normal'],
            fontSize=16,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a'),
            alignment=TA_CENTER,
            spaceBefore=4,
            spaceAfter=4
        )))

        # Subtitle with requisition code and date (system/server timezone)
        subtitle = f"Requisition: {requisition_data.get('requisition_code', 'N/A')} | Date: {datetime.now().strftime('%d-%b-%Y')}"
        story.append(Paragraph(subtitle, ParagraphStyle(
            'DocumentSubtitle',
            parent=self.styles['Normal'],
            fontSize=10,
            fontName='Helvetica',
            textColor=colors.HexColor('#666666'),
            alignment=TA_CENTER,
            spaceAfter=12
        )))
        story.append(Spacer(1, 6*mm))

        # Combined Requisition Details & Request/Approval Information
        story.append(Paragraph("Requisition Details", self.styles['SectionHeader']))

        # Build combined table data
        combined_table_data = [
            ['Requisition Code:', requisition_data.get('requisition_code', 'N/A')],
            ['Project Name:', requisition_data.get('project_name', 'N/A')],
            ['Site/Location:', requisition_data.get('site_name', 'N/A')],
            ['Required Date:', requisition_data.get('required_date', 'N/A')],
            ['Work Time:', f"{requisition_data.get('start_time', 'N/A')} - {requisition_data.get('end_time', 'N/A')}"],
            ['Status:', requisition_data.get('status', 'N/A').upper()],
            ['Assignment Status:', requisition_data.get('assignment_status', 'N/A').upper()]
        ]

        combined_table = Table(combined_table_data, colWidths=[50*mm, 120*mm])
        combined_table.setStyle(TableStyle([
            ('FONT', (0, 0), (0, -1), 'Helvetica-Bold', 9),
            ('FONT', (1, 0), (1, -1), 'Helvetica', 9),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#333333')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(combined_table)
        story.append(Spacer(1, 8*mm))

        # Request & Approval Information
        story.append(Paragraph("Request & Approval Information", self.styles['SectionHeader']))
        request_table_data = [
            ['Requested By:', requisition_data.get('requested_by_name', 'N/A')],
            ['Requester Role:', requisition_data.get('requester_role', 'N/A')],
            ['Request Date:', requisition_data.get('request_date', 'N/A')],
        ]

        if requisition_data.get('approved_by_name'):
            request_table_data.extend([
                ['Approved By:', requisition_data.get('approved_by_name', 'N/A')],
                ['Approval Date:', requisition_data.get('approval_date', 'N/A')]
            ])

        if requisition_data.get('assigned_by_name'):
            request_table_data.extend([
                ['Assigned By (PM):', requisition_data.get('assigned_by_name', 'N/A')],
                ['Assignment Date:', requisition_data.get('assignment_date', 'N/A')]
            ])

        request_table = Table(request_table_data, colWidths=[50*mm, 120*mm])
        request_table.setStyle(TableStyle([
            ('FONT', (0, 0), (0, -1), 'Helvetica-Bold', 9),
            ('FONT', (1, 0), (1, -1), 'Helvetica', 9),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#333333')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#fef3c7')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#f59e0b')),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(request_table)
        story.append(Spacer(1, 8*mm))

        # Labour Items Section
        if requisition_data.get('labour_items') and len(requisition_data['labour_items']) > 0:
            story.append(Paragraph("Labour Requirements", self.styles['SectionHeader']))

            for idx, item in enumerate(requisition_data['labour_items'], 1):
                labour_item_data = [
                    [f"Item {idx}", ''],
                    ['Work Description:', item.get('work_description', 'N/A')],
                    ['Skill Required:', item.get('skill_required', 'N/A')],
                    ['Workers Required:', str(item.get('workers_count', 0))]
                ]

                labour_item_table = Table(labour_item_data, colWidths=[50*mm, 120*mm])
                labour_item_table.setStyle(TableStyle([
                    ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 10),
                    ('FONT', (0, 1), (0, -1), 'Helvetica-Bold', 9),
                    ('FONT', (1, 1), (1, -1), 'Helvetica', 9),
                    ('SPAN', (0, 0), (-1, 0)),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563eb')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#333333')),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('BACKGROUND', (0, 1), (0, -1), colors.HexColor('#f3f4f6')),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
                    ('LEFTPADDING', (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ]))
                story.append(labour_item_table)
                story.append(Spacer(1, 3*mm))

            story.append(Spacer(1, 5*mm))

        # Assigned Workers Section
        if requisition_data.get('assigned_workers') and len(requisition_data['assigned_workers']) > 0:
            # Workers section header and table - keep together on same page
            workers_section = []

            workers_section.append(Paragraph("Assigned Workers", self.styles['SectionHeader']))

            # Workers table header
            workers_table_data = [
                ['#', 'Worker Code', 'Worker Name', 'Skills', 'Contact']
            ]

            # Add worker rows
            for idx, worker in enumerate(requisition_data['assigned_workers'], 1):
                # Wrap skills text to prevent overflow
                skills_list = worker.get('skills', [])
                if skills_list:
                    skills = ', '.join(skills_list)
                else:
                    skills = 'N/A'

                workers_table_data.append([
                    str(idx),
                    worker.get('worker_code', 'N/A'),
                    worker.get('full_name', 'N/A'),
                    Paragraph(skills, ParagraphStyle(
                        'SkillsCell',
                        parent=self.styles['Normal'],
                        fontSize=8,
                        fontName='Helvetica',
                        textColor=colors.HexColor('#333333'),
                        leading=10
                    )),
                    worker.get('phone', 'N/A')
                ])

            workers_table = Table(workers_table_data, colWidths=[10*mm, 25*mm, 40*mm, 60*mm, 35*mm])
            workers_table.setStyle(TableStyle([
                # Header style
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 9),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                # Data rows
                ('FONT', (0, 1), (-1, -1), 'Helvetica', 8),
                ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#333333')),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('ALIGN', (0, 0), (0, -1), 'CENTER'),  # # column center
                # Alternating row colors
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
                # Grid
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))

            workers_section.append(workers_table)

            # Keep header and table together on same page
            story.append(KeepTogether(workers_section))
            story.append(Spacer(1, 8*mm))

        # Summary
        story.append(Paragraph("Summary", self.styles['SectionHeader']))
        total_workers = len(requisition_data.get('assigned_workers', []))
        summary_text = f"""
        <b>Total Workers Assigned:</b> {total_workers}<br/>
        <b>Production Manager:</b> {requisition_data.get('assigned_by_name', 'Pending')}<br/>
        <b>WhatsApp Notifications:</b> {'Sent' if requisition_data.get('whatsapp_notified') else 'Pending'}
        """
        story.append(Paragraph(summary_text, self.styles['ReportNormal']))

        # Footer
        story.append(Spacer(1, 15*mm))
        footer_text = "<i>This is a computer-generated document. No signature is required.</i>"
        story.append(Paragraph(footer_text, self.styles['ReportSubtitle']))

        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer


# Convenience function for single requisition
def generate_assignment_pdf(requisition_data):
    """Generate PDF for a single assignment"""
    generator = LabourAssignmentPDFGenerator()
    return generator.generate_assignment_report(requisition_data)
