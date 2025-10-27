# BOQ PDF Generation System - Complete Guide

## 🎯 Overview

This document describes the **unified, modern BOQ PDF generation system** that replaces 8+ duplicate templates with a single source of truth.

## ✅ What Was Fixed

### Problems Identified
1. **8 Duplicate PDF Templates** - Inconsistent outputs, hard to maintain
2. **Missing Data** - Profit calculations, material/labour details not showing
3. **Poor Formatting** - Overlapping headers, cut-off tables, no proper spacing
4. **Inconsistent Calculations** - Different results from frontend vs backend

### Solutions Implemented
1. ✓ **Unified Backend Generator** - Single Python class for all PDF generation
2. ✓ **Accurate Calculations** - All costs, profits, and differences properly calculated
3. ✓ **Modern Design** - Professional tables, clean layout, proper spacing
4. ✓ **Two Views** - Internal (detailed) and Client (clean) versions
5. ✓ **Email Ready** - Works seamlessly with existing email service

---

## 📁 File Structure

### Backend (Python)
```
backend/
├── utils/
│   └── modern_boq_pdf_generator.py      # ⭐ NEW: Unified PDF generator
├── controllers/
│   ├── send_boq_client.py               # ✏️ UPDATED: Uses new generator
│   └── download_boq_pdf.py              # ⭐ NEW: Download API endpoints
└── routes/
    └── boq_routes.py                    # ✏️ UPDATED: Added PDF routes
```

### Frontend (TypeScript/React)
```
frontend/src/
├── services/
│   └── boqPdfService.ts                 # ⭐ NEW: API service
├── hooks/
│   └── useBOQPdf.ts                     # ⭐ NEW: React hook
└── components/
    └── BOQPDFActions.tsx                # ⭐ NEW: UI component
```

### Deprecated Files (Can be removed)
```
❌ frontend/src/utils/boqPdfExport.ts          (702 lines)
❌ frontend/src/utils/boqExportUtils.ts        (1671 lines)
❌ frontend/src/utils/boqHtmlToPdf.ts          (336 lines)
❌ frontend/src/utils/boqTemplates_new.ts      (templates)
❌ frontend/src/utils/corporateBOQ.ts          (template)
```

---

## 🚀 API Endpoints

### 1. Download Internal PDF
```http
GET /api/boq/download/internal/<boq_id>
Authorization: Bearer <token>
```
**Response:** PDF file with full breakdown (materials, labour, costs, profit analysis)

### 2. Download Client PDF
```http
GET /api/boq/download/client/<boq_id>
Authorization: Bearer <token>
```
**Response:** PDF file with clean view (items and prices only)

### 3. Send BOQ to Client (Email)
```http
POST /api/send_boq_client
Authorization: Bearer <token>
Content-Type: application/json

{
  "boq_id": 123,
  "client_email": "client@example.com",
  "message": "Please review the attached BOQ...",
  "formats": ["excel", "pdf"]
}
```
**Response:** Success/error message

---

## 💻 Frontend Usage

### Option 1: Using the React Hook (Recommended)

```tsx
import { useBOQPdf } from '@/hooks/useBOQPdf';

function BOQDetailsPage({ boqId }) {
  const { loading, downloadInternal, downloadClient, sendToClient } = useBOQPdf();

  return (
    <div>
      <Button
        onClick={() => downloadInternal(boqId)}
        loading={loading}
      >
        Download Internal PDF
      </Button>

      <Button
        onClick={() => downloadClient(boqId)}
        loading={loading}
      >
        Download Client PDF
      </Button>

      <Button
        onClick={() => sendToClient(
          boqId,
          'client@example.com',
          'Please review...',
          ['excel', 'pdf']
        )}
        loading={loading}
      >
        Send to Client
      </Button>
    </div>
  );
}
```

### Option 2: Using the Pre-built Component

```tsx
import { BOQPDFActions } from '@/components/BOQPDFActions';

function BOQDetailsPage({ boq }) {
  return (
    <div>
      <h1>{boq.boq_name}</h1>

      {/* All PDF actions in one component */}
      <BOQPDFActions
        boqId={boq.boq_id}
        clientEmail={boq.project.client_email}
        projectName={boq.project.project_name}
      />
    </div>
  );
}
```

### Option 3: Direct Service Call

```tsx
import { downloadInternalBOQPDF, downloadClientBOQPDF } from '@/services/boqPdfService';

async function handleDownload() {
  try {
    await downloadInternalBOQPDF(123);
    message.success('Downloaded successfully');
  } catch (error) {
    message.error(error.message);
  }
}
```

---

## 📊 PDF Content Comparison

### Internal PDF (Detailed View)
For: Estimators, Project Managers, Technical Directors

**Includes:**
- ✓ All materials with quantities, rates, totals
- ✓ All labour with hours, rates, totals
- ✓ Sub-item breakdown with calculations
- ✓ Base cost calculations
- ✓ Miscellaneous, Overhead, Transport percentages
- ✓ Internal cost vs Client cost
- ✓ Planned profit vs Actual profit
- ✓ Project margin analysis

