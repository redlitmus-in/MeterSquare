import { saveAs } from 'file-saver';
import { formatDate as formatDateLocal } from '@/utils/dateFormatter';

// Extend jsPDF type for autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: {
      finalY: number;
    };
  }
}

interface BOQItem {
  id: number;
  description: string;
  briefDescription?: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  materials: {
    name: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }[];
  labour: {
    type: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }[];
  laborCost: number;
  estimatedSellingPrice: number;
  overheadPercentage?: number;
  profitMarginPercentage?: number;
  discountPercentage?: number;
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
}

const formatDate = (date: string | Date) => {
  return formatDateLocal(date);
};

const formatCurrency = (amount: number) => {
  return amount;
};

/**
 * Export BOQ as Excel - Internal Format (WITH Overhead & Profit)
 * Single sheet with ALL details exactly like UI
 */
export const exportBOQToExcelInternal = async (estimation: BOQEstimation) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // Calculate grand total from items
  const baseCost = estimation.materialCost + estimation.laborCost;
  let totalOverhead = 0;
  let totalProfit = 0;
  let totalDiscount = 0;

  (estimation.boqItems || []).forEach((item) => {
    const itemBaseCost = item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost;
    const itemOverhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const itemProfit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemSubtotal = itemBaseCost + itemOverhead + itemProfit;
    const itemDiscount = itemSubtotal * (item.discountPercentage || 0) / 100;

    totalOverhead += itemOverhead;
    totalProfit += itemProfit;
    totalDiscount += itemDiscount;
  });

  const subtotal = baseCost + totalOverhead + totalProfit;
  const grandTotal = subtotal - totalDiscount;

  // Calculate average percentages for display
  const avgOverheadPct = baseCost > 0 ? (totalOverhead / baseCost) * 100 : 0;
  const avgProfitPct = baseCost > 0 ? (totalProfit / baseCost) * 100 : 0;
  const avgDiscountPct = subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0;

  // ============================================
  // SINGLE SHEET WITH EVERYTHING
  // ============================================
  const allData: any[][] = [
    ['BILL OF QUANTITIES - INTERNAL VERSION'],
    [],
    ['Project Information'],
    ['Project Name:', estimation.projectName],
    ['Client Name:', estimation.clientName],
    ['Location:', estimation.location],
    ['Floor:', estimation.floor],
    ['Working Hours:', estimation.workingHours],
    ['Estimator:', estimation.estimator],
    ['Submitted Date:', formatDate(estimation.submittedDate)],
    [],
    [],
    ['DETAILED BOQ ITEMS'],
    [],
  ];

  // Add each BOQ item with full breakdown
  (estimation.boqItems || []).forEach((item, itemIndex) => {
    const materialTotal = item.materials.reduce((sum, m) => sum + m.amount, 0);
    const itemBaseCost = materialTotal + item.laborCost;
    const overhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const profit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemSubtotal = itemBaseCost + overhead + profit;
    const discount = itemSubtotal * (item.discountPercentage || 0) / 100;

    // Item Header
    allData.push([`${itemIndex + 1}. ${item.description}`, '', '', '']);
    if (item.briefDescription) {
      allData.push([item.briefDescription, '', '', '']);
    }
    allData.push([`Qty: ${item.quantity} ${item.unit}`, `Rate: AED ${formatCurrency(item.rate)}/${item.unit}`, '', '']);
    allData.push([]);

    // Raw Materials Section
    if (item.materials.length > 0) {
      allData.push(['+ RAW MATERIALS', '', '', '']);
      allData.push(['Material Name', 'Quantity', 'Unit', 'Rate (AED)', 'Amount (AED)']);

      item.materials.forEach(material => {
        allData.push([
          material.name,
          material.quantity,
          material.unit,
          formatCurrency(material.rate),
          formatCurrency(material.amount)
        ]);
      });

      allData.push(['Total Materials:', '', '', '', formatCurrency(materialTotal)]);
      allData.push([]);
    }

    // Labour Section
    if (item.labour && item.labour.length > 0) {
      allData.push(['+ LABOUR', '', '', '']);
      allData.push(['Labour Type', 'Hours/Qty', 'Unit', 'Rate (AED)', 'Amount (AED)']);

      item.labour.forEach(labor => {
        allData.push([
          labor.type,
          labor.quantity,
          labor.unit,
          formatCurrency(labor.rate),
          formatCurrency(labor.amount)
        ]);
      });

      allData.push(['Total Labour:', '', '', '', formatCurrency(item.laborCost)]);
      allData.push([]);
    }

    // Overhead, Profit & Discount
    allData.push(['+ OVERHEADS, PROFIT & DISCOUNT', '', '', '']);
    allData.push([`Overhead (${item.overheadPercentage || 0}%)`, '', '', '', formatCurrency(overhead)]);
    allData.push([`Profit Margin (${item.profitMarginPercentage || 0}%)`, '', '', '', formatCurrency(profit)]);
    allData.push([`Discount (${item.discountPercentage || 0}%)`, '', '', '', discount > 0 ? `-${formatCurrency(discount)}` : formatCurrency(0)]);
    allData.push([]);

    // Item Total
    allData.push(['ESTIMATED SELLING PRICE:', '', '', '', formatCurrency(item.estimatedSellingPrice)]);
    allData.push([]);
    allData.push([]);
  });

  // Cost Summary at END
  allData.push([]);
  allData.push(['COST SUMMARY']);
  allData.push([]);
  allData.push(['Total Material Cost:', formatCurrency(estimation.materialCost)]);
  allData.push(['Total Labor Cost:', formatCurrency(estimation.laborCost)]);
  allData.push(['Base Cost (Material + Labor):', formatCurrency(baseCost)]);
  allData.push([`Overhead (${avgOverheadPct.toFixed(0)}%):`, formatCurrency(totalOverhead)]);
  allData.push([`Profit Margin (${avgProfitPct.toFixed(0)}%):`, formatCurrency(totalProfit)]);
  allData.push([`Discount (${avgDiscountPct.toFixed(0)}%):`, totalDiscount > 0 ? `-${formatCurrency(totalDiscount)}` : formatCurrency(0)]);
  allData.push([]);
  allData.push(['GRAND TOTAL:', formatCurrency(grandTotal)]);

  const ws = XLSX.utils.aoa_to_sheet(allData);
  ws['!cols'] = [
    { wch: 40 }, // Column A
    { wch: 15 }, // Column B
    { wch: 12 }, // Column C
    { wch: 15 }, // Column D
    { wch: 18 }, // Column E
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Complete BOQ Internal');

  // Generate and download
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = `BOQ_${estimation.projectName.replace(/\s+/g, '_')}_Internal_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(data, fileName);
};

/**
 * Export BOQ as Excel - Client Format (Overhead & Profit distributed into materials and labor)
 * Single sheet with ALL details - overhead & profit hidden within material/labor costs
 */
export const exportBOQToExcelClient = async (estimation: BOQEstimation) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // Calculate total from items - CLIENT VERSION: Selling price with distributed markup
  const baseCost = estimation.materialCost + estimation.laborCost;
  let totalOverhead = 0;
  let totalProfit = 0;
  let totalDiscount = 0;

  (estimation.boqItems || []).forEach((item) => {
    const itemBaseCost = item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost;
    const itemOverhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const itemProfit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemSubtotal = itemBaseCost + itemOverhead + itemProfit;
    const itemDiscount = itemSubtotal * (item.discountPercentage || 0) / 100;

    totalOverhead += itemOverhead;
    totalProfit += itemProfit;
    totalDiscount += itemDiscount;
  });

  const totalMarkup = totalOverhead + totalProfit;
  const subtotal = baseCost + totalMarkup;
  const grandTotal = subtotal - totalDiscount;

  // Calculate average discount percentage for display
  const avgDiscountPct = subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0;

  // Calculate adjusted totals for summary
  let adjustedTotalMaterialCost = 0;
  let adjustedTotalLaborCost = 0;

  // ============================================
  // SINGLE SHEET WITH EVERYTHING
  // ============================================
  const allData: any[][] = [
    ['BILL OF QUANTITIES - CLIENT VERSION'],
    [],
    ['Project Information'],
    ['Project Name:', estimation.projectName],
    ['Client Name:', estimation.clientName],
    ['Location:', estimation.location],
    ['Floor:', estimation.floor],
    ['Working Hours:', estimation.workingHours],
    ['Date:', formatDate(estimation.submittedDate)],
    [],
    [],
    ['DETAILED BOQ ITEMS'],
    [],
  ];

  // Add each BOQ item with distributed markup
  (estimation.boqItems || []).forEach((item, itemIndex) => {
    const materialTotal = item.materials.reduce((sum, m) => sum + m.amount, 0);
    const itemBaseCost = materialTotal + item.laborCost;

    // Calculate item's overhead and profit from item-level percentages
    const itemOverhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const itemProfit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemTotalMarkup = itemOverhead + itemProfit;

    // Calculate distribution ratios
    const materialRatio = itemBaseCost > 0 ? materialTotal / itemBaseCost : 0;
    const laborRatio = itemBaseCost > 0 ? item.laborCost / itemBaseCost : 0;
    const materialMarkupShare = itemTotalMarkup * materialRatio;
    const laborMarkupShare = itemTotalMarkup * laborRatio;

    // Item Header
    allData.push([`${itemIndex + 1}. ${item.description}`, '', '', '']);
    if (item.briefDescription) {
      allData.push([item.briefDescription, '', '', '']);
    }
    allData.push([`Qty: ${item.quantity} ${item.unit}`, `Rate: AED ${formatCurrency(item.rate)}/${item.unit}`, '', '']);
    allData.push([]);

    // Raw Materials Section with distributed markup
    let itemAdjustedMaterialTotal = 0;
    if (item.materials.length > 0) {
      allData.push(['+ RAW MATERIALS', '', '', '']);
      allData.push(['Material Name', 'Quantity', 'Unit', 'Rate (AED)', 'Amount (AED)']);

      item.materials.forEach(material => {
        const matShare = materialTotal > 0 ? (material.amount / materialTotal) * materialMarkupShare : 0;
        const adjustedAmount = material.amount + matShare;
        const adjustedRate = material.quantity > 0 ? adjustedAmount / material.quantity : material.rate;

        allData.push([
          material.name,
          material.quantity,
          material.unit,
          formatCurrency(adjustedRate),
          formatCurrency(adjustedAmount)
        ]);
        itemAdjustedMaterialTotal += adjustedAmount;
      });

      allData.push(['Total Materials:', '', '', '', formatCurrency(itemAdjustedMaterialTotal)]);
      allData.push([]);
      adjustedTotalMaterialCost += itemAdjustedMaterialTotal;
    }

    // Labour Section with distributed markup
    let itemAdjustedLaborTotal = 0;
    if (item.labour && item.labour.length > 0) {
      allData.push(['+ LABOUR', '', '', '']);
      allData.push(['Labour Type', 'Hours/Qty', 'Unit', 'Rate (AED)', 'Amount (AED)']);

      item.labour.forEach(labor => {
        const labShare = item.laborCost > 0 ? (labor.amount / item.laborCost) * laborMarkupShare : 0;
        const adjustedAmount = labor.amount + labShare;
        const adjustedRate = labor.quantity > 0 ? adjustedAmount / labor.quantity : labor.rate;

        allData.push([
          labor.type,
          labor.quantity,
          labor.unit,
          formatCurrency(adjustedRate),
          formatCurrency(adjustedAmount)
        ]);
        itemAdjustedLaborTotal += adjustedAmount;
      });

      allData.push(['Total Labour:', '', '', '', formatCurrency(itemAdjustedLaborTotal)]);
      allData.push([]);
      adjustedTotalLaborCost += itemAdjustedLaborTotal;
    }

    // Item Total with markup distributed
    const itemTotalWithMarkup = itemAdjustedMaterialTotal + itemAdjustedLaborTotal;
    allData.push(['TOTAL PRICE:', '', '', '', formatCurrency(itemTotalWithMarkup)]);
    allData.push([]);
    allData.push([]);
  });

  // Cost Overview at END with adjusted costs
  allData.push([]);
  allData.push(['COST OVERVIEW']);
  allData.push([]);
  allData.push(['Total Material Cost:', formatCurrency(adjustedTotalMaterialCost)]);
  allData.push(['Total Labor Cost:', formatCurrency(adjustedTotalLaborCost)]);
  allData.push(['Total Project Cost:', formatCurrency(adjustedTotalMaterialCost + adjustedTotalLaborCost)]);
  allData.push([`Discount (${avgDiscountPct.toFixed(0)}%):`, totalDiscount > 0 ? `-${formatCurrency(totalDiscount)}` : formatCurrency(0)]);
  allData.push([]);
  allData.push(['TOTAL PROJECT VALUE:', formatCurrency(grandTotal)]);

  const ws = XLSX.utils.aoa_to_sheet(allData);
  ws['!cols'] = [
    { wch: 40 }, // Column A
    { wch: 15 }, // Column B
    { wch: 12 }, // Column C
    { wch: 15 }, // Column D
    { wch: 18 }, // Column E
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Complete BOQ Client');

  // Generate and download
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = `BOQ_${estimation.projectName.replace(/\s+/g, '_')}_Client_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(data, fileName);
};

