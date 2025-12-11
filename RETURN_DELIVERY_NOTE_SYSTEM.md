# Return Delivery Note (RDN) System - Implementation Guide

**Created:** 2025-12-11
**Purpose:** Formal material return tracking from sites to store with delivery notes
**Status:** Database & Models Complete | API & Frontend Pending

---

## Overview

The Return Delivery Note (RDN) system mirrors the Production Manager's outbound delivery note flow, providing formal documentation for material returns from project sites to the store. This enhances security, accountability, and audit trails.

---

## ✅ Completed Components

### 1. Database Schema

**Tables Created:**
- `return_delivery_notes` - Main RDN records
- `return_delivery_note_items` - Line items for each RDN
- Added `return_delivery_note_id` column to `material_returns` table

**RDN Number Format:** `RDN-2025-001` (auto-incrementing sequence)

**Status Workflow:**
```
DRAFT → Site Engineer creates RDN
  ↓
ISSUED → RDN is finalized and ready for dispatch
  ↓
IN_TRANSIT → Materials are being transported to store
  ↓
RECEIVED → Store confirms receipt (or PARTIAL if qty differs)
```

**Key Fields:**
- `return_note_number` (VARCHAR(50), UNIQUE) - e.g., RDN-2025-004
- `project_id` (INTEGER) - Source project
- `return_date` (TIMESTAMP) - Scheduled return date
- `returned_by` (VARCHAR(255)) - Site Engineer name
- `return_to` (VARCHAR(255), DEFAULT 'M2 Store') - Destination
- `original_delivery_note_id` (FK) - Links to original outbound DN
- `vehicle_number`, `driver_name`, `driver_contact` - Transport details
- `prepared_by`, `checked_by` - Responsibility tracking
- `status` - Workflow status
- `notes` - General notes
- **Store Acceptance:**
  - `accepted_by` - Store manager/PM who accepted
  - `accepted_at` - Acceptance timestamp
  - `acceptance_notes` - Acceptance comments
- **Audit Fields:**
  - `created_at`, `created_by`, `last_modified_at`, `last_modified_by`
  - `issued_at`, `issued_by`, `dispatched_at`, `dispatched_by`

**RDN Item Fields:**
- `return_item_id` (PK)
- `return_note_id` (FK to return_delivery_notes)
- `inventory_material_id` (FK to inventory_materials)
- `original_delivery_note_item_id` (FK to delivery_note_items) - Traceability
- `material_return_id` (FK to material_returns) - Links to individual return records
- `quantity` (REAL) - Quantity being returned
- `condition` (VARCHAR(20)) - Good, Damaged, Defective
- `return_reason` (TEXT) - Why material is being returned
- `notes` (TEXT) - Item-specific notes
- **Acceptance:**
  - `quantity_accepted` (REAL) - Accepted quantity (may differ from returned)
  - `acceptance_status` (VARCHAR(20)) - PENDING, ACCEPTED, REJECTED, PARTIAL
- `inventory_transaction_id` (INTEGER) - Stock adjustment record

**Indexes Created:**
- `idx_return_delivery_notes_project_id`
- `idx_return_delivery_notes_status`
- `idx_return_delivery_notes_return_date`
- `idx_return_delivery_notes_created_at`
- `idx_return_delivery_notes_number`
- `idx_return_delivery_notes_original_dn`
- `idx_return_note_items_note_id`
- `idx_return_note_items_material_id`
- `idx_return_note_items_original_dn_item`
- `idx_return_note_items_material_return`
- `idx_return_note_items_condition`

---

### 2. SQLAlchemy Models

**File:** `/home/development1/Desktop/MeterSquare/backend/models/inventory.py`

**Models Added:**
1. `ReturnDeliveryNote` (lines 326-393)
   - Complete model with all RDN fields
   - Relationship to `ReturnDeliveryNoteItem` (one-to-many, cascade delete)
   - Relationship to `MaterialDeliveryNote` (original DN reference)
   - `to_dict()` method for JSON serialization

2. `ReturnDeliveryNoteItem` (lines 396-441)
   - Complete line item model
   - Relationships to:
     - `InventoryMaterial` (material details)
     - `DeliveryNoteItem` (original dispatch item)
     - `MaterialReturn` (individual return record)
     - `ReturnDeliveryNote` (parent RDN)
   - `to_dict()` method with material details

3. Updated `MaterialReturn` (line 160, 185)
   - Added `return_delivery_note_id` foreign key
   - Added relationship to `ReturnDeliveryNote`

**Migration File:** `/home/development1/Desktop/MeterSquare/backend/migrations/create_return_delivery_notes_table.py`

