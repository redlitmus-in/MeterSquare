# M2 Store Integration - BUYER PURCHASE FLOW
## M2 Store = FIRST PRIORITY | Vendors = FALLBACK ONLY

---

## 🎯 **PRIORITY LOGIC**

```
┌─────────────────────────────────────────────────────────┐
│  AUTOMATIC M2 STORE CHECK (BUYER DOESN'T CHOOSE)       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  System automatically checks M2 Store for materials    │
│                                                         │
│  IF M2 has 100% quantity:                              │
│     → Use M2 Store ONLY ✅                             │
│     → NO vendor options shown                          │
│     → Buyer just confirms                              │
│                                                         │
│  IF M2 has partial quantity (e.g., 80/100):            │
│     → Use M2 for available (80) ✅                     │
│     → Vendor for remaining (20) ⚠️                     │
│     → Buyer confirms both sources                      │
│                                                         │
│  IF M2 has ZERO quantity:                              │
│     → Use Vendor ONLY ❌                               │
│     → Show vendor selection                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 **BUYER WORKFLOW (AUTOMATIC M2 PRIORITY)**

```
┌─────────────────────────────────────────────────────────┐
│  STEP 1: BUYER VIEWS PENDING PURCHASE                   │
│  ──────────────────────────────────────────────────     │
│  GET /api/buyer/new-purchases                           │
│                                                          │
│  CR-456: Project Alpha                                  │
│  Materials needed:                                       │
│  • Cement (PPC 43) - 100 bags                           │
│  • Steel Rebar 12mm - 50 pcs                            │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 2: BUYER CLICKS "REVIEW & PROCURE"               │
│  ──────────────────────────────────────────────────     │
│  System AUTOMATICALLY checks M2 Store                   │
│  GET /api/m2-store/check-availability?cr_id=456         │
│                                                          │
│  M2 Check Result:                                        │
│  • Cement: 80 bags available (80/100) ✅ PARTIAL       │
│  • Steel: 0 pcs available (0/50) ❌ NONE               │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 3: SYSTEM SHOWS AUTO-SPLIT PROCUREMENT           │
│  ──────────────────────────────────────────────────     │
│                                                          │
│  ✅ FROM M2 STORE (Priority):                           │
│  • Cement: 80 bags @ ₹380 = ₹30,400                    │
│  • Delivery: 4-6 hours                                   │
│                                                          │
│  ⚠️ FROM VENDORS (Required for remaining):              │
│  • Cement: 20 bags - [Select Vendor ▼]                 │
│  • Steel: 50 pcs - [Select Vendor ▼]                   │
│                                                          │
│  Buyer just selects vendors for items NOT in M2        │
│  M2 portion is AUTO-SELECTED                            │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 4: BUYER CONFIRMS PROCUREMENT                     │
│  ──────────────────────────────────────────────────     │
│  [Confirm M2 + Vendor Procurement]                      │
│                                                          │
│  Creates:                                                │
│  • M2 Withdrawal: M2-OUT-2025-0045 (80 bags cement)     │
│  • Vendor PO-123: Ultratech (20 bags cement)            │
│  • Vendor PO-124: ABC Steel (50 pcs steel)              │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 5: TD APPROVES                                    │
│  ──────────────────────────────────────────────────     │
│  TD sees:                                                │
│  • M2 Store: ✅ Auto-approved (internal source)         │
│  • Vendor selections: Review & approve                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 6: PROCUREMENT EXECUTES                           │
│  ──────────────────────────────────────────────────     │
│  M2 Store: Production Manager dispatches (4-6 hrs)      │
│  Vendors: POs sent, materials ordered (2-3 days)        │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 7: BUYER RECEIVES & COMPLETES                     │
│  ──────────────────────────────────────────────────     │
│  Mark complete when all sources received                │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 **THREE SCENARIOS**

### **SCENARIO A: M2 HAS 100% (Full Stock)**

