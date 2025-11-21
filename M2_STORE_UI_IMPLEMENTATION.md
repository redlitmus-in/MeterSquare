# M2 Store UI Implementation - Complete Documentation

## Overview

The M2 Store (MeterSquare Internal Inventory) UI has been fully implemented with **mock data only** (no backend/database yet). This document provides a complete guide to the implemented components and how to integrate them with the backend later.

## What is M2 Store?

M2 Store is MeterSquare's internal inventory system that acts as the **FIRST PRIORITY** source for materials before going to external vendors. It implements automatic priority-based procurement:

- **100% Available in M2** → Use M2 Store ONLY (no vendor needed)
- **Partial Availability** → Auto-allocate M2 portion + vendor for remainder
- **0% Available** → Traditional vendor selection

## Directory Structure

```
frontend/src/roles/
├── production-manager/
│   ├── pages/
│   │   └── M2StoreDashboard.tsx          # Main dashboard
│   ├── components/
│   │   ├── M2StockOverview.tsx           # Detailed inventory list
│   │   ├── M2ReceiveStockForm.tsx        # Receive stock form
│   │   ├── M2DispatchForm.tsx            # Dispatch materials form
│   │   └── M2StockAlerts.tsx             # Low stock alerts
│   └── data/
│       └── m2StoreMockData.ts            # Centralized mock data
└── buyer/
    └── components/
        ├── M2AvailabilityCard.tsx         # M2 availability check
        └── M2StorePurchaseFlow.tsx        # Integration wrapper
```

---

## 🎯 Production Manager Components

### 1. M2StoreDashboard.tsx

**Location:** `frontend/src/roles/production-manager/pages/M2StoreDashboard.tsx`

**Purpose:** Main dashboard for Production Manager to manage M2 Store

**Features:**
- 4 stat cards (Total Items, Low Stock, Pending Dispatches, Total Value)
- Quick action buttons (Receive Stock, Dispatch, Adjust Stock)
- Pending dispatches list
- Low stock alerts
- Recent activity timeline

**Usage:**
```tsx
import M2StoreDashboard from '@/roles/production-manager/pages/M2StoreDashboard';

// In your routing
<Route path="/production-manager/m2-store" element={<M2StoreDashboard />} />
```

**Mock Data:**
- Total Items: 1234
- Low Stock: 23 items
- Pending Dispatches: 5
- Total Value: ₹45.2L

---

### 2. M2StockOverview.tsx

**Location:** `frontend/src/roles/production-manager/components/M2StockOverview.tsx`

**Purpose:** Detailed inventory view with search and filters

**Features:**
- Search by material name, brand, or bin location
- Filter by status (healthy, warning, critical)
- Stock level visualization with progress bars
- Material details (current stock, reorder point, max stock, bin location)
- Per-material actions (Adjust Stock)

**Usage:**
```tsx
import M2StockOverview from '@/roles/production-manager/components/M2StockOverview';

<M2StockOverview />
```

**Mock Data:** 10 materials with varying stock levels

---

### 3. M2ReceiveStockForm.tsx

**Location:** `frontend/src/roles/production-manager/components/M2ReceiveStockForm.tsx`

**Purpose:** Form to receive new stock into M2 Store

**Features:**
- Two receive types: From Vendor or Transfer/Return
- Vendor selection (if from vendor)
- PO/Invoice number entry
- Multi-material input with search
- Bin location assignment
- Unit price and total calculation

**Props:**
```typescript
interface M2ReceiveStockFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: any) => void;
}
```

**Usage:**
```tsx
import M2ReceiveStockForm from '@/roles/production-manager/components/M2ReceiveStockForm';

const [showReceiveForm, setShowReceiveForm] = useState(false);

<M2ReceiveStockForm
  isOpen={showReceiveForm}
  onClose={() => setShowReceiveForm(false)}
  onSubmit={(data) => {
    console.log('Receive Stock Data:', data);
    // TODO: API call to backend
  }}
/>
```

---

