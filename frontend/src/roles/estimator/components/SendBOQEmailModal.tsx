import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Mail, User, MessageSquare, AlertCircle, CheckCircle, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { estimatorService } from '../services/estimatorService';
import { exportBOQToExcelClient, exportBOQToPDFClient } from '@/utils/boqExportUtils';

interface SendBOQEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  boqId: number;
  boqName: string;
  projectName: string;
  onEmailSent: () => void;
  mode?: 'td' | 'client'; // 'td' = send to TD, 'client' = send to client
}

const SendBOQEmailModal: React.FC<SendBOQEmailModalProps> = ({
  isOpen,
  onClose,
  boqId,
  boqName,
  projectName,
  onEmailSent,
  mode = 'td' // Default to TD mode for backward compatibility
}) => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [comments, setComments] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [boqData, setBoqData] = useState<any>(null);
  const [loadingBOQ, setLoadingBOQ] = useState(false);

  const isClientMode = mode === 'client';

  // Fetch BOQ data when modal opens in client mode
  React.useEffect(() => {
    const fetchBOQData = async () => {
      if (isClientMode && isOpen && boqId) {
        setLoadingBOQ(true);
        try {
          const response = await estimatorService.getBOQById(boqId);
          if (response.success && response.data) {
            const boq = response.data;

            // Transform BOQ data using the EXACT same logic as TD page (which works correctly)
            const items = (boq.existing_purchase?.items || boq.items) || [];

            const transformedData = {
              id: boq.boq_id,
              projectName: boq.project_name || boq.project_details?.project_name || boq.project?.project_name || projectName,
              clientName: boq.client_name || boq.client || boq.project_details?.client || boq.project?.client || 'Unknown Client',
              estimator: boq.created_by || boq.created_by_name || 'Unknown',
              totalValue: boq.total_cost || 0,
              itemCount: boq.items_count || items.length || 0,
              laborCost: boq.total_labour_cost || 0,
              materialCost: boq.total_material_cost || 0,
              profitMargin: boq.profit_margin || boq.profit_margin_percentage || 0,
              overheadPercentage: boq.overhead_percentage || boq.overhead || 0,
              submittedDate: boq.created_at ? new Date(boq.created_at).toISOString().split('T')[0] : '',
              location: boq.location || boq.project_details?.location || boq.project?.location || 'N/A',
              floor: boq.floor || boq.floor_name || boq.project_details?.floor || boq.project?.floor_name || 'N/A',
              workingHours: boq.hours || boq.working_hours || boq.project_details?.hours || boq.project?.working_hours || 'N/A',
              boqItems: items.map((item: any) => {
                const totalQuantity = item.materials?.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0) || 1;
                const sellingPrice = item.selling_price || 0;

                return {
                  id: item.item_id,
                  description: item.item_name,
                  briefDescription: item.description || '',
                  unit: item.materials?.[0]?.unit || 'nos',
                  quantity: totalQuantity,
                  rate: totalQuantity > 0 ? sellingPrice / totalQuantity : sellingPrice,
                  amount: sellingPrice,
                  materials: item.materials?.map((mat: any) => ({
                    name: mat.material_name,
                    quantity: mat.quantity,
                    unit: mat.unit,
                    rate: mat.unit_price || mat.rate_per_unit,
                    amount: mat.total_price
                  })) || [],
                  labour: item.labour?.map((lab: any) => ({
                    type: lab.labour_role,
                    quantity: lab.hours || lab.no_of_hours,
                    unit: 'hrs',
                    rate: lab.rate_per_hour,
                    amount: lab.total_cost
                  })) || [],
                  laborCost: item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
                  estimatedSellingPrice: sellingPrice
                };
              })
            };

            setBoqData(transformedData);
          }
        } catch (error) {
          console.error('Error fetching BOQ data:', error);
        } finally {
          setLoadingBOQ(false);
        }
      }
    };

    fetchBOQData();
  }, [isClientMode, isOpen, boqId, projectName, boqName]);

  const handleSendEmail = async () => {
    setIsSending(true);

    try {
      let response;

      if (isClientMode) {
        // Send to client
        response = await estimatorService.sendBOQToClient(boqId, {
          client_email: recipientEmail.trim() || undefined,
          message: comments.trim() || undefined,
          formats: ['excel', 'pdf']
        });
      } else {
        // Send to TD
        const params: { td_email?: string; full_name?: string; comments?: string } = {};
        if (recipientEmail && recipientEmail.trim()) params.td_email = recipientEmail.trim();
        if (recipientName && recipientName.trim()) params.full_name = recipientName.trim();
        if (comments && comments.trim()) params.comments = comments.trim();

        response = await estimatorService.sendBOQEmail(
          boqId,
          Object.keys(params).length > 0 ? params : undefined
        );
      }

      if (response.success) {
        setEmailSent(true);
        toast.success(response.message);

        // Wait 2 seconds to show success message before closing
        setTimeout(() => {
          onEmailSent();
          handleClose();
        }, 2000);
      } else {
        toast.error(response.message);
      }
    } catch (error: any) {
      console.error('Error sending BOQ email:', error);
      toast.error('Failed to send email. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setRecipientEmail('');
    setRecipientName('');
    setComments('');
    setEmailSent(false);
    onClose();
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const canSend = isClientMode
    ? (recipientEmail && isValidEmail(recipientEmail)) // Client mode: email required and must be valid
    : (!recipientEmail || isValidEmail(recipientEmail)); // TD mode: email optional but must be valid if provided

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50"
              onClick={handleClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-xl shadow-xl max-w-lg w-full"
            >
              {emailSent ? (
                // Success State
                <div className="p-8">
                  <div className="flex flex-col items-center text-center">
                    <div className="p-4 bg-green-100 rounded-full mb-4">
                      <CheckCircle className="w-12 h-12 text-green-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Email Sent!</h3>
                    <p className="text-gray-600 mb-6">
                      {isClientMode
                        ? 'BOQ has been successfully sent to the client.'
                        : 'BOQ review email has been successfully sent to the Technical Director.'
                      }
                    </p>
                    <div className="w-full bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                      <p className="text-sm text-green-800">
                        <strong>{boqName}</strong> for project <strong>{projectName}</strong> {isClientMode ? 'sent to client' : 'is now pending TD review'}.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b border-blue-100 px-6 py-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-sm border border-blue-200">
                          <Mail className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-[#243d8a]">
                            {isClientMode ? 'Send BOQ to Client' : 'Send BOQ to Technical Director'}
                          </h2>
                          <p className="text-sm text-gray-600">
                            {isClientMode ? 'Send BOQ for client review' : 'Send BOQ for review and approval'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleClose}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        disabled={isSending}
                        title="Close"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6 space-y-6">
                    {/* BOQ Info */}
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100/30 rounded-lg p-4 border border-blue-200">
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-semibold text-blue-900">BOQ:</span>
                          <span className="text-sm text-gray-700">{boqName}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-semibold text-blue-900">Project:</span>
                          <span className="text-sm text-gray-700">{projectName}</span>
                        </div>
                      </div>
                    </div>

                    {!isClientMode && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          Leave email fields blank to automatically send to the default Technical Director in the system.
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Recipient Email */}
                    <div className="space-y-2">
                      <Label htmlFor="recipient_email" className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-500" />
                        {isClientMode ? 'Client Email *' : 'Technical Director Email (Optional)'}
                      </Label>
                      <Input
                        id="recipient_email"
                        type="email"
                        placeholder={isClientMode ? 'Enter client email address' : 'Enter TD email or leave blank for default'}
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        disabled={isSending}
                        required={isClientMode}
                        className={`${recipientEmail && !isValidEmail(recipientEmail) ? 'border-red-300 focus:border-red-500' : ''}`}
                      />
                      {recipientEmail && !isValidEmail(recipientEmail) && (
                        <p className="text-sm text-red-600">Please enter a valid email address</p>
                      )}
                      {isClientMode && !recipientEmail && (
                        <p className="text-sm text-gray-500">Client email is required to send BOQ</p>
                      )}
                    </div>

                    {!isClientMode && (
                      /* TD Name (Optional) - Only for TD mode */
                      <div className="space-y-2">
                        <Label htmlFor="recipient_name" className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-500" />
                          Technical Director Name (Optional)
                        </Label>
                        <Input
                          id="recipient_name"
                          type="text"
                          placeholder="Enter TD name"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          disabled={isSending}
                        />
                      </div>
                    )}

                    {/* Comments */}
                    <div className="space-y-2">
                      <Label htmlFor="comments" className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-500" />
                        {isClientMode ? 'Message (Optional)' : 'Comments / Notes (Optional)'}
                      </Label>
                      <Textarea
                        id="comments"
                        placeholder={isClientMode ? 'Add a message for the client...' : 'Add any comments or notes for the Technical Director...'}
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        disabled={isSending}
                        rows={4}
                        className="resize-none"
                      />
                    </div>

                    {/* Preview BOQ - Only for Client Mode */}
                    {isClientMode && (
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-center gap-2 mb-3">
                          <Download className="w-5 h-5 text-blue-600" />
                          <h3 className="font-semibold text-gray-900">Preview Client BOQ</h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          Download and review the BOQ before sending to client
                        </p>
                        {loadingBOQ ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <button
                              onClick={async () => {
                                if (!boqData) {
                                  toast.error('BOQ data not loaded');
                                  return;
                                }
                                try {
                                  toast.loading('Generating Excel file...');
                                  await exportBOQToExcelClient(boqData);
                                  toast.dismiss();
                                  toast.success('Excel file downloaded successfully');
                                } catch (error) {
                                  toast.dismiss();
                                  toast.error('Failed to download Excel file');
                                  console.error('Excel download error:', error);
                                }
                              }}
                              disabled={isSending || loadingBOQ || !boqData}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                              Download Excel
                            </button>
                            <button
                              onClick={async () => {
                                if (!boqData) {
                                  toast.error('BOQ data not loaded');
                                  return;
                                }
                                try {
                                  toast.loading('Generating PDF file...');
                                  await exportBOQToPDFClient(boqData);
                                  toast.dismiss();
                                  toast.success('PDF file downloaded successfully');
                                } catch (error) {
                                  toast.dismiss();
                                  toast.error('Failed to download PDF file');
                                  console.error('PDF download error:', error);
                                }
                              }}
                              disabled={isSending || loadingBOQ || !boqData}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                            >
                              <FileText className="w-4 h-4" />
                              Download PDF
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={handleClose}
                        disabled={isSending}
                      >
                        Cancel
                      </Button>
                      <button
                        onClick={handleSendEmail}
                        disabled={isSending || !canSend}
                        className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-all font-semibold flex items-center gap-2 shadow-md"
                      >
                        {isSending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            {isClientMode ? 'Send to Client' : 'Send to Technical Director'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SendBOQEmailModal;
