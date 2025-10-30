# Site Engineer - No Cost Display Policy

## Important Policy - Do Not Show Costs to Site Engineers

**Date Established:** 2025-01-29

### Policy Statement
Site Engineers (SE) should NEVER see any cost-related metrics, prices, rates, or financial information in the system.

### Affected Areas
The following cost-related information must be hidden from Site Engineer role:

1. **Material Purchase Requests**
   - Unit Rate / Unit Price
   - Total Cost / Total Amount
   - Subtotals
   - Budget calculations
   - Cost summaries

2. **BOQ (Bill of Quantities)**
   - Material unit prices
   - Labour rates
   - Total costs
   - Financial breakdowns

3. **Purchase Request Lists**
   - Total Cost columns (in tables)
   - Total Cost displays (in cards)
   - Cost summaries

4. **Existing Requests Section**
   - Total Cost summary
   - Cost per request

### What Site Engineers CAN See
- Material names and descriptions
- Quantities needed
- Units of measurement (kg, m², nos, etc.)
- Labour types and work types
- Hours/workers needed
- Project and BOQ structure
- Request status and approval flow
- Simple informational messages about budget impact

### Implementation Notes
- Use `isSiteEngineer` flag to conditionally hide cost elements
- Show simplified messages instead of detailed budget breakdowns
- Remove cost columns from both table and card views
- Keep financial data visible for PM and other authorized roles

### Reminder
If any future feature requests involve showing costs to Site Engineers, please refer back to this policy and confirm with stakeholders before implementation.

---
*This policy ensures Site Engineers focus on operational aspects without being exposed to sensitive financial information.*
