/**
 * Payroll PDF Export - MeterSquare Interiors LLC
 * Professional payroll report generation - Clean corporate design
 */

import { PayrollProjectGroup } from '@/services/labourService';

interface PayrollPDFData {
  groupedByProject: PayrollProjectGroup[];
  period: {
    startDate: string;
    endDate: string;
  };
  totals: {
    totalPayroll: number;
    totalHours: number;
    totalWorkers: number;
    totalProjects: number;
  };
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDuration = (hours: number): string => {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} min`;
  }
  return `${hours.toFixed(1)} hrs`;
};

/**
 * Load and convert logo to base64 for PDF embedding
 */
const loadLogoBase64 = async (): Promise<string | null> => {
  try {
    const response = await fetch('/assets/logo.png');
    if (!response.ok) {
      console.warn(`Failed to load logo: ${response.status}`);
      return null;
    }
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

/**
 * Add company header with logo
 */
function addHeader(doc: any, yPos: number, logoBase64: string | null): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 14, yPos, 45, 18);
    } catch {
      addTextLogo(doc, yPos);
    }
  } else {
    addTextLogo(doc, yPos);
  }

  // Company info on the right - subtle gray text
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('MeterSquare Interiors LLC', pageWidth - 14, yPos + 6, { align: 'right' });
  doc.text('Dubai, United Arab Emirates', pageWidth - 14, yPos + 11, { align: 'right' });
  doc.text('www.metersquare.ae', pageWidth - 14, yPos + 16, { align: 'right' });

  return yPos + 25;
}

function addTextLogo(doc: any, yPos: number) {
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('METER SQUARE', 14, yPos + 10);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('INTERIORS LLC', 14, yPos + 15);
}

/**
 * Add report title section
 */
function addTitle(doc: any, yPos: number, period: { startDate: string; endDate: string }): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Separator line
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(14, yPos, pageWidth - 14, yPos);

  yPos += 12;

  // Title - black, professional
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('PAYROLL REPORT', pageWidth / 2, yPos, { align: 'center' });

  yPos += 8;

  // Period - gray subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Period: ${formatDate(period.startDate)} - ${formatDate(period.endDate)}`, pageWidth / 2, yPos, { align: 'center' });

  yPos += 6;

  // Generated date
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, pageWidth / 2, yPos, { align: 'center' });

  return yPos + 10;
}

/**
 * Add summary statistics
 */
function addSummaryBox(doc: any, yPos: number, totals: PayrollPDFData['totals'], autoTable: any): number {
  const summaryData: any[] = [
    [
      { content: 'Total Projects', styles: { fontStyle: 'bold', halign: 'center' } },
      { content: 'Total Workers', styles: { fontStyle: 'bold', halign: 'center' } },
      { content: 'Total Hours', styles: { fontStyle: 'bold', halign: 'center' } },
      { content: 'Total Payroll', styles: { fontStyle: 'bold', halign: 'center' } }
    ],
    [
      { content: totals.totalProjects.toString(), styles: { halign: 'center', fontSize: 11 } },
      { content: totals.totalWorkers.toString(), styles: { halign: 'center', fontSize: 11 } },
      { content: formatDuration(totals.totalHours), styles: { halign: 'center', fontSize: 11 } },
      { content: `AED ${formatCurrency(totals.totalPayroll)}`, styles: { halign: 'center', fontSize: 11, fontStyle: 'bold' } }
    ]
  ];

  (autoTable as any)(doc, {
    startY: yPos,
    body: summaryData,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 6,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0]
    },
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.2
  });

  return (doc as any).lastAutoTable.finalY + 12;
}

/**
 * Add project section with workers table
 */