### 4. M2DispatchForm.tsx

**Location:** `frontend/src/roles/production-manager/components/M2DispatchForm.tsx`

**Purpose:** Form to dispatch materials from M2 Store to buyers/projects

**Features:**
- Buyer, project, and recipient selection
- Material selection with M2 availability check
- Visual stock validation (red if exceeds available)
- Priority setting (normal/urgent)
- Transport details (vehicle, driver)
- Auto-validates dispatch quantity against available stock

**Props:**
```typescript
interface M2DispatchFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: any) => void;
  prefilledData?: {
    buyerName?: string;
    projectName?: string;
    changeRequestId?: string;
    materials?: Array<{...}>;
  };
}
```

**Usage:**
```tsx
import M2DispatchForm from '@/roles/production-manager/components/M2DispatchForm';

<M2DispatchForm
  isOpen={showDispatchForm}
  onClose={() => setShowDispatchForm(false)}
  prefilledData={{
    changeRequestId: 'CR-2025-001',
    materials: [/* pre-filled from buyer request */]
  }}
  onSubmit={(data) => {
    console.log('Dispatch Data:', data);
    // TODO: API call to backend
  }}
/>
```

---

### 5. M2StockAlerts.tsx

**Location:** `frontend/src/roles/production-manager/components/M2StockAlerts.tsx`

**Purpose:** Display low stock alerts with actionable insights

**Features:**
- Filter by severity (all, critical, warning)
- Stock level visualization with reorder point markers
- Days to stockout calculation
- Suggested order quantity
- Quick "Create PO" action
- Consumption analytics

**Usage:**
```tsx
import M2StockAlerts from '@/roles/production-manager/components/M2StockAlerts';

<M2StockAlerts />
```

**Mock Data:** 6 low stock alerts (3 critical, 3 warning)

---

## 🛒 Buyer Components

### 6. M2AvailabilityCard.tsx

**Location:** `frontend/src/roles/buyer/components/M2AvailabilityCard.tsx`

**Purpose:** **CRITICAL COMPONENT** - Shows M2 Store availability to buyer with priority logic

**Features:**
- Automatic status detection (full/partial/none)
- Per-material availability breakdown
- Visual M2 Store vs Vendor split
- Source-specific action buttons
- Helper function `calculateM2Availability()`

**Props:**
```typescript
interface M2AvailabilityCardProps {
  materials: MaterialAvailability[];
  onConfirmM2Only?: () => void;
  onProceedWithSplit?: () => void;
  onProceedVendorOnly?: () => void;
}
```

**Usage:**
```tsx
import M2AvailabilityCard, { calculateM2Availability } from '@/roles/buyer/components/M2AvailabilityCard';

const materials = changeRequest.materials.map(m => {
  const availability = calculateM2Availability(m.requestedQty, m2Stock[m.id]);
  return { ...m, ...availability };
});

<M2AvailabilityCard
  materials={materials}
  onConfirmM2Only={() => {
    // M2 Store has 100% - no vendor needed
    // Auto-confirm allocation
  }}
  onProceedWithSplit={(m2Allocation, vendorNeeded) => {
    // M2 Store has partial - split procurement
    // M2 allocation auto-confirmed, show vendor selection for remainder
  }}
  onProceedVendorOnly={() => {
    // M2 Store has 0% - traditional vendor selection
  }}
/>
```

---

### 7. M2StorePurchaseFlow.tsx

**Location:** `frontend/src/roles/buyer/components/M2StorePurchaseFlow.tsx`

**Purpose:** **INTEGRATION WRAPPER** - Orchestrates M2 Store check before vendor selection

**Features:**
- Automatic M2 availability check
- Loading state during availability check
- Integrates M2AvailabilityCard
- Handles all three procurement scenarios
- Includes integration guide in comments

**Props:**
```typescript
interface M2StorePurchaseFlowProps {
  changeRequestId: string;
  materials: Material[];
  onM2OnlyConfirmed?: (allocation: any) => void;
  onSplitProcurement?: (m2Allocation: any, vendorNeeded: any) => void;
  onVendorOnlyProceed?: (materials: any) => void;
  onCancel?: () => void;
}
```

