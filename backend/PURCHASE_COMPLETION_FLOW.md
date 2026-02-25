# Purchase Completion Flow - M2 Store Routing

## Overview
This document explains the **single correct way** to complete material purchases in MeterSquare. The old direct-to-site flow has been deprecated.

---

## ✅ CORRECT FLOW (M2 Store Routing)

### Endpoint
```
POST /api/buyer/complete-purchase
```

### Location
`backend/controllers/buyer_controller.py` - Function: `complete_purchase()` (line ~2276)

### Flow Steps

1. **Buyer completes purchase** → Calls `/api/buyer/complete-purchase`

2. **Backend Actions:**
   - Sets `status = 'routed_to_store'`
   - Sets `delivery_routing = 'via_production_manager'`
   - Sets `store_request_status = 'pending_vendor_delivery'`
   - Creates `InternalMaterialRequest` records for each material
   - Adds materials to `MasterMaterial` table
   - Sends notification emails

3. **InternalMaterialRequest Created:**
   ```python
   InternalMaterialRequest(
       cr_id=cr_id,
       project_id=project_id,
       request_buyer_id=buyer_id,
       material_name="Material Name",
       quantity=quantity,
       source_type='from_vendor_delivery',
       status='awaiting_vendor_delivery',
       vendor_delivery_confirmed=False,
       final_destination_site="Project Name",
       routed_by_buyer_id=buyer_id,
       routed_to_store_at=datetime.utcnow(),
       request_send=True
   )
   ```

4. **Production Manager sees request** in Stock Out page (pending vendor delivery)

5. **Vendor delivers** → PM confirms receipt → Status changes to material available in M2 Store

6. **PM dispatches to site** → Materials sent to project site

---

## ❌ DEPRECATED FLOW (Direct to Site) - DO NOT USE

### Deprecated Endpoint
```
POST /api/change-request/<cr_id>/complete-purchase
```

### Location
- **Route:** `backend/routes/change_request_routes.py` - DISABLED (commented out)
- **Function:** `backend/controllers/change_request_controller.py` - `complete_purchase_and_merge_to_boq()` - REPLACED WITH STUB (returns 410 error)

### Why Deprecated
1. ❌ Set `status = 'purchase_completed'` (bypasses M2 Store)
2. ❌ Did NOT create `InternalMaterialRequest` records
3. ❌ Production Manager couldn't track incoming vendor deliveries
4. ❌ Merged materials directly to BOQ without inventory tracking
5. ❌ No proper M2 Store workflow
6. ❌ Caused confusion with duplicate code paths

### What Happened
- **456 lines of duplicate code** removed from `change_request_controller.py`
- Function replaced with stub that returns HTTP 410 (Gone)
- Route commented out with deprecation notice

---

## Status Tracking

### Change Request Statuses

| Status | Meaning | Used In Flow |
|--------|---------|--------------|
| `purchase_completed` | OLD - Direct to site (DEPRECATED) | ❌ Old flow only |
| `routed_to_store` | NEW - Sent to M2 Store via PM | ✅ Current flow |

### InternalMaterialRequest Statuses

| Status | Meaning |
|--------|---------|
| `awaiting_vendor_delivery` | Buyer completed purchase, waiting for vendor to deliver to M2 Store |
| `vendor_delivered` | Vendor delivered to M2 Store, PM confirmed receipt |
| `dispatched_to_site` | PM dispatched materials from M2 Store to project site |
| `approved` | (Legacy status for older requests) |
| `rejected` | Request was rejected |

---

## Frontend Constants

### MATERIAL_CONSUMING_STATUSES
Defined in `frontend/src/lib/constants.ts` (lines 388-405)

These statuses count materials as "reserved" in BOQ allocation to prevent double-purchasing:

```typescript
export const MATERIAL_CONSUMING_STATUSES = [
  'pending',              // SE created, not sent yet
  'send_to_pm',          // SE sent to PM
  'under_review',        // PM reviewing
  'approved_by_pm',      // PM approved
  'send_to_est',         // Sent to estimator
  'send_to_mep',         // Sent to MEP
  'send_to_buyer',       // Sent to buyer
  'pending_td_approval', // Pending TD approval
  'approved_by_td',      // TD approved
  'approved',            // Final approval
  'assigned_to_buyer',   // Assigned to buyer
  'purchase_completed',  // OLD - Direct to site (kept for legacy)
  'routed_to_store',     // NEW - Sent to M2 Store ✅
  'vendor_approved',     // Vendor approved by TD
  'split_to_po_children', // Split into vendor POs
];
```

