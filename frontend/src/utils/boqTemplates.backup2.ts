/**
 * BOQ HTML Templates
 * Converted from boq_client.html and boq_internal.html to JavaScript template literals
 */

interface BOQData {
  projectName: string;
  clientName: string;
  location: string;
  quotationDate: string;
  sections: any[];
  subtotal: string;
  vat?: string;
  vatRate?: number;
  grandTotal: string;
  notes?: string;
  // Internal specific
  rawMaterialsTotal?: string;
  labourTotal?: string;
  miscPercent?: number;
  miscAmount?: string;
  overheadPercent?: number;
  overheadAmount?: string;
  transportAmount?: string;
  internalCost?: string;
  clientCost?: string;
  profitAmount?: string;
  preparedBy?: string;
}

/**
 * CLIENT BOQ HTML Template
 */
export const generateClientHTML = (data: BOQData): string => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Quotation / BOQ</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 20mm; }
    html,body { font-family: 'Roboto', Arial, sans-serif; color: #222; font-size: 12px; }
    .brand { --brand:#2a6f97; }
    .container { width:100%; max-width: 820px; margin: 0 auto; }
    header { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:4px solid var(--brand); }
    .logo { display:flex; align-items:center; gap:12px; }
    .logo img { height:56px; object-fit:contain; }
    .company { text-align:right; }
    .company .name { font-weight:700; font-size:16px; }
    .title { margin:18px 0 6px 0; color:var(--brand); font-weight:700; font-size:18px; }
    .meta { display:flex; gap:20px; flex-wrap:wrap; margin-bottom:12px; }
    .meta .box { background:#f7f9fb; padding:8px 12px; border-radius:6px; border:1px solid #eef3f6; min-width:180px; }
    .section-title { margin-top:14px; font-weight:600; color:#333; border-bottom:1px solid #eee; padding-bottom:6px; }
    table { width:100%; border-collapse:collapse; margin-top:10px; }
    th, td { padding:10px 8px; text-align:left; border-bottom:1px solid #e9eef1; vertical-align:top; }
    thead th { background:#f5fbfd; font-weight:600; color:#244b5a; border-bottom:2px solid #e0eef4; }
    tbody tr:nth-child(odd) td { background: #ffffff; }
    tbody tr:nth-child(even) td { background: #fbfdff; }
    .right { text-align:right; }
    .totals { margin-top:12px; display:flex; justify-content:flex-end; }
    .totals .box { min-width:260px; border:1px solid #e6eef2; padding:12px; border-radius:6px; background:#fff; }
    .totals .row { display:flex; justify-content:space-between; padding:6px 0; }
    footer { margin-top:28px; border-top:1px dashed #ddd; padding-top:12px; display:flex; justify-content:space-between; align-items:center; gap:20px; }
    .sign { display:flex; gap:20px; align-items:center; }
    .sign .line { width:220px; border-top:1px solid #999; text-align:center; padding-top:6px; font-size:11px; color:#333; }
    .notes { font-size:11px; color:#555; max-width:520px; }
    .small { font-size:11px; color:#666; }
    @media print {
      header, footer { position:fixed; left:0; right:0; }
    }
  </style>
</head>
<body class="brand">
  <div class="container">
    <header>
      <div class="logo">
        <img src="/logo.png" alt="Company logo" onerror="this.style.display='none'"/>
        <div>
          <div class="company-name small">MeterSquare Interiors LLC</div>
          <div class="small">TRN: </div>
        </div>
      </div>

      <div class="company">
        <div class="name">MeterSquare Interiors LLC</div>
        <div class="small">Dubai, UAE</div>
        <div class="small">Phone: +971 XX XXX XXXX</div>
      </div>
    </header>

    <h2 class="title">QUOTATION — Bill of Quantities</h2>

    <div class="meta">
      <div class="box"><strong>Project:</strong><br>${data.projectName}</div>
      <div class="box"><strong>Client:</strong><br>${data.clientName}</div>
      <div class="box"><strong>Location:</strong><br>${data.location}</div>
      <div class="box"><strong>Date:</strong><br>${data.quotationDate}</div>
    </div>

    ${data.sections.map((section, idx) => `
      <div class="section-title">${idx + 1}. ${section.title}</div>

      <table>
        <thead>
          <tr>
            <th style="width:6%;">S.No</th>
            <th style="width:48%;">Item Name / Description</th>
            <th style="width:10%;">Qty</th>
            <th style="width:10%;">Units</th>
            <th style="width:12%;">Unit Price (AED)</th>
            <th style="width:14%;" class="right">Total (AED)</th>
          </tr>
        </thead>
        <tbody>
          ${section.items.map((item: any) => `
          <tr>
            <td>${item.sno}</td>
            <td>
              <strong>${item.name}</strong>
              ${item.scope ? `<div class="small">${item.scope}</div>` : ''}
              ${item.size ? `<div class="small">Size: ${item.size}</div>` : ''}
            </td>
            <td>${item.qty}</td>
            <td>${item.units}</td>
            <td>${item.unit_price !== null ? item.unit_price : '-'}</td>
            <td class="right">${item.total !== null ? item.total : '-'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    `).join('')}

    <div class="totals">
      <div class="box">
        <div class="row"><strong>Subtotal</strong><span>${data.subtotal}</span></div>
        ${data.vat ? `<div class="row"><strong>VAT (${data.vatRate}%)</strong><span>${data.vat}</span></div>` : ''}
        <div class="row" style="border-top:1px solid #eef3f6; padding-top:10px; font-size:16px;"><strong>Grand Total</strong><span><strong>${data.grandTotal}</strong></span></div>
      </div>
    </div>

    <footer>
      <div class="notes">
        <div><strong>Notes:</strong></div>
        <div class="small">${data.notes || 'All authority charges & deposits are excluded (Approximate cost AED 10,000).'}</div>
        <div class="small" style="margin-top:8px;">This quotation is valid for 30 days from the date of issue.</div>
      </div>

      <div class="sign">
        <div class="line">For MeterSquare Interiors LLC: Authorized Signature</div>
        <div class="line">Client Acceptance: Signature</div>
      </div>
    </footer>
  </div>
</body>
</html>
`;

/**
 * INTERNAL BOQ HTML Template
 */
export const generateInternalHTML = (data: BOQData): string => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BOQ - Internal</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    @page { size:A4; margin:20mm; }
    body { font-family: 'Roboto', Arial, sans-serif; color:#222; font-size:12px; }
    .brand { --brand:#2a6f97; }
    .container { max-width:820px; margin:0 auto; }
    header { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:4px solid var(--brand); }
    .logo img { height:56px; object-fit:contain; }
    .company { text-align:right; }
    .title { margin:16px 0 6px 0; color:var(--brand); font-weight:700; font-size:18px; }
    .meta { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
    .meta .box { background:#fafdfd; padding:8px 12px; border-radius:6px; border:1px solid #eef6f8; min-width:170px; }
    .section-title { margin-top:12px; font-weight:600; color:#333; border-bottom:1px solid #eee; padding-bottom:6px; }
    table { width:100%; border-collapse:collapse; margin-top:10px; }
    th, td { padding:9px 8px; text-align:left; border-bottom:1px dashed #e6eef2; vertical-align:top; }
    thead th { background:#f4fbfc; font-weight:700; color:#1f4b58; border-bottom:2px solid #dbeff3; }
    tbody tr:nth-child(odd) td { background: #ffffff; }
    tbody tr:nth-child(even) td { background: #fcfeff; }
    .right { text-align:right; }
    .internal-box { margin-top:14px; display:flex; gap:16px; justify-content:space-between; align-items:flex-start; }
    .calc { flex:1; border:1px solid #e6eef2; padding:12px; border-radius:8px; background:#fff; min-width:260px; }
    .calc .row { display:flex; justify-content:space-between; padding:6px 0; }
    .calc .grand { font-size:16px; font-weight:700; padding-top:8px; border-top:1px dashed #e9f2f5; margin-top:8px; }
    .comparison { width:320px; padding:12px; border-radius:8px; background:linear-gradient(180deg,#f7fbfd,#ffffff); border:1px solid #d9eef6; box-shadow:0 1px 4px rgba(0,0,0,0.03); }
    .comparison h4 { margin:0 0 8px 0; color:#0f3a45; }
    .comp-row { display:flex; justify-content:space-between; padding:6px 0; font-weight:600; }
    .profit { color:#0a7a3a; font-weight:800; font-size:15px; }
    footer { margin-top:24px; border-top:1px dashed #ddd; padding-top:12px; display:flex; justify-content:space-between; align-items:center; gap:20px; }
    .notes { font-size:11px; color:#555; max-width:540px; }
    .line { width:220px; border-top:1px solid #999; text-align:center; padding-top:6px; font-size:11px; color:#333; }
    .small { font-size:11px; color:#666; }
  </style>
</head>
<body class="brand">
  <div class="container">
    <header>
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="/logo.png" alt="Logo" onerror="this.style.display='none'"/>
      </div>
      <div class="company">
        <div style="font-weight:700; font-size:15px;">MeterSquare Interiors LLC</div>
        <div class="small">Dubai, UAE</div>
        <div class="small">Phone: +971 XX XXX XXXX</div>
      </div>
    </header>

    <h2 class="title">INTERNAL BOQ — Cost Breakdown</h2>

    <div class="meta">
      <div class="box"><strong>Project:</strong><br>${data.projectName}</div>
      <div class="box"><strong>Client:</strong><br>${data.clientName}</div>
      <div class="box"><strong>Location:</strong><br>${data.location}</div>
      <div class="box"><strong>Date:</strong><br>${data.quotationDate}</div>
    </div>

    ${data.sections.map((section, idx) => `
      <div class="section-title">${idx + 1}. ${section.title}</div>

      ${section.items.map((item: any) => `
        <table>
          <thead>
            <tr style="background:#e8f4f8;">
              <th style="width:8%;">S.No</th>
              <th style="width:44%;">Item Name / Description</th>
              <th style="width:10%;">QTY</th>
              <th style="width:8%;">UNITS</th>
              <th style="width:15%;">UNIT PRICE(AED)</th>
              <th style="width:15%;" class="right">TOTAL (AED)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${item.sno}</td>
              <td>
                <strong>${item.name}</strong>
                ${item.scope ? `<div class="small">${item.scope}</div>` : ''}
                ${item.size ? `<div class="small">Size: ${item.size}</div>` : ''}
              </td>
              <td>${item.qty}</td>
              <td>${item.units}</td>
              <td>${item.unit_price !== null ? item.unit_price.toLocaleString('en-US', {minimumFractionDigits: 2}) : '-'}</td>
              <td class="right">${item.total !== null ? item.total.toLocaleString('en-US', {minimumFractionDigits: 2}) : '-'}</td>
            </tr>

            ${item.materials && item.materials.length > 0 ? `
            <tr style="background:#ffebee;">
              <td colspan="6" style="padding:0;">
                <table style="margin:0; width:100%; border:none;">
                  <tr style="background:#ef5350; color:white;">
                    <td colspan="6" style="padding:6px 8px; font-weight:700; border:none;">RAW MATERIALS</td>
                  </tr>
                  ${item.materials.map((mat: any) => `
                  <tr style="background:#fff;">
                    <td style="width:8%; border-bottom:1px dashed #eee;"></td>
                    <td style="width:44%; border-bottom:1px dashed #eee;">${mat.name}</td>
                    <td style="width:10%; border-bottom:1px dashed #eee;">${mat.qty.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    <td style="width:8%; border-bottom:1px dashed #eee;">${mat.unit}</td>
                    <td style="width:15%; border-bottom:1px dashed #eee;">${mat.rate.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    <td style="width:15%; text-align:right; border-bottom:1px dashed #eee;">${mat.total.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                  </tr>
                  `).join('')}
                </table>
              </td>
            </tr>
            ` : ''}

            ${item.labour && item.labour.length > 0 ? `
            <tr style="background:#ffebee;">
              <td colspan="6" style="padding:0;">
                <table style="margin:0; width:100%; border:none;">
                  <tr style="background:#ef5350; color:white;">
                    <td colspan="6" style="padding:6px 8px; font-weight:700; border:none;">LABOUR</td>
                  </tr>
                  ${item.labour.map((lab: any) => `
                  <tr style="background:#fff;">
                    <td style="width:8%; border-bottom:1px dashed #eee;"></td>
                    <td style="width:44%; border-bottom:1px dashed #eee;">${lab.role}</td>
                    <td style="width:10%; border-bottom:1px dashed #eee;">${lab.hours.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    <td style="width:8%; border-bottom:1px dashed #eee;">mandays</td>
                    <td style="width:15%; border-bottom:1px dashed #eee;">${lab.rate.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    <td style="width:15%; text-align:right; border-bottom:1px dashed #eee;">${lab.total.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                  </tr>
                  `).join('')}
                </table>
              </td>
            </tr>
            ` : ''}

            <tr>
              <td colspan="3" rowspan="5" style="border-right:1px solid #ddd;">
                <div style="padding:8px; font-size:11px; color:#555;">
                  Planned profit is taken from the ${item.overheadPercent}% inputs we gave during the planning.<br>
                  Difference between the client rate and internal expenditure planning.
                </div>
              </td>
              <td colspan="2" style="font-weight:600;">Client vs Internal</td>
              <td class="right"></td>
            </tr>
            <tr>
              <td colspan="2">Misc</td>
              <td class="right">${item.miscPercent}%</td>
              <td class="right">${item.miscAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td colspan="2">Overhead&Profit</td>
              <td class="right">${item.overheadPercent}%</td>
              <td class="right">${item.overheadAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td colspan="2">Transport</td>
              <td class="right">${item.transportPercent}%</td>
              <td class="right">${item.transportAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr style="background:#fff9c4;">
              <td colspan="2" style="font-weight:700; color:#f57f17;">Internal Cost</td>
              <td colspan="2" class="right" style="font-weight:700; color:#f57f17;">${item.internalCost.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>

            <tr style="background:#e8f5e9;">
              <td colspan="4"></td>
              <td style="font-weight:700; color:#2e7d32;">Planned profit</td>
              <td class="right" style="font-weight:700; color:#2e7d32;">${item.plannedProfit.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr style="background:#c8e6c9;">
              <td colspan="4"></td>
              <td style="font-weight:700; color:#1b5e20;">Actual Profit</td>
              <td class="right" style="font-weight:700; color:#1b5e20;">${item.actualProfit.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-bottom:20px;"></div>
      `).join('')}
    `).join('')}

    <div class="internal-box">
      <div class="calc">
        <div class="row"><div>Raw Materials</div><div>${data.rawMaterialsTotal}</div></div>
        <div class="row"><div>Labour</div><div>${data.labourTotal}</div></div>
        <div class="row"><div>Misc (${data.miscPercent}%)</div><div>${data.miscAmount}</div></div>
        <div class="row"><div>Overhead & Profit (${data.overheadPercent}%)</div><div>${data.overheadAmount}</div></div>
        <div class="row"><div>Transport</div><div>${data.transportAmount}</div></div>

        <div class="grand"><div style="display:flex; justify-content:space-between;"><div>Internal Cost</div><div>${data.internalCost}</div></div></div>
      </div>

      <div class="comparison">
        <h4>Client vs Internal</h4>
        <div class="comp-row"><div>Client Cost</div><div>${data.clientCost}</div></div>
        <div class="comp-row"><div>Internal Cost</div><div>${data.internalCost}</div></div>
        <div class="comp-row" style="border-top:1px dashed #e0f1f6; padding-top:8px;">
          <div style="font-weight:600">Profit (AED)</div>
          <div class="profit">${data.profitAmount}</div>
        </div>
        <div style="margin-top:8px; font-size:11px; color:#555;">Planned profit shown separately where applicable.</div>
      </div>
    </div>

    <footer>
      <div class="notes">
        <div><strong>Cost Analysis:</strong></div>
        <div class="small">Difference between the client rate and internal expenditure planning.</div>
        <div class="small" style="margin-top:8px;">This internal document is confidential. Do not share with clients.</div>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; align-items:flex-end;">
        <div class="line">For MeterSquare Interiors LLC: Authorized Signature</div>
        <div class="line">Prepared By: ${data.preparedBy || ''}</div>
      </div>
    </footer>
  </div>
</body>
</html>
`;