---

## 📋 Pending Components

### 3. Backend API Endpoints (To Be Created)

**File:** `/home/development1/Desktop/MeterSquare/backend/routes/inventory_routes.py`

**Endpoints Needed:**

```python
# RDN CRUD Operations
POST   /return_delivery_notes           # Create new RDN (DRAFT)
GET    /return_delivery_notes           # List all RDNs (filters: status, project, date range)
GET    /return_delivery_note/<id>       # Get specific RDN with items
PUT    /return_delivery_note/<id>       # Update RDN (DRAFT only)
DELETE /return_delivery_note/<id>       # Delete RDN (DRAFT/CANCELLED only)

# RDN Item Management
POST   /return_delivery_note/<id>/items            # Add item to RDN
PUT    /return_delivery_note/<id>/items/<item_id>  # Update RDN item
DELETE /return_delivery_note/<id>/items/<item_id>  # Remove RDN item

# RDN Workflow Actions
POST   /return_delivery_note/<id>/issue      # Issue RDN (finalize)
POST   /return_delivery_note/<id>/dispatch   # Mark as dispatched
POST   /return_delivery_note/<id>/confirm    # Store confirms receipt
POST   /return_delivery_note/<id>/cancel     # Cancel RDN

# Site Engineer Specific
GET    /my-return-delivery-notes          # Get SE's project RDNs
GET    /my-materials-for-return           # Get materials available for RDN creation
```

**Controller Functions Needed:**

**File:** `/home/development1/Desktop/MeterSquare/backend/controllers/inventory_controller.py`

```python
def create_return_delivery_note(data):
    """
    Create a new RDN in DRAFT status

    Required fields:
    - project_id
    - return_date
    - returned_by (from JWT)

    Optional:
    - vehicle_number
    - driver_name
    - driver_contact
    - notes
    - items (can add later)

    Returns: RDN object with generated RDN number
    """
    pass


def add_return_delivery_note_item(return_note_id, item_data):
    """
    Add material to RDN

    Required:
    - inventory_material_id
    - quantity
    - condition (Good/Damaged/Defective)
    - return_reason

    Optional:
    - original_delivery_note_item_id (for traceability)
    - notes

    Validations:
    - Quantity must be available for return
    - Material must be from same project
    - RDN must be in DRAFT status
    """
    pass


def issue_return_delivery_note(return_note_id):
    """
    Finalize RDN and mark as ISSUED

    Actions:
    - Validate RDN has at least one item
    - Update status to ISSUED
    - Record issued_at, issued_by
    - Create material_return records for each item

    Cannot be undone
    """
    pass


def confirm_return_delivery(return_note_id, acceptance_data):
    """
    Store confirms receipt of returned materials

    Actions:
    - Update status to RECEIVED or PARTIAL
    - Record accepted_by, accepted_at
    - For each item:
      - Update quantity_accepted
      - Update acceptance_status
      - Create inventory transaction (add stock back for Good condition)
    - Update linked material_return records

    Required: acceptance_data with per-item quantities
    """
    pass


def get_materials_for_return_delivery_note(project_id):
    """
    Get materials available for creating RDN

    Returns:
    - List of delivered materials with returnable quantities
    - Grouped by original delivery note
    - Excludes already-returned quantities
    - Only from DELIVERED delivery notes

    Used to populate RDN creation modal
    """
    pass
```

---

### 4. Frontend Components (To Be Created)

#### 4.1 Create RDN Modal Component

**File:** `/home/development1/Desktop/MeterSquare/frontend/src/roles/site-engineer/components/CreateReturnDeliveryNoteModal.tsx`

**Features:**
- Multi-step wizard:
  1. **RDN Details:** Return date, vehicle, driver, notes
  2. **Select Materials:** Search/filter returnable materials
  3. **Review & Submit:** Summary before creation
- Material selection:
  - Show original DN number for traceability
  - Display returnable quantity per material
  - Select condition (Good/Damaged/Defective)
  - Enter return reason
  - Add item notes
- Validation:
  - At least one material required
  - Quantities within available limits
  - Vehicle info for transit
- Submit as DRAFT or ISSUE immediately
- Visual design similar to PM's dispatch modal

