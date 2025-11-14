# M2 Store Integration Analysis
## Safe Integration with Existing Buyer Purchase Flow

---

## ✅ EXISTING SYSTEM ANALYSIS

### Your Current Purchase Flow (WILL NOT CHANGE)

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: PM/Site Engineer Creates Change Request               │
│  ────────────────────────────────────────────────────────────  │
│  POST /api/boq/{boq_id}/change-request                         │
│                                                                 │
│  Two Material Types:                                            │
│  ✅ EXISTING BOQ materials: master_material_id = 45 (number)   │
│  ✅ NEW materials: master_material_id = null                   │
│                                                                 │
│  Status: "pending"                                              │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: System Routes Based on Material Type                  │
│  ────────────────────────────────────────────────────────────  │
│  Code: change_request_controller.py:413                        │
│                                                                 │
│  IF all materials have master_material_id (existing):          │
│     → Route to BUYER directly                                   │
│     → Status: "approved" → "assigned_to_buyer"                 │
│                                                                 │
│  IF any material has master_material_id = null (new):          │
│     → Route to ESTIMATOR first for pricing                     │
│     → Status: "under_review"                                    │
│     → After Estimator approves: "approved" → "assigned_to_buyer"│
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Buyer Views Pending Purchases                         │
│  ────────────────────────────────────────────────────────────  │
│  GET /api/buyer/new-purchases                                   │
│                                                                 │
│  Buyer sees:                                                    │
│  • Change Request details                                       │
│  • Materials list (from sub_items_data JSONB)                  │
│  • Total cost                                                   │
│  • Project info                                                 │
│                                                                 │
│  Status: "assigned_to_buyer"                                    │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: Buyer Selects Vendor [🔵 M2 INTEGRATION POINT]       │
│  ────────────────────────────────────────────────────────────  │
│  POST /api/buyer/purchase/{cr_id}/select-vendor                │
│  { "vendor_id": 12 }                                            │
│                                                                 │
│  Current Flow:                                                  │
│  • Buyer opens VendorSelectionModal                            │
│  • Searches vendors by name/category                           │
│  • Selects active vendor                                        │
│  • System links vendor_id to CR                                │
│                                                                 │
│  If Buyer selects: vendor_selection_status = "pending_td_approval"│
│  If TD selects: vendor_selection_status = "approved"           │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: TD Approves Vendor (if Buyer selected)                │
│  ────────────────────────────────────────────────────────────  │
│  POST /api/buyer/purchase/{cr_id}/td-approve-vendor            │
│                                                                 │
│  TD reviews vendor selection                                    │
│  Approves or Rejects                                            │
│                                                                 │
│  If approved: vendor_selection_status = "approved"             │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: Buyer Marks Purchase Complete [🔵 M2 INTEGRATION POINT]│
│  ────────────────────────────────────────────────────────────  │
│  POST /api/buyer/complete-purchase                             │
│  { "cr_id": 456, "notes": "Materials received" }               │
│                                                                 │
│  System Actions:                                                │
│  1. Change status to "purchase_completed"                      │
│  2. For each material in sub_items_data:                       │
│     • If material doesn't exist in MasterMaterial → Create it  │
│     • Material now available for future BOQs                   │
│  3. Create MaterialPurchaseTracking entry                      │
│  4. Add to purchase_history JSONB array                        │
│  5. Update BOQ history                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔵 WHERE M2 STORE FITS (NO BREAKING CHANGES)

### Integration Point #1: During Vendor Selection

**CURRENT BEHAVIOR:**
```javascript
// VendorSelectionModal.tsx - Line ~50
const { data: vendors } = useQuery(
  ['vendors'],
  () => fetch('/api/vendors?status=active')
);

// Shows list of active vendors
// Buyer clicks vendor → Selects vendor_id
```

**ENHANCED WITH M2 STORE:**
```javascript
// VendorSelectionModal.tsx - ENHANCED
const { data: vendorsData } = useQuery(
  ['vendors-with-m2', cr_id],
  async () => {
    // Step 1: Get existing vendors (UNCHANGED)
    const vendors = await fetch('/api/vendors?status=active');

    // Step 2: Check M2 Store availability (NEW)
    const m2Check = await fetch(`/api/m2-store/check-availability?cr_id=${cr_id}`);

    return {
      traditional_vendors: vendors,  // Existing vendors
      m2_store: m2Check.data         // M2 availability
    };
  }
);

// UI: Shows M2 Store option FIRST (if available), then regular vendors
```

