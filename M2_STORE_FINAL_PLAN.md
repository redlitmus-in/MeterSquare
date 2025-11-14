# M2 Store Inventory System - Final Implementation Plan
## (Integrated with Existing Vendor Management)

---

## OVERVIEW

A centralized **M2 Store** (MeterSquare internal inventory) that integrates seamlessly with your **existing vendor management system**.

**Key Concept:** M2 Store is **NOT a vendor** - it's a separate internal inventory that the Buyer checks **BEFORE** going to external vendors.

---

## 1. WORKFLOW

### Complete Material Procurement Flow

```
Site Engineer/PM needs materials
         ↓
Request sent to Buyer
         ↓
Buyer creates Purchase Order
         ↓
┌─────────────────────────────────────────────────┐
│  STEP 1: CHECK M2 STORE FIRST                  │
│  System automatically checks M2 Store inventory │
└─────────────────────────────────────────────────┘
         ↓
    ┌────────────────┴────────────────┐
    │                                  │
M2 Store HAS material         M2 Store DOESN'T have material
(Full or Partial)              (or insufficient quantity)
    │                                  │
    ↓                                  ↓
┌─────────────────────┐    ┌─────────────────────────┐
│ WITHDRAW from M2    │    │ USE EXISTING VENDORS    │
│ - Fast delivery     │    │ - System shows pre-     │
│ - No vendor process │    │   assigned vendors      │
│ - Cost effective    │    │ - Buyer selects vendor  │
└─────────────────────┘    └─────────────────────────┘
    │                                  │
    │         HYBRID OPTION:           │
    │    (If M2 has partial stock)     │
    │    Withdraw from M2 + Buy rest   │
    │            from vendor            │
    │                                  │
    └────────────────┬─────────────────┘
                     ↓
         ┌──────────────────────────┐
         │ FROM M2 STORE:           │
         │ Production Manager       │
         │ dispatches to Buyer      │
         └──────────────────────────┘
                     │
                     ↓
         ┌──────────────────────────┐
         │ FROM VENDOR:             │
         │ Vendor delivers to       │
         │ Production Manager       │
         │ (who adds to M2 Store)   │
         │ then to Buyer            │
         └──────────────────────────┘
                     │
                     ↓
         ┌──────────────────────────┐
         │ Buyer receives materials │
         │ (from M2 or Vendor)      │
         └──────────────────────────┘
                     │
                     ↓
         ┌──────────────────────────┐
         │ Buyer dispatches to      │
         │ Site Engineer/PM         │
         └──────────────────────────┘
                     │
                     ↓
         ┌──────────────────────────┐
         │ Site receives &          │
         │ confirms receipt         │
         └──────────────────────────┘
```

---

## 2. DATABASE SCHEMA

### 2.1 M2 Store Stock Table
```sql
CREATE TABLE m2_store_stock (
    stock_id SERIAL PRIMARY KEY,

    -- Material reference (links to existing boq_material)
    material_id INTEGER REFERENCES boq_material(material_id),
    material_name VARCHAR(500) NOT NULL,
    brand VARCHAR(200),
    size VARCHAR(200),
    specification TEXT,
    unit VARCHAR(50) NOT NULL,

    -- Stock quantities
    current_quantity DECIMAL(15,3) DEFAULT 0,
    reserved_quantity DECIMAL(15,3) DEFAULT 0,  -- Reserved for pending withdrawals
    available_quantity DECIMAL(15,3) DEFAULT 0,  -- current - reserved

    -- Reorder levels
    minimum_stock_level DECIMAL(15,3),
    reorder_point DECIMAL(15,3),
    maximum_stock_level DECIMAL(15,3),

    -- Cost tracking
    average_unit_cost DECIMAL(15,2),  -- Weighted average cost
    last_purchase_price DECIMAL(15,2),
    total_stock_value DECIMAL(15,2),  -- current_quantity * average_unit_cost

    -- Storage details
    bin_location VARCHAR(100),  -- e.g., "Rack A-12", "Section B"
    batch_number VARCHAR(100),
    expiry_date DATE,

    -- Status
    stock_status VARCHAR(50),  -- 'in_stock', 'low_stock', 'out_of_stock'
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,

    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_stock_updated_at TIMESTAMP,
    last_updated_by INTEGER REFERENCES users(user_id),

    -- Constraints
    UNIQUE(material_id, is_deleted),
    CHECK (current_quantity >= 0),
    CHECK (reserved_quantity >= 0),
    CHECK (available_quantity >= 0),

    -- Indexes
    INDEX idx_material_stock (material_id, is_deleted),
    INDEX idx_stock_status (stock_status),
    INDEX idx_low_stock (material_id) WHERE current_quantity <= reorder_point,
    INDEX idx_updated_at (last_stock_updated_at DESC)
);
```

