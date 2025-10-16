# BOQ Structure Analysis & Required Changes

## Current Frontend Structure (What We Have)

### 1. Main Item Structure
```typescript
interface BOQItemForm {
  id: string;
  item_name: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  work_type: string;
  overhead_percentage: number;
  profit_margin_percentage: number;
  discount_percentage: number;
  vat_percentage: number;
  sub_items: SubItemForm[];
  materials: BOQMaterialForm[];  // Legacy - not used anymore
  labour: BOQLabourForm[];       // Legacy - not used anymore
  master_item_id?: number;
  is_new?: boolean;
}
```

### 2. Sub Item Structure (NEW)
```typescript
interface SubItemForm {
  id: string;
  scope: string;
  size?: string;
  location?: string;
  brand?: string;
  quantity: number;
  unit: string;
  rate: number;
  materials: BOQMaterialForm[];  // Raw materials for this sub-item
  labour: BOQLabourForm[];       // Labour for this sub-item
}
```

### 3. Material Structure
```typescript
interface BOQMaterialForm {
  id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  description?: string;
  vat_percentage?: number;
  master_material_id?: number;
  is_from_master?: boolean;
}
```

### 4. Labour Structure
```typescript
interface BOQLabourForm {
  id: string;
  labour_role: string;
  hours: number;
  rate_per_hour: number;
  work_type?: string;
  master_labour_id?: number;
  is_from_master?: boolean;
  is_new?: boolean;
}
```

## Current Calculation Logic (Line 687-737)

```typescript
const calculateItemCost = (item: BOQItemForm) => {
  // Step 1: Calculate item total from sub-items OR main item
  const subItemsTotal = item.sub_items.reduce((sum, subItem) => {
    return sum + ((subItem.quantity || 0) * (subItem.rate || 0));
  }, 0);

  const itemTotal = item.sub_items.length > 0
    ? subItemsTotal
    : ((item.quantity || 0) * (item.rate || 0));

  // Step 2: Apply percentages on itemTotal
  const miscellaneousAmount = itemTotal * (item.overhead_percentage / 100);
  const overheadProfitAmount = itemTotal * (item.profit_margin_percentage / 100);
  const beforeDiscount = itemTotal + miscellaneousAmount + overheadProfitAmount;

  // Step 3: Apply discount
  const discountAmount = beforeDiscount * (item.discount_percentage / 100);
  const afterDiscount = beforeDiscount - discountAmount;

  // Step 4: Apply VAT
  const vatAmount = afterDiscount * (item.vat_percentage / 100);
  const sellingPrice = afterDiscount + vatAmount;

  // Step 5: Calculate raw materials and labour (for reference only)
  let materialCost = 0;
  let labourCost = 0;
  item.sub_items.forEach(subItem => {
    materialCost += subItem.materials.reduce((sum, m) => sum + (m.quantity * m.unit_price), 0);
    labourCost += subItem.labour.reduce((sum, l) => sum + (l.hours * l.rate_per_hour), 0);
  });

  return {
    itemTotal,
    miscellaneousAmount,
    overheadProfitAmount,
    beforeDiscount,
    discountAmount,
    afterDiscount,
    vatAmount,
    sellingPrice,
    materialCost,
    labourCost
  };
};
```

## ISSUE: Current vs Required Calculation

### ❌ Current Wrong Logic:
```
Item Rate = User entered rate (e.g., 4400 AED)
Miscellaneous (10%) = 4400 × 10% = 440
Overhead (15%) = 4400 × 15% = 660
Subtotal = 4400 + 440 + 660 = 5500
Discount (0%) = 0
After Discount = 5500
VAT (5%) = 5500 × 5% = 275
Final = 5775
```