**UI Flow:**
```
┌─────────────────────────────────────────┐
│  🔵 Create Return Delivery Note         │
├─────────────────────────────────────────┤
│  Step 1: RDN Details                    │
│  ┌───────────────────────────────────┐  │
│  │ Return Date: [DatePicker]         │  │
│  │ Vehicle Number: [Input]           │  │
│  │ Driver Name: [Input]              │  │
│  │ Driver Contact: [Input]           │  │
│  │ Notes: [Textarea]                 │  │
│  └───────────────────────────────────┘  │
│                                          │
│  Step 2: Select Materials                │
│  ┌───────────────────────────────────┐  │
│  │ Original DN: MDN-2025-004         │  │
│  │ ┌──────────────────────────────┐  │  │
│  │ │ ☑ Ceramic Floor Tiles        │  │  │
│  │ │   Returnable: 16 Sqft        │  │  │
│  │ │   Quantity: [Input]          │  │  │
│  │ │   Condition: [Good/Damaged]  │  │  │
│  │ │   Reason: [Input]            │  │  │
│  │ └──────────────────────────────┘  │  │
│  │ ... more materials ...            │  │
│  └───────────────────────────────────┘  │
│                                          │
│  Step 3: Review & Submit                 │
│  [Summary table with all items]          │
│                                          │
│  [Cancel] [Save as Draft] [Issue RDN]    │
└─────────────────────────────────────────┘
```

#### 4.2 Update MaterialReceipts.tsx

**File:** `/home/development1/Desktop/MeterSquare/frontend/src/roles/site-engineer/pages/MaterialReceipts.tsx`

**Changes Needed:**
1. Add new tab: "Return Delivery Notes"
2. Replace individual return modal with:
   - Button: "Create Return Delivery Note"
   - Opens `CreateReturnDeliveryNoteModal`
3. Display list of RDNs:
   - Group by status (Draft, Issued, In Transit, Received)
   - Expandable cards with item details
   - Actions based on status:
     - DRAFT: Edit, Delete, Issue
     - ISSUED: View, Cancel
     - IN_TRANSIT: View
     - RECEIVED: View only
4. Show RDN details similar to how DN details are shown

**New Tab Structure:**
```typescript
┌─────────────────────────────────────────┐
│  Tabs: [Pending] [Received] [Returns]   │
│         [Return Delivery Notes] ← NEW   │
├─────────────────────────────────────────┤
│  [+ Create Return Delivery Note]         │
│                                          │
│  ┌─ RDN-2025-001 (DRAFT) ──────────────┐│
│  │ Project: MSQ02 • Remote            ││
│  │ Return Date: 12 Dec 2025           ││
│  │ 2 material(s)                      ││
│  │ [Edit] [Delete] [Issue]            ││
│  └────────────────────────────────────┘│
│                                          │
│  ┌─ RDN-2025-002 (IN_TRANSIT) ─────────┐│
│  │ Vehicle: KA01AB1234                ││
│  │ Driver: John Doe (9876543210)      ││
│  │ [View Details] [Track]             ││
│  └────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

#### 4.3 Production Manager View (Optional Enhancement)

**File:** `/home/development1/Desktop/MeterSquare/frontend/src/roles/production-manager/pages/ReturnDeliveries.tsx`

**Features:**
- View all incoming RDNs (IN_TRANSIT status)
- Confirm receipt with acceptance workflow
- Per-item acceptance:
  - Accept full quantity
  - Accept partial quantity
  - Reject item (with reason)
- Update inventory based on condition:
  - Good → Add to main stock
  - Damaged → Add to backup stock
  - Defective → Mark for disposal review
- Print RDN with acceptance details

---

## 🔄 Complete Workflow

### Site Engineer Flow:

1. **Navigate to Material Receipts → Return Delivery Notes tab**
2. **Click "Create Return Delivery Note"**
3. **Fill RDN Details:**
   - Select return date
   - Enter vehicle and driver information
   - Add general notes
4. **Select Materials:**
   - Browse materials from received deliveries
   - Check materials to return
   - Specify quantity (max = returnable quantity)
   - Choose condition (Good/Damaged/Defective)
   - Enter return reason
5. **Review & Submit:**
   - Option 1: Save as DRAFT (can edit later)
   - Option 2: Issue immediately (creates material_return records)
6. **After Issuing:**
   - RDN status → ISSUED
   - Material_return records created
   - RDN appears in list
7. **Mark as Dispatched:**
   - When materials physically leave site
   - Status → IN_TRANSIT
   - Timestamp recorded
8. **Store Confirms Receipt:**
   - PM/Store manager confirms
   - Status → RECEIVED or PARTIAL
   - Inventory updated based on condition

### Production Manager Flow:

1. **View Incoming Returns (IN_TRANSIT RDNs)**
2. **Select RDN to confirm**
3. **Review each item:**
   - Verify condition matches SE's declaration
   - Accept quantity (can differ from returned if damaged)
   - Add acceptance notes
4. **Confirm Receipt:**
   - Good condition → Add to main stock
   - Damaged → Add to backup stock (with notes)
   - Defective → Create disposal review task
5. **RDN status → RECEIVED**
6. **Generate acceptance report/PDF**

---

## 🔒 Security & Audit Benefits

1. **Traceability:**
   - Every return links to original DN
   - Complete chain: DN → Delivery → Return → RDN
   - DN number prominently displayed

2. **Accountability:**
   - Site Engineer must create formal RDN
   - Vehicle and driver tracked
   - PM/Store must explicitly accept
   - All actions timestamped and attributed

3. **Inventory Accuracy:**
   - Formal acceptance workflow prevents discrepancies
   - Condition tracking ensures proper stock placement
   - Quantity verification at receipt

4. **Audit Trail:**
   - Full history of material movement
   - Why materials were returned (reason required)
   - Who prepared, dispatched, received
   - Acceptance decisions recorded

---

## 📊 Database Relationships

```
Material Delivery Notes (Outbound)
           ↓
    Delivery Note Items
           ↓
      Received at Site
           ↓
   (Material Used/Excess)
           ↓
    Return Delivery Notes (Inbound) ← Links to original DN
           ↓
  Return Delivery Note Items ← Links to original DN item
           ↓
    Material Returns (Updated with RDN ID)
           ↓
     Store Acceptance
           ↓
  Inventory Transactions (Stock added back)
