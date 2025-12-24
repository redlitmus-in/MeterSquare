/**
 * Script to add per-material notes functionality to MaterialVendorSelectionModal.tsx
 *
 * This script will:
 * 1. Add state management for per-material notes
 * 2. Add initialization logic from purchase data
 * 3. Add save handler function
 * 4. Insert UI component for notes input
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/roles/buyer/components/MaterialVendorSelectionModal.tsx');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

console.log('🔧 Adding per-material notes functionality...\n');

// Step 1: Add state declarations after existing state (after line 141)
const stateAddition = `
  // Per-material notes state
  const [materialNotes, setMaterialNotes] = useState<Record<string, string>>({});
  const [editingMaterialNote, setEditingMaterialNote] = useState<string | null>(null);
  const [savingMaterialNote, setSavingMaterialNote] = useState<string | null>(null);
`;

// Find the line after "const [savedNote, setSavedNote]" and insert
content = content.replace(
  /(const \[savedNote, setSavedNote\] = useState<string>\(''\);.*?\n)/,
  `$1${stateAddition}`
);

console.log('✅ Added state declarations');

// Step 2: Add initialization effect (after the existing purchaseSummaryNote initialization around line 183)
const initEffect = `
  // Initialize per-material notes from purchase data
  useEffect(() => {
    if (!isOpen || !purchase) return;

    const notes: Record<string, string> = {};
    if (purchase.material_vendor_selections) {
      Object.entries(purchase.material_vendor_selections).forEach(([materialName, selection]: [string, any]) => {
        if (selection.supplier_notes) {
          notes[materialName] = selection.supplier_notes;
        }
      });
    }
    setMaterialNotes(notes);
  }, [isOpen, purchase?.cr_id, purchase?.material_vendor_selections]);
`;

content = content.replace(
  /(setSavedNote\(initialNote\);[\s\S]*?}, \[isOpen, purchase\?\.cr_id\]\);)/,
  `$1\n${initEffect}`
);

console.log('✅ Added initialization effect');

// Step 3: Add save handler function (before the UI render around line 1400)
const saveHandler = `
  // Save per-material supplier notes
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
`;

content = content.replace(
  /(const handleSavePurchaseNote = async \(\) => \{[\s\S]*?};)/,
  `$1\n${saveHandler}`
);

console.log('✅ Added save handler function');

// Step 4: Add UI component (after material header, before vendor selection panel around line 1897-1899)
const notesUI = `
                          {/* Per-Material Supplier Notes Section */}
                          {!isMaterialLocked && (
                            <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-t border-blue-200">
                              <div className="flex items-start gap-2">
                                <FileText className="w-4 h-4 text-blue-600 mt-1 flex-shrink-0" />
                                <div className="flex-1">
                                  <label className="text-xs font-semibold text-blue-900 block mb-1 flex items-center gap-1">
                                    Notes for Supplier
                                    <span className="text-[10px] font-normal text-blue-600">(cutting details, specifications, custom requirements)</span>
                                  </label>

                                  {editingMaterialNote === material.material_name ? (
                                    <div className="space-y-2">
                                      <textarea
                                        value={materialNotes[material.material_name] || ''}
                                        onChange={(e) => setMaterialNotes({
                                          ...materialNotes,
                                          [material.material_name]: e.target.value
                                        })}
                                        placeholder="Example: Cut to 90cm x 210cm, RAL 9010 finish, include standard vision panel, deliver by Friday..."
                                        className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-y bg-white"
                                        rows={3}
                                        maxLength={5000}
                                      />
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-gray-500">
                                          {(materialNotes[material.material_name] || '').length} / 5000 characters
                                        </span>
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            onClick={() => handleSaveMaterialNote(material.material_name)}
                                            disabled={savingMaterialNote === material.material_name}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs"
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
                                            onClick={() => {
                                              setEditingMaterialNote(null);
                                              // Reset to saved value
                                              if (purchase.material_vendor_selections?.[material.material_name]?.supplier_notes) {
                                                setMaterialNotes({
                                                  ...materialNotes,
                                                  [material.material_name]: purchase.material_vendor_selections[material.material_name].supplier_notes
                                                });
                                              }
                                            }}
                                            className="px-3 py-1.5 text-xs"
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      onClick={() => setEditingMaterialNote(material.material_name)}
                                      className="cursor-pointer text-sm text-gray-700 hover:bg-blue-100 p-2.5 rounded-md border border-dashed border-blue-300 min-h-[44px] transition-colors"
                                    >
                                      {materialNotes[material.material_name] ? (
                                        <div className="whitespace-pre-wrap text-gray-800">
                                          {materialNotes[material.material_name]}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 italic text-xs">
                                          Click to add specifications, cutting details, or special requirements for this material...
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
`;

content = content.replace(
  /(                          <\/div>\n)(                          \/\* Vendor Selection Panel - Only show if not locked \*\/)/,
  `$1${notesUI}\n$2`
);

console.log('✅ Added UI component');

// Write the modified content back
fs.writeFileSync(filePath, content, 'utf8');

console.log('\n✅ Successfully added per-material notes functionality!');
console.log('📝 Changes made:');
console.log('   - Added state management for material notes');
console.log('   - Added initialization from purchase data');
console.log('   - Added save handler function');
console.log('   - Added UI component for notes input/edit');
console.log('\n🔍 Next steps:');
console.log('   1. Ensure backend includes material notes in vendor selection');
console.log('   2. Update LPO data structure to pass material notes');
console.log('   3. Update LPO PDF generator to display notes under materials');
