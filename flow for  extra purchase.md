# Clean Flow: PM/SE Extra Materials Request with Overhead Tracking

## Core Concept
PM/SE can request **additional materials** that consume from the **original BOQ overhead budget**. The system tracks:
- ✅ Original overhead allocation
- ✅ Overhead consumed by extra materials
- ✅ Overhead balance (positive = within budget, negative = over budget)
- ✅ Material segregation: Original vs Extra Purchased

## 1. Database Model Changes

### New Table: `ChangeRequest`
```python
class ChangeRequest(db.Model):
    cr_id = Integer (PK)
    boq_id = Integer (FK to BOQ)
    project_id = Integer (FK to Project)
    
    # Requester info
    requested_by_user_id = Integer
    requested_by_name = String
    requested_by_role = String  # 'project_manager' or 'site_supervisor'
    
    # Request details
    request_type = String  # 'EXTRA_MATERIALS'
    justification = Text  # Why these materials needed
    status = String  # 'pending', 'approved', 'rejected'
    
    # Materials requested (JSONB)
    materials_data = JSONB  # Array of materials with qty, price
    
    # Financial tracking
    materials_total_cost = Float  # Total cost of extra materials
    overhead_consumed = Float  # Overhead used by these materials
    overhead_balance_impact = Float  # Impact on overhead (negative means exceeds)
    profit_impact = Float  # Impact on profit margin
    
    # Original BOQ financials (snapshot at request time)
    original_overhead_allocated = Float
    original_overhead_used = Float
    original_overhead_remaining = Float
    
    # New totals after this request
    new_overhead_remaining = Float  # Can be negative
    new_total_cost = Float
    is_over_budget = Boolean  # True if overhead_balance_impact is negative
    
    # Approval
    approval_required_from = String  # 'estimator' or 'td'
    approved_by_user_id = Integer
    approved_by_name = String
    approval_date = DateTime
    rejection_reason = Text
    
    # Timestamps
    created_at = DateTime
    updated_at = DateTime
```

## 2. Financial Calculation Logic

### When PM/SE Adds Extra Materials:

**Step 1: Calculate Material Costs**
```python
materials_added = [
    {"name": "Cement", "qty": 10, "unit": "bags", "price": 400, "total": 4000},
    {"name": "Steel", "qty": 50, "unit": "kg", "price": 60, "total": 3000}
]
total_material_cost = 7000  # Sum of all materials
```

**Step 2: Calculate Overhead Consumption**
```python
# Overhead % from original BOQ (e.g., 10%)
overhead_percentage = original_boq_overhead_percentage  # 10%
overhead_consumed = total_material_cost * (overhead_percentage / 100)
# overhead_consumed = 7000 * 0.10 = 700
```

**Step 3: Check Overhead Balance**
```python
original_overhead_allocated = 50000  # From original BOQ
original_overhead_used = 35000  # Already consumed
original_overhead_remaining = 15000  # Available

new_overhead_remaining = original_overhead_remaining - overhead_consumed
# new_overhead_remaining = 15000 - 700 = 14300 (POSITIVE - Within budget)

# OR if materials_cost was 100000, overhead would be 10000
# new_overhead_remaining = 15000 - 10000 = 5000 (still positive)

# OR if materials_cost was 200000, overhead would be 20000
# new_overhead_remaining = 15000 - 20000 = -5000 (NEGATIVE - Over budget!)
```

**Step 4: Calculate New BOQ Totals**
```python
new_base_cost = original_base_cost + total_material_cost
new_overhead_total = original_overhead_allocated  # Doesn't change
new_profit = (new_base_cost * profit_percentage) / 100
new_total_cost = new_base_cost + new_overhead_total + new_profit
```

## 3. API Workflow

### Step 1: PM/SE Creates Request
**POST** `/api/boq/{boq_id}/extra-materials`
```json
{
  "justification": "Need additional cement and steel for foundation extension",
  "materials": [
    {"material_name": "Cement", "quantity": 10, "unit": "bags", "unit_price": 400},
    {"material_name": "Steel Bars", "quantity": 50, "unit": "kg", "unit_price": 60}
  ]
}
```

**Response:**
```json
{
  "success": true,
  "cr_id": 123,
  "materials_total_cost": 7000,
  "overhead_consumed": 700,
  "overhead_status": {
    "original_allocated": 50000,
    "previously_used": 35000,
    "available_before": 15000,
    "consumed_by_request": 700,
    "available_after": 14300,
    "is_over_budget": false,
    "balance": "positive"
  },
  "approval_required_from": "estimator",
  "status": "pending"
}
```

### Step 2: Estimator/TD Views Request
**GET** `/api/change-requests/{cr_id}`

