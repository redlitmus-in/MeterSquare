import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Truck,
  Package,
  User,
  Calendar,
  Hash,
  CheckCircle,
  Clock,
  AlertCircle,
  Building,
  MapPin,
  ArrowRight,
  FileText,
  Eye,
  Edit,
  Send,
  Shield,
  Activity,
  Construction,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApprovalWorkflow from '@/components/workflow/ApprovalWorkflow';
// import MaterialDeliveryNote from '@/components/forms/MaterialDeliveryNote'; // File doesn't exist - commented out

interface SiteDispatch {
  id: string;
  deliveryNoteNumber: string;
  projectName: string;
  siteLocation: string;
  requestedBy: string;
  supervisorType: 'site' | 'mep' | 'factory';
  requestDate: string;
  status: 'draft' | 'pending_approval' | 'bulk_approved' | 'dispatched' | 'delivered' | 'acknowledged';
  totalItems: number;
  totalValue: number;
  qtySpecReqFlag: boolean;
  bulkQtyDispatched: boolean;
  currentApprover: string;
  deliveryStage: 'requested' | 'note_approved' | 'bulk_dispatched' | 'site_delivered' | 'acknowledged';
  urgency: 'normal' | 'high' | 'urgent' | 'critical';
}

const MaterialDispatchSitePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDispatch, setSelectedDispatch] = useState<SiteDispatch | null>(null);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  // Initialize empty site dispatches - will be fetched from API
  const [siteDispatches, setSiteDispatches] = useState<SiteDispatch[]>([]);

  const getStatusConfig = (status: SiteDispatch['status']) => {
    const configs = {
      draft: { color: 'bg-gray-100 text-gray-700 border-gray-300', label: 'Draft' },
      pending_approval: { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'Pending Approval' },
      bulk_approved: { color: 'bg-[#243d8a]/10 text-[#243d8a]/90 border-[#243d8a]/30', label: 'Bulk Approved' },
      dispatched: { color: 'bg-purple-100 text-purple-700 border-purple-300', label: 'Dispatched' },
      delivered: { color: 'bg-green-100 text-green-700 border-green-300', label: 'Delivered' },
      acknowledged: { color: 'bg-green-100 text-green-700 border-green-300', label: 'Acknowledged' }
    };
    return configs[status];
  };

  const getSupervisorIcon = (type: SiteDispatch['supervisorType']) => {
    const configs = {
      site: { icon: Construction, color: 'text-orange-600', bgColor: 'bg-orange-100' },
      mep: { icon: Zap, color: 'text-[#243d8a]', bgColor: 'bg-[#243d8a]/10' },
      factory: { icon: Building, color: 'text-purple-600', bgColor: 'bg-purple-100' }
    };
    return configs[type];
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-300';
      case 'urgent': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'high': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const workflowSteps = [
    { stage: 'material_request', label: 'Material Request Raised', actor: 'Site/MEP Supervisor' },
    { stage: 'delivery_note', label: 'Material Delivery Note Issued', actor: 'Procurement' },
    { stage: 'note_approval', label: 'Delivery Note Approval', actor: 'Project Manager / Procurement' },
    { stage: 'bulk_qty_request', label: 'Bulk Qty Dispatch Request', actor: 'When Needed' },
    { stage: 'bulk_qty_approval', label: 'Bulk Qty Dispatch Approval', actor: 'Technical Director' },
    { stage: 'site_delivery', label: 'Site Delivery Execution', actor: 'As Per Approved Note' },
    { stage: 'delivery_acknowledgement', label: 'Delivery Acknowledgement', actor: 'Site Team' },
    { stage: 'design_reference', label: 'Design Reference Inputs', actor: 'Design' },
    { stage: 'task_completion', label: 'Task Completion', actor: 'System' }
  ];

  const totalDispatches = siteDispatches.length;
  const pendingDispatches = siteDispatches.filter(d => d.status === 'pending_approval').length;
  const dispatchedItems = siteDispatches.filter(d => d.status === 'dispatched' || d.status === 'delivered').length;
  const deliveredItems = siteDispatches.filter(d => d.status === 'delivered' || d.status === 'acknowledged').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl shadow-xl p-6 text-gray-800 border border-orange-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/60 rounded-lg">
              <Truck className="w-8 h-8 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Material Dispatch - Site Works</h1>
              <p className="text-gray-600 mt-1">Site Material Delivery & Installation Support</p>
            </div>
          </div>
          <Button 
            onClick={() => setShowNewForm(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            New Delivery Note
          </Button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Truck className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Dispatches</p>
                <p className="text-xl font-bold text-gray-900">{totalDispatches}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-xl font-bold text-gray-900">{pendingDispatches}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Dispatched</p>
                <p className="text-xl font-bold text-gray-900">{dispatchedItems}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Delivered</p>
                <p className="text-xl font-bold text-gray-900">{deliveredItems}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-3 w-full max-w-md bg-white shadow-sm border">
          <TabsTrigger value="overview" className="data-[state=active]:bg-orange-50">
            <Activity className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="workflow" className="data-[state=active]:bg-orange-50">
            <ArrowRight className="w-4 h-4 mr-2" />
            Workflow
          </TabsTrigger>
          <TabsTrigger value="sites" className="data-[state=active]:bg-orange-50">
            <MapPin className="w-4 h-4 mr-2" />
            Sites
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-orange-100 border-b">
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-orange-600" />
                Site Material Dispatch
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Delivery Note</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Site Location</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Requested By</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Urgency</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Flags</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {siteDispatches.map((dispatch, index) => {
                      const statusConfig = getStatusConfig(dispatch.status);
                      const supervisorConfig = getSupervisorIcon(dispatch.supervisorType);
                      const SupervisorIcon = supervisorConfig.icon;
                      
                      return (
                        <motion.tr 
                          key={dispatch.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="hover:bg-gray-50 transition-colors duration-200"
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{dispatch.deliveryNoteNumber}</div>
                            <div className="text-sm text-gray-500">{dispatch.requestDate}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">{dispatch.projectName}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{dispatch.siteLocation}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className={`p-1 ${supervisorConfig.bgColor} rounded`}>
                                <SupervisorIcon className={`w-3 h-3 ${supervisorConfig.color}`} />
                              </div>
                              <div className="text-sm text-gray-900">{dispatch.requestedBy}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-gray-900">{dispatch.totalItems}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-gray-900">
                              AED {dispatch.totalValue.toLocaleString()}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge className={`${statusConfig.color} border`}>
                              {statusConfig.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            <Badge className={`${getUrgencyColor(dispatch.urgency)} border`}>
                              {dispatch.urgency.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-1">
                              <Badge className={dispatch.qtySpecReqFlag ? 
                                'bg-green-100 text-green-700 border-green-300' : 
                                'bg-gray-100 text-gray-700 border-gray-300'}>
                                QTY/SPEC/REQ {dispatch.qtySpecReqFlag ? '✓' : '⚠'}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setSelectedDispatch(dispatch);
                                  setShowWorkflow(true);
                                }}
                                className="text-gray-600 hover:text-gray-900"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {dispatch.status === 'pending_approval' && (
                                <Button 
                                  size="sm" 
                                  className="bg-orange-600 hover:bg-orange-700 text-white"
                                >
                                  <Shield className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflow Tab */}
        <TabsContent value="workflow">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-orange-100 border-b">
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-orange-600" />
                Site Material Dispatch Workflow Steps
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {workflowSteps.map((step, index) => (
                  <motion.div
                    key={step.stage}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="relative"
                  >
                    {/* Connection Line */}
                    {index < workflowSteps.length - 1 && (
                      <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-orange-200" />
                    )}

                    <div className="flex items-start gap-4">
                      {/* Step Icon */}
                      <div className="relative z-10 bg-white rounded-full p-2 border-2 border-orange-200">
                        <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center">
                          <span className="text-orange-600 text-xs font-bold">{index + 1}</span>
                        </div>
                      </div>

                      {/* Step Content */}
                      <div className="flex-1 bg-white rounded-lg border border-orange-200 p-4 hover:border-orange-300 transition-colors">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-800">{step.label}</h4>
                            <p className="text-sm text-gray-600">Actor: {step.actor}</p>
                            {step.stage === 'note_approval' && (
                              <div className="mt-2">
                                <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-300 text-xs">
                                  QTY/SPEC/REQ FLAG Required
                                </Badge>
                              </div>
                            )}
                            {step.stage === 'bulk_qty_approval' && (
                              <div className="mt-2">
                                <Badge className="bg-[#243d8a]/10 text-[#243d8a]/90 border border-[#243d8a]/30 text-xs">
                                  Technical Director FLAG
                                </Badge>
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">
                            Step {index + 1}
                          </div>
                        </div>

                        {step.stage === 'note_approval' && (
                          <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
                            <p className="text-xs text-yellow-700">
                              <strong>Rejection Loop:</strong> Qty & Spec rejection → Qty & Spec revisions → resubmit
                            </p>
                          </div>
                        )}

                        {step.stage === 'bulk_qty_request' && (
                          <div className="mt-3 p-3 bg-[#243d8a]/5 rounded border border-[#243d8a]/20">
                            <p className="text-xs text-[#243d8a]/90">
                              <strong>Conditional:</strong> Only triggered when bulk quantity dispatch is needed
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sites Tab */}
        <TabsContent value="sites">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Site Activity */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-orange-100 border-b">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-orange-600" />
                  Active Sites
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {[
                  { 
                    site: 'Marina Bay Residential',
                    location: 'Marina Bay Construction Site',
                    active: 3, 
                    delivered: 8, 
                    supervisor: 'Site Supervisor',
                    color: 'bg-[#243d8a]/10 text-[#243d8a]/90',
                    icon: Construction
                  },
                  { 
                    site: 'Orchard Office Tower',
                    location: 'Orchard Tower Site',
                    active: 2, 
                    delivered: 5, 
                    supervisor: 'MEP Supervisor',
                    color: 'bg-purple-100 text-purple-700',
                    icon: Zap
                  },
                  { 
                    site: 'Sentosa Resort',
                    location: 'Sentosa Resort Site',
                    active: 1, 
                    delivered: 4, 
                    supervisor: 'Site Supervisor',
                    color: 'bg-green-100 text-green-700',
                    icon: Building
                  }
                ].map((site, index) => {
                  const SiteIcon = site.icon;
                  return (
                    <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className={`p-3 ${site.color} rounded-lg`}>
                        <SiteIcon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-800">{site.site}</h4>
                        <p className="text-sm text-gray-600">{site.location}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={site.color}>
                            {site.supervisor}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex gap-3">
                          <div>
                            <p className="text-sm font-semibold text-orange-600">{site.active}</p>
                            <p className="text-xs text-gray-500">Active</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-green-600">{site.delivered}</p>
                            <p className="text-xs text-gray-500">Delivered</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Supervisor Types */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-orange-100 border-b">
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-orange-600" />
                  Supervisor Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {[
                  { 
                    type: 'Site Supervisor',
                    count: siteDispatches.filter(d => d.supervisorType === 'site').length,
                    pending: siteDispatches.filter(d => d.supervisorType === 'site' && d.status === 'pending_approval').length,
                    color: 'bg-orange-100 text-orange-700',
                    icon: Construction
                  },
                  { 
                    type: 'MEP Supervisor',
                    count: siteDispatches.filter(d => d.supervisorType === 'mep').length,
                    pending: siteDispatches.filter(d => d.supervisorType === 'mep' && d.status === 'pending_approval').length,
                    color: 'bg-[#243d8a]/10 text-[#243d8a]/90',
                    icon: Zap
                  },
                ].map((supervisor, index) => {
                  const SupervisorIcon = supervisor.icon;
                  return (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 ${supervisor.color} rounded-lg`}>
                          <SupervisorIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-800">{supervisor.type}</h4>
                          <Badge className={supervisor.color}>
                            {supervisor.type.split(' ')[0]}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{supervisor.count}</p>
                            <p className="text-xs text-gray-500">Total</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-yellow-600">{supervisor.pending}</p>
                            <p className="text-xs text-gray-500">Pending</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Workflow Modal */}
      {showWorkflow && selectedDispatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Workflow: {selectedDispatch.deliveryNoteNumber}
              </h2>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setShowWorkflow(false);
                  setSelectedDispatch(null);
                }}
              >
                Close
              </Button>
            </div>
            <div className="p-4">
              <ApprovalWorkflow 
                documentType="work_order" 
                documentId={selectedDispatch.id}
                currentUserRole="Site Supervisor"
              />
            </div>
          </div>
        </div>
      )}

      {/* New Form Modal */}
      {showNewForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Material Delivery Note</h2>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowNewForm(false)}
              >
                Close
              </Button>
            </div>
            <div className="p-4">
              {/* <MaterialDeliveryNote /> */}
              <p className="text-gray-500 text-center py-8">Material delivery note form will be implemented soon.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (596 lines)
export default React.memo(MaterialDispatchSitePage);