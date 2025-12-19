import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify'; // ✅ SECURITY: XSS protection for email HTML rendering
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
  Trash2,
  MessageSquare,
  Phone,
  Plus,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Purchase, buyerService, LPOData } from '../services/buyerService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { FileText, Download } from 'lucide-react';

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
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  // CC Email state - default company emails
  const defaultCcEmails = [
    { email: 'sajisamuel@metersquare.com', name: 'Saji Samuel', checked: true },
    { email: 'info@metersquare.com', name: 'Fasil', checked: true },
    { email: 'admin@metersquare.com', name: 'Admin', checked: true },
    { email: 'amjath@metersquare.com', name: 'Amjath', checked: true },
    { email: 'sujith@metersquare.com', name: 'Suijth', checked: true },
  ];
  const [ccEmails, setCcEmails] = useState(defaultCcEmails);
  const [customCcEmails, setCustomCcEmails] = useState<Array<{ email: string; name: string }>>([]);
  const [newCcEmail, setNewCcEmail] = useState('');
  const [newCcName, setNewCcName] = useState('');

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

  // LPO PDF state - Now mandatory (always enabled)
  const includeLpoPdf = true; // LPO is mandatory
  const [lpoData, setLpoData] = useState<LPOData | null>(null);
  const [isLoadingLpo, setIsLoadingLpo] = useState(false);
  const [showLpoEditor, setShowLpoEditor] = useState(false);

  // Check if vendor is approved (TD approval status)
  const isVendorApproved =
    purchase.vendor_selection_status === 'approved' ||
    (purchase.po_children?.length > 0 &&
      purchase.po_children.some(poChild =>
        poChild?.vendor_selection_status === 'approved' ||
        poChild?.status === 'vendor_approved' ||
        poChild?.status === 'purchase_completed'
      )) ||
    false;

  // Signature selection state (buyer only selects checkbox, admin uploads)
  const [includeSignatures, setIncludeSignatures] = useState(true);

  // Custom terms state
  const [newCustomTerm, setNewCustomTerm] = useState('');
  const [editingTermIndex, setEditingTermIndex] = useState<number | null>(null);
  const [editingTermText, setEditingTermText] = useState('');

  // Sidebar tab state (unused but kept for future use)
  const [activeTab, setActiveTab] = useState<'email' | 'lpo' | 'terms'>('email');

  // Auto-save state
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Default template state
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [hasLoadedDefault, setHasLoadedDefault] = useState(false);

  // Save as default template function
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

  // Auto-save function with debounce
  const autoSaveLpoCustomization = useCallback(async () => {
    if (!lpoData) return; // includeLpoPdf is now always true

    setIsSaving(true);
    try {
      await buyerService.saveLPOCustomization(purchase.cr_id, lpoData, includeSignatures, purchase.po_child_id);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [lpoData, includeSignatures, purchase.cr_id, purchase.po_child_id]);

  // Debounced auto-save effect - triggers 2 seconds after user stops editing
  useEffect(() => {
    if (!lpoData) return; // includeLpoPdf is now always true

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save (2 second debounce)
    saveTimeoutRef.current = setTimeout(() => {
      autoSaveLpoCustomization();
    }, 2000);

    // Cleanup on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [lpoData, autoSaveLpoCustomization]);

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles = Array.from(files);
    const validFiles: File[] = [];

    // Validate file size (max 200MB per file)
    for (const file of newFiles) {
      if (file.size > 200 * 1024 * 1024) {
        showError(`${file.name} is too large. Maximum file size is 200MB.`);
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

  // Load LPO data when modal opens (LPO is now mandatory)
  useEffect(() => {
    if (isOpen && !lpoData) {
      loadLpoData();
    }
  }, [isOpen]);

  // Auto-close LPO editor if vendor becomes approved
  useEffect(() => {
    if (isVendorApproved && showLpoEditor) {
      setShowLpoEditor(false);
    }
  }, [isVendorApproved]); // Only depend on isVendorApproved to avoid infinite loop

  const loadEmailPreview = async () => {
    try {
      setIsLoadingPreview(true);
      // Use POChild API if this is a vendor-split purchase
      const response = purchase.po_child_id
        ? await buyerService.previewPOChildVendorEmail(purchase.po_child_id)
        : await buyerService.previewVendorEmail(purchase.cr_id);
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
      setEditedDeliveryReq(`Materials should be delivered to the project site: ${purchase.location}\nPlease coordinate delivery schedule with the buyer\nProper packaging and labeling is required\nInvoice should reference PO Number: PO-${purchase.cr_id}`);
    } catch (error: any) {
      console.error('Error loading email preview:', error);
      showError(error.message || 'Failed to load email preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handlePreview = () => {
    if (!vendorEmail || !vendorEmail.trim()) {
      showError('Please enter vendor email address');
      return;
    }

    // Parse comma-separated emails and validate each
    const emailList = vendorEmail.split(',').map(email => email.trim()).filter(email => email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const invalidEmails = emailList.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      showError(`Invalid email address: ${invalidEmails[0]}`);
      return;
    }

    if (emailList.length === 0) {
      showError('Please enter at least one valid email address');
      return;
    }

    // Sync editedVendorEmail with user's input to ensure multi-email is used when sending
    setEditedVendorEmail(vendorEmail);
    setEditedEmailContent(emailPreview);
    setStep('preview');
  };

  // Load LPO data when checkbox is enabled
  const loadLpoData = async () => {
    try {
      setIsLoadingLpo(true);
      // Pass po_child_id to get correct materials for POChild records
      const response = await buyerService.previewLPOPdf(purchase.cr_id, purchase.po_child_id);

      // Enrich vendor data with purchase props if backend returns empty values
      // This ensures Attn (contact person), phone, TRN, and email show correctly in PDF
      let enrichedLpoData = {
        ...response.lpo_data,
        vendor: {
          ...response.lpo_data.vendor,
          // Use backend value if available, otherwise fallback to purchase props
          company_name: response.lpo_data.vendor.company_name || purchase.vendor_name || '',
          contact_person: response.lpo_data.vendor.contact_person || purchase.vendor_contact_person || '',
          phone: response.lpo_data.vendor.phone || purchase.vendor_phone || '',
          trn: response.lpo_data.vendor.trn || '', // TRN from backend only
          email: response.lpo_data.vendor.email || purchase.vendor_email || '',
        }
      };

      // Check if this is a new project without customization
      // If custom_terms has saved data, use it; otherwise try to load default template
      const hasSavedCustomTerms = (response.lpo_data.terms?.custom_terms?.length > 0);
      const hasCustomTerms = hasSavedCustomTerms ||
                             (response.lpo_data.terms?.general_terms?.length > 0) ||
                             (response.lpo_data.terms?.payment_terms_list?.length > 0) ||
                             (response.lpo_data.lpo_info?.custom_message);

      if (!hasCustomTerms && !hasLoadedDefault) {
        try {
          const defaultTemplate = await buyerService.getLPODefaultTemplate();
          if (defaultTemplate.template) {
            // Apply default template to the LPO data
            enrichedLpoData = {
              ...enrichedLpoData,
              lpo_info: {
                ...enrichedLpoData.lpo_info,
                quotation_ref: defaultTemplate.template.quotation_ref || enrichedLpoData.lpo_info.quotation_ref,
                custom_message: defaultTemplate.template.custom_message || enrichedLpoData.lpo_info.custom_message,
              },
              vendor: {
                ...enrichedLpoData.vendor,
                subject: defaultTemplate.template.subject || enrichedLpoData.vendor.subject,
              },
              terms: {
                ...enrichedLpoData.terms,
                payment_terms: defaultTemplate.template.payment_terms || enrichedLpoData.terms.payment_terms,
                completion_terms: defaultTemplate.template.completion_terms || enrichedLpoData.terms.completion_terms,
                custom_terms: defaultTemplate.template.custom_terms?.length > 0
                  ? defaultTemplate.template.custom_terms
                  : enrichedLpoData.terms.custom_terms,
                general_terms: defaultTemplate.template.general_terms?.length > 0
                  ? defaultTemplate.template.general_terms
                  : enrichedLpoData.terms.general_terms,
                payment_terms_list: defaultTemplate.template.payment_terms_list?.length > 0
                  ? defaultTemplate.template.payment_terms_list
                  : enrichedLpoData.terms.payment_terms_list,
              }
            };
            setIncludeSignatures(defaultTemplate.template.include_signatures);
            setHasLoadedDefault(true);
            showInfo('Loaded your default template settings');
          }
        } catch (defaultError) {
          console.log('No default template found, using system defaults');
        }
      }

      setLpoData(enrichedLpoData);
    } catch (error: any) {
      console.error('Error loading LPO data:', error);
      showError(error.message || 'Failed to load LPO data');
      // LPO is mandatory, so we don't disable it on error
    } finally {
      setIsLoadingLpo(false);
    }
  };

  // LPO is now mandatory, no toggle function needed

  // Get LPO data with signatures based on checkbox
  const getLpoDataWithSignatures = (): LPOData | null => {
    if (!lpoData) return null;

    // If signatures disabled, clear them from the data
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
    // Include system signature indicator when using signatures
    return {
      ...lpoData,
      signatures: {
        ...lpoData.signatures,
        is_system_signature: true  // Mark as system-generated for PDF
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
      const blob = await buyerService.generateLPOPdf(purchase.cr_id, finalLpoData);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LPO-${purchase.cr_id}.pdf`;
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

  const handleSendEmail = async () => {
    try {
      setIsSendingEmail(true);

      // Upload files first if there are any
      if (attachedFiles.length > 0) {
        showInfo(`Uploading ${attachedFiles.length} file(s)...`);
        try {
          const uploadResult = await buyerService.uploadFiles(purchase.cr_id, attachedFiles);

          if (uploadResult.errors && uploadResult.errors.length > 0) {
            // Some files failed, but continue if at least one succeeded
            const failedCount = uploadResult.errors.length;
            const successCount = uploadResult.uploaded_files.length;

            if (successCount === 0) {
              // All files failed
              showError('All file uploads failed. Please try again.');
              setIsSendingEmail(false);
              return;
            } else {
              // Some succeeded, some failed
              showWarning(`${successCount} file(s) uploaded, ${failedCount} failed`);
            }
          } else {
            // All files uploaded successfully
            showSuccess(`${uploadResult.uploaded_files.length} file(s) uploaded successfully`);
          }
        } catch (uploadError: any) {
          console.error('Error uploading files:', uploadError);
          showError(uploadError.message || 'Failed to upload files');
          setIsSendingEmail(false);
          return;
        }
      }

      // Get the email content - if edited, reconstruct from current fields
      const emailContent = isEditMode ? constructEmailHtml() : (editedEmailContent || emailPreview);

      // Send email with custom body and vendor fields only
      // Use POChild API if this is a vendor-split purchase (has po_child_id)
      const emailData: any = {
        vendor_email: editedVendorEmail || vendorEmail,
        custom_email_body: emailContent,
        vendor_company_name: editedVendorName,
        vendor_contact_person: editedVendorContact,
        vendor_phone: editedVendorPhone
      };

      // Include CC emails (default checked only - custom CC temporarily disabled)
      const allCcEmails = ccEmails.filter(cc => cc.checked).map(cc => ({ email: cc.email, name: cc.name }));
      if (allCcEmails.length > 0) {
        emailData.cc_emails = allCcEmails;
      }

      // Include LPO PDF if enabled (with correct signatures based on mode)
      if (includeLpoPdf && lpoData) {
        const finalLpoData = getLpoDataWithSignatures();
        emailData.include_lpo_pdf = true;
        emailData.lpo_data = finalLpoData;
      }

      if (purchase.po_child_id) {
        await buyerService.sendPOChildVendorEmail(purchase.po_child_id, emailData);
      } else {
        await buyerService.sendVendorEmail(purchase.cr_id, emailData);
      }
      setStep('success');

      const emailCount = (editedVendorEmail || vendorEmail).split(',').map(e => e.trim()).filter(e => e).length;
      const ccCount = allCcEmails.length;
      const message = ccCount > 0
        ? `Email sent to ${emailCount} vendor(s) + ${ccCount} CC recipient(s)!`
        : emailCount > 1
          ? `Purchase order email sent to ${emailCount} recipients successfully!`
          : 'Purchase order email sent to vendor successfully!';
      showSuccess(message);

      setTimeout(() => {
        onEmailSent?.();
        handleClose();
      }, 2000);
    } catch (error: any) {
      console.error('Error sending email:', error);
      showError(error.message || 'Failed to send email to vendor');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendWhatsApp = async () => {
    try {
      // Check if vendor phone is available
      const phoneToSend = editedVendorPhone || purchase.vendor_phone;

      if (!phoneToSend) {
        showError('Vendor phone number is required for WhatsApp');
        return;
      }

      setIsSendingWhatsApp(true);

      // Pass po_child_id if this is a POChild record to get correct materials
      await buyerService.sendVendorWhatsApp(purchase.cr_id, phoneToSend, true, purchase.po_child_id);

      showSuccess('Purchase order sent via WhatsApp successfully!');

      // Close modal and refresh
      setTimeout(() => {
        onEmailSent?.();
        handleClose();
      }, 1500);
    } catch (error: any) {
      console.error('Error sending WhatsApp:', error);
      showError(error.message || 'Failed to send WhatsApp message');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const handleToggleEdit = () => {
    if (isEditMode) {
      // Save changes - construct HTML from edited fields
      const customHtml = constructEmailHtml();
      setEditedEmailContent(customHtml);
      setIsEditMode(false);
      showSuccess('Changes saved');
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
        <td style="padding: 8px; border: 1px solid #2563EB;">${material.brand || '-'}</td>
        <td style="padding: 8px; border: 1px solid #2563EB;">${material.specification || '-'}</td>
        <td style="padding: 8px; border: 1px solid #2563EB;">${material.quantity} ${material.unit}</td>
      </tr>
    `).join('') || '';

    return `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
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
              <span style="font-weight: 600; color: #2563EB;">PO-${purchase.cr_id}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #4B5563;">Vendor:</span>
              <span style="font-weight: 600; color: #2563EB;">${purchase.vendor_name || '-'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #4B5563;">Total Items:</span>
              <span style="font-weight: 600; color: #2563EB;">${purchase.materials_count}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #4B5563;">Total Amount:</span>
              <span style="font-weight: 600; color: #2563EB;">AED ${purchase.total_cost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</span>
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
                <th style="padding: 8px; text-align: left; border: 1px solid #2563EB;">Brand</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #2563EB;">Specs</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #2563EB;">Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${materialsRows}
            </tbody>
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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-y-0 right-0 z-40 bg-gradient-to-br from-gray-50 via-white to-gray-100 md:left-56 left-0 flex flex-col"
        >
          {/* Full Page Header - Like Estimator BOQ */}
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
                    <Mail className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-[#243d8a]">Send to Vendor</h1>
                    <p className="text-sm text-gray-600">
                      Purchase Order: <span className="font-medium">PO #{purchase.cr_id}</span> - {purchase.project_name}
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Full Page Content */}
          <div className="flex-1 max-w-7xl mx-auto px-6 py-6 overflow-y-auto w-full">
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

                        {/* CC Email Section */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <label className="block text-sm font-medium text-gray-700 mb-3">
                            <Mail className="w-4 h-4 inline mr-1" />
                            CC (Copy To)
                          </label>

                          {/* Default CC Emails with checkboxes */}
                          <div className="space-y-2 mb-3">
                            {ccEmails.map((cc, index) => (
                              <div key={cc.email} className="flex items-center gap-3 p-2 bg-white rounded border border-gray-200">
                                <input
                                  type="checkbox"
                                  id={`cc-${index}`}
                                  checked={cc.checked}
                                  onChange={(e) => {
                                    const updated = [...ccEmails];
                                    updated[index].checked = e.target.checked;
                                    setCcEmails(updated);
                                  }}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <label htmlFor={`cc-${index}`} className="flex-1 text-sm">
                                  <span className="font-medium text-gray-900">{cc.name}</span>
                                  <span className="text-gray-500 ml-2">&lt;{cc.email}&gt;</span>
                                </label>
                              </div>
                            ))}
                          </div>

                          {/* Custom CC Emails - TEMPORARILY HIDDEN
                          {customCcEmails.length > 0 && (
                            <div className="space-y-2 mb-3 border-t border-gray-200 pt-3">
                              <div className="text-xs text-gray-500 font-medium">Custom CC Recipients:</div>
                              {customCcEmails.map((cc, index) => (
                                <div key={index} className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-200">
                                  <div className="flex-1 text-sm">
                                    <span className="font-medium text-gray-900">{cc.name || 'No name'}</span>
                                    <span className="text-gray-500 ml-2">&lt;{cc.email}&gt;</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCustomCcEmails(customCcEmails.filter((_, i) => i !== index));
                                    }}
                                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          */}

                          {/* Add Custom CC - TEMPORARILY HIDDEN
                          <div className="border-t border-gray-200 pt-3">
                            <div className="text-xs text-gray-500 font-medium mb-2">Add Custom CC:</div>
                            <div className="flex gap-2">
                              <Input
                                value={newCcName}
                                onChange={(e) => setNewCcName(e.target.value)}
                                placeholder="Name"
                                className="text-sm w-1/3"
                              />
                              <Input
                                value={newCcEmail}
                                onChange={(e) => setNewCcEmail(e.target.value)}
                                placeholder="email@example.com"
                                className="text-sm flex-1"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (newCcEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCcEmail.trim())) {
                                      setCustomCcEmails([...customCcEmails, { email: newCcEmail.trim(), name: newCcName.trim() }]);
                                      setNewCcEmail('');
                                      setNewCcName('');
                                    }
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (newCcEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCcEmail.trim())) {
                                    setCustomCcEmails([...customCcEmails, { email: newCcEmail.trim(), name: newCcName.trim() }]);
                                    setNewCcEmail('');
                                    setNewCcName('');
                                  } else {
                                    showError('Please enter a valid email address');
                                  }
                                }}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          */}

                          {/* CC Summary */}
                          {ccEmails.filter(cc => cc.checked).length > 0 && (
                            <div className="mt-3 text-xs text-green-600">
                              {ccEmails.filter(cc => cc.checked).length} CC recipient(s) will receive a copy
                            </div>
                          )}
                        </div>

                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                          <div className="text-sm text-purple-900">
                            <p className="font-medium mb-2">Purchase Order Details:</p>
                            <ul className="space-y-1 ml-4 list-disc">
                              <li>Total Items: {purchase.materials_count}</li>
                              <li>Project: {purchase.project_name}</li>
                              <li>Total Amount: <span className="font-semibold">AED {purchase.total_cost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</span></li>
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

                          {/* LPO PDF Option - Now Mandatory */}
                          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-blue-600" />
                                <div>
                                  <span className="text-sm font-medium text-gray-900">LPO PDF (Mandatory)</span>
                                  <p className="text-xs text-gray-500">Local Purchase Order PDF will be automatically generated and attached</p>
                                  {isVendorApproved && (
                                    <p className="text-xs text-amber-600 mt-1 font-medium">⚠ Cannot edit - Vendor has been approved</p>
                                  )}
                                </div>
                              </div>
                              {lpoData && (
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowLpoEditor(!showLpoEditor)}
                                    className="text-xs"
                                    disabled={isVendorApproved}
                                    title={isVendorApproved ? "Cannot edit - Vendor has been approved" : "Edit LPO details"}
                                  >
                                    <Edit3 className="w-3 h-3 mr-1" />
                                    {showLpoEditor ? 'Hide' : 'Edit'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDownloadLpoPdf}
                                    className="text-xs"
                                  >
                                    <Download className="w-3 h-3 mr-1" />
                                    Preview
                                  </Button>
                                </div>
                              )}
                            </div>
                            {isLoadingLpo && (
                              <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading LPO data...
                              </div>
                            )}
                            {lpoData && showLpoEditor && (
                              <div className="mt-4 space-y-4 border-t border-blue-200 pt-4">
                                <div className="flex items-center justify-between">
                                  <div className="text-sm font-medium text-gray-700">Edit LPO Details</div>
                                  {/* Auto-save status indicator and Save as Default button */}
                                  <div className="flex items-center gap-3">
                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                      {isSaving ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          <span>Saving...</span>
                                        </>
                                      ) : lastSaved ? (
                                        <>
                                          <CheckCircle className="w-3 h-3 text-green-500" />
                                          <span>Saved</span>
                                        </>
                                      ) : null}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={handleSaveAsDefault}
                                      disabled={isSavingDefault}
                                      className="text-xs bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-700"
                                      title="Save current settings as default for all new projects"
                                    >
                                      {isSavingDefault ? (
                                        <>
                                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                          Saving...
                                        </>
                                      ) : (
                                        <>
                                          <Save className="w-3 h-3 mr-1" />
                                          Save as Default
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>

                                {/* Quotation Ref and Subject */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-xs font-medium text-gray-600">Quotation Ref#</label>
                                    <Input
                                      value={lpoData.lpo_info.quotation_ref}
                                      onChange={(e) => setLpoData({
                                        ...lpoData,
                                        lpo_info: { ...lpoData.lpo_info, quotation_ref: e.target.value }
                                      })}
                                      className="mt-1 text-sm"
                                      placeholder="Vendor quotation reference"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-gray-600">Subject</label>
                                    <Input
                                      value={lpoData.vendor.subject}
                                      onChange={(e) => setLpoData({
                                        ...lpoData,
                                        vendor: { ...lpoData.vendor, subject: e.target.value }
                                      })}
                                      className="mt-1 text-sm"
                                      placeholder="LPO subject"
                                    />
                                  </div>
                                </div>

                                {/* Custom Message for PDF */}
                                <div>
                                  <label className="text-xs font-medium text-gray-600">LPO Message (shown in PDF)</label>
                                  <textarea
                                    value={lpoData.lpo_info.custom_message || ''}
                                    onChange={(e) => setLpoData({
                                      ...lpoData,
                                      lpo_info: { ...lpoData.lpo_info, custom_message: e.target.value }
                                    })}
                                    className="mt-1 w-full p-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                                  />
                                  <p className="text-xs text-gray-400 mt-1">Edit the message that appears in the LPO PDF</p>
                                </div>

                                {/* Terms Section - AT BOTTOM */}
                                <div className="border-t border-blue-200 pt-4">
                                  <div className="text-sm font-medium text-gray-700 mb-3">Terms & Conditions</div>

                                  {/* Delivery Terms */}
                                  <div className="mb-4">
                                    <label className="text-xs font-medium text-gray-600">Delivery Terms</label>
                                    <Input
                                      value={lpoData.terms.completion_terms || lpoData.terms.delivery_terms || ''}
                                      onChange={(e) => setLpoData({
                                        ...lpoData,
                                        terms: { ...lpoData.terms, completion_terms: e.target.value, delivery_terms: e.target.value }
                                      })}
                                      className="mt-1 text-sm"
                                      placeholder="e.g., 04.12.25"
                                    />
                                  </div>

                                  {/* Payment Terms with Checkboxes */}
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <div className="text-xs font-medium text-gray-600 mb-2">Payment Terms (select to include in PDF)</div>

                                    {/* Payment terms list with checkboxes */}
                                    <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                                      {(lpoData.terms.custom_terms || []).map((term: {text: string, selected: boolean}, index: number) => (
                                        <div key={index} className="flex items-center gap-2 bg-white p-2 rounded border border-gray-200">
                                          <input
                                            type="checkbox"
                                            checked={term.selected}
                                            onChange={async (e) => {
                                              const updatedTerms = [...(lpoData.terms.custom_terms || [])];
                                              updatedTerms[index] = { ...term, selected: e.target.checked };
                                              const newLpoData = {
                                                ...lpoData,
                                                terms: { ...lpoData.terms, custom_terms: updatedTerms }
                                              };
                                              setLpoData(newLpoData);
                                              // Auto-save after toggling checkbox
                                              try {
                                                await buyerService.saveLPOCustomization(purchase.cr_id, newLpoData, includeSignatures, purchase.po_child_id);
                                                setLastSaved(new Date());
                                              } catch (error) {
                                                console.error('Failed to save after toggle:', error);
                                              }
                                            }}
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                          />
                                          {editingTermIndex === index ? (
                                            <div className="flex-1 flex gap-2">
                                              <Input
                                                value={editingTermText}
                                                onChange={(e) => setEditingTermText(e.target.value)}
                                                className="flex-1 text-xs"
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
                                                onClick={async () => {
                                                  if (editingTermText.trim()) {
                                                    const updatedTerms = [...(lpoData.terms.custom_terms || [])];
                                                    updatedTerms[index] = { ...term, text: editingTermText.trim() };
                                                    const newLpoData = {
                                                      ...lpoData,
                                                      terms: { ...lpoData.terms, custom_terms: updatedTerms }
                                                    };
                                                    setLpoData(newLpoData);
                                                    // Immediate save after editing term
                                                    try {
                                                      await buyerService.saveLPOCustomization(purchase.cr_id, newLpoData, includeSignatures, purchase.po_child_id);
                                                      setLastSaved(new Date());
                                                    } catch (error) {
                                                      console.error('Failed to save after edit:', error);
                                                    }
                                                  }
                                                  setEditingTermIndex(null);
                                                  setEditingTermText('');
                                                }}
                                              >
                                                <Save className="w-3 h-3" />
                                              </Button>
                                            </div>
                                          ) : (
                                            <>
                                              <span className="flex-1 text-xs text-gray-700">{term.text}</span>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditingTermIndex(index);
                                                  setEditingTermText(term.text);
                                                }}
                                                className="text-blue-500 hover:text-blue-700 p-1"
                                                title="Edit term"
                                              >
                                                <Edit3 className="w-3 h-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  const updatedTerms = (lpoData.terms.custom_terms || []).filter((_: any, i: number) => i !== index);
                                                  const newLpoData = {
                                                    ...lpoData,
                                                    terms: { ...lpoData.terms, custom_terms: updatedTerms }
                                                  };
                                                  setLpoData(newLpoData);
                                                  // Immediate save after deleting term
                                                  try {
                                                    await buyerService.saveLPOCustomization(purchase.cr_id, newLpoData, includeSignatures, purchase.po_child_id);
                                                    setLastSaved(new Date());
                                                  } catch (error) {
                                                    console.error('Failed to save after delete:', error);
                                                  }
                                                }}
                                                className="text-red-500 hover:text-red-700 p-1"
                                                title="Delete term"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      ))}
                                      {(!lpoData.terms.custom_terms || lpoData.terms.custom_terms.length === 0) && (
                                        <div className="text-xs text-gray-400 italic py-2">No payment terms added yet. Add your first term below.</div>
                                      )}
                                    </div>

                                    {/* Add new payment term */}
                                    <div className="flex gap-2">
                                      <Input
                                        value={newCustomTerm}
                                        onChange={(e) => setNewCustomTerm(e.target.value)}
                                        placeholder="e.g., 50% Advance, 100% CDC after delivery..."
                                        className="flex-1 text-sm"
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (newCustomTerm.trim()) {
                                              const currentTerms = lpoData.terms.custom_terms || [];
                                              const newLpoData = {
                                                ...lpoData,
                                                terms: {
                                                  ...lpoData.terms,
                                                  custom_terms: [...currentTerms, { text: newCustomTerm.trim(), selected: true }]
                                                }
                                              };
                                              setLpoData(newLpoData);
                                              setNewCustomTerm('');
                                              // Immediate save after adding term
                                              try {
                                                await buyerService.saveLPOCustomization(purchase.cr_id, newLpoData, includeSignatures, purchase.po_child_id);
                                                setLastSaved(new Date());
                                              } catch (error) {
                                                console.error('Failed to save term:', error);
                                              }
                                            }
                                          }
                                        }}
                                      />
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          if (newCustomTerm.trim()) {
                                            const currentTerms = lpoData.terms.custom_terms || [];
                                            const newLpoData = {
                                              ...lpoData,
                                              terms: {
                                                ...lpoData.terms,
                                                custom_terms: [...currentTerms, { text: newCustomTerm.trim(), selected: true }]
                                              }
                                            };
                                            setLpoData(newLpoData);
                                            setNewCustomTerm('');
                                            // Immediate save after adding term
                                            try {
                                              await buyerService.saveLPOCustomization(purchase.cr_id, newLpoData, includeSignatures, purchase.po_child_id);
                                              setLastSaved(new Date());
                                            } catch (error) {
                                              console.error('Failed to save term:', error);
                                            }
                                          }
                                        }}
                                      >
                                        <Plus className="w-3 h-3 mr-1" /> Add
                                      </Button>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">
                                      {isSaving ? 'Saving...' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : 'Payment terms are saved and available for future projects'}
                                    </p>
                                  </div>
                                </div>

                                {/* Signature Selection - Simple Checkbox */}
                                <div className="border-t border-blue-200 pt-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <input
                                        type="checkbox"
                                        id="include-signatures"
                                        checked={includeSignatures}
                                        onChange={(e) => setIncludeSignatures(e.target.checked)}
                                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                      />
                                      <label htmlFor="include-signatures" className="text-sm font-medium text-gray-700">
                                        Include Signatures in LPO PDF
                                      </label>
                                    </div>
                                  </div>

                                  {/* Signature Preview */}
                                  {includeSignatures && (
                                    <div className="mt-3 bg-gray-50 p-3 rounded border border-gray-200">
                                      <div className="text-xs text-gray-500 mb-2">Signatures from Admin Settings:</div>
                                      <div className="grid grid-cols-3 gap-4">
                                        <div className="text-center">
                                          <div className="text-xs text-gray-500 mb-1">MD Signature</div>
                                          {lpoData.signatures.md_signature ? (
                                            <img src={lpoData.signatures.md_signature} alt="MD" className="h-10 mx-auto object-contain" />
                                          ) : (
                                            <div className="text-xs text-orange-500">Not uploaded</div>
                                          )}
                                          <div className="text-xs font-medium mt-1">{lpoData.signatures.md_name}</div>
                                        </div>
                                        <div className="text-center">
                                          <div className="text-xs text-gray-500 mb-1">Stamp</div>
                                          {lpoData.signatures.stamp_image ? (
                                            <img src={lpoData.signatures.stamp_image} alt="Stamp" className="h-10 mx-auto object-contain" />
                                          ) : (
                                            <div className="text-xs text-orange-500">Not uploaded</div>
                                          )}
                                        </div>
                                        <div className="text-center">
                                          <div className="text-xs text-gray-500 mb-1">TD Signature</div>
                                          {lpoData.signatures.td_signature ? (
                                            <img src={lpoData.signatures.td_signature} alt="TD" className="h-10 mx-auto object-contain" />
                                          ) : (
                                            <div className="text-xs text-orange-500">Not uploaded</div>
                                          )}
                                          <div className="text-xs font-medium mt-1">{lpoData.signatures.td_name}</div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Summary */}
                                <div className="bg-white p-3 rounded border border-gray-200">
                                  <div className="text-xs font-medium text-gray-600 mb-2">LPO Summary</div>
                                  <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div>
                                      <span className="text-gray-500">Subtotal:</span>
                                      <span className="ml-2 font-medium">AED {lpoData.totals.subtotal.toLocaleString()}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">VAT ({lpoData.totals.vat_percent}%):</span>
                                      <span className="ml-2 font-medium">AED {lpoData.totals.vat_amount.toLocaleString()}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Total:</span>
                                      <span className="ml-2 font-bold text-blue-600">AED {lpoData.totals.grand_total.toLocaleString()}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Step 2: Preview Email */}
                {step === 'preview' && (
                  <div className="flex flex-col h-full space-y-3">
                    <div className="flex items-center justify-between flex-shrink-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Eye className="w-4 h-4 text-green-600" />
                          <span>Review the email content below before sending to <span className="font-semibold text-gray-900">{vendorEmail}</span></span>
                        </div>
                        {/* Show CC recipients */}
                        {ccEmails.filter(cc => cc.checked).length > 0 && (
                          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1 ml-6">
                            <span className="text-xs font-medium text-purple-600">CC:</span>
                            <span className="text-xs">
                              {ccEmails.filter(cc => cc.checked).map(cc => cc.email).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={handleToggleEdit}
                        variant="outline"
                        size="sm"
                      >
                        {isEditMode ? (
                          <>
                            <Save className="w-4 h-4 mr-1" />
                            Save
                          </>
                        ) : (
                          <>
                            <Edit3 className="w-4 h-4 mr-1" />
                            Edit
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Attached Files Preview */}
                    {attachedFiles.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex-shrink-0">
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

                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      {isEditMode ? (
                        <div className="bg-white p-4 flex-1 overflow-y-auto border border-gray-200 rounded-lg">
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
                                  <span className="font-semibold text-blue-600">PO-{purchase.cr_id}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Vendor:</span>
                                  <span className="font-semibold text-blue-600">{purchase.vendor_name || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Total Items:</span>
                                  <span className="font-semibold text-blue-600">{purchase.materials_count}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Total Amount:</span>
                                  <span className="font-semibold text-blue-600">AED {purchase.total_cost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</span>
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
                                      <th className="p-2 text-left border">Brand</th>
                                      <th className="p-2 text-left border">Specs</th>
                                      <th className="p-2 text-left border">Quantity</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {purchase.materials?.map((material: any, idx: number) => (
                                      <tr key={idx} className={idx % 2 === 0 ? 'bg-blue-50' : 'bg-white'}>
                                        <td className="p-2 border">{idx + 1}</td>
                                        <td className="p-2 border font-medium">{material.material_name}</td>
                                        <td className="p-2 border">{material.brand || '-'}</td>
                                        <td className="p-2 border">{material.specification || '-'}</td>
                                        <td className="p-2 border">{material.quantity} {material.unit}</td>
                                      </tr>
                                    ))}
                                  </tbody>
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
                          className="flex-1 overflow-y-auto"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(
                              (editedEmailContent || emailPreview)
                                .replace(/max-width:\s*800px/gi, 'max-width: 100%')
                                .replace(/margin:\s*0\s+auto/gi, 'margin: 0')
                            )
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Step 3: Success */}
                {step === 'success' && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', duration: 0.5 }}
                      className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6"
                    >
                      <CheckCircle className="w-14 h-14 text-green-600" />
                    </motion.div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-3">Email Sent Successfully!</h3>
                    <p className="text-gray-600 text-center max-w-md text-lg">
                      {vendorEmail.includes(',') ? (
                        <>Purchase order has been sent to <span className="font-semibold">{vendorEmail.split(',').length} recipients</span></>
                      ) : (
                        <>Purchase order has been sent to <span className="font-semibold">{vendorEmail}</span></>
                      )}
                    </p>
                    <Button
                      onClick={handleClose}
                      className="mt-8 px-8 py-3 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Done
                    </Button>
                  </div>
                )}
          </div>

          {/* Footer with Action Buttons */}
          {step !== 'success' && (
            <div className="bg-white border-t border-gray-200 px-6 py-4">
              <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {step === 'input' ? 'Step 1 of 2: Configure Email' : 'Step 2 of 2: Review & Send'}
                </div>
                <div className="flex items-center gap-3">
                  {step === 'input' && (
                    <>
                      <Button
                        onClick={handleClose}
                        variant="outline"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handlePreview}
                        disabled={!vendorEmail || isLoadingPreview}
                        className="bg-[#243d8a] hover:bg-[#1e3270] text-white"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Preview Email
                      </Button>
                    </>
                  )}
                  {step === 'preview' && (
                    <>
                      <Button
                        onClick={handleBack}
                        variant="outline"
                        disabled={isSendingEmail}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleSendEmail}
                        disabled={isSendingEmail}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {isSendingEmail ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Send Email
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (947 lines - CRITICAL)
export default React.memo(VendorEmailModal);
