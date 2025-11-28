/**
 * BOQ HTML Templates - Exact match to PDF format
 */

interface BOQData {
  projectName: string;
  clientName: string;
  location: string;
  quotationDate: string;
  sections: any[];
  clientCost?: number;
  internalCost?: number;
  totalPlannedProfit?: number;
  projectMargin?: number;
}

/**
 * INTERNAL BOQ - Matches your PDF exactly with modern fonts
 */
export const generateInternalHTML = (data: BOQData): string => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BOQ - Internal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size:A4; margin:15mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color:#222; font-size:11px; line-height:1.4; }
    .container { max-width:100%; }

    /* Project Info Box */
    .project-info { border:2px solid #1565c0; margin:20px 0; }
    .project-info table { width:100%; border-collapse:collapse; }
    .project-info td { padding:8px 12px; border:1px solid #1565c0; }
    .project-info td:first-child { background:#e3f2fd; font-weight:600; width:30%; }

    /* BOQ Table */
    table.boq { width:100%; border-collapse:collapse; margin-bottom:20px; border:1px solid #333; }
    table.boq th, table.boq td { border:1px solid #333; padding:6px 8px; }
    table.boq thead th { background:#1565c0; color:white; font-weight:700; text-align:center; font-size:10px; }
    .item-header { background:#e3f2fd !important; font-weight:600; }
    .section-header { background:#ef5350 !important; color:white !important; font-weight:700; text-align:center; }
    .cost-row { background:#fff9c4; }
    .profit-row { background:#c8e6c9; color:#2e7d32; font-weight:600; }
    .actual-profit { background:#a5d6a7; color:#1b5e20; font-weight:700; }

    /* Cost Analysis */
    .cost-analysis { margin:20px 0; border:2px solid #333; }
    .cost-analysis-title { background:#1565c0; color:white; padding:8px; font-weight:700; text-align:center; }
    .cost-analysis table { width:100%; }
    .cost-analysis td { padding:8px; border:1px solid #333; }
    .cost-analysis td:first-child { background:#f5f5f5; font-weight:600; width:70%; }
    .right { text-align:right; }
    .center { text-align:center; }
  </style>
</head>
<body>
  <div class="container">
    <h1 style="text-align:center; color:#1565c0; font-size:28px; margin:20px 0;">QUOTATION</h1>
    <div style="text-align:center; font-style:italic; color:#666; margin-bottom:16px;">Bill of Quantities</div>

    <!-- Project Info -->
    <div class="project-info">
      <table>
        <tr><td>Project Name:</td><td>${data.projectName}</td></tr>
        <tr><td>Client Name:</td><td>${data.clientName}</td></tr>
        <tr><td>Location:</td><td>${data.location}</td></tr>
        <tr><td>Quotation Date:</td><td>${data.quotationDate}</td></tr>
      </table>
    </div>

    <!-- BOQ Items -->
    ${data.sections.map((section) => section.items.map((item: any) => `
      <table class="boq">
        <thead>
          <tr>
            <th style="width:8%;">S.No</th>
            <th style="width:35%;">Item Name</th>
            <th style="width:10%;">QTY</th>
            <th style="width:10%;">UNITS</th>
            <th style="width:15%;">UNIT PRICE(AED)</th>
            <th style="width:22%;">TOTAL (AED)</th>
          </tr>
        </thead>
        <tbody>
          <!-- Item Header -->
          <tr class="item-header">
            <td>${item.sno}</td>
            <td>
              <strong>${item.name}</strong>
              ${item.scope ? `<div>Scope:<br>${item.scope}</div>` : ''}
              ${item.size ? `<div>Size:<br>${item.size}</div>` : ''}
            </td>
            <td class="center">${item.qty}</td>
            <td class="center">${item.units}</td>
            <td class="right">${Math.round(item.unit_price || 0)}</td>
            <td class="right">${Math.round(item.total || 0)}</td>
          </tr>

          <!-- RAW MATERIALS -->
          ${item.materials && item.materials.length > 0 ? `
          <tr><td colspan="6" class="section-header">RAW MATERIALS</td></tr>
          ${item.materials.map((mat: any) => `
          <tr>
            <td></td>
            <td>${mat.name}</td>
            <td class="center">${Math.round(mat.qty)}</td>
            <td class="center">${mat.unit}</td>
            <td class="right">${Math.round(mat.rate)}</td>
            <td class="right">${Math.round(mat.total)}</td>
          </tr>
          `).join('')}
          ` : ''}

          <!-- LABOUR -->
          ${item.labour && item.labour.length > 0 ? `
          <tr><td colspan="6" class="section-header">LABOUR</td></tr>
          ${item.labour.map((lab: any) => `
          <tr>
            <td></td>
            <td>${lab.role}</td>
            <td class="center">${Math.round(lab.hours)}Hrs</td>
            <td class="center">Dailwages</td>
            <td class="right">${Math.round(lab.rate)}</td>
            <td class="right">${Math.round(lab.total)}</td>
          </tr>
          `).join('')}
          ` : ''}

          <!-- Cost Breakdown -->
          <tr class="cost-row">
            <td colspan="3" rowspan="3" style="padding:8px;">
              Planned profit is taken from the ${item.overheadPercent}% inputs we gave during the planning.<br><br>
              Difference between the client rate and internal expenditure planning.
            </td>
            <td colspan="2">Misc</td>
            <td class="right">${item.miscPercent}%</td>
            <td class="right">${Math.round(item.miscAmount)}</td>
          </tr>
          <tr class="cost-row">
            <td colspan="2">Overhead&Profit</td>
            <td class="right">${item.overheadPercent}%</td>
            <td class="right">${Math.round(item.overheadAmount)}</td>
          </tr>
          <tr class="cost-row">
            <td colspan="2"><strong>Total</strong></td>
            <td colspan="2" class="right"><strong>${Math.round(item.internalCost)}</strong></td>
          </tr>

          <!-- Profit -->
          <tr class="profit-row">
            <td colspan="4"></td>
            <td>Planned profit</td>
            <td class="right">${Math.round(item.plannedProfit)}</td>
          </tr>
          <tr class="actual-profit">
            <td colspan="4"></td>
            <td>Acutual Profit</td>
            <td class="right">${Math.round(item.negotiableMargin)}</td>
          </tr>
        </tbody>
      </table>
    `).join('')).join('')}

    <!-- Cost Analysis -->
    <div class="cost-analysis">
      <div class="cost-analysis-title">Cost analysis</div>
      <table>
        <tr>
          <td>Client Cost</td>
          <td class="right">${Math.round(data.clientCost || 0)}</td>
        </tr>
        <tr>
          <td>Internal Cost</td>
          <td class="right" style="color:#c62828;">${Math.round(data.internalCost || 0)}</td>
        </tr>
        <tr>
          <td>Negotiable Margin ( Excluding planned profit of ${Math.round(data.totalPlannedProfit || 0)} AED)</td>
          <td class="right" style="color:#2e7d32;">${Math.round(data.projectMargin || 0)}</td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>
`;

/**
 * CLIENT BOQ - Professional template matching your requirements
 */
export const generateClientHTML = (data: any): string => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BOQ - Client</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size:A4; margin:15mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color:#222; font-size:11px; line-height:1.4; }
    .container { max-width:100%; }

    /* Header */
    .header { text-align:center; margin:20px 0; }
    .header h1 { color:#1565c0; font-size:32px; font-weight:700; margin-bottom:8px; letter-spacing:-0.5px; }
    .header .subtitle { font-style:italic; color:#666; font-size:13px; font-weight:500; }

    /* Logo Placeholder */
    .logo-placeholder { text-align:center; margin-bottom:20px; }
    .logo-text { font-size:20px; font-weight:700; color:#1565c0; }
    .company-name { font-size:11px; color:#666; margin-top:4px; }

    /* Project Info Box */
    .project-info { border:2px solid #1565c0; margin:20px 0; border-radius:8px; overflow:hidden; }
    .project-info table { width:100%; border-collapse:collapse; }
    .project-info td { padding:10px 14px; border-bottom:1px solid #e3f2fd; }
    .project-info td:first-child { background:#e3f2fd; font-weight:600; width:30%; }
    .project-info tr:last-child td { border-bottom:none; }

    /* BOQ Table */
    table.boq { width:100%; border-collapse:collapse; margin-bottom:20px; border:1px solid #333; }
    table.boq th, table.boq td { border:1px solid #333; padding:8px 10px; }
    table.boq thead th {
      background:linear-gradient(135deg, #1565c0 0%, #1e88e5 100%);
      color:white;
      font-weight:700;
      text-align:center;
      font-size:11px;
      padding:10px;
    }
    .item-header { background:#e3f2fd !important; font-weight:600; }
    .item-row td { padding:10px; }
    .right { text-align:right; }
    .center { text-align:center; }

    /* Preliminaries Section */
    .preliminaries {
      background:#fef7e3;
      border:2px solid #f59e0b;
      border-radius:8px;
      padding:16px;
      margin:20px 0;
    }
    .preliminaries h3 {
      color:#92400e;
      font-size:14px;
      font-weight:700;
      margin-bottom:12px;
    }
    .preliminaries .subtitle {
      color:#78350f;
      font-size:11px;
      margin-bottom:12px;
      font-style:italic;
    }
    .preliminaries-item {
      padding:6px 0;
      color:#44403c;
      font-size:11px;
      display:flex;
      gap:8px;
    }
    .preliminaries-item::before {
      content:'✓';
      color:#16a34a;
      font-weight:700;
    }
    .preliminaries .note {
      margin-top:16px;
      padding-top:16px;
      border-top:1px solid #fbbf24;
      color:#78350f;
      font-size:11px;
    }

    /* Grand Total Section */
    .grand-total {
      border:3px solid #1565c0;
      border-radius:8px;
      margin:20px 0;
      overflow:hidden;
    }
    .grand-total-header {
      background:linear-gradient(135deg, #1565c0 0%, #1e88e5 100%);
      color:white;
      padding:12px;
      text-align:center;
      font-weight:700;
      font-size:14px;
    }
    .grand-total table { width:100%; }
    .grand-total td { padding:12px; border-bottom:1px solid #e3f2fd; }
    .grand-total td:first-child { background:#f5f5f5; font-weight:600; width:60%; }
    .grand-total tr:last-child { background:#e3f2fd; }
    .grand-total tr:last-child td { font-weight:700; font-size:16px; color:#1565c0; border-bottom:none; }

    /* Signatures */
    .signatures { margin:40px 0 20px; display:flex; justify-content:space-between; }
    .signature-box { width:45%; }
    .signature-box .label { font-weight:700; color:#1565c0; margin-bottom:30px; }
    .signature-box .line { border-top:2px solid #333; margin:10px 0; }
    .signature-box .text { font-size:10px; color:#666; }

    /* Footer */
    .footer {
      text-align:center;
      font-size:9px;
      color:#999;
      margin-top:40px;
      padding-top:20px;
      border-top:1px solid #e0e0e0;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Logo Placeholder -->
    <div class="logo-placeholder">
      <div class="logo-text">METER SQUARE</div>
      <div class="company-name">INTERIORS LLC</div>
    </div>

    <!-- Header -->
    <div class="header">
      <h1>QUOTATION</h1>
      <div class="subtitle">Bill of Quantities</div>
    </div>

    <!-- Project Info -->
    <div class="project-info">
      <table>
        <tr><td>Project Name:</td><td>${data.projectName}</td></tr>
        <tr><td>Client Name:</td><td>${data.clientName}</td></tr>
        <tr><td>Location:</td><td>${data.location}</td></tr>
        <tr><td>Quotation Date:</td><td>${data.quotationDate}</td></tr>
      </table>
    </div>

    <!-- Preliminaries & Approval Works -->
    ${data.notes || (data.preliminariesItems && data.preliminariesItems.length > 0) ? `
    <div class="preliminaries">
      <h3>PRELIMINARIES & APPROVAL WORKS</h3>
      <div class="subtitle">Selected conditions and terms</div>
      ${data.preliminariesItems ? data.preliminariesItems.map((item: string) => `
        <div class="preliminaries-item">${item}</div>
      `).join('') : ''}
      ${data.notes ? `<div class="note"><strong>Note:</strong> ${data.notes}</div>` : ''}
    </div>
    ` : ''}

    <!-- BOQ Items -->
    ${data.sections.map((section: any, sectionIdx: number) => `
      <table class="boq">
        <thead>
          <tr>
            <th style="width:8%;">S.No</th>
            <th style="width:45%;">Description</th>
            <th style="width:10%;">QTY</th>
            <th style="width:10%;">UNITS</th>
            <th style="width:13%;">RATE (AED)</th>
            <th style="width:14%;">TOTAL (AED)</th>
          </tr>
        </thead>
        <tbody>
          <!-- Section Header -->
          ${section.title ? `
          <tr class="item-header">
            <td colspan="6" style="font-size:12px;"><strong>${sectionIdx + 1}. ${section.title}</strong></td>
          </tr>
          ` : ''}

          <!-- Section Items -->
          ${section.items.map((item: any) => `
          <tr class="item-row">
            <td class="center">${item.sno}</td>
            <td>
              <strong>${item.name}</strong>
              ${item.scope ? `<div style="font-size:10px;color:#666;margin-top:4px;">${item.scope}</div>` : ''}
              ${item.size ? `<div style="font-size:10px;color:#666;">${item.size}</div>` : ''}
            </td>
            <td class="center">${item.qty}</td>
            <td class="center">${item.units}</td>
            <td class="right">${typeof item.unit_price === 'number' ? item.unit_price.toFixed(2) : item.unit_price}</td>
            <td class="right"><strong>${typeof item.total === 'number' ? item.total.toFixed(2) : item.total}</strong></td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    `).join('')}

    <!-- Grand Total -->
    <div class="grand-total">
      <div class="grand-total-header">COST BREAKDOWN</div>
      <table>
        <tr>
          <td>Subtotal:</td>
          <td class="right">${data.subtotal}</td>
        </tr>
        ${data.discount ? `
        <tr style="color:#dc2626;">
          <td>Discount (${data.discountPercentage ? data.discountPercentage.toFixed(1) : '0'}%):</td>
          <td class="right">- ${data.discount}</td>
        </tr>
        <tr style="border-top:2px solid #ddd;">
          <td>After Discount:</td>
          <td class="right">${data.afterDiscount}</td>
        </tr>
        ` : ''}
        ${data.vat ? `
        <tr>
          <td>VAT (${data.vatRate}%):</td>
          <td class="right">${data.vat}</td>
        </tr>
        ` : ''}
        <tr>
          <td>GRAND TOTAL:</td>
          <td class="right">${data.grandTotal}</td>
        </tr>
      </table>
    </div>

    <!-- Signatures -->
    <div class="signatures">
      <div class="signature-box">
        <div class="label">For MeterSquare Interiors LLC:</div>
        <div class="line"></div>
        <div class="text">Authorized Signature</div>
        <div class="text" style="margin-top:10px;">Date: __________________</div>
      </div>
      <div class="signature-box">
        <div class="label">Client Acceptance:</div>
        <div class="line"></div>
        <div class="text">Client Signature</div>
        <div class="text" style="margin-top:10px;">Date: __________________</div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div>This quotation is valid for 30 days from the date of issue.</div>
      <div style="margin-top:4px;">© ${new Date().getFullYear()} MeterSquare Interiors LLC. All rights reserved.</div>
    </div>
  </div>
</body>
</html>
`;