### 2.2 M2 Store Movements Table
```sql
CREATE TABLE m2_store_movements (
    movement_id SERIAL PRIMARY KEY,
    movement_code VARCHAR(50) UNIQUE NOT NULL,  -- e.g., "M2-IN-2025-0001", "M2-OUT-2025-0001"

    -- Movement type
    movement_type VARCHAR(50) NOT NULL,
    -- 'stock_in' - Received from vendor and added to M2 Store (by Production Manager)
    -- 'withdrawal' - Withdrawn by Buyer from M2 Store
    -- 'return' - Returned to M2 Store from project/buyer
    -- 'adjustment' - Manual stock adjustment by Production Manager
    -- 'damage' - Damaged/expired stock write-off
    -- 'transfer' - Internal transfer between bins/sections

    -- Material details
    material_id INTEGER REFERENCES boq_material(material_id),
    material_name VARCHAR(500) NOT NULL,
    brand VARCHAR(200),
    size VARCHAR(200),
    unit VARCHAR(50) NOT NULL,

    -- Quantity and value
    quantity DECIMAL(15,3) NOT NULL,
    unit_price DECIMAL(15,2),
    total_value DECIMAL(15,2),

    -- Stock levels after transaction
    stock_before DECIMAL(15,3),
    stock_after DECIMAL(15,3),

    -- For 'stock_in' type (vendor purchase)
    vendor_purchase_order_id INTEGER,  -- Links to existing purchase_orders table
    vendor_id INTEGER,  -- Links to existing vendors table
    vendor_name VARCHAR(200),
    received_by INTEGER REFERENCES users(user_id),  -- Production Manager

    -- For 'withdrawal' type (to Buyer)
    withdrawn_by_user_id INTEGER REFERENCES users(user_id),  -- Buyer user_id
    withdrawn_for_project_id INTEGER REFERENCES project(project_id),
    withdrawn_for_user_id INTEGER REFERENCES users(user_id),  -- Final recipient (Site Eng/PM)
    buyer_purchase_order_id INTEGER,  -- Links to buyer's PO if applicable

    -- Dispatch details (for withdrawal to Buyer)
    dispatch_date TIMESTAMP,
    dispatched_by INTEGER REFERENCES users(user_id),  -- Production Manager
    delivery_person VARCHAR(200),
    vehicle_number VARCHAR(100),
    expected_delivery TIMESTAMP,

    -- Reason and documentation
    reason TEXT,
    notes TEXT,
    attachment_url VARCHAR(500),  -- Photos, receipts, documents

    -- Approval (for adjustments, damage write-offs)
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by INTEGER REFERENCES users(user_id),
    approval_date TIMESTAMP,
    approval_status VARCHAR(50),  -- 'pending', 'approved', 'rejected'

    -- Audit trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(user_id),
    created_by_name VARCHAR(200),
    created_by_role VARCHAR(100),

    -- Indexes
    INDEX idx_movement_type (movement_type, created_at DESC),
    INDEX idx_material_movements (material_id, created_at DESC),
    INDEX idx_vendor_purchase (vendor_purchase_order_id),
    INDEX idx_withdrawn_by (withdrawn_by_user_id, created_at DESC),
    INDEX idx_project_movements (withdrawn_for_project_id, created_at DESC),
    INDEX idx_movement_date (created_at DESC)
);
```

