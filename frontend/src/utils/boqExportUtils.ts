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
  has_sub_items?: boolean;
  sub_items?: {
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
    materials: {
      name: string;
      quantity: number;
      unit: string;
      rate: number;
      amount: number;
      vat_percentage?: number;
    }[];
    labour: {
      type: string;
      quantity: number;
      unit: string;
      rate: number;
      amount: number;
    }[];
  }[];
  materials: {
    name: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
    vat_percentage?: number;
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
  miscellaneous_percentage?: number;
  miscellaneous_amount?: number;
  overheadPercentage?: number;
  overhead_percentage?: number;
  overhead_amount?: number;
  profitMarginPercentage?: number;
  profit_margin_percentage?: number;
  profit_margin_amount?: number;
  discountPercentage?: number;
  vat_percentage?: number;
  vat_amount?: number;
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
    [key: string]: number;
  };
  totalVatAmount?: number;
  overallVatPercentage?: number;
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
  let totalVat = 0;

  (estimation.boqItems || []).forEach((item) => {
    const itemBaseCost = item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost;
    const itemOverhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const itemProfit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemSubtotal = itemBaseCost + itemOverhead + itemProfit;
    const itemDiscount = itemSubtotal * (item.discountPercentage || 0) / 100;
    const itemAfterDiscount = itemSubtotal - itemDiscount;
    // Use vat_amount if available, otherwise calculate from percentage
    const itemVat = item.vat_amount || (itemAfterDiscount * (item.vat_percentage || 0) / 100);

    totalOverhead += itemOverhead;
    totalProfit += itemProfit;
    totalDiscount += itemDiscount;
    totalVat += itemVat;
  });

  // Use totalVatAmount from estimation if available (includes overall VAT + item-level VAT)
  if (estimation.totalVatAmount !== undefined && estimation.totalVatAmount > 0) {
    totalVat = estimation.totalVatAmount;
  }

  // Extract preliminary amount from estimation
  const preliminaryAmount = estimation.preliminaries?.cost_details?.amount || 0;

  const itemsSubtotal = baseCost + totalOverhead + totalProfit;
  const combinedSubtotal = itemsSubtotal + preliminaryAmount;
  const afterDiscount = combinedSubtotal - totalDiscount;
  const afterVat = afterDiscount + totalVat;
  const grandTotal = afterVat;

  // Calculate average percentages for display
  const avgOverheadPct = baseCost > 0 ? (totalOverhead / baseCost) * 100 : 0;
  const avgProfitPct = baseCost > 0 ? (totalProfit / baseCost) * 100 : 0;
  const avgDiscountPct = combinedSubtotal > 0 ? (totalDiscount / combinedSubtotal) * 100 : 0;

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

  // Add each BOQ item with full breakdown - INTERNAL VERSION
  (estimation.boqItems || []).forEach((item, itemIndex) => {
    // Item Header
    allData.push([`${itemIndex + 1}. ${item.description}`, '', '', '']);
    if (item.briefDescription) {
      allData.push([item.briefDescription, '', '', '']);
    }
    allData.push([`Qty: ${item.quantity} ${item.unit}`, `Rate: AED ${formatCurrency(item.rate)}/${item.unit}`, '', '']);
    allData.push([]);

    // Check if item has sub-items
    const hasSubItems = item.has_sub_items && item.sub_items && item.sub_items.length > 0;

    if (hasSubItems) {
      // NEW FORMAT: Item with sub-items - show each sub-item with its materials/labour
      item.sub_items!.forEach((subItem, subIdx) => {
        // Sub-item header
        allData.push([`  ${subIdx + 1}. ${subItem.sub_item_name}`, '', '', '']);
        if (subItem.scope || subItem.size) {
          allData.push([`     Scope: ${subItem.scope || ''} | Size: ${subItem.size || ''}`, '', '', '']);
        }
        allData.push([`     Qty: ${subItem.quantity} ${subItem.unit}`, '', '', '']);
        allData.push([]);

        // Sub-item Materials
        const subMaterialTotal = subItem.materials.reduce((sum, m) => sum + m.amount, 0);
        if (subItem.materials.length > 0) {
          allData.push(['     + RAW MATERIALS', '', '', '']);
          allData.push(['     Material Name', 'Quantity', 'Unit', 'Rate (AED)', 'Amount (AED)']);

          subItem.materials.forEach(material => {
            allData.push([
              '       ' + material.name,
              material.quantity,
              material.unit,
              formatCurrency(material.rate),
              formatCurrency(material.amount)
            ]);
          });

          allData.push(['     Total Materials:', '', '', '', formatCurrency(subMaterialTotal)]);
          allData.push([]);
        }

        // Sub-item Labour
        const subLabourTotal = subItem.labour.reduce((sum, l) => sum + l.amount, 0);
        if (subItem.labour && subItem.labour.length > 0) {
          allData.push(['     + LABOUR', '', '', '']);
          allData.push(['     Labour Type', 'Hours/Qty', 'Unit', 'Rate (AED)', 'Amount (AED)']);

          subItem.labour.forEach(labor => {
            allData.push([
              '       ' + labor.type,
              labor.quantity,
              labor.unit,
              formatCurrency(labor.rate),
              formatCurrency(labor.amount)
            ]);
          });

          allData.push(['     Total Labour:', '', '', '', formatCurrency(subLabourTotal)]);
          allData.push([]);
        }

        allData.push(['     Sub-item Total:', '', '', '', formatCurrency(subMaterialTotal + subLabourTotal)]);
        allData.push([]);
      });

      // Item-level misc, overhead, profit, discount, VAT (applied to whole item)
      const itemBaseCost = item.sub_items!.reduce((sum, si) => sum + si.materials_cost + si.labour_cost, 0);
      const misc = (item as any).miscellaneous_amount || (itemBaseCost * ((item as any).miscellaneous_percentage || 0) / 100);
      const overhead = (item as any).overhead_amount || (itemBaseCost * (item.overheadPercentage || (item as any).overhead_percentage || 0) / 100);
      const profit = (item as any).profit_margin_amount || (itemBaseCost * (item.profitMarginPercentage || (item as any).profit_margin_percentage || 0) / 100);
      const itemSubtotal = itemBaseCost + misc + overhead + profit;
      const discount = itemSubtotal * (item.discountPercentage || 0) / 100;
      const itemAfterDiscount = itemSubtotal - discount;
      const itemVat = itemAfterDiscount * (item.vat_percentage || 0) / 100;
      const itemFinalPrice = itemAfterDiscount + itemVat;

      allData.push(['+ ITEM-LEVEL MISC, OVERHEADS, PROFIT, DISCOUNT & VAT', '', '', '']);
      if (misc > 0) {
        const miscPct = (item as any).miscellaneous_percentage || 0;
        allData.push([`Miscellaneous (${miscPct}%)`, '', '', '', formatCurrency(misc)]);
      }
      allData.push([`Overhead (${item.overheadPercentage || (item as any).overhead_percentage || 0}%)`, '', '', '', formatCurrency(overhead)]);
      allData.push([`Profit Margin (${item.profitMarginPercentage || (item as any).profit_margin_percentage || 0}%)`, '', '', '', formatCurrency(profit)]);
      allData.push([`Discount (${item.discountPercentage || 0}%)`, '', '', '', discount > 0 ? `-${formatCurrency(discount)}` : formatCurrency(0)]);
      allData.push(['Subtotal (After Discount):', '', '', '', formatCurrency(itemAfterDiscount)]);
      allData.push([`VAT (${item.vat_percentage || 0}%)`, '', '', '', formatCurrency(itemVat)]);
      allData.push([]);

      allData.push(['ESTIMATED SELLING PRICE:', '', '', '', formatCurrency(itemFinalPrice)]);
      allData.push([]);
      allData.push([]);
    } else {
      // OLD FORMAT: Item without sub-items - show materials/labour directly on item
      const materialTotal = item.materials.reduce((sum, m) => sum + m.amount, 0);
      const itemBaseCost = materialTotal + item.laborCost;
      const overhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
      const profit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
      const itemSubtotal = itemBaseCost + overhead + profit;
      const discount = itemSubtotal * (item.discountPercentage || 0) / 100;

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

      // Overhead, Profit, Discount & VAT
      const itemAfterDiscount = itemSubtotal - discount;
      const itemVat = itemAfterDiscount * (item.vat_percentage || 0) / 100;
      const itemFinalPrice = itemAfterDiscount + itemVat;

      allData.push(['+ OVERHEADS, PROFIT, DISCOUNT & VAT', '', '', '']);
      allData.push([`Overhead (${item.overheadPercentage || 0}%)`, '', '', '', formatCurrency(overhead)]);
      allData.push([`Profit Margin (${item.profitMarginPercentage || 0}%)`, '', '', '', formatCurrency(profit)]);
      allData.push([`Discount (${item.discountPercentage || 0}%)`, '', '', '', discount > 0 ? `-${formatCurrency(discount)}` : formatCurrency(0)]);
      allData.push(['Subtotal (After Discount):', '', '', '', formatCurrency(itemAfterDiscount)]);
      allData.push([`VAT (${item.vat_percentage || 0}%)`, '', '', '', formatCurrency(itemVat)]);
      allData.push([]);

      // Item Total
      allData.push(['ESTIMATED SELLING PRICE:', '', '', '', formatCurrency(itemFinalPrice)]);
      allData.push([]);
      allData.push([]);
    }
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
  allData.push(['Items Subtotal:', formatCurrency(itemsSubtotal)]);

  // Add preliminary amount if it exists
  if (preliminaryAmount > 0) {
    allData.push(['Preliminary Amount:', formatCurrency(preliminaryAmount)]);
    allData.push(['Combined Subtotal:', formatCurrency(combinedSubtotal)]);
  }

  allData.push([`Discount (${avgDiscountPct.toFixed(0)}%):`, totalDiscount > 0 ? `-${formatCurrency(totalDiscount)}` : formatCurrency(0)]);
  allData.push(['Subtotal (After Discount):', formatCurrency(afterDiscount)]);

  // Add VAT
  const avgVatPct = afterDiscount > 0 ? (totalVat / afterDiscount) * 100 : 0;
  allData.push([`VAT (${avgVatPct.toFixed(1)}%):`, formatCurrency(totalVat)]);

  allData.push([]);
  allData.push(['GRAND TOTAL:', formatCurrency(grandTotal)]);

  // Add Preliminaries & Approval Works Section (separate from grand total)
  if (estimation.preliminaries && (estimation.preliminaries.items?.length > 0 || estimation.preliminaries.notes)) {
    allData.push([]);
    allData.push([]);
    allData.push(['PRELIMINARIES & APPROVAL WORKS']);
    allData.push(['Selected conditions and terms']);
    allData.push([]);

    if (estimation.preliminaries.items && estimation.preliminaries.items.length > 0) {
      estimation.preliminaries.items.forEach((item: any) => {
        allData.push([`✓ ${item.description || item}`]);
      });
    }

    if (estimation.preliminaries.notes) {
      allData.push([]);
      allData.push(['Additional Notes']);
      allData.push([estimation.preliminaries.notes]);
    }
  }

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
  let totalVat = 0;

  (estimation.boqItems || []).forEach((item) => {
    const itemBaseCost = item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost;
    const itemOverhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const itemProfit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemSubtotal = itemBaseCost + itemOverhead + itemProfit;
    const itemDiscount = itemSubtotal * (item.discountPercentage || 0) / 100;
    const itemAfterDiscount = itemSubtotal - itemDiscount;
    // Use vat_amount if available, otherwise calculate from percentage
    const itemVat = item.vat_amount || (itemAfterDiscount * (item.vat_percentage || 0) / 100);

    totalOverhead += itemOverhead;
    totalProfit += itemProfit;
    totalDiscount += itemDiscount;
    totalVat += itemVat;
  });

  // Use totalVatAmount from estimation if available (includes overall VAT + item-level VAT)
  if (estimation.totalVatAmount !== undefined && estimation.totalVatAmount > 0) {
    totalVat = estimation.totalVatAmount;
  }

  const totalMarkup = totalOverhead + totalProfit;
  const subtotal = baseCost + totalMarkup;
  const afterDiscount = subtotal - totalDiscount;
  const afterVat = afterDiscount + totalVat;
  const grandTotal = afterVat;

  // ============================================
  // CLIENT VERSION: Show only items and sub-items
  // ============================================
  const allData: any[][] = [
    ['BILL OF QUANTITIES'],
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
    ['SCOPE OF WORK'],
    [],
  ];

  // Add each BOQ item - CLIENT VERSION (no materials/labour details)
  (estimation.boqItems || []).forEach((item, itemIndex) => {
    // Item Header
    allData.push([`${itemIndex + 1}. ${item.description}`, '', '', '', '', '']);
    if (item.briefDescription) {
      allData.push([item.briefDescription, '', '', '', '', '']);
    }
    allData.push([]);

    // Check if item has sub-items
    const hasSubItems = item.has_sub_items && item.sub_items && item.sub_items.length > 0;

    if (hasSubItems) {
      // CLIENT VERSION: Show sub-items (NO materials/labour)
      allData.push(['Sub-Item', 'Scope/Size', 'Quantity', 'Unit', 'Rate (AED)', 'Amount (AED)']);

      // Get item-level amounts (misc, overhead, profit)
      const itemMisc = (item as any).miscellaneous_amount || 0;
      const itemOverhead = (item as any).overhead_amount || 0;
      const itemProfit = (item as any).profit_margin_amount || 0;
      const itemBaseCost = item.sub_items!.reduce((sum, si) => sum + si.materials_cost + si.labour_cost, 0);

      item.sub_items!.forEach(subItem => {
        const subItemBase = subItem.materials_cost + subItem.labour_cost;
        // Distribute misc + overhead + profit proportionally to sub-items
        const subItemMarkup = itemBaseCost > 0 ? (subItemBase / itemBaseCost) * (itemMisc + itemOverhead + itemProfit) : 0;
        const subItemTotal = subItemBase + subItemMarkup;
        const adjustedRate = subItem.quantity > 0 ? subItemTotal / subItem.quantity : 0;

        // Build comprehensive scope/size display
        const scopeParts = [];
        if (subItem.scope) scopeParts.push(subItem.scope);
        if (subItem.size) scopeParts.push(subItem.size);
        if (subItem.location) scopeParts.push(`Loc: ${subItem.location}`);
        if (subItem.brand) scopeParts.push(`Brand: ${subItem.brand}`);
        const scopeSize = scopeParts.join(' | ') || '-';

        allData.push([
          subItem.sub_item_name,
          scopeSize,
          subItem.quantity,
          subItem.unit,
          formatCurrency(adjustedRate),
          formatCurrency(subItemTotal)
        ]);
      });

      allData.push([]);
    } else {
      // Old format: No sub-items
      allData.push([`Qty: ${item.quantity} ${item.unit}`, `Rate: AED ${formatCurrency(item.rate)}/${item.unit}`, '', '', '', '']);
      allData.push([]);
    }

    // Item Total
    allData.push(['TOTAL:', '', '', '', '', formatCurrency(item.estimatedSellingPrice)]);
    allData.push([]);
    allData.push([]);
  });

  // Cost Summary at END - CLIENT VERSION
  const itemsSubtotalClient = (estimation.boqItems || []).reduce((sum, item) => sum + item.estimatedSellingPrice, 0);
  const preliminaryAmountClient = estimation.preliminaries?.cost_details?.amount || 0;
  const combinedSubtotalClient = itemsSubtotalClient + preliminaryAmountClient;
  const avgDiscountPctClient = combinedSubtotalClient > 0 ? (totalDiscount / combinedSubtotalClient) * 100 : 0;

  allData.push([]);
  allData.push(['COST SUMMARY']);
  allData.push([]);
  allData.push(['Items Subtotal:', formatCurrency(itemsSubtotalClient)]);

  // Add preliminary amount if it exists
  if (preliminaryAmountClient > 0) {
    allData.push(['Preliminary Amount:', formatCurrency(preliminaryAmountClient)]);
    allData.push(['Combined Subtotal:', formatCurrency(combinedSubtotalClient)]);
  }

  if (totalDiscount > 0) {
    allData.push([`Discount (${avgDiscountPctClient.toFixed(0)}%):`, `-${formatCurrency(totalDiscount)}`]);
    allData.push(['After Discount:', formatCurrency(afterDiscount)]);
  }

  if (totalVat > 0) {
    const avgVatPct = afterDiscount > 0 ? (totalVat / afterDiscount) * 100 : 0;
    allData.push([`VAT (${avgVatPct.toFixed(1)}%):`, formatCurrency(totalVat)]);
  }

  allData.push([]);
  allData.push(['TOTAL PROJECT VALUE:', formatCurrency(grandTotal)]);

  // Add Preliminaries & Approval Works Section (separate from grand total)
  if (estimation.preliminaries && (estimation.preliminaries.items?.length > 0 || estimation.preliminaries.notes)) {
    allData.push([]);
    allData.push([]);
    allData.push(['PRELIMINARIES & APPROVAL WORKS']);
    allData.push(['Selected conditions and terms']);
    allData.push([]);

    if (estimation.preliminaries.items && estimation.preliminaries.items.length > 0) {
      estimation.preliminaries.items.forEach((item: any) => {
        allData.push([`✓ ${item.description || item}`]);
      });
    }

    if (estimation.preliminaries.notes) {
      allData.push([]);
      allData.push(['Additional Notes']);
      allData.push([estimation.preliminaries.notes]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(allData);
  ws['!cols'] = [
    { wch: 30 }, // Column A - Sub-Item/Item Name
    { wch: 25 }, // Column B - Scope/Size
    { wch: 12 }, // Column C - Quantity
    { wch: 10 }, // Column D - Unit
    { wch: 15 }, // Column E - Rate (AED)
    { wch: 18 }, // Column F - Amount (AED)
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'BOQ Client');

  // Generate and download
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = `BOQ_${estimation.projectName.replace(/\s+/g, '_')}_Client_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(data, fileName);
};

/**
 * Export BOQ as PDF - Internal Format (WITH Overhead & Profit)
 * Beautiful professional PDF with all details - NEW CORPORATE TEMPLATE
 */
export const exportBOQToPDFInternal = async (estimation: BOQEstimation) => {
  // Use HTML template (boq_internal.html) with REAL data
  const { exportBOQToPDFInternal: exportInternal } = await import('./boqHtmlToPdf');
  return exportInternal(estimation);
};

/**
 * OLD INTERNAL PDF EXPORT - DEPRECATED
 */
const exportBOQToPDFInternalOld = async (estimation: BOQEstimation) => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();
  let yPos = 15;

  // Calculate totals from items
  const baseCost = estimation.materialCost + estimation.laborCost;
  let totalOverhead = 0;
  let totalProfit = 0;
  let totalDiscount = 0;
  let totalVat = 0;

  (estimation.boqItems || []).forEach((item) => {
    const itemBaseCost = item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost;
    const itemOverhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const itemProfit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemSubtotal = itemBaseCost + itemOverhead + itemProfit;
    const itemDiscount = itemSubtotal * (item.discountPercentage || 0) / 100;
    const itemAfterDiscount = itemSubtotal - itemDiscount;
    // Use vat_amount if available, otherwise calculate from percentage
    const itemVat = item.vat_amount || (itemAfterDiscount * (item.vat_percentage || 0) / 100);

    totalOverhead += itemOverhead;
    totalProfit += itemProfit;
    totalDiscount += itemDiscount;
    totalVat += itemVat;
  });

  // Use totalVatAmount from estimation if available (includes overall VAT + item-level VAT)
  if (estimation.totalVatAmount !== undefined && estimation.totalVatAmount > 0) {
    totalVat = estimation.totalVatAmount;
  }

  // Extract preliminary amount from estimation
  const preliminaryAmount = estimation.preliminaries?.cost_details?.amount || 0;

  const itemsSubtotal = baseCost + totalOverhead + totalProfit;
  const combinedSubtotal = itemsSubtotal + preliminaryAmount;
  const afterDiscount = combinedSubtotal - totalDiscount;
  const afterVat = afterDiscount + totalVat;
  const grandTotal = afterVat;

  // Calculate average percentages for display
  const avgOverheadPct = baseCost > 0 ? (totalOverhead / baseCost) * 100 : 0;
  const avgProfitPct = baseCost > 0 ? (totalProfit / baseCost) * 100 : 0;
  const avgDiscountPct = combinedSubtotal > 0 ? (totalDiscount / combinedSubtotal) * 100 : 0;

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

    // Check if item has sub-items
    const hasSubItems = item.has_sub_items && item.sub_items && item.sub_items.length > 0;

    // Declare variables for calculations (will be set in if/else blocks)
    let itemBaseCost = 0;
    let misc = 0;
    let overhead = 0;
    let profit = 0;
    let itemSubtotal = 0;
    let discount = 0;
    let itemAfterDiscount = 0;
    let itemVat = 0;
    let itemFinalPrice = 0;

    if (hasSubItems) {
      // NEW FORMAT: Item with sub-items - show each sub-item with its materials/labour
      item.sub_items!.forEach((subItem, subIdx) => {
        if (yPos > 260) {
          doc.addPage();
          yPos = 20;
        }

        // Sub-item header
        doc.setFillColor(245, 248, 255);
        doc.rect(18, yPos - 2, 176, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${subIdx + 1}. ${subItem.sub_item_name}`, 20, yPos + 2);
        yPos += 8;

        if (subItem.scope || subItem.size) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(80);
          doc.text(`Scope: ${subItem.scope || ''} | Size: ${subItem.size || ''}`, 22, yPos);
          doc.setTextColor(0);
          yPos += 5;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(`Qty: ${subItem.quantity} ${subItem.unit}`, 22, yPos);
        yPos += 6;

        // Sub-item Materials - Professional Table
        const subMaterialTotal = subItem.materials.reduce((sum, m) => sum + (m.total_price || m.amount || 0), 0);
        if (subItem.materials.length > 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(37, 99, 235);
          doc.text('+ RAW MATERIALS', 22, yPos);
          doc.setTextColor(0);
          yPos += 3;

          // Create materials table
          const materialsTableData = subItem.materials.map((mat: any) => [
            mat.material_name || mat.name || '',
            mat.quantity || 0,
            mat.unit || '',
            formatCurrency(mat.rate || 0),
            formatCurrency(mat.total_price || mat.amount || 0)
          ]);

          // Add total row
          materialsTableData.push([
            { content: 'Total Materials:', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(subMaterialTotal), styles: { fontStyle: 'bold', fillColor: [219, 234, 254] } }
          ]);

          (autoTable as any)(doc, {
            startY: yPos,
            head: [['Material Name', 'Qty', 'Unit', 'Rate (AED)', 'Amount (AED)']],
            body: materialsTableData,
            margin: { left: 22 },
            theme: 'grid',
            headStyles: {
              fillColor: [191, 219, 254],
              textColor: [30, 64, 175],
              fontStyle: 'bold',
              fontSize: 7
            },
            bodyStyles: {
              fontSize: 7,
              textColor: [55, 65, 81]
            },
            columnStyles: {
              0: { cellWidth: 60 },
              1: { cellWidth: 20, halign: 'center' },
              2: { cellWidth: 20, halign: 'center' },
              3: { cellWidth: 30, halign: 'right' },
              4: { cellWidth: 30, halign: 'right' }
            },
            didDrawPage: (data: any) => {
              yPos = data.cursor.y + 3;
            }
          });

          yPos = (doc as any).lastAutoTable.finalY + 3;
        }

        // Sub-item Labour - Professional Table
        const subLabourTotal = subItem.labour.reduce((sum, l) => sum + (l.total_cost || l.amount || 0), 0);
        if (subItem.labour && subItem.labour.length > 0) {
          if (yPos > 240) {
            doc.addPage();
            yPos = 20;
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(126, 34, 206);
          doc.text('+ LABOUR', 22, yPos);
          doc.setTextColor(0);
          yPos += 3;

          // Create labour table
          const labourTableData = subItem.labour.map((lab: any) => [
            lab.labour_role || lab.type || '',
            lab.hours || lab.quantity || 0,
            lab.unit || 'hrs',
            formatCurrency(lab.rate || 0),
            formatCurrency(lab.total_cost || lab.amount || 0)
          ]);

          // Add total row
          labourTableData.push([
            { content: 'Total Labour:', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(subLabourTotal), styles: { fontStyle: 'bold', fillColor: [233, 213, 255] } }
          ]);

          (autoTable as any)(doc, {
            startY: yPos,
            head: [['Labour Role', 'Hours', 'Unit', 'Rate (AED)', 'Amount (AED)']],
            body: labourTableData,
            margin: { left: 22 },
            theme: 'grid',
            headStyles: {
              fillColor: [216, 180, 254],
              textColor: [107, 33, 168],
              fontStyle: 'bold',
              fontSize: 7
            },
            bodyStyles: {
              fontSize: 7,
              textColor: [55, 65, 81]
            },
            columnStyles: {
              0: { cellWidth: 60 },
              1: { cellWidth: 20, halign: 'center' },
              2: { cellWidth: 20, halign: 'center' },
              3: { cellWidth: 30, halign: 'right' },
              4: { cellWidth: 30, halign: 'right' }
            },
            didDrawPage: (data: any) => {
              yPos = data.cursor.y + 3;
            }
          });

          yPos = (doc as any).lastAutoTable.finalY + 3;
        }

        // Sub-item total
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(59, 130, 246);
        doc.text('Sub-item Total:', 24, yPos);
        doc.text(`AED ${formatCurrency(subMaterialTotal + subLabourTotal)}`, 168, yPos, { align: 'right' });
        doc.setTextColor(0);
        yPos += 8;
      });

      // Item-level calculations for misc, overhead, profit, etc.
      itemBaseCost = item.sub_items!.reduce((sum, si) => sum + si.materials_cost + si.labour_cost, 0);
      misc = (item as any).miscellaneous_amount || (itemBaseCost * ((item as any).miscellaneous_percentage || 0) / 100);
      overhead = (item as any).overhead_amount || (itemBaseCost * (item.overheadPercentage || (item as any).overhead_percentage || 0) / 100);
      profit = (item as any).profit_margin_amount || (itemBaseCost * (item.profitMarginPercentage || (item as any).profit_margin_percentage || 0) / 100);
      itemSubtotal = itemBaseCost + misc + overhead + profit;
      discount = itemSubtotal * (item.discountPercentage || 0) / 100;
      itemAfterDiscount = itemSubtotal - discount;
      itemVat = itemAfterDiscount * (item.vat_percentage || 0) / 100;
      itemFinalPrice = itemAfterDiscount + itemVat;
    } else {
      // OLD FORMAT: Item without sub-items - show materials/labour directly
      const materialTotal = item.materials.reduce((sum, m) => sum + m.amount, 0);
      itemBaseCost = materialTotal + item.laborCost;
      misc = (item as any).miscellaneous_amount || (itemBaseCost * ((item as any).miscellaneous_percentage || 0) / 100);
      overhead = (item as any).overhead_amount || (itemBaseCost * (item.overheadPercentage || (item as any).overhead_percentage || 0) / 100);
      profit = (item as any).profit_margin_amount || (itemBaseCost * (item.profitMarginPercentage || (item as any).profit_margin_percentage || 0) / 100);
      itemSubtotal = itemBaseCost + misc + overhead + profit;
      discount = itemSubtotal * (item.discountPercentage || 0) / 100;
      itemAfterDiscount = itemSubtotal - discount;
      itemVat = itemAfterDiscount * (item.vat_percentage || 0) / 100;
      itemFinalPrice = itemAfterDiscount + itemVat;

      // Materials Section - Professional Table
      if (item.materials.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(37, 99, 235);
        doc.text('+ RAW MATERIALS', 18, yPos);
        doc.setTextColor(0);
        yPos += 3;

        const materialsTableData = item.materials.map(mat => [
          mat.name,
          mat.quantity,
          mat.unit,
          formatCurrency(mat.rate),
          formatCurrency(mat.amount)
        ]);

        materialsTableData.push([
          { content: 'Total Materials:', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: formatCurrency(materialTotal), styles: { fontStyle: 'bold', fillColor: [219, 234, 254] } }
        ]);

        (autoTable as any)(doc, {
          startY: yPos,
          head: [['Material Name', 'Qty', 'Unit', 'Rate (AED)', 'Amount (AED)']],
          body: materialsTableData,
          margin: { left: 18 },
          theme: 'grid',
          headStyles: {
            fillColor: [191, 219, 254],
            textColor: [30, 64, 175],
            fontStyle: 'bold',
            fontSize: 8
          },
          bodyStyles: {
            fontSize: 8,
            textColor: [55, 65, 81]
          },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 20, halign: 'center' },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 35, halign: 'right' }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 5;
      }

      // Labor Section - Professional Table
      if (item.labour && item.labour.length > 0) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(126, 34, 206);
        doc.text('+ LABOUR', 18, yPos);
        doc.setTextColor(0);
        yPos += 3;

        const labourTableData = item.labour.map(lab => [
          lab.type,
          lab.quantity,
          lab.unit,
          formatCurrency(lab.rate),
          formatCurrency(lab.amount)
        ]);

        labourTableData.push([
          { content: 'Total Labour:', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: formatCurrency(item.laborCost), styles: { fontStyle: 'bold', fillColor: [233, 213, 255] } }
        ]);

        (autoTable as any)(doc, {
          startY: yPos,
          head: [['Labour Type', 'Hours/Qty', 'Unit', 'Rate (AED)', 'Amount (AED)']],
          body: labourTableData,
          margin: { left: 18 },
          theme: 'grid',
          headStyles: {
            fillColor: [216, 180, 254],
            textColor: [107, 33, 168],
            fontStyle: 'bold',
            fontSize: 8
          },
          bodyStyles: {
            fontSize: 8,
            textColor: [55, 65, 81]
          },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 20, halign: 'center' },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 35, halign: 'right' }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 5;
      }
    }

    // Cost Breakdown Table - Professional Format
    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(234, 88, 12);
    doc.text('+ MISC, OVERHEADS, PROFIT, DISCOUNT & VAT', 18, yPos);
    doc.setTextColor(0);
    yPos += 3;

    const costBreakdownData: any[] = [];

    const miscPct = (item as any).miscellaneous_percentage || 0;
    const overheadPct = item.overheadPercentage || (item as any).overhead_percentage || 0;
    const profitPct = item.profitMarginPercentage || (item as any).profit_margin_percentage || 0;

    if (misc > 0) {
      costBreakdownData.push(['Miscellaneous', `${miscPct.toFixed(1)}%`, formatCurrency(misc)]);
    }
    costBreakdownData.push(['Overhead', `${overheadPct.toFixed(1)}%`, formatCurrency(overhead)]);
    costBreakdownData.push(['Profit Margin', `${profitPct.toFixed(1)}%`, formatCurrency(profit)]);

    if (discount > 0) {
      costBreakdownData.push([
        { content: 'Discount', styles: { textColor: [220, 38, 38] } },
        { content: `${(item.discountPercentage || 0).toFixed(1)}%`, styles: { textColor: [220, 38, 38] } },
        { content: `- ${formatCurrency(discount)}`, styles: { textColor: [220, 38, 38] } }
      ]);
    }

    costBreakdownData.push([
      { content: 'Subtotal (After Discount):', colSpan: 2, styles: { fontStyle: 'bold' } },
      { content: formatCurrency(itemAfterDiscount), styles: { fontStyle: 'bold' } }
    ]);

    costBreakdownData.push(['VAT', `${(item.vat_percentage || 0).toFixed(1)}%`, formatCurrency(itemVat)]);

    costBreakdownData.push([
      { content: 'Estimated Selling Price:', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [209, 250, 229], textColor: [22, 163, 74] } },
      { content: formatCurrency(itemFinalPrice), styles: { fontStyle: 'bold', fillColor: [209, 250, 229], textColor: [22, 163, 74] } }
    ]);

    (autoTable as any)(doc, {
      startY: yPos,
      head: [['Description', 'Percentage', 'Amount (AED)']],
      body: costBreakdownData,
      margin: { left: 18 },
      theme: 'grid',
      headStyles: {
        fillColor: [254, 243, 199],
        textColor: [146, 64, 14],
        fontStyle: 'bold',
        fontSize: 8
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [55, 65, 81]
      },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 50, halign: 'right' }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;
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
  // Box height for VAT (without preliminaries)
  doc.roundedRect(14, yPos, 182, 50, 2, 2, 'FD');

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
  yPos += 5;

  // Subtotal after discount
  doc.setFont('helvetica', 'bold');
  doc.text('Subtotal:', leftX, yPos);
  doc.text(`AED ${formatCurrency(afterDiscount)}`, leftX + 50, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 5;

  // VAT
  const avgVatPct = afterDiscount > 0 ? (totalVat / afterDiscount) * 100 : 0;
  doc.text(`VAT (${avgVatPct.toFixed(1)}%):`, leftX, yPos);
  doc.text(`AED ${formatCurrency(totalVat)}`, leftX + 50, yPos);
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

  // Preliminaries & Approval Works Section
  if (estimation.preliminaries && (estimation.preliminaries.items?.length > 0 || estimation.preliminaries.notes)) {
    yPos += 20;

    // Add new page if needed
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 60, 200);
    doc.text('PRELIMINARIES & APPROVAL WORKS', 14, yPos);
    yPos += 7;

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'italic');
    doc.text('Selected conditions and terms', 14, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0);

    if (estimation.preliminaries.items && estimation.preliminaries.items.length > 0) {
      estimation.preliminaries.items.forEach((item: any) => {
        const description = item.description || item;
        // Check if we need a new page
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text('✓', 16, yPos);
        const splitText = doc.splitTextToSize(description, 175);
        doc.text(splitText, 22, yPos);
        yPos += (splitText.length * 5) + 2;
      });
    }

    if (estimation.preliminaries.notes) {
      yPos += 5;
      if (yPos > 265) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.text('Additional Notes:', 14, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      const splitNotes = doc.splitTextToSize(estimation.preliminaries.notes, 180);
      doc.text(splitNotes, 14, yPos);
      yPos += (splitNotes.length * 5);
    }
  }

  // Signature Section
  yPos += 20;
  if (yPos > 240) {
    doc.addPage();
    yPos = 20;
  }

  doc.setDrawColor(150);
  doc.setLineWidth(0.3);
  doc.line(14, yPos, 196, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);

  // Estimator Signature
  doc.text('Prepared By:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  yPos += 15;
  doc.line(20, yPos, 80, yPos);
  yPos += 5;
  doc.text('Estimator Signature', 20, yPos);
  doc.text(`Date: __________`, 20, yPos + 5);

  // Approved By Signature
  yPos -= 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Approved By:', 120, yPos);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  yPos += 15;
  doc.line(120, yPos, 180, yPos);
  yPos += 5;
  doc.text('Technical Director Signature', 120, yPos);
  doc.text(`Date: __________`, 120, yPos + 5);

  // Save PDF
  const fileName = `BOQ_${estimation.projectName.replace(/\s+/g, '_')}_Internal_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

/**
 * Export BOQ as PDF - Client Format (Overhead & Profit distributed into materials and labor)
 * Beautiful corporate template - Clean version for clients
 */
export const exportBOQToPDFClient = async (estimation: BOQEstimation) => {
  // Use HTML template (boq_client.html) with REAL data
  const { exportBOQToPDFClient: exportClient } = await import('./boqHtmlToPdf');
  return exportClient(estimation);
};

/**
 * OLD CLIENT PDF EXPORT - DEPRECATED
 */
const exportBOQToPDFClientOld = async (estimation: BOQEstimation) => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF();
  let yPos = 15;

  // Calculate total from items - CLIENT VERSION: Selling price with distributed markup
  const baseCost = estimation.materialCost + estimation.laborCost;
  let totalOverhead = 0;
  let totalProfit = 0;
  let totalDiscount = 0;
  let totalVat = 0;

  (estimation.boqItems || []).forEach((item) => {
    const itemBaseCost = item.materials.reduce((sum, m) => sum + m.amount, 0) + item.laborCost;
    const itemOverhead = itemBaseCost * (item.overheadPercentage || 0) / 100;
    const itemProfit = itemBaseCost * (item.profitMarginPercentage || 0) / 100;
    const itemSubtotal = itemBaseCost + itemOverhead + itemProfit;
    const itemDiscount = itemSubtotal * (item.discountPercentage || 0) / 100;
    const itemAfterDiscount = itemSubtotal - itemDiscount;
    // Use vat_amount if available, otherwise calculate from percentage
    const itemVat = item.vat_amount || (itemAfterDiscount * (item.vat_percentage || 0) / 100);

    totalOverhead += itemOverhead;
    totalProfit += itemProfit;
    totalDiscount += itemDiscount;
    totalVat += itemVat;
  });

  // Use totalVatAmount from estimation if available (includes overall VAT + item-level VAT)
  if (estimation.totalVatAmount !== undefined && estimation.totalVatAmount > 0) {
    totalVat = estimation.totalVatAmount;
  }

  const totalMarkup = totalOverhead + totalProfit;
  const subtotal = baseCost + totalMarkup;
  const afterDiscount = subtotal - totalDiscount;
  const afterVat = afterDiscount + totalVat;
  const grandTotal = afterVat;

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

  // BOQ Items - CLIENT VERSION: Show only items and sub-items (NO materials/labour)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(36, 61, 138);
  doc.text('SCOPE OF WORK', 14, yPos);
  yPos += 8;

  (estimation.boqItems || []).forEach((item, itemIndex) => {
    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

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

    // Check if item has sub-items
    const hasSubItems = item.has_sub_items && item.sub_items && item.sub_items.length > 0;

    if (hasSubItems) {
      // CLIENT VERSION: Professional sub-items table (NO materials/labour)
      yPos += 2;

      // Get item-level amounts (misc, overhead, profit)
      const itemMisc = (item as any).miscellaneous_amount || 0;
      const itemOverhead = (item as any).overhead_amount || 0;
      const itemProfit = (item as any).profit_margin_amount || 0;
      const itemBaseCost = item.sub_items!.reduce((sum, si) => sum + si.materials_cost + si.labour_cost, 0);

      // Build sub-items table data
      const subItemsTableData = item.sub_items!.map((subItem, sIdx) => {
        const subItemBase = subItem.materials_cost + subItem.labour_cost;
        // Distribute misc + overhead + profit proportionally to sub-items
        const subItemMarkup = itemBaseCost > 0 ? (subItemBase / itemBaseCost) * (itemMisc + itemOverhead + itemProfit) : 0;
        const subItemTotal = subItemBase + subItemMarkup;
        const adjustedRate = subItem.quantity > 0 ? subItemTotal / subItem.quantity : 0;

        // Build comprehensive scope/size display
        const scopeParts = [];
        if (subItem.scope) scopeParts.push(`Scope: ${subItem.scope}`);
        if (subItem.size) scopeParts.push(`Size: ${subItem.size}`);
        if (subItem.location) scopeParts.push(`Loc: ${subItem.location}`);
        if (subItem.brand) scopeParts.push(`Brand: ${subItem.brand}`);
        const details = scopeParts.join(' | ') || '-';

        return [
          `Sub Item ${sIdx + 1}: ${subItem.sub_item_name}\n${details}`,
          `${subItem.quantity}`,
          subItem.unit,
          formatCurrency(adjustedRate),
          formatCurrency(subItemTotal)
        ];
      });

      (autoTable as any)(doc, {
        startY: yPos,
        head: [['Description', 'Qty', 'Unit', 'Rate (AED)', 'Amount (AED)']],
        body: subItemsTableData,
        margin: { left: 18 },
        theme: 'grid',
        headStyles: {
          fillColor: [191, 219, 254],
          textColor: [30, 64, 175],
          fontStyle: 'bold',
          fontSize: 8
        },
        bodyStyles: {
          fontSize: 7,
          textColor: [55, 65, 81]
        },
        columnStyles: {
          0: { cellWidth: 85 },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 18, halign: 'center' },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' }
        },
        styles: {
          lineColor: [191, 219, 254],
          lineWidth: 0.1
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 3;
    } else {
      // Old format: No sub-items
      doc.setFontSize(8);
      doc.text(`Qty: ${item.quantity} ${item.unit} | Rate: AED ${formatCurrency(item.rate)}/${item.unit}`, 16, yPos);
      yPos += 7;
    }

    // Item Total
    if (yPos > 265) {
      doc.addPage();
      yPos = 20;
    }

    const itemTotalWithMarkup = item.estimatedSellingPrice;
    doc.setFillColor(240, 255, 240);
    doc.rect(16, yPos - 2, 178, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(22, 163, 74);
    doc.text('Total:', 18, yPos + 3);
    doc.text(`AED ${formatCurrency(itemTotalWithMarkup)}`, 170, yPos + 3, { align: 'right' });
    doc.setTextColor(0);
    yPos += 12;
  });

  // Add Cost Summary at the END - CLIENT VERSION (Match comparison modal exactly)
  if (yPos > 200) {
    doc.addPage();
    yPos = 20;
  }

  yPos += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(36, 61, 138);
  doc.text('COST BREAKDOWN', 14, yPos);
  yPos += 5;

  // Calculate totals matching comparison modal logic (lines 3344-3360)
  let clientTotalItemTotal = 0;
  let clientTotalDiscount = 0;
  let clientTotalVAT = 0;

  (estimation.boqItems || []).forEach((item: any) => {
    const itemTotal = (item as any).item_total || (item.quantity * item.rate) || 0;
    const itemMisc = (item as any).miscellaneous_amount || 0;
    const itemOHProfit = (item as any).overhead_profit_amount || 0;
    const discountAmount = (item as any).discount_amount || 0;
    const vatAmount = (item as any).vat_amount || 0;

    clientTotalItemTotal += itemTotal + itemMisc + itemOHProfit; // Base cost includes markup
    clientTotalDiscount += discountAmount;
    clientTotalVAT += vatAmount;
  });

  const clientSubtotalBeforeDiscount = clientTotalItemTotal;
  const clientAfterDiscount = clientSubtotalBeforeDiscount - clientTotalDiscount;
  const clientFinalTotal = clientAfterDiscount + clientTotalVAT;
  const clientAvgDiscountPct = clientSubtotalBeforeDiscount > 0 ? (clientTotalDiscount / clientSubtotalBeforeDiscount) * 100 : 0;

  // Create cost summary table
  const costSummaryData: any[] = [
    ['Base Cost:', formatCurrency(clientSubtotalBeforeDiscount)]
  ];

  if (clientTotalDiscount > 0) {
    costSummaryData.push([
      { content: `Discount (${clientAvgDiscountPct.toFixed(0)}%):`, styles: { textColor: [239, 68, 68] } },
      { content: `- ${formatCurrency(clientTotalDiscount)}`, styles: { textColor: [239, 68, 68] } }
    ]);
  }

  if (clientTotalVAT > 0) {
    costSummaryData.push([
      { content: 'VAT:', styles: { textColor: [59, 130, 246] } },
      { content: `+ ${formatCurrency(clientTotalVAT)}`, styles: { textColor: [59, 130, 246] } }
    ]);
  }

  costSummaryData.push([
    { content: 'Total:', styles: { fontStyle: 'bold', fontSize: 11, fillColor: [209, 250, 229], textColor: [22, 163, 74] } },
    { content: formatCurrency(clientFinalTotal), styles: { fontStyle: 'bold', fontSize: 11, fillColor: [209, 250, 229], textColor: [22, 163, 74] } }
  ]);

  (autoTable as any)(doc, {
    startY: yPos,
    body: costSummaryData,
    margin: { left: 14 },
    theme: 'grid',
    styles: {
      lineColor: [191, 219, 254],
      lineWidth: 0.5
    },
    bodyStyles: {
      fontSize: 10,
      textColor: [55, 65, 81]
    },
    columnStyles: {
      0: { cellWidth: 120, fontStyle: 'bold' },
      1: { cellWidth: 62, halign: 'right', fontStyle: 'bold' }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Preliminaries & Approval Works Section
  if (estimation.preliminaries && (estimation.preliminaries.items?.length > 0 || estimation.preliminaries.notes)) {
    yPos += 20;

    // Add new page if needed
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 60, 200);
    doc.text('PRELIMINARIES & APPROVAL WORKS', 14, yPos);
    yPos += 7;

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'italic');
    doc.text('Selected conditions and terms', 14, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0);

    if (estimation.preliminaries.items && estimation.preliminaries.items.length > 0) {
      estimation.preliminaries.items.forEach((item: any) => {
        const description = item.description || item;
        // Check if we need a new page
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text('✓', 16, yPos);
        const splitText = doc.splitTextToSize(description, 175);
        doc.text(splitText, 22, yPos);
        yPos += (splitText.length * 5) + 2;
      });
    }

    if (estimation.preliminaries.notes) {
      yPos += 5;
      if (yPos > 265) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.text('Additional Notes:', 14, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      const splitNotes = doc.splitTextToSize(estimation.preliminaries.notes, 180);
      doc.text(splitNotes, 14, yPos);
      yPos += (splitNotes.length * 5);
    }
  }

  // Signature Section
  yPos += 20;
  if (yPos > 240) {
    doc.addPage();
    yPos = 20;
  }

  doc.setDrawColor(150);
  doc.setLineWidth(0.3);
  doc.line(14, yPos, 196, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);

  // Company Signature
  doc.text('For MeterSquare:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  yPos += 15;
  doc.line(20, yPos, 80, yPos);
  yPos += 5;
  doc.text('Authorized Signature', 20, yPos);
  doc.text(`Date: __________`, 20, yPos + 5);

  // Client Signature
  yPos -= 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Client Acceptance:', 120, yPos);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  yPos += 15;
  doc.line(120, yPos, 180, yPos);
  yPos += 5;
  doc.text('Client Signature', 120, yPos);
  doc.text(`Date: __________`, 120, yPos + 5);

  // Save PDF
  const fileName = `BOQ_${estimation.projectName.replace(/\s+/g, '_')}_Client_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};