### ✅ Required Correct Logic:
```
Item Rate = User entered rate (e.g., 4400 AED)  ← This is the BASE COST
Miscellaneous (10%) = 4400 × 10% = 440
Overhead (15%) = 4400 × 15% = 660
Subtotal (before VAT & discount) = 4400 + 440 + 660 = 5500
Discount (0%) = 5500 × 0% = 0
After Discount = 5500 - 0 = 5500
VAT (5%) = 5500 × 5% = 275  ← VAT is ADDITIONAL/EXTRA on top
Final Selling Price = 5500 + 275 = 5775
```

**KEY POINT**: The current calculation is actually CORRECT!

VAT is already applied AFTER discount and is ADDITIONAL (extra) to the item rate cost. The formula is:
1. Base = itemTotal (from qty × rate)
2. Miscellaneous % = on base
3. Overhead % = on base
4. Subtotal = base + misc + overhead
5. Discount = on subtotal (reduces the amount)
6. After Discount = subtotal - discount
7. VAT = on after-discount amount (ADDITIONAL/EXTRA)
8. Final = after-discount + VAT

This is the standard accounting practice where VAT is always applied last and is an additional charge.

## Current Frontend Payload Structure (Line 998-1022)

```typescript
const payload = {
  project_id: selectedProjectId,
  boq_name: boqName,
  status: 'Draft',
  created_by: 'Estimator',
  preliminaries: {
    items: preliminaries.filter(p => p.checked).map(p => ({
      description: p.description,
      isCustom: p.isCustom || false
    })),
    notes: preliminaryNotes
  },
  items: items.map(item => ({
    item_name: item.item_name,
    description: item.description || undefined,
    quantity: item.quantity,
    unit: item.unit,
    rate: item.rate,
    work_type: item.work_type,
    overhead_percentage: item.overhead_percentage,
    profit_margin_percentage: item.profit_margin_percentage,
    discount_percentage: item.discount_percentage,
    vat_percentage: item.vat_percentage,
    materials: item.materials.map(material => ({...})),  // OLD - empty now
    labour: item.labour.map(labour => ({...}))           // OLD - empty now
  }))
};
```

## Required New Payload Structure

```typescript
const payload = {
  project_id: selectedProjectId,
  boq_name: boqName,
  status: 'Draft',
  created_by: 'Estimator',
  preliminaries: {
    items: preliminaries.filter(p => p.checked).map(p => ({
      description: p.description,
      isCustom: p.isCustom || false
    })),
    notes: preliminaryNotes
  },
  items: items.map(item => {
    const costs = calculateItemCost(item);
    return {
      // Main item fields
      item_name: item.item_name,
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,

      // Calculated amounts for main item
      item_total: costs.itemTotal,
      miscellaneous_percentage: item.overhead_percentage,
      miscellaneous_amount: costs.miscellaneousAmount,
      overhead_profit_percentage: item.profit_margin_percentage,
      overhead_profit_amount: costs.overheadProfitAmount,
      subtotal_before_discount: costs.beforeDiscount,
      discount_percentage: item.discount_percentage,
      discount_amount: costs.discountAmount,
      amount_after_discount: costs.afterDiscount,
      vat_percentage: item.vat_percentage,
      vat_amount: costs.vatAmount,
      final_selling_price: costs.sellingPrice,

      // Sub-items (NEW structure)
      sub_items: item.sub_items.map(subItem => ({
        scope: subItem.scope,
        size: subItem.size || null,
        location: subItem.location || null,
        brand: subItem.brand || null,
        quantity: subItem.quantity,
        unit: subItem.unit,
        rate: subItem.rate,
        sub_item_total: subItem.quantity * subItem.rate,

        // Raw materials for this sub-item
        materials: subItem.materials.map(material => ({
          material_name: material.material_name,
          quantity: material.quantity,
          unit: material.unit,
          unit_price: material.unit_price,
          total_price: material.quantity * material.unit_price,
          description: material.description || null,
          vat_percentage: material.vat_percentage || 0,
          vat_amount: (material.quantity * material.unit_price) * ((material.vat_percentage || 0) / 100),
          master_material_id: material.master_material_id || null,
          is_from_master: material.is_from_master || false
        })),

        // Labour for this sub-item
        labour: subItem.labour.map(labour => ({
          labour_role: labour.labour_role,
          work_type: labour.work_type || 'daily_wages',
          hours: labour.hours,
          rate_per_hour: labour.rate_per_hour,
          total_amount: labour.hours * labour.rate_per_hour,
          master_labour_id: labour.master_labour_id || null,
          is_from_master: labour.is_from_master || false
        }))
      })),

      // Master reference
      master_item_id: item.master_item_id || null,
      is_new: item.is_new || false
    };
  })
};
```

