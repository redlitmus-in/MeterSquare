import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Mail, User, MessageSquare, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { estimatorService } from '../services/estimatorService';

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

  const isClientMode = mode === 'client';

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

  const canSend = !recipientEmail || (recipientEmail && isValidEmail(recipientEmail));

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
                        {isClientMode ? 'Client Email (Optional)' : 'Technical Director Email (Optional)'}
                      </Label>
                      <Input
                        id="recipient_email"
                        type="email"
                        placeholder={isClientMode ? 'Enter client email or leave blank for project default' : 'Enter TD email or leave blank for default'}
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        disabled={isSending}
                        className={`${recipientEmail && !isValidEmail(recipientEmail) ? 'border-red-300 focus:border-red-500' : ''}`}
                      />
                      {recipientEmail && !isValidEmail(recipientEmail) && (
                        <p className="text-sm text-red-600">Please enter a valid email address</p>
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
