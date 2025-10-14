# Change Request Material Tracking - Implementation Summary

## Overview
This document describes the implementation of tracking approved change request materials in the Production Management section, marking them as "NEW" to distinguish them from original BOQ items.

## Problem Statement
When change requests are approved and completed, the materials need to be visible in the Production Management BOQ tracking with a clear indication that they came from a change request (not original BOQ or unplanned purchases).

## Solution Implemented

### 1. Database Changes

#### New Columns in `MaterialPurchaseTracking` table:
- `is_from_change_request` (Boolean, default: False) - Flags materials that originated from approved change requests
- `change_request_id` (Integer, nullable) - Foreign key linking back to the `change_requests` table

**Migration File**: `backend/migrations/add_change_request_tracking_to_materials.py`

#### Model Update:
**File**: `backend/models/boq.py`
- Added the two new columns to the `MaterialPurchaseTracking` model
- Added relationship to `ChangeRequest` model for easy navigation

### 2. Backend Changes

#### Change Request Controller (`backend/controllers/change_request_controller.py`)
**Lines 682-718**: When Estimator approves a change request (final approval):
1. Materials are added to BOQ (existing functionality)
2. **NEW**: `MaterialPurchaseTracking` entries are created for each material
3. Each entry is marked with:
   - `is_from_change_request = True`
   - `change_request_id = cr_id`
   - Empty `purchase_history` (will be filled when materials are actually purchased)

This creates a "placeholder" tracking entry that identifies the material as coming from a change request.

#### BOQ Tracking Controller (`backend/controllers/boq_tracking_controller.py`)
**Lines 240-278**: Updated `get_boq_planned_vs_actual()` function to include change request information:
- For each material in the comparison, check if it's from a change request
- Add fields to the response:
  - `is_from_change_request` (Boolean)
  - `change_request_id` (Integer)
  - `source` ("change_request", "original_boq", or "unplanned")

**Lines 337-373**: Also updated unplanned materials section to include the same CR information.

### 3. Frontend Changes

#### BOQ Tracking View (`frontend/src/components/boq/PlannedVsActualView.tsx`)

**Three sections updated:**

1. **Materials List View** (Lines 137-163):
   - Added blue badge next to material name: "NEW - CR #X"
   - Badge appears in the detailed BOQ view section

2. **Planned Budget Table** (Lines 260-276):
   - Added badge in the planned side-by-side comparison table
   - Shows next to sub-item names

3. **Actual Spending Table** (Lines 373-386):
   - Enhanced existing "NEW" badge logic
   - Prioritizes change request badge (blue) over generic unplanned badge (orange)
   - Shows "NEW - CR #X" for change request materials
   - Shows "NEW" for other unplanned materials

#### Badge Design:
```tsx
<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
  NEW - CR #{mat.change_request_id}
</span>
```

## How It Works - Complete Flow

### Step 1: Change Request Creation
User (PM/SE) creates a change request for extra materials needed.

### Step 2: Approval Workflow
Change request goes through approval chain:
- SE → PM → TD/Estimator (based on 40% overhead threshold)
- Or PM → TD/Estimator

### Step 3: Final Approval by Estimator
When Estimator approves:
1. **BOQ Update**: Materials are added as a new item in BOQ
2. **Tracking Entry Creation**: `MaterialPurchaseTracking` entries are created and marked as from CR
3. Status changes to "approved"

### Step 4: Material Purchase
When materials are actually purchased:
- Purchase is recorded in the existing tracking entry
- `purchase_history` JSONB field is updated with purchase details

### Step 5: Production Management View
When viewing BOQ Tracking (Planned vs Actual):
1. API returns all materials with `is_from_change_request` and `change_request_id` fields
2. Frontend displays blue "NEW - CR #X" badge next to change request materials
3. Users can clearly see which materials came from change requests vs original BOQ

## Badge Hierarchy

The system now shows three types of materials:

1. **Original BOQ Materials** (no badge)
   - Materials from the original BOQ estimation
   - Standard display

2. **Change Request Materials** (Blue badge: "NEW - CR #X")
   - Materials from approved change requests
   - Linked to specific CR for traceability
   - Source: `source: "change_request"`

3. **Unplanned Materials** (Orange badge: "NEW")
   - Materials purchased without prior approval/planning
   - Not in original BOQ, not from a change request
   - Source: `source: "unplanned"`

## Benefits

1. **Traceability**: Clear link between materials and their source change requests
2. **Accountability**: Easy to track which materials were approved via change request process
3. **Audit Trail**: Complete history of material additions with CR references
4. **Budget Tracking**: Can distinguish planned vs change request vs unplanned spending
5. **Visibility**: Production managers can see exactly what was added and why (click CR # for details)

## Database Migration

To apply the database changes:

```bash
cd backend
python migrations/add_change_request_tracking_to_materials.py
```

This will:
- Add `is_from_change_request` column (Boolean, default: False)
- Add `change_request_id` column (Integer, nullable)
- Create foreign key constraint to `change_requests` table

## Files Modified

### Backend
1. `backend/migrations/add_change_request_tracking_to_materials.py` (NEW)
2. `backend/models/boq.py` - Added columns to MaterialPurchaseTracking model
3. `backend/controllers/change_request_controller.py` - Create tracking entries on approval
4. `backend/controllers/boq_tracking_controller.py` - Include CR info in API response

### Frontend
1. `frontend/src/components/boq/PlannedVsActualView.tsx` - Display NEW badges with CR numbers

## Testing Checklist

- [ ] Run database migration successfully
- [ ] Create a change request with materials
- [ ] Approve change request (PM → TD/Estimator → Estimator final approval)
- [ ] Verify MaterialPurchaseTracking entries are created with `is_from_change_request=True`
- [ ] View Production Management / BOQ Tracking page
- [ ] Verify "NEW - CR #X" badge appears next to change request materials
- [ ] Purchase some change request materials
- [ ] Verify purchase history is recorded correctly
- [ ] Verify badge still appears after purchase

## Future Enhancements

1. **Click CR Badge**: Make badge clickable to view change request details
2. **Filter by Source**: Add filter to show only CR materials, only original, or only unplanned
3. **CR Summary**: Add summary showing total spend by change request
4. **Bulk Purchase from CR**: Add "Purchase All" button for approved change request materials
5. **Color Coding**: Use different colors for different CR types or approval levels

## Notes

- Materials are marked at approval time, before actual purchase
- The `purchase_history` field starts empty and is filled when materials are purchased
- Badge appears immediately after approval, even before purchase
- Badge persists throughout the material lifecycle
- Multiple change requests can add materials to the same BOQ item

---

**Implementation Date**: 2025-01-14
**Version**: 1.0.0
**Status**: ✅ Completed
