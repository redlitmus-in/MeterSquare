/**
 * BOQ HTML to PDF Converter
 * Uses JavaScript template literals (converted from Jinja2 templates)
 * Fills them with REAL data and converts to PDF
 */

import { generateClientHTML, generateInternalHTML } from './boqTemplates_new';

interface BOQEstimation {
  projectName: string;
  clientName: string;
  location: string;
  submittedDate: string;
  floor: string;
  workingHours: string;
  totalValue: number;
  totalVatAmount?: number;
  materialCost: number;
  laborCost: number;
  estimator: string;
  boqItems?: any[];
  preliminaries?: {
    items?: any[];
    notes?: string;
  };
}

/**
 * Format currency
 */
const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Format date
 */
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

/**
 * Prepare sections data for CLIENT BOQ
 */
const prepareSectionsClient = (boqItems: any[]): any[] => {
  return boqItems.map((item, idx) => {
    const section = {
      title: item.description,
      items: [] as any[]
    };

    if (item.has_sub_items && item.sub_items && item.sub_items.length > 0) {
      item.sub_items.forEach((subItem: any, subIdx: number) => {
        const scopeParts = [];
        if (subItem.scope) scopeParts.push(`Scope: ${subItem.scope}`);
        if (subItem.size) scopeParts.push(`Size: ${subItem.size}`);

        section.items.push({
          sno: `${idx + 1}.${subIdx + 1}`,
          name: subItem.sub_item_name,
          scope: scopeParts.join(' | ') || null,
          size: null,
          qty: subItem.quantity,
          units: subItem.unit,
          unit_price: subItem.rate,
          total: subItem.quantity * subItem.rate
        });
      });
    } else {
      section.items.push({
        sno: `${idx + 1}`,
        name: item.description,
        scope: item.briefDescription || null,
        size: null,
        qty: item.quantity,
        units: item.unit,
        unit_price: item.rate,
        total: item.estimatedSellingPrice
      });
    }

    return section;
  });
};

/**
 * Prepare sections data for INTERNAL BOQ with detailed breakdown
 */
const prepareSectionsInternal = (boqItems: any[]): any[] => {
  return boqItems.map((item, idx) => {
    const section = {
      title: item.description,
      items: [] as any[]
    };

    if (item.has_sub_items && item.sub_items && item.sub_items.length > 0) {
      // Get percentages from ITEM level (not sub-item)
      const itemMiscPercent = item.miscellaneous_percentage || item.overhead_percentage || 0;
      const itemOverheadPercent = item.overhead_profit_percentage || item.profit_margin_percentage || 0;

      item.sub_items.forEach((subItem: any, subIdx: number) => {
        // Calculate costs from materials and labour
        const materials = subItem.materials || [];
        const labour = subItem.labour || [];

        const rawMaterialsCost = materials.reduce((sum: number, m: any) => sum + (m.total_price || m.amount || 0), 0);
        const labourCost = labour.reduce((sum: number, l: any) => sum + (l.total_cost || l.amount || 0), 0);
        const baseCost = rawMaterialsCost + labourCost;

        // Apply item-level percentages to sub-item base cost
        const miscAmount = baseCost * (itemMiscPercent / 100);
        const overheadAmount = baseCost * (itemOverheadPercent / 100);

        const internalCost = baseCost + miscAmount + overheadAmount;
        const clientCost = subItem.quantity * subItem.rate;
        const plannedProfit = overheadAmount; // Overhead/Profit percentage is the planned profit
        const negotiableMargin = clientCost - internalCost;

        section.items.push({
          sno: `${idx + 1}.${subIdx + 1}`,
          name: subItem.sub_item_name,
          scope: subItem.scope || null,
          size: subItem.size || null,
          qty: subItem.quantity,
          units: subItem.unit,
          unit_price: subItem.rate,
          total: clientCost,

          // Detailed breakdown
          materials: materials.map((m: any) => ({
            name: m.material_name,
            qty: m.quantity,
            unit: m.unit,
            rate: m.unit_price,
            total: m.total_price
          })),
          labour: labour.map((l: any) => ({
            role: l.labour_role,
            hours: l.hours,
            rate: l.rate_per_hour,
            total: l.total_cost
          })),

          // Cost breakdown
          rawMaterialsCost: rawMaterialsCost,
          labourCost: labourCost,
          miscPercent: itemMiscPercent,
          miscAmount: miscAmount,
          overheadPercent: itemOverheadPercent,
          overheadAmount: overheadAmount,
          transportPercent: 0, // Not used in the system
          transportAmount: 0, // Not used in the system
          internalCost: internalCost,
          clientCost: clientCost,
          plannedProfit: plannedProfit,
          negotiableMargin: negotiableMargin
        });
      });
    } else {
      // Single item without sub-items
      const materials = item.materials || [];
      const labour = item.labour || [];

      const rawMaterialsCost = materials.reduce((sum: number, m: any) => sum + (m.total_price || m.amount || 0), 0);
      const labourCost = labour.reduce((sum: number, l: any) => sum + (l.total_cost || l.amount || 0), 0);
      const baseCost = rawMaterialsCost + labourCost;

      // Get percentages from item
      const miscPercent = item.miscellaneous_percentage || item.overhead_percentage || 0;
      const overheadPercent = item.overhead_profit_percentage || item.profit_margin_percentage || 0;

      const miscAmount = baseCost * (miscPercent / 100);
      const overheadAmount = baseCost * (overheadPercent / 100);

      const internalCost = baseCost + miscAmount + overheadAmount;
      const clientCost = item.estimatedSellingPrice || 0;
      const plannedProfit = overheadAmount;
      const negotiableMargin = clientCost - internalCost;

      section.items.push({
        sno: `${idx + 1}`,
        name: item.description,
        scope: item.briefDescription || null,
        size: null,
        qty: item.quantity,
        units: item.unit,
        unit_price: item.rate,
        total: clientCost,

        materials: materials.map((m: any) => ({
          name: m.material_name,
          qty: m.quantity,
          unit: m.unit,
          rate: m.unit_price,
          total: m.total_price
        })),
        labour: labour.map((l: any) => ({
          role: l.labour_role,
          hours: l.hours,
          rate: l.rate_per_hour,
          total: l.total_cost
        })),

        rawMaterialsCost: rawMaterialsCost,
        labourCost: labourCost,
        miscPercent: miscPercent,
        miscAmount: miscAmount,
        overheadPercent: overheadPercent,
        overheadAmount: overheadAmount,
        transportPercent: 0, // Not used in the system
        transportAmount: 0, // Not used in the system
        internalCost: internalCost,
        clientCost: clientCost,
        plannedProfit: plannedProfit,
        negotiableMargin: negotiableMargin
      });
    }

    return section;
  });
};