/**
 * Export BOQ as PDF - Internal Format (WITH Overhead & Profit)
 * Beautiful professional PDF with all details
 */
export const exportBOQToPDFInternal = async (estimation: BOQEstimation) => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();
  let yPos = 15;

  // Calculate totals from items
  const baseCost = estimation.materialCost + estimation.laborCost;
  let totalOverhead = 0;
  let totalProfit = 0;
  let totalDiscount = 0;

  (estimation.boqItems || []).forEach((item) => {
    const itemBaseCost = item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost;
    const itemOverhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const itemProfit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemSubtotal = itemBaseCost + itemOverhead + itemProfit;
    const itemDiscount = itemSubtotal * (item.discountPercentage || 0) / 100;

    totalOverhead += itemOverhead;
    totalProfit += itemProfit;
    totalDiscount += itemDiscount;
  });

  const subtotal = baseCost + totalOverhead + totalProfit;
  const grandTotal = subtotal - totalDiscount;

  // Calculate average percentages for display
  const avgOverheadPct = baseCost > 0 ? (totalOverhead / baseCost) * 100 : 0;
  const avgProfitPct = baseCost > 0 ? (totalProfit / baseCost) * 100 : 0;
  const avgDiscountPct = subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0;

  // Add company logo
  try {
    doc.addImage('https://i.postimg.cc/q7x6zrYt/logo.png', 'PNG', 14, yPos, 40, 12);
  } catch (error) {
    console.log('Logo loading skipped');
  }

  // Header - positioned to the right of logo to avoid overlap
  doc.setFontSize(16);
  doc.setTextColor(36, 61, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('BOQ - INTERNAL', 105, yPos + 8, { align: 'center' });
  yPos += 25;

  // Project Information Box
  doc.setDrawColor(36, 61, 138);
  doc.setLineWidth(0.5);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(14, yPos, 182, 28, 2, 2, 'FD');

  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(36, 61, 138);
  doc.text('PROJECT INFORMATION', 16, yPos);
  yPos += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(`Project: ${estimation.projectName}`, 16, yPos);
  doc.text(`Client: ${estimation.clientName}`, 110, yPos);
  yPos += 5;
  doc.text(`Location: ${estimation.location}`, 16, yPos);
  doc.text(`Floor: ${estimation.floor}`, 110, yPos);
  yPos += 5;
  doc.text(`Working Hours: ${estimation.workingHours}`, 16, yPos);
  doc.text(`Estimator: ${estimation.estimator}`, 110, yPos);
  doc.text(`Date: ${formatDate(estimation.submittedDate)}`, 160, yPos);
  yPos += 10;

  // BOQ Items - Detailed breakdown
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(36, 61, 138);
  doc.text('DETAILED BOQ ITEMS', 14, yPos);
  yPos += 8;

  (estimation.boqItems || []).forEach((item, itemIndex) => {
    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    const materialTotal = item.materials.reduce((sum, m) => sum + m.amount, 0);
    const itemBaseCost = materialTotal + item.laborCost;
    const overhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const profit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemSubtotal = itemBaseCost + overhead + profit;
    const discount = itemSubtotal * (item.discountPercentage || 0) / 100;

    // Item Header
    doc.setFillColor(230, 240, 255);
    doc.rect(14, yPos - 2, 182, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${itemIndex + 1}. ${item.description}`, 16, yPos + 3);
    yPos += 10;

    if (item.briefDescription) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(item.briefDescription.substring(0, 100), 16, yPos);
      doc.setTextColor(0);
      yPos += 5;
    }

    doc.setFontSize(8);
    doc.text(`Qty: ${item.quantity} ${item.unit} | Rate: AED ${formatCurrency(item.rate)}/${item.unit}`, 16, yPos);
    yPos += 7;

    // Materials Section
    if (item.materials.length > 0) {
      doc.setFillColor(240, 250, 255);
      doc.rect(16, yPos - 2, 178, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('+ Raw Materials', 18, yPos + 2);
      yPos += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      item.materials.forEach(material => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(`${material.name} (${material.quantity} ${material.unit})`, 20, yPos);
        doc.text(`AED ${formatCurrency(material.amount)}`, 170, yPos, { align: 'right' });
        yPos += 5;
      });

      doc.setFont('helvetica', 'bold');
      doc.text('Total Materials:', 20, yPos);
      doc.text(`AED ${formatCurrency(materialTotal)}`, 170, yPos, { align: 'right' });
      yPos += 7;
    }

    // Labor Section
    if (item.labour && item.labour.length > 0) {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFillColor(240, 255, 245);
      doc.rect(16, yPos - 2, 178, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('+ Labour', 18, yPos + 2);
      yPos += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      item.labour.forEach(labor => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(`${labor.type} (${labor.quantity} ${labor.unit})`, 20, yPos);
        doc.text(`AED ${formatCurrency(labor.amount)}`, 170, yPos, { align: 'right' });
        yPos += 5;
      });

      doc.setFont('helvetica', 'bold');
      doc.text('Total Labour:', 20, yPos);
      doc.text(`AED ${formatCurrency(item.laborCost)}`, 170, yPos, { align: 'right' });
      yPos += 7;
    }

    // Overhead & Profit
    if (yPos > 265) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFillColor(255, 245, 230);
    doc.rect(16, yPos - 2, 178, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('+ Overheads, Profit & Discount', 18, yPos + 2);
    yPos += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Overhead (${item.overheadPercentage || 0}%)`, 20, yPos);
    doc.text(`AED ${formatCurrency(overhead)}`, 170, yPos, { align: 'right' });
    yPos += 5;

    doc.text(`Profit Margin (${item.profitMarginPercentage || 0}%)`, 20, yPos);
    doc.text(`AED ${formatCurrency(profit)}`, 170, yPos, { align: 'right' });
    yPos += 5;

    if (discount > 0) {
      doc.setTextColor(220, 38, 38);
    }
    doc.text(`Discount (${item.discountPercentage || 0}%)`, 20, yPos);
    doc.text(`${discount > 0 ? '-' : ''}AED ${formatCurrency(discount)}`, 170, yPos, { align: 'right' });
    doc.setTextColor(0);
    yPos += 7;

    // Item Total
    doc.setFillColor(240, 255, 240);
    doc.rect(16, yPos - 2, 178, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(22, 163, 74);
    doc.text('Estimated Selling Price:', 18, yPos + 3);
    doc.text(`AED ${formatCurrency(item.estimatedSellingPrice)}`, 170, yPos + 3, { align: 'right' });
    doc.setTextColor(0);
    yPos += 12;
  });

  // Add Cost Summary at the END - Beautiful Box
  if (yPos > 200) {
    doc.addPage();
    yPos = 20;
  }

  yPos += 5;
  doc.setDrawColor(22, 163, 74);
  doc.setLineWidth(0.5);
  doc.setFillColor(240, 255, 245);
  doc.roundedRect(14, yPos, 182, 32, 2, 2, 'FD');

  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(22, 163, 74);
  doc.text('COST SUMMARY', 105, yPos, { align: 'center' });
  yPos += 7;

  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');

  // Summary in two columns - more compact
  const leftX = 20;
  const rightX = 110;

  doc.text('Total Material Cost:', leftX, yPos);
  doc.text(`AED ${formatCurrency(estimation.materialCost)}`, leftX + 50, yPos);

  doc.text('Total Labor Cost:', rightX, yPos);
  doc.text(`AED ${formatCurrency(estimation.laborCost)}`, rightX + 40, yPos);
  yPos += 5;

  doc.text('Base Cost:', leftX, yPos);
  doc.text(`AED ${formatCurrency(baseCost)}`, leftX + 50, yPos);

  doc.text(`Overhead (${avgOverheadPct.toFixed(0)}%):`, rightX, yPos);
  doc.text(`AED ${formatCurrency(totalOverhead)}`, rightX + 40, yPos);
  yPos += 5;

  doc.text(`Profit (${avgProfitPct.toFixed(0)}%):`, leftX, yPos);
  doc.text(`AED ${formatCurrency(totalProfit)}`, leftX + 50, yPos);

  yPos += 5;
  if (totalDiscount > 0) {
    doc.setTextColor(239, 68, 68); // Red color for discount
  }
  doc.text(`Discount (${avgDiscountPct.toFixed(0)}%):`, leftX, yPos);
  doc.text(`${totalDiscount > 0 ? '-' : ''}AED ${formatCurrency(totalDiscount)}`, leftX + 50, yPos);
  doc.setTextColor(0);

  if (false) { // Old code removed
    doc.text(`Discount (${estimation.discountPercentage}%):`, rightX, yPos);
    doc.text(`- AED ${formatCurrency(discountAmount)}`, rightX + 40, yPos);
    doc.setTextColor(0); // Reset to black
  }
  yPos += 8;

  // Grand Total - Compact
  doc.setDrawColor(22, 163, 74);
  doc.setFillColor(34, 197, 94);
  doc.roundedRect(14, yPos - 2, 182, 10, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('GRAND TOTAL:', 60, yPos + 4);
  doc.text(`AED ${formatCurrency(grandTotal)}`, 140, yPos + 4);

  // Save PDF
  const fileName = `BOQ_${estimation.projectName.replace(/\s+/g, '_')}_Internal_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

/**
 * Export BOQ as PDF - Client Format (Overhead & Profit distributed into materials and labor)
 * Shows all details with overhead & profit hidden within material/labor costs
 */
export const exportBOQToPDFClient = async (estimation: BOQEstimation) => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();
  let yPos = 15;

  // Calculate total from items - CLIENT VERSION: Selling price with distributed markup
  const baseCost = estimation.materialCost + estimation.laborCost;
  let totalOverhead = 0;
  let totalProfit = 0;
  let totalDiscount = 0;

  (estimation.boqItems || []).forEach((item) => {
    const itemBaseCost = item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost;
    const itemOverhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const itemProfit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemSubtotal = itemBaseCost + itemOverhead + itemProfit;
    const itemDiscount = itemSubtotal * (item.discountPercentage || 0) / 100;

    totalOverhead += itemOverhead;
    totalProfit += itemProfit;
    totalDiscount += itemDiscount;
  });

  const totalMarkup = totalOverhead + totalProfit;
  const subtotal = baseCost + totalMarkup;
  const grandTotal = subtotal - totalDiscount;

  // Calculate average discount percentage for display
  const avgDiscountPct = subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0;

  // Track adjusted costs for summary
  let adjustedTotalMaterialCost = 0;
  let adjustedTotalLaborCost = 0;

  // Add company logo
  try {
    doc.addImage('https://i.postimg.cc/q7x6zrYt/logo.png', 'PNG', 14, yPos, 40, 12);
  } catch (error) {
    console.log('Logo loading skipped');
  }

  // Header - positioned to the right of logo to avoid overlap
  doc.setFontSize(16);
  doc.setTextColor(36, 61, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('BOQ - CLIENT', 105, yPos + 8, { align: 'center' });
  yPos += 25;

  // Project Information Box
  doc.setDrawColor(36, 61, 138);
  doc.setLineWidth(0.5);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(14, yPos, 182, 28, 2, 2, 'FD');

  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(36, 61, 138);
  doc.text('PROJECT INFORMATION', 16, yPos);
  yPos += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(`Project: ${estimation.projectName}`, 16, yPos);
  doc.text(`Client: ${estimation.clientName}`, 110, yPos);
  yPos += 5;
  doc.text(`Location: ${estimation.location}`, 16, yPos);
  doc.text(`Floor: ${estimation.floor}`, 110, yPos);
  yPos += 5;
  doc.text(`Working Hours: ${estimation.workingHours}`, 16, yPos);
  doc.text(`Date: ${formatDate(estimation.submittedDate)}`, 160, yPos);
  yPos += 10;

  // BOQ Items - Detailed breakdown (NO OVERHEAD/PROFIT SHOWN)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(36, 61, 138);
  doc.text('DETAILED BOQ ITEMS', 14, yPos);
  yPos += 8;

  (estimation.boqItems || []).forEach((item, itemIndex) => {
    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    const materialTotal = item.materials.reduce((sum, m) => sum + m.amount, 0);
    const itemBaseCost = materialTotal + item.laborCost;

    // Calculate item's overhead and profit from item-level percentages
    const itemOverhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const itemProfit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemTotalMarkup = itemOverhead + itemProfit;

    // Calculate distribution ratios
    const materialRatio = itemBaseCost > 0 ? materialTotal / itemBaseCost : 0;
    const laborRatio = itemBaseCost > 0 ? item.laborCost / itemBaseCost : 0;
    const materialMarkupShare = itemTotalMarkup * materialRatio;
    const laborMarkupShare = itemTotalMarkup * laborRatio;

    // Item Header
    doc.setFillColor(230, 240, 255);
    doc.rect(14, yPos - 2, 182, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${itemIndex + 1}. ${item.description}`, 16, yPos + 3);
    yPos += 10;

    if (item.briefDescription) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(item.briefDescription.substring(0, 100), 16, yPos);
      doc.setTextColor(0);
      yPos += 5;
    }

    doc.setFontSize(8);
    doc.text(`Qty: ${item.quantity} ${item.unit} | Rate: AED ${formatCurrency(item.rate)}/${item.unit}`, 16, yPos);
    yPos += 7;

    // Materials Section with distributed markup
    let itemAdjustedMaterialTotal = 0;
    if (item.materials.length > 0) {
      doc.setFillColor(240, 250, 255);
      doc.rect(16, yPos - 2, 178, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('+ Raw Materials', 18, yPos + 2);
      yPos += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      item.materials.forEach(material => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        const matShare = materialTotal > 0 ? (material.amount / materialTotal) * materialMarkupShare : 0;
        const adjustedAmount = material.amount + matShare;
        itemAdjustedMaterialTotal += adjustedAmount;

        doc.text(`${material.name} (${material.quantity} ${material.unit})`, 20, yPos);
        doc.text(`AED ${formatCurrency(adjustedAmount)}`, 170, yPos, { align: 'right' });
        yPos += 5;
      });

      doc.setFont('helvetica', 'bold');
      doc.text('Total Materials:', 20, yPos);
      doc.text(`AED ${formatCurrency(itemAdjustedMaterialTotal)}`, 170, yPos, { align: 'right' });
      yPos += 7;
      adjustedTotalMaterialCost += itemAdjustedMaterialTotal;
    }

    // Labor Section with distributed markup
    let itemAdjustedLaborTotal = 0;
    if (item.labour && item.labour.length > 0) {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFillColor(240, 255, 245);
      doc.rect(16, yPos - 2, 178, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('+ Labour', 18, yPos + 2);
      yPos += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      item.labour.forEach(labor => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        const labShare = item.laborCost > 0 ? (labor.amount / item.laborCost) * laborMarkupShare : 0;
        const adjustedAmount = labor.amount + labShare;
        itemAdjustedLaborTotal += adjustedAmount;

        doc.text(`${labor.type} (${labor.quantity} ${labor.unit})`, 20, yPos);
        doc.text(`AED ${formatCurrency(adjustedAmount)}`, 170, yPos, { align: 'right' });
        yPos += 5;
      });

      doc.setFont('helvetica', 'bold');
      doc.text('Total Labour:', 20, yPos);
      doc.text(`AED ${formatCurrency(itemAdjustedLaborTotal)}`, 170, yPos, { align: 'right' });
      yPos += 7;
      adjustedTotalLaborCost += itemAdjustedLaborTotal;
    }

    // Item Total with markup distributed
    if (yPos > 265) {
      doc.addPage();
      yPos = 20;
    }

    const itemTotalWithMarkup = itemAdjustedMaterialTotal + itemAdjustedLaborTotal;
    doc.setFillColor(240, 255, 240);
    doc.rect(16, yPos - 2, 178, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(22, 163, 74);
    doc.text('Total Price:', 18, yPos + 3);
    doc.text(`AED ${formatCurrency(itemTotalWithMarkup)}`, 170, yPos + 3, { align: 'right' });
    doc.setTextColor(0);
    yPos += 12;
  });

  // Add Cost Overview at the END (NO Overhead/Profit shown) - Compact like UI
  // Only add new page if there's really not enough space (less than 45 units left)
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  yPos += 8;
  doc.setDrawColor(200, 220, 240);
  doc.setLineWidth(0.5);
  doc.setFillColor(240, 247, 255);
  doc.roundedRect(14, yPos, 182, 28, 2, 2, 'FD');

  yPos += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(36, 61, 138);
  doc.text('Cost Summary', 16, yPos);
  yPos += 8;

  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');

  // Left column
  doc.text('Total Material Cost:', 18, yPos);
  doc.text(`AED${formatCurrency(adjustedTotalMaterialCost)}`, 75, yPos, { align: 'right' });

  // Right column
  doc.text('Total Labor Cost:', 100, yPos);
  doc.text(`AED${formatCurrency(adjustedTotalLaborCost)}`, 160, yPos, { align: 'right' });
  yPos += 5;

  doc.setFont('helvetica', 'bold');
  doc.text('Total Project Cost:', 18, yPos);
  doc.text(`AED${formatCurrency(adjustedTotalMaterialCost + adjustedTotalLaborCost)}`, 75, yPos, { align: 'right' });

  yPos += 5;
  doc.setFont('helvetica', 'normal');
  if (totalDiscount > 0) {
    doc.setTextColor(239, 68, 68); // Red color for discount
  }
  doc.text(`Discount (${avgDiscountPct.toFixed(0)}%):`, 18, yPos);
  doc.text(`${totalDiscount > 0 ? '-' : ''} AED${formatCurrency(totalDiscount)}`, 75, yPos, { align: 'right' });
  doc.setTextColor(0); // Reset to black
  yPos += 8;

  // Grand Total - Compact Green Bar
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(22, 163, 74);
  doc.text('Grand Total:', 18, yPos);
  doc.text(`AED${formatCurrency(grandTotal)}`, 160, yPos, { align: 'right' });

  // Save PDF
  const fileName = `BOQ_${estimation.projectName.replace(/\s+/g, '_')}_Client_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};
