/**
 * BOQ PDF Export - MeterSquare Interiors LLC Corporate Template
 * Beautiful professional format matching company standards
 */

import { formatDate as formatDateLocal } from '@/utils/dateFormatter';

// Complete type definitions matching your data structure
interface BOQItem {
  id: number;
  description: string;
  briefDescription?: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  has_sub_items?: boolean;
  sub_items?: SubItem[];
  materials: Material[];
  labour: Labour[];
  laborCost: number;
  estimatedSellingPrice: number;
  miscellaneous_percentage?: number;
  miscellaneous_amount?: number;
  overheadPercentage?: number;
  overhead_percentage?: number;
  overhead_amount?: number;
  profitMarginPercentage?: number;
  profit_margin_percentage?: number;
  profit_margin_amount?: number;
  transport_percentage?: number;
  transport_amount?: number;
  discountPercentage?: number;
  vat_percentage?: number;
  vat_amount?: number;
}

interface SubItem {
  sub_item_name: string;
  scope?: string;
  size?: string;
  description?: string;
  location?: string;
  brand?: string;
  quantity: number;
  unit: string;
  rate: number;
  base_total: number;
  materials_cost: number;
  labour_cost: number;
  materials: Material[];
  labour: Labour[];
}

interface Material {
  name?: string;
  material_name?: string;
  quantity: number;
  unit: string;
  rate: number;
  amount?: number;
  total_price?: number;
  vat_percentage?: number;
}

interface Labour {
  type?: string;
  labour_role?: string;
  quantity?: number;
  hours?: number;
  unit: string;
  rate: number;
  amount?: number;
  total_cost?: number;
}

interface BOQEstimation {
  id: number;
  projectName: string;
  clientName: string;
  estimator: string;
  totalValue: number;
  itemCount: number;
  laborCost: number;
  materialCost: number;
  profitMargin: number;
  overheadPercentage: number;
  discountPercentage?: number;
  submittedDate: string;
  location: string;
  floor: string;
  workingHours: string;
  boqItems?: BOQItem[];
  preliminaries?: {
    items?: any[];
    notes?: string;
    [key: string]: any;
  };
  totalVatAmount?: number;
  overallVatPercentage?: number;
}

const formatDate = (date: string | Date) => {
  return formatDateLocal(date);
};

const formatCurrency = (amount: number) => {
  return amount.toFixed(2);
};

/**
 * Export BOQ as PDF - INTERNAL FORMAT
 * With materials, labour, profit breakdown
 */