/**
 * Export CLIENT BOQ to PDF using JavaScript template
 */
export const exportBOQToPDFClient = async (estimation: BOQEstimation) => {
  try {
    const sections = prepareSectionsClient(estimation.boqItems || []);

    // Calculate subtotal from all items (sum of qty × rate)
    let calculatedSubtotal = 0;
    (estimation.boqItems || []).forEach((item: any) => {
      if (item.has_sub_items && item.sub_items && item.sub_items.length > 0) {
        item.sub_items.forEach((subItem: any) => {
          calculatedSubtotal += (subItem.quantity || 0) * (subItem.rate || 0);
        });
      } else {
        calculatedSubtotal += item.estimatedSellingPrice || 0;
      }
    });

    // Get discount from estimation
    const discountAmount = (estimation as any).discount_amount || 0;
    const discountPercentage = estimation.discountPercentage || 0;

    // Calculate actual discount (use provided amount or calculate from percentage)
    let discount = discountAmount;
    if (discount === 0 && discountPercentage > 0) {
      discount = calculatedSubtotal * (discountPercentage / 100);
    }

    const afterDiscount = calculatedSubtotal - discount;
    const vat = estimation.totalVatAmount || 0;
    const grandTotal = afterDiscount + vat;

    // Prepare preliminaries items from the estimation
    const preliminariesItems = estimation.preliminaries?.items?.map((item: any) =>
      typeof item === 'string' ? item : (item.description || item.name || '')
    ) || [];

    const data = {
      projectName: estimation.projectName,
      clientName: estimation.clientName,
      location: estimation.location,
      quotationDate: formatDate(estimation.submittedDate),
      sections: sections,
      subtotal: formatCurrency(calculatedSubtotal),
      discount: discount > 0 ? formatCurrency(discount) : undefined,
      discountPercentage: discount > 0 ? discountPercentage : undefined,
      afterDiscount: formatCurrency(afterDiscount),
      vat: vat > 0 ? formatCurrency(vat) : undefined,
      vatRate: 5,
      grandTotal: formatCurrency(grandTotal),
      preliminariesItems: preliminariesItems,
      notes: estimation.preliminaries?.notes || 'All authority charges & deposits are excluded.'
    };

    // Generate HTML using JavaScript template
    const html = generateClientHTML(data);

    // Convert HTML to PDF using browser print
    await printHtmlToPDF(html, `BOQ_${estimation.projectName}_Client_${new Date().toISOString().split('T')[0]}.pdf`);

  } catch (error) {
    console.error('Error generating client PDF:', error);
    throw error;
  }
};

/**
 * Export INTERNAL BOQ to PDF using JavaScript template
 */
export const exportBOQToPDFInternal = async (estimation: BOQEstimation) => {
  try {
    const sections = prepareSectionsInternal(estimation.boqItems || []);

    // Calculate totals from all items
    let totalClientCost = 0;
    let totalInternalCost = 0;
    let totalPlannedProfit = 0;

    sections.forEach(section => {
      section.items.forEach((item: any) => {
        totalClientCost += item.clientCost || 0;
        totalInternalCost += item.internalCost || 0;
        totalPlannedProfit += item.plannedProfit || 0;
      });
    });

    const projectMargin = totalClientCost - totalInternalCost - totalPlannedProfit;

    const data = {
      projectName: estimation.projectName,
      clientName: estimation.clientName,
      location: estimation.location,
      quotationDate: formatDate(estimation.submittedDate),
      sections: sections,
      clientCost: totalClientCost,
      internalCost: totalInternalCost,
      totalPlannedProfit: totalPlannedProfit,
      projectMargin: projectMargin
    };

    // Generate HTML using JavaScript template
    const html = generateInternalHTML(data);

    // Convert HTML to PDF
    await printHtmlToPDF(html, `BOQ_${estimation.projectName}_Internal_${new Date().toISOString().split('T')[0]}.pdf`);

  } catch (error) {
    console.error('Error generating internal PDF:', error);
    throw error;
  }
};

/**
 * Convert HTML to PDF using browser print dialog
 */
const printHtmlToPDF = async (html: string, filename: string): Promise<void> => {
  // Create a new window with the HTML
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Could not open print window. Please allow popups.');
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for content to load
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Trigger print
  printWindow.print();

  // Close after print (user can cancel)
  setTimeout(() => {
    printWindow.close();
  }, 100);
};

export default {
  exportBOQToPDFClient,
  exportBOQToPDFInternal
};