**IMPORTANT:** Materials are marked as "consumed" once they enter ANY workflow stage, even if vendor hasn't delivered yet. This prevents multiple SEs from requesting the same materials.

---

## Database Schema

### Change Request Fields
```sql
status                    VARCHAR    -- 'routed_to_store' or old 'purchase_completed'
delivery_routing          VARCHAR    -- 'via_production_manager' or old 'direct_to_site'
store_request_status      VARCHAR    -- 'pending_vendor_delivery', 'vendor_delivered', etc.
purchase_completed_by_user_id  INTEGER
purchase_completion_date  TIMESTAMP
routed_to_store_at       TIMESTAMP
```

### InternalMaterialRequest Fields
```sql
request_id               SERIAL PRIMARY KEY
cr_id                   INTEGER
project_id              INTEGER
request_buyer_id        INTEGER
material_name           VARCHAR
quantity                NUMERIC
brand                   VARCHAR
size                    VARCHAR
source_type             VARCHAR    -- 'from_vendor_delivery'
status                  VARCHAR    -- 'awaiting_vendor_delivery', 'vendor_delivered', etc.
vendor_delivery_confirmed BOOLEAN
final_destination_site  VARCHAR
routed_by_buyer_id     INTEGER
routed_to_store_at     TIMESTAMP
request_send           BOOLEAN
materials_data         JSONB      -- Full material details
materials_count        INTEGER
created_at             TIMESTAMP
created_by             VARCHAR
```

---

## Multiple Complete Purchase Functions

There are **5 different "complete purchase" functions** in the codebase. Here's what each does:

### 1. ✅ `complete_purchase()` - BUYER CONTROLLER (CURRENT)
- **Location:** `buyer_controller.py` line ~2276
- **Endpoint:** `POST /api/buyer/complete-purchase`
- **Purpose:** Main purchase completion flow with M2 Store routing
- **Status:** ✅ **ACTIVE - USE THIS ONE**

### 2. ❌ `complete_purchase_and_merge_to_boq()` - CHANGE REQUEST CONTROLLER (DEPRECATED)
- **Location:** `change_request_controller.py` line ~2338
- **Endpoint:** `POST /api/change-request/<cr_id>/complete-purchase` (commented out)
- **Purpose:** Old flow that bypassed M2 Store
- **Status:** ❌ **DEPRECATED - DISABLED (returns 410 error)**

### 3. ✅ `complete_po_child_purchase()` - BUYER CONTROLLER
- **Location:** `buyer_controller.py` line ~5358
- **Endpoint:** `POST /api/buyer/po-child/<po_child_id>/complete-purchase`
- **Purpose:** Complete purchase for split vendor POs (when TD splits one CR into multiple vendor POs)
- **Status:** ✅ **ACTIVE - Different purpose, keep this**

### 4. ✅ `complete_se_boq_purchase()` - BUYER CONTROLLER
- **Location:** `buyer_controller.py` line ~8013
- **Endpoint:** `POST /api/buyer/se-boq-assignment/<assignment_id>/complete`
- **Purpose:** Complete BOQ assignments where SE directly purchases from BOQ allocation
- **Status:** ✅ **ACTIVE - Different purpose, keep this**

### 5. ✅ `complete_from_store()` - BUYER CONTROLLER
- **Location:** `buyer_controller.py` line ~8513
- **Endpoint:** `POST /api/buyer/request-from-store/<cr_id>/complete`
- **Purpose:** Complete requests from existing M2 Store inventory (not vendor delivery)
- **Status:** ✅ **ACTIVE - Different purpose, keep this**

---

## Duplicate Prevention

The code has **3 layers of protection** against duplicate IMR creation:

### Layer 1: Status Check
```python
# buyer_controller.py line ~2312
allowed_statuses = ['assigned_to_buyer', 'vendor_approved', 'pending_td_approval']
if cr.status not in allowed_statuses:
    return jsonify({"error": "Purchase cannot be completed"}), 400
```
Once status changes to `'routed_to_store'`, the endpoint **rejects all further calls**.