function addProjectSection(
  doc: any,
  project: PayrollProjectGroup,
  projectIndex: number,
  yPos: number,
  autoTable: any
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Check if we need a new page
  if (yPos > pageHeight - 70) {
    doc.addPage();
    yPos = 25;
  }

  // Project header - simple black text with line
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`${projectIndex + 1}. ${project.project_name}`, 14, yPos);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`${project.project_code} | ${project.worker_count} worker${project.worker_count !== 1 ? 's' : ''}`, 14, yPos + 5);

  // Project total on the right
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`AED ${formatCurrency(project.total_cost)}`, pageWidth - 14, yPos, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(formatDuration(project.total_hours), pageWidth - 14, yPos + 5, { align: 'right' });

  // Underline for project header
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(14, yPos + 8, pageWidth - 14, yPos + 8);

  yPos += 14;

  // Workers table - clean black and white design
  const tableData: any[] = [
    [
      { content: '#', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'center' } },
      { content: 'Worker', styles: { fillColor: [245, 245, 245], fontStyle: 'bold' } },
      { content: 'Days', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'center' } },
      { content: 'Regular', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'center' } },
      { content: 'Overtime', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'center' } },
      { content: 'Total Hrs', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'center' } },
      { content: 'Rate/Hr', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'right' } },
      { content: 'Amount (AED)', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'right' } }
    ]
  ];

  // NEW: Iterate through requisitions and their workers
  let workerIndex = 0;
  if (project.requisitions && project.requisitions.length > 0) {
    project.requisitions.forEach((requisition) => {
      // Add requisition header row
      tableData.push([
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: `${requisition.requisition_code} - ${requisition.work_description}`, styles: { fillColor: [235, 240, 255], fontStyle: 'bold', fontSize: 8 } },
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: '', styles: { fillColor: [235, 240, 255] } }
      ]);

      requisition.workers.forEach((worker) => {
        workerIndex++;
        tableData.push([
          { content: workerIndex.toString(), styles: { halign: 'center' } },
          { content: `${worker.worker_name}\n${worker.worker_code}`, styles: { fontSize: 8 } },
          { content: worker.total_days.toString(), styles: { halign: 'center' } },
          { content: formatDuration(worker.total_regular_hours), styles: { halign: 'center' } },
          { content: worker.total_overtime_hours > 0 ? formatDuration(worker.total_overtime_hours) : '-', styles: { halign: 'center' } },
          { content: formatDuration(worker.total_hours), styles: { halign: 'center' } },
          { content: worker.average_hourly_rate.toFixed(2), styles: { halign: 'right' } },
          { content: formatCurrency(worker.total_cost), styles: { halign: 'right' } }
        ]);
      });
    });
  }

  // Subtotal row
  tableData.push([
    { content: '', styles: { fillColor: [250, 250, 250] } },
    { content: 'Subtotal', styles: { fillColor: [250, 250, 250], fontStyle: 'bold' } },
    { content: project.total_days.toString(), styles: { fillColor: [250, 250, 250], halign: 'center', fontStyle: 'bold' } },
    { content: formatDuration(project.total_regular_hours), styles: { fillColor: [250, 250, 250], halign: 'center' } },
    { content: project.total_overtime_hours > 0 ? formatDuration(project.total_overtime_hours) : '-', styles: { fillColor: [250, 250, 250], halign: 'center' } },
    { content: formatDuration(project.total_hours), styles: { fillColor: [250, 250, 250], halign: 'center', fontStyle: 'bold' } },
    { content: '', styles: { fillColor: [250, 250, 250] } },
    { content: formatCurrency(project.total_cost), styles: { fillColor: [250, 250, 250], halign: 'right', fontStyle: 'bold' } }
  ]);

  (autoTable as any)(doc, {
    startY: yPos,
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineColor: [200, 200, 200],
      lineWidth: 0.2,
      textColor: [0, 0, 0]
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 45 },
      2: { cellWidth: 18 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22 },
      5: { cellWidth: 22 },
      6: { cellWidth: 20 },
      7: { cellWidth: 27 }
    }
  });

  return (doc as any).lastAutoTable.finalY + 10;
}

/**
 * Add grand total section
 */
function addGrandTotal(doc: any, yPos: number, totals: PayrollPDFData['totals'], autoTable: any): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Check if we need a new page
  if (yPos > pageHeight - 35) {
    doc.addPage();
    yPos = 25;
  }

  // Double line above grand total
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(14, yPos, pageWidth - 14, yPos);
  doc.line(14, yPos + 1.5, pageWidth - 14, yPos + 1.5);

  yPos += 8;

  // Grand total table
  const grandTotalData: any[] = [
    [
      { content: 'GRAND TOTAL', styles: { fontStyle: 'bold', fontSize: 11 } },
      { content: `${totals.totalProjects} Project${totals.totalProjects !== 1 ? 's' : ''}`, styles: { halign: 'center' } },
      { content: `${totals.totalWorkers} Worker${totals.totalWorkers !== 1 ? 's' : ''}`, styles: { halign: 'center' } },
      { content: formatDuration(totals.totalHours), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: `AED ${formatCurrency(totals.totalPayroll)}`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 11 } }
    ]
  ];

  (autoTable as any)(doc, {
    startY: yPos,
    body: grandTotalData,
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: 5,
      textColor: [0, 0, 0]
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 35 },
      2: { cellWidth: 35 },
      3: { cellWidth: 30 },
      4: { cellWidth: 36 }
    }
  });

  return (doc as any).lastAutoTable.finalY + 5;
}

/**
 * Add footer to each page
 */
function addFooter(doc: any) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer line
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);

    // Footer text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('MeterSquare Interiors LLC - Payroll Report', 14, pageHeight - 10);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
  }
}

/**
 * Export complete payroll data to PDF (all projects)
 */
export const exportPayrollToPDF = async (data: PayrollPDFData): Promise<void> => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();
  let yPos = 15;

  // Load logo
  const logoBase64 = await loadLogoBase64();

  // Header with logo
  yPos = addHeader(doc, yPos, logoBase64);

  // Title and period
  yPos = addTitle(doc, yPos, data.period);

  // Summary box
  yPos = addSummaryBox(doc, yPos, data.totals, autoTable);

  // Project sections
  data.groupedByProject.forEach((project, index) => {
    yPos = addProjectSection(doc, project, index, yPos, autoTable);
  });

  // Grand total
  addGrandTotal(doc, yPos, data.totals, autoTable);

  // Add footer to all pages
  addFooter(doc);

  // Save PDF
  const fileName = `Payroll_Report_${data.period.startDate}_to_${data.period.endDate}.pdf`;
  doc.save(fileName);
};

