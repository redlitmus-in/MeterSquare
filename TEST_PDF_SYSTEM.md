# BOQ PDF System - Testing Instructions

## ✅ Implementation Complete

All components have been successfully created and integrated:

### Backend Files Created/Updated
- ✅ `backend/utils/modern_boq_pdf_generator.py` - NEW unified PDF generator
- ✅ `backend/controllers/download_boq_pdf.py` - NEW download endpoints
- ✅ `backend/controllers/send_boq_client.py` - UPDATED to use new generator
- ✅ `backend/routes/boq_routes.py` - UPDATED with PDF routes

### Frontend Files Created
- ✅ `frontend/src/services/boqPdfService.ts` - API service
- ✅ `frontend/src/hooks/useBOQPdf.ts` - React hook
- ✅ `frontend/src/components/BOQPDFActions.tsx` - UI component

### Documentation
- ✅ `BOQ_PDF_SYSTEM_GUIDE.md` - Complete usage guide

---

## 🧪 Testing Steps

### 1. Backend Testing

#### Start the backend server
```bash
cd backend
python app.py
```

#### Test PDF Download Endpoints

**Test Internal PDF:**
```bash
curl -X GET "http://localhost:8000/api/boq/download/internal/1" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -o test_internal.pdf
```

**Test Client PDF:**
```bash
curl -X GET "http://localhost:8000/api/boq/download/client/1" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -o test_client.pdf
```

**Test Email with Attachments:**
```bash
curl -X POST "http://localhost:8000/api/send_boq_client" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "boq_id": 1,
    "client_email": "test@example.com",
    "message": "Test BOQ email",
    "formats": ["excel", "pdf"]
  }'
```

### 2. Frontend Testing

#### Install dependencies (if needed)
```bash
cd frontend
npm install
```

#### Start the frontend server
```bash
npm run dev
```

#### Testing in Browser

1. **Navigate to BOQ Details Page**
   - Go to a BOQ details page in your app
   - You should see download and email buttons

2. **Test Download Internal PDF**
   - Click "Download PDF" dropdown
   - Select "Internal PDF (Full Breakdown)"
   - PDF should download with materials, labour, costs

3. **Test Download Client PDF**
   - Click "Download PDF" dropdown
   - Select "Client PDF (Clean View)"
   - PDF should download with clean view only

4. **Test Send to Client**
   - Click "Send to Client" button
   - Modal should open
   - Fill in email, message, select formats
   - Click "Send Email"
   - Email should be sent with attachments

### 3. Integration Testing

#### Using the React Component

Add this to your BOQ details page:

```tsx
import { BOQPDFActions } from '@/components/BOQPDFActions';

function YourBOQPage({ boq }) {
  return (
    <div>
      {/* Your existing code */}

      <BOQPDFActions
        boqId={boq.boq_id}
        clientEmail={boq.project?.client_email}
        projectName={boq.project?.project_name}
      />
    </div>
  );
}
```

#### Using the Hook

```tsx
import { useBOQPdf } from '@/hooks/useBOQPdf';

function YourComponent({ boqId }) {
  const { loading, downloadInternal, downloadClient } = useBOQPdf();

  return (
    <>
      <Button
        onClick={() => downloadInternal(boqId)}
        loading={loading}
      >
        Download Internal
      </Button>

      <Button
        onClick={() => downloadClient(boqId)}
        loading={loading}
      >
        Download Client
      </Button>
    </>
  );
}
```

---

## 🔍 What to Verify in PDFs

### Internal PDF Checklist
- [ ] Project information displays correctly (name, client, location, date)
- [ ] All items and sub-items are listed
- [ ] Materials table shows: name, qty, unit, rate, total
- [ ] Labour table shows: role, hours, rate, total
- [ ] Cost breakdown shows:
  - [ ] Base cost (materials + labour)
  - [ ] Miscellaneous percentage and amount
  - [ ] Overhead & Profit percentage and amount
  - [ ] Transport percentage and amount
  - [ ] Internal cost total
  - [ ] Client rate
  - [ ] Planned profit
  - [ ] Actual profit (in green)
