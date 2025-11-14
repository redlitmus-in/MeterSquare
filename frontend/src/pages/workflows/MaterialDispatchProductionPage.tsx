import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Factory,
  Package,
  User,
  Calendar,
  Hash,
  CheckCircle,
  Clock,
  AlertCircle,
  Building,
  Settings,
  ArrowRight,
  FileText,
  Eye,
  Edit,
  Send,
  Shield,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApprovalWorkflow from '@/components/workflow/ApprovalWorkflow';
// import MaterialRequisitionForm from '@/components/forms/MaterialRequisitionForm'; // File doesn't exist - commented out

interface MaterialDispatch {
  id: string;
  requisitionNumber: string;
  projectName: string;
  factorySection: string;
  requestedBy: string;
  requestDate: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'dispatched' | 'in_production' | 'completed';
  totalItems: number;
  totalValue: number;
  qtySpecFlag: boolean;
  bulkQtyApproved: boolean;
  currentApprover: string;
  productionStage: 'requested' | 'bulk_approved' | 'dispatched' | 'in_production' | 'completed';
}

const MaterialDispatchProductionPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDispatch, setSelectedDispatch] = useState<MaterialDispatch | null>(null);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  // Initialize empty material dispatches - will be fetched from API
  const [materialDispatches, setMaterialDispatches] = useState<MaterialDispatch[]>([]);

  const getStatusConfig = (status: MaterialDispatch['status']) => {
    const configs = {
      draft: { color: 'bg-gray-100 text-gray-700 border-gray-300', label: 'Draft' },
      pending_approval: { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'Pending Approval' },
      approved: { color: 'bg-[#243d8a]/10 text-[#243d8a]/90 border-[#243d8a]/30', label: 'Approved' },
      dispatched: { color: 'bg-purple-100 text-purple-700 border-purple-300', label: 'Dispatched' },
      in_production: { color: 'bg-orange-100 text-orange-700 border-orange-300', label: 'In Production' },
      completed: { color: 'bg-green-100 text-green-700 border-green-300', label: 'Completed' }
    };
    return configs[status];
  };

  const getProductionStageConfig = (stage: MaterialDispatch['productionStage']) => {
    const configs = {
      requested: { icon: FileText, color: 'text-gray-600', bgColor: 'bg-gray-100' },
      bulk_approved: { icon: CheckCircle, color: 'text-[#243d8a]', bgColor: 'bg-[#243d8a]/10' },
      dispatched: { icon: Package, color: 'text-purple-600', bgColor: 'bg-purple-100' },
      in_production: { icon: Settings, color: 'text-orange-600', bgColor: 'bg-orange-100' },
      completed: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100' }
    };
    return configs[stage];
  };

  const workflowSteps = [
    { stage: 'requested', label: 'Material Requested', actor: 'Site Supervisor' },
    { stage: 'qty_spec_approval', label: 'Qty & Spec Approval', actor: 'Project Manager / Estimation' },
    { stage: 'bulk_qty_approval', label: 'Bulk Qty Approval', actor: 'Technical Director / Accounts' },
    { stage: 'dispatch', label: 'Material Dispatch', actor: 'Procurement / Store In Charge' },
    { stage: 'production', label: 'Joinery & Furniture Production', actor: 'Site Supervisor' },
    { stage: 'acknowledgement', label: 'Dispatch Acknowledgement', actor: 'Multiple Parties' },
    { stage: 'design_reference', label: 'Design Reference Inputs', actor: 'Design' },
    { stage: 'completed', label: 'Task Completion', actor: 'System' }
  ];

  const totalDispatches = materialDispatches.length;
  const pendingDispatches = materialDispatches.filter(d => d.status === 'pending_approval').length;
  const inProductionDispatches = materialDispatches.filter(d => d.status === 'in_production').length;
  const completedDispatches = materialDispatches.filter(d => d.status === 'completed').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl shadow-xl p-6 text-gray-800 border border-purple-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/60 rounded-lg">
              <Factory className="w-8 h-8 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Material Dispatch - Production</h1>
              <p className="text-gray-600 mt-1">Factory Production & Joinery Material Flow</p>
            </div>
          </div>
          <Button 
            onClick={() => setShowNewForm(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            New Material Request
          </Button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Factory className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Requests</p>
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
              <div className="p-2 bg-orange-100 rounded-lg">
                <Settings className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">In Production</p>
                <p className="text-xl font-bold text-gray-900">{inProductionDispatches}</p>
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
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-xl font-bold text-gray-900">{completedDispatches}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-3 w-full max-w-md bg-white shadow-sm border">
          <TabsTrigger value="overview" className="data-[state=active]:bg-purple-50">
            <Activity className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="workflow" className="data-[state=active]:bg-purple-50">
            <ArrowRight className="w-4 h-4 mr-2" />
            Workflow
          </TabsTrigger>
          <TabsTrigger value="production" className="data-[state=active]:bg-purple-50">
            <Factory className="w-4 h-4 mr-2" />
            Production
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 border-b">
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" />
                Material Dispatch Requests
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Requisition</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Requested By</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Flags</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {materialDispatches.map((dispatch, index) => {
                      const statusConfig = getStatusConfig(dispatch.status);
                      const stageConfig = getProductionStageConfig(dispatch.productionStage);
                      
                      return (
                        <motion.tr 
                          key={dispatch.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="hover:bg-gray-50 transition-colors duration-200"
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{dispatch.requisitionNumber}</div>
                            <div className="text-sm text-gray-500">{dispatch.requestDate}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">{dispatch.projectName}</div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="outline" className="text-xs">
                              {dispatch.factorySection}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{dispatch.requestedBy}</div>
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
                            <div className="flex gap-1">
                              <Badge className={dispatch.qtySpecFlag ? 
                                'bg-green-100 text-green-700 border-green-300' : 
                                'bg-gray-100 text-gray-700 border-gray-300'}>
                                QTY/SPEC {dispatch.qtySpecFlag ? '✓' : '⚠'}
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
                                  className="bg-purple-600 hover:bg-purple-700 text-white"
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
            <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 border-b">
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-purple-600" />
                Production Material Workflow Steps
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
                      <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-purple-200" />
                    )}

                    <div className="flex items-start gap-4">
                      {/* Step Icon */}
                      <div className="relative z-10 bg-white rounded-full p-2 border-2 border-purple-200">
                        <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                          <span className="text-purple-600 text-xs font-bold">{index + 1}</span>
                        </div>
                      </div>

                      {/* Step Content */}
                      <div className="flex-1 bg-white rounded-lg border border-purple-200 p-4 hover:border-purple-300 transition-colors">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-800">{step.label}</h4>
                            <p className="text-sm text-gray-600">Actor: {step.actor}</p>
                            {step.stage === 'qty_spec_approval' && (
                              <div className="mt-2">
                                <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-300 text-xs">
                                  QTY/SPEC FLAG Required
                                </Badge>
                              </div>
                            )}
                            {step.stage === 'bulk_qty_approval' && (
                              <div className="mt-2">
                                <Badge className="bg-[#243d8a]/10 text-[#243d8a]/90 border border-[#243d8a]/30 text-xs">
                                  Bulk Qty Dispatch Gating
                                </Badge>
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">
                            Step {index + 1}
                          </div>
                        </div>

                        {step.stage === 'qty_spec_approval' && (
                          <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
                            <p className="text-xs text-yellow-700">
                              <strong>Rejection Loop:</strong> Qty & Spec rejection → Qty & Spec revisions → resubmit
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

        {/* Production Tab */}
        <TabsContent value="production">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Production Status */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 border-b">
                <CardTitle className="flex items-center gap-2">
                  <Factory className="w-5 h-5 text-purple-600" />
                  Production Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {materialDispatches
                  .filter(d => d.status !== 'draft' && d.status !== 'pending_approval')
                  .map((dispatch) => {
                    const stageConfig = getProductionStageConfig(dispatch.productionStage);
                    const StageIcon = stageConfig.icon;
                    
                    return (
                      <div key={dispatch.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                        <div className={`p-2 ${stageConfig.bgColor} rounded-lg`}>
                          <StageIcon className={`w-5 h-5 ${stageConfig.color}`} />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-800">{dispatch.requisitionNumber}</h4>
                          <p className="text-sm text-gray-600">{dispatch.projectName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={getStatusConfig(dispatch.status).color}>
                              {getStatusConfig(dispatch.status).label}
                            </Badge>
                            {dispatch.bulkQtyApproved && (
                              <Badge className="bg-[#243d8a]/10 text-[#243d8a]/90 border border-[#243d8a]/30 text-xs">
                                Bulk Qty ✓
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900">{dispatch.totalItems} items</p>
                          <p className="text-xs text-gray-500">AED {dispatch.totalValue.toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>

            {/* Factory Sections */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 border-b">
                <CardTitle className="flex items-center gap-2">
                  <Building className="w-5 h-5 text-purple-600" />
                  Factory Sections
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {[
                  { section: 'Joinery Workshop', active: 2, completed: 5, color: 'bg-[#243d8a]/10 text-[#243d8a]/90' },
                  { section: 'Furniture Production', active: 1, completed: 3, color: 'bg-green-100 text-green-700' },
                  { section: 'Custom Workshop', active: 1, completed: 2, color: 'bg-purple-100 text-purple-700' },
                  { section: 'Assembly Line', active: 0, completed: 4, color: 'bg-orange-100 text-orange-700' },
                  { section: 'Finishing Section', active: 0, completed: 2, color: 'bg-pink-100 text-pink-700' }
                ].map((section, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <h4 className="font-medium text-gray-800">{section.section}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={section.color}>
                          {section.section.split(' ')[0]}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex gap-3">
                        <div>
                          <p className="text-sm font-semibold text-orange-600">{section.active}</p>
                          <p className="text-xs text-gray-500">Active</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-green-600">{section.completed}</p>
                          <p className="text-xs text-gray-500">Done</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
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
                Workflow: {selectedDispatch.requisitionNumber}
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
                documentType="purchase_requisition" 
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
              <h2 className="text-lg font-semibold">New Material Requisition</h2>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowNewForm(false)}
              >
                Close
              </Button>
            </div>
            <div className="p-4">
              {/* <MaterialRequisitionForm /> */}
              <p className="text-gray-500 text-center py-8">Material requisition form will be implemented soon.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialDispatchProductionPage;