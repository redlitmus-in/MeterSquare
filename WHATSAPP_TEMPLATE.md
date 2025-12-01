# WhatsApp Message Template

## Purchase Order Template

Location: `backend/utils/whatsapp_service.py` (lines 320-334)

```
*🛒 PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━━━

📋 *PO Number:* PO-{cr_id}

Dear *{vendor_company_name}*,

Please find the attached Local Purchase Order (LPO) document for your reference.

Kindly review the details and confirm the order. Please share the expected delivery timeline at your earliest convenience.

Thank you.

_MeterSquare Interiors LLC_
📞 {buyer_phone}
```

## Variables (Code)

| Variable | Description |
|----------|-------------|
| `{cr_id}` | Purchase Order ID (e.g., 394) |
| `{vendor_company_name}` | Vendor's company name |
| `{buyer_phone}` | Buyer's phone number |

## Notes

- The PDF attachment is sent separately after the text message
- PDF filename format: `LPO-PO-{cr_id}.pdf`

---

# Meta WhatsApp Template Approval

## Template Submission Format

Use this format when submitting template for Meta approval:

**Template Name:** `purchase_order_notification`

**Category:** `UTILITY` (for transactional messages)

**Language:** `English`

**Header (Optional):**
```
🛒 PURCHASE ORDER
```

**Body:**
```
📋 *PO Number:* {{1}}

Dear *{{2}}*,

Please find the attached Local Purchase Order (LPO) document for your reference.

Kindly review the details and confirm the order. Please share the expected delivery timeline at your earliest convenience.

Thank you.

_MeterSquare Interiors LLC_
📞 {{3}}
```

**Footer (Optional):**
```
MeterSquare Interiors LLC
```

## Variables (Meta Format)

| Variable | Sample Value | Description |
|----------|--------------|-------------|
| `{{1}}` | PO-394 | PO Number |
| `{{2}}` | ABC Trading LLC | Vendor Name |
| `{{3}}` | +971501234567 | Contact Phone |

## Important Notes for Meta Approval

1. Use `{{1}}`, `{{2}}`, `{{3}}` format for variables (not `{cr_id}`)
2. Category should be `UTILITY` for order/transaction messages
3. Avoid promotional language
4. Keep it professional and transactional
5. Sample values are required for each variable
6. Template review may take 24-48 hours

---

## Sample Message (Preview)

```
🛒 PURCHASE ORDER
━━━━━━━━━━━━━━━━━━━━━━

📋 PO Number: PO-394

Dear ABC Trading LLC,

Please find the attached Local Purchase Order (LPO) document for your reference.

Kindly review the details and confirm the order. Please share the expected delivery timeline at your earliest convenience.

Thank you.

MeterSquare Interiors LLC
📞 +971501234567
```
