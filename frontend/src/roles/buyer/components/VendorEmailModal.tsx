import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Mail,
  Eye,
  Send,
  AlertCircle,
  CheckCircle,
  Loader2,
  Edit3,
  Save,
  Paperclip,
  Upload,
  FileIcon,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Purchase, buyerService } from '../services/buyerService';
import { toast } from 'sonner';

interface VendorEmailModalProps {
  purchase: Purchase;
  isOpen: boolean;
  onClose: () => void;
  onEmailSent?: () => void;
}

const VendorEmailModal: React.FC<VendorEmailModalProps> = ({
  purchase,
  isOpen,
  onClose,
  onEmailSent
}) => {
  const [step, setStep] = useState<'input' | 'preview' | 'success'>('input');
  const [vendorEmail, setVendorEmail] = useState('');
  const [emailPreview, setEmailPreview] = useState('');
  const [editedEmailContent, setEditedEmailContent] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  // Editable fields
  const [editedGreeting, setEditedGreeting] = useState('');
  const [editedMessage, setEditedMessage] = useState('');
  const [editedVendorName, setEditedVendorName] = useState('');
  const [editedVendorEmail, setEditedVendorEmail] = useState('');
  const [editedVendorContact, setEditedVendorContact] = useState('');
  const [editedVendorPhone, setEditedVendorPhone] = useState('');
  const [editedBuyerName, setEditedBuyerName] = useState('');
  const [editedBuyerEmail, setEditedBuyerEmail] = useState('');
  const [editedBuyerPhone, setEditedBuyerPhone] = useState('');
  const [editedInstructions, setEditedInstructions] = useState('');
  const [editedDeliveryReq, setEditedDeliveryReq] = useState('');

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles = Array.from(files);
    const validFiles: File[] = [];

    // Validate file size (max 200MB per file)
    for (const file of newFiles) {
      if (file.size > 200 * 1024 * 1024) {
        toast.error(`${file.name} is too large. Maximum file size is 200MB.`);
        continue;
      }
      validFiles.push(file);
    }

    setAttachedFiles(prev => [...prev, ...validFiles]);

    // Reset input
    event.target.value = '';
  };

  // Remove attached file
  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Load email preview when modal opens
  useEffect(() => {
    if (isOpen && step === 'input') {
      loadEmailPreview();
    }
  }, [isOpen, purchase.cr_id]);

  const loadEmailPreview = async () => {
    try {
      setIsLoadingPreview(true);
      const response = await buyerService.previewVendorEmail(purchase.cr_id);
      setEmailPreview(response.email_preview);
      setVendorEmail(response.vendor_email);
      setVendorName(response.vendor_name);

      // Initialize editable fields
      const userStr = localStorage.getItem('user');
      const currentUser = userStr ? JSON.parse(userStr) : null;

      setEditedGreeting(purchase.vendor_contact_person || purchase.vendor_name || '');
      setEditedMessage(`We are pleased to place a purchase order with ${purchase.vendor_name} for the materials listed below. This order is for our ongoing project and requires your prompt attention.`);
      setEditedVendorName(purchase.vendor_name || response.vendor_name || '');
      setEditedVendorEmail(vendorEmail || response.vendor_email || '');
      setEditedVendorContact(purchase.vendor_contact_person || '');
      setEditedVendorPhone(purchase.vendor_phone || '');
      setEditedBuyerName(currentUser?.full_name || currentUser?.username || '');
      setEditedBuyerEmail(currentUser?.email || '');
      setEditedBuyerPhone(currentUser?.phone || '');
      setEditedInstructions('Please confirm receipt of this purchase order\nProvide delivery timeline and availability confirmation\nEnsure all materials meet the specified quality standards\nInclude all necessary certifications and documentation\nContact the buyer for any clarifications or concerns');
      setEditedDeliveryReq(`Materials should be delivered to the project site: ${purchase.location}\nPlease coordinate delivery schedule with the buyer\nProper packaging and labeling is required\nInvoice should reference PO Number: CR-${purchase.cr_id}`);
    } catch (error: any) {
      console.error('Error loading email preview:', error);
      toast.error(error.message || 'Failed to load email preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handlePreview = () => {
    if (!vendorEmail || !vendorEmail.trim()) {
      toast.error('Please enter vendor email address');
      return;
    }

    // Parse comma-separated emails and validate each
    const emailList = vendorEmail.split(',').map(email => email.trim()).filter(email => email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const invalidEmails = emailList.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      toast.error(`Invalid email address: ${invalidEmails[0]}`);
      return;
    }

    if (emailList.length === 0) {
      toast.error('Please enter at least one valid email address');
      return;
    }

    setEditedEmailContent(emailPreview);
    setStep('preview');
  };

  const handleSendEmail = async () => {
    try {
      setIsSendingEmail(true);

      // Upload files first if there are any
      if (attachedFiles.length > 0) {
        toast.info(`Uploading ${attachedFiles.length} file(s)...`);
        try {
          const uploadResult = await buyerService.uploadFiles(purchase.cr_id, attachedFiles);

          if (uploadResult.errors && uploadResult.errors.length > 0) {
            // Some files failed, but continue if at least one succeeded
            const failedCount = uploadResult.errors.length;
            const successCount = uploadResult.uploaded_files.length;

            if (successCount === 0) {
              // All files failed
              toast.error('All file uploads failed. Please try again.');
              setIsSendingEmail(false);
              return;
            } else {
              // Some succeeded, some failed
              toast.warning(`${successCount} file(s) uploaded, ${failedCount} failed`);
            }
          } else {
            // All files uploaded successfully
            toast.success(`${uploadResult.uploaded_files.length} file(s) uploaded successfully`);
          }
        } catch (uploadError: any) {
          console.error('Error uploading files:', uploadError);
          toast.error(uploadError.message || 'Failed to upload files');
          setIsSendingEmail(false);
          return;
        }
      }

      // Get the email content - if edited, reconstruct from current fields
      const emailContent = isEditMode ? constructEmailHtml() : (editedEmailContent || emailPreview);

      // Send email with custom body and vendor fields only
      await buyerService.sendVendorEmail(purchase.cr_id, {
        vendor_email: editedVendorEmail || vendorEmail,
        custom_email_body: emailContent,
        vendor_company_name: editedVendorName,
        vendor_contact_person: editedVendorContact,
        vendor_phone: editedVendorPhone
      });
      setStep('success');

      const emailCount = (editedVendorEmail || vendorEmail).split(',').map(e => e.trim()).filter(e => e).length;
      const message = emailCount > 1
        ? `Purchase order email sent to ${emailCount} recipients successfully!`
        : 'Purchase order email sent to vendor successfully!';
      toast.success(message);

      setTimeout(() => {
        onEmailSent?.();
        handleClose();
      }, 2000);
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error(error.message || 'Failed to send email to vendor');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleToggleEdit = () => {
    if (isEditMode) {
      // Save changes - construct HTML from edited fields
      const customHtml = constructEmailHtml();
      setEditedEmailContent(customHtml);
      setIsEditMode(false);
      toast.success('Changes saved');
    } else {
      // Enter edit mode
      setIsEditMode(true);
    }
  };

  const constructEmailHtml = () => {
    // Build the custom email HTML from edited fields
    const instructionsList = editedInstructions.split('\n').filter(line => line.trim()).map(line => `<li>${line.trim()}</li>`).join('');
    const deliveryList = editedDeliveryReq.split('\n').filter(line => line.trim()).map(line => `<li>${line.trim()}</li>`).join('');

    const materialsRows = purchase.materials?.map((material: any, idx: number) => `
      <tr style="background-color: ${idx % 2 === 0 ? '#EBF5FF' : '#FFFFFF'};">
        <td style="padding: 8px; border: 1px solid #2563EB;">${idx + 1}</td>
        <td style="padding: 8px; border: 1px solid #2563EB; font-weight: 500;">${material.material_name}</td>
        <td style="padding: 8px; border: 1px solid #2563EB;">${material.quantity} ${material.unit}</td>
        <td style="padding: 8px; text-align: right; border: 1px solid #2563EB;">AED ${material.unit_price?.toFixed(2)}</td>
        <td style="padding: 8px; text-align: right; border: 1px solid #2563EB; font-weight: 600;">AED ${material.total_price?.toFixed(2)}</td>
      </tr>
    `).join('') || '';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333;">
        <!-- Header -->
        <div style="background-color: #2563EB; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 24px; font-weight: bold;">PURCHASE ORDER</h2>
          <p style="margin: 5px 0 0 0; font-size: 14px;">Material Request for Project</p>
        </div>

        <!-- Greeting -->
        <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 14px; color: #1F2937;">Dear ${editedGreeting},</p>
          <p style="margin: 10px 0 0 0; font-size: 14px; color: #1F2937;">${editedMessage}</p>
        </div>

        <!-- Purchase Order Details -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-weight: bold; color: #1F2937; margin-bottom: 12px; font-size: 16px;">Purchase Order Details</h3>
          <div style="background-color: #EBF5FF; border-left: 4px solid #2563EB; padding: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #4B5563;">PO Number:</span>
              <span style="font-weight: 600; color: #2563EB;">CR-${purchase.cr_id}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #4B5563;">Total Items:</span>
              <span style="font-weight: 600; color: #2563EB;">${purchase.materials_count}</span>
            </div>
          </div>
        </div>

        <!-- Materials Table -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-weight: bold; color: #1F2937; margin-bottom: 12px; font-size: 16px;">Materials Required</h3>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #2563EB;">
            <thead>
              <tr style="background-color: #2563EB; color: white;">
                <th style="padding: 8px; text-align: left; border: 1px solid #2563EB;">S.No</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #2563EB;">Material Name</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #2563EB;">Quantity</th>
                <th style="padding: 8px; text-align: right; border: 1px solid #2563EB;">Unit Price</th>
                <th style="padding: 8px; text-align: right; border: 1px solid #2563EB;">Total Price</th>
              </tr>
            </thead>
            <tbody>
              ${materialsRows}
            </tbody>
            <tfoot>
              <tr style="background-color: #DBEAFE; font-weight: bold;">
                <td colspan="4" style="padding: 8px; text-align: right; border: 1px solid #2563EB;">Total Order Value:</td>
                <td style="padding: 8px; text-align: right; border: 1px solid #2563EB; color: #16A34A; font-size: 16px;">AED ${purchase.total_cost?.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Vendor Contact -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-weight: bold; color: #1F2937; margin-bottom: 12px; font-size: 16px;">Vendor Contact Information</h3>
          <div style="background-color: #F3F4F6; padding: 12px; border-radius: 6px;">
            <div style="margin-bottom: 8px;">
              <span style="font-weight: 600; color: #4B5563;">Company Name:</span>
              <span style="margin-left: 8px; color: #1F2937;">${editedVendorName}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: 600; color: #4B5563;">Email:</span>
              <span style="margin-left: 8px; color: #1F2937;">${editedVendorEmail}</span>
            </div>
            ${editedVendorContact ? `<div style="margin-bottom: 8px;">
              <span style="font-weight: 600; color: #4B5563;">Contact Person:</span>
              <span style="margin-left: 8px; color: #1F2937;">${editedVendorContact}</span>
            </div>` : ''}
            ${editedVendorPhone ? `<div>
              <span style="font-weight: 600; color: #4B5563;">Phone:</span>
              <span style="margin-left: 8px; color: #1F2937;">${editedVendorPhone}</span>
            </div>` : ''}
          </div>
        </div>

        <!-- Buyer Contact -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-weight: bold; color: #1F2937; margin-bottom: 12px; font-size: 16px;">Contact Person</h3>
          <div style="background-color: #F3F4F6; padding: 12px; border-radius: 6px;">
            <div style="margin-bottom: 8px;">
              <span style="font-weight: 600; color: #4B5563;">Procurement Name:</span>
              <span style="margin-left: 8px; color: #1F2937;">${editedBuyerName}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: 600; color: #4B5563;">Email:</span>
              <span style="margin-left: 8px; color: #1F2937;">${editedBuyerEmail}</span>
            </div>
            ${editedBuyerPhone ? `<div>
              <span style="font-weight: 600; color: #4B5563;">Phone:</span>
              <span style="margin-left: 8px; color: #1F2937;">${editedBuyerPhone}</span>
            </div>` : ''}
          </div>
        </div>

        <!-- Important Instructions -->
        <div style="margin-bottom: 20px;">
          <div style="background-color: #2563EB; color: white; padding: 8px 16px; border-radius: 6px 6px 0 0; font-weight: 600;">
            Important Instructions:
          </div>
          <div style="background-color: #FEF3C7; padding: 16px; border-radius: 0 0 6px 6px; border-left: 4px solid #F59E0B;">
            <ul style="margin: 0; padding-left: 20px;">
              ${instructionsList}
            </ul>
          </div>
        </div>

        <!-- Delivery Requirements -->
        <div style="margin-bottom: 20px;">
          <div style="background-color: #2563EB; color: white; padding: 8px 16px; border-radius: 6px 6px 0 0; font-weight: 600;">
            Delivery Requirements:
          </div>
          <div style="background-color: #FEF3C7; padding: 16px; border-radius: 0 0 6px 6px; border-left: 4px solid #F59E0B;">
            <ul style="margin: 0; padding-left: 20px;">
              ${deliveryList}
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding: 20px; color: #6B7280; font-size: 12px; border-top: 1px solid #E5E7EB;">
          <p style="margin: 0;">This is an automated purchase order from MeterSquare Interiors Ltd.</p>
          <p style="margin: 5px 0 0 0;">Please confirm receipt and provide delivery timeline.</p>
        </div>
      </div>
    `;
  };

  const handleClose = () => {
    setStep('input');
    setVendorEmail('');
    setEmailPreview('');
    setEditedEmailContent('');
    setIsEditMode(false);
    setVendorName('');
    setAttachedFiles([]);
    onClose();
  };

  const handleBack = () => {
    setIsEditMode(false);
    setStep('input');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-5 border-b border-blue-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Mail className="w-6 h-6 text-blue-600" />
                      <h2 className="text-2xl font-bold text-gray-900">
                        Send to Vendor
                      </h2>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Purchase Order:</span> CR #{purchase.cr_id} - {purchase.project_name}
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 hover:bg-blue-200 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {/* Step 1: Input Email */}
                {step === 'input' && (
                  <div className="space-y-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-blue-900">
                        <p className="font-medium mb-1">Confirm Vendor Email</p>
                        <p>Please verify the vendor's email address below. The purchase order will be sent to this email.</p>
                      </div>
                    </div>

                    {isLoadingPreview ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                          <p className="text-sm text-gray-600">Loading vendor details...</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {vendorName && (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <div className="text-sm text-gray-600 mb-1">Vendor Name</div>
                            <div className="font-semibold text-gray-900">{vendorName}</div>
                          </div>
                        )}

                        <div>
                          <label htmlFor="vendor-email" className="block text-sm font-medium text-gray-700 mb-2">
                            Vendor Email Address *
                          </label>
                          <Input
                            id="vendor-email"
                            type="text"
                            value={vendorEmail}
                            onChange={(e) => setVendorEmail(e.target.value)}
                            placeholder="vendor@example.com, vendor2@example.com"
                            className="text-base"
                          />
                          <p className="text-xs text-gray-500 mt-2">
                            Separate multiple email addresses with commas
                          </p>
                          {vendorEmail && vendorEmail.includes(',') && (
                            <div className="mt-2 text-xs text-blue-600">
                              {vendorEmail.split(',').map(e => e.trim()).filter(e => e).length} recipient(s)
                            </div>
                          )}
                        </div>

                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                          <div className="text-sm text-purple-900">
                            <p className="font-medium mb-2">Purchase Order Details:</p>
                            <ul className="space-y-1 ml-4 list-disc">
                              <li>Total Items: {purchase.materials_count}</li>
                              <li>Total Value: AED {purchase.total_cost.toLocaleString()}</li>
                              <li>Project: {purchase.project_name}</li>
                            </ul>
                          </div>
                        </div>

                        {/* File Attachments Section */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Paperclip className="w-4 h-4 inline mr-1" />
                            Attachments (Optional)
                          </label>

                          {/* File Upload Button */}
                          <div className="mb-3">
                            <input
                              type="file"
                              id="file-upload"
                              multiple
                              onChange={handleFileSelect}
                              className="hidden"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
                            />
                            <label
                              htmlFor="file-upload"
                              className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer"
                            >
                              <Upload className="w-5 h-5 text-gray-500" />
                              <span className="text-sm text-gray-600 font-medium">
                                Click to upload files or drag and drop
                              </span>
                            </label>
                            <p className="text-xs text-gray-500 mt-2">
                              Supported formats: PDF, Word, Excel, Images, ZIP (Max 200MB per file)
                            </p>
                          </div>

                          {/* Attached Files List */}
                          {attachedFiles.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-600 mb-2">
                                Attached Files ({attachedFiles.length})
                              </div>
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {attachedFiles.map((file, index) => (
                                  <motion.div
                                    key={`${file.name}-${index}`}
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                                  >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <div className="flex-shrink-0 p-2 bg-blue-100 rounded">
                                        <FileIcon className="w-4 h-4 text-blue-600" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-900 truncate">
                                          {file.name}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {formatFileSize(file.size)}
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleRemoveFile(index)}
                                      className="flex-shrink-0 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Remove file"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </motion.div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Step 2: Preview Email */}
                {step === 'preview' && (
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                      <Eye className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-green-900 flex-1">
                        <p className="font-medium mb-1">Email Preview</p>
                        <p>Review the email content below before sending to <span className="font-semibold">{vendorEmail}</span></p>
                      </div>
                      <Button
                        onClick={handleToggleEdit}
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0"
                      >
                        {isEditMode ? (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Save
                          </>
                        ) : (
                          <>
                            <Edit3 className="w-4 h-4 mr-2" />
                            Edit
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Attached Files Preview */}
                    {attachedFiles.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Paperclip className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-blue-900">
                            Attachments ({attachedFiles.length})
                          </span>
                        </div>
                        <div className="space-y-2">
                          {attachedFiles.map((file, index) => (
                            <div
                              key={`${file.name}-${index}`}
                              className="flex items-center gap-3 p-2 bg-white rounded border border-blue-200"
                            >
                              <FileIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-gray-900 truncate">{file.name}</div>
                                <div className="text-xs text-gray-500">{formatFileSize(file.size)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-blue-700 mt-3">
                          These files will be attached to the email.
                        </p>
                      </div>
                    )}

                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                      {isEditMode ? (
                        <div className="bg-white p-6 max-h-[500px] overflow-y-auto">
                          {/* Editable Form View - Same format as preview */}
                          <div className="space-y-6 text-sm">
                            {/* Email Header Section */}
                            <div className="bg-blue-600 text-white p-4 rounded-lg text-center">
                              <h2 className="text-xl font-bold">PURCHASE ORDER</h2>
                              <p className="text-sm mt-1">Material Request for Project</p>
                            </div>

                            {/* Greeting - Editable */}
                            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
                              <label className="block text-xs text-gray-600 mb-2">Greeting (recipient name):</label>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-700">Dear</span>
                                <Input
                                  value={editedGreeting}
                                  onChange={(e) => setEditedGreeting(e.target.value)}
                                  placeholder="Enter recipient name"
                                  className="text-sm flex-1"
                                />
                              </div>

                              <label className="block text-xs text-gray-600 mb-2 mt-4">Message:</label>
                              <textarea
                                value={editedMessage}
                                onChange={(e) => setEditedMessage(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter your message"
                              />
                            </div>

                            {/* Purchase Order Details */}
                            <div className="border-t pt-4">
                              <h3 className="font-bold text-gray-900 mb-3 text-base">Purchase Order Details</h3>
                              <div className="bg-blue-50 border-l-4 border-blue-600 p-3 space-y-2">
                                <div className="flex justify-between">
                                  <span className="text-gray-600">PO Number:</span>
                                  <span className="font-semibold text-blue-600">CR-{purchase.cr_id}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Total Items:</span>
                                  <span className="font-semibold text-blue-600">{purchase.materials_count}</span>
                                </div>
                              </div>
                            </div>

                            {/* Materials Table */}
                            <div className="border-t pt-4">
                              <h3 className="font-bold text-gray-900 mb-3 text-base">Materials Required</h3>
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse border border-blue-200">
                                  <thead>
                                    <tr className="bg-blue-600 text-white">
                                      <th className="p-2 text-left border">S.No</th>
                                      <th className="p-2 text-left border">Material Name</th>
                                      <th className="p-2 text-left border">Quantity</th>
                                      <th className="p-2 text-right border">Unit Price</th>
                                      <th className="p-2 text-right border">Total Price</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {purchase.materials?.map((material: any, idx: number) => (
                                      <tr key={idx} className={idx % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                                        <td className="p-2 border">{idx + 1}</td>
                                        <td className="p-2 border font-medium">{material.material_name}</td>
                                        <td className="p-2 border">{material.quantity} {material.unit}</td>
                                        <td className="p-2 text-right border">AED {material.unit_price?.toFixed(2)}</td>
                                        <td className="p-2 text-right border font-semibold">AED {material.total_price?.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-blue-100 font-bold">
                                      <td colSpan={4} className="p-2 text-right border">Total Order Value:</td>
                                      <td className="p-2 text-right border text-green-600 text-base">
                                        AED {purchase.total_cost?.toFixed(2)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>

                            {/* Vendor Contact - Editable */}
                            <div className="border-t pt-4">
                              <h3 className="font-bold text-gray-900 mb-3 text-base">Vendor Contact Information</h3>
                              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 space-y-3">
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Vendor Company Name:</label>
                                  <Input
                                    value={editedVendorName}
                                    onChange={(e) => setEditedVendorName(e.target.value)}
                                    placeholder="Enter vendor company name"
                                    className="text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Vendor Email Address:</label>
                                  <Input
                                    value={editedVendorEmail}
                                    onChange={(e) => {
                                      setEditedVendorEmail(e.target.value);
                                      setVendorEmail(e.target.value);
                                    }}
                                    placeholder="Enter vendor email"
                                    className="text-sm"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">Separate multiple emails with commas</p>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Contact Person Name:</label>
                                  <Input
                                    value={editedVendorContact}
                                    onChange={(e) => setEditedVendorContact(e.target.value)}
                                    placeholder="Enter contact person name"
                                    className="text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Phone Number:</label>
                                  <Input
                                    value={editedVendorPhone}
                                    onChange={(e) => setEditedVendorPhone(e.target.value)}
                                    placeholder="Enter phone number"
                                    className="text-sm"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Buyer Contact - Read Only */}
                            <div className="border-t pt-4">
                              <h3 className="font-bold text-gray-900 mb-3 text-base">Contact Person</h3>
                              <div className="bg-gray-50 p-3 rounded border border-gray-200 space-y-2">
                                <div className="flex justify-between">
                                  <span className="text-xs text-gray-600">Procurement Name:</span>
                                  <span className="text-sm text-gray-900 font-medium">{editedBuyerName}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-xs text-gray-600">Email:</span>
                                  <span className="text-sm text-gray-900">{editedBuyerEmail}</span>
                                </div>
                                {editedBuyerPhone && (
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-600">Phone:</span>
                                    <span className="text-sm text-gray-900">{editedBuyerPhone}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Important Instructions - Editable */}
                            <div className="border-t pt-4">
                              <div className="bg-blue-600 text-white px-4 py-2 rounded-t font-semibold">
                                Important Instructions:
                              </div>
                              <div className="bg-yellow-50 p-4 rounded-b border-l-4 border-yellow-500">
                                <label className="block text-xs text-gray-600 mb-2">Edit instructions (one per line):</label>
                                <textarea
                                  value={editedInstructions}
                                  onChange={(e) => setEditedInstructions(e.target.value)}
                                  className="w-full p-3 border border-gray-300 rounded text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Enter instructions, one per line"
                                />
                              </div>
                            </div>

                            {/* Delivery Requirements - Editable */}
                            <div className="border-t pt-4">
                              <div className="bg-blue-600 text-white px-4 py-2 rounded-t font-semibold">
                                Delivery Requirements:
                              </div>
                              <div className="bg-yellow-50 p-4 rounded-b border-l-4 border-yellow-500">
                                <label className="block text-xs text-gray-600 mb-2">Edit delivery requirements (one per line):</label>
                                <textarea
                                  value={editedDeliveryReq}
                                  onChange={(e) => setEditedDeliveryReq(e.target.value)}
                                  className="w-full p-3 border border-gray-300 rounded text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Enter delivery requirements, one per line"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="bg-white p-6 max-h-[500px] overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: editedEmailContent || emailPreview }}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Step 3: Success */}
                {step === 'success' && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', duration: 0.5 }}
                      className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6"
                    >
                      <CheckCircle className="w-12 h-12 text-green-600" />
                    </motion.div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Email Sent Successfully!</h3>
                    <p className="text-gray-600 text-center max-w-md">
                      {vendorEmail.includes(',') ? (
                        <>Purchase order has been sent to <span className="font-semibold">{vendorEmail.split(',').length} recipients</span></>
                      ) : (
                        <>Purchase order has been sent to <span className="font-semibold">{vendorEmail}</span></>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-4">
                {step === 'input' && (
                  <>
                    <div className="text-sm text-gray-600">
                      Step 1 of 2: Confirm Email
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={handleClose}
                        variant="outline"
                        className="px-6"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handlePreview}
                        disabled={!vendorEmail || isLoadingPreview}
                        className="px-6 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Preview Email
                      </Button>
                    </div>
                  </>
                )}

                {step === 'preview' && (
                  <>
                    <div className="text-sm text-gray-600">
                      Step 2 of 2: Review & Send
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={handleBack}
                        variant="outline"
                        className="px-6"
                        disabled={isSendingEmail}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleSendEmail}
                        disabled={isSendingEmail}
                        className="px-6 bg-green-600 hover:bg-green-700 text-white"
                      >
                        {isSendingEmail ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {attachedFiles.length > 0 ? 'Uploading & Sending...' : 'Sending...'}
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Send to Vendor
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}

                {step === 'success' && (
                  <div className="w-full flex justify-center">
                    <Button
                      onClick={handleClose}
                      className="px-8 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Done
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default VendorEmailModal;