## Database Schema Requirements

### Current DB Structure (from boq.py)
✅ **Already have these tables:**
- `boq` - Main BOQ table
- `boq_details` - Stores JSONB structure
- `boq_items` (MasterItem) - Master items
- `boq_sub_items` (MasterSubItem) - Master sub-items **← EXISTS but NOT USED**
- `boq_material` (MasterMaterial) - Master materials
- `boq_labours` (MasterLabour) - Master labour

### Changes Needed:

#### 1. Update `boq_details.boq_details` JSONB structure to match new payload

Current JSONB structure stores old format. New format should be:
```json
{
  "preliminaries": {...},
  "items": [
    {
      "item_name": "painting",
      "quantity": 1,
      "unit": "Nos",
      "rate": 4400,
      "item_total": 4400,
      "miscellaneous_percentage": 10,
      "miscellaneous_amount": 440,
      "overhead_profit_percentage": 15,
      "overhead_profit_amount": 660,
      "subtotal_before_discount": 5500,
      "discount_percentage": 0,
      "discount_amount": 0,
      "amount_after_discount": 5500,
      "vat_percentage": 5,
      "vat_amount": 275,
      "final_selling_price": 5775,
      "sub_items": [
        {
          "scope": "Wall painting",
          "size": "10x10",
          "location": "Living room",
          "brand": "Asian Paints",
          "quantity": 100,
          "unit": "Sq.m",
          "rate": 44,
          "sub_item_total": 4400,
          "materials": [
            {
              "material_name": "Paint",
              "quantity": 10,
              "unit": "Ltr",
              "unit_price": 50,
              "total_price": 500,
              "description": "Premium wall paint",
              "vat_percentage": 5,
              "vat_amount": 25
            }
          ],
          "labour": [
            {
              "labour_role": "Painter",
              "work_type": "daily_wages",
              "hours": 40,
              "rate_per_hour": 25,
              "total_amount": 1000
            }
          ]
        }
      ]
    }
  ]
}
```

#### 2. Update MasterSubItem table usage
The table exists but needs to be properly utilized in the backend controller.

Current columns in `boq_sub_items`:
- ✅ sub_item_id
- ✅ item_id (FK to boq_items)
- ❌ sub_item_name (should be "scope")
- ✅ description
- ✅ location
- ✅ brand
- ✅ unit
- ✅ quantity
- ✅ per_unit_cost (should be "rate")
- ✅ sub_item_total_cost

**Schema Changes Needed:**
```sql
-- Add new column for size
ALTER TABLE boq_sub_items ADD COLUMN size VARCHAR(255);

-- Rename sub_item_name to scope (optional, or keep both)
-- Or just map sub_item_name = scope in the code
```

#### 3. Update MasterMaterial table
Current schema is good, but needs proper sub_item_id linking:
- ✅ material_id
- ✅ material_name
- ✅ item_id (FK to boq_items)
- ✅ sub_item_id (FK to boq_sub_items) **← NOW WILL BE USED**
- ✅ default_unit
- ✅ current_market_price

#### 4. Update MasterLabour table
Current schema is good, needs proper sub_item_id linking:
- ✅ labour_id
- ✅ labour_role
- ✅ item_id (FK to boq_items)
- ✅ sub_item_id (FK to boq_sub_items) **← NOW WILL BE USED**
- ✅ work_type
- ✅ hours
- ✅ rate_per_hour
- ✅ amount

