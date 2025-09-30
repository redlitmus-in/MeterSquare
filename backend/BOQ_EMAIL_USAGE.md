# BOQ Email Service - Usage Guide

## Overview
Professional email notification system for sending BOQ (Bill of Quantities) review requests to Technical Directors.

## Features
✅ Professional email template with company branding
✅ Complete BOQ breakdown with items, costs, and profit margins
✅ Automatic delivery to all Technical Directors or specific TD
✅ Beautiful HTML formatting with responsive design
✅ Detailed cost summary and selling price breakdown

## Email Configuration

### Environment Variables Required
Add these to your `.env` file:

```env
SENDER_EMAIL=your-email@gmail.com
SENDER_EMAIL_PASSWORD=your-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USE_TLS=False
```

**For Gmail:**
1. Enable 2-Factor Authentication
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the app password as `SENDER_EMAIL_PASSWORD`

## API Endpoint

### Send BOQ to Technical Director(s)

**Endpoint:** `POST /api/send_boq_email/<boq_id>`

**Authentication:** Required (JWT Token)

**Request Body (Optional):**
```json
{
  "td_email": "td@company.com"
}
```

If `td_email` is not provided, the email will be sent to **all active Technical Directors** (role_id = 2).

## Usage Examples

### Example 1: Send to All Technical Directors
```bash
curl -X POST http://localhost:5000/api/send_boq_email/123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "BOQ review email sent to 3 Technical Director(s)",
  "boq_id": 123,
  "sent_count": 3,
  "failed_count": 0,
  "failed_emails": null
}
```

### Example 2: Send to Specific Technical Director
```bash
curl -X POST http://localhost:5000/api/send_boq_email/123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "td_email": "johndoe@company.com"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "BOQ review email sent successfully to Technical Director",
  "boq_id": 123,
  "recipient": "johndoe@company.com"
}
```

## Email Content

The email includes:

### 1. Header Section
- Company logo and branding
- "BOQ Review Request" title

### 2. BOQ Information
- BOQ ID and Name
- Status (Draft/In_Review/Approved)
- Created by and date

### 3. Project Details
- Project name
- Client name
- Location

### 4. Cost Summary
- Total Items, Materials, Labour counts
- Material Cost breakdown
- Labour Cost breakdown
- Base Cost
- **Estimated Selling Price** (highlighted)

### 5. Items Breakdown Table
For each item:
- Item Name
- Base Cost
- Overhead % and Amount
- Profit Margin % and Amount
- Selling Price

### 6. Action Required
Clear call-to-action for TD to review and approve

## Email Template Features

### Professional Design
- Dark Black (#000000) and Light Blue (#3b82f6) color scheme
- Gradient backgrounds for headers
- Responsive mobile-friendly design
- Print-friendly styling

### Visual Elements
- Color-coded status badges
- Highlighted total cost section
- Bordered tables with alternating row colors
- Clean typography and spacing

## Integration with Frontend

### React/JavaScript Example
```javascript
const sendBOQToTechnicalDirector = async (boqId, tdEmail = null) => {
  try {
    const response = await fetch(`/api/send_boq_email/${boqId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(tdEmail ? { td_email: tdEmail } : {})
    });

    const result = await response.json();

    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  } catch (error) {
    console.error('Error sending BOQ email:', error);
    toast.error('Failed to send email');
  }
};

// Usage:
// Send to all TDs
sendBOQToTechnicalDirector(123);

// Send to specific TD
sendBOQToTechnicalDirector(123, 'td@company.com');
```

## Error Handling

### Common Errors and Solutions

**1. "BOQ not found"**
- Ensure the BOQ ID exists in the database
- Check if BOQ has been deleted

**2. "No Technical Directors found"**
- Verify users with role_id = 2 exist
- Check if TDs are marked as active (`is_active = True`)

**3. "Email service failed"**
- Verify email configuration in `.env`
- Check SMTP credentials
- For Gmail, ensure app password is used (not regular password)
- Check firewall/network settings for SMTP port access

**4. Authentication error**
- Ensure valid JWT token is provided
- Check token expiration

## Testing

### Test Email Sending
```python
# Test script
from utils.boq_email_service import BOQEmailService

service = BOQEmailService()

# Test data
boq_data = {
    'boq_id': 1,
    'boq_name': 'Test BOQ',
    'status': 'Draft',
    'created_by': 'Admin',
    'created_at': '01-Jan-2025 10:00 AM'
}

project_data = {
    'project_name': 'Sample Project',
    'client': 'ABC Corp',
    'location': 'Mumbai'
}

items_summary = {
    'total_items': 2,
    'total_materials': 5,
    'total_labour': 3,
    'total_material_cost': 50000,
    'total_labour_cost': 30000,
    'total_cost': 80000,
    'estimatedSellingPrice': 100000,
    'items': []
}

# Send test email
result = service.send_boq_to_technical_director(
    boq_data,
    project_data,
    items_summary,
    'test@company.com'
)

print(f"Email sent: {result}")
```

## Customization

### Modify Email Template
Edit `backend/utils/boq_email_service.py` → `generate_boq_review_email()` method

### Change Email Styles
Edit `backend/utils/email_styles.py` → `get_email_styles()` method

### Update Company Logo
Edit `backend/utils/email_config.py` → Update `LOGO_URL` variable

## Security Considerations

1. **Never commit email credentials** to Git
2. Use **App Passwords** for Gmail (not regular passwords)
3. **Validate recipient emails** before sending
4. **Rate limit** email sending to prevent abuse
5. **Log email activities** for audit purposes

## Future Enhancements

- [ ] Email templates for BOQ approval/rejection
- [ ] Attach BOQ PDF to email
- [ ] Email tracking and read receipts
- [ ] Scheduled email reminders
- [ ] Email preference management
- [ ] Multi-language support

---

**Version:** 1.0.0
**Last Updated:** January 2025
**Maintained By:** MeterSquare Development Team