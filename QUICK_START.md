# BOQ PDF System - Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Test Backend ✅
```bash
cd backend
python -c "from utils.modern_boq_pdf_generator import ModernBOQPDFGenerator; print('Backend Ready!')"
```

### Step 2: Add to Your Frontend ✅
```tsx
import { BOQPDFActions } from '@/components/BOQPDFActions';

<BOQPDFActions
  boqId={boq.boq_id}
  clientEmail={project.client_email}
  projectName={project.project_name}
/>
```

### Step 3: Test Download 🧪
```bash
# Start backend
cd backend && python app.py

# In another terminal, test download
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/boq/download/client/1 \
  -o test.pdf
```

---

## 📊 What You'll Get

### Internal PDF (For Your Team)
```
┌─────────────────────────────────────┐
│   INTERNAL BOQ - Full Breakdown     │
├─────────────────────────────────────┤
│                                     │
│ 1. Bedroom Furniture                │
│   1.1 Wardrobe                      │
│                                     │
│   Materials:                        │
│   ┌──────────────────────────┐     │
│   │ Item    Qty  Rate  Total │     │
│   │ Wood    20   150   3,000 │     │
│   │ Hardware 1   500     500 │     │
│   └──────────────────────────┘     │
│   Total Materials: 3,500            │
│                                     │
│   Labour:                           │
│   ┌──────────────────────────┐     │
│   │ Role    Hrs  Rate  Total │     │
│   │ Carpenter 40  25   1,000 │     │
│   │ Helper   20  15     300  │     │
│   └──────────────────────────┘     │
│   Total Labour: 1,300               │
│                                     │
│   Cost Breakdown:                   │
│   Base Cost: 4,800                  │
│   Misc (10%): 480                   │
│   Overhead (25%): 1,200             │
│   Transport (6%): 288               │
│   Internal Cost: 6,768              │
│   Client Rate: 8,000                │
│   Planned Profit: 1,200             │
│   Actual Profit: 1,232 ✓            │
│                                     │
└─────────────────────────────────────┘
```

### Client PDF (For Your Clients)
```
┌─────────────────────────────────────┐
│     QUOTATION - Clean & Simple      │
├─────────────────────────────────────┤
│                                     │
│ 1. Bedroom Furniture                │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ Description  Qty Unit Rate  Amt ││
│ │ Wardrobe     2  nos 4,000 8,000 ││
│ │ Bed Frame    1  nos 2,500 2,500 ││
│ └─────────────────────────────────┘│
│                                     │
│ Item Total: AED 10,500              │
│                                     │
│ COST SUMMARY                        │
│ Subtotal: AED 45,000                │
│ VAT (5%): AED 2,250                 │
│ TOTAL: AED 47,250                   │
│                                     │
└─────────────────────────────────────┘
```

---

## 🎯 Common Use Cases

### 1. Download for Review
```tsx
const { downloadInternal } = useBOQPdf();

<Button onClick={() => downloadInternal(boqId)}>
  Review BOQ
</Button>
```

### 2. Send to Client
```tsx
const { sendToClient } = useBOQPdf();

<Button onClick={() => sendToClient(
  boqId,
  'client@email.com',
  'Please review attached BOQ',
  ['excel', 'pdf']
)}>
  Send to Client
</Button>
```

### 3. Both Options
```tsx
<BOQPDFActions
  boqId={boqId}
  clientEmail="client@email.com"
  projectName="Villa Project"
/>
```

---

## 🔍 API Quick Reference

### Download Internal
```
GET /api/boq/download/internal/<id>
Authorization: Bearer <token>
→ Returns: PDF file (detailed)
```

### Download Client
```
GET /api/boq/download/client/<id>
Authorization: Bearer <token>
→ Returns: PDF file (clean)
```

### Send Email
```
POST /api/send_boq_client
{
  "boq_id": 123,
  "client_email": "client@example.com",
  "message": "Your message",
  "formats": ["excel", "pdf"]
}
→ Returns: {"success": true, "message": "Sent"}
```

---

## ✅ Quick Checks

### Backend Working?
```bash
python -c "from utils.modern_boq_pdf_generator import ModernBOQPDFGenerator; print('Yes')"
```

### Frontend Working?
```tsx
// Import works?
import { useBOQPdf } from '@/hooks/useBOQPdf';

// Component renders?
<BOQPDFActions boqId={1} />
```

### API Working?
```bash
curl http://localhost:8000/api/boq/download/client/1
# Should return PDF file
```

---

## 🐛 Quick Fixes

### "Module not found"
```bash
# Backend
cd backend
pip install reportlab flask

# Frontend
cd frontend
npm install axios antd
```

### "Authentication failed"
```tsx
// Check token
const token = localStorage.getItem('access_token');
console.log(token); // Should have value
```

### "PDF blank or wrong data"
```sql
-- Check BOQ data
SELECT * FROM boq WHERE boq_id = 1;
SELECT * FROM boq_details WHERE boq_id = 1;
```

---

## 📚 Full Documentation

- **IMPLEMENTATION_SUMMARY.md** - What was done
- **BOQ_PDF_SYSTEM_GUIDE.md** - Complete guide
- **TEST_PDF_SYSTEM.md** - Testing instructions

---

## 🎉 You're Ready!

1. ✅ Backend created
2. ✅ Frontend components ready
3. ✅ API endpoints working
4. 🧪 Time to test!

**Start with:** Add `<BOQPDFActions />` to your BOQ page and click download!

---

**Questions?** Check the full documentation files.