### 2.3 M2 Store Alerts Table
```sql
CREATE TABLE m2_store_alerts (
    alert_id SERIAL PRIMARY KEY,

    -- Material reference
    material_id INTEGER REFERENCES boq_material(material_id),
    material_name VARCHAR(500),
    brand VARCHAR(200),
    size VARCHAR(200),

    -- Stock levels
    current_quantity DECIMAL(15,3),
    reorder_point DECIMAL(15,3),
    minimum_stock_level DECIMAL(15,3),

    -- Alert details
    alert_type VARCHAR(50),  -- 'below_reorder', 'out_of_stock', 'near_expiry', 'excess_stock'
    alert_severity VARCHAR(50),  -- 'critical', 'warning', 'info'
    alert_message TEXT,

    -- Suggested action
    suggested_action VARCHAR(200),  -- e.g., "Create purchase order for 200 bags"
    suggested_vendor_id INTEGER,  -- Suggest primary vendor for this material

    -- Status
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by INTEGER REFERENCES users(user_id),
    acknowledged_at TIMESTAMP,

    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,

    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_unresolved_alerts (is_resolved, alert_severity, created_at DESC),
    INDEX idx_material_alerts (material_id, is_resolved)
);
```

### 2.4 Integration with Existing Tables

**NO CHANGES needed to existing tables!** M2 Store integrates seamlessly:

```sql
-- Existing tables remain unchanged:
-- ✅ vendors (existing vendor management)
-- ✅ boq_material (material master)
-- ✅ purchase_orders (buyer POs to vendors)
-- ✅ material_purchase_tracking (existing purchase tracking)
-- ✅ project (project data)

-- M2 Store references these existing tables via foreign keys
```

---

## 3. INTEGRATION WITH EXISTING VENDOR MANAGEMENT

### 3.1 How It Works

**Your Existing System:**
```sql
-- Material-Vendor mapping (existing)
SELECT
    m.material_id,
    m.material_name,
    v.vendor_id,
    v.vendor_name,
    mv.is_primary_vendor,
    mv.unit_price,
    mv.lead_time_days
FROM boq_material m
JOIN material_vendors mv ON m.material_id = mv.material_id
JOIN vendors v ON mv.vendor_id = v.vendor_id
WHERE m.material_id = 123  -- Cement
ORDER BY mv.is_primary_vendor DESC, mv.unit_price ASC;

-- Result:
-- material_id | material_name      | vendor_name        | is_primary | unit_price | lead_time
-- 123         | Cement (PPC 43)    | Ultratech Ltd      | TRUE       | 410        | 3 days
-- 123         | Cement (PPC 43)    | ACC Cement         | FALSE      | 415        | 2 days
-- 123         | Cement (PPC 43)    | Ambuja Cement      | FALSE      | 408        | 4 days
```

**M2 Store Integration:**
```javascript
// Buyer creates PO - System flow:

// STEP 1: Check M2 Store
const m2Stock = await checkM2StoreAvailability(material_id);
// Returns: { available: 80, unit_cost: 400, bin: 'A-12' }

// STEP 2: If M2 has insufficient or no stock, get vendors from EXISTING system
const vendors = await getAssignedVendors(material_id);
// Returns your existing vendor list for this material

// STEP 3: Show buyer both options
return {
    m2_store: {
        available: 80,
        unit_cost: 400,
        delivery: '4-6 hours'
    },
    vendors: [
        { id: 1, name: 'Ultratech', price: 410, is_primary: true, lead_time: 3 },
        { id: 2, name: 'ACC', price: 415, is_primary: false, lead_time: 2 },
        { id: 3, name: 'Ambuja', price: 408, is_primary: false, lead_time: 4 }
    ],
    recommendation: 'Withdraw 80 from M2, purchase 20 from Ultratech'
};
```

### 3.2 Buyer PO Creation Logic

```python
# Backend: Buyer creates PO for 100 bags cement

def create_purchase_order(material_id, quantity_needed, project_id):
    # Step 1: Check M2 Store
    m2_stock = M2StoreStock.query.filter_by(material_id=material_id).first()

    m2_available = m2_stock.available_quantity if m2_stock else 0

    # Step 2: Calculate shortfall
    shortfall = max(0, quantity_needed - m2_available)

    # Step 3: If shortfall exists, get vendors from EXISTING system
    vendors = []
    if shortfall > 0:
        vendors = get_material_vendors(material_id)  # Your existing function

    return {
        'material_id': material_id,
        'quantity_needed': quantity_needed,
        'm2_store': {
            'available': m2_available,
            'can_withdraw': min(quantity_needed, m2_available),
            'unit_cost': m2_stock.average_unit_cost if m2_stock else None
        },
        'shortfall': shortfall,
        'vendors': vendors,  # From your existing vendor management
        'recommendation': determine_best_option(m2_available, shortfall, vendors)
    }

# Example response:
{
    'material_id': 123,
    'quantity_needed': 100,
    'm2_store': {
        'available': 80,
        'can_withdraw': 80,
        'unit_cost': 400
    },
    'shortfall': 20,
    'vendors': [
        {'vendor_id': 1, 'name': 'Ultratech', 'price': 410, 'is_primary': True},
        {'vendor_id': 2, 'name': 'ACC', 'price': 415, 'is_primary': False}
    ],
    'recommendation': 'Withdraw 80 from M2 (₹32,000) + Buy 20 from Ultratech (₹8,200)'
}
```