### Layer 2: POChildren Check
```python
# buyer_controller.py line ~2449
po_children_exist = POChild.query.filter_by(parent_cr_id=cr.cr_id, is_deleted=False).first() is not None
if po_children_exist:
    log.info(f"CR has POChildren - skipping individual request creation")
```
If CR is split to multiple vendors, each vendor's POChild **creates its own grouped IMR**.

### Layer 3: Explicit IMR Existence Check (NEW)
```python
# buyer_controller.py line ~2452
existing_imr_count = InternalMaterialRequest.query.filter_by(cr_id=cr_id).count()
if existing_imr_count > 0:
    log.warning(f"CR already has {existing_imr_count} IMR(s) - skipping to prevent duplicates")
```
If IMR records already exist, **skip creation entirely** to prevent duplicates.

---

## Troubleshooting

### Problem: Completed purchase not showing in Production Manager Stock Out page

**Symptoms:**
- Change request shows `status='routed_to_store'`
- No records in Production Manager's "Material Requests" → "Pending" tab

**Root Cause:**
- No `InternalMaterialRequest` records were created
- This happens if the CR was completed BEFORE the new M2 Store flow was implemented
- Old code used `status='purchase_completed'` and didn't create IMR records

**Solution:**
1. Check if buyer used the OLD deprecated endpoint (should return 410 error now)
2. Run retroactive fix script: `python3 fix_missing_imr.py`
3. Add the CR ID to the script's main section (line ~164)
4. Script will create missing IMR records (one per material)

**Note:** This was needed for CR-540, CR-541, and CR-542 which were completed before 2026-01-12. **All new purchases after this date automatically create IMR records** - no manual intervention needed! ✅

**How Many IMR Records Per CR?**
- The system creates **ONE IMR record per material** in the CR
- If a CR has 2 materials, it will create 2 IMR records (this is CORRECT, not a duplicate)
- Example: CR-542 has 2 materials → 2 IMR records (#20, #21) ✅

### Problem: BOQ allocation shows "0 Available" immediately after purchase

**Symptoms:**
- BOQ shows "Already Requested/Purchased: X units"
- "Available" shows 0 or negative
- Vendor hasn't delivered yet

**Explanation:**
This is **CORRECT BEHAVIOR**. Materials are marked as "consumed" once they enter the workflow to prevent double-purchasing.

**Status Flow:**
1. SE creates request → `status='pending'` → BOQ counts as consumed ✅
2. PM approves → `status='approved_by_pm'` → Still consumed ✅
3. Buyer completes → `status='routed_to_store'` → Still consumed ✅
4. Vendor delivers → PM confirms → Materials available in M2 Store
5. PM dispatches → Materials sent to site

---

## Code Cleanup Summary

### What Was Removed
- **416 lines** of deprecated code from `change_request_controller.py`
- Old `complete_purchase_and_merge_to_boq()` function body
- Duplicate BOQ merging logic
- Deprecated route (commented out with clear notice)

### What Was Kept
- Function stub that returns HTTP 410 (Gone) error
- Clear deprecation notices in code
- Documentation for future reference
- Git history preserves old implementation if needed

---

## Migration Notes

### For Existing CRs with status='purchase_completed'
- These CRs used the old direct-to-site flow
- They will **NOT** appear in Production Manager Stock Out page
- If needed, use fix script to retroactively create IMR records

### For New CRs
- Always use `POST /api/buyer/complete-purchase`
- Status will be `'routed_to_store'`
- IMR records will be created automatically
- Production Manager will see them in Stock Out page

---

## Testing Checklist

- [ ] Buyer completes purchase → Status set to `'routed_to_store'`
- [ ] InternalMaterialRequest records created
- [ ] Production Manager sees request in Stock Out → Pending tab
- [ ] Request shows "Awaiting Vendor Delivery" badge
- [ ] BOQ allocation counts materials as "Already Requested/Purchased"
- [ ] Available quantity reduced appropriately
- [ ] Old deprecated endpoint returns 410 error if called
- [ ] No materials merged directly to BOQ

---

**Last Updated:** 2026-01-12
**Author:** Development Team
**Version:** 2.0 (M2 Store Flow)
