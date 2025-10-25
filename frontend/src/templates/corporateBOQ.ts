/**
 * Corporate-level BOQ PDF Template
 * Generates professional, accurate BOQ with proper calculations
 * Supports both CLIENT and INTERNAL versions
 */

interface BOQItem {
  description: string;
  briefDescription?: string;
  image_urls?: string[];
  sub_items?: Array<{
    sub_item_name: string;
    scope?: string;
    size?: string;
    location?: string;
    brand?: string;
    quantity: number;
    unit: string;
    rate: number;
  }>;
  materials?: Array<{
    name: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }>;
  labour?: Array<{
    type: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
  }>;
  laborCost?: number;
  materialsCost?: number;
  overheadPercentage?: number;
  profitMarginPercentage?: number;
  discountPercentage?: number;
  vat_percentage?: number;
  vat_amount?: number;
  estimatedSellingPrice: number;
}

interface BOQEstimation {
  projectName: string;
  clientName: string;
  location: string;
  submittedDate: string;
  floor?: string;
  workingHours?: string;
  boqItems: BOQItem[];
  totalValue: number;
  totalVatAmount?: number;
  preliminaries?: {
    items?: string[];
    notes?: string;
  };
}

export const generateCorporateBOQ = (estimation: BOQEstimation, type: 'client' | 'internal'): string => {

  // Calculate accurate totals
  const calculateItemTotal = (item: BOQItem): number => {
    if (item.sub_items && item.sub_items.length > 0) {
      return item.sub_items.reduce((sum, sub) => sum + (sub.quantity * sub.rate), 0);
    }
    return item.estimatedSellingPrice || 0;
  };

  const calculateMaterialsTotal = (item: BOQItem): number => {
    if (!item.materials) return 0;
    return item.materials.reduce((sum, mat) => sum + mat.amount, 0);
  };

  const calculateLabourTotal = (item: BOQItem): number => {
    if (!item.labour) return 0;
    return item.labour.reduce((sum, lab) => sum + lab.amount, 0);
  };

  const grandSubtotal = estimation.boqItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  const grandVAT = estimation.totalVatAmount || 0;
  const grandTotal = grandSubtotal + grandVAT;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>BOQ - ${estimation.projectName}</title>
  <style>
    /* Reset & Base */
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Arial', 'Helvetica', sans-serif;
      color: #1f2937;
      background: white;
      font-size: 10pt;
      line-height: 1.4;
    }

    /* Header - Appears on every page */
    @page {
      margin: 20mm 15mm 25mm 15mm;

      @top-center {
        content: element(header);
      }

      @bottom-center {
        content: element(footer);
      }
    }

    .page-header {
      position: running(header);
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      padding: 20px 30px;
      text-align: center;
      color: white;
      border-bottom: 4px solid #1e40af;
    }

    .header-logo {
      max-width: 180px;
      height: auto;
      margin-bottom: 10px;
    }

    .header-title {
      font-size: 24pt;
      font-weight: bold;
      letter-spacing: 2px;
      margin-bottom: 5px;
    }

    .header-subtitle {
      font-size: 11pt;
      opacity: 0.95;
      font-weight: 300;
    }

    .header-badge {
      position: absolute;
      top: 15px;
      right: 30px;
      background: ${type === 'internal' ? '#dc2626' : '#10b981'};
      color: white;
      padding: 6px 15px;
      border-radius: 15px;
      font-size: 9pt;
      font-weight: bold;
      letter-spacing: 1px;
    }

    /* Footer - Appears on every page */
    .page-footer {
      position: running(footer);
      padding: 12px 30px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      font-size: 8pt;
      color: #6b7280;
    }

    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .footer-left {
      text-align: left;
    }

    .footer-center {
      font-weight: 600;
      color: #1f2937;
    }

    .footer-right {
      text-align: right;
    }

    /* Project Info Box */
    .project-info {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border: 2px solid #3b82f6;
      border-radius: 8px;
      padding: 20px;
      margin: 30px 0 20px;
      page-break-inside: avoid;
    }

    .project-info h2 {
      color: #1e40af;
      font-size: 14pt;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #3b82f6;
    }

    .info-table {
      width: 100%;
      border-collapse: collapse;
    }

    .info-table td {
      padding: 8px 12px;
      border: 1px solid #bfdbfe;
      background: white;
    }

    .info-table td.label {
      font-weight: bold;
      color: #374151;
      width: 35%;
      background: #eff6ff;
    }

    .info-table td.value {
      color: #1f2937;
      width: 65%;
    }

    /* Section Headers */
    .section-header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 12px 20px;
      text-align: center;
      font-size: 13pt;
      font-weight: bold;
      letter-spacing: 1px;
      margin: 25px 0 15px;
      border-radius: 6px;
      page-break-after: avoid;
    }

    /* BOQ Items */
    .boq-item {
      margin-bottom: 25px;
      page-break-inside: avoid;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }

    .item-header {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      padding: 12px 15px;
      font-size: 11pt;
      font-weight: bold;
    }

    .item-body {
      padding: 15px;
      background: white;
    }

    .item-description {
      color: #6b7280;
      font-style: italic;
      margin-bottom: 12px;
      font-size: 9pt;
    }

    /* Images */
    .item-images {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
      flex-wrap: wrap;
    }

    .item-image {
      width: 180px;
      height: 135px;
      object-fit: cover;
      border-radius: 6px;
      border: 2px solid #e5e7eb;
    }

    /* Sub-items Table - EXACT format as your PDF */
    .sub-items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 9pt;
    }

    .sub-items-table thead {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
    }

    .sub-items-table th {
      padding: 10px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 9pt;
      border-right: 1px solid rgba(255,255,255,0.2);
    }

    .sub-items-table th:last-child {
      border-right: none;
    }

    .sub-items-table th.center {
      text-align: center;
    }

    .sub-items-table th.right {
      text-align: right;
    }

    .sub-items-table tbody tr {
      border-bottom: 1px solid #e5e7eb;
    }

    .sub-items-table tbody tr:nth-child(even) {
      background: #f9fafb;
    }

    .sub-items-table tbody tr:nth-child(odd) {
      background: white;
    }

    .sub-items-table td {
      padding: 8px;
      color: #374151;
      border-right: 1px solid #e5e7eb;
    }

    .sub-items-table td:last-child {
      border-right: none;
    }

    .sub-items-table td.center {
      text-align: center;
    }

    .sub-items-table td.right {
      text-align: right;
      font-family: 'Courier New', monospace;
      font-weight: 600;
    }

    /* Materials/Labour Tables - Internal Only */
    .breakdown-section {
      margin: 15px 0;
      page-break-inside: avoid;
    }

    .breakdown-header {
      background: #eff6ff;
      color: #1e40af;
      padding: 8px 12px;
      font-weight: bold;
      font-size: 10pt;
      border-left: 4px solid #3b82f6;
      margin-bottom: 8px;
    }

    .breakdown-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 10px;
    }

    .breakdown-table thead {
      background: #3b82f6;
      color: white;
    }

    .breakdown-table th {
      padding: 8px;
      text-align: left;
      font-size: 8pt;
      font-weight: 600;
    }

    .breakdown-table th.right {
      text-align: right;
    }

    .breakdown-table tbody tr {
      border-bottom: 1px solid #e5e7eb;
    }

    .breakdown-table td {
      padding: 6px 8px;
      color: #374151;
    }

    .breakdown-table td.right {
      text-align: right;
      font-family: 'Courier New', monospace;
    }

    .breakdown-table tfoot tr {
      background: #eff6ff;
      font-weight: bold;
      color: #1e40af;
    }

    .breakdown-table tfoot td {
      padding: 8px;
      border-top: 2px solid #3b82f6;
    }

    /* Cost Breakdown Box - Internal Only */
    .cost-breakdown-box {
      background: #f0fdf4;
      border: 2px solid #10b981;
      border-radius: 6px;
      padding: 12px;
      margin: 12px 0;
    }

    .cost-breakdown-header {
      color: #065f46;
      font-weight: bold;
      font-size: 10pt;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #10b981;
    }

    .cost-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 9pt;
      border-bottom: 1px solid #d1fae5;
    }

    .cost-row.total {
      background: #d1fae5;
      padding: 8px 10px;
      margin-top: 8px;
      border-radius: 4px;
      font-weight: bold;
      color: #065f46;
      font-size: 10pt;
      border-bottom: none;
    }

    /* Item Total */
    .item-total {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 12px 15px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: bold;
      font-size: 11pt;
      margin-top: 12px;
    }

    /* Cost Summary */
    .cost-summary {
      background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
      color: white;
      padding: 25px;
      margin: 30px 0;
      border-radius: 8px;
      page-break-inside: avoid;
    }

    .cost-summary h2 {
      font-size: 16pt;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #3b82f6;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.15);
      font-size: 11pt;
    }

    .summary-row.total {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      padding: 15px;
      border-radius: 6px;
      margin-top: 15px;
      border: none;
      font-size: 14pt;
      font-weight: bold;
    }

    /* Preliminaries */
    .preliminaries {
      margin: 25px 0;
      padding: 20px;
      background: #faf5ff;
      border: 2px solid #a855f7;
      border-radius: 8px;
      page-break-inside: avoid;
    }

    .preliminaries h3 {
      color: #7c3aed;
      font-size: 12pt;
      margin-bottom: 12px;
    }

    .prelim-item {
      padding: 6px 0;
      padding-left: 20px;
      position: relative;
      font-size: 9pt;
    }

    .prelim-item:before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #7c3aed;
      font-weight: bold;
    }

    /* Page breaks */
    .page-break {
      page-break-before: always;
    }

    /* Print optimizations */
    @media print {
      .boq-item { page-break-inside: avoid; }
      .project-info { page-break-inside: avoid; }
      .cost-summary { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <!-- Header (appears on every page) -->
  <div class="page-header">
    <!-- Logo - Update this path to your actual logo -->
    <img src="/logo.png" alt="Company Logo" class="header-logo" />
    <div class="header-title">BILL OF QUANTITIES</div>
    <div class="header-subtitle">Professional Construction Estimate</div>
    <div class="header-badge">${type.toUpperCase()}</div>
  </div>

  <!-- Footer (appears on every page) -->
  <div class="page-footer">
    <div class="footer-content">
      <div class="footer-left">${estimation.projectName}</div>
      <div class="footer-center">MeterSquare ERP - Professional Construction Management</div>
      <div class="footer-right">Generated: ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>
  </div>

  <!-- Project Information -->
  <div class="project-info">
    <h2>PROJECT INFORMATION</h2>
    <table class="info-table">
      <tr>
        <td class="label">Project Name:</td>
        <td class="value">${estimation.projectName}</td>
        <td class="label">Client Name:</td>
        <td class="value">${estimation.clientName}</td>
      </tr>
      <tr>
        <td class="label">Location:</td>
        <td class="value">${estimation.location}</td>
        <td class="label">Date:</td>
        <td class="value">${new Date(estimation.submittedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
      </tr>
      ${estimation.floor || estimation.workingHours ? `
      <tr>
        ${estimation.floor ? `<td class="label">Floor:</td><td class="value">${estimation.floor}</td>` : '<td colspan="2"></td>'}
        ${estimation.workingHours ? `<td class="label">Working Hours:</td><td class="value">${estimation.workingHours}</td>` : '<td colspan="2"></td>'}
      </tr>
      ` : ''}
    </table>
  </div>

  <!-- Section Header -->
  <div class="section-header">SCOPE OF WORK</div>

  <!-- BOQ Items -->
  ${estimation.boqItems.map((item: BOQItem, idx: number) => {
    const itemTotal = calculateItemTotal(item);
    const materialsTotal = calculateMaterialsTotal(item);
    const labourTotal = calculateLabourTotal(item);
    const baseCost = materialsTotal + labourTotal;
    const overheadAmount = baseCost * (item.overheadPercentage || 0) / 100;
    const profitAmount = baseCost * (item.profitMarginPercentage || 0) / 100;

    return `
    <div class="boq-item">
      <div class="item-header">${idx + 1}. ${item.description}</div>

      <div class="item-body">
        ${item.briefDescription ? `<div class="item-description">${item.briefDescription}</div>` : ''}

        <!-- Images from Supabase -->
        ${item.image_urls && item.image_urls.length > 0 ? `
          <div class="item-images">
            ${item.image_urls.map((url: string) => `
              <img src="${url}" class="item-image" alt="Item reference" />
            `).join('')}
          </div>
        ` : ''}

        <!-- Sub-items Table - EXACT format -->
        ${item.sub_items && item.sub_items.length > 0 ? `
          <table class="sub-items-table">
            <thead>
              <tr>
                <th style="width: 5%;" class="center">#</th>
                <th style="width: 35%;">Description</th>
                <th style="width: 20%;">Scope / Size / Location</th>
                <th style="width: 8%;" class="center">Qty</th>
                <th style="width: 8%;" class="center">Unit</th>
                <th style="width: 12%;" class="right">Rate (AED)</th>
                <th style="width: 12%;" class="right">Amount (AED)</th>
              </tr>
            </thead>
            <tbody>
              ${item.sub_items.map((sub: any, subIdx: number) => {
                const scopeParts = [sub.scope, sub.size, sub.location, sub.brand].filter(Boolean);
                const scopeDisplay = scopeParts.length > 0 ? scopeParts.join(' | ') : '-';
                const subTotal = sub.quantity * sub.rate;

                return `
                  <tr>
                    <td class="center">${subIdx + 1}</td>
                    <td>${sub.sub_item_name}</td>
                    <td>${scopeDisplay}</td>
                    <td class="center">${sub.quantity.toFixed(2)}</td>
                    <td class="center">${sub.unit}</td>
                    <td class="right">${sub.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="right">${subTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : ''}

        ${type === 'internal' ? `
          <!-- INTERNAL ONLY: Materials Breakdown -->
          ${item.materials && item.materials.length > 0 ? `
            <div class="breakdown-section">
              <div class="breakdown-header">📦 Raw Materials Breakdown</div>
              <table class="breakdown-table">
                <thead>
                  <tr>
                    <th style="width: 40%;">Material Name</th>
                    <th style="width: 15%;" class="right">Quantity</th>
                    <th style="width: 10%;">Unit</th>
                    <th style="width: 17%;" class="right">Rate (AED)</th>
                    <th style="width: 18%;" class="right">Amount (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  ${item.materials.map((mat: any) => `
                    <tr>
                      <td>${mat.name}</td>
                      <td class="right">${mat.quantity.toFixed(2)}</td>
                      <td>${mat.unit}</td>
                      <td class="right">${mat.rate.toFixed(2)}</td>
                      <td class="right">${mat.amount.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" class="right">Total Materials Cost:</td>
                    <td class="right">AED ${materialsTotal.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ` : ''}

          <!-- INTERNAL ONLY: Labour Breakdown -->
          ${item.labour && item.labour.length > 0 ? `
            <div class="breakdown-section">
              <div class="breakdown-header" style="background: #fef3c7; color: #b45309; border-left-color: #f59e0b;">👷 Labour Breakdown</div>
              <table class="breakdown-table">
                <thead>
                  <tr>
                    <th style="width: 40%;">Labour Type</th>
                    <th style="width: 15%;" class="right">Hours/Qty</th>
                    <th style="width: 10%;">Unit</th>
                    <th style="width: 17%;" class="right">Rate (AED)</th>
                    <th style="width: 18%;" class="right">Amount (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  ${item.labour.map((lab: any) => `
                    <tr>
                      <td>${lab.type}</td>
                      <td class="right">${lab.quantity.toFixed(2)}</td>
                      <td>${lab.unit}</td>
                      <td class="right">${lab.rate.toFixed(2)}</td>
                      <td class="right">${lab.amount.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" class="right">Total Labour Cost:</td>
                    <td class="right">AED ${labourTotal.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ` : ''}

          <!-- INTERNAL ONLY: Cost Breakdown -->
          <div class="cost-breakdown-box">
            <div class="cost-breakdown-header">💰 Detailed Cost Breakdown</div>
            <div class="cost-row">
              <span>Base Cost (Materials + Labour):</span>
              <span>AED ${baseCost.toFixed(2)}</span>
            </div>
            <div class="cost-row">
              <span>Overhead (${item.overheadPercentage || 0}%):</span>
              <span>AED ${overheadAmount.toFixed(2)}</span>
            </div>
            <div class="cost-row">
              <span>Profit Margin (${item.profitMarginPercentage || 0}%):</span>
              <span>AED ${profitAmount.toFixed(2)}</span>
            </div>
            ${item.discountPercentage ? `
              <div class="cost-row" style="color: #dc2626;">
                <span>Discount (${item.discountPercentage}%):</span>
                <span>-AED ${(item.estimatedSellingPrice * item.discountPercentage / 100).toFixed(2)}</span>
              </div>
            ` : ''}
            ${item.vat_percentage ? `
              <div class="cost-row">
                <span>VAT (${item.vat_percentage}%):</span>
                <span>AED ${(item.vat_amount || 0).toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="cost-row total">
              <span>Estimated Selling Price:</span>
              <span>AED ${item.estimatedSellingPrice.toFixed(2)}</span>
            </div>
          </div>
        ` : ''}

        <!-- Item Total -->
        <div class="item-total">
          <span>Item Total:</span>
          <span>AED ${itemTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
    `;
  }).join('')}

  <!-- Cost Summary -->
  <div class="cost-summary">
    <h2>COST SUMMARY</h2>
    <div class="summary-row">
      <span>Subtotal:</span>
      <span>AED ${grandSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
    ${grandVAT > 0 ? `
      <div class="summary-row">
        <span>VAT (5%):</span>
        <span>AED ${grandVAT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    ` : ''}
    <div class="summary-row total">
      <span>TOTAL PROJECT VALUE:</span>
      <span>AED ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  </div>

  <!-- Preliminaries -->
  ${estimation.preliminaries && (estimation.preliminaries.items || estimation.preliminaries.notes) ? `
    <div class="preliminaries">
      <h3>PRELIMINARIES & APPROVAL WORKS</h3>
      <p style="font-size: 9pt; color: #666; margin-bottom: 12px; font-style: italic;">Selected conditions and terms</p>
      ${estimation.preliminaries.items ? estimation.preliminaries.items.map((item: string) => `
        <div class="prelim-item">${item}</div>
      `).join('') : ''}
      ${estimation.preliminaries.notes ? `
        <div style="margin-top: 15px; padding: 12px; background: white; border-radius: 4px;">
          <strong style="color: #7c3aed;">Additional Notes:</strong><br>
          <span style="font-size: 9pt;">${estimation.preliminaries.notes}</span>
        </div>
      ` : ''}
    </div>
  ` : ''}

</body>
</html>
  `;
};