**NEW API ENDPOINT (won't affect existing):**
```
GET /api/m2-store/check-availability?cr_id=456

Response:
{
  "m2_available": true,
  "materials": [
    {
      "material_name": "Cement",
      "requested_quantity": 10,
      "m2_available_quantity": 10,
      "can_fulfill": "full",  // or "partial" or "none"
      "unit_price_m2": 380,
      "unit_price_market": 400,
      "savings": 200,
      "delivery_time": "4-6 hours"
    }
  ],
  "total_cost_m2": 3800,
  "total_cost_vendor": 4000,
  "total_savings": 200
}
```

### Integration Point #2: On Purchase Complete

**CURRENT BEHAVIOR:**
```python
# buyer_controller.py - complete_purchase()
def complete_purchase():
    cr = ChangeRequest.query.get(cr_id)
    cr.status = 'purchase_completed'

    # Add new materials to MasterMaterial
    for material in cr.sub_items_data:
        if not material['master_material_id']:
            # Create new material
            new_material = MasterMaterial(...)
            db.session.add(new_material)

    # Create purchase tracking
    tracking = MaterialPurchaseTracking(...)
    db.session.add(tracking)

    db.session.commit()
```

**ENHANCED WITH M2 STORE:**
```python
# buyer_controller.py - complete_purchase() - ENHANCED
def complete_purchase():
    cr = ChangeRequest.query.get(cr_id)
    cr.status = 'purchase_completed'

    # NEW: Check if this was M2 purchase
    is_m2_purchase = cr.vendor_id == M2_STORE_VENDOR_ID  # Special vendor ID for M2

    if is_m2_purchase:
        # NEW: Create M2 withdrawal/dispatch
        m2_movement = create_m2_withdrawal(cr)
        cr.m2_movement_id = m2_movement.movement_id  # Link to M2 movement

    # EXISTING: Add new materials to MasterMaterial (UNCHANGED)
    for material in cr.sub_items_data:
        if not material['master_material_id']:
            new_material = MasterMaterial(...)
            db.session.add(new_material)

    # EXISTING: Create purchase tracking (SLIGHTLY ENHANCED)
    tracking = MaterialPurchaseTracking(
        # ... existing fields ...
        is_from_m2_store=is_m2_purchase,  # NEW field (optional)
        m2_movement_id=m2_movement.movement_id if is_m2_purchase else None  # NEW
    )
    db.session.add(tracking)

    db.session.commit()
```

---

## ✅ WHAT WILL NOT CHANGE

### 1. ChangeRequest Table Structure
```sql
-- NO CHANGES to existing columns
-- OPTIONAL new columns (backward compatible):
ALTER TABLE change_requests ADD COLUMN m2_movement_id INTEGER;  -- Links to M2 if used
ALTER TABLE change_requests ADD COLUMN is_m2_purchase BOOLEAN DEFAULT FALSE;  -- Flag for M2
```

### 2. Material Type Detection Logic
```python
# change_request_controller.py:413 - UNCHANGED
has_new_materials = any(
    mat.get('master_material_id') is None
    for mat in (change_request.materials_data or [])
)

if has_new_materials:
    route = 'estimator'  # Still routes to estimator
else:
    route = 'buyer'      # Still routes to buyer
```

### 3. Vendor Selection Flow
```python
# UNCHANGED - Buyer still selects vendor_id
# M2 Store simply appears as an ADDITIONAL option
# All existing validation remains:
# - Vendor must be active
# - Vendor must exist
# - TD approval still required if Buyer selects
```

### 4. MaterialPurchaseTracking Structure
```python
# EXISTING purchase_history JSONB structure UNCHANGED:
{
    "purchase_date": "2025-01-16",
    "quantity": 10,
    "unit": "bags",
    "unit_price": 400,
    "total_price": 4000,
    "purchased_by": "John Buyer",
    "remaining_quantity": 7,
    # NEW fields (optional, for M2):
    "source": "m2_store",  # or "vendor"
    "m2_movement_id": 123   # if from M2
}
```

### 5. Frontend Components
```typescript
// PurchaseOrders.tsx - UNCHANGED
// MaterialsToPurchase.tsx - UNCHANGED
// PurchaseDetailsModal.tsx - UNCHANGED

// VendorSelectionModal.tsx - ENHANCED (not replaced)
// - Still shows traditional vendors
// - M2 option added at top if available
```

---

## 🔧 SAFE INTEGRATION APPROACH

### Option A: M2 as "Special Vendor" (SIMPLEST)

**Create M2 Store as a vendor:**
```sql
INSERT INTO vendors (
    company_name, email, status,
    is_m2_store,  -- NEW flag
    created_at
) VALUES (
    'M2 Store (Internal)',
    'noreply@metersquare.com',
    'active',
    TRUE,
    NOW()
);

-- Get the vendor_id (e.g., 999)
SELECT vendor_id FROM vendors WHERE company_name = 'M2 Store (Internal)';
```

**When Buyer selects M2:**
```javascript
// VendorSelectionModal - Buyer clicks "Buy from M2 Store"
await buyerService.selectVendorForPurchase(cr_id, 999);  // 999 = M2 vendor_id

// Backend handles it like any vendor
// EXCEPT:
// - Checks M2 inventory instead of sending PO email
// - Creates M2 withdrawal movement
// - Dispatches from Production Manager
```

**Benefits:**
- ✅ Zero changes to existing flow
- ✅ Uses existing vendor_id field
- ✅ All existing validations work
- ✅ TD approval still works
- ✅ No new database columns needed

### Option B: M2 as Separate System (MORE COMPLEX)

**Add M2-specific fields:**
```sql
ALTER TABLE change_requests
ADD COLUMN is_m2_purchase BOOLEAN DEFAULT FALSE,
ADD COLUMN m2_movement_id INTEGER REFERENCES m2_store_movements(movement_id);
```

**When Buyer selects M2:**
```javascript
// NEW endpoint
await buyerService.selectM2Store(cr_id, materials);

// Backend:
// - Sets is_m2_purchase = TRUE
// - Creates M2 withdrawal
// - Links m2_movement_id
// - Does NOT use vendor_id
```

**Benefits:**
- ✅ Clearer separation M2 vs Vendor
- ❌ Requires new API endpoints
- ❌ Requires new database columns
- ❌ More complex to maintain

---

## 📋 RECOMMENDED INTEGRATION PLAN

### Phase 1: M2 Store Backend (Independent)
**Create M2 Store tables and APIs without touching existing buyer flow:**

```sql
-- New tables (no impact on existing)
CREATE TABLE m2_store_stock (...);
CREATE TABLE m2_store_movements (...);
CREATE TABLE m2_store_alerts (...);

-- Add M2 Store as vendor
INSERT INTO vendors (...) VALUES (..., is_m2_store=TRUE);
```

**New APIs (no impact on existing):**
```
GET  /api/m2-store/stock                     -- Production Manager views inventory
POST /api/m2-store/receive-stock             -- Production Manager adds stock
POST /api/m2-store/dispatch                  -- Production Manager dispatches
GET  /api/m2-store/check-availability        -- Buyer checks before vendor selection
```

### Phase 2: Enhance Buyer Vendor Selection
**Modify VendorSelectionModal only:**

```typescript
// frontend/src/roles/buyer/components/VendorSelectionModal.tsx

// BEFORE:
const VendorSelectionModal = ({ cr_id }) => {
  const { data: vendors } = useQuery(['vendors'], fetchVendors);

  return (
    <Modal>
      <h2>Select Vendor</h2>
      {vendors.map(v => <VendorCard vendor={v} />)}
    </Modal>
  );
};

// AFTER:
const VendorSelectionModal = ({ cr_id }) => {
  const { data: vendors } = useQuery(['vendors'], fetchVendors);

  // NEW: Check M2 availability
  const { data: m2Data } = useQuery(
    ['m2-check', cr_id],
    () => fetch(`/api/m2-store/check-availability?cr_id=${cr_id}`)
  );

  return (
    <Modal>
      <h2>Select Procurement Source</h2>

      {/* NEW: M2 Store option (if available) */}
      {m2Data?.m2_available && (
        <M2StoreCard
          data={m2Data}
          onSelect={() => selectVendor(M2_VENDOR_ID)}  // Uses existing function
        />
      )}

      <Divider />

      {/* EXISTING: Traditional vendors */}
      <h3>External Vendors</h3>
      {vendors.map(v => <VendorCard vendor={v} />)}
    </Modal>
  );
};
```

**Backend - NO CHANGES to existing endpoints:**
```python
# buyer_controller.py - select_vendor_for_purchase() - UNCHANGED
# Works for both M2 (vendor_id=999) and traditional vendors

# ONLY addition:
@jwt_required
def select_vendor_for_purchase(cr_id):
    vendor_id = request.json.get('vendor_id')

    # Existing validation (UNCHANGED)
    vendor = Vendor.query.get(vendor_id)
    if not vendor or vendor.status != 'active':
        return {'error': 'Invalid vendor'}

    # NEW: Check if M2 Store
    if vendor.is_m2_store:
        # Create M2 withdrawal movement
        m2_movement = create_m2_withdrawal(cr_id, vendor_id)
        cr.m2_movement_id = m2_movement.movement_id

    # Existing logic (UNCHANGED)
    cr.vendor_id = vendor_id
    cr.vendor_name = vendor.company_name
    cr.vendor_selection_status = 'pending_td_approval'  # Still requires TD approval

    db.session.commit()
    return {'success': True}
```

### Phase 3: Production Manager M2 Dispatch
**Independent of buyer flow:**

```python
# Production Manager receives notification:
# "Buyer selected M2 Store for CR #456"

# Production Manager dispatches materials:
POST /api/m2-store/dispatch
{
  "m2_movement_id": 123,
  "delivery_person": "Ramesh",
  "vehicle": "MH-12-1234"
}

# System updates:
# - m2_store_stock.current_quantity -= quantity
# - m2_store_movements.dispatched_by = production_manager
# - Notify Buyer: "Materials dispatched from M2 Store"
```

### Phase 4: Buyer Completes Purchase
**Minimal changes to complete_purchase():**

```python
@jwt_required
def complete_purchase():
    cr_id = request.json.get('cr_id')
    cr = ChangeRequest.query.get(cr_id)

    # EXISTING (UNCHANGED)
    cr.status = 'purchase_completed'
    cr.purchase_completed_by_user_id = g.user['user_id']
    cr.purchase_completion_date = datetime.utcnow()

    # NEW: If M2 purchase, update M2 movement
    if cr.m2_movement_id:
        m2_movement = M2StoreMovement.query.get(cr.m2_movement_id)
        m2_movement.received_by_buyer = True
        m2_movement.buyer_receipt_date = datetime.utcnow()

    # EXISTING: Add new materials (UNCHANGED)
    for material in cr.sub_items_data:
        if not material.get('master_material_id'):
            # Create in MasterMaterial
            ...

    # EXISTING: Create purchase tracking (SLIGHTLY ENHANCED)
    tracking = MaterialPurchaseTracking(
        cr_id=cr_id,
        # ... all existing fields ...
        purchase_history=[{
            'purchase_date': datetime.utcnow(),
            'quantity': material['quantity'],
            'unit_price': material['unit_price'],
            'source': 'm2_store' if cr.m2_movement_id else 'vendor',  # NEW
            'm2_movement_id': cr.m2_movement_id  # NEW
        }]
    )
    db.session.add(tracking)

    db.session.commit()
    return {'success': True}
```

---

## 🎯 FINAL RECOMMENDATION

### Use **Option A: M2 as Special Vendor**

**Why?**
1. ✅ **Minimal Changes** - Only touch VendorSelectionModal
2. ✅ **Backward Compatible** - All existing flows work unchanged
3. ✅ **Simple to Test** - Easy to enable/disable M2 option
4. ✅ **Easy Rollback** - If issues, just hide M2 option in UI
5. ✅ **Reuses Existing Logic** - vendor_id, TD approval, complete_purchase all work

**Database Changes:**
```sql
-- Add flag to vendors table
ALTER TABLE vendors ADD COLUMN is_m2_store BOOLEAN DEFAULT FALSE;

-- Create M2 Store as vendor
INSERT INTO vendors (company_name, email, status, is_m2_store)
VALUES ('M2 Store', 'noreply@m2store.com', 'active', TRUE);

-- Optional: Link M2 movements
ALTER TABLE change_requests ADD COLUMN m2_movement_id INTEGER;
```

**Code Changes:**
- ✅ **VendorSelectionModal.tsx** - Add M2 option UI
- ✅ **buyerService.ts** - Add `checkM2Availability()` method
- ✅ **buyer_controller.py** - Add M2 handling in `select_vendor_for_purchase()` and `complete_purchase()`
- ✅ **NEW: m2_store_controller.py** - Production Manager APIs

**NO CHANGES:**
- ❌ ChangeRequest routing logic
- ❌ Material type detection
- ❌ Estimator flow
- ❌ TD approval flow
- ❌ PurchaseOrders.tsx
- ❌ MaterialsToPurchase.tsx
- ❌ Vendor table structure (just add 1 column)

---

## 🚦 TESTING STRATEGY

### Test 1: Existing Flow (Must Pass)
```
1. PM creates CR with existing BOQ material (master_material_id = 45)
2. CR routes to Buyer (skips Estimator)
3. Buyer selects traditional vendor
4. TD approves
5. Buyer completes purchase
6. MaterialPurchaseTracking created

✅ Expected: Works exactly as before
```

### Test 2: New Material Flow (Must Pass)
```
1. PM creates CR with new material (master_material_id = null)
2. CR routes to Estimator
3. Estimator approves with pricing
4. CR routes to Buyer
5. Buyer selects traditional vendor
6. Buyer completes purchase
7. New material added to MasterMaterial

✅ Expected: Works exactly as before
```

### Test 3: M2 Store Flow (New)
```
1. PM creates CR with existing material
2. CR routes to Buyer
3. Buyer opens Vendor Selection
4. System shows M2 Store option (materials available)
5. Buyer selects M2 Store
6. TD approves (vendor_id = M2_VENDOR_ID)
7. Production Manager dispatches from M2
8. Buyer completes purchase
9. MaterialPurchaseTracking shows source='m2_store'

✅ Expected: New flow works, doesn't break existing
```

### Test 4: M2 Not Available Flow (New)
```
1. PM creates CR
2. Buyer opens Vendor Selection
3. System checks M2: Not available
4. Only shows traditional vendors (same as before)
5. Buyer selects traditional vendor
6. Flow continues as Test 1

✅ Expected: Falls back to existing behavior
```

---

## 📊 IMPLEMENTATION CHECKLIST

### Backend
- [ ] Add `is_m2_store` column to `vendors` table
- [ ] Insert M2 Store as special vendor
- [ ] Create M2 Store tables (stock, movements, alerts)
- [ ] Create Production Manager M2 APIs
- [ ] Add M2 check endpoint: `GET /api/m2-store/check-availability`
- [ ] Enhance `select_vendor_for_purchase()` with M2 handling
- [ ] Enhance `complete_purchase()` with M2 tracking
- [ ] Write unit tests for M2 integration
- [ ] Write integration tests (existing flows must pass)

### Frontend
- [ ] Create `M2StoreCard` component
- [ ] Enhance `VendorSelectionModal` with M2 option
- [ ] Add `checkM2Availability()` to buyerService
- [ ] Create Production Manager M2 Dashboard
- [ ] Create Production Manager Dispatch UI
- [ ] Update buyer types to include M2 data
- [ ] Write component tests
- [ ] Test backward compatibility

### Testing
- [ ] Test existing BOQ material flow (must not break)
- [ ] Test new material flow (must not break)
- [ ] Test M2 Store selection flow
- [ ] Test M2 not available fallback
- [ ] Test Production Manager dispatch
- [ ] Test TD approval with M2
- [ ] Load test (ensure no performance regression)
- [ ] UAT with real buyers and production managers

---

## ✅ CONCLUSION

**M2 Store can be safely integrated as a "special vendor" without breaking your existing buyer purchase flow.**

**Key Principles:**
1. M2 Store appears as an **additional option** during vendor selection
2. All existing flows (BOQ materials, new materials, estimator routing) **remain unchanged**
3. M2 uses the **same vendor_id mechanism** as traditional vendors
4. TD approval, purchase completion, and tracking **work the same way**
5. If M2 not available, buyer sees **only traditional vendors** (existing behavior)

**Next Step:**
Would you like me to start implementing Phase 1 (M2 Store backend tables and Production Manager APIs)?

