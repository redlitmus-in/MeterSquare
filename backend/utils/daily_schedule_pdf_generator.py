"""
Daily Worker Assignment Schedule PDF Generator
Generates large-format poster PDF for hostel wall display showing all worker assignments for a specific date.
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


class DailySchedulePDFGenerator:
    """Daily Worker Assignment Schedule PDF Generator - Poster format for hostel wall"""

    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_styles()
        self.page_width, self.page_height = A4

    def _setup_styles(self):
        """Setup professional styles optimized for wall poster readability"""
        # Large title for poster
        self.styles.add(ParagraphStyle(
            name='PosterTitle',
            parent=self.styles['Normal'],
            fontSize=24,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a'),
            alignment=TA_CENTER,
            spaceBefore=2,
            spaceAfter=30
        ))

        # Subtitle
        self.styles.add(ParagraphStyle(
            name='PosterSubtitle',
            parent=self.styles['Normal'],
            fontSize=16,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#dc2626'),
            alignment=TA_CENTER,
            spaceAfter=6
        ))

        # Project header
        self.styles.add(ParagraphStyle(
            name='ProjectHeader',
            parent=self.styles['Normal'],
            fontSize=14,
            fontName='Helvetica-Bold',
            textColor=colors.white,
            alignment=TA_LEFT,
            leading=16
        ))

        # Section label (bold)
        self.styles.add(ParagraphStyle(
            name='SectionBold',
            parent=self.styles['Normal'],
            fontSize=10,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a')
        ))

        # Normal text
        self.styles.add(ParagraphStyle(
            name='PosterNormal',
            parent=self.styles['Normal'],
            fontSize=10,
            fontName='Helvetica',
            textColor=colors.HexColor('#333333'),
            leading=13
        ))

        # Worker name style (larger for visibility)
        self.styles.add(ParagraphStyle(
            name='WorkerName',
            parent=self.styles['Normal'],
            fontSize=11,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a')
        ))

    def _draw_header(self, canvas, doc, schedule_data, logo_path):
        """Draw header on each page"""
        canvas.saveState()

        # Company Header with Logo
        if logo_path and os.path.exists(logo_path):
            # Draw logo
            canvas.drawImage(logo_path, 15*mm, self.page_height - 20*mm, width=35*mm, height=12*mm, preserveAspectRatio=True)

            # Draw company name and location
            canvas.setFont('Helvetica-Bold', 13)
            canvas.drawRightString(self.page_width - 15*mm, self.page_height - 12*mm, 'METERSQUARE INTERIORS LLC')
            canvas.setFont('Helvetica', 10)
            canvas.drawRightString(self.page_width - 15*mm, self.page_height - 18*mm, 'Business Bay, Dubai, UAE')
        else:
            # Draw company name without logo
            canvas.setFont('Helvetica-Bold', 16)
            canvas.drawCentredString(self.page_width / 2, self.page_height - 15*mm, 'METERSQUARE INTERIORS LLC')

        # Draw red divider line
        canvas.setStrokeColor(colors.HexColor('#dc2626'))
        canvas.setLineWidth(2)
        canvas.line(15*mm, self.page_height - 24*mm, self.page_width - 15*mm, self.page_height - 24*mm)

        # Draw title and date on first page only
        if canvas.getPageNumber() == 1:
            canvas.setFont('Helvetica-Bold', 20)
            canvas.setFillColor(colors.HexColor('#1a1a1a'))
            canvas.drawCentredString(self.page_width / 2, self.page_height - 38*mm, 'DAILY WORKER ASSIGNMENT SCHEDULE')

            canvas.setFont('Helvetica-Bold', 14)
            canvas.setFillColor(colors.HexColor('#dc2626'))
            canvas.drawCentredString(self.page_width / 2, self.page_height - 46*mm, schedule_data['date'])

        canvas.restoreState()

    def generate_daily_schedule(self, schedule_data):
        """
        Generate a daily worker assignment schedule poster PDF

        Args:
            schedule_data: Dictionary containing:
                - date: formatted date string (e.g., "January 15, 2026")
                - date_short: short format date (e.g., "15-Jan-2026")
                - projects: list of projects with requisitions and assigned workers
                - total_projects: number of projects
                - total_workers: total number of workers

        Returns:
            BytesIO: PDF file buffer
        """
        # Find logo path
        logo_path = None
        possible_logo_paths = [
            os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'logo.png'),
            os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logo.png'),
        ]
        for path in possible_logo_paths:
            if os.path.exists(path):
                logo_path = path
                break

        buffer = BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=15*mm,
            leftMargin=15*mm,
            topMargin=52*mm,  # Increased to accommodate header
            bottomMargin=12*mm
        )

        # Build PDF content
        story = []

        # Summary info (header content now drawn via callback)
        summary_text = f"<b>{schedule_data['total_workers']} Workers</b> assigned to <b>{schedule_data['total_projects']} Projects</b>"
        story.append(Paragraph(summary_text, ParagraphStyle(
            'SummaryInfo',
            parent=self.styles['Normal'],
            fontSize=11,
            fontName='Helvetica',
            textColor=colors.HexColor('#666666'),
            alignment=TA_CENTER,
            spaceAfter=6
        )))

        story.append(Spacer(1, 4*mm))

        # Loop through each project
        for idx, project in enumerate(schedule_data['projects']):
            # Project Header Box
            project_header_data = [[
                Paragraph(f"PROJECT: {project['project_name'].upper()}", self.styles['ProjectHeader'])
            ]]
            project_header_table = Table(project_header_data, colWidths=[180*mm], hAlign='CENTER')
            project_header_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#243d8a')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))

            # Process each requisition under this project
            for req in project['requisitions']:
                # Project details table (site, time, transport)
                details_data = []

                # Site/Location
                details_data.append([
                    Paragraph('<b>Site/Location:</b>', self.styles['SectionBold']),
                    Paragraph(req['site_name'], self.styles['PosterNormal'])
                ])

                # Work Time
                work_time = f"{req['start_time']} - {req['end_time']}"
                details_data.append([
                    Paragraph('<b>Work Time:</b>', self.styles['SectionBold']),
                    Paragraph(work_time, self.styles['PosterNormal'])
                ])

                # Transport Details (if available)
                has_transport = (
                    req['driver_name'] != 'N/A' or
                    req['vehicle_number'] != 'N/A'
                )

                if has_transport:
                    transport_info = f"{req['vehicle_number']} / {req['driver_name']}"
                    if req['driver_contact'] != 'N/A':
                        transport_info += f" / {req['driver_contact']}"

                    details_data.append([
                        Paragraph('<b>Transport:</b>', self.styles['SectionBold']),
                        Paragraph(transport_info, self.styles['PosterNormal'])
                    ])

                details_table = Table(details_data, colWidths=[35*mm, 145*mm], hAlign='CENTER')
                details_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f3f4f6')),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING', (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ]))

                # Keep header + details together (small, should not split)
                header_details_group = [project_header_table, details_table]
                story.append(KeepTogether(header_details_group))

                # Minimal spacing between details and workers table
                story.append(Spacer(1, 2*mm))

                # Workers table (can split across pages if needed)
                if req['assigned_workers']:
                    workers_table_data = [
                        ['#', 'EMP CODE', 'WORKER NAME', 'SKILL/TRADE']
                    ]

                    for worker_idx, worker in enumerate(req['assigned_workers'], 1):
                        skills_list = worker.get('skills', [])
                        skills_str = ', '.join(skills_list) if skills_list else 'Worker'

                        # Wrap skill text in Paragraph for proper wrapping
                        skills_paragraph = Paragraph(
                            skills_str,
                            ParagraphStyle(
                                'SkillText',
                                parent=self.styles['Normal'],
                                fontSize=9,
                                fontName='Helvetica',
                                leading=11
                            )
                        )

                        workers_table_data.append([
                            str(worker_idx),
                            worker['worker_code'],
                            worker['full_name'],
                            skills_paragraph
                        ])

                    workers_table = Table(workers_table_data, colWidths=[10*mm, 25*mm, 70*mm, 75*mm], hAlign='CENTER')
                    workers_table.setStyle(TableStyle([
                        # Header style
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 9),
                        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                        # Data rows
                        ('FONT', (0, 1), (-1, -1), 'Helvetica', 9),
                        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1a1a1a')),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # # column
                        ('ALIGN', (1, 1), (1, -1), 'CENTER'),  # EMP CODE column
                        ('ALIGN', (2, 1), (2, -1), 'CENTER'),  # NAME column - centered
                        ('ALIGN', (3, 1), (3, -1), 'LEFT'),    # SKILL column
                        # Alternating row colors
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
                        # Grid
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
                        ('LEFTPADDING', (0, 0), (-1, -1), 4),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                        ('TOPPADDING', (0, 0), (-1, -1), 5),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ]))
                    story.append(workers_table)
                else:
                    # No workers assigned message
                    no_workers_msg = Paragraph(
                        "<i>No workers assigned to this requisition</i>",
                        ParagraphStyle(
                            'NoWorkers',
                            parent=self.styles['Normal'],
                            fontSize=10,
                            fontName='Helvetica-Oblique',
                            textColor=colors.HexColor('#9ca3af'),
                            alignment=TA_CENTER
                        )
                    )
                    story.append(no_workers_msg)

            # Add spacing between projects (except after last project)
            # Reduced spacing - page breaks provide natural separation
            if idx < len(schedule_data['projects']) - 1:
                story.append(Spacer(1, 8*mm))

        # Footer
        story.append(Spacer(1, 10*mm))
        footer_text = f"<i>Generated on {datetime.now().strftime('%d-%b-%Y at %I:%M %p')} | For hostel display | MeterSquare Labour Management</i>"
        story.append(Paragraph(footer_text, ParagraphStyle(
            'Footer',
            parent=self.styles['Normal'],
            fontSize=8,
            fontName='Helvetica-Oblique',
            textColor=colors.HexColor('#9ca3af'),
            alignment=TA_CENTER
        )))

        # Build PDF with page callback
        def add_page_number_and_header(canvas, doc):
            self._draw_header(canvas, doc, schedule_data, logo_path)

        doc.build(story, onFirstPage=add_page_number_and_header, onLaterPages=add_page_number_and_header)
        buffer.seek(0)
        return buffer


# Convenience function
def generate_daily_schedule_pdf(schedule_data):
    """Generate daily schedule PDF"""
    generator = DailySchedulePDFGenerator()
    return generator.generate_daily_schedule(schedule_data)