/**
 * Export single project payroll to PDF
 */
export const exportProjectPayrollToPDF = async (
  project: PayrollProjectGroup,
  period: { startDate: string; endDate: string }
): Promise<void> => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();
  let yPos = 15;

  // Load logo
  const logoBase64 = await loadLogoBase64();

  // Header with logo
  yPos = addHeader(doc, yPos, logoBase64);

  // Title - Project specific
  const pageWidth = doc.internal.pageSize.getWidth();

  // Separator line
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(14, yPos, pageWidth - 14, yPos);

  yPos += 12;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('PROJECT PAYROLL REPORT', pageWidth / 2, yPos, { align: 'center' });

  yPos += 8;

  // Project name
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(project.project_name, pageWidth / 2, yPos, { align: 'center' });

  yPos += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`${project.project_code} | ${project.worker_count} worker${project.worker_count !== 1 ? 's' : ''}`, pageWidth / 2, yPos, { align: 'center' });

  yPos += 6;

  // Period
  doc.setFontSize(9);
  doc.text(`Period: ${formatDate(period.startDate)} - ${formatDate(period.endDate)}`, pageWidth / 2, yPos, { align: 'center' });

  yPos += 5;

  // Generated date
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, pageWidth / 2, yPos, { align: 'center' });

  yPos += 10;

  // Workers table (directly, no summary card needed for single project)
  const tableData: any[] = [
    [
      { content: '#', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'center' } },
      { content: 'Worker', styles: { fillColor: [245, 245, 245], fontStyle: 'bold' } },
      { content: 'Days', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'center' } },
      { content: 'Regular', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'center' } },
      { content: 'Overtime', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'center' } },
      { content: 'Total Hrs', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'center' } },
      { content: 'Rate/Hr', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'right' } },
      { content: 'Amount (AED)', styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'right' } }
    ]
  ];

  // NEW: Iterate through requisitions and their workers
  let workerIndex = 0;
  if (project.requisitions && project.requisitions.length > 0) {
    project.requisitions.forEach((requisition) => {
      // Add requisition header row
      tableData.push([
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: `${requisition.requisition_code} - ${requisition.work_description}`, styles: { fillColor: [235, 240, 255], fontStyle: 'bold', fontSize: 8 } },
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: '', styles: { fillColor: [235, 240, 255] } },
        { content: '', styles: { fillColor: [235, 240, 255] } }
      ]);

      requisition.workers.forEach((worker) => {
        workerIndex++;
        tableData.push([
          { content: workerIndex.toString(), styles: { halign: 'center' } },
          { content: `${worker.worker_name}\n${worker.worker_code}`, styles: { fontSize: 8 } },
          { content: worker.total_days.toString(), styles: { halign: 'center' } },
          { content: formatDuration(worker.total_regular_hours), styles: { halign: 'center' } },
          { content: worker.total_overtime_hours > 0 ? formatDuration(worker.total_overtime_hours) : '-', styles: { halign: 'center' } },
          { content: formatDuration(worker.total_hours), styles: { halign: 'center' } },
          { content: worker.average_hourly_rate.toFixed(2), styles: { halign: 'right' } },
          { content: formatCurrency(worker.total_cost), styles: { halign: 'right' } }
        ]);
      });
    });
  }

  // Total row
  tableData.push([
    { content: '', styles: { fillColor: [240, 240, 240] } },
    { content: 'TOTAL', styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
    { content: project.total_days.toString(), styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } },
    { content: formatDuration(project.total_regular_hours), styles: { fillColor: [240, 240, 240], halign: 'center' } },
    { content: project.total_overtime_hours > 0 ? formatDuration(project.total_overtime_hours) : '-', styles: { fillColor: [240, 240, 240], halign: 'center' } },
    { content: formatDuration(project.total_hours), styles: { fillColor: [240, 240, 240], halign: 'center', fontStyle: 'bold' } },
    { content: '', styles: { fillColor: [240, 240, 240] } },
    { content: formatCurrency(project.total_cost), styles: { fillColor: [240, 240, 240], halign: 'right', fontStyle: 'bold' } }
  ]);

  (autoTable as any)(doc, {
    startY: yPos,
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 4,
      lineColor: [200, 200, 200],
      lineWidth: 0.2,
      textColor: [0, 0, 0]
    },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 45 },
      2: { cellWidth: 18 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22 },
      5: { cellWidth: 22 },
      6: { cellWidth: 20 },
      7: { cellWidth: 25 }
    }
  });

  // Add footer
  addFooter(doc);

  // Save PDF
  const safeProjectName = project.project_name.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Payroll_${safeProjectName}_${period.startDate}_to_${period.endDate}.pdf`;
  doc.save(fileName);
};

export default {
  exportPayrollToPDF,
  exportProjectPayrollToPDF
};