**Usage:**
```tsx
import M2StorePurchaseFlow from '@/roles/buyer/components/M2StorePurchaseFlow';

// Use this INSTEAD of VendorSelectionModal
<M2StorePurchaseFlow
  changeRequestId="CR-2025-001"
  materials={changeRequest.materials}
  onM2OnlyConfirmed={(allocation) => {
    // Skip vendor selection entirely
    // Allocate from M2 Store
    // Notify Production Manager for dispatch
  }}
  onSplitProcurement={(m2Allocation, vendorNeeded) => {
    // M2 allocation auto-confirmed
    // Show VendorSelectionModal ONLY for vendorNeeded materials
  }}
  onVendorOnlyProceed={(materials) => {
    // Show traditional VendorSelectionModal
  }}
/>
```

---

## 📊 Mock Data

### m2StoreMockData.ts

**Location:** `frontend/src/roles/production-manager/data/m2StoreMockData.ts`

**Purpose:** Centralized mock data for all M2 Store components

**Exports:**
- `mockM2Materials` - 10 materials with varying stock levels
- `mockM2PendingDispatches` - 3 pending dispatch requests
- `mockM2RecentActivity` - 5 recent transactions
- `mockM2LowStockAlerts` - 6 low stock alerts
- `mockM2Vendors` - 4 vendors
- `mockM2BinLocations` - 12 bin locations
- `mockM2DashboardStats` - Calculated dashboard statistics

**Helper Functions:**
```typescript
getMaterialById(id: number): M2Material | undefined
getM2Availability(materialId: number, requestedQty: number)
needsReorder(materialId: number): boolean
getCriticalStockItems(): M2Material[]
getWarningStockItems(): M2Material[]
getHealthyStockItems(): M2Material[]
```

**Usage:**
```typescript
import m2StoreData from '@/roles/production-manager/data/m2StoreMockData';

// Get specific material
const cement = m2StoreData.helpers.getMaterialById(1);

// Check availability
const availability = m2StoreData.helpers.getM2Availability(1, 100);
// Returns: { available: 100, percentage: 100, binLocation: 'Rack A-12', material: {...} }

// Get critical items
const criticalItems = m2StoreData.helpers.getCriticalStockItems();
```

---

## 🔗 Integration with Backend (TODO)

### API Endpoints Needed

#### Production Manager APIs

```typescript
// Check M2 Store availability for materials
GET /api/m2-store/check-availability
Query: materialIds=[1,2,3]
Response: { materials: [{ materialId, availableQty, binLocation }] }

// Get M2 Store inventory
GET /api/m2-store/inventory
Response: { materials: M2Material[] }

// Receive stock into M2 Store
POST /api/m2-store/receive
Body: {
  receiveType: 'vendor' | 'transfer',
  vendorId?: number,
  poNumber?: string,
  invoiceNumber?: string,
  receivedDate: string,
  materials: [{ materialId, quantity, binLocation, unitPrice }]
}

// Dispatch materials from M2 Store
POST /api/m2-store/dispatch
Body: {
  buyerId: number,
  projectId: number,
  recipientId: number,
  changeRequestId?: string,
  dispatchDate: string,
  priority: 'normal' | 'urgent',
  materials: [{ materialId, quantity, binLocation }]
}

// Get pending dispatch requests
GET /api/m2-store/dispatch-requests
Response: { dispatches: M2DispatchRequest[] }

// Get low stock alerts
GET /api/m2-store/alerts
Response: { alerts: M2StockAlert[] }

// Adjust stock (physical count reconciliation)
POST /api/m2-store/adjust
Body: { materialId, adjustmentQty, reason, notes }
```

#### Buyer APIs