**Example Layout:**
```
Item 1: Bedroom Furniture
  ├── Sub-item 1.1: Wardrobe
  │   ├── Materials Table
  │   │   - Plywood: 20 sheets @ AED 150 = AED 3,000
  │   │   - Hardware: 1 set @ AED 500 = AED 500
  │   │   Total Materials: AED 3,500
  │   ├── Labour Table
  │   │   - Carpenter: 40 hrs @ AED 25 = AED 1,000
  │   │   - Helper: 20 hrs @ AED 15 = AED 300
  │   │   Total Labour: AED 1,300
  │   └── Cost Breakdown
  │       Base Cost: AED 4,800
  │       Miscellaneous (10%): AED 480
  │       Overhead & Profit (25%): AED 1,200
  │       Transport (6%): AED 288
  │       Internal Cost: AED 6,768
  │       Client Rate: AED 8,000
  │       Planned Profit: AED 1,200
  │       Actual Profit: AED 1,232 ✓
```

### Client PDF (Clean View)
For: Clients, External Stakeholders

**Includes:**
- ✓ Item names and descriptions
- ✓ Sub-items with scope/size details
- ✓ Quantities and units
- ✓ Client rates (with markup included)
- ✓ Total amounts
- ✓ Cost summary (subtotal, VAT, grand total)
- ✓ Preliminaries and notes
- ✓ Signature section

**Example Layout:**
```
1. Bedroom Furniture
   Complete bedroom furniture package

   Description          Scope              Qty  Unit  Rate     Amount
   Wardrobe            L: 8ft | H: 8ft     2   nos   4,000    8,000
   Bed Frame           Queen Size          1   nos   2,500    2,500

   Item Total: AED 10,500

COST SUMMARY
Subtotal: AED 45,000
VAT (5%): AED 2,250
TOTAL PROJECT VALUE: AED 47,250
```

---

## 🔧 Backend Implementation Details

### ModernBOQPDFGenerator Class

**Key Methods:**
```python
class ModernBOQPDFGenerator:
    def generate_client_pdf(project, items, ...) -> bytes
        """Generate clean client PDF"""

    def generate_internal_pdf(project, items, ...) -> bytes
        """Generate detailed internal PDF"""

    def _add_client_items(items, boq_json) -> elements
        """Add client view items"""

    def _add_internal_items(items, boq_json) -> elements
        """Add internal view with full breakdown"""

    def _add_sub_item_breakdown(sub_item, ...) -> elements
        """Add materials, labour, cost analysis"""
```

**Cost Calculation Logic:**
```python
# For each sub-item:
base_cost = materials_cost + labour_cost

# Apply percentages from parent item
misc_amount = base_cost * (misc_pct / 100)
overhead_amount = base_cost * (overhead_pct / 100)
transport_amount = base_cost * (transport_pct / 100)

internal_cost = base_cost + misc_amount + overhead_amount + transport_amount
client_total = quantity * client_rate

# Profit calculations
planned_profit = overhead_amount  # The intended profit
actual_profit = client_total - internal_cost  # Real profit
```

**Markup Distribution for Client View:**
```python
# Distribute markup proportionally across sub-items
item_base_cost = sum(sub_item.materials_cost + sub_item.labour_cost)
item_total_markup = misc + overhead + profit

for sub_item:
    sub_base = sub_item.materials_cost + sub_item.labour_cost
    sub_markup = (sub_base / item_base_cost) * item_total_markup
    sub_item_client_total = sub_base + sub_markup
    adjusted_rate = sub_item_client_total / quantity
```

---

## 📧 Email Integration

The new PDF generator integrates seamlessly with the existing email system:

```python
# In send_boq_client.py
from utils.modern_boq_pdf_generator import ModernBOQPDFGenerator

generator = ModernBOQPDFGenerator()

# Generate PDFs
pdf_data = generator.generate_client_pdf(project, items, ...)
excel_data = generate_client_excel(project, items, ...)  # Existing

# Send email with attachments
email_service = BOQEmailService()
email_service.send_boq_to_client(
    boq_data=boq_data,
    project_data=project_data,
    client_email=client_email,
    excel_file=(filename, excel_data),
    pdf_file=(filename, pdf_data)
)
```

---

## 🎨 Design Features