```
Change Request: 100 bags Cement

M2 Store Check:
✅ M2 has: 100 bags available

BUYER SEES:
┌────────────────────────────────────────────┐
│  ✅ PROCUREMENT READY                      │
├────────────────────────────────────────────┤
│                                            │
│  All materials available in M2 Store!      │
│                                            │
│  FROM M2 STORE:                            │
│  • Cement: 100 bags @ ₹380 = ₹38,000     │
│  • Delivery: 4-6 hours ⚡                 │
│  • Cost savings: ₹2,000 vs vendors        │
│                                            │
│  No external vendors needed! ✅            │
│                                            │
│  [Confirm M2 Procurement]                  │
└────────────────────────────────────────────┘

RESULT:
• M2 Withdrawal created automatically
• NO vendor POs needed
• Fastest delivery (4-6 hours)
• Lowest cost
```

---

### **SCENARIO B: M2 HAS PARTIAL (Some Stock)**

```
Change Request:
• Cement: 100 bags
• Steel: 50 pcs

M2 Store Check:
✅ Cement: 80 bags available (partial)
❌ Steel: 0 pcs available (none)

BUYER SEES:
┌────────────────────────────────────────────┐
│  ⚠️ SPLIT PROCUREMENT REQUIRED             │
├────────────────────────────────────────────┤
│                                            │
│  ✅ FROM M2 STORE (Auto-allocated):        │
│  • Cement: 80 bags @ ₹380 = ₹30,400      │
│  • Delivery: 4-6 hours ⚡                 │
│                                            │
│  ─────────────────────────────────────     │
│                                            │
│  ⚠️ FROM VENDORS (Select below):           │
│                                            │
│  Cement (remaining 20 bags):               │
│  [Select Vendor ▼]                         │
│  • Ultratech - ₹410/bag (3 days)          │
│  • ACC - ₹415/bag (2 days)                │
│  • Ambuja - ₹408/bag (4 days)             │
│                                            │
│  Steel Rebar 12mm (50 pcs):                │
│  [Select Vendor ▼]                         │
│  • ABC Steel - ₹1,500/pc (2 days)         │
│  • XYZ Steel - ₹1,520/pc (3 days)         │
│                                            │
│  Total: M2 ₹30,400 + Vendors ₹84,800      │
│                                            │
│  [Confirm Split Procurement]               │
└────────────────────────────────────────────┘

RESULT:
• M2 Withdrawal: 80 bags cement (auto)
• Vendor PO #1: 20 bags cement (buyer selects)
• Vendor PO #2: 50 pcs steel (buyer selects)
```

---

### **SCENARIO C: M2 HAS ZERO (No Stock)**

```
Change Request:
• Cement: 100 bags
• Steel: 50 pcs

M2 Store Check:
❌ Cement: 0 bags available
❌ Steel: 0 pcs available

BUYER SEES:
┌────────────────────────────────────────────┐
│  ❌ M2 STORE NOT AVAILABLE                 │
├────────────────────────────────────────────┤
│                                            │
│  Materials not available in M2 Store.      │
│  Proceeding with vendor procurement.       │
│                                            │
│  SELECT VENDORS:                            │
│                                            │
│  Cement (100 bags):                        │
│  [Select Vendor ▼]                         │
│  • Ultratech - ₹410/bag (3 days)          │
│  • ACC - ₹415/bag (2 days)                │
│  • Ambuja - ₹408/bag (4 days)             │
│                                            │
│  Steel Rebar 12mm (50 pcs):                │
│  [Select Vendor ▼]                         │
│  • ABC Steel - ₹1,500/pc (2 days)         │
│  • XYZ Steel - ₹1,520/pc (3 days)         │
│                                            │
│  Total: ₹1,16,000 (all from vendors)      │
│                                            │
│  [Confirm Vendor Procurement]              │
└────────────────────────────────────────────┘

RESULT:
• NO M2 involvement
• Vendor PO #1: 100 bags cement
• Vendor PO #2: 50 pcs steel
• Traditional vendor procurement flow
```

---

## 🎨 **BUYER UI DESIGN**

### Pending Purchase Card (Shows M2 Availability)

```
┌────────────────────────────────────────────┐
│  CR-456 | Project Alpha                    │
│  Required: 2025-01-20 (5 days)             │
├────────────────────────────────────────────┤
│                                            │
│  Materials Needed:                         │
│  • Cement (PPC 43) - 100 bags             │
│  • Steel Rebar 12mm - 50 pcs              │
│                                            │
│  M2 Store Availability:                    │
│  ✅ Cement: 80% available (80/100)        │
│  ❌ Steel: Not available (0/50)           │
│                                            │
│  Estimated Split:                          │
│  💚 M2 Store: ₹30,400 (26%)               │
│  🔵 Vendors: ₹84,800 (74%)                │
│                                            │
│  [Review & Procure →]                      │
└────────────────────────────────────────────┘
```

