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
  Save
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
      const emailContent = isEditMode ? editedEmailContent : emailPreview;
      await buyerService.sendVendorEmail(purchase.cr_id, {
        vendor_email: vendorEmail,
        custom_email_body: emailContent
      });
      setStep('success');

      const emailCount = vendorEmail.split(',').map(e => e.trim()).filter(e => e).length;
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
      // Save changes
      setIsEditMode(false);
      toast.success('Changes saved');
    } else {
      // Enter edit mode
      setIsEditMode(true);
    }
  };

  const handleClose = () => {
    setStep('input');
    setVendorEmail('');
    setEmailPreview('');
    setEditedEmailContent('');
    setIsEditMode(false);
    setVendorName('');
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

                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                      {isEditMode ? (
                        <textarea
                          value={editedEmailContent}
                          onChange={(e) => setEditedEmailContent(e.target.value)}
                          className="w-full h-[500px] p-6 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Edit email content..."
                        />
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
                            Sending...
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
