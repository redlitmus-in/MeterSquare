
# BOQ Calculation Fields - Database Verification

## ✅ Database Schema Verified

### 1. **boq_items** (MasterItem) Table
Stores master item templates with overhead and profit settings:

```sql
- item_id (INTEGER, PRIMARY KEY)
- item_name (VARCHAR(255), UNIQUE)
- description (TEXT)
- overhead_percentage (FLOAT)          ← NEW FIELD
- overhead_amount (FLOAT)              ← NEW FIELD
- profit_margin_percentage (FLOAT)     ← NEW FIELD
- profit_margin_amount (FLOAT)         ← NEW FIELD
- is_active (BOOLEAN)
- created_at (DATETIME)
- created_by (VARCHAR(255))
- is_deleted (BOOLEAN)
```

### 2. **boq_details** Table
Stores complete BOQ data as JSONB:

```sql
- boq_detail_id (INTEGER, PRIMARY KEY)
- boq_id (INTEGER, FOREIGN KEY)
- boq_details (JSONB)                  ← Stores complete JSON
- total_cost (FLOAT)
- total_items (INTEGER)
- total_materials (INTEGER)
- total_labour (INTEGER)
- file_name (VARCHAR(255))
- created_at (DATETIME)
- created_by (VARCHAR(255))
- last_modified_at (DATETIME)
- last_modified_by (VARCHAR(255))
- is_deleted (BOOLEAN)
```

### 3. **JSON Structure** (boq_details.boq_details)

Each item in the `items` array contains:

```json
{
  "master_item_id": 123,
  "item_name": "Partition Wall",
  "description": "Wooden partition wall",
  "quantity": 10,                          ← Item quantity
  "unit": "nos",                           ← Item unit
  "rate": 500.00,                          ← Item rate
  "work_type": "contract",
  
  "item_total": 5000.00,                   ← qty × rate (BASE FOR CALCULATIONS)
  
  "miscellaneous_percentage": 10.0,        ← Misc % (applied to item_total)
  "miscellaneous_amount": 500.00,          ← 10% of 5000
  
  "overhead_profit_percentage": 15.0,      ← O&P % (applied to item_total)
  "overhead_profit_amount": 750.00,        ← 15% of 5000
  
  "before_discount": 6250.00,              ← item_total + misc + O&P
  
  "discount_percentage": 2.0,              ← Discount % (applied to before_discount)
  "discount_amount": 125.00,               ← 2% of 6250
  "after_discount": 6125.00,               ← before_discount - discount
  
  "vat_percentage": 3.0,                   ← VAT % (applied to after_discount)
  "vat_amount": 183.75,                    ← 3% of 6125
  
  "selling_price": 6308.75,                ← FINAL PRICE (after_discount + vat)
  
  "totalMaterialCost": 3000.00,            ← Reference only
  "totalLabourCost": 300.00,               ← Reference only
  "subItemsTotal": 3300.00,                ← Reference only (not used in pricing)
  
  "materials": [...],
  "labour": [...]
}
```

## 📊 Calculation Flow

```
Step 1: Item Total = Quantity × Rate
        Example: 10 × 500 = 5,000 AED

Step 2: Miscellaneous = Item Total × Misc %
        Example: 5,000 × 10% = 500 AED

Step 3: Overhead & Profit = Item Total × O&P %
        Example: 5,000 × 15% = 750 AED

Step 4: Subtotal = Item Total + Misc + O&P
        Example: 5,000 + 500 + 750 = 6,250 AED

Step 5: Discount = Subtotal × Discount %
        Example: 6,250 × 2% = 125 AED

Step 6: After Discount = Subtotal - Discount
        Example: 6,250 - 125 = 6,125 AED

Step 7: VAT = After Discount × VAT %
        Example: 6,125 × 3% = 183.75 AED

Step 8: Final Selling Price = After Discount + VAT
        Example: 6,125 + 183.75 = 6,308.75 AED
```

## ✅ Verification Checklist

- [x] Database schema supports all new fields
- [x] boq_items table has overhead/profit columns
- [x] boq_details uses JSONB for flexible storage
- [x] Backend controller saves all calculation fields
- [x] Frontend displays calculations correctly
- [x] TD preview shows internal version with all details
- [x] Client version hides internal calculations
- [x] Sub-items (materials/labour) marked as "reference only"

## 🎯 Key Points

1. **Base Calculation**: Miscellaneous and Overhead & Profit are calculated from **item_total** (qty × rate), NOT from sub-items
2. **Sub-items**: Materials and labour costs are stored for reference but don't affect pricing
3. **Flexibility**: JSONB storage allows easy addition of new fields without schema changes
4. **Backward Compatibility**: Old BOQs without new fields will still work with fallback values

## 🔄 Update Applied

All BOQs created after this update will have the correct calculation structure saved in the database.