### Procurement Review Screen

```
┌─────────────────────────────────────────────────────────┐
│  PROCUREMENT REVIEW - CR-456                            │
│  Project Alpha | Required: 2025-01-20                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ✅ FROM M2 STORE (Priority - Auto-allocated)           │
│  ┌───────────────────────────────────────────────────┐ │
│  │                                                   │ │
│  │  Material: Cement (PPC 43) - Ultratech 50kg      │ │
│  │  Quantity: 80 bags                                │ │
│  │  Unit Price: ₹380/bag                             │ │
│  │  Total: ₹30,400                                   │ │
│  │  Bin: Rack A-12, Batch: BATCH-2025-001           │ │
│  │  Delivery: 4-6 hours (Production Manager)         │ │
│  │                                                   │ │
│  │  ✓ Auto-approved (Internal source)                │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                          │
│  ⚠️ FROM EXTERNAL VENDORS (Required for shortfall)      │
│                                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 1. Cement (PPC 43) - Remaining 20 bags           │ │
│  │                                                   │ │
│  │ Select Vendor: [Ultratech Cement Ltd ▼]          │ │
│  │                                                   │ │
│  │ Available Vendors:                                │ │
│  │ • ✓ Ultratech - ₹410/bag | 3 days | Primary ⭐  │ │
│  │ • ACC - ₹415/bag | 2 days                        │ │
│  │ • Ambuja - ₹408/bag | 4 days                     │ │
│  │                                                   │ │
│  │ Selected: Ultratech (Primary)                     │ │
│  │ Unit Price: ₹410/bag                              │ │
│  │ Total: ₹8,200                                     │ │
│  │ Delivery: 3 days                                  │ │
│  └───────────────────────────────────────────────────┘ │
│                                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 2. Steel Rebar - TMT Fe500 12mm (50 pcs)         │ │
│  │                                                   │ │
│  │ Select Vendor: [ABC Steel Works ▼]               │ │
│  │                                                   │ │
│  │ Available Vendors:                                │ │
│  │ • ✓ ABC Steel - ₹1,500/pc | 2 days | Primary ⭐ │ │
│  │ • XYZ Steel - ₹1,520/pc | 3 days                 │ │
│  │                                                   │ │
│  │ Selected: ABC Steel (Primary)                     │ │
│  │ Unit Price: ₹1,500/piece                          │ │
│  │ Total: ₹75,000                                    │ │
│  │ Delivery: 2 days                                  │ │
│  └───────────────────────────────────────────────────┘ │
│                                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │ PROCUREMENT SUMMARY                               │ │
│  │                                                   │ │
│  │ M2 Store (Internal):           ₹30,400 (26%)     │ │
│  │ External Vendors:              ₹83,200 (74%)     │ │
│  │ ─────────────────────────────────────────────    │ │
│  │ TOTAL:                         ₹1,13,600         │ │
│  │                                                   │ │
│  │ Cost Saving vs All-Vendor:     ₹1,400 💰         │ │
│  │                                                   │ │
│  │ Delivery Timeline:                                │ │
│  │ • M2 items: 4-6 hours ⚡                         │ │
│  │ • Vendor items: 2-3 days                         │ │
│  └───────────────────────────────────────────────────┘ │
│                                                          │
│  Buyer Notes:                                            │
│  [Foundation work - M2 cement urgent, vendor OK later]   │
│                                                          │
│  [Cancel]                    [Confirm Procurement →]     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 **BACKEND AUTO-SPLIT LOGIC**

```python
@app.route('/api/m2-store/check-availability')
@jwt_required
def check_m2_availability():
    cr_id = request.args.get('cr_id')
    cr = ChangeRequest.query.get(cr_id)

    materials = cr.sub_items_data  # Materials needed
    result = {
        'cr_id': cr_id,
        'materials': [],
        'summary': {
            'total_items': 0,
            'fully_available_in_m2': 0,
            'partially_available_in_m2': 0,
            'not_available_in_m2': 0,
            'total_cost_m2': 0,
            'total_cost_vendor': 0,
            'requires_vendor': False
        }
    }

    for material in materials:
        material_id = material.get('master_material_id')
        quantity_needed = material.get('quantity')

        # Check M2 Store stock
        m2_stock = M2StoreStock.query.filter_by(
            material_id=material_id,
            is_deleted=False
        ).first()

        m2_available = m2_stock.available_quantity if m2_stock else 0

        # Determine fulfillment status
        if m2_available >= quantity_needed:
            can_fulfill = 'full'  # M2 has 100%
            result['summary']['fully_available_in_m2'] += 1
        elif m2_available > 0:
            can_fulfill = 'partial'  # M2 has some
            result['summary']['partially_available_in_m2'] += 1
            result['summary']['requires_vendor'] = True
        else:
            can_fulfill = 'none'  # M2 has zero
            result['summary']['not_available_in_m2'] += 1
            result['summary']['requires_vendor'] = True

        # Calculate costs
        m2_unit_cost = m2_stock.average_unit_cost if m2_stock else 0
        vendor_unit_cost = material.get('unit_price', 0)

        quantity_from_m2 = min(m2_available, quantity_needed)
        quantity_from_vendor = quantity_needed - quantity_from_m2

        cost_from_m2 = quantity_from_m2 * m2_unit_cost
        cost_from_vendor = quantity_from_vendor * vendor_unit_cost

        result['materials'].append({
            'material_id': material_id,
            'material_name': material.get('material_name'),
            'quantity_needed': quantity_needed,
            'unit': material.get('unit'),

            # M2 Store info
            'm2_available_quantity': m2_available,
            'quantity_from_m2': quantity_from_m2,
            'm2_unit_cost': m2_unit_cost,
            'cost_from_m2': cost_from_m2,
            'can_fulfill': can_fulfill,

            # Vendor info (for shortfall)
            'quantity_from_vendor': quantity_from_vendor,
            'vendor_unit_cost': vendor_unit_cost,
            'cost_from_vendor': cost_from_vendor,

            # Savings
            'unit_savings': vendor_unit_cost - m2_unit_cost if m2_available > 0 else 0,
            'total_savings': (vendor_unit_cost - m2_unit_cost) * quantity_from_m2
        })

        result['summary']['total_cost_m2'] += cost_from_m2
        result['summary']['total_cost_vendor'] += cost_from_vendor

    result['summary']['total_items'] = len(materials)

    # PRIORITY LOGIC:
    # If ANY material not fully in M2 → requires_vendor = True
    # Buyer MUST select vendors for shortfall items

    return jsonify(result)
```

---

## 🎯 **KEY DIFFERENCES FROM PREVIOUS PLAN**

### **BEFORE (Choice-Based):**
```
Buyer chooses between:
○ M2 Store
○ External Vendor
○ Hybrid
```

### **AFTER (Priority-Based):**
```
System AUTOMATICALLY uses:
✅ M2 Store FIRST (as much as available)
⚠️ Vendors ONLY for remaining (if needed)
❌ NO choice - M2 is ALWAYS used if available
```

---

## ✅ **BUYER WORKFLOW SUMMARY**

### **100% in M2:**
```
1. Buyer clicks "Review & Procure"
2. System shows: "All from M2 Store ✅"
3. Buyer confirms
4. M2 Withdrawal created automatically
5. Done! (No vendors needed)
```

### **Partial in M2:**
```
1. Buyer clicks "Review & Procure"
2. System shows:
   • M2 portion (auto-allocated)
   • Vendor dropdowns for remaining
3. Buyer selects vendors for shortfall ONLY
4. Buyer confirms
5. M2 Withdrawal + Vendor POs created
```

### **Zero in M2:**
```
1. Buyer clicks "Review & Procure"
2. System shows: "M2 not available ❌"
3. Buyer selects vendors for all materials
4. Buyer confirms
5. Vendor POs created (traditional flow)
```

---

## 🔑 **PRIORITY RULES**

1. ✅ **M2 Store = FIRST PRIORITY** (always use if available)
2. ⚠️ **Vendors = FALLBACK ONLY** (only for items not in M2)
3. 🚫 **NO BUYER CHOICE** for M2 vs Vendor (automatic)
4. ⚡ **FASTEST DELIVERY** (M2 items arrive first)
5. 💰 **LOWEST COST** (M2 cheaper than vendors)

---

**M2 STORE PRIORITY-BASED PROCUREMENT READY!** 🎯
