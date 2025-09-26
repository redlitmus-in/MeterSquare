import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  X,
  Clock,
  AlertCircle,
  ChevronRight,
  MessageSquare,
  Paperclip,
  History,
  User,
  Calendar,
  FileText,
  Download,
  Eye,
  Edit3,
  RefreshCw,
  Send,
  Shield,
  TrendingUp,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ApprovalStep {
  id: string;
  role: string;
  approver: string;
  status: 'pending' | 'in-review' | 'approved' | 'rejected' | 'revision-requested';
  date?: string;
  comments?: string;
  flags?: {
    pmFlag?: boolean;
    costFlag?: boolean;
    qtySpecFlag?: boolean;
    qtyScopeFlag?: boolean;
    qtySpecReqFlag?: boolean;
    flag?: boolean;
    compliance?: boolean;
  };
  attachments?: string[];
  duration?: string;
}

interface ApprovalAction {
  action: 'approve' | 'reject' | 'revise';
  comments: string;
  attachments?: File[];
  flags?: string[];
}

interface ApprovalWorkflowProps {
  documentType: 'purchase_requisition' | 'vendor_quotation' | 'work_order' | 'material_requisition' | 'delivery_note';
  documentId: string;
  currentUserRole: string;
}

interface ApprovalHistoryEvent {
  id: string;
  action: string;
  user: string;
  role: string;
  date: string;
  type: 'approve' | 'reject' | 'review' | 'create' | 'submit';
  comments?: string;
}

