import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  XCircle,
  ArrowRight,
  FileText,
  User,
  Flag,
  RefreshCw
} from 'lucide-react';
import { WORKFLOW_CONFIGS } from '@/utils/workflowIntegration';

interface WorkflowStatus {
  id: string;
  documentType: string;
  documentId: string;
  currentStep: string;
  progress: number;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'revision_required';
  flags: {
    pmFlag?: boolean;
    costFlag?: boolean;
    qtySpecFlag?: boolean;
    qtyScopeFlag?: boolean;
    qtySpecReqFlag?: boolean;
  };
  approvalHistory: Array<{
    step: string;
    approver: string;
    status: string;
    date: string;
    comments?: string;
  }>;
}

const WorkflowStatusPage: React.FC = () => {
  // Initialize empty workflows - will be fetched from API
  const [workflows, setWorkflows] = React.useState<WorkflowStatus[]>([
    {
      id: 'WF-PR-001',
      documentType: 'purchase_requisition',
      documentId: 'PR-001',
      currentStep: 'PROJECT_MANAGER',
      progress: 40,
      status: 'in_review',
      flags: {
        pmFlag: false,
        costFlag: false,
        qtySpecFlag: true
      },
      approvalHistory: [
        {
          step: 'SITE_SUPERVISOR',
          approver: 'John Smith',
          status: 'approved',
          date: '2024-08-25',
          comments: 'Materials approved for site requirements'
        },
        {
          step: 'PROCUREMENT',
          approver: 'Sarah Johnson',
          status: 'approved', 
          date: '2024-08-25',
          comments: 'Vendor availability confirmed'
        }
      ]
    },
    {
      id: 'WF-VQ-001',
      documentType: 'vendor_quotation',
      documentId: 'VQ-001',
      currentStep: 'ESTIMATION',
      progress: 60,
      status: 'revision_required',
      flags: {
        pmFlag: true,
        qtyScopeFlag: false
      },
      approvalHistory: [
        {
          step: 'PROCUREMENT',
          approver: 'Sarah Johnson',
          status: 'approved',
          date: '2024-08-24'
        },
        {
          step: 'PROJECT_MANAGER',
          approver: 'Mike Wilson',
          status: 'approved',
          date: '2024-08-25'
        },
        {
          step: 'ESTIMATION',
          approver: 'Lisa Chen',
          status: 'rejected',
          date: '2024-08-25',
          comments: 'Quantity specifications need revision - please update BOQ reference'
        }
      ]
    }
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'in_review': return 'bg-[#243d8a]/10 text-[#243d8a]/90';
      case 'rejected': return 'bg-red-100 text-red-700';
      case 'revision_required': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle2 className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'in_review': return <RefreshCw className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
      case 'revision_required': return <AlertCircle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getFlagIcon = (flagStatus: boolean | undefined) => {
    if (flagStatus === true) return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    if (flagStatus === false) return <XCircle className="w-4 h-4 text-red-600" />;
    return <Clock className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Workflow Status</h1>
        <p className="text-gray-500 mt-1">Track document approval progress and workflow states</p>
      </div>

      <div className="grid gap-6">
        {workflows.map((workflow) => {
          const config = WORKFLOW_CONFIGS[workflow.documentType];
          
          return (
            <motion.div
              key={workflow.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        {workflow.documentId}
                      </CardTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        {workflow.documentType.replace(/_/g, ' ').toUpperCase()}
                      </p>
                    </div>
                    <Badge className={getStatusColor(workflow.status)}>
                      {getStatusIcon(workflow.status)}
                      <span className="ml-1">{workflow.status.replace(/_/g, ' ')}</span>
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Workflow Progress</span>
                      <span>{workflow.progress}%</span>
                    </div>
                    <Progress value={workflow.progress} className="h-2" />
                  </div>

                  {/* Current Step */}
                  <div className="bg-[#243d8a]/5 p-4 rounded-lg">
                    <h4 className="font-semibold text-[#243d8a] mb-2">Current Step</h4>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-[#243d8a]" />
                      <span className="text-[#243d8a]/80">{workflow.currentStep.replace(/_/g, ' ')}</span>
                    </div>
                  </div>

                  {/* Approval Flags */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Flag className="w-4 h-4" />
                      Approval Flags
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {config?.requiredFlags.map((flag) => {
                        const flagKey = flag.toLowerCase().replace(/[^a-z]/g, '');
                        const status = workflow.flags[flagKey as keyof typeof workflow.flags];
                        
                        return (
                          <div key={flag} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <span className="text-sm">{flag}</span>
                            {getFlagIcon(status)}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Approval Sequence */}
                  <div>
                    <h4 className="font-semibold mb-3">Approval Sequence</h4>
                    <div className="flex flex-wrap gap-2">
                      {config?.approvalSequence.map((step, index) => {
                        const isCompleted = workflow.approvalHistory.some(h => h.step === step && h.status === 'approved');
                        const isCurrent = workflow.currentStep === step;
                        const isRejected = workflow.approvalHistory.some(h => h.step === step && h.status === 'rejected');
                        
                        return (
                          <React.Fragment key={step}>
                            <div className={`px-3 py-1 rounded text-xs font-medium ${
                              isCompleted ? 'bg-green-100 text-green-700' :
                              isCurrent ? 'bg-[#243d8a]/10 text-[#243d8a]/90' :
                              isRejected ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {step.replace(/_/g, ' ')}
                            </div>
                            {index < config.approvalSequence.length - 1 && (
                              <ArrowRight className="w-4 h-4 text-gray-400 self-center" />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* Approval History */}
                  <div>
                    <h4 className="font-semibold mb-3">Approval History</h4>
                    <div className="space-y-2">
                      {workflow.approvalHistory.map((entry, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded">
                          {getStatusIcon(entry.status)}
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{entry.step.replace(/_/g, ' ')}</span>
                              <span className="text-xs text-gray-500">{entry.date}</span>
                            </div>
                            <p className="text-sm text-gray-600">{entry.approver}</p>
                            {entry.comments && (
                              <p className="text-sm text-gray-700 mt-1 italic">{entry.comments}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    <Button variant="outline" size="sm">
                      View Document
                    </Button>
                    <Button variant="outline" size="sm">
                      Add Comment
                    </Button>
                    {workflow.status === 'revision_required' && (
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                        Submit Revision
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Integration Notice */}
      <Card className="bg-[#243d8a]/5 border-[#243d8a]/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#243d8a] mt-0.5" />
            <div>
              <h4 className="font-semibold text-[#243d8a]">Backend Integration Required</h4>
              <p className="text-sm text-[#243d8a]/80 mt-1">
                This page shows the designed workflow structure. Full functionality requires backend API integration 
                for real-time workflow state management, approvals, and flag tracking.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkflowStatusPage;