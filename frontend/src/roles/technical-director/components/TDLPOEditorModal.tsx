import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  Edit3,
  Save,
  Download,
  CheckCircle,
  Plus,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buyerService, LPOData, POChild } from '@/roles/buyer/services/buyerService';
import { showSuccess, showError, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface TDLPOEditorModalProps {
  poChild: POChild | null;
  crId: number;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
  isReadOnly?: boolean; // When true, all fields are non-editable (after TD approval)
}

const TDLPOEditorModal: React.FC<TDLPOEditorModalProps> = ({
  poChild,
  crId,
  isOpen,
  onClose,
  onSave,
  isReadOnly = false
}) => {
  const [lpoData, setLpoData] = useState<LPOData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [newCustomTerm, setNewCustomTerm] = useState('');
  const [editingTermIndex, setEditingTermIndex] = useState<number | null>(null);
  const [editingTermText, setEditingTermText] = useState('');
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [includeVAT, setIncludeVAT] = useState(false);  // Default to false, will be set from loaded data

  // Load LPO data when modal opens
  useEffect(() => {
    if (isOpen && crId) {
      loadLpoData();
    }
  }, [isOpen, crId]);

  // Set initial VAT checkbox state based on loaded data
  useEffect(() => {
    if (lpoData && lpoData.totals) {
      const shouldIncludeVAT = (lpoData.totals.vat_percent || 0) > 0;
      setIncludeVAT(shouldIncludeVAT);
      console.log(`[LPO VAT Sync] VAT checkbox set to: ${shouldIncludeVAT}, vat_percent: ${lpoData.totals.vat_percent}`);
    }
  }, [lpoData]);

  const loadLpoData = async () => {
    try {
      setIsLoading(true);
      const response = await buyerService.previewLPOPdf(crId, poChild?.id);
      setLpoData(response.lpo_data);
    } catch (error: any) {
      console.error('Error loading LPO data:', error);
      showError(error.message || 'Failed to load LPO data');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-save function with debounce
  const autoSaveLpoCustomization = useCallback(async () => {
    if (!lpoData) return;

    setIsSaving(true);
    try {
      await buyerService.saveLPOCustomization(crId, lpoData, includeSignatures, poChild?.id);
      setLastSaved(new Date());

      // Call onSave callback if provided (for parent to refresh data)
      if (onSave) {
        onSave();
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [lpoData, includeSignatures, crId, poChild?.id, onSave]);

  // Manual save and close function
  const handleSaveAndClose = async () => {
    if (!lpoData) return;

    setIsSaving(true);
    try {
      await buyerService.saveLPOCustomization(crId, lpoData, includeSignatures, poChild?.id);
      showSuccess('LPO saved successfully');

      // Call onSave callback if provided
      if (onSave) {
        onSave();
      }

      // Close modal after short delay for user feedback
      setTimeout(() => {
        setLpoData(null);
        setLastSaved(null);
        onClose();
      }, 300);
    } catch (error: any) {
      console.error('Save failed:', error);
      showError(error.message || 'Failed to save LPO');
      setIsSaving(false);
    }
  };

  // Debounced auto-save effect (skip if read-only)
  useEffect(() => {
    if (!lpoData || isReadOnly) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      autoSaveLpoCustomization();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [lpoData, autoSaveLpoCustomization, isReadOnly]);

  // Save as default template
  const handleSaveAsDefault = async () => {
    if (!lpoData) return;

    setIsSavingDefault(true);
    try {
      await buyerService.saveLPODefaultTemplate(lpoData, includeSignatures);
      showSuccess('Default template saved! This will be used for new projects.');
    } catch (error: any) {
      console.error('Error saving default template:', error);
      showError(error.message || 'Failed to save default template');
    } finally {
      setIsSavingDefault(false);
    }
  };

  // Get LPO data with signatures based on checkbox
  const getLpoDataWithSignatures = (): LPOData | null => {
    if (!lpoData) return null;

    if (!includeSignatures) {
      return {
        ...lpoData,
        signatures: {
          ...lpoData.signatures,
          md_signature: null,
          td_signature: null,
          stamp_image: null,
          is_system_signature: false
        }
      };
    }
    return {
      ...lpoData,
      signatures: {
        ...lpoData.signatures,
        is_system_signature: true
      }
    };
  };

  // Download LPO PDF preview
  const handleDownloadLpoPdf = async () => {
    const finalLpoData = getLpoDataWithSignatures();
    if (!finalLpoData) {
      showError('LPO data not loaded');
      return;
    }
    try {
      const blob = await buyerService.generateLPOPdf(crId, finalLpoData);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LPO-${crId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showSuccess('LPO PDF downloaded successfully');
    } catch (error: any) {
      console.error('Error downloading LPO PDF:', error);
      showError(error.message || 'Failed to download LPO PDF');
    }
  };

  const handleClose = () => {
    setLpoData(null);
    setLastSaved(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-y-0 right-0 z-50 bg-gradient-to-br from-gray-50 via-white to-gray-100 md:left-56 left-0 flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
            <div className="max-w-7xl mx-auto px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClose}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-6 h-6 text-gray-600" />
                  </button>
                  <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-[#243d8a]">{isReadOnly ? 'View LPO Details' : 'Edit LPO Details'}</h1>
                    <p className="text-sm text-gray-600">
                      {poChild?.formatted_id || `PO-${crId}`} - {poChild?.project_name || 'Purchase Order'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!isReadOnly && (
                    <Button
                      onClick={handleSaveAndClose}
                      disabled={isSaving}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                    >
                      {isSaving ? (
                        <>
                          <ModernLoadingSpinners size="xs" className="mr-1" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-1" />
                          Save & Close
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    onClick={handleDownloadLpoPdf}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Preview PDF
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 max-w-5xl mx-auto px-6 py-6 overflow-y-auto w-full">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <ModernLoadingSpinners size="sm" />
                  <p className="text-sm text-gray-600">Loading LPO data...</p>
                </div>
              </div>
            ) : lpoData ? (
              <div className="space-y-6">
                {/* Read-only Banner */}
                {isReadOnly && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-amber-600" />
                    <div>
                      <span className="font-medium text-amber-800">This LPO has been approved</span>
                      <p className="text-sm text-amber-600">LPO details can no longer be edited after approval.</p>
                    </div>
                  </div>
                )}

                {/* Save Status and Actions */}
                {!isReadOnly && (
                  <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        {isSaving ? (
                          <>
                            <ModernLoadingSpinners size="xs" />
                            <span>Saving...</span>
                          </>
                        ) : lastSaved ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span>Auto-saved</span>
                          </>
                        ) : (
                          <span className="text-gray-400">Changes will auto-save</span>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={handleSaveAsDefault}
                      disabled={isSavingDefault}
                      variant="outline"
                      size="sm"
                      className="bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-700"
                    >
                      {isSavingDefault ? (
                        <>
                          <ModernLoadingSpinners size="xs" className="mr-1" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-1" />
                          Save as Default
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* Quotation Ref and Subject */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Edit3 className="w-5 h-5 text-blue-600" />
                    {isReadOnly ? 'LPO Details' : 'Edit LPO Details'}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Quotation Ref#</label>
                      <Input
                        value={lpoData.lpo_info.quotation_ref || ''}
                        onChange={(e) => !isReadOnly && setLpoData({
                          ...lpoData,
                          lpo_info: { ...lpoData.lpo_info, quotation_ref: e.target.value }
                        })}
                        className={`mt-1 ${isReadOnly ? 'bg-gray-50' : ''}`}
                        placeholder="Vendor quotation reference"
                        disabled={isReadOnly}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Subject</label>
                      <Input
                        value={lpoData.vendor.subject || ''}
                        onChange={(e) => !isReadOnly && setLpoData({
                          ...lpoData,
                          vendor: { ...lpoData.vendor, subject: e.target.value }
                        })}
                        className={`mt-1 ${isReadOnly ? 'bg-gray-50' : ''}`}
                        placeholder="LPO subject"
                        disabled={isReadOnly}
                      />
                    </div>
                  </div>

                  {/* Custom Message for PDF */}
                  <div>
                    <label className="text-sm font-medium text-gray-700">LPO Message (shown in PDF)</label>
                    <textarea
                      value={lpoData.lpo_info.custom_message || ''}
                      onChange={(e) => !isReadOnly && setLpoData({
                        ...lpoData,
                        lpo_info: { ...lpoData.lpo_info, custom_message: e.target.value }
                      })}
                      className={`mt-1 w-full p-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] ${isReadOnly ? 'bg-gray-50' : ''}`}
                      placeholder="Thank you very much for quoting us for requirements. As per your quotation and settlement done over the mail, we are issuing the LPO and please ensure the delivery on time"
                      disabled={isReadOnly}
                    />
                    <p className="text-xs text-gray-400 mt-1">{isReadOnly ? 'Message shown in the LPO PDF' : 'Edit the message that appears in the LPO PDF'}</p>
                  </div>
                </div>

                {/* VAT Configuration */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">VAT Configuration</h3>

                  {/* VAT Checkbox */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="include-vat"
                      checked={includeVAT}
                      onChange={(e) => {
                        if (isReadOnly) return;
                        const isChecked = e.target.checked;
                        setIncludeVAT(isChecked);

                        if (!isChecked) {
                          // Disable VAT - set to 0%
                          setLpoData({
                            ...lpoData,
                            totals: {
                              ...lpoData.totals,
                              vat_percent: 0,
                              vat_amount: 0,
                              grand_total: lpoData.totals.subtotal
                            }
                          });
                        } else {
                          // Enable VAT - set to default 5%
                          const defaultVatPercent = 5;
                          const newVatAmount = (lpoData.totals.subtotal * defaultVatPercent) / 100;
                          const newGrandTotal = lpoData.totals.subtotal + newVatAmount;

                          setLpoData({
                            ...lpoData,
                            totals: {
                              ...lpoData.totals,
                              vat_percent: defaultVatPercent,
                              vat_amount: parseFloat(newVatAmount.toFixed(2)),
                              grand_total: parseFloat(newGrandTotal.toFixed(2))
                            }
                          });
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      disabled={isReadOnly}
                    />
                    <label htmlFor="include-vat" className="text-sm font-medium text-gray-700">
                      {isReadOnly ? 'VAT Included in LPO' : 'Include VAT in LPO'}
                    </label>
                  </div>

                  {/* VAT Percentage Input - Only show when VAT is enabled */}
                  {includeVAT && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <label className="text-sm font-medium text-gray-700 mb-2 block">VAT Percentage</label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={lpoData.totals.vat_percent}
                          onChange={(e) => {
                            if (isReadOnly) return;
                            const newVatPercent = parseFloat(e.target.value) || 0;
                            const newVatAmount = (lpoData.totals.subtotal * newVatPercent) / 100;
                            const newGrandTotal = lpoData.totals.subtotal + newVatAmount;

                            setLpoData({
                              ...lpoData,
                              totals: {
                                ...lpoData.totals,
                                vat_percent: newVatPercent,
                                vat_amount: parseFloat(newVatAmount.toFixed(2)),
                                grand_total: parseFloat(newGrandTotal.toFixed(2))
                              }
                            });
                          }}
                          className={`w-32 ${isReadOnly ? 'bg-gray-100' : ''}`}
                          placeholder="5"
                          disabled={isReadOnly}
                        />
                        <span className="text-sm text-gray-600">%</span>
                        <div className="ml-auto text-right">
                          <div className="text-xs text-gray-500">VAT Amount</div>
                          <div className="text-lg font-bold text-gray-900">AED {lpoData.totals.vat_amount.toLocaleString()}</div>
                        </div>
                      </div>
                      {!isReadOnly && (
                        <p className="text-xs text-gray-500 mt-2">Enter custom VAT percentage. Changes will auto-save and update the PDF.</p>
                      )}
                    </div>
                  )}

                  {!includeVAT && (
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-sm text-gray-600">VAT is disabled for this LPO. Check the box above to add VAT.</p>
                    </div>
                  )}
                </div>

                {/* Terms & Conditions */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Terms & Conditions</h3>

                  {/* Delivery Terms */}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Delivery Terms</label>
                    <Input
                      value={lpoData.terms.completion_terms || lpoData.terms.delivery_terms || ''}
                      onChange={(e) => !isReadOnly && setLpoData({
                        ...lpoData,
                        terms: { ...lpoData.terms, completion_terms: e.target.value, delivery_terms: e.target.value }
                      })}
                      className={`mt-1 ${isReadOnly ? 'bg-gray-50' : ''}`}
                      placeholder="e.g., 04.12.25"
                      disabled={isReadOnly}
                    />
                  </div>

                  {/* Payment Terms with Checkboxes */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">{isReadOnly ? 'Payment Terms' : 'Payment Terms (select to include in PDF)'}</div>

                    {/* Payment terms list with checkboxes */}
                    <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
                      {(lpoData.terms.custom_terms || []).map((term: { text: string, selected: boolean }, index: number) => (
                        <div key={index} className="flex items-center gap-2 bg-white p-3 rounded-lg border border-gray-200">
                          <input
                            type="checkbox"
                            checked={term.selected}
                            onChange={(e) => {
                              if (isReadOnly) return;
                              const updatedTerms = [...(lpoData.terms.custom_terms || [])];
                              updatedTerms[index] = { ...term, selected: e.target.checked };
                              setLpoData({
                                ...lpoData,
                                terms: { ...lpoData.terms, custom_terms: updatedTerms }
                              });
                            }}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            disabled={isReadOnly}
                          />
                          {editingTermIndex === index && !isReadOnly ? (
                            <div className="flex-1 flex gap-2">
                              <Input
                                value={editingTermText}
                                onChange={(e) => setEditingTermText(e.target.value)}
                                className="flex-1 text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (editingTermText.trim()) {
                                      const updatedTerms = [...(lpoData.terms.custom_terms || [])];
                                      updatedTerms[index] = { ...term, text: editingTermText.trim() };
                                      setLpoData({
                                        ...lpoData,
                                        terms: { ...lpoData.terms, custom_terms: updatedTerms }
                                      });
                                    }
                                    setEditingTermIndex(null);
                                    setEditingTermText('');
                                  } else if (e.key === 'Escape') {
                                    setEditingTermIndex(null);
                                    setEditingTermText('');
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (editingTermText.trim()) {
                                    const updatedTerms = [...(lpoData.terms.custom_terms || [])];
                                    updatedTerms[index] = { ...term, text: editingTermText.trim() };
                                    setLpoData({
                                      ...lpoData,
                                      terms: { ...lpoData.terms, custom_terms: updatedTerms }
                                    });
                                  }
                                  setEditingTermIndex(null);
                                  setEditingTermText('');
                                }}
                              >
                                <Save className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-gray-700">{term.text}</span>
                              {!isReadOnly && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTermIndex(index);
                                      setEditingTermText(term.text);
                                    }}
                                    className="text-blue-500 hover:text-blue-700 p-1"
                                    title="Edit term"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updatedTerms = (lpoData.terms.custom_terms || []).filter((_: any, i: number) => i !== index);
                                      setLpoData({
                                        ...lpoData,
                                        terms: { ...lpoData.terms, custom_terms: updatedTerms }
                                      });
                                    }}
                                    className="text-red-500 hover:text-red-700 p-1"
                                    title="Delete term"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                      {(!lpoData.terms.custom_terms || lpoData.terms.custom_terms.length === 0) && (
                        <div className="text-sm text-gray-400 italic py-3 text-center">{isReadOnly ? 'No payment terms specified.' : 'No payment terms added yet. Add your first term below.'}</div>
                      )}
                    </div>

                    {/* Add new payment term - hide if readonly */}
                    {!isReadOnly && (
                      <div className="flex gap-2">
                        <Input
                          value={newCustomTerm}
                          onChange={(e) => setNewCustomTerm(e.target.value)}
                          placeholder="e.g., 50% Advance, 100% CDC after delivery..."
                          className="flex-1"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newCustomTerm.trim()) {
                                const currentTerms = lpoData.terms.custom_terms || [];
                                setLpoData({
                                  ...lpoData,
                                  terms: {
                                    ...lpoData.terms,
                                    custom_terms: [...currentTerms, { text: newCustomTerm.trim(), selected: true }]
                                  }
                                });
                                setNewCustomTerm('');
                              }
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                          if (newCustomTerm.trim()) {
                            const currentTerms = lpoData.terms.custom_terms || [];
                            setLpoData({
                              ...lpoData,
                              terms: {
                                ...lpoData.terms,
                                custom_terms: [...currentTerms, { text: newCustomTerm.trim(), selected: true }]
                              }
                            });
                            setNewCustomTerm('');
                          }
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                      </div>
                    )}
                    {!isReadOnly && (
                      <p className="text-xs text-gray-400 mt-2">Payment terms are saved and available for future projects</p>
                    )}
                  </div>
                </div>

                {/* Signature Selection */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="include-signatures"
                        checked={includeSignatures}
                        onChange={(e) => !isReadOnly && setIncludeSignatures(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        disabled={isReadOnly}
                      />
                      <label htmlFor="include-signatures" className="text-sm font-medium text-gray-700">
                        {isReadOnly ? 'Signatures in LPO PDF' : 'Include Signatures in LPO PDF'}
                      </label>
                    </div>
                  </div>

                  {/* Signature Preview */}
                  {includeSignatures && (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="text-sm text-gray-600 mb-3">Signatures from Admin Settings:</div>
                      <div className="grid grid-cols-3 gap-6">
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-2">MD Signature</div>
                          {lpoData.signatures.md_signature ? (
                            <img src={lpoData.signatures.md_signature} alt="MD" className="h-12 mx-auto object-contain" />
                          ) : (
                            <div className="text-xs text-orange-500">Not uploaded</div>
                          )}
                          <div className="text-xs font-medium mt-2">{lpoData.signatures.md_name}</div>
                          <div className="text-xs text-gray-500">Managing Director</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-2">Stamp</div>
                          {lpoData.signatures.stamp_image ? (
                            <img src={lpoData.signatures.stamp_image} alt="Stamp" className="h-12 mx-auto object-contain" />
                          ) : (
                            <div className="text-xs text-orange-500">Not uploaded</div>
                          )}
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-2">TD Signature</div>
                          {lpoData.signatures.td_signature ? (
                            <img src={lpoData.signatures.td_signature} alt="TD" className="h-12 mx-auto object-contain" />
                          ) : (
                            <div className="text-xs text-orange-500">Not uploaded</div>
                          )}
                          <div className="text-xs font-medium mt-2">{lpoData.signatures.td_name}</div>
                          <div className="text-xs text-gray-500">Technical Director</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* LPO Summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-900 mb-3">LPO Summary</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg p-3 border border-blue-100">
                      <span className="text-xs text-gray-500">Subtotal</span>
                      <div className="text-lg font-bold text-gray-900">AED {lpoData.totals.subtotal.toLocaleString()}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-100">
                      <span className="text-xs text-gray-500">VAT {includeVAT ? `(${lpoData.totals.vat_percent}%)` : '(Not Applied)'}</span>
                      <div className="text-lg font-bold text-gray-900">AED {lpoData.totals.vat_amount.toLocaleString()}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-100">
                      <span className="text-xs text-gray-500">Total</span>
                      <div className="text-lg font-bold text-blue-600">AED {lpoData.totals.grand_total.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <Button
                    onClick={handleClose}
                    variant="outline"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={handleDownloadLpoPdf}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Preview PDF
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Failed to load LPO data</p>
                <Button onClick={loadLpoData} variant="outline" className="mt-4">
                  Retry
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TDLPOEditorModal;