const ApprovalWorkflow: React.FC<ApprovalWorkflowProps> = ({
  documentType,
  documentId,
  currentUserRole
}) => {
  const [showActionPanel, setShowActionPanel] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'approve' | 'reject' | 'revise' | null>(null);
  const [comments, setComments] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Initialize empty approval steps - will be fetched from API
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>([]);

  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryEvent[]>([
    {
      id: '4',
      action: 'Under Review',
      user: 'David Lim',
      role: 'Estimation',
      date: '2024-01-15 02:30 PM',
      type: 'review'
    }
  ]);

  const getStatusColor = (status: ApprovalStep['status']) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'in-review':
        return 'bg-[#243d8a]/10 text-[#243d8a]/90 border-[#243d8a]/30';
      case 'revision-requested':
        return 'bg-amber-100 text-amber-700 border-amber-300';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-300';
    }
  };

  const getStatusIcon = (status: ApprovalStep['status']) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'in-review':
        return <Clock className="w-5 h-5 text-[#243d8a] animate-pulse" />;
      case 'revision-requested':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const handleApprovalAction = (action: ApprovalAction) => {
    console.log('Approval action:', action);
    setShowActionPanel(false);
    setSelectedAction(null);
    setComments('');
  };

  const currentStep = approvalSteps.find(step => step.status === 'in-review');
  const isCurrentApprover = currentStep?.role === currentUserRole;

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <Card className="shadow-lg border-0">
        <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-indigo-50 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#243d8a]" />
              Approval Workflow Status
            </CardTitle>
            <div className="flex items-center gap-3">
              <Badge className="bg-[#243d8a]/10 text-[#243d8a]/90 border border-[#243d8a]/30">
                <Activity className="w-3 h-3 mr-1" />
                In Progress
              </Badge>
              <Badge className="bg-gray-100 text-gray-700 border border-gray-300">
                Step 3 of 5
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Progress</span>
              <span className="font-semibold">40% Complete</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '40%' }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-[#243d8a] to-indigo-500 rounded-full"
              />
            </div>
          </div>

          {/* Approval Chain */}
          <div className="space-y-4">
            {approvalSteps.map((step, index) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative ${index < approvalSteps.length - 1 ? 'pb-4' : ''}`}
              >
                {/* Connection Line */}
                {index < approvalSteps.length - 1 && (
                  <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-300" />
                )}

                <div className="flex items-start gap-4">
                  {/* Status Icon */}
                  <div className="relative z-10 bg-white rounded-full p-1">
                    {getStatusIcon(step.status)}
                  </div>

                  {/* Step Content */}
                  <div className="flex-1">
                    <div className={`bg-white rounded-lg border-2 p-4 ${
                      step.status === 'in-review' ? 'border-[#243d8a]/30 shadow-md' : 'border-gray-200'
                    }`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-800">{step.role}</h4>
                          <p className="text-sm text-gray-600">{step.approver}</p>
                        </div>
                        <div className="text-right">
                          <Badge className={`${getStatusColor(step.status)} border`}>
                            {step.status.replace('-', ' ').toUpperCase()}
                          </Badge>
                          {step.date && (
                            <p className="text-xs text-gray-500 mt-1">{step.date}</p>
                          )}
                          {step.duration && (
                            <p className="text-xs text-gray-400">Duration: {step.duration}</p>
                          )}
                        </div>
                      </div>

                      {/* Flags */}
                      {step.flags && (
                        <div className="flex gap-2 mb-2 flex-wrap">
                          {step.flags.pmFlag !== undefined && (
                            <Badge className={step.flags.pmFlag 
                              ? 'bg-green-100 text-green-700 border-green-300' 
                              : 'bg-amber-100 text-amber-700 border-amber-300'}>
                              PM FLAG {step.flags.pmFlag ? '✓' : '⚠'}
                            </Badge>
                          )}
                          {step.flags.costFlag !== undefined && (
                            <Badge className={step.flags.costFlag 
                              ? 'bg-green-100 text-green-700 border-green-300' 
                              : 'bg-amber-100 text-amber-700 border-amber-300'}>
                              COST FLAG {step.flags.costFlag ? '✓' : '⚠'}
                            </Badge>
                          )}
                          {step.flags.qtySpecFlag !== undefined && (
                            <Badge className={step.flags.qtySpecFlag 
                              ? 'bg-green-100 text-green-700 border-green-300' 
                              : 'bg-amber-100 text-amber-700 border-amber-300'}>
                              QTY/SPEC FLAG {step.flags.qtySpecFlag ? '✓' : '⚠'}
                            </Badge>
                          )}
                          {step.flags.qtyScopeFlag !== undefined && (
                            <Badge className={step.flags.qtyScopeFlag 
                              ? 'bg-green-100 text-green-700 border-green-300' 
                              : 'bg-amber-100 text-amber-700 border-amber-300'}>
                              QTY/SCOPE FLAG {step.flags.qtyScopeFlag ? '✓' : '⚠'}
                            </Badge>
                          )}
                          {step.flags.qtySpecReqFlag !== undefined && (
                            <Badge className={step.flags.qtySpecReqFlag 
                              ? 'bg-green-100 text-green-700 border-green-300' 
                              : 'bg-amber-100 text-amber-700 border-amber-300'}>
                              QTY/SPEC/REQ FLAG {step.flags.qtySpecReqFlag ? '✓' : '⚠'}
                            </Badge>
                          )}
                          {step.flags.flag !== undefined && (
                            <Badge className={step.flags.flag 
                              ? 'bg-green-100 text-green-700 border-green-300' 
                              : 'bg-amber-100 text-amber-700 border-amber-300'}>
                              FLAG {step.flags.flag ? '✓' : '⚠'}
                            </Badge>
                          )}
                          {step.flags.compliance !== undefined && (
                            <Badge className={step.flags.compliance 
                              ? 'bg-green-100 text-green-700 border-green-300' 
                              : 'bg-amber-100 text-amber-700 border-amber-300'}>
                              COMPLIANCE {step.flags.compliance ? '✓' : '⚠'}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Comments */}
                      {step.comments && (
                        <div className="bg-gray-50 rounded p-2 mt-2">
                          <p className="text-sm text-gray-700">
                            <MessageSquare className="w-3 h-3 inline mr-1 text-gray-500" />
                            {step.comments}
                          </p>
                        </div>
                      )}

                      {/* Action Buttons for Current Approver */}
                      {step.status === 'in-review' && isCurrentApprover && (
                        <div className="flex gap-2 mt-3 pt-3 border-t">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => {
                              setSelectedAction('approve');
                              setShowActionPanel(true);
                            }}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500 text-amber-600 hover:bg-amber-50"
                            onClick={() => {
                              setSelectedAction('revise');
                              setShowActionPanel(true);
                            }}
                          >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Request Revision
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500 text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setSelectedAction('reject');
                              setShowActionPanel(true);
                            }}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Panel */}
      <AnimatePresence>
        {showActionPanel && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Card className="shadow-lg border-2 border-[#243d8a]/20">
              <CardHeader className={`${
                selectedAction === 'approve' ? 'bg-green-50' :
                selectedAction === 'reject' ? 'bg-red-50' :
                'bg-amber-50'
              } border-b`}>
                <CardTitle className="flex items-center gap-2">
                  {selectedAction === 'approve' && <Check className="w-5 h-5 text-green-600" />}
                  {selectedAction === 'reject' && <X className="w-5 h-5 text-red-600" />}
                  {selectedAction === 'revise' && <RefreshCw className="w-5 h-5 text-amber-600" />}
                  {selectedAction === 'approve' && 'Approve Document'}
                  {selectedAction === 'reject' && 'Reject Document'}
                  {selectedAction === 'revise' && 'Request Revision'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {/* Flags Selection */}
                {selectedAction === 'approve' && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Approval Flags (As Per Workflow Requirements)</Label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-green-600" />
                        <span className="text-sm">PM FLAG - Project Manager Approval</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-green-600" />
                        <span className="text-sm">COST FLAG - Cost Approval</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-green-600" />
                        <span className="text-sm">QTY/SPEC FLAG - Quantity & Specification</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-green-600" />
                        <span className="text-sm">QTY/SCOPE FLAG - Quantity & Scope</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-green-600" />
                        <span className="text-sm">QTY/SPEC/REQ FLAG - Quantity, Spec & Requirements</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-green-600" />
                        <span className="text-sm">FLAG - Generic Approval Flag</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-green-600" />
                        <span className="text-sm">Compliance Verified</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Revision Areas */}
                {selectedAction === 'revise' && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Areas Requiring Revision</Label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-amber-600" />
                        <span className="text-sm">Quantity Adjustment</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-amber-600" />
                        <span className="text-sm">Specification Changes</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-amber-600" />
                        <span className="text-sm">Cost Revision</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-amber-600" />
                        <span className="text-sm">Documentation Update</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div>
                  <Label className="text-sm font-semibold mb-2 block">
                    Comments {selectedAction === 'reject' && <span className="text-red-500">*</span>}
                  </Label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    className="w-full min-h-[100px] p-3 border border-gray-200 rounded-lg focus:border-[#243d8a] focus:ring-1 focus:ring-[#243d8a]"
                    placeholder={
                      selectedAction === 'approve' ? 'Add approval comments (optional)...' :
                      selectedAction === 'reject' ? 'Provide reason for rejection (required)...' :
                      'Specify required revisions...'
                    }
                  />
                </div>

                {/* Attachments */}
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Attachments</Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                    <Paperclip className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Drop files here or click to upload</p>
                    <Button variant="outline" size="sm" className="mt-2">
                      Select Files
                    </Button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 justify-end pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowActionPanel(false);
                      setSelectedAction(null);
                      setComments('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className={
                      selectedAction === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                      selectedAction === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                      'bg-amber-600 hover:bg-amber-700'
                    }
                    onClick={() => handleApprovalAction({
                      action: selectedAction!,
                      comments
                    })}
                  >
                    <Send className="w-4 h-4 mr-1" />
                    {selectedAction === 'approve' && 'Submit Approval'}
                    {selectedAction === 'reject' && 'Submit Rejection'}
                    {selectedAction === 'revise' && 'Request Revision'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Actions & History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card className="shadow-md">
          <CardHeader className="bg-gray-50 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-600" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            <Button variant="outline" className="w-full justify-start text-sm">
              <Eye className="w-4 h-4 mr-2" />
              View Full Document
            </Button>
            <Button variant="outline" className="w-full justify-start text-sm">
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            <Button variant="outline" className="w-full justify-start text-sm">
              <MessageSquare className="w-4 h-4 mr-2" />
              Add Comment
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start text-sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="w-4 h-4 mr-2" />
              {showHistory ? 'Hide' : 'View'} History
            </Button>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card className="shadow-md">
          <CardHeader className="bg-gray-50 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-600" />
              Approval Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Average Approval Time</span>
                <span className="font-semibold text-sm">2.5 hours</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Steps Completed</span>
                <span className="font-semibold text-sm">2 of 5</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Estimated Completion</span>
                <span className="font-semibold text-sm">Today, 6:00 PM</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Priority Level</span>
                <Badge className="bg-amber-100 text-amber-700 border border-amber-300">
                  High
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Approval History */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="shadow-md">
              <CardHeader className="bg-gray-50 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4 text-gray-600" />
                  Approval History
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {approvalHistory.map((event, index) => (
                    <div key={event.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        event.type === 'approve' ? 'bg-green-100 text-green-600' :
                        event.type === 'reject' ? 'bg-red-100 text-red-600' :
                        event.type === 'review' ? 'bg-[#243d8a]/10 text-[#243d8a]' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {event.type === 'approve' && <Check className="w-4 h-4" />}
                        {event.type === 'reject' && <X className="w-4 h-4" />}
                        {event.type === 'review' && <Eye className="w-4 h-4" />}
                        {event.type === 'create' && <FileText className="w-4 h-4" />}
                        {event.type === 'submit' && <Send className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{event.action}</p>
                            <p className="text-xs text-gray-500">
                              {event.user} • {event.role}
                            </p>
                            {event.comments && (
                              <p className="text-xs text-gray-600 mt-1 italic">"{event.comments}"</p>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{event.date}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ApprovalWorkflow;