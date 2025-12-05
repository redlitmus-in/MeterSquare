/**
 * Admin Signature Upload Page
 * Upload MD signature (cover page) and Authorized signature (quotation section)
 * Also LPO signatures for Purchase Orders (MD, TD, Company Seal)
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { PenTool, Upload, Trash2, CheckCircle, AlertCircle, RefreshCw, FileText, User, ShoppingCart, Shield, Users } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { adminApi } from '@/api/admin';

const SignatureUpload: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // MD Signature for Cover Page (BOQ)
  const [mdSignatureImage, setMdSignatureImage] = useState<string | null>(null);
  const mdSignatureInputRef = useRef<HTMLInputElement>(null);

  // Authorized Signature for Quotation Section (BOQ)
  const [authorizedSignatureImage, setAuthorizedSignatureImage] = useState<string | null>(null);
  const authorizedSignatureInputRef = useRef<HTMLInputElement>(null);

  // LPO Signatures - MD for LPO
  const [lpoMdSignatureImage, setLpoMdSignatureImage] = useState<string | null>(null);
  const [lpoMdName, setLpoMdName] = useState<string>('Managing Director');
  const lpoMdSignatureInputRef = useRef<HTMLInputElement>(null);

  // LPO Signatures - TD for LPO
  const [lpoTdSignatureImage, setLpoTdSignatureImage] = useState<string | null>(null);
  const [lpoTdName, setLpoTdName] = useState<string>('Technical Director');
  const lpoTdSignatureInputRef = useRef<HTMLInputElement>(null);

  // LPO Signatures - Company Seal
  const [companyStampImage, setCompanyStampImage] = useState<string | null>(null);
  const companyStampInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSignatures();
  }, []);

  const fetchSignatures = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.getSettings();
      // BOQ signatures
      setMdSignatureImage(response.settings.mdSignatureImage || null);
      setAuthorizedSignatureImage(response.settings.signatureImage || null);
      // LPO signatures - use separate fields for LPO MD/TD
      // Note: LPO uses its own fields, not the BOQ mdSignatureImage
      setLpoMdSignatureImage(response.settings.mdSignatureImage || null); // For now, use same MD signature
      setLpoMdName(response.settings.mdName || 'Managing Director');
      setLpoTdSignatureImage(response.settings.tdSignatureImage || null);
      setLpoTdName(response.settings.tdName || 'Technical Director');
      setCompanyStampImage(response.settings.companyStampImage || null);
    } catch (error: any) {
      showError('Failed to fetch signatures', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Generic file reader helper
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // Validate file helper
  const validateImageFile = (file: File): boolean => {
    if (!file.type.startsWith('image/')) {
      showError('Please select an image file (PNG, JPG, etc.)');
      return false;
    }
    if (file.size > 2 * 1024 * 1024) {
      showError('Signature image should be less than 2MB');
      return false;
    }
    return true;
  };

  // Upload handlers with auto-save for each signature type
  const handleUploadMdSignature = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !validateImageFile(file)) return;
    event.target.value = '';

    try {
      const base64 = await readFileAsBase64(file);
      setMdSignatureImage(base64);
      setLpoMdSignatureImage(base64); // Sync LPO MD since they share same DB field
      await handleSaveSignatures({ mdSignatureImage: base64 });
    } catch {
      showError('Failed to upload signature');
    }
  };

  const handleUploadAuthorizedSignature = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !validateImageFile(file)) return;
    event.target.value = '';

    try {
      const base64 = await readFileAsBase64(file);
      setAuthorizedSignatureImage(base64);
      await handleSaveSignatures({ authorizedSignatureImage: base64 });
    } catch {
      showError('Failed to upload signature');
    }
  };

  const handleUploadLpoMdSignature = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !validateImageFile(file)) return;
    event.target.value = '';

    try {
      const base64 = await readFileAsBase64(file);
      setLpoMdSignatureImage(base64);
      setMdSignatureImage(base64); // Sync BOQ MD since they share same DB field
      await handleSaveSignatures({ lpoMdSignatureImage: base64 });
    } catch {
      showError('Failed to upload signature');
    }
  };

  const handleUploadLpoTdSignature = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !validateImageFile(file)) return;
    event.target.value = '';

    try {
      const base64 = await readFileAsBase64(file);
      setLpoTdSignatureImage(base64);
      await handleSaveSignatures({ lpoTdSignatureImage: base64 });
    } catch {
      showError('Failed to upload signature');
    }
  };

  const handleUploadCompanyStamp = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !validateImageFile(file)) return;
    event.target.value = '';

    try {
      const base64 = await readFileAsBase64(file);
      setCompanyStampImage(base64);
      await handleSaveSignatures({ companyStampImage: base64 });
    } catch {
      showError('Failed to upload signature');
    }
  };

  const handleSaveSignatures = async (
    overrides?: {
      mdSignatureImage?: string | null;
      authorizedSignatureImage?: string | null;
      lpoMdSignatureImage?: string | null;
      lpoTdSignatureImage?: string | null;
      companyStampImage?: string | null;
    }
  ) => {
    setIsSaving(true);
    try {
      // Use overrides if provided, otherwise use current state
      // Note: BOQ MD and LPO MD share the same database field (md_signature_image)
      // If either is updated, we should use that value
      let mdSig = overrides?.mdSignatureImage !== undefined ? overrides.mdSignatureImage : mdSignatureImage;
      const authSig = overrides?.authorizedSignatureImage !== undefined ? overrides.authorizedSignatureImage : authorizedSignatureImage;
      const lpoTdSig = overrides?.lpoTdSignatureImage !== undefined ? overrides.lpoTdSignatureImage : lpoTdSignatureImage;
      const stampSig = overrides?.companyStampImage !== undefined ? overrides.companyStampImage : companyStampImage;

      // If LPO MD signature is being updated, use that value for mdSignatureImage
      // (they share the same DB field)
      if (overrides?.lpoMdSignatureImage !== undefined) {
        mdSig = overrides.lpoMdSignatureImage;
      }

      // Update settings with BOQ signatures and LPO signatures
      await adminApi.updateSettings({
        // MD signature (shared between BOQ cover page and LPO)
        mdSignatureImage: mdSig,
        // Authorized signature (BOQ quotation section only)
        signatureImage: authSig,
        signatureEnabled: !!authSig || !!mdSig,
        // LPO specific settings
        mdName: lpoMdName,
        tdSignatureImage: lpoTdSig,
        tdName: lpoTdName,
        companyStampImage: stampSig
      });
      showSuccess('Signature saved successfully');
    } catch (error: any) {
      showError('Failed to save signature', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete handlers that auto-save
  const handleDeleteMdSignature = async () => {
    setMdSignatureImage(null);
    setLpoMdSignatureImage(null); // Sync LPO MD since they share same DB field
    await handleSaveSignatures({ mdSignatureImage: null });
  };

  const handleDeleteAuthorizedSignature = async () => {
    setAuthorizedSignatureImage(null);
    await handleSaveSignatures({ authorizedSignatureImage: null });
  };

  const handleDeleteLpoMdSignature = async () => {
    setLpoMdSignatureImage(null);
    setMdSignatureImage(null); // Sync BOQ MD since they share same DB field
    await handleSaveSignatures({ lpoMdSignatureImage: null });
  };

  const handleDeleteLpoTdSignature = async () => {
    setLpoTdSignatureImage(null);
    await handleSaveSignatures({ lpoTdSignatureImage: null });
  };

  const handleDeleteCompanyStamp = async () => {
    setCompanyStampImage(null);
    await handleSaveSignatures({ companyStampImage: null });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <PenTool className="w-8 h-8 text-indigo-600" />
              Signature Upload
            </h1>
            <p className="text-gray-500 mt-1">Upload signatures for client PDF quotations</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchSignatures}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => handleSaveSignatures()}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 gap-6">

          {/* MD Signature - Cover Page */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">MD Signature</h2>
                  <p className="text-sm text-gray-500">Appears on Cover Page</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Hidden file input */}
              <input
                ref={mdSignatureInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadMdSignature}
                className="hidden"
              />

              {mdSignatureImage ? (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-center mb-4">
                    <img
                      src={mdSignatureImage}
                      alt="MD Signature"
                      className="max-h-24 max-w-full object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => mdSignatureInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Change
                    </button>
                    <button
                      onClick={handleDeleteMdSignature}
                      disabled={isSaving}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-dashed border-blue-300 p-8 cursor-pointer hover:border-blue-400 transition-colors"
                  onClick={() => mdSignatureInputRef.current?.click()}
                >
                  <div className="text-center">
                    <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                      <Upload className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Upload MD Signature</h3>
                    <p className="text-sm text-gray-500">PNG, JPG - Max 2MB</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Authorized Signature - Quotation Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Authorized Signature</h2>
                  <p className="text-sm text-gray-500">Appears on Quotation Section</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Hidden file input */}
              <input
                ref={authorizedSignatureInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadAuthorizedSignature}
                className="hidden"
              />

              {authorizedSignatureImage ? (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-center mb-4">
                    <img
                      src={authorizedSignatureImage}
                      alt="Authorized Signature"
                      className="max-h-24 max-w-full object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => authorizedSignatureInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Change
                    </button>
                    <button
                      onClick={handleDeleteAuthorizedSignature}
                      disabled={isSaving}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-dashed border-purple-300 p-8 cursor-pointer hover:border-purple-400 transition-colors"
                  onClick={() => authorizedSignatureInputRef.current?.click()}
                >
                  <div className="text-center">
                    <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-3">
                      <Upload className="w-8 h-8 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Upload Authorized Signature</h3>
                    <p className="text-sm text-gray-500">PNG, JPG - Max 2MB</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Info Section for BOQ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 bg-blue-50 rounded-xl border border-blue-200 p-6"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-900 mb-2">How signatures appear in Client BOQ PDF</p>
              <div className="grid grid-cols-2 gap-4 text-sm text-blue-700">
                <div>
                  <p className="font-medium">MD Signature:</p>
                  <ul className="mt-1 space-y-1">
                    <li>• Appears on the Cover Page</li>
                    <li>• Above the signatory name section</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Authorized Signature:</p>
                  <ul className="mt-1 space-y-1">
                    <li>• Appears in Quotation Section</li>
                    <li>• Under "For MeterSquare Interiors LLC"</li>
                  </ul>
                </div>
              </div>
              <p className="mt-3 text-blue-600">
                Estimators can choose to include these signatures when sending BOQ to clients.
              </p>
            </div>
          </div>
        </motion.div>

        {/* LPO Signatures Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8"
        >
          {/* LPO Section Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-100 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">LPO Signatures (Purchase Orders)</h2>
              <p className="text-sm text-gray-500">Signatures for Local Purchase Order PDFs sent to vendors</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* MD Signature for LPO */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-600" />
                  <h3 className="text-base font-bold text-gray-900">Managing Director</h3>
                </div>
              </div>
              <div className="p-5">
                {/* Hidden file input */}
                <input
                  ref={lpoMdSignatureInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadLpoMdSignature}
                  className="hidden"
                />

                {/* Name input */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={lpoMdName}
                    onChange={(e) => setLpoMdName(e.target.value)}
                    placeholder="Managing Director Name"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* Signature Upload */}
                <label className="block text-xs font-medium text-gray-600 mb-1">Signature</label>
                {lpoMdSignatureImage ? (
                  <div className="bg-green-50 rounded-lg border border-green-200 p-3">
                    <div className="bg-white rounded border border-gray-200 p-3 flex items-center justify-center mb-3">
                      <img
                        src={lpoMdSignatureImage}
                        alt="MD Signature"
                        className="max-h-16 max-w-full object-contain"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => lpoMdSignatureInputRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        Change
                      </button>
                      <button
                        onClick={handleDeleteLpoMdSignature}
                        disabled={isSaving}
                        className="flex items-center justify-center px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed border-green-300 rounded-lg p-6 cursor-pointer hover:border-green-400 transition-colors text-center"
                    onClick={() => lpoMdSignatureInputRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 mx-auto text-green-400 mb-2" />
                    <p className="text-sm text-gray-500">Upload Signature</p>
                    <p className="text-xs text-gray-400">PNG, JPG - Max 2MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* Company Seal */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-600" />
                  <h3 className="text-base font-bold text-gray-900">Company Seal</h3>
                </div>
              </div>
              <div className="p-5">
                {/* Hidden file input */}
                <input
                  ref={companyStampInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadCompanyStamp}
                  className="hidden"
                />

                {/* Signature Upload */}
                <label className="block text-xs font-medium text-gray-600 mb-1">Stamp/Seal Image</label>
                {companyStampImage ? (
                  <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
                    <div className="bg-white rounded border border-gray-200 p-3 flex items-center justify-center mb-3">
                      <img
                        src={companyStampImage}
                        alt="Company Stamp"
                        className="max-h-20 max-w-full object-contain"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => companyStampInputRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        Change
                      </button>
                      <button
                        onClick={handleDeleteCompanyStamp}
                        disabled={isSaving}
                        className="flex items-center justify-center px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed border-amber-300 rounded-lg p-6 cursor-pointer hover:border-amber-400 transition-colors text-center"
                    onClick={() => companyStampInputRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 mx-auto text-amber-400 mb-2" />
                    <p className="text-sm text-gray-500">Upload Stamp</p>
                    <p className="text-xs text-gray-400">PNG, JPG - Max 2MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* TD Signature for LPO */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-teal-500/10 to-cyan-500/10 px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-teal-600" />
                  <h3 className="text-base font-bold text-gray-900">Technical Director</h3>
                </div>
              </div>
              <div className="p-5">
                {/* Hidden file input */}
                <input
                  ref={lpoTdSignatureInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadLpoTdSignature}
                  className="hidden"
                />

                {/* Name input */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={lpoTdName}
                    onChange={(e) => setLpoTdName(e.target.value)}
                    placeholder="Technical Director Name"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {/* Signature Upload */}
                <label className="block text-xs font-medium text-gray-600 mb-1">Signature</label>
                {lpoTdSignatureImage ? (
                  <div className="bg-teal-50 rounded-lg border border-teal-200 p-3">
                    <div className="bg-white rounded border border-gray-200 p-3 flex items-center justify-center mb-3">
                      <img
                        src={lpoTdSignatureImage}
                        alt="TD Signature"
                        className="max-h-16 max-w-full object-contain"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => lpoTdSignatureInputRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-teal-100 text-teal-700 rounded hover:bg-teal-200 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        Change
                      </button>
                      <button
                        onClick={handleDeleteLpoTdSignature}
                        disabled={isSaving}
                        className="flex items-center justify-center px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed border-teal-300 rounded-lg p-6 cursor-pointer hover:border-teal-400 transition-colors text-center"
                    onClick={() => lpoTdSignatureInputRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 mx-auto text-teal-400 mb-2" />
                    <p className="text-sm text-gray-500">Upload Signature</p>
                    <p className="text-xs text-gray-400">PNG, JPG - Max 2MB</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LPO Info Box */}
          <div className="mt-4 bg-green-50 rounded-xl border border-green-200 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-900 mb-2">How LPO signatures appear in Purchase Order PDF</p>
                <div className="grid grid-cols-3 gap-4 text-sm text-green-700">
                  <div>
                    <p className="font-medium">MD Signature:</p>
                    <p className="text-xs">Left side of signature section</p>
                  </div>
                  <div>
                    <p className="font-medium">Company Seal:</p>
                    <p className="text-xs">Center of signature section</p>
                  </div>
                  <div>
                    <p className="font-medium">TD Signature:</p>
                    <p className="text-xs">Right side of signature section</p>
                  </div>
                </div>
                <p className="mt-2 text-green-600 text-sm">
                  Buyers can choose to include these signatures when sending LPO to vendors.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default SignatureUpload;