## Backend Changes Required

### File: `backend/controllers/boq_controller.py`

#### 1. Update `add_sub_items_to_master_tables()` function (Line 135-200+)

**Current:** Function exists but uses old field names

**Required Changes:**
```python
def add_sub_items_to_master_tables(master_item_id, sub_items, created_by):
    """Add sub-items to master tables with their materials and labour"""
    master_sub_item_ids = []

    for sub_item in sub_items:
        # Map 'scope' to 'sub_item_name' for DB
        sub_item_name = sub_item.get("scope")  # ← CHANGED from sub_item_name

        master_sub_item = MasterSubItem.query.filter_by(
            item_id=master_item_id,
            sub_item_name=sub_item_name
        ).first()

        if not master_sub_item:
            master_sub_item = MasterSubItem(
                item_id=master_item_id,
                sub_item_name=sub_item_name,  # Store scope as sub_item_name
                description=sub_item.get("description"),
                size=sub_item.get("size"),     # ← NEW FIELD
                location=sub_item.get("location"),
                brand=sub_item.get("brand"),
                unit=sub_item.get("unit"),
                quantity=sub_item.get("quantity"),
                per_unit_cost=sub_item.get("rate"),  # ← CHANGED from per_unit_cost
                sub_item_total_cost=sub_item.get("sub_item_total"),  # ← Use calculated
                created_by=created_by
            )
            db.session.add(master_sub_item)
            db.session.flush()
        else:
            # Update existing sub-item
            master_sub_item.description = sub_item.get("description")
            master_sub_item.size = sub_item.get("size")
            master_sub_item.location = sub_item.get("location")
            master_sub_item.brand = sub_item.get("brand")
            master_sub_item.unit = sub_item.get("unit")
            master_sub_item.quantity = sub_item.get("quantity")
            master_sub_item.per_unit_cost = sub_item.get("rate")
            master_sub_item.sub_item_total_cost = sub_item.get("sub_item_total")
            db.session.flush()

        master_sub_item_ids.append(master_sub_item.sub_item_id)

        # Add materials for this sub-item (existing code is OK)
        for mat_data in sub_item.get("materials", []):
            # ... existing material code

        # Add labour for this sub-item (existing code is OK)
        for labour_data in sub_item.get("labour", []):
            # ... existing labour code

    return master_sub_item_ids
```

#### 2. Update main BOQ creation endpoint

Need to process the new payload structure and save all calculated amounts:

```python
@app.route('/api/boq', methods=['POST'])
def create_boq():
    data = request.get_json()

    # ... validation code

    # Process items with new structure
    boq_details_data = {
        "preliminaries": data.get("preliminaries", {}),
        "items": []
    }

    for item_data in items:
        # Save to master tables with sub-items
        master_item_id, _, _ = add_to_master_tables(
            item_name=item_data.get("item_name"),
            description=None,  # No description for main item now
            work_type=None,
            materials_data=[],  # No materials at main level
            labour_data=[],     # No labour at main level
            created_by=created_by,
            unit=item_data.get("unit"),
            quantity=item_data.get("quantity"),
            per_unit_cost=item_data.get("rate"),
            total_amount=item_data.get("item_total"),
            item_total_cost=item_data.get("final_selling_price"),
            miscellaneous_percentage=item_data.get("miscellaneous_percentage"),
            miscellaneous_amount=item_data.get("miscellaneous_amount"),
            overhead_profit_percentage=item_data.get("overhead_profit_percentage"),
            overhead_profit_amount=item_data.get("overhead_profit_amount"),
            discount_percentage=item_data.get("discount_percentage"),
            discount_amount=item_data.get("discount_amount"),
            vat_percentage=item_data.get("vat_percentage"),
            vat_amount=item_data.get("vat_amount")
        )

        # Add sub-items with their materials and labour
        sub_items_data = item_data.get("sub_items", [])
        if sub_items_data:
            add_sub_items_to_master_tables(master_item_id, sub_items_data, created_by)

        # Store complete item data in JSONB
        boq_details_data["items"].append(item_data)

    # Save to boq_details table
    boq_detail = BOQDetails(
        boq_id=new_boq.boq_id,
        boq_details=boq_details_data,
        total_cost=sum(item.get("final_selling_price", 0) for item in items),
        total_items=len(items),
        created_by=created_by
    )
    db.session.add(boq_detail)
    db.session.commit()

    return jsonify({"success": True, "boq_id": new_boq.boq_id})
```