- [ ] Cost analysis section shows:
  - [ ] Client cost
  - [ ] Internal cost
  - [ ] Project margin
- [ ] Preliminaries section (if exists)
- [ ] Logo displays (if file exists)

### Client PDF Checklist
- [ ] Project information displays correctly
- [ ] All items listed with clean formatting
- [ ] Sub-items table shows:
  - [ ] Description
  - [ ] Scope/Size
  - [ ] Quantity
  - [ ] Unit
  - [ ] Rate (AED)
  - [ ] Amount (AED)
- [ ] Rates include distributed markup (not base cost)
- [ ] Item totals are correct
- [ ] Cost summary shows:
  - [ ] Subtotal
  - [ ] Discount (if any)
  - [ ] VAT (if any)
  - [ ] Grand total
- [ ] Preliminaries section (if exists)
- [ ] Signature section on new page
- [ ] Footer with company info

---

## 📊 Sample Test Data

If you need to create test BOQ data:

```json
{
  "items": [
    {
      "item_name": "Test Item",
      "description": "Test description",
      "has_sub_items": true,
      "miscellaneous_amount": 500,
      "overhead_amount": 1000,
      "profit_margin_amount": 1500,
      "selling_price": 15000,
      "sub_items": [
        {
          "sub_item_name": "Test Sub Item",
          "scope": "Test Scope",
          "size": "10x10",
          "quantity": 2,
          "unit": "nos",
          "rate": 5000,
          "materials_cost": 3000,
          "labour_cost": 2000,
          "materials": [
            {
              "material_name": "Wood",
              "quantity": 10,
              "unit": "sqft",
              "unit_price": 100,
              "total_price": 1000
            }
          ],
          "labour": [
            {
              "labour_role": "Carpenter",
              "hours": 8,
              "rate_per_hour": 50,
              "total_cost": 400
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 🐛 Common Issues & Solutions

### Issue: PDF Download Fails
**Solution:**
- Check backend logs
- Verify BOQ exists in database
- Check authentication token is valid

### Issue: Missing Data in PDF
**Solution:**
- Check BOQ JSON structure in database
- Verify `has_sub_items` flag is set
- Ensure materials/labour arrays exist

### Issue: Email Not Sending
**Solution:**
- Check `.env` file has SMTP settings
- Verify SENDER_EMAIL and password
- Check email service logs

### Issue: Frontend Component Not Rendering
**Solution:**
- Check browser console for errors
- Verify import paths are correct
- Check API URL in environment variables

---

## 📝 Next Steps

1. **Test with Real Data**
   - Use existing BOQs in your database
   - Verify calculations match expected values
   - Check all data displays correctly

2. **Update Existing Pages**
   - Replace old PDF export buttons
   - Use new `BOQPDFActions` component
   - Remove old import statements

3. **Clean Up Old Files** (Optional)
   - After confirming new system works
   - Remove deprecated files listed in guide
   - Update imports in all components

4. **Monitor Performance**
   - Check PDF generation time
   - Monitor email delivery
   - Track any errors in logs

---

## ✅ Success Criteria

The system is working correctly if:

- ✓ Internal PDF downloads with full breakdown
- ✓ Client PDF downloads with clean view
- ✓ All calculations are accurate
- ✓ Tables are properly formatted
- ✓ No missing or cut-off data
- ✓ Email sends with correct attachments
- ✓ Frontend buttons work without errors
- ✓ Loading states display correctly

---

## 📞 Support

If you encounter any issues:

1. Check this test guide
2. Review `BOQ_PDF_SYSTEM_GUIDE.md`
3. Check backend logs: `backend/logs/app.log`
4. Check browser console for frontend errors
5. Review code comments in implementation files

---

**Status:** ✅ Ready for Testing
**Last Updated:** 2025-01-27
