// Lazy load heavy libraries only when needed
import { saveAs } from 'file-saver';
import { Purchase, Material } from '@/roles/procurement/services/procurementService';
import { formatDate as formatDateLocal, formatDateTimeLocal } from '@/utils/dateFormatter';

// Extend jsPDF type for autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: {
      finalY: number;
    };
  }
}

// Format date for display - uses local timezone
const formatDate = (date: string | Date) => {
  return formatDateLocal(date);
};

// Format currency
const formatCurrency = (amount: number) => {
  return `AED ${amount.toLocaleString()}`;
};

// Export as PDF - Load jsPDF only when needed
export const exportToPDF = async (purchases: Purchase[], title: string = 'Purchase Requisitions Report') => {
  // Dynamically import jsPDF to reduce initial bundle size
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();
  
  // Add header
  doc.setFontSize(20);
  doc.setTextColor(220, 53, 69); // Red color
  doc.text(title, 14, 20);
  
  // Add generation date
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on: ${formatDate(new Date())}`, 14, 30);
  
  // Add summary statistics
  const totalPurchases = purchases.length;
  const totalValue = purchases.reduce((sum, p) => {
    const purchaseTotal = p.materials?.reduce((s, m) => s + (m.quantity * m.cost), 0) || 0;
    return sum + purchaseTotal;
  }, 0);
  
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(`Total Purchase Requests: ${totalPurchases}`, 14, 40);
  doc.text(`Total Value: ${formatCurrency(totalValue)}`, 14, 47);
  
  // Prepare table data
  const tableData = purchases.map(purchase => {
    const total = purchase.materials?.reduce((sum, m) => sum + (m.quantity * m.cost), 0) || 0;
    return [
      `PR-${purchase.purchase_id}`,
      formatDate(purchase.date || purchase.created_at),
      purchase.project_id,
      purchase.requested_by,
      purchase.site_location,
      purchase.purpose?.substring(0, 30) + (purchase.purpose?.length > 30 ? '...' : ''),
      formatCurrency(total),
      (purchase.status || purchase.latest_status || 'pending').toUpperCase(),
      purchase.email_sent ? 'Yes' : 'No'
    ];
  });
  
  // Add table
  autoTable(doc, {
    startY: 55,
    head: [['PR ID', 'Date', 'Project', 'Requested By', 'Location', 'Purpose', 'Total Amount', 'Status', 'Email Sent']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [220, 53, 69],
      textColor: 255,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle'
    },
    bodyStyles: {
      fontSize: 8,
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' }, // PR ID
      1: { cellWidth: 22, halign: 'center' }, // Date
      2: { cellWidth: 20, halign: 'left' },   // Project
      3: { cellWidth: 25, halign: 'left' },   // Requested By
      4: { cellWidth: 22, halign: 'left' },   // Location
      5: { cellWidth: 30, halign: 'left' },   // Purpose
      6: { cellWidth: 22, halign: 'right' },  // Total Amount
      7: { cellWidth: 18, halign: 'center' }, // Status
      8: { cellWidth: 15, halign: 'center' }  // Email Sent
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    },
    margin: { top: 10, left: 10, right: 10 },
    tableWidth: 'auto',
    styles: {
      overflow: 'linebreak',
      cellPadding: 2
    }
  });
  
  // Add footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
  
  // Save the PDF
  doc.save(`procurement_report_${new Date().toISOString().split('T')[0]}.pdf`);
};

// Export as Excel - Load XLSX only when needed
export const exportToExcel = async (purchases: Purchase[], title: string = 'Purchase Requisitions') => {
  // Dynamically import XLSX to reduce initial bundle size
  const XLSX = await import('xlsx');
  // Prepare main sheet data
  const mainData = purchases.map(purchase => {
    const total = purchase.materials?.reduce((sum, m) => sum + (m.quantity * m.cost), 0) || 0;
    return {
      'PR ID': `PR-${purchase.purchase_id}`,
      'Date': formatDate(purchase.date || purchase.created_at),
      'Project ID': purchase.project_id,
      'Requested By': purchase.requested_by,
      'Created By': purchase.created_by,
      'Site Location': purchase.site_location,
      'Purpose': purchase.purpose,
      'Total Amount (AED)': total,
      'Status': (purchase.status || purchase.latest_status || 'pending').toUpperCase(),
      'Email Sent': purchase.email_sent ? 'Yes' : 'No',
      'Materials Count': purchase.materials?.length || 0
    };
  });
  
  // Prepare materials sheet data
  const materialsData: any[] = [];
  purchases.forEach(purchase => {
    purchase.materials?.forEach(material => {
      materialsData.push({
        'PR ID': `PR-${purchase.purchase_id}`,
        'Material ID': material.material_id,
        'Description': material.description,
        'Category': material.category,
        'Specification': material.specification,
        'Quantity': material.quantity,
        'Unit': material.unit,
        'Unit Cost (AED)': material.cost,
        'Total Cost (AED)': material.quantity * material.cost,
        'Priority': material.priority || 'Normal',
        'Design Reference': material.design_reference || ''
      });
    });
  });
  
  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // Add main purchases sheet
  const ws1 = XLSX.utils.json_to_sheet(mainData);
  XLSX.utils.book_append_sheet(wb, ws1, 'Purchase Requests');
  
  // Add materials sheet
  if (materialsData.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(materialsData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Materials');
  }
  
  // Add summary sheet
  const summaryData = [
    { 'Metric': 'Total Purchase Requests', 'Value': purchases.length },
    { 'Metric': 'Total Value (AED)', 'Value': purchases.reduce((sum, p) => {
      const total = p.materials?.reduce((s, m) => s + (m.quantity * m.cost), 0) || 0;
      return sum + total;
    }, 0) },
    { 'Metric': 'Pending Requests', 'Value': purchases.filter(p => !p.latest_status || p.latest_status === 'pending').length },
    { 'Metric': 'Approved Requests', 'Value': purchases.filter(p => p.latest_status === 'approved').length },
    { 'Metric': 'Rejected Requests', 'Value': purchases.filter(p => p.latest_status === 'rejected').length },
    { 'Metric': 'Report Generated', 'Value': formatDateTimeLocal(new Date()) }
  ];
  const ws3 = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, ws3, 'Summary');
  
  // Generate Excel file
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(data, `procurement_report_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// Export as CSV
export const exportToCSV = (purchases: Purchase[]) => {
  // Prepare CSV data
  const csvData: string[] = [];
  
  // Add header
  csvData.push('PR ID,Date,Project ID,Requested By,Created By,Site Location,Purpose,Total Amount (AED),Status,Email Sent,Materials Count');
  
  // Add data rows
  purchases.forEach(purchase => {
    const total = purchase.materials?.reduce((sum, m) => sum + (m.quantity * m.cost), 0) || 0;
    const row = [
      `PR-${purchase.purchase_id}`,
      formatDate(purchase.date || purchase.created_at),
      purchase.project_id,
      `"${purchase.requested_by}"`,
      `"${purchase.created_by}"`,
      `"${purchase.site_location}"`,
      `"${purchase.purpose?.replace(/"/g, '""') || ''}"`,
      total,
      (purchase.status || purchase.latest_status || 'pending').toUpperCase(),
      purchase.email_sent ? 'Yes' : 'No',
      purchase.materials?.length || 0
    ].join(',');
    csvData.push(row);
  });
  
  // Create CSV file
  const csvContent = csvData.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `procurement_report_${new Date().toISOString().split('T')[0]}.csv`);
};