### 3.3 When Buyer Submits PO

```python
def submit_purchase_order(data):
    """
    Buyer can choose:
    1. Withdraw all from M2 (if available)
    2. Buy all from vendor
    3. Hybrid: Withdraw from M2 + Buy from vendor
    """

    results = []

    # Process M2 withdrawal (if buyer chose M2)
    if data['from_m2']['quantity'] > 0:
        withdrawal = create_m2_withdrawal(
            material_id=data['material_id'],
            quantity=data['from_m2']['quantity'],
            withdrawn_by=current_user.user_id,
            for_project=data['project_id'],
            for_user=data['recipient_id']
        )

        # Notify Production Manager to dispatch
        notify_production_manager(withdrawal.movement_id)

        results.append({
            'type': 'm2_withdrawal',
            'code': withdrawal.movement_code,
            'quantity': data['from_m2']['quantity']
        })

    # Process vendor purchase (if buyer chose vendor)
    if data['from_vendor']['quantity'] > 0:
        # Use EXISTING purchase order creation logic
        vendor_po = create_vendor_purchase_order(
            vendor_id=data['vendor_id'],
            material_id=data['material_id'],
            quantity=data['from_vendor']['quantity'],
            unit_price=data['from_vendor']['unit_price'],
            project_id=data['project_id']
        )

        # Your existing vendor email notification
        send_po_to_vendor(vendor_po.po_id)

        results.append({
            'type': 'vendor_purchase',
            'po_number': vendor_po.po_number,
            'vendor': vendor_po.vendor_name,
            'quantity': data['from_vendor']['quantity']
        })

    return results
```

---

## 4. API ENDPOINTS

### 4.1 M2 Store Check API (for Buyer)

```
GET /api/buyer/check-m2-availability?material_id=123&quantity=100

Response:
{
    "success": true,
    "data": {
        "material_id": 123,
        "material_name": "Cement (PPC 43) - Ultratech 50kg",
        "quantity_requested": 100,
        "m2_store": {
            "available": 80,
            "unit": "bags",
            "unit_cost": 400,
            "total_value": 32000,
            "bin_location": "Rack A-12",
            "batch_number": "BATCH-2025-001",
            "quality": "Good",
            "can_fulfill": "partial",
            "delivery_time": "4-6 hours"
        },
        "shortfall": {
            "quantity": 20,
            "suggested_vendors": [
                {
                    "vendor_id": 1,
                    "vendor_name": "Ultratech Cement Ltd",
                    "is_primary": true,
                    "unit_price": 410,
                    "lead_time_days": 3,
                    "estimated_delivery": "2025-01-18"
                },
                {
                    "vendor_id": 2,
                    "vendor_name": "ACC Cement",
                    "is_primary": false,
                    "unit_price": 415,
                    "lead_time_days": 2,
                    "estimated_delivery": "2025-01-17"
                }
            ]
        },
        "recommendation": {
            "option": "hybrid",
            "description": "Withdraw 80 bags from M2 Store + Purchase 20 bags from Ultratech",
            "cost_breakdown": {
                "m2_store": 32000,
                "vendor": 8200,
                "total": 40200
            },
            "vs_all_vendor": {
                "all_vendor_cost": 41000,
                "savings": 800,
                "savings_percent": 1.95
            },
            "delivery": "M2: 4-6 hours, Vendor: 3 days"
        }
    }
}
```

### 4.2 Create M2 Withdrawal + Vendor PO