**Response includes:**
```json
{
  "cr_id": 123,
  "project_name": "Villa Project",
  "boq_name": "Foundation BOQ",
  "requested_by": "John Doe (PM)",
  "request_date": "2025-10-08",
  "status": "pending",
  
  "materials_requested": [...],
  "materials_total_cost": 7000,
  
  "overhead_analysis": {
    "original_allocated": 50000,
    "overhead_percentage": 10,
    "consumed_before_request": 35000,
    "consumed_by_this_request": 700,
    "total_consumed_if_approved": 35700,
    "remaining_after_approval": 14300,
    "is_within_budget": true,
    "balance_type": "positive",
    "balance_amount": 14300
  },
  
  "budget_comparison": {
    "original_boq_total": 550000,
    "new_boq_total_if_approved": 557000,
    "increase_amount": 7000,
    "increase_percentage": 1.27
  },
  
  "justification": "Need additional cement and steel for foundation extension"
}
```

### Step 3: Approval/Rejection
**POST** `/api/change-requests/{cr_id}/approve`
```json
{
  "comments": "Approved. Within overhead budget."
}
```

**POST** `/api/change-requests/{cr_id}/reject`
```json
{
  "rejection_reason": "Overhead exceeded. Reduce quantity or request budget increase."
}
```

## 4. BOQ View with Segregation

When viewing BOQ, show materials in **separate columns**:

### Original Purchase Section
```
┌─────────────────────────────────────────────────┐
│ ORIGINAL BOQ MATERIALS                          │
├─────────────────────────────────────────────────┤
│ Cement (50 bags)           ₹20,000              │
│ Steel (200 kg)             ₹12,000              │
│ Sand (10 tons)             ₹8,000               │
│                                                  │
│ Subtotal:                  ₹40,000              │
│ Overhead (10%):            ₹4,000               │
│ Profit (15%):              ₹6,000               │
│ Total:                     ₹50,000              │
└─────────────────────────────────────────────────┘
```

### Extra Purchase Section (After Approval)
```
┌─────────────────────────────────────────────────┐
│ EXTRA MATERIALS PURCHASED                       │
├─────────────────────────────────────────────────┤
│ Cement (10 bags)           ₹4,000   ▼ CR-123   │
│ Steel (50 kg)              ₹3,000   ▼ CR-123   │
│ Tiles (20 sqm)             ₹10,000  ▼ CR-145   │
│                                                  │
│ Subtotal:                  ₹17,000              │
│ Overhead Consumed:         ₹1,700 (from budget) │
└─────────────────────────────────────────────────┘
```

### Overhead Summary Panel
```
┌─────────────────────────────────────────────────┐
│ OVERHEAD BUDGET TRACKING                        │
├─────────────────────────────────────────────────┤
│ Total Overhead Allocated:  ₹50,000              │
│ Used by Original BOQ:      ₹35,000              │
│ Used by Extra Materials:   ₹1,700               │
│ Total Used:                ₹36,700              │
│                                                  │
│ Remaining Overhead:        ₹13,300 ✓ Positive   │
└─────────────────────────────────────────────────┘
```

### If Over Budget (Negative)
```
┌─────────────────────────────────────────────────┐
│ OVERHEAD BUDGET TRACKING                        │
├─────────────────────────────────────────────────┤
│ Total Overhead Allocated:  ₹50,000              │
│ Used by Original BOQ:      ₹35,000              │
│ Used by Extra Materials:   ₹20,000              │
│ Total Used:                ₹55,000              │
│                                                  │
│ Remaining Overhead:        -₹5,000 ✗ EXCEEDED   │
│ Additional Budget Needed:  ₹5,000               │
└─────────────────────────────────────────────────┘
```

## 5. Implementation Plan

### Backend:
1. Create `ChangeRequest` model in `models/change_request.py`
2. Add controller `controllers/change_request_controller.py`
3. Create routes in `routes/change_request_routes.py`
4. Add overhead calculation utilities
5. Update BOQ controller to merge approved requests
6. Email notifications for each status change

### Frontend:
1. **PM/SE:** "Request Extra Materials" button on BOQ view
2. **PM/SE:** Modal with material input form + justification
3. **PM/SE:** View request status and overhead impact
4. **Estimator/TD:** Change requests dashboard
5. **Estimator/TD:** Approval page with overhead analysis
6. **All:** BOQ view with Original vs Extra materials segregation
7. **All:** Overhead budget tracking panel

### Key Features:
- ✅ Real-time overhead calculation
- ✅ Positive/Negative balance indicator
- ✅ Material segregation (Original vs Extra)
- ✅ Change request tracking
- ✅ Approval workflow (Estimator/TD based on amount)
- ✅ Email notifications
- ✅ Audit trail in BOQ history

## 6. User Experience Flow

**PM on Site:**
1. Checks BOQ, sees overhead remaining: ₹13,300
2. Needs extra cement (₹5,000)
3. Clicks "Request Extra Materials"
4. Adds material details + justification
5. System shows: "Will consume ₹500 overhead, ₹12,800 will remain ✓"
6. Submits request → Email to Estimator

**Estimator:**
1. Receives email notification
2. Opens change request dashboard
3. Sees overhead impact: Within budget (+₹12,800 remaining)
4. Approves request
5. Materials automatically added to BOQ
6. PM receives approval email

**Viewing BOQ:**
- Original materials clearly separated
- Extra materials listed with CR references
- Overhead panel shows budget status
- Clear visibility: Within/Over budget