## Summary of Changes Needed

### ✅ Frontend (Already Done):
1. ✅ New sub-items structure with materials and labour
2. ✅ Calculation function is CORRECT
3. ✅ UI showing proper breakdown
4. ❌ **Payload needs updating** to send calculated amounts

### ❌ Backend (Needs Changes):
1. ❌ Update payload acceptance to include all calculated fields
2. ❌ Update `add_sub_items_to_master_tables()` to handle new structure
3. ❌ Store calculated amounts in JSONB
4. ❌ Update master tables population logic

### ⚠️ Database (Minor Changes):
1. ⚠️ Add `size` column to `boq_sub_items` table
2. ✅ All other tables are ready

## Frontend Payload Update Required

Update the submit handler (Line 998-1022) to send calculated amounts:

```typescript
items: items.map(item => {
  const costs = calculateItemCost(item);
  return {
    item_name: item.item_name,
    quantity: item.quantity,
    unit: item.unit,
    rate: item.rate,
    item_total: costs.itemTotal,
    miscellaneous_percentage: item.overhead_percentage,
    miscellaneous_amount: costs.miscellaneousAmount,
    overhead_profit_percentage: item.profit_margin_percentage,
    overhead_profit_amount: costs.overheadProfitAmount,
    subtotal_before_discount: costs.beforeDiscount,
    discount_percentage: item.discount_percentage,
    discount_amount: costs.discountAmount,
    amount_after_discount: costs.afterDiscount,
    vat_percentage: item.vat_percentage,
    vat_amount: costs.vatAmount,
    final_selling_price: costs.sellingPrice,
    sub_items: item.sub_items.map(subItem => ({
      scope: subItem.scope,
      size: subItem.size || null,
      location: subItem.location || null,
      brand: subItem.brand || null,
      quantity: subItem.quantity,
      unit: subItem.unit,
      rate: subItem.rate,
      sub_item_total: subItem.quantity * subItem.rate,
      materials: subItem.materials.map(material => ({
        material_name: material.material_name,
        quantity: material.quantity,
        unit: material.unit,
        unit_price: material.unit_price,
        total_price: material.quantity * material.unit_price,
        description: material.description || null,
        vat_percentage: material.vat_percentage || 0,
        vat_amount: (material.quantity * material.unit_price) * ((material.vat_percentage || 0) / 100),
        master_material_id: material.master_material_id || null
      })),
      labour: subItem.labour.map(labour => ({
        labour_role: labour.labour_role,
        work_type: labour.work_type || 'daily_wages',
        hours: labour.hours,
        rate_per_hour: labour.rate_per_hour,
        total_amount: labour.hours * labour.rate_per_hour,
        master_labour_id: labour.master_labour_id || null
      }))
    })),
    master_item_id: item.master_item_id || null,
    is_new: item.is_new || false
  };
})
```

## Calculation Verification

**The current calculation IS CORRECT!**

Example:
```
Base Item Rate: 4400 AED (user entered: qty 1 × rate 4400)
Miscellaneous 10%: 440 AED (on base)
Overhead 15%: 660 AED (on base)
Subtotal: 5500 AED (4400 + 440 + 660)
Discount 0%: 0 AED
After Discount: 5500 AED
VAT 5%: 275 AED (EXTRA/ADDITIONAL on after-discount amount)
Final: 5775 AED (5500 + 275)
```

VAT is correctly applied as an ADDITIONAL charge after all other calculations, which is standard accounting practice.