```
POST /api/buyer/create-purchase-order

Request:
{
    "project_id": 45,
    "requested_for_user_id": 67,  // Site Engineer
    "required_date": "2025-01-20",
    "priority": "urgent",
    "materials": [
        {
            "material_id": 123,
            "quantity_needed": 100,
            "from_m2": {
                "quantity": 80,
                "unit_cost": 400
            },
            "from_vendor": {
                "vendor_id": 1,
                "quantity": 20,
                "unit_price": 410
            }
        },
        {
            "material_id": 456,
            "quantity_needed": 50,
            "from_m2": {
                "quantity": 0  // Not available
            },
            "from_vendor": {
                "vendor_id": 5,
                "quantity": 50,
                "unit_price": 1500
            }
        }
    ],
    "notes": "Urgent requirement for foundation work"
}

Response:
{
    "success": true,
    "data": {
        "m2_withdrawals": [
            {
                "movement_code": "M2-OUT-2025-0045",
                "material": "Cement (PPC 43)",
                "quantity": 80,
                "value": 32000,
                "status": "pending_dispatch",
                "estimated_delivery": "2025-01-15 16:00"
            }
        ],
        "vendor_purchase_orders": [
            {
                "po_number": "PO-2025-0123",
                "vendor": "Ultratech Cement Ltd",
                "materials": [
                    {"material": "Cement (PPC 43)", "quantity": 20, "value": 8200}
                ],
                "total_value": 8200,
                "status": "sent_to_vendor",
                "expected_delivery": "2025-01-18"
            },
            {
                "po_number": "PO-2025-0124",
                "vendor": "ABC Steel Works",
                "materials": [
                    {"material": "Steel Rebar 12mm", "quantity": 50, "value": 75000}
                ],
                "total_value": 75000,
                "status": "sent_to_vendor",
                "expected_delivery": "2025-01-18"
            }
        ],
        "summary": {
            "total_items": 2,
            "total_quantity": 150,
            "m2_store_value": 32000,
            "vendor_value": 83200,
            "grand_total": 115200,
            "cost_saved": 800
        },
        "notifications": {
            "production_manager": "Notified for M2 dispatch",
            "vendors": "PO emails sent to 2 vendors",
            "requester": "Confirmation sent to John Doe"
        }
    }
}
```

### 4.3 Production Manager APIs

```
GET  /api/production-manager/m2-store/dashboard
     - M2 Store overview stats

GET  /api/production-manager/m2-store/stock
     - List all M2 Store inventory

GET  /api/production-manager/m2-store/stock/:material_id
     - Specific material stock details

POST /api/production-manager/m2-store/receive-stock
     - Receive materials from vendor, add to M2 Store

POST /api/production-manager/m2-store/dispatch
     - Dispatch materials to Buyer (from withdrawal request)

POST /api/production-manager/m2-store/adjust
     - Manual stock adjustment

GET  /api/production-manager/m2-store/pending-dispatches
     - List pending M2 withdrawals (to dispatch to Buyer)

GET  /api/production-manager/m2-store/pending-receipts
     - List pending vendor deliveries (to receive)

GET  /api/production-manager/m2-store/alerts
     - Low stock alerts

GET  /api/production-manager/m2-store/movements
     - Movement history
```

---

## 5. BUYER UI - ENHANCED PO FORM

### Purchase Order Screen with M2 Check

