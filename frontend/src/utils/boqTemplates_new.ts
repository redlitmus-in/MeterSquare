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
 * INTERNAL BOQ - Matches your PDF exactly
 */
export const generateInternalHTML = (data: BOQData): string => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BOQ - Internal</title>
  <style>
    @page { size:A4; margin:15mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; color:#222; font-size:11px; }
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
            <td colspan="3" rowspan="4" style="padding:8px;">
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
            <td colspan="2">Transport</td>
            <td class="right">${item.transportPercent}%</td>
            <td class="right">${Math.round(item.transportAmount)}</td>
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
            <td class="right">${Math.round(item.actualProfit)}</td>
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
          <td>Project Margin ( Excluding planned profit of ${Math.round(data.totalPlannedProfit || 0)} AED)</td>
          <td class="right" style="color:#2e7d32;">${Math.round(data.projectMargin || 0)}</td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>
`;

export const generateClientHTML = (data: any): string => `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Client BOQ</title>
</head>
<body>
  <h1>Client BOQ - To be implemented</h1>
</body>
</html>
`;