// Export single purchase details as PDF - Load jsPDF only when needed
export const exportPurchaseDetailsPDF = async (purchase: Purchase, latestStatus?: any) => {
  // Dynamically import jsPDF to reduce initial bundle size
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(18);
  doc.setTextColor(220, 53, 69);
  doc.text(`Purchase Request PR-${purchase.purchase_id}`, 14, 20);
  
  // Status badge
  const status = (purchase.status || purchase.latest_status || 'pending').toUpperCase();
  doc.setFontSize(10);
  if (status === 'APPROVED') {
    doc.setTextColor(34, 197, 94);
  } else if (status === 'REJECTED') {
    doc.setTextColor(239, 68, 68);
  } else {
    doc.setTextColor(250, 204, 21);
  }
  doc.text(`Status: ${status}`, 160, 20);
  
  // Basic Information Section
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text('Basic Information', 14, 35);
  
  doc.setFontSize(10);
  doc.setTextColor(60);
  let yPos = 45;
  
  const basicInfo = [
    ['Project ID:', purchase.project_id],
    ['Requested By:', purchase.requested_by],
    ['Created By:', purchase.created_by],
    ['Site Location:', purchase.site_location],
    ['Date:', formatDate(purchase.date || purchase.created_at)],
    ['Purpose:', purchase.purpose || 'N/A'],
    ['Email Sent:', purchase.email_sent ? 'Yes' : 'No']
  ];
  
  basicInfo.forEach(([label, value]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, 14, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(String(value), 50, yPos);
    yPos += 7;
  });
  
  // Materials Section
  if (purchase.materials && purchase.materials.length > 0) {
    yPos += 10;
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Materials', 14, yPos);
    yPos += 10;
    
    const materialData = purchase.materials.map((m, idx) => [
      idx + 1,
      m.description,
      m.category,
      m.specification,
      `${m.quantity} ${m.unit}`,
      formatCurrency(m.cost),
      formatCurrency(m.quantity * m.cost)
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Description', 'Category', 'Specification', 'Quantity', 'Unit Cost', 'Total']],
      body: materialData,
      theme: 'striped',
      headStyles: {
        fillColor: [220, 53, 69],
        textColor: 255,
        fontSize: 9,
        halign: 'center',
        valign: 'middle'
      },
      bodyStyles: {
        fontSize: 8,
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },  // #
        1: { cellWidth: 40, halign: 'left' },    // Description
        2: { cellWidth: 25, halign: 'left' },    // Category
        3: { cellWidth: 35, halign: 'left' },    // Specification
        4: { cellWidth: 20, halign: 'center' },  // Quantity
        5: { cellWidth: 25, halign: 'right' },   // Unit Cost
        6: { cellWidth: 25, halign: 'right' }    // Total
      },
      margin: { left: 14, right: 14 },
      tableWidth: 'auto',
      styles: {
        overflow: 'linebreak',
        cellPadding: 2
      }
    });
    
    // Total
    const total = purchase.materials.reduce((sum, m) => sum + (m.quantity * m.cost), 0);
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total Amount: ${formatCurrency(total)}`, 14, yPos);
  }
  
  // Latest Status Section (if available)
  if (latestStatus) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Latest Status Information', 14, 20);
    
    yPos = 30;
    doc.setFontSize(10);
    doc.setTextColor(60);
    
    const statusInfo = [
      ['Status:', latestStatus.status?.toUpperCase() || 'N/A'],
      ['Role:', latestStatus.role || 'N/A'],
      ['Decision By:', latestStatus.created_by || 'N/A'],
      ['Decision Date:', latestStatus.decision_date ? formatDate(latestStatus.decision_date) : 'N/A'],
      ['Sender:', latestStatus.sender || 'N/A'],
      ['Receiver:', latestStatus.receiver || 'N/A'],
      ['Comments:', latestStatus.comments || 'N/A']
    ];
    
    statusInfo.forEach(([label, value]) => {
      doc.setFont(undefined, 'bold');
      doc.text(label, 14, yPos);
      doc.setFont(undefined, 'normal');
      
      // Handle long text wrapping for comments
      if (label === 'Comments:' && value.length > 50) {
        const lines = doc.splitTextToSize(String(value), 140);
        doc.text(lines, 50, yPos);
        yPos += lines.length * 5;
      } else {
        doc.text(String(value), 50, yPos);
        yPos += 7;
      }
    });
  }
  
  // Save
  doc.save(`PR_${purchase.purchase_id}_details_${new Date().toISOString().split('T')[0]}.pdf`);
};