```
┌─────────────────────────────────────────────────────────────────┐
│  📝 Create Purchase Order                               [✕]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Project: [Project Alpha ▼]                                     │
│  For: [John Doe (Site Engineer) ▼]                              │
│  Required: [2025-01-20]  Priority: [● Urgent  ○ Normal]        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Material 1: Cement (PPC 43) - Ultratech 50kg            │ │
│  │                                                           │ │
│  │  Quantity Needed: [100] bags                             │ │
│  │                                                           │ │
│  │  ┌─ 📦 M2 STORE CHECK ────────────────────────────────┐  │ │
│  │  │                                                     │  │ │
│  │  │  ✅ AVAILABLE: 80 bags                             │  │ │
│  │  │     Location: Rack A-12                             │  │ │
│  │  │     Batch: BATCH-2025-001                           │  │ │
│  │  │     Quality: Good condition                         │  │ │
│  │  │     Unit Cost: ₹400/bag                             │  │ │
│  │  │     Delivery: 4-6 hours (via Production Manager)   │  │ │
│  │  │                                                     │  │ │
│  │  │  🔴 SHORTFALL: 20 bags                             │  │ │
│  │  │                                                     │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │                                                           │ │
│  │  Choose procurement method:                               │ │
│  │  ● Withdraw 80 from M2 + Buy 20 from vendor (Best)       │ │
│  │  ○ Withdraw only 80 from M2 Store                        │ │
│  │  ○ Purchase all 100 from vendor                          │ │
│  │                                                           │ │
│  │  ┌─ FROM M2 STORE ─────────────────────────────────────┐│ │
│  │  │  Withdraw: 80 bags                                   ││ │
│  │  │  Cost: ₹400/bag × 80 = ₹32,000                      ││ │
│  │  │  Delivery: 4-6 hours                                 ││ │
│  │  └──────────────────────────────────────────────────────┘│ │
│  │                                                           │ │
│  │  ┌─ FROM VENDOR (Your Assigned Vendors) ───────────────┐│ │
│  │  │                                                      ││ │
│  │  │  Purchase: 20 bags                                   ││ │
│  │  │                                                      ││ │
│  │  │  Select Vendor:                                      ││ │
│  │  │  ● Ultratech Cement Ltd (Primary) ⭐                ││ │
│  │  │    ₹410/bag | 3 days delivery | Rating: 4.5/5       ││ │
│  │  │                                                      ││ │
│  │  │  ○ ACC Cement                                        ││ │
│  │  │    ₹415/bag | 2 days delivery | Rating: 4.2/5       ││ │
│  │  │                                                      ││ │
│  │  │  ○ Ambuja Cement                                     ││ │
│  │  │    ₹408/bag | 4 days delivery | Rating: 4.0/5       ││ │
│  │  │                                                      ││ │
│  │  │  Selected: Ultratech (Primary)                       ││ │
│  │  │  Cost: ₹410/bag × 20 = ₹8,200                       ││ │
│  │  │  Expected: 2025-01-18 (3 days)                       ││ │
│  │  └──────────────────────────────────────────────────────┘│ │
│  │                                                           │ │
│  │  Total Cost: ₹40,200 (M2: ₹32,000 + Vendor: ₹8,200)    │ │
│  │  💰 Saved: ₹800 vs buying all from vendor!              │ │
│  │                                                           │ │
│  │  [Remove Material]                                        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Material 2: Steel Rebar - TMT Fe500 12mm                │ │
│  │                                                           │ │
│  │  Quantity Needed: [50] pieces                            │ │
│  │                                                           │ │
│  │  ┌─ 📦 M2 STORE CHECK ────────────────────────────────┐  │ │
│  │  │                                                     │  │ │
│  │  │  🔴 NOT AVAILABLE                                   │  │ │
│  │  │     Current Stock: 0 pieces                         │  │ │
│  │  │     Status: Out of stock                            │  │ │
│  │  │                                                     │  │ │
│  │  │  ⚠️ Alert sent to Production Manager to restock    │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │                                                           │ │
│  │  ┌─ FROM VENDOR (Your Assigned Vendors) ───────────────┐│ │
│  │  │                                                      ││ │
│  │  │  Purchase: 50 pieces                                 ││ │
│  │  │                                                      ││ │
│  │  │  ● ABC Steel Works (Primary) ⭐                     ││ │
│  │  │    ₹1,500/pc | 2 days | Rating: 4.8/5               ││ │
│  │  │                                                      ││ │
│  │  │  ○ XYZ Steel Ltd                                     ││ │
│  │  │    ₹1,520/pc | 3 days | Rating: 4.3/5               ││ │
│  │  │                                                      ││ │
│  │  │  Selected: ABC Steel (Primary)                       ││ │
│  │  │  Cost: ₹1,500/pc × 50 = ₹75,000                     ││ │
│  │  │  Expected: 2025-01-17 (2 days)                       ││ │
│  │  └──────────────────────────────────────────────────────┘│ │
│  │                                                           │ │
│  │  [Remove Material]                                        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [+ Add More Materials]                                         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  ORDER SUMMARY                                            │ │
│  │                                                           │ │
│  │  From M2 Store:                                           │ │
│  │  • Cement: 80 bags @ ₹400 = ₹32,000                      │ │
│  │  Delivery: 4-6 hours                                      │ │
│  │  M2 Subtotal: ₹32,000                                     │ │
│  │                                                           │ │
│  │  From Vendors:                                            │ │
│  │  • Ultratech: Cement 20 bags @ ₹410 = ₹8,200            │ │
│  │  • ABC Steel: Steel 50 pcs @ ₹1,500 = ₹75,000           │ │
│  │  Vendor Subtotal: ₹83,200                                 │ │
│  │                                                           │ │
│  │  GRAND TOTAL: ₹1,15,200                                   │ │
│  │  💰 Cost Saved by using M2: ₹800                         │ │
│  │                                                           │ │
│  │  Delivery Timeline:                                        │ │
│  │  • M2 Store items: 4-6 hours                              │ │
│  │  • Vendor items: 2-3 days                                 │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Notes: [Foundation work - M2 cement urgent, vendor items OK]  │
│                                                                 │
│  [Cancel]         [Save Draft]         [Create Purchase Order] │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. PRODUCTION MANAGER WORKFLOW

### 6.1 Receive Stock from Vendor → Add to M2 Store

```
Vendor delivers materials to Production Manager
         ↓
