# Per-Material Supplier Notes Implementation Plan

## Summary
Add per-material notes functionality so buyers can add specifications, cutting details, and special requirements for each individual material. Notes will appear in the LPO PDF directly under each material row.

## Current State Analysis

### ✅ What Exists
1. **Backend API**: `save_supplier_notes()` function in buyer_controller.py (line 8549)
   - Stores notes in `cr.material_vendor_selections[material_name]['supplier_notes']`
   - Route: `POST /buyer/purchase/<cr_id>/save-supplier-notes`
   - Validation: 5000 char limit, control character filtering

2. **Frontend Service**: `saveSupplierNotes()` in buyerService.ts (line 1353)
   - Never called from UI (DEAD CODE until now)

3. **Purchase-level notes**: `purchaseSummaryNote` (general notes for entire PO)
   - Already working, appears at bottom of LPO PDF

### ❌ What's Missing
1. **UI for per-material notes** - No input field for individual materials
2. **LPO PDF integration** - Notes not displayed under material rows
3. **Data flow to LPO** - Material notes not passed to LPO generator

## Implementation Steps

### Step 1: Add UI State for Per-Material Notes
**File**: MaterialVendorSelectionModal.tsx

Add state:
```typescript
const [materialNotes, setMaterialNotes] = useState<Record<string, string>>({});
const [editingMaterialNote, setEditingMaterialNote] = useState<string | null>(null);
const [savingMaterialNote, setSavingMaterialNote] = useState<string | null>(null);
```

Initialize from `purchase.material_vendor_selections`:
```typescript
useEffect(() => {
  if (!isOpen || !purchase) return;

  const notes: Record<string, string> = {};
  if (purchase.material_vendor_selections) {
    Object.entries(purchase.material_vendor_selections).forEach(([materialName, selection]) => {
      if (selection.supplier_notes) {
        notes[materialName] = selection.supplier_notes;
      }
    });
  }
  setMaterialNotes(notes);
}, [isOpen, purchase?.cr_id]);
```

### Step 2: Add Notes UI Component
**Location**: Inside material card, below vendor selection, above expand/collapse section

```typescript
{/* Per-Material Notes Section */}
<div className="px-4 py-3 bg-blue-50 border-t border-blue-200">
  <div className="flex items-start gap-2">
    <FileText className="w-4 h-4 text-blue-600 mt-1 flex-shrink-0" />
    <div className="flex-1">
      <label className="text-xs font-medium text-blue-900 block mb-1">
        Notes for Supplier (cutting details, specifications, etc.)
      </label>

      {editingMaterialNote === material.material_name ? (
        <div className="space-y-2">
          <textarea
            value={materialNotes[material.material_name] || ''}
            onChange={(e) => setMaterialNotes({
              ...materialNotes,
              [material.material_name]: e.target.value
            })}
            placeholder="e.g., Cut to 90cm x 210cm, RAL 9010 finish, include vision panel..."
            className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-400"
            rows={3}
            maxLength={5000}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleSaveMaterialNote(material.material_name)}
              disabled={savingMaterialNote === material.material_name}
            >
              {savingMaterialNote === material.material_name ? (
                <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Saving...</>
              ) : (
                <><Save className="w-3 h-3 mr-1" /> Save</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditingMaterialNote(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setEditingMaterialNote(material.material_name)}
          className="cursor-pointer text-sm text-gray-700 hover:bg-blue-100 p-2 rounded-md border border-dashed border-blue-300 min-h-[40px]"
        >
          {materialNotes[material.material_name] ? (
            <div className="whitespace-pre-wrap">{materialNotes[material.material_name]}</div>
          ) : (
            <span className="text-gray-400 italic">Click to add notes...</span>
          )}
        </div>
      )}
    </div>
  </div>
</div>
```

### Step 3: Add Save Handler
```typescript
const handleSaveMaterialNote = async (materialName: string) => {
  try {
    setSavingMaterialNote(materialName);

    const noteText = materialNotes[materialName] || '';
    const selectedVendor = materialVendors.find(m => m.material_name === materialName)?.selected_vendors[0];

    await buyerService.saveSupplierNotes(
      purchase.cr_id,
      materialName,
      noteText,
      selectedVendor?.vendor_id
    );

    toast.success('Material notes saved');
    setEditingMaterialNote(null);

    if (onNotesUpdated) {
      onNotesUpdated(); // Refresh parent data
    }
  } catch (error: any) {
    toast.error(error.message || 'Failed to save notes');
  } finally {
    setSavingMaterialNote(null);
  }
};
```

### Step 4: Include Notes in Vendor Selection Submission
When sending to TD, include material notes in the submission:

```typescript
// In handleSendVendorToTD and handleSendAllToTD functions
materials: materials.map(m => ({
  material_name: m.material_name,
  // ... other fields
  supplier_notes: materialNotes[m.material_name] || null  // Include per-material notes
}))
```

### Step 5: Update LPO Preview Data Structure
**File**: buyer_controller.py, function `get_lpo_preview_for_purchase()`

When building materials list for LPO:

```python
# Around line 9000
materials_list = []
for mat in materials:
    material_name = mat.get('material_name', '')

    # Get supplier notes for this material from material_vendor_selections
    material_notes = None
    if cr.material_vendor_selections and material_name in cr.material_vendor_selections:
        material_notes = cr.material_vendor_selections[material_name].get('supplier_notes')

    materials_list.append({
        'sl_no': idx + 1,
        'material_name': material_name,
        'brand': mat.get('brand', '-'),
        'specification': mat.get('specification', '-'),
        'qty': mat.get('quantity', 0),
        'unit': mat.get('unit', ''),
        'rate': unit_price,
        'amount': amount,
        'supplier_notes': material_notes  # Include per-material notes
    })
```

### Step 6: Update LPO PDF Generator
**File**: lpo_pdf_generator.py

Modify the table generation to add notes rows:

```python
# Around line 433-447
for i, item in enumerate(items, 1):
    material_name = item.get('material_name', '') or item.get('description', '')
    brand = item.get('brand', '') or '-'
    specification = item.get('specification', '') or '-'
    supplier_notes = item.get('supplier_notes', '').strip()  # Get per-material notes

    # Add main material row
    table_data.append([
        str(item.get('sl_no', i)),
        Paragraph(str(material_name), self.styles['LPOSmall']),
        Paragraph(str(brand), self.styles['LPOSmall']),
        Paragraph(str(specification), self.styles['LPOSmall']),
        str(item.get('qty', '')),
        str(item.get('unit', '')),
        f"{item.get('rate', 0):,.2f}",
        f"{item.get('amount', 0):,.2f}"
    ])

    # Add notes sub-row if notes exist
    if supplier_notes:
        safe_notes = supplier_notes.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        table_data.append([
            '',  # Empty SI#
            Paragraph(
                f'<i>📝 <b>Note:</b> {safe_notes}</i>',
                self.styles['LPOSmallItalic']
            ),
            '', '', '', '', '', ''  # Empty other columns
        ])
```

Add italic style if not exists:
```python
# In __init__ method
self.styles['LPOSmallItalic'] = ParagraphStyle(
    'LPOSmallItalic',
    parent=self.styles['Normal'],
    fontSize=8,
    leading=10,
    fontName='Helvetica-Oblique',
    textColor=colors.HexColor('#4B5563')  # Gray-600
)
```

### Step 7: Testing Checklist
- [ ] Add note to material 1, save, verify in DB
- [ ] Add note to material 2, save, verify in DB
- [ ] Send vendor selection to TD, verify notes included
- [ ] Generate LPO PDF, verify notes appear under materials
- [ ] Edit note, save, verify update works
- [ ] Delete note (empty string), verify removal works
- [ ] Test with special characters (newlines, quotes)
- [ ] Test with 5000+ characters (should fail validation)
- [ ] Test purchasing-level notes still work alongside per-material notes

## Data Flow Diagram

```
UI (MaterialVendorSelectionModal)
  ↓ User types note for Material A
  ↓ Clicks Save
buyerService.saveSupplierNotes(cr_id, "Material A", note)
  ↓ POST /buyer/purchase/{cr_id}/save-supplier-notes
Backend (save_supplier_notes)
  ↓ Validate note (length, characters)
  ↓ Store in: cr.material_vendor_selections["Material A"]["supplier_notes"]
  ↓ db.session.commit()
  ↓ Return success
  ↓
Later: Buyer sends to TD
  ↓ create_po_children()
  ↓ Include material notes in POChild.materials_data
  ↓
Later: Generate LPO
  ↓ get_lpo_preview_for_purchase()
  ↓ Build materials list with supplier_notes field
  ↓ Pass to lpo_pdf_generator.py
  ↓ Render table with notes sub-rows
  ↓ PDF shows:
      1 | Fire Door | Brand | Spec | 1 | nos | 1400 | 1400
        | 📝 Note: Cut to 90cm x 210cm with vision panel
```

## Files to Modify

### Frontend
1. `/frontend/src/roles/buyer/components/MaterialVendorSelectionModal.tsx`
   - Add state for per-material notes
   - Add UI component for notes input
   - Add save handler
   - Include notes in vendor selection submission

### Backend
2. `/backend/controllers/buyer_controller.py`
   - Update `get_lpo_preview_for_purchase()` to include material notes
   - Ensure `save_supplier_notes()` is working correctly (already exists)
   - Update `create_po_children()` to preserve material notes in POChild.materials_data

3. `/backend/utils/lpo_pdf_generator.py`
   - Modify table generation to add notes sub-rows
   - Add LPOSmallItalic style

## Estimated Effort
- Frontend UI: 1.5 hours
- Backend LPO data: 0.5 hours
- PDF generator: 1 hour
- Testing: 1 hour
- **Total: 4 hours**

## Success Criteria
✅ Buyer can add/edit/save notes for each material individually
✅ Notes persist across page refreshes
✅ Notes appear in LPO PDF directly under each material
✅ Purchase-level notes still work (both systems coexist)
✅ No dead code remains
✅ All validation working (character limit, special chars)