```

---

## ⚡ Next Steps (Priority Order)

### Phase 1: Backend API (Estimated: 2-3 hours)
1. Create controller functions in `inventory_controller.py`
2. Add routes in `inventory_routes.py`
3. Test endpoints with Postman/curl
4. Add validation and error handling

### Phase 2: Frontend RDN Creation (Estimated: 3-4 hours)
1. Create `CreateReturnDeliveryNoteModal.tsx`
2. Implement multi-step wizard
3. Material selection with search/filter
4. Form validation
5. API integration

### Phase 3: Frontend RDN Listing (Estimated: 2 hours)
1. Add "Return Delivery Notes" tab to MaterialReceipts
2. Implement RDN list view with status filters
3. Add actions (Edit, Delete, Issue, View)
4. Show RDN details in expandable cards

### Phase 4: PM Acceptance (Estimated: 2 hours)
1. Create PM view for incoming RDNs
2. Acceptance workflow UI
3. Per-item acceptance logic
4. Inventory update integration

### Phase 5: Testing & Refinement (Estimated: 2 hours)
1. End-to-end workflow testing
2. Edge case handling
3. Performance optimization
4. UI/UX improvements

---

## 🎯 Key Design Decisions

1. **Separate RDN Entity:**
   - Not just updating material_returns
   - Formal document like outbound DN
   - Allows bulk returns in single RDN

2. **Status Workflow:**
   - Mirrors outbound DN flow
   - Familiar to users
   - Clear state transitions

3. **Original DN Reference:**
   - Links to original delivery
   - Full audit trail
   - Easier verification for store

4. **Acceptance Workflow:**
   - Store can adjust quantities
   - Condition verification
   - Prevents blind acceptance

5. **Draft Mode:**
   - SE can prepare RDN in advance
   - Edit before finalizing
   - Issue when ready to dispatch

---

## 📝 Notes

- RDN numbers use separate sequence (RDN-prefix) to differentiate from outbound DNs (MDN-prefix)
- Return reasons are free-text but could be standardized (future enhancement)
- Vehicle/driver info optional for local/walk-in returns
- Acceptance workflow ensures store verifies condition before stock update
- Material returns can exist without RDN (backward compatible)
- RDN can be created for multiple materials from different original DNs (bulk return)

---

## 🔗 Related Files

**Backend:**
- Models: `/backend/models/inventory.py` (lines 326-441)
- Migration: `/backend/migrations/create_return_delivery_notes_table.py`
- Controller: `/backend/controllers/inventory_controller.py` (functions to be added)
- Routes: `/backend/routes/inventory_routes.py` (routes to be added)

**Frontend:**
- Material Receipts: `/frontend/src/roles/site-engineer/pages/MaterialReceipts.tsx`
- RDN Modal: `/frontend/src/roles/site-engineer/components/CreateReturnDeliveryNoteModal.tsx` (to be created)
- PM View: `/frontend/src/roles/production-manager/pages/ReturnDeliveries.tsx` (to be created)

---

**Status:** Foundation complete. Ready for API and frontend development.
**Last Updated:** 2025-12-11