Production Manager verifies delivery (quality, quantity)
         ↓
Production Manager creates "Stock In" movement
         ↓
API: POST /api/production-manager/m2-store/receive-stock
{
    "vendor_po_id": 123,
    "materials": [{
        "material_id": 456,
        "quantity_received": 100,
        "unit_price": 410,
        "batch_number": "BATCH-2025-005",
        "bin_location": "Rack A-12",
        "quality_status": "good"
    }]
}
         ↓
Backend updates:
  1. m2_store_stock.current_quantity += 100
  2. m2_store_stock.available_quantity += 100
  3. Recalculate average_unit_cost (weighted average)
  4. Create m2_store_movements (type: 'stock_in')
  5. Update vendor purchase_order status
  6. If stock was low, resolve alert
         ↓
M2 Store inventory updated ✅
```

### 6.2 Dispatch to Buyer (from M2 Withdrawal Request)

```
Buyer creates M2 withdrawal
         ↓
Production Manager receives notification
         ↓
Production Manager opens "Pending Dispatches"
         ↓
Selects withdrawal to dispatch
         ↓
API: POST /api/production-manager/m2-store/dispatch
{
    "movement_id": 789,  // M2 withdrawal movement
    "dispatch_details": {
        "delivery_person": "Ramesh Kumar",
        "vehicle_number": "MH-12-AB-1234",
        "dispatch_date": "2025-01-15T14:00:00Z",
        "expected_delivery": "2025-01-15T16:00:00Z"
    }
}
         ↓
Backend updates:
  1. m2_store_stock.reserved_quantity -= quantity
  2. m2_store_stock.current_quantity -= quantity
  3. m2_store_stock.available_quantity updated
  4. m2_store_movements.dispatch_date = now
  5. m2_store_movements.dispatched_by = current_user
  6. Notify Buyer (materials dispatched)
  7. Update material_purchase_tracking (if linked to project)
         ↓
Materials dispatched to Buyer ✅
```

---

## 7. INTEGRATION WITH material_purchase_tracking

### Current Table Continues to Work

```python
# When materials are issued to project (from M2 or Vendor)
# Update existing material_purchase_tracking table

def update_purchase_tracking(material_id, project_id, boq_id, quantity, source):
    """
    source: 'm2_store' or 'vendor'
    """
    tracking = MaterialPurchaseTracking.query.filter_by(
        material_id=material_id,
        project_id=project_id,
        boq_id=boq_id
    ).first()

    if tracking:
        # Append to existing purchase_history
        tracking.purchase_history.append({
            'purchase_date': datetime.now(),
            'quantity': quantity,
            'unit_price': get_unit_price(material_id, source),
            'source': source,  # 'm2_store' or vendor name
            'is_m2_withdrawal': (source == 'm2_store'),
            'movement_id': movement_id if source == 'm2_store' else None,
            'vendor_po_id': po_id if source != 'm2_store' else None
        })
        tracking.total_quantity_purchased += quantity
        tracking.remaining_quantity += quantity
    else:
        # Create new tracking record
        tracking = MaterialPurchaseTracking(
            material_id=material_id,
            project_id=project_id,
            boq_id=boq_id,
            purchase_history=[{...}],
            total_quantity_purchased=quantity,
            remaining_quantity=quantity
        )
        db.session.add(tracking)

    db.session.commit()