```typescript
// Check M2 availability during change request processing
POST /api/buyer/change-request/{id}/check-m2-availability
Body: { materials: [{ materialId, requestedQty }] }
Response: {
  materials: [{
    materialId,
    requestedQty,
    m2AvailableQty,
    vendorNeededQty,
    availabilityPercentage,
    binLocation
  }]
}

// Confirm M2 allocation
POST /api/buyer/change-request/{id}/confirm-m2-allocation
Body: { materials: [{ materialId, quantity }] }
Response: { success: true, dispatchRequestId: string }

// Create split procurement (M2 + Vendor)
POST /api/buyer/change-request/{id}/split-procurement
Body: {
  m2Allocation: { materials: [...] },
  vendorProcurement: { materials: [...] }
}
Response: { success: true, m2DispatchRequestId, vendorPurchaseId }
```

### Database Schema Needed

```sql
-- M2 Store Inventory
CREATE TABLE m2_store_inventory (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES materials(id),
  current_stock NUMERIC(10,2),
  unit VARCHAR(50),
  reorder_point NUMERIC(10,2),
  max_stock NUMERIC(10,2),
  bin_location VARCHAR(100),
  last_restocked TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- M2 Store Transactions
CREATE TABLE m2_store_transactions (
  id SERIAL PRIMARY KEY,
  transaction_type VARCHAR(20), -- 'IN', 'OUT', 'TRANSFER', 'ADJUSTMENT'
  material_id INTEGER REFERENCES materials(id),
  quantity NUMERIC(10,2),
  unit VARCHAR(50),
  from_location VARCHAR(100),
  to_location VARCHAR(100),
  reference_type VARCHAR(50), -- 'PO', 'DISPATCH', 'TRANSFER', 'ADJUSTMENT'
  reference_id VARCHAR(100),
  unit_price NUMERIC(10,2),
  total_value NUMERIC(10,2),
  performed_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- M2 Dispatch Requests
CREATE TABLE m2_dispatch_requests (
  id SERIAL PRIMARY KEY,
  request_number VARCHAR(50) UNIQUE, -- M2-OUT-2025-0001
  buyer_id INTEGER REFERENCES users(id),
  project_id INTEGER REFERENCES projects(id),
  recipient_id INTEGER REFERENCES users(id),
  change_request_id INTEGER REFERENCES change_requests(id),
  priority VARCHAR(20), -- 'normal', 'urgent'
  required_by DATE,
  dispatch_date DATE,
  vehicle_number VARCHAR(50),
  driver_name VARCHAR(100),
  status VARCHAR(20), -- 'pending', 'dispatched', 'completed'
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- M2 Dispatch Request Items
CREATE TABLE m2_dispatch_request_items (
  id SERIAL PRIMARY KEY,
  dispatch_request_id INTEGER REFERENCES m2_dispatch_requests(id),
  material_id INTEGER REFERENCES materials(id),
  quantity NUMERIC(10,2),
  unit VARCHAR(50),
  bin_location VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🎨 UI Flow Diagrams

### Production Manager Flow

```
M2StoreDashboard
├─ View Stats & Overview
├─ Receive Stock → M2ReceiveStockForm
│   ├─ From Vendor (with PO)
│   └─ Transfer/Return
├─ Dispatch Materials → M2DispatchForm
│   ├─ Select Buyer & Project
│   ├─ Check M2 Availability
│   └─ Dispatch
├─ View Stock → M2StockOverview
│   ├─ Search & Filter
│   └─ Adjust Stock
└─ View Alerts → M2StockAlerts
    └─ Create PO for low stock