export const exportBOQToPDFInternal = async (estimation: BOQEstimation) => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();
  let yPos = 20;

  // Calculate totals
  let totalMaterialCost = 0;
  let totalLabourCost = 0;
  let totalMisc = 0;
  let totalOverhead = 0;
  let plannedProfit = 0;
  let clientTotal = 0;

  (estimation.boqItems || []).forEach((item: any) => {
    const materialsCost = item.materials?.reduce((sum: number, m: any) => sum + (m.amount || 0), 0) || 0;
    const labourCost = item.laborCost || 0;
    const baseCost = materialsCost + labourCost;

    const misc = (item.miscellaneous_amount || 0);
    const overhead = (item.overhead_amount || (item.profit_margin_amount || 0));

    totalMaterialCost += materialsCost;
    totalLabourCost += labourCost;
    totalMisc += misc;
    totalOverhead += overhead;
    plannedProfit += overhead;
    clientTotal += item.estimatedSellingPrice || 0;
  });

  const internalCost = totalMaterialCost + totalLabourCost + totalMisc;
  const negotiableMargin = clientTotal - internalCost - plannedProfit;

  // HEADER WITH LOGO
  addLogoAndHeader(doc, yPos);
  yPos += 32;

  // PROJECT INFORMATION BOX
  addProjectInfo(doc, estimation, yPos, autoTable);
  yPos += 50;

  // PRELIMINARIES
  if (estimation.preliminaries && (estimation.preliminaries.items?.length || estimation.preliminaries.notes)) {
    yPos = addPreliminaries(doc, estimation.preliminaries, yPos, autoTable);
  }

  // BOQ ITEMS - INTERNAL VERSION
  (estimation.boqItems || []).forEach((item: any, itemIndex: number) => {
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addInternalBOQItem(doc, item, itemIndex, yPos, autoTable);
  });

  // COST ANALYSIS
  if (yPos > 240) {
    doc.addPage();
    yPos = 20;
  }

  addCostAnalysis(doc, clientTotal, internalCost, plannedProfit, negotiableMargin, yPos, autoTable);

  // Save PDF
  const fileName = `BOQ_${estimation.projectName.replace(/\s+/g, '_')}_Internal_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

/**
 * Export BOQ as PDF - CLIENT FORMAT
 * Clean version without internal breakdown
 */
export const exportBOQToPDFClient = async (estimation: BOQEstimation) => {
  const { jsPDF} = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();
  let yPos = 20;

  // HEADER WITH LOGO
  addLogoAndHeader(doc, yPos);
  yPos += 32;

  // PROJECT INFORMATION BOX
  addProjectInfo(doc, estimation, yPos, autoTable);
  yPos += 50;

  // PRELIMINARIES
  if (estimation.preliminaries && (estimation.preliminaries.items?.length || estimation.preliminaries.notes)) {
    yPos = addPreliminaries(doc, estimation.preliminaries, yPos, autoTable);
  }

  // CLIENT BOQ TITLE
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text("Client's BOQ", 105, yPos, { align: 'center' });
  yPos += 10;

  // BOQ ITEMS - CLIENT VERSION
  (estimation.boqItems || []).forEach((item: any, itemIndex: number) => {
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addClientBOQItem(doc, item, itemIndex, yPos, autoTable);
  });

  // TOTAL
  if (yPos > 260) {
    doc.addPage();
    yPos = 20;
  }

  // Calculate proper totals with discount
  let subtotal = 0;
  (estimation.boqItems || []).forEach((item: any) => {
    if (item.has_sub_items && item.sub_items && item.sub_items.length > 0) {
      item.sub_items.forEach((subItem: any) => {
        subtotal += (subItem.quantity || 0) * (subItem.rate || 0);
      });
    } else {
      subtotal += item.estimatedSellingPrice || 0;
    }
  });

  const discountAmount = (estimation as any).discount_amount || 0;
  const discountPercentage = estimation.discountPercentage || 0;
  let discount = discountAmount;
  if (discount === 0 && discountPercentage > 0) {
    discount = subtotal * (discountPercentage / 100);
  }

  addClientTotal(doc, subtotal, discount, discountPercentage, estimation.totalVatAmount || 0, yPos, autoTable);
  yPos += 25;

  // SIGNATURE SECTION
  addSignatures(doc, yPos);

  // Save PDF
  const fileName = `BOQ_${estimation.projectName.replace(/\s+/g, '_')}_Client_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function addLogoAndHeader(doc: any, yPos: number) {
  // Logo placeholder - MeterSquare style
  doc.setFillColor(30, 64, 175);
  doc.roundedRect(85, yPos, 40, 15, 2, 2, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('METER SQUARE', 105, yPos + 8, { align: 'center' });
  doc.setFontSize(8);
  doc.text('INTERIORS LLC', 105, yPos + 12, { align: 'center' });

  // Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('QUOTATION', 105, yPos + 25, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text('Bill of Quantities', 105, yPos + 32, { align: 'center' });
}

function addProjectInfo(doc: any, estimation: BOQEstimation, yPos: number, autoTable: any) {
  const projectInfoData = [
    [
      { content: 'Project Name:', styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
      { content: estimation.projectName, styles: { fillColor: [255, 255, 255] } }
    ],
    [
      { content: 'Client Name:', styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
      { content: estimation.clientName, styles: { fillColor: [255, 255, 255] } }
    ],
    [
      { content: 'Location:', styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
      { content: estimation.location, styles: { fillColor: [255, 255, 255] } }
    ],
    [
      { content: 'Quotation Date:', styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
      { content: formatDate(estimation.submittedDate), styles: { fillColor: [255, 255, 255] } }
    ]
  ];

  (autoTable as any)(doc, {
    startY: yPos,
    body: projectInfoData,
    theme: 'grid',
    styles: {
      fontSize: 10,
      cellPadding: 5,
      lineColor: [30, 64, 175],
      lineWidth: 0.5
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 132 }
    }
  });
}

function addPreliminaries(doc: any, preliminaries: any, yPos: number, autoTable: any) {
  // Modern preliminaries section with better formatting
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(245, 158, 11);
  doc.roundedRect(14, yPos, 182, 5, 1, 1, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(146, 64, 14);
  doc.text('PRELIMINARIES & APPROVAL WORKS', 16, yPos + 3.5);
  yPos += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120, 53, 15);
  doc.text('Selected conditions and terms', 16, yPos);
  yPos += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(68, 64, 60);

  if (preliminaries.items && preliminaries.items.length > 0) {
    preliminaries.items.forEach((item: any) => {
      const description = typeof item === 'string' ? item : (item.description || item.name || '');
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      doc.text('✓', 18, yPos);
      const splitText = doc.splitTextToSize(description, 175);
      doc.text(splitText, 24, yPos);
      yPos += (splitText.length * 4.5) + 2;
    });
  }

  if (preliminaries.notes) {
    yPos += 3;
    if (yPos > 265) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 53, 15);
    doc.text('Note:', 18, yPos);
    yPos += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(68, 64, 60);
    const splitNotes = doc.splitTextToSize(preliminaries.notes, 175);
    doc.text(splitNotes, 18, yPos);
    yPos += (splitNotes.length * 4.5);
  }

  return yPos + 8;
}

function addInternalBOQItem(doc: any, item: any, itemIndex: number, yPos: number, autoTable: any): number {
  const hasSubItems = item.has_sub_items && item.sub_items && item.sub_items.length > 0;

  if (hasSubItems) {
    // Process sub-items
    item.sub_items.forEach((subItem: any, subIdx: number) => {
      if (yPos > 235) {
        doc.addPage();
        yPos = 20;
      }

      const subItemData: any[] = [
        [
          { content: 'S.No', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' } },
          { content: 'Item Name', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold' } },
          { content: 'QTY', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' } },
          { content: 'UNITS', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' } },
          { content: 'UNIT PRICE(AED)', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
          { content: 'TOTAL (AED)', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
        ]
      ];

      // Main item (only on first sub-item)
      if (subIdx === 0) {
        subItemData.push([
          { content: `${itemIndex + 1}`, styles: { halign: 'center', fontStyle: 'bold' } },
          { content: item.description, styles: { fontStyle: 'bold', fontSize: 10 }, colSpan: 5 }
        ]);
      }

      // Sub-item row
      const scopeText = [subItem.scope, subItem.size].filter(Boolean).join('\n');
      const fullDescription = scopeText ? `${subItem.sub_item_name}\nScope:\n${scopeText}` : subItem.sub_item_name;

      subItemData.push([
        `${itemIndex + 1}.${subIdx + 1}`,
        { content: fullDescription, styles: { fontSize: 9 } },
        { content: subItem.quantity.toString(), styles: { halign: 'center' } },
        { content: subItem.unit, styles: { halign: 'center' } },
        { content: formatCurrency(subItem.rate || 0), styles: { halign: 'right' } },
        { content: formatCurrency((subItem.quantity || 0) * (subItem.rate || 0)), styles: { halign: 'right' } }
      ]);

      // RAW MATERIALS
      if (subItem.materials && subItem.materials.length > 0) {
        subItemData.push([
          '',
          { content: 'RAW MATERIALS', styles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold' }, colSpan: 5 }
        ]);

        subItem.materials.forEach((mat: any) => {
          subItemData.push([
            '',
            mat.name || mat.material_name,
            { content: (mat.quantity || 0).toString(), styles: { halign: 'center' } },
            { content: mat.unit || 'nos', styles: { halign: 'center' } },
            { content: formatCurrency(mat.rate || 0), styles: { halign: 'right' } },
            { content: formatCurrency(mat.amount || mat.total_price || 0), styles: { halign: 'right' } }
          ]);
        });
      }

      // LABOUR
      if (subItem.labour && subItem.labour.length > 0) {
        subItemData.push([
          '',
          { content: 'LABOUR', styles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold' }, colSpan: 5 }
        ]);

        subItem.labour.forEach((lab: any) => {
          subItemData.push([
            '',
            lab.type || lab.labour_role,
            { content: (lab.quantity || lab.hours || 0).toString(), styles: { halign: 'center' } },
            { content: lab.unit || 'Hrs', styles: { halign: 'center' } },
            { content: formatCurrency(lab.rate || 0), styles: { halign: 'right' } },
            { content: formatCurrency(lab.amount || lab.total_cost || 0), styles: { halign: 'right' } }
          ]);
        });
      }

      // Cost breakdown (Misc, Overhead) - NO TRANSPORT
      const baseCost = (subItem.materials_cost || 0) + (subItem.labour_cost || 0);
      const misc = baseCost * ((item.miscellaneous_percentage || 0) / 100);
      const overhead = baseCost * ((item.overheadPercentage || item.profit_margin_percentage || 0) / 100);
      const totalCost = baseCost + misc + overhead;

      subItemData.push([
        '',
        '',
        '',
        { content: 'Misc', styles: { halign: 'right' } },
        { content: `${item.miscellaneous_percentage || 0}%`, styles: { halign: 'right' } },
        { content: formatCurrency(misc), styles: { halign: 'right' } }
      ]);

      subItemData.push([
        '',
        '',
        '',
        { content: 'Overhead&Profit', styles: { halign: 'right' } },
        { content: `${item.overheadPercentage || item.profit_margin_percentage || 0}%`, styles: { halign: 'right' } },
        { content: formatCurrency(overhead), styles: { halign: 'right' } }
      ]);

      subItemData.push([
        '',
        '',
        '',
        '',
        { content: 'Total', styles: { fontStyle: 'bold', halign: 'right' } },
        { content: formatCurrency(totalCost), styles: { fontStyle: 'bold', halign: 'right' } }
      ]);

      // Planned profit
      subItemData.push([
        '',
        { content: 'Planned profit is taken from the 25% inputs we gave during the planning.', styles: { fontSize: 8 }, colSpan: 4 },
        { content: 'Planned profit', styles: { textColor: [0, 128, 0], halign: 'right' } },
        { content: formatCurrency(overhead), styles: { textColor: [0, 128, 0], halign: 'right' } }
      ]);

      // Actual profit
      const negotiableMargin = (subItem.quantity * subItem.rate) - totalCost;
      subItemData.push([
        '',
        { content: 'Difference between the client rate and internal expenditure planning.', styles: { fontSize: 8 }, colSpan: 4 },
        { content: 'Acutual Profit', styles: { textColor: [0, 128, 0], halign: 'right' } },
        { content: formatCurrency(negotiableMargin), styles: { textColor: [0, 128, 0], halign: 'right' } }
      ]);

      (autoTable as any)(doc, {
        startY: yPos,
        body: subItemData,
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 2,
          lineColor: [200, 200, 200],
          lineWidth: 0.3
        },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 60 },
          2: { cellWidth: 15 },
          3: { cellWidth: 25 },
          4: { cellWidth: 35 },
          5: { cellWidth: 32 }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 5;
    });
  }

  return yPos;
}

function addClientBOQItem(doc: any, item: any, itemIndex: number, yPos: number, autoTable: any): number {
  const hasSubItems = item.has_sub_items && item.sub_items && item.sub_items.length > 0;

  const clientData: any[] = [
    [
      { content: 'S.NO', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' } },
      { content: 'Item Name', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold' } },
      { content: 'QTY', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' } },
      { content: 'UNITS', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' } },
      { content: 'UNIT PRICE(AED)', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
      { content: 'TOTAL (AED)', styles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
    ]
  ];

  if (hasSubItems) {
    clientData.push([
      { content: `${itemIndex + 1}`, styles: { halign: 'center', fontStyle: 'bold' } },
      { content: item.description, styles: { fontStyle: 'bold', fontSize: 10 }, colSpan: 5 }
    ]);

    item.sub_items.forEach((subItem: any, subIdx: number) => {
      const scopeText = subItem.scope ? `\nScope:${subItem.scope}` : '';
      clientData.push([
        `${itemIndex + 1}.${subIdx + 1}`,
        { content: `${subItem.sub_item_name}${scopeText}`, styles: { fontSize: 9 } },
        { content: subItem.quantity.toString(), styles: { halign: 'center' } },
        { content: subItem.unit, styles: { halign: 'center' } },
        { content: formatCurrency(subItem.rate || 0), styles: { halign: 'right' } },
        { content: formatCurrency((subItem.quantity || 0) * (subItem.rate || 0)), styles: { halign: 'right' } }
      ]);
    });
  } else {
    clientData.push([
      { content: `${itemIndex + 1}`, styles: { halign: 'center' } },
      item.description,
      { content: item.quantity.toString(), styles: { halign: 'center' } },
      { content: item.unit, styles: { halign: 'center' } },
      { content: formatCurrency(item.rate || 0), styles: { halign: 'right' } },
      { content: formatCurrency(item.estimatedSellingPrice || 0), styles: { halign: 'right' } }
    ]);
  }

  (autoTable as any)(doc, {
    startY: yPos,
    body: clientData,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 2,
      lineColor: [200, 200, 200],
      lineWidth: 0.3
    },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 75 },
      2: { cellWidth: 15 },
      3: { cellWidth: 20 },
      4: { cellWidth: 30 },
      5: { cellWidth: 27 }
    }
  });

  return (doc as any).lastAutoTable.finalY + 5;
}

function addCostAnalysis(doc: any, clientCost: number, internalCost: number, plannedProfit: number, negotiableMargin: number, yPos: number, autoTable: any) {
  const costAnalysisData = [
    [
      { content: 'Cost analysis', styles: { fillColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' }, colSpan: 2 }
    ],
    [
      { content: 'Client Cost', styles: { fontStyle: 'bold' } },
      { content: formatCurrency(clientCost), styles: { halign: 'right', fontStyle: 'bold' } }
    ],
    [
      { content: 'Internal Cost', styles: { fontStyle: 'bold', textColor: [220, 38, 38] } },
      { content: formatCurrency(internalCost), styles: { halign: 'right', textColor: [220, 38, 38] } }
    ],
    [
      { content: `Project Margin ( Excluding planned profit of ${formatCurrency(plannedProfit)} AED)`, styles: { fontStyle: 'bold', textColor: [0, 128, 0] } },
      { content: formatCurrency(negotiableMargin), styles: { halign: 'right', fontStyle: 'bold', textColor: [0, 128, 0] } }
    ]
  ];

  (autoTable as any)(doc, {
    startY: yPos,
    body: costAnalysisData,
    theme: 'grid',
    styles: {
      fontSize: 10,
      cellPadding: 4,
      lineColor: [0, 0, 0],
      lineWidth: 0.5
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 62 }
    }
  });
}

function addClientTotal(doc: any, subtotal: number, discount: number, discountPercentage: number, vat: number, yPos: number, autoTable: any) {
  const afterDiscount = subtotal - discount;
  const grandTotal = afterDiscount + vat;

  const totalData = [
    [
      { content: 'Subtotal:', styles: { halign: 'right', fontStyle: 'bold', fontSize: 10 }, colSpan: 5 },
      { content: formatCurrency(subtotal), styles: { halign: 'right', fontStyle: 'bold', fontSize: 10 } }
    ]
  ];

  // Add discount row if discount exists
  if (discount > 0) {
    totalData.push([
      { content: `Discount (${discountPercentage.toFixed(1)}%):`, styles: { halign: 'right', fontSize: 10, textColor: [220, 38, 38] }, colSpan: 5 },
      { content: `- ${formatCurrency(discount)}`, styles: { halign: 'right', fontSize: 10, textColor: [220, 38, 38] } }
    ]);
    totalData.push([
      { content: 'After Discount:', styles: { halign: 'right', fontStyle: 'bold', fontSize: 10 }, colSpan: 5 },
      { content: formatCurrency(afterDiscount), styles: { halign: 'right', fontStyle: 'bold', fontSize: 10 } }
    ]);
  }

  // Add VAT row if VAT exists
  if (vat > 0) {
    totalData.push([
      { content: 'VAT (5%):', styles: { halign: 'right', fontSize: 10 }, colSpan: 5 },
      { content: formatCurrency(vat), styles: { halign: 'right', fontSize: 10 } }
    ]);
  }

  // Grand total
  totalData.push([
    { content: 'GRAND TOTAL:', styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, fillColor: [227, 243, 253] }, colSpan: 5 },
    { content: formatCurrency(grandTotal), styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, fillColor: [227, 243, 253] } }
  ]);

  (autoTable as any)(doc, {
    startY: yPos,
    body: totalData,
    theme: 'grid',
    styles: {
      cellPadding: 4,
      lineColor: [0, 0, 0],
      lineWidth: 0.5
    },
    columnStyles: {
      0: { cellWidth: 155 },
      1: { cellWidth: 27 }
    }
  });
}

function addSignatures(doc: any, yPos: number) {
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('For MeterSquare Interiors LLC:', 14, yPos);
  yPos += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text('Authorized Signature', 14, yPos);
  doc.line(14, yPos + 2, 70, yPos + 2);
  yPos += 7;
  doc.text('Date: __________________', 14, yPos);

  yPos += 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('Client Acceptance:', 14, yPos);
  yPos += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text('Client Signature', 14, yPos);
  doc.line(14, yPos + 2, 70, yPos + 2);
  yPos += 7;
  doc.text('Date: __________________', 14, yPos);

  yPos += 15;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('This quotation is valid for 30 days from the date of issue.', 105, yPos, { align: 'center' });
  doc.text('© 2025 MeterSquare Interiors LLC. All rights reserved.', 105, yPos + 5, { align: 'center' });
}

export default {
  exportBOQToPDFInternal,
  exportBOQToPDFClient
};