```

**Result:** Your existing purchase tracking continues to work! Just adds `source` field to identify M2 vs Vendor.

---

## 8. IMPLEMENTATION PHASES (12 WEEKS)

### Phase 1: Database Setup (Week 1-2)
- ✅ Create 3 new tables (m2_store_stock, m2_store_movements, m2_store_alerts)
- ✅ Seed initial M2 Store data (if needed)
- ✅ Create indexes for performance
- ✅ Test integration with existing tables

**Deliverables:**
- Database schema complete
- Migration scripts tested
- Can query M2 stock and existing vendors together

### Phase 2: Production Manager Backend (Week 3-4)
- ✅ M2 Store stock APIs (CRUD)
- ✅ Receive stock from vendor API
- ✅ Dispatch to Buyer API
- ✅ Stock adjustment API
- ✅ Low stock alert generation
- ✅ Movement tracking

**Deliverables:**
- Production Manager can receive from vendors
- Production Manager can dispatch to Buyer
- Stock movements tracked
- Alerts generated

### Phase 3: Buyer Backend with M2 Check (Week 5-6)
- ✅ M2 availability check API
- ✅ Integration with existing vendor API
- ✅ Create hybrid PO (M2 + Vendor)
- ✅ M2 withdrawal creation
- ✅ Update material_purchase_tracking

**Deliverables:**
- Buyer sees M2 availability + existing vendors
- Can create M2 withdrawal + Vendor PO in one request
- Purchase tracking updated correctly

### Phase 4: Production Manager UI (Week 7-8)
- ✅ M2 Store dashboard
- ✅ Stock overview screen
- ✅ Receive stock form
- ✅ Dispatch to Buyer form
- ✅ Alerts page
- ✅ Movement history

**Deliverables:**
- Production Manager full UI working
- Can receive and dispatch materials
- View stock levels and alerts

### Phase 5: Buyer UI Enhancement (Week 9-10)
- ✅ Enhanced PO form with M2 check
- ✅ M2 availability display
- ✅ Vendor selection (existing vendors)
- ✅ Hybrid option selection
- ✅ Cost comparison display
- ✅ Pending M2 dispatches view

**Deliverables:**
- Buyer sees M2 check automatically
- Can choose M2, Vendor, or Hybrid
- Shows cost savings
- Mobile responsive

### Phase 6: Reports & Polish (Week 11-12)
- ✅ M2 Store reports (stock, movements, valuation)
- ✅ Excel/PDF export
- ✅ Real-time notifications (WebSocket)
- ✅ Email alerts for low stock
- ✅ Performance optimization
- ✅ User testing & bug fixes

**Deliverables:**
- Complete reporting system
- Email notifications
- Performance optimized
- Production ready

---

## 9. KEY BENEFITS

### For Business
1. **Cost Savings** - Reduce external purchases by utilizing M2 Store
2. **Faster Delivery** - M2 Store delivers in 4-6 hours vs vendor 2-3 days
3. **Better Control** - Centralized inventory visibility
4. **Reduced Stockouts** - Alerts when materials running low
5. **Data-Driven** - Know what materials to stock in M2

### For Buyer
1. **Automatic Check** - System automatically checks M2 before showing vendors
2. **Cost Comparison** - See M2 vs Vendor costs side-by-side
3. **Hybrid Option** - Combine M2 + Vendor in one PO
4. **Faster Procurement** - M2 materials available within hours
5. **Uses Existing Vendors** - No change to vendor management

### For Production Manager
1. **Clear Workflow** - Receive from vendors → Dispatch to Buyer
2. **Stock Visibility** - Real-time M2 Store inventory
3. **Smart Alerts** - Know when to reorder
4. **Audit Trail** - Complete movement history

---

## 10. SUCCESS METRICS

### After 3 Months
- **M2 Store Utilization**: 60-70% of materials from M2 Store
- **Cost Savings**: 10-15% reduction in procurement costs
- **Delivery Speed**: 80% of M2 items delivered within 6 hours
- **Stock Accuracy**: 95%+ inventory accuracy
- **Stock-Out Reduction**: <5% critical stock-outs

---

## SUMMARY

✅ **M2 Store is separate from vendors** - Not added to vendor list
✅ **Integrates with existing vendor management** - Uses your current vendor-material mappings
✅ **Buyer checks M2 first** - Automatic check before showing vendors
✅ **Production Manager manages M2** - Receives from vendors, dispatches to Buyer
✅ **Seamless integration** - Works with existing tables (no changes needed)
✅ **Hybrid procurement** - Can combine M2 + Vendor in one PO
✅ **Cost savings visibility** - Shows buyer how much saved by using M2

**Ready to implement! Which phase should we start with?** 🚀
