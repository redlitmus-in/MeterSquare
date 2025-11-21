import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Mail, User, MessageSquare, AlertCircle, CheckCircle, Download, FileText, FileSpreadsheet, Edit3, Eye, EyeOff, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { estimatorService } from '../services/estimatorService';
import { downloadClientBOQPDF, previewClientBOQPDF } from '@/services/boqPdfService';
import { downloadClientBOQExcel } from '@/services/boqExcelService';

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
  const [sentToCount, setSentToCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [boqData, setBoqData] = useState<any>(null);
  const [loadingBOQ, setLoadingBOQ] = useState(false);
  // Format selection state - default both formats selected
  const [sendPDF, setSendPDF] = useState(true);
  const [sendExcel, setSendExcel] = useState(true);
  // Email template editing state
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState('');
  // Preview state
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [previewPDFUrl, setPreviewPDFUrl] = useState<string | null>(null);

  // Cover page state
  const [showCoverPageEditor, setShowCoverPageEditor] = useState(false);
  const [coverPageData, setCoverPageData] = useState({
    reference_number: '',
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    recipient_name: 'The Tenders and Contracts Department',
    client_company: '',
    city: 'Dubai',
    country: 'United Arab Emirates',
    subject: '',
    tender_reference: '',
    body_text: '',
    enclosed_documents: ['Bill of Quantities derived for the works', 'Summary'],
    contact_person: 'Mr. Hamid Hussain',
    contact_title: 'Manager- Sales & Projects',
    contact_phone: '055 354 7727',
    contact_email: 'sales@metersquare.com',
    signatory_name: 'Amjath K Aboobacker',
    signatory_title: 'Managing Director'
  });

  const isClientMode = mode === 'client';

  // Default email template
  const getDefaultTemplate = () => {
    return `Dear Valued Client,

Please review the attached BOQ for your project.

Project Name: ${projectName}

Attached Documents:
Please review the attached Excel document for complete project details.

Next Steps:
• Review the attached BOQ documents carefully
• Verify all items and quantities match your requirements
• Contact us if you have any questions or need clarifications
• Provide your approval to proceed with the project

Best Regards,
Technical Director
MeterSquare Interiors LLC`;
  };

  // Initialize email template when modal opens
  React.useEffect(() => {
    if (isOpen && isClientMode && !emailTemplate) {
      setEmailTemplate(getDefaultTemplate());
    }
  }, [isOpen, isClientMode]);

  // Initialize cover page data when BOQ data is loaded
  React.useEffect(() => {
    if (isOpen && isClientMode && boqData) {
      const today = new Date();
      const formattedDate = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const year = today.getFullYear();

      setCoverPageData(prev => ({
        ...prev,
        reference_number: `MS/${boqData.clientName?.toUpperCase().replace(/\s+/g, '-') || 'CLIENT'}/${boqId}`,
        date: formattedDate,
        client_company: boqData.clientName || '',
        city: boqData.location || 'Dubai',
        subject: `Submission of Quotation for Fitout works in ${projectName}`,
        tender_reference: '',
        body_text: `We are referring to your request for quotation for ${projectName}. In this regard, we are herewith submitting the detailed quotation for your perusal and approval. Enclosed herewith are following documents:`
      }));
    }
  }, [isOpen, isClientMode, boqData, boqId, projectName]);

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
              discountPercentage: boq.discount_percentage || 0,
              discount_amount: boq.discount_amount || 0,
              submittedDate: boq.created_at ? new Date(boq.created_at).toISOString().split('T')[0] : '',
              location: boq.location || boq.project_details?.location || boq.project?.location || 'N/A',
              floor: boq.floor || boq.floor_name || boq.project_details?.floor || boq.project?.floor_name || 'N/A',
              workingHours: boq.hours || boq.working_hours || boq.project_details?.hours || boq.project?.working_hours || 'N/A',
              preliminaries: boq.preliminaries || {},
              totalVatAmount: boq.total_vat_amount || boq.totalVatAmount || 0,
              overallVatPercentage: boq.overall_vat_percentage || boq.overallVatPercentage || 0,
              boqItems: items.map((item: any) => {
                const hasSubItems = item.sub_items && item.sub_items.length > 0;
                const totalQuantity = hasSubItems
                  ? item.sub_items.reduce((sum: number, si: any) => sum + (si.quantity || 0), 0)
                  : item.materials?.reduce((sum: number, m: any) => sum + (m.quantity || 0), 0) || 1;
                const sellingPrice = item.selling_price || 0;

                return {
                  id: item.item_id,
                  description: item.item_name,
                  briefDescription: item.description || '',
                  unit: hasSubItems ? item.sub_items[0]?.unit : (item.materials?.[0]?.unit || 'nos'),
                  quantity: totalQuantity,
                  rate: totalQuantity > 0 ? sellingPrice / totalQuantity : sellingPrice,
                  amount: sellingPrice,
                  has_sub_items: hasSubItems,
                  sub_items: hasSubItems ? item.sub_items.map((subItem: any) => ({
                    sub_item_name: subItem.sub_item_name || subItem.name,
                    scope: subItem.scope,
                    size: subItem.size,
                    description: subItem.description,
                    location: subItem.location,
                    brand: subItem.brand,
                    quantity: subItem.quantity,
                    unit: subItem.unit,
                    rate: subItem.rate,
                    base_total: subItem.base_total || (subItem.quantity * subItem.rate),
                    materials_cost: subItem.materials?.reduce((sum: number, m: any) => sum + (m.total_price || 0), 0) || 0,
                    labour_cost: subItem.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
                    materials: subItem.materials?.map((mat: any) => ({
                      name: mat.material_name,
                      material_name: mat.material_name,
                      quantity: mat.quantity,
                      unit: mat.unit,
                      rate: mat.unit_price || mat.rate_per_unit,
                      amount: mat.total_price,
                      total_price: mat.total_price,
                      vat_percentage: mat.vat_percentage || 0
                    })) || [],
                    labour: subItem.labour?.map((lab: any) => ({
                      type: lab.labour_role,
                      labour_role: lab.labour_role,
                      quantity: lab.hours || lab.no_of_hours,
                      hours: lab.hours || lab.no_of_hours,
                      unit: 'hrs',
                      rate: lab.rate_per_hour,
                      amount: lab.total_cost,
                      total_cost: lab.total_cost
                    })) || []
                  })) : undefined,
                  materials: !hasSubItems ? (item.materials?.map((mat: any) => ({
                    name: mat.material_name,
                    quantity: mat.quantity,
                    unit: mat.unit,
                    rate: mat.unit_price || mat.rate_per_unit,
                    amount: mat.total_price,
                    vat_percentage: mat.vat_percentage || 0
                  })) || []) : [],
                  labour: !hasSubItems ? (item.labour?.map((lab: any) => ({
                    type: lab.labour_role,
                    quantity: lab.hours || lab.no_of_hours,
                    unit: 'hrs',
                    rate: lab.rate_per_hour,
                    amount: lab.total_cost
                  })) || []) : [],
                  laborCost: hasSubItems
                    ? item.sub_items.reduce((sum: number, si: any) => sum + (si.labour?.reduce((lSum: number, l: any) => lSum + (l.total_cost || 0), 0) || 0), 0)
                    : item.labour?.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0) || 0,
                  estimatedSellingPrice: sellingPrice,
                  overheadPercentage: item.overhead_percentage || 0,
                  profitMarginPercentage: item.profit_margin_percentage || 0,
                  discountPercentage: item.discount_percentage || 0,
                  vat_percentage: item.vat_percentage || 0,
                  vat_amount: item.vat_amount || 0
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
        // Build formats array based on user selection
        const selectedFormats: string[] = [];
        if (sendExcel) selectedFormats.push('excel');
        if (sendPDF) selectedFormats.push('pdf');

        // Send to client - support multiple emails
        response = await estimatorService.sendBOQToClient(boqId, {
          client_email: recipientEmail.trim() || undefined,
          message: comments.trim() || undefined,
          formats: selectedFormats,
          custom_email_body: emailTemplate.trim() || undefined,
          // Include cover page data if any field is filled
          cover_page: (coverPageData.reference_number || coverPageData.subject) ? coverPageData : undefined
        });

        // Track sent/failed counts from response
        if (response.success && response.total_sent !== undefined) {
          setSentToCount(response.total_sent);
          setFailedCount(response.total_failed || 0);
        } else {
          setSentToCount(1);
          setFailedCount(0);
        }
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

        setSentToCount(1);
        setFailedCount(0);
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
    // Reset format selection to defaults
    setSendPDF(true);
    setSendExcel(true);
    // Reset template editor
    setShowTemplateEditor(false);
    setEmailTemplate('');
    // Reset cover page editor
    setShowCoverPageEditor(false);
    setCoverPageData({
      reference_number: '',
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      recipient_name: 'The Tenders and Contracts Department',
      client_company: '',
      city: 'Dubai',
      country: 'United Arab Emirates',
      subject: '',
      tender_reference: '',
      body_text: '',
      enclosed_documents: ['Bill of Quantities derived for the works', 'Summary'],
      contact_person: 'Mr. Hamid Hussain',
      contact_title: 'Manager- Sales & Projects',
      contact_phone: '055 354 7727',
      contact_email: 'sales@metersquare.com',
      signatory_name: 'Amjath K Aboobacker',
      signatory_title: 'Managing Director'
    });
    onClose();
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Parse multiple emails from input
  const parseEmails = (emailString: string): string[] => {
    return emailString
      .split(/[,;\n]/) // Split by comma, semicolon, or newline
      .map(e => e.trim())
      .filter(e => e.length > 0);
  };

  // Check if all emails are valid
  const areAllEmailsValid = (emailString: string): boolean => {
    if (!emailString.trim()) return false;
    const emails = parseEmails(emailString);
    return emails.length > 0 && emails.every(email => isValidEmail(email));
  };

  const canSend = isClientMode
    ? (recipientEmail && areAllEmailsValid(recipientEmail) && (sendPDF || sendExcel)) // Client mode: at least one valid email and one format required
    : (!recipientEmail || areAllEmailsValid(recipientEmail)); // TD mode: email optional but must be valid if provided

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
              className="relative bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
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
                        ? `BOQ has been successfully sent to ${sentToCount} recipient${sentToCount > 1 ? 's' : ''}.${failedCount > 0 ? ` (${failedCount} failed)` : ''}`
                        : 'BOQ review email has been successfully sent to the Technical Director.'
                      }
                    </p>
                    <div className="w-full bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                      <p className="text-sm text-green-800">
                        <strong>{boqName}</strong> for project <strong>{projectName}</strong> {isClientMode ? 'sent to client' : 'is now pending TD review'}.
                      </p>
                      {isClientMode && sentToCount > 1 && (
                        <p className="text-sm text-green-700 mt-2">
                          ✓ Successfully sent to {sentToCount} email{sentToCount > 1 ? 's' : ''}
                        </p>
                      )}
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
                        {isClientMode ? 'Client Email(s) *' : 'Technical Director Email (Optional)'}
                      </Label>
                      {isClientMode ? (
                        <>
                          <Textarea
                            id="recipient_email"
                            placeholder="Enter email addresses (separate multiple emails with commas, semicolons, or new lines)&#10;Example:&#10;client1@example.com, client2@example.com&#10;or&#10;client1@example.com;client2@example.com"
                            value={recipientEmail}
                            onChange={(e) => setRecipientEmail(e.target.value)}
                            disabled={isSending}
                            required={isClientMode}
                            rows={4}
                            className={`resize-none ${recipientEmail && !areAllEmailsValid(recipientEmail) ? 'border-red-300 focus:border-red-500' : ''}`}
                          />
                          {recipientEmail && parseEmails(recipientEmail).length > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-600">
                                {parseEmails(recipientEmail).length} email{parseEmails(recipientEmail).length > 1 ? 's' : ''} entered
                              </span>
                              {areAllEmailsValid(recipientEmail) ? (
                                <span className="text-green-600 flex items-center gap-1">
                                  <CheckCircle className="w-4 h-4" />
                                  All valid
                                </span>
                              ) : (
                                <span className="text-red-600 flex items-center gap-1">
                                  <AlertCircle className="w-4 h-4" />
                                  Some emails invalid
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <Input
                          id="recipient_email"
                          type="email"
                          placeholder="Enter TD email or leave blank for default"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                          disabled={isSending}
                          className={`${recipientEmail && !isValidEmail(recipientEmail) ? 'border-red-300 focus:border-red-500' : ''}`}
                        />
                      )}
                      {recipientEmail && !areAllEmailsValid(recipientEmail) && (
                        <p className="text-sm text-red-600">Please enter valid email address(es)</p>
                      )}
                      {isClientMode && !recipientEmail && (
                        <p className="text-sm text-gray-500">At least one client email is required to send BOQ</p>
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
                        {isClientMode ? 'Additional Message (Optional)' : 'Comments / Notes (Optional)'}
                      </Label>
                      <Textarea
                        id="comments"
                        placeholder={isClientMode ? 'Add a brief message for the client...' : 'Add any comments or notes for the Technical Director...'}
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        disabled={isSending}
                        rows={3}
                        className="resize-none"
                      />
                    </div>

                    {/* COMBINED: Email & PDF Content Customization - Only for Client Mode */}
                    {isClientMode && (
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-5 border-2 border-blue-300">
                        <div className="flex items-center gap-2 mb-4">
                          <Edit3 className="w-5 h-5 text-blue-700" />
                          <h3 className="text-lg font-bold text-blue-900">Customize Email & PDF Content</h3>
                        </div>
                        <p className="text-sm text-gray-700 mb-4">
                          Customize the email body that will be sent to the client
                        </p>

                        <div className="space-y-4">
                          {/* Email Body Section */}
                          <div className="bg-white rounded-lg p-4 border border-blue-200">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                <Mail className="w-4 h-4 text-purple-600" />
                                Email Body
                              </h4>
                              <button
                                type="button"
                                onClick={() => setShowTemplateEditor(!showTemplateEditor)}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors border border-purple-300"
                                disabled={isSending}
                              >
                                {showTemplateEditor ? (
                                  <>
                                    <EyeOff className="w-3 h-3" />
                                    Hide
                                  </>
                                ) : (
                                  <>
                                    <Edit3 className="w-3 h-3" />
                                    Edit
                                  </>
                                )}
                              </button>
                            </div>

                            {showTemplateEditor ? (
                              <div className="space-y-3">
                                <Textarea
                                  id="email-template"
                                  placeholder="Enter custom email body..."
                                  value={emailTemplate}
                                  onChange={(e) => setEmailTemplate(e.target.value)}
                                  disabled={isSending}
                                  rows={10}
                                  className="resize-none font-mono text-sm border-purple-200 focus:border-purple-400"
                                />
                                <button
                                  type="button"
                                  onClick={() => setEmailTemplate(getDefaultTemplate())}
                                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                  disabled={isSending}
                                >
                                  Reset to Default
                                </button>
                              </div>
                            ) : (
                              <div className="bg-gray-50 rounded p-3 border border-gray-200">
                                <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-3">
                                  {emailTemplate || getDefaultTemplate()}
                                </p>
                                <p className="text-xs text-purple-600 mt-2">Click "Edit" to customize</p>
                              </div>
                            )}
                          </div>

                          {/* PDF Cover Page Section */}
                          <div className="bg-white rounded-lg p-4 border border-green-200 mt-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                <FileCheck className="w-4 h-4 text-green-600" />
                                PDF Cover Page
                                <span className="text-xs text-gray-500 font-normal">(Quotation Letter)</span>
                              </h4>
                              <button
                                type="button"
                                onClick={() => setShowCoverPageEditor(!showCoverPageEditor)}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors border border-green-300"
                                disabled={isSending}
                              >
                                {showCoverPageEditor ? (
                                  <>
                                    <EyeOff className="w-3 h-3" />
                                    Hide
                                  </>
                                ) : (
                                  <>
                                    <Edit3 className="w-3 h-3" />
                                    Edit
                                  </>
                                )}
                              </button>
                            </div>

                            {showCoverPageEditor ? (
                              <div className="space-y-4">
                                {/* Reference & Date Row */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label className="text-xs text-gray-600">Reference Number</Label>
                                    <Input
                                      value={coverPageData.reference_number}
                                      onChange={(e) => setCoverPageData(prev => ({ ...prev, reference_number: e.target.value }))}
                                      placeholder="MS/CLIENT/0001"
                                      className="text-sm"
                                      disabled={isSending}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-gray-600">Date</Label>
                                    <Input
                                      value={coverPageData.date}
                                      onChange={(e) => setCoverPageData(prev => ({ ...prev, date: e.target.value }))}
                                      placeholder="21-Nov-2025"
                                      className="text-sm"
                                      disabled={isSending}
                                    />
                                  </div>
                                </div>

                                {/* Recipient Section */}
                                <div className="border-t pt-3">
                                  <Label className="text-xs text-gray-600 font-semibold">To (Recipient)</Label>
                                  <div className="grid grid-cols-2 gap-3 mt-2">
                                    <div>
                                      <Label className="text-xs text-gray-500">Department/Name</Label>
                                      <Input
                                        value={coverPageData.recipient_name}
                                        onChange={(e) => setCoverPageData(prev => ({ ...prev, recipient_name: e.target.value }))}
                                        placeholder="The Tenders and Contracts Department"
                                        className="text-sm"
                                        disabled={isSending}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500">Company Name</Label>
                                      <Input
                                        value={coverPageData.client_company}
                                        onChange={(e) => setCoverPageData(prev => ({ ...prev, client_company: e.target.value }))}
                                        placeholder="Client Company Name"
                                        className="text-sm"
                                        disabled={isSending}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500">City</Label>
                                      <Input
                                        value={coverPageData.city}
                                        onChange={(e) => setCoverPageData(prev => ({ ...prev, city: e.target.value }))}
                                        placeholder="Dubai"
                                        className="text-sm"
                                        disabled={isSending}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500">Country</Label>
                                      <Input
                                        value={coverPageData.country}
                                        onChange={(e) => setCoverPageData(prev => ({ ...prev, country: e.target.value }))}
                                        placeholder="United Arab Emirates"
                                        className="text-sm"
                                        disabled={isSending}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Subject & Body */}
                                <div className="border-t pt-3">
                                  <Label className="text-xs text-gray-600">Subject Line</Label>
                                  <Input
                                    value={coverPageData.subject}
                                    onChange={(e) => setCoverPageData(prev => ({ ...prev, subject: e.target.value }))}
                                    placeholder="Submission of Quotation for Fitout works in..."
                                    className="text-sm"
                                    disabled={isSending}
                                  />
                                </div>

                                <div>
                                  <Label className="text-xs text-gray-600">Tender/Project Reference (Optional)</Label>
                                  <Input
                                    value={coverPageData.tender_reference}
                                    onChange={(e) => setCoverPageData(prev => ({ ...prev, tender_reference: e.target.value }))}
                                    placeholder="Tender No. 3000000750"
                                    className="text-sm"
                                    disabled={isSending}
                                  />
                                </div>

                                <div>
                                  <Label className="text-xs text-gray-600">Letter Body Text</Label>
                                  <Textarea
                                    value={coverPageData.body_text}
                                    onChange={(e) => setCoverPageData(prev => ({ ...prev, body_text: e.target.value }))}
                                    placeholder="We are referring to your request for quotation..."
                                    className="text-sm resize-none"
                                    rows={3}
                                    disabled={isSending}
                                  />
                                </div>

                                {/* Contact Person Section */}
                                <div className="border-t pt-3">
                                  <Label className="text-xs text-gray-600 font-semibold">Contact Person</Label>
                                  <div className="grid grid-cols-2 gap-3 mt-2">
                                    <div>
                                      <Label className="text-xs text-gray-500">Name</Label>
                                      <Input
                                        value={coverPageData.contact_person}
                                        onChange={(e) => setCoverPageData(prev => ({ ...prev, contact_person: e.target.value }))}
                                        placeholder="Mr. Hamid Hussain"
                                        className="text-sm"
                                        disabled={isSending}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500">Title</Label>
                                      <Input
                                        value={coverPageData.contact_title}
                                        onChange={(e) => setCoverPageData(prev => ({ ...prev, contact_title: e.target.value }))}
                                        placeholder="Manager- Sales & Projects"
                                        className="text-sm"
                                        disabled={isSending}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500">Phone</Label>
                                      <Input
                                        value={coverPageData.contact_phone}
                                        onChange={(e) => setCoverPageData(prev => ({ ...prev, contact_phone: e.target.value }))}
                                        placeholder="055 354 7727"
                                        className="text-sm"
                                        disabled={isSending}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500">Email</Label>
                                      <Input
                                        value={coverPageData.contact_email}
                                        onChange={(e) => setCoverPageData(prev => ({ ...prev, contact_email: e.target.value }))}
                                        placeholder="sales@metersquare.com"
                                        className="text-sm"
                                        disabled={isSending}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Signatory Section */}
                                <div className="border-t pt-3">
                                  <Label className="text-xs text-gray-600 font-semibold">Signatory</Label>
                                  <div className="grid grid-cols-2 gap-3 mt-2">
                                    <div>
                                      <Label className="text-xs text-gray-500">Name</Label>
                                      <Input
                                        value={coverPageData.signatory_name}
                                        onChange={(e) => setCoverPageData(prev => ({ ...prev, signatory_name: e.target.value }))}
                                        placeholder="Amjath K Aboobacker"
                                        className="text-sm"
                                        disabled={isSending}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-gray-500">Title</Label>
                                      <Input
                                        value={coverPageData.signatory_title}
                                        onChange={(e) => setCoverPageData(prev => ({ ...prev, signatory_title: e.target.value }))}
                                        placeholder="Managing Director"
                                        className="text-sm"
                                        disabled={isSending}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-gray-50 rounded p-3 border border-gray-200">
                                <div className="text-xs text-gray-600 space-y-1">
                                  <p><strong>Ref:</strong> {coverPageData.reference_number || 'Not set'}</p>
                                  <p><strong>To:</strong> {coverPageData.recipient_name}, {coverPageData.client_company || 'Client'}</p>
                                  <p><strong>Subject:</strong> {coverPageData.subject || 'Not set'}</p>
                                </div>
                                <p className="text-xs text-green-600 mt-2">Click "Edit" to customize cover page details</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Format Selection - Only for Client Mode */}
                    {isClientMode && (
                      <div className="space-y-3">
                        <Label className="flex items-center gap-2">
                          <Download className="w-4 h-4 text-gray-500" />
                          Attachment Format(s) *
                        </Label>
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                          <p className="text-sm text-gray-600 mb-3">
                            Select which file format(s) to send to the client
                          </p>
                          <div className="space-y-3">
                            <div className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-blue-200 hover:border-blue-300 transition-colors">
                              <Checkbox
                                id="format-excel"
                                checked={sendExcel}
                                onCheckedChange={(checked) => setSendExcel(checked === true)}
                                disabled={isSending}
                                className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                              />
                              <label
                                htmlFor="format-excel"
                                className="flex items-center gap-2 flex-1 cursor-pointer"
                              >
                                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                                <div>
                                  <p className="font-medium text-gray-900">Excel (.xlsx)</p>
                                  <p className="text-xs text-gray-500">Editable spreadsheet format</p>
                                </div>
                              </label>
                            </div>

                            <div className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-blue-200 hover:border-blue-300 transition-colors">
                              <Checkbox
                                id="format-pdf"
                                checked={sendPDF}
                                onCheckedChange={(checked) => setSendPDF(checked === true)}
                                disabled={isSending}
                                className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                              />
                              <label
                                htmlFor="format-pdf"
                                className="flex items-center gap-2 flex-1 cursor-pointer"
                              >
                                <FileText className="w-5 h-5 text-red-600" />
                                <div>
                                  <p className="font-medium text-gray-900">PDF (.pdf)</p>
                                  <p className="text-xs text-gray-500">Professional document format</p>
                                </div>
                              </label>
                            </div>
                          </div>

                          {!sendPDF && !sendExcel && (
                            <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
                              <AlertCircle className="w-4 h-4" />
                              <span>Please select at least one format</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Preview BOQ - Only for Client Mode */}
                    {isClientMode && (
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-center gap-2 mb-3">
                          <Download className="w-5 h-5 text-blue-600" />
                          <h3 className="font-semibold text-gray-900">Preview Client BOQ</h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          Preview email and documents before sending to client
                        </p>
                        {loadingBOQ ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                          </div>
                        ) : (
                          <>
                            {/* Preview Buttons */}
                            <div className="flex gap-3 mb-3">
                              <button
                                onClick={() => setShowEmailPreview(true)}
                                disabled={isSending}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                              >
                                <Eye className="w-4 h-4" />
                                Preview Email
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    toast.loading('Generating PDF preview...');
                                    const pdfUrl = await previewClientBOQPDF(boqId, undefined, coverPageData.reference_number ? coverPageData : undefined);
                                    setPreviewPDFUrl(pdfUrl);
                                    setShowPDFPreview(true);
                                    toast.dismiss();
                                  } catch (error) {
                                    toast.dismiss();
                                    toast.error('Failed to generate PDF preview');
                                    console.error('PDF preview error:', error);
                                  }
                                }}
                                disabled={isSending}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                              >
                                <Eye className="w-4 h-4" />
                                Preview PDF
                              </button>
                            </div>

                            {/* Download Buttons */}
                            <div className="flex gap-3">
                            <button
                              onClick={async () => {
                                try {
                                  toast.loading('Generating Excel file...');
                                  await downloadClientBOQExcel(boqId);
                                  toast.dismiss();
                                  toast.success('Excel file downloaded successfully');
                                } catch (error) {
                                  toast.dismiss();
                                  toast.error('Failed to download Excel file');
                                  console.error('Excel download error:', error);
                                }
                              }}
                              disabled={isSending}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                              Download Excel
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  toast.loading('Generating PDF file...');
                                  await downloadClientBOQPDF(boqId);
                                  toast.dismiss();
                                  toast.success('PDF file downloaded successfully');
                                } catch (error) {
                                  toast.dismiss();
                                  toast.error('Failed to download PDF file');
                                  console.error('PDF download error:', error);
                                }
                              }}
                              disabled={isSending}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                            >
                              <FileText className="w-4 h-4" />
                              Download PDF
                            </button>
                          </div>
                          </>
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

      {/* Email Preview Modal */}
      {showEmailPreview && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50"
              onClick={() => setShowEmailPreview(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600/10 to-indigo-600/10 border-b border-purple-200 px-6 py-4 sticky top-0 bg-white z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Mail className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Email Preview</h2>
                      <p className="text-sm text-gray-600">Preview how the email will look to the client</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowEmailPreview(false)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Email Content Preview */}
              <div className="p-6">
                <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                  {/* Email Header */}
                  <div className="mb-4 pb-4 border-b border-gray-300">
                    <p className="text-sm text-gray-600"><strong>From:</strong> MeterSquare Interiors LLC</p>
                    <p className="text-sm text-gray-600"><strong>To:</strong> {recipientEmail || 'client@example.com'}</p>
                    <p className="text-sm text-gray-600"><strong>Subject:</strong> BOQ Quotation - {projectName}</p>
                  </div>

                  {/* Email Body */}
                  <div className="space-y-4">
                    {emailTemplate ? (
                      <div className="whitespace-pre-wrap font-sans text-gray-800">
                        {emailTemplate}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap font-sans text-gray-800">
                        {getDefaultTemplate()}
                      </div>
                    )}

                    {/* Message */}
                    {comments && (
                      <div className="mt-4 pt-4 border-t border-gray-300">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Additional Message:</p>
                        <p className="text-gray-800 whitespace-pre-wrap">{comments}</p>
                      </div>
                    )}

                    {/* Attachments Info */}
                    <div className="mt-6 pt-4 border-t border-gray-300">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Attachments:</p>
                      <div className="flex gap-2">
                        {sendExcel && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                            <FileSpreadsheet className="w-4 h-4 text-green-600" />
                            <span className="text-sm text-green-800">BOQ_Quotation.xlsx</span>
                          </div>
                        )}
                        {sendPDF && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                            <FileText className="w-4 h-4 text-red-600" />
                            <span className="text-sm text-red-800">BOQ_Quotation.pdf</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Close Button */}
                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setShowEmailPreview(false)}
                    className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {showPDFPreview && previewPDFUrl && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50"
              onClick={() => {
                setShowPDFPreview(false);
                if (previewPDFUrl) {
                  window.URL.revokeObjectURL(previewPDFUrl);
                  setPreviewPDFUrl(null);
                }
              }}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600/10 to-blue-600/10 border-b border-indigo-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <FileText className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">PDF Preview</h2>
                      <p className="text-sm text-gray-600">Preview how the PDF will look with your custom terms</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowPDFPreview(false);
                      if (previewPDFUrl) {
                        window.URL.revokeObjectURL(previewPDFUrl);
                        setPreviewPDFUrl(null);
                      }
                    }}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* PDF Viewer */}
              <div className="flex-1 overflow-hidden">
                <iframe
                  src={previewPDFUrl}
                  className="w-full h-full border-0"
                  title="PDF Preview"
                />
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 px-6 py-4 flex justify-between items-center bg-gray-50">
                <p className="text-sm text-gray-600">
                  Preview how the PDF will look before sending to client
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      try {
                        await downloadClientBOQPDF(boqId);
                        toast.success('PDF downloaded successfully');
                      } catch (error) {
                        toast.error('Failed to download PDF');
                      }
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button
                    onClick={() => {
                      setShowPDFPreview(false);
                      if (previewPDFUrl) {
                        window.URL.revokeObjectURL(previewPDFUrl);
                        setPreviewPDFUrl(null);
                      }
                    }}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (973 lines - CRITICAL)
export default React.memo(SendBOQEmailModal);