```

### Buyer Flow (with M2 Integration)

```
Change Request Assigned to Buyer
↓
M2StorePurchaseFlow (replaces VendorSelectionModal)
↓
Check M2 Store Availability
↓
┌─────────────────┬─────────────────┬─────────────────┐
│ 100% in M2      │ Partial in M2   │ 0% in M2        │
├─────────────────┼─────────────────┼─────────────────┤
│ Confirm M2 Only │ Split:          │ Vendor Only     │
│ ↓               │ - M2 Auto       │ ↓               │
│ Skip Vendor     │ - Vendor for    │ Show Vendor     │
│ Selection       │   Remaining     │ Selection Modal │
│ ↓               │ ↓               │ ↓               │
│ Production Mgr  │ Production Mgr  │ Traditional     │
│ Dispatches      │ + Vendor PO     │ Vendor Flow     │
└─────────────────┴─────────────────┴─────────────────┘
```

---

## 🚀 Next Steps (Backend Implementation)

1. **Database Setup**
   - Create tables: `m2_store_inventory`, `m2_store_transactions`, `m2_dispatch_requests`
   - Migrate existing materials to M2 inventory
   - Set initial reorder points and max stock levels

2. **Backend APIs**
   - Implement all endpoints listed above
   - Add M2 availability check logic
   - Create transaction recording system

3. **Integration Points**
   - Replace mock data imports with API calls
   - Update `M2StorePurchaseFlow` to call real availability API
   - Connect dispatch forms to backend

4. **Testing**
   - Test M2 priority logic (100%, partial, 0%)
   - Test stock deduction on dispatch
   - Test stock addition on receive
   - Test low stock alerts and reorder points

5. **Production Manager Permissions**
   - Add M2 Store menu item to Production Manager role
   - Set up proper access controls

---

## 📝 Current Status

✅ **COMPLETED:**
- All UI components created with mock data
- M2 Store priority logic implemented
- Buyer integration components ready
- Comprehensive mock data system
- Component documentation

⏳ **PENDING (as requested by user):**
- Database schema creation
- Backend API implementation
- Real data integration
- Testing with live data

---

## 💡 Key Features Summary

### For Production Manager:
- Complete M2 Store dashboard
- Stock receive and dispatch workflows
- Low stock alerts with PO creation
- Real-time inventory tracking
- Transaction history

### For Buyer:
- **Automatic M2 priority check** - Always checks M2 first
- Visual availability breakdown (M2 vs Vendor)
- Smart allocation (100%, partial, 0% scenarios)
- Seamless integration with existing change request flow
- Cost optimization through internal inventory usage

---

## 📚 Additional Documentation

Refer to these files for more details:
- `M2_STORE_BUYER_FLOW.md` - Detailed buyer workflow specification
- `m2StoreMockData.ts` - Mock data structure and helper functions
- Individual component files - JSDoc comments and prop types

---

## 🎯 Priority Logic Summary

**Remember: M2 Store is FIRST PRIORITY, not an option!**

```
IF M2 has 100% of requested materials:
  ✅ Use M2 Store ONLY
  ✅ No vendor selection needed
  ✅ Buyer just confirms
  ✅ Production Manager dispatches

ELSE IF M2 has partial materials:
  ⚠️  Auto-allocate M2 portion
  ⚠️  Buyer selects vendor for remainder ONLY
  ⚠️  Split procurement workflow

ELSE IF M2 has 0% materials:
  ❌ Traditional vendor selection
  ❌ No M2 involvement
  ❌ Regular purchase flow
```

---

## ⚠️ Production Manager M2 Store Features Status

**Updated:** 2025-11-21

### Currently Active:
- ✅ **Materials Master** - Active and available for use

### Temporarily Disabled for Production:
The following features are commented out and will be enabled in future releases:
- ⏸️ **Receive Stock (GRN)** - Temporarily disabled
- ⏸️ **Dispatch Materials** - Temporarily disabled
- ⏸️ **Stock Take** - Temporarily disabled
- ⏸️ **Reports & Analytics** - Temporarily disabled

**Note:** These features are fully implemented in the codebase but have been temporarily disabled in the navigation menu (`ModernSidebar.tsx`) for production deployment. They can be re-enabled by uncommenting the respective navigation items when ready for production use.

---

**Generated:** 2025-11-15
**Last Updated:** 2025-11-21
**Status:** UI Only - Backend Pending
**Mock Data:** Yes
**Production Ready:** Partial (Materials Master only)