### Professional Styling
- **Modern Colors:** Blue (#3B82F6), Green (#10B981), Red (#EF4444)
- **Clean Tables:** Alternating row colors, proper borders
- **Typography:** Helvetica, proper font sizes and weights
- **Spacing:** Consistent padding, margins, and gaps
- **Headers:** Color-coded section headers

### Responsive Elements
- **Tables:** Auto-sized columns, wrapped text
- **Images:** Logo with proper dimensions
- **Page Breaks:** Signatures on new page
- **Footers:** Company info, validity notice

---

## 🧪 Testing Checklist

### Backend Tests
```bash
# Test internal PDF generation
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/boq/download/internal/123 \
  -o test_internal.pdf

# Test client PDF generation
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/boq/download/client/123 \
  -o test_client.pdf

# Test email with attachments
curl -X POST http://localhost:8000/api/send_boq_client \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "boq_id": 123,
    "client_email": "test@example.com",
    "message": "Test message",
    "formats": ["excel", "pdf"]
  }'
```

### Frontend Tests
1. ✓ Click "Download Internal PDF" - Should download PDF with full breakdown
2. ✓ Click "Download Client PDF" - Should download clean PDF
3. ✓ Click "Send to Client" - Should open modal
4. ✓ Fill form and send - Should send email with attachments
5. ✓ Check loading states - Buttons should show loading spinner
6. ✓ Check error handling - Should show error messages

### PDF Validation
- [ ] All data displays correctly (no missing values)
- [ ] Tables are properly formatted (no overlap)
- [ ] Calculations are accurate (verified against database)
- [ ] Materials and labour show complete details
- [ ] Profit calculations match expected values
- [ ] Logo displays (if exists)
- [ ] Signatures section is on new page
- [ ] Footer shows company info
- [ ] PDF is downloadable and opens correctly

---

## 🚀 Migration Guide

### Step 1: Update Existing Components

**Before:**
```tsx
import { exportBOQToPDFClient } from '@/utils/boqHtmlToPdf';

<Button onClick={() => exportBOQToPDFClient(estimation)}>
  Download PDF
</Button>
```

**After:**
```tsx
import { useBOQPdf } from '@/hooks/useBOQPdf';

const { downloadClient } = useBOQPdf();

<Button onClick={() => downloadClient(boq.boq_id)}>
  Download PDF
</Button>
```

### Step 2: Remove Old Imports

Search and remove these imports from your components:
```tsx
// ❌ Remove these
import { exportBOQToPDFClient, exportBOQToPDFInternal } from '@/utils/boqHtmlToPdf';
import { generateClientHTML, generateInternalHTML } from '@/utils/boqTemplates_new';
import * as boqPdfExport from '@/utils/boqPdfExport';
import { exportBOQToExcel, exportBOQToPDF } from '@/utils/boqExportUtils';
```

### Step 3: Update Send to Client Logic

**Before:**
```tsx
// Old email send logic
const sendToClient = async () => {
  // Manual PDF generation + email API call
};
```

**After:**
```tsx
import { useBOQPdf } from '@/hooks/useBOQPdf';

const { sendToClient } = useBOQPdf();

// One line!
await sendToClient(boqId, email, message, ['excel', 'pdf']);
```

---

## 📝 Maintenance Notes

### Adding New Fields to PDF

1. Update `ModernBOQPDFGenerator` class in `modern_boq_pdf_generator.py`
2. Modify the appropriate section (`_add_client_items` or `_add_internal_items`)
3. No frontend changes needed - API handles everything

### Changing Styles/Colors

Update the `_setup_custom_styles()` method or table styles in generator class:
```python
# Example: Change header color
('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#NEW_COLOR'))
```

### Adding New Sections

Add new method in `ModernBOQPDFGenerator`:
```python
def _add_custom_section(self, data):
    elements = []
    # Add your content
    return elements
```

Then call it in `generate_client_pdf` or `generate_internal_pdf`.

---

## 🐛 Troubleshooting

### PDF Download Fails
- Check backend logs: `tail -f backend/logs/app.log`
- Verify BOQ exists: `SELECT * FROM boq WHERE boq_id = <id>`
- Check authentication: Token must be valid

### Missing Data in PDF
- Verify BOQ details JSON structure
- Check `has_sub_items` flag is set correctly
- Ensure materials/labour arrays are populated

### Email Not Sending
- Check SMTP settings in `.env`
- Verify `SENDER_EMAIL` and `SENDER_EMAIL_PASSWORD`
- Check email service logs

### Frontend Component Not Working
- Check browser console for errors
- Verify API URL in `.env.local`
- Check network tab for failed requests

---

## 📚 Additional Resources

- **ReportLab Docs:** https://www.reportlab.com/docs/reportlab-userguide.pdf
- **Flask Send File:** https://flask.palletsprojects.com/en/2.3.x/api/#flask.send_file
- **Axios File Download:** https://axios-http.com/docs/api_intro

---

## ✨ Summary

**Before:** 8+ duplicate templates, inconsistent outputs, missing data
**After:** 1 unified system, accurate calculations, modern design

**Key Benefits:**
- ✅ Single source of truth
- ✅ Consistent across all platforms
- ✅ Easy to maintain and update
- ✅ Accurate calculations
- ✅ Professional appearance
- ✅ Works with email system

---

**Need help?** Check the code comments or contact the development team.
